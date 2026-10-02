/* =========================================================
   Millán Academy — planes y precios
   =========================================================

   Precios reales dados por Millán (MXN). Cada plan puede tener un
   "linkPago": el link de pago fijo que se crea gratis desde el panel
   de Mercado Pago (Actividad → Cobrar → Link de pago), uno por plan.

   Mientras "linkPago" esté vacío, el botón "Elegir plan" manda al
   formulario de inscripción del panel en vez de cobrar — así nadie
   se queda esperando un botón roto mientras se conectan los links.

   Cómo crear un link de pago (5 min, sin programar):
   1. Entrar a Mercado Pago → Tu negocio → Cobrar → Link de pago.
   2. Poner el nombre del plan y el precio exacto (usar el "precio real",
      no el tachado).
   3. Copiar el link y pegarlo aquí abajo, en el plan que corresponda. */

export const PLANES = [
  {
    id: "polanco",
    nombre: "Polanco",
    moneda: "MXN",
    duraciones: [
      { id: "mensual", label: "Mensual", tachado: 4149, real: 3349, linkPago: "https://mpago.li/2kk9Fca" },
      { id: "6meses", label: "6 meses", tachado: 24894, real: 20745, linkPago: "https://mpago.li/2qMmYjv" },
      { id: "anual", label: "Anual", tachado: 40188, real: 30141, linkPago: "https://mpago.li/1T7Gi9T" },
    ],
  },
  {
    id: "ambas",
    nombre: "Metepec + Polanco",
    detalle: "Incluye las dos sedes",
    moneda: "MXN",
    destacado: true,
    duraciones: [
      { id: "mensual", label: "Mensual", tachado: 5149, real: 4300, linkPago: "https://mpago.li/1SGexnx" },
      { id: "6meses", label: "6 meses", tachado: 30894, real: 25745, linkPago: "https://mpago.li/2G3pYD5" },
      { id: "anual", label: "Anual", tachado: 51600, real: 38700, linkPago: "https://mpago.li/215YZfL" },
    ],
  },
  {
    id: "metepec",
    nombre: "Metepec",
    moneda: "MXN",
    duraciones: [
      { id: "mensual", label: "Mensual", tachado: 3349, real: 2799, linkPago: "https://mpago.li/15W5hWm" },
      { id: "6meses", label: "6 meses", tachado: 20094, real: 13995, linkPago: "https://mpago.li/2BEDfGF" },
      { id: "anual", label: "Anual", tachado: 40188, real: 27990, linkPago: "https://mpago.li/1YKNBXR" },
    ],
  },
];

// Add-on de Hábitos Premium ($249 MXN/mes, aparte de la mensualidad de
// la sede): reemplaza y mejora la sección de Evidencias — solo para
// quien lo paga. Se cobra con un plan de SUSCRIPCIÓN de Mercado Pago
// (no un link de pago común) para que se renueve solo cada mes.
//
// Cómo crear el link (una sola vez, sin programar):
// 1. Mercado Pago → Tu negocio → Suscripciones → Crear plan de suscripción.
// 2. Nombre "Hábitos Premium", cobro recurrente mensual de $249 MXN.
// 3. Copiar el link y pegarlo aquí abajo en "linkPago".
//
// Mientras "linkPago" esté vacío, se muestra el precio pero el botón no
// cobra todavía — hay que activarlo a mano desde la ficha del alumno
// (ver AlumnoDetail en app.js) una vez que la academia confirme el pago.
export const HABITOS_PREMIUM = {
  nombre: "Hábitos Premium",
  moneda: "MXN",
  precioMensual: 249,
  linkPago: "",
};

export function fmtMXN(n) {
  return "$" + n.toLocaleString("es-MX") + " MXN";
}

export function encontrarDuracion(planId, duracionId) {
  const plan = PLANES.find((p) => p.id === planId);
  const dur = plan?.duraciones.find((d) => d.id === duracionId);
  return plan && dur ? { plan, dur } : null;
}
