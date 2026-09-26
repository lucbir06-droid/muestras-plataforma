import { Store, toYMD } from "./store.js?v=6";
import { WEB3FORMS_ACCESS_KEY } from "./config.js?v=6";
import { PLANES, fmtMXN, encontrarDuracion } from "./planes.js?v=6";
import { sb } from "./supabase-client.js?v=6";

/* =========================================================
   Millán Academy — app (panel interno)
   Router por hash + render manual. Sin build, sin framework:
   así se puede editar directo en GitHub sin instalar nada.

   Tres roles, cada uno ve solo lo suyo (los permisos reales viven
   en supabase/schema.sql; acá además se esconde lo que no aplica):
     dueño  → todo
     profe  → sus alumnos, agenda, asistencia, check-in/out, reportes
     alumno → lo suyo (o de sus hijos): evidencias, agenda, reportes,
              suscripción, clases de prueba

   Los "?v=6" en los imports de arriba son para que el navegador de
   quien visita el sitio baje siempre la versión nueva de estos
   archivos, no una guardada de antes. Cuando edites CUALQUIER .js
   (este archivo, store.js, config.js, planes.js o
   supabase-client.js), subí ese número acá y en cada lugar donde
   aparezca "?v=6" en el proyecto (app/index.html, store.js e
   index.html también lo usan).
   ========================================================= */

const view = document.getElementById("view");
const pageTitle = document.getElementById("pageTitle");
const sidenav = document.getElementById("sidenav");

/* ---------------- roles ---------------- */
let session = null;
let perfil = null;
let perfilError = false;

const rol = () => perfil?.rol || "alumno";
const esDueno = () => rol() === "dueño";
const esStaff = () => rol() === "dueño" || rol() === "profe";
const esAlumno = () => rol() === "alumno";

const TODOS = ["dueño", "profe", "alumno"];
const STAFF = ["dueño", "profe"];

const NAV = [
  { path: "/", label: "Panel", icon: "i-dashboard", roles: TODOS },
  { path: "/checkin", label: "Check-in", icon: "i-camera", roles: STAFF, countKey: "checkinsError" },
  { path: "/checkout", label: "Check-out", icon: "i-exit", roles: STAFF },
  { path: "/asistencia", label: "Asistencia", icon: "i-list", roles: STAFF },
  { path: "/evidencias", label: "Evidencias", icon: "i-task", roles: TODOS },
  { path: "/alumnos", label: "Alumnos", icon: "i-users", roles: STAFF },
  { path: "/agenda", label: "Agenda", icon: "i-calendar", roles: TODOS },
  { path: "/clases-prueba", label: "Clases de prueba", icon: "i-play", roles: TODOS, countKey: "solicitudesPendientes" },
  { path: "/inscribirse", label: "Inscripciones", labelAlumno: "Inscribirme", icon: "i-check", roles: ["dueño", "alumno"], countKey: "inscripcionesPendientes" },
  { path: "/profes", label: "Objetivos de profes", icon: "i-target", roles: TODOS },
  { path: "/reportes", label: "Reportes", icon: "i-chart", roles: TODOS },
  { path: "/pagos", label: "Pagos", labelAlumno: "Mi suscripción", icon: "i-card", roles: ["dueño", "alumno"], countKey: "pagosPendientes" },
  { path: "/duenos", label: "Dueños", icon: "i-shield", roles: ["dueño"], countKey: "profesPendientes" },
  { path: "/chat", label: "Chat", icon: "i-chat", roles: TODOS },
];

function itemDeRuta(path) {
  return NAV.find((n) => n.path === path || (n.path === "/inscribirse" && path.startsWith("/inscribirse")));
}
function rutaPermitida(path) {
  if (path.startsWith("/alumnos/")) return true; // detalle: lo que se ve lo decide el permiso de la base
  const item = itemDeRuta(path);
  return !item || item.roles.includes(rol());
}

const TIPOS_SESION = ["Reporte de sesión", "Entrenamiento individual", "Análisis de video", "Preparación física", "Clase de prueba", "Diagnóstico"];
const TIPOS_SLOT = [
  { tipo: "Diagnóstico", duracion: 20 },
  { tipo: "Clase de prueba", duracion: 45 },
  { tipo: "Entrenamiento individual", duracion: 60 },
];
const SEDES_AGENDA = [...Store.SEDES, "Online"];
const METODOS_PAGO = ["Mercado Pago", "Stripe", "PayPal", "Wise", "Efectivo", "Transferencia"];
const TIPOS_EVIDENCIA = ["Gym", "Nutrición", "Otro"];

/* ---------------- helpers ---------------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// "2026-09-20" (solo día) se lee como día LOCAL; new Date("2026-09-20") lo leería en UTC y lo correría un día atrás
function parseFecha(v) {
  if (v instanceof Date) return v;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(v);
}
function fmtDate(v) {
  return parseFecha(v).toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short" });
}
function fmtDateLong(v) {
  return parseFecha(v).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtMoney(amount, currency) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}
function daysAgo(v) {
  return Math.max(0, Math.round((Date.now() - parseFecha(v).getTime()) / 86400000));
}
function icon(name) {
  return `<svg viewBox="0 0 24 24"><use href="#${name}"/></svg>`;
}
function badge(text, kind) {
  return `<span class="badge badge-${kind}">${esc(text)}</span>`;
}
function estadoBadge(estado) {
  const map = {
    pendiente: ["Pendiente", "warn"],
    confirmada: ["Confirmada", "ok"],
    rechazada: ["Rechazada", "crit"],
    disponible: ["Disponible", "muted"],
    pagado: ["Pagado", "ok"],
  };
  const [label, kind] = map[estado] || [estado, "muted"];
  return badge(label, kind);
}
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2600);
}
function errMsg(err) {
  const m = String(err?.message || err || "");
  if (/row-level security|permission|policy/i.test(m)) return "Tu cuenta no tiene permiso para hacer esto.";
  if (/C[oó]digo no v[aá]lido/i.test(m)) return "Ese código no es válido. Revísalo con la academia.";
  return "No se pudo completar — revisa tu conexión e intenta de nuevo.";
}
function alumnoOptions(selectedId) {
  return Store.alumnos()
    .map((a) => `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${esc(a.nombre)} · ${esc(a.categoria || "")}</option>`)
    .join("");
}
function avgAvance(alumno) {
  if (!alumno.objetivos?.length) return 0;
  return Math.round(alumno.objetivos.reduce((s, o) => s + o.avance, 0) / alumno.objetivos.length);
}
function barra(label, valor) {
  return `<div class="goal" style="margin:0;"><div class="rowline"><span>${esc(label)}</span><em>${valor}%</em></div><div class="track"><div class="fill" style="width:${valor}%"></div></div></div>`;
}

/* estado de la suscripción de un alumno según sus pagos */
function estadoSuscripcion(alumnoId) {
  const pagos = Store.pagos().filter((p) => p.alumnoId === alumnoId); // ya vienen del más nuevo al más viejo
  const ultimo = pagos.find((p) => p.estado === "pagado" && p.periodicidad);
  const pendiente = pagos.find((p) => p.estado === "pendiente");
  if (ultimo) {
    const vence = new Date(ultimo.fecha);
    vence.setMonth(vence.getMonth() + (ultimo.periodicidad === "anual" ? 12 : ultimo.periodicidad === "6meses" ? 6 : 1));
    if (vence >= new Date()) return { texto: "Activa", kind: "ok", detalle: `Vigente hasta ${fmtDateLong(vence)}` };
    return { texto: "Vencida", kind: "crit", detalle: `Venció el ${fmtDateLong(vence)}` };
  }
  if (pendiente) return { texto: "Pago pendiente", kind: "warn", detalle: `${pendiente.concepto} · ${fmtMoney(pendiente.monto, pendiente.moneda)}` };
  return { texto: "Sin suscripción", kind: "muted", detalle: "Todavía no hay pagos registrados." };
}

/* ---------------- router ---------------- */
function currentPath() {
  return location.hash.slice(1).split("?")[0] || "/";
}
function currentFullPath() {
  return location.hash.slice(1) || "/";
}

function render() {
  const path = currentPath();
  renderNav(path);

  let title = "Panel";
  let html = "";

  if (!rutaPermitida(path)) {
    title = "Acceso restringido";
    html = `<div class="empty">Esta sección no está disponible para tu cuenta. <a href="#/" style="color:var(--accent-2)">Volver al panel</a>.</div>`;
  } else if (path === "/") {
    title = "Panel";
    html = esAlumno() ? PanelAlumno() : Dashboard();
  } else if (path === "/checkin") {
    title = "Check-in";
    html = Checkin();
  } else if (path === "/checkout") {
    title = "Check-out";
    html = Checkout();
  } else if (path === "/asistencia") {
    title = "Asistencia";
    html = Asistencia();
  } else if (path === "/evidencias") {
    title = "Evidencias";
    html = Evidencias();
  } else if (path === "/alumnos") {
    title = "Alumnos";
    html = AlumnosList();
  } else if (path.startsWith("/alumnos/")) {
    const id = path.split("/")[2];
    const a = Store.alumno(id);
    title = a ? a.nombre : "Alumno";
    html = AlumnoDetail(id);
  } else if (path === "/agenda") {
    title = "Agenda";
    html = Agenda();
  } else if (path === "/clases-prueba") {
    title = "Clases de prueba";
    html = ClasesPrueba();
  } else if (path === "/inscribirse") {
    title = esAlumno() ? "Inscribirme" : "Inscripciones";
    html = Inscribirse(currentFullPath());
  } else if (path === "/profes") {
    title = "Objetivos de profes";
    html = Profes();
  } else if (path === "/reportes") {
    title = "Reportes";
    html = Reportes();
  } else if (path === "/pagos") {
    title = esAlumno() ? "Mi suscripción" : "Pagos";
    html = esAlumno() ? MiSuscripcion() : Pagos();
  } else if (path === "/duenos") {
    title = "Panel de dueños";
    html = Duenos();
  } else if (path === "/chat") {
    title = "Chat";
    html = Chat(currentFullPath());
  } else {
    title = "No encontrado";
    html = `<div class="empty">No encontramos esa página. <a href="#/" style="color:var(--accent-2)">Volver al panel</a>.</div>`;
  }

  pageTitle.textContent = title;
  view.innerHTML = html;
  window.scrollTo(0, 0);

  if (path === "/chat") {
    iniciarPollChat();
    const box = document.getElementById("chatMessages");
    if (box) box.scrollTop = box.scrollHeight;
  } else {
    detenerPollChat();
  }
}

// mientras estás en /chat, revisa cada pocos segundos si hay mensajes nuevos
// (sin esto, el chat solo se actualizaría al mandar vos un mensaje)
let chatPollId = null;
function iniciarPollChat() {
  if (chatPollId) return;
  chatPollId = setInterval(async () => {
    if (currentPath() !== "/chat" || !session) return detenerPollChat();
    await Store.recargar("mensajes");
    if (currentPath() === "/chat") render();
  }, 6000);
}
function detenerPollChat() {
  if (chatPollId) { clearInterval(chatPollId); chatPollId = null; }
}

function renderNav(path) {
  const counts = {
    solicitudesPendientes: esStaff() ? Store.solicitudes().filter((s) => s.estado === "pendiente").length : 0,
    pagosPendientes: esDueno() ? Store.pagos().filter((p) => p.estado === "pendiente").length : 0,
    checkinsError: Store.checkins().filter((c) => c.estado === "error").length,
    inscripcionesPendientes: esDueno() ? Store.inscripciones().filter((i) => i.estado === "pendiente de pago").length : 0,
    profesPendientes: esDueno() ? Store.profesPendientes().length : 0,
  };
  sidenav.innerHTML = NAV
    .filter((item) => item.roles.includes(rol()))
    .map((item) => {
      const on = path === item.path || path.startsWith(item.path + "/") || (item.path === "/inscribirse" && path.startsWith("/inscribirse"));
      const count = item.countKey ? counts[item.countKey] : 0;
      const label = esAlumno() && item.labelAlumno ? item.labelAlumno : item.label;
      return `<a href="#${item.path}" class="${on ? "on" : ""}">${icon(item.icon)}<span>${label}</span>${count ? `<span class="badge-count">${count}</span>` : ""}</a>`;
    }).join("");
}

/* ---------------- login / registro / sesión ---------------- */

