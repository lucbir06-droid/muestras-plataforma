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
   3. Copiar el link y pegarlo acá abajo, en el plan que corresponda. */

export const PLANES = [
  {
    id: "polanco",
    nombre: "Polanco",
    moneda: "MXN",
    duraciones: [
      { id: "mensual", label: "Mensual", tachado: 4149, real: 3349, linkPago: "" },
      { id: "6meses", label: "6 meses", tachado: 24894, real: 20745, linkPago: "" },
      { id: "anual", label: "Anual", tachado: 40188, real: 30141, linkPago: "" },
    ],
  },
  {
    id: "ambas",
    nombre: "Metepec + Polanco",
    detalle: "Incluye las dos sedes",
    moneda: "MXN",
    destacado: true,
    duraciones: [
      { id: "mensual", label: "Mensual", tachado: 5149, real: 4300, linkPago: "" },
      { id: "6meses", label: "6 meses", tachado: 30894, real: 25745, linkPago: "" },
      { id: "anual", label: "Anual", tachado: 51600, real: 38700, linkPago: "" },
    ],
  },
  {
    id: "metepec",
    nombre: "Metepec",
    moneda: "MXN",
    duraciones: [
      { id: "mensual", label: "Mensual", tachado: 3349, real: 2799, linkPago: "" },
      { id: "6meses", label: "6 meses", tachado: 20094, real: 13995, linkPago: "" },
      { id: "anual", label: "Anual", tachado: 40188, real: 30141, linkPago: "" },
    ],
  },
];

export function fmtMXN(n) {
  return "$" + n.toLocaleString("es-MX") + " MXN";
}

export function encontrarDuracion(planId, duracionId) {
  const plan = PLANES.find((p) => p.id === planId);
  const dur = plan?.duraciones.find((d) => d.id === duracionId);
  return plan && dur ? { plan, dur } : null;
}
