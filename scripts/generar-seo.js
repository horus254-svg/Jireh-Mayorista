/**
 * generar-seo.js
 * =================================================================
 * Genera páginas HTML ESTÁTICAS y legibles sin JavaScript:
 *
 *   /producto/<CODIGO>-<slug>/index.html   una ficha por producto con stock
 *   /categoria/<slug>/index.html           un listado por categoría
 *   index.html (entre SEO-ENLACES:INICIO/FIN)  enlaces visibles a categorías
 *                                          y productos destacados
 *
 * Cada ficha tiene: título, descripción, precio, imagen, categoría,
 * JSON-LD Product (+ BreadcrumbList), <link rel="canonical"> hacia sí misma,
 * navegación (inicio / categoría / productos relacionados) y un enlace
 * visible "Comprar en el catálogo" que lleva a la SPA (/?producto=...).
 *
 * NO hay meta refresh ni window.location: la ficha es una página real que
 * se queda donde está. El usuario que quiere comprar hace clic en el enlace.
 *
 * Qué datos usa (nada se inventa):
 *   - Nombre del negocio: config.json → "empresa"
 *   - Dirección: config.json → "direccionComercial" (o "direccion")
 *   - Por producto: PRODUCTO, CODIGO, CATEGORIA, PRECIO, IMAGEN, IMAGENES,
 *     DESCRIPCION (solo si el producto tiene una propia), UNIDADES_POR_CAJA
 *     y PRECIO_CAJA (si existen).
 *
 * Variables de entorno (opcionales; si no están se lee config.json):
 *   SITE_URL → ej: https://usuario.github.io/repo   (sin "/" final)
 *   API_URL  → backend (apiUrlLectura o apiUrl de config.json)
 *
 * sitemap.xml lo genera generar-sitemap.js (mismo paso del workflow), usando
 * scripts/seo-comun.js para calcular exactamente las mismas URLs.
 * =================================================================
 */

const fs = require("fs");
const path = require("path");
const C = require("./seo-comun.js");

const { ROOT, escaparHtml: esc } = C;
const CFG = C.cargarConfig();
const SITE_URL = CFG.siteUrl;
const API_URL = CFG.apiUrl;
const NEGOCIO = CFG.empresa;

if (!SITE_URL) { console.error("❌ Falta sitioUrl en config.json (o la variable SITE_URL)."); process.exit(1); }
if (!API_URL) { console.error("❌ Falta apiUrl/apiUrlLectura en config.json (o la variable API_URL)."); process.exit(1); }
if (!NEGOCIO) { console.error("❌ Falta \"empresa\" en config.json."); process.exit(1); }

/* ---------------------------------------------------------------
 * Datos derivados de un producto
 * ------------------------------------------------------------- */

function datosProducto(p, seg) {
    const nombre = String(p.PRODUCTO).trim();
    const categoria = String(p.CATEGORIA || "").trim();
    const precio = C.parsearPrecio(p.PRECIO);
    const url = SITE_URL + "/producto/" + seg + "/";
    const codigoCrudo = String(p.CODIGO).trim();
    const slug = C.generarSlug(nombre);
    const urlCompra = SITE_URL + "/?producto=" + encodeURIComponent(codigoCrudo) + (slug ? "-" + slug : "");

    // Descripción propia: solo si existe y no es simplemente el nombre repetido.
    let descripcionPropia = String(p.DESCRIPCION || "").replace(/\r\n?/g, "\n").trim();
    if (descripcionPropia.toLowerCase() === nombre.toLowerCase()) descripcionPropia = "";

    // Imágenes: IMAGEN + IMAGENES ("url|color, url|color"), sin duplicados, solo https.
    const imagenes = [];
    const agregar = (u) => { u = C.urlHttps(String(u || "").split("|")[0]); if (u && !imagenes.includes(u)) imagenes.push(u); };
    agregar(p.IMAGEN);
    String(p.IMAGENES || "").split(",").forEach(agregar);
    const imagenPrincipal = imagenes[0] || (SITE_URL + "/icon-512.png");
    const sinFoto = imagenes.length === 0;

    // Texto factual (solo datos reales) para meta description / JSON-LD cuando
    // el producto no tiene descripción propia.
    const partes = [nombre + (categoria ? " — " + categoria : "") + "."];
    if (precio !== null) partes.push("Precio $" + C.formatearPrecio(precio) + ".");
    partes.push("Venta al por mayor en " + NEGOCIO + ". Envíos a toda Argentina.");
    const descripcionFactual = partes.join(" ");

    const descripcionMeta = C.recortar(descripcionPropia || descripcionFactual, 158);
    const descripcionSchema = C.recortar(descripcionPropia || descripcionFactual, 5000);

    const unidadesCaja = Number(p.UNIDADES_POR_CAJA) > 0 ? Number(p.UNIDADES_POR_CAJA) : 0;
    const precioCaja = unidadesCaja ? C.parsearPrecio(p.PRECIO_CAJA) : null;

    return { nombre, categoria, categoriaSeg: C.segmentoCategoria(categoria), precio, url, urlCompra, codigoCrudo,
             descripcionPropia, descripcionFactual, descripcionMeta, descripcionSchema, imagenes, imagenPrincipal, sinFoto,
             unidadesCaja, precioCaja };
}

