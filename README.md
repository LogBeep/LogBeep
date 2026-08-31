# F.A.S.T — Padaria Inteligente

Aplicação web para controle de estoque por produto e lote, PVPS/FEFO, endereçamento físico R-N-P, produção, perdas, auditoria e entrada de insumos de uma padaria.

## O que está implementado

- estoque agregado por SKU com lotes independentes e validade real;
- baixa PVPS/FEFO atômica para produção, perdas e ajustes;
- entrada manual, CSV, XML de NF-e, QR Code e bipador;
- mapa de posições com persistência local e sincronização remota;
- recomendações explicáveis por validade, mínimo e falta de endereço;
- trilha auditável, exportação CSV e backup JSON;
- interface responsiva, acessível por teclado e instalável como PWA;
- modo offline/local e integração opcional com Supabase, autenticação e RLS.

## Modo atual

O app roda sem build e sem backend obrigatório:

1. Abra `index.html` em um servidor estático ou no GitHub Pages.
2. Os dados iniciais vêm de `src/js/data/demo.js`.
3. As alterações do usuário são persistidas no navegador via `localStorage`.
4. Sem login, o site continua funcional em modo local/offline. Ao entrar, passa a usar o fluxo remoto configurado.
5. O service worker mantém o app shell disponível sem conexão e busca a versão mais recente quando há rede.

## Preparar Supabase

A integração Supabase já está preparada como adapter. O front continua respondendo instantaneamente com `localStorage`; quando o Supabase está configurado, ele pode sincronizar em background ou carregar o banco remoto como fonte principal.

### Passos

1. Crie um projeto no Supabase.
2. Abra o **SQL Editor**.
3. Execute o arquivo `supabase/schema.sql`.
4. Copie `src/js/config.example.js` para `src/js/config.js` se necessário.
5. Preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY` e ligue `SUPABASE_ENABLED: true` em `src/js/config.js`.
6. Use `DATA_SOURCE: 'local'` para demo/offline ou `DATA_SOURCE: 'supabase'` para carregar dados remotos ao abrir.
7. Recarregue a aplicação.

```js
window.FAST_CONFIG = {
  SUPABASE_URL: 'https://seu-projeto.supabase.co',
  SUPABASE_ANON_KEY: 'sua-anon-key',
  SUPABASE_SCHEMA: 'public',
  SUPABASE_ENABLED: true,
  DATA_SOURCE: 'supabase'
};
```

## Validação ponta a ponta

Depois de configurar o Supabase:

1. Abra o app e registre uma entrada de insumo.
2. Confira se a linha aparece em `products` e `stock_movements` no Supabase.
3. Registre uma produção e confira se aparecem registros em `production_orders` e `stock_movements`.
4. Registre uma perda/descarte e confira `losses`.
5. Use o botão visível **Sincronizar agora** ou a command palette (`Ctrl/Cmd+K`) e execute **Sincronizar Supabase agora** para reenviar o estado local.
6. Confirme se o status no header muda para Supabase conectado ou erro de conexão.

### Se aparecer 403 ao sincronizar

Erros `403 (Forbidden)` em `products`, `suppliers`, `recipes`, `losses` ou `production_orders` normalmente indicam tentativa de gravar antes de login/vínculo de empresa ou antes de aplicar `supabase/schema.sql`. O app não deve enviar dados demo para Supabase sem sessão e empresa configuradas. Após login, confirme a empresa no modal inicial e rode **Sincronizar agora**.

## Login, usuários e RLS

O schema inclui `companies`, `profiles` e `company_members`, RLS por `company_id`, papéis permitidos e RPC auditável de estoque. Sem sessão, as ações ficam no dispositivo; após o login, a primeira sessão cria o vínculo da padaria e o primeiro membro recebe o papel `dono`.

## Observação de segurança

Antes de produção real, execute os testes ofensivos com dois usuários e duas empresas, valide o processo de convite/onboarding e mantenha as chaves administrativas exclusivamente no servidor.

## Segurança de estoque e auditoria

O fluxo seguro de estoque deve usar movimentações auditáveis em vez de alteração direta de `products.qty`. No banco, `stock_movements` é append-only por trigger e `products.qty` deve ser alterado via função `apply_stock_movement`, que registra saldo antes, alteração, saldo depois, usuário, empresa, motivo e data. Consulte `SECURITY_TESTS.md` para o checklist manual de validação.

### Reforços adicionais de segurança

A exportação CSV agora exige sessão em modo Supabase e tenta registrar evento `export_csv`. Importações CSV/XML possuem limite de tamanho, extensão e quantidade de linhas, além de evento `import_file`. A tabela `stock_movements` não deve aceitar insert direto do cliente; use a RPC `apply_stock_movement`, que valida empresa, papel e saldo.

## Testes

Com Node.js disponível:

```bash
npm test
npm run check
```

A suíte cobre cálculo de validade por fuso horário, alocação FEFO, atomicidade de perdas, CSV com campos entre aspas, validação de SKU, scanner sem contagem duplicada, retorno de sincronização, PWA, semântica básica e proteções do RPC.
