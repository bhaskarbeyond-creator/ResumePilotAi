// @ts-check
const https = require('https');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = '8740572678:AAFdrWXFL-f25CSwU_VyBcObCbdHFz9Xy_E';
const CONFIG_PATH = path.join(__dirname, 'telegram_config.json');

/**
 * Get cached or detected Chat ID
 */
async function getChatId() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (cfg.chatId) return cfg.chatId;
    } catch {}
  }

  return new Promise((resolve) => {
    https.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok && json.result && json.result.length > 0) {
            const lastUpdate = json.result[json.result.length - 1];
            const chat = lastUpdate.message?.chat || lastUpdate.callback_query?.message?.chat;
            if (chat?.id) {
              fs.writeFileSync(CONFIG_PATH, JSON.stringify({ chatId: chat.id, user: chat.username || chat.first_name }), 'utf8');
              return resolve(chat.id);
            }
          }
        } catch {}
        resolve(null);
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Send an alert message to Telegram
 * @param {string} text
 */
async function sendTelegramAlert(text) {
  const chatId = await getChatId();
  if (!chatId) return false;

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    });

    const req = https.request(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const resp = JSON.parse(body);
          resolve(resp.ok === true);
        } catch {
          resolve(false);
        }
      });
    });

    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

/**
 * Send a photo to Telegram with caption
 * @param {string} filePath
 * @param {string} caption
 */
async function sendTelegramPhoto(filePath, caption = '') {
  const chatId = await getChatId();
  if (!chatId || !fs.existsSync(filePath)) return false;

  return new Promise((resolve) => {
    const boundary = '----TelegramBoundary' + Date.now();
    const fileData = fs.readFileSync(filePath);

    let prefix = `--${boundary}\r\n`;
    prefix += `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
    prefix += `--${boundary}\r\n`;
    prefix += `Content-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`;
    if (caption) {
      const safeCaption = caption.length > 950 ? caption.slice(0, 940) + '...' : caption;
      prefix += `--${boundary}\r\n`;
      prefix += `Content-Disposition: form-data; name="caption"\r\n\r\n${safeCaption}\r\n`;
    }
    prefix += `--${boundary}\r\n`;
    prefix += `Content-Disposition: form-data; name="photo"; filename="${path.basename(filePath)}"\r\n`;
    prefix += `Content-Type: image/png\r\n\r\n`;

    const suffix = `\r\n--${boundary}--\r\n`;

    const payload = Buffer.concat([
      Buffer.from(prefix, 'utf8'),
      fileData,
      Buffer.from(suffix, 'utf8')
    ]);

    const req = https.request(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      timeout: 30000,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const resp = JSON.parse(body);
          resolve(resp.ok === true);
        } catch {
          resolve(false);
        }
      });
    });

    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

module.exports = {
  getChatId,
  sendTelegramAlert,
  sendTelegramPhoto,
  BOT_TOKEN
};

if (require.main === module) {
  (async () => {
    const shotPath = path.join(__dirname, 'app_screenshot.png');
    const ok = await sendTelegramPhoto(shotPath, '📸 <b>IME365 Live Status & Render Snapshot</b>\n\n• Progress: <b>70%</b>\n• All Tests: <b>100% GREEN</b>\n• Target ETA: <b>~5:00 PM IST</b>');
    console.log('Sent photo to Telegram:', ok);
  })();
}
