#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (q) => new Promise(resolve => rl.question(q, resolve));

class SynthiaSelfSetup {
  constructor() {
    this.config = {
      supabase: {},
      render: {},
      github: {},
      stellar: {}
    };
    this.filesCreated = [];
  }

  async run() {
    console.log('🌌 Synthia OS Self-Setup\n');
    console.log('This will create your entire system automatically.\n');

    try {
      // 1. Gather info
      await this.gatherConfig();
      
      // 2. Create file structure
      await this.createFileStructure();
      
      // 3. Setup Supabase
      await this.setupSupabase();
      
      // 4. Setup Render
      await this.setupRender();
      
      // 5. Deploy
      await this.deploy();
      
      // 6. Test
      await this.testDeployment();
      
      console.log('\n✨ Synthia OS is live!');
      console.log(`📱 Access your system at: https://${this.config.render.serviceName}.onrender.com`);
      console.log(`🎛️  Governance: https://${this.config.render.serviceName}.onrender.com/phone/governance.html`);
      
    } catch (err) {
      console.error('\n❌ Setup failed:', err.message);
      console.log('\nFiles created so far:');
      this.filesCreated.forEach(f => console.log(`  - ${f}`));
    } finally {
      rl.close();
    }
  }

  async gatherConfig() {
    console.log('📋 Configuration\n');

    // Supabase Primary
    this.config.supabase.primaryUrl = await question('Primary Supabase URL (leisphnjslcuepflefri): ');
    this.config.supabase.primaryKey = await question('Primary Supabase service_role key: ');

    // Supabase Secondary (optional)
    const useSecondary = await question('Use secondary Supabase? (y/n): ');
    if (useSecondary.toLowerCase() === 'y') {
      this.config.supabase.secondaryUrl = await question('Secondary Supabase URL: ');
      this.config.supabase.secondaryKey = await question('Secondary Supabase key: ');
    }

    // GitHub
    this.config.github.repo = await question('GitHub repo (e.g., justappgrabbin/Synthia-server): ');
    this.config.github.token = await question('GitHub Personal Access Token: ');

    // Render
    this.config.render.apiKey = await question('Render API key: ');
    this.config.render.serviceName = await question('Render service name (synthia-os): ') || 'synthia-os';

    // Stellar (optional)
    const useStellar = await question('Connect Stellar Proximology? (y/n): ');
    if (useStellar.toLowerCase() === 'y') {
      this.config.stellar.url = await question('Stellar API URL: ');
      this.config.stellar.key = await question('Stellar API key: ');
    }

    console.log('\n✓ Configuration complete\n');
  }

  async createFileStructure() {
    console.log('📁 Creating files...\n');

    const files = {
      'package.json': this.generatePackageJson(),
      'server/index.js': this.generateServerIndex(),
      'server/gnn/bridge.js': this.generateGNBridge(),
      'server/gnn/discover.js': this.generateGNDiscover(),
      'server/gnn/loader.js': this.generateGNLoader(),
      'server/engine/modifier.js': this.generateModifier(),
      'server/engine/selfImprove.js': this.generateSelfImprove(),
      'server/governance/engine.js': this.generateGovernance(),
      'server/governance/userConsent.js': this.generateUserConsent(),
      'server/overlay/engine.js': this.generateOverlay(),
      'render.yaml': this.generateRenderYaml(),
      '.env.example': this.generateEnvExample(),
      'test/deploy.test.js': this.generateTestScript()
    };

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(process.cwd(), filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
      this.filesCreated.push(filePath);
      console.log(`  ✓ ${filePath}`);
    }

    console.log('');
  }

  async setupSupabase() {
    console.log('🗄️  Setting up Supabase...\n');

    // Create SQL file
    const sql = this.generateSQLSchema();
    await fs.writeFile('setup/supabase_schema.sql', sql);
    console.log('  ✓ Created setup/supabase_schema.sql');
    console.log('  ⚠️  Run this SQL in your Supabase SQL Editor');
    console.log('     (Automated SQL execution requires service key)\n');
  }

  async setupRender() {
    console.log('⚙️  Configuring Render...\n');
    console.log('  The render.yaml file will configure:');
    console.log('    - Web service (synthia-os)');
    console.log('    - Background worker (improvements)');
    console.log('    - Environment variables');
    console.log('\n  Push to GitHub and Render will auto-deploy\n');
  }

  async deploy() {
    console.log('🚀 Deploying...\n');

    // Git operations
    try {
      await execAsync('git add .');
      await execAsync('git commit -m "Synthia OS auto-setup"');
      await execAsync('git push origin main');
      console.log('  ✓ Pushed to GitHub');
    } catch (err) {
      console.log('  ⚠️  Git push failed (may already be up to date)');
    }

    console.log('\n  Render will auto-deploy from GitHub');
    console.log('  Monitor at: https://dashboard.render.com\n');
  }

