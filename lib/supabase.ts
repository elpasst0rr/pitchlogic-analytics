import { createClient } from "@supabase/supabase-js";
 
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
 
if (!url || !anonKey) {
  throw new Error("Faltan SUPABASE_URL / SUPABASE_ANON_KEY en las variables de entorno.");
}
 
// Clave anon, de solo lectura: esta ruta NUNCA escribe en match_stats_cache.
// Quien escribe es, exclusivamente, el job de ingesta en segundo plano (con
// service_role, fuera de este archivo).
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});
 
