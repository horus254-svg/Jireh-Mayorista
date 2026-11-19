#!/usr/bin/env node
/**
 * generar-feed-google.js — arma feed-google.xml, el archivo de productos
 * para Google Merchant Center (fichas gratuitas en Google Shopping,
 * Imágenes y la búsqueda; también sirve para anuncios de Shopping).
 *
 * Usa los MISMOS productos y páginas que generar-seo.js (solo los que
 * tienen stock y página propia en /producto/…/), así el precio y la
 * disponibilidad del feed coinciden con la página, que es lo que Google
 * controla. Corre en el workflow de GitHub Actions después de generar-seo.
 *
 * Todo se personaliza por cliente en config.json → "feedGoogle":
 *
 *   "feedGoogle": {
 *     "activo": true,                 // false: no se genera (y se borra el archivo)
 *     "titulos": "normalizar",        // "normalizar": "MATE DE ACERO" → "Mate de acero"
 *                                     //   (Google castiga los títulos en MAYÚSCULAS); "original": tal cual
 *     "marcaPorDefecto": "",          // marca para los productos sin MARCA (solo si es marca propia)
 *     "excluirCategorias": ["PIROTECNIA"],  // categorías que no van (productos prohibidos por Google)
 *     "excluirCodigos": [],           // productos puntuales que no van
 *     "categoriasGoogle": {           // opcional: categoría de la taxonomía de Google por categoría propia
 *       "TERMICOS": "Hogar y jardín > Cocina y comedor > Contenedores para alimentos y bebidas > Termos"
 *     },
 *     "agregarCaracteristicas": true  // suma marca/material/medidas… a la descripción si no tiene una propia
 *   }
 *
 * Uso: node scripts/generar-feed-google.js   (Node 18+, sin dependencias)
 */

const fs = require("fs");
const path = require("path");
const C = require("./seo-comun.js");

const ROOT = C.ROOT;
const CFG = C.cargarConfig();
const SITE = CFG.siteUrl;
const NEGOCIO = CFG.empresa || "la tienda";
const MONEDA = CFG.moneda || "ARS";
const ARCHIVO = path.join(ROOT, "feed-google.xml");

const OPC = Object.assign({
    activo: true,
    titulos: "normalizar",
    marcaPorDefecto: "",
    excluirCategorias: [],
    excluirCodigos: [],
    categoriasGoogle: {},
    agregarCaracteristicas: true
}, CFG.crudo.feedGoogle || {});

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
const linea = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\s+/g, " ").trim();

