// ── DATABASE CENTRAL ──
function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

var db = cloneData(window.FAST_DEMO_DB || { products: [], suppliers: [], recipes: [], losses: [], movements: [] });



// ── CATALOG ──
var IV_CATALOG = [];

// sincroniza IV_CATALOG com db.products (usados em outros módulos)
function syncCatalog() {
  IV_CATALOG.length = 0;
  db.products.forEach(p => IV_CATALOG.push({id:p.id, name:p.name, cat:p.cat}));
}

var cargos = cloneData(window.FAST_DEMO_CARGOS || []);

var stepLabels = ['Coleta','Triagem','Rota','Entrega'];

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
  const badgeCls = c.badges?.[0] || 'b-transit';
  const iconState = c.status === 'pending' ? 'pending' : (c.status === 'delivered' ? 'delivered' : 'transit');
  const icon = c.status === 'pending'
    ? `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2" stroke-linecap="round"/></svg>`
    : (c.status === 'delivered'
      ? `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M5 8l2 2 4-5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg viewBox="0 0 16 16"><path d="M2 4h8v7H2z"/><path d="M10 7h2.5l1.5 2v2h-4z"/><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/></svg>`);
  return {badgeCls, iconState, icon};
}

function buildCargoCard(c) {
  const etaColor = c.status === 'delivered' ? 'color:var(--success)' : '';
  const badgeHtml = c.badges.map(b => `<span class="badge ${b}">${c.statusLabel}</span>`).join('');
  return `
    <div class="cargo-card" onclick="openDrawer('${c.id}')">
      <div class="cargo-top">
        <div><div class="cargo-id">#${c.id}</div><div class="cargo-title">${c.title}</div></div>
        ${badgeHtml}
      </div>
      <div class="route"><span class="route-origin">${c.origin}</span><span class="route-arrow">→</span><span class="route-dest">${c.dest}</span></div>
      <div class="timeline-mini">${buildTimeline(c.steps[0], c.steps[1])}</div>
      <div class="cargo-footer">
        <span class="cargo-meta">Responsável: ${c.carrier}</span>
        <span class="cargo-eta" style="${etaColor}">Prev. ${c.eta}</span>
      </div>
    </div>`;
}

function buildRecentOrderRow(c) {
  const meta = getCargoStatusMeta(c);
  const recipe = (c.title || '').replace(/^(Produção|Compra):\s*/,'');
  return `
    <div class="recent-order" onclick="openDrawer('${c.id}')">
      <div class="recent-ico ${meta.iconState}">${meta.icon}</div>
      <div>
        <div class="recent-id">${c.id}</div>
        <div class="recent-client">${recipe}</div>
      </div>
      <div class="recent-loc"><div class="recent-label">Etapa</div><div class="recent-value">${c.origin}</div></div>
      <div class="recent-arrow">→</div>
      <div class="recent-loc"><div class="recent-label">Destino</div><div class="recent-value">${c.dest}</div></div>
      <div class="recent-forecast"><div class="recent-label">Previsão</div><div class="recent-value">${c.eta}</div></div>
      <div class="recent-status"><span class="badge ${meta.badgeCls}">${c.statusLabel}</span></div>
    </div>`;
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
  if (!p.validade) return null;
  const today = new Date('2026-06-10T00:00:00');
  const exp = new Date(p.validade + 'T00:00:00');
  return Math.ceil((exp - today) / 86400000);
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

function formatQty(p) {
  return `${p.qty.toLocaleString('pt-BR')} ${p.unit || 'un'}`;
}

function stockRowHtml(p, editable) {
  const s = stockStatus(p);
  const ex = expiryStatus(p);
  const qtyEl = editable
    ? `<div class="stock-num ${s.cls}" style="text-align:right;cursor:pointer;border-bottom:1px dashed var(--border2)"
         title="Clique para editar" onclick="editQty('${p.id}',${p.qty})">${formatQty(p)}</div>`
    : `<div class="stock-num ${s.cls}">${formatQty(p)}</div>`;
  return `<div class="stock-row stock-row-rich">
    <div><div class="stock-name">${p.name}</div><div class="stock-sku">${p.id} · ${p.lote || 'sem lote'}</div></div>
    <div class="stock-cat">${p.cat}</div>
    ${qtyEl}
    <div class="stock-num">${p.min.toLocaleString('pt-BR')} ${p.unit || 'un'}</div>
    <div style="text-align:right;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap"><span class="pill" style="background:${s.bg};color:${s.color}">${s.label}</span><span class="pill" style="background:${ex.bg};color:${ex.color}">${ex.label}</span></div>
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
  if (!el) return;
  const list = [...db.products]
    .sort((a,b) => (daysToExpire(a) ?? 999) - (daysToExpire(b) ?? 999) || (a.qty/a.min) - (b.qty/b.min))
    .slice(0, 5);
  if (!list.length) { el.innerHTML = '<div style="padding:14px;font-size:12px;color:var(--success)">✓ Lotes e validade sob controle</div>'; return; }
  el.innerHTML =
    `<div class="stock-row hdr stock-row-rich"><div>Produto / Lote FEFO</div><div>Fornecedor</div><div style="text-align:right">Disponível</div><div style="text-align:right">Validade</div><div style="text-align:right">Status</div></div>` +
    list.map(p => {
      const st = stockStatus(p);
      const ex = expiryStatus(p);
      return `<div class="stock-row stock-row-rich">
        <div><div class="stock-name">${p.name}</div><div class="stock-sku">${p.id} · ${p.lote || 'sem lote'}</div></div>
        <div class="stock-cat">${p.fornecedor || '—'}</div>
        <div class="stock-num ${st.cls}">${formatQty(p)}</div>
        <div class="stock-num ${ex.cls}">${p.validade ? p.validade.split('-').reverse().join('/') : '—'}</div>
        <div style="text-align:right"><span class="pill" style="background:${ex.bg};color:${ex.color}">${ex.label}</span></div>
      </div>`;
    }).join('');
}

// ── RENDER DASHBOARD METRICS ──
function metricSpark(points) {
  return `<svg class="metric-spark" viewBox="0 0 110 42" aria-hidden="true"><path d="${points}"/></svg>`;
}

function renderDashMetrics() {
  const el = document.getElementById('dash-metrics');
  if (!el) return;
  const critical = db.products.filter(p => p.qty < p.min).length;
  const expiring = db.products.filter(p => { const d = daysToExpire(p); return d !== null && d <= 7; }).length;
  const inProduction = cargos.filter(c => c.status === 'transit').length;
  const pending = cargos.filter(c => c.status === 'pending').length;
  const lossRisk = db.products.filter(p => { const d = daysToExpire(p); return d !== null && d <= 3; }).reduce((sum,p) => sum + (p.qty * (p.price || 0)), 0);
  el.innerHTML = `
    <div class="metric-card">
      <div class="metric-icon"><svg viewBox="0 0 16 16"><path d="M2 4h12M3 4v8h10V4"/><path d="M5 7h6M5 10h4" stroke-linecap="round"/></svg></div>
      <div class="metric-label">Insumos críticos</div><div class="metric-value">${critical}</div>
      <div class="metric-delta" style="color:${critical?'var(--warning)':'var(--success)'}">${critical?'reposição recomendada':'estoque saudável'}</div>${metricSpark('M4 34 C16 30 18 14 30 23 S47 37 55 21 S71 11 80 18 S94 31 106 12')}
    </div>
    <div class="metric-card">
      <div class="metric-icon"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2" stroke-linecap="round"/></svg></div>
      <div class="metric-label">Vencem em 7 dias</div><div class="metric-value">${expiring}</div>
      <div class="metric-delta" style="color:${expiring?'var(--danger)':'var(--success)'}">FEFO obrigatório</div>${metricSpark('M4 35 C14 31 15 10 28 19 S42 34 54 24 S74 16 86 22 S96 30 106 8')}
    </div>
    <div class="metric-card">
      <div class="metric-icon"><svg viewBox="0 0 16 16"><path d="M3 11c2-4 3-7 5-7s3 3 5 7"/><path d="M2 12h12" stroke-linecap="round"/></svg></div>
      <div class="metric-label">Produção em andamento</div><div class="metric-value">${inProduction}</div>
      <div class="metric-delta" style="color:var(--info)">${pending} aguardando liberação</div>${metricSpark('M4 35 C18 32 25 26 34 10 S51 11 58 24 S73 31 82 19 S95 30 106 34')}
    </div>
    <div class="metric-card">
      <div class="metric-icon"><svg viewBox="0 0 16 16"><path d="M8 2l6 11H2z"/><path d="M8 6v3M8 12h.01" stroke-linecap="round"/></svg></div>
      <div class="metric-label">Risco de perda</div><div class="metric-value">R$ ${Math.round(lossRisk)}</div>
      <div class="metric-delta" style="color:${lossRisk?'var(--danger)':'var(--success)'}">validade ≤ 3 dias</div>${metricSpark('M4 32 C16 31 21 20 30 28 S45 37 53 27 S68 23 76 32 S91 37 106 9')}
    </div>
  `;
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
    <div class="metric-card"><div class="metric-label">SKUs e lotes</div><div class="metric-value">${db.products.length}</div><div class="metric-delta" style="color:var(--info)">ativos no estoque</div></div>
    <div class="metric-card"><div class="metric-label">Volume total</div><div class="metric-value">${total.toLocaleString('pt-BR')}</div><div class="metric-delta" style="color:var(--success)">unidades/sacos/litros</div></div>
    <div class="metric-card"><div class="metric-label">Abaixo do mínimo</div><div class="metric-value" style="color:${baixo?'var(--warning)':'var(--success)'}">${baixo}</div><div class="metric-delta" style="color:${baixo?'var(--warning)':'var(--text-muted)'}">${baixo?'comprar hoje':'OK'}</div></div>
    <div class="metric-card"><div class="metric-label">Vencimento próximo</div><div class="metric-value" style="color:${vencendo?'var(--danger)':'var(--success)'}">${vencendo}</div><div class="metric-delta" style="color:var(--text-muted)">R$ ${valor.toLocaleString('pt-BR',{minimumFractionDigits:0})} em estoque</div></div>
  `;
}

// ── FLOW MODALS ──
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
}

