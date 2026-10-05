import { Store, toYMD } from "./store.js?v=34";
import { PLANES, HABITOS_PREMIUM, fmtMXN, encontrarDuracion } from "./planes.js?v=34";
import { sb } from "./supabase-client.js?v=34";

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

   Los "?v=34" en los imports de arriba son para que el navegador de
   quien visita el sitio baje siempre la versión nueva de estos
   archivos, no una guardada de antes. Cuando edites CUALQUIER .js
   (este archivo, store.js, planes.js o
   supabase-client.js), subí ese número acá y en cada lugar donde
   aparezca "?v=34" en el proyecto (app/index.html, store.js e
   index.html también lo usan).
   ========================================================= */

const view = document.getElementById("view");
const pageTitle = document.getElementById("pageTitle");
const sidenav = document.getElementById("sidenav");

/* ---------------- roles ---------------- */
let session = null;
let perfil = null;
let perfilError = false;
// true mientras se está mandando el formulario de login/registro. Evita que
// route() (disparado por onAuthStateChange justo al loguearte) confunda un
// login recién exitoso con "ya había sesión, quiere cambiar de cuenta" y te
// vuelva a cerrar la sesión que acabás de abrir.
let autenticando = false;

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
  { path: "/evidencias", label: "Hábitos", icon: "i-task", roles: TODOS },
  { path: "/alumnos", label: "Alumnos", icon: "i-users", roles: STAFF },
  { path: "/agenda", label: "Agenda", icon: "i-calendar", roles: TODOS },
  { path: "/clases-prueba", label: "Clases de prueba", icon: "i-play", roles: TODOS, countKey: "solicitudesPendientes" },
  { path: "/inscribirse", label: "Inscripciones", labelAlumno: "Inscribirme", icon: "i-check", roles: ["dueño", "alumno"], countKey: "inscripcionesPendientes" },
  { path: "/profes", label: "Objetivos de profes", icon: "i-target", roles: TODOS },
  { path: "/reportes", label: "Reportes", icon: "i-chart", roles: TODOS },
  { path: "/pagos", label: "Pagos", labelAlumno: "Mi suscripción", icon: "i-card", roles: ["dueño", "alumno"], countKey: "pagosPendientes" },
  { path: "/duenos", label: "Dueños", icon: "i-shield", roles: ["dueño"], countKey: "profesPendientes" },
  { path: "/chat", label: "Chat", icon: "i-chat", roles: TODOS },
  { path: "/cuenta", label: "Mi cuenta", icon: "i-shield", roles: TODOS },
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
const TIPOS_EVIDENCIA = ["Entrenamiento", "Recuperación", "Nutrición"];

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
  return Store.alumnosActivos()
    .map((a) => `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${esc(a.nombre)} · ${esc(a.categoria || "")}</option>`)
    .join("");
}
// divisiones válidas para un alumno según TODAS sus sedes (la misma
// división tiene que existir en cada una — ej. Polanco no tiene 3ra/4ta)
function categoriasParaSedes(sedes) {
  if (!sedes?.length) return Store.CATEGORIAS;
  return sedes.map((s) => Store.SEDE_CATEGORIAS[s] || []).reduce((acc, cats) => acc.filter((c) => cats.includes(c)));
}
function avgAvance(alumno) {
  if (!alumno.objetivos?.length) return 0;
  return Math.round(alumno.objetivos.reduce((s, o) => s + o.avance, 0) / alumno.objetivos.length);
}
function barra(label, valor) {
  return `<div class="goal" style="margin:0;"><div class="rowline"><span>${esc(label)}</span><em>${valor}%</em></div><div class="track"><div class="fill" style="width:${valor}%"></div></div></div>`;
}

/* estado de la suscripción de un alumno según sus pagos */
function sumarPeriodo(fecha, periodicidad) {
  const d = new Date(fecha);
  d.setMonth(d.getMonth() + (periodicidad === "anual" ? 12 : periodicidad === "6meses" ? 6 : 1));
  return d;
}

// la "fecha de corte" de un alumno:
//  1) si el staff ya registró un pago pagado, esa fecha + su periodicidad
//     manda (es lo más confiable: alguien confirmó que sí se cobró).
//  2) si no hay ningún pago cargado todavía, usamos lo que el alumno/papá
//     declaró una sola vez (fechaPagoInicial + periodicidadPago),
//     adelantada ciclo a ciclo hasta la próxima fecha que todavía no pasó.
// null si no hay ni pagos ni fecha declarada.
function fechaVencimiento(alumnoId) {
  const ultimo = Store.pagos().find((p) => p.alumnoId === alumnoId && p.estado === "pagado" && p.periodicidad);
  if (ultimo) return sumarPeriodo(ultimo.fecha, ultimo.periodicidad);

  const a = Store.alumno(alumnoId);
  if (!a?.fechaPagoInicial || !a.periodicidadPago) return null;
  let vence = sumarPeriodo(a.fechaPagoInicial, a.periodicidadPago);
  const hoy = new Date(new Date().toDateString());
  for (let i = 0; vence < hoy && i < 240; i++) vence = sumarPeriodo(vence, a.periodicidadPago);
  return vence;
}

