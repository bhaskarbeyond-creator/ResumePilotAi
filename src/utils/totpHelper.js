// RFC 6238 Standard TOTP (Time-Based One-Time Password) Helper using Web Crypto API
// Compatible with Google Authenticator, Authy, Microsoft Authenticator, 1Password, etc.

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generate a random Base32 TOTP secret key
 */
export function generateBase32Secret(length = 16) {
    const randomBytes = new Uint8Array(length);
    window.crypto.getRandomValues(randomBytes);
    let secret = '';
    for (let i = 0; i < length; i++) {
        secret += BASE32_CHARS[randomBytes[i] % 32];
    }
    return secret;
}

/**
 * Decode Base32 string to Uint8Array bytes
 */
export function base32ToBytes(base32) {
    const cleaned = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (let i = 0; i < cleaned.length; i++) {
        const val = BASE32_CHARS.indexOf(cleaned[i]);
        if (val !== -1) {
            bits += val.toString(2).padStart(5, '0');
        }
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
    }
    return bytes;
}

/**
 * Calculate 6-digit TOTP code for a given secret and window offset (Web Crypto HMAC-SHA1)
 */
export async function generateTotpCode(base32Secret, timeWindowOffset = 0) {
    try {
        const keyBytes = base32ToBytes(base32Secret);
        if (keyBytes.length === 0) return null;

        // Current 30-second time step counter
        const epoch = Math.floor(Date.now() / 1000);
        const timeCounter = Math.floor(epoch / 30) + timeWindowOffset;

        // Convert counter to 8-byte big-endian ArrayBuffer
        const buffer = new ArrayBuffer(8);
        const dataView = new DataView(buffer);
        // High 4 bytes (0 for standard timestamps)
        dataView.setUint32(0, 0, false);
        // Low 4 bytes
        dataView.setUint32(4, timeCounter, false);

        // Import HMAC-SHA1 key using Web Crypto
        const cryptoKey = await window.crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'HMAC', hash: { name: 'SHA-1' } },
            false,
            ['sign']
        );

        // Compute HMAC signature
        const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, buffer);
        const sigBytes = new Uint8Array(signature);

        // Dynamic Truncation
        const offset = sigBytes[sigBytes.length - 1] & 0x0f;
        const binary =
            ((sigBytes[offset] & 0x7f) << 24) |
            ((sigBytes[offset + 1] & 0xff) << 16) |
            ((sigBytes[offset + 2] & 0xff) << 8) |
            (sigBytes[offset + 3] & 0xff);

        // Generate 6-digit code with leading zeroes
        const otp = (binary % 1000000).toString().padStart(6, '0');
        return otp;
    } catch (err) {
        console.error('Error generating TOTP code:', err);
        return null;
    }
}

/**
 * Verify input code against current, -1, and +1 time windows (±30s clock skew tolerance)
 */
export async function verifyTotpCode(base32Secret, inputCode) {
    if (!base32Secret || !inputCode) return false;
    const cleanCode = String(inputCode).trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) return false;

    for (let offset of [0, -1, 1]) {
        const expectedCode = await generateTotpCode(base32Secret, offset);
        if (expectedCode && expectedCode === cleanCode) {
            return true;
        }
    }
    return false;
}

/**
 * Generate emergency 8-digit backup recovery codes
 */
export function generateBackupCodes(count = 6) {
    const codes = [];
    for (let i = 0; i < count; i++) {
        const part1 = Math.floor(1000 + Math.random() * 9000);
        const part2 = Math.floor(1000 + Math.random() * 9000);
        codes.push(`${part1}-${part2}`);
    }
    return codes;
}

/**
 * Build otpauth:// URI for QR code generation
 */
export function buildOtpauthUrl(email, secret, issuer = 'AI Resume Builder') {
    const cleanEmail = encodeURIComponent(email || 'user@airesume.builder');
    const cleanIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${cleanIssuer}:${cleanEmail}?secret=${secret}&issuer=${cleanIssuer}&period=30&digits=6`;
}

/**
 * Generate QR Code Image URL for scanning in Google Authenticator / Authy
 */
export function getQrCodeImageUrl(otpauthUrl, size = 200) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(otpauthUrl)}`;
}