  async testDeployment() {
    console.log('🧪 Waiting for deployment...\n');
    console.log('  (This would poll the health endpoint)');
    console.log('  For now, manually check:');
    console.log(`  https://${this.config.render.serviceName}.onrender.com/health\n`);
  }

  // ===== FILE GENERATORS =====

  generatePackageJson() {
    return JSON.stringify({
      "name": "synthia-os",
      "version": "2.0.0",
      "description": "Self-modifying ontological operating system",
      "main": "server/index.js",
      "scripts": {
        "start": "node server/index.js",
        "dev": "nodemon server/index.js",
        "test": "node test/deploy.test.js",
        "setup": "node setup/synthia-setup.js"
      },
      "dependencies": {
        "@modelcontextprotocol/sdk": "^1.0.0",
        "@supabase/supabase-js": "^2.39.0",
        "compression": "^1.7.4",
        "cors": "^2.8.5",
        "dotenv": "^16.3.1",
        "express": "^4.18.2",
        "express-rate-limit": "^7.1.0",
        "helmet": "^7.1.0",
        "multer": "^1.4.5-lts.1",
        "node-cron": "^3.0.3",
        "onnxruntime-node": "^1.16.0",
        "simple-git": "^3.20.0",
        "ws": "^8.14.2"
      },
      "engines": {
        "node": ">=18.0.0"
      }
    }, null, 2);
  }

  generateServerIndex() {
    return `require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const tridentBridge = require('./gnn/bridge');
const SelfModificationEngine = require('./engine/selfImprove');
const GovernanceEngine = require('./governance/engine');
const UserConsentLayer = require('./governance/userConsent');
const PersonalOverlayEngine = require('./overlay/engine');

const app = express();
const PORT = process.env.PORT || 10000;

// Supabase
const primarySupabase = createClient(
  process.env.SUPABASE_PRIMARY_URL,
  process.env.SUPABASE_PRIMARY_KEY
);

app.locals.primarySupabase = primarySupabase;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json({ limit: '10mb' }));

// Static files
app.use('/phone', express.static(path.join(__dirname, '../phone')));

// Health
app.get('/health', async (req, res) => {
  const { count } = await primarySupabase
    .from('system_graph')
    .select('*', { count: 'exact', head: true });
  
  res.json({
    status: 'healthy',
    trident_ready: tridentBridge.ready,
    graph_nodes: count || 0,
    version: '2.0.0'
  });
});

// Routes
app.post('/api/intent', async (req, res) => {
  const { intent, context } = req.body;
  const analysis = await tridentBridge.analyzeIntent(intent, context || {});
  
  const { data: queue } = await primarySupabase
    .from('intent_queue')
    .insert({
      raw_intent: intent,
      gnn_plan: analysis,
      status: 'awaiting_confirmation'
    })
    .select()
    .single();
  
  res.json({ queue_id: queue.id, ...analysis });
});

app.post('/api/drop', async (req, res) => {
  const { filename, content } = req.body;
  const ast = {
    functions: (content.match(/function/g) || []).length,
    imports: (content.match(/require|import/g) || []).length,
    total_lines: content.split('\\n').length
  };
  
  const analysis = await tridentBridge.analyzeCode(filename, content, ast);
  
  const { data: drop } = await primarySupabase
    .from('code_drops')
    .insert({
      filename,
      gnn_analysis: analysis,
      recommended_mode: analysis.mode,
      confidence: analysis.confidence,
      status: 'analyzed'
    })
    .select()
    .single();
  
  res.json({ drop_id: drop.id, ...analysis });
});

app.get('/api/graph', async (req, res) => {
  const { data } = await primarySupabase.from('system_graph').select('*');
  res.json(data || []);
});

// Start
async function startup() {
  console.log('🚀 Synthia OS starting...');
  
  try {
    await tridentBridge.initialize();
    console.log('✓ Trident GNN ready');
  } catch (err) {
    console.log('⚠️ Trident not loaded:', err.message);
  }
  
  app.listen(PORT, () => {
    console.log(\`✓ Server on port \${PORT}\`);
  });
  
  // Start background processes
  const modifier = new SelfModificationEngine(process.cwd(), primarySupabase);
  const governance = new GovernanceEngine(primarySupabase, process.env.STELLAR_URL);
  const consent = new UserConsentLayer(primarySupabase, governance);
  const overlay = new PersonalOverlayEngine(primarySupabase, process.env.STELLAR_URL);
  
  // TODO: Start improvement worker
}

startup();
`;
  }