// trae el perfil (y sobre todo el rol) de quien está logueado
let perfilPedidoId = 0; // evita que una respuesta vieja (de otra cuenta) pise a la más nueva
async function cargarPerfil() {
  if (!session) { perfil = null; return; }
  if (perfil && perfil.id === session.user.id) return;
  const usuario = session.user.id;
  const miPedido = ++perfilPedidoId;
  const { data, error } = await sb.from("perfiles").select("*").eq("id", usuario).maybeSingle();
  if (miPedido !== perfilPedidoId) return; // llegó tarde: ya hay una cuenta más nueva cargando/cargada
  perfilError = !!error || !data;
  perfil = data
    ? { id: data.id, nombre: data.nombre, rol: data.rol, rolSolicitado: data.rol_solicitado }
    : { id: usuario, nombre: session.user.email, rol: "alumno", rolSolicitado: null };
}

function AuthShell(mode, inner) {
  return `<div style="display:flex;align-items:center;justify-content:center;min-height:78vh;padding:20px 16px;box-sizing:border-box;">
    <div style="max-width:400px;width:100%;">
      <div class="card">
        <div style="display:flex;gap:6px;background:var(--surface-2);padding:4px;border-radius:10px;margin-bottom:20px;">
          <button type="button" id="tabLogin" class="btn ${mode === "login" ? "btn-primary" : "btn-ghost"} btn-sm" style="flex:1;border:0;">Iniciar sesión</button>
          <button type="button" id="tabSignup" class="btn ${mode === "signup" ? "btn-primary" : "btn-ghost"} btn-sm" style="flex:1;border:0;">Crear cuenta</button>
        </div>
        ${inner}
      </div>
    </div>
  </div>`;
}

function LoginView(errorMsg, infoMsg) {
  return AuthShell("login", `
      <p style="font-size:.82rem;color:var(--muted);margin-bottom:18px;">Millán Academy</p>
      ${infoMsg ? `<div class="mp-note" style="margin-bottom:16px;">${esc(infoMsg)}</div>` : ""}
      ${errorMsg ? `<div class="mp-note" style="border-color:var(--crit);background:var(--crit-soft);margin-bottom:16px;">${esc(errorMsg)}</div>` : ""}
      <form id="authForm">
        <div class="field"><label>Correo</label><input name="email" type="email" required autocomplete="username" /></div>
        <div class="field"><label>Contraseña</label><input name="password" type="password" required autocomplete="current-password" /></div>
        <button class="btn btn-primary btn-sm" type="submit" style="width:100%;">Entrar</button>
      </form>`);
}

function SignupView(errorMsg) {
  return AuthShell("signup", `
      <p style="font-size:.82rem;color:var(--muted);margin-bottom:18px;">Millán Academy</p>
      ${errorMsg ? `<div class="mp-note" style="border-color:var(--crit);background:var(--crit-soft);margin-bottom:16px;">${esc(errorMsg)}</div>` : ""}
      <form id="authForm">
        <div class="field"><label>Nombre completo</label><input name="nombre" required /></div>
        <div class="field"><label>Soy…</label>
          <select name="rol" onchange="
            const f = this.closest('form'), c = f.querySelector('.codigo-extra');
            c.hidden = this.value === 'alumno';
            f.elements.codigo.required = this.value === 'dueño';
            c.querySelector('label').textContent = this.value === 'dueño' ? 'Código de dueño' : 'Código de profe (opcional)';
            c.querySelector('small').textContent = this.value === 'dueño'
              ? 'Solo lo conoce el dueño de la academia.'
              : 'Si no lo tienes, déjalo vacío: el dueño aprobará tu cuenta.';">
            <option value="alumno">Alumno o papá/mamá</option>
            <option value="profe">Profe</option>
            <option value="dueño">Dueño</option>
          </select>
        </div>
        <div class="field codigo-extra" hidden>
          <label>Código de profe (opcional)</label>
          <input name="codigo" autocomplete="off" />
          <small style="display:block;margin-top:6px;font-size:.74rem;color:var(--muted);">Si no lo tienes, déjalo vacío: el dueño aprobará tu cuenta.</small>
        </div>
        <div class="field"><label>Correo</label><input name="email" type="email" required autocomplete="username" /></div>
        <div class="field"><label>Teléfono</label><input name="telefono" type="tel" required placeholder="+52 55 0000 0000" /></div>
        <div class="field"><label>País</label><input name="pais" required placeholder="México" /></div>
        <div class="field"><label>Contraseña</label><input name="password" type="password" required minlength="6" autocomplete="new-password" /></div>
        <button class="btn btn-primary btn-sm" type="submit" style="width:100%;">Crear cuenta</button>
      </form>`);
}

function showLogin(errorMsg, infoMsg) {
  pageTitle.textContent = "Iniciar sesión";
  view.style.maxWidth = "none";
  view.style.padding = "0";
  view.innerHTML = LoginView(errorMsg, infoMsg);
  wireAuthForms();
}
function showSignup(errorMsg) {
  pageTitle.textContent = "Crear cuenta";
  view.style.maxWidth = "none";
  view.style.padding = "0";
  view.innerHTML = SignupView(errorMsg);
  wireAuthForms();
}

function wireAuthForms() {
  const toSignup = document.getElementById("tabSignup");
  if (toSignup) toSignup.addEventListener("click", () => showSignup());
  const toLogin = document.getElementById("tabLogin");
  if (toLogin) toLogin.addEventListener("click", () => showLogin());

  const form = document.getElementById("authForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    const email = form.email.value.trim();
    const password = form.password.value;

    if (form.elements.nombre) {
      // ---- crear cuenta ----
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { nombre: form.nombre.value.trim(), telefono: form.telefono.value.trim(), pais: form.pais.value.trim(), rol: form.rol.value, codigo: form.codigo.value.trim() } },
      });
      if (error) {
        let msg = error.message;
        if (msg.includes("already registered")) msg = "Ese correo ya tiene una cuenta — inicia sesión.";
        // si el trigger rechaza el registro por el código, Supabase solo dice "Database error saving new user"
        else if (/database error/i.test(msg) && form.rol.value !== "alumno") msg = "El código no es correcto. Pídeselo al dueño de la academia.";
        showSignup(msg);
        return;
      }
      if (!data.session) {
        showLogin(null, "Cuenta creada. Si te pedimos confirmar el correo, revisa tu bandeja de entrada y después inicia sesión aquí.");
      }
      // si ya vino con sesión activa, onAuthStateChange dispara route() solo
    } else {
      // ---- iniciar sesión ----
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) showLogin(error.message.includes("Invalid") ? "Correo o contraseña incorrectos." : error.message);
      // si funcionó, onAuthStateChange dispara route() solo
    }
  });
}

async function route() {
  const path = currentPath();
  const side = document.querySelector(".side");
  const eyebrow = document.getElementById("topbarEyebrow");

  if (!session) {
    perfil = null;
    Store.clear();
    side.style.display = "none";
    if (eyebrow) eyebrow.textContent = "Millán Academy";
    if (path === "/registro") showSignup(); else showLogin();
    return;
  }

  // ya tiene sesión pero quiere entrar a login/registro: seguro quiere
  // probar u obtener OTRA cuenta. Antes esto solo rebotaba al panel sin
  // avisar nada, y parecía que "no pasaba nada" al crear una cuenta nueva
  // (en realidad nunca se llegaba a mostrar el formulario). Ahora cerramos
  // la sesión anterior y mostramos el formulario que pidió, con un aviso.
  if (path === "/registro" || path === "/login") {
    const nombreAnterior = perfil?.nombre || session.user.email;
    await sb.auth.signOut();
    session = null; perfil = null; Store.clear();
    side.style.display = "none";
    if (eyebrow) eyebrow.textContent = "Millán Academy";
    const aviso = `Cerramos la sesión de ${nombreAnterior} para que puedas ${path === "/registro" ? "crear una cuenta nueva" : "iniciar con otra cuenta"}.`;
    if (path === "/registro") showSignup(); else showLogin(null, aviso);
    return;
  }

  side.style.display = "";
  view.style.maxWidth = "";
  view.style.padding = "";
  const usuario = session.user.id;
  if (!perfil || perfil.id !== usuario) {
    pageTitle.textContent = "Cargando…";
    view.innerHTML = `<div class="empty">Cargando tu panel…</div>`;
  }
  await Promise.all([cargarPerfil(), Store.load(usuario)]);
  if (!session || session.user.id !== usuario) return; // cerró sesión mientras cargaba

  if (eyebrow && perfil) {
    const rolLabel = { "dueño": "Dueño", "profe": "Profe", "alumno": "Alumno / papá" }[perfil.rol] || perfil.rol;
    eyebrow.textContent = `${perfil.nombre} · ${rolLabel}`;
  }
  render();
}

async function init() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((_event, newSession) => {
    const cambio = (newSession?.user?.id || null) !== (session?.user?.id || null);
    session = newSession;
    if (cambio) route();
  });
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => sb.auth.signOut());
  route();
}

window.addEventListener("hashchange", route);

/* ---------------- panel: dueño / profe ---------------- */

function Dashboard() {
  const alumnos = Store.alumnos();
  const reservas = Store.reservas();
  const solicitudes = Store.solicitudes();
  const pagos = Store.pagos();

  const proximas = reservas.filter((r) => parseFecha(r.fecha) >= new Date(new Date().toDateString())).slice(0, 5);
  const pendientes = solicitudes.filter((s) => s.estado === "pendiente").slice(0, 3);
  const sesionesSemana = reservas.filter((r) => {
    const diff = (parseFecha(r.fecha) - Date.now()) / 86400000;
    return r.estado === "confirmada" && diff >= 0 && diff <= 7;
  }).length;
  const hoy = toYMD(new Date());
  const asistieronHoy = Store.asistencias().filter((a) => a.fecha === hoy && a.presente).length;
  const porAprobar = esDueno() ? Store.profesPendientes().length : 0;

  return `
    ${perfilError ? `<div class="mp-note" style="border-color:var(--crit);background:var(--crit-soft);margin-bottom:20px;"><b>No pudimos cargar tu perfil.</b> Si es la primera vez que se usa esta versión, hay que correr <code>supabase/schema.sql</code> en Supabase (ver README).</div>` : ""}
    ${porAprobar ? `<div class="mp-note" style="margin-bottom:20px;"><b>${porAprobar} profe${porAprobar > 1 ? "s esperan" : " espera"} tu aprobación.</b> <a href="#/duenos" style="color:var(--accent-2)">Revisar →</a></div>` : ""}
    <div class="stats">
      <div class="card stat"><span class="n">${alumnos.length}</span><span class="l">${esDueno() ? "Alumnos activos" : "Mis alumnos"}</span></div>
      <div class="card stat"><span class="n">${sesionesSemana}</span><span class="l">Sesiones esta semana</span></div>
      <div class="card stat"><span class="n">${asistieronHoy}</span><span class="l">Asistieron hoy</span></div>
      <div class="card stat"><span class="n">${solicitudes.filter((s) => s.estado === "pendiente").length}</span><span class="l">Solicitudes pendientes</span></div>
      ${esDueno() ? `<div class="card stat"><span class="n">${pagos.filter((p) => p.estado === "pendiente").length}</span><span class="l">Pagos pendientes</span></div>` : ""}
    </div>

    <div class="block">
      <div class="block-head"><h3>Próximas sesiones</h3><a href="#/agenda">Ver agenda →</a></div>
      <div class="list">
        ${proximas.length ? proximas.map(reservaRow).join("") : `<div class="empty">No hay sesiones agendadas todavía.</div>`}
      </div>
    </div>

    <div class="block">
      <div class="block-head"><h3>Solicitudes de clase de prueba</h3><a href="#/clases-prueba">Ver todas →</a></div>
      <div class="list">
        ${pendientes.length ? pendientes.map(solicitudRow).join("") : `<div class="empty">No hay solicitudes pendientes.</div>`}
      </div>
    </div>

    <div class="block">
      <div class="block-head"><h3>${esDueno() ? "Alumnos recientes" : "Mis alumnos"}</h3><a href="#/alumnos">Ver todos →</a></div>
      <div class="alumno-grid">
        ${alumnos.length ? alumnos.slice(0, 4).map(alumnoCard).join("") : `<div class="empty">Todavía no hay alumnos${esDueno() ? " — agrega el primero en la sección Alumnos" : " asignados a ti"}.</div>`}
      </div>
    </div>
  `;
}

