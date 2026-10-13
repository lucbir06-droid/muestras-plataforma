// Millán Academy — versión automática (Cron) de revisarAvisosPagos() en
// app.js: esa versión solo corre cuando el dueño abre el panel, así que si
// nadie entra ese día el aviso se pierde (el chequeo es "exactamente a los
// 5/3 días", no se recupera después). Esta función hace lo mismo pero sola,
// disparada por un Cron Job de Supabase — no depende de que nadie use la app.
//
// Usa la SERVICE ROLE KEY para leer todos los alumnos sin pasar por RLS (acá
// no hay ningún usuario logueado disparando esto). Comparte la misma tabla
// recordatorios_enviados que la versión del panel, así que aunque las dos
// corran el mismo día nunca mandan el mismo aviso dos veces (el que llega
// segundo choca con la restricción "unique" y no hace nada).
//
// Puesta en marcha (una sola vez):
// 1. Pegar esta función en Supabase → Edge Functions → Create function
//    "revisar-avisos-pago" → Deploy.
//    y APAGAR "Verify JWT" en sus Settings.
// 2. Edge Functions → Secrets: CRON_SECRET = una clave larga al azar.
// 3. Supabase → Integrations → Cron → New Job:
//    - Tipo: "Supabase Edge Function"
//    - Función: revisar-avisos-pago
//    - HTTP Headers → Add header: x-cron-secret = la misma clave
//    - Timeout: 5000
//    - Horario: una vez al día (ej. "0 15 * * *" = todos los días 9am
//      hora de México).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "Millán Academy <notificaciones@millanacademy.com>";
const TO_MILLAN = "millanacademymx@gmail.com";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// misma lógica que sumarPeriodo/fechaVencimiento en app.js — hay que
// mantener las dos en sync si algún día cambia cómo se calcula la fecha de corte.
// Acá todo va en UTC al mediodía, para que ninguna zona horaria corra el día.
function dia(v: string | Date): Date {
  const s = typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
  return new Date(`${s}T12:00:00Z`);
}
// el día (hora de México) en que cayó un momento exacto, ej. un pago
function diaMx(v: string | Date): Date {
  return dia(new Date(v).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }));
}
function sumarPeriodo(fecha: string | Date, periodicidad: string): Date {
  const d = dia(fecha);
  d.setUTCMonth(d.getUTCMonth() + (periodicidad === "anual" ? 12 : periodicidad === "6meses" ? 6 : 1));
  return d;
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// la fecha límite de pago pendiente (ver la explicación completa en app.js:
// las dos tienen que dar siempre lo mismo)
// deno-lint-ignore no-explicit-any
function fechaVencimiento(alumno: any, todos: any[], hoy: Date): Date | null {
  const fijadaEn = alumno.fecha_pago_fijada_en ? new Date(alumno.fecha_pago_fijada_en).getTime() : 0;
  const pagos = todos
    .filter((p) => p.alumno_id === alumno.id && p.estado === "pagado" && p.periodicidad
      && (!fijadaEn || new Date(p.registrado_en || p.fecha).getTime() > fijadaEn))
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  const ancla = alumno.fecha_pago_inicial ? dia(alumno.fecha_pago_inicial) : null;
  const cadaCuanto = alumno.periodicidad_pago || "mensual";
  if (!ancla) {
    const ultimo = pagos[pagos.length - 1];
    return ultimo ? sumarPeriodo(diaMx(ultimo.fecha), ultimo.periodicidad) : null;
  }

  const limiteHasta = (tope: Date): Date | null => {
    if (ancla > tope) return null;
    let d = ancla;
    for (let i = 0; i < 600; i++) {
      const sig = sumarPeriodo(d, cadaCuanto);
      if (sig > tope) break;
      d = sig;
    }
    return d;
  };
  const masDias = (d: Date, n: number) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };
  const unPeriodoAntes = (d: Date) => {
    const r = new Date(d);
    r.setUTCMonth(r.getUTCMonth() - (cadaCuanto === "anual" ? 12 : cadaCuanto === "6meses" ? 6 : 1));
    return r;
  };

  let limite: Date | null = null;
  for (const p of pagos) {
    const d = diaMx(p.fecha);
    const retoma = limite && d > masDias(sumarPeriodo(limite, cadaCuanto), 15);
    if (limite && !retoma) { limite = sumarPeriodo(limite, p.periodicidad); continue; }
    const antes: Date = limiteHasta(d) || unPeriodoAntes(ancla);
    const despues = sumarPeriodo(antes, cadaCuanto);
    const cubre = d.getTime() - antes.getTime() <= despues.getTime() - d.getTime() ? antes : despues;
    if (cubre < ancla) continue;
    limite = sumarPeriodo(cubre, p.periodicidad);
  }
  return limite || limiteHasta(hoy) || ancla;
}

async function intentarMarcar(alumnoId: string, tipo: string, fechaVenc: string) {
  const { error } = await supabase.from("recordatorios_enviados").insert({ alumno_id: alumnoId, tipo, fecha_venc: fechaVenc });
  if (error) {
    if (error.code === "23505") return false; // ya se había mandado
    throw error;
  }
  return true;
}

async function enviarCorreo(to: string, subject: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, text }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || `Resend respondió ${res.status}`);
}

