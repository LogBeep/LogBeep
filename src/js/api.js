// Camada de dados local + adaptador Supabase.
// Mantém as assinaturas síncronas usadas pelo front; quando Supabase está configurado,
// grava no localStorage para resposta imediata e sincroniza em background via REST.
(function() {
  const STORAGE_KEY = 'fast-padaria-state-v1';
  let syncTimer = null;

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function config() {
    return window.FAST_CONFIG || {};
  }

  function hasSupabaseConfig() {
    const cfg = config();
    return Boolean(cfg.SUPABASE_ENABLED && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  }

  function supabasePath(path) {
    const base = String(config().SUPABASE_URL || '').replace(/\/$/, '');
    return `${base}/rest/v1/${path}`;
  }

  async function supabaseFetch(path, options = {}) {
    if (!hasSupabaseConfig()) return null;
    const cfg = config();
    const headers = {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
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

  function demoState() {
    return {
      db: cloneData(window.FAST_DEMO_DB || {products: [], suppliers: [], recipes: [], losses: [], movements: []}),
      cargos: cloneData(window.FAST_DEMO_CARGOS || [])
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
        movements: Array.isArray(state?.db?.movements) ? state.db.movements : seed.db.movements
      },
      cargos: Array.isArray(state?.cargos) ? state.cargos : seed.cargos
    };
  }

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalizeState(raw ? JSON.parse(raw) : demoState());
    } catch (error) {
      console.warn('F.A.S.T API local: falha ao carregar estado; usando demo.', error);
      return demoState();
    }
  }

  function writeState(state) {
    const normalized = normalizeState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    queueSupabaseSync(normalized);
    return normalized;
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

  function productRow(product) {
    return {
      id: product.id,
      name: product.name,
      category: product.cat || product.category || null,
      type: product.type || null,
      qty: Number(product.qty || 0),
      min_qty: Number(product.min || product.min_qty || 0),
      unit: product.unit || null,
      price: Number(product.price || 0),
      lot_code: product.lote || product.lot_code || null,
      expires_at: safeDate(product.validade || product.expires_at),
      supplier_name: product.fornecedor || product.supplier_name || null,
      location: product.location || null,
      payload: product
    };
  }

  function supplierRow(supplier) {
    return {
      id: supplier.id,
      name: supplier.name,
      category: supplier.cat || supplier.category || null,
      lead_time_text: supplier.lead || supplier.lead_time_text || null,
      reliability: supplier.reliability == null ? null : Number(supplier.reliability),
      last_purchase_text: supplier.last || supplier.last_purchase_text || null,
      payload: supplier
    };
  }

  function recipeRow(recipe) {
    return {
      id: recipe.id,
      name: recipe.name,
      yield_qty: Number(recipe.yield || recipe.yield_qty || 0),
      yield_unit: recipe.unit || recipe.yield_unit || null,
      loss_avg: Number(recipe.lossAvg || recipe.loss_avg || 0),
      payload: recipe
    };
  }

  function ingredientRows(recipe) {
    return (recipe.ingredients || []).map(([productId, qty]) => ({
      id: `${recipe.id}-${productId}`.replace(/[^a-zA-Z0-9_-]/g, '-'),
      recipe_id: recipe.id,
      product_id: productId,
      qty: Number(qty || 0),
      payload: {recipe_id: recipe.id, product_id: productId, qty}
    }));
  }

  function movementRow(movement, index = 0) {
    return {
      id: movement.id || stableId('MOV', movement, index),
      type: movement.type || 'movimento',
      item: movement.item || null,
      sku: movement.sku || null,
      qty: Number(movement.qty || 0),
      lot_code: movement.lote || movement.lot_code || null,
      reference_code: movement.ref || movement.reference_code || null,
      note: movement.note || movement.reason || null,
      occurred_at: safeDate(movement.date) || new Date().toISOString(),
      payload: movement
    };
  }

  function productionOrderRow(order) {
    return {
      id: order.id,
      title: order.title || order.id,
      status: order.status || null,
      status_label: order.statusLabel || order.status_label || null,
      responsible: order.carrier || order.responsible || null,
      eta: order.eta || null,
      lot_code: order.rastreio || order.lote || order.lot_code || null,
      payload: order
    };
  }

  function lossRow(loss, index = 0) {
    return {
      id: loss.id || stableId('LOSS', loss, index),
      reason: loss.reason || null,
      item: loss.item || null,
      sku: loss.sku || null,
      qty: Number(loss.qty || 0),
      cost: Number(loss.cost || 0),
      lot_code: loss.lote || loss.lot_code || null,
      occurred_at: safeDate(loss.date) || new Date().toISOString(),
      payload: loss
    };
  }

  async function upsertRows(table, rows) {
    if (!hasSupabaseConfig() || !rows.length) return null;
    return supabaseFetch(`${table}?on_conflict=id`, {
      method: 'POST',
      headers: {Prefer: 'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify(rows)
    });
  }

  async function syncStateToSupabase(state) {
    if (!hasSupabaseConfig()) return;
    const normalized = normalizeState(state);
    const recipes = normalized.db.recipes.map(recipeRow);
    const recipeIngredients = normalized.db.recipes.flatMap(ingredientRows);
    const tasks = [
      upsertRows('products', normalized.db.products.map(productRow)),
      upsertRows('suppliers', normalized.db.suppliers.map(supplierRow)),
      upsertRows('recipes', recipes),
      upsertRows('recipe_ingredients', recipeIngredients),
      upsertRows('losses', normalized.db.losses.map(lossRow)),
      upsertRows('stock_movements', normalized.db.movements.map(movementRow)),
      upsertRows('production_orders', normalized.cargos.map(productionOrderRow))
    ];
    const results = await Promise.allSettled(tasks);
    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length) console.warn('F.A.S.T Supabase: algumas sincronizações falharam.', failed);
  }

  function queueSupabaseSync(state) {
    if (!hasSupabaseConfig()) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      syncStateToSupabase(state).catch(error => console.warn('F.A.S.T Supabase: falha ao sincronizar.', error));
    }, 350);
  }

  function listProducts() {
    return cloneData(readState().db.products);
  }

  function saveProduct(product) {
    const state = readState();
    const idx = state.db.products.findIndex(p => p.id === product.id);
    if (idx >= 0) state.db.products[idx] = {...state.db.products[idx], ...product};
    else state.db.products.push(product);
    writeState(state);
    if (hasSupabaseConfig()) upsertRows('products', [productRow(product)]).catch(error => console.warn('F.A.S.T Supabase: produto não sincronizado.', error));
    return cloneData(product);
  }

  function listMovements() {
    return cloneData(readState().db.movements);
  }

  function createMovement(movement) {
    const state = readState();
    const created = {
      id: movement.id || `MOV-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      date: new Date().toLocaleString('pt-BR'),
      ...movement
    };
    state.db.movements.unshift(created);
    writeState(state);
    if (hasSupabaseConfig()) upsertRows('stock_movements', [movementRow(created)]).catch(error => console.warn('F.A.S.T Supabase: movimento não sincronizado.', error));
    return cloneData(created);
  }

  function createProductionOrder(order) {
    const state = readState();
    const created = {
      id: order.id || `OP-${new Date().getFullYear()}-${String(state.cargos.length + 1).padStart(5, '0')}`,
      status: order.status || 'pending',
      ...order
    };
    state.cargos.unshift(created);
    writeState(state);
    if (hasSupabaseConfig()) upsertRows('production_orders', [productionOrderRow(created)]).catch(error => console.warn('F.A.S.T Supabase: OP não sincronizada.', error));
    return cloneData(created);
  }

  window.FAST_API = {
    STORAGE_KEY,
    readState,
    writeState,
    hasSupabaseConfig,
    supabaseFetch,
    syncStateToSupabase,
    listProducts,
    saveProduct,
    listMovements,
    createMovement,
    createProductionOrder
  };

  Object.assign(window, {
    listProducts,
    saveProduct,
    listMovements,
    createMovement,
    createProductionOrder
  });
})();
