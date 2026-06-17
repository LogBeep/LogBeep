# F.A.S.T — Padaria Inteligente

Dashboard front-end para controle de estoque, FEFO, produção, perdas, auditoria e entrada de insumos de uma padaria.

## Modo atual

O app roda sem build e sem backend obrigatório:

1. Abra `index.html` em um servidor estático ou no GitHub Pages.
2. Os dados iniciais vêm de `src/js/data/demo.js`.
3. As alterações do usuário são persistidas no navegador via `localStorage`.
4. A camada de dados pública fica em `src/js/api.js`, para facilitar a troca futura por backend real.

## Preparar Supabase

A integração Supabase já está preparada como adapter em background. O front continua respondendo instantaneamente com `localStorage`, e quando o Supabase está configurado ele sincroniza produtos, fornecedores, receitas, movimentos, perdas e ordens de produção via REST.

### Passos

1. Crie um projeto no Supabase.
2. Abra o **SQL Editor**.
3. Execute o arquivo `supabase/schema.sql`.
4. Copie `src/js/config.example.js` para `src/js/config.js` se necessário.
5. Preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY` e ligue `SUPABASE_ENABLED: true` em `src/js/config.js`.
6. Recarregue a aplicação.

```js
window.FAST_CONFIG = {
  SUPABASE_URL: 'https://seu-projeto.supabase.co',
  SUPABASE_ANON_KEY: 'sua-anon-key',
  SUPABASE_SCHEMA: 'public',
  SUPABASE_ENABLED: true
};
```

## Observação de segurança

O schema é uma base inicial para desenvolvimento. Antes de produção real, adicione autenticação, multiempresa, RLS e políticas restritivas por usuário/loja.
