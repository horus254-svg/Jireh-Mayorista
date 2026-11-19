#!/usr/bin/env node
/**
 * generar-politicas.js — páginas legales del sitio, armadas desde config.json:
 *
 *   /devoluciones/     Política de cambios y devoluciones (la pide Google
 *                      Merchant Center y tiene que estar a la vista).
 *   /arrepentimiento/  "Botón de arrepentimiento": revocación de la compra en
 *                      10 días corridos (Ley 24.240 art. 34, CCyCN art. 1110,
 *                      Disposición SSDCyLC 954/2025). Obligatorio para quien
 *                      vende por internet a consumidores.
 *
 * Además pone los enlaces a las dos en el pie de index.html (entre
 * <!-- LEGALES:INICIO --> y <!-- LEGALES:FIN -->). Las fichas de producto
 * y categoría los agregan en su pie (scripts/generar-seo.js).
 *
 * No necesita la API: corre en el workflow después de aplicar-cliente.js.
 *
 * config.json → "politicaDevoluciones" (todo opcional; ver valores por defecto):
 *   "activo": true,
 *   "aceptaCambios": false,          // cambio por otro producto
 *   "aceptaDevoluciones": false,     // devolución con reintegro del dinero
 *   "plazoCambiosDias": 10,          // solo si acepta cambios o devoluciones
 *   "envioCambiosACargoDe": "cliente",   // "cliente" | "tienda"
 *   "defectos": {
 *     "activo": true,
 *     "soloPedidosEnviados": true,   // solo productos que se despacharon
 *     "plazoDias": 7,                // para avisar, desde que se recibe
 *     "evidencia": "fotos o video",  // qué hay que mandar
 *     "devolverProducto": false,     // ¿hay que devolverlo?
 *     "compensacion": "cupon",       // "cupon" | "reemplazo" | "reintegro"
 *     "vigenciaCuponDias": 90        // 0 = sin vencimiento
 *   },
 *   "noCubre": ["…"],                // excepciones extra (lista de textos)
 *   "textoAdicional": "",            // párrafo libre al final
 *   "email": "",                     // contacto además de WhatsApp
 *   "arrepentimiento": true          // genera /arrepentimiento/ y su enlace
 *
 * Uso: node scripts/generar-politicas.js
 */

const fs = require("fs");
const path = require("path");
const C = require("./seo-comun.js");

const ROOT = C.ROOT;
const CFG = C.cargarConfig();
const SITE = CFG.siteUrl;
const NEGOCIO = CFG.empresa || "la tienda";
const esc = C.escaparHtml;

const POL = Object.assign({
    activo: true,
    aceptaCambios: false,
    aceptaDevoluciones: false,
    plazoCambiosDias: 10,
    envioCambiosACargoDe: "cliente",
    noCubre: [],
    textoAdicional: "",
    email: "",
    arrepentimiento: true
}, CFG.crudo.politicaDevoluciones || {});
POL.defectos = Object.assign({
    activo: true,
    soloPedidosEnviados: true,
    plazoDias: 7,
    evidencia: "fotos o video",
    devolverProducto: false,
    compensacion: "cupon",
    vigenciaCuponDias: 90
}, (CFG.crudo.politicaDevoluciones || {}).defectos || {});

const WA = CFG.whatsapp;
const linkWa = (texto) => WA ? `https://wa.me/${WA}?text=${encodeURIComponent(texto)}` : "";
const dias = (n) => `${n} ${Number(n) === 1 ? "día corrido" : "días corridos"}`;
const fechaHoy = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });

const MARCA_INI = "<!-- LEGALES:INICIO";
const MARCA_FIN = "<!-- LEGALES:FIN -->";

/* ------------------------------ plantilla ------------------------------ */

