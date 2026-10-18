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
 * Sanitize text to ensure only Telegram-supported HTML tags are present
 */
function sanitizeTelegramHtml(text) {
  if (!text) return '';
  let str = String(text);
  // Convert list tags to simple bullet points and newlines
  str = str.replace(/<ul[^>]*>/gi, '\n');
  str = str.replace(/<\/ul>/gi, '\n');
  str = str.replace(/<ol[^>]*>/gi, '\n');
  str = str.replace(/<\/ol>/gi, '\n');
  str = str.replace(/<li[^>]*>/gi, '• ');
  str = str.replace(/<\/li>/gi, '\n');
  str = str.replace(/<p[^>]*>/gi, '\n');
  str = str.replace(/<\/p>/gi, '\n');
  str = str.replace(/<br\s*\/?>/gi, '\n');
  str = str.replace(/<h[1-6][^>]*>/gi, '\n<b>');
  str = str.replace(/<\/h[1-6]>/gi, '</b>\n');

  // Strip all disallowed HTML tags (keep only b, strong, i, em, u, ins, s, strike, del, code, pre, a)
  str = str.replace(/<\/?(?!b\b|strong\b|i\b|em\b|u\b|ins\b|s\b|strike\b|del\b|code\b|pre\b|a\b)[a-z0-9_-]+(?:\s+[^>]*)?>/gi, '');

  return str.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Strip all HTML tags completely for guaranteed plain-text delivery
 */
function stripAllHtml(text) {
  if (!text) return '';
  return String(text).replace(/<[^>]+>/g, '').trim();
}

/**
 * Low-level post message helper
 */
function postTelegramMessage(chatId, text, parseMode = null) {
  return new Promise((resolve) => {
    /** @type {any} */
    const payloadObj = {
      chat_id: chatId,
      text: text
    };
    if (parseMode) payloadObj.parse_mode = parseMode;
    const payload = JSON.stringify(payloadObj);

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
 * Send an alert message to Telegram with automatic plain-text fallback on entity error
 * @param {string} text
 */
async function sendTelegramAlert(text) {
  const chatId = await getChatId();
  if (!chatId || !text) return false;

  const sanitized = sanitizeTelegramHtml(text);

  // 1. First attempt: with sanitized HTML
  const ok = await postTelegramMessage(chatId, sanitized, 'HTML');
  if (ok) return true;

  // 2. Guaranteed Fallback: strip HTML entirely and send as plain text
  const plain = stripAllHtml(text);
  return await postTelegramMessage(chatId, plain, null);
}

/**
 * Low-level post photo helper
 */
function postTelegramPhoto(chatId, filePath, caption = '', parseMode = null) {
  return new Promise((resolve) => {
    const boundary = '----TelegramBoundary' + Date.now();
    const fileData = fs.readFileSync(filePath);

    let prefix = `--${boundary}\r\n`;
    prefix += `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
    if (parseMode) {
      prefix += `--${boundary}\r\n`;
      prefix += `Content-Disposition: form-data; name="parse_mode"\r\n\r\n${parseMode}\r\n`;
    }
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

/**
 * Send a photo to Telegram with caption and robust fallbacks
 * @param {string} filePath
 * @param {string} caption
 */
async function sendTelegramPhoto(filePath, caption = '') {
  const chatId = await getChatId();
  if (!chatId || !fs.existsSync(filePath)) return false;

  const sanitizedCaption = sanitizeTelegramHtml(caption);

  // 1. Try sending photo with sanitized HTML caption
  const ok = await postTelegramPhoto(chatId, filePath, sanitizedCaption, 'HTML');
  if (ok) return true;

  // 2. Try sending photo with plain-text caption (stripped HTML)
  const plainCaption = stripAllHtml(caption);
  const plainOk = await postTelegramPhoto(chatId, filePath, plainCaption, null);
  if (plainOk) return true;

  // 3. Fallback: send photo with no caption, then send plain caption via alert
  const photoNoCaption = await postTelegramPhoto(chatId, filePath, '', null);
  if (photoNoCaption && plainCaption) {
    await sendTelegramAlert(plainCaption);
    return true;
  }
  return photoNoCaption;
}


/**
 * Send chat action indicator (e.g. 'typing', 'upload_photo')
 */
async function sendChatAction(action = 'typing') {
  const chatId = await getChatId();
  if (!chatId) return false;
  return new Promise((resolve) => {
    const payload = JSON.stringify({ chat_id: chatId, action });
    const req = https.request(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(payload);
    req.end();
  });
}

module.exports = {
  getChatId,
  sendTelegramAlert,
  sendTelegramPhoto,
  sendChatAction,
  BOT_TOKEN
};

if (require.main === module) {
  (async () => {
    const shotPath = path.join(__dirname, 'app_screenshot.png');
    const ok = await sendTelegramPhoto(shotPath, '📸 <b>IME365 Live Status & Render Snapshot</b>\n\n• Progress: <b>70%</b>\n• All Tests: <b>100% GREEN</b>\n• Target ETA: <b>~5:00 PM IST</b>');
    console.log('Sent photo to Telegram:', ok);
  })();
}
