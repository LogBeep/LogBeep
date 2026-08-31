// Dados demonstrativos da padaria usados pelo modo local/demo.
(() => {
const demoDate = (offsetDays=0) => {
  const base = new Date(`${window.FAST_CORE.isoDateInTimeZone()}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
};
const demoDateBr = (offsetDays=0) => window.FAST_CORE.formatDatePtBr(demoDate(offsetDays));

window.FAST_DEMO_DB = {
  products: [
    {id:'FAR-25KG', name:'Farinha de Trigo 25kg', cat:'Matéria-prima', type:'Insumo', qty:18, min:10, unit:'sacos', price:92.50, lote:'LT-FAR-DEMO-A', validade:demoDate(30), fornecedor:'Moinho Paulista', location:'R1-N1-P02', dailyUse:5},
    {id:'FER-BIO-500', name:'Fermento biológico fresco 500g', cat:'Matéria-prima', type:'Insumo refrigerado', qty:9, min:12, unit:'un', price:11.90, lote:'LT-FER-DEMO-C', validade:demoDate(3), fornecedor:'Fermentos Brasil', location:'Câmara fria A', dailyUse:3},
    {id:'OVO-BD-30', name:'Ovos brancos bandeja 30un', cat:'Perecível', type:'Insumo', qty:7, min:8, unit:'bandejas', price:24.80, lote:'LT-OVO-DEMO-B', validade:demoDate(2), fornecedor:'Granja Boa Vista', location:'Câmara fria B', dailyUse:2},
    {id:'LEI-UHT-1L', name:'Leite integral UHT 1L', cat:'Perecível', type:'Insumo', qty:22, min:16, unit:'litros', price:5.40, lote:'LT-LEI-DEMO-D', validade:demoDate(7), fornecedor:'Laticínios Serra', location:'R2-N1-P04', dailyUse:6},
    {id:'MARG-15KG', name:'Margarina culinária 15kg', cat:'Matéria-prima', type:'Insumo', qty:3, min:4, unit:'baldes', price:138.00, lote:'LT-MAR-DEMO-A', validade:demoDate(12), fornecedor:'Laticínios Serra', location:'R2-N2-P01', dailyUse:1},
    {id:'ACU-5KG', name:'Açúcar cristal 5kg', cat:'Matéria-prima', type:'Insumo', qty:14, min:10, unit:'pacotes', price:19.70, lote:'LT-ACU-DEMO-A', validade:demoDate(45), fornecedor:'Distribuidora Doce Minas', location:'R1-N2-P07', dailyUse:2},
    {id:'EMB-PF-1000', name:'Embalagem pão francês 1000un', cat:'Embalagem', type:'Embalagem', qty:6, min:5, unit:'fardos', price:42.00, lote:'LT-EMB-DEMO-A', validade:demoDate(180), fornecedor:'PackFood', location:'R3-N1-P03', dailyUse:1},
    {id:'PAO-FRANCES', name:'Pão francês', cat:'Produto acabado', type:'Venda balcão', qty:420, min:180, unit:'un', price:0.85, lote:'PRD-PF-DEMO-M', validade:demoDate(1), fornecedor:'Produção própria', location:'Balcão 1', dailyUse:0}
  ],
  suppliers: [
    {id:'SUP-MOINHO', name:'Moinho Paulista', cat:'Farinhas', lead:'2 dias', reliability:98, last:demoDateBr(-2)},
    {id:'SUP-FERMENTO', name:'Fermentos Brasil', cat:'Fermentos', lead:'1 dia', reliability:94, last:demoDateBr(-1)},
    {id:'SUP-GRANJA', name:'Granja Boa Vista', cat:'Ovos', lead:'1 dia', reliability:91, last:demoDateBr(0)},
    {id:'SUP-PACK', name:'PackFood', cat:'Embalagens', lead:'3 dias', reliability:96, last:demoDateBr(-5)}
  ],
  recipes: [
    {id:'REC-PF', name:'Pão francês', yield:100, unit:'un', ingredients:[['FAR-25KG',0.2],['FER-BIO-500',0.3],['EMB-PF-1000',0.001]], lossAvg:3.2},
    {id:'REC-PD', name:'Pão doce', yield:60, unit:'un', ingredients:[['FAR-25KG',0.12],['OVO-BD-30',0.08],['LEI-UHT-1L',0.04]], lossAvg:5.1}
  ],
  losses: [
    {reason:'Sobra de balcão', item:'Pão francês', qty:38, cost:32.30},
    {reason:'Vencimento próximo', item:'Fermento biológico', qty:2, cost:23.80}
  ],
  movements: [
    {type:'entrada', item:'Farinha de Trigo 25kg', sku:'FAR-25KG', qty:18, lote:'LT-FAR-DEMO-A', date:demoDateBr(0), ref:'Estoque inicial'},
    {type:'perda', item:'Pão francês', sku:'PAO-FRANCES', qty:38, lote:'PRD-PF-DEMO-M', date:demoDateBr(0), ref:'Sobra de balcão'}
  ]
};

window.FAST_DEMO_CARGOS = [
  {
    id:'OP-2026-00128', title:'Produção: Pão francês — fornada manhã', status:'transit', statusLabel:'Em produção',
    origin:'Masseira', dest:'Forno 2', carrier:'Equipe Panificação', eta:'Hoje · 10:30', steps:[2,3], badges:['b-transit'],
    remetente:{empresa:'Padaria Três Irmãos', cnpj:'12.345.678/0001-90', tel:'(11) 4002-7788'},
    destinatario:{nome:'Balcão e encomendas', endereco:'Área de expedição e loja', cnpj:'—', tel:'—'},
    nfe:'OP-00128', peso:'65', volumes:620, seguro:'Custo estimado R$ 326,40', frete:'—', rastreio:'LOTE-PF-0610-M', modalidade:'Produção interna', prazo:'Hoje 10:30', prazoRev:null, ocorrencia:null,
    itens:[{name:'Farinha de Trigo 25kg', sku:'FAR-25KG', qty:3},{name:'Fermento biológico fresco 500g', sku:'FER-BIO-500', qty:4},{name:'Embalagem pão francês 1000un', sku:'EMB-PF-1000', qty:1}],
    timeline:[{cls:'done',ev:'Ingredientes separados',detail:'FEFO aplicado: farinha LT-FAR-0626-A',time:'06:20'},{cls:'done',ev:'Massa em batimento',detail:'Masseira 01 liberada',time:'06:45'},{cls:'active',ev:'Fermentação controlada',detail:'Temperatura 27°C · umidade OK',time:'Atualizado há 2 min'},{cls:'pending',ev:'Forno e balcão',detail:'Previsão de saída da fornada',time:'10:30'}]
  },
  {
    id:'OP-2026-00127', title:'Produção: Pão doce — vitrine tarde', status:'pending', statusLabel:'Aguardando insumo',
    origin:'Pré-pesagem', dest:'Confeitaria', carrier:'Equipe Confeitaria', eta:'Hoje · 14:00', steps:[1,2], badges:['b-pending'],
    remetente:{empresa:'Padaria Três Irmãos', cnpj:'12.345.678/0001-90', tel:'(11) 4002-7788'}, destinatario:{nome:'Vitrine confeitaria', endereco:'Loja principal', cnpj:'—', tel:'—'},
    nfe:'OP-00127', peso:'22', volumes:180, seguro:'Custo estimado R$ 214,10', frete:'—', rastreio:'LOTE-PD-0610-T', modalidade:'Produção interna', prazo:'Hoje 14:00', prazoRev:null, ocorrencia:'Ovos abaixo do mínimo — validar compra',
    itens:[{name:'Ovos brancos bandeja 30un', sku:'OVO-BD-30', qty:2},{name:'Açúcar cristal 5kg', sku:'ACU-5KG', qty:1},{name:'Leite integral UHT 1L', sku:'LEI-UHT-1L', qty:4}], timeline:[{cls:'done',ev:'Receita planejada',detail:'Rendimento previsto 180 un.',time:'08:10'},{cls:'active',ev:'Aguardando confirmação',detail:'Ovos vencem em 3 dias; priorizar uso',time:'agora'},{cls:'pending',ev:'Produção',detail:'Início após liberação do líder',time:'13:15'}]
  },
  {
    id:'OP-2026-00126', title:'Produção: Bolo simples — encomenda local', status:'delivered', statusLabel:'Finalizado',
    origin:'Confeitaria', dest:'Retirada balcão', carrier:'Equipe Confeitaria', eta:'Hoje · 09:20', steps:[4,4], badges:['b-delivered'],
    remetente:{empresa:'Padaria Três Irmãos', cnpj:'12.345.678/0001-90', tel:'(11) 4002-7788'}, destinatario:{nome:'Cliente balcão', endereco:'Retirada na loja', cnpj:'—', tel:'—'},
    nfe:'OP-00126', peso:'4,5', volumes:6, seguro:'Custo estimado R$ 72,80', frete:'—', rastreio:'LOTE-BOLO-0610-M', modalidade:'Encomenda', prazo:'Hoje 09:20', prazoRev:null, ocorrencia:null,
    itens:[{name:'Farinha de Trigo 25kg', sku:'FAR-25KG', qty:1},{name:'Ovos brancos bandeja 30un', sku:'OVO-BD-30', qty:1},{name:'Margarina culinária 15kg', sku:'MARG-15KG', qty:1}], timeline:[{cls:'done',ev:'Separação',detail:'Ingredientes conferidos',time:'07:00'},{cls:'done',ev:'Assado',detail:'Forno 1 finalizado',time:'08:40'},{cls:'done',ev:'Finalizado',detail:'Disponível para retirada',time:'09:20'}]
  },
  {
    id:'OP-2026-00125', title:'Produção: Salgados assados — almoço', status:'transit', statusLabel:'Em produção',
    origin:'Câmara fria', dest:'Forno 1', carrier:'Equipe Salgados', eta:'Hoje · 11:45', steps:[2,3], badges:['b-transit'],
    remetente:{empresa:'Padaria Três Irmãos', cnpj:'12.345.678/0001-90', tel:'(11) 4002-7788'}, destinatario:{nome:'Vitrine salgados', endereco:'Loja principal', cnpj:'—', tel:'—'},
    nfe:'OP-00125', peso:'18', volumes:220, seguro:'Custo estimado R$ 185,30', frete:'—', rastreio:'LOTE-SALG-0610-A', modalidade:'Produção interna', prazo:'Hoje 11:45', prazoRev:null, ocorrencia:null,
    itens:[{name:'Margarina culinária 15kg', sku:'MARG-15KG', qty:1},{name:'Leite integral UHT 1L', sku:'LEI-UHT-1L', qty:3}], timeline:[{cls:'done',ev:'Recheio liberado',detail:'Câmara fria B',time:'08:00'},{cls:'active',ev:'Modelagem',detail:'Bancada 03',time:'agora'},{cls:'pending',ev:'Forno',detail:'Entrada de insumo programada',time:'11:00'}]
  },
  {
    id:'OP-2026-00124', title:'Compra: reposição de ovos e fermento', status:'pending', statusLabel:'Compra sugerida',
    origin:'Compras', dest:'Fornecedor', carrier:'Granja Boa Vista / Fermentos Brasil', eta:'Aprovar hoje', steps:[0,2], badges:['b-pending'],
    remetente:{empresa:'Padaria Três Irmãos', cnpj:'12.345.678/0001-90', tel:'(11) 4002-7788'}, destinatario:{nome:'Fornecedores homologados', endereco:'Compra recomendada', cnpj:'—', tel:'—'},
    nfe:'PC-00124', peso:'—', volumes:1, seguro:'Regra de reposição · R$ 268,40', frete:'—', rastreio:'COMPRA-DEMO', modalidade:'Compra recomendada', prazo:'Aprovar hoje', prazoRev:null, ocorrencia:'Evita ruptura para produção de amanhã',
    itens:[{name:'Ovos brancos bandeja 30un', sku:'OVO-BD-30', qty:8},{name:'Fermento biológico fresco 500g', sku:'FER-BIO-500', qty:12}], timeline:[{cls:'active',ev:'Sugestão gerada',detail:'Baseada no consumo médio e validade',time:'agora'},{cls:'pending',ev:'Aprovação',detail:'Gerente precisa confirmar compra',time:'hoje'}]
  }
];
})();
