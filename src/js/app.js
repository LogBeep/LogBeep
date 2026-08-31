// ── DATABASE CENTRAL ──
const FAST_CORE = window.FAST_CORE;
const FAST_ICON_SPRITE = 'assets/icons.svg';

function fastIcon(name) {
  const safeName = /^[a-z0-9-]+$/.test(name) ? name : 'circle';
  return `<svg class="app-icon" aria-hidden="true" focusable="false"><use href="${FAST_ICON_SPRITE}#i-${safeName}"></use></svg>`;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

var db = cloneData(window.FAST_DEMO_DB || { products: [], suppliers: [], recipes: [], losses: [], movements: [] });
db.lots = FAST_CORE.migrateLots(db.products, db.lots);
var positionProducts = {};
var allRuasData = {};



// ── CATALOG ──
var IV_CATALOG = [];

// sincroniza IV_CATALOG com db.products (usados em outros módulos)
function syncCatalog() {
  IV_CATALOG.length = 0;
  db.products.forEach(p => IV_CATALOG.push({id:p.id, name:p.name, cat:p.cat}));
}

var cargos = cloneData(window.FAST_DEMO_CARGOS || []);

var stepLabels = ['Planejamento','Preparo','Forno','Liberação'];

function buildTimeline(done, active) {
  return stepLabels.map((label, i) => {
    let cls = 'tl-step';
    if (i < done) cls += ' done';
    else if (i === done) cls += ' active';
    const inner = (i < done) ? `<div class="tl-inner"></div>` : (i === done ? `<div class="tl-inner"></div>` : '');
    return `<div class="${cls}"><div class="tl-dot">${inner}</div><div class="tl-label">${label}</div></div>`;
  }).join('');
}

function getCargoStatusMeta(c) {
  const allowedBadges = new Set(['b-transit','b-delivered','b-pending','b-priority','b-fragile']);
  const badgeCls = allowedBadges.has(c.badges?.[0]) ? c.badges[0] : 'b-transit';
  const iconState = c.status === 'pending' ? 'pending' : (c.status === 'delivered' ? 'delivered' : 'transit');
  const icon = c.status === 'pending'
    ? fastIcon('clock')
    : (c.status === 'delivered' ? fastIcon('check-circle') : fastIcon('production'));
  return {badgeCls, iconState, icon};
}

function buildCargoCard(c) {
  const drawerId = FAST_CORE.validateSku(c.id).value;
  const etaColor = c.status === 'delivered' ? 'color:var(--success)' : '';
  const statusHtml = `<span class="status-text ${getCargoStatusMeta(c).badgeCls}">${escapeHtml(c.statusLabel)}</span>`;
  return `
    <button type="button" class="cargo-card" onclick="openDrawer('${drawerId}')">
      <div class="cargo-top">
        <div><div class="cargo-id">#${escapeHtml(c.id)}</div><div class="cargo-title">${escapeHtml(c.title)}</div></div>
        ${statusHtml}
      </div>
      <div class="route"><span class="route-origin">${escapeHtml(c.origin)}</span><span class="route-arrow">→</span><span class="route-dest">${escapeHtml(c.dest)}</span></div>
      <div class="timeline-mini">${buildTimeline(c.steps[0], c.steps[1])}</div>
      <div class="cargo-footer">
        <span class="cargo-meta">Responsável: ${escapeHtml(c.carrier)}</span>
        <span class="cargo-eta" style="${etaColor}">Prev. ${escapeHtml(c.eta)}</span>
      </div>
    </button>`;
}

function buildRecentOrderRow(c) {
  const meta = getCargoStatusMeta(c);
  const drawerId = FAST_CORE.validateSku(c.id).value;
  const recipe = (c.title || '').replace(/^(Produção|Compra):\s*/,'');
  return `
    <button type="button" class="recent-order" onclick="openDrawer('${drawerId}')">
      <div class="recent-ico ${meta.iconState}">${meta.icon}</div>
      <div>
        <div class="recent-id">${escapeHtml(c.id)}</div>
        <div class="recent-client">${escapeHtml(recipe)}</div>
      </div>
      <div class="recent-loc"><div class="recent-label">Etapa</div><div class="recent-value">${escapeHtml(c.origin)}</div></div>
      <div class="recent-arrow">→</div>
      <div class="recent-loc"><div class="recent-label">Destino</div><div class="recent-value">${escapeHtml(c.dest)}</div></div>
      <div class="recent-forecast"><div class="recent-label">Previsão</div><div class="recent-value">${escapeHtml(c.eta)}</div></div>
      <div class="recent-status"><span class="status-text ${meta.badgeCls}">${escapeHtml(c.statusLabel)}</span></div>
    </button>`;
}

function renderCards(list, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<div style="padding:24px;text-align:center;font-size:12px;color:var(--text-muted)">Nenhuma ordem encontrada</div>';
    return;
  }
  el.innerHTML = containerId === 'cargo-list'
    ? list.slice(0,5).map(buildRecentOrderRow).join('')
    : list.map(buildCargoCard).join('');
}

renderCards(cargos.slice(0, 5), 'cargo-list');
renderCards(cargos, 'cargo-list-all');

// ── SEARCH FILTER — Produção ──
function filterCards(q) {
  const term = q.toLowerCase();
  const filtered = cargos.filter(c =>
    c.id.toLowerCase().includes(term) ||
    c.title.toLowerCase().includes(term) ||
    c.origin.toLowerCase().includes(term) ||
    c.dest.toLowerCase().includes(term) ||
    (c.remetente && c.remetente.empresa.toLowerCase().includes(term)) ||
    (c.destinatario && c.destinatario.nome.toLowerCase().includes(term))
  );
  renderCards(filtered.slice(0, 5), 'cargo-list');
  renderCards(filtered, 'cargo-list-all');
}

// ── STOCK STATUS / FEFO ──
function daysToExpire(p) {
  const lot = FAST_CORE.earliestLot(db.lots, p.id);
  return FAST_CORE.daysToExpire(lot?.expires_at || p.validade);
}

function productFefoLot(product) {
  return FAST_CORE.earliestLot(db.lots, product.id) || {
    lot_code: product.lote || 'sem lote',
    expires_at: product.validade || '',
    supplier_name: product.fornecedor || '',
    location: product.location || ''
  };
}

function updateProductLotMetadata(product) {
  const lot = productFefoLot(product);
  product.lote = lot.lot_code || 'sem lote';
  product.validade = lot.expires_at || '';
  product.fornecedor = lot.supplier_name || product.fornecedor || '';
  product.location = lot.location || product.location || '';
}

function addInventoryLot(product, item, supplierName, location='') {
  db.lots = FAST_CORE.upsertLot(db.lots, {
    product_id: product.id,
    lot_code: item.lote || 'SEM-LOTE',
    qty: Number(item.qty || 0),
    unit: item.unit || product.unit || 'un',
    expires_at: item.validade || '',
    supplier_name: supplierName || item.fornecedor || '',
    location: location || product.location || ''
  });
}

function expiryStatus(p) {
  const d = daysToExpire(p);
  if (d === null) return {label:'Sem validade', bg:'var(--surface3)', color:'var(--text-muted)', cls:''};
  if (d < 0) return {label:'Vencido', bg:'var(--danger-bg)', color:'var(--danger)', cls:'stock-low'};
  if (d === 0) return {label:'Vence hoje', bg:'var(--danger-bg)', color:'var(--danger)', cls:'stock-low'};
  if (d <= 3) return {label:`Vence em ${d}d`, bg:'var(--warning-bg)', color:'var(--warning)', cls:'stock-low'};
  if (d <= 7) return {label:`${d}d validade`, bg:'var(--info-bg)', color:'var(--info)', cls:''};
  return {label:'Validade OK', bg:'var(--success-bg)', color:'var(--success)', cls:'stock-ok'};
}

function stockStatus(p) {
  const pct = p.qty / p.min;
  if (p.qty === 0) return {label:'Zerado', bg:'var(--danger-bg)', color:'var(--danger)', cls:'stock-low'};
  if (pct < 0.3)  return {label:'Crítico', bg:'var(--danger-bg)', color:'var(--danger)', cls:'stock-low'};
  if (pct < 0.8)  return {label:'Atenção', bg:'var(--warning-bg)', color:'var(--warning)', cls:'stock-low'};
  return {label:'Normal', bg:'var(--success-bg)', color:'var(--success)', cls:'stock-ok'};
}


function currentCompanyId() {
  return window.FAST_API?.getCompany?.()?.id || window.FAST_CONFIG?.COMPANY_ID || null;
}

function currentUserId() {
  const session = window.FAST_API?.getSession?.();
  return session?.user?.id || session?.user?.email || 'local-demo-user';
}

