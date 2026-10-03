/* ===================================================================
   REPORTES PWA
   Muestra los MISMOS reportes que la sección Reportes del panel
   (Ventas, Productos y Compras y reposición), con el mismo código:
   todo lo que está debajo de "REPORTES" se copió tal cual de admin.js
   — si se cambia un reporte en el panel, se vuelve a copiar acá.
   Solo lee datos del backend (Apps Script); no escribe nada.
   API_URL y el nombre del negocio se leen de config.js.
=================================================================== */

let API_URL = "";

/* ---- Sesión: requiere haber pasado por login.html ---- */
if (sessionStorage.getItem("admin") !== "true") {
  window.location.replace("login.html");
  throw new Error("Sin sesión: redirigiendo a login.html");
}

function cerrarSesion() {
  sessionStorage.removeItem("admin");
  window.location.href = "login.html";
}

/* ---- Lo que en el panel viene de otras partes de admin.js ---- */
function fetchAPI(url, opciones) { return fetch(url, opciones); }
function obtenerRolActual() { return sessionStorage.getItem("rol") || "admin"; }
function obtenerConfigNegocio() {
  return { nombre: (typeof CONFIG_NEGOCIO !== "undefined" && CONFIG_NEGOCIO.NOMBRE_NEGOCIO) || "Reportes" };
}
// Con el Code.gs nuevo el reporte ya trae stock y categoría; esto solo
// existe para que el código copiado del panel no falle con uno viejo.
let productosAdminGlobal = [];
async function cargarProductos() {
  try {
    const r = await fetch(API_URL + "?action=productosAdmin");
    const d = await r.json();
    productosAdminGlobal = d.productos || [];
  } catch (e) { productosAdminGlobal = []; }
}

function toast(mensaje, tipo) {
  const box = document.getElementById("toastBox");
  if (!box) return;
  box.textContent = mensaje;
  box.className = "toast-pwa show" + (tipo === "error" ? " error" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => box.classList.remove("show"), 3200);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function escapeJsAttr(text) {
  // Orden correcto: primero se escapa para el string JS (\ y '), y RECIÉN
  // DESPUÉS para el atributo HTML. Antes solo se convertía ' en &#39;, que el
  // navegador decodifica de nuevo a ' ANTES de ejecutar el JS, así que el
  // apóstrofe seguía cortando el string. Sirve tanto para onclick="..." como
  // para onclick='...'.
  const js = String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, " ");
  return js
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function actualizarElemento(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}

async function _leerRespuestaJSON(response) {
  const texto = await response.text();
  try { return JSON.parse(texto); }
  catch (e) {
    throw new Error(response.ok
      ? "El servidor devolvió una respuesta inválida"
      : `El servidor respondió ${response.status} — revisá la implementación de Apps Script`);
  }
}

function normalizarBusquedaPOS(t) {
  return String(t || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function descargarArchivo(nombre, contenido, tipo = "text/plain") {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}


/* ===================== REPORTES ===================== */

/** Lee el filtro de fecha compartido por los 6 reportes. Si está vacío, el backend usa el mes en curso. */
function obtenerRangoReportes() {
  const desde = document.getElementById("repDesde").value;
  const hasta = document.getElementById("repHasta").value;
  let qs = "";
  if (desde) qs += "&desde=" + encodeURIComponent(desde);
  if (hasta) qs += "&hasta=" + encodeURIComponent(hasta);
  return qs;
}

/* ---- Pestañas de Reportes: cada una carga recién cuando se abre, y
   solo si el período cambió desde la última vez (no se piden los 3
   grupos de datos de golpe al entrar a la sección). ---- */
let _repTabActiva = null;
const _repTabRangoCargado = { ventas: null, productos: null, compras: null };

function _repTabPorDefecto() {
  return obtenerRolActual() === "deposito" ? "compras" : "ventas";
}

function mostrarTabReportes(tab, forzar) {
  if (obtenerRolActual() === "deposito") tab = "compras";
  _repTabActiva = tab;
  _repCompletarRangoPorDefecto();
  document.querySelectorAll("#repTabs .rep-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll("#reportes .rep-pane").forEach(p => p.classList.toggle("active", p.id === "repPane-" + tab));

  const rango = obtenerRangoReportes();
  if (!forzar && _repTabRangoCargado[tab] !== null && _repTabRangoCargado[tab] === rango) {
    // Ya cargada con este período: si es la de productos, redibujar los
    // gráficos (estaban ocultos y Chart.js necesita el ancho real)
    if (tab === "productos" && _repProductosDatosActuales.length) renderReporteProductos();
    return;
  }
  _repTabRangoCargado[tab] = rango;

  if (tab === "ventas") {
    cargarReporteVentasPeriodo();
    cargarReporteCategorias();
    cargarReporteFormasPago();
    cargarReporteCierres();
    cargarReporteClientes();
  } else if (tab === "productos") {
    cargarReporteProductos(forzar);
  } else if (tab === "compras") {
    cargarReporteCompras(forzar);
  }
}

/** Sin fechas elegidas: mes en curso (lo mismo que haría el backend), para que todas las pestañas usen el mismo período */
function _repCompletarRangoPorDefecto() {
  const d = document.getElementById("repDesde"), h = document.getElementById("repHasta");
  if (!d || !h) return;
  const hoy = new Date();
  const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  if (!d.value && !h.value) { d.value = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); h.value = iso(hoy); }
  else if (!h.value) h.value = iso(hoy);
  else if (!d.value) d.value = h.value;
}

/** Botón "Aplicar" (y la carga al entrar): recarga la pestaña visible; las otras se recargan al abrirlas */
function cargarTodosLosReportes(forzar) {
  _repTabRangoCargado.ventas = _repTabRangoCargado.productos = _repTabRangoCargado.compras = null;
  mostrarTabReportes(_repTabActiva || _repTabPorDefecto(), !!forzar);
}

/** Atajos de período: Hoy / 7 días / 30 días / Este mes / Mes anterior */
function repRangoRapido(tipo) {
  const hoy = new Date();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let desde = new Date(hoy), hasta = new Date(hoy);
  if (tipo === "7") desde.setDate(hoy.getDate() - 6);
  else if (tipo === "30") desde.setDate(hoy.getDate() - 29);
  else if (tipo === "mes") desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  else if (tipo === "mesAnterior") { desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0); }
  document.getElementById("repDesde").value = iso(desde);
  document.getElementById("repHasta").value = iso(hasta);
  cargarTodosLosReportes();
}

/** Sincroniza los inputs de fecha "Desde"/"Hasta" con el rango que devolvió el backend (cuando no se eligió nada, para que el usuario vea qué período se está mostrando). */
function sincronizarRangoReportes(desde, hasta) {
  const inputDesde = document.getElementById("repDesde");
  const inputHasta = document.getElementById("repHasta");
  if (inputDesde && !inputDesde.value) inputDesde.value = desde;
  if (inputHasta && !inputHasta.value) inputHasta.value = hasta;
}

/* ---- Cache de sesión para reportes (no persistente) ---- */
const _reporteCache = {};
function _cacheReporte(key, data) { _reporteCache[key] = { ts: Date.now(), data }; }
function _getCacheReporte(key, ttlMs = 90000) {
  const c = _reporteCache[key];
  return (c && Date.now() - c.ts < ttlMs) ? c.data : null;
}

/* ---- Selector "10 últimos / 20 últimos / todos" para cada uno de los 6 reportes ---- */
const _repLimites = { ventasPeriodo: 10, productos: 10, categorias: 10, formasPago: 10, cierres: 10, clientes: 10 };
const _repDatosActuales = { ventasPeriodo: [], categorias: [], formasPago: [], cierres: [], clientes: [] };

function _limitarReporte(lista, key) {
  const lim = _repLimites[key];
  return (lim === "all") ? lista : lista.slice(0, Number(lim));
}

/** Llamado por el <select> de cada reporte cuando el usuario elige 10 / 20 / todos. */
function cambiarLimiteReporte(key, valor) {
  _repLimites[key] = valor;
  switch (key) {
    case "ventasPeriodo": renderReporteVentasPeriodo(); break;
    case "productos": renderReporteProductos(); break;
    case "categorias": renderReporteCategorias(); break;
    case "formasPago": renderReporteFormasPago(); break;
    case "cierres": renderReporteCierres(); break;
    case "clientes": renderReporteClientes(); break;
  }
}

/* ---- Reporte 1: Ventas por período ---- */
async function cargarReporteVentasPeriodo() {
  const tbody = document.getElementById("repVentasPeriodoTabla");
  const resumenWrap = document.getElementById("repVentasPeriodoResumen");
  const cacheKey = "ventasPeriodo" + obtenerRangoReportes();
  const cached = _getCacheReporte(cacheKey);
  if (cached) { _aplicarReporteVentas(cached, tbody, resumenWrap); return; }

  try {
    const response = await fetchAPI(API_URL + "?action=reporteVentasPeriodo" + obtenerRangoReportes());
    const data = await response.json();
    if (!data.success) return;
    _cacheReporte(cacheKey, data);
    _aplicarReporteVentas(data, tbody, resumenWrap);
  } catch (error) {
    console.error("Error reporte ventas:", error);
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Error al cargar el reporte</td></tr>`;
  }
}

function _aplicarReporteVentas(data, tbody, resumenWrap) {
  sincronizarRangoReportes(data.desde, data.hasta);
  const r = data.resumen || {};
  resumenWrap.innerHTML = `
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="text-muted" style="font-size:11.5px;">Total POS</div><div class="money fw-bold">$${Number(r.totalPOS || 0).toLocaleString("es-AR")}</div></div></div>
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="text-muted" style="font-size:11.5px;">Total Pedidos</div><div class="money fw-bold">$${Number(r.totalPedidos || 0).toLocaleString("es-AR")}</div></div></div>
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="text-muted" style="font-size:11.5px;">Total general</div><div class="money fw-bold">$${Number(r.totalGeneral || 0).toLocaleString("es-AR")}</div></div></div>
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="text-muted" style="font-size:11.5px;">Ticket promedio</div><div class="money fw-bold">$${Number(r.ticketPromedio || 0).toLocaleString("es-AR")}</div></div></div>`;

  // Más reciente arriba, como en el resto de las tablas de reportes
  const diasOrdenados = data.dias ? [...data.dias].sort((a,b) => String(b.fecha).localeCompare(String(a.fecha))) : [];
  _repDatosActuales.ventasPeriodo = diasOrdenados;
  renderReporteVentasPeriodo();
}

/** Renderiza la tabla de ventas por período respetando el límite elegido (10 / 20 / todos). */
function renderReporteVentasPeriodo() {
  const tbody = document.getElementById("repVentasPeriodoTabla");
  if (!tbody) return;
  const diasOrdenados = _repDatosActuales.ventasPeriodo;

  if (!diasOrdenados || diasOrdenados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Sin ventas para el rango elegido</td></tr>`;
    return;
  }

  const lista = _limitarReporte(diasOrdenados, "ventasPeriodo");
  tbody.innerHTML = lista.map(d => {
    const fecha = d.fecha ? new Date(d.fecha + "T12:00:00").toLocaleDateString("es-AR") : "—";
    return `
      <tr>
        <td>${escapeHtml(fecha)}</td>
        <td class="money">$${Number(d.pos || 0).toLocaleString("es-AR")}</td>
        <td class="money">$${Number(d.pedidos || 0).toLocaleString("es-AR")}</td>
        <td class="money">$${Number(d.total || 0).toLocaleString("es-AR")}</td>
      </tr>`;
  }).join("");
}

/* ---- Reporte 2: Productos más vendidos ----
   Carga: una sola llamada (el backend ya trae período anterior, stock y
   categoría, y cachea el resultado). Mientras carga se muestra un
   esqueleto; si el usuario cambia de rango a mitad de una carga, la
   respuesta vieja se descarta (contador _repProductosGen). Buscador,
   categoría, orden y Top N filtran en memoria, sin volver a pedir nada. */
let _repProductosDatosActuales = []; // ranking completo del último período cargado
let _repProductosMeta = null;        // { desde, hasta, anterior, totales, totalesAnterior, generado }
let _repProductosGen = 0;
let _repProductosSinVentas = [];     // catálogo sin ventas en el período (solo para el buscador)

/**
 * Búsqueda de Reportes: sin acentos ni mayúsculas, por PALABRAS en
 * cualquier orden ("1kg yerba" encuentra "Yerba Playadito 1kg"), y
 * también por código, código de caja, alias o categoría. Un código
 * escrito con o sin ceros adelante ("0123" / "123") también coincide.
 */
function coincideBusquedaReportes(textoNormalizado, consulta) {
  const q = normalizarBusquedaPOS(consulta);
  if (!q) return true;
  const palabras = q.split(/\s+/).filter(Boolean);
  return palabras.every(w => {
    if (textoNormalizado.includes(w)) return true;
    if (/^\d+$/.test(w)) {
      const sinCeros = w.replace(/^0+/, "");
      return sinCeros.length >= 2 && textoNormalizado.split(/\s+/).some(t => t.replace(/^0+/, "") === sinCeros);
    }
    return false;
  });
}

const _fmtNum = n => Number(n || 0).toLocaleString("es-AR");
const _fmtPlata = n => "$" + Math.round(Number(n || 0)).toLocaleString("es-AR");
const _fmtFechaCorta = s => {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1].slice(2)}` : String(s || "");
};

/** Variación porcentual con texto y flecha (nunca solo color) */
function _repVariacion(actual, anterior) {
  actual = Number(actual || 0); anterior = Number(anterior || 0);
  if (!anterior && !actual) return { clase: "na", texto: "—", valor: 0 };
  if (!anterior) return { clase: "nuevo", texto: "● nuevo", valor: Infinity };
  const pct = (actual - anterior) / anterior * 100;
  if (Math.abs(pct) < 0.5) return { clase: "flat", texto: "= 0%", valor: 0 };
  const r = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return pct > 0
    ? { clase: "up", texto: `▲ ${r.toLocaleString("es-AR")}%`, valor: pct }
    : { clase: "down", texto: `▼ ${Math.abs(r).toLocaleString("es-AR")}%`, valor: pct };
}

function _repProductosEsqueleto() {
  const tbody = document.getElementById("repProductosTabla");
  if (!tbody) return;
  const fila = w => `<span class="rep-skel" style="width:${w}px;"></span>`;
  tbody.innerHTML = Array.from({ length: 6 }, (_, i) => `
    <tr>
      <td>${fila(14)}</td>
      <td>${fila(160 - i * 12)}<br>${fila(80)}</td>
      <td class="num">${fila(90)}</td>
      <td class="num">${fila(60)}</td>
      <td class="num d-none d-md-table-cell">${fila(34)}</td>
      <td class="num">${fila(44)}</td>
      <td class="num d-none d-md-table-cell">${fila(26)}</td>
    </tr>`).join("");
  const kpis = document.getElementById("repProductosKpis");
  if (kpis && !_repProductosMeta) {
    kpis.innerHTML = Array.from({ length: 4 }, () =>
      `<div class="rep-prod-kpi"><div class="lbl">${fila(70)}</div><div class="val">${fila(90)}</div></div>`).join("");
  }
}

/**
 * Pide reporteProductosVendidos para el período elegido, UNA sola vez:
 * Productos y Compras usan la misma respuesta (caché de sesión de 90 s +
 * la promesa en curso, así dos pestañas que la piden juntas no duplican
 * el pedido). forzar=true saltea ambas cachés (también la del servidor).
 */
const _repProdPedidosEnCurso = {};
async function _obtenerReporteProductosVendidos(forzar) {
  const rango = obtenerRangoReportes();
  const clave = "reporteProductosVendidos" + rango;
  if (!forzar) {
    const enCache = _getCacheReporte(clave);
    if (enCache) return enCache;
    if (_repProdPedidosEnCurso[clave]) return _repProdPedidosEnCurso[clave];
  }
  const promesa = (async () => {
    const response = await fetchAPI(API_URL + "?action=reporteProductosVendidos" + rango + (forzar ? "&sinCache=1&_=" + Date.now() : ""));
    const data = await _leerRespuestaJSON(response);
    if (data && data.success) {
      data._rango = "&desde=" + encodeURIComponent(data.desde) + "&hasta=" + encodeURIComponent(data.hasta);
      _cacheReporte(clave, data);
      _cacheReporte("reporteProductosVendidos" + data._rango, data);
    }
    return data;
  })();
  _repProdPedidosEnCurso[clave] = promesa;
  try { return await promesa; }
  finally { delete _repProdPedidosEnCurso[clave]; }
}

async function cargarReporteProductos(forzar) {
  const rango = obtenerRangoReportes();
  const estado = document.getElementById("repProductosEstado");
  const gen = ++_repProductosGen;

  if (!forzar) {
    const enCache = _getCacheReporte("reporteProductosVendidos" + rango);
    if (enCache) { _aplicar_cargarReporteProductos(enCache); return; }
  }

  // Si ya hay datos de este mismo rango, se dejan a la vista mientras se
  // actualiza; si es un rango nuevo, esqueleto.
  const mismoRango = _repProductosMeta && _repProductosMeta._rango === rango;
  if (!mismoRango) _repProductosEsqueleto();
  if (estado) estado.textContent = "Cargando…";

  try {
    const data = await _obtenerReporteProductosVendidos(forzar);
    if (gen !== _repProductosGen) return; // llegó tarde: ya se pidió otro rango
    if (!data || !data.success) {
      _repProductosError((data && data.message) || "El servidor no devolvió el reporte");
      return;
    }
    _aplicar_cargarReporteProductos(data);
  } catch (error) {
    if (gen !== _repProductosGen) return;
    console.error("Error al cargar reporte de productos vendidos:", error);
    _repProductosError("Error de conexión al cargar el reporte");
  }
}

function _repProductosError(mensaje) {
  const tbody = document.getElementById("repProductosTabla");
  const estado = document.getElementById("repProductosEstado");
  if (estado) estado.textContent = "";
  if (!tbody) return;
  if (_repProductosDatosActuales.length && _repProductosMeta) {
    // Se mantienen los datos anteriores en pantalla, solo se avisa
    toast(mensaje + " — se siguen mostrando los datos anteriores", "error");
    return;
  }
  tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">
    <div class="text-muted mb-2">⚠️ ${escapeHtml(mensaje)}</div>
    <button class="btn btn-outline-primary btn-sm" onclick="cargarReporteProductos(true)">Reintentar</button>
  </td></tr>`;
}

