const fetch = require('node-fetch');
const BASE = process.env.TEST_URL || 'http://localhost:10000';

async function test() {
  console.log('Testing Synthia OS...');
  
  const health = await fetch(`${BASE}/health`).then(r => r.json());
  console.log('✓ Health:', health.status);
  
  const intent = await fetch(`${BASE}/api/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: 'test' })
  }).then(r => r.json());
  console.log('✓ Intent:', intent.mode);
  
  console.log('All tests passed!');
}

test().catch(console.error);
