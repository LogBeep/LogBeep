(function initFastCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FAST_CORE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function fastCoreFactory() {
  'use strict';

  const OPERATION_TIME_ZONE = 'America/Sao_Paulo';
  const SEVERITY_ORDER = {critical: 0, high: 1, medium: 2, info: 3};

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function calendarParts(value, timeZone = OPERATION_TIME_ZONE) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {year: Number(map.year), month: Number(map.month), day: Number(map.day)};
  }

  function parseIsoDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return {year, month, day};
  }

  function partsToUtc(parts) {
    return Date.UTC(parts.year, parts.month - 1, parts.day);
  }

  function daysToExpire(expiresAt, now = new Date(), timeZone = OPERATION_TIME_ZONE) {
    const expiry = parseIsoDate(expiresAt);
    const today = calendarParts(now, timeZone);
    if (!expiry || !today) return null;
    return Math.round((partsToUtc(expiry) - partsToUtc(today)) / 86400000);
  }

  function isoDateInTimeZone(value = new Date(), timeZone = OPERATION_TIME_ZONE) {
    const parts = calendarParts(value, timeZone);
    if (!parts) return '';
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  function formatDatePtBr(value) {
    const parts = parseIsoDate(String(value || '').slice(0, 10));
    if (!parts) return '—';
    return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
  }

  function normalizeMultilineText(value) {
    return String(value ?? '').replace(/\\n/g, '\n');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[character]);
  }

  function sanitizeText(value, maxLength = 180) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, maxLength);
  }

  function validateSku(value) {
    const normalized = sanitizeText(value, 64).toUpperCase();
    if (!normalized || !/^[A-Z0-9][A-Z0-9._:/-]{0,63}$/.test(normalized)) {
      return {ok: false, value: '', error: 'Código inválido. Use letras, números, ponto, hífen, barra ou dois-pontos.'};
    }
    return {ok: true, value: normalized, error: ''};
  }

  function normalizeHeader(value) {
    return sanitizeText(value, 80).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function parseDelimited(text, separator) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const source = String(text || '').replace(/^\uFEFF/, '');

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      const next = source[index + 1];
      if (quoted) {
        if (character === '"' && next === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
        continue;
      }
      if (character === '"') {
        quoted = true;
      } else if (character === separator) {
        row.push(field);
        field = '';
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && next === '\n') index += 1;
        row.push(field);
        if (row.some(cell => String(cell).trim())) rows.push(row);
        row = [];
        field = '';
      } else {
        field += character;
      }
    }
    row.push(field);
    if (row.some(cell => String(cell).trim())) rows.push(row);
    return rows;
  }

  function inferSeparator(text) {
    const firstRecord = String(text || '').split(/\r?\n/, 1)[0];
    let semicolons = 0;
    let commas = 0;
    let quoted = false;
    for (let index = 0; index < firstRecord.length; index += 1) {
      if (firstRecord[index] === '"') quoted = !quoted;
      else if (!quoted && firstRecord[index] === ';') semicolons += 1;
      else if (!quoted && firstRecord[index] === ',') commas += 1;
    }
    return semicolons >= commas ? ';' : ',';
  }

  function parseLocaleNumber(value, fallback = 0) {
    let normalized = sanitizeText(value, 40).replace(/\s/g, '');
    if (normalized.includes(',') && normalized.includes('.')) {
      normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
    } else if (normalized.includes(',')) {
      normalized = normalized.replace(',', '.');
    }
    const number = Number(normalized);
    return Number.isFinite(number) ? number : fallback;
  }

  function parseCsvRows(text, maxRows = 250) {
    const matrix = parseDelimited(text, inferSeparator(text));
    if (matrix.length < 2) return [];
    const headers = matrix.shift().map(normalizeHeader);
    return matrix.slice(0, maxRows).map(columns => {
      const row = Object.fromEntries(headers.map((header, index) => [header, sanitizeText(columns[index] || '', 240)]));
      const sku = validateSku(row.sku || row.id || row.codigo || '');
      if (!sku.ok) return null;
      return {
        id: sku.value,
        name: sanitizeText(row.nome || row.produto || row.descricao || 'Item importado'),
        qty: Math.max(0, parseLocaleNumber(row.qtd || row.quantidade || row.qty || '1', 1)),
        lote: sanitizeText(row.lote || row.batch || '', 80),
        validade: sanitizeText(row.validade || row.vencimento || row.expires || '', 20),
        unit: sanitizeText(row.unidade || row.unit || 'un', 24),
        price: Math.max(0, parseLocaleNumber(row.preco || row.valor || '0', 0)),
        cat: sanitizeText(row.categoria || row.cat || 'Insumo', 80)
      };
    }).filter(Boolean);
  }

  function lotSortValue(lot) {
    const expiry = parseIsoDate(lot.expires_at || lot.validade);
    return expiry ? partsToUtc(expiry) : Number.MAX_SAFE_INTEGER;
  }

  function allocateFefo(lots, productId, requestedQuantity) {
    const quantity = Number(requestedQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantidade inválida para movimentação FEFO.');
    const nextLots = clone(Array.isArray(lots) ? lots : []);
    const candidates = nextLots
      .filter(lot => lot.product_id === productId && Number(lot.qty || 0) > 0)
      .sort((left, right) => lotSortValue(left) - lotSortValue(right) || String(left.lot_code || '').localeCompare(String(right.lot_code || '')));
    const available = candidates.reduce((sum, lot) => sum + Number(lot.qty || 0), 0);
    if (available < quantity) throw new Error(`Saldo insuficiente: ${available} disponível, ${quantity} solicitado.`);

    let remaining = quantity;
    const allocations = [];
    for (const lot of candidates) {
      if (remaining <= 0) break;
      const consumed = Math.min(Number(lot.qty || 0), remaining);
      lot.qty = Number((Number(lot.qty || 0) - consumed).toFixed(3));
      remaining = Number((remaining - consumed).toFixed(3));
      allocations.push({lotId: lot.id, lotCode: lot.lot_code || lot.lote || 'sem lote', quantity: consumed});
    }
    return {lots: nextLots, allocations};
  }

  function makeLotId(productId, lotCode) {
    const safeProduct = validateSku(productId);
    if (!safeProduct.ok) throw new Error(safeProduct.error);
    const safeLot = sanitizeText(lotCode || 'SEM-LOTE', 80).replace(/[^A-Za-z0-9._:/-]/g, '-').toUpperCase() || 'SEM-LOTE';
    return `${safeProduct.value}::${safeLot}`;
  }

  function upsertLot(lots, input) {
    const product = validateSku(input.product_id || input.sku);
    if (!product.ok) throw new Error(product.error);
    const quantity = Number(input.qty || 0);
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Quantidade de lote inválida.');
    const lotCode = sanitizeText(input.lot_code || input.lote || 'SEM-LOTE', 80) || 'SEM-LOTE';
    const id = input.id || makeLotId(product.value, lotCode);
    const nextLots = clone(Array.isArray(lots) ? lots : []);
    const index = nextLots.findIndex(lot => lot.id === id || (lot.product_id === product.value && lot.lot_code === lotCode));
    const record = {
      id,
      product_id: product.value,
      lot_code: lotCode,
      qty: quantity,
      unit: sanitizeText(input.unit || 'un', 24),
      expires_at: parseIsoDate(input.expires_at || input.validade) ? String(input.expires_at || input.validade).slice(0, 10) : '',
      supplier_name: sanitizeText(input.supplier_name || input.fornecedor || '', 180),
      location: sanitizeText(input.location || '', 80),
      status: sanitizeText(input.status || 'active', 24)
    };
    if (index >= 0) nextLots[index] = {...nextLots[index], ...record, qty: Number((Number(nextLots[index].qty || 0) + quantity).toFixed(3))};
    else nextLots.push(record);
    return nextLots;
  }

  function migrateLots(products, existingLots) {
    if (Array.isArray(existingLots) && existingLots.length) return clone(existingLots);
    return (Array.isArray(products) ? products : []).filter(product => Number(product.qty || 0) > 0).map(product => ({
      id: makeLotId(product.id, product.lote || 'SEM-LOTE'),
      product_id: product.id,
      lot_code: product.lote || 'SEM-LOTE',
      qty: Number(product.qty || 0),
      unit: product.unit || 'un',
      expires_at: parseIsoDate(product.validade) ? product.validade : '',
      supplier_name: product.fornecedor || '',
      location: product.location || '',
      status: 'active'
    }));
  }

  function earliestLot(lots, productId) {
    return clone((Array.isArray(lots) ? lots : [])
      .filter(lot => lot.product_id === productId && Number(lot.qty || 0) > 0)
      .sort((left, right) => lotSortValue(left) - lotSortValue(right))[0] || null);
  }

  function buildLotTraceability(lots, products, now = new Date(), timeZone = OPERATION_TIME_ZONE) {
    const productMap = new Map((Array.isArray(products) ? products : []).map(product => [product.id, product]));
    return (Array.isArray(lots) ? lots : [])
      .filter(lot => Number(lot.qty || 0) > 0)
      .map(lot => {
        const product = productMap.get(lot.product_id) || {};
        const expiryDays = daysToExpire(lot.expires_at, now, timeZone);
        let urgency = 'ok';
        if (expiryDays === null) urgency = 'unknown';
        else if (expiryDays <= 3) urgency = 'critical';
        else if (expiryDays <= 7) urgency = 'attention';

        const supplier = sanitizeText(lot.supplier_name || product.fornecedor || '—', 180) || '—';
        const isFinishedProduct = product.cat === 'Produto acabado' || /produ[cç][aã]o/i.test(supplier);
        return {
          id: lot.id || `${lot.product_id || 'SEM-SKU'}::${lot.lot_code || 'SEM-LOTE'}`,
          lotCode: sanitizeText(lot.lot_code || lot.lote || 'SEM-LOTE', 80) || 'SEM-LOTE',
          productId: sanitizeText(lot.product_id || product.id || '', 64),
          productName: sanitizeText(product.name || lot.product_id || 'Produto', 180) || 'Produto',
          category: sanitizeText(product.cat || '', 80),
          quantity: Number(lot.qty || 0),
          unit: sanitizeText(lot.unit || product.unit || 'un', 24) || 'un',
          expiresAt: parseIsoDate(lot.expires_at) ? lot.expires_at : '',
          expiryDays,
          urgency,
          supplier,
          location: sanitizeText(lot.location || product.location || 'Sem posição', 80) || 'Sem posição',
          origin: isFinishedProduct ? 'Produção interna' : 'Entrada de insumo'
        };
      })
      .sort((left, right) => {
        const leftDays = left.expiryDays === null ? Number.POSITIVE_INFINITY : left.expiryDays;
        const rightDays = right.expiryDays === null ? Number.POSITIVE_INFINITY : right.expiryDays;
        return leftDays - rightDays || left.lotCode.localeCompare(right.lotCode, 'pt-BR');
      });
  }

  function buildDashboardSnapshot(products, orders, now = new Date(), timeZone = OPERATION_TIME_ZONE) {
    const productList = Array.isArray(products) ? products : [];
    const orderList = Array.isArray(orders) ? orders : [];
    const coverageTargetDays = 7;
    const coverage = productList
      .filter(product => Number(product.dailyUse || 0) > 0)
      .map(product => {
        const days = Number((Number(product.qty || 0) / Number(product.dailyUse)).toFixed(1));
        const state = days < 3 ? 'critical' : (days < coverageTargetDays ? 'attention' : 'healthy');
        return {
          id: sanitizeText(product.id || '', 64),
          name: sanitizeText(product.name || product.id || 'Produto', 180),
          days,
          state
        };
      })
      .sort((left, right) => left.days - right.days || left.name.localeCompare(right.name, 'pt-BR'));

    const criticalStock = productList.filter(product => Number(product.qty || 0) < Number(product.min || 0)).length;
    const expiringSoon = productList.filter(product => {
      const days = daysToExpire(product.validade || product.expires_at, now, timeZone);
      return days !== null && days <= 7;
    }).length;
    const lossRiskValue = productList.reduce((total, product) => {
      const days = daysToExpire(product.validade || product.expires_at, now, timeZone);
      return days !== null && days <= 3
        ? total + (Number(product.qty || 0) * Number(product.price || 0))
        : total;
    }, 0);
    const healthyProducts = productList.filter(product => {
      const days = daysToExpire(product.validade || product.expires_at, now, timeZone);
      return Number(product.qty || 0) >= Number(product.min || 0) && (days === null || days > 7);
    }).length;
    const priorityProducts = productList.filter(product => {
      const days = daysToExpire(product.validade || product.expires_at, now, timeZone);
      return Number(product.qty || 0) < Number(product.min || 0) || (days !== null && days <= 7);
    }).length;
    const pendingOrders = orderList.filter(order => order.status === 'pending').length;
    const averageCoverageDays = coverage.length
      ? Number((coverage.reduce((total, item) => total + item.days, 0) / coverage.length).toFixed(1))
      : 0;

    return {
      activeProducts: productList.filter(product => Number(product.qty || 0) > 0).length,
      criticalStock,
      expiringSoon,
      inProduction: orderList.filter(order => order.status === 'transit').length,
      pendingOrders,
      priorityCount: priorityProducts + pendingOrders,
      lossRiskValue: Number(lossRiskValue.toFixed(2)),
      healthPercent: productList.length ? Math.round((healthyProducts / productList.length) * 100) : 100,
      coverageTargetDays,
      coverage,
      minimumCoverageDays: coverage.length ? coverage[0].days : 0,
      averageCoverageDays
    };
  }

  function prepareLoss(product, requestedQuantity, values = {}, now = new Date()) {
    const quantity = Number(requestedQuantity);
    const available = Number(product?.qty || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantidade inválida.');
    if (quantity > available) throw new Error(`Saldo insuficiente para ${product?.name || product?.id || 'produto'}.`);
    const reason = sanitizeText(values.reason || 'Perda operacional', 120);
    const date = new Intl.DateTimeFormat('pt-BR', {timeZone: OPERATION_TIME_ZONE}).format(now);
    return {
      nextQuantity: Number((available - quantity).toFixed(3)),
      loss: {
        reason,
        item: sanitizeText(product.name || product.id),
        sku: product.id,
        lote: sanitizeText(values.lote || product.lote || 'sem lote', 80),
        qty: quantity,
        cost: Number((quantity * Number(product.price || 0)).toFixed(2)),
        date,
        responsible: sanitizeText(values.responsible || '—', 120),
        note: sanitizeText(values.note || '', 240)
      },
      movement: {quantityChanged: -quantity, reason}
    };
  }

  function prepareNewScannedProduct(input) {
    const sku = validateSku(input.sku || input.id);
    if (!sku.ok) throw new Error(sku.error);
    const name = sanitizeText(input.name, 180);
    if (!name) throw new Error('Nome do produto é obrigatório.');
    return {id: sku.value, name, cat: sanitizeText(input.cat || 'Outros', 80), qty: 0, min: 5, price: 0, unit: sanitizeText(input.unit || 'un', 24)};
  }

  function isSyncSuccessful(result) {
    return Boolean(result && result.ok === true && Number(result.failed || 0) === 0);
  }

  function buildRecommendations(products, options = {}) {
    const now = options.now || new Date();
    const recommendations = [];
    for (const product of Array.isArray(products) ? products : []) {
      const expiryDays = daysToExpire(product.validade || product.expires_at, now, options.timeZone || OPERATION_TIME_ZONE);
      const quantity = Number(product.qty || 0);
      const minimum = Number(product.min || product.min_qty || 0);
      const name = sanitizeText(product.name || product.id, 180);
      if (expiryDays !== null && expiryDays < 0) {
        recommendations.push({id: `expired-${product.id}`, severity: 'critical', title: `Bloquear ${name}`, reason: `Lote vencido há ${Math.abs(expiryDays)} dia(s).`, action: 'Segregar o lote e registrar descarte ou avaliação responsável.', productId: product.id});
      } else if (expiryDays !== null && expiryDays <= 3) {
        recommendations.push({id: `expiry-${product.id}`, severity: 'high', title: `Priorizar ${name}`, reason: `Validade em ${expiryDays} dia(s).`, action: 'Aplicar PVPS/FEFO na próxima separação.', productId: product.id});
      }
      if (minimum > 0 && quantity < minimum) {
        recommendations.push({id: `stock-${product.id}`, severity: quantity <= minimum * 0.3 ? 'critical' : 'high', title: `Repor ${name}`, reason: `Estoque abaixo do minimo: ${quantity} de ${minimum}.`, action: 'Revisar consumo e criar solicitação de reposição.', productId: product.id});
      }
      if (!sanitizeText(product.location || '', 80)) {
        recommendations.push({id: `location-${product.id}`, severity: 'medium', title: `Endereçar ${name}`, reason: 'Produto sem endereco físico cadastrado.', action: 'Definir Rua, Nível e Posição no Mapa FEFO.', productId: product.id});
      }
    }
    return recommendations.sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] || left.title.localeCompare(right.title, 'pt-BR'));
  }

  return {
    OPERATION_TIME_ZONE,
    allocateFefo,
    buildDashboardSnapshot,
    buildLotTraceability,
    buildRecommendations,
    daysToExpire,
    earliestLot,
    escapeHtml,
    formatDatePtBr,
    isSyncSuccessful,
    isoDateInTimeZone,
    makeLotId,
    migrateLots,
    normalizeMultilineText,
    parseCsvRows,
    prepareLoss,
    prepareNewScannedProduct,
    sanitizeText,
    upsertLot,
    validateSku
  };
});