function appendAuditMovement(product, actionType, quantityChanged, reason, extra={}) {
  const before = Number(product?.qty || 0);
  const delta = Number(quantityChanged || 0);
  const after = Number((before + delta).toFixed(3));
  if (after < 0) {
    throw new Error(`Saldo insuficiente para ${product?.name || product?.id || 'produto'}: ${before} disponível, alteração ${delta}`);
  }
  const movement = {
    id: extra.id || `MOV-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    product_id: product.id,
    company_id: currentCompanyId(),
    user_id: currentUserId(),
    action_type: actionType,
    type: actionType,
    item: product.name,
    sku: product.id,
    qty: delta,
    quantity_before: before,
    quantity_changed: delta,
    quantity_after: after,
    lote: extra.lote || product.lote || 'sem lote',
    lot_code: extra.lote || product.lote || 'sem lote',
    date: extra.date || new Date().toLocaleString('pt-BR'),
    created_at: new Date().toISOString(),
    ref: extra.ref || '',
    reason: reason || extra.reason || actionType,
    note: extra.note || reason || ''
  };
  product.qty = after;
  db.movements.unshift(movement);
  if (isSupabaseMode() && hasRemoteSession() && window.FAST_API?.applyRemoteStockMovement) {
    const seed = window.FAST_API.ensureRemoteProductSeed
      ? window.FAST_API.ensureRemoteProductSeed({...product, qty: before}, before)
      : Promise.resolve();
    seed
      .then(() => window.FAST_API.applyRemoteStockMovement(movement))
      .catch(error => console.warn('Movimentação remota não aplicada via RPC', error));
  }
  return movement;
}

function formatQty(p) {
  return `${p.qty.toLocaleString('pt-BR')} ${p.unit || 'un'}`;
}

function stockRowHtml(p, editable) {
  const s = stockStatus(p);
  const ex = expiryStatus(p);
  const lot = productFefoLot(p);
  const qtyEl = editable
    ? `<button type="button" class="stock-num stock-qty-action ${s.cls}" title="Ajustar quantidade de ${escapeHtml(p.name)}" onclick="editQty('${p.id}',${p.qty})">${escapeHtml(formatQty(p))}</button>`
    : `<div class="stock-num ${s.cls}">${formatQty(p)}</div>`;
  return `<div class="stock-row stock-row-rich">
    <div><div class="stock-name">${escapeHtml(p.name)}</div><div class="stock-sku">${escapeHtml(p.id)} · ${escapeHtml(lot.lot_code || 'sem lote')}</div></div>
    <div class="stock-cat">${escapeHtml(p.cat)}</div>
    ${qtyEl}
    <div class="stock-num">${p.min.toLocaleString('pt-BR')} ${escapeHtml(p.unit || 'un')}</div>
    <div class="stock-status-list"><span class="status-text" style="color:${s.color}">${escapeHtml(s.label)}</span><span class="status-note" style="color:${ex.color}">${escapeHtml(ex.label)}</span></div>
  </div>`;
}

// ── RENDER STOCK TABLE FULL (Estoque page) ──
function renderStockFull(q) {
  const el = document.getElementById('stock-table-full');
  if (!el) return;
  const term = (q||'').toLowerCase();
  const list = db.products.filter(p =>
    !term || p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term) || p.cat.toLowerCase().includes(term) || (p.lote||'').toLowerCase().includes(term) || (p.fornecedor||'').toLowerCase().includes(term)
  );
  if (!list.length) { el.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-muted)">Nenhum insumo ou lote encontrado</div>'; return; }
  el.innerHTML =
    `<div class="stock-row hdr stock-row-rich"><div>Produto / Lote</div><div>Categoria</div><div style="text-align:right">Disponível</div><div style="text-align:right">Mínimo</div><div style="text-align:right">Status / Validade</div></div>` +
    list.map(p => stockRowHtml(p, true)).join('');
}

// ── RENDER CRITICAL STOCK (Dashboard) ──
function renderCriticalStock() {
  const el = document.getElementById('stock-table-critical');
  const summaryEl = document.getElementById('dashboard-fefo-summary');
  if (!el) return;
  const list = [...db.products]
    .sort((a,b) => (daysToExpire(a) ?? 999) - (daysToExpire(b) ?? 999) || (a.qty/a.min) - (b.qty/b.min))
    .slice(0, 5);
  if (!list.length) {
    if (summaryEl) summaryEl.textContent = 'Estoque em conformidade';
    el.innerHTML = '<div class="empty-state">Lotes e validade sob controle.</div>';
    return;
  }
  const urgentCount = list.filter(p => {
    const days = daysToExpire(p);
    return days !== null && days <= 3;
  }).length;
  if (summaryEl) summaryEl.textContent = urgentCount
    ? `${urgentCount} ${urgentCount === 1 ? 'lote exige' : 'lotes exigem'} ação imediata`
    : 'Próximas saídas organizadas';
  el.innerHTML = list.map((p, index) => {
      const st = stockStatus(p);
      const ex = expiryStatus(p);
      const lot = productFefoLot(p);
      const expiryDays = daysToExpire(p);
      const tone = expiryDays === null ? 'neutral' : (expiryDays <= 0 ? 'danger' : (expiryDays <= 7 ? 'warning' : 'success'));
      const windowPercent = expiryDays === null ? 100 : Math.max(6, Math.min(100, ((Math.max(expiryDays, 0) + 1) / 8) * 100));
      const actionLabel = expiryDays === null ? 'Informar validade' : (expiryDays <= 0 ? 'Retirar agora' : (expiryDays <= 3 ? 'Usar neste turno' : (expiryDays <= 7 ? 'Programar saída' : 'Monitorar')));
      const supplier = lot.supplier_name || p.fornecedor || 'Produção própria';
      return `<button type="button" class="fefo-priority-card ${tone}" onclick="navToStr('rastreio')" aria-label="Abrir lote ${escapeHtml(lot.lot_code || p.id)} de ${escapeHtml(p.name)}">
        <span class="fefo-card-rank">${String(index + 1).padStart(2, '0')}</span>
        <span class="status-text fefo-card-status" style="color:${ex.color}">${escapeHtml(ex.label)}</span>
        <span class="fefo-card-icon" aria-hidden="true">${fastIcon('lots')}</span>
        <span class="fefo-card-copy"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(lot.lot_code || 'sem lote')}</small></span>
        <span class="fefo-card-meta"><span>Disponível<strong class="${st.cls}">${escapeHtml(formatQty(p))}</strong></span><span>Fornecedor<strong>${escapeHtml(supplier)}</strong></span></span>
        <span class="fefo-card-window"><span><small>Janela de saída</small><strong>${escapeHtml(actionLabel)}</strong></span><time>${escapeHtml(FAST_CORE.formatDatePtBr(lot.expires_at || p.validade))}</time></span>
        <span class="fefo-priority-meter" aria-hidden="true"><i style="width:${windowPercent}%"></i></span>
      </button>`;
    }).join('');
}

// ── RENDER DASHBOARD METRICS ──
function metricSpark(points) {
  return `<svg class="metric-spark" viewBox="0 0 110 42" aria-hidden="true"><path d="${points}"/></svg>`;
}

function dashboardSnapshot() {
  const products = db.products.map(product => {
    const lot = productFefoLot(product);
    return {...product, validade:lot.expires_at || product.validade};
  });
  return FAST_CORE.buildDashboardSnapshot(products, cargos);
}

function renderDashMetrics() {
  const el = document.getElementById('dash-metrics');
  if (!el) return;
  const snapshot = dashboardSnapshot();
  el.innerHTML = `
    <div class="metric-card dashboard-metric">
      <div class="metric-heading"><span class="metric-icon">${fastIcon('oven')}</span><span class="metric-label">Produções ativas</span></div>
      <div class="metric-value">${snapshot.inProduction}</div>
      <div class="metric-delta ${snapshot.pendingOrders ? 'warning' : 'success'}">${snapshot.pendingOrders} aguardando liberação</div>${metricSpark('M4 35 C18 32 25 26 34 10 S51 11 58 24 S73 31 82 19 S95 30 106 34')}
    </div>
    <div class="metric-card dashboard-metric">
      <div class="metric-heading"><span class="metric-icon">${fastIcon('lots')}</span><span class="metric-label">Lotes em 7 dias</span></div>
      <div class="metric-value">${snapshot.expiringSoon}</div>
      <div class="metric-delta ${snapshot.expiringSoon ? 'danger' : 'success'}">${snapshot.expiringSoon ? 'priorizar saída FEFO' : 'validade sob controle'}</div>${metricSpark('M4 35 C14 31 15 10 28 19 S42 34 54 24 S74 16 86 22 S96 30 106 8')}
    </div>
    <div class="metric-card dashboard-metric">
      <div class="metric-heading"><span class="metric-icon">${fastIcon('box-alert')}</span><span class="metric-label">Abaixo do mínimo</span></div>
      <div class="metric-value">${snapshot.criticalStock}</div>
      <div class="metric-delta ${snapshot.criticalStock ? 'warning' : 'success'}">${snapshot.criticalStock ? 'reposição recomendada' : 'saldo adequado'}</div>${metricSpark('M4 34 C16 30 18 14 30 23 S47 37 55 21 S71 11 80 18 S94 31 106 12')}
    </div>
    <div class="metric-card dashboard-metric">
      <div class="metric-heading"><span class="metric-icon">${fastIcon('losses')}</span><span class="metric-label">Risco de perda</span></div>
      <div class="metric-value">R$ ${Math.round(snapshot.lossRiskValue).toLocaleString('pt-BR')}</div>
      <div class="metric-delta ${snapshot.lossRiskValue ? 'danger' : 'success'}">validade em até 3 dias</div>${metricSpark('M4 32 C16 31 21 20 30 28 S45 37 53 27 S68 23 76 32 S91 37 106 9')}
    </div>
  `;
}

function renderDashboardOverview() {
  const chartEl = document.getElementById('dashboard-coverage-chart');
  const summaryEl = document.getElementById('dashboard-coverage-summary');
  const healthEl = document.getElementById('dashboard-health');
  const headlineEl = document.getElementById('dashboard-headline');
  const summaryTextEl = document.getElementById('dashboard-summary-text');
  if (!chartEl && !summaryEl && !healthEl) return;

  const snapshot = dashboardSnapshot();
  const decisionCount = snapshot.priorityCount;
  if (headlineEl) headlineEl.textContent = decisionCount
    ? `${decisionCount} ${decisionCount === 1 ? 'decisão pede' : 'decisões pedem'} atenção neste turno`
    : 'O turno está sob controle';
  if (summaryTextEl) summaryTextEl.textContent = snapshot.minimumCoverageDays < snapshot.coverageTargetDays
    ? `A menor cobertura é de ${snapshot.minimumCoverageDays.toLocaleString('pt-BR')} dias. Priorize reposição e consumo FEFO.`
    : 'Cobertura, validade e produção seguem dentro do planejado.';

  if (summaryEl) {
    const belowTarget = snapshot.coverage.filter(item => item.days < snapshot.coverageTargetDays).length;
    summaryEl.innerHTML = `
      <div class="coverage-primary"><span>Menor cobertura atual</span><strong>${snapshot.minimumCoverageDays.toLocaleString('pt-BR',{maximumFractionDigits:1})} <small>dias</small></strong><em class="${snapshot.minimumCoverageDays < 3 ? 'danger' : 'warning'}">${snapshot.minimumCoverageDays < snapshot.coverageTargetDays ? 'abaixo do alvo' : 'dentro do alvo'}</em></div>
      <div class="coverage-secondary"><span>Cobertura média<strong>${snapshot.averageCoverageDays.toLocaleString('pt-BR',{maximumFractionDigits:1})} dias</strong></span><span>Itens abaixo do alvo<strong>${belowTarget}</strong></span></div>`;
  }

  if (chartEl) {
    const maxDays = Math.max(snapshot.coverageTargetDays, ...snapshot.coverage.map(item => item.days), 1);
    chartEl.innerHTML = snapshot.coverage.length ? snapshot.coverage.slice(0, 7).map(item => {
      const width = Math.max(4, Math.min(100, (item.days / maxDays) * 100));
      const target = Math.min(100, (snapshot.coverageTargetDays / maxDays) * 100);
      return `<div class="coverage-row" title="${escapeHtml(item.name)}: ${item.days.toLocaleString('pt-BR')} dias de cobertura">
        <span class="coverage-name">${escapeHtml(item.name)}</span>
        <span class="coverage-track"><i class="coverage-target" style="left:${target}%"></i><i class="coverage-bar ${item.state}" style="width:${width}%"></i></span>
        <strong>${item.days.toLocaleString('pt-BR',{maximumFractionDigits:1})}d</strong>
      </div>`;
    }).join('') : '<div class="empty-state">Cadastre o consumo diário para calcular a cobertura.</div>';
  }

  if (healthEl) {
    const circumference = 289;
    const ringOffset = circumference * (1 - snapshot.healthPercent / 100);
    const healthyCount = Math.round(snapshot.activeProducts * snapshot.healthPercent / 100);
    healthEl.innerHTML = `
      <div class="health-gauge">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="health-ring-track" cx="60" cy="60" r="46"></circle><circle class="health-ring-value" cx="60" cy="60" r="46" style="stroke-dashoffset:${ringOffset}"></circle></svg>
        <div><strong>${snapshot.healthPercent}%</strong><span>saudável</span></div>
      </div>
      <div class="health-breakdown">
        <div><span><i class="healthy"></i>Em conformidade</span><strong>${healthyCount}</strong></div>
        <div><span><i class="attention"></i>Validade próxima</span><strong>${snapshot.expiringSoon}</strong></div>
        <div><span><i class="critical"></i>Abaixo do mínimo</span><strong>${snapshot.criticalStock}</strong></div>
      </div>
      <div class="health-risk"><span>Valor sob risco</span><strong>R$ ${Math.round(snapshot.lossRiskValue).toLocaleString('pt-BR')}</strong><small>lotes com validade em até 3 dias</small></div>`;
  }
}

// ── RENDER ESTOQUE METRICS ──
function renderEstoqueMetrics() {
  const el = document.getElementById('estoque-metrics');
  if (!el) return;
  const total  = db.products.reduce((s,p) => s+p.qty, 0);
  const baixo  = db.products.filter(p => p.qty < p.min).length;
  const vencendo = db.products.filter(p => { const d = daysToExpire(p); return d !== null && d <= 7; }).length;
  const valor  = db.products.reduce((s,p) => s + p.qty * (p.price||0), 0);
  el.innerHTML = `
    <div class="metric-card"><div class="metric-icon">${fastIcon('inventory')}</div><div class="metric-label">SKUs e lotes</div><div class="metric-value">${db.products.length}</div><div class="metric-delta" style="color:var(--info)">ativos no estoque</div></div>
    <div class="metric-card"><div class="metric-icon">${fastIcon('box-alert')}</div><div class="metric-label">Volume total</div><div class="metric-value">${total.toLocaleString('pt-BR')}</div><div class="metric-delta" style="color:var(--success)">unidades/sacos/litros</div></div>
    <div class="metric-card"><div class="metric-icon">${fastIcon('alert')}</div><div class="metric-label">Abaixo do mínimo</div><div class="metric-value" style="color:${baixo?'var(--warning)':'var(--success)'}">${baixo}</div><div class="metric-delta" style="color:${baixo?'var(--warning)':'var(--text-muted)'}">${baixo?'comprar hoje':'OK'}</div></div>
    <div class="metric-card"><div class="metric-icon">${fastIcon('lots')}</div><div class="metric-label">Vencimento próximo</div><div class="metric-value" style="color:${vencendo?'var(--danger)':'var(--success)'}">${vencendo}</div><div class="metric-delta" style="color:var(--text-muted)">R$ ${valor.toLocaleString('pt-BR',{minimumFractionDigits:0})} em estoque</div></div>
  `;
}

// ── FLOW MODALS ──
function escapeHtml(value) {
  return FAST_CORE.escapeHtml(value);
}

var flowRestoreFocus = null;

function openFlowModal({title, subtitle='', fields=[], submitLabel='Salvar', onSubmit}) {
  closeFlowModal();
  const infoOnly = fields.length > 0 && fields.every(field => field.type === 'info-list');
  flowRestoreFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'flow-overlay';
  overlay.id = 'flow-overlay';
  overlay.setAttribute('aria-hidden', 'false');
  overlay.innerHTML = `
    <form class="flow-modal${infoOnly ? ' flow-modal-info' : ''}" id="flow-form" role="dialog" aria-modal="true" aria-labelledby="flow-modal-title" ${subtitle ? 'aria-describedby="flow-modal-subtitle"' : ''}>
      <div class="flow-head">
        <div>
          <h2 class="flow-title" id="flow-modal-title">${escapeHtml(title)}</h2>
          ${subtitle ? `<div class="flow-sub" id="flow-modal-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        <button type="button" class="flow-close" aria-label="Fechar janela" onclick="closeFlowModal()">×</button>
      </div>
      <div class="flow-body">
        ${fields.map(field => {
          const required = field.required ? 'required' : '';
          const normalizedValue = FAST_CORE.normalizeMultilineText(field.value ?? '');
          const value = escapeHtml(normalizedValue);
          const label = `<label for="flow-${field.name}">${escapeHtml(field.label)}</label>`;
          if (field.type === 'info-list') {
            const sourceItems = Array.isArray(field.items)
              ? field.items
              : normalizedValue.split('\n').filter(Boolean).map(title => ({title}));
            const items = sourceItems.map(item => typeof item === 'string' ? {title:item} : item);
            return `<section class="flow-field full flow-info-section" aria-labelledby="flow-${field.name}-label">
              <div class="flow-field-heading" id="flow-${field.name}-label">${escapeHtml(field.label)}</div>
              <div class="flow-info-list">${items.map(item => {
                const tone = ['danger','warning','success','info'].includes(item.tone) ? item.tone : 'info';
                return `<div class="flow-info-item ${tone}">
                  <span class="flow-info-icon" aria-hidden="true">${fastIcon(item.icon || 'check-circle')}</span>
                  <span class="flow-info-copy"><strong>${escapeHtml(item.title || '')}</strong>${item.description ? `<span>${escapeHtml(item.description)}</span>` : ''}</span>
                </div>`;
              }).join('')}</div>
            </section>`;
          }
          if (field.type === 'select') {
            return `<div class="flow-field">${label}<select id="flow-${field.name}" name="${field.name}" ${required}>${(field.options||[]).map(opt => {
              const val = typeof opt === 'object' ? opt.value : opt;
              const text = typeof opt === 'object' ? opt.label : opt;
              return `<option value="${escapeHtml(val)}" ${String(val)===String(field.value ?? '')?'selected':''}>${escapeHtml(text)}</option>`;
            }).join('')}</select></div>`;
          }
          if (field.type === 'textarea') {
            return `<div class="flow-field full">${label}<textarea id="flow-${field.name}" name="${field.name}" placeholder="${escapeHtml(field.placeholder || '')}" ${required}>${value}</textarea></div>`;
          }
          return `<div class="flow-field">${label}<input id="flow-${field.name}" name="${field.name}" type="${field.type || 'text'}" value="${value}" placeholder="${escapeHtml(field.placeholder || '')}" ${field.min !== undefined ? `min="${escapeHtml(field.min)}"` : ''} ${field.step !== undefined ? `step="${escapeHtml(field.step)}"` : ''} ${required}></div>`;
        }).join('')}
        <p class="flow-error" id="flow-error" role="alert" hidden></p>
      </div>
      <div class="flow-actions${infoOnly ? ' flow-actions-single' : ''}">
        ${infoOnly ? '' : '<button type="button" class="btn-secondary" onclick="closeFlowModal()">Cancelar</button>'}
        <button type="submit" class="btn-primary">${escapeHtml(submitLabel)}</button>
      </div>
    </form>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeFlowModal(); });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeFlowModal(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  overlay.querySelector('input, select, textarea, button')?.focus();
  document.getElementById('flow-form').addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.currentTarget.querySelector('[type="submit"]');
    const errorBox = document.getElementById('flow-error');
    const values = Object.fromEntries(new FormData(e.currentTarget).entries());
    submitButton.disabled = true;
    errorBox.hidden = true;
    try {
      const result = await onSubmit(values);
      if (result !== false) closeFlowModal();
    } catch (error) {
      errorBox.textContent = error?.message || 'Não foi possível concluir a operação.';
      errorBox.hidden = false;
    } finally {
      if (submitButton.isConnected) submitButton.disabled = false;
    }
  });
}

function closeFlowModal() {
  const overlay = document.getElementById('flow-overlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('open');
  setTimeout(() => {
    overlay.remove();
    if (flowRestoreFocus?.isConnected) flowRestoreFocus.focus();
    flowRestoreFocus = null;
  }, 160);
}

// ── EDIT QTY INLINE ──
function editQty(skuId, current) {
  if (!requireRemoteSession('ajustar estoque')) return;
  const p = db.products.find(x => x.id === skuId);
  if (!p) return;
  openFlowModal({
    title:'Ajustar estoque',
    subtitle:`${p.name} · ${p.lote || 'sem lote'}`,
    submitLabel:'Salvar ajuste',
    fields:[
      {name:'qty', label:'Nova quantidade', type:'number', value:current, min:0, step:1, required:true},
      {name:'reason', label:'Motivo do ajuste', type:'select', value:'Inventário', options:['Inventário','Entrada manual','Correção de perda','Divergência de contagem','Outro']},
      {name:'note', label:'Observação', type:'textarea', placeholder:'Ex.: conferido no estoque seco'}
    ],
    onSubmit(values) {
      const n = Number(values.qty);
      if (!Number.isFinite(n) || n < 0) { showToast('⚠️ Quantidade inválida'); return false; }
      const delta = Number((n - p.qty).toFixed(3));
      if (delta === 0) { showToast('Nenhuma alteração de quantidade.'); return true; }
      try {
        let lotLabel = productFefoLot(p).lot_code || 'AJUSTE-INVENTARIO';
        if (delta < 0) {
          const allocated = FAST_CORE.allocateFefo(db.lots, p.id, Math.abs(delta));
          db.lots = allocated.lots;
          lotLabel = allocated.allocations.map(lot => `${lot.lotCode} (${lot.quantity})`).join(', ');
        } else {
          const lot = productFefoLot(p);
          addInventoryLot(p, {lote:lot.lot_code || 'AJUSTE-INVENTARIO', validade:lot.expires_at || '', qty:delta, unit:p.unit}, lot.supplier_name || p.fornecedor, lot.location || p.location);
        }
        appendAuditMovement(p, 'ajuste', delta, values.reason || 'Ajuste manual', {note:values.note || '', lote:lotLabel});
        updateProductLotMetadata(p);
      } catch (error) { showToast(`⚠️ ${error.message}`); return false; }
      renderAll();
      showToast(`✓ ${p.name}: ${n} ${p.unit || 'un'} · ${values.reason}`);
    }
  });
}


function isSupabaseMode() {
  return !!window.FAST_API?.hasSupabaseConfig?.() && !!window.FAST_API?.isSupabaseSource?.() && hasRemoteSession();
}

function hasRemoteSession() {
  return !!window.FAST_API?.getSession?.();
}

function renderConnectionStatus(state='idle') {
  const status = document.getElementById('supabase-status');
  const sessionBtn = document.getElementById('session-button');
  const configured = !!window.FAST_API?.hasSupabaseConfig?.();
  const remote = !!window.FAST_API?.isSupabaseSource?.();
  const session = window.FAST_API?.getSession?.();
  const company = window.FAST_API?.getCompany?.();
  if (status) {
    status.classList.remove('online','syncing','error');
    if (!configured) status.textContent = 'Local';
    else if (state === 'syncing') { status.textContent = 'Sincronizando'; status.classList.add('syncing'); }
    else if (state === 'error') { status.textContent = 'Erro Supabase'; status.classList.add('error'); }
    else if (remote && !session) { status.textContent = 'Supabase · entrar'; }
    else { status.textContent = remote ? `Supabase${company?.name ? ' · ' + company.name : ''}` : 'Supabase pronto'; status.classList.add('online'); }
  }
  if (sessionBtn) {
    sessionBtn.textContent = session?.user?.email ? session.user.email.split('@')[0] : (session?.email || (configured ? 'Entrar' : 'Entrar'));
    sessionBtn.classList.toggle('session-locked', configured && !session);
  }
}

function requireRemoteSession(actionLabel='esta ação') {
  if (!isSupabaseMode()) return true;
  if (hasRemoteSession()) return true;
  openLoginModal(`Entre para executar ${actionLabel} com Supabase ativo.`);
  return false;
}

// ── RENDER ALL (atualiza tudo de uma vez) ──
function renderAll() {
  renderDashMetrics();
  renderDashboardOverview();
  renderCriticalStock();
  renderEstoqueMetrics();
  renderStockFull(document.getElementById('estoque-search')?.value || '');
  renderCards(cargos.slice(0,5), 'cargo-list');
  renderCards(cargos, 'cargo-list-all');
  renderLotTraceability(document.getElementById('lot-search')?.value || '');
  renderDashboardTracking();
  renderDashboardAlerts();
  renderSuppliers();
  renderLosses();
  renderAudit(document.getElementById('audit-search')?.value || '');
  syncCatalog();
  renderConnectionStatus();
  // atualiza badge da sidebar
  const badge = document.querySelector('.nav-item[data-page="pedidos"] .nav-count');
  if (badge) badge.textContent = cargos.filter(c=>c.status!=='delivered').length;
  const lotsBadge = document.querySelector('.nav-item[data-page="rastreio"] .nav-count');
  if (lotsBadge) lotsBadge.textContent = FAST_CORE.buildLotTraceability(db.lots, db.products).filter(row => row.urgency === 'critical').length;
  saveState();
}

// ── RENDER LOTES / RASTREABILIDADE ──
function formatDayCount(value) {
  return `${value} ${value === 1 ? 'dia' : 'dias'}`;
}

function lotUrgencyMeta(row) {
  if (row.expiryDays === null) return {label:'Sem validade', tone:'b-transit'};
  if (row.expiryDays < 0) return {label:`Vencido há ${formatDayCount(Math.abs(row.expiryDays))}`, tone:'b-alert'};
  if (row.expiryDays === 0) return {label:'Vence hoje', tone:'b-alert'};
  if (row.urgency === 'critical') return {label:`Vence em ${formatDayCount(row.expiryDays)}`, tone:'b-alert'};
  if (row.urgency === 'attention') return {label:`Vence em ${formatDayCount(row.expiryDays)}`, tone:'b-pending'};
  return {label:`Validade em ${formatDayCount(row.expiryDays)}`, tone:'b-delivered'};
}

function renderLotTraceability(q='') {
  const listEl = document.getElementById('lot-list');
  const summaryEl = document.getElementById('lot-summary');
  if (!listEl && !summaryEl) return;

  const rows = FAST_CORE.buildLotTraceability(db.lots, db.products);
  const critical = rows.filter(row => row.urgency === 'critical').length;
  const attention = rows.filter(row => row.urgency === 'attention').length;
  const unmapped = rows.filter(row => row.location === 'Sem posição').length;

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="lot-summary-card"><span class="lot-summary-icon">${fastIcon('lots')}</span><div><span>Lotes ativos</span><strong>${rows.length}</strong></div></div>
      <div class="lot-summary-card danger"><span class="lot-summary-icon">${fastIcon('alert')}</span><div><span>Vencendo ou vencidos</span><strong>${critical}</strong></div></div>
      <div class="lot-summary-card warning"><span class="lot-summary-icon">${fastIcon('clock')}</span><div><span>Atenção em 7 dias</span><strong>${attention}</strong></div></div>
      <div class="lot-summary-card info"><span class="lot-summary-icon">${fastIcon('map-pin')}</span><div><span>Sem posição</span><strong>${unmapped}</strong></div></div>`;
  }

  if (!listEl) return;
  const term = String(q || '').trim().toLocaleLowerCase('pt-BR');
  const filtered = rows.filter(row => !term || [row.lotCode, row.productId, row.productName, row.supplier, row.location, row.origin]
    .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(term)));
  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state">${term ? 'Nenhum lote corresponde à busca.' : 'Nenhum lote ativo cadastrado.'}</div>`;
    return;
  }

  listEl.innerHTML = `
    <div class="lot-table-head" aria-hidden="true"><span>Lote e produto</span><span>Origem</span><span>Saldo</span><span>Validade</span><span>Posição</span><span>Status</span></div>
    ${filtered.map(row => {
      const status = lotUrgencyMeta(row);
      const originIcon = row.origin === 'Produção interna' ? 'production' : 'inventory';
      return `<article class="lot-row">
        <div class="lot-identity"><span class="lot-product-icon" aria-hidden="true">${fastIcon('lots')}</span><div><strong>${escapeHtml(row.productName)}</strong><span>${escapeHtml(row.lotCode)} · ${escapeHtml(row.productId || 'sem SKU')}</span></div></div>
        <div class="lot-origin"><span aria-hidden="true">${fastIcon(originIcon)}</span><div><strong>${escapeHtml(row.origin)}</strong><small>${escapeHtml(row.supplier)}</small></div></div>
        <div class="lot-quantity"><strong>${row.quantity.toLocaleString('pt-BR')}</strong><span>${escapeHtml(row.unit)}</span></div>
        <div class="lot-expiry"><strong>${escapeHtml(FAST_CORE.formatDatePtBr(row.expiresAt))}</strong><span>${row.expiryDays === null ? 'Não informada' : escapeHtml(status.label)}</span></div>
        <div class="lot-location">${fastIcon('map-pin')}<span>${escapeHtml(row.location)}</span></div>
        <div class="lot-status"><span class="status-text ${status.tone}">${escapeHtml(status.label)}</span></div>
      </article>`;
    }).join('')}`;
}


