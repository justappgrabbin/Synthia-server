const crypto = require('crypto');

const tasks = new Map();

function makeTaskId() {
  return `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeProgress(task) {
  const elapsed = Date.now() - task.createdAt;
  const progress = task.status === 'complete' ? 100 : task.status === 'failed' ? task.progress : Math.min(95, task.progress + Math.floor(elapsed / 700));
  task.progress = progress;
  return task;
}

async function getFetch() {
  if (typeof fetch === 'function') return fetch;
  try {
    const mod = await import('node-fetch');
    return mod.default;
  } catch (_error) {
    return null;
  }
}

async function callMobileMcp(payload) {
  const url = process.env.MOBILE_MCP_URL;
  if (!url) {
    return {
      delegated: false,
      mode: 'staged',
      message: 'MOBILE_MCP_URL not configured; task staged for local confirmation.'
    };
  }

  const fetchImpl = await getFetch();
  if (!fetchImpl) {
    return {
      delegated: false,
      mode: 'staged',
      message: 'fetch unavailable in this Node runtime; task staged instead of delegated.'
    };
  }

  const response = await fetchImpl(`${url.replace(/\/$/, '')}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`mobile MCP rejected task: ${response.status} ${text.slice(0, 200)}`);
  }

  return response.json();
}

function attachSmartBrowserRoutes(app) {
  app.post('/api/v2/browser/task', async (req, res) => {
    try {
      const { url, request, mode = 'assist', pageContext = {}, requireConfirmation = true } = req.body || {};
      if (!request) return res.status(400).json({ success: false, error: 'request required' });

      const taskId = makeTaskId();
      const task = {
        id: taskId,
        status: 'queued',
        progress: 5,
        url: url || null,
        request,
        mode,
        pageContext,
        requireConfirmation,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: [{ at: Date.now(), type: 'queued', message: 'Task accepted by Synthia smart browser bridge.' }]
      };
      tasks.set(taskId, task);

      try {
        const delegation = await callMobileMcp({ taskId, url, request, mode, pageContext, requireConfirmation });
        task.status = delegation.delegated === false ? 'staged' : 'running';
        task.progress = delegation.delegated === false ? 18 : 25;
        task.delegation = delegation;
        task.events.push({ at: Date.now(), type: task.status, message: delegation.message || 'Task delegated to mobile MCP bridge.' });
      } catch (error) {
        task.status = 'staged';
        task.progress = 15;
        task.delegation = { delegated: false, error: error.message };
        task.events.push({ at: Date.now(), type: 'staged', message: error.message });
      }

      task.updatedAt = Date.now();
      res.json({ success: true, task });
    } catch (error) {
      res.status(500).json({ success: false, error: 'smart browser task failed', details: error.message });
    }
  });

  app.get('/api/v2/browser/task/:id', (req, res) => {
    const task = tasks.get(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'task not found' });

    normalizeProgress(task);
    if (task.status === 'running' && task.progress >= 95) {
      task.status = 'awaiting_confirmation';
      task.events.push({ at: Date.now(), type: 'awaiting_confirmation', message: 'Task ready for user confirmation.' });
    }
    task.updatedAt = Date.now();
    res.json({ success: true, task });
  });

  app.post('/api/v2/browser/task/:id/complete', (req, res) => {
    const task = tasks.get(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'task not found' });
    task.status = 'complete';
    task.progress = 100;
    task.result = req.body?.result || { message: 'Task marked complete.' };
    task.events.push({ at: Date.now(), type: 'complete', message: 'Task completed.' });
    task.updatedAt = Date.now();
    res.json({ success: true, task });
  });

  app.get('/api/v2/browser/status', (_req, res) => {
    res.json({
      ok: true,
      route: '/api/v2/browser/task',
      mobileMcpConfigured: Boolean(process.env.MOBILE_MCP_URL),
      modes: ['assist', 'form_fill', 'repo_publish', 'page_task'],
      safety: 'tasks are staged or delegated; user confirmation supported'
    });
  });
}

module.exports = attachSmartBrowserRoutes;