function estadoSuscripcion(alumnoId) {
  const pendiente = Store.pagos().find((p) => p.alumnoId === alumnoId && p.estado === "pendiente");
  const vence = fechaVencimiento(alumnoId);
  if (vence) {
    if (vence >= new Date()) return { texto: "Activa", kind: "ok", detalle: `Fecha de corte: ${fmtDateLong(vence)}`, vence };
    return { texto: "Vencida", kind: "crit", detalle: `Venció el ${fmtDateLong(vence)}`, vence };
  }
  if (pendiente) return { texto: "Pago pendiente", kind: "warn", detalle: `${pendiente.concepto} · ${fmtMoney(pendiente.monto, pendiente.moneda)}`, vence: null };
  return { texto: "Sin suscripción", kind: "muted", detalle: "Todavía no hay pagos registrados.", vence: null };
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
    title = "Hábitos";
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
  } else if (path === "/cuenta") {
    title = "Mi cuenta";
    html = MiCuenta();
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
    // si justo estás escribiendo un mensaje, no reconstruyas la pantalla:
    // antes esto borraba lo que llevabas tecleado a mitad de escribir
    // (el redibujado reemplaza el <form> entero por uno vacío de nuevo)
    const escribiendo = document.activeElement?.closest?.(".chat-form");
    if (currentPath() === "/chat" && !escribiendo) render();
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
            f.elements.codigo.required = this.value !== 'alumno';
            c.querySelector('label').textContent = this.value === 'dueño' ? 'Código de dueño' : 'Código de profe';
            c.querySelector('small').textContent = 'Te lo da el dueño de la academia. Sin este código no se puede crear la cuenta.';">
            <option value="alumno">Alumno o papá/mamá</option>
            <option value="profe">Profe</option>
            <option value="dueño">Dueño</option>
          </select>
        </div>
        <div class="field codigo-extra" hidden>
          <label>Código de profe</label>
          <input name="codigo" autocomplete="off" />
          <small style="display:block;margin-top:6px;font-size:.74rem;color:var(--muted);">Te lo da el dueño de la academia. Sin este código no se puede crear la cuenta.</small>
        </div>
        <div class="field"><label>Correo</label><input name="email" type="email" required autocomplete="username" /></div>
        <div class="field"><label>Teléfono</label><input name="telefono" type="tel" required placeholder="+52 55 0000 0000" /></div>
        <div class="field"><label>País</label><input name="pais" required placeholder="México" /></div>
        <div class="field"><label>Contraseña</label><input name="password" type="password" required minlength="6" autocomplete="new-password" /></div>
        <button class="btn btn-primary btn-sm" type="submit" style="width:100%;">Crear cuenta</button>
        <p style="font-size:.74rem;color:var(--muted);margin-top:12px;text-align:center;">
          Al crear tu cuenta aceptas el <a href="https://millanacademy.com/privacidad/" target="_blank" rel="noopener" style="color:var(--accent-2);">aviso de privacidad</a>
          y las <a href="https://millanacademy.com/privacidad/#normas" target="_blank" rel="noopener" style="color:var(--accent-2);">normas de uso</a>:
          no se tolera contenido ofensivo ni abuso hacia otros usuarios.
        </p>
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
    autenticando = true;

    try {
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
        // avisa a Millán por email que se creó una cuenta — no bloquea el
        // alta ni se le muestra nada a quien se está registrando si falla
        {
          const rolLabel = { alumno: "Alumno o papá/mamá", profe: "Profe", dueño: "Dueño" }[form.rol.value] || form.rol.value;
          notificarEmail({
            subject: `Nueva cuenta — ${form.nombre.value.trim()} (${rolLabel})`,
            message: `${form.nombre.value.trim()} se registró como ${rolLabel}.\n\nCorreo: ${email}\nTeléfono: ${form.telefono.value.trim()}\nPaís: ${form.pais.value.trim()}`,
          }).catch(() => {});
        }
        if (data.session) {
          // ya quedó logueado: sacamos el hash de /registro para que route()
          // no lo confunda después con "quiere cambiar de cuenta"
          location.hash = "#/";
        } else {
          showLogin(null, "Cuenta creada. Si te pedimos confirmar el correo, revisa tu bandeja de entrada y después inicia sesión aquí.");
        }
      } else {
        // ---- iniciar sesión ----
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          showLogin(error.message.includes("Invalid") ? "Correo o contraseña incorrectos." : error.message);
        } else {
          location.hash = "#/"; // mismo motivo que arriba
        }
      }
    } finally {
      autenticando = false;
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
  // "autenticando" evita que esto se dispare por error justo cuando la
  // sesión que acaba de llegar es la de un login/registro recién exitoso
  // hecho desde esta misma pantalla (si no, te cerraba la sesión que
  // acababas de abrir y el login parecía que "no funcionaba").
  if (path === "/registro" || path === "/login") {
    // ya se está resolviendo un login/registro desde este mismo formulario:
    // no hay nada que renderizar todavía (el hash está a punto de cambiar
    // a "#/" solo) — evita mostrar "página no encontrada" de paso.
    if (autenticando) return;
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
  if (esDueno()) revisarAvisosPagos(); // no bloquea el render, se manda en segundo plano
  iniciarPush(usuario); // idem; solo hace algo dentro de la app del teléfono
}

/* ---------------- notificaciones push (solo en la app nativa) ---------------- */
// En el navegador window.Capacitor no existe y todo esto queda apagado. En
// la app (mobile/), sync-web.js agrega capacitor.js antes de este módulo.
// Por ahora solo iPhone: en Android el plugin necesita Firebase configurado
// (google-services.json) y sin eso la app se cierra al pedir el registro.
const Push = window.Capacitor?.getPlatform?.() === "ios" ? window.Capacitor.registerPlugin("PushNotifications") : null;
let pushToken = null;      // el "número" de este teléfono para Apple/Google
let pushUsuario = null;    // a qué cuenta está registrado ahora
let pushEscuchando = false;

async function iniciarPush(usuario) {
  if (!Push || pushUsuario === usuario) return;
  pushUsuario = usuario;
  try {
    if (!pushEscuchando) {
      pushEscuchando = true;
      Push.addListener("registration", async (t) => {
        pushToken = t.value;
        const { error } = await sb.rpc("registrar_dispositivo", { p_token: t.value, p_plataforma: window.Capacitor.getPlatform() });
        if (error) console.warn("No se pudo registrar el teléfono para notificaciones:", error.message);
      });
      Push.addListener("registrationError", (err) => console.warn("El teléfono no pudo registrarse para notificaciones:", err));
      // llegó una notificación con la app abierta: traer lo nuevo
      Push.addListener("pushNotificationReceived", () => refrescarDatos());
      // tocó la notificación: abrir la sección de la que avisaba
      Push.addListener("pushNotificationActionPerformed", (accion) => {
        const ruta = accion.notification?.data?.ruta;
        if (ruta) location.hash = "#" + ruta;
        refrescarDatos(); // lo que avisaba la notificación todavía no está cargado
      });
    }
    let permiso = await Push.checkPermissions();
    if (permiso.receive === "prompt") permiso = await Push.requestPermissions();
    if (permiso.receive === "granted") await Push.register();
  } catch (err) {
    console.warn("No se pudieron activar las notificaciones:", err);
  }
}

// le avisa al resto del canal/hilo que hay un mensaje nuevo. La función del
// servidor decide sola a quién (busca el último mensaje de esta cuenta), así
// que acá no se manda ni el texto ni los destinatarios.
function avisarMensajeNuevo() {
  sb.functions.invoke("enviar-push", { body: { tipo: "mensaje" } })
    .catch((err) => console.warn("No se pudo mandar la notificación del mensaje:", err));
}

async function cerrarSesion() {
  // este teléfono deja de recibir los avisos de la cuenta que sale
  if (pushToken) await sb.rpc("quitar_dispositivo", { p_token: pushToken }).then(() => {}, () => {});
  pushUsuario = null;
  // signOut() le avisa al servidor y recién después borra la sesión de este
  // dispositivo: si esa llamada falla o se queda colgada (mala conexión, otra
  // pestaña abierta trabando la sesión), el botón parecía no hacer nada. Si
  // en unos segundos no salió, se borra la sesión local a mano y se recarga.
  const limite = new Promise((ok) => setTimeout(() => ok({ error: new Error("tiempo agotado") }), 4000));
  const res = await Promise.race([sb.auth.signOut().catch((error) => ({ error })), limite]);
  if (res?.error || session) {
    console.warn("signOut no terminó, se cierra la sesión local:", res?.error);
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sb-") && k.includes("auth-token"))
      .forEach((k) => localStorage.removeItem(k));
    location.hash = "#/login";
    location.reload();
  }
}

// una vez por día (por pestaña), si sos dueño: revisa qué alumnos vencen en
// 3 días o ya vencieron y todavía no se avisó, y le manda a Millán un solo
// email con el resumen. Además, a los 5 y a los 3 días, le manda un
// recordatorio directo al propio alumno/papá (al correo que registraron).
// Cada aviso se manda una sola vez (se marca en recordatorios_enviados)
// aunque abra la app varias veces el mismo día.
//
// Esto SOLO corre si alguien con cuenta de dueño abre el panel ese día
// exacto — si nadie entra, el aviso se pierde (no se "atrasa" ni se
// recupera después). Por eso también existe la versión automática en
// supabase/functions/revisar-avisos-pago/, disparada por un Cron de
// Supabase: hace exactamente lo mismo pero sola, sin depender de que
// nadie use la app. Las dos comparten la tabla recordatorios_enviados,
// así que nunca se duplica un aviso aunque corran el mismo día.
let avisosRevisadosHoy = null;
async function revisarAvisosPagos() {
  const hoyStr = toYMD(new Date());
  if (avisosRevisadosHoy === hoyStr) return;
  avisosRevisadosHoy = hoyStr;
  try {
    const hoy = new Date(new Date().toDateString());
    const lineas = [];
    for (const a of Store.alumnos().filter((x) => x.activo)) {
      const venc = fechaVencimiento(a.id);
      if (!venc) continue;
      const dias = Math.round((venc - hoy) / 86400000);
      if (dias === 3) {
        if (await Store.intentarMarcarRecordatorio(a.id, "por_vencer", toYMD(venc))) {
          lineas.push(`• ${a.nombre} (${a.categoria || "sin división"} · ${a.sedes.join("/")}) — vence en 3 días, el ${fmtDateLong(venc)}.`);
        }
      } else if (dias < 0) {
        if (await Store.intentarMarcarRecordatorio(a.id, "vencido", toYMD(venc))) {
          lineas.push(`• ${a.nombre} (${a.categoria || "sin división"} · ${a.sedes.join("/")}) — VENCIÓ el ${fmtDateLong(venc)} y todavía no hay un pago nuevo registrado.`);
        }
      }
      // aparte del resumen para Millán, un recordatorio directo al propio
      // alumno/papá (al correo que registraron) a los 5 y a los 3 días
      if (a.correo && (dias === 5 || dias === 3)) {
        const tipo = dias === 5 ? "alumno_5dias" : "alumno_3dias";
        if (await Store.intentarMarcarRecordatorio(a.id, tipo, toYMD(venc))) {
          await notificarEmail({
            to: a.correo,
            subject: `Tu pago vence en ${dias} días — Millán Academy`,
            message: `Hola ${a.nombre}!\n\nTu próxima fecha de pago en Millán Academy es el ${fmtDateLong(venc)} (en ${dias} días).\n\n` +
              `Podés pagar desde la app, en "Mi suscripción", para no perder el acceso.\n\n— Millán Academy`,
          }).catch((err) => console.warn("No se pudo avisar por email a", a.nombre, err));
        }
      }
    }
    if (lineas.length) {
      await notificarEmail({
        subject: `Avisos de pago — ${lineas.length} alumno${lineas.length > 1 ? "s" : ""}`,
        message: `Resumen de fechas de corte de hoy:\n\n${lineas.join("\n")}`,
      });
    }
  } catch (err) {
    console.warn("No se pudieron revisar los avisos de pago:", err);
  }
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
  if (logoutBtn) logoutBtn.addEventListener("click", cerrarSesion);
  route();
}

window.addEventListener("hashchange", route);

// Los datos se cargan una sola vez al entrar. Sin esto, lo que cambiaba otra
// persona (ej. el dueño te asigna profe, o te llega un mensaje directo) no
// aparecía hasta cerrar y volver a abrir la app — se notaba sobre todo en el
// teléfono, donde la app queda abierta de fondo por días.
let ultimoRefresco = Date.now();
async function refrescarDatos() {
  if (!session || !perfil) return;
  ultimoRefresco = Date.now();
  await Store.refrescar();
  if (!session) return;
  // si está a mitad de llenar un formulario, no redibujar: se borraría lo escrito
  const escribiendo = document.activeElement?.closest?.("#view form");
  if (!escribiendo) render();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - ultimoRefresco > 15000) refrescarDatos();
});

