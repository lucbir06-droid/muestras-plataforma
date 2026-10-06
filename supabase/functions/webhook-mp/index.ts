// Millán Academy — recibe el aviso de Mercado Pago cuando se paga un cobro
// creado por crear-pago-mp y registra el pago solo en el perfil del alumno.
//
// Mercado Pago llama a esta función (no un usuario), así que no trae
// sesión. Lo que la protege: del aviso solo se toma el NÚMERO de operación
// y con ese número se le pregunta directamente a Mercado Pago, con el
// Access Token de la academia, si de verdad está aprobada y por cuánto.
// Un aviso falso no puede inventar un pago.
//
// Puesta en marcha (una sola vez):
// 1. Tener el secret MP_ACCESS_TOKEN (ver crear-pago-mp).
// 2. Pegar esta función en Supabase → Edge Functions → Create function
//    "webhook-mp" → y APAGAR la opción "Verify JWT" (o "Enforce JWT
//    verification") de esta función antes de publicar: si queda prendida,
//    Supabase rechaza los avisos de Mercado Pago porque no traen sesión.
// 3. No hace falta configurar nada en Mercado Pago: cada cobro ya lleva la
//    dirección de esta función (notification_url).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = "Millán Academy <notificaciones@millanacademy.com>";
const TO_MILLAN = "millanacademymx@gmail.com";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const PLAN_NOMBRE: Record<string, string> = { polanco: "Polanco", ambas: "Metepec + Polanco", metepec: "Metepec" };
const DUR: Record<string, { label: string; periodicidad: string }> = {
  mensual: { label: "Mensual", periodicidad: "mensual" },
  "6meses": { label: "6 meses", periodicidad: "6meses" },
  anual: { label: "Anual", periodicidad: "anual" },
};

const ok = () => new Response("ok"); // 200 = "recibido, no me vuelvas a avisar de este"

Deno.serve(async (req) => {
  try {
    if (!MP_ACCESS_TOKEN) throw new Error("Falta el secret MP_ACCESS_TOKEN");
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    // MP avisa de dos formas según la versión: en el cuerpo o en la dirección
    const tipo = body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic");
    const id = body.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id");
    if (tipo !== "payment" || !id) return ok();

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!res.ok) throw new Error(`Mercado Pago no devolvió el pago ${id} (${res.status})`);
    const pago = await res.json();
    if (pago.status !== "approved") return ok(); // pendiente o rechazado: no se registra nada

    const [alumnoId, planId, durId] = String(pago.external_reference || "").split("|");
    const dur = DUR[durId];
    if (!alumnoId || !dur) return ok(); // un cobro que no salió de la app (ej. un link fijo viejo)

    const { data: alumno } = await admin.from("alumnos").select("id, nombre").eq("id", alumnoId).maybeSingle();
    if (!alumno) return ok();

    const { error } = await admin.from("pagos").insert({
      alumno_id: alumnoId,
      concepto: `${PLAN_NOMBRE[planId] || planId} · ${dur.label}`,
      metodo: "Mercado Pago",
      monto: pago.transaction_amount,
      moneda: pago.currency_id || "MXN",
      periodicidad: dur.periodicidad,
      estado: "pagado",
      fecha: pago.date_approved || new Date().toISOString(),
      mp_payment_id: String(pago.id),
    });
    if (error) {
      if (error.code === "23505") return ok(); // este mismo pago ya estaba registrado
      throw error;
    }

    // avisos (si alguno falla, el pago ya quedó registrado igual)
    const monto = `$${Number(pago.transaction_amount).toLocaleString("es-MX")} ${pago.currency_id || "MXN"}`;
    await fetch(`${SUPABASE_URL}/functions/v1/enviar-push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "alumno", alumnoId, ruta: "/pagos",
        titulo: "Pago recibido",
        cuerpo: `Registramos el pago de ${alumno.nombre} por ${monto}. ¡Gracias!`,
      }),
    }).catch((err) => console.warn("No se pudo mandar la notificación:", err));

    // y a los dueños, al teléfono
    await fetch(`${SUPABASE_URL}/functions/v1/enviar-push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "duenos", ruta: "/pagos",
        titulo: `Pago recibido · ${monto}`,
        cuerpo: `${alumno.nombre} pagó con Mercado Pago (${PLAN_NOMBRE[planId] || planId} · ${dur.label}).`,
      }),
    }).catch((err) => console.warn("No se pudo avisar a los dueños:", err));

    if (RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM, to: [TO_MILLAN],
          subject: `Pago recibido — ${alumno.nombre} · ${monto}`,
          text: `${alumno.nombre} pagó ${monto} con Mercado Pago (${PLAN_NOMBRE[planId] || planId} · ${dur.label}).\n\n` +
            `Ya quedó registrado en su perfil y su próxima fecha de pago se actualizó sola.\n\nOperación de Mercado Pago: ${pago.id}`,
        }),
      }).catch((err) => console.warn("No se pudo avisar por email:", err));
    }
    return ok();
  } catch (err) {
    console.error("webhook-mp:", err instanceof Error ? err.message : String(err));
    // algo falló de nuestro lado: con un 500 Mercado Pago vuelve a avisar más tarde
    return new Response("error", { status: 500 });
  }
});
