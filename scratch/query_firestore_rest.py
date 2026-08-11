import urllib.request
import json
import ssl
import sys

sys.stdout.reconfigure(encoding='utf-8')
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

project_id = "ai-resume-builder-424cf"
url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/users"

print(f"Fetching users from Firestore REST API: {url}...")
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        documents = data.get('documents', [])
        print(f"Found {len(documents)} user documents in Firestore.")
        found_admin = False
        for doc in documents:
            doc_name = doc.get('name')
            fields = doc.get('fields', {})
            email_field = fields.get('email', {}).get('stringValue', '')
            is_admin_field = fields.get('isA', {}).get('booleanValue', False)
            print(f"Doc: {doc_name.split('/')[-1]} | Email: {email_field} | isA: {is_admin_field}")
            if email_field == 'admin@admin.com':
                found_admin = True
                print(f"-> Target document found: {doc_name}")
                # Patch document to set email to bhaskar.beyond@gmail.com
                patch_url = f"https://firestore.googleapis.com/v1/{doc_name}?updateMask.fieldPaths=email"
                patch_body = json.dumps({
                    "fields": {
                        "email": {"stringValue": "bhaskar.beyond@gmail.com"}
                    }
                }).encode('utf-8')
                preq = urllib.request.Request(patch_url, data=patch_body, headers={'Content-Type': 'application/json'}, method='PATCH')
                with urllib.request.urlopen(preq, context=ctx) as presp:
                    print("Updated document email to bhaskar.beyond@gmail.com via REST API!")
        if not found_admin:
            print("No document with email 'admin@admin.com' found in Firestore users collection.")
except Exception as e:
    print(f"Firestore REST API result: {e}")