const CSS = `
:root{--c:${CFG.color};--tx:#1f2430;--mute:#5b6270;--line:#e6e8ee}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--tx);line-height:1.6;background:#fafafb}
.top{background:var(--c);color:#fff}
.top a{color:#fff;text-decoration:none;font-weight:700}
.wrap{max-width:760px;margin:0 auto;padding:18px 20px}
main.wrap{background:#fff;border:1px solid var(--line);border-radius:14px;margin:24px auto;padding:28px 28px 20px}
h1{font-size:1.7rem;line-height:1.25;margin:0 0 6px}
h2{font-size:1.15rem;margin:26px 0 8px}
.act{color:var(--mute);font-size:14px;margin:0 0 18px}
.destacado{background:#f4f6fb;border-left:4px solid var(--c);padding:12px 16px;border-radius:8px;margin:14px 0}
ul,ol{padding-left:22px}
li{margin:4px 0}
a{color:var(--c)}
.btn{display:inline-block;background:var(--c);color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;border:0;font-size:15px;cursor:pointer}
.btn-sec{background:#fff;color:var(--c);border:2px solid var(--c)}
label{display:block;font-weight:600;font-size:14px;margin:12px 0 4px}
input,textarea{width:100%;padding:10px 12px;border:1px solid #cfd3dc;border-radius:8px;font:inherit}
.codigo{font-family:ui-monospace,Consolas,monospace;font-size:1.3rem;font-weight:700;letter-spacing:.04em}
.oculto{display:none}
footer{color:var(--mute);font-size:14px;text-align:center}
@media (max-width:600px){main.wrap{margin:12px;padding:20px 16px}}
`;

function pagina({ ruta, titulo, descripcion, cuerpo, robots, extraHead, script }) {
    const url = `${SITE}/${ruta}/`;
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} | ${esc(NEGOCIO)}</title>
<meta name="description" content="${esc(descripcion)}">
<meta name="robots" content="${robots || "index, follow"}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="${esc(SITE)}/favicon.ico">
<meta name="theme-color" content="${esc(CFG.color)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(titulo)} | ${esc(NEGOCIO)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:site_name" content="${esc(NEGOCIO)}">
<meta property="og:locale" content="es_AR">
${extraHead || ""}
<style>${CSS}</style>
</head>
<body>
<div class="top"><div class="wrap"><a href="${esc(SITE)}/">${esc(NEGOCIO)}</a></div></div>
<main class="wrap">
${cuerpo}
</main>
<footer class="wrap">
<p><a href="${esc(SITE)}/">Volver al catálogo</a>${POL.activo ? ` · <a href="${esc(SITE)}/devoluciones/">Política de devoluciones</a>` : ""}${POL.arrepentimiento ? ` · <a href="${esc(SITE)}/arrepentimiento/">Botón de arrepentimiento</a>` : ""}</p>
</footer>
${script ? `<script>\n${script}\n</script>` : ""}
</body>
</html>
`;
}

/* ------------------------------ devoluciones ------------------------------ */

function textoCompensacion(d) {
    if (d.compensacion === "reemplazo") return "te enviamos el mismo producto en buen estado (o uno equivalente si no hay stock), sin costo";
    if (d.compensacion === "reintegro") return "te reintegramos el importe pagado por esas unidades, por el mismo medio de pago";
    const vig = Number(d.vigenciaCuponDias) > 0 ? `, válido por ${dias(d.vigenciaCuponDias)} desde que lo emitimos` : "";
    return `te generamos un <strong>cupón de descuento por el valor equivalente</strong> (lo que pagaste por las unidades con defecto) para usar en tu próximo pedido${vig}`;
}

function htmlDevoluciones() {
    const d = POL.defectos;
    const contacto = [
        WA ? `<a href="${esc(linkWa("Hola, quiero informar un producto con defecto de fábrica. Pedido N°: "))}">WhatsApp</a>` : "",
        POL.email ? `<a href="mailto:${esc(POL.email)}">${esc(POL.email)}</a>` : ""
    ].filter(Boolean).join(" o ");

    const secciones = [];

    // 1) Cambios y devoluciones
    if (!POL.aceptaCambios && !POL.aceptaDevoluciones) {
        secciones.push(`<h2>Cambios y devoluciones</h2>
<div class="destacado"><strong>No realizamos cambios ni devoluciones</strong>${d.activo ? ", salvo por productos con defecto de fábrica (ver abajo)" : ""}.</div>
<p>Te pedimos revisar bien tu pedido antes de confirmarlo: modelos, colores, medidas y cantidades.</p>`);
    } else {
        const que = POL.aceptaCambios && POL.aceptaDevoluciones ? "cambios y devoluciones" : POL.aceptaCambios ? "cambios" : "devoluciones";
        secciones.push(`<h2>Cambios y devoluciones</h2>
