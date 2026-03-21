const { loadTridentModel } = require('./loader');
const ort = require('onnxruntime-node');
const fs = require('fs');

class TridentBridge {
  constructor() {
    this.session = null;
    this.config = null;
    this.ready = false;
  }

  async initialize() {
    if (fs.existsSync('./model_config.json')) {
      this.config = JSON.parse(fs.readFileSync('./model_config.json'));
    }
    try {
      this.session = await loadTridentModel();
      this.ready = true;
      console.log('✓ Trident bridge ready');
    } catch (err) {
      console.log('⚠️ Using fallback mode (no model)');
      this.ready = true;
    }
  }

  async analyzeIntent(intent, context) {
    const features = this.textToFeatures(intent, context);
    return this.runInference(features, intent);
  }

  async analyzeCode(filename, content, ast) {
    const features = this.codeToFeatures(filename, content, ast);
    return this.runInference(features, filename);
  }

  async runInference(features, source) {
    if (!this.session) {
      return this.fallbackResponse(source);
    }
    
    const inputName = this.config ? Object.keys(this.config.inputs)[0] : 'input';
    const tensor = new ort.Tensor('float32', features, [1, features.length]);
    const feeds = { [inputName]: tensor };
    
    try {
      const results = await this.session.run(feeds);
      return this.parseResults(results, source);
    } catch (err) {
      return this.fallbackResponse(source);
    }
  }

  parseResults(results, source) {
    const outputNames = this.session.outputNames;
    const data = results[outputNames[0]].data;
    const modes = ['bonding', 'chart', 'store', 'hierarchical', 'diffusion'];
    const maxIdx = data.indexOf(Math.max(...data));
    
    return {
      source,
      mode: modes[maxIdx] || 'bonding',
      confidence: data[maxIdx],
      capabilities: this.modeToCapabilities(modes[maxIdx])
    };
  }

  fallbackResponse(source) {
    return {
      source,
      mode: 'bonding',
      confidence: 0.7,
      capabilities: ['api', 'general'],
      fallback: true
    };
  }

  textToFeatures(text, ctx) {
    const t = text.toLowerCase();
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
    const ext = filename.split('.').pop();
    return [
      content.length / 10000,
      ast.functions / 10,
      ast.imports / 10,
      ['js', 'jsx'].includes(ext) ? 1 : 0,
      ['py'].includes(ext) ? 1 : 0,
      0, 0, 0, 0, 0
    ];
  }

  modeToCapabilities(mode) {
    const map = {
      bonding: ['api', 'endpoint'],
      chart: ['ui', 'component'],
      store: ['database', 'analytics'],
      hierarchical: ['agent', 'ai'],
      diffusion: ['experiment']
    };
    return map[mode] || ['general'];
  }
}

module.exports = new TridentBridge();
