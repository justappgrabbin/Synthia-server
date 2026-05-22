const fs = require('fs');

function safeRequire(name) {
  try {
    return require(name);
  } catch (error) {
    console.warn(`⚠️ Optional dependency unavailable: ${name} (${error.message})`);
    return null;
  }
}

class TridentBridge {
  constructor() {
    this.session = null;
    this.config = null;
    this.ready = false;
    this.ort = null;
    this.loader = null;
    this.disabled = String(process.env.TRIDENT_ONNX_ENABLED || 'true').toLowerCase() === 'false';
  }

  async initialize() {
    if (fs.existsSync('./model_config.json')) {
      this.config = JSON.parse(fs.readFileSync('./model_config.json'));
    }

    if (this.disabled) {
      console.log('⚠️ Trident ONNX disabled by TRIDENT_ONNX_ENABLED=false; using address fallback mode');
      this.ready = true;
      return;
    }

    this.ort = safeRequire('onnxruntime-node');
    this.loader = safeRequire('./loader');

    if (!this.ort || !this.loader || typeof this.loader.loadTridentModel !== 'function') {
      console.log('⚠️ Trident ONNX runtime or loader unavailable; using address fallback mode');
      this.ready = true;
      return;
    }

    try {
      this.session = await this.loader.loadTridentModel();
      this.ready = true;
      console.log('✓ Trident address bridge ready');
    } catch (err) {
      console.log(`⚠️ Using fallback address mode: ${err.message}`);
      this.ready = true;
    }
  }

  async analyzeIntent(intent, context) {
    const features = this.textToFeatures(intent, context || {});
    return this.runInference(features, intent);
  }

  async analyzeCode(filename, content, ast) {
    const features = this.codeToFeatures(filename, content || '', ast || {});
    return this.runInference(features, filename);
  }

  async runInference(features, source) {
    if (!this.session || !this.ort) {
      return this.fallbackResponse(source);
    }

    const inputName = this.config ? Object.keys(this.config.inputs)[0] : 'input';
    const tensor = new this.ort.Tensor('float32', features, [1, features.length]);
    const feeds = { [inputName]: tensor };

    try {
      const results = await this.session.run(feeds);
      return this.parseResults(results, source);
    } catch (err) {
      console.warn(`⚠️ Trident address inference failed: ${err.message}`);
      return this.fallbackResponse(source);
    }
  }

  parseResults(results, source) {
    const outputNames = this.session.outputNames;
    const data = results[outputNames[0]].data;
    const modes = ['bonding', 'chart', 'store', 'hierarchical', 'diffusion'];
    const maxIdx = data.indexOf(Math.max(...data));
    const mode = modes[maxIdx] || 'bonding';

    return {
      source,
      mode,
      address: this.modeToAddress(mode),
      confidence: Number(data[maxIdx] || 0.7),
      capabilities: this.modeToCapabilities(mode),
      tridentRole: 'address-gate'
    };
  }

  fallbackResponse(source) {
    const mode = this.heuristicMode(source || '');
    return {
      source,
      mode,
      address: this.modeToAddress(mode),
      confidence: 0.7,
      capabilities: this.modeToCapabilities(mode),
      fallback: true,
      tridentRole: 'address-gate'
    };
  }

  heuristicMode(source) {
    const s = String(source).toLowerCase();
    if (/ui|component|view|screen|html|css|jsx|tsx/.test(s)) return 'chart';
    if (/db|data|store|supabase|sql|json|csv/.test(s)) return 'store';
    if (/agent|ai|mcp|tool|workflow/.test(s)) return 'hierarchical';
    if (/experiment|diffusion|model|math|graph/.test(s)) return 'diffusion';
    return 'bonding';
  }

  textToFeatures(text, ctx) {
    const t = String(text || '').toLowerCase();
    return [
      t.length / 1000,
      (t.match(/track|habit|list|todo/g) || []).length,
      (t.match(/api|endpoint|route/g) || []).length,
      (t.match(/ui|component|interface/g) || []).length,
      (t.match(/agent|ai|bot/g) || []).length,
      ctx.timeOfDay || 0.5,
      ctx.dayOfWeek || 0.5,
      0, 0, 0
    ];
  }

  codeToFeatures(filename, content, ast) {
    const ext = String(filename || '').split('.').pop();
    return [
      String(content || '').length / 10000,
      Number(ast.functions || 0) / 10,
      Number(ast.imports || 0) / 10,
      ['js', 'jsx', 'ts', 'tsx'].includes(ext) ? 1 : 0,
      ['py'].includes(ext) ? 1 : 0,
      Number(ast.classes || 0) / 10,
      Number(ast.total_lines || ast.lines || 0) / 1000,
      0, 0, 0
    ];
  }

  modeToAddress(mode) {
    const map = {
      bonding: 'B1.T1.C1.G1.L1',
      chart: 'B3.T4.C3.G57.L4',
      store: 'B2.T3.C2.G32.L2',
      hierarchical: 'B4.T5.C4.G43.L5',
      diffusion: 'B5.T2.C5.G64.L6'
    };
    return map[mode] || map.bonding;
  }

  modeToCapabilities(mode) {
    const map = {
      bonding: ['api', 'endpoint'],
      chart: ['ui', 'component'],
      store: ['database', 'analytics'],
      hierarchical: ['agent', 'ai', 'mcp'],
      diffusion: ['experiment', 'math', 'graph']
    };
    return map[mode] || ['general'];
  }
}

module.exports = new TridentBridge();
