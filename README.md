# Millán Academy — sitio + app

Marca real de Millán Academy (academia de porteros, sedes Polanco y Metepec),
tomada de su PDF de identidad: fondo negro, verde `#7CC26B`, tipografía
técnica en bloques (Chakra Petch + Barlow).

**Sitio en vivo:** https://lucbir06-droid.github.io/muestras-plataforma/

## Cómo está armado

- **Sitio público** (`index.html`): información de la academia (historia,
  entrenadores, planes y precios, sedes). Se ve sin cuenta. Arriba siempre
  están los botones **Iniciar sesión / Crear cuenta**.
- **App** (`app/`): todo lo funcional. **Solo se entra con cuenta.** Tiene tres
  roles y cada uno ve únicamente lo suyo.

```
index.html               sitio público
app/index.html            la app (login, registro y paneles por rol)
assets/css/brand.css       tokens de marca + componentes compartidos
assets/css/app.css         layout y componentes de la app
assets/js/app.js           router, roles y todas las pantallas
assets/js/store.js         datos (Supabase) con copia en memoria
assets/js/planes.js        precios y (cuando existan) links de pago de Mercado Pago
assets/js/supabase-client.js  conexión a Supabase
supabase/schema.sql        tablas, roles y permisos (se pega en Supabase)
supabase/functions/notificar-email/  aviso por email a Millán (Resend, ver abajo)
mockups/index.html        las 4 muestras de estilo originales (archivo)
```

Sin build ni framework: HTML/CSS/JS plano, se edita y se sube a GitHub.

## Los tres roles

| Rol | Qué ve |
|---|---|
| **Dueño** (Millán) | Todo: finanzas, pagos, altas y bajas de alumnos, aprobar profes, todos los check-ins. |
| **Profe** | Sus alumnos, agenda, **asistencia**, **check-in / check-out**, reportes, objetivos, clases de prueba, evidencias de sus alumnos. |
| **Alumno / papá** | Solo lo suyo: su panel, **evidencias** (gym, comidas), agenda, clases de prueba, reportes que le dejan los profes, **estado de su suscripción**, chat. |

Esto no es solo esconder botones: los permisos están **en la base de datos**
(`supabase/schema.sql`, sección "Permisos"), así que aunque alguien modifique la
página no puede leer datos de otros.

### Cómo se ligan los papás / alumnos a su alumno

1. El dueño da de alta al alumno → la ficha muestra un **código** de 8 caracteres.
2. El papá crea su cuenta (elige "Soy alumno o papá/mamá"), entra y escribe
   ese código en **"Vincula a tu alumno"**.
3. Desde ese momento ve la agenda, reportes y suscripción de ese alumno.
   (Un papá con dos hijos vincula los dos códigos.)

No depende de que el correo esté confirmado, así que nadie puede "adivinar"
el correo de otra familia para ver sus datos.

### Cómo se elige el rol al registrarse

Al crear la cuenta, cada persona elige **"Soy…"**:

| Elige | Qué pasa |
|---|---|
| **Alumno o papá/mamá** | Entra al instante como alumno. Lo primero que ve es "reservar clase de prueba" — en cuanto el dueño la confirma, se desbloquea el resto de la app (ver "Cómo se activa una cuenta de alumno" abajo). |
| **Profe** | Solo entra si escribe el **código de profe** que le dio el dueño. Sin el código correcto, el registro se rechaza (igual que con "Dueño" — ya no existe el modo "queda pendiente de aprobación"). |
| **Dueño** | Solo entra si escribe el **código de dueño**. Sin el código correcto, el registro se rechaza. |

Los códigos evitan que cualquiera se ponga "dueño" desde el sitio y vea las
finanzas. Se cargan **una sola vez** (ver "Puesta en marcha", paso 2) y **no
están en este repositorio** porque es público.

El dueño puede cambiar el rol de cualquier cuenta en **Dueños → Cuentas y
roles**, y en la ficha de cada alumno elige qué profe lo tiene a cargo (cada
profe ve solo a los suyos y a los "sin asignar").

