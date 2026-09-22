const crypto = require('crypto');

function safeSlug(value) {
  return String(value || 'synthai-project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'synthai-project';
}

function readComputerToken(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-terminal-token'] || req.query?.token || req.body?.token || '');
}

function requireComputerAuth(req, res) {
  const expected = process.env.TERMINAL_TOKEN || process.env.ADMIN_TOKEN || process.env.SYNTHIA_TERMINAL_TOKEN || '';
  if (!expected) {
    res.status(503).json({ ok: false, error: 'computer_auth_not_configured', fix: 'Set TERMINAL_TOKEN on Synthia Server.' });
    return false;
  }
  if (readComputerToken(req) !== expected) {
    res.status(401).json({ ok: false, error: 'computer_auth_required' });
    return false;
  }
  return true;
}

function createGitHubClient({
  token = process.env.GITHUB_TOKEN || '',
  username = process.env.GITHUB_USERNAME || 'justappgrabbin',
  fetchImpl = globalThis.fetch,
  apiBase = 'https://api.github.com'
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation required');

  const headers = () => ({
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28'
  });

  const request = async (method, path, body) => {
    if (!token) throw new Error('GitHub token not configured');
    const response = await fetchImpl(`${apiBase}${path}`, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!response.ok) {
      const message = data?.message || data?.error || `GitHub request failed: ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.details = data;
      throw error;
    }
    return data;
  };

  const getExistingFileSha = async (owner, repo, path, branch = 'main') => {
    try {
      const data = await request('GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`);
      return data?.sha || null;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  };

  return {
    async status() {
      const user = await request('GET', '/user');
      return { ok: true, provider: 'github', user: user.login, id: user.id };
    },

    async listRepos({ limit = 50 } = {}) {
      const repos = await request('GET', `/user/repos?per_page=${Math.min(Math.max(Number(limit) || 50, 1), 100)}&sort=updated`);
      return repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        defaultBranch: repo.default_branch,
        private: repo.private,
        updatedAt: repo.updated_at
      }));
    },

    async createProject({ name, description = '', private: isPrivate = false, files = [] } = {}) {
      if (!name) throw new Error('project name required');
      if (!Array.isArray(files)) throw new Error('files must be an array');
      const repoName = safeSlug(name);

      const repo = await request('POST', '/user/repos', {
        name: repoName,
        description: String(description || '').slice(0, 350),
        private: Boolean(isPrivate),
        auto_init: true,
        has_issues: true,
        has_wiki: false
      });

      const owner = repo.owner?.login || username;
      const branch = repo.default_branch || 'main';
      const writes = [];

      for (const file of files) {
        const path = String(file?.path || '').replace(/^\/+/, '');
        if (!path) throw new Error('file path required');
        const content = String(file?.content ?? '');
        const sha = await getExistingFileSha(owner, repo.name, path, branch);
        const body = {
          message: `SynthAI Computer: write ${path}`,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch
        };
        if (sha) body.sha = sha;
        const result = await request('PUT', `/repos/${owner}/${repo.name}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, body);
        writes.push({ path, commit: result?.commit?.sha || null, contentSha: result?.content?.sha || null });
      }

      return {
        ok: true,
        provider: 'github',
        repo: { name: repo.name, fullName: repo.full_name, url: repo.html_url, cloneUrl: repo.clone_url, branch },
        files: writes,
        requestId: crypto.randomUUID()
      };
    },

    async dispatchWorkflow({ owner = username, repo, workflowId, branch = 'main', inputs = {} } = {}) {
      if (!repo || !workflowId) throw new Error('repo and workflowId required');
      await request('POST', `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`, {
        ref: branch,
        inputs
      });
      return { ok: true, provider: 'github', action: 'workflow-dispatch', owner, repo, workflowId, branch };
    },

    async latestWorkflowRun({ owner = username, repo, workflowId, branch } = {}) {
      if (!repo || !workflowId) throw new Error('repo and workflowId required');
      const suffix = branch ? `?branch=${encodeURIComponent(branch)}&per_page=1` : '?per_page=1';
      const data = await request('GET', `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowId)}/runs${suffix}`);
      const run = data?.workflow_runs?.[0] || null;
      return {
        ok: true,
        provider: 'github',
        run: run ? {
          id: run.id,
          status: run.status,
          conclusion: run.conclusion,
          branch: run.head_branch,
          sha: run.head_sha,
          url: run.html_url,
          createdAt: run.created_at,
          updatedAt: run.updated_at
        } : null
      };
    }
  };
}

function installComputerGitHubRoutes(app, options = {}) {
  const client = options.client || createGitHubClient(options);

  app.get('/computer/github/status', async (req, res) => {
    if (!requireComputerAuth(req, res)) return;
    try { res.json(await client.status()); }
    catch (error) { res.status(error.status || 502).json({ ok: false, error: error.message, details: error.details || null }); }
  });

  app.get('/computer/github/repos', async (req, res) => {
    if (!requireComputerAuth(req, res)) return;
    try { res.json({ ok: true, repos: await client.listRepos({ limit: req.query?.limit }) }); }
    catch (error) { res.status(error.status || 502).json({ ok: false, error: error.message, details: error.details || null }); }
  });

  app.post('/computer/github/projects', async (req, res) => {
    if (!requireComputerAuth(req, res)) return;
    try { res.status(201).json(await client.createProject(req.body || {})); }
    catch (error) { res.status(error.status || 502).json({ ok: false, error: error.message, details: error.details || null }); }
  });

  app.post('/computer/github/workflows/dispatch', async (req, res) => {
    if (!requireComputerAuth(req, res)) return;
    try { res.json(await client.dispatchWorkflow(req.body || {})); }
    catch (error) { res.status(error.status || 502).json({ ok: false, error: error.message, details: error.details || null }); }
  });

  app.get('/computer/github/workflows/latest', async (req, res) => {
    if (!requireComputerAuth(req, res)) return;
    try {
      res.json(await client.latestWorkflowRun({
        owner: req.query?.owner,
        repo: req.query?.repo,
        workflowId: req.query?.workflowId,
        branch: req.query?.branch
      }));
    } catch (error) {
      res.status(error.status || 502).json({ ok: false, error: error.message, details: error.details || null });
    }
  });

  return client;
}

module.exports = { safeSlug, createGitHubClient, installComputerGitHubRoutes };