function renderDashboardTracking() {
  const el = document.getElementById('dashboard-tracking');
  if (!el) return;
  const c = cargos.find(x => x.status === 'transit') || cargos.find(x => x.status !== 'delivered') || cargos[0];
  if (!c) { el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px">Nenhuma produção ativa</div>'; return; }
  const meta = getCargoStatusMeta(c);
  const current = (c.timeline || []).find(t => t.cls === 'active') || (c.timeline || [])[0] || {};
  const progress = c.status === 'delivered' ? 100 : (c.status === 'pending' ? 25 : 68);
  const drawerId = FAST_CORE.validateSku(c.id).value;
  el.innerHTML = `
    <button type="button" class="tracking-card live-production-card" onclick="openDrawer('${drawerId}')">
      <div class="tracking-title"><div><strong>${escapeHtml(c.id)}</strong><div class="tracking-route">${escapeHtml(c.origin)} → ${escapeHtml(c.dest)}</div></div><span class="status-text ${meta.badgeCls}">${escapeHtml(c.statusLabel)}</span></div>
      <div class="live-progress-meta"><span>Progresso da ordem</span><strong>${progress}%</strong></div>
      <div class="live-progress"><span style="width:${progress}%"></span></div>
      <div class="live-current">
        <span class="live-current-icon">${fastIcon('oven')}</span>
        <div><small>Etapa atual</small><strong>${escapeHtml(current.ev || c.origin)}</strong><span>${escapeHtml(current.detail || 'Produção sem atualização')}</span></div>
      </div>
      <div class="live-production-footer"><span>Saída prevista</span><strong>${escapeHtml(c.eta)}</strong><small>${escapeHtml(current.time || 'agora')}</small></div>
    </button>`;
}

function renderDashboardAlerts() {
  const el = document.getElementById('dashboard-alerts');
  if (!el) return;
  const products = db.products.map(product => {
    const lot = productFefoLot(product);
    return {...product, validade: lot.expires_at || product.validade, location: lot.location || product.location};
  });
  const recommendations = FAST_CORE.buildRecommendations(products).slice(0, 3);
  if (!recommendations.length) {
    el.innerHTML = '<div class="empty-state">Estoque em conformidade. Nenhuma ação imediata.</div>';
    return;
  }
  el.innerHTML = recommendations.map(item => {
    const page = item.id.startsWith('location-') ? 'heatmap' : (item.id.startsWith('stock-') ? 'estoque' : 'perdas');
    const tone = item.severity === 'critical' ? 'danger' : (item.severity === 'high' ? 'warning' : 'info');
    const icon = item.severity === 'medium' ? fastIcon('map-pin') : fastIcon('alert');
    return `<button type="button" class="alert-item ${tone}" onclick="navToStr('${page}')">
      <span class="alert-icon" aria-hidden="true">${icon}</span>
      <span class="alert-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.reason)} ${escapeHtml(item.action)}</span></span>
      <span class="alert-chevron" aria-hidden="true">${fastIcon('chevron-right')}</span>
    </button>`;
  }).join('');
}

function makeProductionLotCode(recipe, shift) {
  const slug = recipe.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toUpperCase().slice(0,10);
  const ymd = FAST_CORE.isoDateInTimeZone().slice(2).replace(/-/g,'');
  const suffix = (shift || 'turno').slice(0,1).toUpperCase();
  return `PRD-${slug}-${ymd}-${suffix}`;
}

function addDaysIso(days) {
  const d = new Date(`${FAST_CORE.isoDateInTimeZone()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}

function calculateProductionPlan(recipeId, amount) {
  const recipe = db.recipes.find(r => r.id === recipeId);
  if (!recipe) return {error:'Receita não encontrada'};
  const multiplier = amount / recipe.yield;
  const items = recipe.ingredients.map(([sku, recipeQty]) => {
    const product = db.products.find(p => p.id === sku);
    const required = Number((recipeQty * multiplier).toFixed(3));
    return {
      sku,
      required,
      product,
      available: product?.qty || 0,
      ok: !!product && product.qty >= required
    };
  });
  const missing = items.filter(i => !i.ok);
  return {recipe, multiplier, items, missing};
}

function openProductionForm(defaultRecipeId='REC-PF') {
  if (!requireRemoteSession('registrar produção')) return;
  openFlowModal({
    title:'Registrar produção',
    subtitle:'Baixe insumos por receita, aplique FEFO e gere automaticamente o lote acabado.',
    submitLabel:'Registrar produção',
    fields:[
      {name:'recipeId', label:'Receita', type:'select', value:defaultRecipeId, required:true, options:db.recipes.map(r => ({value:r.id, label:`${r.name} · rendimento ${r.yield} ${r.unit}`}))},
      {name:'amount', label:'Quantidade produzida', type:'number', value:100, min:1, step:1, required:true},
      {name:'shift', label:'Turno', type:'select', value:'Manhã', options:['Manhã','Tarde','Noite','Encomenda']},
      {name:'responsible', label:'Responsável', value:'Equipe Panificação', required:true},
      {name:'note', label:'Observação', type:'textarea', placeholder:'Ex.: fornada extra para horário de pico'}
    ],
    onSubmit(values) {
      const amount = Number(values.amount);
      if (!amount || amount <= 0) { showToast('⚠️ Informe uma quantidade produzida válida'); return false; }
      const plan = calculateProductionPlan(values.recipeId, amount);
      if (plan.error) { showToast(`⚠️ ${plan.error}`); return false; }
      if (plan.missing.length) {
        const msg = plan.missing.map(i => `${i.product?.name || i.sku}: precisa ${i.required}, disponível ${i.available}`).join(' | ');
        showToast(`⚠️ Estoque insuficiente: ${msg}`);
        return false;
      }

      const lotCode = makeProductionLotCode(plan.recipe, values.shift);
      const validityDays = /pão/i.test(plan.recipe.name) ? 1 : 3;
      const validity = addDaysIso(validityDays);
      const nowLabel = new Date().toLocaleString('pt-BR');
      const opId = `OP-${new Date().getFullYear()}-${String(cargos.length + 129).padStart(5,'0')}`;
      const cost = plan.items.reduce((sum, item) => sum + item.required * (item.product?.price || 0), 0);

      try {
        let plannedLots = cloneData(db.lots);
        const allocations = new Map();
        plan.items.forEach(item => {
          const result = FAST_CORE.allocateFefo(plannedLots, item.product.id, item.required);
          plannedLots = result.lots;
          allocations.set(item.product.id, result.allocations);
        });
        db.lots = plannedLots;
        plan.items.forEach(item => {
          const usedLots = allocations.get(item.product.id) || [];
          appendAuditMovement(item.product, 'saida_producao', -Math.abs(item.required), `Consumo PVPS para ${plan.recipe.name}`, {
            ref:opId,
            date:nowLabel,
            lote:usedLots.map(lot => `${lot.lotCode} (${lot.quantity})`).join(', ') || 'sem lote'
          });
          updateProductLotMetadata(item.product);
        });
      } catch (error) { showToast(`⚠️ ${error.message}`); return false; }

      const finishedSku = 'PRD-' + plan.recipe.id.replace(/^REC-/, '');
      let finished = db.products.find(p => p.name.toLowerCase() === plan.recipe.name.toLowerCase() && p.cat === 'Produto acabado');
      if (!finished) {
        finished = {
          id:finishedSku,
          name:plan.recipe.name,
          cat:'Produto acabado',
          type:'Produção própria',
          qty:0,
          min:0,
          unit:plan.recipe.unit || 'un',
          price:Number((cost / amount).toFixed(2)) || 0,
          lote:lotCode,
          validade:validity,
          fornecedor:'Produção própria',
          location:'Balcão / expedição',
          dailyUse:0
        };
        db.products.push(finished);
      }
      addInventoryLot(finished, {lote:lotCode, validade:validity, qty:amount, unit:finished.unit}, 'Produção própria', 'Balcão / expedição');
      appendAuditMovement(finished, 'entrada_producao', amount, values.note || `Produção ${values.shift}`, {ref:opId, lote:lotCode, date:nowLabel});
      updateProductLotMetadata(finished);
      finished.fornecedor = 'Produção própria';
      finished.price = Number((cost / amount).toFixed(2)) || finished.price;

      cargos.unshift({
        id:opId,
        title:`Produção: ${plan.recipe.name} — ${values.shift}`,
        status:'delivered',
        statusLabel:'Finalizado',
        origin:'Produção',
        dest:'Balcão / expedição',
        carrier:values.responsible || 'Equipe Produção',
        eta:'Agora',
        steps:[4,4],
        badges:['b-delivered'],
        remetente:{empresa:'Padaria Três Irmãos', cnpj:'12.345.678/0001-90', tel:'(11) 4002-7788'},
        destinatario:{nome:'Balcão e encomendas', endereco:'Loja principal', cnpj:'—', tel:'—'},
        nfe:opId,
        peso:'—',
        volumes:amount,
        seguro:`Custo estimado R$ ${cost.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,
        frete:'—',
        rastreio:lotCode,
        modalidade:'Produção interna',
        prazo:'Finalizado agora',
        prazoRev:null,
        ocorrencia:null,
        itens:plan.items.map(i => ({name:i.product.name, sku:i.product.id, qty:i.required})),
        timeline:[
          {cls:'done', ev:'Receita selecionada', detail:`${plan.recipe.name} · ${amount} ${plan.recipe.unit}`, time:nowLabel},
          {cls:'done', ev:'Insumos baixados', detail:'Estoque atualizado com regra FEFO', time:nowLabel},
          {cls:'done', ev:'Lote acabado gerado', detail:`${lotCode} · validade ${validity.split('-').reverse().join('/')}`, time:nowLabel}
        ]
      });

      renderAll();
      navToStr('pedidos');
      showToast(`✅ Produção registrada: ${amount} ${plan.recipe.unit} de ${plan.recipe.name}`);
    }
  });
}

function openStockModal() {
  const critical = db.products.filter(p => p.qty < p.min);
  const expiring = db.products
    .map(p => ({...p, days:daysToExpire(p)}))
    .filter(p => p.days !== null && p.days <= 7)
    .sort((a,b) => a.days - b.days);
  const totalValue = db.products.reduce((sum,p) => sum + p.qty * (p.price || 0), 0);
  openFlowModal({
    title:'Resumo do estoque',
    subtitle:'Visão rápida dos insumos, lotes e produtos acabados.',
    submitLabel:'Abrir estoque',
    fields:[
      {name:'overview', label:'Visão geral', type:'textarea', value:[
        `SKUs/lotes ativos: ${db.products.length}`,
        `Abaixo do mínimo: ${critical.length}`,
        `Vencem em até 7 dias: ${expiring.length}`,
        `Valor estimado em estoque: R$ ${totalValue.toLocaleString('pt-BR',{minimumFractionDigits:2})}`
      ].join('\n')},
      {name:'critical', label:'Insumos críticos', type:'textarea', value:critical.map(p => `${p.id} · ${p.name}: ${formatQty(p)} / mínimo ${p.min} ${p.unit || 'un'}`).join('\n') || 'Nenhum item abaixo do mínimo.'},
      {name:'expiry', label:'Vencem em 7 dias', type:'textarea', value:expiring.map(p => `${p.lote || 'sem lote'} · ${p.name}: ${p.days} dia(s)`).join('\n') || 'Nenhum lote vencendo em até 7 dias.'}
    ],
    onSubmit(){ navToStr('estoque'); }
  });
}

function openProductionSummaryModal() {
  const inProgress = cargos.filter(c => c.status === 'transit');
  const pending = cargos.filter(c => c.status === 'pending');
  const doneToday = cargos.filter(c => c.status === 'delivered');
  openFlowModal({
    title:'Resumo da produção',
    subtitle:'Acompanhamento rápido das fornadas, encomendas e receitas.',
    submitLabel:'Registrar nova produção',
    fields:[
      {name:'orders', label:'Ordens', type:'textarea', value:[
        `Em produção: ${inProgress.length}`,
        `Aguardando liberação: ${pending.length}`,
        `Finalizadas: ${doneToday.length}`
      ].join('\n')},
      {name:'recipes', label:'Receitas cadastradas', type:'textarea', value:db.recipes.map(r => `${r.id} · ${r.name} · rendimento ${r.yield} ${r.unit}`).join('\n')},
      {name:'next', label:'Próximas ações', type:'textarea', value:[
        '1. Priorizar lotes FEFO antes da próxima fornada.',
        '2. Validar insumos abaixo do mínimo.',
        '3. Registrar perdas no fim do turno.'
      ].join('\n')}
    ],
    onSubmit(){ openProductionForm(); }
  });
}

function openFefoMapModal() {
  const expiring = db.products
    .map(p => ({...p, days:daysToExpire(p)}))
    .filter(p => p.days !== null)
    .sort((a,b) => a.days - b.days)
    .slice(0, 8);
  const mapped = Object.entries(positionProducts || {});
  openFlowModal({
    title:'Resumo do Mapa FEFO',
    subtitle:'Lotes por validade, posição e prioridade de uso.',
    submitLabel:'Abrir mapa FEFO',
    fields:[
      {name:'priority', label:'Prioridade FEFO', type:'textarea', value:expiring.map(p => `${p.days} dia(s) · ${p.lote || 'sem lote'} · ${p.name} · ${p.location || 'sem posição'}`).join('\n') || 'Nenhum lote com validade cadastrada.'},
      {name:'mapped', label:'Produtos mapeados', type:'textarea', value:mapped.map(([pos, prod]) => `${pos} · ${prod.id} · ${prod.name}`).join('\n') || 'Nenhum produto atribuído ao mapa ainda.'},
      {name:'guide', label:'Como usar', type:'textarea', value:'Clique em uma célula para atribuir produto/lote. Use a aba Localizar Produto para encontrar posições. Priorize os lotes com menor validade antes da produção.'}
    ],
    onSubmit(){ navToStr('heatmap'); }
  });
}

function commandActions() {
  return [
    {type:'Ações rápidas', label:'Registrar entrada de insumo', desc:'Abrir QR/entrada com fornecedor e lote', icon:'plus', action:() => openQR()},
    {type:'Ações rápidas', label:'Resumo do estoque', desc:'Abrir modal com mínimos, validade e valor estimado', icon:'inventory', action:() => openStockModal()},
    {type:'Ações rápidas', label:'Registrar produção de pão francês', desc:'Baixar ingredientes e gerar lote acabado', icon:'production', action:() => openProductionForm('REC-PF')},
    {type:'Ações rápidas', label:'Resumo da produção', desc:'Abrir modal com ordens e receitas do dia', icon:'oven', action:() => openProductionSummaryModal()},
    {type:'Ações rápidas', label:'Resumo do Mapa FEFO', desc:'Abrir modal com prioridade por validade e posições', icon:'fefo', action:() => openFefoMapModal()},
    {type:'Ações rápidas', label:'Registrar perda/descarte', desc:'Sobra, vencimento, quebra ou erro de produção', icon:'losses', action:() => openLossForm()},
    {type:'Ações rápidas', label:'Importar NF-e ou CSV', desc:'Entrada em lote de insumos e validade', icon:'file-import', action:() => { openQR(); setTimeout(openImportFile, 80); }},
    {type:'Ações rápidas', label:'Ver lotes vencendo', desc:'Rastrear origem, posição e validade FEFO', icon:'lots', action:() => navToStr('rastreio')},
    {type:'Ações rápidas', label:'Ver recomendações de reposição', desc:'Regras explicáveis por mínimo, validade e endereço', icon:'alert', action:() => navToStr('dashboard')},
    {type:'Ações rápidas', label:'Abrir auditoria', desc:'Histórico de entradas, saídas, perdas e ajustes', icon:'audit', action:() => navToStr('auditoria')},
    {type:'Ações rápidas', label:'Exportar movimentações CSV', desc:'Baixar histórico operacional para planilha', icon:'file-down', action:() => exportMovementsCsv()},
    {type:'Ações rápidas', label:'Sincronizar Supabase agora', desc:'Enviar dados locais para o backend configurado', icon:'database', action:() => syncSupabaseNow()},
    {type:'Ações rápidas', label:'Resetar dados locais', desc:'Limpar localStorage e voltar ao demo inicial após recarregar', icon:'refresh', action:() => resetLocalData()},
    {type:'Produção', label:'Abrir produção', desc:'Ordens, fornadas e encomendas do dia', icon:'production', action:() => navToStr('pedidos')},
    {type:'Estoque', label:'Abrir estoque FEFO', desc:'Insumos, lotes, validade e mínimos', icon:'inventory', action:() => navToStr('estoque')},
    ...db.recipes.map(r => ({type:'Receitas', label:`Produzir ${r.name}`, desc:`Rendimento base ${r.yield} ${r.unit} · baixa automática de insumos`, icon:'wheat', action:() => openProductionForm(r.id)})),
    ...cargos.map(c => ({type:'Ordens de produção', label:c.id, desc:`${c.title} · ${c.origin} → ${c.dest}`, icon:'production', action:() => openDrawer(c.id)})),
    ...db.products.map(p => ({type:'Insumos e lotes', label:p.id, desc:`${p.name} · ${formatQty(p)} · ${p.lote || 'sem lote'} · validade ${p.validade || '—'}`, icon:'inventory', action:() => { navToStr('estoque'); const input=document.getElementById('estoque-search'); if(input){input.value=p.id; renderStockFull(p.id);} }})),
    ...db.suppliers.map(f => ({type:'Fornecedores', label:f.name, desc:`${f.cat} · lead time ${f.lead} · confiabilidade ${f.reliability}%`, icon:'suppliers', action:() => navToStr('fornecedores')}))
  ];
}

function renderCommandResults(q) {
  const el = document.getElementById('cmd-results');
  if (!el) return;
  const term = (q || '').toLowerCase();
  const list = commandActions().filter(item => !term || item.label.toLowerCase().includes(term) || item.desc.toLowerCase().includes(term)).slice(0, 12);
  if (!list.length) { el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px">Nenhum resultado encontrado</div>'; return; }
  let currentGroup = '';
  el.innerHTML = list.map((item, idx) => {
    const group = item.type !== currentGroup ? (currentGroup = item.type, `<div class="cmd-group-label">${escapeHtml(item.type)}</div>`) : '';
    return `${group}<button type="button" class="cmd-item" onclick="runCommandAction(${idx})"><span class="cmd-item-ico">${fastIcon(item.icon)}</span><span class="cmd-item-copy"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.desc)}</span></span><span class="cmd-kbd">Enter</span></button>`;
  }).join('');
  window.__cmdList = list;
}

function openCommandPalette(q='') {
  const overlay = document.getElementById('cmd-overlay');
  const input = document.getElementById('cmd-input');
  if (!overlay || !input) return;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  input.value = q || '';
  renderCommandResults(input.value);
  setTimeout(() => input.focus(), 30);
}

function closeCommandPalette() {
  const overlay = document.getElementById('cmd-overlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function handleCommandOverlayClick(e) {
  if (e.target === document.getElementById('cmd-overlay')) closeCommandPalette();
}

function runCommandAction(idx) {
  const item = (window.__cmdList || [])[idx];
  if (!item) return;
  closeCommandPalette();
  item.action();
}

function handleCommandKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    runCommandAction(0);
  }
}