function xml(s) {
    return String(s ?? "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * "MATE DE ACERO INOXIDABLE 180ML 007" → "Mate de acero inoxidable 180ml 007".
 * Solo toca títulos que están (casi) todos en mayúsculas; si el cliente ya
 * los escribe bien, se respetan.
 */
function normalizarTitulo(t) {
    t = linea(t);
    if (OPC.titulos === "original") return t;
    const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
    if (!letras) return t;
    const mayus = letras.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, "").length;
    if (mayus / letras.length < 0.7) return t;
    const bajo = t.toLocaleLowerCase("es-AR");
    return bajo.charAt(0).toLocaleUpperCase("es-AR") + bajo.slice(1);
}

function cortar(s, max) {
    s = String(s || "");
    return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

function descripcion(p, titulo) {
    const propia = String(p.DESCRIPCION || "").replace(/\r\n?/g, "\n").trim();
    const soloNombre = (x) => norm(x).replace(/[^A-Z0-9]+/g, " ").trim();
    const tienePropia = propia && soloNombre(propia) !== soloNombre(p.PRODUCTO);
    if (tienePropia && propia.length >= 70) return cortar(propia.replace(/\n+/g, " ").replace(/\s+/g, " "), 5000);
    // Sin descripción propia (o muy corta, como "Caja x12"): se completa con datos reales
    const partes = [];
    if (tienePropia) partes.push(propia.replace(/\s+/g, " ").replace(/[.\s]*$/, "."));
    partes.push(titulo + (p.CATEGORIA ? " — " + normalizarTitulo(p.CATEGORIA) : "") + ".");
    if (OPC.agregarCaracteristicas) {
        const car = C.caracteristicas(p);
        if (car.length) partes.push(car.map(([k, v]) => k + ": " + v).join(". ") + ".");
    }
    const unidades = Number(p.UNIDADES_POR_CAJA) || 0;
    if (unidades > 0) partes.push("También por caja de " + unidades + " unidades.");
    partes.push("Venta en " + NEGOCIO + ". Envíos a todo el país.");
    return cortar(partes.join(" "), 5000);
}

function idDe(codigo) {
    const c = linea(codigo);
    if (c.length <= 50) return c;
    return c.slice(0, 41) + "-" + require("crypto").createHash("sha1").update(c).digest("hex").slice(0, 8);
}

function categoriaGoogle(cat) {
    const mapa = OPC.categoriasGoogle || {};
    const clave = Object.keys(mapa).find(k => norm(k) === norm(cat));
    return clave ? linea(mapa[clave]) : "";
}

async function minimoDeCompra() {
    try {
        const r = await fetch(CFG.apiUrl + "?action=configuracionNegocio");
        const d = await r.json();
        const n = Number((d.config || d.configuracion || d).PEDIDO_MINIMO);
        return n > 0 ? n : 0;
    } catch (e) { return 0; }
}

(async () => {
    if (!OPC.activo) {
        if (fs.existsSync(ARCHIVO)) { fs.unlinkSync(ARCHIVO); console.log("feedGoogle.activo = false: se borró feed-google.xml"); }
        else console.log("feedGoogle.activo = false: no se genera el feed de Google.");
        return;
    }
    if (!SITE || !CFG.apiUrl) { console.error("❌ Faltan sitioUrl o apiUrl en config.json"); process.exit(1); }

    console.log("FEED GOOGLE MERCHANT CENTER — " + SITE);
    const productos = await C.obtenerProductos(CFG.apiUrl);
    const plan = C.planificar(productos);

    const excluirCat = new Set((OPC.excluirCategorias || []).map(norm));
    const excluirCod = new Set((OPC.excluirCodigos || []).map(x => linea(x)));
    const omitidos = { categoria: 0, codigo: 0, sinImagen: 0, sinPrecio: 0 };
    const sinCategoriaGoogle = new Set();
    const items = [];
    const ids = new Set();

    for (const { p, seg } of plan.fichas) {
        const codigo = linea(p.CODIGO);
        if (excluirCat.has(norm(p.CATEGORIA))) { omitidos.categoria++; continue; }
        if (excluirCod.has(codigo)) { omitidos.codigo++; continue; }
        const imagen = C.urlHttps(p.IMAGEN);
        if (!imagen) { omitidos.sinImagen++; continue; }           // Google exige imagen
        const precio = C.parsearPrecio(p.PRECIO);
        if (precio === null || !(precio > 0)) { omitidos.sinPrecio++; continue; }
        const id = idDe(codigo);
        if (ids.has(id)) continue;
        ids.add(id);

        const titulo = cortar(normalizarTitulo(p.PRODUCTO), 150);
        const gtin = C.gtin(codigo);
        const marca = linea(p.MARCA || OPC.marcaPorDefecto).slice(0, 70);
        const extras = String(p.IMAGENES || "").split(",")
            .map(par => C.urlHttps(par.split("|")[0])).filter(u => u && u !== imagen);
        const colores = C.colores(p);
        const catGoogle = categoriaGoogle(p.CATEGORIA);
        if (!catGoogle && p.CATEGORIA) sinCategoriaGoogle.add(linea(p.CATEGORIA));

        const campos = [
            ["g:id", id],
            ["g:title", titulo],
            ["g:description", descripcion(p, titulo)],
            ["g:link", `${SITE}/producto/${seg}/`],
            ["g:image_link", imagen],
            ...[...new Set(extras)].slice(0, 10).map(u => ["g:additional_image_link", u]),
            ["g:availability", "in_stock"],                       // solo hay página para productos con stock
            ["g:price", precio.toFixed(2) + " " + MONEDA],
            ["g:condition", "new"],
            marca ? ["g:brand", marca] : null,
            gtin ? ["g:gtin", gtin] : null,
            // Sin código de barras: se declara que no tiene (si no, Google lo rechaza por "falta GTIN")
            !gtin ? ["g:identifier_exists", "no"] : null,
            catGoogle ? ["g:google_product_category", catGoogle] : null,
            p.CATEGORIA ? ["g:product_type", linea(p.CATEGORIA)] : null,
            colores.length ? ["g:color", colores.slice(0, 3).join("/").slice(0, 100)] : null,
            p.MATERIAL ? ["g:material", linea(p.MATERIAL).slice(0, 200)] : null,
            p.CATEGORIA ? ["g:custom_label_0", linea(p.CATEGORIA).slice(0, 100)] : null,
            String(p.DESTACADO || "").trim().toUpperCase() === "SI" ? ["g:custom_label_1", "destacado"] : null
        ].filter(Boolean);

        items.push("<item>\n" + campos.map(([k, v]) => `  <${k}>${xml(v)}</${k}>`).join("\n") + "\n</item>");
    }

    const salida = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${xml(NEGOCIO)}</title>
<link>${xml(SITE + "/")}</link>
<description>${xml("Productos de " + NEGOCIO)}</description>
${items.join("\n")}
</channel>
</rss>
`;
    const anterior = fs.existsSync(ARCHIVO) ? fs.readFileSync(ARCHIVO, "utf8") : "";
    if (anterior !== salida) fs.writeFileSync(ARCHIVO, salida, "utf8");

    console.log(`  ${items.length} productos en el feed.`);
    const om = Object.entries(omitidos).filter(([, n]) => n);
    if (om.length) console.log("  Omitidos: " + om.map(([k, n]) => `${n} ${{ categoria: "por categoría excluida", codigo: "por código excluido", sinImagen: "sin foto", sinPrecio: "sin precio" }[k]}`).join(", ") + ".");
    if (sinCategoriaGoogle.size) console.log(`  (opcional) Categorías sin "categoriasGoogle": ${[...sinCategoriaGoogle].sort().join(", ")}`);
    const minimo = await minimoDeCompra();
    if (minimo) console.log(`  Recordatorio: la compra mínima es $${C.formatearPrecio(minimo)}. Cargala en Merchant Center → Envíos y devoluciones → Pedido mínimo (si no, Google puede rechazar los productos).`);
    console.log(`✅ ${SITE}/feed-google.xml`);
})().catch(e => { console.error("❌ Error generando el feed de Google:", e); process.exit(1); });
