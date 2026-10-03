// tn-gemini-proxy — 把 tn-submit 的 Gemini 請求原樣轉給 generativelanguage.googleapis.com。
// 只轉這一個主機；API key 由呼叫端放在 x-goog-api-key 標頭，本 Worker 不存任何機密。
// GET /__trace：回傳本 Worker 實際對外連線的節點（Cloudflare trace），用來確認真的在美國執行。

const UPSTREAM = 'https://generativelanguage.googleapis.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/__trace') {
      return fetch('https://www.cloudflare.com/cdn-cgi/trace');
    }
    return fetch(UPSTREAM + url.pathname + url.search, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
  },
};
