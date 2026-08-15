import os, requests, json

key = None
with open('backend/.env', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('NVIDIA_API_KEY='):
            key = line.strip().split('=', 1)[1].strip('"\'')

if not key:
    print('No NVIDIA_API_KEY in backend/.env')
    exit(0)

models_to_test = [
    'meta/llama-3.1-8b-instruct',
    'meta/llama-3.3-70b-instruct',
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'mistralai/mistral-7b-instruct-v0.3',
    'mistralai/mixtral-8x7b-instruct-v0.1',
    'poolside/laguna-xs-2.1',
    'deepseek-ai/deepseek-r1',
    'qwen/qwen2.5-7b-instruct'
]

print(f'Testing live NVIDIA NIM models with API key {key[:8]}...')
for m in models_to_test:
    try:
        r = requests.post(
            'https://integrate.api.nvidia.com/v1/chat/completions',
            headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
            json={'model': m, 'messages': [{'role': 'user', 'content': 'Say hi'}], 'max_tokens': 10},
            timeout=15
        )
        print(f'Model: {m} -> Status: {r.status_code}, Elapsed: {r.elapsed.total_seconds():.2f}s, Response: {r.text[:120]}')
    except Exception as e:
        print(f'Model: {m} -> Error: {e}')