## Lo nuevo de esta versión

- **Asistencia**: el profe marca quién asistió a cada entrenamiento (sede + fecha);
  queda el historial por día y por alumno.
- **Check-out del profe**: al terminar, marca asistencia, escribe el **reporte de
  cada alumno** y lo envía. Los reportes le llegan a cada alumno/papá en su panel y
  Millán recibe el resumen por email (ver "Aviso por email" más abajo).
- **Evidencias**: el alumno sube foto de que hizo lo que se le pidió (gym,
  comidas del plan de nutrición…), asociada a su ficha.
- **Datos compartidos de verdad**: alumnos, bitácora, agenda, pagos, asistencia,
  check-ins y evidencias viven en Supabase (antes vivían en el navegador de cada quien).
- **Dar de baja**: el dueño puede dar de baja a un alumno desde su ficha (deja de
  aparecer en el roster, asistencia y avisos de pago) sin borrar su historial — y
  reactivarlo cuando quiera. Para borrarlo de verdad (irreversible) sigue existiendo
  "Eliminar" en Dueños → Todos los alumnos.
- **Monto a pagar**: el dueño puede avisarle a un alumno, desde su ficha, cuánto le
  toca pagar — queda como "Pago pendiente" y el alumno lo ve al instante en su
  suscripción con el monto exacto.
- **Recordatorio de pago por email al alumno**: aparte del resumen que recibe
  Millán, cada alumno/papá recibe un correo directo (al correo que registraron)
  cuando faltan **5 días** y cuando faltan **3 días** para su fecha de corte.
- **Hábitos Premium**: reemplaza lo que era "Evidencias" — add-on pago de $349
  MXN/mes (aparte de la mensualidad) para subir entrenamiento, recuperación y
  nutrición. Solo quien lo tiene activo puede subir hábitos nuevos; el dueño lo
  activa desde la ficha del alumno cuando confirma el cobro. Falta pegar el link
  de la suscripción de Mercado Pago (ver `assets/js/planes.js`).
