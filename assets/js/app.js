import { Store } from "./store.js";
import { WEB3FORMS_ACCESS_KEY } from "./config.js";
import { PLANES, fmtMXN, encontrarDuracion } from "./planes.js";
import { sb } from "./supabase-client.js";

// Todo el panel pide haber iniciado sesión — incluidas reservar una
// clase de prueba e inscribirse/pagar. Si en algún momento se quiere
// dejar alguna pantalla sin login, se agrega su ruta acá.
const RUTAS_PUBLICAS = [];

/* =========================================================
   Millán Academy — panel interno
   Router por hash + render manual. Sin build, sin framework:
   así se puede editar directo en GitHub sin instalar nada.
   ========================================================= */

const view = document.getElementById("view");
const pageTitle = document.getElementById("pageTitle");
const sidenav = document.getElementById("sidenav");

const NAV = [
  { path: "/", label: "Panel", icon: "i-dashboard" },
  { path: "/checkin", label: "Check-in", icon: "i-camera", countKey: "checkinsError" },
  { path: "/evidencias", label: "Evidencias", icon: "i-task" },
  { path: "/alumnos", label: "Alumnos", icon: "i-users" },
  { path: "/agenda", label: "Agenda", icon: "i-calendar" },
  { path: "/clases-prueba", label: "Clases de prueba", icon: "i-play", countKey: "solicitudesPendientes" },
  { path: "/inscribirse", label: "Inscripciones", icon: "i-check", countKey: "inscripcionesPendientes" },
  { path: "/profes", label: "Objetivos de profes", icon: "i-target" },
  { path: "/reportes", label: "Reportes", icon: "i-chart" },
  { path: "/pagos", label: "Pagos", icon: "i-card", countKey: "pagosPendientes" },
  { path: "/duenos", label: "Dueños", icon: "i-shield" },
  { path: "/chat", label: "Chat", icon: "i-chat" },
];

const TIPOS_SESION = ["Entrenamiento individual", "Análisis de video", "Preparación física", "Clase de prueba", "Diagnóstico"];
const TIPOS_SLOT = [
  { tipo: "Diagnóstico", duracion: 20 },
  { tipo: "Clase de prueba", duracion: 45 },
  { tipo: "Entrenamiento individual", duracion: 60 },
];
const SEDES_AGENDA = [...Store.SEDES, "Online"];
const METODOS_PAGO = ["Mercado Pago", "Stripe", "PayPal", "Wise", "Efectivo", "Transferencia"];

/* ---------------- helpers ---------------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short" });
}
function fmtDateLong(iso) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtMoney(amount, currency) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}
function daysAgo(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
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
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}
function alumnoOptions(selectedId) {
  return Store.alumnos()
    .map((a) => `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${esc(a.nombre)} · ${esc(a.categoria)}</option>`)
    .join("");
}
function avgAvance(alumno) {
  if (!alumno.objetivos?.length) return 0;
  return Math.round(alumno.objetivos.reduce((s, o) => s + o.avance, 0) / alumno.objetivos.length);
}

/* ---------------- router ---------------- */
function currentPath() {
  return location.hash.slice(1) || "/";
}

function render() {
  const path = currentPath();
  renderNav(path);

  let title = "Panel";
  let html = "";

  if (path === "/") {
    title = "Panel";
    html = Dashboard();
  } else if (path === "/checkin") {
    title = "Check-in";
    html = Checkin();
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
  } else if (path.startsWith("/inscribirse")) {
    title = "Inscripciones";
    html = Inscribirse(path);
  } else if (path === "/profes") {
    title = "Objetivos de profes";
    html = Profes();
  } else if (path === "/reportes") {
    title = "Reportes";
    html = Reportes();
  } else if (path === "/pagos") {
    title = "Pagos";
    html = Pagos();
  } else if (path === "/duenos") {
    title = "Panel de dueños";
    html = Duenos();
  } else if (path === "/chat") {
    title = "Chat";
    html = Chat();
  } else {
    title = "No encontrado";
    html = `<div class="empty">No encontramos esa página. <a href="#/" style="color:var(--accent-2)">Volver al panel</a>.</div>`;
  }

  pageTitle.textContent = title;
  view.innerHTML = html;
  window.scrollTo(0, 0);
}

function renderNav(path) {
  const counts = {
    solicitudesPendientes: Store.solicitudes().filter((s) => s.estado === "pendiente").length,
    pagosPendientes: Store.pagos().filter((p) => p.estado === "pendiente").length,
    checkinsError: Store.checkins().filter((c) => c.estado === "error").length,
    inscripcionesPendientes: Store.inscripciones().filter((i) => i.estado === "pendiente de pago").length,
  };
  sidenav.innerHTML = NAV.map((item) => {
    const on = path === item.path || path.startsWith(item.path + "/") || (item.path === "/inscribirse" && path.startsWith("/inscribirse"));
    const count = item.countKey ? counts[item.countKey] : 0;
    return `<a href="#${item.path}" class="${on ? "on" : ""}">${icon(item.icon)}<span>${item.label}</span>${count ? `<span class="badge-count">${count}</span>` : ""}</a>`;
  }).join("");
}

