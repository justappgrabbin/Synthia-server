// Synthia Control Center API
// Drop-in addition to your existing Express server.
// Adds: orchestration, upload, projects, inbox, site pages.

const multer = require('multer');
const path = require('path');

const RESERVED_TOP_LEVEL_ROUTES = new Set([
  'api', 'control', 'terminal', 'mcp', 'trident', 'router', 'substrate', 'health',
  'poc', 'admin', 'client', 'surface', 'favicon.ico', '.well-known'
]);

module.exports = function attachControlCenter(app, db) {
  const upload = multer({ dest: 'uploads/' });

  app.get('/control', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'control-center.html'));
  });

  app.get('/api/control/health', (_req, res) => {
    res.json({ success: true, ok: true, service: 'synthia-control-center', mounted: true });
  });

  app.post('/api/orchestrate', async (req, res) => {
    const { intent, route, source } = req.body || {};
    if (!intent) return res.json({ success: false, error: 'No intent provided' });

    const lower = String(intent).toLowerCase();
    const type = /problem|issue|broken|error|stuck|fix|bug/.test(lower) ? 'repair'
      : /money|income|product|sell|offer|customer|value|landing|page|site|website/.test(lower) ? 'monetize'
      : /book|chapter|read|study|paper|analyze|extract/.test(lower) ? 'digest'
      : /hypothesis|experiment|test|data|result/.test(lower) ? 'science'
      : /task|project|assign|deadline|team/.test(lower) ? 'orchestration'
      : 'reflect';

    const projectId = 'proj_' + Date.now();
    const project = {
      id: projectId,
      name: String(intent).slice(0, 50),
      goal: intent,
      type,
      route: route || 'auto',
      status: route === 'website' ? 'done' : 'active',
      subscribers: [],
      inbox: [{ ts: Date.now(), source: source || 'control-center', type: 'task_created', content: `Project spawned: ${intent}`, route }],
      created: Date.now()
    };

    await db.collection('projects').insertOne(project);

    let routedTo = 'local';
    if (route === 'chatgpt' || (route === 'auto' && type === 'monetize')) routedTo = 'chatgpt';
    else if (route === 'claude' || (route === 'auto' && type === 'digest')) routedTo = 'claude';
    else if (route === 'website') routedTo = 'website';

    if (routedTo === 'chatgpt' || routedTo === 'claude') {
      await db.collection('ai_queue').insertOne({ projectId, ai: routedTo, prompt: intent, status: 'pending', ts: Date.now() });
    }

    await db.collection('inbox').insertOne({
      ts: Date.now(), projectId, source: 'hub', type: 'project_created',
      content: `Project "${String(intent).slice(0, 50)}" routed to ${routedTo}`,
      status: 'unread', priority: 0.7
    });

    res.json({ success: true, projectId, routedTo, type });
  });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.json({ success: false, error: 'No file uploaded' });
    const route = req.body?.route || 'auto';
    const projectId = 'proj_' + Date.now();

    await db.collection('uploads').insertOne({ projectId, filename: req.file.originalname, path: req.file.path, size: req.file.size, mimetype: req.file.mimetype, route, ts: Date.now() });
    await db.collection('projects').insertOne({
      id: projectId,
      name: 'Upload: ' + req.file.originalname,
      goal: 'Process uploaded file: ' + req.file.originalname,
      type: 'ingest', route, status: 'active', subscribers: [],
      inbox: [{ ts: Date.now(), source: 'upload', type: 'file_uploaded', content: `File uploaded: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`, route }],
      created: Date.now()
    });
    await db.collection('inbox').insertOne({ ts: Date.now(), projectId, source: 'upload', type: 'file_uploaded', content: `File uploaded: ${req.file.originalname}`, status: 'unread', priority: 0.6 });
    res.json({ success: true, projectId, status: 'File queued for processing' });
  });

  app.get('/api/projects', async (_req, res) => {
    const projects = await db.collection('projects').find({}).sort({ created: -1 }).limit(50).toArray();
    res.json({ projects: projects.map(p => ({ id: p.id, name: p.name, goal: p.goal, status: p.status, type: p.type, route: p.route, subscribers: p.subscribers?.length || 0, inboxCount: p.inbox?.length || 0, created: p.created })) });
  });

  app.post('/api/projects/:id/unblock', async (req, res) => {
    await db.collection('projects').updateOne({ id: req.params.id }, { $set: { status: 'active' } });
    res.json({ success: true });
  });

  app.delete('/api/projects/:id', async (req, res) => {
    await db.collection('projects').deleteOne({ id: req.params.id });
    res.json({ success: true });
  });

  app.get('/api/inbox', async (_req, res) => {
    const items = await db.collection('inbox').find({ status: { $in: ['unread', 'pending'] } }).sort({ ts: -1 }).limit(50).toArray();
    res.json({ items, count: items.length });
  });

  app.post('/api/approve', async (req, res) => {
    const { ts, approved, response } = req.body || {};
    await db.collection('inbox').updateOne({ ts: parseInt(ts, 10) }, { $set: { status: approved ? 'approved' : 'rejected', humanResponse: response || '' } });
    res.json({ success: true });
  });

  app.get('/api/site-pages', async (_req, res) => {
    const pages = await db.collection('site_pages').find({}).sort({ created: -1 }).toArray();
    res.json({ pages });
  });

  app.post('/api/publish', async (req, res) => {
    const { projectId, route } = req.body || {};
    const project = await db.collection('projects').findOne({ id: projectId });
    if (!project) return res.json({ success: false, error: 'Project not found' });
    const lastWork = project.inbox?.filter(i => i.type === 'work_submitted' || i.type === 'completion').pop();
    if (!lastWork) return res.json({ success: false, error: 'No completed work to publish' });

    await db.collection('site_pages').insertOne({ route, title: project.name, content: lastWork.content, projectId, created: Date.now() });
    await db.collection('projects').updateOne({ id: projectId }, { $set: { status: 'published', publishedRoute: route } });
    res.json({ success: true, route });
  });

  app.delete('/api/site-pages/:route', async (req, res) => {
    await db.collection('site_pages').deleteOne({ route: '/' + req.params.route });
    res.json({ success: true });
  });

  app.get('/:page', async (req, res, next) => {
    if (RESERVED_TOP_LEVEL_ROUTES.has(req.params.page)) return next();
    const page = await db.collection('site_pages').findOne({ route: '/' + req.params.page });
    if (!page) return next();
    res.type('html').send(`<!DOCTYPE html><html><head><title>${page.title}</title><style>body{background:#0a0614;color:#f0e6ff;font-family:system-ui;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}</style></head><body><h1>${page.title}</h1><hr>${page.content}</body></html>`);
  });

  console.log('✓ Synthia Control Center attached');
  console.log('  Dashboard: / and /control');
  console.log('  Generated pages: /:page');
};
