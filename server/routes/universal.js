const crypto = require('crypto');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

const MAX_ZIP_FILES = Number(process.env.SYNTHIA_MAX_ZIP_FILES || 350);
const MAX_ZIP_RAW_BYTES = Number(process.env.SYNTHIA_MAX_ZIP_RAW_BYTES || 100 * 1024 * 1024);
const MAX_ZIP_TEXT_BYTES = Number(process.env.SYNTHIA_MAX_ZIP_TEXT_BYTES || 12 * 1024 * 1024);
const MAX_ENTRY_TEXT_BYTES = Number(process.env.SYNTHIA_MAX_ENTRY_TEXT_BYTES || 1024 * 1024);

const TEXT_EXTENSIONS = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json', 'md', 'txt', 'csv', 'html', 'css', 'py', 'yml', 'yaml', 'xml']);
const CODE_EXTENSIONS = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py']);
const DATA_EXTENSIONS = new Set(['json', 'csv', 'yml', 'yaml', 'xml']);
const DOC_EXTENSIONS = new Set(['md', 'txt', 'pdf', 'docx']);

function safeRequire(name) {
  try {
    return require(name);
  } catch (_error) {
    return null;
  }
}

function extensionOf(name = '') {
  const clean = String(name).split('?')[0].split('#')[0];
  const ext = clean.includes('.') ? clean.split('.').pop().toLowerCase() : '';
  return ext || 'bin';
}

function sha256(bufferOrString) {
  return crypto.createHash('sha256').update(bufferOrString).digest('hex');
}

function sanitizeArchivePath(rawPath) {
  const normalized = String(rawPath || '').replace(/\\/g, '/');
  if (!normalized || normalized.includes('..') || normalized.includes('__MACOSX')) return null;
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  if (last.startsWith('.')) return null;
  return parts.join('/');
}

function textFromBuffer(buffer) {
  return buffer.toString('utf8');
}

function basicCsvRows(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1, 101).map((line, index) => {
    const cells = line.split(',');
    const row = { index };
    headers.forEach((header, i) => { row[header || `column_${i + 1}`] = (cells[i] || '').trim(); });
    return row;
  });
}

