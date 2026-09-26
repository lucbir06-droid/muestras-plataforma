/* =========================================================
   Millán Academy — capa de datos (Supabase)
   =========================================================

   Todo vive en Supabase (compartido entre dispositivos y protegido
   por los permisos de supabase/schema.sql). Para que el resto del
   código siga leyendo de forma sincrónica, guardamos una copia en
   memoria (C) que se carga al iniciar sesión (Store.load) y se
   refresca después de cada cambio.

   Lo único que sigue en localStorage es la configuración local del
   panel (costos fijos para el punto de equilibrio).
   ========================================================= */

import { sb } from "./supabase-client.js?v=8";

const DB_KEY = "millan_academy_v3";

// Dónde se entrena de verdad (agenda, asistencia, check-in, alta de alumnos).
// Miami, LA, Nueva York, París, etc. son ciudades de origen de alumnos
// internacionales, no sedes propias — eso se muestra aparte en el sitio.
const SEDES = ["Polanco", "Metepec"];
const CATEGORIAS = ["1ra División", "2da División", "3ra División", "4ta División"];
const TALLAS = ["Niño - S", "Niño - M", "Niño - L", "Adulto - S", "Adulto - M", "Adulto - L", "Adulto - XL"];
const DIAS_DISPONIBLES = ["martes", "miércoles", "viernes"];
const HORAS_DISPONIBLES = ["19:00", "20:00", "21:00", "22:00"];
const DIA_INDEX = { domingo: 0, lunes: 1, martes: 2, "miércoles": 3, jueves: 4, viernes: 5, sábado: 6 };

function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}
function iniciales(nombre) {
  return String(nombre || "").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
// "YYYY-MM-DD" con la fecha LOCAL (toISOString usaría UTC y puede correr un día)
function toYMD(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function aYMD(valor) {
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10);
  return toYMD(new Date(valor));
}

/* ---------------- configuración local ---------------- */
function loadLocal() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return { config: { costosFijosMXN: 45000 }, ...JSON.parse(raw) };
  } catch (e) { /* localStorage no disponible */ }
  return { config: { costosFijosMXN: 45000 } };
}
function saveLocal() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(state)); } catch (e) { /* modo privado / cuota */ }
}
const state = loadLocal();

/* siguiente ocurrencia de un día de la semana, +N semanas */
function proximaFecha(diaNombre, semanasAdelante) {
  const objetivo = DIA_INDEX[diaNombre];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let delta = (objetivo - hoy.getDay() + 7) % 7;
  if (delta === 0) delta = 7; // siempre la próxima, no hoy mismo
  return new Date(hoy.getTime() + (delta + semanasAdelante * 7) * 86400000);
}

/* ---------------- copia en memoria + cargadores ---------------- */
const C = {
  alumnos: [], bitacora: [], reservas: [], pagos: [], checkins: [], asistencias: [],
  evidencias: [], solicitudes: [], inscripciones: [], objetivos: [], perfiles: [], mensajes: [],
};

const urlFoto = (bucket, path) => (path ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : null);

