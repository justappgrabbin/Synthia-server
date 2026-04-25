require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const tridentBridge = require('./gnn/bridge');
const SelfImprovementEngine = require('./engine/selfImprove');
const GovernanceEngine = require('./governance/engine');
const UserConsentLayer = require('./governance/userConsent');
const PersonalOverlayEngine = require('./overlay/engine');

const app = express();
const PORT = process.env.PORT || 10000;

function makeSupabaseClient(label, url, key) {
  if (!url || !key) {
    console.warn(`⚠️ ${label} Supabase env vars missing; database-backed routes will run in degraded mode.`);
    return null;
  }

  return createClient(url, key);
}

const primarySupabase = makeSupabaseClient(
  'Primary',
  process.env.SUPABASE_PRIMARY_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_PRIMARY_KEY || process.env.SUPABASE_KEY
);

const secondarySupabase = makeSupabaseClient(
  'Secondary',
  process.env.SUPABASE_SECONDARY_URL,
  process.env.SUPABASE_SECONDARY_KEY
);

app.locals.primarySupabase = primarySupabase;
app.locals.secondarySupabase = secondarySupabase;

app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/phone', express.static(path.join(__dirname, '../phone')));

app.get('/health', async (req, res) => {
  let graphNodes = 0;
  let database = primarySupabase ? 'connected' : 'degraded';

  if (primarySupabase) {
    const { count, error } = await primarySupabase
      .from('system_graph')
      .select('*', { count: 'exact', head: true });

    if (error) {
      database = 'error';
      console.warn('Health check Supabase error:', error.message);
    } else {
      graphNodes = count || 0;
    }
  }

  res.json({
    status: 'healthy',
    database,
    trident_ready: tridentBridge.ready,
    graph_nodes: graphNodes,
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/intent', async (req, res) => {
  try {
    const { intent, context = {} } = req.body;
    if (!intent) return res.status(400).json({ error: 'intent required' });

    const analysis = await tridentBridge.analyzeIntent(intent, {
      timeOfDay: new Date().getHours() / 24,
      dayOfWeek: new Date().getDay() / 7,
      ...context
    });

    if (!primarySupabase) {
      return res.json({
        queue_id: null,
        ...analysis,
        requires_confirmation: true,
        database: 'degraded'
      });
    }

    const { data: queue, error } = await primarySupabase
      .from('intent_queue')
      .insert({
        raw_intent: intent,
        context,
        gnn_plan: analysis,
        status: analysis.mode ? 'awaiting_confirmation' : 'failed'
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ queue_id: queue.id, ...analysis, requires_confirmation: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    if (!primarySupabase) {
      return res.json({
        drop_id: null,
        ...analysis,
        content_hash: contentHash,
        auto_integration: false,
        database: 'degraded'
      });
    }

    const { data: drop, error } = await primarySupabase
      .from('code_drops')
      .insert({
        filename,
        content_hash: contentHash,
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

    if (error) throw error;

    if (analysis.confidence > 0.7) {
      const { error: integrationError } = await primarySupabase
        .from('integration_queue')
        .insert({
          code_drop_id: drop.id,
          strategy: analysis.mode,
          priority: 10,
          status: 'pending'
        });

      if (integrationError) throw integrationError;
    }

    res.json({ drop_id: drop.id, ...analysis, auto_integration: analysis.confidence > 0.7 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/graph', async (req, res) => {
  if (!primarySupabase) return res.json([]);

  const { data, error } = await primarySupabase
    .from('system_graph')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

async function startup() {
  console.log('🚀 Synthia OS starting...');

  try {
    await tridentBridge.initialize();
    console.log('✓ Trident GNN ready');
  } catch (err) {
    console.log('⚠️ Trident not loaded:', err.message);
  }

  const modifier = new SelfImprovementEngine(primarySupabase, tridentBridge);
  if (typeof modifier.start === 'function') modifier.start();

  const governance = new GovernanceEngine(primarySupabase, process.env.STELLAR_URL);
  const consent = new UserConsentLayer(primarySupabase, governance);
  const overlay = new PersonalOverlayEngine(primarySupabase, process.env.STELLAR_URL);

  app.locals.engines = { modifier, governance, consent, overlay };

  app.listen(PORT, () => {
    console.log(`✓ Server on port ${PORT}`);
    console.log(`✓ Health: http://localhost:${PORT}/health`);
    console.log('✓ All engines initialized');
  });
}

startup().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
