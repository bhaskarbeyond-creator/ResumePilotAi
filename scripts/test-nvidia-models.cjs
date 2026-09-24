const apiKey = process.env.NVIDIA_API_KEY || '';

const candidates = [
  'meta/llama-3.2-11b-vision-instruct',
  'meta/llama-3.2-3b-instruct',
  'meta/llama-3.2-1b-instruct',
  'meta/llama-3.3-70b-instruct',
  'mistralai/mistral-7b-instruct-v0.3',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/nemotron-4-340b-instruct',
  'deepseek-ai/deepseek-r1'
];

async function testModel(model) {
  const start = Date.now();
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Respond with exactly: {"status":"ok"}' }],
        max_tokens: 30,
        temperature: 0.1
      })
    });

    const elapsed = Date.now() - start;
    const body = await res.text();
    if (res.ok) {
      console.log(`✅ [${res.status}] ${model} (${elapsed}ms): SUCCESS`);
      return { model, ok: true, elapsed };
    } else {
      console.log(`❌ [${res.status}] ${model} (${elapsed}ms): ${body.slice(0, 160)}`);
      return { model, ok: false, error: body };
    }
  } catch (err) {
    console.log(`💥 [ERR] ${model}: ${err.message}`);
    return { model, ok: false, error: err.message };
  }
}

async function main() {
  console.log('Testing NVIDIA NIM models with active API key...\n');

  // Also query the models endpoint
  try {
    const listRes = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      console.log(`Total models available on NVIDIA NIM: ${listData.data?.length || 0}`);
      const chatModels = (listData.data || []).map(m => m.id).filter(id => id.includes('llama') || id.includes('mistral') || id.includes('nemotron'));
      console.log('Top candidate chat models:', chatModels.slice(0, 10));
    }
  } catch (err) {
    console.warn('Could not list models:', err.message);
  }

  console.log('\n--- Testing Candidate Models ---');
  for (const m of candidates) {
    await testModel(m);
  }
}

main().catch(console.error);
