const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../src/js/core.js');

test('daysToExpire uses the supplied current date instead of a fixed project date', () => {
  const result = core.daysToExpire('2026-06-14', new Date('2026-08-24T12:00:00-03:00'));
  assert.equal(result, -71);
});

test('daysToExpire compares calendar days in the operation timezone', () => {
  const result = core.daysToExpire('2026-08-25', new Date('2026-08-24T23:30:00-03:00'));
  assert.equal(result, 1);
});

test('allocateFefo consumes the earliest valid lots first without mutating input', () => {
  const lots = [
    {id: 'L2', product_id: 'FAR', lot_code: 'B', qty: 7, expires_at: '2026-10-10'},
    {id: 'L1', product_id: 'FAR', lot_code: 'A', qty: 4, expires_at: '2026-09-01'},
    {id: 'L3', product_id: 'OUTRO', lot_code: 'C', qty: 8, expires_at: '2026-08-30'}
  ];

  const result = core.allocateFefo(lots, 'FAR', 6);

  assert.deepEqual(result.allocations, [
    {lotId: 'L1', lotCode: 'A', quantity: 4},
    {lotId: 'L2', lotCode: 'B', quantity: 2}
  ]);
  assert.equal(result.lots.find(lot => lot.id === 'L1').qty, 0);
  assert.equal(result.lots.find(lot => lot.id === 'L2').qty, 5);
  assert.equal(lots.find(lot => lot.id === 'L1').qty, 4);
});

test('allocateFefo rejects insufficient stock and preserves every lot', () => {
  const lots = [{id: 'L1', product_id: 'FAR', lot_code: 'A', qty: 2, expires_at: '2026-09-01'}];
  assert.throws(() => core.allocateFefo(lots, 'FAR', 3), /Saldo insuficiente/);
  assert.equal(lots[0].qty, 2);
});

test('prepareLoss is atomic and rejects a quantity greater than stock', () => {
  const product = {id: 'OVO', name: 'Ovos', qty: 2, price: 10, unit: 'bandejas'};
  assert.throws(() => core.prepareLoss(product, 3, {reason: 'Vencimento'}), /Saldo insuficiente/);
  assert.equal(product.qty, 2);
});

test('prepareLoss returns the loss and stock delta only after validation', () => {
  const product = {id: 'OVO', name: 'Ovos', qty: 5, price: 10, unit: 'bandejas', lote: 'L1'};
  const result = core.prepareLoss(product, 2, {reason: 'Vencimento', responsible: 'Ana'}, new Date('2026-08-24T10:00:00-03:00'));
  assert.equal(result.nextQuantity, 3);
  assert.equal(result.loss.cost, 20);
  assert.equal(result.loss.responsible, 'Ana');
  assert.equal(product.qty, 5);
});

test('parseCsvRows supports quoted separators and escaped quotes', () => {
  const csv = 'sku;nome;qtd;lote\nFAR-25;"Farinha; premium";2;"L""01"';
  const [row] = core.parseCsvRows(csv);
  assert.equal(row.id, 'FAR-25');
  assert.equal(row.name, 'Farinha; premium');
  assert.equal(row.qty, 2);
  assert.equal(row.lote, 'L"01');
});

test('validateSku rejects markup received from a barcode scanner', () => {
  const result = core.validateSku('<img src=x onerror=alert(1)>');
  assert.equal(result.ok, false);
  assert.match(result.error, /c[oó]digo/i);
});

