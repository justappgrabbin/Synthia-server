const ort = require('onnxruntime-node');
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_HF_NAMESPACE = 'stellarproximology';
const DEFAULT_MODEL_FILENAMES = [
  'trident_synthia.onnx',
  'trident_syntia.onnx'
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function modelSearchPaths() {
  const configuredPath = process.env.TRIDENT_MODEL_PATH;
  const configuredFile = process.env.TRIDENT_MODEL_FILE;
  const filenames = unique([
    configuredFile,
    ...DEFAULT_MODEL_FILENAMES
  ]);

  const roots = unique([
    process.cwd(),
    path.join(__dirname, '..', '..'),
    '/opt/render/project/src'
  ]);

  return unique([
    configuredPath,
    ...roots.flatMap((root) => filenames.map((filename) => path.join(root, filename)))
  ]);
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });

    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        return download(response.headers.location, destination).then(resolve, reject);
      }

      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`download failed: ${response.statusCode} ${response.statusMessage}`));
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(destination)));
      file.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(120000, () => {
      request.destroy(new Error('download timed out'));
    });
  });
}

function candidateHuggingFaceUrls() {
  const explicitUrl = process.env.TRIDENT_MODEL_URL || process.env.HF_MODEL_URL;
  if (explicitUrl) return [explicitUrl];

  const repo = process.env.TRIDENT_HF_REPO || process.env.HF_REPO_ID;
  const revision = process.env.TRIDENT_HF_REVISION || process.env.HF_REVISION || 'main';
  const filenames = unique([
    process.env.TRIDENT_MODEL_FILE,
    ...DEFAULT_MODEL_FILENAMES
  ]);

  const repoIds = repo
    ? [repo]
    : filenames.map((filename) => `${DEFAULT_HF_NAMESPACE}/${filename.replace(/\.onnx$/, '')}`);

  return repoIds.flatMap((repoId) =>
    filenames.map((filename) => `https://huggingface.co/${repoId}/resolve/${revision}/${filename}`)
  );
}

async function ensureDownloadedModel() {
  const urls = candidateHuggingFaceUrls();
  if (!urls.length) return null;

  let lastError = null;

  for (const url of urls) {
    const filename = process.env.TRIDENT_MODEL_FILE || path.basename(new URL(url).pathname) || 'trident_synthia.onnx';
    const destination = process.env.TRIDENT_MODEL_CACHE || path.join(process.cwd(), filename);

    if (fs.existsSync(destination)) return destination;

    try {
      console.log('Downloading Trident model from Hugging Face:', url);
      await download(url, destination);
      return destination;
    } catch (error) {
      lastError = error;
      console.warn(`Could not download Trident model from ${url}:`, error.message);
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function loadTridentModel() {
  const downloadedModel = await ensureDownloadedModel();
  const paths = unique([
    downloadedModel,
    ...modelSearchPaths()
  ]);

  for (const p of paths) {
    if (fs.existsSync(p)) {
      console.log('Loading Trident model from:', p);
      return await ort.InferenceSession.create(p);
    }
  }

  throw new Error(`Trident ONNX model not found. Checked: ${paths.join(', ')}`);
}

module.exports = { loadTridentModel };