/** Aplica los datos (del backend o de la caché de sesión) y arma los filtros */
function _aplicar_cargarReporteProductos(data) {
  sincronizarRangoReportes(data.desde, data.hasta);
  _repProductosDatosActuales = (data.productos || []).map(p => ({
    ...p,
    CODIGO: String(p.CODIGO ?? ""),
    CATEGORIA: p.CATEGORIA || "Sin categoría",
    VENDIDOS: Number(p.VENDIDOS || 0),
    INGRESOS: Number(p.INGRESOS || 0),
    _busqueda: normalizarBusquedaPOS([p.PRODUCTO, p.CODIGO, p.CATEGORIA, p.ALIAS, p.CODIGO_CAJA].join(" "))
  }));

  // Productos del catálogo que NO se vendieron en el período: no van en el
  // ranking, pero el buscador los encuentra igual (antes "no aparecían").
  // El backend nuevo los manda en data.sinVentas; con uno viejo se usa el
  // catálogo que ya esté cargado en el panel.
  const vendidos = new Set(_repProductosDatosActuales.map(p => p.CODIGO));
  let sinVentas = [];
  if (Array.isArray(data.sinVentas)) {
    sinVentas = data.sinVentas.map(r => ({ CODIGO: String(r[0] ?? ""), PRODUCTO: r[1] || "", CATEGORIA: r[2] || "Sin categoría", STOCK: r[3], ALIAS: r[4] || "", CODIGO_CAJA: r[5] || "" }));
  } else if (typeof productosAdminGlobal !== "undefined" && Array.isArray(productosAdminGlobal)) {
    sinVentas = productosAdminGlobal.map(p => ({ CODIGO: String(p.CODIGO ?? ""), PRODUCTO: p.PRODUCTO || "", CATEGORIA: p.CATEGORIA || "Sin categoría", STOCK: p.STOCK, ALIAS: p.ALIAS || "", CODIGO_CAJA: p.CODIGO_CAJA || "" }));
  }
  _repProductosSinVentas = sinVentas
    .filter(p => p.CODIGO && !vendidos.has(p.CODIGO))
    .map(p => ({
      ...p, VENDIDOS: 0, INGRESOS: 0, VENDIDOS_ANTERIOR: 0, INGRESOS_ANTERIOR: 0, OPERACIONES: 0,
      EN_CATALOGO: true, SIN_VENTAS: true, DIAS: {},
      _busqueda: normalizarBusquedaPOS([p.PRODUCTO, p.CODIGO, p.CATEGORIA, p.ALIAS, p.CODIGO_CAJA].join(" "))
    }));

  // Totales: los manda el backend nuevo; con uno viejo se calculan acá
  const totales = data.totales || {
    unidades: _repProductosDatosActuales.reduce((s, p) => s + p.VENDIDOS, 0),
    ingresos: _repProductosDatosActuales.reduce((s, p) => s + p.INGRESOS, 0),
    productos: _repProductosDatosActuales.length
  };
  _repProductosMeta = {
    _rango: data._rango, desde: data.desde, hasta: data.hasta,
    anterior: data.anterior || null, totales, totalesAnterior: data.totalesAnterior || null,
    generado: data.generado || null, conComparacion: !!data.anterior,
    porDia: data.porDia || null
  };
  if (_repProductoSel && !_repProductosDatosActuales.some(p => p.CODIGO === _repProductoSel)) _repProductoSel = null;

  // Categorías presentes en el período (respeta la elegida si sigue existiendo)
  const selCat = document.getElementById("repProductosCategoria");
  if (selCat) {
    const actual = selCat.value;
    const cats = [...new Set(_repProductosDatosActuales.map(p => p.CATEGORIA))].sort((a, b) => a.localeCompare(b, "es"));
    selCat.innerHTML = `<option value="">Todas las categorías</option>` +
      cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    selCat.value = cats.includes(actual) ? actual : "";
  }

  const periodo = document.getElementById("repProductosPeriodo");
  if (periodo) {
    periodo.textContent = `${_fmtFechaCorta(data.desde)} al ${_fmtFechaCorta(data.hasta)}` +
      (data.anterior ? ` · comparado con ${_fmtFechaCorta(data.anterior.desde)} al ${_fmtFechaCorta(data.anterior.hasta)}` : "");
  }
  const estado = document.getElementById("repProductosEstado");
  if (estado) {
    const hora = data.generado ? new Date(data.generado) : new Date();
    estado.textContent = "Datos de las " + hora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }

  _renderKpisReporteProductos();
  renderReporteProductos();
}