<p>Aceptamos ${que} dentro de los <strong>${dias(POL.plazoCambiosDias)}</strong> desde que recibís el pedido, con el producto sin uso, en su empaque original y con todos sus accesorios.</p>
<ul>
${POL.aceptaCambios ? "<li><strong>Cambio:</strong> por otro producto de igual o mayor valor (pagando la diferencia).</li>" : ""}
${POL.aceptaDevoluciones ? "<li><strong>Devolución:</strong> te reintegramos el importe por el mismo medio de pago, una vez que recibimos y revisamos el producto.</li>" : ""}
<li>El envío de vuelta está a cargo ${POL.envioCambiosACargoDe === "tienda" ? `de ${esc(NEGOCIO)}` : "del cliente"}.</li>
</ul>${contacto ? `\n<p>Para gestionarlo, escribinos por ${contacto} con tu número de pedido.</p>` : ""}`);
    }

    // 2) Defectos de fábrica
    if (d.activo) {
        secciones.push(`<h2>Productos con defecto de fábrica</h2>
<p>Si un producto${d.soloPedidosEnviados ? " de un pedido que te enviamos" : ""} llegó con un defecto de fábrica:</p>
<ol>
<li>Avisanos dentro de los <strong>${dias(d.plazoDias)}</strong> desde que recibiste el pedido${contacto ? `, por ${contacto}` : ""}.</li>
<li>Indicá tu número de pedido y mandanos <strong>${esc(d.evidencia)}</strong> donde se vea el defecto.</li>
<li>${d.devolverProducto ? "Coordinamos con vos cómo devolvernos el producto (el envío de vuelta lo paga " + esc(NEGOCIO) + ")." : "<strong>No hace falta que nos devuelvas el producto.</strong>"}</li>
<li>Revisamos el caso y, si corresponde, ${textoCompensacion(d)}.</li>
</ol>${d.compensacion === "cupon" ? `
<p>El cupón no se puede cambiar por dinero, se usa en compras por el catálogo online y se aplica sobre el total del pedido.</p>` : ""}
<p><strong>No se consideran defecto de fábrica:</strong> los daños por uso indebido, golpes o roturas posteriores a la entrega, ni el desgaste normal.${d.soloPedidosEnviados ? " Los pedidos retirados en el local se revisan al momento de retirarlos." : ""}</p>`);
    }

    // 3) Otras exclusiones
    const noCubre = (POL.noCubre || []).map(x => String(x || "").trim()).filter(Boolean);
    if (noCubre.length) secciones.push(`<h2>Otras condiciones</h2>\n<ul>\n${noCubre.map(x => `<li>${esc(x)}</li>`).join("\n")}\n</ul>`);

    // 4) Arrepentimiento (derecho legal: va siempre que se venda a consumidores)
    if (POL.arrepentimiento) {
        secciones.push(`<h2 id="arrepentimiento">Derecho de arrepentimiento (consumidores finales)</h2>
