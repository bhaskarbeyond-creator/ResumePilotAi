import json, urllib.request, urllib.error

FIREBASE_API_KEY = 'AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc'
TEST_EMAIL = 'bhaskar.beyond@gmail.com'
TEST_PASSWORD = 'Bhaskar002!'
BACKEND = 'https://airesume.projectdemo.guru'

def http_post(url, body_dict, headers=None):
    body = json.dumps(body_dict).encode()
    h = {'Content-Type': 'application/json'}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=body, headers=h, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except:
            return e.code, {'error': str(e)}

def http_get(url, headers=None):
    h = {}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h, method='GET')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except:
            return e.code, {'error': str(e)}

# ── Step 1: Firebase Auth Sign-In to get idToken
print('--- Step 1: Firebase Auth Sign-In ---')
status, auth = http_post(
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FIREBASE_API_KEY,
    {'email': TEST_EMAIL, 'password': TEST_PASSWORD, 'returnSecureToken': True}
)
if status != 200 or 'localId' not in auth:
    print('FAILED: ' + str(auth))
    exit(1)

uid = auth['localId']
id_token = auth['idToken']
print('  UID:          ' + uid)
print('  Email:        ' + auth.get('email', ''))
print('  Token prefix: ' + id_token[:40] + '...')

# ── Step 2: SA Status with Authorization header
print()
print('--- Step 2: SA Status (with Bearer token) ---')
status, data = http_get(BACKEND + '/api/admin/firebase-service-account',
                        {'Authorization': 'Bearer ' + id_token})
print('  HTTP status:   ' + str(status))
print('  Response:      ' + str(data))

# ── Step 3: Custom password reset trigger (no token needed - sends email)
print()
print('--- Step 3: Custom Password Reset Email Trigger ---')
status, data = http_post(
    BACKEND + '/api/auth/custom-password-reset',
    {'email': TEST_EMAIL}
)
print('  HTTP status:   ' + str(status))
print('  success:       ' + str(data.get('success')))
print('  message:       ' + str(data.get('message', data.get('error', ''))))

# ── Step 4: set-user-password with Bearer token (no token param = direct admin call)
print()
print('--- Step 4: set-user-password (with Bearer token) ---')
status, data = http_post(
    BACKEND + '/api/auth/set-user-password',
    {'email': TEST_EMAIL, 'newPassword': TEST_PASSWORD},
    {'Authorization': 'Bearer ' + id_token}
)
print('  HTTP status:   ' + str(status))
print('  success:       ' + str(data.get('success')))
print('  method:        ' + str(data.get('method', 'N/A')))
print('  message:       ' + str(data.get('message', data.get('error', ''))))

print()
print('=== DONE ===')
