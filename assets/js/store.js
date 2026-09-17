/* =========================================================
   Millán Academy — capa de datos
   =========================================================

   La mayoría de las colecciones (alumnos, bitácora, agenda, pagos,
   check-ins, objetivos de profes) todavía viven en localStorage —
   sirven para probar la app, pero cada navegador ve su propia copia.

   "solicitudes" e "inscripciones" ya son distintas: esas las llena
   gente SIN cuenta desde el sitio público, así que viven en Supabase
   (compartidas de verdad) desde el primer día. El resto se va a ir
   migrando ahí en la próxima etapa.
   ========================================================= */

import { sb } from "./supabase-client.js";

const DB_KEY = "millan_academy_v2";

const SEDES = ["Polanco", "Metepec", "Miami", "LA", "Nueva York", "París", "A domicilio"];
const CATEGORIAS = ["1ra División", "2da División", "3ra División", "4ta División"];
const COACHES = ["Daniel Millán", "Eduardo Millán"];
const TALLAS = ["Niño - S", "Niño - M", "Niño - L", "Adulto - S", "Adulto - M", "Adulto - L", "Adulto - XL"];
const DIAS_DISPONIBLES = ["martes", "miércoles", "viernes"];
const HORAS_DISPONIBLES = ["19:00", "20:00", "21:00", "22:00"];
const DIA_INDEX = { domingo: 0, lunes: 1, martes: 2, "miércoles": 3, jueves: 4, viernes: 5, sábado: 6 };

function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

