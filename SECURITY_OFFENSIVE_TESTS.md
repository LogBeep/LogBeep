# Validação ofensiva Supabase/RLS/RPC

Este documento descreve uma rodada ofensiva para tentar quebrar isolamento multiempresa, integridade de estoque e auditoria append-only. Execute apenas em Supabase de staging ou projeto descartável.

## Pré-requisitos

1. Aplicar `supabase/schema.sql` no Supabase.
2. Criar duas empresas diferentes: Empresa A e Empresa B.
3. Criar dois usuários autenticados: Usuário A e Usuário B.
4. Vincular Usuário A apenas à Empresa A e Usuário B apenas à Empresa B.
5. Criar pelo menos um produto em cada empresa.
6. Para testes de operador, deixe Usuário A com papel `operador`.
7. Nunca use `service_role` neste script; use apenas anon key + login dos usuários.

## Script automatizado ofensivo

O script `scripts/security/offensive-supabase-rls.mjs` executa requests maliciosas via REST/RPC usando tokens reais dos usuários.

```bash
RUN_OFFENSIVE=true \
SUPABASE_URL="https://SEU-PROJETO.supabase.co" \
SUPABASE_ANON_KEY="SUA_ANON_KEY" \
USER_A_EMAIL="operador-a@example.com" \
USER_A_PASSWORD="senha-a" \
USER_B_EMAIL="operador-b@example.com" \
USER_B_PASSWORD="senha-b" \
COMPANY_A_ID="uuid-empresa-a" \
COMPANY_B_ID="uuid-empresa-b" \
PRODUCT_A_ID="SKU-A" \
PRODUCT_B_ID="SKU-B" \
node scripts/security/offensive-supabase-rls.mjs
```

O script é intencionalmente destrutivo em staging: ele cria movimentações pequenas em `PRODUCT_A_ID` para testar RPC, duplicidade e concorrência.

## Cenários cobertos pelo script

| # | Cenário | Resultado esperado |
|---:|---|---|
| 1 | Usuário A lendo produto da Empresa B | 0 linhas ou 401/403/404 |
| 2 | Usuário A editando produto da Empresa B | 0 linhas ou bloqueio |
| 3 | Usuário A movimentando produto da Empresa B via RPC | erro |
| 4 | Usuário A inserindo produto com `company_id` da Empresa B | erro ou 0 linhas |
| 5 | Usuário A inserindo movimento com `user_id` falso | erro |
| 6 | Usuário A alterando próprio `role` | erro ou 0 linhas |
| 7 | Operador fazendo `ajuste_manual` | erro |
| 8 | UPDATE direto em `products.qty` | erro de trigger |
| 9 | INSERT direto em `stock_movements` | erro por falta de policy |
| 10 | UPDATE em `stock_movements` | erro de trigger |
| 11 | DELETE em `stock_movements` | erro de trigger |
| 12 | Saldo negativo | erro |
| 13 | Movement id duplicado | erro por chave primária/idempotência |
| 14 | Duas movimentações concorrentes | saldo final aumenta exatamente 2 |
| 18 | RPC com `p_company_id`/`p_user_id` extras | erro de assinatura ou ignorado sem efeito |

## Testes manuais complementares

### 15. XSS em produto, lote, fornecedor, motivo e importação

Payloads:

```txt
<img src=x onerror=alert(1)>
<script>alert(1)</script>
"><img src=x onerror=alert(1)>
javascript:alert(1)
```

Onde testar:

- nome do produto;
- fornecedor;
- lote;
- motivo de perda/movimentação;
- CSV importado;
- XML importado;
- command palette;
- drawer;
- auditoria;
- exportação/importação.

Resultado esperado: payload aparece como texto ou é sanitizado; nada executa.

### 16. CSV Injection

Payloads:

```txt
=HYPERLINK("http://attacker.test")
+cmd|' /C calc'!A0
-10+20
@SUM(1+1)
```

Resultado esperado: CSV exportado prefixa fórmulas com apóstrofo e escapa aspas/quebras de linha.

### 17. Busca de secrets no repositório

```bash
rg -n "service_role|JWT_SECRET|PRIVATE KEY|BEGIN RSA|SUPABASE_SERVICE|password\s*=|api[_-]?key\s*=|access_token|refresh_token" . -g '!node_modules'
find . -maxdepth 3 -name '.env*' -print
```

Resultado esperado: nenhum segredo real. `SUPABASE_ANON_KEY` em config/example é aceitável apenas como chave pública, mas nunca use `service_role` no frontend.

### 19. `search_path` seguro em SECURITY DEFINER

```bash
rg -n "security definer" supabase/schema.sql
```

Resultado esperado: funções `SECURITY DEFINER` críticas usam `set search_path = public`.

### 20. `stock_movements` só escrito por fluxo seguro

```bash
rg -n "stock_movements_company_insert|upsertRows\('stock_movements'|apply_stock_movement|insert into stock_movements" supabase/schema.sql src/js/api.js src/js/app.js
```

Resultado esperado:

- não existe policy de `INSERT` direto para cliente;
- frontend não faz upsert direto de `stock_movements` para Supabase;
- escrita legítima aparece dentro de `apply_stock_movement`.

## Critério de aprovação para beta fechado

A rodada só passa se:

- todos os testes automatizados retornarem `PASS`;
- os testes manuais de XSS não executarem JavaScript;
- o CSV exportado neutralizar `=`, `+`, `-` e `@`;
- nenhum segredo real aparecer no repositório;
- Usuário A nunca conseguir ler/editar/movimentar dados da Empresa B;
- `stock_movements` não aceitar INSERT/UPDATE/DELETE direto;
- `products.qty` não aceitar UPDATE direto;
- duplicidade e concorrência preservarem consistência.

## Relatório de execução

Preencha a cada rodada real:

```txt
Data:
Ambiente:
Commit:
Supabase project:
Usuário A / Empresa A:
Usuário B / Empresa B:

Testes que passaram:

Testes que falharam:

Vulnerabilidades encontradas:

Correções aplicadas:

Riscos restantes:

Bloqueios para beta fechado:

Bloqueios para produção comercial:
```
