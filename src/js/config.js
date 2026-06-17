// Configuração local do backend.
// Para ligar o Supabase:
// 1. Crie o projeto no Supabase.
// 2. Rode supabase/schema.sql no SQL Editor.
// 3. Cole URL e anon key abaixo e mude SUPABASE_ENABLED para true.
window.FAST_CONFIG = window.FAST_CONFIG || {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  SUPABASE_SCHEMA: 'public',
  SUPABASE_ENABLED: false
};
