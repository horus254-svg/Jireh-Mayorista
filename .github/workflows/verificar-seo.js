#!/usr/bin/env node
/**
 * verificar-seo.js — comprueba que lo publicado para SEO es coherente.
 *
 * Uso (desde la raíz del repo, sin dependencias, Node 18+):
 *   node scripts/verificar-seo.js                 revisión LOCAL de archivos (la que corre el workflow)
 *   node scripts/verificar-seo.js --live          además, pide las URLs reales por HTTP
 *   node scripts/verificar-seo.js --live --imagenes   y también comprueba cada imagen
 *
 * REVISIÓN LOCAL (sin red). Replica cómo GitHub Pages resuelve una URL:
 * decodifica el %XX de la ruta y busca <ruta>/index.html. Si el archivo
 * existe, Pages responde 200; si no, 404. Comprueba:
 *   - cada <loc> de sitemap.xml existe como archivo (sin duplicados ni huérfanos)
 *   - cada ficha /producto/* y página /categoria/*: DOCTYPE, lang, <title>,
 *     meta description, UN canonical que apunta a sí misma, sin meta refresh ni
 *     scripts (salvo JSON-LD), un solo <h1>, JSON-LD válido (Product con name,
 *     image, sku, offers.price/priceCurrency/availability/url), imágenes con
 *     alt/src https, enlace "Comprar en el catálogo" hacia la SPA
 *   - todos los enlaces internos de esas páginas y de index.html resuelven
 *   - index.html: contenido comercial visible + enlaces a categorías y productos
 *
 * REVISIÓN EN VIVO (--live):
 *   - robots.txt en la RAÍZ DEL HOST (https://usuario.github.io/robots.txt),
 *     que es el único que los bots leen. El robots.txt de /<repo>/ no manda
 *     sobre el dominio.
 *   - sitemap.xml: HTTP 200 y formato
 *   - cada URL del sitemap: HTTP 200, sin redirecciones, con canonical propio
 *
 * Sale con código 1 si hay ERRORES (los avisos no cortan).
 */

const fs = require("fs");
const path = require("path");
const C = require("./seo-comun.js");

const ROOT = C.ROOT;
const CFG = C.cargarConfig();
const SITE = CFG.siteUrl;
const args = process.argv.slice(2);
const LIVE = args.includes("--live");
const IMAGENES = args.includes("--imagenes");

const errores = [];
const avisos = [];
const err = (m) => errores.push(m);
const warn = (m) => avisos.push(m);

/* ------------------------------ utilidades ------------------------------ */

const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const existe = (rel) => fs.existsSync(path.join(ROOT, rel));

/** URL absoluta del sitio → ruta de archivo relativa (como lo haría GitHub Pages) o null si es de otro sitio. */
function urlAArchivo(url) {
    let u = String(url).split("#")[0].split("?")[0];
    if (u !== SITE && !u.startsWith(SITE + "/")) return null;
    let rel = u.slice(SITE.length);
    try { rel = decodeURIComponent(rel); } catch (e) { return "__URL_MAL_CODIFICADA__"; }
    rel = rel.replace(/^\/+/, "");
    if (rel === "" || rel.endsWith("/")) rel += "index.html";
    return rel;
}

function archivoExisteComoPages(rel) {
    if (rel === "__URL_MAL_CODIFICADA__") return false;
    const abs = path.join(ROOT, rel);
    // Pages sirve un archivo; si la ruta es una carpeta sin barra final, redirige (no es 200 directo)
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
}

function listarHtml(dir) {
    const out = [];
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return out;
    for (const nombre of fs.readdirSync(abs)) {
        const f = path.join(abs, nombre, "index.html");
        if (fs.existsSync(f)) out.push(dir + "/" + nombre + "/index.html");
    }
    return out;
}

function urlDePagina(rel) {
    // producto/<carpeta>/index.html → SITE/producto/<carpeta codificada>/
    const partes = rel.replace(/index\.html$/, "").split("/").filter(Boolean).map(encodeURIComponent);
    return SITE + "/" + partes.join("/") + (partes.length ? "/" : "");
}

function extraer(html, re) { return [...html.matchAll(re)]; }

