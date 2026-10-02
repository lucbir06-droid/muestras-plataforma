// Millán Academy — avisa por email (check-in, check-out, cuentas nuevas,
// avisos de pago) usando Resend. Por default le manda a Millán; si viene
// un "to" en el body (ej. recordatorio de pago al propio alumno/papá) se
// manda ahí en vez de a Millán. La llama el panel con sb.functions.invoke,
// así que viaja autenticada con la sesión de quien la dispara: no hace
// falta nada más para que un desconocido de internet no pueda usarla para
// mandar spam con nuestra cuenta de Resend.
//
// RESEND_API_KEY vive como secret de este proyecto (Supabase → Edge
// Functions → Secrets) — nunca llega al navegador.
//
// Puesta en marcha (una sola vez, ya hecha):
// 1. Cuenta en resend.com, dominio millanacademy.com verificado (DNS en
//    Cloudflare).
// 2. API Key de Resend guardada como secret RESEND_API_KEY.
// 3. Esta función pegada en Supabase → Edge Functions → Create function
//    "notificar-email" (o con `supabase functions deploy notificar-email`
//    si alguna vez se usa la CLI).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "Millán Academy <notificaciones@millanacademy.com>";
const TO_MILLAN = "millanacademymx@gmail.com";
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { subject, message, fotoBase64, to } = await req.json();
    if (!subject || !message) throw new Error("Falta subject o message");
    if (to && !EMAIL_VALIDO.test(to)) throw new Error("El correo del destinatario no es válido");

    const body: Record<string, unknown> = {
      from: FROM,
      to: [to || TO_MILLAN],
      subject,
      text: message,
    };
    if (fotoBase64) {
      body.attachments = [{ filename: "foto.jpg", content: fotoBase64 }];
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || `Resend respondió ${res.status}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
