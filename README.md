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
assets/js/config.js        Access Key de Web3Forms (aviso por email a Millán)
assets/js/supabase-client.js  conexión a Supabase
supabase/schema.sql        tablas, roles y permisos (se pega en Supabase)
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
  Millán recibe el resumen (por email si está conectado Web3Forms).
- **Evidencias**: el alumno sube foto de que hizo lo que se le pidió (gym,
  comidas del plan de nutrición…), asociada a su ficha.
- **Datos compartidos de verdad**: alumnos, bitácora, agenda, pagos, asistencia,
  check-ins y evidencias viven en Supabase (antes vivían en el navegador de cada quien).

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

### 4. Aviso por email de los check-ins / check-outs

Ver `assets/js/config.js` (Access Key gratis de web3forms.com con el correo de Millán).

### 5. Cobrar con Mercado Pago

Crear un **Link de pago** por plan en Mercado Pago (Cobrar → Link de pago, con el
precio real) y pegarlo en `assets/js/planes.js`, en el `linkPago` del plan. Los
planes sin link mandan a la inscripción manual.

## App Store y Google Play

La app web se puede empaquetar para las tiendas (por ejemplo con Capacitor) sin
reescribirla. Lo que hay que tener en cuenta:

- **Apple** pide cuenta de desarrollador (**99 USD/año**), un Mac con Xcode para
  compilar, y suele rechazar apps que son "solo una página web": conviene que
  tenga funciones propias (notificaciones, cámara, etc.).
- **Google Play** pide cuenta (**25 USD, pago único**) y es más flexible.
- Antes de eso, primero se hace instalable como **PWA** (ícono en la pantalla de
  inicio), que ya da mucho de la experiencia de app.

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
