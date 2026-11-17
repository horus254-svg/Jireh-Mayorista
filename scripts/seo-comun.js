/**
 * seo-comun.js
 * =================================================================
 * Lógica compartida por scripts/generar-seo.js, generar-sitemap.js y
 * scripts/verificar-seo.js. Existe para que las TRES herramientas (y
 * js/app.js, que replica segmentoProducto/segmentoCategoria) calculen
 * exactamente la misma URL para cada ficha y cada categoría: si una
 * se desviara, el sitemap listaría URLs que dan 404.
 *
 * No tiene dependencias: solo Node 18+.
 * =================================================================
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/* ---------------------------------------------------------------
 * Config (config.json es la ÚNICA fuente de datos del cliente)
 * ------------------------------------------------------------- */
function cargarConfig() {
    let c = {};
    try { c = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8")); } catch (e) {}
    const siteUrl = String(process.env.SITE_URL || c.sitioUrl || "").trim().replace(/\/+$/, "");
    const apiUrl = String(process.env.API_URL || c.apiUrlLectura || c.apiUrl || "").trim();
    return {
        crudo: c,
        siteUrl,
        apiUrl,
        empresa: String(c.empresa || "").trim(),
        // Dirección comercial: "direccionComercial" (texto público para SEO); si no
        // existe, "direccion" (la del panel). Nunca se inventa.
        direccion: String(c.direccionComercial || c.direccion || "").trim(),
        whatsapp: String(c.whatsapp || "").replace(/[^\d]/g, ""),
        moneda: String(c.moneda || "ARS").trim() || "ARS",
        color: /^#[0-9a-f]{3,8}$/i.test(String(c.colorTema || "")) ? c.colorTema : "#241536"
    };
}

/* ---------------------------------------------------------------
 * Slugs y segmentos de URL
 * ------------------------------------------------------------- */
function generarSlug(texto) {
    return String(texto || "")
        .trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Segmento de URL de una ficha: <CODIGO codificado>[-slug].
 * Es el mismo formato histórico (encodeURIComponent del código) para no
 * romper URLs ya indexadas. Única excepción: "/" y "\" dentro del código
 * se reemplazan por "-", porque no pueden formar parte de un nombre de
 * carpeta ni de un segmento de ruta.
 */
function segmentoProducto(p) {
    const codigo = String(p.CODIGO ?? "").trim().replace(/[\/\\]+/g, "-");
    const slug = generarSlug(p.PRODUCTO);
    return encodeURIComponent(codigo) + (slug ? "-" + slug : "");
}

function segmentoCategoria(nombre) {
    return generarSlug(nombre);
}

/**
 * Nombre de carpeta en disco para un segmento de URL.
 * GitHub Pages decodifica el %XX de la URL antes de buscar el archivo,
 * así que la carpeta tiene que llamarse con el texto DECODIFICADO
 * ("PAÑAL-...", "7796988014636 77969...-..."), no con el "%C3%91" literal
 * (con el nombre literal la URL daba 404).
 */
function carpetaDeSegmento(segmento) {
    try { return decodeURIComponent(segmento); } catch (e) { return segmento; }
}

/* ---------------------------------------------------------------
 * Datos
 * ------------------------------------------------------------- */
async function obtenerProductos(apiUrl) {
    const res = await fetch(apiUrl + "?action=productos");
    if (!res.ok) throw new Error("La API respondió " + res.status);
    const data = await res.json();
    const productos = Array.isArray(data.productos) ? data.productos : [];
    return productos.filter(p => Number(String(p.STOCK ?? "").trim()) > 0);
}

/**
 * Decide qué páginas existen. Una sola función para generador y sitemap:
 *  - productos con CODIGO y PRODUCTO, sin duplicar segmentos
 *  - categorías con al menos un producto
 */
function planificar(productos) {
    const fichas = [];
    const vistos = new Set();
    const advertencias = [];

    for (const p of productos) {
        if (!String(p.CODIGO ?? "").trim() || !String(p.PRODUCTO ?? "").trim()) continue;
        const seg = segmentoProducto(p);
        if (vistos.has(seg.toLowerCase())) {
            advertencias.push("Segmento repetido (se omite): " + seg);
            continue;
        }
        vistos.add(seg.toLowerCase());
        fichas.push({ p, seg });
    }

    const porCat = new Map();
    for (const f of fichas) {
        const nombre = String(f.p.CATEGORIA || "").trim();
        const seg = segmentoCategoria(nombre);
        if (!nombre || !seg) continue;
        if (!porCat.has(seg)) porCat.set(seg, { nombre, seg, items: [] });
        porCat.get(seg).items.push(f);
    }
    const categorias = [...porCat.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    return { fichas, categorias, advertencias };
}

/* ---------------------------------------------------------------
 * Utilidades de texto / HTML
 * ------------------------------------------------------------- */
function escaparHtml(t) {
    return String(t ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** JSON para incrustar en <script type="application/ld+json">: evita cerrar el script con "</". */
function jsonLd(obj) {
    return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function parsearPrecio(v) {
    const n = Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
    return isFinite(n) && n > 0 ? n : null;
}

function formatearPrecio(n) {
    return Number(n).toLocaleString("es-AR");
}

function urlHttps(u) {
    const s = String(u ?? "").trim();
    return /^https?:\/\//i.test(s) ? s.replace(/^http:\/\//i, "https://") : "";
}

/** Mismo criterio que imgOptimizada() de app.js para las fotos de Google. */
function imgTamano(url, ancho) {
    let u = String(url || "");
    if (u.indexOf("lh3.googleusercontent.com/d/") === -1) return u;
    u = u.replace(/=w\d+$/, "");
    if (u.indexOf("=") !== -1) return u;
    return u + "=w" + ancho;
}

function recortar(texto, max) {
    const t = String(texto || "").replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const corte = t.slice(0, max - 1);
    const sp = corte.lastIndexOf(" ");
    return (sp > max * 0.6 ? corte.slice(0, sp) : corte).replace(/[\s,.;:–-]+$/, "") + "…";
}

/* ---------------------------------------------------------------
 * Datos enriquecidos del producto (todos opcionales; nada se inventa)
 * ------------------------------------------------------------- */

/** GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) si el código es uno válido (dígito verificador incluido). */
function gtin(codigo) {
    const c = String(codigo ?? "").trim();
    if (!/^(\d{8}|\d{12,14})$/.test(c)) return "";
    const d = c.split("").map(Number);
    const verificador = d.pop();
    const suma = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - suma % 10) % 10 === verificador ? c : "";
}

/** Colores: COLOR (foto principal) + los de IMAGENES ("url|color, …"), sin repetir. */
function colores(p) {
    const lista = [];
    const agregar = (c) => {
        c = String(c || "").replace(/\s+/g, " ").trim();
        if (c && !lista.some(x => x.toLowerCase() === c.toLowerCase())) lista.push(c);
    };
    agregar(p.COLOR);
    String(p.IMAGENES || "").split(",").forEach(par => agregar(par.split("|")[1]));
    return lista;
}

/** Columnas opcionales de la hoja PRODUCTOS que se muestran como características. */
const CARACTERISTICAS = [
    ["MARCA", "Marca"], ["MATERIAL", "Material"], ["MEDIDAS", "Medidas"],
    ["CONTENIDO", "Contenido"], ["EDAD", "Edad recomendada"]
];

/** [[etiqueta, valor], …] solo con las características que tienen dato. */
function caracteristicas(p) {
    const filas = CARACTERISTICAS
        .map(([col, etiqueta]) => [etiqueta, String(p[col] ?? "").replace(/\s+/g, " ").trim()])
        .filter(([, v]) => v);
    const cs = colores(p);
    if (cs.length) filas.push([cs.length > 1 ? "Colores" : "Color", cs.join(", ")]);
    return filas;
}

module.exports = {
    ROOT, cargarConfig, generarSlug, segmentoProducto, segmentoCategoria, carpetaDeSegmento,
    obtenerProductos, planificar, escaparHtml, jsonLd, parsearPrecio, formatearPrecio,
    urlHttps, imgTamano, recortar, gtin, colores, caracteristicas, CARACTERISTICAS
};