/* ---------------------------------------------------------------
 * Estilos mínimos (en línea: la ficha no depende de nada externo)
 * ------------------------------------------------------------- */
const CSS = `
:root{--c:${CFG.color};--ink:#2a1f1a;--mute:#6b5d52;--line:#eadfd2;--bg:#fdf6ec}
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--c)}
.top{background:var(--c);color:#fff;padding:12px 16px}
.top a{color:#fff;text-decoration:none;font-weight:700}
.wrap{max-width:960px;margin:0 auto;padding:16px}
.crumbs{font-size:14px;color:var(--mute);margin:4px 0 16px}
.crumbs a{color:var(--mute)}
.ficha{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
@media(min-width:720px){.ficha{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.ficha img{width:100%;height:auto;max-height:560px;object-fit:contain;border-radius:8px;background:#fff}
.thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.thumbs img{width:72px;height:72px;object-fit:cover}
h1{font-size:1.6rem;line-height:1.25;margin:0 0 8px}
h2{font-size:1.15rem;margin:24px 0 8px}
.cat{margin:0 0 8px;color:var(--mute)}
.precio{font-size:1.9rem;font-weight:800;margin:8px 0}
.caja{margin:0 0 12px;color:var(--mute)}
.btn{display:inline-block;background:#e8531f;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px}
.btn:hover,.btn:focus{background:#c9440f}
.desc p{margin:0 0 10px}
.meta{font-size:14px;color:var(--mute)}
.grid{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.grid li{background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px}
.grid a{text-decoration:none;color:var(--ink);display:block}
.grid img{width:100%;height:auto;aspect-ratio:1/1;object-fit:contain}
.grid .n{font-size:14px;display:block;margin:6px 0 2px}
.grid .p{font-weight:700}
.chips{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.chips a{display:inline-block;padding:6px 12px;border:1px solid var(--line);border-radius:999px;background:#fff;text-decoration:none}
footer{margin-top:32px;padding:20px 16px;background:#241536;color:#e9e2f0;font-size:14px}
footer a{color:#fff}
`.replace(/\n/g, "").replace(/\s{2,}/g, " ");

/* ---------------------------------------------------------------
 * Trozos HTML compartidos
 * ------------------------------------------------------------- */

function cabecera({ titulo, descripcion, urlCanonica, ogTipo, ogImagen, extraHead }) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${esc(urlCanonica)}">
<link rel="icon" href="${esc(SITE_URL)}/favicon.ico">
<meta name="theme-color" content="${esc(CFG.color)}">

<meta property="og:type" content="${ogTipo}">
<meta property="og:url" content="${esc(urlCanonica)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:image" content="${esc(ogImagen)}">
<meta property="og:locale" content="es_AR">
<meta property="og:site_name" content="${esc(NEGOCIO)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descripcion)}">
<meta name="twitter:image" content="${esc(ogImagen)}">
${extraHead || ""}
<style>${CSS}</style>
</head>`;
}

function pie() {
    const wa = CFG.whatsapp ? ` · <a href="https://wa.me/${CFG.whatsapp}">Consultas por WhatsApp</a>` : "";
    return `<footer>