function _renderKpisReporteProductos() {
  const cont = document.getElementById("repProductosKpis");
  const m = _repProductosMeta;
  if (!cont || !m) return;
  const t = m.totales, a = m.totalesAnterior;
  const comp = (act, ant) => {
    if (!a) return "";
    const v = _repVariacion(act, ant);
    return `<div class="sub"><span class="rep-tend ${v.clase}">${v.texto}</span> vs. período anterior</div>`;
  };
  // Concentración: cuánto de los ingresos explican los 10 primeros
  const top10 = [..._repProductosDatosActuales].sort((x, y) => y.INGRESOS - x.INGRESOS).slice(0, 10)
    .reduce((s, p) => s + p.INGRESOS, 0);
  const pctTop10 = t.ingresos ? Math.round(top10 / t.ingresos * 100) : 0;

  cont.innerHTML = `
    <div class="rep-prod-kpi"><div class="lbl">Unidades vendidas</div><div class="val">${_fmtNum(t.unidades)}</div>${comp(t.unidades, a && a.unidades)}</div>
    <div class="rep-prod-kpi"><div class="lbl">Ingresos por productos</div><div class="val">${_fmtPlata(t.ingresos)}</div>${comp(t.ingresos, a && a.ingresos)}</div>
    <div class="rep-prod-kpi"><div class="lbl">Productos distintos vendidos</div><div class="val">${_fmtNum(t.productos)}</div>${comp(t.productos, a && a.productos)}</div>
    <div class="rep-prod-kpi"><div class="lbl">Peso del Top 10</div><div class="val">${pctTop10}%</div><div class="sub">de los ingresos del período</div></div>`;
}

/** Lista filtrada y ordenada según buscador, categoría y orden (sin el Top N) */
function _repProductosFiltrados() {
  const texto = normalizarBusquedaPOS((document.getElementById("repProductosBuscador") || {}).value || "");
  const categoria = (document.getElementById("repProductosCategoria") || {}).value || "";
  const orden = (document.getElementById("repProductosOrden") || {}).value || "unidades";

  const consulta = (document.getElementById("repProductosBuscador") || {}).value || "";
  const base = texto ? _repProductosDatosActuales.concat(_repProductosSinVentas) : _repProductosDatosActuales;
  let lista = base.filter(p =>
    (!categoria || p.CATEGORIA === categoria) && (!texto || coincideBusquedaReportes(p._busqueda, consulta)));

  const varUnid = p => _repVariacion(p.VENDIDOS, p.VENDIDOS_ANTERIOR).valor;
  const stockNum = p => (p.STOCK === null || p.STOCK === undefined || p.STOCK === "") ? Infinity : Number(p.STOCK);
  const comparadores = {
    unidades: (x, y) => (y.VENDIDOS - x.VENDIDOS) || (y.INGRESOS - x.INGRESOS),
    ingresos: (x, y) => (y.INGRESOS - x.INGRESOS) || (y.VENDIDOS - x.VENDIDOS),
    suba: (x, y) => (varUnid(y) - varUnid(x)) || (y.VENDIDOS - x.VENDIDOS),
    baja: (x, y) => (varUnid(x) - varUnid(y)) || (y.VENDIDOS - x.VENDIDOS),
    stock: (x, y) => (stockNum(x) - stockNum(y)) || (y.VENDIDOS - x.VENDIDOS)
  };
  return lista.sort(comparadores[orden] || comparadores.unidades);
}

/** Renderiza la tabla (los parámetros viejos se ignoran: todo sale de los controles) */
function renderReporteProductos() {
  const tbody = document.getElementById("repProductosTabla");
  const pie = document.getElementById("repProductosPie");
  if (!tbody) return;

  const buscando = !!normalizarBusquedaPOS((document.getElementById("repProductosBuscador") || {}).value || "");
  if (!_repProductosDatosActuales.length && !buscando) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Sin ventas de productos en el período elegido</td></tr>`;
    if (pie) pie.textContent = "";
    const g = document.getElementById("repProdGraficos");
    if (g) g.style.display = "none";
    return;
  }

  const filtrados = _repProductosFiltrados();
  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">${buscando
      ? "Ningún producto del catálogo coincide con la búsqueda" + ((document.getElementById("repProductosCategoria") || {}).value ? " en esa categoría" : "")
      : "Ningún producto coincide con los filtros"}</td></tr>`;
    if (pie) pie.textContent = "";
    _repDibujarGraficos(filtrados);
    return;
  }

  // Buscando se muestran TODAS las coincidencias (con Top 10 quedaban productos afuera)
  const lista = buscando ? filtrados : _limitarReporte(filtrados, "productos");
  const maxUnid = Math.max(...lista.map(p => p.VENDIDOS), 1);
  const totalIngresos = (_repProductosMeta && _repProductosMeta.totales.ingresos) || 0;
  const conComparacion = _repProductosMeta && _repProductosMeta.conComparacion;

  tbody.innerHTML = lista.map((p, i) => {
    const anchoBarra = Math.max(2, Math.round(p.VENDIDOS / maxUnid * 100));
    const pct = totalIngresos ? (p.INGRESOS / totalIngresos * 100) : 0;
    const v = conComparacion ? _repVariacion(p.VENDIDOS, p.VENDIDOS_ANTERIOR) : { clase: "na", texto: "—" };
    const tituloVar = conComparacion ? `Período anterior: ${_fmtNum(p.VENDIDOS_ANTERIOR)} u.` : "";

    let stockHtml = `<span class="text-muted">—</span>`;
    if (p.EN_CATALOGO === false) stockHtml = `<span class="text-muted" title="El producto ya no está en el catálogo">eliminado</span>`;
    else if (p.STOCK !== null && p.STOCK !== undefined && p.STOCK !== "") {
      const st = Number(p.STOCK);
      // Stock bajo: no alcanza para repetir las ventas de este período
      stockHtml = st < p.VENDIDOS
        ? `<span class="rep-stock-bajo" title="Quedan menos unidades que las vendidas en el período">⚠ ${_fmtNum(st)}</span>`
        : _fmtNum(st);
    }

    if (p.SIN_VENTAS) {
      return `
      <tr class="rep-sin-ventas">
        <td class="rep-prod-rank">—</td>
        <td>
          <div class="rep-prod-nombre">${escapeHtml(p.PRODUCTO || "(sin nombre)")}</div>
          <div class="rep-prod-meta"><span class="mono">${escapeHtml(p.CODIGO)}</span> · ${escapeHtml(p.CATEGORIA)}</div>
        </td>
        <td class="num" colspan="4"><span class="text-muted" style="font-size:12px;">Sin ventas en este período</span></td>
        <td class="num d-none d-md-table-cell">${stockHtml}</td>
      </tr>`;
    }
    const sel = p.CODIGO === _repProductoSel;
    return `
      <tr class="rep-fila${sel ? " rep-sel" : ""}" onclick="repSeleccionarProducto('${escapeJsAttr(p.CODIGO)}')" title="Ver la evolución de este producto">
        <td class="rep-prod-rank">${i + 1}</td>
        <td>
          <div class="rep-prod-nombre">${escapeHtml(p.PRODUCTO || "(sin nombre)")}</div>
          <div class="rep-prod-meta"><span class="mono">${escapeHtml(p.CODIGO)}</span> · ${escapeHtml(p.CATEGORIA)}${p.OPERACIONES ? ` · en ${_fmtNum(p.OPERACIONES)} venta${p.OPERACIONES === 1 ? "" : "s"}` : ""}</div>
        </td>
        <td class="num">
          <div class="rep-prod-barra" title="${_fmtNum(p.VENDIDOS)} unidades">
            <div class="track"><div class="fill" style="width:${anchoBarra}%;"></div></div>
            <span>${_fmtNum(p.VENDIDOS)}</span>
          </div>
        </td>
        <td class="num">${_fmtPlata(p.INGRESOS)}</td>
        <td class="num d-none d-md-table-cell">${pct >= 0.1 ? pct.toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%" : "<0,1%"}</td>
        <td class="num"><span class="rep-tend ${v.clase}" title="${escapeHtml(tituloVar)}">${v.texto}</span></td>
        <td class="num d-none d-md-table-cell">${stockHtml}</td>
      </tr>`;
  }).join("");

  if (pie) {
    const conVentas = filtrados.filter(p => !p.SIN_VENTAS).length;
    const partes = buscando
      ? [`${_fmtNum(filtrados.length)} coincidencia${filtrados.length === 1 ? "" : "s"}: ${_fmtNum(conVentas)} con ventas y ${_fmtNum(filtrados.length - conVentas)} sin ventas en el período`]
      : [`Mostrando ${_fmtNum(lista.length)} de ${_fmtNum(filtrados.length)} productos vendidos`];
    if (!buscando && filtrados.length !== _repProductosDatosActuales.length) partes.push(`(${_fmtNum(_repProductosDatosActuales.length)} en total)`);
    if (!conComparacion) partes.push("· la comparación con el período anterior aparece al actualizar el Code.gs");
    pie.textContent = partes.join(" ");
  }
  _repDibujarGraficos(filtrados.filter(p => !p.SIN_VENTAS));
}


/* ---- Gráficos del reporte de productos (Chart.js, ya cargado en index.html) ----
   Siguen los mismos filtros que la tabla. Un solo tono (azul) para el
   período actual y gris para el anterior; la categoría o el producto
   elegido se resalta y el resto queda más claro. */
const _REP_AZUL = "#2563eb";
const _REP_AZUL_CLARO = "rgba(37,99,235,.28)";
const _REP_GRIS = "#b8c1cf";
const _REP_GRILLA = "#eef1f6";
const _REP_TEXTO = "#6b7585";
let _repCharts = {};
let _repProductoSel = null; // código del producto elegido para el gráfico diario

const _fmtCompacto = n => {
  const v = Math.abs(Number(n || 0));
  if (v >= 1e6) return (n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " M";
  if (v >= 1e3) return (n / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " mil";
  return Number(n || 0).toLocaleString("es-AR");
};
const _recortar = (t, n) => { t = String(t || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

function _repOpcionesBase() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: "#0b1633", padding: 10, cornerRadius: 8, titleFont: { weight: "600" }, displayColors: true, boxPadding: 4 }
    }
  };
}

