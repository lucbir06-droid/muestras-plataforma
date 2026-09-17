# Millán Academy — sitio + panel interno

Marca real de Millán Academy (academia de porteros, Polanco · Metepec · Miami ·
LA · Nueva York · París), tomada de su PDF de identidad: fondo negro, verde
`#7CC26B`, tipografía técnica en bloques (Chakra Petch + Barlow).

**Sitio en vivo:** https://lucbir06-droid.github.io/muestras-plataforma/

## Estructura

```
index.html               sitio público (historia, entrenadores, planes y precios, sedes)
app/index.html            panel interno (ver lista de pantallas abajo)
assets/css/brand.css       tokens de marca + componentes compartidos
assets/css/app.css         layout y componentes del panel
assets/js/store.js          datos de ejemplo + guardado en localStorage
assets/js/app.js            router y pantallas del panel
assets/js/planes.js         precios y (cuando existan) links de pago de Mercado Pago
assets/js/config.js         Access Key de Web3Forms (notificación de check-in por email)
assets/img/                 escudo (recortado del PDF de marca) en varios tamaños
mockups/index.html         las 4 muestras de estilo originales (archivo, ya no se usa)
```

No hay build ni framework: todo es HTML/CSS/JS plano, así que se puede editar
cualquier archivo y subirlo directo a GitHub sin instalar nada.

## Pantallas del panel (`app/`)

Panel · Check-in (foto + email a Millán) · Alumnos · Agenda · Clases de
prueba · Inscripciones (desde el botón "Inscribirme" del sitio) · Objetivos
de profes (por categoría, lo ven alumnos y profes) · Reportes (táctica /
técnica / físico + comentarios) · Pagos · Dueños (financiero, punto de
equilibrio, pagos pendientes, eliminar alumnos) · Chat (vista previa).

## Estado actual — qué es real y qué es demo

- El **sitio público** (`index.html`) es contenido real, con los precios
  reales de Millán, listo para mostrarse.
- El **panel** (`app/`) funciona de verdad en el navegador — pero **todo se
  guarda en el navegador (`localStorage`) de quien lo usa**, no en un
  servidor compartido. Si Millán y un profe lo abren cada uno en su celular,
  cada uno ve su propia copia de los datos; esto se resuelve conectando
  Supabase (ver abajo).
- **No hay login/permisos reales todavía.** La sección "Dueños" está
  armada pero cualquiera que entre al panel puede verla — se restringe
  cuando haya login real.
- **El chat es solo una vista previa** — no manda mensajes de verdad
  todavía (necesita Supabase Realtime).
- **Los pagos con tarjeta no cobran solos.** El botón "Elegir plan" del
  sitio manda a un link de pago de Mercado Pago si ya está cargado en
  `assets/js/planes.js`; si no, guarda la inscripción como pendiente para
  que Millán la cobre y la active a mano desde el panel.

## Cómo crear un link de pago de Mercado Pago (sin programar, ~5 min por plan)

1. Entrar a la cuenta de Mercado Pago de Millán → **Cobrar → Link de pago**.
2. Poner el nombre del plan (ej. "Polanco — Mensual") y el precio **real**
   (el que no está tachado).
3. Copiar el link generado.
4. Pegarlo en `assets/js/planes.js`, en el campo `linkPago` del plan y la
   duración que corresponda.
5. Subir el cambio a GitHub (`git add -A && git commit -m "..." && git push`).

Se puede hacer plan por plan — no hace falta tener los 9 links para que
el sitio funcione; los que no tengan link muestran el formulario de
inscripción en su lugar.

## Pasar a una base de datos real (Supabase)

Esto es necesario para: login real con permisos, que todos vean los mismos
datos desde cualquier celular, y el chat en vivo.

1. Entrar a **https://supabase.com** e iniciar sesión con Google (gratis).
2. Crear un proyecto nuevo (elegir una contraseña de base de datos y
   guardarla en un lugar seguro).
3. En el proyecto → **Project Settings → API**, copiar:
   - **Project URL**
   - **anon public key**
4. Pasarme esos dos datos (no hace falta compartir la contraseña de la
   base de datos ni ninguna otra clave).

Con eso puedo conectar el panel a una base de datos compartida de verdad y
armar el login. Es un cambio grande, se hace como una etapa aparte.

## Actualizar el sitio

```bash
git add -A && git commit -m "cambios" && git push
```

Se reconstruye solo en GitHub Pages, mismo link, en ~1 minuto.