<p>Si compraste como <strong>consumidor final</strong>, podés arrepentirte de la compra dentro de los <strong>10 días corridos</strong> desde que recibiste el pedido, sin dar explicaciones, como establecen el artículo 34 de la Ley 24.240 de Defensa del Consumidor y el artículo 1110 del Código Civil y Comercial. El producto tiene que estar en las mismas condiciones en que lo recibiste, y el costo de la devolución corre por cuenta de ${esc(NEGOCIO)}.</p>
<p>Este derecho no aplica, entre otros casos previstos por la normativa, a productos comprados para reventa o para un proceso productivo, ni a productos usados o consumidos.</p>
<p><a class="btn" href="${esc(SITE)}/arrepentimiento/">Botón de arrepentimiento</a></p>`);
    }

    if (String(POL.textoAdicional || "").trim()) secciones.push(`<h2>Más información</h2>\n<p>${esc(POL.textoAdicional).replace(/\n/g, "<br>")}</p>`);

    secciones.push(`<p class="act">Esta política no limita los derechos que la Ley 24.240 de Defensa del Consumidor otorga a los consumidores finales.</p>`);

    const desc = !POL.aceptaCambios && !POL.aceptaDevoluciones
        ? `${NEGOCIO} no realiza cambios ni devoluciones.` + (d.activo ? ` Productos con defecto de fábrica: avisá dentro de ${dias(d.plazoDias)} y ${d.compensacion === "cupon" ? "te damos un cupón por el valor equivalente" : d.compensacion === "reemplazo" ? "te lo reemplazamos" : "te reintegramos el importe"}.` : "")
        : `Cambios y devoluciones en ${NEGOCIO}: ${dias(POL.plazoCambiosDias)} desde la entrega. Condiciones, defectos de fábrica y derecho de arrepentimiento.`;

    const ld = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Política de cambios y devoluciones",
        "url": `${SITE}/devoluciones/`,
        "isPartOf": { "@type": "WebSite", "name": NEGOCIO, "url": SITE + "/" },
        "breadcrumb": { "@type": "BreadcrumbList", "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": NEGOCIO, "item": SITE + "/" },
            { "@type": "ListItem", "position": 2, "name": "Política de devoluciones", "item": `${SITE}/devoluciones/` }
        ] }
    };

    return pagina({
        ruta: "devoluciones",
        titulo: "Política de cambios y devoluciones",
        descripcion: C.recortar(desc, 158),
        extraHead: `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
        cuerpo: `<h1>Política de cambios y devoluciones</h1>
<p class="act">Última actualización: ${esc(fechaHoy)}</p>
${secciones.join("\n\n")}`
    });
}

/* ------------------------------ arrepentimiento ------------------------------ */

function htmlArrepentimiento() {
    const canal = WA ? "WhatsApp" : POL.email ? "correo" : "";
    const script = `
(function(){
  var WA = ${JSON.stringify(WA || "")}, EMAIL = ${JSON.stringify(POL.email || "")}, NEG = ${JSON.stringify(NEGOCIO)};
  var f = document.getElementById("form-arr"), res = document.getElementById("resultado");
  f.addEventListener("submit", function(ev){
    ev.preventDefault();
    var d = new Date(), p = function(n){ return String(n).padStart(2, "0"); };
    var codigo = "ARR-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    var v = function(id){ return (document.getElementById(id).value || "").trim(); };
    var texto = "SOLICITUD DE ARREPENTIMIENTO (revocación de compra)\\n" +
      "Código: " + codigo + "\\nNombre: " + v("arr-nombre") + "\\nDNI: " + v("arr-dni") +
      "\\nN° de pedido: " + v("arr-pedido") + "\\nFecha de recepción: " + v("arr-fecha") +
      (v("arr-obs") ? "\\nComentario: " + v("arr-obs") : "");
    document.getElementById("arr-codigo").textContent = codigo;
    var a = document.getElementById("arr-enviar");
    a.href = WA ? "https://wa.me/" + WA + "?text=" + encodeURIComponent(texto)
               : "mailto:" + EMAIL + "?subject=" + encodeURIComponent("Arrepentimiento " + codigo + " - " + NEG) + "&body=" + encodeURIComponent(texto);
    f.classList.add("oculto"); res.classList.remove("oculto");
    a.focus();
  });
})();`;
    return pagina({
        ruta: "arrepentimiento",
        titulo: "Botón de arrepentimiento",
        descripcion: `Solicitá la revocación de tu compra en ${NEGOCIO} dentro de los 10 días corridos desde que la recibiste (Ley 24.240, art. 34).`,
        script,
        cuerpo: `<h1>Botón de arrepentimiento</h1>
<p>Si compraste como consumidor final, podés <strong>revocar tu compra dentro de los 10 días corridos</strong> desde que recibiste el pedido (artículo 34 de la Ley 24.240 y artículo 1110 del Código Civil y Comercial). No necesitás registrarte ni explicar el motivo.</p>
<p>No aplica a productos comprados para reventa o para un proceso productivo, ni a productos usados o consumidos. Ver la <a href="${esc(SITE)}/devoluciones/">política de devoluciones</a>.</p>

<form id="form-arr">
<label for="arr-nombre">Nombre y apellido</label>
<input id="arr-nombre" required autocomplete="name">
<label for="arr-dni">DNI</label>
<input id="arr-dni" required inputmode="numeric">
<label for="arr-pedido">Número de pedido</label>
<input id="arr-pedido" required>
<label for="arr-fecha">Fecha en que recibiste el pedido</label>
<input id="arr-fecha" type="date" required>
<label for="arr-obs">Comentario (opcional)</label>
<textarea id="arr-obs" rows="3"></textarea>
<p style="margin-top:16px"><button class="btn" type="submit">Solicitar arrepentimiento</button></p>
</form>

<div id="resultado" class="oculto destacado">
<p>Tu código de arrepentimiento es:</p>
<p class="codigo" id="arr-codigo"></p>
<p>Guardalo. Para completar la solicitud, envianos el mensaje ya armado por ${canal || "nuestros canales de contacto"}. Te confirmamos la recepción dentro de las 24 horas y coordinamos la devolución, sin costo para vos.</p>
<p><a class="btn" id="arr-enviar" href="#" target="_blank" rel="noopener">Enviar solicitud${canal ? " por " + canal : ""}</a></p>
</div>`
    });
}