function openFlowModal({title, subtitle='', fields=[], submitLabel='Salvar', onSubmit}) {
  closeFlowModal();
  const overlay = document.createElement('div');
  overlay.className = 'flow-overlay';
  overlay.id = 'flow-overlay';
  overlay.innerHTML = `
    <form class="flow-modal" id="flow-form">
      <div class="flow-head">
        <div>
          <div class="flow-title">${escapeHtml(title)}</div>
          ${subtitle ? `<div class="flow-sub">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        <button type="button" class="flow-close" onclick="closeFlowModal()">×</button>
      </div>
      <div class="flow-body">
        ${fields.map(field => {
          const required = field.required ? 'required' : '';
          const value = escapeHtml(field.value ?? '');
          const label = `<label for="flow-${field.name}">${escapeHtml(field.label)}</label>`;
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
      </div>
      <div class="flow-actions">
        <button type="button" class="btn-secondary" onclick="closeFlowModal()">Cancelar</button>
        <button type="submit" class="btn-primary">${escapeHtml(submitLabel)}</button>
      </div>
    </form>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeFlowModal(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.getElementById('flow-form').addEventListener('submit', e => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget).entries());
    if (onSubmit(values) !== false) closeFlowModal();
  });
}

function closeFlowModal() {
  const overlay = document.getElementById('flow-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 160);
}

// ── EDIT QTY INLINE ──
function editQty(skuId, current) {
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
      const n = parseInt(values.qty);
      if (isNaN(n) || n < 0) { showToast('⚠️ Quantidade inválida'); return false; }
      const delta = n - p.qty;
      p.qty = n;
      db.movements.unshift({
        type:'ajuste',
        item:p.name,
        sku:p.id,
        qty:delta,
        lote:p.lote || 'sem lote',
        date:new Date().toLocaleString('pt-BR'),
        ref:values.reason || 'Ajuste manual',
        note:values.note || ''
      });
      renderAll();
      showToast(`✓ ${p.name}: ${n} ${p.unit || 'un'} · ${values.reason}`);
    }
  });
}

// ── RENDER ALL (atualiza tudo de uma vez) ──
function renderAll() {
  renderDashMetrics();
  renderCriticalStock();
  renderEstoqueMetrics();
  renderStockFull(document.getElementById('estoque-search')?.value || '');
  renderCards(cargos.slice(0,5), 'cargo-list');
  renderCards(cargos, 'cargo-list-all');
  renderTrackList();
  renderDashboardTracking();
  renderDashboardAlerts();
  renderSuppliers();
  renderLosses();
  renderAudit(document.getElementById('audit-search')?.value || '');
  syncCatalog();
  // atualiza badge da sidebar
  const badge = document.querySelector('.nav-item[data-page="pedidos"] .nav-badge');
  if (badge) badge.textContent = cargos.filter(c=>c.status!=='delivered').length;
  saveState();
}

// ── RENDER RASTREIO ──
function renderTrackList() {
  const el = document.getElementById('track-list');
  if (!el) return;
  const active = cargos.filter(c => c.status !== 'delivered');
  if (!active.length) {
    el.innerHTML = '<div style="padding:32px;text-align:center;font-size:12px;color:var(--text-muted)">Nenhuma ordem em monitoramento</div>';
    return;
  }
  const pctMap = { 'pending': 25, 'transit': 65, 'delivered': 100 };
  el.innerHTML = active.map(c => {
    const pct = pctMap[c.status] || 30;
    const amber = c.status === 'pending' ? ' amber' : '';
    const badgeCls = c.badges[0] || 'b-transit';
    return `<div class="track-card" onclick="openDrawer('${c.id}')">
      <div class="track-head"><div><div class="cargo-id">#${c.id} · ${c.title}</div></div><span class="badge ${badgeCls}">${c.statusLabel}</span></div>
      <div class="track-progress"><div class="track-fill${amber}" style="width:${pct}%"></div></div>
      <div class="track-meta"><span>${c.origin} → ${c.dest} · ${pct}% concluído</span><span>ETA: ${c.eta}</span></div>
    </div>`;
  }).join('');
}


