/* =========================================================
   Millán Academy — arma la carpeta "www" que usa Capacitor
   =========================================================

   La app nativa (iOS/Android) es un shell que muestra el PANEL
   interno (app/), no el sitio público. Este script copia:
     app/index.html  ->  mobile/www/index.html   (arreglando las
                          rutas "../assets/..." a "./assets/...",
                          porque ahora quedan al mismo nivel)
     assets/          ->  mobile/www/assets/

   Se corre con "npm run sync" (o solo, "node sync-web.js") cada vez
   que se sube un cambio al sitio y hay que reflejarlo en la app
   nativa, y automáticamente antes de "npx cap sync".
   ========================================================= */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const wwwDir = path.join(__dirname, "www");

function copiarCarpeta(origen, destino) {
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  for (const item of fs.readdirSync(origen, { withFileTypes: true })) {
    const o = path.join(origen, item.name);
    const d = path.join(destino, item.name);
    if (item.isDirectory()) copiarCarpeta(o, d);
    else fs.copyFileSync(o, d);
  }
}

// 1) assets/ completo
copiarCarpeta(path.join(root, "assets"), path.join(wwwDir, "assets"));

// 2) app/index.html -> www/index.html, con las rutas ajustadas
let html = fs.readFileSync(path.join(root, "app", "index.html"), "utf8");
html = html.replaceAll("../assets/", "./assets/");
fs.writeFileSync(path.join(wwwDir, "index.html"), html);

console.log("✔ mobile/www listo (copiado de app/ + assets/)");