function globalSearch(q) {
  if (currentPage === 'dashboard' || currentPage === 'pedidos') filterCards(q);
  if (currentPage === 'estoque') renderStockFull(q);
  const overlay = document.getElementById('cmd-overlay');
  if (overlay && overlay.classList.contains('open')) renderCommandResults(q);
}

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCommandPalette(document.getElementById('global-search')?.value || '');
  }
  if (e.key === 'Escape') closeCommandPalette();
});

function renderSuppliers() {
  const el = document.getElementById('supplier-grid');
  if (!el) return;
  el.innerHTML = db.suppliers.map(f => {
    const reliability = Math.max(0, Math.min(100, Number(f.reliability) || 0));
    const grade = reliability >= 95 ? 'Excelente' : (reliability >= 85 ? 'Estável' : 'Revisar');
    const tone = reliability >= 95 ? 'success' : (reliability >= 85 ? 'info' : 'warning');
    return `
      <article class="supplier-card">
        <div class="supplier-head">
          <div class="supplier-logo">${escapeHtml(f.name.split(' ').map(w=>w[0]).slice(0,2).join(''))}</div>
          <div class="supplier-identity"><div class="supplier-name">${escapeHtml(f.name)}</div><div class="supplier-cat">${escapeHtml(f.cat)}</div></div>
          <span class="supplier-grade ${tone}">${grade}</span>
        </div>
        <div class="supplier-reliability">
          <div><span>Confiabilidade</span><strong>${reliability.toLocaleString('pt-BR')}%</strong></div>
          <div class="supplier-reliability-bar"><span style="width:${reliability}%"></span></div>
        </div>
        <div class="supplier-meta-grid">
          <div class="supplier-meta"><span>Lead time</span><strong>${escapeHtml(f.lead)}</strong></div>
          <div class="supplier-meta"><span>Última compra</span><strong>${escapeHtml(f.last)}</strong></div>
        </div>
      </article>`;
  }).join('');
}

function renderLosses() {
  const metrics = document.getElementById('loss-metrics');
  const table = document.getElementById('loss-table');
  const suggestions = document.getElementById('loss-suggestions');
  const totalQty = db.losses.reduce((s,l) => s + Number(l.qty || 0), 0);
  const totalCost = db.losses.reduce((s,l) => s + Number(l.cost || 0), 0);
  const expiryLosses = db.losses.filter(l => /venc|valid/i.test(l.reason || '')).length;
  if (metrics) {
    metrics.innerHTML = `
      <div class="metric-card"><div class="metric-icon">${fastIcon('audit')}</div><div class="metric-label">Registros de perda</div><div class="metric-value">${db.losses.length}</div><div class="metric-delta" style="color:var(--info)">histórico operacional</div></div>
      <div class="metric-card"><div class="metric-icon">${fastIcon('losses')}</div><div class="metric-label">Quantidade perdida</div><div class="metric-value">${totalQty}</div><div class="metric-delta" style="color:var(--warning)">unidades/volumes</div></div>
      <div class="metric-card"><div class="metric-icon">${fastIcon('alert')}</div><div class="metric-label">Custo estimado</div><div class="metric-value">R$ ${totalCost.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div><div class="metric-delta" style="color:var(--danger)">impacto financeiro</div></div>
      <div class="metric-card"><div class="metric-icon">${fastIcon('lots')}</div><div class="metric-label">Por validade</div><div class="metric-value">${expiryLosses}</div><div class="metric-delta" style="color:var(--danger)">corrigir FEFO</div></div>`;
  }
  if (table) {
    table.innerHTML = `<div class="stock-row hdr stock-row-rich"><div>Item</div><div>Motivo</div><div style="text-align:right">Qtd.</div><div style="text-align:right">Custo</div><div style="text-align:right">Data</div></div>` +
      db.losses.map(l => `<div class="stock-row stock-row-rich">
        <div><div class="stock-name">${escapeHtml(l.item)}</div><div class="stock-sku">${escapeHtml(l.lote || 'sem lote informado')}</div></div>
        <div class="stock-cat">${escapeHtml(l.reason)}</div>
        <div class="stock-num">${escapeHtml(l.qty)}</div>
        <div class="stock-num">R$ ${Number(l.cost || 0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div style="text-align:right"><span class="status-note" style="color:var(--warning)">${escapeHtml(l.date || 'hoje')}</span></div>
      </div>`).join('');
  }
  if (suggestions) {
    suggestions.innerHTML = `
      <button type="button" class="alert-item danger" onclick="navToStr('estoque')"><span class="alert-icon">${fastIcon('fefo')}</span><span class="alert-copy"><strong>Aplicar FEFO antes da produção</strong><span>Priorize lotes com validade menor que 3 dias.</span></span><span class="alert-chevron">${fastIcon('chevron-right')}</span></button>
      <button type="button" class="alert-item warning" onclick="openLossForm()"><span class="alert-icon">${fastIcon('losses')}</span><span class="alert-copy"><strong>Registrar toda sobra de balcão</strong><span>Dados de perda alimentam compras e produção sugerida.</span></span><span class="alert-chevron">${fastIcon('chevron-right')}</span></button>
      <button type="button" class="alert-item info" onclick="openImportFile()"><span class="alert-icon">${fastIcon('file-import')}</span><span class="alert-copy"><strong>Importar XML/CSV de entrada</strong><span>Evita digitação e reduz erro em lote/validade.</span></span><span class="alert-chevron">${fastIcon('chevron-right')}</span></button>`;
  }
}

function openLossForm() {
  if (!requireRemoteSession('registrar perda/descarte')) return;
  openFlowModal({
    title:'Registrar perda/descarte',
    subtitle:'Informe o lote, motivo e quantidade para alimentar os indicadores de desperdício.',
    submitLabel:'Registrar perda',
    fields:[
      {name:'sku', label:'Produto / lote', type:'select', value:db.products[0]?.id || '', required:true, options:db.products.map(p => ({value:p.id, label:`${p.id} — ${p.name} · ${p.lote || 'sem lote'}`}))},
      {name:'qty', label:'Quantidade perdida', type:'number', value:1, min:0, step:1, required:true},
      {name:'reason', label:'Motivo', type:'select', value:'Sobra de balcão', options:['Sobra de balcão','Vencimento','Erro de produção','Produto queimado','Quebra','Divergência de inventário','Outro']},
      {name:'responsible', label:'Responsável', value:'Ana Martins'},
      {name:'note', label:'Observação', type:'textarea', placeholder:'Ex.: sobra da fornada da tarde'}
    ],
    onSubmit(values) {
      const p = db.products.find(x => x.id === values.sku);
      if (!p) { showToast('⚠️ SKU não encontrado'); return false; }
      const qty = Number(values.qty);
      try {
        const prepared = FAST_CORE.prepareLoss(p, qty, values);
        const allocated = FAST_CORE.allocateFefo(db.lots, p.id, qty);
        const lotLabel = allocated.allocations.map(lot => `${lot.lotCode} (${lot.quantity})`).join(', ');
        db.lots = allocated.lots;
        appendAuditMovement(p, 'perda', prepared.movement.quantityChanged, prepared.movement.reason, {
          note:prepared.loss.note,
          lote:lotLabel || prepared.loss.lote
        });
        prepared.loss.lote = lotLabel || prepared.loss.lote;
        db.losses.unshift(prepared.loss);
        updateProductLotMetadata(p);
      } catch (error) { showToast(`⚠️ ${error.message}`); return false; }
      renderAll();
      navToStr('perdas');
      showToast(`✅ Perda registrada: ${qty} ${p.unit || 'un'} de ${p.name}`);
    }
  });
}

function openSupplierForm() {
  openFlowModal({
    title:'Novo fornecedor',
    subtitle:'Cadastre fornecedor homologado para compras e reposição inteligente.',
    submitLabel:'Cadastrar fornecedor',
    fields:[
      {name:'name', label:'Nome do fornecedor', value:'Novo Fornecedor', required:true},
      {name:'cnpj', label:'CNPJ', placeholder:'00.000.000/0001-00'},
      {name:'cat', label:'Categoria', value:'Insumos', required:true},
      {name:'lead', label:'Lead time', value:'2 dias', required:true},
      {name:'reliability', label:'Confiabilidade (%)', type:'number', value:95, min:0, step:1, required:true},
      {name:'contact', label:'Contato', placeholder:'telefone ou e-mail'},
      {name:'items', label:'Itens fornecidos', type:'textarea', placeholder:'Ex.: farinha, fermento, ovos'}
    ],
    onSubmit(values) {
      const name = values.name?.trim();
      if (!name) { showToast('⚠️ Informe o nome do fornecedor'); return false; }
      const reliability = Number(values.reliability) || 95;
      db.suppliers.unshift({
        id:'SUP-' + name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toUpperCase().slice(0,18),
        name,
        cat:values.cat || 'Insumos',
        lead:values.lead || '2 dias',
        reliability:Math.max(0, Math.min(100, reliability)),
        last:new Date().toLocaleDateString('pt-BR'),
        cnpj:values.cnpj || '—',
        contact:values.contact || '—',
        items:values.items || ''
      });
      renderAll();
      showToast(`✅ Fornecedor "${name}" cadastrado`);
    }
  });
}

function movementTypeLabel(type) {
  const labels = {
    entrada:'Entrada',
    perda:'Perda',
    ajuste:'Ajuste',
    saida_producao:'Saída produção',
    entrada_producao:'Entrada produção',
    entrada_scan:'Entrada bipador',
    entrada_lote:'Entrada lote',
    cadastro_fornecedor:'Fornecedor'
  };
  return labels[type] || type || 'Movimento';
}

function renderAudit(q='') {
  const metrics = document.getElementById('audit-metrics');
  const table = document.getElementById('audit-table');
  if (!metrics && !table) return;
  const term = (q || '').toLowerCase();
  const movements = (db.movements || []);
  const filtered = movements.filter(m =>
    !term ||
    [m.type, m.item, m.sku, m.lote, m.ref, m.note, m.date].some(v => String(v || '').toLowerCase().includes(term))
  );
  const entries = movements.filter(m => String(m.type).startsWith('entrada')).length;
  const exits = movements.filter(m => String(m.type).startsWith('saida')).length;
  const losses = movements.filter(m => m.type === 'perda').length;
  const adjustments = movements.filter(m => m.type === 'ajuste').length;
  if (metrics) {
    metrics.innerHTML = `
      <div class="metric-card"><div class="metric-icon">${fastIcon('audit')}</div><div class="metric-label">Movimentações</div><div class="metric-value">${movements.length}</div><div class="metric-delta" style="color:var(--info)">eventos auditáveis</div></div>
      <div class="metric-card"><div class="metric-icon">${fastIcon('plus')}</div><div class="metric-label">Entradas</div><div class="metric-value">${entries}</div><div class="metric-delta" style="color:var(--success)">insumos e produção</div></div>
      <div class="metric-card"><div class="metric-icon">${fastIcon('production')}</div><div class="metric-label">Saídas produção</div><div class="metric-value">${exits}</div><div class="metric-delta" style="color:var(--warning)">consumo de receita</div></div>
      <div class="metric-card"><div class="metric-icon">${fastIcon('losses')}</div><div class="metric-label">Perdas/ajustes</div><div class="metric-value">${losses + adjustments}</div><div class="metric-delta" style="color:var(--danger)">controle operacional</div></div>`;
  }
  if (table) {
    table.innerHTML = `<div class="stock-row hdr audit-row"><div>Data / Tipo</div><div>Produto / SKU</div><div style="text-align:right">Qtd.</div><div>Lote</div><div>Referência</div></div>` +
      filtered.map(m => {
        const isNegative = ['perda','saida_producao'].includes(m.type) || Number(m.qty) < 0;
        const color = isNegative ? 'var(--danger)' : 'var(--success)';
        return `<div class="stock-row audit-row">
          <div><div class="stock-name">${escapeHtml(m.date || '—')}</div><div class="stock-sku">${escapeHtml(movementTypeLabel(m.type))}</div></div>
          <div><div class="stock-name">${escapeHtml(m.item || '—')}</div><div class="stock-sku">${escapeHtml(m.sku || '—')}</div></div>
          <div class="stock-num" style="color:${color}">${Number(m.qty || 0).toLocaleString('pt-BR')}</div>
          <div class="stock-cat">${escapeHtml(m.lote || '—')}</div>
          <div><div class="stock-name">${escapeHtml(m.ref || '—')}</div><div class="stock-sku">${escapeHtml(m.note || '')}</div></div>
        </div>`;
      }).join('') || '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-muted)">Nenhuma movimentação encontrada</div>';
  }
}

function csvEscape(value) {
  const str = String(value ?? '');
  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g,'""')}"` : safe;
}

function downloadFile(filename, content, type='text/plain;charset=utf-8') {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportMovementsCsv() {
  if (!requireRemoteSession('exportar relatório de auditoria')) return;
  const rows = [['data','tipo','produto','sku','quantidade','saldo_antes','alteracao','saldo_depois','lote','referencia','motivo','observacao']]
    .concat((db.movements || []).map(m => [m.date, movementTypeLabel(m.type), m.item, m.sku, m.qty, m.quantity_before, m.quantity_changed, m.quantity_after, m.lote, m.ref, m.reason, m.note]));
  const csv = rows.map(row => row.map(csvEscape).join(';')).join('\n');
  downloadFile(`fast-movimentacoes-${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv;charset=utf-8');
  window.FAST_API?.logSecurityEvent?.({event_type:'export_csv', resource_type:'stock_movements', result:'success', reason:'Exportação CSV de auditoria', payload:{rows:Math.max(0, rows.length - 1)}})
    .catch(error => console.warn('Evento de exportação não auditado remotamente', error));
  showToast('✅ Movimentações exportadas em CSV');
}

function exportAllDataJson() {
  downloadFile(`fast-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({db, cargos}, null, 2), 'application/json;charset=utf-8');
  showToast('✅ Backup JSON exportado');
}

function openHelpModal() {
  openFlowModal({
    title:'Centro de Ajuda',
    subtitle:'Atalhos e fluxos principais do F.A.S.T Estoque Inteligente.',
    submitLabel:'Entendi',
    fields:[
      {name:'help', label:'Guia rápido', type:'info-list', items:[
        {icon:'plus', title:'Nova entrada', description:'Importe NF-e/CSV ou leia um lote por QR Code.'},
        {icon:'production', title:'Registrar produção', description:'Baixe ingredientes por FEFO e gere o lote acabado.'},
        {icon:'losses', title:'Perdas', description:'Registre sobras, vencimentos, quebras e descartes.'},
        {icon:'audit', title:'Auditoria', description:'Consulte o histórico de todas as movimentações.'},
        {icon:'search', title:'Busca rápida', description:'Use Ctrl/Cmd + K para abrir a paleta de comandos.'}
      ]}
    ],
    onSubmit(){ return true; }
  });
}

function openProfileModal() {
  openFlowModal({
    title:'Perfil do usuário',
    subtitle:'Dados locais do operador nesta demonstração.',
    submitLabel:'Salvar perfil',
    fields:[
      {name:'name', label:'Nome', value:'Ana Martins'},
      {name:'role', label:'Cargo', value:'Administrador'},
      {name:'unit', label:'Unidade', value:'Padaria Três Irmãos'},
      {name:'email', label:'E-mail', value:'ana@padaria.local'}
    ],
    onSubmit(values) {
      showToast(`✅ Perfil atualizado para ${values.name}`);
    }
  });
}


function openConnectionModal() {
  const configured = window.FAST_API?.hasSupabaseConfig?.();
  const source = window.FAST_API?.isSupabaseSource?.() ? 'Supabase como fonte principal' : 'Local/offline';
  const company = window.FAST_API?.getCompany?.();
  const session = window.FAST_API?.getSession?.();
  openFlowModal({
    title:'Conexão e persistência',
    subtitle:'Status atual do backend e da sincronização.',
    submitLabel:'Sincronizar agora',
    fields:[
      {name:'status', label:'Modo atual', value:configured ? source : 'Local · Supabase não configurado'},
      {name:'company', label:'Padaria / empresa', value:company?.name || 'Não configurada'},
      {name:'session', label:'Sessão', value:session?.user?.email || session?.email || 'Sem login'},
      {name:'guide', label:'Validação real', type:'textarea', value:'1. Configure Supabase em src/js/config.js.\n2. Rode supabase/schema.sql.\n3. Entre com usuário Supabase.\n4. Registre entrada, produção e perda.\n5. Confira products, production_orders, losses e stock_movements.'}
    ],
    onSubmit(){ syncSupabaseNow(); }
  });
}

function openLoginModal(message='Entre para sincronizar e gravar dados remotos com segurança.') {
  const session = window.FAST_API?.getSession?.();
  if (session) {
    openFlowModal({
      title:'Sessão Supabase',
      subtitle:'Usuário conectado ao backend.',
      submitLabel:'Sair',
      fields:[{name:'email', label:'Usuário', value:session.user?.email || session.email || 'sessão ativa'}],
      onSubmit(){
        window.FAST_API.signOut().then(() => { renderConnectionStatus(); showToast('Sessão encerrada.'); });
      }
    });
    return;
  }
  openFlowModal({
    title:'Entrar no Supabase',
    subtitle:message,
    submitLabel:'Entrar',
    fields:[
      {name:'email', label:'E-mail', type:'email', required:true, placeholder:'operador@padaria.com'},
      {name:'password', label:'Senha', type:'password', required:true, placeholder:'••••••••'}
    ],
    onSubmit(values) {
      if (!window.FAST_API?.hasSupabaseConfig?.()) { showToast('Configure o Supabase antes de entrar.'); return false; }
      window.FAST_API.signIn(values.email, values.password)
        .then(() => { renderConnectionStatus(); bootstrapRemoteState(); setTimeout(openCompanyOnboardingModal, 180); showToast('✅ Login Supabase realizado.'); })
        .catch(error => { console.warn('Falha no login Supabase', error); showToast('⚠️ Não foi possível entrar no Supabase.'); });
    }
  });
}

function openCompanyOnboardingModal() {
  if (!isSupabaseMode() || !hasRemoteSession() || window.FAST_API?.getCompany?.()) return;
  openFlowModal({
    title:'Configurar padaria',
    subtitle:'Crie o vínculo de empresa para isolar dados por company_id.',
    submitLabel:'Criar empresa local',
    fields:[{name:'name', label:'Nome da padaria', value:'Padaria Três Irmãos', required:true}],
    onSubmit(values) {
      const company = window.FAST_API.createLocalCompany(values.name);
      remoteStateReady = true;
      window.FAST_API.ensureCompany?.().then(() => syncSupabaseNow()).catch(error => console.warn('Empresa ainda não sincronizada', error));
      renderConnectionStatus();
      showToast(`Empresa configurada: ${company.name}`);
    }
  });
}

function openSettingsModal() {
  openFlowModal({
    title:'Configurações',
    subtitle:'Preferências locais enquanto o backend não está conectado.',
    submitLabel:'Salvar configurações',
    fields:[
      {name:'fefo', label:'Regra FEFO', type:'select', value:'Ativa', options:['Ativa','Somente alertar']},
      {name:'expiry', label:'Alerta de vencimento (dias)', type:'number', value:3, min:1, step:1},
      {name:'autosave', label:'Persistência local', type:'select', value:'localStorage ativo', options:['localStorage ativo','Somente sessão']},
      {name:'backup', label:'Backup recomendado', value:'Exportar JSON ao final do expediente'}
    ],
    onSubmit(){ showToast('✅ Configurações salvas localmente'); }
  });
}

function openNotificationsModal() {
  const critical = db.products.filter(p => p.qty < p.min).length;
  const expiring = db.products.filter(p => { const d = daysToExpire(p); return d !== null && d <= 3; }).length;
  const pending = cargos.filter(c => c.status === 'pending').length;
  openFlowModal({
    title:'Notificações operacionais',
    subtitle:'Resumo dos alertas críticos da padaria.',
    submitLabel:'Ver auditoria',
    fields:[
      {name:'alerts', label:'Alertas', type:'info-list', items:[
        {icon:'lots', tone:expiring ? 'danger' : 'success', title:`${expiring} ${expiring === 1 ? 'lote vencendo' : 'lotes vencendo'}`, description:expiring ? 'Validade em até 3 dias; priorize o consumo por FEFO.' : 'Nenhum lote vence nos próximos 3 dias.'},
        {icon:'alert', tone:critical ? 'warning' : 'success', title:`${critical} ${critical === 1 ? 'insumo abaixo' : 'insumos abaixo'} do mínimo`, description:critical ? 'Revise a necessidade de compra e reposição.' : 'Todos os insumos estão acima do mínimo.'},
        {icon:'clock', tone:pending ? 'info' : 'success', title:`${pending} ${pending === 1 ? 'ordem aguardando' : 'ordens aguardando'}`, description:pending ? 'Há produções esperando liberação para avançar.' : 'Não há ordens pendentes de liberação.'}
      ]}
    ],
    onSubmit(){ navToStr('auditoria'); }
  });
}

// ── LOCAL PERSISTENCE ──
var STORAGE_KEY = window.FAST_API?.STORAGE_KEY || 'fast-padaria-state-v1';
var isHydratingState = true;
var remoteStateReady = false;

function loadState() {
  try {
    const state = window.FAST_API ? window.FAST_API.readState() : JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!state) return;
    if (state.db) {
      Object.keys(db).forEach(key => {
        if (Array.isArray(db[key]) && Array.isArray(state.db[key])) {
          db[key].splice(0, db[key].length, ...state.db[key]);
        }
      });
    }
    if (Array.isArray(state.cargos)) {
      cargos.splice(0, cargos.length, ...state.cargos);
    }
    if (state.positionProducts && typeof state.positionProducts === 'object') {
      Object.assign(positionProducts, state.positionProducts);
    }
    if (state.allRuasData && typeof state.allRuasData === 'object') {
      Object.assign(allRuasData, state.allRuasData);
    }
    db.lots = FAST_CORE.migrateLots(db.products, db.lots);
    db.products.forEach(updateProductLotMetadata);
  } catch (error) {
    console.warn('Não foi possível carregar dados locais do F.A.S.T', error);
  }
}