function codeStats(text) {
  return {
    functions: (text.match(/function\s+[A-Za-z0-9_$]+|=>/g) || []).length,
    classes: (text.match(/class\s+[A-Za-z0-9_$]+/g) || []).length,
    imports: (text.match(/import\s+|require\s*\(/g) || []).length,
    exports: (text.match(/export\s+/g) || []).length,
    lines: text.split(/\r?\n/).length
  };
}

function classifyKind(ext, text) {
  if (CODE_EXTENSIONS.has(ext)) return 'code_module';
  if (ext === 'json') return 'json_config';
  if (ext === 'csv') return 'table_matrix';
  if (ext === 'html') return 'interface_markup';
  if (ext === 'css') return 'style_sheet';
  if (ext === 'pdf') return 'pdf_document';
  if (ext === 'docx') return 'word_document';
  if (ext === 'xlsx' || ext === 'xls') return 'workbook';
  if (DOC_EXTENSIONS.has(ext)) return 'document_text';
  return text ? 'text_asset' : 'binary_asset';
}

function featureVectorFor(node) {
  const size = Number(node.metadata.size || 0);
  const stats = node.metadata.stats || {};
  const isCode = node.kind === 'code_module' ? 1 : 0;
  const isData = ['json_config', 'table_matrix', 'workbook'].includes(node.kind) ? 1 : 0;
  const isDoc = ['document_text', 'pdf_document', 'word_document'].includes(node.kind) ? 1 : 0;
  const complexity = Math.tanh(((stats.functions || 0) + (stats.classes || 0) * 2 + (stats.imports || 0)) / 20);
  return [
    Number(Math.tanh(size / 100000).toFixed(4)),
    isCode,
    isData,
    isDoc,
    Number(complexity.toFixed(4))
  ];
}

function buildNode({ name, path, ext, text, value, buffer, diagnostics = [] }) {
  const hashSource = buffer || text || JSON.stringify(value || {});
  const stats = CODE_EXTENSIONS.has(ext) && text ? codeStats(text) : {};
  const node = {
    id: `uast_${sha256(`${path || name}:${sha256(hashSource)}`).slice(0, 12)}`,
    kind: classifyKind(ext, text),
    sourceType: ext,
    text: text && text.length <= 50000 ? text : undefined,
    value,
    children: [],
    metadata: {
      fileName: name,
      path: path || name,
      size: buffer ? buffer.length : Buffer.byteLength(text || JSON.stringify(value || {})),
      hash: sha256(hashSource),
      stats,
      diagnostics
    }
  };
  node.metadata.featureVector = featureVectorFor(node);
  return node;
}

async function parsePdf(buffer, name, path) {
  const pdfParse = safeRequire('pdf-parse');
  if (!pdfParse) {
    return buildNode({ name, path, ext: 'pdf', buffer, diagnostics: ['pdf-parse not installed; stored binary footprint only'] });
  }
  const data = await pdfParse(buffer);
  return buildNode({
    name,
    path,
    ext: 'pdf',
    text: data.text || '',
    buffer,
    value: { pages: data.numpages, info: data.info || {} },
    diagnostics: []
  });
}

async function parseDocx(buffer, name, path) {
  const mammoth = safeRequire('mammoth');
  if (!mammoth) {
    return buildNode({ name, path, ext: 'docx', buffer, diagnostics: ['mammoth not installed; stored binary footprint only'] });
  }
  const result = await mammoth.extractRawText({ buffer });
  return buildNode({ name, path, ext: 'docx', text: result.value || '', buffer, diagnostics: (result.messages || []).map(m => m.message) });
}

async function parseWorkbook(buffer, name, path, ext) {
  const ExcelJS = safeRequire('exceljs');
  if (!ExcelJS) {
    return buildNode({ name, path, ext, buffer, diagnostics: ['exceljs not installed; stored binary footprint only'] });
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = [];
  workbook.eachSheet(sheet => sheets.push({ name: sheet.name, rowCount: sheet.rowCount, columnCount: sheet.columnCount }));
  return buildNode({ name, path, ext, buffer, value: { sheets }, diagnostics: [] });
}

async function parseSingleFile(file) {
  const name = file.originalname || file.name || 'payload.bin';
  const path = file.path || name;
  const ext = extensionOf(name);
  const buffer = file.buffer || Buffer.from(file.content || '');

  if (ext === 'pdf') return parsePdf(buffer, name, path);
  if (ext === 'docx') return parseDocx(buffer, name, path);
  if (ext === 'xlsx' || ext === 'xls') return parseWorkbook(buffer, name, path, ext);

  if (TEXT_EXTENSIONS.has(ext)) {
    const text = textFromBuffer(buffer);
    if (Buffer.byteLength(text) > MAX_ENTRY_TEXT_BYTES) {
      return buildNode({ name, path, ext, buffer, diagnostics: ['text extraction skipped: entry exceeds text ceiling'] });
    }
    let value;
    const diagnostics = [];
    if (ext === 'json') {
      try { value = JSON.parse(text); } catch (error) { diagnostics.push(`json parse failed: ${error.message}`); }
    }
    if (ext === 'csv') value = { rowsPreview: basicCsvRows(text) };
    return buildNode({ name, path, ext, text, value, buffer, diagnostics });
  }

  return buildNode({ name, path, ext, buffer, diagnostics: ['unsupported binary preserved as footprint'] });
}

async function parseZip(file) {
  if (file.size > MAX_ZIP_RAW_BYTES) throw new Error('zip rejected: raw archive exceeds configured limit');
  const JSZip = safeRequire('jszip');
  if (!JSZip) throw new Error('jszip dependency is required for zip ingestion');

  const zip = await JSZip.loadAsync(file.buffer);
  const entries = Object.entries(zip.files).filter(([, entry]) => !entry.dir);
  if (entries.length > MAX_ZIP_FILES) throw new Error('zip rejected: too many files');

  const nodes = [];
  const diagnostics = [];
  let totalTextBytes = 0;

  for (const [rawPath, entry] of entries) {
    const safePath = sanitizeArchivePath(rawPath);
    if (!safePath) continue;
    const name = safePath.split('/').pop();
    const ext = extensionOf(name);
    if (!TEXT_EXTENSIONS.has(ext) && !['pdf', 'docx', 'xlsx', 'xls'].includes(ext)) continue;

    const buffer = await entry.async('nodebuffer');
    if (TEXT_EXTENSIONS.has(ext)) {
      totalTextBytes += buffer.length;
      if (buffer.length > MAX_ENTRY_TEXT_BYTES) {
        diagnostics.push(`skipped oversized entry: ${safePath}`);
        continue;
      }
      if (totalTextBytes > MAX_ZIP_TEXT_BYTES) throw new Error('zip rejected: decompressed text exceeds configured limit');
    }

    const childNode = await parseSingleFile({ name, originalname: name, path: safePath, buffer, size: buffer.length });
    nodes.push(childNode);
  }

  return {
    version: 'uast-0.2',
    root: {
      id: `archive_${sha256(file.buffer).slice(0, 12)}`,
      kind: 'workspace_archive',
      sourceType: 'zip',
      children: nodes,
      metadata: {
        fileName: file.originalname || file.name,
        size: file.size,
        hash: sha256(file.buffer),
        diagnostics
      }
    },
    symbols: Object.fromEntries(nodes.map(node => [node.id, node])),
    diagnostics
  };
}

function aggregateTelemetry(uast) {
  const nodes = uast.root.children || [];
  const counts = nodes.reduce((acc, node) => {
    acc[node.kind] = (acc[node.kind] || 0) + 1;
    return acc;
  }, {});
  const codeNodes = nodes.filter(n => n.kind === 'code_module');
  const dataNodes = nodes.filter(n => ['json_config', 'table_matrix', 'workbook'].includes(n.kind));
  const total = Math.max(1, nodes.length);
  const systemResonance = Number(Math.min(0.99, 0.35 + (codeNodes.length / total) * 0.25 + (dataNodes.length / total) * 0.2 + Math.tanh(total / 24) * 0.25).toFixed(4));
  return {
    nodesGenerated: nodes.length,
    sourceSchema: uast.root.sourceType,
    kindCounts: counts,
    systemResonance,
    activeScentTracked: systemResonance > 0.52 ? 'COHERENT' : 'PERTURBED'
  };
}

function componentForNode(node) {
  const title = node.metadata.fileName || node.id;
  const stats = node.metadata.stats || {};
  const preview = node.text ? node.text.slice(0, 1200) : JSON.stringify(node.value || node.metadata, null, 2).slice(0, 1200);
  return {
    id: `component_${node.id}`,
    type: node.kind === 'code_module' ? 'code-card' : node.kind === 'table_matrix' ? 'data-card' : 'document-card',
    title,
    sourceType: node.sourceType,
    props: {
      title,
      subtitle: `${node.kind} · ${node.sourceType}`,
      stats,
      preview,
      hash: node.metadata.hash,
      path: node.metadata.path
    }
  };
}

function buildRenderPayload(uast, telemetry) {
  const components = (uast.root.children || []).slice(0, 80).map(componentForNode);
  return {
    mode: 'native-dom',
    noIframe: true,
    mountStrategy: 'replace-or-append-components',
    title: uast.root.kind === 'workspace_archive' ? 'Regenerated Workspace' : 'Regenerated Artifact',
    summary: {
      source: uast.root.metadata.fileName,
      schema: uast.root.sourceType,
      nodeCount: telemetry.nodesGenerated,
      resonance: telemetry.systemResonance
    },
    components
  };
}

async function persistRawParts(req, uast, telemetry) {
  const supabase = req.app.locals.primarySupabase;
  if (!supabase) return { database: 'degraded', stored: false };

  const rows = (uast.root.children || []).slice(0, 100).map(node => ({
    filename: node.metadata.fileName,
    content_hash: node.metadata.hash,
    language: node.sourceType,
    ast_json: { kind: node.kind, metadata: node.metadata, featureVector: node.metadata.featureVector },
    gnn_analysis: { telemetry, route: 'universal-ingest' },
    detected_capabilities: [node.kind, node.sourceType].filter(Boolean),
    recommended_mode: 'structural_regeneration',
    confidence: telemetry.systemResonance || 0.5,
    status: 'analyzed'
  }));

  if (!rows.length) return { database: 'connected', stored: false };
  const { error } = await supabase.from('code_drops').insert(rows);
  if (error) return { database: 'error', stored: false, error: error.message };
  return { database: 'connected', stored: true, rows: rows.length };
}

function attachUniversalRoutes(app) {
  app.post('/api/v2/ingest', upload.single('payload'), async (req, res) => {
    try {
      const uploaded = req.file;
      if (!uploaded) return res.status(400).json({ success: false, error: 'payload file required' });

      let uast;
      if (extensionOf(uploaded.originalname) === 'zip' || uploaded.mimetype === 'application/zip') {
        uast = await parseZip(uploaded);
      } else {
        const node = await parseSingleFile(uploaded);
        uast = {
          version: 'uast-0.2',
          root: {
            id: `artifact_${node.id}`,
            kind: 'single_artifact',
            sourceType: node.sourceType,
            children: [node],
            metadata: { fileName: uploaded.originalname, size: uploaded.size, hash: node.metadata.hash }
          },
          symbols: { [node.id]: node },
          diagnostics: node.metadata.diagnostics || []
        };
      }

      const telemetry = aggregateTelemetry(uast);
      const render = buildRenderPayload(uast, telemetry);
      const storage = await persistRawParts(req, uast, telemetry);

      res.json({ success: true, telemetry, uast, render, storage });
    } catch (error) {
      res.status(500).json({ success: false, error: 'universal ingest failed', details: error.message });
    }
  });

  app.post('/api/v2/render', async (req, res) => {
    try {
      const { uast } = req.body || {};
      if (!uast || !uast.root) return res.status(400).json({ success: false, error: 'uast required' });
      const telemetry = aggregateTelemetry(uast);
      res.json({ success: true, telemetry, render: buildRenderPayload(uast, telemetry) });
    } catch (error) {
      res.status(500).json({ success: false, error: 'render callback failed', details: error.message });
    }
  });

  app.get('/api/v2/ingest/status', (_req, res) => {
    res.json({
      ok: true,
      route: '/api/v2/ingest',
      accepts: ['zip', ...Array.from(TEXT_EXTENSIONS), 'pdf', 'docx', 'xlsx', 'xls'],
      renderMode: 'native-dom',
      noIframe: true
    });
  });
}

module.exports = attachUniversalRoutes;
