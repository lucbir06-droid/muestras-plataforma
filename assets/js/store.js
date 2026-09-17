/* =========================================================
   Millán Academy — capa de datos (demo local)
   Todo se guarda en localStorage del navegador. No hay
   backend todavía: esto sirve para probar la app con datos
   reales de ejemplo antes de conectarla a una base de datos
   compartida de verdad (Supabase — siguiente etapa).
   ========================================================= */

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

    solicitudes: [
      { id: uid("sol"), nombre: "Renata Solís", edad: 14, telefono: "+52 55 4455 6677", pais: "México", zona: "GMT-6", sede: "Polanco",
        mensaje: "Portera 2da división, juega en fuerzas básicas. Busca clase de prueba entre semana.", fecha: past(1), estado: "pendiente" },
      { id: uid("sol"), nombre: "Takeshi Mori", edad: 16, telefono: "+81 90 1234 5678", pais: "Japón", zona: "GMT+9", sede: "A domicilio",
        mensaje: "Vive en Japón, quiere probar una sesión antes de viajar a un campus en Miami.", fecha: past(2), estado: "pendiente" },
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

    // solicitudes de inscripción (botón "Inscribirse" del sitio) — pendientes de pago
    // hasta que el plan tenga un link de Mercado Pago conectado.
    inscripciones: [],

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

export const Store = {
  SEDES, CATEGORIAS, COACHES, TALLAS, DIAS_DISPONIBLES, HORAS_DISPONIBLES,

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

  // ---- inscripciones (botón "Inscribirse" del sitio) ----
  inscripciones() {
    return state.inscripciones.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },
  addInscripcion(entry) {
    const i = { id: uid("ins"), fecha: new Date().toISOString(), estado: "pendiente de pago", ...entry };
    state.inscripciones.unshift(i);
    save(state);
    return i;
  },
  actualizarInscripcion(id, estado) {
    const i = state.inscripciones.find((x) => x.id === id);
    if (i) { i.estado = estado; save(state); }
    return i;
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