function _repDibujarGraficos(filtrados) {
  const cont = document.getElementById("repProdGraficos");
  if (!cont) return;
  if (typeof Chart === "undefined") { cont.style.display = "none"; return; } // sin internet la 1ª vez no carga la librería
  cont.style.display = "";
  _repDibujarGraficoTop(filtrados);
  _repDibujarGraficoCategorias();
  _repDibujarGraficoDias();
}

/* -- 1. Top 10: barras horizontales, período actual vs. anterior -- */
function _repDibujarGraficoTop(filtrados) {
  const canvas = document.getElementById("repGrafTop");
  if (!canvas) return;
  if (_repCharts.top) _repCharts.top.destroy();

  const orden = (document.getElementById("repProductosOrden") || {}).value || "unidades";
  const porIngresos = orden === "ingresos";
  const valor = p => porIngresos ? p.INGRESOS : p.VENDIDOS;
  const valorAnt = p => porIngresos ? Number(p.INGRESOS_ANTERIOR || 0) : Number(p.VENDIDOS_ANTERIOR || 0);
  const top = [...filtrados].sort((a, b) => valor(b) - valor(a)).slice(0, 10);
  const conComparacion = _repProductosMeta && _repProductosMeta.conComparacion;
  const fmt = porIngresos ? _fmtPlata : (n => _fmtNum(n) + " u.");

  const titulo = document.getElementById("repGrafTopTitulo");
  if (titulo) titulo.textContent = `Top ${top.length} por ${porIngresos ? "ingresos" : "unidades"}` + (conComparacion ? " — este período vs. el anterior" : "");

  const resaltar = p => !_repProductoSel || p.CODIGO === _repProductoSel;
  const datasets = [{
    label: "Este período",
    data: top.map(valor),
    backgroundColor: top.map(p => resaltar(p) ? _REP_AZUL : _REP_AZUL_CLARO),
    borderRadius: 4, borderSkipped: "start", barPercentage: .85, categoryPercentage: .75
  }];
  if (conComparacion) datasets.push({
    label: "Período anterior",
    data: top.map(valorAnt),
    backgroundColor: _REP_GRIS,
    borderRadius: 4, borderSkipped: "start", barPercentage: .85, categoryPercentage: .75
  });

  const op = _repOpcionesBase();
  op.indexAxis = "y";
  op.plugins.legend = { display: conComparacion, position: "bottom", labels: {
    boxWidth: 10, boxHeight: 10, font: { size: 11 }, color: _REP_TEXTO,
    // La leyenda usa siempre el azul pleno (las barras pueden estar aclaradas por la selección)
    generateLabels: ch => ch.data.datasets.map((ds, i) => ({
      text: ds.label, datasetIndex: i, hidden: !ch.isDatasetVisible(i),
      fillStyle: i === 0 ? _REP_AZUL : _REP_GRIS, strokeStyle: i === 0 ? _REP_AZUL : _REP_GRIS, lineWidth: 0
    }))
  } };
  op.plugins.tooltip.callbacks = {
    title: items => top[items[0].dataIndex].PRODUCTO,
    label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}`
  };
  op.scales = {
    x: { beginAtZero: true, grid: { color: _REP_GRILLA }, border: { display: false }, ticks: { color: _REP_TEXTO, font: { size: 11 }, callback: v => porIngresos ? "$" + _fmtCompacto(v) : _fmtCompacto(v) } },
    y: { grid: { display: false }, border: { display: false }, ticks: { color: "#334155", font: { size: 11.5 }, callback: (v, i) => _recortar(top[i] && top[i].PRODUCTO, 26) } }
  };
  op.onClick = (evt, elementos) => { if (elementos.length) repSeleccionarProducto(top[elementos[0].index].CODIGO); };
  op.onHover = (evt, elementos) => { evt.native.target.style.cursor = elementos.length ? "pointer" : "default"; };

  _repCharts.top = new Chart(canvas, { type: "bar", data: { labels: top.map(p => p.CODIGO), datasets }, options: op });
}

/* -- 2. Ingresos por categoría: barras horizontales ordenadas (8 + "Otras") -- */
function _repDibujarGraficoCategorias() {
  const canvas = document.getElementById("repGrafCategorias");
  if (!canvas) return;
  if (_repCharts.cat) _repCharts.cat.destroy();

  // Respeta el buscador pero NO la categoría (si no, siempre habría una sola barra)
  const texto = normalizarBusquedaPOS((document.getElementById("repProductosBuscador") || {}).value || "");
  const catSel = (document.getElementById("repProductosCategoria") || {}).value || "";
  const sumas = {};
  _repProductosDatosActuales.forEach(p => {
    if (texto && !p._busqueda.includes(texto)) return;
    sumas[p.CATEGORIA] = (sumas[p.CATEGORIA] || 0) + p.INGRESOS;
  });
  let filas = Object.entries(sumas).sort((a, b) => b[1] - a[1]);
  if (filas.length > 9) {
    const otras = filas.slice(8).reduce((s, f) => s + f[1], 0);
    filas = filas.slice(0, 8).concat([["Otras", otras]]);
  }
  const total = filas.reduce((s, f) => s + f[1], 0);

  const op = _repOpcionesBase();
  op.indexAxis = "y";
  op.plugins.tooltip.callbacks = {
    label: ctx => ` ${_fmtPlata(ctx.raw)} (${total ? (ctx.raw / total * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) : 0}%)`
  };
  op.scales = {
    x: { beginAtZero: true, grid: { color: _REP_GRILLA }, border: { display: false }, ticks: { color: _REP_TEXTO, font: { size: 11 }, callback: v => "$" + _fmtCompacto(v) } },
    y: { grid: { display: false }, border: { display: false }, ticks: { color: "#334155", font: { size: 11.5 }, callback: (v, i) => _recortar(filas[i] && filas[i][0], 20) } }
  };
  op.onClick = (evt, elementos) => {
    if (!elementos.length) return;
    const cat = filas[elementos[0].index][0];
    if (cat === "Otras") return;
    const sel = document.getElementById("repProductosCategoria");
    if (sel) { sel.value = sel.value === cat ? "" : cat; renderReporteProductos(); }
  };
  op.onHover = (evt, elementos) => {
    const ok = elementos.length && filas[elementos[0].index][0] !== "Otras";
    evt.native.target.style.cursor = ok ? "pointer" : "default";
  };

  _repCharts.cat = new Chart(canvas, {
    type: "bar",
    data: {
      labels: filas.map(f => f[0]),
      datasets: [{
        label: "Ingresos",
        data: filas.map(f => f[1]),
        backgroundColor: filas.map(f => (!catSel || f[0] === catSel) ? _REP_AZUL : _REP_AZUL_CLARO),
        borderRadius: 4, borderSkipped: "start", barPercentage: .8
      }]
    },
    options: op
  });
}

/* -- 3. Evolución por día (o por semana si el período es largo) -- */
function _repDibujarGraficoDias() {
  const canvas = document.getElementById("repGrafDias");
  const aviso = document.getElementById("repGrafDiasAviso");
  const chip = document.getElementById("repGrafDiasChip");
  const titulo = document.getElementById("repGrafDiasTitulo");
  if (!canvas) return;
  if (_repCharts.dias) { _repCharts.dias.destroy(); _repCharts.dias = null; }

  const meta = _repProductosMeta;
  const serieBase = meta && meta.porDia;
  if (!serieBase || !serieBase.length) {
    canvas.parentElement.style.display = "none";
    if (aviso) { aviso.style.display = "block"; aviso.textContent = "Este gráfico aparece al publicar el Code.gs nuevo (necesita las ventas día por día)."; }
    return;
  }
  canvas.parentElement.style.display = "";
  if (aviso) aviso.style.display = "none";

  const metrica = (document.getElementById("repGrafDiasMetrica") || {}).value || "unidades";
  const idx = metrica === "ingresos" ? 1 : 0;
  const catSel = (document.getElementById("repProductosCategoria") || {}).value || "";
  const prod = _repProductoSel ? _repProductosDatosActuales.find(p => p.CODIGO === _repProductoSel) : null;

  // Qué se grafica: un producto, una categoría o el total
  let valores, etiqueta;
  if (prod) {
    valores = serieBase.map(d => { const par = (prod.DIAS || {})[d.fecha]; return par ? Number(Array.isArray(par) ? par[idx] : (idx ? 0 : par)) : 0; });
    etiqueta = prod.PRODUCTO;
  } else if (catSel) {
    const enCat = _repProductosDatosActuales.filter(p => p.CATEGORIA === catSel);
    valores = serieBase.map(d => enCat.reduce((s, p) => { const par = (p.DIAS || {})[d.fecha]; return s + (par ? Number(Array.isArray(par) ? par[idx] : (idx ? 0 : par)) : 0); }, 0));
    etiqueta = catSel;
  } else {
    valores = serieBase.map(d => Number(idx ? d.ingresos : d.unidades) || 0);
    etiqueta = "Todos los productos";
  }

  if (chip) {
    if (prod) {
      chip.style.display = "inline-flex";
      chip.innerHTML = `<span>${escapeHtml(prod.PRODUCTO)}</span><button type="button" title="Ver todos" onclick="repSeleccionarProducto(null)">✕</button>`;
    } else chip.style.display = "none";
  }

  // Más de 2 meses: por semana (lunes a domingo), si no se vuelve ilegible
  let etiquetas = serieBase.map(d => d.fecha);
  let porSemana = false;
  if (serieBase.length > 62) {
    porSemana = true;
    const semanas = [];
    serieBase.forEach((d, i) => {
      const f = new Date(d.fecha + "T12:00:00");
      const lunes = new Date(f); lunes.setDate(f.getDate() - ((f.getDay() + 6) % 7));
      const clave = lunes.toISOString().slice(0, 10);
      const ult = semanas[semanas.length - 1];
      if (ult && ult.clave === clave) ult.valor += valores[i];
      else semanas.push({ clave, valor: valores[i] });
    });
    etiquetas = semanas.map(s => s.clave);
    valores = semanas.map(s => s.valor);
  }

  if (titulo) titulo.textContent = `${metrica === "ingresos" ? "Ingresos" : "Unidades vendidas"} por ${porSemana ? "semana" : "día"} — ${etiqueta}`;

  const fmt = metrica === "ingresos" ? _fmtPlata : (n => _fmtNum(n) + " u.");
  const fmtEje = f => _fmtFechaCorta(f).replace(/\/\d{2}$/, ""); // "3/10"
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, "rgba(37,99,235,.18)");
  grad.addColorStop(1, "rgba(37,99,235,0)");

  const op = _repOpcionesBase();
  op.interaction = { mode: "index", intersect: false };
  op.plugins.tooltip.callbacks = {
    title: items => (porSemana ? "Semana del " : "") + _fmtFechaCorta(etiquetas[items[0].dataIndex]),
    label: c => ` ${fmt(c.raw)}`
  };
  op.scales = {
    x: { grid: { display: false }, border: { color: _REP_GRILLA }, ticks: { color: _REP_TEXTO, font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12, callback: (v, i) => fmtEje(etiquetas[i]) } },
    y: { beginAtZero: true, grid: { color: _REP_GRILLA }, border: { display: false }, ticks: { color: _REP_TEXTO, font: { size: 11 }, maxTicksLimit: 5, precision: 0, callback: v => metrica === "ingresos" ? "$" + _fmtCompacto(v) : _fmtCompacto(v) } }
  };

  _repCharts.dias = new Chart(canvas, {
    type: "line",
    data: {
      labels: etiquetas,
      datasets: [{
        label: etiqueta, data: valores,
        borderColor: _REP_AZUL, borderWidth: 2, backgroundColor: grad, fill: true,
        tension: .3, cubicInterpolationMode: "monotone", pointRadius: valores.length <= 31 ? 2.5 : 0, pointHoverRadius: 5,
        pointBackgroundColor: _REP_AZUL, pointBorderColor: "#fff", pointBorderWidth: 1.5
      }]
    },
    options: op
  });
}

/** Elige (o suelta) un producto: se resalta en la tabla y en el Top 10, y el gráfico diario muestra solo ese */
function repSeleccionarProducto(codigo) {
  _repProductoSel = (codigo === null || codigo === undefined || String(codigo) === _repProductoSel) ? null : String(codigo);
  renderReporteProductos();
  if (_repProductoSel) document.getElementById("repGrafDias")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** Llamado por el buscador (oninput) */
function filtrarReporteProductos() {
  renderReporteProductos();
}

/** Filas para exportar: TODO lo filtrado (no solo el Top N visible) */
function _repProductosFilasExport() {
  const total = (_repProductosMeta && _repProductosMeta.totales.ingresos) || 0;
  return _repProductosFiltrados().map((p, i) => ({
    "#": i + 1,
    "Código": p.CODIGO,
    "Producto": p.PRODUCTO,
    "Categoría": p.CATEGORIA,
    "Unidades": p.VENDIDOS,
    "Ingresos": Math.round(p.INGRESOS),
    "% ingresos": total ? Math.round(p.INGRESOS / total * 1000) / 10 : 0,
    "Unidades período anterior": p.VENDIDOS_ANTERIOR ?? "",
    "Variación": _repVariacion(p.VENDIDOS, p.VENDIDOS_ANTERIOR).texto.replace(/[▲▼●=]\s?/g, "").trim(),
    "Stock actual": (p.STOCK === null || p.STOCK === undefined) ? "" : p.STOCK
  }));
}

function exportarReporteProductosCSV() {
  const filas = _repProductosFilasExport();
  if (!filas.length) { toast("No hay datos para exportar", "error"); return; }
  const cols = Object.keys(filas[0]);
  const celda = v => {
    const t = typeof v === "number" ? String(v).replace(".", ",") : String(v ?? "");
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  // ";" y BOM: Excel en español lo abre directo en columnas y con acentos
  const csv = "﻿" + [cols.join(";"), ...filas.map(f => cols.map(c => celda(f[c])).join(";"))].join("\r\n");
  const m = _repProductosMeta || {};
  descargarArchivo(`Productos_mas_vendidos_${m.desde || ""}_a_${m.hasta || ""}.csv`, csv, "text/csv;charset=utf-8");
}

function exportarReporteProductosPDF() {
  try {
    const filas = _repProductosFilasExport();
    if (!filas.length) { toast("No hay datos para exportar", "error"); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const m = _repProductosMeta || {};
    const t = m.totales || {};
    const nombreLocal = (obtenerConfigNegocio().nombre || "Reporte").toString();

    doc.setFontSize(14);
    doc.text(`${nombreLocal} — Productos más vendidos`, 30, 30);
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text(`Período: ${_fmtFechaCorta(m.desde)} al ${_fmtFechaCorta(m.hasta)}  ·  ${_fmtNum(t.unidades)} unidades  ·  ${_fmtPlata(t.ingresos)}  ·  Generado: ${new Date().toLocaleString("es-AR")}`, 30, 46);

    const cols = ["#", "Código", "Producto", "Categoría", "Unidades", "Ingresos", "% ingresos", "Variación", "Stock actual"];
    doc.autoTable({
      head: [cols],
      body: filas.map(f => cols.map(c =>
        c === "Ingresos" ? _fmtPlata(f[c]) :
        c === "% ingresos" ? String(f[c]).replace(".", ",") + "%" :
        c === "Unidades" ? _fmtNum(f[c]) : String(f[c] ?? ""))),
      startY: 58,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [18, 32, 71], textColor: [255, 255, 255] },
      columnStyles: { 0: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" } }
    });
    doc.save(`Productos_mas_vendidos_${m.desde || ""}_a_${m.hasta || ""}.pdf`);
  } catch (error) {
    console.error("Error al exportar productos a PDF:", error);
    toast("No se pudo generar el PDF", "error");
  }
}

/* ---- Reporte 3: Ventas por categoría ---- */
async function cargarReporteCategorias() {
  const _ck_repCategorias = "reporteVentasPorCategoria" + obtenerRangoReportes();
  const _cd_repCategorias = _getCacheReporte(_ck_repCategorias);
  if (_cd_repCategorias) { _aplicar_cargarReporteCategorias(_cd_repCategorias); return; }
  const tbody = document.getElementById("repCategoriasTabla");

  try {
    const response = await fetchAPI(API_URL + "?action=reporteVentasPorCategoria" + obtenerRangoReportes());
    const data = await response.json();
    if (!data.success) return;

    sincronizarRangoReportes(data.desde, data.hasta);
    _repDatosActuales.categorias = data.categorias || [];
    renderReporteCategorias();

  } catch (error) {
    console.error("Error al cargar reporte de ventas por categoría:", error);
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">Error al cargar el reporte</td></tr>`;
  }
}