function reservaRow(r) {
  const alumno = r.alumnoId ? Store.alumno(r.alumnoId) : null;
  return `
    <div class="row-card">
      <div class="grow">
        <div class="row-title">${alumno ? esc(alumno.nombre) : "Hueco disponible"}</div>
        <div class="row-sub">${esc(r.tipo)} · ${r.duracion} min · ${esc(r.sede)} · ${fmtDate(r.fecha)}, ${esc(r.hora)}</div>
      </div>
      ${estadoBadge(r.estado)}
    </div>`;
}

function solicitudRow(s) {
  return `
    <div class="row-card">
      <div class="grow">
        <div class="row-title">${esc(s.nombre)} · ${s.edad} años</div>
        <div class="row-sub">${esc(s.pais)} (${esc(s.zona)}) · pidió sede ${esc(s.sede)}</div>
      </div>
      ${estadoBadge(s.estado)}
    </div>`;
}

function alumnoCard(a) {
  const top = a.objetivos?.[0];
  return `
    <a class="card alumno-card" href="#/alumnos/${a.id}">
      <div class="top">
        <div class="avatar-sm">${esc(a.avatar)}</div>
        <div>
          <div class="name">${esc(a.nombre)}</div>
          <div class="meta">${esc(a.categoria)} · ${esc(a.sede)}</div>
        </div>
      </div>
      ${top ? `
        <div class="goal">
          <div class="rowline"><span>${esc(top.titulo)}</span><em>${top.avance}%</em></div>
          <div class="track"><div class="fill" style="width:${top.avance}%"></div></div>
        </div>` : ""}
    </a>`;
}

/* ---------------- panel: alumno / papá ---------------- */

function VincularAlumno() {
  return `
    <div class="card" style="max-width:520px;">
      <h3 style="margin-bottom:8px;">Vincula a tu alumno</h3>
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;">
        Para ver la agenda, los reportes y la suscripción, escribe el código que te dio la
        academia (lo encuentra el profe o el dueño en la ficha del alumno).
      </p>
      <form data-action="vincular" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div class="field" style="margin:0;flex:1;min-width:180px;"><label>Código</label>
          <input name="codigo" required placeholder="Ej. 3F9A12BC" style="text-transform:uppercase;letter-spacing:.1em;" /></div>
        <button class="btn btn-primary btn-sm" type="submit">Vincular</button>
      </form>
    </div>`;
}

function PanelAlumno() {
  const alumnos = Store.alumnos();
  const aviso = perfil?.rolSolicitado === "profe"
    ? `<div class="mp-note" style="margin-bottom:20px;"><b>Tu cuenta de profe está pendiente de aprobación.</b> Cuando el dueño la apruebe verás aquí tus alumnos, tu agenda y el check-in. Mientras tanto tienes acceso como alumno.</div>`
    : "";
  const errorPerfil = perfilError
    ? `<div class="mp-note" style="border-color:var(--crit);background:var(--crit-soft);margin-bottom:20px;"><b>No pudimos cargar tu perfil.</b> Avísale a la academia.</div>` : "";
  if (!alumnos.length) return errorPerfil + aviso + AlumnoSinAlumno();
  return errorPerfil + aviso + alumnos.map(resumenAlumno).join("") + `
    <div class="block"><p style="font-size:.8rem;color:var(--muted);">¿Tienes otro hijo en la academia?</p>
      <a class="btn btn-ghost btn-sm" style="margin-top:10px;" href="#/clases-prueba">Pedir su clase de prueba</a></div>`;
}

function resumenAlumno(a) {
  const sus = estadoSuscripcion(a.id);
  const hoy = new Date(new Date().toDateString());
  const proxima = Store.reservas().find((r) => r.alumnoId === a.id && parseFecha(r.fecha) >= hoy);
  const ultimo = Store.bitacoraDe(a.id)[0];
  return `
    <div class="block">
      <div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">
        <div class="avatar-sm" style="width:52px;height:52px;font-size:.95rem;">${esc(a.avatar)}</div>
        <div style="flex:1;min-width:180px;">
          <div class="row-title" style="font-size:1.05rem;">${esc(a.nombre)}</div>
          <div class="row-sub">${esc(a.categoria)} · ${esc(a.sede)}${a.coach ? ` · profe ${esc(a.coach)}` : ""}</div>
        </div>
      </div>
      <div class="stats">
        <div class="card stat"><span class="n">${Store.conteoAsistencia(a.id, 30)}</span><span class="l">Asistencias (30 días)</span></div>
        <div class="card stat"><span class="n" style="font-size:1rem;">${proxima ? `${fmtDate(proxima.fecha)}, ${esc(proxima.hora)}` : "—"}</span><span class="l">Próxima sesión</span></div>
        <div class="card stat"><span class="n" style="font-size:1rem;">${badge(sus.texto, sus.kind)}</span><span class="l">${esc(sus.detalle)}</span></div>
      </div>
      ${ultimo ? `
        <div class="card" style="margin-bottom:14px;">
          <div class="tl-kind">Último reporte del profe · ${fmtDate(ultimo.fecha)}${ultimo.autor ? ` · ${esc(ultimo.autor)}` : ""}</div>
          <p style="font-size:.88rem;color:var(--ink-soft);margin-top:6px;">${esc(ultimo.nota)}</p>
        </div>` : ""}
      <div class="row-actions">
        <a class="btn btn-primary btn-sm" href="#/evidencias">${icon("i-task")} Subir evidencia</a>
        <a class="btn btn-ghost btn-sm" href="#/alumnos/${a.id}">Ver reportes y ficha</a>
        <a class="btn btn-ghost btn-sm" href="#/pagos">Mi suscripción</a>
      </div>
    </div>`;
}

function MiSuscripcion() {
  const alumnos = Store.alumnos();
  if (!alumnos.length) return AlumnoSinAlumno();
  return alumnos.map((a) => {
    const sus = estadoSuscripcion(a.id);
    const pagos = Store.pagos().filter((p) => p.alumnoId === a.id);
    return `
      <div class="block">
        <div class="block-head"><h3>${esc(a.nombre)}</h3>${badge(sus.texto, sus.kind)}</div>
        <p style="font-size:.86rem;color:var(--muted);margin-bottom:14px;">${esc(sus.detalle)}</p>
        <div class="card scrollx">
          ${pagos.length ? `
            <table class="tbl">
              <thead><tr><th>Concepto</th><th>Método</th><th>Importe</th><th>Fecha</th><th>Estado</th></tr></thead>
              <tbody>${pagos.map((p) => `<tr>
                <td>${esc(p.concepto)}</td><td>${esc(p.metodo)}</td>
                <td class="num">${fmtMoney(p.monto, p.moneda)}</td><td>${fmtDate(p.fecha)}</td><td>${estadoBadge(p.estado)}</td>
              </tr>`).join("")}</tbody>
            </table>` : `<div class="empty" style="border:0;">Todavía no hay pagos registrados.</div>`}
        </div>
      </div>`;
  }).join("") + `
    <div class="block"><a class="btn btn-ghost btn-sm" href="#/inscribirse">Ver planes e inscribirme</a></div>`;
}

/* ---------------- fotos ---------------- */
function resizeImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
      else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no-blob"))), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("no-image")); };
    img.src = url;
  });
}

// avisa a Millán por email (Web3Forms) — solo si ya está configurada la Access Key
async function notificarEmail({ subject, message, adjunto }) {
  const fd = new FormData();
  fd.append("access_key", WEB3FORMS_ACCESS_KEY);
  fd.append("subject", subject);
  fd.append("from_name", "Millán Academy · Panel");
  fd.append("message", message);
  if (adjunto) fd.append("attachment", adjunto, "checkin.jpg");
  const res = await fetch("https://api.web3forms.com/submit", { method: "POST", body: fd });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "error");
}

/* ---------------- check-in / check-out ---------------- */

