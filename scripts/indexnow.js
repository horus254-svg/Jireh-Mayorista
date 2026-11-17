#!/usr/bin/env node
/**
 * indexnow.js — avisa a los buscadores que usan IndexNow (Bing, Yandex,
 * Seznam, Naver, Yep…) qué páginas del sitio son nuevas, cambiaron o
 * desaparecieron, para que las vuelvan a rastrear enseguida en lugar de
 * esperar a pasar solos. (Google NO usa IndexNow: para Google sigue
 * valiendo el sitemap.xml + Search Console.)
 *
 * Cómo decide qué avisar:
 *   - Lee sitemap.xml y, para cada URL, calcula una huella (hash) del
 *     archivo publicado (producto/…/index.html, categoria/…/index.html,
 *     index.html).
 *   - Compara contra .github/indexnow-estado.json (lo último que se avisó).
 *   - Avisa solo las URLs nuevas o cuyo contenido cambió, y las que salieron
 *     del sitemap y ya no existen (así el buscador ve el 404 y las saca).
 *   - Si el aviso sale bien, actualiza el estado. Si falla, no lo toca y el
 *     próximo run vuelve a intentar con las mismas URLs.
 *
 * Antes de avisar espera a que GitHub Pages publique este mismo sitemap
 * (si no, el buscador vendría a buscar páginas que todavía no están).
 *
 * La clave (indexNowClave en config.json) y su archivo <clave>.txt los crea
 * scripts/aplicar-cliente.js. Como el sitio vive en una subcarpeta
 * (usuario.github.io/Repo/), se informa keyLocation: IndexNow acepta las
 * URLs que estén dentro de la carpeta donde está el archivo de la clave.
 *
 * Uso (Node 18+, sin dependencias):
 *   node scripts/indexnow.js              avisa lo pendiente (lo que corre el workflow)
 *   node scripts/indexnow.js --prueba     muestra qué avisaría, sin enviar ni guardar
 *   node scripts/indexnow.js --todo       reenvía TODAS las URLs del sitemap
 *   node scripts/indexnow.js --sin-esperar  no espera a que Pages publique
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const C = require("./seo-comun.js");

const ROOT = C.ROOT;
const CFG = C.cargarConfig();
const SITE = CFG.siteUrl; // sin barra final
const CLAVE = String(CFG.crudo.indexNowClave || "").trim();
const ESTADO = path.join(ROOT, ".github", "indexnow-estado.json");
const ENDPOINT = process.env.INDEXNOW_ENDPOINT || "https://api.indexnow.org/indexnow";
const LOTE = 10000; // máximo de URLs por envío según el protocolo

const args = process.argv.slice(2);
const PRUEBA = args.includes("--prueba");
const TODO = args.includes("--todo");
const SIN_ESPERAR = args.includes("--sin-esperar");

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 20);

function decodificarEntidades(s) {
    return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** URL pública → archivo local que GitHub Pages sirve para ella. */