<div class="wrap">
<p><strong>${esc(NEGOCIO)}</strong> — venta al por mayor de bazar, regalería, juguetes y artículos para el hogar.${CFG.direccion ? "<br>" + esc(CFG.direccion) + "." : ""} Envíos a toda Argentina.</p>
<p><a href="${esc(SITE_URL)}/">Ver el catálogo completo</a>${wa}</p>
</div>
</footer>`;
}

function barraSuperior() {
    return `<div class="top"><div class="wrap" style="padding-top:0;padding-bottom:0"><a href="${esc(SITE_URL)}/">${esc(NEGOCIO)}</a></div></div>`;
}

function tarjetas(items, ancho) {
    return items.map(({ p, seg }) => {
        const d = datosProducto(p, seg);
        return `<li><a href="${esc(SITE_URL + "/producto/" + seg + "/")}"><img src="${esc(C.imgTamano(d.imagenPrincipal, ancho))}" alt="${esc(d.nombre)}" width="${ancho}" height="${ancho}" loading="lazy"><span class="n">${esc(d.nombre)}</span>${d.precio !== null ? `<span class="p">$${C.formatearPrecio(d.precio)}</span>` : ""}</a></li>`;
    }).join("\n");
}

/* ---------------------------------------------------------------
 * Ficha de producto
 * ------------------------------------------------------------- */

function htmlProducto(item, plan) {
    const { p, seg } = item;
    const d = datosProducto(p, seg);
    const titulo = d.nombre + " | " + NEGOCIO;

    // Relacionados: siguientes de la misma categoría (orden estable, sin azar → diffs limpios)
    let relacionados = [];
    const cat = plan.categorias.find(c => c.seg === d.categoriaSeg);
    if (cat) {
        const i = cat.items.findIndex(x => x.seg === seg);
        for (let k = 1; k < cat.items.length && relacionados.length < 6; k++) {
            relacionados.push(cat.items[(i + k) % cat.items.length]);
        }
    }

    const jsonProducto = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": d.nombre,
        "description": d.descripcionSchema,
        "image": d.imagenes.length ? d.imagenes.map(u => C.imgTamano(u, 1200)) : [d.imagenPrincipal],
        "sku": d.codigoCrudo,
        "category": d.categoria || undefined,
        "url": d.url,
        "offers": d.precio !== null ? {
            "@type": "Offer",
            "url": d.url,
            "priceCurrency": CFG.moneda,
            "price": d.precio,
            "availability": "https://schema.org/InStock",
            "seller": { "@type": "Organization", "name": NEGOCIO }
        } : undefined
    };

    const migas = [{ n: "Inicio", u: SITE_URL + "/" }];
    if (cat) migas.push({ n: cat.nombre, u: SITE_URL + "/categoria/" + cat.seg + "/" });
    migas.push({ n: d.nombre, u: d.url });
    const jsonMigas = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": migas.map((m, i) => ({ "@type": "ListItem", "position": i + 1, "name": m.n, "item": m.u }))
    };

    // Descripción visible = la propia del producto; si no tiene, el texto factual
    // (con los mismos datos reales que usa el JSON-LD, para que coincidan).
    const parrafos = (d.descripcionPropia || d.descripcionFactual)
        .split(/\n+/).map(t => t.trim()).filter(Boolean).map(t => `<p>${esc(t)}</p>`).join("\n");

    const extras = d.imagenes.slice(1, 6);

    return `${cabecera({
        titulo, descripcion: d.descripcionMeta, urlCanonica: d.url, ogTipo: "product",
        ogImagen: C.imgTamano(d.imagenPrincipal, 1200),
        extraHead: (d.precio !== null ? `<meta property="product:price:amount" content="${d.precio}">\n<meta property="product:price:currency" content="${esc(CFG.moneda)}">\n` : "") +
            `<script type="application/ld+json">${C.jsonLd(jsonProducto)}</script>\n<script type="application/ld+json">${C.jsonLd(jsonMigas)}</script>`
    })}
