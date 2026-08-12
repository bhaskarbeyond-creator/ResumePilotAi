import urllib.request
import json

# Check backend or firestore transactions
url = "https://airesume.projectdemo.guru/api/health"
try:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        print("Backend response:", resp.read().decode())
except Exception as e:
    print("Backend health check error:", e)