function saveState() {
  if (isHydratingState) return;
  if (isSupabaseMode() && !remoteStateReady) return;
  try {
    const state = {stateVersion:2, db, cargos, positionProducts, allRuasData};
    if (window.FAST_API) window.FAST_API.writeState(state);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Não foi possível salvar dados locais do F.A.S.T', error);
  }
}

function resetLocalData() {
  if (!window.confirm('Apagar os dados locais deste dispositivo? Exporte um backup antes se precisar recuperar as informações.')) return;
  localStorage.removeItem(STORAGE_KEY);
  showToast('Dados locais apagados. Recarregue a página para restaurar a demonstração.');
}

async function bootstrapRemoteState() {
  if (!window.FAST_API?.hasSupabaseConfig?.() || !window.FAST_API?.isSupabaseSource?.()) return;
  if (!hasRemoteSession()) {
    renderConnectionStatus();
    return;
  }
  if (!window.FAST_API?.getCompany?.()) {
    renderConnectionStatus();
    openCompanyOnboardingModal();
    return;
  }
  try {
    const state = await window.FAST_API.loadRemoteState();
    if (!state) return;
    isHydratingState = true;
    loadState();
    isHydratingState = false;
    remoteStateReady = true;
    renderAll();
    showToast('Supabase conectado: dados remotos carregados.');
    setTimeout(openCompanyOnboardingModal, 120);
  } catch (error) {
    isHydratingState = false;
    remoteStateReady = true;
    renderAll();
    console.warn('Não foi possível carregar dados remotos do Supabase', error);
    showToast('⚠️ Supabase indisponível. Usando dados locais.');
  }
}

function syncSupabaseNow() {
  renderConnectionStatus('syncing');
  if (!window.FAST_API?.hasSupabaseConfig?.()) {
    renderConnectionStatus();
    showToast('Configure o Supabase em src/js/config.js antes de sincronizar.');
    return;
  }
  if (isSupabaseMode() && !hasRemoteSession()) {
    renderConnectionStatus();
    openLoginModal('Entre antes de sincronizar dados com o Supabase.');
    return;
  }
  window.FAST_API.syncNow()
    .then(result => {
      renderConnectionStatus();
      if (result?.skipped === 'missing-session') { openLoginModal('Entre antes de sincronizar dados com o Supabase.'); return; }
      if (result?.skipped === 'missing-company') { openCompanyOnboardingModal(); return; }
      if (!FAST_CORE.isSyncSuccessful(result)) throw new Error('A sincronização retornou falhas pendentes.');
      showToast('Sincronização Supabase concluída.');
    })
    .catch(error => {
      console.warn('Falha ao sincronizar Supabase', error);
      renderConnectionStatus('error');
      showToast('⚠️ Falha ao sincronizar com Supabase.');
    });
}

// ── INIT ──
loadState();
isHydratingState = false;
remoteStateReady = !isSupabaseMode();
renderAll();
bootstrapRemoteState();
setTimeout(openCompanyOnboardingModal, 250);

// ── NAV ──
var pageTitles = {
  dashboard: ['Dashboard', 'Estoque, validade e produção da padaria'],
  pedidos: ['Produção', 'Ordens, fornadas e encomendas'],
  estoque: ['Estoque', 'Insumos, lotes e validade'],
  rastreio: ['Lotes', 'Rastreabilidade de entradas e produção, validade e origem'],
  fornecedores: ['Fornecedores', 'Compras, lead time e confiabilidade'],
  perdas: ['Perdas', 'Descartes, sobras e custo de desperdício'],
  auditoria: ['Auditoria', 'Movimentações, rastreabilidade e exportações'],
  heatmap: ['Mapa FEFO', 'Ocupação e validade por posição'],
};

// ── HEATMAP MODULE ──
var IV_LEVELS  = 5;
var IV_RACKS   = 20;
var IV_MAX_CAP = 800;
var ivCurrentRua   = '1';
var ivCurrentNivel = 'all';
// allRuasData guarda os dados de todas as ruas (não regenera ao trocar)
function ivGetRuaData(rua) {
  if (!allRuasData[rua]) allRuasData[rua] = ivSeed(rua);
  return allRuasData[rua];
}
var ivMatrixData = ivGetRuaData('1');
// positionProducts[cellId] = { id, name }
// activeTab
var ivActiveTab = 'mapa';
// cell modal state
var cmCurrentCell = null;
var cmSelectedProduct = null;

// Atualiza qty de uma célula pelo cellId (ex: "R1-N2-P5")
function ivSetCellQty(cellId, qty) {
  const m = cellId.match(/R(\d+)-N(\d+)-P(\d+)/);
  if (!m) return;
  const [, rua, nivel, predio] = m;
  const data = ivGetRuaData(rua);
  data[nivel][predio] = qty;
  if (rua === ivCurrentRua) ivMatrixData = data;
}

function ivSwitchTab(tab) {
  ivActiveTab = tab;
  const tabMapa = document.getElementById('hmtab-mapa');
  const tabProd = document.getElementById('hmtab-produto');
  const viewMapa = document.getElementById('hmview-mapa');
  const viewProd = document.getElementById('hmview-produto');
  if (tab === 'mapa') {
    tabMapa.style.cssText = 'padding:12px 16px;font-size:13px;font-weight:500;color:var(--text-primary);cursor:pointer;border-bottom:2px solid var(--text-primary);margin-bottom:-1px;display:flex;align-items:center;gap:7px;transition:color .15s,border-color .15s,background-color .15s';
    tabProd.style.cssText = 'padding:12px 16px;font-size:13px;font-weight:400;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:flex;align-items:center;gap:7px;transition:color .15s,border-color .15s,background-color .15s';
    viewMapa.style.display = 'flex';
    viewProd.style.display = 'none';
  } else {
    tabMapa.style.cssText = 'padding:12px 16px;font-size:13px;font-weight:400;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:flex;align-items:center;gap:7px;transition:color .15s,border-color .15s,background-color .15s';
    tabProd.style.cssText = 'padding:12px 16px;font-size:13px;font-weight:500;color:var(--text-primary);cursor:pointer;border-bottom:2px solid var(--text-primary);margin-bottom:-1px;display:flex;align-items:center;gap:7px;transition:color .15s,border-color .15s,background-color .15s';
    viewMapa.style.display = 'none';
    viewProd.style.display = 'flex';
    ivRenderProductList('');
  }
}

// ── SEED — começa vazio ──
function ivSeed(rua) {
  const r = {};
  for (let lv = 1; lv <= IV_LEVELS; lv++) {
    r[lv] = {};
    for (let rk = 1; rk <= IV_RACKS; rk++) {
      r[lv][rk] = 0;
    }
  }
  return r;
}

function ivCellColor(val) {
  if (val === 0) return {bg:'#F0F8FC',tc:'var(--text-muted)'};
  const pct = val / IV_MAX_CAP;
  if (pct < 0.12) return {bg:'#FEE2E2',tc:'var(--danger)'};
  if (pct < 0.25) return {bg:'#FFF3CD',tc:'var(--warning)'};
  if (pct < 0.5)  return {bg:'#DFF4F3',tc:'var(--success)'};
  if (pct < 0.75) return {bg:'#BEE9E8',tc:'var(--success)'};
  return {bg:'#62B6CB',tc:'#FFFFFF'};
}

function ivBuildMetrics(data) {
  let total=0, filled=0, low=0, crit=0;
  for (let lv=1;lv<=IV_LEVELS;lv++) for (let rk=1;rk<=IV_RACKS;rk++) {
    const v = data[lv][rk];
    total += v; if (v>0) filled++;
    if (v>0 && v/IV_MAX_CAP<0.12) crit++;
    else if (v>0 && v/IV_MAX_CAP<0.25) low++;
  }
  const withProd = Object.keys(positionProducts).filter(k => k.startsWith(`R${ivCurrentRua}-`)).length;
  const el = document.getElementById('iv-metrics');
  if (!el) return;
  el.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:10px 12px"><div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Unidades totais</div><div style="font-size:18px;font-weight:600;color:var(--text-primary);font-family:var(--mono);letter-spacing:-1px">${total.toLocaleString('pt-BR')}</div><div style="font-size:10px;margin-top:2px;color:#5dc97a">Rua ${ivCurrentRua}</div></div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:10px 12px"><div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Posições ocupadas</div><div style="font-size:18px;font-weight:600;color:var(--text-primary);font-family:var(--mono);letter-spacing:-1px">${filled}</div><div style="font-size:10px;margin-top:2px;color:var(--text-muted)">de ${IV_LEVELS*IV_RACKS}</div></div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:10px 12px"><div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Produtos mapeados</div><div style="font-size:18px;font-weight:600;color:#1B4965;font-family:var(--mono);letter-spacing:-1px">${withProd}</div><div style="font-size:10px;margin-top:2px;color:#5FA8D3">posições com produto</div></div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:10px 12px"><div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Crítico</div><div style="font-size:18px;font-weight:600;color:var(--danger);font-family:var(--mono);letter-spacing:-1px">${crit}</div><div style="font-size:10px;margin-top:2px;color:var(--danger)">requer reposição</div></div>
  `;
}

function ivBuildHeatmap(data) {
  const container = document.getElementById('heatmap-container');
  if (!container) return;
  const levelsToShow = ivCurrentNivel === 'all'
    ? Array.from({length:IV_LEVELS},(_,i)=>i+1)
    : [parseInt(ivCurrentNivel)];

  let html = `<div class="iv-heatmap-grid" style="grid-template-columns:44px ${Array(IV_RACKS).fill('84px').join(' ')}">`;
  html += '<div class="iv-grid-corner"></div>';
  for (let rk=1;rk<=IV_RACKS;rk++) html += `<div class="iv-col-label">P${rk}</div>`;

  for (const lv of levelsToShow) {
    html += `<div class="iv-row-label">N${lv}</div>`;
    for (let rk=1;rk<=IV_RACKS;rk++) {
      const val = data[lv][rk];
      let {bg,tc} = ivCellColor(val);
      const pct = Math.round(val/IV_MAX_CAP*100);
      const cellId = `R${ivCurrentRua}-N${lv}-P${rk}`;
      const prod = positionProducts[cellId];
      if (prod) { bg = 'rgba(190,233,232,.85)'; tc = '#1B4965'; }
      const prodLabel = prod
        ? `<span class="iv-cell-product">${escapeHtml(prod.name)}</span>`
        : '';
      const titleStr = prod
        ? `${cellId}: ${prod.name} (${prod.id}) · ${val.toLocaleString('pt-BR')} un`
        : `${cellId}: ${val.toLocaleString('pt-BR')} un · ${pct}%`;
      html += `
        <button type="button" onclick="ivOpenCellModal('${cellId}',${val},${lv},${rk})" title="${escapeHtml(titleStr)}"
          class="iv-cell${prod?' has-product':''}" style="--iv-cell-bg:${bg};--iv-cell-text:${tc};--iv-cell-border:${prod?'rgba(98,182,203,.7)':'transparent'}">
          <span class="iv-cell-qty">${val===0?'—':val.toLocaleString('pt-BR')}</span>
          ${val>0&&!prod?`<span class="iv-cell-percent">${pct}% ocupado</span>`:''}
          ${prodLabel}
          ${prod?'<span class="iv-cell-dot" aria-hidden="true"></span>':''}
        </button>`;
    }
  }
  html += '</div>';
  container.innerHTML = html;
  const titleEl = document.getElementById('hm-title');
  if (titleEl) titleEl.textContent = `Rua ${ivCurrentRua} — mapa de posições`;
  const footRua = document.getElementById('foot-rua');
  if (footRua) footRua.textContent = ivCurrentRua;
  const footCount = document.getElementById('foot-count');
  if (footCount) footCount.textContent = levelsToShow.length * IV_RACKS;
}

function ivSetToggle(groupId, btn, val) {
  document.querySelectorAll(`#${groupId} .iv-tg`).forEach(b => {
    b.style.background = 'transparent'; b.style.border = 'none'; b.style.color = 'var(--text-muted)';
  });
  btn.style.background = 'var(--surface3)'; btn.style.border = '1px solid var(--border)'; btn.style.color = 'var(--text-primary)';
  if (groupId === 'tg-rua') {
    ivCurrentRua = val;
    ivMatrixData = ivGetRuaData(ivCurrentRua);
    ivBuildMetrics(ivMatrixData);
  } else { ivCurrentNivel = val; }
  ivBuildHeatmap(ivMatrixData);
}
function ivUpdateFilters() { ivBuildHeatmap(ivMatrixData); }
function filterBySku(v) { showToast(v ? `Filtrando: "${v}"` : 'Filtro limpo'); }
function ivDoSearch() { const i = document.getElementById('sku-input'); if(i&&i.value) showToast(`Buscando: "${i.value}"`); }

// ── CELL MODAL ──
function ivOpenCellModal(cellId, val, lv, rk) {
  cmCurrentCell = { cellId, val, lv, rk };
  cmSelectedProduct = null;
  document.getElementById('cm-cell-id').textContent = 'POSIÇÃO · ' + cellId;
  document.getElementById('cm-pos').textContent = cellId;
  document.getElementById('cm-cap').textContent = val.toLocaleString('pt-BR') + ' un · ' + Math.round(val/IV_MAX_CAP*100) + '%';
  // current product
  const cur = positionProducts[cellId];
  const wrap = document.getElementById('cm-current-wrap');
  if (cur) {
    wrap.style.display = 'block';
    document.getElementById('cm-current-name').textContent = cur.name;
    document.getElementById('cm-current-sku').textContent = cur.id;
  } else { wrap.style.display = 'none'; }
  // reset search & list
  document.getElementById('cm-search').value = '';
  ivCmFilter('');
  ivCmResetConfirm();
  // open
  const ov = document.getElementById('cell-modal-overlay');
  ov.style.display = 'flex';
  ov.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    ov.style.opacity = '1';
    document.getElementById('cell-modal').style.transform = 'translateY(0)';
    document.getElementById('cm-search')?.focus();
  });
}

function ivCloseCellModal() {
  const ov = document.getElementById('cell-modal-overlay');
  ov.setAttribute('aria-hidden', 'true');
  ov.style.opacity = '0';
  document.getElementById('cell-modal').style.transform = 'translateY(16px)';
  setTimeout(() => { ov.style.display = 'none'; }, 250);
  cmCurrentCell = null; cmSelectedProduct = null;
}

function ivCmFilter(q) {
  const list = document.getElementById('cm-product-list');
  const filtered = IV_CATALOG.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) || p.id.toLowerCase().includes(q.toLowerCase())
  );
  list.innerHTML = filtered.map(p => `
    <button type="button" onclick="ivCmSelectProd('${p.id}')" id="cmprod-${p.id.replace(/[^a-z0-9]/gi,'')}"
      style="width:100%;border:0;background:transparent;font-family:var(--font);text-align:left;padding:8px 10px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:background .12s"
      onmouseover="this.style.background='var(--surface3)'" onmouseout="if(!this.classList.contains('selected'))this.style.background='transparent'">
      <div>
        <div style="font-size:12px;color:var(--text-primary)">${escapeHtml(p.name)}</div>
        <div style="font-size:10px;font-family:var(--mono);color:var(--text-muted);margin-top:1px">${escapeHtml(p.id)} · ${escapeHtml(p.cat)}</div>
      </div>
    </button>`).join('') || '<div style="padding:10px;font-size:12px;color:var(--text-muted);text-align:center">Nenhum produto encontrado</div>';
}

function ivCmSelectProd(skuId) {
  cmSelectedProduct = IV_CATALOG.find(p => p.id === skuId);
  // visual selection
  document.querySelectorAll('#cm-product-list > button').forEach(el => {
    el.style.background = 'transparent'; el.classList.remove('selected');
  });
  const key = skuId.replace(/[^a-z0-9]/gi,'');
  const el = document.getElementById('cmprod-' + key);
  if (el) { el.style.background = 'var(--accent-dim)'; el.classList.add('selected'); }
  // enable confirm
  const btn = document.getElementById('cm-confirm-btn');
  btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; btn.removeAttribute('disabled');
}

