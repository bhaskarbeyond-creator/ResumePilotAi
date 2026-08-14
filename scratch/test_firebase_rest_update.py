import requests

apiKey = "YOUR_FIREBASE_WEB_API_KEY"
email = "bhaskar.beyond@gmail.com"
newPassword = "Bhaskar@002!"

# 1. Sign in to get idToken
url1 = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={apiKey}"
res1 = requests.post(url1, json={"email": email, "password": newPassword, "returnSecureToken": True})
data1 = res1.json()

if "idToken" in data1:
    idToken = data1["idToken"]
    print("Obtained idToken successfully!")
    
    # 2. Update password via accounts:update
    url2 = f"https://identitytoolkit.googleapis.com/v1/accounts:update?key={apiKey}"
    res2 = requests.post(url2, json={"idToken": idToken, "password": newPassword, "returnSecureToken": True})
    print("accounts:update response:", res2.status_code, res2.text)
else:
    print("Could not get idToken:", data1)