function seed() {
  const now = Date.now();
  const days = (n) => new Date(now + n * 86400000).toISOString();
  const past = (n) => new Date(now - n * 86400000).toISOString();

  return {
    alumnos: [
      {
        id: "al_1",
        nombre: "Emilio Vargas",
        categoria: "1ra División",
        sede: "Polanco",
        coach: "Daniel Millán",
        moneda: "MXN",
        telefono: "+52 55 1234 5678",
        correo: "papa.vargas@gmail.com",
        tallaPlayera: "Adulto - M",
        activo: true,
        alta: past(96),
        avatar: "EV",
        objetivos: [
          { id: uid("obj"), titulo: "Salidas en centros laterales", avance: 65 },
          { id: uid("obj"), titulo: "Juego con los pies bajo presión", avance: 40 },
        ],
        evaluacion: { tactica: 72, tecnica: 80, fisico: 68, comentarios: "Muy despierto tácticamente. Falta continuidad física en el segundo tiempo de la sesión." },
      },
      {
        id: "al_2",
        nombre: "Sofía Larrañaga",
        categoria: "2da División",
        sede: "Metepec",
        coach: "Eduardo Millán",
        moneda: "MXN",
        telefono: "+52 722 987 6543",
        correo: "familia.larranaga@hotmail.com",
        tallaPlayera: "Niño - M",
        activo: true,
        alta: past(52),
        avatar: "SL",
        objetivos: [
          { id: uid("obj"), titulo: "Colocación en mano a mano", avance: 55 },
          { id: uid("obj"), titulo: "Reflejos a distancia corta", avance: 70 },
        ],
        evaluacion: { tactica: 60, tecnica: 74, fisico: 66, comentarios: "Buena progresión técnica. Trabajar lectura del juego antes del disparo." },
      },
      {
        id: "al_3",
        nombre: "Kevin Ortiz",
        categoria: "1ra División",
        sede: "Miami",
        coach: "Daniel Millán",
        moneda: "USD",
        telefono: "+1 305 555 0192",
        correo: "kevin.ortiz.gk@gmail.com",
        tallaPlayera: "Adulto - L",
        activo: true,
        alta: past(140),
        avatar: "KO",
        objetivos: [
          { id: uid("obj"), titulo: "Saque de meta con el pie (precisión)", avance: 48 },
          { id: uid("obj"), titulo: "Lectura de centros al área chica", avance: 62 },
        ],
        evaluacion: { tactica: 70, tecnica: 66, fisico: 78, comentarios: "Físico ya de nivel Primera. Falta consistencia con el pie débil." },
      },
      {
        id: "al_4",
        nombre: "Valentina Cruz",
        categoria: "4ta División",
        sede: "LA",
        coach: "Eduardo Millán",
        moneda: "USD",
        telefono: "+1 213 555 0148",
        correo: "cruz.family@gmail.com",
        tallaPlayera: "Niño - S",
        activo: true,
        alta: past(18),
        avatar: "VC",
        objetivos: [
          { id: uid("obj"), titulo: "Postura base y desplazamientos", avance: 30 },
        ],
        evaluacion: { tactica: 40, tecnica: 45, fisico: 50, comentarios: "Recién empieza. Prioridad: perder el miedo al balón en salidas." },
      },
    ],

    bitacora: [
      { id: uid("bit"), alumnoId: "al_1", fecha: past(2), tipo: "Entrenamiento individual",
        nota: "Trabajo de salidas aéreas en centros laterales. Mejoró el timing del salto; todavía se anticipa antes de tiempo en balones a la espalda." },
      { id: uid("bit"), alumnoId: "al_1", fecha: past(9), tipo: "Análisis de video",
        nota: "Revisamos el último partido. Buen posicionamiento en 1v1, pierde metros en la reacción al primer rechace." },
      { id: uid("bit"), alumnoId: "al_1", fecha: past(30), tipo: "Clase de prueba",
        nota: "Primera sesión. Buena base técnica y actitud. Definimos plan de 12 semanas con foco en salidas y juego aéreo." },
      { id: uid("bit"), alumnoId: "al_2", fecha: past(1), tipo: "Entrenamiento individual",
        nota: "Circuito de mano a mano. Colocación mucho más sólida; hay que trabajar la recuperación rápida tras el primer rechace." },
      { id: uid("bit"), alumnoId: "al_2", fecha: past(15), tipo: "Preparación física",
        nota: "Trabajo de reflejos y reacción a distancias cortas con conos y balón reactivo." },
      { id: uid("bit"), alumnoId: "al_3", fecha: past(4), tipo: "Entrenamiento individual",
        nota: "Saque de meta con el pie: buena potencia, falta consistencia en la precisión al costado débil." },
      { id: uid("bit"), alumnoId: "al_3", fecha: past(20), tipo: "Análisis de video",
        nota: "Revisión de 2 partidos. Lectura de centros al área chica mejoró notablemente respecto al mes pasado." },
      { id: uid("bit"), alumnoId: "al_4", fecha: past(3), tipo: "Clase de prueba",
        nota: "Primera sesión. Postura base y desplazamientos laterales — trabajo desde cero, buena actitud y escucha." },
    ],

    reservas: [
      { id: uid("res"), alumnoId: "al_1", fecha: days(1), hora: "20:00", tipo: "Entrenamiento individual", duracion: 60, sede: "Polanco", estado: "confirmada" },
      { id: uid("res"), alumnoId: "al_2", fecha: days(2), hora: "19:00", tipo: "Entrenamiento individual", duracion: 60, sede: "Metepec", estado: "confirmada" },
      { id: uid("res"), alumnoId: null, fecha: days(2), hora: "21:00", tipo: "Diagnóstico", duracion: 20, sede: "A domicilio", estado: "disponible" },
      { id: uid("res"), alumnoId: "al_3", fecha: days(3), hora: "10:00", tipo: "Clase de prueba", duracion: 45, sede: "Miami", estado: "confirmada" },
      { id: uid("res"), alumnoId: null, fecha: days(5), hora: "19:00", tipo: "Clase de prueba", duracion: 45, sede: "Polanco", estado: "disponible" },
      { id: uid("res"), alumnoId: "al_4", fecha: days(4), hora: "22:00", tipo: "Entrenamiento individual", duracion: 60, sede: "LA", estado: "confirmada" },
    ],

    pagos: [
      { id: uid("pg"), alumnoId: "al_1", concepto: "Plan mensual · Polanco", metodo: "Mercado Pago", monto: 3349, moneda: "MXN", periodicidad: "mensual", fecha: past(6), estado: "pagado" },
      { id: uid("pg"), alumnoId: "al_2", concepto: "Plan mensual · Metepec", metodo: "Transferencia", monto: 2799, moneda: "MXN", periodicidad: "mensual", fecha: past(11), estado: "pagado" },
      { id: uid("pg"), alumnoId: "al_3", concepto: "Plan anual", metodo: "Stripe", monto: 3200, moneda: "USD", periodicidad: "anual", fecha: past(9), estado: "pagado" },
      { id: uid("pg"), alumnoId: "al_4", concepto: "Clase de prueba", metodo: "PayPal", monto: 25, moneda: "USD", periodicidad: null, fecha: past(3), estado: "pagado" },
      { id: uid("pg"), alumnoId: "al_1", concepto: "Plan mensual · Polanco", metodo: "Mercado Pago", monto: 3349, moneda: "MXN", periodicidad: "mensual", fecha: days(0), estado: "pendiente" },
      { id: uid("pg"), alumnoId: "al_2", concepto: "Plan mensual · Metepec", metodo: "Transferencia", monto: 2799, moneda: "MXN", periodicidad: "mensual", fecha: days(1), estado: "pendiente" },
    ],

    checkins: [
      { id: uid("chk"), nombre: "Eduardo Millán", sede: "Metepec", fecha: past(1), foto: null, estado: "enviado" },
      { id: uid("chk"), nombre: "Daniel Millán", sede: "Polanco", fecha: past(2), foto: null, estado: "enviado" },
    ],

    // objetivos por categoría — visibles para alumnos y profes ("qué se va a trabajar")
    objetivosCategoria: [
      { id: uid("oc"), categoria: "1ra División", profe: "Daniel Millán", titulo: "Juego aéreo bajo presión",
        detalle: "Salidas en centros al segundo palo y comunicación con la línea defensiva.", fecha: past(2) },
      { id: uid("oc"), categoria: "2da División", profe: "Eduardo Millán", titulo: "Mano a mano",
        detalle: "Colocación y timing de salida en situaciones de 1v1 dentro del área.", fecha: past(3) },
      { id: uid("oc"), categoria: "3ra División", profe: "Eduardo Millán", titulo: "Base técnica",
        detalle: "Postura, desplazamientos laterales y recepción del balón con las dos manos.", fecha: past(1) },
      { id: uid("oc"), categoria: "4ta División", profe: "Daniel Millán", titulo: "Perder el miedo al balón",
        detalle: "Ejercicios progresivos de salidas cortas y caídas controladas.", fecha: past(4) },
    ],

    // contacto para plan personalizado
    contactos: [],

    // configuración editable del panel (punto de equilibrio, etc.)
    config: { costosFijosMXN: 45000 },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // migración: si esta sesión guardó datos antes de que existiera alguna
      // colección nueva, la completamos sin pisar lo demás.
      const fresh = seed();
      for (const key of Object.keys(fresh)) {
        if (!(key in data)) data[key] = fresh[key];
      }
      return data;
    }
  } catch (e) { /* localStorage no disponible: seguimos con datos de ejemplo en memoria */ }
  const data = seed();
  save(data);
  return data;
}