/* ---------------- panel: dueño / profe ---------------- */

function Dashboard() {
  const alumnos = esStaff() ? Store.alumnosActivos() : Store.alumnos();
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
  const sus = esDueno() ? estadoSuscripcion(a.id) : null;
  return `
    <a class="card alumno-card" href="#/alumnos/${a.id}">
      <div class="top">
        <div class="avatar-sm">${esc(a.avatar)}</div>
        <div>
          <div class="name">${esc(a.nombre)}</div>
          <div class="meta">${esc(a.categoria)} · ${esc(a.sedes.join(" / "))}</div>
        </div>
      </div>
      ${sus ? `<div class="meta" style="margin-top:8px;">${badge(sus.vence ? (sus.kind === "crit" ? `Venció ${fmtDate(sus.vence)}` : `Corte: ${fmtDate(sus.vence)}`) : sus.texto, sus.kind)}</div>` : ""}
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
          <div class="row-sub">${esc(a.categoria)} · ${esc(a.sedes.join(" / "))}${a.coach ? ` · profe ${esc(a.coach)}` : ""}</div>
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
        <a class="btn btn-primary btn-sm" href="#/evidencias">${icon("i-task")} ${a.habitosPremium ? "Subir hábito" : "Hábitos Premium"}</a>
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
    const diasParaVencer = sus.vence ? Math.round((sus.vence - new Date(new Date().toDateString())) / 86400000) : null;
    const avisoPago = sus.kind === "crit"
      ? `<div class="mp-note" style="border-color:var(--crit);background:var(--crit-soft);margin-bottom:14px;"><b>Pago vencido.</b> Renueva tu suscripción para seguir con acceso completo.</div>`
      : diasParaVencer !== null && diasParaVencer <= 3
        ? `<div class="mp-note" style="margin-bottom:14px;"><b>Tu pago vence en ${diasParaVencer === 0 ? "0 días — hoy" : diasParaVencer === 1 ? "1 día" : `${diasParaVencer} días`}.</b> Renueva a tiempo para no perder acceso.</div>`
        : "";
    const periodicidadLabel = { mensual: "Mensual", "6meses": "6 meses", anual: "Anual" };
    const declararFecha = a.fechaPagoInicial
      ? `<p style="font-size:.78rem;color:var(--muted);margin-bottom:14px;">Declaraste tu pago como <b>${periodicidadLabel[a.periodicidadPago] || a.periodicidadPago}</b>, desde el ${fmtDate(a.fechaPagoInicial)}.</p>`
      : `<form data-action="declarar-fecha-pago" data-alumno="${a.id}" class="card" style="margin-bottom:14px;">
          <p style="font-size:.8rem;color:var(--ink-soft);margin-bottom:12px;max-width:60ch;">
            ¿Ya entrenabas con la academia antes de esta app? Pon la fecha en la que empezaste a
            pagar (por ejemplo, si pagas cada 15, cualquier 15 anterior sirve). ¿Eres alumno nuevo?
            Pon la fecha de tu primer pago.
          </p>
          <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
            <div class="field" style="margin:0;"><label>¿Desde cuándo pagas?</label><input name="fecha" type="date" required max="${toYMD(new Date())}" /></div>
            <div class="field" style="margin:0;"><label>¿Cada cuánto pagas?</label>
              <select name="periodicidad"><option value="mensual">Mensual</option><option value="6meses">6 meses</option><option value="anual">Anual</option></select>
            </div>
            <button class="btn btn-ghost btn-sm" type="submit">Guardar fecha de pago</button>
          </div>
          <p style="width:100%;font-size:.74rem;color:var(--muted);margin:0;">Solo se puede poner una vez — de ahí en más se calcula sola cada ciclo.</p>
        </form>`;
    return `
      <div class="block">
        <div class="block-head"><h3>${esc(a.nombre)}</h3>${badge(sus.texto, sus.kind)}</div>
        <p style="font-size:.86rem;color:var(--muted);margin-bottom:14px;">${esc(sus.detalle)}</p>
        ${declararFecha}
        ${avisoPago}
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
  }).join("") + PlanesPago();
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

// avisa a Millán por email — llama a la Edge Function "notificar-email"
// (supabase/functions/notificar-email), que manda el correo con Resend.
// La Access Key de Resend vive como secret en Supabase, nunca en el
// navegador. Viaja autenticada sola (sb.functions.invoke manda la sesión
// de quien está logueado), así que solo la puede usar la app.
async function notificarEmail({ subject, message, fotoBlob, to }) {
  const fotoBase64 = fotoBlob ? await blobABase64(fotoBlob) : null;
  const { data, error } = await sb.functions.invoke("notificar-email", { body: { subject, message, fotoBase64, to } });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.message || "error");
}
function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("no se pudo leer la foto"));
    reader.readAsDataURL(blob);
  });
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
    registro = await Store.addCheckin({ nombre, sede, tipo: "entrada", fotoBlob, estado: "enviando" });
    toast("Check-in guardado");
  } catch (err) {
    toast(errMsg(err));
    render();
    return;
  }
  render();

  try {
    await notificarEmail({
      subject: `Check-in — ${nombre} en ${sede}`,
      message: `${nombre} llegó a la sede ${sede} y subió su foto de check-in.\n\n` +
        `Fecha: ${new Date(registro.fecha).toLocaleString("es-MX")}\n` +
        (registro.fotoUrl ? `Foto: ${registro.fotoUrl}` : ""),
      fotoBlob,
    });
    await Store.updateCheckin(registro.id, { estado: "enviado" });
    toast("Millán fue notificado por email");
  } catch (err) {
    console.error("notificarEmail (check-in):", err);
    await Store.updateCheckin(registro.id, { estado: "error" }).catch(() => {});
    toast(`No se pudo notificar por email (${err.message || "error desconocido"}) — el check-in quedó guardado igual`);
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
  const alumnos = Store.alumnosActivos().filter((a) => a.sedes.includes(sede));
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
  const alumnos = Store.alumnosActivos().filter((a) => a.sedes.includes(sede));
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
    registro = await Store.addCheckin({ nombre: perfil.nombre, sede, tipo: "salida", resumen, estado: "enviando" });
    toast("Check-out registrado — reportes enviados");
  } catch (err) {
    toast(errMsg(err));
    render();
    return;
  }
  render();

  try {
    await notificarEmail({ subject: `Check-out — ${perfil.nombre} en ${sede}`, message: resumen });
    await Store.updateCheckin(registro.id, { estado: "enviado" });
    toast("Millán fue notificado por email");
  } catch (err) {
    console.error("notificarEmail (check-out):", err);
    await Store.updateCheckin(registro.id, { estado: "error" }).catch(() => {});
    toast(`No se pudo notificar por email (${err.message || "error desconocido"}) — el check-out quedó guardado igual`);
  }
  render();
}

/* ---------------- asistencia ---------------- */