function ivCmResetConfirm() {
  const btn = document.getElementById('cm-confirm-btn');
  btn.style.opacity = '.4'; btn.style.pointerEvents = 'none'; btn.setAttribute('disabled','');
  cmSelectedProduct = null;
}

function ivConfirmAssign() {
  if (!cmSelectedProduct || !cmCurrentCell) return;
  positionProducts[cmCurrentCell.cellId] = { id: cmSelectedProduct.id, name: cmSelectedProduct.name };
  const product = db.products.find(item => item.id === cmSelectedProduct.id);
  if (product) product.location = cmCurrentCell.cellId;
  ivCloseCellModal();
  ivBuildHeatmap(ivMatrixData);
  ivBuildMetrics(ivMatrixData);
  saveState();
  showToast(`${cmSelectedProduct.name} → ${cmCurrentCell.cellId}`);
}

function ivRemoveProduct() {
  if (!cmCurrentCell) return;
  if (!window.confirm(`Remover o produto da posição ${cmCurrentCell.cellId}? O estoque do produto não será apagado.`)) return;
  const removed = positionProducts[cmCurrentCell.cellId];
  const removedPositionId = cmCurrentCell.cellId;
  delete positionProducts[cmCurrentCell.cellId];
  const product = db.products.find(item => item.id === removed?.id);
  if (product && product.location === cmCurrentCell.cellId) product.location = '';
  document.getElementById('cm-current-wrap').style.display = 'none';
  ivCloseCellModal();
  ivBuildHeatmap(ivMatrixData);
  ivBuildMetrics(ivMatrixData);
  saveState();
  window.FAST_API?.removeRemotePosition?.(removedPositionId).catch(error => console.warn('Posição remota não removida.', error));
  showToast('Produto removido da posição');
}

// ── LOCALIZAR PRODUTO ──
function ivRenderProductList(q) {
  const list = document.getElementById('prod-list');
  if (!list) return;
  const filtered = IV_CATALOG.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) || p.id.toLowerCase().includes(q.toLowerCase())
  );
  // group: show products that have positions first
  const withPos = filtered.filter(p => Object.values(positionProducts).some(pp => pp.id === p.id));
  const withoutPos = filtered.filter(p => !Object.values(positionProducts).some(pp => pp.id === p.id));
  const renderItem = (p, hasPos) => {
    const count = Object.entries(positionProducts).filter(([,v]) => v.id === p.id).length;
    return `<button type="button" onclick="ivLocateProduct('${p.id}')" id="proditem-${p.id.replace(/[^a-z0-9]/gi,'')}"
      style="width:100%;font-family:var(--font);text-align:left;background:transparent;padding:9px 12px;border-radius:var(--r);cursor:pointer;transition:background .12s;border:1px solid transparent"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="if(!this.classList.contains('active-prod'))this.style.background='transparent'">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
        <div style="font-size:12px;color:var(--text-primary);font-weight:${hasPos?'500':'400'}">${escapeHtml(p.name)}</div>
        ${hasPos?`<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:var(--accent-dim);color:#1B4965;font-family:var(--mono)">${count} pos.</span>`:''}
      </div>
      <div style="font-size:10px;font-family:var(--mono);color:var(--text-muted)">${escapeHtml(p.id)} · ${escapeHtml(p.cat)}</div>
    </button>`;
  };
  let html = '';
  if (withPos.length) {
    html += `<div style="font-size:9px;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;padding:6px 12px 4px">Mapeados</div>`;
    html += withPos.map(p => renderItem(p, true)).join('');
  }
  if (withoutPos.length) {
    html += `<div style="font-size:9px;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;padding:${withPos.length?'10px':'6px'} 12px 4px">Sem posição</div>`;
    html += withoutPos.map(p => renderItem(p, false)).join('');
  }
  if (!filtered.length) html = '<div style="padding:20px;font-size:12px;color:var(--text-muted);text-align:center">Nenhum produto encontrado</div>';
  list.innerHTML = html;
}

function ivFilterProductList(q) { ivRenderProductList(q); }

function ivLocateProduct(skuId) {
  const prod = IV_CATALOG.find(p => p.id === skuId);
  if (!prod) return;
  // highlight in list
  document.querySelectorAll('#prod-list > button[id^="proditem-"]').forEach(el => {
    el.classList.remove('active-prod'); el.style.background = 'transparent'; el.style.border = '1px solid transparent';
  });
  const key = skuId.replace(/[^a-z0-9]/gi,'');
  const listEl = document.getElementById('proditem-' + key);
  if (listEl) { listEl.classList.add('active-prod'); listEl.style.background = 'var(--accent-dim)'; listEl.style.border = '1px solid rgba(98,182,203,.35)'; }

  // find all positions
  const positions = Object.entries(positionProducts).filter(([,v]) => v.id === skuId).map(([k]) => k);

  // show result panel
  document.getElementById('prod-locator-empty').style.display = 'none';
  const res = document.getElementById('prod-locator-result');
  res.style.display = 'flex';
  document.getElementById('loc-prod-name').textContent = prod.name;
  document.getElementById('loc-prod-sku').textContent = prod.id + ' · ' + prod.cat;

  // positions list
  const posEl = document.getElementById('loc-positions');
  if (positions.length === 0) {
    posEl.innerHTML = `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;font-size:12px;color:var(--text-muted)">
      Nenhuma posição mapeada para este produto.
      <button onclick="ivSwitchTab('mapa')" style="display:inline;background:none;border:none;color:#1B4965;cursor:pointer;font-size:12px;font-family:var(--font);padding:0 4px">Ir ao mapa →</button>
    </div>`;
  } else {
    posEl.innerHTML = `<div style="font-size:10px;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px">${positions.length} posição(ões) encontrada(s)</div>` +
      positions.map(pos => {
        const [,ruaPart,nivelPart,predioPart] = pos.match(/R(\d+)-N(\d+)-P(\d+)/)||[];
        const val = ivMatrixData[nivelPart] ? (ivMatrixData[nivelPart][predioPart]||0) : 0;
        const pct = Math.round(val/IV_MAX_CAP*100);
        return `<button type="button" onclick="ivGoToPos('${pos}')" style="width:100%;font-family:var(--font);text-align:left;background:var(--accent-dim);border:1px solid rgba(98,182,203,.35);border-radius:var(--r);padding:10px 14px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:background-color .15s,border-color .15s,transform .15s"
          onmouseover="this.style.background='#CAE9FF'" onmouseout="this.style.background='var(--accent-dim)'">
          <div>
            <div style="font-size:13px;font-family:var(--mono);color:#1B4965;font-weight:500">${pos}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Rua ${ruaPart} · Nível ${nivelPart} · Prédio ${predioPart}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:12px;font-family:var(--mono);color:var(--text-secondary)">${val.toLocaleString('pt-BR')} un</div>
            <div style="font-size:10px;color:var(--text-muted)">${pct}% cap.</div>
          </div>
        </button>`;
      }).join('');
  }

  // mini map: all ruas
  const mapGrid = document.getElementById('loc-map-grid');
  let mapHtml = '';
  for (let r=1;r<=5;r++) {
    const ruaPositions = positions.filter(p => p.startsWith(`R${r}-`));
    const dots = Array.from({length:IV_LEVELS},(_,lv) =>
      Array.from({length:IV_RACKS},(_,rk) => {
        const cid = `R${r}-N${lv+1}-P${rk+1}`;
        const hasProd = ruaPositions.includes(cid);
        return `<div title="${cid}" style="width:8px;height:8px;border-radius:1px;background:${hasProd?'#5FA8D3':'var(--surface3)'}"></div>`;
      }).join('')
    ).join('');
    mapHtml += `<div style="display:flex;align-items:center;gap:8px">
      <div style="font-size:10px;font-family:var(--mono);color:${ruaPositions.length?'#1B4965':'var(--text-muted)'};width:18px;font-weight:${ruaPositions.length?'600':'400'}">R${r}</div>
      <div style="display:flex;gap:2px;flex-wrap:wrap">${dots}</div>
      ${ruaPositions.length?`<span style="font-size:10px;color:#1B4965;font-family:var(--mono)">${ruaPositions.length}×</span>`:''}
    </div>`;
  }
  mapGrid.innerHTML = mapHtml;
}

function ivGoToPos(cellId) {
  const m = cellId.match(/R(\d+)-N(\d+)-P(\d+)/);
  if (!m) return;
  ivCurrentRua = m[1]; ivCurrentNivel = 'all';
  // update toggles
  document.querySelectorAll('#tg-rua .iv-tg').forEach((b,i) => {
    if ((i+1).toString() === m[1]) { b.style.background='var(--surface3)'; b.style.border='1px solid var(--border)'; b.style.color='var(--text-primary)'; }
    else { b.style.background='transparent'; b.style.border='none'; b.style.color='var(--text-muted)'; }
  });
  document.querySelectorAll('#tg-nivel .iv-tg').forEach((b,i) => {
    if (i===0) { b.style.background='var(--surface3)'; b.style.border='1px solid var(--border)'; b.style.color='var(--text-primary)'; }
    else { b.style.background='transparent'; b.style.border='none'; b.style.color='var(--text-muted)'; }
  });
  ivMatrixData = ivGetRuaData(ivCurrentRua);
  ivBuildMetrics(ivMatrixData);
  ivBuildHeatmap(ivMatrixData);
  ivSwitchTab('mapa');
  showToast(`Navegando para ${cellId}`);
}

function ivClearLocator() {
  document.getElementById('prod-locator-empty').style.display = 'flex';
  document.getElementById('prod-locator-result').style.display = 'none';
  document.querySelectorAll('#prod-list .active-prod').forEach(el => {
    el.classList.remove('active-prod'); el.style.background='transparent'; el.style.border='1px solid transparent';
  });
}

// Init
function ivInit() {
  ivMatrixData = ivGetRuaData('1');
  ivBuildMetrics(ivMatrixData);
  ivBuildHeatmap(ivMatrixData);
}


var currentPage = 'dashboard';
var currentDrawerCargoId = null;
var drawerRestoreFocus = null;

function navTo(pageId, sidebarEl, tbId, updateUrl=true) {
  if (!Object.prototype.hasOwnProperty.call(pageTitles, pageId)) pageId = 'dashboard';
  // pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (!page) return;
  page.classList.add('active');

  // sidebar items
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  if (sidebarEl) sidebarEl.classList.add('active');
  else {
    document.querySelectorAll('.nav-item[data-page="'+pageId+'"]').forEach(i => i.classList.add('active'));
  }

  // tab bar
  document.querySelectorAll('.tb-item').forEach(t => t.classList.remove('active'));
  const tbEl = tbId ? document.getElementById(tbId) : document.getElementById('tb-' + pageId);
  if (tbEl) tbEl.classList.add('active');

  // header
  const info = pageTitles[pageId] || ['F.A.S.T', ''];
  document.getElementById('header-title').textContent = info[0];
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {dateStyle:'long', timeZone:FAST_CORE.OPERATION_TIME_ZONE}).format(new Date());
  document.getElementById('header-sub').textContent = `${info[1]} · ${dateLabel}`;

  const changedPage = currentPage !== pageId;
  currentPage = pageId;
  if (updateUrl && changedPage && window.location.hash !== `#${pageId}`) {
    window.history.pushState({page:pageId}, '', `#${pageId}`);
  }

  // re-renderiza dados ao entrar na página
  if (pageId === 'estoque') { renderEstoqueMetrics(); renderStockFull(document.getElementById('estoque-search')?.value||''); }
  if (pageId === 'rastreio') { renderLotTraceability(document.getElementById('lot-search')?.value || ''); }
  if (pageId === 'dashboard') { renderDashMetrics(); renderDashboardOverview(); renderCriticalStock(); renderDashboardTracking(); renderDashboardAlerts(); }
  if (pageId === 'fornecedores') { renderSuppliers(); }
  if (pageId === 'perdas') { renderLosses(); }
  if (pageId === 'auditoria') { renderAudit(document.getElementById('audit-search')?.value || ''); }

  // init heatmap on first visit
  if (pageId === 'heatmap') {
    setTimeout(() => { ivBuildMetrics(ivMatrixData); ivBuildHeatmap(ivMatrixData); }, 10);
  }

  // close sidebar on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('mobile-open');
  }
}

function navToStr(pageId) {
  navTo(pageId);
}

// ── SIDEBAR MOBILE ──
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
}

// ── DRAWER ──
function openDrawer(id) {
  const c = cargos.find(x => x.id === id);
  if (!c) return;
  currentDrawerCargoId = id;
  drawerRestoreFocus = document.activeElement;
  const overlay = document.getElementById('drawer-overlay');
  const drawer  = document.getElementById('drawer');
  overlay.classList.add('open');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => overlay.classList.add('visible'));

  // reset tabs
  document.querySelectorAll('.dtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.dtab-content').forEach(ct => ct.classList.remove('active'));
  document.querySelectorAll('.dtab')[0].classList.add('active');
  document.querySelectorAll('.dtab').forEach((tab, index) => tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false'));
  document.getElementById('dtab-timeline').classList.add('active');

  // header
  document.getElementById('d-id').textContent    = 'ORDEM/LOTE · #' + c.id;
  document.getElementById('d-title').textContent  = c.title;
  const drawerBadge = getCargoStatusMeta(c).badgeCls;
  document.getElementById('d-badges').innerHTML = `<span class="status-text ${drawerBadge}">${escapeHtml(c.statusLabel)}</span>`;

  // ── TAB: TIMELINE ──
  const tlIcons = {
    done:   `<svg viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    alert:  `<svg viewBox="0 0 10 10"><path d="M5 2v3.5M5 7.5v.5" stroke-linecap="round"/></svg>`,
    active: `<svg viewBox="0 0 10 10"><path d="M1 5h8M6 2l3 3-3 3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    pending:`<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>`,
  };
  document.getElementById('d-timeline-content').innerHTML = `
    <div class="dsection">
      <div class="dsection-label">Fluxo operacional</div>
      <div class="route-visual">
        <div class="rv-city"><div class="rv-name">${escapeHtml(c.origin)}</div><div class="rv-sub">Etapa inicial</div></div>
        <div class="rv-mid"><div class="rv-line"></div></div>
        <div class="rv-city" style="text-align:right"><div class="rv-name">${escapeHtml(c.dest)}</div><div class="rv-sub">Próxima etapa</div></div>
      </div>
    </div>
    <div class="dsection">
      <div class="dsection-label">Histórico de eventos</div>
      <div class="tl-full">
        ${(c.timeline||[]).map(t => {
          const state = Object.prototype.hasOwnProperty.call(tlIcons, t.cls) ? t.cls : 'pending';
          return `<div class="tl-item ${state}">
            <div class="tl-ico">${tlIcons[state]}</div>
            <div class="tl-event">${escapeHtml(t.ev)}</div>
            <div class="tl-detail">${escapeHtml(t.detail)}</div>
            <div class="tl-time">${escapeHtml(t.time)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  // ── TAB: ITENS ──
  document.getElementById('d-items-content').innerHTML = `
    <div class="dsection">
      <div class="dsection-label">${escapeHtml(c.volumes)} volume(s) · ${escapeHtml(c.peso)} kg total</div>
      <div class="items-list">
        ${(c.itens||[]).map(it => `
          <div class="item-row">
            <div class="item-ico"><svg viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="1"/><path d="M2 5h10"/></svg></div>
            <div><div class="item-name">${escapeHtml(it.name)}</div><div class="item-sku">${escapeHtml(it.sku)}</div></div>
            <div class="item-qty">× ${escapeHtml(it.qty)}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="dsection">
      <div class="dsection-label">Rendimento / Custos</div>
      <div class="meta-grid">
        <div class="meta-item"><div class="meta-key">Qtd. recebida</div><div class="meta-val mono">${escapeHtml(c.volumes)} un/lote</div></div>
        <div class="meta-item"><div class="meta-key">Peso/volume</div><div class="meta-val mono">${escapeHtml(c.peso)} kg</div></div>
        <div class="meta-item"><div class="meta-key">NF-e</div><div class="meta-val mono">${escapeHtml(c.nfe)}</div></div>
        <div class="meta-item"><div class="meta-key">Seguro</div><div class="meta-val mono">${escapeHtml(c.seguro)}</div></div>
      </div>
    </div>`;

  // ── TAB: INFO ──
  const dest = c.destinatario||{};
  const rem  = c.remetente||{};
  document.getElementById('d-info-content').innerHTML = `
    <div class="dsection">
      <div class="dsection-label">Unidade produtiva</div>
      <div class="meta-grid">
        <div class="meta-item" style="grid-column:1/-1"><div class="meta-key">Empresa</div><div class="meta-val">${escapeHtml(rem.empresa||'—')}</div></div>
        <div class="meta-item"><div class="meta-key">CNPJ</div><div class="meta-val mono" style="font-size:11px">${escapeHtml(rem.cnpj||'—')}</div></div>
        <div class="meta-item"><div class="meta-key">Contato</div><div class="meta-val mono">${escapeHtml(rem.tel||'—')}</div></div>
      </div>
    </div>
    <div class="dsection">
      <div class="dsection-label">Destino / consumo</div>
      <div class="meta-grid">
        <div class="meta-item" style="grid-column:1/-1"><div class="meta-key">Nome</div><div class="meta-val">${escapeHtml(dest.nome||'—')}</div></div>
        <div class="meta-item" style="grid-column:1/-1"><div class="meta-key">Endereço</div><div class="meta-val">${escapeHtml(dest.endereco||'—')}</div></div>
        <div class="meta-item"><div class="meta-key">CNPJ</div><div class="meta-val mono" style="font-size:11px">${escapeHtml(dest.cnpj||'—')}</div></div>
        <div class="meta-item"><div class="meta-key">Contato</div><div class="meta-val mono">${escapeHtml(dest.tel||'—')}</div></div>
      </div>
    </div>
    <div class="dsection">
      <div class="dsection-label">Fiscal</div>
      <div class="meta-grid">
        <div class="meta-item"><div class="meta-key">NF-e</div><div class="meta-val mono">${escapeHtml(c.nfe)}</div></div>
        <div class="meta-item"><div class="meta-key">Responsável</div><div class="meta-val mono">${escapeHtml(c.carrier)}</div></div>
      </div>
    </div>`;

  // ── TAB: CARRIER ──
  const ocEl = c.ocorrencia
    ? `<div class="dsection">
        <div class="dsection-label">Ocorrência ativa</div>
        <div style="background:var(--danger-bg);border:1px solid rgba(248,113,113,.25);border-radius:var(--r);padding:12px 14px">
          <div style="font-size:11px;color:var(--danger);font-weight:500;margin-bottom:4px">Atenção operacional</div>
          <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(typeof c.ocorrencia === 'string' ? c.ocorrencia : (c.ocorrencia.desc || 'Verificar ocorrência'))}</div>
          <div style="font-size:10px;font-family:var(--mono);color:var(--text-muted);margin-top:6px">${escapeHtml(typeof c.ocorrencia === 'string' ? 'agora' : (c.ocorrencia.data || 'agora'))}</div>
        </div>
      </div>` : '';
  document.getElementById('d-carrier-content').innerHTML = `
    <div class="dsection">
      <div class="dsection-label">Responsável</div>
      <div class="carrier-card">
        <div class="carrier-top">
          <div class="carrier-logo"><svg viewBox="0 0 16 16"><path d="M1 8h10M1 5h10M9 3l4 5-4 5"/></svg></div>
          <div><div class="carrier-name">${escapeHtml(c.carrier)}</div><div class="carrier-svc">${escapeHtml(c.modalidade||'')}</div></div>
        </div>
        <div class="carrier-fields">
          <div><div class="cf-key">Código do lote/OP</div><div class="cf-val">${escapeHtml(c.rastreio||'—')}</div></div>
          <div><div class="cf-key">Prazo original</div><div class="cf-val">${escapeHtml(c.prazo||c.eta)}</div></div>
          ${c.prazoRev?`<div><div class="cf-key">Prazo revisado</div><div class="cf-val" style="color:var(--warning)">${escapeHtml(c.prazoRev)}</div></div>`:''}
          <div><div class="cf-key">Movimento</div><div class="cf-val">${escapeHtml(c.frete||'—')}</div></div>
          <div><div class="cf-key">Custo estimado</div><div class="cf-val">${escapeHtml(c.seguro||'—')}</div></div>
        </div>
      </div>
    </div>
    ${ocEl}`;
}

function exportCurrentNfe() {
  const c = cargos.find(x => x.id === currentDrawerCargoId) || cargos[0];
  if (!c) { showToast('Nenhuma NF-e/OP selecionada para exportar'); return; }
  const items = (c.itens && c.itens.length ? c.itens : ['Sem itens detalhados']).map(item => {
    if (typeof item === 'string') return `<li>${escapeHtml(item)}</li>`;
    return `<li>${escapeHtml(item.name || 'Item')} · <span class="mono">${escapeHtml(item.sku || 'sem SKU')}</span> · qtd. ${escapeHtml(item.qty || 1)}</li>`;
  }).join('');
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(c.nfe || c.id)} · F.A.S.T</title>
  <style>
    body{font-family:Arial,sans-serif;color:#1B4965;margin:32px;line-height:1.45}h1{margin:0 0 4px}small{color:#456879}.card{border:1px solid #C8E4EF;border-radius:12px;padding:16px;margin:16px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mono{font-family:monospace;color:#14384F}ul{margin-top:8px}
  </style>
</head>
<body>
  <h1>Espelho de NF-e / Ordem de Produção</h1>
  <small>Exportado pelo F.A.S.T em ${new Date().toLocaleString('pt-BR')}</small>
  <div class="card grid">
    <div><strong>ID</strong><br><span class="mono">${escapeHtml(c.id)}</span></div>
    <div><strong>NF-e</strong><br><span class="mono">${escapeHtml(c.nfe || '—')}</span></div>
    <div><strong>Status</strong><br>${escapeHtml(c.statusLabel || c.status)}</div>
    <div><strong>Previsão</strong><br>${escapeHtml(c.eta || c.prazo || '—')}</div>
  </div>
  <div class="card grid">
    <div><strong>Origem</strong><br>${escapeHtml(c.origin || '—')}<br>${escapeHtml(c.remetente?.empresa || '')}<br>${escapeHtml(c.remetente?.cnpj || '')}</div>
    <div><strong>Destino</strong><br>${escapeHtml(c.dest || '—')}<br>${escapeHtml(c.destinatario?.nome || '')}<br>${escapeHtml(c.destinatario?.cnpj || '')}</div>
  </div>
  <div class="card"><strong>Itens</strong><ul>${items}</ul></div>
  <div class="card"><strong>Responsável</strong><br>${escapeHtml(c.carrier || '—')} · ${escapeHtml(c.modalidade || '—')}</div>
</body>
</html>`;
  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(c.nfe || c.id).replace(/[^a-z0-9_-]+/gi,'-')}-fast.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`✅ NF-e/OP ${c.nfe || c.id} exportada`);
}

