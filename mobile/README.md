# Millán Academy — app nativa (iOS / Android)

Esta carpeta envuelve el **panel interno** (`../app/`) en una app nativa con
[Capacitor](https://capacitorjs.com/). No es un proyecto aparte con su propio
código: reusa tal cual el HTML/CSS/JS de `../app/` y `../assets/`. El sitio
público (`../index.html`) sigue siendo solo web, no forma parte de la app.

## Cómo está armado

```
mobile/
  sync-web.js        copia ../app/index.html + ../assets/ a www/
  www/                (generado, no se sube a git)
  android/             proyecto nativo de Android (sí se sube a git)
  ios/                  proyecto nativo de iOS (sí se sube a git)
  capacitor.config.json
```

Cada vez que se suba un cambio al panel (`app/` o `assets/`), hay que
reflejarlo en la app nativa corriendo:

```bash
npm run sync
```

(copia los archivos de nuevo y sincroniza los proyectos nativos).

## Android — se puede compilar en Windows, sin nada más

1. Instalar **[Android Studio](https://developer.android.com/studio)** (gratis).
   La primera vez que se abre, te ofrece instalar el "Android SDK" — aceptar
   todo lo que sugiere por default.
2. Desde esta carpeta (`mobile/`):
   ```bash
   npm run open:android
   ```
   Esto abre el proyecto en Android Studio. Ahí: **Run ▶** para probarla en un
   emulador o en un celular Android conectado por USB, o **Build → Generate
   Signed Bundle/APK** cuando ya esté lista para subir a Google Play.
3. Ícono de la app: reemplazar las imágenes en
   `android/app/src/main/res/mipmap-*/` (Android Studio tiene un asistente:
   clic derecho en `res` → **New → Image Asset**).

## iOS — necesita una Mac (real o en la nube)

Desde Windows no se puede compilar directo. Las opciones están en el README
principal del proyecto (`../README.md`, sección "App Store y Google Play") —
recomendado: **[Codemagic](https://codemagic.io)**, conecta este repo de
GitHub y compila/firma/sube la app sin que hagas falta tocar una Mac.

Si en algún momento sí se tiene acceso a una Mac:
```bash
npm run open:ios
```
abre el proyecto en Xcode.

## Próximos pasos recomendados

- **Notificaciones push** — hoy la app no manda ninguna. Ayuda mucho a que
  Apple no rechace la app por "ser solo una página web" (ver
  `../README.md`). Se agrega con `@capacitor/push-notifications` + un
  servicio como OneSignal.
- **Ícono y splash screen** — hace falta el logo de Millán Academy en varios
  tamaños. Se puede generar todo de una imagen con
  `npx @capacitor/assets generate` una vez que haya un ícono de 1024×1024.
