// Millán Academy — arma un cobro de Mercado Pago ligado a UN alumno.
//
// Antes los botones de "Pagar con Mercado Pago" llevaban a un link fijo
// (mpago.li/…): Mercado Pago cobraba, pero no había forma de saber qué
// alumno había pagado, así que el pago nunca aparecía en su perfil hasta
// que el dueño lo registraba a mano.
//
// Ahora el botón llama a esta función, que crea el cobro con una
// "referencia" (alumno + plan + duración). Cuando Mercado Pago lo aprueba
// le avisa a la función webhook-mp, que lee esa referencia y registra el
// pago solo, ya como pagado.
//
// Puesta en marcha (una sola vez):
// 1. Mercado Pago → Tu negocio → Configuración → Credenciales → Credenciales
//    de producción → copiar el "Access Token" (empieza con APP_USR-).
// 2. Supabase → Edge Functions → Secrets → MP_ACCESS_TOKEN = ese token.
// 3. Pegar esta función en Supabase → Edge Functions → Create function
//    "crear-pago-mp" → Deploy.
// 4. Hacer lo mismo con webhook-mp (ver ese archivo).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") || "";
const PANEL = "https://millanacademy.com/app/#/pagos";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Precios en MXN. Tienen que ser los mismos que assets/js/planes.js: se
// repiten acá porque el precio lo decide el servidor (si viniera del
// navegador, cualquiera podría mandarse un cobro de $1).
const PLANES: Record<string, { nombre: string; duraciones: Record<string, { label: string; precio: number }> }> = {
  polanco: { nombre: "Polanco", duraciones: {
    mensual: { label: "Mensual", precio: 3349 }, "6meses": { label: "6 meses", precio: 20745 }, anual: { label: "Anual", precio: 30141 } } },
  ambas: { nombre: "Metepec + Polanco", duraciones: {
    mensual: { label: "Mensual", precio: 4300 }, "6meses": { label: "6 meses", precio: 25745 }, anual: { label: "Anual", precio: 38700 } } },
  metepec: { nombre: "Metepec", duraciones: {
    mensual: { label: "Mensual", precio: 2799 }, "6meses": { label: "6 meses", precio: 13995 }, anual: { label: "Anual", precio: 27990 } } },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const responder = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!MP_ACCESS_TOKEN) throw new Error("Falta el secret MP_ACCESS_TOKEN");
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(bearer);
    if (!user) return responder({ success: false, message: "Necesitas iniciar sesión" }, 401);

    const { alumnoId, planId, durId } = await req.json();
    const plan = PLANES[planId];
    const dur = plan?.duraciones[durId];
    if (!alumnoId || !plan || !dur) throw new Error("Falta el alumno o el plan");

    // solo se le puede cobrar a un alumno propio (o cualquiera, si es staff)
    const [{ data: perfil }, { data: vinculo }, { data: alumno }] = await Promise.all([
      admin.from("perfiles").select("rol").eq("id", user.id).maybeSingle(),
      admin.from("alumno_usuarios").select("alumno_id").eq("alumno_id", alumnoId).eq("user_id", user.id).maybeSingle(),
      admin.from("alumnos").select("id, nombre").eq("id", alumnoId).maybeSingle(),
    ]);
    if (!alumno) throw new Error("No encontramos a ese alumno");
    const esStaff = perfil?.rol === "dueño" || perfil?.rol === "profe";
    if (!esStaff && !vinculo) return responder({ success: false, message: "Ese alumno no está ligado a tu cuenta" }, 403);

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{
          title: `Millán Academy — ${plan.nombre} · ${dur.label} · ${alumno.nombre}`,
          quantity: 1, unit_price: dur.precio, currency_id: "MXN",
        }],
        // lo que lee webhook-mp para saber de quién es el pago
        external_reference: `${alumnoId}|${planId}|${durId}`,
        notification_url: `${SUPABASE_URL}/functions/v1/webhook-mp`,
        payer: user.email ? { email: user.email } : undefined,
        back_urls: { success: PANEL, pending: PANEL, failure: PANEL },
        auto_return: "approved",
        statement_descriptor: "MILLAN ACADEMY",
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.init_point) throw new Error(json.message || `Mercado Pago respondió ${res.status}`);

    return responder({ success: true, url: json.init_point });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("crear-pago-mp:", message);
    return responder({ success: false, message }, 400);
  }
});