function save(data) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(data)); } catch (e) { /* modo privado / cuota: se pierde al recargar */ }
}

const state = load();

/* siguiente ocurrencia de un día de la semana (0=dom) a partir de hoy, +offset días extra */
function proximaFecha(diaNombre, semanasAdelante) {
  const objetivo = DIA_INDEX[diaNombre];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let delta = (objetivo - hoy.getDay() + 7) % 7;
  if (delta === 0) delta = 7; // siempre la próxima, no hoy mismo
  const fecha = new Date(hoy.getTime() + (delta + semanasAdelante * 7) * 86400000);
  return fecha.toISOString();
}

/* =========================================================
   solicitudes e inscripciones — respaldadas por Supabase.
   Guardamos una copia en memoria (_solicitudes/_inscripciones) que
   se refresca después de cada cambio, así el resto del código las
   lee de forma sincrónica igual que a las demás colecciones.
   ========================================================= */
let _solicitudes = [];
let _inscripciones = [];

function mapSolicitud(row) {
  return { id: row.id, nombre: row.nombre, edad: row.edad, telefono: row.telefono, pais: row.pais, zona: row.zona, sede: row.sede, mensaje: row.mensaje, estado: row.estado, fecha: row.fecha };
}
function mapInscripcion(row) {
  return {
    id: row.id, nombre: row.nombre, telefono: row.telefono, planId: row.plan_id, duracionId: row.duracion_id,
    planNombre: row.plan_nombre, duracionLabel: row.duracion_label, monto: row.monto, moneda: row.moneda,
    tallaPlayera: row.talla_playera, estado: row.estado, fecha: row.fecha,
  };
}