/* ---------------- login / registro / sesión ---------------- */
let session = null;

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
      <p style="font-size:.82rem;color:var(--muted);margin-bottom:18px;">Panel interno · Millán Academy</p>
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
      <p style="font-size:.82rem;color:var(--muted);margin-bottom:18px;">Panel interno · Millán Academy</p>
      ${errorMsg ? `<div class="mp-note" style="border-color:var(--crit);background:var(--crit-soft);margin-bottom:16px;">${esc(errorMsg)}</div>` : ""}
      <form id="authForm">
        <div class="field"><label>Nombre completo</label><input name="nombre" required /></div>
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
    const btn = form.querySelector("button");
    btn.disabled = true;
    const email = form.email.value.trim();
    const password = form.password.value;

    if (form.elements.nombre) {
      // ---- crear cuenta ----
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { nombre: form.nombre.value.trim(), telefono: form.telefono.value.trim(), pais: form.pais.value.trim() } },
      });
      if (error) {
        showSignup(error.message.includes("already registered") ? "Ese correo ya tiene una cuenta — inicia sesión." : error.message);
        return;
      }
      if (!data.session) {
        showLogin(null, "Cuenta creada. Si te pedimos confirmar el correo, revisa tu bandeja de entrada y después inicia sesión aquí.");
      }
      // si ya vino con sesión activa, onAuthStateChange dispara route() solo
    } else {
      // ---- iniciar sesión ----
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) showLogin(error.message.includes("Invalid") ? "Email o contraseña incorrectos." : error.message);
      // si funcionó, onAuthStateChange dispara route() solo
    }
  });
}

async function route() {
  const path = currentPath();
  const esPublica = RUTAS_PUBLICAS.some((r) => path === r || path.startsWith(r));
  const side = document.querySelector(".side");
  const resetBtn = document.getElementById("resetDemo");

  if (!session && !esPublica) {
    side.style.display = "none";
    resetBtn.style.display = "none";
    showLogin();
    return;
  }
  side.style.display = session ? "" : "none";
  resetBtn.style.display = session ? "" : "none";
  view.style.maxWidth = "";
  view.style.padding = "";
  await Store.ready;
  render();
}

async function init() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    route();
  });
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => sb.auth.signOut());
  route();
}

window.addEventListener("hashchange", route);

/* ---------------- views ---------------- */

