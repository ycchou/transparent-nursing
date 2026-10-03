// 在 Node 裡讀出各科別表單的 schema（js/form-<slug>.js 傳給 initDepartmentForm 的那份），
// 讓 mock 產生器的欄位與選項永遠跟著表單走，不必手動同步。
//
// 做法：用 module hook 把 form-engine.js 換成一個只記錄 schema 的替身（真的那支會碰 DOM）。
// 用法：node tools/lib/form-schemas.mjs  → stdout 印 { slug: schema[] } 的 JSON
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
// 已上線的自建表單（與 participate-<slug>.html 對應）
export const FORM_SLUGS = ['ward', 'icu', 'er', 'or', 'special', 'psych', 'clinic', 'dialysis', 'outpatient', 'other'];

const STUB = 'export function initDepartmentForm({ schema }) { (globalThis.__formSchemas ||= []).push(schema); }';
const HOOKS = `
export async function resolve(specifier, context, next) {
  if (/(^|\\/)form-engine\\.js(\\?|$)/.test(specifier)) {
    return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(STUB)}), shortCircuit: true };
  }
  return next(specifier, context);
}`;
register('data:text/javascript,' + encodeURIComponent(HOOKS));

export async function loadFormSchemas() {
  const out = {};
  for (const slug of FORM_SLUGS) {
    globalThis.__formSchemas = [];
    await import(pathToFileURL(path.join(ROOT, 'js', `form-${slug}.js`)).href);
    if (globalThis.__formSchemas.length !== 1) throw new Error(`form-${slug}.js 沒有呼叫 initDepartmentForm`);
    // 只留資料欄位（去掉分區標題、intro 等純顯示用屬性）
    out[slug] = globalThis.__formSchemas[0]
      .filter((f) => !f.section && f.name)
      .map((f) => ({
        name: f.name, type: f.type, required: !!f.required,
        options: (f.options || []).map((o) => (typeof o === 'string' ? o : o.value)),
        ...(f.showIf ? { showIf: f.showIf } : {}),
        ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}),
      }));
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(await loadFormSchemas()));
}
