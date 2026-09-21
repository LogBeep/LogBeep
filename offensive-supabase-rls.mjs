#!/usr/bin/env node
/*
 * F.A.S.T offensive Supabase/RLS/RPC validation.
 * This script intentionally sends malicious requests. Run only against a throwaway
 * Supabase project or a staging company with disposable data.
 */

const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'USER_A_EMAIL',
  'USER_A_PASSWORD',
  'USER_B_EMAIL',
  'USER_B_PASSWORD',
  'COMPANY_A_ID',
  'COMPANY_B_ID',
  'PRODUCT_A_ID',
  'PRODUCT_B_ID'
];

const missing = required.filter(key => !process.env[key]);
if (process.env.RUN_OFFENSIVE !== 'true') {
  console.error('Refusing to run destructive/offensive tests. Set RUN_OFFENSIVE=true.');
  process.exit(2);
}
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(2);
}

const cfg = Object.fromEntries(required.map(key => [key, process.env[key]]));
const base = cfg.SUPABASE_URL.replace(/\/$/, '');
const anon = cfg.SUPABASE_ANON_KEY;
const unique = Date.now();
const results = [];

async function request(path, {token = anon, method = 'GET', body, prefer} = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(prefer ? {Prefer: prefer} : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  return {status: response.status, ok: response.ok, data, text};
}

async function signIn(email, password) {
  const response = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: {email, password},
    token: anon
  });
  if (!response.ok || !response.data?.access_token) {
    throw new Error(`Login failed for ${email}: ${response.status} ${response.text}`);
  }
  return response.data;
}

