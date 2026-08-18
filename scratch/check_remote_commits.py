import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
token = "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"
headers = {'User-Agent': 'Mozilla/5.0', 'Authorization': f'Bearer {token}'}

req = urllib.request.Request('https://api.github.com/repos/bhaskarbeyond-creator/ResumePilotAi/commits?per_page=100', headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx) as resp:
        commits = json.loads(resp.read().decode('utf-8'))
        print(f"Total commits fetched: {len(commits)}")
        found = False
        for c in commits:
            if '1483' in c['sha'] or '148' in c['sha'][:6]:
                print(f"MATCH: {c['sha']} | {c['commit']['committer']['date']} | {c['commit']['message'].splitlines()[0]}")
                found = True
        if not found:
            print("No commit with hash starting with or containing '1483' found in the last 100 commits.")
            print("\nLatest 10 commits on repository:")
            for c in commits[:10]:
                print(f"  {c['sha'][:10]} | {c['commit']['committer']['date']} | {c['commit']['message'].splitlines()[0]}")
except Exception as e:
    print(f"Error: {e}")

# 2. Check repo events
req = urllib.request.Request('https://api.github.com/repos/bhaskarbeyond-creator/ResumePilotAi/events?per_page=10', headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx) as resp:
        events = json.loads(resp.read().decode('utf-8'))
        print("\n=== Recent Repo Events ===")
        for ev in events:
            ev_type = ev['type']
            ev_created = ev['created_at']
            ev_payload = ev.get('payload', {})
            head = ev_payload.get('head', '')
            commits = ev_payload.get('commits', [])
            commit_shas = [c['sha'] for c in commits]
            print(f"Event: {ev_type} at {ev_created} | head: {head} | commits: {commit_shas}")
except Exception as e:
    print(f"Events error: {e}")