function renderDashboardTracking() {
  const el = document.getElementById('dashboard-tracking');
  if (!el) return;
  const c = cargos.find(x => x.status === 'transit') || cargos.find(x => x.status !== 'delivered') || cargos[0];
  if (!c) { el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px">Nenhuma produção ativa</div>'; return; }
  const meta = getCargoStatusMeta(c);
  const current = (c.timeline || []).find(t => t.cls === 'active') || (c.timeline || [])[0] || {};
  const steps = [
    ['Separação','FEFO', 'done',`<svg viewBox="0 0 16 16"><path d="M4 8l2.5 2.5L12 5" stroke-linecap="round" stroke-linejoin="round"/></svg>`],
    ['Preparo','Massa', 'done',`<svg viewBox="0 0 16 16"><path d="M4 8l2.5 2.5L12 5" stroke-linecap="round" stroke-linejoin="round"/></svg>`],
    ['Produção','Agora', 'active',`<svg viewBox="0 0 16 16"><path d="M3 11c2-4 3-7 5-7s3 3 5 7"/><path d="M2 12h12" stroke-linecap="round"/></svg>`],
    ['Balcão',c.eta,'pending',`<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>`]
  ];
  el.innerHTML = `
    <div class="tracking-card" onclick="openDrawer('${c.id}')">
      <div class="tracking-title"><div><strong>${c.id}</strong><div class="tracking-route">${c.origin} → ${c.dest}</div></div><span class="badge ${meta.badgeCls}">${c.statusLabel}</span></div>
      <div class="tracking-eta">Saída prevista <strong>${c.eta}</strong></div>
      <div class="tracking-steps">${steps.map(([label,time,cls,icon]) => `<div class="tracking-step ${cls}"><div class="tracking-dot">${icon}</div><span>${label}</span><small>${time}</small></div>`).join('')}</div>
      <div class="location-card">
        <svg viewBox="0 0 16 16"><path d="M8 14s5-4.2 5-8A5 5 0 003 6c0 3.8 5 8 5 8z"/><circle cx="8" cy="6" r="1.6"/></svg>
        <div><strong>Etapa atual</strong><div>${current.detail || 'Produção sem atualização'}</div></div><small>${current.time || 'agora'}</small>
      </div>
    </div>`;
}

function renderDashboardAlerts() {
  const el = document.getElementById('dashboard-alerts');
  if (!el) return;
  const critical = db.products.filter(p => p.qty < p.min).length;
  const expiring = db.products.filter(p => { const d = daysToExpire(p); return d !== null && d <= 3; }).length;
  const pending = cargos.filter(c => c.status === 'pending').length;
  el.innerHTML = `
    <div class="alert-item danger" onclick="navToStr('perdas')"><div class="alert-icon"><svg viewBox="0 0 16 16"><path d="M8 2l6 11H2z"/><path d="M8 6v3M8 12h.01" stroke-linecap="round"/></svg></div><div class="alert-copy"><strong>${expiring} lotes vencem em até 3 dias</strong><span>Use FEFO ou registre descarte.</span></div><div class="alert-chevron">›</div></div>
    <div class="alert-item warning" onclick="navToStr('estoque')"><div class="alert-icon"><svg viewBox="0 0 16 16"><path d="M8 2l6 11H2z"/><path d="M8 6v3M8 12h.01" stroke-linecap="round"/></svg></div><div class="alert-copy"><strong>${critical} insumos abaixo do mínimo</strong><span>Compra sugerida antes da próxima fornada.</span></div><div class="alert-chevron">›</div></div>
    <div class="alert-item info" onclick="navToStr('pedidos')"><div class="alert-icon"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5h.01" stroke-linecap="round"/></svg></div><div class="alert-copy"><strong>${pending} ordens aguardam liberação</strong><span>Valide insumos e aprove compras recomendadas.</span></div><div class="alert-chevron">›</div></div>
  `;
}

function makeProductionLotCode(recipe, shift) {
  const slug = recipe.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toUpperCase().slice(0,10);
  const date = new Date();
  const ymd = date.toISOString().slice(2,10).replace(/-/g,'');
  const suffix = (shift || 'turno').slice(0,1).toUpperCase();
  return `PRD-${slug}-${ymd}-${suffix}`;
}

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
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

      plan.items.forEach(item => {
        item.product.qty = Number((item.product.qty - item.required).toFixed(3));
        db.movements.unshift({
          type:'saida_producao',
          item:item.product.name,
          sku:item.product.id,
          qty:item.required,
          lote:item.product.lote || 'sem lote',
          date:nowLabel,
          ref:opId,
          note:`Consumo para ${plan.recipe.name}`
        });
      });

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
      finished.qty = Number((finished.qty + amount).toFixed(3));
      finished.lote = lotCode;
      finished.validade = validity;
      finished.fornecedor = 'Produção própria';
      finished.price = Number((cost / amount).toFixed(2)) || finished.price;

      db.movements.unshift({
        type:'entrada_producao',
        item:finished.name,
        sku:finished.id,
        qty:amount,
        lote:lotCode,
        date:nowLabel,
        ref:opId,
        note:values.note || `Produção ${values.shift}`
      });

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
      {name:'overview', label:'📦 Visão geral', type:'textarea', value:[
        `SKUs/lotes ativos: ${db.products.length}`,
        `Abaixo do mínimo: ${critical.length}`,
        `Vencem em até 7 dias: ${expiring.length}`,
        `Valor estimado em estoque: R$ ${totalValue.toLocaleString('pt-BR',{minimumFractionDigits:2})}`
      ].join('\n')},
      {name:'critical', label:'⚠️ Insumos críticos', type:'textarea', value:critical.map(p => `${p.id} · ${p.name}: ${formatQty(p)} / mínimo ${p.min} ${p.unit || 'un'}`).join('\n') || 'Nenhum item abaixo do mínimo.'},
      {name:'expiry', label:'⏳ Vencem em 7 dias', type:'textarea', value:expiring.map(p => `${p.lote || 'sem lote'} · ${p.name}: ${p.days} dia(s)`).join('\n') || 'Nenhum lote vencendo em até 7 dias.'}
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
    {type:'Ações rápidas', label:'Registrar entrada de insumo', desc:'Abrir QR/entrada com fornecedor e lote', icon:'+', action:() => openQR()},
    {type:'Ações rápidas', label:'Resumo do estoque', desc:'Abrir modal com mínimos, validade e valor estimado', icon:'E', action:() => openStockModal()},
    {type:'Ações rápidas', label:'Registrar produção de pão francês', desc:'Baixar ingredientes e gerar lote acabado', icon:'P', action:() => openProductionForm('REC-PF')},
    {type:'Ações rápidas', label:'Resumo da produção', desc:'Abrir modal com ordens e receitas do dia', icon:'P', action:() => openProductionSummaryModal()},
    {type:'Ações rápidas', label:'Resumo do Mapa FEFO', desc:'Abrir modal com prioridade por validade e posições', icon:'F', action:() => openFefoMapModal()},
    {type:'Ações rápidas', label:'Registrar perda/descarte', desc:'Sobra, vencimento, quebra ou erro de produção', icon:'!', action:() => openLossForm()},
    {type:'Ações rápidas', label:'Importar NF-e ou CSV', desc:'Entrada em lote de insumos e validade', icon:'NF', action:() => { openQR(); setTimeout(openImportFile, 80); }},
    {type:'Ações rápidas', label:'Ver lotes vencendo', desc:'Ordenar estoque por validade FEFO', icon:'V', action:() => navToStr('estoque')},
    {type:'Ações rápidas', label:'Gerar sugestão de compra', desc:'Reposição de ovos, fermento e margarina', icon:'IA', action:() => showToast('Sugestão IA: comprar ovos, fermento e margarina hoje')},
    {type:'Ações rápidas', label:'Abrir auditoria', desc:'Histórico de entradas, saídas, perdas e ajustes', icon:'A', action:() => navToStr('auditoria')},
    {type:'Ações rápidas', label:'Exportar movimentações CSV', desc:'Baixar histórico operacional para planilha', icon:'CSV', action:() => exportMovementsCsv()},
    {type:'Ações rápidas', label:'Resetar dados locais', desc:'Limpar localStorage e voltar ao demo inicial após recarregar', icon:'↺', action:() => resetLocalData()},
    {type:'Produção', label:'Abrir produção', desc:'Ordens, fornadas e encomendas do dia', icon:'↗', action:() => navToStr('pedidos')},
    {type:'Estoque', label:'Abrir estoque FEFO', desc:'Insumos, lotes, validade e mínimos', icon:'▦', action:() => navToStr('estoque')},
    ...db.recipes.map(r => ({type:'Receitas', label:`Produzir ${r.name}`, desc:`Rendimento base ${r.yield} ${r.unit} · baixa automática de insumos`, icon:'P', action:() => openProductionForm(r.id)})),
    ...cargos.map(c => ({type:'Ordens de produção', label:c.id, desc:`${c.title} · ${c.origin} → ${c.dest}`, icon:'↗', action:() => openDrawer(c.id)})),
    ...db.products.map(p => ({type:'Insumos e lotes', label:p.id, desc:`${p.name} · ${formatQty(p)} · ${p.lote || 'sem lote'} · validade ${p.validade || '—'}`, icon:'▦', action:() => { navToStr('estoque'); const input=document.getElementById('estoque-search'); if(input){input.value=p.id; renderStockFull(p.id);} }})),
    ...db.suppliers.map(f => ({type:'Fornecedores', label:f.name, desc:`${f.cat} · lead time ${f.lead} · confiabilidade ${f.reliability}%`, icon:'F', action:() => navToStr('fornecedores')}))
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
    const group = item.type !== currentGroup ? (currentGroup = item.type, `<div class="cmd-group-label">${item.type}</div>`) : '';
    return `${group}<div class="cmd-item" onclick="runCommandAction(${idx})"><div class="cmd-item-ico">${item.icon.length > 1 ? item.icon : `<span>${item.icon}</span>`}</div><div class="cmd-item-copy"><strong>${item.label}</strong><span>${item.desc}</span></div><div class="cmd-kbd">Enter</div></div>`;
  }).join('');
  window.__cmdList = list;
}

