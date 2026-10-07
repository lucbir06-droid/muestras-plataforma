// Millán Academy — manda notificaciones push a los iPhone que tienen la app
// (directo a Apple/APNs, sin Firebase). Dos formas de llamarla:
//
// 1. Desde el panel, justo después de mandar un mensaje de chat:
//      sb.functions.invoke("enviar-push", { body: { tipo: "mensaje" } })
//    No recibe ni el texto ni los destinatarios: busca en la base el último
//    mensaje de quien la llama y arma sola a quién le toca. Así nadie puede
//    usarla para mandarle una notificación cualquiera a otra persona.
//
// 2. Desde otra Edge Function (ej. revisar-avisos-pago), con la service
//    role key como Authorization:
//      { tipo: "alumno", alumnoId, titulo, cuerpo, ruta }
//    Le llega a las cuentas ligadas a ese alumno (papá/mamá/el alumno).
//      { tipo: "duenos", titulo, cuerpo, ruta }
//    Le llega a todos los dueños (ej. cuando entra un pago).
//
// Puesta en marcha (una sola vez):
// 1. developer.apple.com → Certificates, IDs & Profiles → Keys → "+" →
//    marcar "Apple Push Notifications service (APNs)" → descargar el .p8.
// 2. Supabase → Edge Functions → Secrets:
//      APNS_KEY_P8   = el contenido completo del .p8
//      APNS_KEY_ID   = el Key ID de esa llave (10 caracteres)
//      APNS_TEAM_ID  = el Team ID de la cuenta de Apple (10 caracteres)
// 3. Pegar esta función en Supabase → Edge Functions → Create function
//    "enviar-push" → Deploy.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS_KEY_P8 = Deno.env.get("APNS_KEY_P8") || "";
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") || "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") || "";
const BUNDLE_ID = "com.millanacademy.app";
// TestFlight y App Store usan el servidor de producción de Apple
const APNS_HOST = "https://api.push.apple.com";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Apple pide un token firmado con la llave .p8 (dura hasta 1 hora; se
// reusa mientras esta instancia de la función siga viva)
let jwtCache: { token: string; creado: number } | null = null;
async function apnsJwt(): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  if (jwtCache && ahora - jwtCache.creado < 45 * 60) return jwtCache.token;
  const pem = APNS_KEY_P8.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const cabecera = b64url(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }));
  const cuerpo = b64url(JSON.stringify({ iss: APNS_TEAM_ID, iat: ahora }));
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${cabecera}.${cuerpo}`));
  jwtCache = { token: `${cabecera}.${cuerpo}.${b64url(firma)}`, creado: ahora };
  return jwtCache.token;
}

type Aviso = { titulo: string; cuerpo: string; ruta?: string };

async function enviarA(userIds: string[], aviso: Aviso) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return { enviados: 0, fallidos: 0 };
  const { data: dispositivos, error } = await admin.from("dispositivos").select("token, plataforma").in("user_id", ids);
  if (error) throw error;
  const iphones = (dispositivos || []).filter((d) => d.plataforma === "ios");
  if (!iphones.length) return { enviados: 0, fallidos: 0 };

  const jwt = await apnsJwt();
  const payload = JSON.stringify({
    aps: { alert: { title: aviso.titulo, body: aviso.cuerpo }, sound: "default" },
    ruta: aviso.ruta || "/",
  });
  let enviados = 0, fallidos = 0;
  const muertos: string[] = [];
  await Promise.all(iphones.map(async (d) => {
    const res = await fetch(`${APNS_HOST}/3/device/${d.token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      body: payload,
    });
    if (res.ok) { enviados++; return; }
    fallidos++;
    const motivo = (await res.json().catch(() => ({}))).reason;
    console.warn("APNs rechazó un aviso:", res.status, motivo);
    // el teléfono desinstaló la app o el token ya no sirve: no insistir más
    if (res.status === 410 || motivo === "BadDeviceToken" || motivo === "Unregistered") muertos.push(d.token);
  }));
  if (muertos.length) await admin.from("dispositivos").delete().in("token", muertos);
  return { enviados, fallidos };
}

