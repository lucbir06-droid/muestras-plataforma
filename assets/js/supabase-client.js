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

// "Candado" de la sesión, en memoria y por pestaña.
//
// Por default el SDK usa navigator.locks (un candado del navegador,
// compartido entre pestañas) cada vez que lee o renueva la sesión. En los
// teléfonos ese candado se puede quedar trabado para siempre cuando el
// navegador manda la pestaña al fondo y la despierta (iPhone sobre todo):
// la app se queda esperándolo, nunca termina de cargar y no deja entrar ni
// cerrar sesión, hasta que se cierra del todo el navegador.
//
// Este hace lo mismo que necesita el SDK (que dos operaciones de sesión no
// corran a la vez) pero solo dentro de esta pestaña y con un límite de
// tiempo: si una operación se cuelga, la siguiente no la espera para siempre.
let colaSesion = Promise.resolve();
function candadoSesion(_nombre, _espera, fn) {
  const anterior = colaSesion;
  const turno = (async () => {
    await Promise.race([anterior, new Promise((ok) => setTimeout(ok, 8000))]);
    return await fn();
  })();
  colaSesion = turno.catch(() => {});
  return turno;
}

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { lock: candadoSesion },
});
