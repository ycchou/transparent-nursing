// 產生 Web Push 的 VAPID 金鑰對（只需做一次；換金鑰會讓所有既有訂閱失效）。
// 用法：node worker-submit/gen-vapid.mjs
import crypto from 'node:crypto';

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const pub = ecdh.getPublicKey().toString('base64url');
// 私鑰前導位元組為 0 時 Node 會回傳不足 32 bytes，補回去（JWK 的 d 必須剛好 32 bytes）
const raw = ecdh.getPrivateKey();
const priv = Buffer.concat([Buffer.alloc(32 - raw.length), raw]).toString('base64url');

console.log('公鑰（填進 js/env.js 的 LIVE.vapidPublicKey，並設為 Worker secret VAPID_PUBLIC_KEY）：');
console.log(pub);
console.log('\n私鑰（只設為 Worker secret VAPID_PRIVATE_KEY，不要進版控）：');
console.log(priv);
console.log('\n設定指令（在 worker-submit/ 底下執行）：');
console.log(`  echo -n '${pub}' | npx wrangler secret put VAPID_PUBLIC_KEY`);
console.log(`  echo -n '<上面的私鑰>' | npx wrangler secret put VAPID_PRIVATE_KEY`);