// a quién le toca enterarse del último mensaje de chat de esta cuenta
async function avisoDeMensaje(autorId: string): Promise<{ userIds: string[]; aviso: Aviso } | null> {
  const haceDosMin = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: m } = await admin.from("mensajes").select("*")
    .eq("autor_id", autorId).gte("creado_en", haceDosMin)
    .order("creado_en", { ascending: false }).limit(1).maybeSingle();
  if (!m) return null;

  const texto = m.contenido.length > 140 ? m.contenido.slice(0, 137) + "…" : m.contenido;
  let userIds: string[] = [];
  let aviso: Aviso;

  if (m.tipo === "categoria") {
    // todo el staff + las cuentas con un alumno en esa sede y división
    const [{ data: staff }, { data: alumnos }] = await Promise.all([
      admin.from("perfiles").select("id").in("rol", ["dueño", "profe"]),
      admin.from("alumnos").select("id").eq("categoria", m.categoria).contains("sedes", [m.sede]),
    ]);
    const alumnoIds = (alumnos || []).map((a) => a.id);
    const { data: vinculos } = alumnoIds.length
      ? await admin.from("alumno_usuarios").select("user_id").in("alumno_id", alumnoIds)
      : { data: [] };
    userIds = [...(staff || []).map((p) => p.id), ...(vinculos || []).map((v) => v.user_id)];
    aviso = {
      titulo: `${m.autor_nombre} · ${m.categoria} ${m.sede}`,
      cuerpo: texto,
      ruta: `/chat?tab=${encodeURIComponent(m.sede + "|" + m.categoria)}`,
    };
  } else {
    // mensaje directo: el profe del hilo + las cuentas ligadas al alumno
    const { data: vinculos } = await admin.from("alumno_usuarios").select("user_id").eq("alumno_id", m.alumno_id);
    userIds = [m.profe_id, ...(vinculos || []).map((v) => v.user_id)];
    aviso = {
      titulo: `Mensaje de ${m.autor_nombre}`,
      cuerpo: texto,
      ruta: `/chat?tab=dm&alumno=${m.alumno_id}&profe=${m.profe_id}`,
    };
  }
  return { userIds: userIds.filter((id) => id !== autorId), aviso };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const responder = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!APNS_KEY_P8 || !APNS_KEY_ID || !APNS_TEAM_ID) throw new Error("Faltan los secrets APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID");
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const body = await req.json().catch(() => ({}));

    // llamada interna (otra Edge Function, con la service role key)
    if (bearer === SERVICE_ROLE_KEY) {
      if (!body.titulo || !body.cuerpo) throw new Error("Falta titulo o cuerpo");
      let userIds: string[] = [];
      if (body.tipo === "alumno" && body.alumnoId) {
        // a las cuentas ligadas a ese alumno (papá / mamá / el alumno)
        const { data: vinculos } = await admin.from("alumno_usuarios").select("user_id").eq("alumno_id", body.alumnoId);
        userIds = (vinculos || []).map((v) => v.user_id);
      } else if (body.tipo === "duenos") {
        // a todos los dueños (ej. "llegó un pago")
        const { data: duenos } = await admin.from("perfiles").select("id").eq("rol", "dueño");
        userIds = (duenos || []).map((p) => p.id);
      } else {
        throw new Error("Tipo de aviso no válido");
      }
      const r = await enviarA(userIds, { titulo: body.titulo, cuerpo: body.cuerpo, ruta: body.ruta });
      return responder({ success: true, ...r });
    }

    // llamada desde el panel: solo puede avisar de SU último mensaje
    const { data: { user } } = await admin.auth.getUser(bearer);
    if (!user) return responder({ success: false, message: "Necesitas iniciar sesión" }, 401);
    // el staff agendó una clase: avisarle a la familia de ese alumno
    if (body.tipo === "clase") {
      const { data: quien } = await admin.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
      if (quien?.rol !== "dueño" && quien?.rol !== "profe") return responder({ success: false, message: "Solo el staff agenda clases" }, 403);
      const { data: r } = await admin.from("reservas").select("alumno_id, fecha, hora, tipo, sede").eq("id", body.reservaId).maybeSingle();
      if (!r?.alumno_id) return responder({ success: true, enviados: 0, fallidos: 0 });
      const { data: vinculos } = await admin.from("alumno_usuarios").select("user_id").eq("alumno_id", r.alumno_id);
      const cuando = new Date(`${r.fecha}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
      const res = await enviarA((vinculos || []).map((v) => v.user_id), {
        titulo: "Nueva clase agendada",
        cuerpo: `${cuando}, ${r.hora} · ${r.tipo || "Clase"}${r.sede ? " en " + r.sede : ""}`,
        ruta: "/agenda",
      });
      return responder({ success: true, ...res });
    }
    if (body.tipo !== "mensaje") throw new Error("Tipo de aviso no válido");
    const destino = await avisoDeMensaje(user.id);
    if (!destino) return responder({ success: true, enviados: 0, fallidos: 0 });
    const r = await enviarA(destino.userIds, destino.aviso);
    return responder({ success: true, ...r });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("enviar-push:", message);
    return responder({ success: false, message }, 400);
  }
});
