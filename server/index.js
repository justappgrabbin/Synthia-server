require('dotenv').config();
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

// Supabase clients
const primarySupabase = createClient(
  process.env.SUPABASE_PRIMARY_URL,
  process.env.SUPABASE_PRIMARY_KEY
);

const secondarySupabase = process.env.SUPABASE_SECONDARY_URL ? 
  createClient(process.env.SUPABASE_SECONDARY_URL, process.env.SUPABASE_SECONDARY_KEY) : 
  null;

app.locals.primarySupabase = primarySupabase;
app.locals.secondarySupabase = secondarySupabase;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/phone', express.static(path.join(__dirname, '../phone')));

// Health check
app.get('/health', async (req, res) => {
  const { data: nodes } = await primarySupabase
    .from('system_graph')
    .select('*', { count: 'exact', head: true });
  
  res.json({
    status: 'healthy',
    trident_ready: tridentBridge.ready,
    graph_nodes: nodes?.count || 0,
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Intent endpoint
app.post('/api/intent', async (req, res) => {
  try {
    const { intent, context = {} } = req.body;
    if (!intent) return res.status(400).json({ error: 'intent required' });

    const analysis = await tridentBridge.analyzeIntent(intent, {
      timeOfDay: new Date().getHours() / 24,
      dayOfWeek: new Date().getDay() / 7,
      ...context
    });

    const { data: queue } = await primarySupabase
      .from('intent_queue')
      .insert({
        raw_intent: intent,
        context,
        gnn_plan: analysis,
        status: analysis.mode ? 'awaiting_confirmation' : 'failed'
      })
      .select()
      .single();

    res.json({ queue_id: queue.id, ...analysis, requires_confirmation: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Code drop endpoint
app.post('/api/drop', async (req, res) => {
  try {
    const { filename, content, context = {} } = req.body;
    if (!filename || !content) return res.status(400).json({ error: 'filename and content required' });

    const ast = {
      functions: (content.match(/function\s+\w+/g) || []).length,
      imports: (content.match(/require\(|import\s+/g) || []).length,
      classes: (content.match(/class\s+\w+/g) || []).length,
      total_lines: content.split('\n').length
    };

    const analysis = await tridentBridge.analyzeCode(filename, content, ast);

    const { data: drop } = await primarySupabase
      .from('code_drops')
      .insert({
        filename,
        content_hash: require('crypto').createHash('sha256').update(content).digest('hex'),
        language: filename.split('.').pop(),
        ast_json: ast,
        gnn_analysis: analysis,
        detected_capabilities: analysis.capabilities || ['general'],
        recommended_mode: analysis.mode || 'bonding',
        confidence: analysis.confidence || 0.5,
        ontological_address: analysis.address || null,
        status: 'analyzed'
      })
      .select()
      .single();

    if (analysis.confidence > 0.7) {
      await primarySupabase
        .from('integration_queue')
        .insert({
          code_drop_id: drop.id,
          strategy: analysis.mode,
          priority: 10,
          status: 'pending'
        });
    }

    res.json({ drop_id: drop.id, ...analysis, auto_integration: analysis.confidence > 0.7 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get system graph
app.get('/api/graph', async (req, res) => {
  const { data } = await primarySupabase.from('system_graph').select('*').order('created_at', { ascending: false });
  res.json(data || []);
});

// Start server
async function startup() {
  console.log('🚀 Synthia OS starting...');
  
  try {
    await tridentBridge.initialize();
    console.log('✓ Trident GNN ready');
  } catch (err) {
    console.log('⚠️ Trident not loaded:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`✓ Server on port ${PORT}`);
    console.log(`✓ Health: http://localhost:${PORT}/health`);
  });

  // Start background processes
  const modifier = new SelfModificationEngine(process.cwd(), primarySupabase);
  const governance = new GovernanceEngine(primarySupabase, process.env.STELLAR_URL);
  const consent = new UserConsentLayer(primarySupabase, governance);
  const overlay = new PersonalOverlayEngine(primarySupabase, process.env.STELLAR_URL);
  
  console.log('✓ All engines initialized');
}

startup();
