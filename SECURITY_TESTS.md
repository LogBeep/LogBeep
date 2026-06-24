# Testes de segurança — integridade de estoque e auditoria

## 1. Usuário A não acessa empresa B

1. Criar usuário A e empresa A.
2. Criar usuário B e empresa B.
3. Com usuário A logado, tentar consultar REST `products`, `stock_movements`, `losses` e `production_orders` filtrando IDs conhecidos da empresa B.
4. Resultado esperado: zero linhas ou erro de permissão.

## 2. Usuário comum não altera estoque sem permissão

1. Logar com usuário que não pertence à empresa do produto.
2. Tentar inserir `stock_movements` com `company_id` de outra empresa.
3. Tentar chamar `apply_stock_movement` para produto de outra empresa.
4. Resultado esperado: erro de permissão por RLS/função.

## 3. `stock_movements` é append-only

1. Inserir uma movimentação válida.
2. Tentar executar `update stock_movements set quantity_changed = 999 where id = ...`.
3. Tentar executar `delete from stock_movements where id = ...`.
4. Resultado esperado: trigger `prevent_stock_movement_mutation` bloqueia update/delete.

## 4. `products.qty` não é alterado diretamente

1. Tentar atualizar `products.qty` diretamente via REST ou SQL autenticado.
2. Resultado esperado: trigger `products_no_direct_qty_update` bloqueia a alteração.
3. Chamar `apply_stock_movement` com quantidade válida.
4. Resultado esperado: `products.qty` muda e uma linha é criada em `stock_movements` com saldo antes/depois.

## 5. CSV Injection

1. Criar produto/movimento com nome começando por `=`, `+`, `-` ou `@`.
2. Exportar CSV.
3. Resultado esperado: valor exportado começa com apóstrofo para impedir fórmula em planilha.

## 6. XSS em campos importados

1. Importar CSV/XML com nome/lote contendo `<img src=x onerror=alert(1)>`.
2. Navegar por estoque, perdas, auditoria e drawer.
3. Resultado esperado: conteúdo aparece como texto escapado, sem execução de script.

## 7. Exportação exige sessão e gera log

1. Ativar `DATA_SOURCE: 'supabase'`.
2. Tentar exportar CSV sem sessão.
3. Resultado esperado: login exigido.
4. Exportar com sessão válida.
5. Resultado esperado: evento `export_csv` aparece em `security_events`.

## 8. Importação limitada e auditada

1. Tentar importar arquivo maior que 512 KB.
2. Tentar importar extensão diferente de `.csv`/`.xml`.
3. Tentar importar mais de 250 linhas.
4. Resultado esperado: arquivo rejeitado ou truncado no limite seguro.
5. Importar arquivo válido.
6. Resultado esperado: evento `import_file` aparece em `security_events`.

## 9. Stock movement direto deve falhar

1. Com token autenticado, tentar `POST /rest/v1/stock_movements` diretamente.
2. Resultado esperado: bloqueado por ausência de policy de INSERT direta; use apenas `rpc/apply_stock_movement`.

## 10. RBAC mínimo para ajuste manual

1. Logar como operador.
2. Chamar `apply_stock_movement` com `p_action_type = 'ajuste_manual'`.
3. Resultado esperado: erro de permissão.
4. Repetir como gerente/admin/dono.
5. Resultado esperado: permitido se usuário pertence à empresa.
