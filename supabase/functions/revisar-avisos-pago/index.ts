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
// 2. Supabase → Database → Cron Jobs → New Job:
//    - Tipo: "Supabase Edge Function"
//    - Función: revisar-avisos-pago
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
// mantener las dos en sync si algún día cambia cómo se calcula la fecha de corte
function sumarPeriodo(fecha: string | Date, periodicidad: string): Date {
  const d = new Date(fecha);
  d.setMonth(d.getMonth() + (periodicidad === "anual" ? 12 : periodicidad === "6meses" ? 6 : 1));
  return d;
}

function toYMD(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// deno-lint-ignore no-explicit-any
function fechaVencimiento(alumno: any, pagos: any[]): Date | null {
  const delAlumno = pagos
    .filter((p) => p.alumno_id === alumno.id && p.estado === "pagado" && p.periodicidad)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  if (delAlumno[0]) return sumarPeriodo(delAlumno[0].fecha, delAlumno[0].periodicidad);

  if (!alumno.fecha_pago_inicial || !alumno.periodicidad_pago) return null;
  let vence = sumarPeriodo(alumno.fecha_pago_inicial, alumno.periodicidad_pago);
  const hoy = new Date(new Date().toDateString());
  for (let i = 0; vence < hoy && i < 240; i++) vence = sumarPeriodo(vence, alumno.periodicidad_pago);
  return vence;
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

Deno.serve(async () => {
  try {
    const hoy = new Date(new Date().toDateString());
    const [{ data: alumnos, error: e1 }, { data: pagos, error: e2 }] = await Promise.all([
      supabase.from("alumnos").select("id, nombre, correo, categoria, sedes, fecha_pago_inicial, periodicidad_pago").eq("activo", true),
      supabase.from("pagos").select("alumno_id, estado, periodicidad, fecha").eq("estado", "pagado"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const lineas: string[] = [];

    for (const a of alumnos || []) {
      const venc = fechaVencimiento(a, pagos || []);
      if (!venc) continue;
      const dias = Math.round((venc.getTime() - hoy.getTime()) / 86400000);
      const fechaLarga = venc.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });

      if (dias === 3) {
        if (await intentarMarcar(a.id, "por_vencer", toYMD(venc))) {
          lineas.push(`• ${a.nombre} (${a.categoria || "sin división"} · ${(a.sedes || []).join("/")}) — vence en 3 días, el ${fechaLarga}.`);
        }
      } else if (dias < 0) {
        if (await intentarMarcar(a.id, "vencido", toYMD(venc))) {
          lineas.push(`• ${a.nombre} (${a.categoria || "sin división"} · ${(a.sedes || []).join("/")}) — VENCIÓ el ${fechaLarga} y todavía no hay un pago nuevo registrado.`);
        }
      }

      if (dias === 5 || dias === 3) {
        const tipo = dias === 5 ? "alumno_5dias" : "alumno_3dias";
        if (await intentarMarcar(a.id, tipo, toYMD(venc))) {
          await enviarPush(
            a.id,
            `Tu pago vence en ${dias} días`,
            `La próxima fecha de pago de ${a.nombre} es el ${fechaLarga}.`,
          ).catch((err) => console.warn("No se pudo mandar la notificación a", a.nombre, err));
          if (a.correo) await enviarCorreo(
            a.correo,
            `Tu pago vence en ${dias} días — Millán Academy`,
            `Hola ${a.nombre}!\n\nTu próxima fecha de pago en Millán Academy es el ${fechaLarga} (en ${dias} días).\n\n` +
              `Podés pagar desde la app, en "Mi suscripción", para no perder el acceso.\n\n— Millán Academy`,
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
        `Resumen de fechas de corte de hoy:\n\n${lineas.join("\n")}`,
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