- **Chat por sede + división**: los canales de categoría ahora son uno por
  cada combinación real de sede y división (ej. "Polanco · 1ra", "Metepec ·
  3ra") en vez de un solo canal compartido entre las dos sedes. El staff ve
  los 6; un alumno/papá solo ve el (o los) que coinciden con la sede y
  división de su propio alumno — ninguno hasta que el dueño le asigne
  división. Si el alumno entrena en las dos sedes, ve los dos canales.
- **Un alumno puede tener más de una sede**: por ejemplo, uno que entrena en
  Polanco y en Metepec — ya no hace falta darlo de alta dos veces. La misma
  división aplica en las dos (Polanco solo llega a 2da, así que un alumno de
  3ra/4ta en Metepec no se le puede sumar Polanco). El dueño agrega o quita
  sedes desde la ficha del alumno, igual que el profe a cargo o la división.

## Puesta en marcha (una sola vez)

### 1. Correr el esquema en Supabase

1. supabase.com → tu proyecto → **SQL Editor** → **New query**.
2. Pegar **todo** [`supabase/schema.sql`](supabase/schema.sql) → **Run**.

Se puede volver a correr las veces que haga falta: no borra datos y deja los
permisos siempre como dice el archivo. **Hay que volver a correrlo cada vez que
cambie ese archivo** (esta versión lo cambió bastante).

### 2. Crear los códigos de dueño y de profe (una sola vez)

En Supabase → **SQL Editor** → **New query**, pega esto **cambiando los textos por
códigos que solo tú y Millán conozcan** (largos, con letras y números; no los
compartas ni los subas a GitHub):

```sql
insert into public.secretos (clave, valor) values
  ('codigo_dueno', 'CAMBIA-ESTE-CODIGO-DE-DUENO'),
  ('codigo_profe', 'CAMBIA-ESTE-CODIGO-DE-PROFE')
on conflict (clave) do update set valor = excluded.valor;
```

- **Código de dueño**: se lo das solo a quien deba tener acceso total (Millán y, si
  quieren, Daniel y Eduardo). Sin este código configurado, nadie puede registrarse
  como dueño.
- **Código de profe**: se lo das a tus profes para que entren directo. Si prefieres
  aprobar a cada profe a mano, no lo configures: entrarán como pendientes.
- Para **cambiar** un código (por ejemplo, si se filtra), corre el mismo SQL con el
  valor nuevo. Las cuentas que ya existen no se ven afectadas.

Después, Millán abre la app → **Crear cuenta** → **Soy… Dueño** → escribe el código.

(Alternativa manual: registrarse como alumno y, en Table Editor → `perfiles`,
cambiar `rol` a `dueño` con ñ.)

### 3. (Opcional) Confirmación de correo

No es necesaria para la seguridad de los datos. Si se quiere que entren sin
confirmar el correo: Supabase → **Authentication → Sign In / Providers → Email** →
apagar **"Confirm email"**.

### 4. Aviso por email de los check-ins / check-outs / cuentas nuevas

Se manda con [Resend](https://resend.com) a través de una Edge Function de Supabase
(`supabase/functions/notificar-email/`) — la Access Key de Resend nunca toca el
navegador, vive como secret del proyecto. Puesta en marcha (una sola vez):

1. Cuenta gratis en resend.com → **Domains → Add Domain** → agregar
   `millanacademy.com` (o un subdominio tipo `mail.millanacademy.com`).
2. Pegar los registros DNS (TXT/CNAME) que da Resend en Cloudflare, y esperar a
   que el dominio quede **"Verified"**.
3. Crear una **API Key** en Resend y guardarla en Supabase → **Edge Functions →
   Secrets**, con el nombre `RESEND_API_KEY`.
4. Pegar el código de `supabase/functions/notificar-email/index.ts` en Supabase →
   **Edge Functions → Create function** (nombre: `notificar-email`) y publicar —
   no hace falta instalar la CLI de Supabase.
5. Revisar en ese mismo archivo que `TO_MILLAN` tenga el correo real de Millán y
   `FROM` use el dominio que verificaste.

Por qué Resend y no un formulario tipo Web3Forms/EmailJS: todos esos bloquean
adjuntar la foto del check-in detrás de un plan pago ("Pro feature"). Resend es
gratis hasta 3,000 correos/mes y sí manda adjuntos, pero por eso necesita esta
función intermedia en vez de un simple `fetch` desde el navegador.

### 5. Avisos de pago automáticos (sin depender de que alguien abra la app)

El resumen de pagos para Millán y los recordatorios a los alumnos (5 y 3 días
antes de su fecha de corte) normalmente se revisan cuando el dueño abre el
panel — si nadie entra ese día, ese aviso puntual se pierde. Para que corra
solo, todos los días, sin que nadie tenga que entrar:

1. Pegar `supabase/functions/revisar-avisos-pago/index.ts` en Supabase → **Edge
   Functions → Create function** (nombre: `revisar-avisos-pago`) y publicar.
2. Supabase → **Database → Cron Jobs → New Job**:
   - Tipo: **Supabase Edge Function**
   - Función: `revisar-avisos-pago`
   - Horario: una vez al día (ej. `0 15 * * *` = todos los días a las 9am hora
     de México — ajustar según el huso horario que use el proyecto).

Las dos versiones (la del panel y la del Cron) comparten la misma tabla de
"ya se avisó", así que nunca se manda el mismo aviso dos veces aunque las dos
corran el mismo día.

### 6. Cobrar con Mercado Pago

Crear un **Link de pago** por plan en Mercado Pago (Cobrar → Link de pago, con el
precio real) y pegarlo en `assets/js/planes.js`, en el `linkPago` del plan. Los
planes sin link mandan a la inscripción manual.

Para **Hábitos Premium** (cobro recurrente, no un pago único) hace falta un
**plan de suscripción** en vez de un link de pago normal: Mercado Pago → Tu
negocio → Suscripciones → Crear plan de suscripción, $349 MXN mensual. Pegar
el link en `assets/js/planes.js`, en `HABITOS_PREMIUM.linkPago`. Mientras esté
vacío se muestra el precio pero el alumno no puede pagar todavía; el dueño
igual puede activarlo a mano desde la ficha del alumno (Dar de baja y Activar
Hábitos Premium están en el mismo lugar).

### 7. Eliminar cuenta y notificaciones push (app del teléfono)

Las dos van por Edge Functions de Supabase, igual que los correos (pegar el
código en Supabase → **Edge Functions → Create function** y publicar):

- `supabase/functions/eliminar-cuenta/` — la usa el botón **Mi cuenta →
  Eliminar mi cuenta** (Apple lo exige). No necesita secrets.
- `supabase/functions/enviar-push/` — manda las notificaciones al iPhone
  (mensaje nuevo en el chat, recordatorio de pago). Necesita tres secrets:
  `APNS_KEY_P8`, `APNS_KEY_ID` y `APNS_TEAM_ID`, que salen de una llave de
  notificaciones creada en developer.apple.com → **Keys** (ver el encabezado
  del archivo).

Antes hay que volver a correr `supabase/schema.sql` en el SQL Editor: agrega
la tabla `dispositivos`, donde se guarda qué teléfono es de cada cuenta.

### 8. Pagos de Mercado Pago que se registran solos

- `supabase/functions/crear-pago-mp/` — el botón "Pagar con Mercado Pago" del
  panel crea un cobro ligado al alumno.
- `supabase/functions/webhook-mp/` — Mercado Pago avisa cuando se aprueba y el
  pago queda registrado como pagado, con la nueva fecha de corte. Esta función
  va con **"Verify JWT" apagado** (la llama Mercado Pago, no un usuario).

Las dos necesitan el secret `MP_ACCESS_TOKEN` (Mercado Pago → Tu negocio →
Configuración → Credenciales de producción → Access Token) y volver a correr
`supabase/schema.sql`. Los precios están repetidos en `crear-pago-mp`: si
cambian en `assets/js/planes.js`, hay que cambiarlos también ahí.

Mientras no esté conectado, el botón usa el link fijo de siempre y el dueño
registra el pago a mano en **Pagos → Registrar un pago recibido**.

## App Store y Google Play

Ya está armado el proyecto de la app nativa en [`mobile/`](mobile/) (con
[Capacitor](https://capacitorjs.com/) — envuelve el panel `app/` tal cual, sin
reescribir nada). Ver [`mobile/README.md`](mobile/README.md) para los pasos de
compilar/abrir cada plataforma.

- **Android**: se compila directo en Windows con Android Studio (gratis).
  Cuenta de Google Play: **25 USD, pago único**. Más flexible que Apple con
  revisiones.
- **Apple**: pide cuenta de desarrollador (**99 USD/año**) y una Mac con Xcode
  para compilar — si no hay Mac, se puede compilar en la nube con
  [Codemagic](https://codemagic.io) sin tocar una. Suele rechazar apps que son
  "solo una página web": conviene sumar notificaciones push antes de publicar.

Los pagos dentro de la app tienen reglas de las tiendas (Apple/Google cobran
comisión por compras digitales dentro de la app); las clases presenciales y
servicios físicos suelen quedar fuera de esa regla, pero conviene revisarlo antes
de publicar.

## Lo que sigue

- **Chat real** por categoría y mensajes directos a un profe (hoy es vista previa).
- Suscripción con cobro automático (domiciliación) vía Mercado Pago.
- PWA / empaquetado para tiendas.

## Actualizar el sitio

```bash
git add -A && git commit -m "cambios" && git push
```

Se reconstruye solo en GitHub Pages, mismo link, en ~1 minuto.