<body>
${barraSuperior()}
<main class="wrap">
<nav class="crumbs" aria-label="Ruta de navegación"><a href="${esc(SITE_URL)}/">Inicio</a>${cat ? ` › <a href="${esc(SITE_URL + "/categoria/" + cat.seg + "/")}">${esc(cat.nombre)}</a>` : ""} › ${esc(d.nombre)}</nav>
<article class="ficha">
<div>
<img src="${esc(C.imgTamano(d.imagenPrincipal, 800))}" alt="${esc(d.nombre)}" width="800" height="800">
${extras.length ? `<div class="thumbs">${extras.map((u, i) => `<img src="${esc(C.imgTamano(u, 160))}" alt="${esc(d.nombre)} — imagen ${i + 2}" width="72" height="72" loading="lazy">`).join("")}</div>` : ""}
</div>
<div>
<h1>${esc(d.nombre)}</h1>
${d.categoria ? `<p class="cat">Categoría: ${cat ? `<a href="${esc(SITE_URL + "/categoria/" + cat.seg + "/")}">${esc(d.categoria)}</a>` : esc(d.categoria)}</p>` : ""}
<p class="precio">${d.precio !== null ? "$" + C.formatearPrecio(d.precio) : "Consultá el precio"}</p>
${d.unidadesCaja ? `<p class="caja">Por caja (${d.unidadesCaja} unidades)${d.precioCaja !== null ? ": <strong>$" + C.formatearPrecio(d.precioCaja) + "</strong>" : ""}</p>` : ""}
${parrafos ? `<div class="desc">\n${parrafos}\n</div>` : ""}
<p class="meta">Código: ${esc(d.codigoCrudo)} · Venta al por mayor en ${esc(NEGOCIO)}.</p>
<p><a class="btn" href="${esc(d.urlCompra)}">Comprar en el catálogo</a></p>
</div>
</article>
${relacionados.length ? `<h2>Más productos de ${esc(cat.nombre)}</h2>
<ul class="grid">
${tarjetas(relacionados, 240)}
</ul>
<p><a href="${esc(SITE_URL + "/categoria/" + cat.seg + "/")}">Ver toda la categoría ${esc(cat.nombre)}</a></p>` : ""}
</main>
${pie()}
</body>
</html>
`;
}

/* ---------------------------------------------------------------
 * Página de categoría
 * ------------------------------------------------------------- */

function htmlCategoria(cat) {
    const url = SITE_URL + "/categoria/" + cat.seg + "/";
    const n = cat.items.length;
    const titulo = cat.nombre + " al por mayor | " + NEGOCIO;
    const descripcion = C.recortar(
        cat.nombre + ": " + n + (n === 1 ? " producto" : " productos") + " al por mayor en " + NEGOCIO +
        (CFG.direccion ? ", " + CFG.direccion : "") + ". Envíos a toda Argentina.", 158);
    const primera = C.urlHttps(cat.items[0].p.IMAGEN);

    const jsonLista = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": cat.nombre + " — " + NEGOCIO,
        "url": url,
        "mainEntity": {
            "@type": "ItemList",
            "numberOfItems": n,
            "itemListElement": cat.items.map((it, i) => ({
                "@type": "ListItem", "position": i + 1, "url": SITE_URL + "/producto/" + it.seg + "/", "name": String(it.p.PRODUCTO).trim()
            }))
        }
    };
    const jsonMigas = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Inicio", "item": SITE_URL + "/" },
            { "@type": "ListItem", "position": 2, "name": cat.nombre, "item": url }
        ]
    };

    return `${cabecera({
        titulo, descripcion, urlCanonica: url, ogTipo: "website",
        ogImagen: primera ? C.imgTamano(primera, 1200) : SITE_URL + "/icon-512.png",
        extraHead: `<script type="application/ld+json">${C.jsonLd(jsonLista)}</script>\n<script type="application/ld+json">${C.jsonLd(jsonMigas)}</script>`
    })}
