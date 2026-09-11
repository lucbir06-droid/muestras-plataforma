# Millán Academy — sitio + panel interno

Marca real de Millán Academy (academia de porteros, CDMX · Metepec · Miami · LA),
tomada de su PDF de identidad: fondo negro, verde `#7CC26B`, tipografía
técnica en bloques (Chakra Petch + Barlow).

**Sitio en vivo:** https://lucbir06-droid.github.io/muestras-plataforma/

## Estructura

```
index.html            sitio público (historia, entrenadores, metodología, sedes)
app/index.html         panel interno: bitácora, agenda, clases de prueba, reportes, pagos
assets/css/brand.css    tokens de marca + componentes compartidos
assets/css/app.css      layout y componentes del panel
assets/js/store.js       datos de ejemplo + guardado en localStorage
assets/js/app.js         router y pantallas del panel
assets/img/              escudo (recortado del PDF de marca) en varios tamaños
mockups/index.html      las 4 muestras de estilo originales (archivo, ya no se usa)
```

No hay build ni framework: todo es HTML/CSS/JS plano, así que se puede editar
cualquier archivo y subirlo directo a GitHub sin instalar nada.

## Estado actual — qué es real y qué es demo

- El **sitio público** (`index.html`) es contenido real, listo para mostrarse.
- El **panel** (`app/`) funciona de verdad en el navegador: agregar alumnos,
  registrar bitácora, abrir/reservar horarios, recibir solicitudes de clase
  de prueba, registrar pagos manuales — pero **todo se guarda en el
  navegador (`localStorage`) de quien lo usa**, no en un servidor. Si dos
  personas lo abren, cada una ve su propia copia; si se borra el caché del
  navegador, se pierde.
- **Pagos con Mercado Pago / Stripe / PayPal todavía no cobran de verdad.**
  La pantalla de Pagos ya tiene el diseño y el registro manual; conectar el
  cobro real requiere la cuenta de Mercado Pago del coach y un pequeño
  servicio (no puede hacerse solo con HTML/JS por seguridad).

## Siguiente etapa (cuando se confirme el diseño)

1. Base de datos real (para que los datos no vivan solo en el navegador).
2. Login básico para el equipo.
3. Conectar Mercado Pago (y Stripe/PayPal para alumnos internacionales).
4. Publicar el formulario de "Clases de prueba" fuera del panel, para el
   sitio público.

## Actualizar el sitio

```bash
git add -A && git commit -m "cambios" && git push
```

Se reconstruye solo en GitHub Pages, mismo link, en ~1 minuto.
