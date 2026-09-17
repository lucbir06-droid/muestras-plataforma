/* =========================================================
   Millán Academy — cliente de Supabase
   =========================================================

   La "publishable key" está pensada para vivir en el navegador —
   no es un secreto (es el reemplazo moderno de la vieja "anon key").
   Lo que protege los datos son las políticas de RLS definidas en
   supabase/schema.sql, no esta clave.

   El SDK (window.supabase) se carga como <script> normal en
   app/index.html, antes de este módulo. */

const SUPABASE_URL = "https://nqwfbvrqdmovbgravmxk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_K8IXANBcmjHligyTEKF6AA_kadlcq6O";

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
