import urllib.request
import json

def check_admin_settings():
    print("=== CHECKING SYSTEM SETTINGS FIRESTORE CACHE ===")
    url = "https://airesume.projectdemo.guru/api/auth/linkedin/connect"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}, method='GET')
    try:
        opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler)
        res = opener.open(req)
        print("Status:", res.status)
        print("URL:", res.geturl())
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)
        print("Headers:", dict(e.headers))

if __name__ == '__main__':
    check_admin_settings()