function Dashboard() {
  const alumnos = Store.alumnos();
  const reservas = Store.reservas();
  const solicitudes = Store.solicitudes();
  const pagos = Store.pagos();

  const proximas = reservas.filter((r) => new Date(r.fecha) >= new Date(new Date().toDateString())).slice(0, 5);
  const pendientes = solicitudes.filter((s) => s.estado === "pendiente").slice(0, 3);
  const pagosPendientes = pagos.filter((p) => p.estado === "pendiente").length;
  const sesionesSemana = reservas.filter((r) => {
    const d = new Date(r.fecha);
    const diff = (d - Date.now()) / 86400000;
    return r.estado === "confirmada" && diff >= 0 && diff <= 7;
  }).length;

  return `
    <div class="stats">
      <div class="card stat"><span class="n">${alumnos.length}</span><span class="l">Alumnos activos</span></div>
      <div class="card stat"><span class="n">${sesionesSemana}</span><span class="l">Sesiones esta semana</span></div>
      <div class="card stat"><span class="n">${solicitudes.filter((s) => s.estado === "pendiente").length}</span><span class="l">Solicitudes pendientes</span></div>
      <div class="card stat"><span class="n">${pagosPendientes}</span><span class="l">Pagos pendientes</span></div>
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
      <div class="block-head"><h3>Alumnos recientes</h3><a href="#/alumnos">Ver todos →</a></div>
      <div class="alumno-grid">
        ${alumnos.slice(0, 4).map(alumnoCard).join("")}
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
  const iniciales = a.avatar || a.nombre.split(" ").map((w) => w[0]).slice(0, 2).join("");
  const top = a.objetivos?.[0];
  return `
    <a class="card alumno-card" href="#/alumnos/${a.id}">
      <div class="top">
        <div class="avatar-sm">${esc(iniciales)}</div>
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

function Checkin() {
  const checkins = Store.checkins();
  return `
    <div class="block">
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">
        Cuando un profe llega a la cancha, se saca una foto aquí mismo desde el celular.
        Queda guardada en el panel y le llega un email a Millán al instante.
      </p>
      <form class="card" data-action="checkin" style="max-width:460px;">
        <div class="field"><label>Nombre del profe</label><input name="nombre" required placeholder="Nombre y apellido" /></div>
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
          <b>Todavía no está conectado el email de Millán.</b> El check-in ya queda
          guardado aquí abajo, pero para que también llegue por email hace falta una
          Access Key gratis de <b>web3forms.com</b> pegada en <code>assets/js/config.js</code>.
        </div>` : ""}
    </div>

    <div class="block">
      <div class="block-head"><h3>Check-ins recientes</h3></div>
      <div class="list">
        ${checkins.length ? checkins.map(checkinRow).join("") : `<div class="empty">Todavía no hay check-ins.</div>`}
      </div>
    </div>
  `;
}

function checkinRow(c) {
  const map = {
    enviando: ["Enviando…", "warn"],
    enviado: ["Millán notificado", "ok"],
    guardado: ["Guardado sin email", "muted"],
    error: ["No se pudo enviar", "crit"],
  };
  const [label, kind] = map[c.estado] || ["", "muted"];
  const iniciales = c.nombre.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const hora = new Date(c.fecha).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  return `
    <div class="row-card">
      ${c.foto
        ? `<img src="${c.foto}" alt="" style="width:44px;height:44px;border-radius:9px;object-fit:cover;flex:none;border:1px solid var(--line);" />`
        : `<div class="avatar-sm">${esc(iniciales)}</div>`}
      <div class="grow">
        <div class="row-title">${esc(c.nombre)} <span style="color:var(--muted);font-weight:500;">· ${esc(c.sede)}</span></div>
        <div class="row-sub">${fmtDate(c.fecha)}, ${hora}</div>
      </div>
      ${badge(label, kind)}
    </div>`;
}

/* -------- fotos: reducir tamaño antes de guardar / mandar -------- */
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
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function handleCheckin(form) {
  const nombre = form.elements.nombre.value.trim();
  const sede = form.elements.sede.value;
  const file = form.elements.foto.files[0];
  if (!nombre || !file) return;

  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  let thumb = null;
  try { thumb = await blobToDataURL(await resizeImage(file, 220, 0.6)); } catch (e) { /* sin preview, no pasa nada */ }

  const record = Store.addCheckin({ nombre, sede, foto: thumb, estado: WEB3FORMS_ACCESS_KEY ? "enviando" : "guardado" });
  render();
  toast("Check-in guardado");

  if (!WEB3FORMS_ACCESS_KEY) return;

  try {
    const uploadBlob = await resizeImage(file, 1400, 0.82);
    const fd = new FormData();
    fd.append("access_key", WEB3FORMS_ACCESS_KEY);
    fd.append("subject", `Check-in — ${nombre} en ${sede}`);
    fd.append("from_name", "Millán Academy · Panel");
    fd.append("message", `${nombre} llegó a la sede ${sede} y subió su foto de check-in.\n\nFecha: ${new Date(record.fecha).toLocaleString("es-MX")}`);
    fd.append("attachment", uploadBlob, "checkin.jpg");
    const res = await fetch("https://api.web3forms.com/submit", { method: "POST", body: fd });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "error");
    Store.updateCheckin(record.id, { estado: "enviado" });
    toast(`Millán fue notificado por email`);
  } catch (err) {
    Store.updateCheckin(record.id, { estado: "error" });
    toast("No se pudo notificar por email — el check-in quedó guardado igual");
  }
  render();
}

const TIPOS_EVIDENCIA = ["Gym", "Nutrición", "Otro"];

function Evidencias() {
  const evidencias = Store.evidencias();
  return `
    <div class="block">
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">
        Acá el alumno sube la prueba de que hizo lo que se le pidió — fue al gym
        tal día, su comida del plan de nutrición, etc. Queda guardado con foto,
        fecha y comentario para que el profe lo revise.
      </p>
      <form class="card" data-action="evidencia" style="max-width:460px;">
        <div class="field"><label>Nombre del alumno</label><input name="alumnoNombre" required placeholder="Nombre y apellido" /></div>
        <div class="field"><label>Tipo</label>
          <select name="tipo">${TIPOS_EVIDENCIA.map((t) => `<option>${t}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Comentario</label><textarea name="comentario" placeholder="Ej. Fui al gym, hice pierna 45 min"></textarea></div>
        <div class="field"><label>Foto</label><input name="foto" type="file" accept="image/*" capture="environment" required /></div>
        <button class="btn btn-primary btn-sm" type="submit">${icon("i-task")} Subir evidencia</button>
      </form>
    </div>

    <div class="block">
      <div class="block-head"><h3>Evidencias recientes</h3></div>
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
  const alumnoNombre = form.elements.alumnoNombre.value.trim();
  const tipo = form.elements.tipo.value;
  const comentario = form.elements.comentario.value.trim();
  const file = form.elements.foto.files[0];
  if (!alumnoNombre || !file) return;

  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  try {
    const fotoBlob = await resizeImage(file, 1280, 0.8);
    await Store.addEvidencia({ alumnoNombre, tipo, comentario, fotoBlob });
    toast("Evidencia subida");
  } catch (err) {
    toast("No se pudo subir la evidencia — revisa tu conexión e intenta de nuevo");
  }
  render();
}

function AlumnosList() {
  const alumnos = Store.alumnos();
  return `
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
            <div class="field"><label>Coach</label>
              <select name="coach">${Store.COACHES.map((c) => `<option>${c}</option>`).join("")}</select>
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
              <select name="periodicidad"><option value="mensual">Mensual</option><option value="anual">Anual</option></select>
            </div>
            <div class="field"><label>Monto recibido</label>
              <input name="monto" type="number" min="0" step="0.01" placeholder="0.00" />
            </div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Agregar alumno</button>
        </form>
      </details>
    </div>

    <div class="alumno-grid">
      ${alumnos.length ? alumnos.map(alumnoCard).join("") : `<div class="empty">Todavía no hay alumnos cargados.</div>`}
    </div>
  `;
}

function AlumnoDetail(id) {
  const a = Store.alumno(id);
  if (!a) return `<div class="empty">No encontramos este alumno. <a href="#/alumnos" style="color:var(--accent-2)">Volver a alumnos</a>.</div>`;

  const bitacora = Store.bitacoraDe(id);
  const reservas = Store.reservas().filter((r) => r.alumnoId === id);
  const proxima = reservas.find((r) => new Date(r.fecha) >= new Date(new Date().toDateString()));
  const iniciales = a.avatar || a.nombre.split(" ").map((w) => w[0]).slice(0, 2).join("");

  return `
    <a href="#/alumnos" style="display:inline-flex;align-items:center;gap:6px;font-size:.78rem;color:var(--muted);margin-bottom:18px;">
      ${icon("i-back")} Todos los alumnos
    </a>

    <div class="card" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:24px;">
      <div class="avatar-sm" style="width:56px;height:56px;font-size:1rem;">${esc(iniciales)}</div>
      <div style="flex:1;min-width:200px;">
        <div class="row-title" style="font-size:1.1rem;">${esc(a.nombre)}</div>
        <div class="row-sub">${esc(a.categoria)} · ${esc(a.sede)} · coach ${esc(a.coach)} · alta hace ${daysAgo(a.alta)} días</div>
        ${a.telefono || a.correo ? `<div class="row-sub" style="margin-top:4px;">${[a.telefono, a.correo].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
        ${a.tallaPlayera ? `<div class="row-sub">Playera: ${esc(a.tallaPlayera)}</div>` : ""}
      </div>
      ${badge(a.moneda, "muted")}
    </div>

    <div class="stats">
      <div class="card stat"><span class="n">${bitacora.length}</span><span class="l">Sesiones registradas</span></div>
      <div class="card stat"><span class="n">${avgAvance(a)}%</span><span class="l">Avance promedio</span></div>
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
      <form class="card" data-action="update-evaluacion" data-alumno="${a.id}">
        <div class="field-row" style="grid-template-columns:1fr 1fr 1fr;">
          <div class="field"><label>Táctica — ${a.evaluacion?.tactica ?? 0}%</label>
            <input type="range" min="0" max="100" name="tactica" value="${a.evaluacion?.tactica ?? 0}"
              oninput="this.previousElementSibling.textContent = this.previousElementSibling.textContent.replace(/—.*/, '— ' + this.value + '%')" />
          </div>
          <div class="field"><label>Técnica — ${a.evaluacion?.tecnica ?? 0}%</label>
            <input type="range" min="0" max="100" name="tecnica" value="${a.evaluacion?.tecnica ?? 0}"
              oninput="this.previousElementSibling.textContent = this.previousElementSibling.textContent.replace(/—.*/, '— ' + this.value + '%')" />
          </div>
          <div class="field"><label>Físico — ${a.evaluacion?.fisico ?? 0}%</label>
            <input type="range" min="0" max="100" name="fisico" value="${a.evaluacion?.fisico ?? 0}"
              oninput="this.previousElementSibling.textContent = this.previousElementSibling.textContent.replace(/—.*/, '— ' + this.value + '%')" />
          </div>
        </div>
        <div class="field"><label>Comentarios</label>
          <textarea name="comentarios" placeholder="Impresión general del jugador...">${esc(a.evaluacion?.comentarios || "")}</textarea>
        </div>
        <button class="btn btn-primary btn-sm" type="submit">Guardar ficha</button>
      </form>
    </div>

    <div class="block">
      <div class="block-head"><h3>Registrar sesión</h3></div>
      <form class="card" data-action="add-bitacora" data-alumno="${a.id}">
        <div class="field-row">
          <div class="field"><label>Tipo de sesión</label>
            <select name="tipo">${TIPOS_SESION.map((t) => `<option>${t}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Fecha</label><input type="date" name="fecha" value="${new Date().toISOString().slice(0, 10)}" /></div>
        </div>
        <div class="field"><label>Notas</label><textarea name="nota" placeholder="Qué trabajaron, qué mejoró, qué falta..." required></textarea></div>
        <button class="btn btn-primary btn-sm" type="submit">Guardar en la bitácora</button>
      </form>
    </div>

    <div class="block">
      <div class="block-head"><h3>Bitácora</h3></div>
      ${bitacora.length ? `
        <div class="card timeline">
          ${bitacora.map((b) => `
            <div class="tl-item">
              <div class="tl-date">${fmtDate(b.fecha)}</div>
              <div><span class="tl-kind">${esc(b.tipo)}</span><p>${esc(b.nota)}</p></div>
            </div>`).join("")}
        </div>` : `<div class="empty">Todavía no hay sesiones registradas.</div>`}
    </div>

    ${reservas.length ? `
      <div class="block">
        <div class="block-head"><h3>Reservas</h3></div>
        <div class="list">${reservas.map(reservaRow).join("")}</div>
      </div>` : ""}

    <div class="block">
      <div class="block-head"><h3>Evidencias</h3><a href="#/evidencias">Subir nueva →</a></div>
      ${(() => {
        const evidenciasAlumno = Store.evidenciasDe(a.nombre);
        return evidenciasAlumno.length
          ? `<div class="list">${evidenciasAlumno.map(evidenciaRow).join("")}</div>`
          : `<div class="empty">Todavía no subió evidencias.</div>`;
      })()}
    </div>
  `;
}

function Agenda() {
  const reservas = Store.reservas();
  const byDay = {};
  reservas.forEach((r) => {
    const key = r.fecha.slice(0, 10);
    (byDay[key] ||= []).push(r);
  });
  const days = Object.keys(byDay).sort();

  return `
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
              <select name="tipo">${TIPOS_SLOT.map((t) => `<option value="${t.tipo}" data-dur="${t.duracion}">${t.tipo} · ${t.duracion} min</option>`).join("")}</select>
            </div>
            <div class="field"><label>Sede</label>
              <select name="sede">${SEDES_AGENDA.map((s) => `<option>${s}</option>`).join("")}</select>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Abrir hueco</button>
        </form>
      </details>
    </div>

    ${days.length ? days.map((day) => `
      <div class="agenda-day">
        <h4>${fmtDateLong(day)}</h4>
        ${byDay[day].sort((a, b) => a.hora.localeCompare(b.hora)).map(slotRow).join("")}
      </div>
    `).join("") : `<div class="empty">No hay horarios cargados todavía.</div>`}
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
      ${disponible ? `
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

function ClasesPrueba() {
  const solicitudes = Store.solicitudes();
  return `
    <div class="block">
      <div class="block-head"><h3>Formulario de solicitud</h3></div>
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">
        Este es el formulario que verían las familias interesadas en una clase de prueba
        (por ahora vive dentro del panel; más adelante se puede publicar en el sitio o
        embeberse en redes).
      </p>
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
    </div>

    <div class="block">
      <div class="block-head"><h3>Solicitudes recibidas</h3></div>
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
      ${s.estado === "pendiente" ? `
        <div class="row-actions">
          <button class="btn btn-primary btn-sm" data-action="solicitud-estado" data-id="${s.id}" data-estado="confirmada">Confirmar</button>
          <button class="btn btn-ghost btn-sm" data-action="solicitud-estado" data-id="${s.id}" data-estado="rechazada">Rechazar</button>
        </div>
      ` : estadoBadge(s.estado)}
    </div>`;
}

function Reportes() {
  const alumnos = Store.alumnos();
  return `
    <div class="list">
      ${alumnos.map((a) => {
        const ev = a.evaluacion || { tactica: 0, tecnica: 0, fisico: 0 };
        return `
        <a class="card row-card" href="#/alumnos/${a.id}" style="align-items:flex-start;">
          <div class="avatar-sm">${esc(a.avatar || "")}</div>
          <div class="grow">
            <div class="row-title">${esc(a.nombre)} <span style="color:var(--muted);font-weight:500;">· ${esc(a.categoria)} · ${esc(a.sede)}</span></div>
            <div style="margin-top:10px;display:grid;gap:8px;max-width:420px;">
              <div class="goal" style="margin:0;"><div class="rowline"><span>Táctica</span><em>${ev.tactica}%</em></div><div class="track"><div class="fill" style="width:${ev.tactica}%"></div></div></div>
              <div class="goal" style="margin:0;"><div class="rowline"><span>Técnica</span><em>${ev.tecnica}%</em></div><div class="track"><div class="fill" style="width:${ev.tecnica}%"></div></div></div>
              <div class="goal" style="margin:0;"><div class="rowline"><span>Físico</span><em>${ev.fisico}%</em></div><div class="track"><div class="fill" style="width:${ev.fisico}%"></div></div></div>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="row-title tabular">${avgAvance(a)}%</div>
            <div class="row-sub">avance de objetivos</div>
          </div>
        </a>`;
      }).join("")}
    </div>
  `;
}

function Pagos() {
  const pagos = Store.pagos();
  const ingresosMXN = pagos.filter((p) => p.estado === "pagado" && p.moneda === "MXN").reduce((s, p) => s + p.monto, 0);
  const ingresosUSD = pagos.filter((p) => p.estado === "pagado" && p.moneda === "USD").reduce((s, p) => s + p.monto, 0);
  const pendientes = pagos.filter((p) => p.estado === "pendiente").length;

  return `
    <div class="stats">
      <div class="card stat"><span class="n">${fmtMoney(ingresosMXN, "MXN")}</span><span class="l">Ingresos del mes (MXN)</span></div>
      <div class="card stat"><span class="n">${fmtMoney(ingresosUSD, "USD")}</span><span class="l">Ingresos del mes (USD)</span></div>
      <div class="card stat"><span class="n">${pendientes}</span><span class="l">Pagos pendientes</span></div>
    </div>

    <div class="block">
      <div class="block-head"><h3>Planes</h3></div>
      <div class="plans">
        <div class="card plan">
          <div class="row-title">Clase de prueba</div>
          <div class="price">$250 MXN <small>/ $25 USD</small></div>
          <ul><li>Sesión única, 45 minutos</li><li>Presencial u online</li></ul>
        </div>
        <div class="card plan">
          <div class="row-title">Plan mensual</div>
          <div class="price">$4,800 MXN <small>/ $420 USD</small></div>
          <ul><li>8 sesiones al mes</li><li>Bitácora y reportes incluidos</li></ul>
        </div>
        <div class="card plan">
          <div class="row-title">Bono 10 sesiones</div>
          <div class="price">$5,600 MXN <small>/ $600 USD</small></div>
          <ul><li>Sin vencimiento mensual</li><li>Ideal para temporadas cortas</li></ul>
        </div>
      </div>

      <div class="block-head"><h3>Métodos</h3></div>
      <div class="methods">
        ${METODOS_PAGO.map((m) => `<span>${m}</span>`).join("")}
      </div>

      <div class="mp-note">
        <b>Para cobrar de verdad con Mercado Pago</b> hace falta conectar la cuenta del coach
        (clave pública + access token) y un pequeño servicio que genere la preferencia de pago
        — eso todavía no está armado. Por ahora esta pantalla sirve para llevar el registro de
        cobros manuales (efectivo, transferencia) mientras se define qué pasarelas activar.
      </div>
    </div>

    <div class="block">
      <div class="block-head"><h3>Registrar pago</h3></div>
      <form class="card" data-action="add-pago">
        <div class="field-row">
          <div class="field"><label>Alumno</label>
            <select name="alumnoId" required><option value="" disabled selected>Elegir…</option>${alumnoOptions()}</select>
          </div>
          <div class="field"><label>Concepto</label><input name="concepto" required placeholder="Plan mensual · 8 sesiones" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Método</label>
            <select name="metodo">${METODOS_PAGO.map((m) => `<option>${m}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Moneda</label><select name="moneda"><option>MXN</option><option>USD</option></select></div>
        </div>
        <div class="field"><label>Monto</label><input name="monto" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label>Estado</label>
          <select name="estado"><option value="pagado">Pagado</option><option value="pendiente">Pendiente</option></select>
        </div>
        <button class="btn btn-primary btn-sm" type="submit">Registrar</button>
      </form>
    </div>

    <div class="block">
      <div class="block-head"><h3>Movimientos</h3></div>
      <div class="card scrollx">
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
        </table>
      </div>
    </div>
  `;
}

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

function Inscribirse(path) {
  const query = path.includes("?") ? path.split("?")[1] : "";
  const params = new URLSearchParams(query);
  const found = encontrarDuracion(params.get("plan"), params.get("dur"));
  const inscripciones = Store.inscripciones();

  return `
    <div class="block">
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">
        Este es el formulario que ve la familia al tocar "Inscribirme" en el sitio. Si el
        plan ya tiene un link de pago de Mercado Pago conectado (en <code>assets/js/planes.js</code>),
        el botón de la página principal manda directo a pagar; si no, queda como solicitud
        aquí para que Millán la cobre y active la cuenta manualmente.
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
      <div class="block-head"><h3>Inscripciones recibidas</h3></div>
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
        ? `<button class="btn btn-primary btn-sm" data-action="inscripcion-estado" data-id="${i.id}" data-estado="activada">Marcar pagada y activar</button>`
        : badge("Activada", "ok")}
    </div>`;
}

function Profes() {
  const objetivos = Store.objetivosCategoria();
  return `
    <div class="block">
      <p style="font-size:.86rem;color:var(--muted);margin-bottom:16px;max-width:60ch;">
        Lo que cada categoría está trabajando esta semana — lo ven los profes y también
        los alumnos y sus familias.
      </p>
      <form class="card" data-action="add-objetivo-categoria">
        <div class="field-row">
          <div class="field"><label>Categoría</label>
            <select name="categoria">${Store.CATEGORIAS.map((c) => `<option>${c}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Profe</label>
            <select name="profe">${Store.COACHES.map((c) => `<option>${c}</option>`).join("")}</select>
          </div>
        </div>
        <div class="field"><label>Título</label><input name="titulo" required placeholder="Ej. Juego aéreo bajo presión" /></div>
        <div class="field"><label>Detalle</label><textarea name="detalle" placeholder="En qué consiste, qué se busca lograr..."></textarea></div>
        <button class="btn btn-primary btn-sm" type="submit">Publicar objetivo</button>
      </form>
    </div>

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
                <div class="row-sub" style="margin-top:4px;">${esc(o.profe)} · ${fmtDate(o.fecha)}</div>
              </div>
            </div>`).join("") : `<div class="empty">Sin objetivos publicados todavía.</div>`}
        </div>
      </div>`;
    }).join("")}
  `;
}

function Duenos() {
  const alumnos = Store.alumnos();
  const pagos = Store.pagos();
  const ingresosMXN = pagos.filter((p) => p.estado === "pagado" && p.moneda === "MXN").reduce((s, p) => s + p.monto, 0);
  const ingresosUSD = pagos.filter((p) => p.estado === "pagado" && p.moneda === "USD").reduce((s, p) => s + p.monto, 0);
  const pendientes = pagos.filter((p) => p.estado === "pendiente");
  const totalPendienteMXN = pendientes.filter((p) => p.moneda === "MXN").reduce((s, p) => s + p.monto, 0);
  const nuevosDelMes = alumnos.filter((a) => daysAgo(a.alta) <= 30).length;

  const mensualesMXN = pagos.filter((p) => p.moneda === "MXN" && p.periodicidad === "mensual" && p.estado === "pagado");
  const promedioMensual = mensualesMXN.length ? Math.round(mensualesMXN.reduce((s, p) => s + p.monto, 0) / mensualesMXN.length) : 3349;
  const costosFijos = Store.config().costosFijosMXN;
  const puntoEquilibrio = promedioMensual > 0 ? Math.ceil(costosFijos / promedioMensual) : 0;
  const faltan = Math.max(0, puntoEquilibrio - alumnos.length);

  return `
    <div class="mp-note" style="margin-bottom:22px;">
      <b>Sección solo para dueños.</b> Todavía no hay login real — cualquiera que entre al panel
      puede ver esto. Se restringe cuando conectemos el login (ver el README, sección Supabase).
    </div>

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
      <div class="block-head"><h3>Todos los alumnos</h3></div>
      <div class="card scrollx">
        <table class="tbl">
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Sede</th><th>Contacto</th><th></th></tr></thead>
          <tbody>
            ${alumnos.map((a) => `
              <tr>
                <td><a class="rowlink" href="#/alumnos/${a.id}">${esc(a.nombre)}</a></td>
                <td>${esc(a.categoria)}</td>
                <td>${esc(a.sede)}</td>
                <td>${esc(a.telefono || "—")}</td>
                <td><button class="btn btn-ghost btn-sm" data-action="eliminar-alumno" data-id="${a.id}" data-nombre="${esc(a.nombre)}">Eliminar</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function Chat() {
  return `
    <div class="mp-note" style="margin-bottom:22px;">
      <b>Vista previa — todavía no envía mensajes de verdad.</b> El chat en vivo (canales por
      categoría + mensajes directos a un profe) necesita Supabase conectado para que los
      mensajes se vean entre distintos celulares en tiempo real. Así se va a ver una vez armado:
    </div>
    <div class="stats">
      ${Store.CATEGORIAS.map((c) => `
        <div class="card stat" style="text-align:left;">
          <span class="l">${icon("i-chat")} Canal de categoría</span>
          <span class="n" style="font-size:1.05rem;margin-top:6px;">${esc(c)}</span>
        </div>`).join("")}
    </div>
    <div class="block">
      <div class="block-head"><h3>Mensajes directos</h3></div>
      <p style="font-size:.86rem;color:var(--muted);max-width:60ch;">
        Además de los 4 canales por categoría, cada alumno o papá va a poder mandarle un
        mensaje privado a un profe en particular, visible solo para ese profe y el dueño.
      </p>
    </div>
  `;
}

/* ---------------- actions (delegated) ---------------- */
view.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-action]");
  if (!form) return;
  e.preventDefault();
  const action = form.dataset.action;
  if (action === "checkin") {
    handleCheckin(form);
    return;
  }
  if (action === "evidencia") {
    handleEvidencia(form);
    return;
  }
  const data = Object.fromEntries(new FormData(form).entries());

  if (action === "add-alumno") {
    const moneda = data.moneda;
    const a = Store.addAlumno({
      nombre: data.nombre.trim(), categoria: data.categoria, sede: data.sede, coach: data.coach, moneda,
      telefono: data.telefono?.trim() || "", correo: data.correo?.trim() || "", tallaPlayera: data.tallaPlayera,
    });
    if (data.metodoAlta === "Transferencia" && Number(data.monto) > 0) {
      Store.addPago({
        alumnoId: a.id, concepto: `Alta manual · plan ${data.periodicidad}`, metodo: "Transferencia",
        monto: Number(data.monto), moneda, periodicidad: data.periodicidad, estado: "pagado",
      });
      toast(`${a.nombre} agregado y activado (pago por transferencia registrado)`);
    } else {
      toast(`${a.nombre} agregado`);
    }
  } else if (action === "add-bitacora") {
    const alumnoId = form.dataset.alumno;
    Store.addBitacora({ alumnoId, tipo: data.tipo, nota: data.nota.trim(), fecha: new Date(data.fecha || Date.now()).toISOString() });
    toast("Sesión registrada en la bitácora");
  } else if (action === "update-evaluacion") {
    Store.actualizarEvaluacion(form.dataset.alumno, {
      tactica: Number(data.tactica), tecnica: Number(data.tecnica), fisico: Number(data.fisico), comentarios: data.comentarios.trim(),
    });
    toast("Ficha actualizada");
  } else if (action === "generar-horarios") {
    const n = Store.generarHorariosSemana(data.sede, 2);
    toast(n > 0 ? `${n} horarios creados en ${data.sede}` : "Esos horarios ya estaban cargados");
  } else if (action === "add-slot") {
    const tipoInfo = TIPOS_SLOT.find((t) => t.tipo === data.tipo);
    Store.addReserva({ alumnoId: null, fecha: new Date(data.fecha).toISOString(), hora: data.hora, tipo: data.tipo, duracion: tipoInfo?.duracion || 60, sede: data.sede, estado: "disponible" });
    toast("Hueco agregado a la agenda");
  } else if (action === "reservar-slot") {
    if (!data.alumnoId) return;
    Store.reservar(form.dataset.id, data.alumnoId);
    toast("Sesión reservada");
  } else if (action === "add-solicitud") {
    try {
      await Store.addSolicitud({ nombre: data.nombre.trim(), edad: Number(data.edad), telefono: data.telefono.trim(), pais: data.pais.trim(), zona: data.zona.trim(), sede: data.sede, mensaje: data.mensaje?.trim() || "" });
      toast("Solicitud enviada");
    } catch (err) {
      toast("No se pudo enviar — revisa tu conexión e intenta de nuevo");
    }
  } else if (action === "add-pago") {
    Store.addPago({ alumnoId: data.alumnoId, concepto: data.concepto.trim(), metodo: data.metodo, moneda: data.moneda, monto: Number(data.monto), estado: data.estado });
    toast("Pago registrado");
  } else if (action === "inscribirse") {
    const [planId, durId] = data.planDur.split(":");
    const found = encontrarDuracion(planId, durId);
    try {
      await Store.addInscripcion({
        nombre: data.nombre.trim(), telefono: data.telefono.trim(), tallaPlayera: data.tallaPlayera,
        planId, duracionId: durId, planNombre: found?.plan.nombre || planId, duracionLabel: found?.dur.label || durId,
        monto: found?.dur.real || 0, moneda: found?.plan.moneda || "MXN",
      });
      toast("Inscripción enviada — Millán te contacta para confirmar el pago");
    } catch (err) {
      toast("No se pudo enviar — revisa tu conexión e intenta de nuevo");
    }
  } else if (action === "add-objetivo-categoria") {
    Store.addObjetivoCategoria({ categoria: data.categoria, profe: data.profe, titulo: data.titulo.trim(), detalle: data.detalle?.trim() || "" });
    toast("Objetivo publicado");
  } else if (action === "set-costos-fijos") {
    Store.setCostosFijos(Number(data.costos) || 0);
    toast("Costos fijos actualizados");
  }
  render();
});

view.addEventListener("click", async (e) => {
  const solicitudBtn = e.target.closest("[data-action='solicitud-estado']");
  if (solicitudBtn) {
    try {
      await Store.actualizarSolicitud(solicitudBtn.dataset.id, solicitudBtn.dataset.estado);
      toast(solicitudBtn.dataset.estado === "confirmada" ? "Solicitud confirmada" : "Solicitud rechazada");
    } catch (err) { toast("No se pudo actualizar — revisa tu conexión"); }
    render();
    return;
  }
  const inscripcionBtn = e.target.closest("[data-action='inscripcion-estado']");
  if (inscripcionBtn) {
    try {
      await Store.actualizarInscripcion(inscripcionBtn.dataset.id, inscripcionBtn.dataset.estado);
      toast("Inscripción activada");
    } catch (err) { toast("No se pudo actualizar — revisa tu conexión"); }
    render();
    return;
  }
  const eliminarBtn = e.target.closest("[data-action='eliminar-alumno']");
  if (eliminarBtn) {
    if (!confirm(`Esto borra a ${eliminarBtn.dataset.nombre} y no se puede deshacer. ¿Seguro?`)) return;
    Store.eliminarAlumno(eliminarBtn.dataset.id);
    toast(`${eliminarBtn.dataset.nombre} eliminado`);
    render();
  }
});

document.getElementById("resetDemo").addEventListener("click", () => {
  if (!confirm("Esto borra los cambios que hiciste y vuelve a los datos de ejemplo iniciales. ¿Seguir?")) return;
  Store.reset();
  render();
  toast("Datos de ejemplo reiniciados");
});

init();