function openCommandPalette(q='') {
  const overlay = document.getElementById('cmd-overlay');
  const input = document.getElementById('cmd-input');
  if (!overlay || !input) return;
  overlay.classList.add('open');
  input.value = q || '';
  renderCommandResults(input.value);
  setTimeout(() => input.focus(), 30);
}

function closeCommandPalette() {
  const overlay = document.getElementById('cmd-overlay');
  if (overlay) overlay.classList.remove('open');
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
  el.innerHTML = db.suppliers.map(f => `
    <div class="supplier-card">
      <div class="supplier-head"><div class="supplier-logo">${f.name.split(' ').map(w=>w[0]).slice(0,2).join('')}</div><div><div class="supplier-name">${f.name}</div><div class="supplier-cat">${f.cat}</div></div></div>
      <div class="supplier-meta"><span>Lead time</span><strong>${f.lead}</strong></div>
      <div class="supplier-meta"><span>Confiabilidade</span><strong>${f.reliability}%</strong></div>
      <div class="supplier-meta"><span>Última compra</span><strong>${f.last}</strong></div>
    </div>`).join('');
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
      <div class="metric-card"><div class="metric-label">Registros de perda</div><div class="metric-value">${db.losses.length}</div><div class="metric-delta" style="color:var(--info)">histórico operacional</div></div>
      <div class="metric-card"><div class="metric-label">Quantidade perdida</div><div class="metric-value">${totalQty}</div><div class="metric-delta" style="color:var(--warning)">unidades/volumes</div></div>
      <div class="metric-card"><div class="metric-label">Custo estimado</div><div class="metric-value">R$ ${totalCost.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div><div class="metric-delta" style="color:var(--danger)">impacto financeiro</div></div>
      <div class="metric-card"><div class="metric-label">Por validade</div><div class="metric-value">${expiryLosses}</div><div class="metric-delta" style="color:var(--danger)">corrigir FEFO</div></div>`;
  }
  if (table) {
    table.innerHTML = `<div class="stock-row hdr stock-row-rich"><div>Item</div><div>Motivo</div><div style="text-align:right">Qtd.</div><div style="text-align:right">Custo</div><div style="text-align:right">Data</div></div>` +
      db.losses.map(l => `<div class="stock-row stock-row-rich">
        <div><div class="stock-name">${l.item}</div><div class="stock-sku">${l.lote || 'sem lote informado'}</div></div>
        <div class="stock-cat">${l.reason}</div>
        <div class="stock-num">${l.qty}</div>
        <div class="stock-num">R$ ${Number(l.cost || 0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div style="text-align:right"><span class="pill" style="background:var(--warning-bg);color:var(--warning)">${l.date || 'hoje'}</span></div>
      </div>`).join('');
  }
  if (suggestions) {
    suggestions.innerHTML = `
      <div class="alert-item danger" onclick="navToStr('estoque')"><div class="alert-icon">FE</div><div class="alert-copy"><strong>Aplicar FEFO antes da produção</strong><span>Priorize lotes com validade menor que 3 dias.</span></div><div class="alert-chevron">›</div></div>
      <div class="alert-item warning" onclick="openLossForm()"><div class="alert-icon">+</div><div class="alert-copy"><strong>Registrar toda sobra de balcão</strong><span>Dados de perda alimentam compras e produção sugerida.</span></div><div class="alert-chevron">›</div></div>
      <div class="alert-item info" onclick="openImportFile()"><div class="alert-icon">NF</div><div class="alert-copy"><strong>Importar XML/CSV de entrada</strong><span>Evita digitação e reduz erro em lote/validade.</span></div><div class="alert-chevron">›</div></div>`;
  }
}

function openLossForm() {
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
      if (!qty || qty < 0) { showToast('⚠️ Quantidade inválida'); return false; }
      const loss = {
        reason:values.reason || 'Perda operacional',
        item:p.name,
        lote:p.lote,
        qty,
        cost:qty * (p.price || 0),
        date:new Date().toLocaleDateString('pt-BR'),
        responsible:values.responsible || '—',
        note:values.note || ''
      };
      db.losses.unshift(loss);
      p.qty = Math.max(0, p.qty - qty);
      db.movements.unshift({
        type:'perda',
        item:p.name,
        sku:p.id,
        qty,
        lote:p.lote || 'sem lote',
        date:new Date().toLocaleString('pt-BR'),
        ref:values.reason || 'Perda operacional',
        note:values.note || ''
      });
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
      <div class="metric-card"><div class="metric-label">Movimentações</div><div class="metric-value">${movements.length}</div><div class="metric-delta" style="color:var(--info)">eventos auditáveis</div></div>
      <div class="metric-card"><div class="metric-label">Entradas</div><div class="metric-value">${entries}</div><div class="metric-delta" style="color:var(--success)">insumos e produção</div></div>
      <div class="metric-card"><div class="metric-label">Saídas produção</div><div class="metric-value">${exits}</div><div class="metric-delta" style="color:var(--warning)">consumo de receita</div></div>
      <div class="metric-card"><div class="metric-label">Perdas/ajustes</div><div class="metric-value">${losses + adjustments}</div><div class="metric-delta" style="color:var(--danger)">controle operacional</div></div>`;
  }
  if (table) {
    table.innerHTML = `<div class="stock-row hdr audit-row"><div>Data / Tipo</div><div>Produto / SKU</div><div style="text-align:right">Qtd.</div><div>Lote</div><div>Referência</div></div>` +
      filtered.map(m => {
        const isNegative = ['perda','saida_producao'].includes(m.type) || Number(m.qty) < 0;
        const color = isNegative ? 'var(--danger)' : 'var(--success)';
        return `<div class="stock-row audit-row">
          <div><div class="stock-name">${m.date || '—'}</div><div class="stock-sku">${movementTypeLabel(m.type)}</div></div>
          <div><div class="stock-name">${m.item || '—'}</div><div class="stock-sku">${m.sku || '—'}</div></div>
          <div class="stock-num" style="color:${color}">${Number(m.qty || 0).toLocaleString('pt-BR')}</div>
          <div class="stock-cat">${m.lote || '—'}</div>
          <div><div class="stock-name">${m.ref || '—'}</div><div class="stock-sku">${m.note || ''}</div></div>
        </div>`;
      }).join('') || '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-muted)">Nenhuma movimentação encontrada</div>';
  }
}

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",;\n]/.test(str) ? `"${str.replace(/"/g,'""')}"` : str;
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
  const rows = [['data','tipo','produto','sku','quantidade','lote','referencia','observacao']]
    .concat((db.movements || []).map(m => [m.date, movementTypeLabel(m.type), m.item, m.sku, m.qty, m.lote, m.ref, m.note]));
  const csv = rows.map(row => row.map(csvEscape).join(';')).join('\n');
  downloadFile(`fast-movimentacoes-${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv;charset=utf-8');
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
      {name:'help', label:'Guia rápido', type:'textarea', value:'1. Nova entrada: importa NF-e/CSV ou lê QR/bipador.\\n2. Registrar produção: baixa insumos e gera lote acabado.\\n3. Perdas: registra sobras, vencimentos e quebras.\\n4. Auditoria: acompanha todas as movimentações.\\n5. Ctrl/Cmd + K: abre a paleta de comandos.'}
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
      {name:'alerts', label:'Alertas', type:'textarea', value:`${expiring} lote(s) vencem em até 3 dias.\\n${critical} insumo(s) abaixo do mínimo.\\n${pending} ordem(ns) aguardam liberação.`}
    ],
    onSubmit(){ navToStr('auditoria'); }
  });
}

// ── LOCAL PERSISTENCE ──
var STORAGE_KEY = window.FAST_API?.STORAGE_KEY || 'fast-padaria-state-v1';
var isHydratingState = true;

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
  } catch (error) {
    console.warn('Não foi possível carregar dados locais do F.A.S.T', error);
  }
}