const mapAlumno = (r) => ({
  id: r.id, nombre: r.nombre, categoria: r.categoria, sede: r.sede, coach: r.coach, coachId: r.coach_id,
  moneda: r.moneda || "MXN", telefono: r.telefono || "", correo: r.correo || "", tallaPlayera: r.talla_playera || "",
  activo: r.activo, avatar: r.avatar || iniciales(r.nombre), objetivos: r.objetivos || [],
  evaluacion: r.evaluacion || { tactica: 0, tecnica: 0, fisico: 0, comentarios: "" },
  alta: r.alta, codigoVinculo: r.codigo_vinculo,
});
const mapBitacora = (r) => ({ id: r.id, alumnoId: r.alumno_id, tipo: r.tipo, nota: r.nota, autor: r.autor, fecha: r.fecha });
// la fecha de una reserva es un día (sin hora): la dejamos al mediodía local para que ninguna zona horaria la corra de día
const mapReserva = (r) => ({
  id: r.id, alumnoId: r.alumno_id, fecha: `${r.fecha}T12:00:00`, hora: r.hora, tipo: r.tipo,
  duracion: r.duracion, sede: r.sede, estado: r.estado,
});
const mapPago = (r) => ({
  id: r.id, alumnoId: r.alumno_id, concepto: r.concepto, metodo: r.metodo, monto: Number(r.monto),
  moneda: r.moneda, periodicidad: r.periodicidad, fecha: r.fecha, estado: r.estado,
});
const mapCheckin = (r) => ({
  id: r.id, nombre: r.nombre, sede: r.sede, tipo: r.tipo || "entrada", resumen: r.resumen,
  fotoUrl: urlFoto("checkins", r.foto_path), estado: r.estado, fecha: r.fecha, registradoPor: r.registrado_por,
});
const mapAsistencia = (r) => ({
  id: r.id, alumnoId: r.alumno_id, fecha: r.fecha, sede: r.sede, presente: r.presente, registradoPor: r.registrado_por,
});
const mapEvidencia = (r) => ({
  id: r.id, alumnoId: r.alumno_id, alumnoNombre: r.alumno_nombre, tipo: r.tipo, comentario: r.comentario,
  fotoUrl: urlFoto("evidencias", r.foto_path), fecha: r.fecha,
});
const mapSolicitud = (r) => ({
  id: r.id, nombre: r.nombre, edad: r.edad, telefono: r.telefono, pais: r.pais, zona: r.zona, sede: r.sede,
  mensaje: r.mensaje, estado: r.estado, fecha: r.fecha, userId: r.user_id,
});
const mapInscripcion = (r) => ({
  id: r.id, nombre: r.nombre, telefono: r.telefono, planId: r.plan_id, duracionId: r.duracion_id,
  planNombre: r.plan_nombre, duracionLabel: r.duracion_label, monto: Number(r.monto), moneda: r.moneda,
  tallaPlayera: r.talla_playera, estado: r.estado, fecha: r.fecha,
});
const mapObjetivo = (r) => ({ id: r.id, categoria: r.categoria, profe: r.profe, titulo: r.titulo, detalle: r.detalle, fecha: r.fecha });
const mapPerfil = (r) => ({ id: r.id, nombre: r.nombre, telefono: r.telefono, pais: r.pais, rol: r.rol, rolSolicitado: r.rol_solicitado });
const mapMensaje = (r) => ({
  id: r.id, tipo: r.tipo, categoria: r.categoria, profeId: r.profe_id, alumnoId: r.alumno_id,
  autorId: r.autor_id, autorNombre: r.autor_nombre, autorRol: r.autor_rol, contenido: r.contenido, fecha: r.creado_en,
});

const TABLAS = {
  alumnos:       { tabla: "alumnos",             orden: ["alta", false],   map: mapAlumno },
  bitacora:      { tabla: "bitacora",            orden: ["fecha", false],  map: mapBitacora },
  reservas:      { tabla: "reservas",            orden: ["fecha", true],   map: mapReserva },
  pagos:         { tabla: "pagos",               orden: ["fecha", false],  map: mapPago },
  checkins:      { tabla: "checkins",            orden: ["fecha", false],  map: mapCheckin },
  asistencias:   { tabla: "asistencias",         orden: ["fecha", false],  map: mapAsistencia },
  evidencias:    { tabla: "evidencias",          orden: ["fecha", false],  map: mapEvidencia },
  solicitudes:   { tabla: "solicitudes",         orden: ["fecha", false],  map: mapSolicitud },
  inscripciones: { tabla: "inscripciones",       orden: ["fecha", false],  map: mapInscripcion },
  objetivos:     { tabla: "objetivos_categoria", orden: ["fecha", false],  map: mapObjetivo },
  perfiles:      { tabla: "perfiles",            orden: ["creado_en", true], map: mapPerfil },
  mensajes:      { tabla: "mensajes",            orden: ["creado_en", true], map: mapMensaje },
};

async function cargar(clave) {
  const def = TABLAS[clave];
  const { data, error } = await sb.from(def.tabla).select("*").order(def.orden[0], { ascending: def.orden[1] });
  if (error) { console.warn(`No se pudo cargar "${def.tabla}":`, error.message); return; }
  C[clave] = (data || []).map(def.map);
}

let cargandoPara = null;   // promesa en curso (evita cargar dos veces a la vez)
let cargadoDe = null;      // id de la cuenta para la que ya está cargado