function closeDrawer() {
  const overlay = document.getElementById('drawer-overlay');
  const drawer = document.getElementById('drawer');
  overlay.classList.remove('visible');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    overlay.classList.remove('open');
    if (drawerRestoreFocus?.isConnected) drawerRestoreFocus.focus();
    drawerRestoreFocus = null;
  }, 300);
}

function switchDTab(id, el) {
  document.querySelectorAll('.dtab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
  document.querySelectorAll('.dtab-content').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  el.setAttribute('aria-selected', 'true');
  document.getElementById('dtab-' + id).classList.add('active');
}

// ── QR MODAL ──
var fromScan = true;
var entryDraftItems = [
  {id:'FAR-25KG', name:'Farinha de Trigo 25kg', qty:2, lote:'LT-FAR-ENTRADA-A', validade:addDaysIso(30), unit:'sacos', price:92.50, cat:'Matéria-prima'},
  {id:'FER-BIO-500', name:'Fermento biológico fresco 500g', qty:2, lote:'LT-FER-ENTRADA-C', validade:addDaysIso(5), unit:'un', price:11.90, cat:'Matéria-prima'},
  {id:'EMB-PF-1000', name:'Embalagem pão francês 1000un', qty:1, lote:'LT-EMB-ENTRADA-A', validade:addDaysIso(180), unit:'fardos', price:42.00, cat:'Embalagem'}
];

function renderEntryItems() {
  const el = document.getElementById('entry-items-list');
  if (!el) return;
  el.innerHTML = entryDraftItems.map((it, idx) => `
    <div class="added-item">
      <div class="ai-dot"></div>
      <div class="ai-label">${escapeHtml(it.name)} · ${escapeHtml(it.id)} · ${escapeHtml(it.lote || 'sem lote')}${it.validade ? ' · validade ' + escapeHtml(it.validade.split('-').reverse().join('/')) : ''}</div>
      <div class="ai-qty">× ${escapeHtml(it.qty)}</div>
      <button type="button" onclick="removeEntryItem(${idx})" style="border:none;background:transparent;color:var(--danger);cursor:pointer;font-size:16px;line-height:1">×</button>
    </div>`).join('') || '<div style="padding:10px 0;font-size:12px;color:var(--text-muted)">Nenhum item adicionado ainda.</div>';
}

function removeEntryItem(idx) {
  entryDraftItems.splice(idx, 1);
  renderEntryItems();
}

function addEntryItemManual() {
  openFlowModal({
    title:'Adicionar item manualmente',
    subtitle:'Inclua insumo, lote e validade na entrada antes de confirmar.',
    submitLabel:'Adicionar item',
    fields:[
      {name:'sku', label:'SKU', value:'FAR-25KG', required:true},
      {name:'name', label:'Nome do item', value:'Farinha de Trigo 25kg', required:true},
      {name:'qty', label:'Quantidade recebida', type:'number', value:1, min:0, step:1, required:true},
      {name:'unit', label:'Unidade', value:'un'},
      {name:'lote', label:'Lote', value:'LT-' + Date.now().toString().slice(-6)},
      {name:'validade', label:'Validade', type:'date', value:addDaysIso(30)},
      {name:'cat', label:'Categoria', value:'Insumo'},
      {name:'price', label:'Preço unitário', type:'number', value:0, min:0, step:'0.01'}
    ],
    onSubmit(values) {
      const skuResult = FAST_CORE.validateSku(values.sku);
      const sku = skuResult.value;
      const existing = db.products.find(p => p.id === sku);
      const qty = Number(values.qty);
      if (!skuResult.ok) { showToast(`⚠️ ${skuResult.error}`); return false; }
      if (!values.name?.trim()) { showToast('⚠️ Informe o nome do item'); return false; }
      if (!qty || qty <= 0) { showToast('⚠️ Quantidade inválida'); return false; }
      entryDraftItems.push({
        id:sku,
        name:values.name.trim(),
        qty,
        lote:values.lote || existing?.lote || '',
        validade:values.validade || existing?.validade || '',
        unit:values.unit || existing?.unit || 'un',
        price:Number(values.price) || existing?.price || 0,
        cat:values.cat || existing?.cat || 'Insumo'
      });
      renderEntryItems();
      showToast(`✓ Item ${sku} adicionado à entrada`);
    }
  });
}

const MAX_IMPORT_BYTES = 512 * 1024;
const MAX_IMPORT_ROWS = 250;

function sanitizeImportValue(value, max=160) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
}

function openImportFile() {
  if (!requireRemoteSession('importar arquivo de entrada')) return;
  const input = document.getElementById('entry-import-file');
  if (input) input.click();
}

function parseCsvRows(text) {
  return FAST_CORE.parseCsvRows(text, MAX_IMPORT_ROWS);
}

function parseNfeXml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) return [];
  return [...doc.querySelectorAll('det')].slice(0, MAX_IMPORT_ROWS).map((det, idx) => {
    const get = tag => det.querySelector(tag)?.textContent?.trim() || '';
    const name = get('xProd') || `Item NF-e ${idx + 1}`;
    const sku = FAST_CORE.validateSku(get('cProd') || `NFE-${idx + 1}`);
    if (!sku.ok) return null;
    return {
      id:sku.value,
      name:sanitizeImportValue(name),
      qty:Math.max(0, Number((get('qCom') || '1').replace(',','.')) || 1),
      lote:sanitizeImportValue(get('nLote') || ('NFE-' + Date.now().toString().slice(-6)), 80),
      validade:sanitizeImportValue(get('dVal') || '', 20),
      unit:sanitizeImportValue(get('uCom') || 'un', 24),
      price:Math.max(0, Number((get('vUnCom') || get('vProd') || '0').replace(',','.')) || 0),
      cat:'Importado NF-e'
    };
  }).filter(Boolean);
}

async function handleEntryImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) { showToast('⚠️ Arquivo muito grande para importação segura'); event.target.value = ''; return; }
  if (!/\.(csv|xml)$/i.test(file.name)) { showToast('⚠️ Formato permitido: CSV ou XML'); event.target.value = ''; return; }
  const text = await file.text();
  const imported = file.name.toLowerCase().endsWith('.xml') ? parseNfeXml(text) : parseCsvRows(text);
  if (!imported.length) { showToast('⚠️ Nenhum item válido encontrado no arquivo'); return; }
  entryDraftItems = imported;
  fromScan = false;
  msGo('ms4', false);
  renderEntryItems();
  event.target.value = '';
  window.FAST_API?.logSecurityEvent?.({event_type:'import_file', resource_type:'entry_import', result:'success', reason:'Importação CSV/XML de entrada', payload:{file:file.name, rows:imported.length}})
    .catch(error => console.warn('Evento de importação não auditado remotamente', error));
  showToast(`✅ ${imported.length} item(ns) importado(s)`);
}

function openQR() {
  if (!requireRemoteSession('registrar entrada')) return;
  fromScan = true;
  renderEntryItems();
  msGoTo('ms1');
  const overlay = document.getElementById('modal-overlay');
  const today = FAST_CORE.isoDateInTimeZone();
  const entryId = document.getElementById('fi-id');
  if (entryId && !entryId.value) entryId.value = `LT-${today.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
  const issueDate = document.getElementById('fi-date');
  if (issueDate) issueDate.value = today;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function closeQR() {
  stopCameraScanner();
  const overlay = document.getElementById('modal-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('visible');
  setTimeout(() => overlay.classList.remove('open'), 250);
}

function handleModalClick(e) {
  if (e.target === document.getElementById('modal-overlay')) closeQR();
}

var qrStream = null;
var qrScanTimer = null;
var qrDetector = null;
var qrDetectorReady = false;

async function startCameraScanner() {
  const video = document.getElementById('qr-video');
  const area = document.getElementById('camera-area');
  const err = document.getElementById('camera-error');
  if (!video || !area || qrStream) return;
  area.classList.remove('camera-fallback');
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    area.classList.add('camera-fallback');
    if (err) err.textContent = 'Este navegador não liberou acesso à câmera. Use a leitura simulada/manual.';
    showToast('Câmera indisponível neste navegador');
    return;
  }
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}, audio:false});
    video.srcObject = qrStream;
    area.classList.add('camera-live');
    await video.play();
    showToast('📷 Câmera iniciada');
    scanVideoFrame();
  } catch (error) {
    qrStream = null;
    area.classList.add('camera-fallback');
    if (err) err.textContent = 'Permissão de câmera negada ou dispositivo indisponível. Use a leitura simulada/manual.';
    showToast('Não foi possível acessar a câmera');
  }
}

function stopCameraScanner() {
  clearTimeout(qrScanTimer);
  qrScanTimer = null;
  const video = document.getElementById('qr-video');
  const area = document.getElementById('camera-area');
  if (qrStream) {
    qrStream.getTracks().forEach(track => track.stop());
    qrStream = null;
  }
  if (video) video.srcObject = null;
  if (area) area.classList.remove('camera-live', 'camera-fallback');
}

async function scanVideoFrame() {
  if (!qrStream) return;
  const video = document.getElementById('qr-video');
  try {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      if (!qrDetectorReady) {
        const supported = await window.BarcodeDetector.getSupportedFormats?.() || [];
        const formats = supported.length ? supported.filter(f => ['qr_code','code_128','ean_13','ean_8'].includes(f)) : ['qr_code','code_128','ean_13','ean_8'];
        qrDetector = new window.BarcodeDetector({formats: formats.length ? formats : ['qr_code']});
        qrDetectorReady = true;
      }
      const codes = await qrDetector.detect(video);
      if (codes.length && codes[0].rawValue) {
        const code = codes[0].rawValue.trim();
        stopCameraScanner();
        processScannedCode(code);
        msGoLoading();
        return;
      }
    }
  } catch (error) {
    // Mantém o preview funcionando mesmo quando o navegador não suporta detecção nativa.
  }
  qrScanTimer = setTimeout(scanVideoFrame, 650);
}

function msGoTo(id) {
  if (id !== 'ms2') stopCameraScanner();
  document.querySelectorAll('.mstep').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'ms2') startCameraScanner();
}

function msGo(id, scan) {
  if (scan !== undefined) fromScan = scan;
  if (id === 'ms4') {
    const banner = document.getElementById('af-banner');
    const inputs = document.querySelectorAll('#ms4 .af');
    renderEntryItems();
    if (fromScan) {
      banner.style.display = 'flex';
      inputs.forEach(i => i.classList.add('af'));
      document.getElementById('form-modal-title').textContent = 'Nova entrada de insumo';
      document.getElementById('form-modal-sub').textContent = 'Confirme ou edite os dados preenchidos';
    } else {
      banner.style.display = 'none';
      inputs.forEach(i => { i.classList.remove('af'); i.value = ''; });
      document.getElementById('form-modal-title').textContent = 'Entrada manual de insumo';
      document.getElementById('form-modal-sub').textContent = 'Preencha lote, validade e fornecedor';
    }
  }
  if (id === 'ms5') {
    // Salva a nova entrada/lote
    const referenceResult = FAST_CORE.validateSku(document.getElementById('fi-id')?.value || ('LT-' + (4900 + cargos.length)));
    if (!referenceResult.ok) { showToast(`⚠️ ${referenceResult.error}`); return; }
    const pedNum = referenceResult.value;
    const empresa = FAST_CORE.sanitizeText(document.getElementById('fi-emp')?.value || 'Fornecedor');
    const tipo = FAST_CORE.sanitizeText(document.getElementById('fi-type')?.value || 'Compra de fornecedor');
    const nowLabel = new Date().toLocaleString('pt-BR');
    const invalidItem = entryDraftItems.find(item => !FAST_CORE.validateSku(item.id).ok || !(Number(item.qty) > 0));
    if (invalidItem) {
      showToast('⚠️ Corrija os códigos e quantidades antes de confirmar a entrada.');
      return;
    }
    entryDraftItems.forEach(item => {
      item.id = FAST_CORE.validateSku(item.id).value;
      const existing = db.products.find(p => p.id === item.id);
      let target = existing;
      if (target) {
        if (item.price) target.price = item.price;
      } else {
        target = {
          id:item.id, name:item.name, cat:item.cat || 'Insumo', type:'Insumo',
          qty:0, min:5, unit:item.unit || 'un', price:item.price || 0,
          lote:item.lote || 'sem lote', validade:item.validade || '', fornecedor:empresa,
          location:'A definir', dailyUse:0
        };
        db.products.push(target);
      }
      addInventoryLot(target, item, empresa, target.location);
      appendAuditMovement(target, 'entrada_lote', Number(item.qty || 0), `${tipo} · ${empresa}`, {ref:pedNum, lote:item.lote || 'sem lote', date:nowLabel});
      updateProductLotMetadata(target);
    });
    const newCargo = {
      id: pedNum,
      title: tipo + ' — ' + empresa,
      status: 'pending', statusLabel: 'Aguardando',
      origin: document.getElementById('fi-uf')?.value || 'SP',
      dest: 'Estoque FEFO',
      carrier: FAST_CORE.sanitizeText(document.getElementById('fi-responsible')?.value || 'Equipe Estoque'),
      eta: 'em breve',
      steps: [0, 3],
      badges: ['b-pending'],
      remetente: {empresa: empresa, cnpj: document.getElementById('fi-cnpj')?.value || '—', tel: '—'},
      destinatario: {nome: 'Estoque FEFO', endereco: 'Área de armazenagem', cnpj: '—', tel: '—'},
      nfe: document.getElementById('fi-nfe')?.value || '—',
      peso: '—', volumes: entryDraftItems.reduce((s,i)=>s+Number(i.qty||0),0) || 1, seguro: '—', frete: '—',
      rastreio: '—', modalidade: '—', prazo: 'em breve', prazoRev: null, ocorrencia: null,
      itens: entryDraftItems.map(i => ({name:i.name, sku:i.id, qty:i.qty})), timeline: [{cls:'done',ev:'Lote registrado',detail:'Via F.A.S.T FEFO',time:'agora'}],
    };
    cargos.unshift(newCargo);
    document.getElementById('success-id-val').textContent = '#' + pedNum;
    renderAll();
  }
  msGoTo(id);
}

function msGoLoading() {
  msGoTo('ms3');
  const fill = document.getElementById('prog-fill');
  const steps = ['ls1','ls2','ls3'];
  steps.forEach(id => { const el=document.getElementById(id); el.classList.remove('done'); el.style.opacity='0.3'; });
  requestAnimationFrame(() => { fill.style.width = '100%'; });
  steps.forEach((id, i) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      el.classList.add('done');
      el.style.opacity = '1';
    }, 500 + i * 500);
  });
  setTimeout(() => msGo('ms4', true), 2300);
}

// ── TOAST ──
var toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── SIDEBAR CLICK OUTSIDE (MOBILE) ──
document.addEventListener('click', function(e) {
  if (window.innerWidth > 768) return;
  const sb = document.getElementById('sidebar');
  if (sb.classList.contains('mobile-open') && !sb.contains(e.target) && !e.target.closest('.hamburger')) {
    sb.classList.remove('mobile-open');
  }
});

// ── SCAN SESSION STATE ──
var scanCounts = {}; // { skuId: count }

function processScannedCode(code) {
  const sku = FAST_CORE.validateSku(code);
  if (!sku.ok) {
    showToast(`⚠️ ${sku.error}`);
    return;
  }
  code = sku.value;
  const exactMatch = IV_CATALOG.find(p => p.id.toLowerCase() === code.toLowerCase());
  if (exactMatch) {
    if (!scanCounts[exactMatch.id]) scanCounts[exactMatch.id] = 0;
    scanCounts[exactMatch.id]++;
    openScanCounterPanel(exactMatch, scanCounts[exactMatch.id]);
    showToast(`📦 +1 · ${exactMatch.name} (total: ${scanCounts[exactMatch.id]})`);
  } else {
    openNewProductModal(code);
    showToast(`🔍 Produto não encontrado — cadastre agora`);
  }
}

// ── LEITOR DE CÓDIGO DE BARRAS (BIPADOR) ──
// Leitores de código de barras emitem os caracteres do código em sequência muito
// rápida e encerram com Enter. O buffer de 50 ms captura essa rajada sem
// interferir na digitação humana normal (que é mais lenta).
(function() {
  let barcodeBuffer = '';
  let barcodeTimer  = null;
  const BUFFER_MS   = 50;   // janela de captura (ms)
  const MIN_LENGTH  = 3;    // tamanho mínimo para considerar um scan válido

  // Teclas que não fazem parte do código mas podem aparecer durante a leitura
  const IGNORE_KEYS = new Set(['Shift','Control','Alt','Meta','CapsLock','Tab']);

  document.addEventListener('keydown', function(e) {
    // Se o foco está num input/textarea deixa o campo receber normalmente,
    // mas ainda monitora Enter para detectar fim de scan nesse campo.
    const focused = document.activeElement;
    const isTypingField = focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA');

    // Ignora atalhos/modificadores para não conflitar com Cmd/Ctrl+K e navegação por teclado
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || IGNORE_KEYS.has(e.key)) return;

    // Enter — fim de código de barras
    if (e.key === 'Enter') {
      if (barcodeBuffer.length >= MIN_LENGTH) {
        e.preventDefault();          // evita submit de formulários
        handleBarcodeScan(barcodeBuffer.trim());
      }
      barcodeBuffer = '';
      clearTimeout(barcodeTimer);
      return;
    }

    // Caractere imprimível (1 char) — acumula no buffer
    if (e.key.length === 1) {
      // Se o foco está em campo de texto não bloqueia a digitação;
      // apenas rastreia o buffer em paralelo.
      barcodeBuffer += e.key;

      // Reinicia o timer a cada tecla: se ficar 50 ms sem nova tecla,
      // o buffer é descartado (digitação humana) sem chamar o handler.
      clearTimeout(barcodeTimer);
      barcodeTimer = setTimeout(() => {
        barcodeBuffer = '';
      }, BUFFER_MS);
    }
  });

  function handleBarcodeScan(code) {
    processScannedCode(code);
  }
})();

// ── PAINEL CONTADOR DE BIPAGEM ──
function openScanCounterPanel(prod, count) {
  // Cria ou atualiza o painel flutuante de contagem
  let panel = document.getElementById('scan-counter-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'scan-counter-panel';
    panel.style.cssText = `
      position:fixed;bottom:80px;right:28px;width:320px;
      background:var(--surface);border:1px solid var(--border2);
      border-radius:10px;z-index:500;overflow:hidden;
      box-shadow:0 8px 32px rgba(0,0,0,.6);
      animation:slideUp .25s cubic-bezier(.34,1.56,.64,1);
    `;
    document.body.appendChild(panel);
  }

  // Monta lista de todos os produtos bipados nesta sessão
  const allScans = Object.entries(scanCounts)
    .sort(([,a],[,b]) => b - a)
    .map(([skuId, cnt]) => {
      const p = IV_CATALOG.find(x => x.id === skuId);
      const name = p ? p.name : skuId;
      const isActive = skuId === prod.id;
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:8px 14px;border-bottom:1px solid var(--border);
          background:${isActive ? 'var(--accent-dim)' : 'transparent'}">
          <div>
            <div style="font-size:12px;color:${isActive ? '#1B4965' : 'var(--text-primary)'};font-weight:${isActive ? '500' : '400'}">${escapeHtml(name)}</div>
            <div style="font-size:10px;font-family:var(--mono);color:var(--text-muted);margin-top:1px">${escapeHtml(skuId)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="font-size:20px;font-family:var(--mono);font-weight:600;
              color:${isActive ? '#1B4965' : 'var(--text-primary)'}">×${cnt}</div>
          </div>
        </div>`;
    }).join('');

  panel.innerHTML = `
    <div style="padding:10px 14px 8px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--success);animation:pulse 1.5s infinite"></div>
        <span style="font-size:11px;font-weight:500;color:var(--text-primary);letter-spacing:.3px">LEITURA ATIVA</span>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="resetScanSession()" style="background:var(--surface2);border:1px solid var(--border);border-radius:5px;
          padding:3px 8px;font-size:10px;color:var(--text-muted);cursor:pointer;font-family:var(--font)">Zerar</button>
        <button onclick="closeScanCounterPanel()" style="background:transparent;border:1px solid var(--border);border-radius:5px;
          width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted)">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l8 8M9 1L1 9"/></svg>
        </button>
      </div>
    </div>
    <div style="max-height:260px;overflow-y:auto">${allScans}</div>
    <div style="padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:8px">
      <button onclick="exportScanSession()" style="flex:1;background:var(--text-primary);color:var(--bg);border:none;
        border-radius:var(--r);padding:8px;font-family:var(--font);font-size:12px;font-weight:500;cursor:pointer">
        Confirmar lote (${Object.values(scanCounts).reduce((a,b)=>a+b,0)} unid.)
      </button>
    </div>
  `;
}

