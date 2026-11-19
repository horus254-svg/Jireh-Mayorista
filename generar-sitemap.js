/**
 * Genera sitemap.xml con la home + una URL por cada producto del catálogo.
 *
 * IMPORTANTE: las URLs de producto apuntan a las páginas HTML estáticas
 * generadas por scripts/generar-seo.js en /producto/CODIGO-slug/ (NO al
 * formato ?producto=CODIGO-slug de la SPA). Esas páginas estáticas son
 * las que de verdad conviene que Google rastree: tienen el contenido
 * pre-renderizado (title, description, OG, JSON-LD) sin depender de que
 * el crawler ejecute JavaScript. La SPA (/?producto=...) sigue existiendo
 * para la navegación normal del usuario, pero no es la URL "canónica" a
 * indexar — por eso su <link rel="canonical"> (ver app.js) también
 * apunta a la página estática, para no generar contenido duplicado.
 *
 * Este script debe correr DESPUÉS de scripts/generar-seo.js dentro del
 * mismo workflow (mismo orden de productos = mismos slugs, así que en
 * la práctica no hace falta que las carpetas ya existan para calcular
 * las URLs, pero sí conviene mantenerlos como pasos consecutivos del
 * mismo job para que ambos commiteen juntos).
 *
 * USO:
 *   node generar-sitemap.js
 *
 * Necesita dos variables de entorno (o los valores por defecto de abajo):
 *   BASE_URL  -> la URL pública del catálogo (con barra final)
 *   API_URL   -> la URL del backend (la misma que usa config.js / CONFIG_NEGOCIO.API_URL)
 *
 * Ejemplo:
 *   node generar-sitemap.js   (toma sitioUrl y apiUrl de config.json)
 *
 * Requiere Node 18+ (trae fetch nativo). Pensado para correrse a mano antes
 * de cada deploy, o automático con GitHub Actions (ver workflow sugerido
 * más abajo en el mensaje del chat).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Datos del cliente: config.json (sitioUrl / apiUrl), leídos por seo-comun.js.
// Las variables de entorno BASE_URL/SITE_URL y API_URL, si están, tienen prioridad.
const SEO = require("./scripts/seo-comun.js");

const CFG = SEO.cargarConfig();
const BASE_URL = String(process.env.BASE_URL || CFG.siteUrl || "").replace(/\/*$/, "/");
const API_URL = CFG.apiUrl;

function escapeXml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  }[c]));
}

async function main() {
  if (BASE_URL === "/") {
    console.error("Falta sitioUrl en config.json (o la variable BASE_URL).");
    process.exit(1);
  }
  if (!API_URL) {
    console.error("Falta la URL de la API (apiUrl / apiUrlLectura en config.json, o la variable API_URL).");
    process.exit(1);
  }

  console.log("Descargando catálogo desde:", API_URL);

  const res = await fetch(API_URL + "?action=productos");
  if (!res.ok) {
    console.error("La API respondió con error:", res.status, res.statusText);
    process.exit(1);
  }

  const data = await res.json();
  const productos = (data.productos || []).filter(p => Number(String(p.STOCK ?? "").trim()) > 0);

  console.log("Productos con stock encontrados:", productos.length);

  // Mismo cálculo que scripts/generar-seo.js (seo-comun.js): el sitemap lista
  // exactamente las páginas que el generador crea, ni más ni menos.
  const plan = SEO.planificar(productos);
  plan.advertencias.forEach(a => console.warn("Aviso:", a));

  const hoy = new Date().toISOString().slice(0, 10);
  const baseSinBarra = BASE_URL.replace(/\/+$/, "");

  // lastmod REAL: la fecha en que cambió el contenido de cada página, no la
  // de hoy. Se guarda una huella (hash) de cada página publicada en
  // .github/sitemap-fechas.json; si la huella no cambió, se conserva la fecha
  // anterior. Así Google y Bing pueden confiar en lastmod para decidir qué
  // volver a rastrear (si siempre dice "hoy", lo ignoran).
  const ESTADO = path.join(SEO.ROOT, ".github", "sitemap-fechas.json");
  let anterior = {};
  try { anterior = JSON.parse(fs.readFileSync(ESTADO, "utf8")).urls || {}; } catch (e) {}
  const estado = {};
  const fechaDe = (loc, archivoRel) => {
    let huella = "sin-archivo";
    try { huella = crypto.createHash("sha256").update(fs.readFileSync(path.join(SEO.ROOT, archivoRel))).digest("hex").slice(0, 20); } catch (e) {}
    const previo = anterior[loc];
    const fecha = previo && previo.huella === huella ? previo.fecha : hoy;
    estado[loc] = { huella, fecha };
    return fecha;
  };
  const entrada = (loc, archivoRel, changefreq, priority) =>
    `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${fechaDe(loc, archivoRel)}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

  const urls = [entrada(BASE_URL, "index.html", "daily", "1.0")];

  for (const c of plan.categorias) {
    urls.push(entrada(`${baseSinBarra}/categoria/${c.seg}/`, `categoria/${SEO.carpetaDeSegmento(c.seg)}/index.html`, "daily", "0.9"));
  }

  for (const f of plan.fichas) {
    urls.push(entrada(`${baseSinBarra}/producto/${f.seg}/`, `producto/${SEO.carpetaDeSegmento(f.seg)}/index.html`, "weekly", "0.8"));
  }

  // Páginas legales (scripts/generar-politicas.js): la de devoluciones va al
  // sitemap para que Google (y Merchant Center) la encuentre.
  if (fs.existsSync(path.join(SEO.ROOT, "devoluciones", "index.html"))) {
    urls.push(entrada(`${baseSinBarra}/devoluciones/`, "devoluciones/index.html", "monthly", "0.3"));
  }

  fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
  const ordenado = Object.fromEntries(Object.keys(estado).sort().map(k => [k, estado[k]]));
  fs.writeFileSync(ESTADO, JSON.stringify({ _LEEME: "Lo usa generar-sitemap.js para que lastmod sea la fecha real del último cambio de cada página. No editar.", urls: ordenado }, null, 1) + "\n");
  const cambiadas = Object.values(estado).filter(x => x.fecha === hoy).length;
  console.log(`lastmod: ${cambiadas} URLs con cambios hoy, ${urls.length - cambiadas} conservan su fecha anterior.`);

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

  fs.writeFileSync(path.join(SEO.ROOT, "sitemap.xml"), xml, "utf8");
  console.log(`Listo: sitemap.xml generado con ${urls.length} URLs.`);
}

main().catch(err => {
  console.error("Error generando el sitemap:", err);
  process.exit(1);
});
