const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('HTML loads the tested core before the application scripts', () => {
  const html = read('index.html');
  const coreIndex = html.indexOf('src/js/core.js');
  const appIndex = html.indexOf('src/js/app.js');
  assert.ok(coreIndex >= 0, 'core.js must be loaded');
  assert.ok(coreIndex < appIndex, 'core.js must load before app.js');
});

test('PWA manifest and service worker are present and connected', () => {
  const html = read('index.html');
  const app = read('src/js/app.js');
  assert.match(html, /rel=["']manifest["']/i);
  assert.match(app, /serviceWorker\.register/);
  assert.ok(fs.existsSync(path.join(root, 'manifest.webmanifest')));
  assert.ok(fs.existsSync(path.join(root, 'sw.js')));
});

test('main page has skip navigation, a main landmark and an announced toast', () => {
  const html = read('index.html');
  assert.match(html, /class=["']skip-link["']/);
  assert.match(html, /<main\b/i);
  assert.match(html, /id=["']toast["'][^>]+aria-live=["']polite["']/i);
});

test('primary navigation and mobile tabs use native buttons', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<div class=["']nav-item/);
  assert.doesNotMatch(html, /<div class=["']tb-item/);
  assert.match(html, /<button[^>]+class=["']nav-item/);
  assert.match(html, /<button[^>]+class=["']tb-item/);
});

test('application delegates date, CSV and escaping rules to FAST_CORE', () => {
  const app = read('src/js/app.js');
  assert.doesNotMatch(app, /new Date\(['"]2026-06-10/);
  assert.match(app, /FAST_CORE\.daysToExpire/);
  assert.match(app, /FAST_CORE\.parseCsvRows/);
  assert.match(app, /FAST_CORE\.escapeHtml/);
});

test('scanner code is never interpolated directly into modal HTML', () => {
  const app = read('src/js/app.js');
  const start = app.indexOf('function openNewProductModal');
  const end = app.indexOf('function saveNewProductFromScan');
  const scannerModal = app.slice(start, end);
  assert.doesNotMatch(scannerModal, /\$\{code\}/);
  assert.match(scannerModal, /textContent\s*=\s*code/);
});

test('Supabase movement RPC rejects unknown action types and has no client negative override', () => {
  const schema = read('supabase/schema.sql');
  const rpcStart = schema.indexOf('create or replace function apply_stock_movement');
  const rpcEnd = schema.indexOf('grant execute on function apply_stock_movement', rpcStart);
  const rpc = schema.slice(rpcStart, rpcEnd);
  assert.match(rpc, /not\s*\(p_action_type\s*=\s*any/i);
  assert.doesNotMatch(rpc, /p_allow_negative\s+boolean/i);
});

test('motion and focus accessibility protections exist', () => {
  const css = read('src/styles/app.css');
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /transition\s*:\s*all\b/i);
});

test('the interface uses a shared vector icon system', () => {
  const html = read('index.html');
  const app = read('src/js/app.js');
  const icons = read('assets/icons.svg');
  assert.match(html, /assets\/icons\.svg#i-dashboard/);
  assert.match(app, /function fastIcon/);
  assert.match(icons, /id="i-brand"/);
  assert.match(icons, /id="i-fefo"/);
  assert.match(icons, /id="i-production"/);
});

test('operational states use restrained text markers instead of capsule badges', () => {
  const html = read('index.html');
  const app = read('src/js/app.js');
  const css = read('src/styles/app.css');
  assert.match(css, /\.recent-status\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*\}/s);
  assert.doesNotMatch(html, /class=["'][^"']*\bbadge\b/);
  assert.doesNotMatch(app, /class=["'][^"']*\bbadge\b/);
  assert.doesNotMatch(app, /class=["'][^"']*\bpill\b/);
  assert.match(css, /\.status-text\{[^}]*background:\s*transparent[^}]*border-radius:\s*0[^}]*\}/s);
  assert.match(css, /\.status-text::before\{[^}]*border-radius:\s*50%[^}]*\}/s);
  assert.match(css, /\.dashboard-metric \.metric-delta\{[^}]*padding:\s*0[^}]*border-radius:\s*0[^}]*background:\s*transparent/s);
  assert.match(css, /\.coverage-primary em\{[^}]*padding:\s*0[^}]*border-radius:\s*0[^}]*background:\s*transparent/s);
  assert.match(css, /\.supplier-grade\{[^}]*padding:\s*0[^}]*border-radius:\s*0[^}]*background:\s*transparent/s);
  assert.match(css, /\.recent-order>\.recent-loc:nth-child\(3\),\s*\.recent-order>\.recent-arrow\{display:\s*none\}/s);
});

test('lots page is dedicated to traceability instead of repeating production orders', () => {
  const html = read('index.html');
  const app = read('src/js/app.js');
  const start = html.indexOf('id="page-rastreio"');
  const end = html.indexOf('id="page-fornecedores"', start);
  const lotsPage = html.slice(start, end);
  assert.match(lotsPage, /id="lot-search"/);
  assert.match(lotsPage, /id="lot-list"/);
  assert.doesNotMatch(lotsPage, /Ordens em monitoramento/);
  assert.match(app, /function renderLotTraceability/);
  assert.match(app, /rastreio:\s*\['Lotes',\s*'Rastreabilidade de entradas e produção/);
});

test('information modals and map cells use structured visual components', () => {
  const app = read('src/js/app.js');
  const css = read('src/styles/app.css');
  assert.match(app, /field\.type === 'info-list'/);
  assert.match(app, /class="iv-cell/);
  assert.match(css, /\.flow-info-list/);
  assert.match(css, /\.iv-cell-product/);
});

test('dashboard presents an operational coverage hierarchy adapted to the bakery', () => {
  const html = read('index.html');
  const app = read('src/js/app.js');
  const css = read('src/styles/app.css');
  const start = html.indexOf('id="page-dashboard"');
  const end = html.indexOf('id="page-pedidos"', start);
  const dashboard = html.slice(start, end);

  assert.match(dashboard, /id="dashboard-overview"/);
  assert.match(dashboard, /id="dashboard-coverage-chart"/);
  assert.match(dashboard, /id="dashboard-health"/);
  assert.match(dashboard, /Cobertura dos insumos/);
  assert.match(dashboard, /Fila de decisão/);
  assert.match(app, /function renderDashboardOverview/);
  assert.match(app, /FAST_CORE\.buildDashboardSnapshot/);
  assert.match(css, /\.dashboard-operational-grid/);
  assert.match(css, /\.coverage-bar/);
});

test('operational pages share the approved SaaS workspace language', () => {
  const html = read('index.html');
  const css = read('src/styles/app.css');
  const pages = ['pedidos', 'estoque', 'rastreio', 'fornecedores', 'perdas', 'auditoria', 'heatmap'];

  pages.forEach(page => {
    const start = html.indexOf(`id="page-${page}"`);
    const end = html.indexOf('<!-- ── PAGE:', start + 1);
    const slice = html.slice(start, end < 0 ? html.length : end);
    assert.ok(start >= 0, `page ${page} must exist`);
    assert.match(slice, /class="workspace-intro/, `page ${page} must expose the shared task hierarchy`);
  });

  assert.match(html, /class="page workspace-page" id="page-pedidos"/);
  assert.match(html, /class="fefo-workspace"/);
  assert.match(css, /\.workspace-intro/);
  assert.match(css, /\.workspace-toolbar/);
  assert.match(css, /\.workspace-table-panel/);
  assert.match(css, /\.fefo-workspace/);
  const app = read('src/js/app.js');
  assert.match(app, /class="supplier-reliability-bar"/);
  assert.match(app, /var stepLabels = \['Planejamento','Preparo','Forno','Liberação'\]/);
});

test('dashboard lower workspace uses the supplied brand and a visual FEFO queue', () => {
  const html = read('index.html');
  const app = read('src/js/app.js');
  const css = read('src/styles/app.css');

  assert.match(html, /<img[^>]+src="assets\/logbeep-mark-transparent\.png"[^>]+class="brand-logo-image"/);
  assert.ok(fs.existsSync(path.join(root, 'assets', 'logbeep-mark-transparent.png')));
  assert.match(html, /class="dashboard-fefo-list" id="stock-table-critical"/);
  assert.match(app, /class="fefo-priority-card/);
  assert.match(app, /class="fefo-priority-meter"/);
  assert.match(css, /\.dashboard-work-grid\{[^}]*align-items:stretch/s);
  assert.match(css, /\.dashboard-fefo-list/);
  assert.match(read('manifest.webmanifest'), /assets\/logbeep-mark-transparent\.png/);
  assert.match(read('sw.js'), /\.\/assets\/logbeep-mark-transparent\.png/);
});
