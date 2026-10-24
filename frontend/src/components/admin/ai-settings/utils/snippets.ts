export function getSnippetCode(
  lang: 'curl' | 'python' | 'typescript' | 'claude',
  gatewayOrigin: string
): string {
  if (lang === 'claude') {
    return `export ANTHROPIC_BASE_URL="${gatewayOrigin}"\nexport ANTHROPIC_API_KEY="$IME365_API_TOKEN"\nclaude`;
  }
  if (lang === 'python') {
    return `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${gatewayOrigin}",\n    api_key=os.environ["IME365_API_TOKEN"],\n)\nres = client.chat.completions.create(\n    model="auto",\n    messages=[{"role": "user", "content": "Hello from IME365 router"}],\n)\nprint(res.choices[0].message.content)`;
  }
  if (lang === 'typescript') {
    return `const response = await fetch('${gatewayOrigin}/chat/completions', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    Authorization: \`Bearer \${process.env.IME365_API_TOKEN}\`,\n  },\n  body: JSON.stringify({\n    model: 'auto',\n    messages: [{ role: 'user', content: 'Hello from IME365 router' }],\n  }),\n});\nconst data = await response.json();`;
  }
  return `curl -X POST "${gatewayOrigin}/chat/completions" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer $IME365_API_TOKEN" \\\n  -d '{"model":"auto","messages":[{"role":"user","content":"Ping"}]}'`;
}