function Asistencia() {
  const { sede, fecha, categoria } = ctxAsistencia;
  const alumnos = Store.alumnosActivos().filter((a) => a.sedes.includes(sede) && (!categoria || a.categoria === categoria));
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

/* ---------------- hábitos premium (entrenamiento, recuperación, nutrición) ----------------
   Reemplaza lo que antes era "Evidencias": ahora es un add-on pago
   aparte de la mensualidad (ver HABITOS_PREMIUM en planes.js) — solo
   quien lo tiene activo puede subir hábitos nuevos. El dueño lo activa
   a mano desde la ficha del alumno cuando confirma el cobro (ver
   AlumnoDetail / cambiarHabitosPremium). */

function Evidencias() {
  const alumnos = Store.alumnos();
  const evidencias = Store.evidencias();
  if (!alumnos.length && esAlumno()) return AlumnoSinAlumno();

  if (esAlumno() && !alumnos.some((a) => a.habitosPremium)) return HabitosUpsell(evidencias);

  const alumnosPremium = esStaff() ? Store.alumnosActivos().filter((a) => a.habitosPremium) : alumnos;
  return `
    <div class="block">
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">
        Hábitos Premium: la prueba de que se hizo lo que el profe pidió en
        <b>entrenamiento</b>, <b>recuperación</b> o <b>nutrición</b>. Queda guardado con
        foto, fecha y comentario para que el profe lo revise.
      </p>
      ${alumnosPremium.length ? `
      <form class="card" data-action="evidencia" style="max-width:460px;">
        <div class="field"><label>Alumno</label>
          <select name="alumnoId" required>${alumnosPremium.map((a) => `<option value="${a.id}">${esc(a.nombre)} · ${esc(a.categoria || "")}</option>`).join("")}</select></div>
        <div class="field"><label>Hábito</label>
          <select name="tipo">${TIPOS_EVIDENCIA.map((t) => `<option>${t}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Comentario</label><textarea name="comentario" placeholder="Ej. Entrenamiento de fuerza, 45 min"></textarea></div>
        <div class="field"><label>Foto</label><input name="foto" type="file" accept="image/*" capture="environment" required /></div>
        <button class="btn btn-primary btn-sm" type="submit">${icon("i-task")} Subir hábito</button>
      </form>` : `<div class="empty">${esDueno() ? "Todavía no hay alumnos con Hábitos Premium activo." : "No tienes alumnos con Hábitos Premium activo."}</div>`}
    </div>

    <div class="block">
      <div class="block-head"><h3>${esAlumno() ? "Mis hábitos" : "Hábitos recientes"}</h3></div>
      <div class="list">
        ${evidencias.length ? evidencias.map(evidenciaRow).join("") : `<div class="empty">Todavía no hay registros.</div>`}
      </div>
    </div>
  `;
}

// Dentro de la app de iPhone no se muestra ni el precio ni el botón de pago
// de Hábitos Premium (ni un link a donde pagarlo): es una función digital
// de la app, y Apple solo deja cobrar esas con su propio sistema de pagos —
// rechaza la app si ve un cobro externo o una invitación a pagar en otro
// lado. En la web y en Android se sigue cobrando con Mercado Pago.
const EN_APP_IPHONE = window.Capacitor?.getPlatform?.() === "ios";

function HabitosUpsell(evidencias) {
  return `
    <div class="block">
      <div class="card" style="max-width:520px;">
        <div class="row-title" style="font-size:1.05rem;">${esc(HABITOS_PREMIUM.nombre)}</div>
        <p style="font-size:.86rem;color:var(--ink-soft);margin:10px 0 14px;max-width:56ch;">
          Seguimiento de tus hábitos de <b>entrenamiento</b>, <b>recuperación</b> y
          <b>nutrición</b>, revisado por tu profe — una herramienta más para progresar,
          aparte de tu mensualidad.
        </p>
        ${EN_APP_IPHONE ? `
        <p style="font-size:.82rem;color:var(--muted);">
          Hábitos Premium se contrata directamente con la academia. Cuando lo tengas activo,
          aquí vas a poder subir tus hábitos.
        </p>` : `
        <div class="price" style="margin-bottom:14px;">${fmtMXN(HABITOS_PREMIUM.precioMensual)} <small>/ mes</small></div>
        ${HABITOS_PREMIUM.linkPago
          ? `<a class="btn btn-primary btn-sm" href="${HABITOS_PREMIUM.linkPago}" target="_blank" rel="noopener">Suscribirme</a>`
          : `<p style="font-size:.78rem;color:var(--muted);">Todavía no está conectado el cobro — pídele a la academia que te active Hábitos Premium.</p>`}`}
      </div>
    </div>
    ${evidencias.length ? `
    <div class="block">
      <div class="block-head"><h3>Mis hábitos (de antes de Hábitos Premium)</h3></div>
      <div class="list">${evidencias.map(evidenciaRow).join("")}</div>
    </div>` : ""}
  `;
}

function evidenciaRow(e) {
  const tipoKind = e.tipo === "Entrenamiento" ? "ok" : e.tipo === "Nutrición" ? "warn" : "muted";
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
    toast("Hábito subido");
  } catch (err) {
    toast(errMsg(err));
  }
  render();
}

/* ---------------- alumnos ---------------- */

function AlumnosList() {
  const alumnos = Store.alumnosActivos();
  const coaches = Store.coaches();
  const deBaja = esDueno() ? Store.alumnosDeBaja() : [];
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
            <div class="field"><label>Sede(s) de entrenamiento</label>
              <div style="display:flex;gap:14px;flex-wrap:wrap;padding-top:8px;">
                ${Store.SEDES.map((s) => `<label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="checkbox" name="sedes" value="${esc(s)}" /> ${esc(s)}</label>`).join("")}
              </div>
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

    ${alumnos.length ? Store.SEDES.map((sede) => alumnosPorSede(sede, alumnos)).join("")
      : `<div class="empty">${esDueno() ? "Todavía no hay alumnos cargados." : "Todavía no tienes alumnos asignados."}</div>`}

    ${deBaja.length ? `
    <div class="block">
      <details class="card panel">
        <summary style="cursor:pointer;font-family:var(--display);font-weight:600;font-size:.85rem;letter-spacing:.02em;text-transform:uppercase;color:var(--muted);">
          Dados de baja (${deBaja.length})
        </summary>
        <div class="list" style="margin-top:14px;">
          ${deBaja.map((a) => `
            <div class="row-card">
              <a class="grow" href="#/alumnos/${a.id}"><div class="row-title">${esc(a.nombre)}</div><div class="row-sub">${esc(a.categoria || "sin división")} · ${esc(a.sedes.join(" / "))}</div></a>
              <button class="btn btn-ghost btn-sm" data-action="reactivar-alumno" data-id="${a.id}" data-nombre="${esc(a.nombre)}">Reactivar</button>
            </div>`).join("")}
        </div>
      </details>
    </div>` : ""}
  `;
}

// una sección por sede, y dentro de cada una una sub-sección por división —
// así es mucho más fácil encontrar a un alumno que en una sola lista larga.
function alumnosPorSede(sede, alumnos) {
  const deLaSede = alumnos.filter((a) => a.sedes.includes(sede));
  if (!deLaSede.length) return "";
  const divisiones = Store.SEDE_CATEGORIAS[sede] || Store.CATEGORIAS;
  const sinDivision = deLaSede.filter((a) => !divisiones.includes(a.categoria));
  return `
    <div class="block">
      <div class="block-head"><h3>${esc(sede)} <span class="badge badge-muted" style="margin-left:8px;">${deLaSede.length}</span></h3></div>
      ${divisiones.map((cat) => {
        const de = deLaSede.filter((a) => a.categoria === cat);
        if (!de.length) return "";
        return `
          <p style="font-size:.72rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-2);margin:18px 0 10px;">${esc(cat)}</p>
          <div class="alumno-grid">${de.map(alumnoCard).join("")}</div>`;
      }).join("")}
      ${sinDivision.length ? `
        <p style="font-size:.72rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:18px 0 10px;">Sin división asignada</p>
        <div class="alumno-grid">${sinDivision.map(alumnoCard).join("")}</div>` : ""}
    </div>`;
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
        <div class="row-sub">${esc(a.categoria)} · ${esc(a.sedes.join(" / "))}${a.coach ? ` · profe ${esc(a.coach)}` : ""} · alta hace ${daysAgo(a.alta)} días</div>
        ${staff && (a.telefono || a.correo) ? `<div class="row-sub" style="margin-top:4px;">${[a.telefono, a.correo].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
        ${a.tallaPlayera ? `<div class="row-sub">Playera: ${esc(a.tallaPlayera)}</div>` : ""}
      </div>
      <div style="text-align:right;">
        ${badge(sus.texto, sus.kind)}
        ${staff ? `<div class="row-sub" style="margin-top:6px;">${esc(sus.detalle)}</div>` : ""}
      </div>
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
      </form>
      <form data-action="asignar-categoria" data-alumno="${a.id}" style="display:flex;gap:8px;align-items:flex-end;">
        <div class="field" style="margin:0;"><label>División</label>
          <select name="categoria">
            <option value="">Sin división</option>
            ${categoriasParaSedes(a.sedes).map((c) => `<option ${c === a.categoria ? "selected" : ""}>${esc(c)}</option>`).join("")}
          </select></div>
        <button class="btn btn-ghost btn-sm" type="submit">Guardar</button>
      </form>
      <form data-action="asignar-sedes" data-alumno="${a.id}" style="display:flex;gap:10px;align-items:flex-end;">
        <div class="field" style="margin:0;"><label>Sede(s)</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:6px;">
            ${Store.SEDES.map((s) => `<label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="checkbox" name="sedes" value="${esc(s)}" ${a.sedes.includes(s) ? "checked" : ""} /> ${esc(s)}</label>`).join("")}
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" type="submit">Guardar</button>
      </form>
      <form data-action="corregir-fecha-pago" data-alumno="${a.id}" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
        <div class="field" style="margin:0;"><label>Fecha de pago${a.fechaPagoInicial ? " (corregir)" : ""}</label>
          <input name="fecha" type="date" value="${a.fechaPagoInicial || ""}" /></div>
        <div class="field" style="margin:0;"><label>Periodicidad</label>
          <select name="periodicidad">
            <option value="" ${!a.periodicidadPago ? "selected" : ""}>—</option>
            <option value="mensual" ${a.periodicidadPago === "mensual" ? "selected" : ""}>Mensual</option>
            <option value="6meses" ${a.periodicidadPago === "6meses" ? "selected" : ""}>6 meses</option>
            <option value="anual" ${a.periodicidadPago === "anual" ? "selected" : ""}>Anual</option>
          </select></div>
        <button class="btn btn-ghost btn-sm" type="submit">Guardar</button>
        ${a.fechaPagoInicial ? `<p style="width:100%;font-size:.72rem;color:var(--muted);margin:0;">El alumno ya la declaró y no puede volver a tocarla — solo el dueño puede corregirla acá.</p>` : ""}
      </form>` : ""}
    </div>` : ""}

    ${esDueno() ? `
    <div class="card" style="margin-bottom:24px;display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
      <form data-action="cobrar-monto" data-alumno="${a.id}" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;flex:1;min-width:260px;">
        <div class="field" style="margin:0;"><label>Monto que tiene que pagar</label>
          <input name="monto" type="number" min="0" step="0.01" placeholder="0.00" required /></div>
        <div class="field" style="margin:0;"><label>Moneda</label>
          <select name="moneda"><option value="MXN" ${a.moneda !== "USD" ? "selected" : ""}>MXN</option><option value="USD" ${a.moneda === "USD" ? "selected" : ""}>USD</option></select></div>
        <input type="hidden" name="concepto" value="Mensualidad" />
        <button class="btn btn-ghost btn-sm" type="submit">Avisarle el monto</button>
        <p style="width:100%;font-size:.72rem;color:var(--muted);margin:0;">Queda como "Pago pendiente" y ${esc(a.nombre)} lo ve de inmediato en su suscripción, con el monto exacto.</p>
      </form>
      <button class="btn btn-ghost btn-sm" data-action="${a.habitosPremium ? "quitar-habitos-premium" : "activar-habitos-premium"}" data-id="${a.id}" data-nombre="${esc(a.nombre)}">
        ${a.habitosPremium ? "Quitar Hábitos Premium" : "Activar Hábitos Premium"}
      </button>
      <button class="btn btn-ghost btn-sm" data-action="${a.activo === false ? "reactivar-alumno" : "dar-de-baja"}" data-id="${a.id}" data-nombre="${esc(a.nombre)}">
        ${a.activo === false ? "Reactivar alumno" : "Dar de baja"}
      </button>
    </div>
    ${a.habitosPremium ? `<div class="mp-note" style="margin-bottom:24px;"><b>${esc(a.nombre)} tiene Hábitos Premium activo</b> — puede subir entrenamiento, recuperación y nutrición en esa sección.</div>` : ""}
    ${a.activo === false ? `<div class="mp-note" style="margin-bottom:24px;"><b>${esc(a.nombre)} está dado de baja.</b> No aparece en el roster ni en los avisos de pago, pero su historial sigue intacto.</div>` : ""}` : ""}

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
      <div class="block-head"><h3>Hábitos</h3><a href="#/evidencias">Ver más →</a></div>
      ${evidencias.length ? `<div class="list">${evidencias.map(evidenciaRow).join("")}</div>` : `<div class="empty">${a.habitosPremium ? "Todavía no hay registros." : "No tiene Hábitos Premium activo."}</div>`}
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
// el resto de la app (agenda, reportes, chat, suscripción — Hábitos
// Premium es aparte, ver Evidencias()/HabitosUpsell más abajo).
function AlumnoSinAlumno() {
  const misSolicitudes = Store.solicitudes().filter((s) => s.userId === perfil?.id);
  const pendiente = misSolicitudes.find((s) => s.estado === "pendiente");
  const rechazada = !pendiente && misSolicitudes.some((s) => s.estado === "rechazada");

  if (pendiente) {
    return `<div class="mp-note">
      <b>Tu solicitud de clase de prueba está en revisión.</b> En cuanto la academia la confirme
      vas a poder ver tu agenda, tus reportes, usar el chat y todo lo demás.
    </div>`;
  }
  const aviso = rechazada
    ? `<div class="mp-note" style="border-color:var(--crit);background:var(--crit-soft);margin-bottom:18px;">
        Tu solicitud anterior no fue confirmada. Puedes mandar una nueva.
      </div>`
    : "";
  return aviso + SolicitudForm(
    "Reserva tu clase de prueba",
    "Para activar tu cuenta (agenda, reportes, chat, suscripción) primero pide tu clase de prueba. En cuanto la academia la confirme, se desbloquea todo.",
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
  const alumnos = esStaff() ? Store.alumnosActivos() : Store.alumnos();
  if (!alumnos.length && esAlumno()) return AlumnoSinAlumno();
  return `
    <div class="list">
      ${alumnos.length ? alumnos.map((a) => {
        const ev = a.evaluacion || { tactica: 0, tecnica: 0, fisico: 0 };
        return `
        <a class="card row-card" href="#/alumnos/${a.id}" style="align-items:flex-start;">
          <div class="avatar-sm">${esc(a.avatar)}</div>
          <div class="grow">
            <div class="row-title">${esc(a.nombre)} <span style="color:var(--muted);font-weight:500;">· ${esc(a.categoria)} · ${esc(a.sedes.join(" / "))}</span></div>
            <div style="margin-top:10px;display:grid;gap:8px;max-width:420px;">
              ${barra("Táctica", ev.tactica)}${barra("Técnica", ev.tecnica)}${barra("Físico", ev.fisico)}
            </div>
          </div>
          <div style="text-align:right;">
            <div class="row-title tabular">${avgAvance(a)}%</div>
            <div class="row-sub">avance de objetivos</div>
            ${esDueno() ? (() => {
              const sus = estadoSuscripcion(a.id);
              return sus.vence ? `<div style="margin-top:8px;">${badge(sus.kind === "crit" ? `Venció ${fmtDate(sus.vence)}` : `Corte: ${fmtDate(sus.vence)}`, sus.kind)}</div>` : "";
            })() : ""}
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
  const fechas = Store.alumnosActivos()
    .map((a) => ({ a, vence: fechaVencimiento(a.id) }))
    .filter((x) => x.vence)
    .sort((x, y) => x.vence - y.vence);

  return `
    <div class="stats">
      <div class="card stat"><span class="n">${fmtMoney(ingresosMXN, "MXN")}</span><span class="l">Ingresos (MXN)</span></div>
      <div class="card stat"><span class="n">${fmtMoney(ingresosUSD, "USD")}</span><span class="l">Ingresos (USD)</span></div>
      <div class="card stat"><span class="n">${pendientes}</span><span class="l">Pagos pendientes</span></div>
    </div>

    ${fechas.length ? `
    <div class="block">
      <div class="block-head"><h3>Fecha de corte por alumno</h3></div>
      <div class="list">
        ${fechas.map(({ a, vence }) => `
          <a class="row-card" href="#/alumnos/${a.id}">
            <div class="grow"><div class="row-title">${esc(a.nombre)}</div><div class="row-sub">${esc(a.categoria || "sin división")} · ${esc(a.sedes.join(" / "))}</div></div>
            ${badge(vence < new Date(new Date().toDateString()) ? `Venció ${fmtDate(vence)}` : `Corte: ${fmtDate(vence)}`, vence < new Date(new Date().toDateString()) ? "crit" : "ok")}
          </a>`).join("")}
      </div>
    </div>` : ""}

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

      ${PLANES.some((p) => p.duraciones.some((d) => !d.linkPago)) ? `
      <div class="mp-note">
        <b>Todavía falta un link de Mercado Pago.</b> Crea el link de pago que falte y pégalo en
        <code>assets/js/planes.js</code> (pasos en el README). Mientras tanto esta pantalla lleva el
        registro de cobros manuales (efectivo, transferencia).
      </div>` : ""}
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

// grid de planes con botón directo a Mercado Pago (el mismo link que ya usa
// el sitio público) — así pagar desde adentro del panel es igual de fácil
// que desde afuera. Si un plan todavía no tiene link cargado, el botón
// manda al formulario de abajo para que la academia lo gestione a mano.
function PlanesPago() {
  return `
    <div class="block">
      <div class="block-head"><h3>Elige tu plan y paga con Mercado Pago</h3></div>
      <div class="plans">
        ${PLANES.map((p) => `
          <div class="card plan">
            <div class="row-title">${esc(p.nombre)}</div>
            ${p.detalle ? `<div class="row-sub">${esc(p.detalle)}</div>` : ""}
            <ul>
              ${p.duraciones.map((d) => `
                <li style="list-style:none;padding:0;margin-top:6px;">
                  <div class="row-sub" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">${esc(d.label)}</div>
                  <div class="price" style="margin-bottom:8px;">${fmtMXN(d.real)}</div>
                  <a class="btn ${d.linkPago ? "btn-primary" : "btn-ghost"} btn-sm" style="width:100%;"
                     href="${d.linkPago || `#/inscribirse?plan=${p.id}&dur=${d.id}`}" ${d.linkPago ? 'target="_blank" rel="noopener"' : ""}>
                    ${d.linkPago ? "Pagar con Mercado Pago" : "Pedir este plan"}
                  </a>
                </li>`).join("")}
            </ul>
          </div>`).join("")}
      </div>
      <p style="font-size:.78rem;color:var(--muted);margin-top:-16px;margin-bottom:30px;max-width:60ch;">
        ¿Alumno internacional que paga en USD (Stripe/PayPal/Wise)? Usa el formulario de abajo —
        la academia te contacta para coordinar el pago y activar tu cuenta.
      </p>
    </div>`;
}

function Inscribirse(fullPath) {
  const query = fullPath.includes("?") ? fullPath.split("?")[1] : "";
  const params = new URLSearchParams(query);
  const found = encontrarDuracion(params.get("plan"), params.get("dur"));
  const inscripciones = Store.inscripciones();

  return `
    ${esAlumno() ? PlanesPago() : ""}
    <div class="block">
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">
        ${esAlumno()
          ? "¿No pudiste pagar directo arriba, o tu plan todavía no tiene link? Manda tu inscripción y la academia te contacta para activar tu cuenta."
          : "Elige tu plan y déjanos tus datos. Si el plan ya tiene un link de pago de Mercado Pago conectado, el botón del sitio te lleva directo a pagar; si no, la academia recibe tu inscripción, te contacta y activa tu cuenta al confirmar el pago."}
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
  const alumnos = Store.alumnosActivos();
  const pagos = Store.pagos();
  const hoy = new Date(new Date().toDateString());
  const conVencimiento = alumnos
    .map((a) => ({ a, vence: fechaVencimiento(a.id) }))
    .filter((x) => x.vence);
  const vencidos = conVencimiento.filter((x) => x.vence < hoy).sort((x, y) => x.vence - y.vence);
  const porVencer = conVencimiento
    .filter((x) => x.vence >= hoy && Math.round((x.vence - hoy) / 86400000) <= 7)
    .sort((x, y) => x.vence - y.vence);
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

    ${vencidos.length || porVencer.length ? `
    <div class="block">
      <div class="block-head"><h3>Fechas de corte</h3></div>
      ${vencidos.length ? `
        <p style="font-size:.72rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--crit);margin-bottom:10px;">Vencidos — cobrar</p>
        <div class="list" style="margin-bottom:18px;">
          ${vencidos.map(({ a, vence }) => `
            <a class="row-card" href="#/alumnos/${a.id}">
              <div class="grow"><div class="row-title">${esc(a.nombre)}</div><div class="row-sub">${esc(a.categoria)} · ${esc(a.sedes.join(" / "))}</div></div>
              ${badge(`Venció ${fmtDate(vence)}`, "crit")}
            </a>`).join("")}
        </div>` : ""}
      ${porVencer.length ? `
        <p style="font-size:.72rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--warn);margin-bottom:10px;">Vencen esta semana</p>
        <div class="list">
          ${porVencer.map(({ a, vence }) => `
            <a class="row-card" href="#/alumnos/${a.id}">
              <div class="grow"><div class="row-title">${esc(a.nombre)}</div><div class="row-sub">${esc(a.categoria)} · ${esc(a.sedes.join(" / "))}</div></div>
              ${badge(`Corte ${fmtDate(vence)}`, "warn")}
            </a>`).join("")}
        </div>` : ""}
    </div>` : ""}

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
                <td>${esc(a.sedes.join(" / "))}</td>
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

/* ---------------- mi cuenta ---------------- */
function MiCuenta() {
  const rolLabel = { "dueño": "Dueño", "profe": "Profe", "alumno": "Alumno / papá" }[perfil.rol] || perfil.rol;
  return `
    <div class="block" style="max-width:520px;">
      <div class="card">
        <div class="row-title">${esc(perfil.nombre)}</div>
        <div class="row-sub">${esc(session.user.email)} · ${esc(rolLabel)}</div>
        <div class="row-actions" style="margin-top:16px;">
          <button class="btn btn-ghost btn-sm ico-linea" type="button" data-action="cerrar-sesion">${icon("i-exit")} Cerrar sesión</button>
          <a class="btn btn-ghost btn-sm" href="https://millanacademy.com/privacidad/" target="_blank" rel="noopener">Aviso de privacidad</a>
        </div>
      </div>
    </div>

    ${Store.bloqueados().length ? `
    <div class="block" style="max-width:520px;">
      <div class="block-head"><h3>Usuarios bloqueados</h3></div>
      <div class="list">
        ${Store.bloqueados().map((b) => `
        <div class="row-card">
          <div class="grow"><div class="row-title">${esc(b.nombre || "Usuario")}</div><div class="row-sub">No ves sus mensajes en el chat.</div></div>
          <button class="btn btn-ghost btn-sm" type="button" data-action="desbloquear-usuario" data-id="${b.id}">Desbloquear</button>
        </div>`).join("")}
      </div>
    </div>` : ""}

    <div class="block" style="max-width:520px;">
      <div class="block-head"><h3>Eliminar mi cuenta</h3></div>
      <form class="card" data-action="eliminar-cuenta" style="border-color:var(--crit);">
        <p style="font-size:.86rem;color:var(--ink-soft);margin-bottom:12px;">
          Se borra para siempre tu acceso, tu perfil (nombre, teléfono, país), tus mensajes de chat
          y los hábitos y fotos que subiste. No se puede deshacer.
        </p>
        <p style="font-size:.8rem;color:var(--muted);margin-bottom:16px;">
          La ficha del alumno en la academia (asistencia, reportes y pagos) no se borra con tu cuenta,
          porque es el registro de la academia y el alumno puede seguir entrenando. Si también quieres
          que se elimine, pídeselo a la academia.
        </p>
        <div class="field">
          <label>Escribe ELIMINAR para confirmar</label>
          <input name="confirmacion" required autocomplete="off" autocapitalize="characters" placeholder="ELIMINAR" />
        </div>
        <button class="btn btn-sm" type="submit" style="background:var(--crit);color:#fff;">Eliminar mi cuenta</button>
      </form>
    </div>`;
}

function ChatMensajeBubble(m) {
  const mio = m.autorId === perfil?.id;
  const etiquetaRol = m.autorRol === "dueño" ? " · Dueño" : m.autorRol === "profe" ? " · Profe" : "";
  return `
    <div class="chat-msg ${mio ? "mio" : ""}">
      <div class="chat-msg-meta">${esc(m.autorNombre)}${mio ? "" : etiquetaRol}</div>
      <div class="chat-msg-bubble">${esc(m.contenido)}</div>
      <div class="chat-msg-hora">${fmtHora(m.fecha)}</div>
      ${mio && !esDueno() ? "" : `
      <div class="chat-msg-acciones">
        ${mio ? "" : `<button type="button" data-action="reportar-mensaje" data-id="${m.id}">Reportar</button>
        <button type="button" data-action="bloquear-usuario" data-id="${m.autorId}" data-nombre="${esc(m.autorNombre)}">Bloquear</button>`}
        ${esDueno() ? `<button type="button" data-action="borrar-mensaje" data-id="${m.id}">Eliminar</button>` : ""}
      </div>`}
    </div>`;
}

// solo el dueño: mensajes que alguien reportó y siguen sin revisar
function ReportesPendientes() {
  const reportes = esDueno() ? Store.reportesPendientes() : [];
  if (!reportes.length) return "";
  return `
    <div class="block">
      <div class="block-head"><h3>Mensajes reportados</h3></div>
      <div class="list">
        ${reportes.map((r) => `
        <div class="row-card" style="border-color:var(--crit);">
          <div class="grow">
            <div class="row-title">${esc(r.autorNombre || "Alguien")}: “${esc(r.contenido || "")}”</div>
            <div class="row-sub">Lo reportó ${esc(r.reportadoPor || "un usuario")}${r.motivo ? ` — ${esc(r.motivo)}` : ""} · ${fmtHora(r.fecha)}</div>
          </div>
          <div class="row-actions">
            ${r.mensajeId ? `<button class="btn btn-sm" type="button" style="background:var(--crit);color:#fff;" data-action="borrar-mensaje" data-id="${r.mensajeId}" data-reporte="${r.id}">Eliminar mensaje</button>` : ""}
            <button class="btn btn-ghost btn-sm" type="button" data-action="cerrar-reporte" data-id="${r.id}">Marcar revisado</button>
          </div>
        </div>`).join("")}
      </div>
      <p style="font-size:.76rem;color:var(--muted);margin-top:10px;">
        Para sacar a alguien de la academia en la app, da de baja su acceso desde Dueños o Alumnos.
      </p>
    </div>`;
}

function ChatCategoria(sede, categoria) {
  const msgs = Store.mensajesCategoria(sede, categoria);
  return `
    <div class="chat-panel">
      <div class="chat-messages" id="chatMessages">
        ${msgs.length ? msgs.map(ChatMensajeBubble).join("") : `<div class="empty">Todavía no hay mensajes en este canal — ¡sé el primero en escribir!</div>`}
      </div>
      <form data-action="mensaje-categoria" class="chat-form">
        <input type="hidden" name="sede" value="${esc(sede)}" />
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

// Las conversaciones directas de un alumno: la de su profe asignado (aunque
// todavía esté vacía) + cualquier otra que ya tenga mensajes. Un dueño puede
// abrir un hilo con cualquier profe (o consigo mismo), y antes esos mensajes
// le llegaban como notificación al papá pero no los podía ver en ningún lado,
// porque acá solo se mostraba el hilo del profe asignado.
function hilosDirectosDeAlumno(alumno) {
  const hilos = [];
  if (alumno.coachId) hilos.push({ profeId: alumno.coachId, nombre: alumno.coach || "tu profe" });
  for (const m of Store.mensajes()) {
    if (m.tipo !== "directo" || m.alumnoId !== alumno.id || hilos.some((h) => h.profeId === m.profeId)) continue;
    // el nombre del profe sale de algún mensaje que él mismo haya escrito en el hilo
    const suyo = Store.mensajes().find((x) => x.tipo === "directo" && x.alumnoId === alumno.id && x.profeId === m.profeId && x.autorId === m.profeId);
    hilos.push({ profeId: m.profeId, nombre: suyo?.autorNombre || "la academia" });
  }
  return hilos;
}

function ChatDMAlumno(alumnos, params) {
  const alumnoId = params.get("alumno") || alumnos[0]?.id || "";
  const alumno = Store.alumno(alumnoId);
  if (!alumno) return `<div class="empty">No encontramos a tu alumno vinculado.</div>`;
  const hilos = hilosDirectosDeAlumno(alumno);
  if (!hilos.length) {
    return `<div class="empty">${esc(alumno.nombre)} todavía no tiene profe asignado — en cuanto la academia le asigne uno vas a poder escribirle acá.</div>`;
  }
  // sin uno elegido, abre el hilo donde está el mensaje más reciente
  const ultimo = Store.mensajes().filter((m) => m.tipo === "directo" && m.alumnoId === alumno.id)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
  const hilo = hilos.find((h) => h.profeId === params.get("profe"))
    || hilos.find((h) => h.profeId === ultimo?.profeId) || hilos[0];
  const ir = `location.hash='#/chat?tab=dm&alumno='+document.getElementById('selAlumnoDM').value+'&profe='+(document.getElementById('selHiloDM')?.value||'')`;
  const picker = alumnos.length > 1 || hilos.length > 1 ? `
    <div class="chat-dm-picker">
      ${alumnos.length > 1 ? `
      <div class="field"><label>Alumno</label>
        <select id="selAlumnoDM" onchange="location.hash='#/chat?tab=dm&alumno='+this.value">
          ${alumnos.map((a) => `<option value="${a.id}" ${a.id === alumnoId ? "selected" : ""}>${esc(a.nombre)}</option>`).join("")}
        </select>
      </div>` : `<input type="hidden" id="selAlumnoDM" value="${alumnoId}" />`}
      ${hilos.length > 1 ? `
      <div class="field"><label>Conversación con</label>
        <select id="selHiloDM" onchange="${ir}">
          ${hilos.map((h) => `<option value="${h.profeId}" ${h === hilo ? "selected" : ""}>${esc(h.nombre)}</option>`).join("")}
        </select>
      </div>` : ""}
    </div>` : "";
  const msgs = Store.mensajesDirectos(alumnoId, hilo.profeId);
  return picker + `
    <div class="chat-panel" style="${picker ? "margin-top:16px;" : ""}">
      <p style="font-size:.82rem;color:var(--muted);margin:0 0 10px;">Conversación con ${esc(hilo.nombre)}</p>
      <div class="chat-messages" id="chatMessages">
        ${msgs.length ? msgs.map(ChatMensajeBubble).join("") : `<div class="empty">Todavía no hay mensajes. ¡Escríbele a ${esc(hilo.nombre)}!</div>`}
      </div>
      <form data-action="mensaje-directo" class="chat-form">
        <input type="hidden" name="alumnoId" value="${alumnoId}" />
        <input type="hidden" name="profeId" value="${hilo.profeId}" />
        <input name="contenido" placeholder="Escribe un mensaje…" required autocomplete="off" />
        <button class="btn btn-primary btn-sm" type="submit">Enviar</button>
      </form>
    </div>`;
}

// las 6 combinaciones reales de sede+división (Polanco: 1ra-2da, Metepec:
// 1ra-4ta) — un canal de chat es "Polanco · 1ra División", no solo "1ra
// División", porque cada sede entrena por separado.
function canalesChat() {
  const canales = [];
  for (const sede of Store.SEDES) {
    for (const categoria of Store.SEDE_CATEGORIAS[sede] || []) canales.push({ sede, categoria });
  }
  return canales;
}

function Chat(fullPath) {
  const query = fullPath.includes("?") ? fullPath.split("?")[1] : "";
  const params = new URLSearchParams(query);
  const alumnos = Store.alumnos();
  if (esAlumno() && !alumnos.length) return AlumnoSinAlumno();

  // el staff ve los 6 canales; el alumno/papá solo ve el (o los) que
  // coinciden con la sede + división de su(s) propio(s) alumno(s) — y
  // ninguno todavía si no le asignaron división (eso lo hace el dueño)
  const canales = canalesChat().filter((c) =>
    esStaff() || alumnos.some((a) => a.sedes.includes(c.sede) && a.categoria === c.categoria)
  );

  const tabParam = params.get("tab") || "";
  const activo = canales.find((c) => tabParam === `${c.sede}|${c.categoria}`) || (tabParam === "dm" ? null : canales[0] || null);

  const tabs = [
    ...canales.map((c) => `<a href="#/chat?tab=${encodeURIComponent(c.sede + "|" + c.categoria)}" class="chat-tab ${c === activo ? "active" : ""}">${esc(c.sede)} · ${esc(c.categoria.replace(" División", ""))}</a>`),
    `<a href="#/chat?tab=dm" class="chat-tab ${!activo ? "active" : ""}">Mensajes directos</a>`,
  ].join("");

  const body = activo
    ? ChatCategoria(activo.sede, activo.categoria)
    : (esStaff() ? ChatDMStaff(params) : ChatDMAlumno(alumnos, params));

  return `${ReportesPendientes()}<div class="chat-tabs">${tabs}</div>${body}
    <p style="font-size:.74rem;color:var(--muted);margin-top:12px;">
      No se permite contenido ofensivo ni abuso. Puedes reportar un mensaje o bloquear a quien lo escribió;
      la academia revisa los reportes en menos de 24 horas.
    </p>`;
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
      const sedes = [...form.querySelectorAll('input[name="sedes"]:checked')].map((el) => el.value);
      if (!sedes.length) { toast("Elegí al menos una sede"); return; }
      const coach = Store.coaches().find((c) => c.id === data.coachId);
      const a = await Store.addAlumno({
        nombre: data.nombre.trim(), categoria: data.categoria, sedes, coach: coach?.nombre, coachId: data.coachId || null,
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
    } else if (action === "asignar-categoria") {
      await Store.asignarCategoria(form.dataset.alumno, data.categoria);
      toast("División actualizada");
    } else if (action === "asignar-sedes") {
      const sedes = [...form.querySelectorAll('input[name="sedes"]:checked')].map((el) => el.value);
      if (!sedes.length) { toast("Elegí al menos una sede"); return; }
      await Store.asignarSedes(form.dataset.alumno, sedes);
      toast("Sedes actualizadas");
    } else if (action === "declarar-fecha-pago") {
      await Store.declararFechaPago(form.dataset.alumno, data.fecha, data.periodicidad);
      toast("Fecha de pago guardada");
    } else if (action === "corregir-fecha-pago") {
      await Store.corregirFechaPago(form.dataset.alumno, data.fecha, data.periodicidad);
      toast("Fecha de pago corregida");
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
      const lista = Store.alumnosActivos().filter((a) => a.sedes.includes(sede) && (!categoria || a.categoria === categoria));
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
    } else if (action === "cobrar-monto") {
      await Store.addPago({ alumnoId: form.dataset.alumno, concepto: data.concepto.trim(), metodo: "Mercado Pago", moneda: data.moneda, monto: Number(data.monto), estado: "pendiente" });
      toast("Monto avisado — ya aparece en su suscripción");
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
      await Store.enviarMensajeCategoria(data.sede, data.categoria, data.contenido.trim(), perfil.id, perfil.nombre, perfil.rol);
      avisarMensajeNuevo();
      form.reset();
    } else if (action === "mensaje-directo") {
      await Store.enviarMensajeDirecto(data.alumnoId, data.profeId, data.contenido.trim(), perfil.id, perfil.nombre, perfil.rol);
      avisarMensajeNuevo();
      form.reset();
    } else if (action === "eliminar-cuenta") {
      if (data.confirmacion.trim().toUpperCase() !== "ELIMINAR") { toast("Escribe ELIMINAR para confirmar"); return; }
      if (!confirm("Tu cuenta se elimina para siempre y no se puede recuperar. ¿Continuar?")) return;
      const boton = form.querySelector("button[type='submit']");
      boton.disabled = true; boton.textContent = "Eliminando…";
      const { data: res, error } = await sb.functions.invoke("eliminar-cuenta");
      // cuando la función responde con error, el motivo viene en el cuerpo
      const motivo = res?.message || (await error?.context?.json?.().catch(() => null))?.message;
      if (error || !res?.success) {
        boton.disabled = false; boton.textContent = "Eliminar mi cuenta";
        toast(motivo || "No se pudo eliminar la cuenta. Intenta de nuevo.");
        return;
      }
      pushUsuario = null;
      await sb.auth.signOut().catch(() => {}); // la cuenta ya no existe: solo limpia la sesión de este dispositivo
      toast("Tu cuenta fue eliminada");
      return;
    }
  } catch (err) {
    toast(errMsg(err));
  }
  render();
});

view.addEventListener("click", async (e) => {
  try {
    if (e.target.closest("[data-action='cerrar-sesion']")) return void cerrarSesion();

    /* ---- moderación del chat ---- */
    const reportarBtn = e.target.closest("[data-action='reportar-mensaje']");
    if (reportarBtn) {
      const m = Store.mensajes().find((x) => x.id === reportarBtn.dataset.id);
      if (!m) return;
      const motivo = prompt(`¿Por qué reportas el mensaje de ${m.autorNombre}? (opcional)`);
      if (motivo === null) return; // canceló
      await Store.reportarMensaje(m, motivo.trim(), perfil.nombre);
      notificarEmail({
        subject: "Mensaje reportado en el chat — Millán Academy",
        message: `${perfil.nombre} reportó un mensaje de ${m.autorNombre}:\n\n“${m.contenido}”\n\n` +
          `Motivo: ${motivo.trim() || "(sin motivo)"}\n\nRevísalo en la app: Chat → Mensajes reportados.`,
      }).catch((err) => console.warn("No se pudo avisar del reporte por email:", err));
      toast("Reporte enviado. La academia lo revisa en menos de 24 horas.");
      return;
    }
    const bloquearBtn = e.target.closest("[data-action='bloquear-usuario']");
    if (bloquearBtn) {
      const nombre = bloquearBtn.dataset.nombre;
      if (!confirm(`¿Bloquear a ${nombre}? Dejarás de ver sus mensajes. Lo puedes deshacer en Mi cuenta.`)) return;
      await Store.bloquear(bloquearBtn.dataset.id, nombre);
      toast(`Bloqueaste a ${nombre}`);
      return void render();
    }
    const desbloquearBtn = e.target.closest("[data-action='desbloquear-usuario']");
    if (desbloquearBtn) {
      await Store.desbloquear(desbloquearBtn.dataset.id);
      toast("Usuario desbloqueado");
      return void render();
    }
    const borrarMsgBtn = e.target.closest("[data-action='borrar-mensaje']");
    if (borrarMsgBtn) {
      if (!confirm("¿Eliminar este mensaje para todos? No se puede deshacer.")) return;
      await Store.borrarMensaje(borrarMsgBtn.dataset.id);
      if (borrarMsgBtn.dataset.reporte) await Store.cerrarReporte(borrarMsgBtn.dataset.reporte);
      toast("Mensaje eliminado");
      return void render();
    }
    const cerrarReporteBtn = e.target.closest("[data-action='cerrar-reporte']");
    if (cerrarReporteBtn) {
      await Store.cerrarReporte(cerrarReporteBtn.dataset.id);
      toast("Reporte marcado como revisado");
      return void render();
    }

    const solicitudBtn = e.target.closest("[data-action='solicitud-estado']");
    if (solicitudBtn) {
      if (solicitudBtn.dataset.estado === "confirmada") {
        const s = Store.solicitudes().find((x) => x.id === solicitudBtn.dataset.id);
        // si esta misma cuenta ya tiene un alumno con el mismo nombre, seguro
        // es una solicitud duplicada (se manda dos veces por error) — avisar
        // antes de crear otro alumno de la nada para la misma persona.
        const nombreNorm = s.nombre.trim().toLowerCase();
        const yaExiste = Store.alumnos().some((al) => al.nombre.trim().toLowerCase() === nombreNorm);
        if (yaExiste && !confirm(
          `Ya existe un alumno registrado como "${s.nombre}". Si esta solicitud es de la misma persona ` +
          `(mandada dos veces por error), tocá Cancelar y rechazala en vez de confirmarla.\n\n` +
          `¿Confirmar de todas formas y dar de alta a otro alumno con el mismo nombre?`
        )) return render();
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
    const bajaBtn = e.target.closest("[data-action='dar-de-baja']");
    if (bajaBtn) {
      if (!confirm(`${bajaBtn.dataset.nombre} deja de aparecer en el roster y en los avisos de pago. Su historial no se borra y se puede reactivar cuando quieras. ¿Dar de baja?`)) return;
      await Store.cambiarActivo(bajaBtn.dataset.id, false);
      toast(`${bajaBtn.dataset.nombre} dado de baja`);
      render();
    }
    const reactivarBtn = e.target.closest("[data-action='reactivar-alumno']");
    if (reactivarBtn) {
      await Store.cambiarActivo(reactivarBtn.dataset.id, true);
      toast(`${reactivarBtn.dataset.nombre} reactivado`);
      render();
    }
    const activarHabitosBtn = e.target.closest("[data-action='activar-habitos-premium']");
    if (activarHabitosBtn) {
      await Store.cambiarHabitosPremium(activarHabitosBtn.dataset.id, true);
      toast(`Hábitos Premium activado para ${activarHabitosBtn.dataset.nombre}`);
      render();
    }
    const quitarHabitosBtn = e.target.closest("[data-action='quitar-habitos-premium']");
    if (quitarHabitosBtn) {
      if (!confirm(`${quitarHabitosBtn.dataset.nombre} deja de poder subir hábitos nuevos. Lo que ya subió no se borra. ¿Quitar Hábitos Premium?`)) return;
      await Store.cambiarHabitosPremium(quitarHabitosBtn.dataset.id, false);
      toast(`Hábitos Premium desactivado para ${quitarHabitosBtn.dataset.nombre}`);
      render();
    }
  } catch (err) {
    toast(errMsg(err));
    render();
  }
});

init();
