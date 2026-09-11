/* =========================================================
   Millán Academy — capa de datos (demo local)
   Todo se guarda en localStorage del navegador. No hay
   backend todavía: esto sirve para probar la app con datos
   reales de ejemplo antes de conectarla a una base de datos
   de verdad (siguiente etapa).
   ========================================================= */

const DB_KEY = "millan_academy_v1";

const SEDES = ["CDMX", "Metepec", "Miami", "LA"];
const CATEGORIAS = ["Sub-11", "Sub-13", "Sub-15", "Sub-17", "Sub-20"];
const COACHES = ["Daniel Millán", "Eduardo Millán"];

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
        categoria: "Sub-15",
        sede: "CDMX",
        coach: "Daniel Millán",
        moneda: "MXN",
        alta: past(96),
        avatar: "EV",
        objetivos: [
          { id: uid("obj"), titulo: "Salidas en centros laterales", avance: 65 },
          { id: uid("obj"), titulo: "Juego con los pies bajo presión", avance: 40 },
        ],
      },
      {
        id: "al_2",
        nombre: "Sofía Larrañaga",
        categoria: "Sub-13",
        sede: "Metepec",
        coach: "Eduardo Millán",
        moneda: "MXN",
        alta: past(52),
        avatar: "SL",
        objetivos: [
          { id: uid("obj"), titulo: "Colocación en mano a mano", avance: 55 },
          { id: uid("obj"), titulo: "Reflejos a distancia corta", avance: 70 },
        ],
      },
      {
        id: "al_3",
        nombre: "Kevin Ortiz",
        categoria: "Sub-17",
        sede: "Miami",
        coach: "Daniel Millán",
        moneda: "USD",
        alta: past(140),
        avatar: "KO",
        objetivos: [
          { id: uid("obj"), titulo: "Saque de meta con el pie (precisión)", avance: 48 },
          { id: uid("obj"), titulo: "Lectura de centros al área chica", avance: 62 },
        ],
      },
      {
        id: "al_4",
        nombre: "Valentina Cruz",
        categoria: "Sub-11",
        sede: "LA",
        coach: "Eduardo Millán",
        moneda: "USD",
        alta: past(18),
        avatar: "VC",
        objetivos: [
          { id: uid("obj"), titulo: "Postura base y desplazamientos", avance: 30 },
        ],
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
        nota: "Revisión de 2 partidos de Sub-17. Lectura de centros al área chica mejoró notablemente respecto al mes pasado." },
      { id: uid("bit"), alumnoId: "al_4", fecha: past(3), tipo: "Clase de prueba",
        nota: "Primera sesión. Postura base y desplazamientos laterales — trabajo desde cero, buena actitud y escucha." },
    ],

    reservas: [
      { id: uid("res"), alumnoId: "al_1", fecha: days(1), hora: "17:00", tipo: "Entrenamiento individual", duracion: 60, sede: "CDMX", estado: "confirmada" },
      { id: uid("res"), alumnoId: "al_2", fecha: days(2), hora: "18:00", tipo: "Entrenamiento individual", duracion: 60, sede: "Metepec", estado: "confirmada" },
      { id: uid("res"), alumnoId: null, fecha: days(2), hora: "20:00", tipo: "Diagnóstico", duracion: 20, sede: "Online", estado: "disponible" },
      { id: uid("res"), alumnoId: "al_3", fecha: days(3), hora: "10:00", tipo: "Clase de prueba", duracion: 45, sede: "Miami", estado: "confirmada" },
      { id: uid("res"), alumnoId: null, fecha: days(4), hora: "18:00", tipo: "Clase de prueba", duracion: 45, sede: "Online", estado: "disponible" },
      { id: uid("res"), alumnoId: "al_4", fecha: days(5), hora: "11:30", tipo: "Entrenamiento individual", duracion: 60, sede: "LA", estado: "confirmada" },
    ],

    solicitudes: [
      { id: uid("sol"), nombre: "Renata Solís", edad: 14, pais: "México", zona: "GMT-6", sede: "CDMX",
        mensaje: "Portera Sub-15, juega en fuerzas básicas. Busca clase de prueba entre semana.", fecha: past(1), estado: "pendiente" },
      { id: uid("sol"), nombre: "Takeshi Mori", edad: 16, pais: "Japón", zona: "GMT+9", sede: "Online",
        mensaje: "Vive en Japón, quiere probar una sesión online antes de viajar a un campus en Miami.", fecha: past(2), estado: "pendiente" },
    ],

    pagos: [
      { id: uid("pg"), alumnoId: "al_1", concepto: "Plan mensual · 8 sesiones", metodo: "Mercado Pago", monto: 4800, moneda: "MXN", fecha: past(6), estado: "pagado" },
      { id: uid("pg"), alumnoId: "al_2", concepto: "Plan mensual · 8 sesiones", metodo: "Mercado Pago", monto: 4200, moneda: "MXN", fecha: past(11), estado: "pagado" },
      { id: uid("pg"), alumnoId: "al_3", concepto: "Bono 10 sesiones", metodo: "Stripe", monto: 620, moneda: "USD", fecha: past(9), estado: "pagado" },
      { id: uid("pg"), alumnoId: "al_4", concepto: "Clase de prueba", metodo: "PayPal", monto: 25, moneda: "USD", fecha: past(3), estado: "pagado" },
      { id: uid("pg"), alumnoId: "al_1", concepto: "Plan mensual · 8 sesiones", metodo: "Mercado Pago", monto: 4800, moneda: "MXN", fecha: days(0), estado: "pendiente" },
    ],

    checkins: [
      { id: uid("chk"), nombre: "Eduardo Millán", sede: "Metepec", fecha: past(1), foto: null, estado: "enviado" },
      { id: uid("chk"), nombre: "Daniel Millán", sede: "CDMX", fecha: past(2), foto: null, estado: "enviado" },
    ],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // migración: si esta sesión guardó datos antes de que existiera alguna
      // colección nueva (por ej. checkins), la completamos sin pisar lo demás.
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

let _mem = null;
function save(data) {
  _mem = data;
  try { localStorage.setItem(DB_KEY, JSON.stringify(data)); } catch (e) { /* modo privado / cuota: se pierde al recargar */ }
}

const state = load();

export const Store = {
  SEDES, CATEGORIAS, COACHES,

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
    const a = { id: uid("al"), objetivos: [], alta: new Date().toISOString(), ...data };
    state.alumnos.unshift(a);
    save(state);
    return a;
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

  // ---- solicitudes de clase de prueba ----
  solicitudes() {
    return state.solicitudes.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },
  addSolicitud(entry) {
    const s = { id: uid("sol"), fecha: new Date().toISOString(), estado: "pendiente", ...entry };
    state.solicitudes.unshift(s);
    save(state);
    return s;
  },
  actualizarSolicitud(id, estado) {
    const s = state.solicitudes.find(x => x.id === id);
    if (s) { s.estado = estado; save(state); }
    return s;
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
};