<body>
${barraSuperior()}
<main class="wrap">
<nav class="crumbs" aria-label="Ruta de navegación"><a href="${esc(SITE_URL)}/">Inicio</a> › ${esc(cat.nombre)}</nav>
<h1>${esc(cat.nombre)} al por mayor</h1>
<p>${n} ${n === 1 ? "producto disponible" : "productos disponibles"} en esta categoría de ${esc(NEGOCIO)}. Elegí un producto para ver su ficha o <a href="${esc(SITE_URL + "/?categoria=" + cat.seg)}">abrí esta categoría en el catálogo para armar tu pedido</a>.</p>
<ul class="grid">
${tarjetas(cat.items, 240)}
</ul>
</main>
${pie()}
</body>
</html>
`;
}

/* ---------------------------------------------------------------
 * Bloque de enlaces de index.html
 * ------------------------------------------------------------- */

const MARCA_INICIO = "<!-- SEO-ENLACES:INICIO (lo escribe scripts/generar-seo.js; no editar a mano) -->";
const MARCA_FIN = "<!-- SEO-ENLACES:FIN -->";

function bloqueEnlaces(plan) {
    const cats = plan.categorias.map(c =>
        `<li><a href="categoria/${esc(c.seg)}/">${esc(c.nombre)}</a> <span class="seo-n">(${c.items.length})</span></li>`).join("\n");

    // Con suficientes destacados se listan solo ellos; si no, se completa con los primeros
    // del catálogo y el título NO dice "destacados" (para no rotular de más).
    const dest = plan.fichas.filter(f => String(f.p.DESTACADO || "").trim().toUpperCase() === "SI");
    const soloDestacados = dest.length >= 8;
    const elegidos = (soloDestacados ? dest : plan.fichas).slice(0, 24);
    const prods = elegidos.map(f =>
        `<li><a href="producto/${esc(f.seg)}/">${esc(String(f.p.PRODUCTO).trim())}</a></li>`).join("\n");

    return `${MARCA_INICIO}
<div class="seo-enlaces">
<div>
<h3>Categorías</h3>
<ul>
${cats}
</ul>
</div>
<div>
<h3>${soloDestacados ? "Productos destacados" : "Productos del catálogo"}</h3>
<ul>
${prods}
</ul>
</div>
</div>
${MARCA_FIN}`;
}

function actualizarIndex(plan) {
    const ruta = path.join(ROOT, "index.html");
    if (!fs.existsSync(ruta)) return console.warn("⚠️  No hay index.html: no se actualizan los enlaces.");
    const html = fs.readFileSync(ruta, "utf8");
    const i = html.indexOf("<!-- SEO-ENLACES:INICIO");
    const f = html.indexOf(MARCA_FIN);
    if (i === -1 || f === -1 || f < i) {
        return console.warn("⚠️  index.html no tiene los marcadores SEO-ENLACES:INICIO / FIN: no se actualizan los enlaces.");
    }
    const nuevo = html.slice(0, i) + bloqueEnlaces(plan) + html.slice(f + MARCA_FIN.length);
    if (nuevo !== html) fs.writeFileSync(ruta, nuevo, "utf8");
    console.log("✔ index.html: " + plan.categorias.length + " categorías y enlaces a productos.");
}

/* ---------------------------------------------------------------
 * Main
 * ------------------------------------------------------------- */

async function main() {
    console.log("→ Pidiendo productos a la API...");
    const productos = await C.obtenerProductos(API_URL);
    console.log(`→ ${productos.length} productos con stock.`);

    // Protección: una respuesta vacía casi seguro es un error de la API; no se borra lo publicado.
    if (productos.length === 0) {
        console.error("❌ La API devolvió 0 productos con stock. Se aborta SIN tocar /producto/ ni /categoria/.");
        process.exit(1);
    }

    const plan = C.planificar(productos);
    plan.advertencias.forEach(a => console.warn("⚠️  " + a));

    // Se regeneran las carpetas completas para no dejar fichas de productos que ya no existen.
    for (const [carpeta, items] of [["producto", plan.fichas], ["categoria", plan.categorias]]) {
        const dir = path.join(ROOT, carpeta);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        for (const it of items) {
            const dest = path.join(dir, C.carpetaDeSegmento(it.seg));
            fs.mkdirSync(dest, { recursive: true });
            fs.writeFileSync(path.join(dest, "index.html"), carpeta === "producto" ? htmlProducto(it, plan) : htmlCategoria(it), "utf8");
        }
    }

    actualizarIndex(plan);

    console.log(`✔ ${plan.fichas.length} fichas en /producto/ y ${plan.categorias.length} categorías en /categoria/`);
    console.log("  (sitemap.xml: lo genera generar-sitemap.js en el paso siguiente del workflow)");
}

main().catch(err => {
    console.error("❌ Error generando SEO:", err);
    process.exit(1);
});