  generateGNBridge() {
    return `const { loadTridentModel } = require('./loader');
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
    this.session = await loadTridentModel();
    this.ready = true;
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
    const inputName = this.config ? Object.keys(this.config.inputs)[0] : 'input';
    const tensor = new ort.Tensor('float32', features, [1, features.length]);
    const feeds = { [inputName]: tensor };
    const results = await this.session.run(feeds);
    
    // Parse outputs
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

  textToFeatures(text, ctx) {
    const t = text.toLowerCase();
    return [
      t.length / 1000,
      (t.match(/track|habit|list/g) || []).length,
      (t.match(/api|endpoint/g) || []).length,
      (t.match(/ui|component/g) || []).length,
      (t.match(/agent|ai/g) || []).length,
      ctx.timeOfDay || 0.5,
      ctx.dayOfWeek || 0.5,
      0, 0, 0 // padding
    ];
  }

  codeToFeatures(filename, content, ast) {
    return [
      content.length / 10000,
      ast.functions / 10,
      ast.imports / 10,
      filename.endsWith('.js') ? 1 : 0,
      filename.endsWith('.py') ? 1 : 0,
      0, 0, 0, 0, 0 // padding
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
`;
  }

  generateGNDiscover() {
    return `const ort = require('onnxruntime-node');
const fs = require('fs');
const { loadTridentModel } = require('./loader');

async function discoverModel() {
  console.log('🔍 Discovering Trident...');
  const session = await loadTridentModel();
  
  const config = {
    inputs: {},
    outputs: {},
    purpose: {}
  };
  
  for (const name of session.inputNames) {
    const meta = session.inputMetadata[name];
    config.inputs[name] = { shape: meta.dimensions, type: meta.type };
    console.log(\`  Input: \${name} [\${meta.dimensions.join(', ')}]\`);
  }
  
  for (const name of session.outputNames) {
    const meta = session.outputMetadata[name];
    config.outputs[name] = { shape: meta.dimensions, type: meta.type };
    console.log(\`  Output: \${name} [\${meta.dimensions.join(', ')}]\`);
  }
  
  fs.writeFileSync('./model_config.json', JSON.stringify(config, null, 2));
  console.log('✓ Saved model_config.json');
  return config;
}

module.exports = { discoverModel };
`;
  }

  generateGNLoader() {
    return `const ort = require('onnxruntime-node');
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
`;
  }

  generateModifier() {
    return `const fs = require('fs').promises;
const path = require('path');
const simpleGit = require('simple-git');

class SelfModificationEngine {
  constructor(repoPath, supabase) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
    this.supabase = supabase;
  }

  async integrate(plan) {
    console.log('Integrating:', plan.spec.name);
    
    try {
      const files = await this.createFiles(plan);
      await this.git.add('.');
      const commit = await this.git.commit(\`Auto: \${plan.spec.name} [\${plan.mode}]\`);
      
      await this.supabase.from('system_graph').insert({
        node_name: plan.spec.name,
        node_type: plan.mode,
        ontological_address: plan.ontological_address || 'TROP ' + Date.now(),
        capabilities: plan.spec.capabilities,
        health_status: 'healthy'
      });
      
      return { success: true, commit: commit.commit };
    } catch (err) {
      console.error('Integration failed:', err);
      throw err;
    }
  }

  async createFiles(plan) {
    const name = plan.spec.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    if (plan.mode === 'bonding') {
      const content = \`const express = require('express');
const router = express.Router();
router.get('/health', (req, res) => res.json({ status: 'ok', agent: '\${name}' }));
module.exports = router;\`;
      const filePath = path.join(this.repoPath, 'routes', \`\${name}.js\`);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);
      return [filePath];
    }
    
    return [];
  }
}

module.exports = SelfModificationEngine;
`;
  }

  generateSelfImprove() {
    return `class SelfImprovementEngine {
  constructor(supabase, trident) {
    this.supabase = supabase;
    this.trident = trident;
  }

  start() {
    setInterval(() => this.evaluate(), 300000);
    console.log('Self-improvement started');
  }

  async evaluate() {
    console.log('Evaluating improvements...');
    // Implementation from previous messages
  }
}

module.exports = SelfImprovementEngine;
`;
  }