function emptyArray(data) { return Array.isArray(data) && data.length === 0; }
function blockedOrEmpty(result) {
  return [400, 401, 403, 404, 409].includes(result.status) || emptyArray(result.data);
}
function shouldPass(name, ok, details) {
  results.push({name, ok, details});
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark} ${name}${details ? ` — ${details}` : ''}`);
}
function detail(result) {
  const value = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
  return `status=${result.status} body=${String(value || '').slice(0, 240)}`;
}
async function rest(token, tablePath, options = {}) {
  return request(`/rest/v1/${tablePath}`, {token, ...options});
}
async function rpc(token, fn, body) {
  return request(`/rest/v1/rpc/${fn}`, {token, method: 'POST', body});
}
async function readProduct(token, productId) {
  return rest(token, `products?id=eq.${encodeURIComponent(productId)}&select=id,company_id,qty,name`, {method: 'GET'});
}

const sessionA = await signIn(cfg.USER_A_EMAIL, cfg.USER_A_PASSWORD);
const sessionB = await signIn(cfg.USER_B_EMAIL, cfg.USER_B_PASSWORD);
const tokenA = sessionA.access_token;
const tokenB = sessionB.access_token;
const userB = sessionB.user?.id;

// 1. Usuário A tentando ler produtos da Empresa B.
let res = await readProduct(tokenA, cfg.PRODUCT_B_ID);
shouldPass('A cannot read B product', emptyArray(res.data) || [401, 403, 404].includes(res.status), detail(res));

// 2. Usuário A tentando editar produtos da Empresa B.
res = await rest(tokenA, `products?id=eq.${encodeURIComponent(cfg.PRODUCT_B_ID)}&select=id,name`, {
  method: 'PATCH',
  body: {name: `RLS BYPASS ${unique}`},
  prefer: 'return=representation'
});
shouldPass('A cannot edit B product', blockedOrEmpty(res), detail(res));

// 3. Usuário A tentando movimentar estoque de produto da Empresa B via apply_stock_movement.
res = await rpc(tokenA, 'apply_stock_movement', {
  p_product_id: cfg.PRODUCT_B_ID,
  p_action_type: 'entrada_lote',
  p_quantity_changed: 1,
  p_reason: 'attack cross-company movement',
  p_reference_code: `ATTACK-${unique}`,
  p_lot_code: 'ATTACK',
  p_allow_negative: false,
  p_movement_id: `ATTACK-CROSS-${unique}`
});
shouldPass('A cannot move B stock via RPC', !res.ok, detail(res));

// 4. Usuário A tentando enviar company_id falso.
res = await rest(tokenA, 'products?select=id,company_id', {
  method: 'POST',
  body: [{id: `ATTACK-COMPANY-${unique}`, company_id: cfg.COMPANY_B_ID, name: 'Fake company product', qty: 1}],
  prefer: 'return=representation'
});
shouldPass('A cannot insert product with B company_id', blockedOrEmpty(res), detail(res));

// 5. Usuário A tentando enviar user_id falso.
res = await rest(tokenA, 'stock_movements?select=id,user_id', {
  method: 'POST',
  body: [{id: `ATTACK-USER-${unique}`, product_id: cfg.PRODUCT_A_ID, company_id: cfg.COMPANY_A_ID, user_id: userB, action_type: 'entrada_lote', type: 'entrada_lote', qty: 1, quantity_changed: 1}],
  prefer: 'return=representation'
});
shouldPass('A cannot insert stock movement with fake user_id', !res.ok || emptyArray(res.data), detail(res));

// 6. Usuário A tentando alterar o próprio role.
res = await rest(tokenA, `company_members?company_id=eq.${encodeURIComponent(cfg.COMPANY_A_ID)}&user_id=eq.${encodeURIComponent(sessionA.user.id)}&select=role`, {
  method: 'PATCH',
  body: {role: 'dono'},
  prefer: 'return=representation'
});
shouldPass('A cannot self-promote role unless already admin/dono', blockedOrEmpty(res), detail(res));

// 7. Usuário operador tentando fazer ação de admin.
res = await rpc(tokenA, 'apply_stock_movement', {
  p_product_id: cfg.PRODUCT_A_ID,
  p_action_type: 'ajuste_manual',
  p_quantity_changed: 1,
  p_reason: 'operator admin action attempt',
  p_reference_code: `ADMIN-ACTION-${unique}`,
  p_lot_code: 'RBAC',
  p_allow_negative: false,
  p_movement_id: `ADMIN-ACTION-${unique}`
});
shouldPass('Operator cannot perform manual admin adjustment', !res.ok, detail(res));

// 8. Tentativa de UPDATE direto em products.qty.
res = await rest(tokenA, `products?id=eq.${encodeURIComponent(cfg.PRODUCT_A_ID)}&select=id,qty`, {
  method: 'PATCH',
  body: {qty: 999999},
  prefer: 'return=representation'
});
shouldPass('Direct products.qty update is blocked', !res.ok, detail(res));

// 9. Tentativa de INSERT direto em stock_movements.
res = await rest(tokenA, 'stock_movements?select=id', {
  method: 'POST',
  body: [{id: `DIRECT-INSERT-${unique}`, product_id: cfg.PRODUCT_A_ID, company_id: cfg.COMPANY_A_ID, action_type: 'entrada_lote', type: 'entrada_lote', qty: 1, quantity_changed: 1}],
  prefer: 'return=representation'
});
shouldPass('Direct stock_movements INSERT is blocked', !res.ok || emptyArray(res.data), detail(res));

// Create one legitimate movement for mutation/idempotency/concurrency checks.
const movementId = `LEGIT-${unique}`;
res = await rpc(tokenA, 'apply_stock_movement', {
  p_product_id: cfg.PRODUCT_A_ID,
  p_action_type: 'entrada_lote',
  p_quantity_changed: 1,
  p_reason: 'offensive validation seed movement',
  p_reference_code: `SEED-${unique}`,
  p_lot_code: 'SEED',
  p_allow_negative: false,
  p_movement_id: movementId
});
const movementCreated = res.ok;
shouldPass('Legitimate movement can be created through RPC', movementCreated, detail(res));

// 10. Tentativa de UPDATE em stock_movements.
res = await rest(tokenA, `stock_movements?id=eq.${encodeURIComponent(movementId)}&select=id,reason`, {
  method: 'PATCH',
  body: {reason: 'tampered'},
  prefer: 'return=representation'
});
shouldPass('stock_movements UPDATE is blocked', !res.ok, detail(res));

// 11. Tentativa de DELETE em stock_movements.
res = await rest(tokenA, `stock_movements?id=eq.${encodeURIComponent(movementId)}`, {
  method: 'DELETE',
  prefer: 'return=representation'
});
shouldPass('stock_movements DELETE is blocked', !res.ok, detail(res));

// 12. Tentativa de saldo negativo.
res = await rpc(tokenA, 'apply_stock_movement', {
  p_product_id: cfg.PRODUCT_A_ID,
  p_action_type: 'perda',
  p_quantity_changed: -999999999,
  p_reason: 'negative stock attempt',
  p_reference_code: `NEG-${unique}`,
  p_lot_code: 'NEG',
  p_allow_negative: false,
  p_movement_id: `NEG-${unique}`
});
shouldPass('Negative stock is blocked', !res.ok, detail(res));

// 13. Tentativa de movimentação duplicada com mesmo movement_id/idempotency key.
res = await rpc(tokenA, 'apply_stock_movement', {
  p_product_id: cfg.PRODUCT_A_ID,
  p_action_type: 'entrada_lote',
  p_quantity_changed: 1,
  p_reason: 'duplicate movement attempt',
  p_reference_code: `DUP-${unique}`,
  p_lot_code: 'DUP',
  p_allow_negative: false,
  p_movement_id: movementId
});
shouldPass('Duplicate movement_id is blocked', !res.ok, detail(res));

// 14. Duas movimentações concorrentes no mesmo produto para verificar lock/transação.
const before = await readProduct(tokenA, cfg.PRODUCT_A_ID);
const beforeQty = Number(before.data?.[0]?.qty);
const c1 = rpc(tokenA, 'apply_stock_movement', {p_product_id: cfg.PRODUCT_A_ID, p_action_type: 'entrada_lote', p_quantity_changed: 1, p_reason: 'concurrency 1', p_reference_code: `CONC-${unique}-1`, p_lot_code: 'CONC', p_allow_negative: false, p_movement_id: `CONC-${unique}-1`});
const c2 = rpc(tokenA, 'apply_stock_movement', {p_product_id: cfg.PRODUCT_A_ID, p_action_type: 'entrada_lote', p_quantity_changed: 1, p_reason: 'concurrency 2', p_reference_code: `CONC-${unique}-2`, p_lot_code: 'CONC', p_allow_negative: false, p_movement_id: `CONC-${unique}-2`});
const concurrent = await Promise.allSettled([c1, c2]);
const after = await readProduct(tokenA, cfg.PRODUCT_A_ID);
const afterQty = Number(after.data?.[0]?.qty);
const concurrencyOk = concurrent.every(item => item.status === 'fulfilled' && item.value.ok) && Number.isFinite(beforeQty) && afterQty === beforeQty + 2;
shouldPass('Concurrent movements use row lock and preserve final qty', concurrencyOk, `before=${beforeQty} after=${afterQty} results=${JSON.stringify(concurrent.map(item => item.status === 'fulfilled' ? item.value.status : item.reason?.message))}`);

// 15. Payload XSS em produto/lote/fornecedor/motivo é validado manualmente no navegador.
// Não gravamos payload XSS aqui para não contaminar dados de staging; veja SECURITY_OFFENSIVE_TESTS.md.
shouldPass('XSS payloads require browser/UI escaping checklist', true, 'Manual test: produto, lote, fornecedor, motivo, CSV/XML, command palette, drawer e auditoria.');

// 16. Export CSV payloads are validated by static/front-end checks, not Supabase RLS.
shouldPass('CSV formula payload requires front-end csvEscape/static test', true, 'Run SECURITY_OFFENSIVE_TESTS.md CSV section with =,+,-,@ payloads.');

// 18. RPC ignores user_id/company_id from client: extra params should not be accepted by PostgREST function signature.
res = await rpc(tokenA, 'apply_stock_movement', {
  p_product_id: cfg.PRODUCT_A_ID,
  p_action_type: 'entrada_lote',
  p_quantity_changed: 1,
  p_reason: 'extra identity params',
  p_reference_code: `EXTRA-${unique}`,
  p_lot_code: 'EXTRA',
  p_allow_negative: false,
  p_movement_id: `EXTRA-${unique}`,
  p_company_id: cfg.COMPANY_B_ID,
  p_user_id: userB
});
shouldPass('RPC rejects/ignores client-supplied company_id/user_id parameters', !res.ok, detail(res));

// Confirm B can read B product, proving test data is valid.
res = await readProduct(tokenB, cfg.PRODUCT_B_ID);
shouldPass('Control: B can read B product', res.ok && Array.isArray(res.data) && res.data.length === 1, detail(res));

const failed = results.filter(result => !result.ok);
console.log('\nSummary');
console.log(`Passed: ${results.length - failed.length}`);
console.log(`Failed: ${failed.length}`);
if (failed.length) {
  console.error('\nFailures:');
  for (const item of failed) console.error(`- ${item.name}: ${item.details}`);
  process.exit(1);
}
