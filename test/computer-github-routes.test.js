const test = require('node:test');
const assert = require('node:assert/strict');
const { safeSlug, createGitHubClient } = require('../server/computer-github-routes');

function response(status, data) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) };
}

test('safeSlug preserves usable project identity', () => {
  assert.equal(safeSlug(' My New App! '), 'my-new-app');
});

test('createProject sends real files through GitHub client', async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/user/repos')) return response(201, {
      name: 'my-app', full_name: 'justappgrabbin/my-app', html_url: 'https://github.com/justappgrabbin/my-app',
      clone_url: 'https://github.com/justappgrabbin/my-app.git', default_branch: 'main', owner: { login: 'justappgrabbin' }
    });
    if (url.includes('/contents/index.html?ref=')) return response(404, { message: 'Not Found' });
    if (url.includes('/contents/index.html')) return response(201, { content: { sha: 'blob1' }, commit: { sha: 'commit1' } });
    return response(500, { message: 'unexpected request' });
  };
  const client = createGitHubClient({ token: 'test-token', fetchImpl: fakeFetch });
  const result = await client.createProject({ name: 'My App', files: [{ path: 'index.html', content: '<h1>real</h1>' }] });
  assert.equal(result.ok, true);
  assert.equal(result.files[0].path, 'index.html');
  assert.equal(calls.some(c => c.method === 'PUT' && c.body.content), true);
});

test('GitHub failures surface instead of being swallowed', async () => {
  const client = createGitHubClient({
    token: 'test-token',
    fetchImpl: async () => response(403, { message: 'forbidden' })
  });
  await assert.rejects(() => client.status(), /forbidden/);
});

test('setToken swaps the runtime token and owner is derived from /user', async () => {
  const seen = [];
  const fakeFetch = async (url, options = {}) => {
    seen.push({ url, auth: options.headers?.Authorization });
    if (url.endsWith('/user')) return response(200, { login: 'someone', id: 7 });
    if (url.includes('/actions/workflows/')) return response(200, { workflow_runs: [] });
    return response(500, { message: 'unexpected request' });
  };
  const client = createGitHubClient({ token: '', username: '', fetchImpl: fakeFetch });
  await assert.rejects(() => client.status(), /github_token_not_configured/);
  client.setToken('runtime-token');
  const result = await client.latestWorkflowRun({ repo: 'r', workflowId: 'w.yml' });
  assert.equal(result.ok, true);
  assert.equal(seen.some(c => c.url.includes('/repos/someone/r/')), true);
  assert.equal(seen.every(c => c.auth === 'Bearer runtime-token'), true);
});

test('stored token file is written 0600 and read back', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { writeStoredGitHubToken, readStoredGitHubToken } = require('../server/computer-github-routes');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gh-token-')), 'github-token');
  writeStoredGitHubToken('abc123', file);
  assert.equal(readStoredGitHubToken(file), 'abc123');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