/* ------------------------------ index.html ------------------------------ */

function enlacesPie() {
    const links = [];
    if (POL.activo) links.push(`<a href="devoluciones/" style="color:rgba(255,255,255,.85);">Política de cambios y devoluciones</a>`);
    if (POL.arrepentimiento) links.push(`<a href="arrepentimiento/" style="color:#fff;font-weight:700;">Botón de arrepentimiento</a>`);
    return `${MARCA_INI} (lo genera scripts/generar-politicas.js desde config.json) -->
${links.length ? `<p style="margin:0 0 12px; text-align:center;">${links.join(" · ")}</p>` : ""}
${MARCA_FIN}`;
}

function actualizarIndex() {
    const ruta = path.join(ROOT, "index.html");
    if (!fs.existsSync(ruta)) return;
    const html = fs.readFileSync(ruta, "utf8");
    const i = html.indexOf(MARCA_INI), f = html.indexOf(MARCA_FIN);
    let nuevo;
    if (i !== -1 && f > i) nuevo = html.slice(0, i) + enlacesPie() + html.slice(f + MARCA_FIN.length);
    else {
        // Primera vez: los enlaces van justo antes del copyright del pie
        const ancla = html.indexOf('<p id="footer-copyright"');
        if (ancla === -1) return console.warn("⚠️  index.html: no encontré el pie (footer-copyright); agregá los enlaces a mano.");
        nuevo = html.slice(0, ancla) + enlacesPie() + "\n        " + html.slice(ancla);
    }
    if (nuevo !== html) { fs.writeFileSync(ruta, nuevo, "utf8"); console.log("✔ index.html: enlaces legales en el pie."); }
}

/* ------------------------------ main ------------------------------ */

function escribir(ruta, contenido) {
    const dir = path.join(ROOT, ruta);
    const archivo = path.join(dir, "index.html");
    // Sin cambios de contenido no se reescribe (la fecha de "última actualización" no cuenta)
    const sinFecha = (s) => s.replace(/Última actualización: [^<]*/, "");
    if (fs.existsSync(archivo) && sinFecha(fs.readFileSync(archivo, "utf8")) === sinFecha(contenido)) return false;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(archivo, contenido, "utf8");
    return true;
}

function borrar(ruta) {
    const dir = path.join(ROOT, ruta);
    if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); console.log("🗑️  /" + ruta + "/ (desactivada en config.json)"); }
}

if (!SITE) { console.error("❌ Falta sitioUrl en config.json"); process.exit(1); }
if (!WA && !POL.email) console.warn("⚠️  Sin whatsapp ni politicaDevoluciones.email en config.json: las páginas no tienen cómo contactarte.");

if (POL.activo) { if (escribir("devoluciones", htmlDevoluciones())) console.log("✔ /devoluciones/"); } else borrar("devoluciones");
if (POL.arrepentimiento) { if (escribir("arrepentimiento", htmlArrepentimiento())) console.log("✔ /arrepentimiento/"); } else borrar("arrepentimiento");
actualizarIndex();
console.log("✅ Páginas legales al día.");
