const BASE = process.env.TEST_URL || 'http://localhost:10000';

async function test() {
  console.log('Testing Synthia OS...');

  const healthResponse = await fetch(`${BASE}/health`);
  if (!healthResponse.ok) {
    throw new Error(`Health check failed: ${healthResponse.status} ${healthResponse.statusText}`);
  }
  const health = await healthResponse.json();
  if (!health.ok || health.status !== 'healthy') {
    throw new Error(`Unexpected health payload: ${JSON.stringify(health)}`);
  }
  console.log('✓ Health:', health.status);

  const intentResponse = await fetch(`${BASE}/api/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: 'test' })
  });
  if (!intentResponse.ok) {
    throw new Error(`Intent check failed: ${intentResponse.status} ${intentResponse.statusText}`);
  }
  const intent = await intentResponse.json();
  if (!intent.mode) {
    throw new Error(`Unexpected intent payload: ${JSON.stringify(intent)}`);
  }
  console.log('✓ Intent:', intent.mode);

  console.log('All tests passed!');
}

test().catch((error) => {
  console.error(error);
  process.exit(1);
});
