// webpush.js — 不靠第三方套件的 Web Push 發送（只用 Workers 內建的 WebCrypto）。
//
//   · 內容加密：RFC 8291（aes128gcm），推播服務（FCM／Apple／Mozilla／Windows）看不到內容
//   · 身分驗證：RFC 8292 VAPID（ES256 JWT）
//
// 金鑰（Worker secret，見 README「推播」）：
//   VAPID_PUBLIC_KEY   未壓縮公鑰 65 bytes 的 base64url（前端 js/env.js 的 vapidPublicKey 要一致）
//   VAPID_PRIVATE_KEY  私鑰 d 32 bytes 的 base64url
//   VAPID_SUBJECT      聯絡方式，例 mailto:someone@example.org（推播服務出問題時用來聯絡你）
// 產生金鑰：node worker-submit/gen-vapid.mjs

const enc = new TextEncoder();

export function b64urlDecode(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function b64urlEncode(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/**
 * RFC 8291 加密。回傳完整 request body（header ＋ 密文）。
 * test 參數只給單元測試注入固定的鹽與伺服器金鑰。
 */
export async function encryptPayload(plaintext, p256dh, auth, test = {}) {
  const uaPublic = b64urlDecode(p256dh);
  const authSecret = b64urlDecode(auth);
  const salt = test.salt || crypto.getRandomValues(new Uint8Array(16));
  const asKeys = test.asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  // 單一 record：內容後接 0x02（最後一個 record 的分隔符），不另外補 padding
  const record = concat(typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext, new Uint8Array([2]));
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);   // record size
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

// VAPID JWT 依推播服務的 origin 快取（同一個 isolate 內重用，有效 12 小時、提早 1 小時換新）
const jwtCache = new Map();

async function vapidAuthHeader(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const hit = jwtCache.get(aud);
  if (hit && hit.exp - now > 3600) return hit.header;

  const pub = b64urlDecode(env.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY,
    x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), ext: true,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const exp = now + 12 * 3600;
  const part = (o) => b64urlEncode(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud, exp, sub: env.VAPID_SUBJECT || 'mailto:admin@example.org' })}`;
  // WebCrypto 的 ECDSA 簽章本來就是 JWS 要的 r||s 格式，不必轉 DER
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));
  const header = `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
  jwtCache.set(aud, { exp, header });
  return header;
}

/**
 * 送一則推播。sub = { endpoint, p256dh, auth }。回傳推播服務的 HTTP 狀態碼
 * （201 成功；404／410 代表訂閱已失效，呼叫端應刪除）。
 */
export async function sendPush(sub, payload, env, { ttl = 86400, urgency = 'normal' } = {}) {
  const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthHeader(sub.endpoint, env),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
  });
  return r.status;
}
