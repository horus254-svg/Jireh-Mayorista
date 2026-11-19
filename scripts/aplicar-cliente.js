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
 *   - robots.txt ........ reglas para Google (Merchant Center) y sitemap
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
// Se arma entero desde config.json → "robots" (opcional):
//   "robots": { "bloquear": ["admin/", "precio.html", …] }   páginas internas
// Googlebot, Googlebot-Image y AdsBot-Google tienen su propio grupo con
// "Allow: /": es lo que pide Google Merchant Center para poder leer las
// fichas de producto y sus imágenes.
//
// OJO: los buscadores solo leen el robots.txt de la RAÍZ del dominio. Si el
// sitio está en una subcarpeta (usuario.github.io/Repo/), este archivo no se
// usa: hay que publicar el mismo contenido en la raíz (en GitHub Pages, un
// repo llamado "usuario.github.io"). Por eso también se genera
// robots-raiz.txt, listo para copiar ahí (ver LEEME).
{
  const base = new URL(sitioUrl).pathname.replace(/\/?$/, "/"); // "/" o "/Repo/"
  const bloquear = ((c.robots && c.robots.bloquear) || ["admin/", "login.html", "precio.html", "lector.html", "stock.html", "cobro.html", "Reportes/"])
    .map(x => base + String(x).replace(/^\/+/, ""));
  const grupo = (agentes, conAllow) => agentes.map(a => "User-agent: " + a).join("\n") + "\n" +
    (conAllow ? "Allow: " + base + "\n" : "") + bloquear.map(b => "Disallow: " + b).join("\n");
  const r = [
    "# Lo genera scripts/aplicar-cliente.js desde config.json: no editar a mano.",
    "",
    "# Google (páginas e imágenes de productos para Search y Merchant Center)",
    grupo(["Googlebot", "Googlebot-Image", "AdsBot-Google"], true),
    "",
    "# Todos los demás",
    grupo(["*"], true),
    "",
    "Sitemap: " + sitioUrl + "sitemap.xml",
    ""
  ].join("\n");
  escribirSiCambia("robots.txt", r);
  if (base !== "/") escribirSiCambia("robots-raiz.txt", r);
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
