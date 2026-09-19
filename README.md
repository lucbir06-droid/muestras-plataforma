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

### Cómo se aprueba a un profe

Quien se registra como profe entra **como alumno** y queda pendiente. El dueño
lo ve en **Panel → "Profes por aprobar"** (o en la sección Dueños) y lo aprueba
con un botón. Después, en la ficha de cada alumno, el dueño elige qué profe lo
tiene a cargo; cada profe ve solo a los suyos (y a los "sin asignar").

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

### 2. Registrar a Millán y hacerlo "dueño"

1. Millán crea su cuenta desde la app (**Crear cuenta**).
2. Supabase → **Table Editor** → tabla **perfiles** → su fila → columna **rol** →
   escribir `dueño` (con ñ) → guardar.
3. Millán recarga la app: ahora ve todo.

Es el único rol que **no** se puede pedir desde el registro (a propósito).

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