function renderReporteCategorias() {
  const tbody = document.getElementById("repCategoriasTabla");
  if (!tbody) return;
  const categorias = _repDatosActuales.categorias;

  if (!categorias || categorias.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">Sin ventas para el rango elegido</td></tr>`;
    return;
  }

  const lista = _limitarReporte(categorias, "categorias");
  tbody.innerHTML = lista.map(c => `
    <tr>
      <td>${escapeHtml(c.categoria)}</td>
      <td class="money">${Number(c.cantidad || 0).toLocaleString("es-AR")}</td>
      <td class="money">$${Number(c.ingresos || 0).toLocaleString("es-AR")}</td>
    </tr>`).join("");
}

/* ---- Reporte 4: Formas de pago ---- */
async function cargarReporteFormasPago() {
  const tbody = document.getElementById("repFormasPagoTabla");

  try {
    const response = await fetchAPI(API_URL + "?action=reporteFormasPago" + obtenerRangoReportes());
    const data = await response.json();
    if (!data.success) return;

    sincronizarRangoReportes(data.desde, data.hasta);
    _repDatosActuales.formasPago = data.formas || [];
    renderReporteFormasPago();

  } catch (error) {
    console.error("Error al cargar reporte de formas de pago:", error);
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">Error al cargar el reporte</td></tr>`;
  }
}

function renderReporteFormasPago() {
  const tbody = document.getElementById("repFormasPagoTabla");
  if (!tbody) return;
  const formas = _repDatosActuales.formasPago;

  if (!formas || formas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">Sin ventas para el rango elegido</td></tr>`;
    return;
  }

  const lista = _limitarReporte(formas, "formasPago");
  tbody.innerHTML = lista.map(f => `
    <tr>
      <td>${escapeHtml(f.forma)}</td>
      <td class="money">${Number(f.cantidad || 0).toLocaleString("es-AR")}</td>
      <td class="money">$${Number(f.total || 0).toLocaleString("es-AR")}</td>
    </tr>`).join("");
}

/* ---- Reporte 5: Historial de cierres de caja ---- */
async function cargarReporteCierres() {
  const _ck_repCierres = "reporteCierres" + obtenerRangoReportes();
  const _cd_repCierres = _getCacheReporte(_ck_repCierres);
  if (_cd_repCierres) { _aplicar_cargarReporteCierres(_cd_repCierres); return; }
  const tbody = document.getElementById("repCierresTabla");

  try {
    const response = await fetchAPI(API_URL + "?action=reporteCierresCaja" + obtenerRangoReportes());
    const data = await response.json();
    if (!data.success) return;

    sincronizarRangoReportes(data.desde, data.hasta);
    _repDatosActuales.cierres = data.cierres || [];
    renderReporteCierres();

  } catch (error) {
    console.error("Error al cargar reporte de cierres de caja:", error);
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">Error al cargar el reporte</td></tr>`;
  }
}

function renderReporteCierres() {
  const tbody = document.getElementById("repCierresTabla");
  if (!tbody) return;
  const cierres = _repDatosActuales.cierres;

  if (!cierres || cierres.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">Sin cierres para el rango elegido</td></tr>`;
    return;
  }

  const lista = _limitarReporte(cierres, "cierres");
  tbody.innerHTML = lista.map(c => {
    const fecha = c.FECHA ? new Date(c.FECHA).toLocaleDateString("es-AR") : "—";
    const totalDif = Number(c.TOTAL_DIFERENCIA || 0);
    const claseDif = Math.abs(totalDif) < 1 ? "cc-dif-ok" : (totalDif > 0 ? "cc-dif-sobra" : "cc-dif-falta");
    const signo = totalDif > 0 ? "+" : "";
    return `
    <tr>
      <td>${escapeHtml(fecha)}</td>
      <td class="money">$${Number(c.TOTAL_ESPERADO || 0).toLocaleString("es-AR")}</td>
      <td class="money">$${Number(c.TOTAL_CONTADO || 0).toLocaleString("es-AR")}</td>
      <td class="money ${claseDif}">${signo}$${Math.round(totalDif).toLocaleString("es-AR")}</td>
      <td>${escapeHtml(c.VENDEDOR || "—")}</td>
    </tr>`;
  }).join("");
}

/* ---- Reporte 6: Clientes que más compran ---- */
async function cargarReporteClientes() {
  const _ck_repClientes = "reporteClientes" + obtenerRangoReportes();
  const _cd_repClientes = _getCacheReporte(_ck_repClientes);
  if (_cd_repClientes) { _aplicar_cargarReporteClientes(_cd_repClientes); return; }
  const tbody = document.getElementById("repClientesTabla");

  try {
    const response = await fetchAPI(API_URL + "?action=reporteClientes" + obtenerRangoReportes());
    const data = await response.json();
    if (!data.success) return;

    sincronizarRangoReportes(data.desde, data.hasta);
    _repDatosActuales.clientes = data.clientes || [];
    renderReporteClientes();

  } catch (error) {
    console.error("Error al cargar reporte de clientes:", error);
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Error al cargar el reporte</td></tr>`;
  }
}

function renderReporteClientes() {
  const tbody = document.getElementById("repClientesTabla");
  if (!tbody) return;
  const clientes = _repDatosActuales.clientes;

  if (!clientes || clientes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Sin pedidos para el rango elegido</td></tr>`;
    return;
  }

  const lista = _limitarReporte(clientes, "clientes");
  tbody.innerHTML = lista.map(c => `
    <tr>
      <td>${escapeHtml(c.CLIENTE)}</td>
      <td>${escapeHtml(c.EMPRESA || "—")}</td>
      <td class="money">${Number(c.PEDIDOS || 0).toLocaleString("es-AR")}</td>
      <td class="money">$${Number(c.TOTAL || 0).toLocaleString("es-AR")}</td>
    </tr>`).join("");
}

