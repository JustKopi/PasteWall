// Supabase-beállítás. Ha üres, az oldal demó módban fut (csak egy gépen, több böngészőfülön).
// Élesítéshez hozz létre egy .env.local fájlt:
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_KEY=sb_publishable_...
export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || '';
export const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_KEY || '';

export function isOnline() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}