async function cargarSolicitudes() {
  const { data, error } = await sb.from("solicitudes").select("*").order("fecha", { ascending: false });
  if (!error && data) _solicitudes = data.map(mapSolicitud);
  // si hay error (ej. todavía no iniciaste sesión, o no se corrió el schema.sql) dejamos la lista como estaba
}
async function cargarInscripciones() {
  const { data, error } = await sb.from("inscripciones").select("*").order("fecha", { ascending: false });
  if (!error && data) _inscripciones = data.map(mapInscripcion);
}

const ready = Promise.all([cargarSolicitudes(), cargarInscripciones()]);

export const Store = {
  SEDES, CATEGORIAS, COACHES, TALLAS, DIAS_DISPONIBLES, HORAS_DISPONIBLES,
  ready,

  all() { return state; },

  reset() {
    const fresh = seed();
    save(fresh);
    Object.assign(state, fresh);
    return state;
  },

  // ---- alumnos ----
  alumnos() { return state.alumnos; },
  alumno(id) { return state.alumnos.find(a => a.id === id) || null; },
  addAlumno(data) {
    const a = {
      id: uid("al"), objetivos: [], activo: true, alta: new Date().toISOString(),
      evaluacion: { tactica: 0, tecnica: 0, fisico: 0, comentarios: "" },
      ...data,
    };
    state.alumnos.unshift(a);
    save(state);
    return a;
  },
  actualizarEvaluacion(id, patch) {
    const a = this.alumno(id);
    if (a) { a.evaluacion = { ...a.evaluacion, ...patch }; save(state); }
    return a;
  },
  eliminarAlumno(id) {
    state.alumnos = state.alumnos.filter((a) => a.id !== id);
    save(state);
  },

  // ---- bitácora ----
  bitacoraDe(alumnoId) {
    return state.bitacora
      .filter(b => b.alumnoId === alumnoId)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },
  addBitacora(entry) {
    const e = { id: uid("bit"), fecha: new Date().toISOString(), ...entry };
    state.bitacora.unshift(e);
    save(state);
    return e;
  },

  // ---- reservas ----
  reservas() {
    return state.reservas.slice().sort((a, b) => new Date(a.fecha + "T" + a.hora) - new Date(b.fecha + "T" + b.hora));
  },
  addReserva(entry) {
    const r = { id: uid("res"), estado: "confirmada", ...entry };
    state.reservas.push(r);
    save(state);
    return r;
  },
  reservar(id, alumnoId) {
    const r = state.reservas.find(x => x.id === id);
    if (r) { r.alumnoId = alumnoId; r.estado = "confirmada"; save(state); }
    return r;
  },
  // crea huecos disponibles para los próximos martes/miércoles/viernes a las 4 horas fijas
  generarHorariosSemana(sede, semanas = 1) {
    let creados = 0;
    for (let s = 0; s < semanas; s++) {
      for (const dia of DIAS_DISPONIBLES) {
        const fecha = proximaFecha(dia, s);
        for (const hora of HORAS_DISPONIBLES) {
          const yaExiste = state.reservas.some((r) => r.fecha.slice(0, 10) === fecha.slice(0, 10) && r.hora === hora && r.sede === sede);
          if (yaExiste) continue;
          state.reservas.push({ id: uid("res"), alumnoId: null, fecha, hora, tipo: "Entrenamiento individual", duracion: 60, sede, estado: "disponible" });
          creados++;
        }
      }
    }
    save(state);
    return creados;
  },

  // ---- solicitudes de clase de prueba (Supabase — compartidas de verdad) ----
  solicitudes() {
    return _solicitudes;
  },
  async addSolicitud(entry) {
    const { data, error } = await sb.from("solicitudes").insert({
      nombre: entry.nombre, edad: entry.edad, telefono: entry.telefono, pais: entry.pais, zona: entry.zona, sede: entry.sede, mensaje: entry.mensaje,
    }).select().single();
    if (error) throw error;
    await cargarSolicitudes();
    return mapSolicitud(data);
  },
  async actualizarSolicitud(id, estado) {
    const { error } = await sb.from("solicitudes").update({ estado }).eq("id", id);
    if (error) throw error;
    await cargarSolicitudes();
  },

  // ---- pagos ----
  pagos() {
    return state.pagos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },
  addPago(entry) {
    const p = { id: uid("pg"), fecha: new Date().toISOString(), estado: "pendiente", ...entry };
    state.pagos.unshift(p);
    save(state);
    return p;
  },

  // ---- check-ins (llegada a cancha con foto) ----
  checkins() {
    return state.checkins.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },
  addCheckin(entry) {
    const c = { id: uid("chk"), fecha: new Date().toISOString(), estado: "enviando", foto: null, ...entry };
    state.checkins.unshift(c);
    save(state);
    return c;
  },
  updateCheckin(id, patch) {
    const c = state.checkins.find((x) => x.id === id);
    if (c) { Object.assign(c, patch); save(state); }
    return c;
  },

  // ---- objetivos por categoría (sección de profes) ----
  objetivosCategoria() {
    return state.objetivosCategoria.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },
  objetivosDeCategoria(categoria) {
    return this.objetivosCategoria().filter((o) => o.categoria === categoria);
  },
  addObjetivoCategoria(entry) {
    const o = { id: uid("oc"), fecha: new Date().toISOString(), ...entry };
    state.objetivosCategoria.unshift(o);
    save(state);
    return o;
  },

  // ---- inscripciones (botón "Inscribirse" del sitio, Supabase — compartidas de verdad) ----
  inscripciones() {
    return _inscripciones;
  },
  async addInscripcion(entry) {
    const { data, error } = await sb.from("inscripciones").insert({
      nombre: entry.nombre, telefono: entry.telefono, plan_id: entry.planId, duracion_id: entry.duracionId,
      plan_nombre: entry.planNombre, duracion_label: entry.duracionLabel, monto: entry.monto, moneda: entry.moneda,
      talla_playera: entry.tallaPlayera,
    }).select().single();
    if (error) throw error;
    await cargarInscripciones();
    return mapInscripcion(data);
  },
  async actualizarInscripcion(id, estado) {
    const { error } = await sb.from("inscripciones").update({ estado }).eq("id", id);
    if (error) throw error;
    await cargarInscripciones();
  },

  // ---- contacto para plan personalizado ----
  contactos() {
    return state.contactos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },
  addContacto(entry) {
    const c = { id: uid("ct"), fecha: new Date().toISOString(), ...entry };
    state.contactos.unshift(c);
    save(state);
    return c;
  },

  // ---- configuración (punto de equilibrio, etc.) ----
  config() { return state.config; },
  setCostosFijos(monto) {
    state.config.costosFijosMXN = monto;
    save(state);
  },
};
