// Camada de dados local/fake. A próxima troca natural é substituir estas funções
// por chamadas Supabase mantendo a mesma assinatura pública.
(function() {
  const STORAGE_KEY = 'fast-padaria-state-v1';

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
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
    return normalized;
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
    return cloneData(product);
  }

  function listMovements() {
    return cloneData(readState().db.movements);
  }

  function createMovement(movement) {
    const state = readState();
    const created = {
      date: new Date().toLocaleString('pt-BR'),
      ...movement
    };
    state.db.movements.unshift(created);
    writeState(state);
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
    return cloneData(created);
  }

  window.FAST_API = {
    STORAGE_KEY,
    readState,
    writeState,
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