function saveState() {
  if (isHydratingState) return;
  try {
    const state = {db, cargos};
    if (window.FAST_API) window.FAST_API.writeState(state);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Não foi possível salvar dados locais do F.A.S.T', error);
  }
}

function resetLocalData() {
  localStorage.removeItem(STORAGE_KEY);
  showToast('Dados locais limpos. Recarregue a página para voltar ao demo inicial.');
}

// ── INIT ──
loadState();
isHydratingState = false;
renderAll();

// ── NAV ──
var pageTitles = {
  dashboard: ['Dashboard', 'Estoque, validade e produção da padaria'],
  pedidos: ['Produção', 'Ordens, fornadas e encomendas'],
  estoque: ['Estoque', 'Insumos, lotes e validade'],
  rastreio: ['Lotes', 'Rastreabilidade, validade e produção em andamento'],
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
var allRuasData = {};
function ivGetRuaData(rua) {
  if (!allRuasData[rua]) allRuasData[rua] = ivSeed(rua);
  return allRuasData[rua];
}
var ivMatrixData = ivGetRuaData('1');
// positionProducts[cellId] = { id, name }
var positionProducts = {};
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
    tabMapa.style.cssText = 'padding:12px 16px;font-size:13px;font-weight:500;color:var(--text-primary);cursor:pointer;border-bottom:2px solid var(--text-primary);margin-bottom:-1px;display:flex;align-items:center;gap:7px;transition:all .15s';
    tabProd.style.cssText = 'padding:12px 16px;font-size:13px;font-weight:400;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:flex;align-items:center;gap:7px;transition:all .15s';
    viewMapa.style.display = 'flex';
    viewProd.style.display = 'none';
  } else {
    tabMapa.style.cssText = 'padding:12px 16px;font-size:13px;font-weight:400;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:flex;align-items:center;gap:7px;transition:all .15s';
    tabProd.style.cssText = 'padding:12px 16px;font-size:13px;font-weight:500;color:var(--text-primary);cursor:pointer;border-bottom:2px solid var(--text-primary);margin-bottom:-1px;display:flex;align-items:center;gap:7px;transition:all .15s';
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

  let html = `<div style="display:grid;grid-template-columns:40px ${Array(IV_RACKS).fill('62px').join(' ')};gap:3px;min-width:max-content">`;
  html += `<div style="width:40px;height:22px"></div>`;
  for (let rk=1;rk<=IV_RACKS;rk++) html += `<div style="width:62px;height:22px;display:flex;align-items:center;justify-content:center;font-size:9px;font-family:var(--mono);color:var(--text-muted)">P${rk}</div>`;

  for (const lv of levelsToShow) {
    html += `<div style="width:40px;height:52px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;font-size:10px;font-family:var(--mono);color:var(--text-muted);flex-shrink:0">N${lv}</div>`;
    for (let rk=1;rk<=IV_RACKS;rk++) {
      const val = data[lv][rk];
      let {bg,tc} = ivCellColor(val);
      const pct = Math.round(val/IV_MAX_CAP*100);
      const cellId = `R${ivCurrentRua}-N${lv}-P${rk}`;
      const prod = positionProducts[cellId];
      if (prod) { bg = 'rgba(190,233,232,.85)'; tc = '#1B4965'; }
      const prodLabel = prod
        ? `<div style="font-size:8px;color:${tc};opacity:.85;margin-top:1px;max-width:56px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:center">${prod.name.split(' ').slice(0,2).join(' ')}</div>`
        : '';
      const titleStr = prod
        ? `${cellId}: ${prod.name} (${prod.id}) · ${val.toLocaleString('pt-BR')} un`
        : `${cellId}: ${val.toLocaleString('pt-BR')} un · ${pct}%`;
      html += `
        <div onclick="ivOpenCellModal('${cellId}',${val},${lv},${rk})" title="${titleStr}"
          style="width:62px;height:52px;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:all .12s;border:1px solid ${prod?'rgba(98,182,203,.55)':'transparent'};background:${bg};position:relative"
          onmouseover="this.style.borderColor='rgba(255,255,255,.25)';this.style.transform='scale(1.06)';this.style.zIndex='2'"
          onmouseout="this.style.borderColor='${prod?'rgba(98,182,203,.55)':'transparent'}';this.style.transform='scale(1)';this.style.zIndex='0'">
          <div style="font-size:10px;font-family:var(--mono);font-weight:500;color:${tc};line-height:1">${val===0?'—':val.toLocaleString('pt-BR')}</div>
          ${val>0&&!prod?`<div style="font-size:8px;margin-top:1px;color:${tc};opacity:.7">${pct}%</div>`:''}
          ${prodLabel}
          ${prod?`<div style="position:absolute;top:3px;right:3px;width:5px;height:5px;border-radius:50%;background:#5FA8D3"></div>`:''}
        </div>`;
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
  requestAnimationFrame(() => {
    ov.style.opacity = '1';
    document.getElementById('cell-modal').style.transform = 'translateY(0)';
  });
}

function ivCloseCellModal() {
  const ov = document.getElementById('cell-modal-overlay');
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
    <div onclick="ivCmSelectProd('${p.id}')" id="cmprod-${p.id.replace(/[^a-z0-9]/gi,'')}"
      style="padding:8px 10px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:background .12s"
      onmouseover="this.style.background='var(--surface3)'" onmouseout="if(!this.classList.contains('selected'))this.style.background='transparent'">
      <div>
        <div style="font-size:12px;color:var(--text-primary)">${p.name}</div>
        <div style="font-size:10px;font-family:var(--mono);color:var(--text-muted);margin-top:1px">${p.id} · ${p.cat}</div>
      </div>
    </div>`).join('') || '<div style="padding:10px;font-size:12px;color:var(--text-muted);text-align:center">Nenhum produto encontrado</div>';
}

function ivCmSelectProd(skuId) {
  cmSelectedProduct = IV_CATALOG.find(p => p.id === skuId);
  // visual selection
  document.querySelectorAll('#cm-product-list > div').forEach(el => {
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
  ivCloseCellModal();
  ivBuildHeatmap(ivMatrixData);
  ivBuildMetrics(ivMatrixData);
  showToast(`${cmSelectedProduct.name} → ${cmCurrentCell.cellId}`);
}

function ivRemoveProduct() {
  if (!cmCurrentCell) return;
  delete positionProducts[cmCurrentCell.cellId];
  document.getElementById('cm-current-wrap').style.display = 'none';
  ivCloseCellModal();
  ivBuildHeatmap(ivMatrixData);
  ivBuildMetrics(ivMatrixData);
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
    return `<div onclick="ivLocateProduct('${p.id}')" id="proditem-${p.id.replace(/[^a-z0-9]/gi,'')}"
      style="padding:9px 12px;border-radius:var(--r);cursor:pointer;transition:background .12s;border:1px solid transparent"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="if(!this.classList.contains('active-prod'))this.style.background='transparent'">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
        <div style="font-size:12px;color:var(--text-primary);font-weight:${hasPos?'500':'400'}">${p.name}</div>
        ${hasPos?`<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:var(--accent-dim);color:#1B4965;font-family:var(--mono)">${count} pos.</span>`:''}
      </div>
      <div style="font-size:10px;font-family:var(--mono);color:var(--text-muted)">${p.id} · ${p.cat}</div>
    </div>`;
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
  document.querySelectorAll('#prod-list > div[id^="proditem-"]').forEach(el => {
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
        return `<div onclick="ivGoToPos('${pos}')" style="background:var(--accent-dim);border:1px solid rgba(98,182,203,.35);border-radius:var(--r);padding:10px 14px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:all .15s"
          onmouseover="this.style.background='#CAE9FF'" onmouseout="this.style.background='var(--accent-dim)'">
          <div>
            <div style="font-size:13px;font-family:var(--mono);color:#1B4965;font-weight:500">${pos}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Rua ${ruaPart} · Nível ${nivelPart} · Prédio ${predioPart}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:12px;font-family:var(--mono);color:var(--text-secondary)">${val.toLocaleString('pt-BR')} un</div>
            <div style="font-size:10px;color:var(--text-muted)">${pct}% cap.</div>
          </div>
        </div>`;
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

function navTo(pageId, sidebarEl, tbId) {
  // pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');

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
  document.getElementById('header-sub').textContent = info[1];

  currentPage = pageId;

  // re-renderiza dados ao entrar na página
  if (pageId === 'estoque') { renderEstoqueMetrics(); renderStockFull(document.getElementById('estoque-search')?.value||''); }
  if (pageId === 'dashboard') { renderDashMetrics(); renderCriticalStock(); renderDashboardTracking(); renderDashboardAlerts(); }
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
  const overlay = document.getElementById('drawer-overlay');
  const drawer  = document.getElementById('drawer');
  overlay.classList.add('open');
  drawer.classList.add('open');
  requestAnimationFrame(() => overlay.classList.add('visible'));

  // reset tabs
  document.querySelectorAll('.dtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.dtab-content').forEach(ct => ct.classList.remove('active'));
  document.querySelectorAll('.dtab')[0].classList.add('active');
  document.getElementById('dtab-timeline').classList.add('active');

  // header
  document.getElementById('d-id').textContent    = 'ORDEM/LOTE · #' + c.id;
  document.getElementById('d-title').textContent  = c.title;
  document.getElementById('d-badges').innerHTML   = c.badges.map(b => `<span class="badge ${b}">${c.statusLabel}</span>`).join('');

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
        <div class="rv-city"><div class="rv-name">${c.origin}</div><div class="rv-sub">Etapa inicial</div></div>
        <div class="rv-mid"><div class="rv-line"></div></div>
        <div class="rv-city" style="text-align:right"><div class="rv-name">${c.dest}</div><div class="rv-sub">Próxima etapa</div></div>
      </div>
    </div>
    <div class="dsection">
      <div class="dsection-label">Histórico de eventos</div>
      <div class="tl-full">
        ${(c.timeline||[]).map(t => `
          <div class="tl-item ${t.cls}">
            <div class="tl-ico">${tlIcons[t.cls]||tlIcons.pending}</div>
            <div class="tl-event">${t.ev}</div>
            <div class="tl-detail">${t.detail}</div>
            <div class="tl-time">${t.time}</div>
          </div>`).join('')}
      </div>
    </div>`;

  // ── TAB: ITENS ──
  document.getElementById('d-items-content').innerHTML = `
    <div class="dsection">
      <div class="dsection-label">${c.volumes} volume(s) · ${c.peso} kg total</div>
      <div class="items-list">
        ${(c.itens||[]).map(it => `
          <div class="item-row">
            <div class="item-ico"><svg viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="1"/><path d="M2 5h10"/></svg></div>
            <div><div class="item-name">${it.name}</div><div class="item-sku">${it.sku}</div></div>
            <div class="item-qty">× ${it.qty}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="dsection">
      <div class="dsection-label">Rendimento / Custos</div>
      <div class="meta-grid">
        <div class="meta-item"><div class="meta-key">Qtd. recebida</div><div class="meta-val mono">${c.volumes} un/lote</div></div>
        <div class="meta-item"><div class="meta-key">Peso/volume</div><div class="meta-val mono">${c.peso} kg</div></div>
        <div class="meta-item"><div class="meta-key">NF-e</div><div class="meta-val mono">${c.nfe}</div></div>
        <div class="meta-item"><div class="meta-key">Seguro</div><div class="meta-val mono">${c.seguro}</div></div>
      </div>
    </div>`;

  // ── TAB: INFO ──
  const dest = c.destinatario||{};
  const rem  = c.remetente||{};
  document.getElementById('d-info-content').innerHTML = `
    <div class="dsection">
      <div class="dsection-label">Unidade produtiva</div>
      <div class="meta-grid">
        <div class="meta-item" style="grid-column:1/-1"><div class="meta-key">Empresa</div><div class="meta-val">${rem.empresa||'—'}</div></div>
        <div class="meta-item"><div class="meta-key">CNPJ</div><div class="meta-val mono" style="font-size:11px">${rem.cnpj||'—'}</div></div>
        <div class="meta-item"><div class="meta-key">Contato</div><div class="meta-val mono">${rem.tel||'—'}</div></div>
      </div>
    </div>
    <div class="dsection">
      <div class="dsection-label">Destino / consumo</div>
      <div class="meta-grid">
        <div class="meta-item" style="grid-column:1/-1"><div class="meta-key">Nome</div><div class="meta-val">${dest.nome||'—'}</div></div>
        <div class="meta-item" style="grid-column:1/-1"><div class="meta-key">Endereço</div><div class="meta-val">${dest.endereco||'—'}</div></div>
        <div class="meta-item"><div class="meta-key">CNPJ</div><div class="meta-val mono" style="font-size:11px">${dest.cnpj||'—'}</div></div>
        <div class="meta-item"><div class="meta-key">Contato</div><div class="meta-val mono">${dest.tel||'—'}</div></div>
      </div>
    </div>
    <div class="dsection">
      <div class="dsection-label">Fiscal</div>
      <div class="meta-grid">
        <div class="meta-item"><div class="meta-key">NF-e</div><div class="meta-val mono">${c.nfe}</div></div>
        <div class="meta-item"><div class="meta-key">Responsável</div><div class="meta-val mono">${c.carrier}</div></div>
      </div>
    </div>`;

  // ── TAB: CARRIER ──
  const ocEl = c.ocorrencia
    ? `<div class="dsection">
        <div class="dsection-label">Ocorrência ativa</div>
        <div style="background:var(--danger-bg);border:1px solid rgba(248,113,113,.25);border-radius:var(--r);padding:12px 14px">
          <div style="font-size:11px;color:var(--danger);font-weight:500;margin-bottom:4px">Atenção operacional</div>
          <div style="font-size:12px;color:var(--text-secondary)">${typeof c.ocorrencia === 'string' ? c.ocorrencia : (c.ocorrencia.desc || 'Verificar ocorrência')}</div>
          <div style="font-size:10px;font-family:var(--mono);color:var(--text-muted);margin-top:6px">${typeof c.ocorrencia === 'string' ? 'agora' : (c.ocorrencia.data || 'agora')}</div>
        </div>
      </div>` : '';
  document.getElementById('d-carrier-content').innerHTML = `
    <div class="dsection">
      <div class="dsection-label">Responsável</div>
      <div class="carrier-card">
        <div class="carrier-top">
          <div class="carrier-logo"><svg viewBox="0 0 16 16"><path d="M1 8h10M1 5h10M9 3l4 5-4 5"/></svg></div>
          <div><div class="carrier-name">${c.carrier}</div><div class="carrier-svc">${c.modalidade||''}</div></div>
        </div>
        <div class="carrier-fields">
          <div><div class="cf-key">Código do lote/OP</div><div class="cf-val">${c.rastreio||'—'}</div></div>
          <div><div class="cf-key">Prazo original</div><div class="cf-val">${c.prazo||c.eta}</div></div>
          ${c.prazoRev?`<div><div class="cf-key">Prazo revisado</div><div class="cf-val" style="color:var(--warning)">${c.prazoRev}</div></div>`:''}
          <div><div class="cf-key">Movimento</div><div class="cf-val">${c.frete||'—'}</div></div>
          <div><div class="cf-key">Custo/IA</div><div class="cf-val">${c.seguro||'—'}</div></div>
        </div>
      </div>
    </div>
    ${ocEl}`;
}

function exportCurrentNfe() {
  const c = cargos.find(x => x.id === currentDrawerCargoId) || cargos[0];
  if (!c) { showToast('Nenhuma NF-e/OP selecionada para exportar'); return; }
  const items = (c.itens && c.itens.length ? c.itens : ['Sem itens detalhados']).map(item => {
    if (typeof item === 'string') return `<li>${item}</li>`;
    return `<li>${item.name || 'Item'} · <span class="mono">${item.sku || 'sem SKU'}</span> · qtd. ${item.qty || 1}</li>`;
  }).join('');
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${c.nfe || c.id} · F.A.S.T</title>
  <style>
    body{font-family:Arial,sans-serif;color:#1B4965;margin:32px;line-height:1.45}h1{margin:0 0 4px}small{color:#456879}.card{border:1px solid #C8E4EF;border-radius:12px;padding:16px;margin:16px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mono{font-family:monospace;color:#14384F}ul{margin-top:8px}
  </style>
</head>
<body>
  <h1>Espelho de NF-e / Ordem de Produção</h1>
  <small>Exportado pelo F.A.S.T em ${new Date().toLocaleString('pt-BR')}</small>
  <div class="card grid">
    <div><strong>ID</strong><br><span class="mono">${c.id}</span></div>
    <div><strong>NF-e</strong><br><span class="mono">${c.nfe || '—'}</span></div>
    <div><strong>Status</strong><br>${c.statusLabel || c.status}</div>
    <div><strong>Previsão</strong><br>${c.eta || c.prazo || '—'}</div>
  </div>
  <div class="card grid">
    <div><strong>Origem</strong><br>${c.origin || '—'}<br>${c.remetente?.empresa || ''}<br>${c.remetente?.cnpj || ''}</div>
    <div><strong>Destino</strong><br>${c.dest || '—'}<br>${c.destinatario?.nome || ''}<br>${c.destinatario?.cnpj || ''}</div>
  </div>
  <div class="card"><strong>Itens</strong><ul>${items}</ul></div>
  <div class="card"><strong>Responsável</strong><br>${c.carrier || '—'} · ${c.modalidade || '—'}</div>
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
  setTimeout(() => overlay.classList.remove('open'), 300);
}

function switchDTab(id, el) {
  document.querySelectorAll('.dtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.dtab-content').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('dtab-' + id).classList.add('active');
}

// ── QR MODAL ──
var fromScan = true;
var entryDraftItems = [
  {id:'FAR-25KG', name:'Farinha de Trigo 25kg', qty:2, lote:'LT-FAR-0626-A', validade:'2026-07-12', unit:'sacos', price:92.50, cat:'Matéria-prima'},
  {id:'FER-BIO-500', name:'Fermento biológico fresco 500g', qty:2, lote:'LT-FER-0626-C', validade:'2026-06-14', unit:'un', price:11.90, cat:'Matéria-prima'},
  {id:'EMB-PF-1000', name:'Embalagem pão francês 1000un', qty:1, lote:'LT-EMB-0605-A', validade:'2027-01-30', unit:'fardos', price:42.00, cat:'Embalagem'}
];

function renderEntryItems() {
  const el = document.getElementById('entry-items-list');
  if (!el) return;
  el.innerHTML = entryDraftItems.map((it, idx) => `
    <div class="added-item">
      <div class="ai-dot"></div>
      <div class="ai-label">${it.name} · ${it.id} · ${it.lote || 'sem lote'}${it.validade ? ' · validade ' + it.validade.split('-').reverse().join('/') : ''}</div>
      <div class="ai-qty">× ${it.qty}</div>
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
      {name:'validade', label:'Validade', type:'date', value:'2026-07-30'},
      {name:'cat', label:'Categoria', value:'Insumo'},
      {name:'price', label:'Preço unitário', type:'number', value:0, min:0, step:'0.01'}
    ],
    onSubmit(values) {
      const sku = values.sku?.trim().toUpperCase();
      const existing = db.products.find(p => p.id === sku);
      const qty = Number(values.qty);
      if (!sku || !values.name?.trim()) { showToast('⚠️ Informe SKU e nome do item'); return false; }
      if (!qty || qty < 0) { showToast('⚠️ Quantidade inválida'); return false; }
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

function openImportFile() {
  const input = document.getElementById('entry-import-file');
  if (input) input.click();
}

function parseCsvRows(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines.shift().split(sep).map(h => h.trim().toLowerCase());
  return lines.map(line => {
    const cols = line.split(sep).map(c => c.trim());
    const row = {};
    headers.forEach((h,i) => row[h] = cols[i] || '');
    return {
      id:(row.sku || row.id || row.codigo || row.código || '').toUpperCase(),
      name:row.nome || row.produto || row.descricao || row['descrição'] || 'Item importado',
      qty:Number((row.qtd || row.quantidade || row.qty || '1').replace(',','.')) || 1,
      lote:row.lote || row.batch || '',
      validade:row.validade || row.vencimento || row.expires || '',
      unit:row.unidade || row.unit || 'un',
      price:Number((row.preco || row.preço || row.valor || '0').replace(',','.')) || 0,
      cat:row.categoria || row.cat || 'Insumo'
    };
  }).filter(r => r.id);
}

function parseNfeXml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  return [...doc.querySelectorAll('det')].map((det, idx) => {
    const get = tag => det.querySelector(tag)?.textContent?.trim() || '';
    const name = get('xProd') || `Item NF-e ${idx + 1}`;
    return {
      id:(get('cProd') || `NFE-${idx + 1}`).toUpperCase(),
      name,
      qty:Number((get('qCom') || '1').replace(',','.')) || 1,
      lote:get('nLote') || ('NFE-' + Date.now().toString().slice(-6)),
      validade:get('dVal') || '',
      unit:get('uCom') || 'un',
      price:Number((get('vUnCom') || get('vProd') || '0').replace(',','.')) || 0,
      cat:'Importado NF-e'
    };
  });
}

async function handleEntryImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const imported = file.name.toLowerCase().endsWith('.xml') ? parseNfeXml(text) : parseCsvRows(text);
  if (!imported.length) { showToast('⚠️ Nenhum item válido encontrado no arquivo'); return; }
  entryDraftItems = imported;
  fromScan = false;
  msGo('ms4', false);
  renderEntryItems();
  event.target.value = '';
  showToast(`✅ ${imported.length} item(ns) importado(s)`);
}

function openQR() {
  fromScan = true;
  renderEntryItems();
  msGoTo('ms1');
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('open');
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function closeQR() {
  stopCameraScanner();
  const overlay = document.getElementById('modal-overlay');
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
    const pedNum = document.getElementById('fi-id')?.value || ('LT-' + (4900 + cargos.length));
    const empresa = document.getElementById('fi-emp')?.value || 'Fornecedor';
    const tipo = document.querySelector('#ms4 select')?.value || 'Compra de fornecedor';
    const nowLabel = new Date().toLocaleString('pt-BR');
    entryDraftItems.forEach(item => {
      const existing = db.products.find(p => p.id === item.id);
      if (existing) {
        existing.qty += Number(item.qty || 0);
        existing.lote = item.lote || existing.lote;
        existing.validade = item.validade || existing.validade;
        existing.fornecedor = empresa;
        if (item.price) existing.price = item.price;
      } else {
        db.products.push({
          id:item.id, name:item.name, cat:item.cat || 'Insumo', type:'Insumo',
          qty:Number(item.qty || 0), min:5, unit:item.unit || 'un', price:item.price || 0,
          lote:item.lote || 'sem lote', validade:item.validade || '', fornecedor:empresa,
          location:'A definir', dailyUse:0
        });
      }
      db.movements.unshift({
        type:'entrada_lote',
        item:item.name,
        sku:item.id,
        qty:Number(item.qty || 0),
        lote:item.lote || 'sem lote',
        date:nowLabel,
        ref:pedNum,
        note:`${tipo} · ${empresa}`
      });
    });
    const newCargo = {
      id: pedNum,
      title: tipo + ' — ' + empresa,
      status: 'pending', statusLabel: 'Aguardando',
      origin: document.getElementById('fi-uf')?.value || 'SP',
      dest: 'Estoque FEFO',
      carrier: document.querySelector('#ms4 select:last-of-type')?.value || 'Equipe Estoque',
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
  const exactMatch = IV_CATALOG.find(p => p.id.toLowerCase() === String(code).toLowerCase());
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
            <div style="font-size:12px;color:${isActive ? '#1B4965' : 'var(--text-primary)'};font-weight:${isActive ? '500' : '400'}">${name}</div>
            <div style="font-size:10px;font-family:var(--mono);color:var(--text-muted);margin-top:1px">${skuId}</div>
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
  const nowLabel = new Date().toLocaleString('pt-BR');
  // Atualiza estoque real e mapa do armazém
  Object.entries(scanCounts).forEach(([skuId, qty]) => {
    const p = db.products.find(x => x.id === skuId);
    if (p) {
      p.qty += qty;
      db.movements.unshift({
        type:'entrada_scan',
        item:p.name,
        sku:p.id,
        qty,
        lote:p.lote || 'sem lote',
        date:nowLabel,
        ref:'Bipador',
        note:'Contagem confirmada pelo painel de leitura'
      });
    } else {
      const cat = IV_CATALOG.find(x => x.id === skuId);
      if (cat) {
        db.products.push({id:skuId, name:cat.name, cat:cat.cat, qty, min:5, price:0});
        db.movements.unshift({type:'entrada_scan', item:cat.name, sku:skuId, qty, lote:'sem lote', date:nowLabel, ref:'Bipador', note:'SKU criado via leitura'});
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
    <div onclick="event.stopPropagation()" style="
      background:var(--surface);border:1px solid var(--border2);
      border-radius:12px;width:420px;max-height:90vh;overflow:hidden;
      display:flex;flex-direction:column;
      animation:slideUp .3s cubic-bezier(.34,1.56,.64,1);
    ">
      <!-- Header -->
      <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
        <button onclick="document.getElementById('new-product-modal-overlay').remove()"
          style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:transparent;
            cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l8 8M9 1L1 9"/></svg>
        </button>
        <div>
          <div style="font-size:14px;font-weight:500;color:var(--text-primary)">Novo produto bipado</div>
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
          <div style="font-size:14px;font-family:var(--mono);font-weight:600;color:#1B4965;letter-spacing:.5px">${code}</div>
        </div>
      </div>

      <!-- Formulário -->
      <div style="padding:14px 18px;display:flex;flex-direction:column;gap:12px;overflow-y:auto">
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:11px;color:var(--text-muted)">SKU / Código</label>
          <input id="np-sku" value="${code}" style="background:var(--surface2);border:1px solid var(--border2);
            border-radius:var(--r);padding:8px 12px;color:var(--text-primary);font-family:var(--mono);
            font-size:13px;outline:none;letter-spacing:.3px">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:11px;color:var(--text-muted)">Nome do produto *</label>
          <input id="np-name" placeholder="Ex: Farinha de Trigo 25kg" autofocus style="background:var(--surface2);border:1px solid var(--border);
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
  const sku    = (document.getElementById('np-sku')    || {}).value || '';
  const name   = (document.getElementById('np-name')   || {}).value || '';
  const cat    = (document.getElementById('np-cat')    || {}).value || 'Outros';
  const qty    = parseInt((document.getElementById('np-qty') || {}).value) || 1;
  const rua    = (document.getElementById('np-rua')    || {}).value || '';
  const nivel  = (document.getElementById('np-nivel')  || {}).value || '';
  const predio = (document.getElementById('np-predio') || {}).value || '';

  if (!name.trim()) {
    const el = document.getElementById('np-name');
    if (el) { el.style.borderColor='var(--danger)'; el.focus(); }
    showToast('⚠️ Informe o nome do produto');
    return;
  }

  // Adiciona ao catálogo e ao db.products
  const newProd = { id: sku, name: name.trim(), cat, qty, min: 5, price: 0 };
  db.products.push(newProd);
  IV_CATALOG.push({ id: sku, name: name.trim(), cat });

  // Registra na contagem da sessão
  scanCounts[sku] = qty;

  // Atribui posição no armazém se informada
  let posMsg = '';
  if (rua && nivel && predio) {
    const cellId = `R${rua}-N${nivel}-P${predio}`;
    positionProducts[cellId] = { id: sku, name: name.trim() };
    ivSetCellQty(cellId, qty);
    posMsg = ` → ${cellId}`;
  }

  document.getElementById('new-product-modal-overlay').remove();
  renderAll();
  showToast(`✅ "${name}" cadastrado! (${qty} un.)${posMsg}`);

  // Abre o painel de contagem mostrando o novo produto
  openScanCounterPanel({ id: sku, name: name.trim(), cat }, qty);
}

// Animações auxiliares
var scanStyle = document.createElement('style');
scanStyle.textContent = `
  @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes slideDown { from{transform:translateY(0);opacity:1} to{transform:translateY(20px);opacity:0} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
`;
document.head.appendChild(scanStyle);