/* ---- Exportar cualquiera de los 6 reportes a PDF ---- */
/**
 * Toma la tarjeta del reporte (por su id), lee la tabla que tiene
 * adentro, y genera un PDF con jsPDF + autoTable. Funciona igual
 * para los 6 reportes porque todos son <table> dentro de una .card.
 */
function exportarReportePDF(cardId, tituloReporte) {
  try {
    const card = document.getElementById(cardId);
    if (!card) return;

    const tabla = card.querySelector("table");
    if (!tabla) {
      toast("Este reporte no tiene datos para exportar", "error");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    const nombreLocal = (obtenerConfigNegocio().nombre || "Reporte").toString();
    const desde = document.getElementById("repDesde").value || "—";
    const hasta = document.getElementById("repHasta").value || "—";

    doc.setFontSize(14);
    doc.text(`${nombreLocal} — ${tituloReporte}`, 30, 30);
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text(`Período: ${desde} a ${hasta}  ·  Generado: ${new Date().toLocaleString("es-AR")}`, 30, 46);

    doc.autoTable({
      html: tabla,
      startY: 58,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [18, 32, 71], textColor: [255, 255, 255] }
    });

    const nombreArchivo = `${tituloReporte.replace(/\s+/g, "_")}_${desde}_a_${hasta}.pdf`;
    doc.save(nombreArchivo);

  } catch (error) {
    console.error("Error al exportar el reporte a PDF:", error);
    toast("No se pudo generar el PDF", "error");
  }
}


/* ===================================================================
   REPORTE DE COMPRAS — cruza productos vendidos con stock actual para
   guiar qué reponer, cuándo y en qué categoría invertir el presupuesto.
   Reusa el endpoint reporteProductosVendidos y el catálogo ya cargado
   en productosAdminGlobal (o lo pide si todavía no está en memoria).
=================================================================== */

let _rcCharts = {}; // instancias de Chart.js activas, para poder destruirlas antes de re-dibujar

/** Días hacia adelante que "Sugerido reponer" y "Presupuesto sugerido" intentan
 *  cubrir. Es independiente del rango de fechas de arriba: ese rango solo define
 *  con qué venta diaria promedio se calcula, no para cuántos días se compra. */
let _rcDiasCobertura = 30;

/** Compras usa el mismo período que el resto de Reportes */
function _rcRangoFechas() {
  return obtenerRangoReportes();
}

function _rcDiasDelRango(desdeStr, hastaStr) {
  if (!desdeStr || !hastaStr) return 30;
  const d = new Date(desdeStr), h = new Date(hastaStr);
  const dias = Math.round((h - d) / 86400000) + 1;
  return dias > 0 ? dias : 30;
}

async function cargarReporteCompras(forzar) {
  const tbody = document.getElementById("rcSemaforoTabla");
  if (tbody && !_rcProductosActuales.length) tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-3">Cargando...</td></tr>`;
  try {
    // 1) Productos vendidos del período — la MISMA respuesta que usa la
    //    pestaña Productos (se pide una sola vez y queda en caché)
    const data = await _obtenerReporteProductosVendidos(forzar);
    if (!data || !data.success) { toast((data && data.message) || "No se pudo cargar el reporte de compras", "error"); return; }

    sincronizarRangoReportes(data.desde, data.hasta);
    const dias = _rcDiasDelRango(data.desde, data.hasta);

    // 2) Stock y categoría: el backend nuevo ya los manda en cada producto.
    //    Con un backend viejo se cruzan con el catálogo (que hay que cargar).
    const backendTraeStock = (data.productos || []).some(v => v.STOCK !== undefined);
    const stockPorCodigo = {};
    if (!backendTraeStock) {
      if (!productosAdminGlobal || productosAdminGlobal.length === 0) await cargarProductos();
      (productosAdminGlobal || []).forEach(p => { stockPorCodigo[String(p.CODIGO)] = p; });
    }

    const productos = (data.productos || []).map(v => {
      const info = backendTraeStock ? { STOCK: v.STOCK, CATEGORIA: v.CATEGORIA, ALIAS: v.ALIAS, CODIGO_CAJA: v.CODIGO_CAJA } : (stockPorCodigo[String(v.CODIGO)] || {});
      const p = {
        codigo:    String(v.CODIGO ?? ""),
        nombre:    v.PRODUCTO,
        categoria: info.CATEGORIA || "Sin categoría",
        vendidos:  Number(v.VENDIDOS || 0),
        ingresos:  Number(v.INGRESOS || 0),
        stock:     (info.STOCK !== undefined && info.STOCK !== null && info.STOCK !== "") ? Number(info.STOCK) : 0,
      };
      p._busqueda = normalizarBusquedaPOS([p.nombre, p.codigo, p.categoria, info.ALIAS, info.CODIGO_CAJA].join(" "));
      return p;
    });

    // 4) Pedir la tendencia diaria por categoría (endpoint nuevo — ver nota al final
    //    de este archivo con el código de Apps Script a agregar). Si el backend
    //    todavía no lo tiene, cae automáticamente a una sola línea total.
    const tendenciaPorCategoria = await _rcCargarTendenciaPorCategoria(data.desde, data.hasta);

    _renderReporteCompras(productos, dias, tendenciaPorCategoria);

  } catch (error) {
    console.error("Error al cargar reporte de compras:", error);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">Error al cargar el reporte</td></tr>`;
    toast("Error de conexión al cargar el reporte de compras", "error");
  }
}

/**
 * Pide la venta diaria desglosada por categoría para el gráfico de tendencia.
 * Requiere una acción nueva en el backend (reporteVentasDiariasPorCategoria) que
 * todavía no existe en el Apps Script actual — ver el comentario al final de este
 * archivo con el código para agregarla. Mientras no exista, devuelve null y el
 * gráfico cae automáticamente a una sola línea con el total de ventas por día
 * (usando ventasPOSHistorial, que sí existe hoy).
 *
 * Formato esperado de una respuesta exitosa:
 *   { success:true, categorias:["Bebidas","Snacks",...],
 *     dias:[{ fecha:"2026-07-01", valores:{ "Bebidas":12000, "Snacks":4500 } }, ...] }
 */
async function _rcCargarTendenciaPorCategoria(desde, hasta) {
  try {
    const params = new URLSearchParams({ action: "reporteVentasDiariasPorCategoria" });
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    const response = await fetchAPI(API_URL + "?" + params.toString());
    const data = await response.json();
    if (data && data.success && data.dias) return data;
    return null;
  } catch (error) {
    console.warn("reporteVentasDiariasPorCategoria no disponible todavía en el backend:", error);
    return null;
  }
}

/** Fallback: total de ventas por día (sin desglose de categoría), usando el
 *  historial que sí existe hoy en el backend. */
async function _rcCargarVentasDelRango(desde, hasta) {
  try {
    const params = new URLSearchParams({ action: "ventasPOSHistorial" });
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    const response = await fetchAPI(API_URL + "?" + params.toString());
    const data = await response.json();
    return data.ventas || [];
  } catch (error) {
    console.warn("No se pudo cargar el historial de ventas para la tendencia:", error);
    return [];
  }
}

function sincronizarRangoReportesCompras(desde, hasta) {
  sincronizarRangoReportes(desde, hasta);
}

function _rcVentaDiaria(p, dias) { return p.vendidos / dias; }

function _rcCobertura(p, dias) {
  const vd = _rcVentaDiaria(p, dias);
  if (vd <= 0) return Infinity;
  return p.stock / vd;
}

function _rcEstado(p, dias) {
  if (p.stock <= 0 && p.vendidos > 0) return "sinstock";
  const c = _rcCobertura(p, dias);
  if (c < 7) return "critico";
  if (c < 20) return "atencion";
  return "ok";
}

/* Estado en memoria de la tabla semáforo, para poder re-filtrar sin volver a pedir datos */
let _rcProductosActuales = [];
let _rcDiasActuales = 30;

const _RC_PALETA_CATEGORIAS = ["#2563eb","#16a34a","#d97706","#dc2626","#7c3aed","#0891b2","#db2777","#65a30d"];

function _renderReporteCompras(productos, dias, tendenciaPorCategoria) {
  _rcProductosActuales = productos || [];
  _rcDiasActuales = dias;

  _rcSeleccionados.clear();
  _rcActualizarBarraSeleccion();

  if (!productos || productos.length === 0) {
    document.getElementById("rcSemaforoTabla").innerHTML =
      `<tr><td colspan="9" class="text-center text-muted py-3">Sin ventas para el rango elegido</td></tr>`;
    ["rcKpiSinStock","rcKpiCritico"].forEach(id => actualizarElemento(id, 0));
    ["rcKpiTicket","rcKpiPresupuesto"].forEach(id => actualizarElemento(id, "$0"));
    Object.values(_rcCharts).forEach(c => c && c.destroy());
    _rcCharts = {};
    return;
  }

  /* ---- KPIs ---- */
  const sinStockConDemanda = productos.filter(p => p.stock <= 0 && p.vendidos > 0);
  const criticos = productos.filter(p => _rcEstado(p, dias) === "critico");
  const totalIngresos = productos.reduce((a,p)=>a+p.ingresos,0);
  const totalVendidos = productos.reduce((a,p)=>a+p.vendidos,0);
  const ticketProm = totalVendidos > 0 ? totalIngresos / totalVendidos : 0;

  // presupuesto sugerido: para productos en rojo/amarillo/sin stock, cubrir N días (selector) de venta al precio unitario estimado
  const presupuesto = productos
    .filter(p => ["critico","atencion","sinstock"].includes(_rcEstado(p, dias)))
    .reduce((acc,p) => {
      const precioUnit = p.vendidos > 0 ? p.ingresos / p.vendidos : 0;
      const faltante = Math.max(0, (_rcVentaDiaria(p, dias) * _rcDiasCobertura) - p.stock);
      return acc + faltante * precioUnit;
    }, 0);

  actualizarElemento("rcKpiSinStock",   sinStockConDemanda.length);
  actualizarElemento("rcKpiCritico",    criticos.length);
  actualizarElemento("rcKpiTicket",     "$" + Math.round(ticketProm).toLocaleString("es-AR"));
  actualizarElemento("rcKpiPresupuesto","$" + Math.round(presupuesto).toLocaleString("es-AR"));

  /* ---- Gráficos: los datos se guardan siempre, pero solo se dibujan si el
     acordeón "Ver gráficos y tendencias" ya está abierto — dibujar un canvas
     oculto (details cerrado = ancho 0) deja los charts rotos hasta que se
     redimensiona la ventana. Si está cerrado, _rcDibujarGraficos() se llama
     recién cuando el usuario lo abre (ver onclick del <summary>). ---- */
  _rcDatosGraficosPendientes = { productos, tendenciaPorCategoria };
  const detailsGraficos = document.getElementById("rcGraficosDetails");
  if (detailsGraficos && detailsGraficos.open) {
    _rcDibujarGraficos(productos, tendenciaPorCategoria);
  }

  /* ---- Tabla semáforo ---- */
  _rcAplicarFiltrosTabla();
}

