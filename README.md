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

Panel · Check-in (foto + email a Millán) · Evidencias (el alumno sube
foto de que hizo lo que se le pidió: gym, comidas del plan de
nutrición, etc.) · Alumnos · Agenda · Clases de prueba · Inscripciones
(desde el botón "Inscribirme" del sitio) · Objetivos de profes (por
categoría, lo ven alumnos y profes) · Reportes (táctica / técnica /
físico + comentarios) · Pagos · Dueños (financiero, punto de
equilibrio, pagos pendientes, eliminar alumnos) · Chat (vista previa).

## Estado actual — qué es real y qué es demo

- El **sitio público** (`index.html`) es contenido real, con los precios
  reales de Millán, listo para mostrarse.
- El **panel** (`app/`) ahora pide **login real** (Supabase Auth) para
  entrar a todo, sin excepción — incluido reservar una clase de prueba
  o inscribirse/pagar. Ver el sitio público (`index.html`) no pide
  cuenta; el login aparece recién cuando tocan "Reservar clase de
  prueba" o "Inscribirme".
- **La mayoría de los datos siguen en el navegador (`localStorage`) de
  quien los carga**, no en un servidor compartido — si Millán y un profe
  entran cada uno desde su celular, cada uno ve su propia copia de
  alumnos/agenda/pagos. Las excepciones son **solicitudes** e
  **inscripciones**, que ya viven en Supabase y sí se comparten de
  verdad. Migrar el resto es la siguiente etapa.
- **Todavía no hay roles/permisos** (dueño vs. profe) — cualquiera con una
  cuenta ve todo, incluida la sección "Dueños". Se puede afinar más
  adelante con la tabla `perfiles` que ya está en el esquema.
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

## Supabase — estado actual

Ya está conectado (`assets/js/supabase-client.js`). Lo que falta para que
funcione del todo:

⚠️ Si ya habías corrido `schema.sql` antes, **volvé a correrlo** — se
agregó la tabla `evidencias` (con su bucket de fotos) y cambió el
permiso de "solicitudes" e "inscripciones": antes cualquiera podía
enviarlas sin cuenta, ahora piden estar logueado, igual que el resto.
Correrlo de nuevo no borra nada de lo que ya tenías.

### 1. Crear las tablas (una sola vez)

1. Entrar al proyecto en supabase.com → menú izquierdo → **SQL Editor**.
2. **New query**.
3. Abrir [`supabase/schema.sql`](supabase/schema.sql) de este repo, copiar
   todo el contenido y pegarlo ahí.
4. Click **Run**.

Se puede volver a correr sin problema si hace falta (no borra datos que ya
existan).

### 2. Crear las cuentas del staff (Millán + cada profe)

Ahora se pueden crear solos desde la propia pantalla de login del panel
(`app/`) → **"¿No tienes cuenta? Crea una"** → nombre, correo, teléfono,
país y contraseña.

Para que puedan entrar de una, sin tener que confirmar el correo:

1. En Supabase → **Authentication → Sign In / Providers → Email**.
2. Apagar **"Confirm email"**.
3. Guardar.

Si se deja prendido (es lo que trae por default), después de crear la
cuenta le va a pedir confirmar el correo antes de poder iniciar sesión.

### 3. Promover a Millán a "dueño" (una sola vez)

Al registrarse, toda cuenta nueva entra como **"alumno"** por default (o
"profe" si elige esa opción al crear la cuenta) — nadie se puede dar a sí
mismo el rol de dueño, ni siquiera Millán. Después de que Millán se
registre normalmente desde la app, promovelo a mano:

1. Supabase → **Table Editor** → tabla **perfiles**.
2. Buscá la fila con su correo.
3. Editá la columna **rol** → cambiala a `dueño` (con la ñ).
4. Guardá.

La próxima vez que Millán entre (o recargue), va a ver la sección
"Dueños" en el menú. El resto de las cuentas (profes y alumnos/papás)
no la ven — y si escriben la URL a mano, la app les muestra "acceso
restringido".

⚠️ **Importante — lo que todavía NO distingue por rol:** hoy "profe" y
"alumno" ven exactamente el mismo panel (alumnos, agenda, pagos, etc.),
porque esos datos todavía viven en el navegador de cada uno, no en
Supabase — separarlos de verdad (que un alumno solo vea sus propios
datos) es la siguiente etapa. Por ahora, tratá el link de registro como
algo que compartís con gente de confianza, no como un botón público del
sitio.

### Qué quedó conectado a Supabase (comparte datos entre celulares) vs. qué sigue local

- ✅ **Solicitudes de clase de prueba** e **Inscripciones** — ya viven en
  Supabase. Cualquiera que llene esos formularios (con o sin cuenta) y
  cualquier miembro del staff logueado (desde cualquier celular) ve lo
  mismo.
- 🔒 **Todo el resto del panel** (alumnos, bitácora, agenda, pagos,
  check-ins, objetivos de profes) ahora **requiere haber iniciado
  sesión**, pero los datos en sí siguen guardados en el navegador de
  quien los carga — todavía no están compartidos. Es la siguiente parte
  de la migración.
- 💬 **Chat**: sigue siendo solo una vista previa.

## Actualizar el sitio

```bash
git add -A && git commit -m "cambios" && git push
```

Se reconstruye solo en GitHub Pages, mismo link, en ~1 minuto.
