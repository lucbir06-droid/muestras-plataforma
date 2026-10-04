// Millán Academy — elimina la cuenta de quien la llama (botón "Eliminar mi
// cuenta" en el panel, sección Mi cuenta). Apple exige que cualquier app
// que deja crear una cuenta deje también borrarla desde dentro.
//
// Qué se borra:
//   - el acceso (correo y contraseña en Authentication)
//   - el perfil (nombre, teléfono, país, rol)
//   - el vínculo con sus alumnos (alumno_usuarios)
//   - sus mensajes de chat
//   - los hábitos/evidencias que subió, con sus fotos
//   - los teléfonos registrados para notificaciones
//
// Qué NO se borra: la ficha del alumno, su asistencia, reportes y pagos.
// Eso es el registro de la academia (lo da de alta el staff, exista o no
// una cuenta en la app) y un alumno puede seguir entrenando aunque su papá
// borre la app. Si la familia quiere que también se borre, se lo pide a la
// academia y el dueño da de baja al alumno desde el panel.
//
// El último dueño no se puede eliminar: la academia se quedaría sin nadie
// que pueda administrar el panel.
//
// Puesta en marcha: pegar esta función en Supabase → Edge Functions →
// Create function "eliminar-cuenta" → Deploy. No necesita secrets propios.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const responder = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(bearer);
    if (!user) return responder({ success: false, message: "Necesitas iniciar sesión" }, 401);

    const { data: perfil } = await admin.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
    if (perfil?.rol === "dueño") {
      const { count } = await admin.from("perfiles").select("id", { count: "exact", head: true }).eq("rol", "dueño");
      if ((count || 0) <= 1) {
        return responder({ success: false, message: "Eres el único dueño de la academia. Antes de eliminar tu cuenta, da de alta a otro dueño." }, 409);
      }
    }

    // fotos de los hábitos que subió esta cuenta
    const { data: evidencias, error: e1 } = await admin.from("evidencias").select("id, foto_path").eq("user_id", user.id);
    if (e1) throw e1;
    const fotos = (evidencias || []).map((e) => e.foto_path).filter(Boolean);
    if (fotos.length) await admin.storage.from("evidencias").remove(fotos);
    if (evidencias?.length) {
      const { error } = await admin.from("evidencias").delete().in("id", evidencias.map((e) => e.id));
      if (error) throw error;
    }

    // sus mensajes: hay que borrarlos antes que el perfil (la tabla los
    // amarra al autor y no dejaría borrar la cuenta)
    const { error: e2 } = await admin.from("mensajes").delete().eq("autor_id", user.id);
    if (e2) throw e2;

    // el resto (perfil, vínculos con alumnos, teléfonos) se va solo en
    // cascada al borrar la cuenta de Authentication
    const { error: e3 } = await admin.auth.admin.deleteUser(user.id);
    if (e3) throw e3;

    return responder({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("eliminar-cuenta:", message);
    return responder({ success: false, message: "No se pudo eliminar la cuenta. Intenta de nuevo o escribe a la academia." }, 500);
  }
});
