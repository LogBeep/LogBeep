// Configuração local do backend.
// Para ligar o Supabase:
// 1. Crie o projeto no Supabase.
// 2. Rode supabase/schema.sql no SQL Editor.
// 3. Cole URL e anon key abaixo, mude SUPABASE_ENABLED para true
//    e use DATA_SOURCE: 'supabase' quando quiser carregar dados remotos ao abrir.
window.FAST_CONFIG = window.FAST_CONFIG || {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  SUPABASE_SCHEMA: 'public',
  SUPABASE_ENABLED: false,
  DATA_SOURCE: 'local',
  COMPANY_ID: '',
  COMPANY_NAME: 'Padaria Três Irmãos'
};
