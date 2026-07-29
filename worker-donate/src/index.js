// tn-donate — 綠界（ECPay）捐款後端 Worker。
//
// 端點：
//   POST /create   body {amount} → 驗金額、建單、算 CheckMacValue → 回 {action, fields}
//                  前端據此自動 submit 到綠界付款頁。
//   POST /callback 綠界 server-to-server 付款結果通知 → 驗 CheckMacValue → 記帳 → 回 "1|OK"
//   GET  /health   存活檢查
//
// 安全：HashKey/HashIV 只在 Worker secret，不進 repo/前端。金額一律伺服器端驗證；
//       回呼一律驗 CheckMacValue 才記帳。不存任何卡號/個資（綠界處理）。

const ALLOWED_ORIGINS = [
  'https://ycchou.github.io',
  'https://trtu.org.tw',
  'http://localhost',
  'http://127.0.0.1',
];

// 付款成功後導回本站感謝頁（前端讀 ?donate=done 顯示感謝橫幅）。
const THANKYOU_URL = 'https://ycchou.github.io/transparent-nursing/support.html?donate=done';
// RT 職場透明化平台（source='rt'）預設導回頁；若前端有帶合法 backUrl 則優先用之。
const RT_THANKYOU_URL = 'https://trtu.org.tw/RT_platform/?donate=done';
// 允許作為導回網址的主機（防開放式轉址）。
const BACKURL_ALLOWED_HOSTS = ['trtu.org.tw', 'www.trtu.org.tw'];

const AIO_URL = {
  stage: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
  prod: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
};

const AMOUNT_MIN = 1;
const AMOUNT_MAX = 100000;

function originAllowed(origin) {
  return !!origin && ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o + ':'));
}

function corsHeaders(origin) {
  const ok = originAllowed(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://ycchou.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// RT 導回網址：僅接受白名單主機（防開放式轉址），附上 ?donate=done；不合法則退回預設。
function rtBackUrl(backUrl) {
  try {
    const u = new URL(String(backUrl));
    if ((u.protocol === 'https:' || u.protocol === 'http:') && BACKURL_ALLOWED_HOSTS.includes(u.hostname)) {
      u.hash = '';
      u.searchParams.set('donate', 'done');
      return u.toString();
    }
  } catch (_) { /* 非合法網址，忽略 */ }
  return RT_THANKYOU_URL;
}

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
  });
}

// 台北時區（UTC+8）：yyyy/MM/dd HH:mm:ss（綠界 MerchantTradeDate 格式）
function ecpayDate(d = new Date()) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}/${p(t.getUTCMonth() + 1)}/${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}

// 唯一訂單編號（≤20 字英數）
function genTradeNo() {
  return ('TN' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase().slice(0, 20);
}

async function sha256Upper(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// 綠界 CheckMacValue：參數依 key A→Z 排序 → 前後夾 HashKey/HashIV →
// 對整串做 URL encode 轉小寫（並還原 .NET 保留字元、空白為 +）→ SHA256 → 轉大寫。
async function checkMacValue(params, hashKey, hashIV) {
  const keys = Object.keys(params).sort((a, b) => {
    const la = a.toLowerCase(), lb = b.toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
  let raw = `HashKey=${hashKey}`;
  for (const k of keys) raw += `&${k}=${params[k]}`;
  raw += `&HashIV=${hashIV}`;

  let enc = encodeURIComponent(raw).toLowerCase();
  enc = enc
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%20/g, '+');

  return sha256Upper(enc);
}

async function handleCreate(request, env, cors) {
  if (!originAllowed(request.headers.get('Origin'))) {
    return json({ error: 'forbidden' }, cors, 403);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, cors, 400); }

  const amount = Math.floor(Number(body && body.amount));
  if (!Number.isInteger(amount) || amount < AMOUNT_MIN || amount > AMOUNT_MAX) {
    return json({ error: '金額不正確' }, cors, 400);
  }

  const merchantId = env.ECPAY_MERCHANT_ID;
  const hashKey = env.ECPAY_HASH_KEY;
  const hashIV = env.ECPAY_HASH_IV;
  if (!merchantId || !hashKey || !hashIV) {
    return json({ error: '金流尚未設定' }, cors, 503);
  }

  // 來源：'rt' = RT 職場透明化平台；其餘（含未帶）維持護理平台原行為。
  const source = (body && body.source) === 'rt' ? 'rt' : 'nursing';
  const isRt = source === 'rt';
  const itemName = isRt ? 'RT職場透明化平台捐款' : '護理職場透明化平台捐款';
  const clientBackUrl = isRt ? rtBackUrl(body && body.backUrl) : THANKYOU_URL;

  const tradeNo = genTradeNo();
  const returnUrl = new URL(request.url).origin + '/callback';

  // 綠界參數（信用卡、單筆）。CheckMacValue 需最後計算、不納入自身。
  const fields = {
    MerchantID: merchantId,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: ecpayDate(),
    PaymentType: 'aio',
    TotalAmount: String(amount),
    TradeDesc: itemName,
    ItemName: itemName,
    ReturnURL: returnUrl,
    ClientBackURL: clientBackUrl,
    ChoosePayment: 'Credit',
    EncryptType: '1',
  };
  fields.CheckMacValue = await checkMacValue(fields, hashKey, hashIV);

  // 註：不寫入 source 欄位，避免對共用正式 D1 做 schema 遷移；
  // 來源可由 ItemName（RT/護理品名不同）區分。若日後要在 DB 記 source，
  // 先執行 `ALTER TABLE orders ADD COLUMN source TEXT;` 再改回含 source 的 INSERT。
  await env.DB.prepare(
    'INSERT INTO orders(trade_no, amount, status, created_at) VALUES(?, ?, ?, ?)'
  ).bind(tradeNo, amount, 'created', Date.now()).run();

  const action = AIO_URL[env.ECPAY_ENV === 'prod' ? 'prod' : 'stage'];
  return json({ action, fields }, cors);
}

async function handleCallback(request, env) {
  // 綠界以 application/x-www-form-urlencoded POST；不檢查 Origin，改驗 CheckMacValue。
  const text = '0|ErrorMessage';
  try {
    const form = new URLSearchParams(await request.text());
    const params = {};
    for (const [k, v] of form.entries()) params[k] = v;

    const received = params.CheckMacValue || '';
    delete params.CheckMacValue;
    const expected = await checkMacValue(params, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV);
    if (received.toUpperCase() !== expected) {
      return new Response('0|CheckMacValue Error', { status: 200 });
    }

    const tradeNo = params.MerchantTradeNo;
    const rtnCode = String(params.RtnCode || '');
    const paid = rtnCode === '1';
    if (tradeNo) {
      await env.DB.prepare(
        'UPDATE orders SET status = ?, rtn_code = ?, paid_at = ? WHERE trade_no = ?'
      ).bind(paid ? 'paid' : 'failed', rtnCode, paid ? Date.now() : null, tradeNo).run();
    }
    return new Response('1|OK', { status: 200 });
  } catch (_) {
    return new Response(text, { status: 200 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin'));

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/create' && request.method === 'POST') {
        return await handleCreate(request, env, cors);
      }
      if (url.pathname === '/callback' && request.method === 'POST') {
        return await handleCallback(request, env);
      }
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, env: env.ECPAY_ENV || 'stage' }, cors);
      }
      return json({ error: 'not found' }, cors, 404);
    } catch (e) {
      return json({ error: String(e) }, cors, 500);
    }
  },
};