// además del correo, una notificación al teléfono de las cuentas ligadas al
// alumno (si tienen la app instalada) — la manda la función enviar-push
async function enviarPush(alumnoId: string, titulo: string, cuerpo: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/enviar-push`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "alumno", alumnoId, titulo, cuerpo, ruta: "/pagos" }),
  });
  if (!res.ok) throw new Error(`enviar-push respondió ${res.status}`);
}

// Esta función la llama el Cron de Supabase, no un usuario, así que va con
// "Verify JWT" apagado. Para que no la pueda disparar cualquiera desde
// internet, el Cron manda un encabezado con una clave que solo conocen él
// y esta función (secret CRON_SECRET).
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ success: false, message: "No autorizado" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  try {
    // "hoy" según la hora de México (esta función corre en UTC)
    const hoy = dia(new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }));
    const [{ data: alumnos, error: e1 }, { data: pagos, error: e2 }] = await Promise.all([
      supabase.from("alumnos").select("*").eq("activo", true),
      supabase.from("pagos").select("*").eq("estado", "pagado"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const lineas: string[] = [];

    for (const a of alumnos || []) {
      const venc = fechaVencimiento(a, pagos || [], hoy);
      if (!venc) continue;
      const dias = Math.round((venc.getTime() - hoy.getTime()) / 86400000);
      const fechaLarga = venc.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

      if (dias === 3) {
        if (await intentarMarcar(a.id, "por_vencer", toYMD(venc))) {
          lineas.push(`• ${a.nombre} (${a.categoria || "sin división"} · ${(a.sedes || []).join("/")}) — vence en 3 días, el ${fechaLarga}.`);
        }
      } else if (dias < 0) {
        if (await intentarMarcar(a.id, "vencido", toYMD(venc))) {
          lineas.push(`• ${a.nombre} (${a.categoria || "sin división"} · ${(a.sedes || []).join("/")}) — VENCIÓ el ${fechaLarga} y todavía no hay un pago nuevo registrado.`);
        }
      }

      // al propio papá/alumno: 5 y 3 días antes, y el mismo día límite
      if (dias === 5 || dias === 3 || dias === 0) {
        const tipo = dias === 5 ? "alumno_5dias" : dias === 3 ? "alumno_3dias" : "alumno_hoy";
        if (await intentarMarcar(a.id, tipo, toYMD(venc))) {
          const esHoy = dias === 0;
          await enviarPush(
            a.id,
            esHoy ? "Hoy es tu fecha límite de pago" : `Tu pago vence en ${dias} días`,
            esHoy ? `Hoy vence el pago de ${a.nombre}. Si ya pagaste, no hagas caso a este aviso.`
              : `La fecha límite de pago de ${a.nombre} es el ${fechaLarga}.`,
          ).catch((err) => console.warn("No se pudo mandar la notificación a", a.nombre, err));
          if (a.correo) await enviarCorreo(
            a.correo,
            esHoy ? "Hoy es tu fecha límite de pago — Millán Academy" : `Tu pago vence en ${dias} días — Millán Academy`,
            `Hola ${a.nombre}!\n\n` +
              (esHoy ? `Hoy, ${fechaLarga}, es tu fecha límite de pago en Millán Academy.\n\n`
                : `Tu fecha límite de pago en Millán Academy es el ${fechaLarga} (en ${dias} días).\n\n`) +
              `Puedes pagar desde la app, en "Mi suscripción". Si ya pagaste, no hagas caso a este mensaje.\n\n— Millán Academy`,
          ).catch((err) => console.warn("No se pudo avisar por email a", a.nombre, err));
        }
      }
    }

    // ---- recordatorio: "mañana tienes clase" ----
    // "mañana" según la hora de México (esta función corre en UTC)
    const hoyMx = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
    const manana = new Date(`${hoyMx}T12:00:00Z`);
    manana.setUTCDate(manana.getUTCDate() + 1);
    const mananaYMD = manana.toISOString().slice(0, 10);
    const { data: clases } = await supabase.from("reservas")
      .select("id, alumno_id, hora, tipo, sede")
      .eq("fecha", mananaYMD).eq("estado", "confirmada").eq("recordado", false).not("alumno_id", "is", null);
    let recordatorios = 0;
    for (const c of clases || []) {
      // se marca antes de avisar: si algo falla, mejor un aviso menos que dos iguales
      const { error: eMarca } = await supabase.from("reservas").update({ recordado: true }).eq("id", c.id);
      if (eMarca) continue;
      await fetch(`${SUPABASE_URL}/functions/v1/enviar-push`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "alumno", alumnoId: c.alumno_id, ruta: "/agenda",
          titulo: `Mañana tienes clase a las ${c.hora}`,
          cuerpo: `${c.tipo || "Clase"}${c.sede ? " en " + c.sede : ""}. ¡Te esperamos!`,
        }),
      }).then(() => { recordatorios++; }).catch((err) => console.warn("No se pudo recordar la clase", c.id, err));
    }

    if (lineas.length) {
      await enviarCorreo(
        TO_MILLAN,
        `Avisos de pago — ${lineas.length} alumno${lineas.length > 1 ? "s" : ""}`,
        `Resumen de fechas límite de pago de hoy:\n\n${lineas.join("\n")}`,
      );
    }

    return new Response(JSON.stringify({ success: true, revisados: (alumnos || []).length, avisos: lineas.length, recordatorios }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("revisar-avisos-pago:", message);
    return new Response(JSON.stringify({ success: false, message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
