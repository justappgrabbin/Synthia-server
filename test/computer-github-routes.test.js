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