function closeScanCounterPanel() {
  const p = document.getElementById('scan-counter-panel');
  if (p) { p.style.animation = 'slideDown .2s ease forwards'; setTimeout(() => p.remove(), 200); }
}

function resetScanSession() {
  Object.keys(scanCounts).forEach(k => delete scanCounts[k]);
  closeScanCounterPanel();
  showToast('Contagem zerada');
}

function exportScanSession() {
  const total = Object.values(scanCounts).reduce((a,b)=>a+b,0);
  if (!total) { showToast('Nenhuma leitura para confirmar.'); return; }
  const nowLabel = new Date().toLocaleString('pt-BR');
  const lotCode = `SCAN-${FAST_CORE.isoDateInTimeZone().replace(/-/g, '')}`;
  // Atualiza estoque real e mapa do armazém
  Object.entries(scanCounts).forEach(([skuId, qty]) => {
    const p = db.products.find(x => x.id === skuId);
    if (p) {
      const position = Object.entries(positionProducts).find(([, product]) => product.id === skuId)?.[0] || p.location || '';
      addInventoryLot(p, {lote:lotCode, qty, unit:p.unit || 'un'}, 'Leitura operacional', position);
      appendAuditMovement(p, 'entrada_scan', qty, 'Contagem confirmada pelo painel de leitura', {ref:'Bipador', date:nowLabel, lote:lotCode});
      updateProductLotMetadata(p);
    } else {
      const cat = IV_CATALOG.find(x => x.id === skuId);
      if (cat) {
        const created = FAST_CORE.prepareNewScannedProduct({id:skuId, name:cat.name, cat:cat.cat});
        db.products.push(created);
        addInventoryLot(created, {lote:lotCode, qty, unit:created.unit || 'un'}, 'Leitura operacional');
        appendAuditMovement(created, 'entrada_scan', qty, 'SKU criado via leitura', {ref:'Bipador', date:nowLabel, lote:lotCode});
        updateProductLotMetadata(created);
      }
    }
    // Sincroniza quantidade na(s) posição(ões) mapeada(s) para este SKU
    Object.entries(positionProducts).forEach(([cellId, prod]) => {
      if (prod.id === skuId) {
        const dbProd = db.products.find(x => x.id === skuId);
        if (dbProd) ivSetCellQty(cellId, dbProd.qty);
      }
    });
  });
  renderAll();
  showToast(`✅ Lote de ${total} unidades confirmado! Estoque atualizado.`);
  resetScanSession();
}

// ── MODAL CADASTRO DE NOVO PRODUTO ──
function openNewProductModal(code) {
  const skuResult = FAST_CORE.validateSku(code);
  if (!skuResult.ok) { showToast(`⚠️ ${skuResult.error}`); return; }
  code = skuResult.value;
  let modal = document.getElementById('new-product-modal-overlay');
  if (modal) modal.remove();

  const overlay = document.createElement('div');
  overlay.id = 'new-product-modal-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:600;
    display:flex;align-items:center;justify-content:center;
    animation:fadeIn .2s ease;
  `;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="new-product-title" onclick="event.stopPropagation()" style="
      background:var(--surface);border:1px solid var(--border2);
      border-radius:12px;width:420px;max-height:90vh;overflow:hidden;
      display:flex;flex-direction:column;
      animation:slideUp .3s cubic-bezier(.34,1.56,.64,1);
    ">
      <!-- Header -->
      <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
        <button type="button" aria-label="Fechar cadastro de produto" onclick="document.getElementById('new-product-modal-overlay').remove()"
          style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:transparent;
            cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l8 8M9 1L1 9"/></svg>
        </button>
        <div>
          <div id="new-product-title" style="font-size:14px;font-weight:500;color:var(--text-primary)">Novo produto bipado</div>
          <div style="font-size:11px;color:var(--text-muted)">Código não encontrado — preencha os dados</div>
        </div>
      </div>

      <!-- Banner de código lido -->
      <div style="margin:14px 18px 0;background:var(--accent-dim);border:1px solid rgba(98,182,203,.35);
        border-radius:var(--r);padding:10px 14px;display:flex;align-items:center;gap:10px">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#1B4965" stroke-width="1.8">
          <rect x="1" y="1" width="5" height="5" rx="1"/><rect x="10" y="1" width="5" height="5" rx="1"/>
          <rect x="1" y="10" width="5" height="5" rx="1"/><path d="M10 10h2v2h-2zM12 12h4M12 10h4M10 12v4"/>
        </svg>
        <div>
          <div style="font-size:10px;color:#9b93cc;margin-bottom:1px">Código lido pelo bipador</div>
          <div id="np-code-display" style="font-size:14px;font-family:var(--mono);font-weight:600;color:#1B4965;letter-spacing:.5px"></div>
        </div>
      </div>

      <!-- Formulário -->
      <div style="padding:14px 18px;display:flex;flex-direction:column;gap:12px;overflow-y:auto">
        <div style="display:flex;flex-direction:column;gap:4px">
          <label for="np-sku" style="font-size:11px;color:var(--text-muted)">SKU / Código</label>
          <input id="np-sku" name="sku" value="" autocomplete="off" style="background:var(--surface2);border:1px solid var(--border2);
            border-radius:var(--r);padding:8px 12px;color:var(--text-primary);font-family:var(--mono);
            font-size:13px;outline:none;letter-spacing:.3px">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label for="np-name" style="font-size:11px;color:var(--text-muted)">Nome do produto *</label>
          <input id="np-name" name="name" placeholder="Ex.: Farinha de Trigo 25 kg" autocomplete="off" autofocus style="background:var(--surface2);border:1px solid var(--border);
            border-radius:var(--r);padding:8px 12px;color:var(--text-primary);font-family:var(--font);
            font-size:13px;outline:none;transition:border-color .15s"
            onfocus="this.style.borderColor='var(--border2)'" onblur="this.style.borderColor='var(--border)'">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;color:var(--text-muted)">Categoria</label>
            <select id="np-cat" style="background:var(--surface2);border:1px solid var(--border);
              border-radius:var(--r);padding:8px 12px;color:var(--text-primary);font-family:var(--font);font-size:13px;outline:none">
              <option>Matéria-prima</option><option>Perecível</option><option>Embalagem</option>
              <option>Produto acabado</option><option>Confeitaria</option><option>Limpeza</option><option>Outros</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;color:var(--text-muted)">Qtd inicial</label>
            <input id="np-qty" type="number" value="1" min="1" style="background:var(--surface2);border:1px solid var(--border);
              border-radius:var(--r);padding:8px 12px;color:var(--text-primary);font-family:var(--mono);
              font-size:13px;outline:none;transition:border-color .15s"
              onfocus="this.style.borderColor='var(--border2)'" onblur="this.style.borderColor='var(--border)'">
          </div>
        </div>

        <!-- Posição no armazém -->
        <div style="display:flex;flex-direction:column;gap:6px">
          <label style="font-size:11px;color:var(--text-muted)">Posição no armazém</label>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div style="display:flex;flex-direction:column;gap:3px">
              <label style="font-size:10px;color:var(--text-muted)">Rua</label>
              <select id="np-rua" onchange="npUpdatePosition()" style="background:var(--surface2);border:1px solid var(--border);
                border-radius:var(--r);padding:7px 10px;color:var(--text-primary);font-family:var(--mono);font-size:13px;outline:none">
                <option value="">—</option>
                ${Array.from({length:5},(_,i)=>`<option value="${i+1}">R${i+1}</option>`).join('')}
              </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:3px">
              <label style="font-size:10px;color:var(--text-muted)">Nível</label>
              <select id="np-nivel" onchange="npUpdatePosition()" style="background:var(--surface2);border:1px solid var(--border);
                border-radius:var(--r);padding:7px 10px;color:var(--text-primary);font-family:var(--mono);font-size:13px;outline:none">
                <option value="">—</option>
                ${Array.from({length:5},(_,i)=>`<option value="${i+1}">N${i+1}</option>`).join('')}
              </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:3px">
              <label style="font-size:10px;color:var(--text-muted)">Prédio</label>
              <select id="np-predio" onchange="npUpdatePosition()" style="background:var(--surface2);border:1px solid var(--border);
                border-radius:var(--r);padding:7px 10px;color:var(--text-primary);font-family:var(--mono);font-size:13px;outline:none">
                <option value="">—</option>
                ${Array.from({length:20},(_,i)=>`<option value="${i+1}">P${i+1}</option>`).join('')}
              </select>
            </div>
          </div>
          <!-- Preview da posição selecionada -->
          <div id="np-pos-preview" style="display:none;background:var(--accent-dim);border:1px solid rgba(98,182,203,.35);
            border-radius:var(--r);padding:8px 12px;display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:8px">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#1B4965" stroke-width="1.8">
                <path d="M7 1v12M1 4h12M3 7h8" stroke-linecap="round"/>
              </svg>
              <span id="np-pos-label" style="font-size:13px;font-family:var(--mono);font-weight:600;color:#1B4965"></span>
            </div>
            <span style="font-size:10px;color:#9b93cc">posição selecionada</span>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px">
        <button onclick="document.getElementById('new-product-modal-overlay').remove()"
          style="background:transparent;border:1px solid var(--border);border-radius:var(--r);
            padding:9px 16px;color:var(--text-secondary);font-family:var(--font);font-size:13px;cursor:pointer">
          Cancelar
        </button>
        <button onclick="saveNewProductFromScan()" style="flex:1;background:var(--text-primary);color:var(--bg);border:none;
          border-radius:var(--r);padding:9px;font-family:var(--font);font-size:13px;font-weight:500;cursor:pointer">
          ✓ Cadastrar produto
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.getElementById('np-code-display').textContent = code;
  document.getElementById('np-sku').value = code;
  // Foca no campo nome após abrir
  setTimeout(() => { const el = document.getElementById('np-name'); if(el) el.focus(); }, 100);
}

function npUpdatePosition() {
  const rua    = (document.getElementById('np-rua')    || {}).value || '';
  const nivel  = (document.getElementById('np-nivel')  || {}).value || '';
  const predio = (document.getElementById('np-predio') || {}).value || '';
  const preview = document.getElementById('np-pos-preview');
  const label   = document.getElementById('np-pos-label');
  if (rua && nivel && predio) {
    const cellId = `R${rua}-N${nivel}-P${predio}`;
    if (label) label.textContent = cellId;
    if (preview) preview.style.display = 'flex';
  } else {
    if (preview) preview.style.display = 'none';
  }
}

function saveNewProductFromScan() {
  const skuInput = (document.getElementById('np-sku') || {}).value || '';
  const name   = (document.getElementById('np-name')   || {}).value || '';
  const cat    = (document.getElementById('np-cat')    || {}).value || 'Outros';
  const qty    = parseInt((document.getElementById('np-qty') || {}).value) || 1;
  const rua    = (document.getElementById('np-rua')    || {}).value || '';
  const nivel  = (document.getElementById('np-nivel')  || {}).value || '';
  const predio = (document.getElementById('np-predio') || {}).value || '';

  const skuResult = FAST_CORE.validateSku(skuInput);
  if (!skuResult.ok) {
    showToast(`⚠️ ${skuResult.error}`);
    document.getElementById('np-sku')?.focus();
    return;
  }
  const sku = skuResult.value;
  if (db.products.some(product => product.id === sku)) {
    showToast('⚠️ Este SKU já está cadastrado. Feche e faça uma nova leitura.');
    return;
  }
  if (!name.trim()) {
    const el = document.getElementById('np-name');
    if (el) { el.style.borderColor='var(--danger)'; el.focus(); }
    showToast('⚠️ Informe o nome do produto');
    return;
  }

  // O cadastro nasce zerado; a quantidade só entra no estoque após confirmação do lote.
  const newProd = FAST_CORE.prepareNewScannedProduct({id:sku, name, cat});
  db.products.push(newProd);
  IV_CATALOG.push({ id: sku, name:newProd.name, cat:newProd.cat });

  // Registra na contagem da sessão
  scanCounts[sku] = qty;

  // Atribui posição no armazém se informada
  let posMsg = '';
  if (rua && nivel && predio) {
    const cellId = `R${rua}-N${nivel}-P${predio}`;
    positionProducts[cellId] = { id: sku, name:newProd.name };
    newProd.location = cellId;
    ivSetCellQty(cellId, 0);
    posMsg = ` → ${cellId}`;
  }

  document.getElementById('new-product-modal-overlay').remove();
  renderAll();
  showToast(`✅ "${newProd.name}" cadastrado. Confirme ${qty} un. no lote${posMsg}.`);

  // Abre o painel de contagem mostrando o novo produto
  openScanCounterPanel({ id: sku, name:newProd.name, cat:newProd.cat }, qty);
}

// Animações auxiliares
var scanStyle = document.createElement('style');
scanStyle.textContent = `
  @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes slideDown { from{transform:translateY(0);opacity:1} to{transform:translateY(20px);opacity:0} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
`;
document.head.appendChild(scanStyle);

// ── URL STATE + OFFLINE APP SHELL ──
function restorePageFromUrl() {
  const requested = window.location.hash.replace(/^#/, '') || 'dashboard';
  navTo(requested, null, null, false);
}

window.addEventListener('hashchange', restorePageFromUrl);
if (!window.location.hash) window.history.replaceState({page:'dashboard'}, '', '#dashboard');
restorePageFromUrl();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Modo offline indisponível.', error));
  });
}