function archivoDe(url) {
    if (!url.startsWith(SITE)) return null;
    let rel = url.slice(SITE.length).split(/[?#]/)[0];
    try { rel = decodeURIComponent(rel); } catch (e) { return null; }
    rel = rel.replace(/^\/+/, "");
    if (!rel || rel.endsWith("/")) rel += "index.html";
    const abs = path.join(ROOT, rel);
    return abs.startsWith(ROOT) ? abs : null;
}

function huella(url) {
    const f = archivoDe(url);
    if (f && fs.existsSync(f)) return hash(fs.readFileSync(f));
    return null;
}

async function pedir(url, opciones = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    try { return await fetch(url, { signal: ctl.signal, ...opciones }); }
    finally { clearTimeout(t); }
}

/** Espera (hasta ~10 min) a que el sitemap y la clave publicados coincidan con los locales. */
async function esperarPublicacion(sitemapLocal, keyLocation) {
    const limite = Date.now() + 10 * 60 * 1000;
    let intento = 0;
    while (true) {
        intento++;
        let sitemapOk = false, claveOk = false;
        try {
            const r = await pedir(`${SITE}/sitemap.xml?v=${Date.now()}`, { headers: { "cache-control": "no-cache" } });
            sitemapOk = r.ok && (await r.text()).trim() === sitemapLocal.trim();
        } catch (e) {}
        try {
            const r = await pedir(`${keyLocation}?v=${Date.now()}`, { headers: { "cache-control": "no-cache" } });
            claveOk = r.ok && (await r.text()).trim() === CLAVE;
        } catch (e) {}
        if (sitemapOk && claveOk) { console.log("  GitHub Pages ya publicó el sitemap y la clave."); return true; }
        if (Date.now() > limite) {
            console.warn(`  ⚠️  Pasaron 10 minutos y Pages todavía no muestra lo nuevo (sitemap ${sitemapOk ? "ok" : "pendiente"}, clave ${claveOk ? "ok" : "pendiente"}).`);
            return claveOk; // sin la clave publicada el aviso sería rechazado
        }
        if (intento === 1) console.log("  Esperando a que GitHub Pages publique los cambios…");
        await dormir(20000);
    }
}

(async () => {
    if (!SITE) { console.error("❌ Falta sitioUrl en config.json"); process.exit(1); }
    if (!/^[a-zA-Z0-9-]{8,128}$/.test(CLAVE)) {
        console.error("❌ Falta indexNowClave en config.json (la genera sola: node scripts/aplicar-cliente.js).");
        process.exit(1);
    }
    if (!fs.existsSync(path.join(ROOT, CLAVE + ".txt"))) {
        console.error(`❌ No existe ${CLAVE}.txt en la raíz del sitio (correr node scripts/aplicar-cliente.js).`);
        process.exit(1);
    }

    const u = new URL(SITE + "/");
    const keyLocation = `${SITE}/${CLAVE}.txt`;
    console.log("INDEXNOW — " + SITE);

    const sitemapLocal = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
    const locs = [...sitemapLocal.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodificarEntidades(m[1].trim()));
    if (!locs.length) { console.error("❌ sitemap.xml no tiene URLs."); process.exit(1); }

    let anterior = {};
    try { anterior = JSON.parse(fs.readFileSync(ESTADO, "utf8")).urls || {}; } catch (e) {}

    const nuevo = {};
    const avisar = [];
    let nuevas = 0, cambiadas = 0, quitadas = 0;
    for (const loc of locs) {
        const h = huella(loc) || "sin-archivo";
        nuevo[loc] = h;
        if (TODO || !(loc in anterior)) { avisar.push(loc); if (!(loc in anterior)) nuevas++; }
        else if (anterior[loc] !== h) { avisar.push(loc); cambiadas++; }
    }
    for (const loc of Object.keys(anterior)) {
        if (loc in nuevo) continue;
        if (huella(loc)) { nuevo[loc] = anterior[loc]; continue; } // salió del sitemap pero la página sigue: nada que avisar
        avisar.push(loc); quitadas++; // ya no existe → el buscador verá 404
    }

    console.log(`  ${locs.length} URLs en el sitemap · ${nuevas} nuevas · ${cambiadas} cambiadas · ${quitadas} eliminadas${TODO ? " · (--todo: se reenvían todas)" : ""}`);
    if (!avisar.length) { console.log("✅ Nada nuevo para avisar."); return; }

    if (PRUEBA) {
        avisar.slice(0, 30).forEach((x) => console.log("  · " + x));
        if (avisar.length > 30) console.log(`  … y ${avisar.length - 30} más`);
        console.log(`(--prueba: no se envió nada; se avisarían ${avisar.length} URLs)`);
        return;
    }

    if (!SIN_ESPERAR && !(await esperarPublicacion(sitemapLocal, keyLocation))) {
        console.error(`❌ La clave no está publicada en ${keyLocation}; no se avisa (se reintenta en el próximo run).`);
        process.exit(1);
    }

    for (let i = 0; i < avisar.length; i += LOTE) {
        const urlList = avisar.slice(i, i + LOTE);
        let r, cuerpo = "";
        for (let intento = 1; intento <= 3; intento++) {
            try {
                r = await pedir(ENDPOINT, {
                    method: "POST",
                    headers: { "content-type": "application/json; charset=utf-8" },
                    body: JSON.stringify({ host: u.host, key: CLAVE, keyLocation, urlList })
                });
                cuerpo = await r.text().catch(() => "");
                if (r.status !== 429 && r.status < 500) break;
            } catch (e) { cuerpo = e.message; r = null; }
            await dormir(5000 * intento);
        }
        const st = r ? r.status : "sin respuesta";
        if (st === 200 || st === 202) {
            console.log(`  ✔ IndexNow aceptó ${urlList.length} URLs (HTTP ${st}).`);
        } else {
            const motivo = {
                400: "pedido mal formado", 403: "la clave no coincide con el archivo publicado",
                422: "hay URLs que no pertenecen al host o a la carpeta de la clave", 429: "demasiados envíos, probar más tarde"
            }[st] || "";
            console.error(`❌ IndexNow respondió HTTP ${st}${motivo ? " — " + motivo : ""}. ${cuerpo.slice(0, 300)}`);
            process.exit(1);
        }
    }

    fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
    const ordenado = Object.fromEntries(Object.keys(nuevo).sort().map((k) => [k, nuevo[k]]));
    fs.writeFileSync(ESTADO, JSON.stringify({ _LEEME: "Lo usa scripts/indexnow.js para avisar solo lo que cambió. No editar.", urls: ordenado }, null, 1) + "\n");
    console.log(`✅ Aviso enviado (${avisar.length} URLs). Estado guardado.`);
})().catch((e) => { console.error("❌ Error en IndexNow:", e); process.exit(1); });