async function insertar(tabla, filas) {
  const { data, error } = await sb.from(tabla).insert(filas).select();
  if (error) throw error;
  return data;
}

export const Store = {
  SEDES, CATEGORIAS, TALLAS, DIAS_DISPONIBLES, HORAS_DISPONIBLES,

  /* ---- ciclo de vida ---- */
  // carga todo lo que la cuenta actual tiene permiso de ver
  load(userId) {
    if (cargadoDe === userId) return Promise.resolve();
    if (cargandoPara && cargandoPara.userId === userId) return cargandoPara.promesa;
    const promesa = Promise.all(Object.keys(TABLAS).map(cargar)).then(() => { cargadoDe = userId; });
    cargandoPara = { userId, promesa };
    return promesa;
  },
  clear() {
    for (const k of Object.keys(C)) C[k] = [];
    cargadoDe = null;
    cargandoPara = null;
  },
  recargar(...claves) { return Promise.all(claves.map(cargar)); },

  /* ---- alumnos ---- */
  alumnos() { return C.alumnos; },
  alumno(id) { return C.alumnos.find((a) => a.id === id) || null; },
  async addAlumno(d) {
    const [fila] = await insertar("alumnos", {
      nombre: d.nombre, categoria: d.categoria, sede: d.sede, coach: d.coach || null, coach_id: d.coachId || null,
      moneda: d.moneda, telefono: d.telefono, correo: d.correo, talla_playera: d.tallaPlayera, avatar: iniciales(d.nombre),
    });
    await cargar("alumnos");
    return mapAlumno(fila);
  },
  async actualizarEvaluacion(id, patch) {
    const a = this.alumno(id);
    const evaluacion = { ...(a?.evaluacion || {}), ...patch };
    const { error } = await sb.from("alumnos").update({ evaluacion }).eq("id", id);
    if (error) throw error;
    await cargar("alumnos");
  },
  async asignarCoach(alumnoId, coachId) {
    const coach = C.perfiles.find((p) => p.id === coachId);
    const { error } = await sb.from("alumnos").update({ coach_id: coachId || null, coach: coach?.nombre || null }).eq("id", alumnoId);
    if (error) throw error;
    await cargar("alumnos");
  },
  async eliminarAlumno(id) {
    const { error } = await sb.from("alumnos").delete().eq("id", id);
    if (error) throw error;
    await Promise.all(["alumnos", "bitacora", "reservas", "pagos", "asistencias", "evidencias"].map(cargar));
  },
  // el papá / alumno escribe el código que le dio la academia
  async vincularAlumno(codigo) {
    const { error } = await sb.rpc("vincular_alumno", { p_codigo: codigo });
    if (error) throw error;
    await Promise.all(Object.keys(TABLAS).map(cargar));
  },

  /* ---- staff (para asignar profes) ---- */
  perfiles() { return C.perfiles; },
  coaches() { return C.perfiles.filter((p) => p.rol === "profe" || p.rol === "dueño"); },
  profesPendientes() { return C.perfiles.filter((p) => p.rol === "alumno" && p.rolSolicitado === "profe"); },
  async aprobarProfe(id) {
    const { error } = await sb.from("perfiles").update({ rol: "profe" }).eq("id", id);
    if (error) throw error;
    await cargar("perfiles");
  },
  // solo el dueño puede cambiar el rol de una cuenta (lo exige la base de datos)
  async cambiarRol(id, rol) {
    const { error } = await sb.from("perfiles").update({ rol }).eq("id", id);
    if (error) throw error;
    await cargar("perfiles");
  },

  /* ---- bitácora / reportes ---- */
  bitacoraDe(alumnoId) {
    return C.bitacora.filter((b) => b.alumnoId === alumnoId).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },
  async addBitacora({ alumnoId, tipo, nota, fecha, autor }) {
    await insertar("bitacora", { alumno_id: alumnoId, tipo, nota, autor, fecha: fecha || new Date().toISOString() });
    await cargar("bitacora");
  },

  /* ---- agenda ---- */
  reservas() {
    return C.reservas.slice().sort((a, b) => new Date(a.fecha.slice(0, 10) + "T" + a.hora) - new Date(b.fecha.slice(0, 10) + "T" + b.hora));
  },
  async addReserva({ alumnoId = null, fecha, hora, tipo, duracion, sede, estado = "confirmada" }) {
    await insertar("reservas", { alumno_id: alumnoId, fecha: aYMD(fecha), hora, tipo, duracion, sede, estado });
    await cargar("reservas");
  },
  async reservar(id, alumnoId) {
    const { error } = await sb.from("reservas").update({ alumno_id: alumnoId, estado: "confirmada" }).eq("id", id);
    if (error) throw error;
    await cargar("reservas");
  },
  // crea huecos disponibles para los próximos martes/miércoles/viernes a las 4 horas fijas
  async generarHorariosSemana(sede, semanas = 1) {
    const filas = [];
    for (let s = 0; s < semanas; s++) {
      for (const dia of DIAS_DISPONIBLES) {
        const fecha = toYMD(proximaFecha(dia, s));
        for (const hora of HORAS_DISPONIBLES) {
          const yaExiste = C.reservas.some((r) => r.fecha.slice(0, 10) === fecha && r.hora === hora && r.sede === sede);
          if (!yaExiste) filas.push({ alumno_id: null, fecha, hora, tipo: "Entrenamiento individual", duracion: 60, sede, estado: "disponible" });
        }
      }
    }
    if (filas.length) {
      await insertar("reservas", filas);
      await cargar("reservas");
    }
    return filas.length;
  },

  /* ---- asistencia ---- */
  asistencias() { return C.asistencias; },
  asistenciasDe(fecha, sede) { return C.asistencias.filter((a) => a.fecha === fecha && a.sede === sede); },
  asistenciasAlumno(alumnoId) { return C.asistencias.filter((a) => a.alumnoId === alumnoId); },
  // veces que asistió en los últimos N días
  conteoAsistencia(alumnoId, dias = 30) {
    const desde = toYMD(new Date(Date.now() - dias * 86400000));
    return C.asistencias.filter((a) => a.alumnoId === alumnoId && a.presente && a.fecha >= desde).length;
  },
  // items: [{ alumnoId, presente }]
  async guardarAsistencias(fecha, sede, items, registradoPor) {
    if (!items.length) return;
    const filas = items.map((i) => ({ alumno_id: i.alumnoId, fecha, sede, presente: i.presente, registrado_por: registradoPor }));
    const { error } = await sb.from("asistencias").upsert(filas, { onConflict: "alumno_id,fecha,sede" });
    if (error) throw error;
    await cargar("asistencias");
  },

  /* ---- solicitudes de clase de prueba ---- */
  solicitudes() { return C.solicitudes; },
  async addSolicitud(e) {
    await insertar("solicitudes", {
      nombre: e.nombre, edad: e.edad, telefono: e.telefono, pais: e.pais, zona: e.zona, sede: e.sede, mensaje: e.mensaje,
    });
    await cargar("solicitudes");
  },
  async actualizarSolicitud(id, estado) {
    const { error } = await sb.from("solicitudes").update({ estado }).eq("id", id);
    if (error) throw error;
    await cargar("solicitudes");
  },
  // el dueño confirma la clase de prueba: esto da de alta al alumno con los
  // datos de la solicitud y liga la cuenta que la mandó — así se desbloquea
  // toda la app para esa cuenta sin tener que pedirle ningún código.
  async confirmarSolicitud(s) {
    const [fila] = await insertar("alumnos", {
      nombre: s.nombre, sede: s.sede, telefono: s.telefono || null, avatar: iniciales(s.nombre),
    });
    if (s.userId) {
      const { error } = await sb.from("alumno_usuarios").insert({ alumno_id: fila.id, user_id: s.userId });
      if (error) throw error;
    }
    const { error: errEstado } = await sb.from("solicitudes").update({ estado: "confirmada" }).eq("id", s.id);
    if (errEstado) throw errEstado;
    await Promise.all(["alumnos", "solicitudes"].map(cargar));
    return mapAlumno(fila);
  },

  /* ---- inscripciones ---- */
  inscripciones() { return C.inscripciones; },
  async addInscripcion(e) {
    await insertar("inscripciones", {
      nombre: e.nombre, telefono: e.telefono, plan_id: e.planId, duracion_id: e.duracionId,
      plan_nombre: e.planNombre, duracion_label: e.duracionLabel, monto: e.monto, moneda: e.moneda,
      talla_playera: e.tallaPlayera,
    });
    await cargar("inscripciones");
  },
  async actualizarInscripcion(id, estado) {
    const { error } = await sb.from("inscripciones").update({ estado }).eq("id", id);
    if (error) throw error;
    await cargar("inscripciones");
  },

  /* ---- pagos ---- */
  pagos() { return C.pagos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); },
  async addPago(e) {
    await insertar("pagos", {
      alumno_id: e.alumnoId || null, concepto: e.concepto, metodo: e.metodo, monto: e.monto, moneda: e.moneda,
      periodicidad: e.periodicidad || null, estado: e.estado || "pendiente",
    });
    await cargar("pagos");
  },

  /* ---- check-in / check-out ---- */
  checkins() { return C.checkins.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); },
  // devuelve el registro creado (para poder marcar después si el email salió o no)
  async addCheckin({ nombre, sede, tipo = "entrada", resumen = null, fotoBlob = null, estado = "guardado" }) {
    let fotoPath = null;
    if (fotoBlob) {
      fotoPath = `${Date.now()}-${uid("ck")}.jpg`;
      const { error: upErr } = await sb.storage.from("checkins").upload(fotoPath, fotoBlob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
    }
    const [fila] = await insertar("checkins", { nombre, sede, tipo, resumen, foto_path: fotoPath, estado });
    await cargar("checkins");
    return mapCheckin(fila);
  },
  async updateCheckin(id, patch) {
    const { error } = await sb.from("checkins").update(patch).eq("id", id);
    if (error) throw error;
    await cargar("checkins");
  },

  /* ---- objetivos por categoría (sección de profes) ---- */
  objetivosCategoria() { return C.objetivos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); },
  async addObjetivoCategoria(e) {
    await insertar("objetivos_categoria", { categoria: e.categoria, profe: e.profe, titulo: e.titulo, detalle: e.detalle });
    await cargar("objetivos");
  },

  /* ---- evidencias (pruebas que sube el alumno: gym, comidas, etc.) ---- */
  evidencias() { return C.evidencias; },
  evidenciasDe(alumnoId) { return C.evidencias.filter((e) => e.alumnoId === alumnoId); },
  async addEvidencia({ alumnoId, alumnoNombre, tipo, comentario, fotoBlob }) {
    let fotoPath = null;
    if (fotoBlob) {
      fotoPath = `${Date.now()}-${uid("ev")}.jpg`;
      const { error: upErr } = await sb.storage.from("evidencias").upload(fotoPath, fotoBlob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
    }
    await insertar("evidencias", { alumno_id: alumnoId, alumno_nombre: alumnoNombre, tipo, comentario, foto_path: fotoPath });
    await cargar("evidencias");
  },

  /* ---- chat (canales por categoría + mensajes directos con un profe) ---- */
  mensajesCategoria(categoria) {
    return C.mensajes.filter((m) => m.tipo === "categoria" && m.categoria === categoria)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  },
  mensajesDirectos(alumnoId, profeId) {
    return C.mensajes.filter((m) => m.tipo === "directo" && m.alumnoId === alumnoId && m.profeId === profeId)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  },
  async enviarMensajeCategoria(categoria, contenido, autorId, autorNombre, autorRol) {
    await insertar("mensajes", { tipo: "categoria", categoria, contenido, autor_id: autorId, autor_nombre: autorNombre, autor_rol: autorRol });
    await cargar("mensajes");
  },
  async enviarMensajeDirecto(alumnoId, profeId, contenido, autorId, autorNombre, autorRol) {
    await insertar("mensajes", { tipo: "directo", alumno_id: alumnoId, profe_id: profeId, contenido, autor_id: autorId, autor_nombre: autorNombre, autor_rol: autorRol });
    await cargar("mensajes");
  },

  /* ---- configuración local (punto de equilibrio) ---- */
  config() { return state.config; },
  setCostosFijos(monto) {
    state.config.costosFijosMXN = monto;
    saveLocal();
  },
};

export { toYMD };