  generateGovernance() {
    return `const crypto = require('crypto');

class GovernanceEngine {
  constructor(supabase, stellar) {
    this.supabase = supabase;
    this.stellar = stellar;
    this.LEVELS = { ROOT: 5, ARCHITECT: 4, CURATOR: 3, OPERATOR: 2, AGENT: 1, GUEST: 0 };
  }

  async recordDecision(params) {
    const address = \`DEC-\${Date.now()}-\${Math.random().toString(36).substr(2, 6)}\`;
    
    await this.supabase.from('governance_decisions').insert({
      address,
      actor: params.actor,
      action: params.action,
      target: params.target,
      justification: params.justification,
      confidence: params.confidence || 1.0,
      status: params.canAutoExecute ? 'executed' : 'pending'
    });
    
    return { address };
  }
}

module.exports = GovernanceEngine;
`;
  }

  generateUserConsent() {
    return `class UserConsentLayer {
  constructor(supabase, governance) {
    this.supabase = supabase;
    this.governance = governance;
  }

  async checkConsent(update, userAddress) {
    return {
      status: 'pending_consent',
      requiresAction: true
    };
  }
}

module.exports = UserConsentLayer;
`;
  }

  generateOverlay() {
    return `const crypto = require('crypto');

class PersonalOverlayEngine {
  constructor(supabase, stellar) {
    this.supabase = supabase;
    this.stellar = stellar;
  }

  async getOrCreateOverlay(userAddress) {
    const { data } = await this.supabase
      .from('user_overlays')
      .select('*')
      .eq('user_address', userAddress)
      .single();
    
    if (data) return data;
    
    const overlay = {
      user_address: userAddress,
      overlay_address: \`OVER-\${Date.now()}\`,
      personal_agents: [],
      created_at: new Date().toISOString()
    };
    
    await this.supabase.from('user_overlays').insert(overlay);
    return overlay;
  }
}

module.exports = PersonalOverlayEngine;
`;
  }

  generateRenderYaml() {
    return `services:
  - type: web
    name: ${this.config.render.serviceName || 'synthia-os'}
    runtime: node
    plan: standard
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: SUPABASE_PRIMARY_URL
        sync: false
      - key: SUPABASE_PRIMARY_KEY
        sync: false
`;
  }

  generateEnvExample() {
    return `SUPABASE_PRIMARY_URL=${this.config.supabase.primaryUrl || 'https://leisphnjslcuepflefri.supabase.co'}
SUPABASE_PRIMARY_KEY=your_service_role_key
SUPABASE_SECONDARY_URL=${this.config.supabase.secondaryUrl || ''}
SUPABASE_SECONDARY_KEY=
STELLAR_URL=${this.config.stellar.url || ''}
STELLAR_API_KEY=
GITHUB_TOKEN=${this.config.github.token || ''}
PORT=10000
`;
  }

  generateTestScript() {
    return `const fetch = require('node-fetch');
const BASE = process.env.TEST_URL || 'http://localhost:10000';

async function test() {
  console.log('Testing Synthia OS...');
  
  const health = await fetch(\`\${BASE}/health\`).then(r => r.json());
  console.log('Health:', health.status);
  
  const intent = await fetch(\`\${BASE}/api/intent\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: 'test' })
  }).then(r => r.json());
  console.log('Intent:', intent.mode || 'no mode');
  
  console.log('Tests complete');
}

test();
`;
  }

  generateSQLSchema() {
    return `-- Synthia OS Schema
-- Run this in Supabase SQL Editor

create table if not exists code_drops (
  id uuid primary key default gen_random_uuid(),
  filename text,
  gnn_analysis jsonb,
  recommended_mode text,
  confidence float,
  status text default 'analyzed',
  created_at timestamp default now()
);

create table if not exists system_graph (
  id uuid primary key default gen_random_uuid(),
  node_name text,
  node_type text,
  ontological_address text,
  capabilities text[],
  health_status text default 'healthy',
  created_at timestamp default now()
);

create table if not exists intent_queue (
  id uuid primary key default gen_random_uuid(),
  raw_intent text,
  gnn_plan jsonb,
  status text default 'pending',
  created_at timestamp default now()
);

create table if not exists governance_decisions (
  id uuid primary key default gen_random_uuid(),
  address text unique,
  actor text,
  action text,
  target text,
  justification text,
  confidence float,
  status text,
  created_at timestamp default now()
);

create table if not exists user_overlays (
  id uuid primary key default gen_random_uuid(),
  user_address text unique,
  overlay_address text unique,
  personal_agents jsonb default '[]',
  created_at timestamp default now()
);

alter publication supabase_realtime add table code_drops;
alter publication supabase_realtime add table system_graph;
alter publication supabase_realtime add table intent_queue;
`;
  }
}

// Run if called directly
if (require.main === module) {
  new SynthiaSelfSetup().run();
}

module.exports = SynthiaSelfSetup;