function jsonLdDe(html) {
    return extraer(html, /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
        .map(m => { try { return JSON.parse(m[1]); } catch (e) { return { __error: e.message }; } });
}

function atributo(tag, nombre) {
    const m = tag.match(new RegExp("\\s" + nombre + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", "i"));
    return m ? (m[1] ?? m[2]) : null;
}

const decodificarEntidades = (t) => String(t).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/* ------------------------- validación de una página ------------------------- */

function validarPagina(rel, tipo) {
    const html = leer(rel);
    const url = urlDePagina(rel);
    const P = (m) => `${rel}: ${m}`;

    if (!/^<!DOCTYPE html>/i.test(html.trimStart())) err(P("falta <!DOCTYPE html>"));
    if (!/<html[^>]*\slang="es/i.test(html)) err(P("falta lang=\"es\""));
    if (!/<meta charset="utf-8">/i.test(html)) err(P("falta meta charset"));
    if (!/<meta name="viewport"/i.test(html)) err(P("falta meta viewport"));

    const titulo = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
    if (!titulo || !titulo.trim()) err(P("<title> vacío o ausente"));
    else if (titulo.length > 120) warn(P("<title> muy largo (" + titulo.length + ")"));

    const desc = (html.match(/<meta name="description" content="([^"]*)"/i) || [])[1];
    if (!desc || desc.trim().length < 20) err(P("meta description ausente o demasiado corta"));
    else if (desc.length > 320) warn(P("meta description muy larga (" + desc.length + ")"));

    // canonical: uno solo y hacia sí misma
    const canon = extraer(html, /<link[^>]*rel="canonical"[^>]*>/gi).map(m => decodificarEntidades(atributo(m[0], "href") || ""));
    if (canon.length !== 1) err(P("debe haber exactamente 1 canonical (hay " + canon.length + ")"));
    else if (canon[0] !== url) err(P(`canonical no apunta a sí misma: ${canon[0]} ≠ ${url}`));

    const ogUrl = (html.match(/<meta property="og:url" content="([^"]*)"/i) || [])[1];
    if (decodificarEntidades(ogUrl || "") !== url) err(P("og:url no coincide con la URL de la página"));
    if (!/<meta name="robots" content="[^"]*index[^"]*"/i.test(html) || /noindex/i.test(html)) err(P("robots meta ausente o con noindex"));

    // sin redirecciones ni JavaScript
    if (/http-equiv\s*=\s*["']?refresh/i.test(html)) err(P("tiene meta refresh"));
    if (/location\s*\.\s*(replace|href|assign)|window\.location/i.test(html)) err(P("contiene redirección por JavaScript"));
    const scripts = extraer(html, /<script\b([^>]*)>/gi).filter(m => !/application\/ld\+json/i.test(m[1]));
    if (scripts.length) err(P("tiene <script> que no es JSON-LD (debe leerse sin JavaScript)"));
    if (/\son[a-z]+\s*=/i.test(html.replace(/<style[\s\S]*?<\/style>/gi, ""))) err(P("tiene atributos de evento inline (onclick, onerror…)"));

    // encabezados
    const h1 = extraer(html, /<h1[\s>]/gi).length;
    if (h1 !== 1) err(P("debe haber exactamente un <h1> (hay " + h1 + ")"));

    // JSON-LD
    const lds = jsonLdDe(html);
    lds.forEach(j => { if (j.__error) err(P("JSON-LD no parsea: " + j.__error)); });
    const validos = lds.filter(j => !j.__error);
    if (!validos.some(j => j["@type"] === "BreadcrumbList")) warn(P("sin BreadcrumbList"));

    if (tipo === "producto") {
        const prod = validos.find(j => j["@type"] === "Product");
        if (!prod) err(P("sin JSON-LD Product"));
        else {
            if (!prod.name) err(P("Product.name vacío"));
            if (!prod.description || String(prod.description).length < 10) err(P("Product.description vacío"));
            if (!prod.sku) err(P("Product.sku vacío"));
            const imgs = [].concat(prod.image || []);
            if (!imgs.length || imgs.some(u => !/^https:\/\//.test(u))) err(P("Product.image ausente o no https"));
            const of = prod.offers;
            if (!of) warn(P("Product sin offers (producto sin precio)"));
            else {
                if (!(Number(of.price) > 0)) err(P("Offer.price inválido"));
                if (!of.priceCurrency) err(P("Offer.priceCurrency ausente"));
                if (!/schema\.org\/(InStock|OutOfStock|PreOrder)/.test(of.availability || "")) err(P("Offer.availability inválido"));
                if (of.url !== url) err(P("Offer.url ≠ canonical"));
            }
            if (prod.url && prod.url !== url) err(P("Product.url ≠ canonical"));
            const h1txt = decodificarEntidades(((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "").trim());
            if (prod.name && h1txt !== prod.name) err(P("h1 ≠ Product.name"));
        }
        // enlace visible a la SPA
        const cta = extraer(html, /<a\b[^>]*>/gi).some(m => /\/\?producto=/.test(decodificarEntidades(atributo(m[0], "href") || "")));
        if (!cta) err(P("falta el enlace visible 'Comprar en el catálogo' (/?producto=…)"));
        if (!/<p class="precio">/.test(html)) err(P("sin precio visible"));
    } else {
        const lista = validos.find(j => j["@type"] === "CollectionPage");
        if (!lista) err(P("sin JSON-LD CollectionPage"));
        else {
            const n = lista.mainEntity && lista.mainEntity.numberOfItems;
            const enlaces = extraer(html, /<a\b[^>]*>/gi).filter(m => /\/producto\//.test(atributo(m[0], "href") || "")).length;
            if (n !== (lista.mainEntity.itemListElement || []).length) err(P("ItemList.numberOfItems no coincide con sus elementos"));
            if (enlaces < n) err(P(`la lista JSON-LD tiene ${n} productos pero solo ${enlaces} enlaces visibles`));
        }
    }

    validarImagenes(html, rel);
    validarEnlaces(html, rel, url);
}

function validarImagenes(html, rel) {
    for (const m of extraer(html, /<img\b[^>]*>/gi)) {
        const tag = m[0];
        const src = decodificarEntidades(atributo(tag, "src") || "");
        const alt = atributo(tag, "alt");
        if (!src) err(`${rel}: <img> sin src`);
        else if (!/^https:\/\//.test(src)) {
            const f = urlAArchivo(src);
            if (!f || !archivoExisteComoPages(f)) err(`${rel}: imagen no https ni local: ${src}`);
        }
        if (alt === null || !alt.trim()) err(`${rel}: <img> sin alt (${src.slice(0, 60)})`);
        if (!atributo(tag, "width") || !atributo(tag, "height")) warn(`${rel}: <img> sin width/height`);
    }
}

function validarEnlaces(html, rel, urlPagina) {
    const base = new URL(urlPagina);
    for (const m of extraer(html, /<a\b[^>]*>/gi)) {
        const hrefCrudo = atributo(m[0], "href");
        if (hrefCrudo === null) continue;
        const href = decodificarEntidades(hrefCrudo).trim();
        if (!href) { err(`${rel}: <a> con href vacío`); continue; }
        if (/^(mailto:|tel:|javascript:)/i.test(href)) { if (/^javascript:/i.test(href)) err(`${rel}: enlace javascript:`); continue; }
        if (href.startsWith("#")) continue;
        let abs;
        try { abs = new URL(href, base).href; } catch (e) { err(`${rel}: href inválido: ${href}`); continue; }
        const f = urlAArchivo(abs);
        if (f === null) continue; // otro dominio (wa.me, etc.)
        if (!archivoExisteComoPages(f)) err(`${rel}: enlace roto → ${href}`);
    }
}

/* ------------------------------ index.html ------------------------------ */

function validarIndex() {
    if (!existe("index.html")) return err("No existe index.html");
    const html = leer("index.html");
    const sinScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
    const texto = decodificarEntidades(sinScripts.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
    for (const t of ["Jireh Mayorista", "bazar", "regalería", "juguetes", "hogar", "al por mayor", "Av. Rivadavia 2555", "Once", "CABA", "Envíos a toda Argentina"]) {
        if (!texto.includes(t)) err(`index.html: falta el texto visible "${t}"`);
    }
    if (/<[^>]*(display\s*:\s*none|hidden)[^>]*>[^<]*Rivadavia/i.test(html)) err("index.html: la dirección está en un elemento oculto");

    const ini = html.indexOf("<!-- SEO-ENLACES:INICIO");
    const fin = html.indexOf("<!-- SEO-ENLACES:FIN -->");
    if (ini === -1 || fin === -1) return err("index.html: faltan los marcadores SEO-ENLACES");
    const bloque = html.slice(ini, fin);
    const links = extraer(bloque, /<a\b[^>]*>/gi).map(m => decodificarEntidades(atributo(m[0], "href") || ""));
    const nCat = links.filter(h => h.startsWith("categoria/")).length;
    const nProd = links.filter(h => h.startsWith("producto/")).length;
    if (nCat === 0) err("index.html: el bloque no tiene enlaces a categorías (¿corrió generar-seo.js?)");
    if (nProd === 0) err("index.html: el bloque no tiene enlaces a productos (¿corrió generar-seo.js?)");
    validarEnlaces(bloque, "index.html (bloque SEO-ENLACES)", SITE + "/");

    if (extraer(html, /<link[^>]*rel="canonical"[^>]*>/gi).length !== 1) err("index.html: debe tener un único canonical");
    jsonLdDe(html).forEach(j => { if (j.__error) err("index.html: JSON-LD no parsea: " + j.__error); });
    console.log(`  index.html: ${nCat} enlaces a categorías, ${nProd} a productos.`);
}

/* ------------------------------ sitemap ------------------------------ */

function validarSitemap() {
    if (!existe("sitemap.xml")) { err("No existe sitemap.xml"); return []; }
    const xml = leer("sitemap.xml");
    const locs = extraer(xml, /<loc>([^<]+)<\/loc>/g).map(m => decodificarEntidades(m[1].trim()));
    if (!locs.length) err("sitemap.xml sin <loc>");
    const vistos = new Set();
    let ok = 0;
    for (const loc of locs) {
        if (vistos.has(loc)) { err("sitemap: URL duplicada " + loc); continue; }
        vistos.add(loc);
        const f = urlAArchivo(loc);
        if (f === null) { err("sitemap: URL de otro sitio " + loc); continue; }
        if (!archivoExisteComoPages(f)) err(`sitemap: la URL no existe (daría 404): ${loc}  (buscado: ${f})`);
        else ok++;
    }
    const enMapa = new Set(locs);
    for (const dir of ["producto", "categoria"]) {
        for (const rel of listarHtml(dir)) {
            if (!enMapa.has(urlDePagina(rel))) warn(`sitemap: página sin listar ${rel}`);
        }
    }
    console.log(`  sitemap.xml: ${locs.length} URLs, ${ok} con archivo existente.`);
    return locs;
}

/* ------------------------------ robots (repo) ------------------------------ */

function revisarRobotsLocal() {
    if (!existe("robots.txt")) return warn("No hay robots.txt en el repo (no es obligatorio).");
    const r = leer("robots.txt");
    const m = r.match(/^Sitemap:\s*(\S+)/im);
    if (!m || m[1] !== SITE + "/sitemap.xml") warn("robots.txt del repo: la línea Sitemap no apunta a " + SITE + "/sitemap.xml");
    if (/^Disallow:\s*\/\s*$/im.test(r)) err("robots.txt del repo bloquea todo el sitio (Disallow: /)");
    const u = new URL(SITE);
    if (u.pathname.replace(/\/+$/, "")) {
        warn(`robots.txt del repo está en ${SITE}/robots.txt, pero los bots solo leen ${u.origin}/robots.txt (raíz del host). Con --live se comprueba el de la raíz.`);
    }
}

/* ------------------------------ red (--live) ------------------------------ */

async function pedir(url, opciones = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    try { return await fetch(url, { redirect: "manual", signal: ctl.signal, headers: { "user-agent": "verificar-seo/1.0" }, ...opciones }); }
    finally { clearTimeout(t); }
}

/** GET con reintentos ante 429/5xx/timeouts (GitHub Pages limita ráfagas). */
async function pedirConReintento(url, opciones = {}, intentos = 4) {
    let ultimo;
    for (let i = 0; i < intentos; i++) {
        try {
            const r = await pedir(url, opciones);
            if (r.status !== 429 && r.status < 500) return r;
            ultimo = r;
            await new Promise(ok => setTimeout(ok, 1000 * (i + 1) * (r.status === 429 ? 3 : 1)));
        } catch (e) {
            ultimo = e;
            await new Promise(ok => setTimeout(ok, 1000 * (i + 1)));
        }
    }
    if (ultimo instanceof Error) throw ultimo;
    return ultimo;
}

async function enParalelo(items, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

async function revisarEnVivo(locs) {
    const origen = new URL(SITE).origin;
    console.log("\nEN VIVO:");

    // robots.txt de la RAÍZ DEL HOST
    try {
        const r = await pedir(origen + "/robots.txt");
        if (r.status === 200) {
            const txt = await r.text();
            console.log(`  ${origen}/robots.txt → 200`);
            if (/^Disallow:\s*\/\s*$/im.test(txt.split(/^User-agent:/im).filter(b => /^\s*\*/.test(b)).join("\n"))) err("robots.txt de la raíz del host bloquea todo (User-agent: * / Disallow: /)");
            const sm = [...txt.matchAll(/^Sitemap:\s*(\S+)/gim)].map(m => m[1]);
            if (!sm.includes(SITE + "/sitemap.xml")) warn(`robots.txt de la raíz no declara ${SITE}/sitemap.xml (declaralo ahí, o enviá el sitemap en Search Console).`);
        } else if (r.status === 404) {
            warn(`${origen}/robots.txt → 404: no hay robots en la raíz del host. Sin robots.txt los bots rastrean todo (válido), pero no se declara el sitemap: enviálo en Search Console.`);
        } else err(`${origen}/robots.txt → HTTP ${r.status}`);
    } catch (e) { err("No se pudo leer " + origen + "/robots.txt: " + e.message); }

    // sitemap publicado. En vivo se revisan SUS URLs (no las del sitemap local):
    // la copia local puede estar atrasada respecto de lo que generó el workflow,
    // y comparar lo publicado contra un sitemap viejo da 404 falsos (productos
    // que ya salieron del catálogo).
    const locsLocales = locs;
    try {
        const r = await pedir(SITE + "/sitemap.xml");
        if (r.status !== 200) err(`${SITE}/sitemap.xml → HTTP ${r.status}`);
        else {
            const publicados = extraer(await r.text(), /<loc>([^<]+)<\/loc>/g).map(m => decodificarEntidades(m[1].trim()));
            console.log(`  ${SITE}/sitemap.xml → 200 (${publicados.length} URLs)`);
            if (!publicados.length) err("El sitemap publicado no tiene <loc>");
            else {
                const enVivo = new Set(publicados), enLocal = new Set(locsLocales);
                const soloLocal = locsLocales.filter(u => !enVivo.has(u)).length;
                const soloVivo = publicados.filter(u => !enLocal.has(u)).length;
                if (soloLocal || soloVivo) {
                    warn(`La copia local no coincide con lo publicado (${soloLocal} URLs solo en el sitemap local, ${soloVivo} solo en el publicado). Hacé git pull para revisar lo mismo que está en línea; la revisión en vivo usa el sitemap publicado.`);
                    console.log(`  ⚠️  copia local desactualizada: ${soloLocal} URLs solo en local, ${soloVivo} solo en el publicado → se revisa el publicado.`);
                }
                locs = publicados;
            }
        }
    } catch (e) { err("No se pudo leer el sitemap publicado: " + e.message); }

    // cada URL (concurrencia baja + reintentos: una ráfaga grande da 429 falsos)
    const conteo = {};
    const sumar = (k) => { conteo[k] = (conteo[k] || 0) + 1; };
    const fallasVivo = [];
    let ok = 0;
    await enParalelo(locs, 4, async (loc) => {
        try {
            const r = await pedirConReintento(loc);
            if (r.status !== 200) { sumar("HTTP " + r.status); fallasVivo.push(`HTTP ${r.status} → ${loc}`); return; }
            const html = await r.text();
            const canon = (html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/i) || [])[1];
            if (decodificarEntidades(canon || "") !== loc) { sumar("canonical distinto"); fallasVivo.push(`canonical ≠ URL en vivo → ${loc} (canonical: ${canon})`); return; }
            if (/http-equiv\s*=\s*["']?refresh/i.test(html)) { sumar("meta refresh (versión vieja publicada)"); fallasVivo.push(`meta refresh en vivo → ${loc}`); return; }
            ok++; sumar("OK 200 + canonical propio");
        } catch (e) { sumar("sin respuesta"); fallasVivo.push(`Sin respuesta ${loc}: ${e.message}`); }
    });
    console.log(`  URLs del sitemap con HTTP 200 + canonical propio: ${ok}/${locs.length}`);
    Object.entries(conteo).forEach(([k, v]) => console.log(`    ${k}: ${v}`));
    if (fallasVivo.length) {
        console.log("  Primeras fallas en vivo:");
        fallasVivo.slice(0, 15).forEach(f => console.log("    · " + f));
        fallasVivo.forEach(f => err("EN VIVO: " + f));
    }

    if (IMAGENES) {
        const imgs = new Set();
        for (const rel of [...listarHtml("producto"), ...listarHtml("categoria")]) {
            for (const m of extraer(leer(rel), /<img\b[^>]*>/gi)) {
                const s = decodificarEntidades(atributo(m[0], "src") || "");
                if (/^https:\/\//.test(s)) imgs.add(s);
            }
        }
        let bien = 0;
        await enParalelo([...imgs], 8, async (u) => {
            try {
                const r = await pedirConReintento(u, { method: "GET", headers: { range: "bytes=0-0", "user-agent": "verificar-seo/1.0" }, redirect: "follow" }, 2);
                if (r.status === 200 || r.status === 206) bien++; else warn(`imagen HTTP ${r.status}: ${u}`);
            } catch (e) { warn(`imagen sin respuesta: ${u}`); }
        });
        console.log(`  imágenes accesibles: ${bien}/${imgs.size}`);
    }
}

/* ------------------------------ main ------------------------------ */

(async () => {
    if (!SITE) { console.error("Falta sitioUrl en config.json"); process.exit(1); }
    console.log("VERIFICACIÓN SEO — " + SITE);

    const fichas = listarHtml("producto");
    const cats = listarHtml("categoria");
    console.log(`  ${fichas.length} fichas, ${cats.length} categorías en disco.`);
    if (!fichas.length) err("No hay fichas en /producto/");

    const locs = validarSitemap();
    revisarRobotsLocal();
    validarIndex();
    fichas.forEach(f => validarPagina(f, "producto"));
    cats.forEach(f => validarPagina(f, "categoria"));

    if (LIVE) await revisarEnVivo(locs);
    else console.log("\n(Sin --live no se comprueban robots.txt del host ni HTTP real. Ver el README del script.)");

    // Search Console: no se puede comprobar desde acá
    console.log("\nSEARCH CONSOLE (manual): propiedad con prefijo de URL " + SITE + "/ → Sitemaps → enviar sitemap.xml → Inspección de URL en una ficha y en una categoría.");

    const unicos = (a) => [...new Set(a)];
    if (avisos.length) { console.log(`\nAVISOS (${avisos.length}):`); unicos(avisos).slice(0, 40).forEach(a => console.log("  ⚠️  " + a)); if (avisos.length > 40) console.log(`  … y ${avisos.length - 40} más`); }
    if (errores.length) {
        console.log(`\nERRORES (${errores.length}):`);
        const ordenados = unicos(errores).sort((a, b) => (b.startsWith("EN VIVO") ? 1 : 0) - (a.startsWith("EN VIVO") ? 1 : 0));
        ordenados.slice(0, 60).forEach(e => console.log("  ❌ " + e));
        if (errores.length > 60) console.log(`  … y ${errores.length - 60} más`);
        process.exit(1);
    }
    console.log("\n✅ Sin errores.");
})();
