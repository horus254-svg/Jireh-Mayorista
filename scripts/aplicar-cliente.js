#!/usr/bin/env node
/**
 * aplicar-cliente.js — lleva los datos de config.json (el ÚNICO archivo
 * con datos propios de cada cliente) a las partes del sitio que TIENEN
 * que estar escritas en archivos estáticos para que Google, WhatsApp y
 * el navegador las lean sin ejecutar JavaScript:
 *
 *   - index.html ........ <title>, description, canonical, Open Graph,
 *                          Twitter Card, schema.org y verificación de Google
 *   - manifest-catalogo.json / Reportes/manifest.json ... nombre y color
 *   - robots.txt ........ dirección del sitemap
 *   - archivo de verificación de Google Search Console (si corresponde)
 *   - clave de IndexNow (<clave>.txt) para Bing, Yandex y otros buscadores
 *
 * Todo lo demás (nombre visible, colores, banner, teléfonos, textos)
 * ya se carga solo desde la hoja CONFIGURACION vía el backend.
 *
 * Uso:   node scripts/aplicar-cliente.js
 * Corre automáticamente en GitHub Actions (.github/workflows/generar-seo.yml)
 * cada vez que se sube un cambio, así que alcanza con editar config.json.
 * Se puede correr las veces que haga falta: si nada cambió, no toca nada.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const existe = (rel) => fs.existsSync(path.join(ROOT, rel));
let cambios = 0;

function escribirSiCambia(rel, contenido) {
  const actual = existe(rel) ? leer(rel) : null;
  if (actual === contenido) return;
  fs.writeFileSync(path.join(ROOT, rel), contenido);
  cambios++;
  console.log("✏️  " + rel);
}

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ------------------------------------------------------------------
// 1) Leer y validar config.json
// ------------------------------------------------------------------
let c;
try {
  c = JSON.parse(leer("config.json"));
} catch (e) {
  console.error("❌ config.json no existe o no es un JSON válido: " + e.message);
  process.exit(1);
}

const empresa = String(c.empresa || "").trim();
const nombreCorto = String(c.nombreCorto || empresa.split(/\s+/)[0] || "").trim();
const descripcion = String(c.descripcion || ("Catálogo online de " + empresa + " con envíos a todo el país.")).trim();
const sitioUrl = String(c.sitioUrl || "").trim().replace(/\/*$/, "/");
const color = /^#[0-9a-f]{3,8}$/i.test(String(c.colorTema || "")) ? c.colorTema : "#0b1633";
const verif = String(c.googleVerificacion || "").trim();

const faltan = [];
if (!empresa) faltan.push("empresa");
if (!c.apiUrl || /PEGAR_URL/i.test(c.apiUrl)) faltan.push("apiUrl");
if (sitioUrl === "/" || !/^https?:\/\//.test(sitioUrl)) faltan.push("sitioUrl");
if (faltan.length) {
  console.error("❌ Completá en config.json: " + faltan.join(", "));
  process.exit(1);
}

// ------------------------------------------------------------------
// 2) index.html (meta tags estáticos)
// ------------------------------------------------------------------
if (existe("index.html")) {
  let h = leer("index.html");
  const titulo = empresa + " | Catálogo online";

  const fijarMeta = (atributo, nombre, valor) => {
    const re = new RegExp(`(<meta\\s+${atributo}="${nombre}"\\s+content=")[^"]*(")`, "i");
    if (re.test(h)) h = h.replace(re, `$1${esc(valor)}$2`);
  };

  h = h.replace(/<title>[^<]*<\/title>/i, `<title>${esc(titulo)}</title>`);
  fijarMeta("name", "description", descripcion);
  fijarMeta("name", "author", empresa);
  fijarMeta("property", "og:url", sitioUrl);
  fijarMeta("property", "og:title", empresa);
  fijarMeta("property", "og:description", descripcion);
  fijarMeta("property", "og:image", sitioUrl + "icon-512.png");
  fijarMeta("property", "og:site_name", empresa);
  fijarMeta("name", "twitter:title", empresa);
  fijarMeta("name", "twitter:description", descripcion);
  fijarMeta("name", "twitter:image", sitioUrl + "icon-512.png");
  fijarMeta("name", "theme-color", color);
  h = h.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `$1${esc(sitioUrl)}$2`);

  // schema.org: nombre y URL del negocio
  h = h.replace(/(<script type="application\/ld\+json" id="schema-negocio">[\s\S]*?"name":\s*)"[^"]*"/, `$1${JSON.stringify(empresa)}`);
  h = h.replace(/(<script type="application\/ld\+json" id="schema-negocio">[\s\S]*?"url":\s*)"[^"]*"/, `$1${JSON.stringify(sitioUrl)}`);

  // Verificación de Google Search Console por meta tag (si se cargó un código, no un archivo)
  const metaVerif = /\s*<meta name="google-site-verification" content="[^"]*">/i;
  if (verif && !/\.html$/i.test(verif)) {
    const tag = `<meta name="google-site-verification" content="${esc(verif)}">`;
    if (metaVerif.test(h)) h = h.replace(metaVerif, "\n    " + tag);
    else h = h.replace(/(<meta name="robots"[^>]*>)/i, `$1\n    ${tag}`);
  } else {
    h = h.replace(metaVerif, "");
  }

  escribirSiCambia("index.html", h);
}

// ------------------------------------------------------------------
// 3) Manifests (app instalable)
// ------------------------------------------------------------------
function actualizarManifest(rel, cambiosManifest) {
  if (!existe(rel)) return;
  const m = JSON.parse(leer(rel));
  Object.assign(m, cambiosManifest);
  escribirSiCambia(rel, JSON.stringify(m, null, 2) + "\n");
}
actualizarManifest("manifest-catalogo.json", { name: empresa, short_name: nombreCorto, description: descripcion, theme_color: color });
actualizarManifest("Reportes/manifest.json", { name: "Reportes — " + empresa, theme_color: color, background_color: color });

// ------------------------------------------------------------------
// 4) robots.txt
// ------------------------------------------------------------------
if (existe("robots.txt")) {
  let r = leer("robots.txt");
  const linea = "Sitemap: " + sitioUrl + "sitemap.xml";
  r = /^Sitemap:.*$/m.test(r) ? r.replace(/^Sitemap:.*$/m, linea) : r.replace(/\s*$/, "\n\n" + linea + "\n");
  escribirSiCambia("robots.txt", r);
}

// ------------------------------------------------------------------
// 5) Archivo de verificación de Google (googleXXXX.html)
// ------------------------------------------------------------------
fs.readdirSync(ROOT)
  .filter((f) => /^google[0-9a-f]+\.html$/i.test(f) && f !== verif)
  .forEach((f) => { fs.unlinkSync(path.join(ROOT, f)); cambios++; console.log("🗑️  " + f + " (era de otro cliente)"); });
if (/^google[0-9a-f]+\.html$/i.test(verif)) {
  escribirSiCambia(verif, "google-site-verification: " + verif + "\n");
}

// ------------------------------------------------------------------
// 6) Clave de IndexNow (Bing, Yandex, etc.): <clave>.txt en la raíz del sitio
//    Si config.json no tiene "indexNowClave", se genera una y se guarda ahí.
//    Cada cliente debe tener la suya (para un cliente nuevo, dejarla vacía).
// ------------------------------------------------------------------
let claveIN = String(c.indexNowClave || "").trim();
if (!/^[a-zA-Z0-9-]{8,128}$/.test(claveIN)) {
  claveIN = require("crypto").randomBytes(16).toString("hex");
  let cfg = leer("config.json");
  if (/"indexNowClave"\s*:\s*"[^"]*"/.test(cfg)) cfg = cfg.replace(/"indexNowClave"\s*:\s*"[^"]*"/, `"indexNowClave": "${claveIN}"`);
  else if (/"googleVerificacion"\s*:\s*"[^"]*",?/.test(cfg)) cfg = cfg.replace(/("googleVerificacion"\s*:\s*"[^"]*")(,?)/, `$1,\n  "indexNowClave": "${claveIN}"$2`);
  else cfg = JSON.stringify({ ...c, indexNowClave: claveIN }, null, 2) + "\n";
  JSON.parse(cfg); // por las dudas: nunca dejar un config.json roto
  escribirSiCambia("config.json", cfg);
}
fs.readdirSync(ROOT)
  .filter((f) => /^[0-9a-f]{32}\.txt$/i.test(f) && f !== claveIN + ".txt")
  .forEach((f) => { fs.unlinkSync(path.join(ROOT, f)); cambios++; console.log("🗑️  " + f + " (clave IndexNow anterior)"); });
escribirSiCambia(claveIN + ".txt", claveIN);

console.log(cambios ? `✅ Datos del cliente aplicados (${cambios} archivo/s).` : "✅ Todo ya estaba al día con config.json.");