function Checkin() {
  const checkins = Store.checkins();
  return `
    <div class="block">
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">
        Cuando llegas a la cancha, sácate una foto aquí mismo desde el celular.
        Queda guardada y le llega un email a Millán al instante. Al terminar, haz el
        <a href="#/checkout" style="color:var(--accent-2)">check-out</a> con el reporte de tus alumnos.
      </p>
      <form class="card" data-action="checkin" style="max-width:460px;">
        <div class="field"><label>Nombre del profe</label><input name="nombre" required value="${esc(perfil?.nombre || "")}" /></div>
        <div class="field"><label>Sede</label>
          <select name="sede">${Store.SEDES.map((s) => `<option>${s}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>Foto de llegada</label>
          <input name="foto" type="file" accept="image/*" capture="environment" required />
        </div>
        <button class="btn btn-primary btn-sm" type="submit">${icon("i-camera")} Enviar check-in</button>
      </form>
      ${!WEB3FORMS_ACCESS_KEY ? `
        <div class="mp-note" style="max-width:460px;margin-top:14px;">
          <b>Todavía no está conectado el email de Millán.</b> El registro ya queda
          guardado aquí abajo, pero para que también llegue por email hace falta una
          Access Key gratis de <b>web3forms.com</b> pegada en <code>assets/js/config.js</code>.
        </div>` : ""}
    </div>

    <div class="block">
      <div class="block-head"><h3>${esDueno() ? "Check-ins y check-outs recientes" : "Mis check-ins y check-outs"}</h3></div>
      <div class="list">
        ${checkins.length ? checkins.map(checkinRow).join("") : `<div class="empty">Todavía no hay registros.</div>`}
      </div>
    </div>
  `;
}

function checkinRow(c) {
  const estados = {
    enviando: ["Enviando…", "warn"],
    enviado: ["Millán notificado", "ok"],
    guardado: ["Guardado sin email", "muted"],
    error: ["No se pudo enviar", "crit"],
  };
  const [label, kind] = estados[c.estado] || ["", "muted"];
  const iniciales = c.nombre.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const hora = new Date(c.fecha).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const esSalida = c.tipo === "salida";
  return `
    <div class="row-card" style="align-items:flex-start;">
      ${c.fotoUrl
        ? `<img src="${c.fotoUrl}" alt="" style="width:44px;height:44px;border-radius:9px;object-fit:cover;flex:none;border:1px solid var(--line);" />`
        : `<div class="avatar-sm">${esc(iniciales)}</div>`}
      <div class="grow">
        <div class="row-title">${esc(c.nombre)} <span style="color:var(--muted);font-weight:500;">· ${esc(c.sede)}</span></div>
        <div class="row-sub">${fmtDate(c.fecha)}, ${hora}</div>
        ${c.resumen ? `<div class="row-sub" style="margin-top:6px;white-space:pre-line;color:var(--ink-soft);">${esc(c.resumen)}</div>` : ""}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
        ${badge(esSalida ? "Salida" : "Entrada", esSalida ? "warn" : "ok")}
        ${badge(label, kind)}
      </div>
    </div>`;
}

async function handleCheckin(form) {
  const nombre = form.elements.nombre.value.trim();
  const sede = form.elements.sede.value;
  const file = form.elements.foto.files[0];
  if (!nombre || !file) return;
  form.querySelector("button[type=submit]").disabled = true;

  let fotoBlob, registro;
  try {
    fotoBlob = await resizeImage(file, 1400, 0.82);
    registro = await Store.addCheckin({ nombre, sede, tipo: "entrada", fotoBlob, estado: WEB3FORMS_ACCESS_KEY ? "enviando" : "guardado" });
    toast("Check-in guardado");
  } catch (err) {
    toast(errMsg(err));
    render();
    return;
  }
  render();
  if (!WEB3FORMS_ACCESS_KEY) return;

  try {
    await notificarEmail({
      subject: `Check-in — ${nombre} en ${sede}`,
      message: `${nombre} llegó a la sede ${sede} y subió su foto de check-in.\n\nFecha: ${new Date(registro.fecha).toLocaleString("es-MX")}`,
      adjunto: fotoBlob,
    });
    await Store.updateCheckin(registro.id, { estado: "enviado" });
    toast("Millán fue notificado por email");
  } catch (err) {
    await Store.updateCheckin(registro.id, { estado: "error" }).catch(() => {});
    toast("No se pudo notificar por email — el check-in quedó guardado igual");
  }
  render();
}

// el check-out y la asistencia comparten "sede y fecha" elegidas arriba del formulario
const ctxCheckout = { sede: Store.SEDES[0], fecha: toYMD(new Date()) };
const ctxAsistencia = { sede: Store.SEDES[0], fecha: toYMD(new Date()), categoria: "" };

function filaAsistencia(a, presente, conReporte) {
  return `
    <div class="att-row">
      <label class="att-check">
        <input type="checkbox" name="presente_${a.id}" ${presente ? "checked" : ""} />
        <span>${esc(a.nombre)}</span>
        <small>${esc(a.categoria || "")} · ${Store.conteoAsistencia(a.id, 30)} asist. (30 d)</small>
      </label>
      ${conReporte ? `<textarea name="reporte_${a.id}" placeholder="Reporte de ${esc(a.nombre)}: qué trabajaron, cómo estuvo, qué mejorar…"></textarea>` : ""}
    </div>`;
}

function Checkout() {
  const { sede, fecha } = ctxCheckout;
  const alumnos = Store.alumnos().filter((a) => a.sede === sede);
  const yaMarcados = new Map(Store.asistenciasDe(fecha, sede).map((a) => [a.alumnoId, a.presente]));
  const salidas = Store.checkins().filter((c) => c.tipo === "salida").slice(0, 5);
  return `
    <div class="block">
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:62ch;">
        Al terminar el entrenamiento: marca quién asistió, escribe el reporte de cada alumno y
        envíalo. Los reportes le llegan a cada alumno/papá en su panel, y Millán recibe el resumen.
      </p>
      <form class="card" data-action="checkout">
        <div class="field-row">
          <div class="field"><label>Sede</label>
            <select name="sede" data-ctx="checkout">${Store.SEDES.map((s) => `<option ${s === sede ? "selected" : ""}>${s}</option>`).join("")}</select></div>
          <div class="field"><label>Fecha</label><input type="date" name="fecha" value="${fecha}" data-ctx="checkout" /></div>
        </div>
        ${alumnos.length ? `<div class="att-list">${alumnos.map((a) => filaAsistencia(a, yaMarcados.get(a.id) ?? false, true)).join("")}</div>`
          : `<div class="empty" style="margin:14px 0;">No tienes alumnos en la sede ${esc(sede)}.</div>`}
        <div class="field"><label>Resumen general de la sesión (opcional)</label>
          <textarea name="resumen" placeholder="Cómo estuvo la sesión en general, incidencias, pendientes…"></textarea></div>
        <button class="btn btn-primary btn-sm" type="submit" ${alumnos.length ? "" : "disabled"}>${icon("i-exit")} Hacer check-out y enviar reporte</button>
      </form>
    </div>
    <div class="block">
      <div class="block-head"><h3>Check-outs recientes</h3></div>
      <div class="list">${salidas.length ? salidas.map(checkinRow).join("") : `<div class="empty">Todavía no hay check-outs.</div>`}</div>
    </div>`;
}

async function handleCheckout(form) {
  const sede = form.elements.sede.value;
  const fecha = form.elements.fecha.value;
  const alumnos = Store.alumnos().filter((a) => a.sede === sede);
  if (!alumnos.length) return;
  form.querySelector("button[type=submit]").disabled = true;

  const marcas = alumnos.map((a) => ({
    a, presente: form.elements["presente_" + a.id].checked, reporte: form.elements["reporte_" + a.id].value.trim(),
  }));
  const general = form.elements.resumen.value.trim();
  const presentes = marcas.filter((m) => m.presente);
  const ausentes = marcas.filter((m) => !m.presente);
  const conReporte = presentes.filter((m) => m.reporte);

  const lineas = [
    `Check-out de ${perfil.nombre} · ${sede} · ${fmtDateLong(fecha)}`,
    `Asistieron ${presentes.length} de ${marcas.length}${presentes.length ? ": " + presentes.map((m) => m.a.nombre).join(", ") : ""}`,
  ];
  if (ausentes.length) lineas.push(`Faltaron: ${ausentes.map((m) => m.a.nombre).join(", ")}`);
  if (conReporte.length) lineas.push("Reportes:", ...conReporte.map((m) => `• ${m.a.nombre}: ${m.reporte}`));
  if (general) lineas.push(`Resumen: ${general}`);
  const resumen = lineas.join("\n");

  let registro;
  try {
    await Store.guardarAsistencias(fecha, sede, marcas.map((m) => ({ alumnoId: m.a.id, presente: m.presente })), perfil.nombre);
    for (const m of conReporte) {
      await Store.addBitacora({
        alumnoId: m.a.id, tipo: "Reporte de sesión", nota: m.reporte, autor: perfil.nombre,
        fecha: new Date(`${fecha}T12:00:00`).toISOString(),
      });
    }
    registro = await Store.addCheckin({ nombre: perfil.nombre, sede, tipo: "salida", resumen, estado: WEB3FORMS_ACCESS_KEY ? "enviando" : "guardado" });
    toast("Check-out registrado — reportes enviados");
  } catch (err) {
    toast(errMsg(err));
    render();
    return;
  }
  render();
  if (!WEB3FORMS_ACCESS_KEY) return;

  try {
    await notificarEmail({ subject: `Check-out — ${perfil.nombre} en ${sede}`, message: resumen });
    await Store.updateCheckin(registro.id, { estado: "enviado" });
    toast("Millán fue notificado por email");
  } catch (err) {
    await Store.updateCheckin(registro.id, { estado: "error" }).catch(() => {});
    toast("No se pudo notificar por email — el check-out quedó guardado igual");
  }
  render();
}

/* ---------------- asistencia ---------------- */

function Asistencia() {
  const { sede, fecha, categoria } = ctxAsistencia;
  const alumnos = Store.alumnos().filter((a) => a.sede === sede && (!categoria || a.categoria === categoria));
  const yaMarcados = new Map(Store.asistenciasDe(fecha, sede).map((a) => [a.alumnoId, a.presente]));

  // sesiones recientes: cuántos asistieron cada día
  const porDia = new Map();
  Store.asistencias().forEach((a) => {
    const k = `${a.fecha}|${a.sede}`;
    const v = porDia.get(k) || { fecha: a.fecha, sede: a.sede, total: 0, presentes: 0 };
    v.total++;
    if (a.presente) v.presentes++;
    porDia.set(k, v);
  });
  const recientes = [...porDia.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8);

  return `
    <div class="block">
      <form class="card" data-action="guardar-asistencia">
        <div class="field-row" style="grid-template-columns:1fr 1fr 1fr;">
          <div class="field"><label>Sede</label>
            <select name="sede" data-ctx="asistencia">${Store.SEDES.map((s) => `<option ${s === sede ? "selected" : ""}>${s}</option>`).join("")}</select></div>
          <div class="field"><label>Fecha</label><input type="date" name="fecha" value="${fecha}" data-ctx="asistencia" /></div>
          <div class="field"><label>Categoría</label>
            <select name="categoria" data-ctx="asistencia"><option value="">Todas</option>${Store.CATEGORIAS.map((c) => `<option ${c === categoria ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        </div>
        ${alumnos.length ? `<div class="att-list">${alumnos.map((a) => filaAsistencia(a, yaMarcados.get(a.id) ?? false, false)).join("")}</div>
          <p style="font-size:.76rem;color:var(--muted);margin-bottom:14px;">Marca a quienes asistieron. Los que dejes sin marcar se guardan como "faltó".</p>`
          : `<div class="empty" style="margin:14px 0;">No hay alumnos para esta sede${categoria ? " y categoría" : ""}.</div>`}
        <button class="btn btn-primary btn-sm" type="submit" ${alumnos.length ? "" : "disabled"}>${icon("i-list")} Guardar asistencia</button>
      </form>
    </div>

    <div class="block">
      <div class="block-head"><h3>Sesiones recientes</h3></div>
      <div class="list">
        ${recientes.length ? recientes.map((r) => `
          <div class="row-card">
            <div class="grow"><div class="row-title">${fmtDateLong(r.fecha)} · ${esc(r.sede)}</div>
              <div class="row-sub">${r.presentes} de ${r.total} alumnos asistieron</div></div>
            ${badge(`${Math.round((r.presentes / r.total) * 100)}%`, r.presentes === r.total ? "ok" : "warn")}
          </div>`).join("") : `<div class="empty">Todavía no hay asistencias registradas.</div>`}
      </div>
    </div>`;
}

/* ---------------- evidencias (gym, nutrición…) ---------------- */

function Evidencias() {
  const alumnos = Store.alumnos();
  const evidencias = Store.evidencias();
  if (!alumnos.length && esAlumno()) return AlumnoSinAlumno();
  return `
    <div class="block">
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">
        Aquí se sube la prueba de que se hizo lo que el profe pidió — fue al gym
        tal día, su comida del plan de nutrición, etc. Queda guardado con foto,
        fecha y comentario para que el profe lo revise.
      </p>
      <form class="card" data-action="evidencia" style="max-width:460px;">
        <div class="field"><label>Alumno</label>
          <select name="alumnoId" required>${alumnoOptions()}</select></div>
        <div class="field"><label>Tipo</label>
          <select name="tipo">${TIPOS_EVIDENCIA.map((t) => `<option>${t}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Comentario</label><textarea name="comentario" placeholder="Ej. Fui al gym, hice pierna 45 min"></textarea></div>
        <div class="field"><label>Foto</label><input name="foto" type="file" accept="image/*" capture="environment" required /></div>
        <button class="btn btn-primary btn-sm" type="submit" ${alumnos.length ? "" : "disabled"}>${icon("i-task")} Subir evidencia</button>
      </form>
    </div>

    <div class="block">
      <div class="block-head"><h3>${esAlumno() ? "Mis evidencias" : "Evidencias recientes"}</h3></div>
      <div class="list">
        ${evidencias.length ? evidencias.map(evidenciaRow).join("") : `<div class="empty">Todavía no hay evidencias.</div>`}
      </div>
    </div>
  `;
}

function evidenciaRow(e) {
  const tipoKind = e.tipo === "Gym" ? "ok" : e.tipo === "Nutrición" ? "warn" : "muted";
  return `
    <div class="row-card">
      ${e.fotoUrl
        ? `<img src="${e.fotoUrl}" alt="" style="width:48px;height:48px;border-radius:9px;object-fit:cover;flex:none;border:1px solid var(--line);" />`
        : `<div class="avatar-sm">${esc(e.alumnoNombre.slice(0, 2).toUpperCase())}</div>`}
      <div class="grow">
        <div class="row-title">${esc(e.alumnoNombre)}</div>
        ${e.comentario ? `<div class="row-sub" style="margin-top:2px;">${esc(e.comentario)}</div>` : ""}
        <div class="row-sub" style="margin-top:2px;">${fmtDate(e.fecha)}</div>
      </div>
      ${badge(e.tipo, tipoKind)}
    </div>`;
}

async function handleEvidencia(form) {
  const alumnoId = form.elements.alumnoId.value;
  const alumno = Store.alumno(alumnoId);
  const tipo = form.elements.tipo.value;
  const comentario = form.elements.comentario.value.trim();
  const file = form.elements.foto.files[0];
  if (!alumno || !file) return;
  form.querySelector("button[type=submit]").disabled = true;

  try {
    const fotoBlob = await resizeImage(file, 1280, 0.8);
    await Store.addEvidencia({ alumnoId, alumnoNombre: alumno.nombre, tipo, comentario, fotoBlob });
    toast("Evidencia subida");
  } catch (err) {
    toast(errMsg(err));
  }
  render();
}

/* ---------------- alumnos ---------------- */

function AlumnosList() {
  const alumnos = Store.alumnos();
  const coaches = Store.coaches();
  return `
    ${esDueno() ? `
    <div class="block">
      <details class="card panel">
        <summary style="cursor:pointer;font-family:var(--display);font-weight:600;font-size:.85rem;letter-spacing:.02em;text-transform:uppercase;color:var(--ink);">
          + Agregar alumno
        </summary>
        <form data-action="add-alumno" style="margin-top:18px;">
          <div class="field-row">
            <div class="field"><label>Nombre</label><input name="nombre" required placeholder="Nombre y apellido" /></div>
            <div class="field"><label>Categoría</label>
              <select name="categoria">${Store.CATEGORIAS.map((c) => `<option>${c}</option>`).join("")}</select>
            </div>
          </div>
          <div class="field-row">
            <div class="field"><label>Sede de entrenamiento</label>
              <select name="sede">${Store.SEDES.map((s) => `<option>${s}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Profe a cargo</label>
              <select name="coachId"><option value="">Sin asignar</option>${coaches.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("")}</select>
            </div>
          </div>
          <div class="field-row">
            <div class="field"><label>Teléfono (alumno o papá/mamá)</label><input name="telefono" placeholder="+52 55 0000 0000" /></div>
            <div class="field"><label>Correo (alumno o papá/mamá)</label><input name="correo" type="email" placeholder="correo@ejemplo.com" /></div>
          </div>
          <div class="field"><label>Moneda en la que paga</label>
            <select name="moneda"><option value="MXN">MXN — paga desde México</option><option value="USD">USD — alumno internacional (Stripe/PayPal)</option></select>
          </div>
          <div class="field"><label>Talla de playera</label>
            <select name="tallaPlayera">${Store.TALLAS.map((t) => `<option>${t}</option>`).join("")}</select>
          </div>
          <div class="field">
            <label>Método de alta</label>
            <select name="metodoAlta" onchange="this.closest('form').querySelector('.pago-extra').hidden = (this.value !== 'Transferencia')">
              <option value="">Sin pago registrado (paga después por Mercado Pago)</option>
              <option value="Transferencia">Ya pagó por transferencia — activar cuenta</option>
            </select>
          </div>
          <div class="field-row pago-extra" hidden>
            <div class="field"><label>Periodicidad</label>
              <select name="periodicidad"><option value="mensual">Mensual</option><option value="6meses">6 meses</option><option value="anual">Anual</option></select>
            </div>
            <div class="field"><label>Monto recibido</label>
              <input name="monto" type="number" min="0" step="0.01" placeholder="0.00" />
            </div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Agregar alumno</button>
        </form>
      </details>
    </div>` : ""}

    <div class="alumno-grid">
      ${alumnos.length ? alumnos.map(alumnoCard).join("") : `<div class="empty">${esDueno() ? "Todavía no hay alumnos cargados." : "Todavía no tienes alumnos asignados."}</div>`}
    </div>
  `;
}

function AlumnoDetail(id) {
  const a = Store.alumno(id);
  if (!a) return `<div class="empty">No encontramos este alumno. <a href="#/${esStaff() ? "alumnos" : ""}" style="color:var(--accent-2)">Volver</a>.</div>`;

  const staff = esStaff();
  const bitacora = Store.bitacoraDe(id);
  const reservas = Store.reservas().filter((r) => r.alumnoId === id);
  const proxima = reservas.find((r) => parseFecha(r.fecha) >= new Date(new Date().toDateString()));
  const asistencias = Store.asistenciasAlumno(id).slice().sort((x, y) => y.fecha.localeCompare(x.fecha)).slice(0, 8);
  const evidencias = Store.evidenciasDe(id);
  const ev = a.evaluacion || { tactica: 0, tecnica: 0, fisico: 0, comentarios: "" };
  const sus = estadoSuscripcion(id);

  return `
    <a href="#/${staff ? "alumnos" : ""}" style="display:inline-flex;align-items:center;gap:6px;font-size:.78rem;color:var(--muted);margin-bottom:18px;">
      ${icon("i-back")} ${staff ? "Todos los alumnos" : "Volver al panel"}
    </a>

    <div class="card" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:24px;">
      <div class="avatar-sm" style="width:56px;height:56px;font-size:1rem;">${esc(a.avatar)}</div>
      <div style="flex:1;min-width:200px;">
        <div class="row-title" style="font-size:1.1rem;">${esc(a.nombre)}</div>
        <div class="row-sub">${esc(a.categoria)} · ${esc(a.sede)}${a.coach ? ` · profe ${esc(a.coach)}` : ""} · alta hace ${daysAgo(a.alta)} días</div>
        ${staff && (a.telefono || a.correo) ? `<div class="row-sub" style="margin-top:4px;">${[a.telefono, a.correo].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
        ${a.tallaPlayera ? `<div class="row-sub">Playera: ${esc(a.tallaPlayera)}</div>` : ""}
      </div>
      ${badge(sus.texto, sus.kind)}
    </div>

    ${staff ? `
    <div class="card" style="margin-bottom:24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
      <div style="flex:1;min-width:220px;">
        <div class="row-sub">Código para que el papá o el alumno vincule su cuenta</div>
        <div class="row-title tabular" style="font-size:1.25rem;letter-spacing:.14em;margin-top:2px;">${esc(a.codigoVinculo || "—")}</div>
      </div>
      ${esDueno() ? `
      <form data-action="asignar-coach" data-alumno="${a.id}" style="display:flex;gap:8px;align-items:flex-end;">
        <div class="field" style="margin:0;"><label>Profe a cargo</label>
          <select name="coachId"><option value="">Sin asignar</option>${Store.coaches().map((c) => `<option value="${c.id}" ${c.id === a.coachId ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}</select></div>
        <button class="btn btn-ghost btn-sm" type="submit">Guardar</button>
      </form>` : ""}
    </div>` : ""}

    <div class="stats">
      <div class="card stat"><span class="n">${bitacora.length}</span><span class="l">Reportes y sesiones</span></div>
      <div class="card stat"><span class="n">${Store.conteoAsistencia(id, 30)}</span><span class="l">Asistencias (30 días)</span></div>
      <div class="card stat"><span class="n">${avgAvance(a)}%</span><span class="l">Avance de objetivos</span></div>
      <div class="card stat"><span class="n" style="font-size:1rem;">${proxima ? fmtDate(proxima.fecha) : "—"}</span><span class="l">Próxima sesión</span></div>
    </div>

    ${a.objetivos?.length ? `
      <div class="block">
        <div class="block-head"><h3>Objetivos</h3></div>
        <div class="card">
          ${a.objetivos.map((o) => `
            <div class="goal">
              <div class="rowline"><span>${esc(o.titulo)}</span><em>${o.avance}%</em></div>
              <div class="track"><div class="fill" style="width:${o.avance}%"></div></div>
            </div>`).join("")}
        </div>
      </div>` : ""}

    <div class="block">
      <div class="block-head"><h3>Ficha del jugador</h3></div>
      ${staff ? `
      <form class="card" data-action="update-evaluacion" data-alumno="${a.id}">
        <div class="field-row" style="grid-template-columns:1fr 1fr 1fr;">
          <div class="field"><label>Táctica — ${ev.tactica}%</label>
            <input type="range" min="0" max="100" name="tactica" value="${ev.tactica}"
              oninput="this.previousElementSibling.textContent = this.previousElementSibling.textContent.replace(/—.*/, '— ' + this.value + '%')" />
          </div>
          <div class="field"><label>Técnica — ${ev.tecnica}%</label>
            <input type="range" min="0" max="100" name="tecnica" value="${ev.tecnica}"
              oninput="this.previousElementSibling.textContent = this.previousElementSibling.textContent.replace(/—.*/, '— ' + this.value + '%')" />
          </div>
          <div class="field"><label>Físico — ${ev.fisico}%</label>
            <input type="range" min="0" max="100" name="fisico" value="${ev.fisico}"
              oninput="this.previousElementSibling.textContent = this.previousElementSibling.textContent.replace(/—.*/, '— ' + this.value + '%')" />
          </div>
        </div>
        <div class="field"><label>Comentarios</label>
          <textarea name="comentarios" placeholder="Impresión general del jugador...">${esc(ev.comentarios || "")}</textarea>
        </div>
        <button class="btn btn-primary btn-sm" type="submit">Guardar ficha</button>
      </form>` : `
      <div class="card" style="display:grid;gap:10px;">
        ${barra("Táctica", ev.tactica)}${barra("Técnica", ev.tecnica)}${barra("Físico", ev.fisico)}
        ${ev.comentarios ? `<p style="font-size:.86rem;color:var(--ink-soft);margin-top:6px;">${esc(ev.comentarios)}</p>` : ""}
      </div>`}
    </div>

    ${staff ? `
    <div class="block">
      <div class="block-head"><h3>Registrar sesión</h3></div>
      <form class="card" data-action="add-bitacora" data-alumno="${a.id}">
        <div class="field-row">
          <div class="field"><label>Tipo de sesión</label>
            <select name="tipo">${TIPOS_SESION.map((t) => `<option>${t}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Fecha</label><input type="date" name="fecha" value="${toYMD(new Date())}" /></div>
        </div>
        <div class="field"><label>Notas</label><textarea name="nota" placeholder="Qué trabajaron, qué mejoró, qué falta..." required></textarea></div>
        <button class="btn btn-primary btn-sm" type="submit">Guardar en la bitácora</button>
      </form>
    </div>` : ""}

    <div class="block">
      <div class="block-head"><h3>${staff ? "Bitácora" : "Reportes de los profes"}</h3></div>
      ${bitacora.length ? `
        <div class="card timeline">
          ${bitacora.map((b) => `
            <div class="tl-item">
              <div class="tl-date">${fmtDate(b.fecha)}</div>
              <div><span class="tl-kind">${esc(b.tipo)}${b.autor ? ` · ${esc(b.autor)}` : ""}</span><p>${esc(b.nota)}</p></div>
            </div>`).join("")}
        </div>` : `<div class="empty">Todavía no hay reportes.</div>`}
    </div>

    <div class="block">
      <div class="block-head"><h3>Asistencia reciente</h3></div>
      ${asistencias.length ? `<div class="list">${asistencias.map((s) => `
        <div class="row-card"><div class="grow"><div class="row-title">${fmtDateLong(s.fecha)}</div><div class="row-sub">${esc(s.sede || "")}</div></div>
          ${badge(s.presente ? "Asistió" : "Faltó", s.presente ? "ok" : "crit")}</div>`).join("")}</div>`
        : `<div class="empty">Todavía no hay asistencias registradas.</div>`}
    </div>

    ${reservas.length ? `
      <div class="block">
        <div class="block-head"><h3>Reservas</h3></div>
        <div class="list">${reservas.map(reservaRow).join("")}</div>
      </div>` : ""}

    <div class="block">
      <div class="block-head"><h3>Evidencias</h3><a href="#/evidencias">Subir nueva →</a></div>
      ${evidencias.length ? `<div class="list">${evidencias.map(evidenciaRow).join("")}</div>` : `<div class="empty">Todavía no hay evidencias.</div>`}
    </div>
  `;
}

/* ---------------- agenda ---------------- */

function Agenda() {
  const reservas = Store.reservas();
  const byDay = {};
  reservas.forEach((r) => {
    const key = r.fecha.slice(0, 10);
    (byDay[key] ||= []).push(r);
  });
  const days = Object.keys(byDay).sort();

  return `
    ${esStaff() ? `
    <div class="block">
      <form class="card" data-action="generar-horarios" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;">
        <div class="field" style="margin:0;min-width:180px;">
          <label>Generar horarios fijos</label>
          <select name="sede">${Store.SEDES.map((s) => `<option>${s}</option>`).join("")}</select>
        </div>
        <button class="btn btn-ghost btn-sm" type="submit">${icon("i-calendar")} Martes/miércoles/viernes 7–10pm</button>
      </form>
      <p style="font-size:.76rem;color:var(--muted);margin:-6px 0 14px;">
        Crea huecos disponibles para los próximos martes, miércoles y viernes a las 19:00, 20:00, 21:00 y 22:00 en la sede elegida.
      </p>
      <details class="card panel">
        <summary style="cursor:pointer;font-family:var(--display);font-weight:600;font-size:.85rem;letter-spacing:.02em;text-transform:uppercase;color:var(--ink);">
          + Abrir hueco disponible
        </summary>
        <form data-action="add-slot" style="margin-top:18px;">
          <div class="field-row">
            <div class="field"><label>Fecha</label><input type="date" name="fecha" required /></div>
            <div class="field"><label>Hora</label><input type="time" name="hora" required /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Tipo</label>
              <select name="tipo">${TIPOS_SLOT.map((t) => `<option value="${t.tipo}">${t.tipo} · ${t.duracion} min</option>`).join("")}</select>
            </div>
            <div class="field"><label>Sede</label>
              <select name="sede">${SEDES_AGENDA.map((s) => `<option>${s}</option>`).join("")}</select>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Abrir hueco</button>
        </form>
      </details>
    </div>` : `
    <p style="font-size:.86rem;color:var(--muted);margin-bottom:18px;max-width:60ch;">
      Estas son tus sesiones agendadas. Para reservar otra, escríbele a tu profe o pide una clase de prueba.
    </p>`}

    ${days.length ? days.map((day) => `
      <div class="agenda-day">
        <h4>${fmtDateLong(day)}</h4>
        ${byDay[day].sort((a, b) => a.hora.localeCompare(b.hora)).map(slotRow).join("")}
      </div>
    `).join("") : `<div class="empty">No hay sesiones en la agenda todavía.</div>`}
  `;
}

function slotRow(r) {
  const alumno = r.alumnoId ? Store.alumno(r.alumnoId) : null;
  const disponible = r.estado === "disponible";
  return `
    <div class="slot">
      <div class="time">${esc(r.hora)}</div>
      <div class="grow">
        <div class="row-title">${alumno ? esc(alumno.nombre) : esc(r.tipo)}</div>
        <div class="sub">${esc(r.tipo)} · ${r.duracion} min · ${esc(r.sede)}</div>
      </div>
      ${disponible && esStaff() ? `
        <form data-action="reservar-slot" data-id="${r.id}" style="display:flex;gap:8px;align-items:center;">
          <select name="alumnoId" required style="min-width:170px;">
            <option value="" disabled selected>Asignar alumno…</option>
            ${alumnoOptions()}
          </select>
          <button class="btn btn-primary btn-sm" type="submit">Reservar</button>
        </form>
      ` : estadoBadge(r.estado)}
    </div>`;
}

/* ---------------- clases de prueba ---------------- */

function SolicitudForm(titulo, bajada) {
  return `
    <div class="block">
      <div class="block-head"><h3>${esc(titulo)}</h3></div>
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">${esc(bajada)}</p>
      <form class="card" data-action="add-solicitud">
        <div class="field-row">
          <div class="field"><label>Nombre del jugador</label><input name="nombre" required placeholder="Nombre y apellido" /></div>
          <div class="field"><label>Edad</label><input name="edad" type="number" min="4" max="23" required /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Teléfono</label><input name="telefono" type="tel" required placeholder="+52 55 0000 0000" /></div>
          <div class="field"><label>País</label><input name="pais" required placeholder="México" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Zona horaria</label><input name="zona" required placeholder="GMT-6" /></div>
          <div class="field"><label>Sede de interés</label>
            <select name="sede">${SEDES_AGENDA.map((s) => `<option>${s}</option>`).join("")}</select>
          </div>
        </div>
        <div class="field"><label>Mensaje</label><textarea name="mensaje" placeholder="Categoría, disponibilidad, algo que debamos saber..."></textarea></div>
        <button class="btn btn-primary btn-sm" type="submit">Enviar solicitud</button>
      </form>
    </div>`;
}

// alumno/papá sin ningún alumno ligado todavía: en vez de pedirle un código,
// lo mandamos derecho a reservar su clase de prueba. En cuanto el dueño la
// confirma, se crea el alumno y se liga esta cuenta sola — ahí se desbloquea
// el resto de la app (agenda, evidencias, chat, suscripción).
function AlumnoSinAlumno() {
  const misSolicitudes = Store.solicitudes().filter((s) => s.userId === perfil?.id);
  const pendiente = misSolicitudes.find((s) => s.estado === "pendiente");
  const rechazada = !pendiente && misSolicitudes.some((s) => s.estado === "rechazada");

  if (pendiente) {
    return `<div class="mp-note">
      <b>Tu solicitud de clase de prueba está en revisión.</b> En cuanto la academia la confirme
      vas a poder ver tu agenda, subir evidencias, usar el chat y todo lo demás.
    </div>`;
  }
  const aviso = rechazada
    ? `<div class="mp-note" style="border-color:var(--crit);background:var(--crit-soft);margin-bottom:18px;">
        Tu solicitud anterior no fue confirmada. Puedes mandar una nueva.
      </div>`
    : "";
  return aviso + SolicitudForm(
    "Reserva tu clase de prueba",
    "Para activar tu cuenta (agenda, evidencias, chat, suscripción) primero pide tu clase de prueba. En cuanto la academia la confirme, se desbloquea todo.",
  );
}

function ClasesPrueba() {
  const solicitudes = Store.solicitudes();
  const staff = esStaff();
  return `
    ${SolicitudForm("Pedir una clase de prueba", "Llena el formulario y la academia te contacta para confirmar día y hora.")}
    <div class="block">
      <div class="block-head"><h3>${staff ? "Solicitudes recibidas" : "Mis solicitudes"}</h3></div>
      <div class="list">
        ${solicitudes.length ? solicitudes.map(solicitudFull).join("") : `<div class="empty">Todavía no hay solicitudes.</div>`}
      </div>
    </div>
  `;
}

function solicitudFull(s) {
  return `
    <div class="row-card">
      <div class="grow">
        <div class="row-title">${esc(s.nombre)} · ${s.edad} años · ${esc(s.sede)}</div>
        <div class="row-sub">${esc(s.telefono || "sin teléfono")} · ${esc(s.pais)} (${esc(s.zona)}) · ${fmtDate(s.fecha)}</div>
        ${s.mensaje ? `<div class="row-sub" style="margin-top:6px;color:var(--ink-soft);">"${esc(s.mensaje)}"</div>` : ""}
      </div>
      ${s.estado === "pendiente" && esStaff() ? `
        <div class="row-actions">
          <button class="btn btn-primary btn-sm" data-action="solicitud-estado" data-id="${s.id}" data-estado="confirmada">Confirmar</button>
          <button class="btn btn-ghost btn-sm" data-action="solicitud-estado" data-id="${s.id}" data-estado="rechazada">Rechazar</button>
        </div>
      ` : estadoBadge(s.estado)}
    </div>`;
}

/* ---------------- reportes ---------------- */

function Reportes() {
  const alumnos = Store.alumnos();
  if (!alumnos.length && esAlumno()) return AlumnoSinAlumno();
  return `
    <div class="list">
      ${alumnos.length ? alumnos.map((a) => {
        const ev = a.evaluacion || { tactica: 0, tecnica: 0, fisico: 0 };
        return `
        <a class="card row-card" href="#/alumnos/${a.id}" style="align-items:flex-start;">
          <div class="avatar-sm">${esc(a.avatar)}</div>
          <div class="grow">
            <div class="row-title">${esc(a.nombre)} <span style="color:var(--muted);font-weight:500;">· ${esc(a.categoria)} · ${esc(a.sede)}</span></div>
            <div style="margin-top:10px;display:grid;gap:8px;max-width:420px;">
              ${barra("Táctica", ev.tactica)}${barra("Técnica", ev.tecnica)}${barra("Físico", ev.fisico)}
            </div>
          </div>
          <div style="text-align:right;">
            <div class="row-title tabular">${avgAvance(a)}%</div>
            <div class="row-sub">avance de objetivos</div>
          </div>
        </a>`;
      }).join("") : `<div class="empty">Todavía no hay reportes.</div>`}
    </div>
  `;
}

/* ---------------- pagos (dueño) ---------------- */

function Pagos() {
  const pagos = Store.pagos();
  const ingresosMXN = pagos.filter((p) => p.estado === "pagado" && p.moneda === "MXN").reduce((s, p) => s + p.monto, 0);
  const ingresosUSD = pagos.filter((p) => p.estado === "pagado" && p.moneda === "USD").reduce((s, p) => s + p.monto, 0);
  const pendientes = pagos.filter((p) => p.estado === "pendiente").length;

  return `
    <div class="stats">
      <div class="card stat"><span class="n">${fmtMoney(ingresosMXN, "MXN")}</span><span class="l">Ingresos (MXN)</span></div>
      <div class="card stat"><span class="n">${fmtMoney(ingresosUSD, "USD")}</span><span class="l">Ingresos (USD)</span></div>
      <div class="card stat"><span class="n">${pendientes}</span><span class="l">Pagos pendientes</span></div>
    </div>

    <div class="block">
      <div class="block-head"><h3>Planes</h3></div>
      <div class="plans">
        ${PLANES.map((p) => `
          <div class="card plan">
            <div class="row-title">${esc(p.nombre)}</div>
            <div class="price">${fmtMXN(p.duraciones[0].real)} <small>/ mes</small></div>
            <ul>${p.duraciones.map((d) => `<li>${esc(d.label)}: ${fmtMXN(d.real)}</li>`).join("")}</ul>
          </div>`).join("")}
      </div>

      <div class="block-head"><h3>Métodos</h3></div>
      <div class="methods">
        ${METODOS_PAGO.map((m) => `<span>${m}</span>`).join("")}
      </div>

      <div class="mp-note">
        <b>Para cobrar de verdad con Mercado Pago</b> crea un link de pago por plan y pégalo en
        <code>assets/js/planes.js</code> (pasos en el README). Mientras tanto esta pantalla lleva el
        registro de cobros manuales (efectivo, transferencia).
      </div>
    </div>

    <div class="block">
      <div class="block-head"><h3>Registrar pago</h3></div>
      <form class="card" data-action="add-pago">
        <div class="field-row">
          <div class="field"><label>Alumno</label>
            <select name="alumnoId" required><option value="" disabled selected>Elegir…</option>${alumnoOptions()}</select>
          </div>
          <div class="field"><label>Concepto</label><input name="concepto" required placeholder="Plan mensual · Polanco" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Método</label>
            <select name="metodo">${METODOS_PAGO.map((m) => `<option>${m}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Periodicidad</label>
            <select name="periodicidad"><option value="">Pago único</option><option value="mensual">Mensual</option><option value="6meses">6 meses</option><option value="anual">Anual</option></select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Moneda</label><select name="moneda"><option>MXN</option><option>USD</option></select></div>
          <div class="field"><label>Monto</label><input name="monto" type="number" min="0" step="0.01" required /></div>
        </div>
        <div class="field"><label>Estado</label>
          <select name="estado"><option value="pagado">Pagado</option><option value="pendiente">Pendiente</option></select>
        </div>
        <button class="btn btn-primary btn-sm" type="submit">Registrar</button>
      </form>
    </div>

    <div class="block">
      <div class="block-head"><h3>Movimientos</h3></div>
      <div class="card scrollx">
        ${pagos.length ? `
        <table class="tbl">
          <thead><tr><th>Alumno</th><th>Concepto</th><th>Método</th><th>Importe</th><th>Estado</th></tr></thead>
          <tbody>
            ${pagos.map((p) => {
              const a = p.alumnoId ? Store.alumno(p.alumnoId) : null;
              return `<tr>
                <td>${a ? `<a class="rowlink" href="#/alumnos/${a.id}">${esc(a.nombre)}</a>` : "—"}</td>
                <td>${esc(p.concepto)}</td>
                <td>${esc(p.metodo)}</td>
                <td class="num">${fmtMoney(p.monto, p.moneda)}</td>
                <td>${estadoBadge(p.estado)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>` : `<div class="empty" style="border:0;">Todavía no hay pagos registrados.</div>`}
      </div>
    </div>
  `;
}

/* ---------------- inscripciones ---------------- */

function planDurOptions(selectedPlan, selectedDur) {
  const opts = [];
  for (const plan of PLANES) {
    for (const dur of plan.duraciones) {
      const sel = plan.id === selectedPlan && dur.id === selectedDur ? "selected" : "";
      opts.push(`<option value="${plan.id}:${dur.id}" ${sel}>${esc(plan.nombre)} · ${esc(dur.label)} · ${fmtMXN(dur.real)}</option>`);
    }
  }
  return opts.join("");
}

function Inscribirse(fullPath) {
  const query = fullPath.includes("?") ? fullPath.split("?")[1] : "";
  const params = new URLSearchParams(query);
  const found = encontrarDuracion(params.get("plan"), params.get("dur"));
  const inscripciones = Store.inscripciones();

  return `
    <div class="block">
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">
        Elige tu plan y déjanos tus datos. Si el plan ya tiene un link de pago de Mercado Pago
        conectado, el botón del sitio te lleva directo a pagar; si no, la academia recibe tu
        inscripción, te contacta y activa tu cuenta al confirmar el pago.
      </p>
      ${found ? `<div class="mp-note" style="margin-bottom:16px;">Plan preseleccionado: <b>${esc(found.plan.nombre)} · ${esc(found.dur.label)}</b> — ${fmtMXN(found.dur.real)}</div>` : ""}
      <form class="card" data-action="inscribirse" style="max-width:460px;">
        <div class="field"><label>Nombre del jugador</label><input name="nombre" required placeholder="Nombre y apellido" /></div>
        <div class="field"><label>Teléfono</label><input name="telefono" type="tel" required placeholder="+52 55 0000 0000" /></div>
        <div class="field"><label>Plan</label>
          <select name="planDur">${planDurOptions(params.get("plan"), params.get("dur"))}</select>
        </div>
        <div class="field"><label>Talla de playera</label>
          <select name="tallaPlayera">${Store.TALLAS.map((t) => `<option>${t}</option>`).join("")}</select>
        </div>
        <button class="btn btn-primary btn-sm" type="submit">Enviar inscripción</button>
      </form>
    </div>

    <div class="block">
      <div class="block-head"><h3>${esDueno() ? "Inscripciones recibidas" : "Mis inscripciones"}</h3></div>
      <div class="list">
        ${inscripciones.length ? inscripciones.map(inscripcionRow).join("") : `<div class="empty">Todavía no hay inscripciones.</div>`}
      </div>
    </div>
  `;
}

function inscripcionRow(i) {
  return `
    <div class="row-card">
      <div class="grow">
        <div class="row-title">${esc(i.nombre)} · ${esc(i.planNombre)} · ${esc(i.duracionLabel)}</div>
        <div class="row-sub">${esc(i.telefono)} · talla ${esc(i.tallaPlayera)} · ${fmtMoney(i.monto, i.moneda)} · ${fmtDate(i.fecha)}</div>
      </div>
      ${i.estado === "pendiente de pago"
        ? (esDueno()
          ? `<button class="btn btn-primary btn-sm" data-action="inscripcion-estado" data-id="${i.id}" data-estado="activada">Marcar pagada y activar</button>`
          : badge("Pendiente de pago", "warn"))
        : badge("Activada", "ok")}
    </div>`;
}

/* ---------------- objetivos de profes ---------------- */

function Profes() {
  const objetivos = Store.objetivosCategoria();
  return `
    ${esStaff() ? `
    <div class="block">
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">
        Lo que cada categoría está trabajando esta semana — lo ven los profes y también
        los alumnos y sus familias.
      </p>
      <form class="card" data-action="add-objetivo-categoria">
        <div class="field"><label>Categoría</label>
          <select name="categoria">${Store.CATEGORIAS.map((c) => `<option>${c}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Título</label><input name="titulo" required placeholder="Ej. Juego aéreo bajo presión" /></div>
        <div class="field"><label>Detalle</label><textarea name="detalle" placeholder="En qué consiste, qué se busca lograr..."></textarea></div>
        <button class="btn btn-primary btn-sm" type="submit">Publicar objetivo</button>
      </form>
    </div>` : `
    <p style="font-size:.86rem;color:var(--muted);margin-bottom:18px;max-width:60ch;">
      Esto es lo que cada categoría está trabajando con sus profes.
    </p>`}

    ${Store.CATEGORIAS.map((cat) => {
      const items = objetivos.filter((o) => o.categoria === cat);
      return `
      <div class="block">
        <div class="block-head"><h3>${esc(cat)}</h3></div>
        <div class="list">
          ${items.length ? items.map((o) => `
            <div class="row-card">
              <div class="grow">
                <div class="row-title">${esc(o.titulo)}</div>
                ${o.detalle ? `<div class="row-sub" style="margin-top:4px;">${esc(o.detalle)}</div>` : ""}
                <div class="row-sub" style="margin-top:4px;">${esc(o.profe || "")} · ${fmtDate(o.fecha)}</div>
              </div>
            </div>`).join("") : `<div class="empty">Sin objetivos publicados todavía.</div>`}
        </div>
      </div>`;
    }).join("")}
  `;
}

/* ---------------- dueños ---------------- */

function Duenos() {
  const alumnos = Store.alumnos();
  const pagos = Store.pagos();
  const ingresosMXN = pagos.filter((p) => p.estado === "pagado" && p.moneda === "MXN").reduce((s, p) => s + p.monto, 0);
  const ingresosUSD = pagos.filter((p) => p.estado === "pagado" && p.moneda === "USD").reduce((s, p) => s + p.monto, 0);
  const pendientes = pagos.filter((p) => p.estado === "pendiente");
  const totalPendienteMXN = pendientes.filter((p) => p.moneda === "MXN").reduce((s, p) => s + p.monto, 0);
  const nuevosDelMes = alumnos.filter((a) => daysAgo(a.alta) <= 30).length;
  const porAprobar = Store.profesPendientes();

  const mensualesMXN = pagos.filter((p) => p.moneda === "MXN" && p.periodicidad === "mensual" && p.estado === "pagado");
  const promedioMensual = mensualesMXN.length ? Math.round(mensualesMXN.reduce((s, p) => s + p.monto, 0) / mensualesMXN.length) : 3349;
  const costosFijos = Store.config().costosFijosMXN;
  const puntoEquilibrio = promedioMensual > 0 ? Math.ceil(costosFijos / promedioMensual) : 0;
  const faltan = Math.max(0, puntoEquilibrio - alumnos.length);

  return `
    ${porAprobar.length ? `
    <div class="block">
      <div class="block-head"><h3>Profes por aprobar</h3></div>
      <div class="list">
        ${porAprobar.map((p) => `
          <div class="row-card">
            <div class="grow"><div class="row-title">${esc(p.nombre)}</div><div class="row-sub">${esc(p.telefono || "")} · ${esc(p.pais || "")}</div></div>
            <button class="btn btn-primary btn-sm" data-action="aprobar-profe" data-id="${p.id}" data-nombre="${esc(p.nombre)}">Aprobar como profe</button>
          </div>`).join("")}
      </div>
    </div>` : ""}

    <div class="stats">
      <div class="card stat"><span class="n">${fmtMoney(ingresosMXN, "MXN")}</span><span class="l">Cobrado (MXN)</span></div>
      <div class="card stat"><span class="n">${fmtMoney(ingresosUSD, "USD")}</span><span class="l">Cobrado (USD)</span></div>
      <div class="card stat"><span class="n">${fmtMoney(totalPendienteMXN, "MXN")}</span><span class="l">Por cobrar (MXN)</span></div>
      <div class="card stat"><span class="n">${nuevosDelMes}</span><span class="l">Alumnos nuevos (30 días)</span></div>
    </div>

    <div class="block">
      <div class="block-head"><h3>Estado de resultados</h3></div>
      <div class="card">
        <p style="font-size:.9rem;color:var(--ink-soft);">
          Este mes se sumaron <b>${nuevosDelMes} alumnos</b> nuevos. Tienes <b>${alumnos.length}</b>
          alumnos activos en total, con <b>${fmtMoney(ingresosMXN, "MXN")}</b> y
          <b>${fmtMoney(ingresosUSD, "USD")}</b> cobrados hasta ahora.
        </p>
      </div>
    </div>

    <div class="block">
      <div class="block-head"><h3>Punto de equilibrio</h3></div>
      <form class="card" data-action="set-costos-fijos" style="max-width:420px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-end;">
        <div class="field" style="margin:0;flex:1;"><label>Costos fijos mensuales (MXN)</label>
          <input name="costos" type="number" min="0" step="100" value="${costosFijos}" />
        </div>
        <button class="btn btn-ghost btn-sm" type="submit">Guardar</button>
      </form>
      <div class="card">
        <p style="font-size:.9rem;color:var(--ink-soft);">
          Con un plan mensual promedio de <b>${fmtMoney(promedioMensual, "MXN")}</b>, hacen falta
          <b>${puntoEquilibrio} alumnos</b> pagando para cubrir esos costos fijos. Hoy tienes
          <b>${alumnos.length}</b>${faltan > 0 ? ` — faltan <b>${faltan}</b> para llegar al punto de equilibrio.` : ", ya lo superaste."}
        </p>
      </div>
    </div>

    <div class="block">
      <div class="block-head"><h3>Alumnos con pagos pendientes</h3></div>
      <div class="list">
        ${pendientes.length ? pendientes.map((p) => {
          const a = p.alumnoId ? Store.alumno(p.alumnoId) : null;
          return `
          <div class="row-card">
            <div class="grow">
              <div class="row-title">${a ? esc(a.nombre) : "—"}</div>
              <div class="row-sub">${esc(p.concepto)} · ${fmtMoney(p.monto, p.moneda)}</div>
            </div>
            ${badge("Pendiente", "warn")}
          </div>`;
        }).join("") : `<div class="empty">No hay pagos pendientes.</div>`}
      </div>
    </div>

    <div class="block">
      <div class="block-head"><h3>Cuentas y roles</h3></div>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:12px;max-width:62ch;">
        Todas las cuentas registradas. Cambia el rol de quien lo necesite: el rol define a qué
        secciones y datos tiene acceso cada quien.
      </p>
      <div class="card scrollx">
        <table class="tbl">
          <thead><tr><th>Nombre</th><th>Contacto</th><th>Rol</th><th></th></tr></thead>
          <tbody>
            ${Store.perfiles().map((p) => {
              const yo = p.id === perfil?.id;
              return `<tr>
                <td>${esc(p.nombre)}${yo ? ` ${badge("Tú", "muted")}` : ""}${p.rol === "alumno" && p.rolSolicitado === "profe" ? ` ${badge("Pidió ser profe", "warn")}` : ""}</td>
                <td>${esc(p.telefono || "—")}${p.pais ? ` · ${esc(p.pais)}` : ""}</td>
                <td colspan="2">
                  <form data-action="cambiar-rol" data-id="${p.id}" style="display:flex;gap:8px;align-items:center;">
                    <select name="rol" ${yo ? "disabled" : ""} style="min-width:150px;">
                      ${[["alumno", "Alumno / papá"], ["profe", "Profe"], ["dueño", "Dueño"]].map(([v, l]) => `<option value="${v}" ${p.rol === v ? "selected" : ""}>${l}</option>`).join("")}
                    </select>
                    ${yo ? "" : `<button class="btn btn-ghost btn-sm" type="submit">Guardar</button>`}
                  </form>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="block">
      <div class="block-head"><h3>Todos los alumnos</h3></div>
      <div class="card scrollx">
        ${alumnos.length ? `
        <table class="tbl">
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Sede</th><th>Profe</th><th>Contacto</th><th></th></tr></thead>
          <tbody>
            ${alumnos.map((a) => `
              <tr>
                <td><a class="rowlink" href="#/alumnos/${a.id}">${esc(a.nombre)}</a></td>
                <td>${esc(a.categoria)}</td>
                <td>${esc(a.sede)}</td>
                <td>${esc(a.coach || "—")}</td>
                <td>${esc(a.telefono || "—")}</td>
                <td><button class="btn btn-ghost btn-sm" data-action="eliminar-alumno" data-id="${a.id}" data-nombre="${esc(a.nombre)}">Eliminar</button></td>
              </tr>`).join("")}
          </tbody>
        </table>` : `<div class="empty" style="border:0;">Todavía no hay alumnos.</div>`}
      </div>
    </div>
  `;
}

/* ---------------- chat (vista previa) ---------------- */

function fmtHora(fecha) {
  return new Date(fecha).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function ChatMensajeBubble(m) {
  const mio = m.autorId === perfil?.id;
  const etiquetaRol = m.autorRol === "dueño" ? " · Dueño" : m.autorRol === "profe" ? " · Profe" : "";
  return `
    <div class="chat-msg ${mio ? "mio" : ""}">
      <div class="chat-msg-meta">${esc(m.autorNombre)}${mio ? "" : etiquetaRol}</div>
      <div class="chat-msg-bubble">${esc(m.contenido)}</div>
      <div class="chat-msg-hora">${fmtHora(m.fecha)}</div>
    </div>`;
}

function ChatCategoria(categoria) {
  const msgs = Store.mensajesCategoria(categoria);
  return `
    <div class="chat-panel">
      <div class="chat-messages" id="chatMessages">
        ${msgs.length ? msgs.map(ChatMensajeBubble).join("") : `<div class="empty">Todavía no hay mensajes en este canal — ¡sé el primero en escribir!</div>`}
      </div>
      <form data-action="mensaje-categoria" class="chat-form">
        <input type="hidden" name="categoria" value="${esc(categoria)}" />
        <input name="contenido" placeholder="Escribe un mensaje…" required autocomplete="off" />
        <button class="btn btn-primary btn-sm" type="submit">Enviar</button>
      </form>
    </div>`;
}

function ChatDMStaff(params) {
  const yo = perfil.id;
  const soyDueno = esDueno();
  const alumnoId = params.get("alumno") || "";
  const profeId = params.get("profe") || (soyDueno ? "" : yo);
  const alumnos = Store.alumnos();
  const coaches = Store.coaches();
  const alumno = alumnoId ? Store.alumno(alumnoId) : null;

  const nav = soyDueno
    ? `location.hash='#/chat?tab=dm&alumno='+document.getElementById('selAlumno').value+'&profe='+(document.getElementById('selProfe').value||'')`
    : `location.hash='#/chat?tab=dm&alumno='+document.getElementById('selAlumno').value+'&profe=${yo}'`;

  const picker = `
    <div class="chat-dm-picker">
      <div class="field"><label>Alumno</label>
        <select id="selAlumno" onchange="${nav}">
          <option value="">Elegir…</option>
          ${alumnos.map((a) => `<option value="${a.id}" ${a.id === alumnoId ? "selected" : ""}>${esc(a.nombre)}</option>`).join("")}
        </select>
      </div>
      ${soyDueno ? `
      <div class="field"><label>Profe</label>
        <select id="selProfe" onchange="${nav}">
          <option value="">Elegir…</option>
          ${coaches.map((c) => `<option value="${c.id}" ${c.id === profeId ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}
        </select>
      </div>` : ""}
    </div>`;

  if (!alumno || !profeId) {
    return picker + `<div class="empty" style="margin-top:16px;">Elige un alumno${soyDueno ? " y un profe" : ""} para ver la conversación.</div>`;
  }

  const msgs = Store.mensajesDirectos(alumnoId, profeId);
  return picker + `
    <div class="chat-panel" style="margin-top:16px;">
      <div class="chat-messages" id="chatMessages">
        ${msgs.length ? msgs.map(ChatMensajeBubble).join("") : `<div class="empty">Todavía no hay mensajes con ${esc(alumno.nombre)}.</div>`}
      </div>
      <form data-action="mensaje-directo" class="chat-form">
        <input type="hidden" name="alumnoId" value="${alumnoId}" />
        <input type="hidden" name="profeId" value="${profeId}" />
        <input name="contenido" placeholder="Escribe un mensaje…" required autocomplete="off" />
        <button class="btn btn-primary btn-sm" type="submit">Enviar</button>
      </form>
    </div>`;
}

function ChatDMAlumno(alumnos, params) {
  const alumnoId = params.get("alumno") || alumnos[0]?.id || "";
  const alumno = Store.alumno(alumnoId);
  if (!alumno) return `<div class="empty">No encontramos a tu alumno vinculado.</div>`;
  if (!alumno.coachId) {
    return `<div class="empty">${esc(alumno.nombre)} todavía no tiene profe asignado — en cuanto la academia le asigne uno vas a poder escribirle acá.</div>`;
  }
  const picker = alumnos.length > 1 ? `
    <div class="chat-dm-picker">
      <div class="field"><label>Alumno</label>
        <select onchange="location.hash='#/chat?tab=dm&alumno='+this.value">
          ${alumnos.map((a) => `<option value="${a.id}" ${a.id === alumnoId ? "selected" : ""}>${esc(a.nombre)}</option>`).join("")}
        </select>
      </div>
    </div>` : "";
  const msgs = Store.mensajesDirectos(alumnoId, alumno.coachId);
  return picker + `
    <div class="chat-panel" style="${picker ? "margin-top:16px;" : ""}">
      <p style="font-size:.82rem;color:var(--muted);margin:0 0 10px;">Conversación con ${esc(alumno.coach || "tu profe")}</p>
      <div class="chat-messages" id="chatMessages">
        ${msgs.length ? msgs.map(ChatMensajeBubble).join("") : `<div class="empty">Todavía no hay mensajes. ¡Escríbele a ${esc(alumno.coach || "tu profe")}!</div>`}
      </div>
      <form data-action="mensaje-directo" class="chat-form">
        <input type="hidden" name="alumnoId" value="${alumnoId}" />
        <input type="hidden" name="profeId" value="${alumno.coachId}" />
        <input name="contenido" placeholder="Escribe un mensaje…" required autocomplete="off" />
        <button class="btn btn-primary btn-sm" type="submit">Enviar</button>
      </form>
    </div>`;
}

function Chat(fullPath) {
  const query = fullPath.includes("?") ? fullPath.split("?")[1] : "";
  const params = new URLSearchParams(query);
  const alumnos = Store.alumnos();
  if (esAlumno() && !alumnos.length) return AlumnoSinAlumno();

  const tabParam = params.get("tab") || Store.CATEGORIAS[0];
  const activeCategoria = Store.CATEGORIAS.includes(tabParam) ? tabParam : null;

  const tabs = [
    ...Store.CATEGORIAS.map((c) => `<a href="#/chat?tab=${encodeURIComponent(c)}" class="chat-tab ${c === activeCategoria ? "active" : ""}">${esc(c)}</a>`),
    `<a href="#/chat?tab=dm" class="chat-tab ${!activeCategoria ? "active" : ""}">Mensajes directos</a>`,
  ].join("");

  const body = activeCategoria
    ? ChatCategoria(activeCategoria)
    : (esStaff() ? ChatDMStaff(params) : ChatDMAlumno(alumnos, params));

  return `<div class="chat-tabs">${tabs}</div>${body}`;
}

/* ---------------- acciones (delegadas) ---------------- */

// cambiar sede / fecha / categoría en asistencia y check-out recarga la lista de alumnos
view.addEventListener("change", (e) => {
  const el = e.target.closest("[data-ctx]");
  if (!el) return;
  const form = el.closest("form");
  const ctx = el.dataset.ctx === "asistencia" ? ctxAsistencia : ctxCheckout;
  ctx.sede = form.elements.sede.value;
  if (form.elements.fecha.value) ctx.fecha = form.elements.fecha.value;
  if (form.elements.categoria) ctx.categoria = form.elements.categoria.value;
  render();
});

view.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-action]");
  if (!form) return;
  e.preventDefault();
  const action = form.dataset.action;
  if (action === "checkin") return void handleCheckin(form);
  if (action === "checkout") return void handleCheckout(form);
  if (action === "evidencia") return void handleEvidencia(form);
  const data = Object.fromEntries(new FormData(form).entries());

  try {
    if (action === "add-alumno") {
      const coach = Store.coaches().find((c) => c.id === data.coachId);
      const a = await Store.addAlumno({
        nombre: data.nombre.trim(), categoria: data.categoria, sede: data.sede, coach: coach?.nombre, coachId: data.coachId || null,
        moneda: data.moneda, telefono: data.telefono?.trim() || "", correo: data.correo?.trim() || "", tallaPlayera: data.tallaPlayera,
      });
      if (data.metodoAlta === "Transferencia" && Number(data.monto) > 0) {
        await Store.addPago({
          alumnoId: a.id, concepto: `Alta manual · plan ${data.periodicidad}`, metodo: "Transferencia",
          monto: Number(data.monto), moneda: data.moneda, periodicidad: data.periodicidad, estado: "pagado",
        });
        toast(`${a.nombre} agregado y activado. Código de vinculación: ${a.codigoVinculo}`);
      } else {
        toast(`${a.nombre} agregado. Código de vinculación: ${a.codigoVinculo}`);
      }
    } else if (action === "cambiar-rol") {
      if (data.rol === "dueño" && !confirm("Un dueño ve todas las finanzas y puede borrar alumnos. ¿Seguro que quieres darle ese rol?")) return;
      await Store.cambiarRol(form.dataset.id, data.rol);
      toast("Rol actualizado");
    } else if (action === "asignar-coach") {
      await Store.asignarCoach(form.dataset.alumno, data.coachId);
      toast("Profe asignado");
    } else if (action === "add-bitacora") {
      await Store.addBitacora({
        alumnoId: form.dataset.alumno, tipo: data.tipo, nota: data.nota.trim(), autor: perfil?.nombre,
        fecha: new Date(`${data.fecha || toYMD(new Date())}T12:00:00`).toISOString(),
      });
      toast("Sesión registrada en la bitácora");
    } else if (action === "update-evaluacion") {
      await Store.actualizarEvaluacion(form.dataset.alumno, {
        tactica: Number(data.tactica), tecnica: Number(data.tecnica), fisico: Number(data.fisico), comentarios: data.comentarios.trim(),
      });
      toast("Ficha actualizada");
    } else if (action === "guardar-asistencia") {
      const { sede, fecha, categoria } = ctxAsistencia;
      const lista = Store.alumnos().filter((a) => a.sede === sede && (!categoria || a.categoria === categoria));
      await Store.guardarAsistencias(fecha, sede, lista.map((a) => ({ alumnoId: a.id, presente: form.elements["presente_" + a.id].checked })), perfil?.nombre);
      toast("Asistencia guardada");
    } else if (action === "generar-horarios") {
      const n = await Store.generarHorariosSemana(data.sede, 2);
      toast(n > 0 ? `${n} horarios creados en ${data.sede}` : "Esos horarios ya estaban cargados");
    } else if (action === "add-slot") {
      const tipoInfo = TIPOS_SLOT.find((t) => t.tipo === data.tipo);
      await Store.addReserva({ alumnoId: null, fecha: data.fecha, hora: data.hora, tipo: data.tipo, duracion: tipoInfo?.duracion || 60, sede: data.sede, estado: "disponible" });
      toast("Hueco agregado a la agenda");
    } else if (action === "reservar-slot") {
      if (!data.alumnoId) return;
      await Store.reservar(form.dataset.id, data.alumnoId);
      toast("Sesión reservada");
    } else if (action === "add-solicitud") {
      await Store.addSolicitud({ nombre: data.nombre.trim(), edad: Number(data.edad), telefono: data.telefono.trim(), pais: data.pais.trim(), zona: data.zona.trim(), sede: data.sede, mensaje: data.mensaje?.trim() || "" });
      toast("Solicitud enviada");
    } else if (action === "add-pago") {
      await Store.addPago({ alumnoId: data.alumnoId, concepto: data.concepto.trim(), metodo: data.metodo, moneda: data.moneda, monto: Number(data.monto), periodicidad: data.periodicidad, estado: data.estado });
      toast("Pago registrado");
    } else if (action === "inscribirse") {
      const [planId, durId] = data.planDur.split(":");
      const found = encontrarDuracion(planId, durId);
      await Store.addInscripcion({
        nombre: data.nombre.trim(), telefono: data.telefono.trim(), tallaPlayera: data.tallaPlayera,
        planId, duracionId: durId, planNombre: found?.plan.nombre || planId, duracionLabel: found?.dur.label || durId,
        monto: found?.dur.real || 0, moneda: found?.plan.moneda || "MXN",
      });
      toast("Inscripción enviada — la academia te contacta para confirmar el pago");
    } else if (action === "add-objetivo-categoria") {
      await Store.addObjetivoCategoria({ categoria: data.categoria, profe: perfil?.nombre, titulo: data.titulo.trim(), detalle: data.detalle?.trim() || "" });
      toast("Objetivo publicado");
    } else if (action === "vincular") {
      await Store.vincularAlumno(data.codigo);
      toast("¡Listo! Alumno vinculado");
    } else if (action === "set-costos-fijos") {
      Store.setCostosFijos(Number(data.costos) || 0);
      toast("Costos fijos actualizados");
    } else if (action === "mensaje-categoria") {
      await Store.enviarMensajeCategoria(data.categoria, data.contenido.trim(), perfil.id, perfil.nombre, perfil.rol);
      form.reset();
    } else if (action === "mensaje-directo") {
      await Store.enviarMensajeDirecto(data.alumnoId, data.profeId, data.contenido.trim(), perfil.id, perfil.nombre, perfil.rol);
      form.reset();
    }
  } catch (err) {
    toast(errMsg(err));
  }
  render();
});

view.addEventListener("click", async (e) => {
  try {
    const solicitudBtn = e.target.closest("[data-action='solicitud-estado']");
    if (solicitudBtn) {
      if (solicitudBtn.dataset.estado === "confirmada") {
        const s = Store.solicitudes().find((x) => x.id === solicitudBtn.dataset.id);
        const a = await Store.confirmarSolicitud(s);
        toast(`Clase confirmada — se dio de alta a ${a.nombre} y ya tiene acceso a la app`);
      } else {
        await Store.actualizarSolicitud(solicitudBtn.dataset.id, solicitudBtn.dataset.estado);
        toast("Solicitud rechazada");
      }
      return render();
    }
    const inscripcionBtn = e.target.closest("[data-action='inscripcion-estado']");
    if (inscripcionBtn) {
      await Store.actualizarInscripcion(inscripcionBtn.dataset.id, inscripcionBtn.dataset.estado);
      toast("Inscripción activada");
      return render();
    }
    const aprobarBtn = e.target.closest("[data-action='aprobar-profe']");
    if (aprobarBtn) {
      await Store.aprobarProfe(aprobarBtn.dataset.id);
      toast(`${aprobarBtn.dataset.nombre} ahora es profe`);
      return render();
    }
    const eliminarBtn = e.target.closest("[data-action='eliminar-alumno']");
    if (eliminarBtn) {
      if (!confirm(`Esto borra a ${eliminarBtn.dataset.nombre} y todo su historial (reportes, asistencia, evidencias). No se puede deshacer. ¿Seguro?`)) return;
      await Store.eliminarAlumno(eliminarBtn.dataset.id);
      toast(`${eliminarBtn.dataset.nombre} eliminado`);
      render();
    }
  } catch (err) {
    toast(errMsg(err));
    render();
  }
});

init();
