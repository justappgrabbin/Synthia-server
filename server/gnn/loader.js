const ort = require('onnxruntime-node');
const fs = require('fs');
const path = require('path');

async function loadTridentModel() {
  const paths = [
    path.join(process.cwd(), 'trident_syntia.onnx'),
    path.join(__dirname, '..', '..', 'trident_syntia.onnx'),
    '/opt/render/project/src/trident_syntia.onnx'
  ];
  
  for (const p of paths) {
    if (fs.existsSync(p)) {
      console.log('Loading model from:', p);
      return await ort.InferenceSession.create(p);
    }
  }
  throw new Error('trident_syntia.onnx not found');
}

module.exports = { loadTridentModel };
