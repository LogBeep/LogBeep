# F.A.S.T — Padaria Inteligente

Dashboard front-end para controle de estoque, FEFO, produção, perdas, auditoria e entrada de insumos de uma padaria.

## Modo atual

O app roda sem build e sem backend obrigatório:

1. Abra `index.html` em um servidor estático ou no GitHub Pages.
2. Os dados iniciais vêm de `src/js/data/demo.js`.
3. As alterações do usuário são persistidas no navegador via `localStorage`.
4. A camada de dados pública fica em `src/js/api.js`, para facilitar a troca futura por backend real.

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
5. Use a command palette (`Ctrl/Cmd+K`) e execute **Sincronizar Supabase agora** para reenviar o estado local.

## Login, usuários e RLS

O schema já inclui a base para `companies`, `profiles` e `company_members`, além de políticas iniciais de leitura para usuário autenticado. As tabelas operacionais possuem `company_id`, mas a RLS operacional deve ser endurecida antes de produção para filtrar cada leitura/escrita pela empresa do usuário.

## Observação de segurança

O schema é uma base inicial para desenvolvimento. Antes de produção real, revise as policies, habilite RLS nas tabelas operacionais, adicione onboarding de empresa/usuário e valide permissões por perfil.
