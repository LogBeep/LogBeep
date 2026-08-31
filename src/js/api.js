// Camada de dados local + adaptador Supabase.
// Mantém localStorage como fallback; quando Supabase está configurado, pode sincronizar
// em background ou virar fonte principal de dados sem mudar as chamadas do app.
(function() {
  const STORAGE_KEY = 'fast-padaria-state-v1';
  const SESSION_KEY = 'fast-padaria-supabase-session';
  const COMPANY_KEY = 'fast-padaria-company';
  let syncTimer = null;

  function cloneData(value) { return JSON.parse(JSON.stringify(value)); }
  function config() { return window.FAST_CONFIG || {}; }
  function isSupabaseSource() { return config().DATA_SOURCE === 'supabase'; }
  function hasSupabaseConfig() {
    const cfg = config();
    return Boolean(cfg.SUPABASE_ENABLED && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  }
  function supabasePath(path) {
    const base = String(config().SUPABASE_URL || '').replace(/\/$/, '');
    return `${base}/rest/v1/${path}`;
  }
  function authPath(path) {
    const base = String(config().SUPABASE_URL || '').replace(/\/$/, '');
    return `${base}/auth/v1/${path}`;
  }
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function writeSession(session) {
    localStorage.removeItem(SESSION_KEY);
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
    return session;
  }
  function authToken() { return readSession()?.access_token || config().SUPABASE_ANON_KEY; }
  function hasSession() { return Boolean(readSession()?.access_token); }
  function getCompany() {
    try {
      const saved = JSON.parse(localStorage.getItem(COMPANY_KEY) || 'null');
      if (saved?.id) return saved;
    } catch (_) {}
    const cfg = config();
    if (cfg.COMPANY_ID) return {id: cfg.COMPANY_ID, name: cfg.COMPANY_NAME || 'Padaria'};
    return null;
  }
  function setCompany(company) {
    const saved = {id: company.id, name: company.name || 'Padaria'};
    localStorage.setItem(COMPANY_KEY, JSON.stringify(saved));
    return saved;
  }
  function createLocalCompany(name) {
    const id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString().slice(-12).padStart(12, '0')}`;
    return setCompany({id, name});
  }
  function companyId() { return getCompany()?.id || null; }
  function companyFilter() { return companyId() ? `&company_id=eq.${encodeURIComponent(companyId())}` : ''; }

  async function supabaseFetch(path, options = {}) {
    if (!hasSupabaseConfig()) return null;
    const cfg = config();
    const headers = {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${authToken()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const response = await fetch(supabasePath(path), {...options, headers});
    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Supabase ${response.status}: ${details || response.statusText}`);
    }
    if (response.status === 204) return null;
    return response.json().catch(() => null);
  }

  async function supabaseAuthFetch(path, options = {}) {
    if (!hasSupabaseConfig()) return null;
    const cfg = config();
    const response = await fetch(authPath(path), {
      ...options,
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${authToken()}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Supabase Auth ${response.status}: ${details || response.statusText}`);
    }
    return response.json().catch(() => null);
  }

  function demoState() {
    const db = cloneData(window.FAST_DEMO_DB || {products: [], suppliers: [], recipes: [], losses: [], movements: []});
    db.lots = window.FAST_CORE?.migrateLots?.(db.products, db.lots) || db.lots || [];
    return {
      stateVersion: 2,
      db,
      cargos: cloneData(window.FAST_DEMO_CARGOS || []),
      positionProducts: {},
      allRuasData: {}
    };
  }
  function normalizeState(state) {
    const seed = demoState();
    return {
      db: {
        products: Array.isArray(state?.db?.products) ? state.db.products : seed.db.products,
        suppliers: Array.isArray(state?.db?.suppliers) ? state.db.suppliers : seed.db.suppliers,
        recipes: Array.isArray(state?.db?.recipes) ? state.db.recipes : seed.db.recipes,
        losses: Array.isArray(state?.db?.losses) ? state.db.losses : seed.db.losses,
        movements: Array.isArray(state?.db?.movements) ? state.db.movements : seed.db.movements,
        lots: Array.isArray(state?.db?.lots) ? state.db.lots : seed.db.lots
      },
      cargos: Array.isArray(state?.cargos) ? state.cargos : seed.cargos,
      positionProducts: state?.positionProducts && typeof state.positionProducts === 'object' ? state.positionProducts : {},
      allRuasData: state?.allRuasData && typeof state.allRuasData === 'object' ? state.allRuasData : {},
      stateVersion: 2
    };
  }
  function readLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalizeState(raw ? JSON.parse(raw) : demoState());
    } catch (error) {
      console.warn('F.A.S.T API local: falha ao carregar estado; usando demo.', error);
      return demoState();
    }
  }
  function writeLocalState(state) {
    const normalized = normalizeState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }
  function readState() { return readLocalState(); }
  function writeState(state) {
    const normalized = writeLocalState(state);
    queueSupabaseSync(normalized);
    return normalized;
  }

  function canWriteRemote() {
    return hasSupabaseConfig() && hasSession() && Boolean(companyId());
  }

  function safeDate(value) {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value).slice(0, 10);
    const match = String(value).match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return null;
  }
  function stableId(prefix, value, index) {
    const raw = String(value?.id || value?.sku || value?.lote || value?.ref || value?.date || `${prefix}-${index}`);
    return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || `${prefix}-${index}`;
  }
  function scopedId(value) {
    const raw = String(value || 'item').replace(/[^a-zA-Z0-9._:/-]/g, '-');
    return companyId() ? `${companyId()}::${raw}` : raw;
  }
  function productRow(product) {
    return {id: scopedId(product.id), name: product.name, category: product.cat || product.category || null, type: product.type || null, qty: Number(product.qty || 0), min_qty: Number(product.min || product.min_qty || 0), unit: product.unit || null, price: Number(product.price || 0), lot_code: product.lote || product.lot_code || null, expires_at: safeDate(product.validade || product.expires_at), supplier_name: product.fornecedor || product.supplier_name || null, location: product.location || null, company_id: product.company_id || companyId(), payload: product};
  }
  function supplierRow(supplier) {
    return {id: scopedId(supplier.id), name: supplier.name, category: supplier.cat || supplier.category || null, lead_time_text: supplier.lead || supplier.lead_time_text || null, reliability: supplier.reliability == null ? null : Number(supplier.reliability), last_purchase_text: supplier.last || supplier.last_purchase_text || null, company_id: supplier.company_id || companyId(), payload: supplier};
  }
  function recipeRow(recipe) {
    return {id: scopedId(recipe.id), name: recipe.name, yield_qty: Number(recipe.yield || recipe.yield_qty || 0), yield_unit: recipe.unit || recipe.yield_unit || null, loss_avg: Number(recipe.lossAvg || recipe.loss_avg || 0), company_id: recipe.company_id || companyId(), payload: recipe};
  }
  function ingredientRows(recipe) {
    return (recipe.ingredients || []).map(([productId, qty]) => ({id: scopedId(`${recipe.id}-${productId}`), recipe_id: scopedId(recipe.id), product_id: scopedId(productId), qty: Number(qty || 0), payload: {recipe_id: recipe.id, product_id: productId, qty}}));
  }
  function lotRow(lot) {
    return {id: scopedId(lot.id), company_id: lot.company_id || companyId(), product_id: scopedId(lot.product_id), lot_code: lot.lot_code || 'SEM-LOTE', qty: Number(lot.qty || 0), unit: lot.unit || null, expires_at: safeDate(lot.expires_at), supplier_name: lot.supplier_name || null, location: lot.location || null, status: lot.status || 'active', payload: lot};
  }
  function positionRows(state) {
    return Object.entries(state.positionProducts || {}).map(([id, product]) => {
      const stock = state.db.products.find(item => item.id === product.id);
      const lot = state.db.lots.find(item => item.product_id === product.id && Number(item.qty || 0) > 0);
      return {id: scopedId(id), company_id: companyId(), label:id, zone:id.split('-')[0], product_id:scopedId(product.id), lot_code:lot?.lot_code || null, capacity:800, used:Number(stock?.qty || 0), expires_at:safeDate(lot?.expires_at), payload:{id, product}};
    });
  }
  function movementRow(movement, index = 0) {
    return {id: scopedId(movement.id || stableId('MOV', movement, index)), product_id: scopedId(movement.product_id || movement.sku), company_id: movement.company_id || companyId(), user_id: movement.user_id || null, action_type: movement.action_type || movement.type || 'movimento', type: movement.type || movement.action_type || 'movimento', item: movement.item || null, sku: movement.sku || movement.product_id || null, qty: Number(movement.qty ?? movement.quantity_changed ?? 0), quantity_before: Number(movement.quantity_before ?? 0), quantity_changed: Number(movement.quantity_changed ?? movement.qty ?? 0), quantity_after: Number(movement.quantity_after ?? 0), reason: movement.reason || movement.note || null, lot_code: movement.lote || movement.lot_code || null, reference_code: movement.ref || movement.reference_code || null, note: movement.note || movement.reason || null, occurred_at: safeDate(movement.date) || movement.created_at || new Date().toISOString(), created_at: movement.created_at || new Date().toISOString(), payload: movement};
  }
  function productionOrderRow(order) {
    return {id: scopedId(order.id), title: order.title || order.id, status: order.status || null, status_label: order.statusLabel || order.status_label || null, responsible: order.carrier || order.responsible || null, eta: order.eta || null, lot_code: order.rastreio || order.lote || order.lot_code || null, company_id: order.company_id || companyId(), payload: order};
  }
  function lossRow(loss, index = 0) {
    return {id: scopedId(loss.id || stableId('LOSS', loss, index)), reason: loss.reason || null, item: loss.item || null, sku: loss.sku || null, qty: Number(loss.qty || 0), cost: Number(loss.cost || 0), lot_code: loss.lote || loss.lot_code || null, occurred_at: safeDate(loss.date) || new Date().toISOString(), company_id: loss.company_id || companyId(), payload: loss};
  }
  function rowPayload(row, fallback = {}) { return row?.payload && Object.keys(row.payload).length ? row.payload : fallback; }
  function productFromRow(row) { return rowPayload(row, {id: row.id, name: row.name, cat: row.category, type: row.type, qty: Number(row.qty || 0), min: Number(row.min_qty || 0), unit: row.unit, price: Number(row.price || 0), lote: row.lot_code, validade: row.expires_at, fornecedor: row.supplier_name, location: row.location}); }
  function supplierFromRow(row) { return rowPayload(row, {id: row.id, name: row.name, cat: row.category, lead: row.lead_time_text, reliability: row.reliability, last: row.last_purchase_text}); }
  function recipeFromRow(row) { return rowPayload(row, {id: row.id, name: row.name, yield: row.yield_qty, unit: row.yield_unit, lossAvg: row.loss_avg, ingredients: []}); }
  function movementFromRow(row) { return rowPayload(row, {id: row.id, product_id: row.product_id, company_id: row.company_id, user_id: row.user_id, action_type: row.action_type || row.type, type: row.type || row.action_type, item: row.item, sku: row.sku || row.product_id, qty: Number(row.quantity_changed ?? row.qty ?? 0), quantity_before: Number(row.quantity_before || 0), quantity_changed: Number(row.quantity_changed ?? row.qty ?? 0), quantity_after: Number(row.quantity_after || 0), reason: row.reason, lote: row.lot_code, ref: row.reference_code, date: row.occurred_at}); }
  function orderFromRow(row) { return rowPayload(row, {id: row.id, title: row.title, status: row.status, statusLabel: row.status_label, carrier: row.responsible, eta: row.eta, rastreio: row.lot_code, badges: ['b-pending'], steps: [0, 2], itens: [], timeline: []}); }
  function lossFromRow(row) { return rowPayload(row, {id: row.id, reason: row.reason, item: row.item, sku: row.sku, qty: Number(row.qty || 0), cost: Number(row.cost || 0), lote: row.lot_code, date: row.occurred_at}); }
  function lotFromRow(row) { return rowPayload(row, {id:row.id, product_id:row.product_id, lot_code:row.lot_code, qty:Number(row.qty || 0), unit:row.unit, expires_at:row.expires_at, supplier_name:row.supplier_name, location:row.location, status:row.status}); }
  function positionFromRows(rows) { return Object.fromEntries(rows.map(row => { const payload = rowPayload(row, {id:row.label, product:{id:row.product_id, name:row.product_id}}); return [payload.id || row.label, payload.product || {id:row.product_id, name:row.product_id}]; })); }

  async function ensureCompany() {
    const company = getCompany();
    if (!company || !hasSupabaseConfig() || !hasSession()) return null;
    await supabaseFetch('companies?on_conflict=id', {
      method: 'POST',
      headers: {Prefer: 'resolution=ignore-duplicates,return=minimal'},
      body: JSON.stringify([{id: company.id, name: company.name}])
    });
    const session = readSession();
    const userId = session?.user?.id;
    if (userId) {
      await supabaseFetch('profiles?on_conflict=id', {
        method: 'POST',
        headers: {Prefer: 'resolution=ignore-duplicates,return=minimal'},
        body: JSON.stringify([{id: userId, full_name: session.user?.email || 'Responsável', role: 'dono'}])
      });
      await supabaseFetch('company_members?on_conflict=company_id,user_id', {
        method: 'POST',
        headers: {Prefer: 'resolution=ignore-duplicates,return=minimal'},
        body: JSON.stringify([{company_id: company.id, user_id: userId, role: 'dono'}])
      });
    }
    return company;
  }

  async function upsertRows(table, rows) {
    if (!hasSupabaseConfig() || !rows.length) return null;
    return supabaseFetch(`${table}?on_conflict=id`, {method: 'POST', headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify(rows)});
  }
  async function insertIgnoreRows(table, rows) {
    if (!hasSupabaseConfig() || !rows.length) return null;
    return supabaseFetch(`${table}?on_conflict=id`, {method: 'POST', headers: {Prefer: 'resolution=ignore-duplicates,return=minimal'}, body: JSON.stringify(rows)});
  }
  async function listRows(table, order = 'created_at.desc') {
    const data = await supabaseFetch(`${table}?select=*&order=${encodeURIComponent(order)}${companyFilter()}`);
    return Array.isArray(data) ? data : [];
  }
  async function loadRemoteState() {
    if (!hasSupabaseConfig()) return readLocalState();
    const [products, suppliers, recipes, losses, movements, orders, lots, positions] = await Promise.all([
      listRows('products', 'name.asc'), listRows('suppliers', 'name.asc'), listRows('recipes', 'name.asc'), listRows('losses'), listRows('stock_movements'), listRows('production_orders'), listRows('lots'), listRows('inventory_positions', 'label.asc')
    ]);
    const state = normalizeState({db: {products: products.map(productFromRow), suppliers: suppliers.map(supplierFromRow), recipes: recipes.map(recipeFromRow), losses: losses.map(lossFromRow), movements: movements.map(movementFromRow), lots:lots.map(lotFromRow)}, cargos: orders.map(orderFromRow), positionProducts:positionFromRows(positions)});
    writeLocalState(state);
    return cloneData(state);
  }
  async function syncStateToSupabase(state) {
    if (!hasSupabaseConfig()) return;
    if (!hasSession()) return {ok: false, skipped: 'missing-session'};
    const company = await ensureCompany();
    if (!company) return {ok: false, skipped: 'missing-company'};
    const normalized = normalizeState(state);
    const tasks = [upsertRows('products', normalized.db.products.map(productRow)), upsertRows('suppliers', normalized.db.suppliers.map(supplierRow)), upsertRows('recipes', normalized.db.recipes.map(recipeRow)), upsertRows('recipe_ingredients', normalized.db.recipes.flatMap(ingredientRows)), upsertRows('lots', normalized.db.lots.map(lotRow)), upsertRows('inventory_positions', positionRows(normalized)), upsertRows('losses', normalized.db.losses.map(lossRow)), upsertRows('production_orders', normalized.cargos.map(productionOrderRow))];
    const results = await Promise.allSettled(tasks);
    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length) console.warn('F.A.S.T Supabase: algumas sincronizações falharam.', failed);
    return {ok: failed.length === 0, failed: failed.length};
  }
  function queueSupabaseSync(state) {
    if (!canWriteRemote()) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => syncStateToSupabase(state).catch(error => console.warn('F.A.S.T Supabase: falha ao sincronizar.', error)), 350);
  }
  async function syncNow() { return syncStateToSupabase(readLocalState()); }

  async function logSecurityEvent(event) {
    if (!hasSupabaseConfig()) return null;
    const company = getCompany();
    if (!company) return null;
    return supabaseFetch('rpc/log_security_event', {
      method: 'POST',
      body: JSON.stringify({
        p_company_id: event.company_id || company.id,
        p_event_type: event.event_type,
        p_resource_type: event.resource_type || null,
        p_resource_id: event.resource_id || null,
        p_result: event.result || 'success',
        p_reason: event.reason || null,
        p_payload: event.payload || {},
        p_event_id: event.id || null
      })
    });
  }

  async function ensureRemoteProductSeed(product, quantityBefore = 0) {
    if (!canWriteRemote()) return null;
    await ensureCompany();
    return insertIgnoreRows('products', [productRow({...product, qty: quantityBefore})]);
  }

  async function applyRemoteStockMovement(movement) {
    if (!hasSupabaseConfig()) return null;
    return supabaseFetch('rpc/apply_stock_movement', {
      method: 'POST',
      body: JSON.stringify({
        p_product_id: scopedId(movement.product_id || movement.sku),
        p_action_type: movement.action_type || movement.type,
        p_quantity_changed: Number(movement.quantity_changed ?? movement.qty ?? 0),
        p_reason: movement.reason || movement.note || movement.type || 'Movimentação',
        p_reference_code: movement.ref || movement.reference_code || null,
        p_lot_code: movement.lote || movement.lot_code || null,
        p_movement_id: movement.id ? scopedId(movement.id) : null
      })
    });
  }

  async function removeRemotePosition(positionId) {
    if (!canWriteRemote()) return null;
    return supabaseFetch(`inventory_positions?id=eq.${encodeURIComponent(scopedId(positionId))}${companyFilter()}`, {
      method: 'DELETE',
      headers: {Prefer: 'return=minimal'}
    });
  }

  async function signIn(email, password) {
    const session = await supabaseAuthFetch('token?grant_type=password', {method: 'POST', body: JSON.stringify({email, password})});
    writeSession(session);
    return session;
  }
  async function signOut() {
    if (hasSupabaseConfig() && readSession()) await supabaseAuthFetch('logout', {method: 'POST'}).catch(() => null);
    writeSession(null);
  }
  function getSession() { return readSession(); }

  function listProducts() { return cloneData(readState().db.products); }
  function saveProduct(product) {
    const state = readState();
    const idx = state.db.products.findIndex(p => p.id === product.id);
    if (idx >= 0) state.db.products[idx] = {...state.db.products[idx], ...product}; else state.db.products.push(product);
    writeState(state);
    if (hasSupabaseConfig()) upsertRows('products', [productRow(product)]).catch(error => console.warn('F.A.S.T Supabase: produto não sincronizado.', error));
    return cloneData(product);
  }
  function listMovements() { return cloneData(readState().db.movements); }
  function createMovement(movement) {
    const state = readState();
    const created = {id: movement.id || `MOV-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, date: new Date().toLocaleString('pt-BR'), ...movement};
    state.db.movements.unshift(created);
    writeState(state);
    return cloneData(created);
  }
  function createProductionOrder(order) {
    const state = readState();
    const created = {id: order.id || `OP-${new Date().getFullYear()}-${String(state.cargos.length + 1).padStart(5, '0')}`, status: order.status || 'pending', ...order};
    state.cargos.unshift(created);
    writeState(state);
    if (hasSupabaseConfig()) upsertRows('production_orders', [productionOrderRow(created)]).catch(error => console.warn('F.A.S.T Supabase: OP não sincronizada.', error));
    return cloneData(created);
  }

  window.FAST_API = {STORAGE_KEY, SESSION_KEY, COMPANY_KEY, readState, writeState, readLocalState, writeLocalState, hasSupabaseConfig, isSupabaseSource, supabaseFetch, loadRemoteState, syncStateToSupabase, syncNow, applyRemoteStockMovement, removeRemotePosition, ensureRemoteProductSeed, logSecurityEvent, signIn, signOut, getSession, getCompany, setCompany, createLocalCompany, ensureCompany, listProducts, saveProduct, listMovements, createMovement, createProductionOrder};
  Object.assign(window, {listProducts, saveProduct, listMovements, createMovement, createProductionOrder});
})();