/* Datos en espera de dibujarse la primera vez que se abre el acordeón de gráficos */
let _rcDatosGraficosPendientes = null;

/** Se llama al abrir/cerrar el <details> de gráficos. Si se acaba de abrir y
 *  todavía no se dibujó nada con los datos actuales, dibuja ahora que el
 *  canvas ya tiene ancho real. */
function _rcRedibujarSiEstaAbierto() {
  const detailsGraficos = document.getElementById("rcGraficosDetails");
  if (!detailsGraficos || !detailsGraficos.open || !_rcDatosGraficosPendientes) return;
  _rcDibujarGraficos(_rcDatosGraficosPendientes.productos, _rcDatosGraficosPendientes.tendenciaPorCategoria);
}

function _rcDibujarGraficos(productos, tendenciaPorCategoria) {
  /* ---- Destruir gráficos previos antes de re-dibujar (evita fugas al cambiar de fecha) ---- */
  Object.values(_rcCharts).forEach(c => c && c.destroy());
  _rcCharts = {};

  /* ---- Chart 1: Top productos, barras superpuestas (vendidos vs stock) ---- */
  const top = [...productos].sort((a,b)=>b.vendidos-a.vendidos).slice(0,8);
  _rcCharts.top = new Chart(document.getElementById("rcChartTop"), {
    type: "bar",
    data: {
      labels: top.map(p=>p.nombre),
      datasets: [
        { label:"Vendidos", data: top.map(p=>p.vendidos), backgroundColor:"#2563eb", borderRadius:5 },
        { label:"Stock actual", data: top.map(p=>p.stock), backgroundColor:"#cbd2dd", borderRadius:5 },
      ]
    },
    options: {
      indexAxis: "y",
      plugins:{ legend:{ position:"bottom", labels:{ boxWidth:12, font:{size:11} } } },
      scales:{ x:{ grid:{ color:"#eef1f6" } }, y:{ grid:{ display:false } } }
    }
  });

  /* ---- Chart 2: Donut por categoría ---- */
  const categorias = {};
  productos.forEach(p => { categorias[p.categoria] = (categorias[p.categoria]||0) + p.ingresos; });
  const totalCategorias = Object.values(categorias).reduce((a,b)=>a+b, 0);
  _rcCharts.donut = new Chart(document.getElementById("rcChartDonut"), {
    type:"doughnut",
    data:{
      labels:Object.keys(categorias),
      datasets:[{ data:Object.values(categorias), backgroundColor:_RC_PALETA_CATEGORIAS, borderWidth:2, borderColor:"#fff" }]
    },
    options:{
      plugins:{
        legend:{ position:"bottom", labels:{ boxWidth:12, font:{size:11} } },
        tooltip:{
          callbacks:{
            label: (ctx) => {
              const valor = Number(ctx.raw || 0);
              const pct = totalCategorias > 0 ? (valor / totalCategorias * 100) : 0;
              return `${ctx.label}: $${Math.round(valor).toLocaleString("es-AR")} (${pct.toFixed(1)}%)`;
            }
          }
        }
      },
      cutout:"62%"
    }
  });

  /* ---- Chart 3: Tendencia — apilada por categoría, agrupada y simplificada ---- */
  _rcTendenciaActual = tendenciaPorCategoria; // se guarda para poder redibujar al cambiar el selector Día/Semana
  _rcRedibujarTendencia();

  _rcDatosGraficosPendientes = null;
}

/* Estado en memoria de la tendencia, para redibujar sin re-pedir datos al cambiar el selector */
let _rcTendenciaActual = null;

/** Agrupa los días en semanas (lunes a domingo), sumando cada categoría. */
function _rcAgruparPorSemana(dias) {
  const semanas = {}; // "yyyy-MM-dd" (lunes de esa semana) -> { categoria: total }
  const ordenPrimeraFecha = {};
  dias.forEach(d => {
    const fecha = new Date(d.fecha + "T12:00:00"); // mediodía evita líos de huso horario al restar días
    const diaSemana = fecha.getDay(); // 0=domingo … 6=sábado
    const offsetHastaLunes = diaSemana === 0 ? 6 : diaSemana - 1;
    const lunes = new Date(fecha);
    lunes.setDate(fecha.getDate() - offsetHastaLunes);
    const clave = lunes.toISOString().slice(0, 10);

    if (!semanas[clave]) { semanas[clave] = {}; ordenPrimeraFecha[clave] = clave; }
    Object.entries(d.valores || {}).forEach(([cat, val]) => {
      semanas[clave][cat] = (semanas[clave][cat] || 0) + Number(val || 0);
    });
  });
  return Object.keys(semanas).sort().map(clave => ({ fecha: clave, valores: semanas[clave] }));
}

/** Se queda con las categorías de mayor ingreso total y agrupa el resto en "Otras",
 *  para no saturar el gráfico con demasiadas líneas/áreas finitas. */
function _rcAplicarTopCategorias(dias, categorias, maxCategorias) {
  const totalPorCategoria = {};
  categorias.forEach(c => totalPorCategoria[c] = 0);
  dias.forEach(d => Object.entries(d.valores || {}).forEach(([c, v]) => {
    totalPorCategoria[c] = (totalPorCategoria[c] || 0) + Number(v || 0);
  }));

  const ordenadas = [...categorias].sort((a,b) => totalPorCategoria[b] - totalPorCategoria[a]);
  if (ordenadas.length <= maxCategorias) return { categoriasFinal: ordenadas, dias };

  const top = ordenadas.slice(0, maxCategorias);
  const resto = ordenadas.slice(maxCategorias);

  const diasFinal = dias.map(d => {
    const valores = {};
    top.forEach(c => { if (d.valores && d.valores[c] !== undefined) valores[c] = d.valores[c]; });
    let otras = 0;
    resto.forEach(c => { otras += Number((d.valores && d.valores[c]) || 0); });
    if (otras > 0) valores["Otras"] = otras;
    return { fecha: d.fecha, valores };
  });

  const categoriasFinal = [...top];
  if (diasFinal.some(d => d.valores["Otras"] !== undefined)) categoriasFinal.push("Otras");
  return { categoriasFinal, dias: diasFinal };
}

function _rcFormatoFechaLabel(fechaStr, esSemanal) {
  const f = new Date(fechaStr + "T12:00:00");
  const dd = String(f.getDate()).padStart(2,"0");
  const mm = String(f.getMonth()+1).padStart(2,"0");
  return esSemanal ? `Sem. ${dd}/${mm}` : `${dd}/${mm}`;
}

/** Redibuja el gráfico de tendencia a partir de los datos ya cargados, aplicando
 *  la agrupación (día/semana/automático) elegida en el selector. No vuelve a
 *  pedir datos al backend — solo re-procesa lo que ya está en memoria. */
function _rcRedibujarTendencia() {
  const canvasLinea = document.getElementById("rcChartLinea");
  const aviso = document.getElementById("rcTendenciaAviso");
  if (!canvasLinea) return;

  const tendenciaPorCategoria = _rcTendenciaActual;

  if (tendenciaPorCategoria && tendenciaPorCategoria.dias && tendenciaPorCategoria.dias.length) {
    if (aviso) aviso.style.display = "none";

    const modo = document.getElementById("rcTendenciaAgrupacion")?.value || "auto";
    const esSemanal = modo === "semana" || (modo === "auto" && tendenciaPorCategoria.dias.length > 45);

    let dias = tendenciaPorCategoria.dias;
    if (esSemanal) dias = _rcAgruparPorSemana(dias);

    const { categoriasFinal, dias: diasFinal } = _rcAplicarTopCategorias(dias, tendenciaPorCategoria.categorias || [], 6);

    const labels = diasFinal.map(d => _rcFormatoFechaLabel(d.fecha, esSemanal));
    const coloresBase = _RC_PALETA_CATEGORIAS;
    const datasets = categoriasFinal.map((cat, i) => {
      const esOtras = cat === "Otras";
      const color = esOtras ? "#94a3b8" : coloresBase[i % coloresBase.length];
      return {
        label: cat,
        data: diasFinal.map(d => Number((d.valores && d.valores[cat]) || 0)),
        borderColor: color,
        backgroundColor: "transparent",
        fill: false, // sin apilar: cada línea muestra su propio valor real, para que una
                     // categoría chica se vea claramente chata frente a una grande, y no
                     // "infle" de tamaño por estar apoyada arriba de otra en un área apilada
        tension: .3, pointRadius: 0, borderWidth: 2
      };
    });

    if (_rcCharts.linea) _rcCharts.linea.destroy();
    _rcCharts.linea = new Chart(canvasLinea, {
      type:"line",
      data:{ labels, datasets },
      options:{
        interaction:{ mode:"index", intersect:false },
        plugins:{
          legend:{ position:"bottom", labels:{ boxWidth:12, font:{size:11} } },
          tooltip:{
            callbacks:{
              label: (ctx) => `${ctx.dataset.label}: $${Math.round(ctx.raw).toLocaleString("es-AR")}`
            }
          }
        },
        scales:{
          x:{ grid:{ display:false }, ticks:{ maxTicksLimit:10 } },
          y:{ grid:{ color:"#eef1f6" }, ticks:{ callback:(v)=>"$"+Number(v).toLocaleString("es-AR") } }
        }
      }
    });
  } else {
    // Fallback: todavía no existe el endpoint por categoría — se avisa y se
    // muestra una sola línea con el total (mejor que no mostrar nada).
    if (aviso) {
      aviso.style.display = "block";
      aviso.textContent = "⚠️ Tu backend todavía no tiene el desglose diario por categoría — mostrando el total general. Pedime el código de Apps Script para agregarlo.";
    }
    _rcCargarVentasDelRango(document.getElementById("repDesde").value, document.getElementById("repHasta").value)
      .then(ventasDelRango => {
        const porDia = {};
        (ventasDelRango || []).forEach(v => {
          if (String(v.ANULADA || "").toUpperCase() === "SI") return;
          if (!v.FECHA) return;
          const f = String(v.FECHA).slice(0, 10);
          porDia[f] = (porDia[f] || 0) + Number(v.TOTAL || 0);
        });
        const fechasOrdenadas = Object.keys(porDia).sort();
        if (_rcCharts.linea) _rcCharts.linea.destroy();
        _rcCharts.linea = new Chart(canvasLinea, {
          type:"line",
          data:{
            labels: fechasOrdenadas.length ? fechasOrdenadas.map(f=>_rcFormatoFechaLabel(f,false)) : ["Sin datos"],
            datasets:[{ label:"Ventas diarias (total)", data: fechasOrdenadas.length ? fechasOrdenadas.map(f=>porDia[f]) : [0],
              borderColor:"#2563eb", backgroundColor:"rgba(37,99,235,.08)", fill:true, tension:.35, pointRadius:0, borderWidth:2 }]
          },
          options:{
            plugins:{ legend:{ display:false } },
            scales:{ x:{ grid:{ display:false }, ticks:{ maxTicksLimit:8 } }, y:{ grid:{ color:"#eef1f6" } } }
          }
        });
      });
  }
}