test('escapeHtml encodes every HTML-sensitive character', () => {
  assert.equal(core.escapeHtml('<a href="x">\'&</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;');
});

test('prepareNewScannedProduct starts at zero so confirmation adds stock once', () => {
  const product = core.prepareNewScannedProduct({sku: 'NOVO-1', name: 'Produto novo', cat: 'Outros'});
  assert.equal(product.qty, 0);
  assert.equal(product.id, 'NOVO-1');
});

test('isSyncSuccessful only accepts an explicit successful result', () => {
  assert.equal(core.isSyncSuccessful({ok: true, failed: 0}), true);
  assert.equal(core.isSyncSuccessful({ok: false, failed: 1}), false);
  assert.equal(core.isSyncSuccessful(undefined), false);
});

test('buildRecommendations explains stock, expiry and addressing risks', () => {
  const products = [
    {id: 'FER', name: 'Fermento', qty: 2, min: 8, validade: '2026-08-23', location: ''},
    {id: 'FAR', name: 'Farinha', qty: 20, min: 10, validade: '2026-12-10', location: 'R1-N1-P01'}
  ];
  const suggestions = core.buildRecommendations(products, {now: new Date('2026-08-24T10:00:00-03:00')});
  assert.equal(suggestions[0].severity, 'critical');
  assert.match(suggestions[0].reason, /vencido/i);
  assert.ok(suggestions.some(item => /abaixo do minimo/i.test(item.reason)));
  assert.ok(suggestions.some(item => /sem endereco/i.test(item.reason)));
});

test('normalizeMultilineText converts escaped line breaks without changing real ones', () => {
  assert.equal(core.normalizeMultilineText('Linha 1\\nLinha 2\nLinha 3'), 'Linha 1\nLinha 2\nLinha 3');
});

test('buildLotTraceability separates lots from production orders and sorts by expiry', () => {
  const products = [
    {id:'FAR', name:'Farinha de trigo', cat:'Matéria-prima'},
    {id:'PAO', name:'Pão francês', cat:'Produto acabado'}
  ];
  const lots = [
    {id:'L2', product_id:'PAO', lot_code:'PRD-02', qty:80, unit:'un', expires_at:'2026-08-26', supplier_name:'Produção própria', location:'Balcão'},
    {id:'L1', product_id:'FAR', lot_code:'ENT-01', qty:12, unit:'sc', expires_at:'2026-08-25', supplier_name:'Moinho', location:'R1-N1-P1'}
  ];

  const rows = core.buildLotTraceability(lots, products, new Date('2026-08-24T10:00:00-03:00'));

  assert.deepEqual(rows.map(row => row.lotCode), ['ENT-01','PRD-02']);
  assert.equal(rows[0].productName, 'Farinha de trigo');
  assert.equal(rows[0].origin, 'Entrada de insumo');
  assert.equal(rows[1].origin, 'Produção interna');
  assert.equal(rows[0].urgency, 'critical');
});

test('buildDashboardSnapshot prioritizes stock coverage and operational risks', () => {
  const products = [
    {id:'FAR', name:'Farinha', qty:20, min:10, dailyUse:5, price:2, validade:'2026-09-30'},
    {id:'FER', name:'Fermento', qty:2, min:8, dailyUse:2, price:10, validade:'2026-09-01'},
    {id:'ACU', name:'Açúcar', qty:10, min:5, dailyUse:0, price:3, validade:''}
  ];
  const orders = [
    {id:'OP-1', status:'transit'},
    {id:'OP-2', status:'pending'},
    {id:'OP-3', status:'delivered'}
  ];

  const snapshot = core.buildDashboardSnapshot(products, orders, new Date('2026-08-31T10:00:00-03:00'));

  assert.equal(snapshot.criticalStock, 1);
  assert.equal(snapshot.expiringSoon, 1);
  assert.equal(snapshot.inProduction, 1);
  assert.equal(snapshot.pendingOrders, 1);
  assert.equal(snapshot.priorityCount, 2);
  assert.equal(snapshot.lossRiskValue, 20);
  assert.equal(snapshot.healthPercent, 67);
  assert.equal(snapshot.minimumCoverageDays, 1);
  assert.equal(snapshot.averageCoverageDays, 2.5);
  assert.deepEqual(snapshot.coverage.map(item => item.id), ['FER', 'FAR']);
  assert.deepEqual(snapshot.coverage.map(item => item.state), ['critical', 'attention']);
});
