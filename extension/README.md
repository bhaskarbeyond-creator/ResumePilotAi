# ResumePilot AI - Interview Media Companion Extension

This is an optional Google Chrome / Microsoft Edge extension (Manifest V3) designed to streamline microphone and camera permissions for ResumePilot AI live interview sessions.

---

## 🌟 What This Extension Does
1. **Automated Site Permission Management**:
   - Uses Chrome's `contentSettings` API to automatically set `microphone` and `camera` permissions to `"allow"` for `localhost:*` and `airesume.projectdemo.guru`.
   - Eliminates the need to manually click the browser address bar padlock or allow prompts.
2. **Page Bridge**:
   - Injects `window.__RESUMEPILOT_COMPANION__` so the web application knows the companion is active and can optimize audio streaming.

---

## ⚠️ Crucial System Note: Windows Privacy Settings
- **Browser extensions live inside the browser sandbox.**
- If Windows 10/11 has *Settings → Privacy & Security → Microphone → "Let desktop apps access your microphone"* toggled **OFF**, Windows blocks the entire browser process at the OS kernel level.
- **Rule of thumb**: Ensure that Windows setting is **ON** once, and this extension will take care of all browser-level permissions automatically.

---

## 📥 How to Load into Chrome / Edge in 30 Seconds

1. Open your browser and navigate to:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
2. In the top right corner, toggle **"Developer mode"** to **ON**.
3. Click the **"Load unpacked"** button in the top left.
4. Select the `extension` folder inside this repository:
   `d:\xampp\htdocs\ai-resume-builder\extension`
5. Done! The extension icon will appear in your browser toolbar, and permissions will be automatically managed for ResumePilot AI.