/** Re-renderiza SOLO la tabla semáforo aplicando los filtros de estado y cantidad,
 *  sin volver a pedir datos ni redibujar los gráficos. */
/** Se llama al cambiar el selector "Cubrir próximos N días". No vuelve a pedir
 *  datos al backend — recalcula con lo que ya está en memoria: el KPI de
 *  presupuesto sugerido, la columna "Sugerido reponer" de la tabla, y el total
 *  estimado de la lista de compra (si hay productos tildados). */
function _rcCambiarDiasCobertura() {
  const select = document.getElementById("rcDiasCobertura");
  _rcDiasCobertura = Number(select?.value || 30);

  const productos = _rcProductosActuales;
  const dias = _rcDiasActuales;
  if (productos && productos.length > 0) {
    const presupuesto = productos
      .filter(p => ["critico","atencion","sinstock"].includes(_rcEstado(p, dias)))
      .reduce((acc,p) => {
        const precioUnit = p.vendidos > 0 ? p.ingresos / p.vendidos : 0;
        const faltante = Math.max(0, (_rcVentaDiaria(p, dias) * _rcDiasCobertura) - p.stock);
        return acc + faltante * precioUnit;
      }, 0);
    actualizarElemento("rcKpiPresupuesto", "$" + Math.round(presupuesto).toLocaleString("es-AR"));
  }

  _rcAplicarFiltrosTabla();
  _rcActualizarBarraSeleccion();
}

function _rcAplicarFiltrosTabla() {
  const productos = _rcProductosActuales;
  const dias = _rcDiasActuales;
  const tbody = document.getElementById("rcSemaforoTabla");
  if (!tbody) return;

  if (!productos || productos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-3">Sin ventas para el rango elegido</td></tr>`;
    return;
  }

  const filtroEstado = document.getElementById("rcFiltroEstado")?.value || "todos";
  const filtroCantidad = document.getElementById("rcFiltroCantidad")?.value || "10";
  const busqueda = document.getElementById("rcBuscarProducto")?.value || "";

  // Sin stock se marca oscuro para distinguirlo de un rojo "crítico" pero
  // todavía con algo de stock — son dos urgencias distintas de un vistazo.
  const estadoInfo = {
    sinstock: { clase:"bg-dark",    texto:"🚫 Sin stock" },
    critico:  { clase:"bg-danger",  texto:"🔴 Crítico" },
    atencion: { clase:"bg-warning text-dark", texto:"🟡 Atención" },
    ok:       { clase:"bg-success", texto:"🟢 OK" },
  };

  let filtrados = productos.filter(p => filtroEstado === "todos" || _rcEstado(p, dias) === filtroEstado);
  if (busqueda.trim()) {
    filtrados = filtrados.filter(p => coincideBusquedaReportes(p._busqueda || normalizarBusquedaPOS(p.nombre + " " + p.codigo), busqueda));
  }
  let ordenados = filtrados.sort((a,b)=> _rcCobertura(a, dias) - _rcCobertura(b, dias));
  // Buscando, se muestran TODAS las coincidencias (el Top 10/20 escondía resultados)
  if (filtroCantidad !== "todos" && !busqueda.trim()) ordenados = ordenados.slice(0, Number(filtroCantidad));

  if (ordenados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-3">Ningún producto en ese estado</td></tr>`;
    _rcActualizarCheckTodos();
    return;
  }

  tbody.innerHTML = ordenados.map(p => {
    const e = _rcEstado(p, dias);
    const info = estadoInfo[e];
    const cob = _rcCobertura(p, dias);
    const cobTxt = cob === Infinity ? "—" : `~${Math.round(cob)} días`;

    // Sugerido reponer: cuánto falta para cubrir _rcDiasCobertura días de venta al ritmo actual.
    // Solo tiene sentido mostrarlo para lo que hay que reponer; en "OK" no se sugiere nada.
    const faltante = ["sinstock","critico","atencion"].includes(e)
      ? Math.max(0, Math.round(_rcVentaDiaria(p, dias) * _rcDiasCobertura - p.stock))
      : 0;
    const sugeridoTxt = faltante > 0 ? `<strong>${faltante.toLocaleString("es-AR")}</strong> uds.` : "—";

    const marcado = _rcSeleccionados.has(String(p.codigo));
    return `
      <tr>
        <td><input type="checkbox" class="rc-check-fila" data-codigo="${escapeHtml(p.codigo)}" ${marcado ? "checked" : ""} onchange="_rcToggleSeleccion('${escapeJsAttr(p.codigo)}', this.checked)"></td>
        <td class="mono" title="${escapeHtml(p.codigo)}">${escapeHtml(p.codigo)}</td>
        <td title="${escapeHtml(p.nombre)}">${escapeHtml(p.nombre)}</td>
        <td title="${escapeHtml(p.categoria)}">${escapeHtml(p.categoria)}</td>
        <td class="money" data-label="Vendidos">${p.vendidos.toLocaleString("es-AR")}</td>
        <td class="money" data-label="Stock">${p.stock.toLocaleString("es-AR")}</td>
        <td class="money" data-label="Cobertura">${cobTxt}</td>
        <td class="money" data-label="Sugerido reponer">${sugeridoTxt}</td>
        <td><span class="badge ${info.clase}">${info.texto}</span></td>
      </tr>`;
  }).join("");

  _rcActualizarCheckTodos();
}

/* ===================================================================
   Lista de compra — tildar productos del semáforo (sin gráficos ni
   modales, solo checkboxes) y copiar un resumen listo para mandar
   al proveedor o pegar en una nota.
=================================================================== */
const _rcSeleccionados = new Set(); // códigos tildados, persiste entre re-renders por filtro/búsqueda

function _rcToggleSeleccion(codigo, marcado) {
  if (marcado) _rcSeleccionados.add(String(codigo));
  else _rcSeleccionados.delete(String(codigo));
  _rcActualizarCheckTodos();
  _rcActualizarBarraSeleccion();
}

/** Tilda/destilda todas las filas actualmente visibles en la tabla (no las que
 *  quedaron ocultas por el filtro), igual que el "seleccionar todos" de Productos. */
function _rcToggleTodos(headerCheckbox) {
  document.querySelectorAll(".rc-check-fila").forEach(chk => {
    chk.checked = headerCheckbox.checked;
    const codigo = chk.dataset.codigo;
    if (headerCheckbox.checked) _rcSeleccionados.add(codigo);
    else _rcSeleccionados.delete(codigo);
  });
  _rcActualizarBarraSeleccion();
}

/** Refleja en el checkbox de cabecera si todas/algunas/ninguna de las filas visibles están tildadas. */
function _rcActualizarCheckTodos() {
  const checkTodos = document.getElementById("rcCheckTodos");
  if (!checkTodos) return;
  const filas = Array.from(document.querySelectorAll(".rc-check-fila"));
  if (filas.length === 0) { checkTodos.checked = false; checkTodos.indeterminate = false; return; }
  const marcadas = filas.filter(f => f.checked).length;
  checkTodos.checked = marcadas === filas.length;
  checkTodos.indeterminate = marcadas > 0 && marcadas < filas.length;
}

function _rcVaciarSeleccion() {
  _rcSeleccionados.clear();
  document.querySelectorAll(".rc-check-fila").forEach(chk => chk.checked = false);
  _rcActualizarCheckTodos();
  _rcActualizarBarraSeleccion();
}

/** Muestra/oculta la barra "N seleccionados" y actualiza el total estimado de compra. */
function _rcActualizarBarraSeleccion() {
  const barra = document.getElementById("rcListaCompraBar");
  const info = document.getElementById("rcListaCompraInfo");
  if (!barra || !info) return;

  const cantidad = _rcSeleccionados.size;
  if (cantidad === 0) { barra.style.display = "none"; return; }

  const dias = _rcDiasActuales;
  let totalEstimado = 0;
  _rcSeleccionados.forEach(codigo => {
    const p = _rcProductosActuales.find(x => String(x.codigo) === codigo);
    if (!p) return;
    const precioUnit = p.vendidos > 0 ? p.ingresos / p.vendidos : 0;
    const faltante = Math.max(0, _rcVentaDiaria(p, dias) * _rcDiasCobertura - p.stock);
    totalEstimado += faltante * precioUnit;
  });

  barra.style.display = "block";
  info.textContent = `${cantidad} producto${cantidad === 1 ? "" : "s"} seleccionado${cantidad === 1 ? "" : "s"} · ≈$${Math.round(totalEstimado).toLocaleString("es-AR")} estimado`;
}

/** Arma un texto simple (código, nombre, cantidad sugerida) con los productos
 *  tildados y lo copia al portapapeles — para pegarlo en un chat/nota al proveedor. */
async function _rcCopiarListaCompra() {
  if (_rcSeleccionados.size === 0) { toast("Tildá al menos un producto", "error"); return; }

  const dias = _rcDiasActuales;
  const lineas = [];
  _rcSeleccionados.forEach(codigo => {
    const p = _rcProductosActuales.find(x => String(x.codigo) === codigo);
    if (!p) return;
    const faltante = Math.max(0, Math.round(_rcVentaDiaria(p, dias) * _rcDiasCobertura - p.stock));
    lineas.push(`${p.codigo} — ${p.nombre} — ${faltante > 0 ? faltante + " uds." : "a definir"}`);
  });

  const texto = `Lista de compra (${lineas.length} productos)\n` + lineas.join("\n");

  try {
    await navigator.clipboard.writeText(texto);
    toast("Lista de compra copiada al portapapeles", "success");
  } catch (error) {
    console.error("No se pudo copiar la lista de compra:", error);
    toast("No se pudo copiar automáticamente — seleccioná y copiá el texto manualmente", "error");
  }
}

/** Filtro rápido desde las tarjetas KPI "Sin stock" / "Cobertura < 7 días":
 *  aplica el filtro de estado correspondiente y lleva la vista a la tabla. */
function _rcFiltrarDesdeKpi(estado) {
  const select = document.getElementById("rcFiltroEstado");
  if (select) { select.value = estado; _rcAplicarFiltrosTabla(); }
  const tabla = document.getElementById("rcSemaforoCard");
  if (tabla) tabla.scrollIntoView({ behavior: "smooth", block: "start" });
}



/* ---- Registrar el service worker (instala como PWA) ---- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

/* ---- Carga inicial ---- */
cargarConfigNegocio().then(() => {
  API_URL = CONFIG_NEGOCIO.API_URL;
  if (!API_URL) {
    toast("No se pudo leer la API URL. Revisá que config.json esté en la carpeta raíz.", "error");
    return;
  }
  if (obtenerRolActual() === "deposito") {
    document.querySelectorAll('#repTabs .rep-tab[data-tab="ventas"], #repTabs .rep-tab[data-tab="productos"]').forEach(b => b.style.display = "none");
  }
  mostrarTabReportes(_repTabPorDefecto());
});
