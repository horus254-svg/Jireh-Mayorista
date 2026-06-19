/* ===================================================================
   JIREH ADMIN — app logic v2
   • All original Apps Script API calls preserved
   • Thermal print (POS80 80mm) added
   • Dashboard POS summary added
   • Responsive mobile nav sync added
=================================================================== */

const API_URL =
  "https://script.google.com/macros/s/AKfycbw1eY_mXImG503rU0Cqddx1WBuGIOhxaW_SXGoIMsug_CjsSC-HLsb2XzYwrovaGBU/exec";

let pedidosGlobal = [];

// Store last completed sale for "print from receipt modal"
let ultimaVentaImprimible = null;

// Store POS sales loaded for dashboard
let ventasPOSGlobal = [];

if (sessionStorage.getItem("admin") !== "true") {
  window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  mostrarSeccion("dashboard");
  cargarConfigNegocioDesdeBackend(); // refresca el caché en memoria para los tickets impresos
  reconectarImpresoraUSBSiPosible(); // intenta reconectar la impresora térmica sin mostrar el selector
  await cargarMetricas();
  cargarVentasPOS();

  setInterval(() => {
    const dashboardVisible = document.getElementById("dashboard").style.display === "block";
    const pedidosVisible   = document.getElementById("pedidos").style.display === "block";
    const clientesVisible  = document.getElementById("clientes").style.display === "block";

    if (dashboardVisible) { cargarMetricas(); cargarVentasPOS(); }
    else { cargarMetricas(); } // keep banner numbers fresh even off-screen, it's cheap

    if (pedidosVisible)  cargarPedidos();
    if (clientesVisible) cargarClientes();
  }, 15000); // 15 s — near real-time without hammering the API

  setupScannerListener();
});

/* ===================== UTILS ===================== */

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function actualizarElemento(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}

/* ===================== CONFIGURACIÓN DEL NEGOCIO (encabezado del ticket) ===================== */

// Valores por defecto — son los que ya venía usando el ticket, así que
// si todavía no cargó la config del servidor, todo se imprime igual que antes.
const CONFIG_NEGOCIO_DEFAULT = {
  nombre:     "JIREH",
  subtitulo:  "Punto de Venta",
  direccion:  "",
  telefono1:  "",
  telefono2:  "",
  pie:        "¡Gracias por su compra!",

  bannerTitulo:    "Mayorista Jireh",
  bannerSubtitulo: "Catálogo Mayorista Online",
  bannerImagen:    "",
  tema:            "navy"
};

// Caché en memoria de la config, para que imprimir un ticket no tenga
// que esperar una llamada al servidor cada vez. Se carga al iniciar la
// app y se refresca cada vez que se guarda desde el formulario.
let configNegocioCache = { ...CONFIG_NEGOCIO_DEFAULT };

/** Synchronous read used by the print functions — always returns instantly from the in-memory cache */
function obtenerConfigNegocio() {
  return configNegocioCache;
}

/** Fetches the saved config from the backend (hoja CONFIGURACION) and refreshes the in-memory cache */
async function cargarConfigNegocioDesdeBackend() {
  try {
    const response = await fetch(API_URL + "?action=configuracionNegocio");
    const data = await response.json();
    if (data.success && data.config) {
      configNegocioCache = { ...CONFIG_NEGOCIO_DEFAULT, ...data.config };
    }
  } catch (error) {
    console.warn("No se pudo cargar la configuración del negocio:", error);
  }
  return configNegocioCache;
}

/** Loads the saved config into the form fields (called when the Configuración section opens) */
async function cargarConfigNegocioForm() {
  const form = document.getElementById("cfgNombreLocal");
  if (form) form.placeholder = "Cargando...";

  const cfg = await cargarConfigNegocioDesdeBackend();

  document.getElementById("cfgNombreLocal").value = cfg.nombre;
  document.getElementById("cfgSubtitulo").value   = cfg.subtitulo;
  document.getElementById("cfgDireccion").value   = cfg.direccion;
  document.getElementById("cfgTelefono1").value   = cfg.telefono1;
  document.getElementById("cfgTelefono2").value   = cfg.telefono2;
  document.getElementById("cfgPie").value         = cfg.pie;

  cargarAparienciaForm(cfg);
  cargarBeneficiosForm(cfg);

  if (form) form.placeholder = "Ej: JIREH";
}

/** Reads the form fields and saves them to the backend (hoja CONFIGURACION) */
async function guardarConfigNegocioForm() {
  const nombre = document.getElementById("cfgNombreLocal").value.trim();

  if (!nombre) {
    toast("El nombre del local es obligatorio", "error");
    return;
  }

  const cfg = {
    nombre,
    subtitulo: document.getElementById("cfgSubtitulo").value.trim(),
    direccion: document.getElementById("cfgDireccion").value.trim(),
    telefono1: document.getElementById("cfgTelefono1").value.trim(),
    telefono2: document.getElementById("cfgTelefono2").value.trim(),
    pie:       document.getElementById("cfgPie").value.trim()
  };

  const btn = document.getElementById("btnGuardarConfigNegocio");
  const textoOriginal = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = "Guardando..."; }

  try {
    const params = new URLSearchParams({ action: "guardarConfiguracionNegocio", ...cfg });
    const response = await fetch(API_URL + "?" + params.toString());
    const data = await response.json();

    if (!data.success) {
      toast(data.message || "No se pudo guardar la configuración", "error");
      return;
    }

    configNegocioCache = { ...cfg };
    toast("Configuración guardada", "success");

  } catch (error) {
    console.error("Error al guardar la configuración del negocio:", error);
    toast("Error de conexión al guardar la configuración", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
  }
}

/** Resets the form (and the saved sheet values) back to the original JIREH defaults */
async function restablecerConfigNegocio() {
  if (!confirm("¿Restablecer los datos del local a los valores originales?")) return;

  document.getElementById("cfgNombreLocal").value = CONFIG_NEGOCIO_DEFAULT.nombre;
  document.getElementById("cfgSubtitulo").value   = CONFIG_NEGOCIO_DEFAULT.subtitulo;
  document.getElementById("cfgDireccion").value   = CONFIG_NEGOCIO_DEFAULT.direccion;
  document.getElementById("cfgTelefono1").value   = CONFIG_NEGOCIO_DEFAULT.telefono1;
  document.getElementById("cfgTelefono2").value   = CONFIG_NEGOCIO_DEFAULT.telefono2;
  document.getElementById("cfgPie").value         = CONFIG_NEGOCIO_DEFAULT.pie;

  await guardarConfigNegocioForm();
}

/** Prints a sample receipt using the form's current (possibly unsaved) values, so the admin can check before saving */
function vistaPreviaTicketConfig() {
  const cfgPreview = {
    nombre:    document.getElementById("cfgNombreLocal").value.trim() || CONFIG_NEGOCIO_DEFAULT.nombre,
    subtitulo: document.getElementById("cfgSubtitulo").value.trim(),
    direccion: document.getElementById("cfgDireccion").value.trim(),
    telefono1: document.getElementById("cfgTelefono1").value.trim(),
    telefono2: document.getElementById("cfgTelefono2").value.trim(),
    pie:       document.getElementById("cfgPie").value.trim() || CONFIG_NEGOCIO_DEFAULT.pie
  };

  const itemsEjemplo = [
    { PRODUCTO: "Producto de ejemplo", PRECIO: 1500, cantidad: 2 },
    { PRODUCTO: "Otro producto", PRECIO: 800, cantidad: 1 }
  ];
  const total = itemsEjemplo.reduce((acc, i) => acc + i.PRECIO * i.cantidad, 0);

  const frame = document.getElementById("thermalPrintFrame");
  if (!frame) { toast("Error: frame de impresión no encontrado", "error"); return; }

  frame.innerHTML = buildThermalHTML("PREVIEW", itemsEjemplo, total, "EFECTIVO", new Date(), null, cfgPreview);

  setTimeout(() => { window.print(); }, 120);
}

/* ===================== APARIENCIA DEL CATÁLOGO WEB (banner + tema) ===================== */

const APARIENCIA_DEFAULT = {
  bannerTitulo:    "Mayorista Jireh",
  bannerSubtitulo: "Catálogo Mayorista Online",
  bannerImagen:    "",
  tema:            "navy"
};

/** Loads the saved banner/tema config into the "Apariencia" form (called when Configuración opens) */
function cargarAparienciaForm(cfg) {
  document.getElementById("cfgBannerTitulo").value    = cfg.bannerTitulo    ?? APARIENCIA_DEFAULT.bannerTitulo;
  document.getElementById("cfgBannerSubtitulo").value = cfg.bannerSubtitulo ?? APARIENCIA_DEFAULT.bannerSubtitulo;
  document.getElementById("cfgBannerImagen").value    = cfg.bannerImagen   ?? APARIENCIA_DEFAULT.bannerImagen;
  document.getElementById("cfgTema").value            = cfg.tema           || APARIENCIA_DEFAULT.tema;
}

/**
 * Saves both the ticket-header fields AND the banner/tema fields together,
 * since both live in the same hoja CONFIGURACION and the backend expects
 * the full set of keys in one call to guardarConfiguracionNegocio.
 */
async function guardarAparienciaForm() {
  const nombre = document.getElementById("cfgNombreLocal").value.trim();

  if (!nombre) {
    toast("Completá primero el nombre del local, arriba", "error");
    return;
  }

  const cfg = {
    nombre,
    subtitulo: document.getElementById("cfgSubtitulo").value.trim(),
    direccion: document.getElementById("cfgDireccion").value.trim(),
    telefono1: document.getElementById("cfgTelefono1").value.trim(),
    telefono2: document.getElementById("cfgTelefono2").value.trim(),
    pie:       document.getElementById("cfgPie").value.trim(),

    bannerTitulo:    document.getElementById("cfgBannerTitulo").value.trim(),
    bannerSubtitulo: document.getElementById("cfgBannerSubtitulo").value.trim(),
    bannerImagen:    document.getElementById("cfgBannerImagen").value.trim(),
    tema:            document.getElementById("cfgTema").value
  };

  const btn = document.getElementById("btnGuardarApariencia");
  const textoOriginal = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = "Guardando..."; }

  try {
    const params = new URLSearchParams({ action: "guardarConfiguracionNegocio", ...cfg });
    const response = await fetch(API_URL + "?" + params.toString());
    const data = await response.json();

    if (!data.success) {
      toast(data.message || "No se pudo guardar la apariencia", "error");
      return;
    }

    configNegocioCache = { ...configNegocioCache, ...cfg };
    toast("Apariencia guardada — ya se ve en el catálogo", "success");

  } catch (error) {
    console.error("Error al guardar la apariencia:", error);
    toast("Error de conexión al guardar la apariencia", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
  }
}

/* ===================== BENEFICIOS DEL CATÁLOGO WEB (chips bajo el banner) ===================== */

const BENEFICIOS_DEFAULT = {
  beneficioWhatsappNumero: "5491140975795",
  beneficioInstagramUrl:   "",
  beneficioTelefono1:      "",
  beneficioTelefono2:      "",
  beneficioDireccion:      "",
  beneficioTextoLibre1:    "",
  beneficioTextoLibre2:    ""
};

/** Loads the saved "Beneficios" config into the form (called when Configuración opens) */
function cargarBeneficiosForm(cfg) {
  document.getElementById("cfgBeneficioWhatsapp").value  = cfg.beneficioWhatsappNumero ?? BENEFICIOS_DEFAULT.beneficioWhatsappNumero;
  document.getElementById("cfgBeneficioInstagram").value = cfg.beneficioInstagramUrl   ?? BENEFICIOS_DEFAULT.beneficioInstagramUrl;
  document.getElementById("cfgBeneficioTelefono1").value = cfg.beneficioTelefono1      ?? BENEFICIOS_DEFAULT.beneficioTelefono1;
  document.getElementById("cfgBeneficioTelefono2").value = cfg.beneficioTelefono2      ?? BENEFICIOS_DEFAULT.beneficioTelefono2;
  document.getElementById("cfgBeneficioDireccion").value = cfg.beneficioDireccion      ?? BENEFICIOS_DEFAULT.beneficioDireccion;
  document.getElementById("cfgBeneficioTexto1").value    = cfg.beneficioTextoLibre1    ?? BENEFICIOS_DEFAULT.beneficioTextoLibre1;
  document.getElementById("cfgBeneficioTexto2").value    = cfg.beneficioTextoLibre2    ?? BENEFICIOS_DEFAULT.beneficioTextoLibre2;
}

/** Reads the "Beneficios" form fields and saves them to the backend (hoja CONFIGURACION) */
async function guardarBeneficiosForm() {
  const nombre = document.getElementById("cfgNombreLocal").value.trim();

  if (!nombre) {
    toast("Completá primero el nombre del local, arriba", "error");
    return;
  }

  const whatsapp = document.getElementById("cfgBeneficioWhatsapp").value.trim();

  const cfg = {
    nombre,

    beneficioWhatsappNumero: whatsapp || BENEFICIOS_DEFAULT.beneficioWhatsappNumero,
    beneficioInstagramUrl:   document.getElementById("cfgBeneficioInstagram").value.trim(),
    beneficioTelefono1:      document.getElementById("cfgBeneficioTelefono1").value.trim(),
    beneficioTelefono2:      document.getElementById("cfgBeneficioTelefono2").value.trim(),
    beneficioDireccion:      document.getElementById("cfgBeneficioDireccion").value.trim(),
    beneficioTextoLibre1:    document.getElementById("cfgBeneficioTexto1").value.trim(),
    beneficioTextoLibre2:    document.getElementById("cfgBeneficioTexto2").value.trim()
  };

  const btn = document.getElementById("btnGuardarBeneficios");
  const textoOriginal = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = "Guardando..."; }

  try {
    const params = new URLSearchParams({ action: "guardarConfiguracionNegocio", ...cfg });
    const response = await fetch(API_URL + "?" + params.toString());
    const data = await response.json();

    if (!data.success) {
      toast(data.message || "No se pudieron guardar los beneficios", "error");
      return;
    }

    configNegocioCache = { ...configNegocioCache, ...cfg };
    toast("Beneficios guardados — ya se ven en el catálogo", "success");

  } catch (error) {
    console.error("Error al guardar los beneficios:", error);
    toast("Error de conexión al guardar los beneficios", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
  }
}

/* ===================== TOASTS ===================== */

function toast(mensaje, tipo) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast-msg" + (tipo ? " " + tipo : "");
  const icon = tipo === "error" ? "⚠️" : tipo === "success" ? "✓" : "ℹ️";
  el.innerHTML = `<span>${icon}</span><span>${escapeHtml(mensaje)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .25s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

/* ===================== METRICAS ===================== */

async function cargarMetricas() {
  try {
    const response = await fetch(API_URL + "?action=metricas");
    const data = await response.json();

    // Pedidos
    actualizarElemento("pedidosNuevos",   data.pedidosNuevos  || 0);
    actualizarElemento("TotalPedidos",    data.totalPedidos   || 0);
    actualizarElemento("totalPedidos",    data.totalPedidos   || 0);

    // Productos / stock
    actualizarElemento("productosActivos", data.productosActivos || 0);
    actualizarElemento("stockBajo",       data.stockBajo || 0);
    actualizarElemento("agotados",        data.agotados  || 0);
    actualizarElemento("clientesUnicos",  data.clientesUnicos || 0);

    // Más vendido (tarjeta resumen del dashboard)
    if (data.masVendidoCantidad > 0) {
      actualizarElemento("cantidadMasVendidos", data.masVendidoCantidad + " uds · " + (data.masVendidoNombre || ""));
    } else {
      actualizarElemento("cantidadMasVendidos", "Ver ranking →");
    }

    // Ventas — combinadas (POS + Pedidos), usadas en tarjetas genéricas / Reportes
    const ventasHoyTotal = Number(data.ventasHoy || 0);
    const ventasMesTotal = Number(data.ventasMes || 0);
    actualizarElemento("ventasHoy",     "$" + ventasHoyTotal.toLocaleString("es-AR"));
    actualizarElemento("ventasMes",     "$" + ventasMesTotal.toLocaleString("es-AR"));
    actualizarElemento("ventasTotales", "$" + ventasMesTotal.toLocaleString("es-AR"));

    const tp = "$" + Math.round(data.ticketPromedio || 0).toLocaleString("es-AR");
    actualizarElemento("TicketPromedio", tp);
    actualizarElemento("ticketPromedio", tp);

    // Ventas — POS (mostrador) hoy/mes
    const posHoy = Number(data.ventasPOSHoy || 0);
    const posMes = Number(data.ventasPOSMes || 0);
    actualizarElemento("ventasPOSHoy", "$" + posHoy.toLocaleString("es-AR"));
    actualizarElemento("ventasPOSMes", "$" + posMes.toLocaleString("es-AR"));

    // Ventas — Pedidos hoy/mes
    const pedHoy = Number(data.ventasPedidosHoy || 0);
    const pedMes = Number(data.ventasPedidosMes || 0);
    actualizarElemento("ventasPedidosHoy", "$" + pedHoy.toLocaleString("es-AR"));
    actualizarElemento("ventasPedidosMes", "$" + pedMes.toLocaleString("es-AR"));

    // POS summary banner (dashboard) — usa específicamente las ventas de mostrador
    actualizarElemento("posVentasHoyBanner",  "$" + posHoy.toLocaleString("es-AR"));
    actualizarElemento("posVentasMesBanner",  "$" + posMes.toLocaleString("es-AR"));
    actualizarElemento("posTicketPromBanner", tp);
    actualizarElemento("posTotalPedBanner",   data.totalVentasPOS || 0);

    marcarActualizacionEnVivo();

  } catch (error) {
    console.error("Error métricas:", error);
    marcarActualizacionEnVivo(true);
  }
}

/** Updates the "live" badge on the dashboard so users can see the data is fresh */
function marcarActualizacionEnVivo(fallo) {
  const badge = document.getElementById("posLiveBadge");
  if (!badge) return;
  const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (fallo) {
    badge.classList.add("ps-badge-error");
    badge.innerHTML = `⚠️ Sin conexión`;
    return;
  }
  badge.classList.remove("ps-badge-error");
  badge.innerHTML = `📊 En vivo · ${hora}`;
  badge.classList.remove("pulse");
  void badge.offsetWidth;
  badge.classList.add("pulse");
}

/* ===================== POS VENTAS RECIENTES (dashboard) ===================== */

async function cargarVentasPOS() {
  try {
    const response = await fetch(API_URL + "?action=ventasPOS");
    const data = await response.json();
    ventasPOSGlobal = data.ventas || [];
    renderVentasPOSRecientes(ventasPOSGlobal);
  } catch (error) {
    // Action may not exist yet on Apps Script — silently ignore
    console.warn("ventasPOS action not available:", error);
    renderVentasPOSRecientes([]);
  }
}

function renderVentasPOSRecientes(lista) {
  const tbody = document.getElementById("tablaPOSRecientes");
  if (!tbody) return;

  if (!lista || lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No hay ventas del día aún</td></tr>`;
    return;
  }

  let html = "";
  lista.slice(0, 20).forEach(v => {
    const hora = v.FECHA ? new Date(v.FECHA).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—";
    const items = v.ITEMS || v.DETALLE || "—";
    const pago  = v.FORMA_PAGO || v.PAGO || "—";
    const total = Number(v.TOTAL || 0).toLocaleString("es-AR");

    html += `
      <tr>
        <td class="mono">${escapeHtml(String(v.VENTA_ID || v.ID || "—"))}</td>
        <td>${hora}</td>
        <td>${escapeHtml(String(items))}</td>
        <td>${escapeHtml(String(pago))}</td>
        <td class="money">$${total}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary"
            onclick='imprimirVentaDesdeData(${JSON.stringify(v)})'>🖨️</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

/* ===================== VENTAS POS — HISTORIAL (sección dedicada) ===================== */

let ventasPOSHistorialGlobal = [];

/** Loads POS sales history for the date range selected in the filter inputs (defaults to last 60 days) */
async function cargarVentasPOSHistorial() {
  const tbody = document.getElementById("tablaVentasPOSHistorial");
  if (!tbody) return;

  const desdeInput = document.getElementById("vpDesde");
  const hastaInput = document.getElementById("vpHasta");

  // Default the date pickers to a sensible range on first load (last 30 days)
  if (desdeInput && !desdeInput.value) {
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    desdeInput.value = hace30.toISOString().slice(0, 10);
  }
  if (hastaInput && !hastaInput.value) {
    hastaInput.value = new Date().toISOString().slice(0, 10);
  }

  tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">Cargando ventas...</td></tr>`;

  try {
    const params = new URLSearchParams({ action: "ventasPOSHistorial" });
    if (desdeInput && desdeInput.value) params.set("desde", desdeInput.value);
    if (hastaInput && hastaInput.value) params.set("hasta", hastaInput.value);

    const response = await fetch(API_URL + "?" + params.toString());
    const data = await response.json();

    ventasPOSHistorialGlobal = data.ventas || [];
    renderVentasPOSHistorial(ventasPOSHistorialGlobal);

  } catch (error) {
    console.error("Error al cargar historial de ventas POS:", error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">Error al cargar el historial</td></tr>`;
  }
}

function renderVentasPOSHistorial(lista) {
  const tbody = document.getElementById("tablaVentasPOSHistorial");
  if (!tbody) return;

  if (!lista || lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">No hay ventas en el rango seleccionado</td></tr>`;
    return;
  }

  let html = "";
  lista.forEach(v => {
    const fechaObj = v.FECHA ? new Date(v.FECHA) : null;
    const fecha = fechaObj ? fechaObj.toLocaleDateString("es-AR") : "—";
    const hora  = fechaObj ? fechaObj.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—";
    const items = v.ITEMS || v.DETALLE || "—";
    const pago  = v.FORMA_PAGO || v.PAGO || "—";
    const total = Number(v.TOTAL || 0).toLocaleString("es-AR");

    html += `
      <tr>
        <td class="mono">${escapeHtml(String(v.VENTA_ID || v.ID || "—"))}</td>
        <td>${fecha}</td>
        <td>${hora}</td>
        <td>${escapeHtml(String(items))}</td>
        <td>${escapeHtml(String(pago))}</td>
        <td class="money">$${total}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary"
            onclick='imprimirVentaDesdeData(${JSON.stringify(v)})' title="Reimprimir ticket">🖨️ Reimprimir</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

/** Client-side filter by sale id or payment method, over the already-loaded historial */
function filtrarVentasPOSHistorial() {
  const input = document.getElementById("vpBuscar");
  const termino = (input ? input.value : "").toLowerCase().trim();

  if (!termino) {
    renderVentasPOSHistorial(ventasPOSHistorialGlobal);
    return;
  }

  const filtradas = ventasPOSHistorialGlobal.filter(v => {
    const id   = String(v.VENTA_ID || v.ID || "").toLowerCase();
    const pago = String(v.FORMA_PAGO || v.PAGO || "").toLowerCase();
    const items = String(v.ITEMS || v.DETALLE || "").toLowerCase();
    return id.includes(termino) || pago.includes(termino) || items.includes(termino);
  });

  renderVentasPOSHistorial(filtradas);
}

/* ===================== NAVEGACION ===================== */

function mostrarSeccion(id) {
  document.querySelectorAll(".seccion").forEach(sec => { sec.style.display = "none"; });

  const seccion = document.getElementById(id);
  if (seccion) seccion.style.display = "block";

  // Sync sidebar links
  document.querySelectorAll("#navLinks a").forEach(a => {
    a.classList.toggle("active", a.getAttribute("data-target") === id);
  });

  // Sync bottom nav links
  document.querySelectorAll("#bottomNavLinks a").forEach(a => {
    a.classList.toggle("active", a.getAttribute("data-target") === id);
  });

  if (id === "pedidos")   cargarPedidos();
  if (id === "productos") cargarProductos();
  if (id === "ventasPOS") cargarVentasPOSHistorial();
  if (id === "configuracion") { cargarConfigNegocioForm(); actualizarEstadoUSBPrint(); }

  if (id === "pos") {
    asegurarProductosPOS().then(renderPosGrid);
    setTimeout(() => {
      const input = document.getElementById("posBusqueda");
      if (input) input.focus();
    }, 80);
  }

  if (id === "cierreCaja") cargarResumenCierreCaja();
}

/* ===================== PEDIDOS ===================== */

async function cargarPedidos() {
  try {
    const response = await fetch(API_URL + "?action=pedidos");
    const data = await response.json();
    pedidosGlobal = data.pedidos || [];
    if (!data.pedidos) return;
    renderPedidos(pedidosGlobal);
  } catch (error) {
    console.error("Error pedidos:", error);
  }
}

async function cambiarEstado(pedidoId, estado) {
  try {
    const response = await fetch(
      API_URL +
      "?action=actualizarEstado" +
      "&pedidoId=" + encodeURIComponent(pedidoId) +
      "&estado="   + encodeURIComponent(estado)
    );
    const data = await response.json();
    if (!data.success) { toast("No se pudo actualizar el pedido", "error"); return; }
    toast("Estado actualizado", "success");
  } catch (error) {
    console.error(error);
    toast("Error de conexión", "error");
  }
}

function filtrarPedidos() {
  const texto = document.getElementById("buscarPedido").value.toLowerCase();
  const filtrados = pedidosGlobal.filter(p =>
    String(p.PEDIDO_ID || "").toLowerCase().includes(texto) ||
    String(p.CLIENTE   || "").toLowerCase().includes(texto) ||
    String(p.DNI       || "").toLowerCase().includes(texto)
  );
  renderPedidos(filtrados);
}

function renderPedidos(lista) {
  let html = "";
  if (lista.length === 0) {
    html = `<tr><td colspan="6" class="text-center text-muted py-4">No se encontraron pedidos</td></tr>`;
  }
  lista.forEach(p => {
    const estadoColor = p.ESTADO === "NUEVO" ? "table-warning" : "";
    html += `
    <tr class="${estadoColor}">
      <td class="mono">${escapeHtml(p.PEDIDO_ID)}</td>
      <td>${new Date(p.FECHA).toLocaleString("es-AR")}</td>
      <td>${escapeHtml(p.CLIENTE)}</td>
      <td class="money">$${Number(p.TOTAL || 0).toLocaleString("es-AR")}</td>
      <td>
        <select class="form-select form-select-sm" onchange="cambiarEstado('${p.PEDIDO_ID}',this.value)">
          <option value="NUEVO"      ${p.ESTADO==="NUEVO"?"selected":""}>NUEVO</option>
          <option value="PREPARANDO" ${p.ESTADO==="PREPARANDO"?"selected":""}>PREPARANDO</option>
          <option value="ENVIADO"    ${p.ESTADO==="ENVIADO"?"selected":""}>ENVIADO</option>
          <option value="ENTREGADO"  ${p.ESTADO==="ENTREGADO"?"selected":""}>ENTREGADO</option>
          <option value="CANCELADO"  ${p.ESTADO==="CANCELADO"?"selected":""}>CANCELADO</option>
        </select>
      </td>
      <td>${p.PDF_URL ? `<a href="${p.PDF_URL}" target="_blank" class="btn btn-primary btn-sm">PDF</a>` : "-"}</td>
    </tr>`;
  });
  document.getElementById("tablaPedidos").innerHTML = html;
}

/* ===================== PRODUCTOS (tabla admin) ===================== */

async function cargarProductos() {
  try {
    const response = await fetch(API_URL + "?action=productosAdmin");
    const data = await response.json();
    if (!data.productos) return;

    productosAdminGlobal = data.productos;

    poblarFiltroCategoriasProductos();
    filtrarProductos();

  } catch (error) {
    console.error("Error productos:", error);
  }
}

function renderTablaProductos(lista) {
  const tbody = document.getElementById("tablaProductos");
  if (!tbody) return;

  if (!lista || lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No se encontraron productos</td></tr>`;
    return;
  }

  let html = "";
  lista.forEach(p => {
    const publicado = String(p.PUBLICADO || "").toUpperCase() === "SI";
    const stock = Number(p.STOCK || 0);
    const stockBadge = stock === 0
      ? `<span class="tile-stock out">Sin stock</span>`
      : (stock <= 5 ? `<span class="tile-stock low">${stock}</span>` : stock);

    html += `
    <tr>
      <td class="mono">${escapeHtml(p.CODIGO)}</td>
      <td>${escapeHtml(p.PRODUCTO)}</td>
      <td>${escapeHtml(p.CATEGORIA || "—")}</td>
      <td class="money">$${Number(p.PRECIO || 0).toLocaleString("es-AR")}</td>
      <td>${stockBadge}</td>
      <td>
        <span class="badge ${publicado ? "bg-success" : "bg-secondary"}">${publicado ? "Publicado" : "Oculto"}</span>
      </td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="editarProducto('${escapeHtml(p.CODIGO)}')">Editar</button>
        <button class="btn btn-danger btn-sm ms-2" onclick="eliminarProducto('${escapeHtml(p.CODIGO)}')">Eliminar</button>
      </td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

/** Fills the category <select> filter with the distinct categories currently in use */
function poblarFiltroCategoriasProductos() {
  const select = document.getElementById("filtroCategoriaProductos");
  if (!select) return;

  const valorActual = select.value;
  const categorias = [...new Set(
    productosAdminGlobal.map(p => String(p.CATEGORIA || "").trim()).filter(Boolean)
  )].sort();

  select.innerHTML = `<option value="">Todas las categorías</option>` +
    categorias.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  // Preserve the user's selection across refreshes when still valid
  if (categorias.includes(valorActual)) select.value = valorActual;
}

/** Client-side filter by name/code (text) and category (select), over the already-loaded product list */
function filtrarProductos() {
  const inputBuscar = document.getElementById("buscarProducto");
  const selectCategoria = document.getElementById("filtroCategoriaProductos");

  const termino = (inputBuscar ? inputBuscar.value : "").toLowerCase().trim();
  const categoria = selectCategoria ? selectCategoria.value : "";

  let filtrados = productosAdminGlobal;

  if (termino) {
    filtrados = filtrados.filter(p => {
      const codigo = String(p.CODIGO || "").toLowerCase();
      const nombre = String(p.PRODUCTO || "").toLowerCase();
      return codigo.includes(termino) || nombre.includes(termino);
    });
  }

  if (categoria) {
    filtrados = filtrados.filter(p => String(p.CATEGORIA || "").trim() === categoria);
  }

  renderTablaProductos(filtrados);
}

/* ===================== PRODUCTOS — ALTA / EDICIÓN (modal) ===================== */

let productosAdminGlobal = [];

/** Opens the modal in "create" mode */
function nuevoProducto() {
  document.getElementById("productModalTitle").textContent = "+ Nuevo Producto";
  document.getElementById("pmCodigoOriginal").value = "";
  document.getElementById("pmCodigo").value = "";
  document.getElementById("pmCodigo").disabled = false;
  document.getElementById("pmNombre").value = "";
  document.getElementById("pmCategoria").value = "";
  document.getElementById("pmPrecio").value = "";
  document.getElementById("pmStock").value = "";
  document.getElementById("pmPublicado").checked = true;
  document.getElementById("pmDestacado").checked = false;
  document.getElementById("pmOferta").checked = false;

  poblarCategoriasDatalist();
  document.getElementById("productModalBackdrop").classList.add("show");
  setTimeout(() => document.getElementById("pmNombre").focus(), 80);
}

/** Opens the modal in "edit" mode, pre-filled with the product's current data */
function editarProducto(codigo) {
  const p = productosAdminGlobal.find(x => String(x.CODIGO) === String(codigo));
  if (!p) { toast("No se encontró el producto para editar", "error"); return; }

  document.getElementById("productModalTitle").textContent = "✏️ Editar Producto";
  document.getElementById("pmCodigoOriginal").value = p.CODIGO;
  document.getElementById("pmCodigo").value = p.CODIGO;
  document.getElementById("pmNombre").value = p.PRODUCTO || "";
  document.getElementById("pmCategoria").value = p.CATEGORIA || "";
  document.getElementById("pmPrecio").value = Number(p.PRECIO || 0);
  document.getElementById("pmStock").value = Number(p.STOCK || 0);
  document.getElementById("pmPublicado").checked = String(p.PUBLICADO || "").toUpperCase() === "SI";
  document.getElementById("pmDestacado").checked = String(p.DESTACADO || "").toUpperCase() === "SI";
  document.getElementById("pmOferta").checked = String(p.OFERTA || "").toUpperCase() === "SI";

  poblarCategoriasDatalist();
  document.getElementById("productModalBackdrop").classList.add("show");
}

function cerrarModalProducto() {
  document.getElementById("productModalBackdrop").classList.remove("show");
}

/** Fills the category <datalist> with the distinct categories already in use */
function poblarCategoriasDatalist() {
  const datalist = document.getElementById("pmCategoriasList");
  if (!datalist) return;
  const categorias = [...new Set(
    productosAdminGlobal.map(p => String(p.CATEGORIA || "").trim()).filter(Boolean)
  )].sort();
  datalist.innerHTML = categorias.map(c => `<option value="${escapeHtml(c)}"></option>`).join("");
}

/** Saves the product form — creates a new product or updates an existing one */
async function guardarProductoForm() {
  const codigoOriginal = document.getElementById("pmCodigoOriginal").value.trim();
  const codigo   = document.getElementById("pmCodigo").value.trim();
  const nombre   = document.getElementById("pmNombre").value.trim();
  const categoria = document.getElementById("pmCategoria").value.trim();
  const precio   = document.getElementById("pmPrecio").value;
  const stock    = document.getElementById("pmStock").value;
  const publicado = document.getElementById("pmPublicado").checked ? "SI" : "NO";
  const destacado  = document.getElementById("pmDestacado").checked ? "SI" : "NO";
  const oferta     = document.getElementById("pmOferta").checked ? "SI" : "NO";

  if (!nombre) { toast("El nombre del producto es obligatorio", "error"); return; }
  if (precio === "" || Number(precio) < 0) { toast("Ingresá un precio válido", "error"); return; }

  const esEdicion = !!codigoOriginal;
  const btn = document.getElementById("btnGuardarProducto");
  const textoOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "Guardando...";

  try {
    const params = new URLSearchParams({
      action: esEdicion ? "actualizarProducto" : "guardarProducto",
      CODIGO: codigo,
      PRODUCTO: nombre,
      CATEGORIA: categoria,
      PRECIO: precio || 0,
      STOCK: stock || 0,
      PUBLICADO: publicado,
      DESTACADO: destacado,
      OFERTA: oferta
    });
    if (esEdicion) params.set("codigoOriginal", codigoOriginal);

    const response = await fetch(API_URL + "?" + params.toString());
    const data = await response.json();

    if (!data.success) {
      toast(data.message || "No se pudo guardar el producto", "error");
      return;
    }

    toast(esEdicion ? "Producto actualizado" : "Producto creado", "success");
    cerrarModalProducto();
    cargarProductos();

    // Refresh in-memory POS catalog too, so the new/edited product shows up right away
    productosPOS = [];

  } catch (error) {
    console.error("Error al guardar producto:", error);
    toast("Error de conexión al guardar el producto", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = textoOriginal;
  }
}

/** Deletes a product after confirmation */
async function eliminarProducto(codigo) {
  if (!confirm("¿Eliminar el producto \"" + codigo + "\"? Esta acción no se puede deshacer.")) return;

  try {
    const params = new URLSearchParams({ action: "eliminarProducto", codigo });
    const response = await fetch(API_URL + "?" + params.toString());
    const data = await response.json();

    if (!data.success) {
      toast(data.message || "No se pudo eliminar el producto", "error");
      return;
    }

    toast("Producto eliminado", "success");
    cargarProductos();
    productosPOS = [];

  } catch (error) {
    console.error("Error al eliminar producto:", error);
    toast("Error de conexión al eliminar el producto", "error");
  }
}

/* ===================== CLIENTES ===================== */

async function cargarClientes() {
  try {
    const response = await fetch(API_URL + "?action=clientes");
    const data = await response.json();
    let html = "";
    if (!data.clientes) return;
    if (data.clientes.length === 0) {
      html = `<tr><td colspan="7" class="text-center text-muted py-4">No hay clientes</td></tr>`;
    }
    data.clientes.forEach(c => {
      html += `
      <tr>
        <td>${escapeHtml(c.CLIENTE)}</td>
        <td>${escapeHtml(c.EMPRESA)}</td>
        <td>${escapeHtml(c.DIRECCION)}</td>
        <td>${escapeHtml(c.TELEFONO)}</td>
        <td>${escapeHtml(c.DNI)}</td>
        <td>${c.PEDIDOS}</td>
        <td class="money">$${Number(c.TOTAL || 0).toLocaleString("es-AR")}</td>
      </tr>`;
    });
    document.getElementById("tablaClientes").innerHTML = html;
  } catch (error) {
    console.error("Error clientes:", error);
  }
}

/* ===================== STOCK BAJO / AGOTADOS / MAS VENDIDOS ===================== */

async function cargarStockBajo() {
  mostrarSeccion("stockBajoProductos");
  try {
    const response = await fetch(API_URL + "?action=productos");
    const data = await response.json();
    let html = "";
    const filtrados = data.productos.filter(p => { const s = Number(p.STOCK || 0); return s > 0 && s <= 5; });
    if (filtrados.length === 0) {
      html = `<tr><td colspan="3" class="text-center text-muted py-4">Sin productos con stock bajo 🎉</td></tr>`;
    }
    filtrados.forEach(p => {
      html += `<tr><td class="mono">${escapeHtml(p.CODIGO)}</td><td>${escapeHtml(p.PRODUCTO)}</td><td>${p.STOCK}</td></tr>`;
    });
    document.getElementById("tablaStockBajo").innerHTML = html;
  } catch (error) {
    console.error("Error stock bajo:", error);
  }
}

async function cargarAgotados() {
  mostrarSeccion("productosAgotados");
  try {
    const response = await fetch(API_URL + "?action=productos");
    const data = await response.json();
    let html = "";
    const filtrados = data.productos.filter(p => Number(p.STOCK || 0) === 0);
    if (filtrados.length === 0) {
      html = `<tr><td colspan="3" class="text-center text-muted py-4">No hay productos agotados 🎉</td></tr>`;
    }
    filtrados.forEach(p => {
      html += `<tr><td class="mono">${escapeHtml(p.CODIGO)}</td><td>${escapeHtml(p.PRODUCTO)}</td><td>0</td></tr>`;
    });
    document.getElementById("tablaAgotados").innerHTML = html;
  } catch (error) {
    console.error("Error agotados:", error);
  }
}

async function cargarMasVendidos() {
  try {
    const response = await fetch(API_URL + "?action=masVendidos");
    const data = await response.json();
    let html = "";
    (data.productos || []).forEach(p => {
      html += `<tr><td class="mono">${p.CODIGO}</td><td>${p.PRODUCTO}</td><td>${p.VENDIDOS}</td></tr>`;
    });
    document.getElementById("tablaMasVendidos").innerHTML = html;
  } catch (error) {
    console.error("Error más vendidos:", error);
  }
}

/* ===================================================================
   PUNTO DE VENTA
=================================================================== */

let productosPOS    = [];
let ticketPOS        = [];
let categoriaActivaPOS = "TODAS";
let formaPagoPOS    = "EFECTIVO";

// Descuento aplicado al ticket actual
let descuentoTipoPOS   = "PORCENTAJE"; // "PORCENTAJE" | "MONTO"
let descuentoValorPOS  = 0;            // valor ingresado (ej: 10 para 10%, o 500 para $500)
let descuentoActivoPOS = false;

async function asegurarProductosPOS() {
  if (productosPOS.length === 0) {
    const response = await fetch(API_URL + "?action=productos");
    const data = await response.json();
    productosPOS = data.productos || [];
    construirCategoriasPOS();
  }
}

function construirCategoriasPOS() {
  const cont = document.getElementById("posCategorias");
  if (!cont) return;
  const categorias = new Set();
  productosPOS.forEach(p => { if (p.CATEGORIA) categorias.add(String(p.CATEGORIA).trim()); });
  if (categorias.size === 0) { cont.innerHTML = ""; return; }
  let html = `<div class="cat-chip active" data-cat="TODAS" onclick="filtrarCategoriaPOS('TODAS', this)">Todas</div>`;
  categorias.forEach(c => {
    html += `<div class="cat-chip" data-cat="${escapeHtml(c)}" onclick="filtrarCategoriaPOS('${escapeHtml(c)}', this)">${escapeHtml(c)}</div>`;
  });
  cont.innerHTML = html;
}

function filtrarCategoriaPOS(cat, el) {
  categoriaActivaPOS = cat;
  document.querySelectorAll(".cat-chip").forEach(c => c.classList.remove("active"));
  if (el) el.classList.add("active");
  renderPosGrid();
}

/* ---- product grid ---- */

function renderPosGrid(filtroTexto) {
  const grid = document.getElementById("posProductGrid");
  if (!grid) return;

  let lista = productosPOS;
  if (categoriaActivaPOS && categoriaActivaPOS !== "TODAS") {
    lista = lista.filter(p => String(p.CATEGORIA || "").trim() === categoriaActivaPOS);
  }
  if (filtroTexto) {
    const texto = filtroTexto.toLowerCase();
    lista = lista.filter(p =>
      String(p.CODIGO).toLowerCase().includes(texto) ||
      String(p.PRODUCTO).toLowerCase().includes(texto)
    );
  }

  if (lista.length === 0) {
    grid.innerHTML = `
      <div class="pos-empty-state" style="grid-column:1/-1;">
        <div class="ic">🔍</div>
        <strong>Sin resultados</strong>
        <span>Probá con otro código o nombre</span>
      </div>`;
    return;
  }

  let html = "";
  const visibleList = lista.slice(0, 60);

  visibleList.forEach((p, idx) => {
    const stock     = p.STOCK !== undefined ? Number(p.STOCK) : null;
    const agotado   = stock !== null && stock <= 0;
    const stockBajo = stock !== null && stock > 0 && stock <= 5;

    let stockBadge = "";
    if (agotado)        stockBadge = `<span class="tile-stock out">Sin stock</span>`;
    else if (stockBajo) stockBadge = `<span class="tile-stock low">Stock: ${stock}</span>`;
    else if (stock !== null) stockBadge = `<span class="tile-stock ok">Stock: ${stock}</span>`;

    const cat = p.CATEGORIA ? escapeHtml(String(p.CATEGORIA).trim()) : "";

    html += `
      <button type="button"
        class="product-tile ${agotado ? "disabled" : ""}"
        data-idx="${idx}"
        ${agotado ? "disabled" : ""}>
        <div class="tile-info">
          <span class="tile-code">${escapeHtml(p.CODIGO)}</span>
          <span class="tile-name">${escapeHtml(p.PRODUCTO)}</span>
          ${cat ? `<span class="tile-cat">${cat}</span>` : ""}
        </div>
        <div class="tile-right">
          <span class="tile-price">$${Number(p.PRECIO || 0).toLocaleString("es-AR")}</span>
          ${stockBadge}
        </div>
        <span class="tile-add">+</span>
      </button>`;
  });

  grid.innerHTML = html;

  grid.querySelectorAll(".product-tile[data-idx]").forEach(tile => {
    const idx     = Number(tile.getAttribute("data-idx"));
    const producto = visibleList[idx];
    if (producto && !tile.disabled) {
      tile.dataset.codigo = producto.CODIGO;
      tile.addEventListener("click", () => agregarProductoPOS(producto.CODIGO));
    }
  });
}

function onPosInputKeyup(e) {
  const input = e.target;
  if (e.key === "Enter") {
    const valor = input.value.trim();
    if (valor !== "") {
      agregarProductoPorCodigo(valor);
      input.value = "";
      renderPosGrid();
    }
    return;
  }
  renderPosGrid(input.value.trim());
}

/* ---- adding items ---- */

async function agregarProductoPorCodigo(codigo) {
  codigo = String(codigo).trim();
  if (codigo === "") return;
  await asegurarProductosPOS();
  const producto = productosPOS.find(p => String(p.CODIGO).trim().toLowerCase() === codigo.toLowerCase());
  if (!producto) { toast(`Producto no encontrado: ${codigo}`, "error"); return; }
  agregarProductoPOS(producto.CODIGO);
}

function agregarProductoPOS(codigo) {
  codigo = String(codigo).trim();
  const producto = productosPOS.find(p => String(p.CODIGO).trim() === codigo);
  if (!producto) { toast("Producto no encontrado", "error"); return; }
  const stock = producto.STOCK !== undefined ? Number(producto.STOCK) : null;
  if (stock !== null && stock <= 0) { toast(`${producto.PRODUCTO} está sin stock`, "error"); return; }

  const existente = ticketPOS.find(item => String(item.CODIGO).trim() === codigo);
  if (existente) {
    existente.cantidad++;
  } else {
    ticketPOS.push({ CODIGO: producto.CODIGO, PRODUCTO: producto.PRODUCTO, PRECIO: Number(producto.PRECIO || 0), cantidad: 1 });
  }
  renderTicketPOS();
  flashTile(codigo);

  const input = document.getElementById("posBusqueda");
  if (input) { input.value = ""; input.focus(); }
}

function flashTile(codigo) {
  const tile = document.querySelector(`.product-tile[data-codigo="${cssEscape(codigo)}"]`);
  if (!tile) return;
  tile.classList.remove("just-added");
  void tile.offsetWidth;
  tile.classList.add("just-added");
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

function cambiarCantidadPOS(codigo, delta) {
  const item = ticketPOS.find(i => String(i.CODIGO).trim() === String(codigo).trim());
  if (!item) return;
  item.cantidad += delta;
  if (item.cantidad <= 0) { quitarProductoPOS(codigo); return; }
  renderTicketPOS();
}

function quitarProductoPOS(codigo) {
  ticketPOS = ticketPOS.filter(i => String(i.CODIGO).trim() !== String(codigo).trim());
  renderTicketPOS();
}

function vaciarTicketPOS() {
  if (ticketPOS.length === 0) return;
  if (!confirm("¿Vaciar el ticket actual?")) return;
  ticketPOS = [];
  resetearDescuentoPOS();
  renderTicketPOS();
}

/* ---- ticket rendering ---- */

function renderTicketPOS() {
  let html = "";
  let subtotal = 0;
  let totalItems = 0;

  ticketPOS.forEach(item => {
    const sub = item.PRECIO * item.cantidad;
    subtotal += sub;
    totalItems += item.cantidad;
    html += `
      <div class="ticket-row">
        <div class="ti-info">
          <div class="ti-name">${escapeHtml(item.PRODUCTO)}</div>
          <div class="ti-price">$${item.PRECIO.toLocaleString("es-AR")} c/u</div>
        </div>
        <div class="ti-qty">
          <button class="qty-btn" onclick="cambiarCantidadPOS('${item.CODIGO}', -1)">−</button>
          <span class="qty-val">${item.cantidad}</span>
          <button class="qty-btn" onclick="cambiarCantidadPOS('${item.CODIGO}', 1)">+</button>
        </div>
        <div class="ti-sub money">$${sub.toLocaleString("es-AR")}</div>
        <button class="ti-remove" onclick="quitarProductoPOS('${item.CODIGO}')" title="Quitar">✕</button>
      </div>`;
  });

  const tabla = document.getElementById("ticketPOS");
  if (tabla) tabla.innerHTML = html;

  const emptyState = document.getElementById("ticketEmptyState");
  if (emptyState) emptyState.style.display = ticketPOS.length === 0 ? "flex" : "none";

  const { montoDescuento, total } = calcularDescuentoPOS(subtotal);

  const subtotalEl = document.getElementById("subtotalPOS");
  if (subtotalEl) subtotalEl.innerText = subtotal.toLocaleString("es-AR");

  const rowDescuentoEl = document.getElementById("rowDescuentoPOS");
  const descuentoMontoEl = document.getElementById("descuentoMontoPOS");
  if (rowDescuentoEl && descuentoMontoEl) {
    if (descuentoActivoPOS && montoDescuento > 0) {
      rowDescuentoEl.style.display = "flex";
      descuentoMontoEl.innerText = "-$" + montoDescuento.toLocaleString("es-AR");
    } else {
      rowDescuentoEl.style.display = "none";
    }
  }

  const totalEl = document.getElementById("totalPOS");
  if (totalEl) totalEl.innerText = total.toLocaleString("es-AR");

  const countEl = document.getElementById("ticketCount");
  if (countEl) countEl.innerText = ticketPOS.length;

  const itemsCountEl = document.getElementById("ticketItemsCount");
  if (itemsCountEl) itemsCountEl.innerText = totalItems;

  const finalizeBtn = document.getElementById("btnFinalizarVenta");
  if (finalizeBtn) finalizeBtn.disabled = ticketPOS.length === 0;

  const printBtn = document.getElementById("btnImprimirTicket");
  if (printBtn) printBtn.disabled = ticketPOS.length === 0;

  actualizarUIDescuentoPOS();
}

/* ---- discount ---- */

/** Computes the discount amount (clamped to the subtotal) and the resulting total */
function calcularDescuentoPOS(subtotal) {
  if (!descuentoActivoPOS || descuentoValorPOS <= 0) {
    return { montoDescuento: 0, total: subtotal };
  }

  let monto = descuentoTipoPOS === "PORCENTAJE"
    ? subtotal * (descuentoValorPOS / 100)
    : descuentoValorPOS;

  monto = Math.max(0, Math.min(monto, subtotal)); // nunca negativo ni mayor al subtotal

  return { montoDescuento: monto, total: subtotal - monto };
}

function toggleDescuentoPOS() {
  const panel = document.getElementById("discountPanel");
  if (!panel) return;
  const abierto = panel.style.display !== "none";
  panel.style.display = abierto ? "none" : "flex";
  if (!abierto) {
    setTimeout(() => {
      const input = document.getElementById("descuentoValorInput");
      if (input) input.focus();
    }, 50);
  }
}

function elegirTipoDescuento(el, tipo) {
  descuentoTipoPOS = tipo;
  document.querySelectorAll(".discount-type-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");

  const input = document.getElementById("descuentoValorInput");
  if (input) input.placeholder = tipo === "PORCENTAJE" ? "Ej: 10" : "Ej: 500";

  aplicarDescuentoPOS();
}

function aplicarDescuentoPOS() {
  const input = document.getElementById("descuentoValorInput");
  const valor = Number(input ? input.value : 0) || 0;

  descuentoValorPOS = Math.max(0, valor);
  descuentoActivoPOS = descuentoValorPOS > 0;

  renderTicketPOS();
}

function quitarDescuentoPOS() {
  resetearDescuentoPOS();
  const panel = document.getElementById("discountPanel");
  if (panel) panel.style.display = "none";
  renderTicketPOS();
}

function resetearDescuentoPOS() {
  descuentoActivoPOS = false;
  descuentoValorPOS = 0;
  const input = document.getElementById("descuentoValorInput");
  if (input) input.value = "";
  const motivo = document.getElementById("descuentoMotivoInput");
  if (motivo) motivo.value = "";
}

/** Returns a short human-readable label for the active discount, e.g. "10% (-$500)" or "-$300" */
function obtenerEtiquetaDescuentoPOS(subtotal) {
  if (!descuentoActivoPOS || descuentoValorPOS <= 0) return "";
  const { montoDescuento } = calcularDescuentoPOS(subtotal);
  const motivo = (document.getElementById("descuentoMotivoInput") || {}).value || "";
  let etiqueta = descuentoTipoPOS === "PORCENTAJE"
    ? `${descuentoValorPOS}% (-$${Math.round(montoDescuento).toLocaleString("es-AR")})`
    : `-$${Math.round(montoDescuento).toLocaleString("es-AR")}`;
  if (motivo.trim()) etiqueta += ` — ${motivo.trim()}`;
  return etiqueta;
}

/** Keeps the toggle button label/style in sync with the current discount state */
function actualizarUIDescuentoPOS() {
  const btn = document.getElementById("btnToggleDescuento");
  const label = document.getElementById("discountToggleLabel");
  if (!btn || !label) return;

  if (descuentoActivoPOS && descuentoValorPOS > 0) {
    btn.classList.add("has-discount");
    label.innerText = descuentoTipoPOS === "PORCENTAJE"
      ? `Descuento aplicado: ${descuentoValorPOS}%`
      : `Descuento aplicado: $${descuentoValorPOS.toLocaleString("es-AR")}`;
  } else {
    btn.classList.remove("has-discount");
    label.innerText = "Agregar descuento";
  }
}

/* ---- payment method ---- */

function elegirFormaPago(el, valor) {
  formaPagoPOS = valor;
  document.querySelectorAll(".pay-method-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
}

/* ---- finalize sale ---- */

async function finalizarVentaPOS() {
  if (ticketPOS.length === 0) { toast("El ticket está vacío", "error"); return; }

  const subtotal = ticketPOS.reduce((acc, item) => acc + (item.PRECIO * item.cantidad), 0);
  const { montoDescuento, total } = calcularDescuentoPOS(subtotal);
  const etiquetaDescuento = obtenerEtiquetaDescuentoPOS(subtotal);

  const btn = document.getElementById("btnFinalizarVenta");
  const textoOriginal = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = "Procesando..."; }

  try {
    const response = await fetch(
      API_URL +
      "?action=guardarVenta" +
      "&total="         + encodeURIComponent(total) +
      "&formaPago="     + encodeURIComponent(formaPagoPOS) +
      "&observaciones=" + encodeURIComponent(etiquetaDescuento ? "Descuento: " + etiquetaDescuento : "") +
      "&carrito="       + encodeURIComponent(JSON.stringify(ticketPOS))
    );
    const data = await response.json();

    if (!data.success) {
      toast(data.message || "No se pudo registrar la venta", "error");
      if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
      return;
    }

    // Save a copy for thermal printing from receipt modal
    ultimaVentaImprimible = {
      ventaId:    data.ventaId,
      items:      [...ticketPOS],
      total:      total,
      subtotal:   subtotal,
      descuento:  montoDescuento,
      descuentoEtiqueta: etiquetaDescuento,
      formaPago:  formaPagoPOS,
      fecha:      new Date()
    };

    mostrarRecibo(data.ventaId, ticketPOS, total, subtotal, montoDescuento);
    ticketPOS = [];
    resetearDescuentoPOS();
    renderTicketPOS();

    productosPOS = [];
    await asegurarProductosPOS();
    renderPosGrid();
    cargarMetricas();
    cargarVentasPOS();

  } catch (error) {
    console.error("Error al finalizar venta:", error);
    toast("Error de conexión al registrar la venta", "error");
  } finally {
    if (btn) { btn.disabled = ticketPOS.length === 0; btn.innerHTML = textoOriginal; }
  }
}

/* ---- receipt modal ---- */

function mostrarRecibo(ventaId, items, total, subtotal, montoDescuento) {
  document.getElementById("receiptId").innerText = "#" + (ventaId || "—");

  let html = "";
  items.forEach(item => {
    const sub = item.PRECIO * item.cantidad;
    html += `
      <tr>
        <td>${item.cantidad}x ${escapeHtml(item.PRODUCTO)}</td>
        <td style="text-align:right;">$${sub.toLocaleString("es-AR")}</td>
      </tr>`;
  });

  if (montoDescuento > 0) {
    html += `
      <tr>
        <td>Subtotal</td>
        <td style="text-align:right;">$${Number(subtotal).toLocaleString("es-AR")}</td>
      </tr>
      <tr>
        <td style="color:var(--red-500);">Descuento</td>
        <td style="text-align:right;color:var(--red-500);">-$${Math.round(montoDescuento).toLocaleString("es-AR")}</td>
      </tr>`;
  }

  document.getElementById("receiptItems").innerHTML = html;
  document.getElementById("receiptTotal").innerText = "$" + total.toLocaleString("es-AR");
  document.getElementById("receiptBackdrop").classList.add("show");
  toast("Venta registrada con éxito", "success");
}

function cerrarRecibo() {
  document.getElementById("receiptBackdrop").classList.remove("show");
}

function nuevaVentaPOS() {
  cerrarRecibo();
  const input = document.getElementById("posBusqueda");
  if (input) input.focus();
}

/* =====================================================
   THERMAL PRINT — POS80 80mm paper
   Renders a receipt into #thermalPrintFrame and calls
   window.print(). The @media print rule hides everything
   except #thermalPrintFrame, and @page sets 80mm width.
===================================================== */

/**
 * Build the thermal HTML string.
 * @param {string}  ventaId
 * @param {Array}   items   — [{PRODUCTO, PRECIO, cantidad}, …]
 * @param {number}  total
 * @param {string}  formaPago
 * @param {Date}    fecha
 * @param {Object}  [descuento] — { monto, etiqueta } opcional, si la venta tuvo descuento
 * @param {Object}  [cfgOverride] — config del negocio a usar en vez de la guardada (solo para vista previa)
 */
function buildThermalHTML(ventaId, items, total, formaPago, fecha, descuento, cfgOverride) {
  const cfg = cfgOverride || obtenerConfigNegocio();

  const fechaStr = (fecha || new Date()).toLocaleString("es-AR", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });

  let rows = "";
  let subtotal = 0;
  items.forEach(item => {
    const sub = item.PRECIO * item.cantidad;
    subtotal += sub;
    const unitStr = `${item.cantidad} x $${Number(item.PRECIO).toLocaleString("es-AR")}`;
    rows += `
      <tr>
        <td colspan="2" style="padding-bottom:0;">${escapeHtml(item.PRODUCTO)}</td>
      </tr>
      <tr>
        <td>${unitStr}</td>
        <td style="text-align:right;">$${sub.toLocaleString("es-AR")}</td>
      </tr>`;
  });

  const tieneDescuento = descuento && Number(descuento.monto) > 0;

  let filasTotales = "";
  if (tieneDescuento) {
    filasTotales += `
      <tr>
        <td>Subtotal</td>
        <td style="text-align:right;">$${subtotal.toLocaleString("es-AR")}</td>
      </tr>
      <tr>
        <td>Descuento${descuento.etiqueta ? " (" + escapeHtml(descuento.etiqueta) + ")" : ""}</td>
        <td style="text-align:right;">-$${Math.round(descuento.monto).toLocaleString("es-AR")}</td>
      </tr>`;
  }
  filasTotales += `
    <tr class="th-total-row">
      <td><strong>TOTAL</strong></td>
      <td style="text-align:right;"><strong>$${Number(total).toLocaleString("es-AR")}</strong></td>
    </tr>`;

  // Encabezado: nombre + subtítulo + dirección + teléfono(s), todos configurables
  let encabezado = `<div class="th-center th-big">${escapeHtml(cfg.nombre)}</div>`;
  if (cfg.subtitulo) {
    encabezado += `<div class="th-center" style="font-size:11pt;font-weight:bold;">${escapeHtml(cfg.subtitulo)}</div>`;
  }
  if (cfg.direccion) {
    encabezado += `<div class="th-center" style="font-size:10.5pt;font-weight:bold;color:#555;">${escapeHtml(cfg.direccion)}</div>`;
  }
  const telefonos = [cfg.telefono1, cfg.telefono2].filter(Boolean).join(" · ");
  if (telefonos) {
    encabezado += `<div class="th-center" style="font-size:10.5pt;font-weight:bold;color:#555;margin-bottom:2mm;">Tel: ${escapeHtml(telefonos)}</div>`;
  } else {
    encabezado += `<div style="margin-bottom:2mm;"></div>`;
  }

  // Pie de página
  let pie = "";
  if (cfg.pie) {
    pie += `<div class="th-footer">${escapeHtml(cfg.pie)}</div>`;
  }
  pie += `<div class="th-footer" style="margin-top:1mm;">${escapeHtml(cfg.nombre)} &bull; Sistema POS</div>`;

  return `
    <div class="thermal-receipt">
      ${encabezado}
      <hr class="th-sep-solid">
      <div>Fecha: ${fechaStr}</div>
      <div>Venta: #${escapeHtml(String(ventaId || "—"))}</div>
      <div>Pago: ${escapeHtml(String(formaPago || "—"))}</div>
      <hr class="th-sep">
      <table>
        <tbody>${rows}</tbody>
        ${filasTotales}
      </table>
      <hr class="th-sep">
      ${pie}
      <br><br>
    </div>`;
}

/* ===================================================================
   IMPRESIÓN DIRECTA USB (Web Serial API — Chrome/Edge, sin diálogo)
   Construye los mismos tickets que buildThermalHTML/buildThermalCierreHTML
   pero como comandos ESC/POS en bytes crudos, enviados directo al
   puerto USB de la impresora. Es un camino alternativo: si está
   desactivado (o el navegador no lo soporta), todo sigue imprimiendo
   con el diálogo normal de Chrome, sin ningún cambio.
=================================================================== */

const USB_PRINT_PREF_KEY = "jireh_usb_print_enabled";
const ANCHO_TICKET_USB = 42; // columnas para fuente normal en 80mm (12 cpl aprox.)

let puertoImpresoraUSB = null; // SerialPort activo, o null si no hay conexión

/** Whether the browser supports Web Serial at all */
function soportaImpresionUSB() {
  return "serial" in navigator;
}

/** Reads the saved on/off preference for USB direct printing (per-browser, default off) */
function usbPrintHabilitado() {
  return soportaImpresionUSB() && localStorage.getItem(USB_PRINT_PREF_KEY) === "true";
}

/* ---------------------- ESC/POS byte builders ---------------------- */

const ESC = 0x1B;
const GS  = 0x1D;

const ESCPOS = {
  INIT:          [ESC, 0x40],             // reset printer
  ALIGN_LEFT:    [ESC, 0x61, 0x00],
  ALIGN_CENTER:  [ESC, 0x61, 0x01],
  BOLD_ON:       [ESC, 0x45, 0x01],
  BOLD_OFF:      [ESC, 0x45, 0x00],
  SIZE_NORMAL:   [GS, 0x21, 0x00],
  SIZE_DOUBLE_H: [GS, 0x21, 0x01],         // double height
  SIZE_BIG:      [GS, 0x21, 0x11],         // double width + height
  CUT:           [GS, 0x56, 0x01],         // partial cut
  FEED:          (n) => [ESC, 0x64, n]     // feed n lines
};

/** Builds the raw byte buffer (Uint8Array) for a sale ticket, mirroring buildThermalHTML */
function buildThermalESCPOS(ventaId, items, total, formaPago, fecha, descuento, cfgOverride) {
  const cfg = cfgOverride || obtenerConfigNegocio();
  const b = new EscPosBuilder();

  const fechaStr = (fecha || new Date()).toLocaleString("es-AR", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });

  b.init();
  b.center(); b.big(); b.text(cfg.nombre); b.feed(1);
  b.normal();
  if (cfg.subtitulo) { b.center(); b.bold(); b.text(cfg.subtitulo); b.feed(1); b.boldOff(); }
  if (cfg.direccion) { b.center(); b.bold(); b.text(cfg.direccion); b.feed(1); b.boldOff(); }
  const telefonos = [cfg.telefono1, cfg.telefono2].filter(Boolean).join(" / ");
  if (telefonos) { b.center(); b.bold(); b.text("Tel: " + telefonos); b.feed(1); b.boldOff(); }

  b.left();
  b.sepSolid();
  b.bold();
  b.text("Fecha: " + fechaStr); b.feed(1);
  b.text("Venta: #" + String(ventaId || "—")); b.feed(1);
  b.text("Pago: " + String(formaPago || "—")); b.feed(1);
  b.sep();

  let subtotal = 0;
  items.forEach(item => {
    const sub = item.PRECIO * item.cantidad;
    subtotal += sub;
    b.bold();
    b.text(item.PRODUCTO); b.feed(1);
    b.row(`${item.cantidad} x $${money(item.PRECIO)}`, "$" + money(sub));
  });

  const tieneDescuento = descuento && Number(descuento.monto) > 0;
  if (tieneDescuento) {
    b.sep();
    b.row("Subtotal", "$" + money(subtotal));
    const etiquetaDesc = descuento.etiqueta ? `Descuento (${descuento.etiqueta})` : "Descuento";
    b.row(etiquetaDesc, "-$" + money(descuento.monto));
  }

  b.sepSolid();
  b.doubleH();
  b.row("TOTAL", "$" + money(total));
  b.normal();
  b.sep();

  b.bold();
  if (cfg.pie) { b.center(); b.text(cfg.pie); b.feed(1); }
  b.center(); b.text(cfg.nombre + " - Sistema POS"); b.feed(1);
  b.boldOff();

  b.feed(3);
  b.cut();

  return b.build();
}

/** Builds the raw byte buffer for a cierre de caja receipt, mirroring buildThermalCierreHTML */
function buildThermalCierreESCPOS(resumen) {
  const cfg = obtenerConfigNegocio();
  const b = new EscPosBuilder();

  const fechaStr = formatearFechaCierre(resumen.fecha);
  const horaStr = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  function filaMetodo(etiqueta, m) {
    const signo = m.diferencia > 0 ? "+" : "";
    b.bold();
    b.text(etiqueta); b.feed(1);
    b.row("Esperado", "$" + money(m.esperado));
    b.row("Contado", "$" + money(m.contado));
    b.row("Diferencia", signo + "$" + money(Math.round(m.diferencia)));
  }

  b.init();
  b.center(); b.big(); b.text(cfg.nombre); b.feed(1);
  b.normal();
  b.center(); b.bold(); b.text("Cierre de Caja"); b.feed(1); b.boldOff();
  if (cfg.direccion) { b.center(); b.bold(); b.text(cfg.direccion); b.feed(1); b.boldOff(); }
  const telefonos = [cfg.telefono1, cfg.telefono2].filter(Boolean).join(" / ");
  if (telefonos) { b.center(); b.bold(); b.text("Tel: " + telefonos); b.feed(1); b.boldOff(); }

  b.left();
  b.sepSolid();
  b.bold();
  b.text("Fecha: " + fechaStr); b.feed(1);
  b.text("Hora impresión: " + horaStr); b.feed(1);
  b.text("Cierre: #" + String(resumen.cierreId || "—")); b.feed(1);
  b.text("Vendedor: " + String(resumen.vendedor || "—")); b.feed(1);
  b.sep();

  filaMetodo("EFECTIVO", resumen.efectivo); b.feed(1);
  filaMetodo("TRANSFERENCIA", resumen.transferencia); b.feed(1);
  filaMetodo("TARJETA", resumen.tarjeta);

  b.sepSolid();
  const signoTotal = resumen.total.diferencia > 0 ? "+" : "";
  b.row("TOTAL ESPERADO", "$" + money(resumen.total.esperado));
  b.row("TOTAL CONTADO", "$" + money(resumen.total.contado));
  b.row("DIFERENCIA", signoTotal + "$" + money(Math.round(resumen.total.diferencia)));
  b.sep();

  if (resumen.observaciones) {
    b.bold();
    b.text("Obs: " + resumen.observaciones); b.feed(1);
    b.sep();
  }

  b.bold();
  b.text("Cierre generado por " + cfg.nombre + " POS"); b.feed(1);
  b.boldOff();

  b.feed(3);
  b.cut();

  return b.build();
}

function money(n) {
  return Number(n || 0).toLocaleString("es-AR");
}

/** Small helper that accumulates ESC/POS bytes with simple word-wrap and two-column row support */
class EscPosBuilder {
  constructor() {
    this.bytes = [];
  }
  push(arr) { this.bytes.push(...arr); }
  init()    { this.push(ESCPOS.INIT); }
  center()  { this.push(ESCPOS.ALIGN_CENTER); }
  left()    { this.push(ESCPOS.ALIGN_LEFT); }
  bold()    { this.push(ESCPOS.BOLD_ON); }
  boldOff() { this.push(ESCPOS.BOLD_OFF); }
  normal()  { this.push(ESCPOS.SIZE_NORMAL); }
  doubleH() { this.push(ESCPOS.SIZE_DOUBLE_H); }
  big()     { this.push(ESCPOS.SIZE_BIG); }
  cut()     { this.push(ESCPOS.CUT); }
  feed(n)   { this.push(ESCPOS.FEED(n)); }

  /** Encodes text as bytes (Latin-1, which covers Spanish accents on most ESC/POS printers) */
  text(str) {
    const encoder = new TextEncoder(); // UTF-8; most modern POS80 controllers accept it fine
    this.push(Array.from(encoder.encode(String(str))));
  }

  sep() {
    this.bold();
    this.text("-".repeat(ANCHO_TICKET_USB));
    this.feed(1);
    this.boldOff();
  }

  sepSolid() {
    this.bold();
    this.text("=".repeat(ANCHO_TICKET_USB));
    this.feed(1);
    this.boldOff();
  }

  /** Prints a left label and a right-aligned value on the same 42-col line (wraps the label if too long) */
  row(left, right) {
    const rightStr = String(right);
    const maxLeft = ANCHO_TICKET_USB - rightStr.length - 1;
    let leftStr = String(left);
    if (leftStr.length > maxLeft) leftStr = leftStr.slice(0, Math.max(0, maxLeft));
    const spaces = Math.max(1, ANCHO_TICKET_USB - leftStr.length - rightStr.length);
    this.text(leftStr + " ".repeat(spaces) + rightStr);
    this.feed(1);
  }

  build() {
    return new Uint8Array(this.bytes);
  }
}

/* ---------------------- Web Serial connection ---------------------- */

/** Prompts the browser's port picker and opens the connection (must be called from a user gesture) */
async function conectarImpresoraUSB() {
  if (!soportaImpresionUSB()) {
    toast("Este navegador no soporta impresión directa", "error");
    return;
  }
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    puertoImpresoraUSB = port;
    actualizarEstadoUSBPrint();
    toast("Impresora conectada", "success");
  } catch (error) {
    if (error.name !== "NotFoundError") { // user just closed the picker without choosing
      console.error("Error al conectar la impresora USB:", error);
      toast("No se pudo conectar con la impresora", "error");
    }
  }
}

async function desconectarImpresoraUSB() {
  if (puertoImpresoraUSB) {
    try { await puertoImpresoraUSB.close(); } catch (e) { /* ignore */ }
  }
  puertoImpresoraUSB = null;
  actualizarEstadoUSBPrint();
  toast("Impresora desconectada", "success");
}

/** Tries to silently reconnect to a previously-authorized port (no picker shown) when the app loads */
async function reconectarImpresoraUSBSiPosible() {
  if (!soportaImpresionUSB()) return;
  try {
    const ports = await navigator.serial.getPorts();
    if (ports.length > 0) {
      const port = ports[0];
      await port.open({ baudRate: 9600 });
      puertoImpresoraUSB = port;
    }
  } catch (error) {
    // Port may be in use or unplugged — just leave it disconnected, the admin can reconnect manually
    puertoImpresoraUSB = null;
  }
  actualizarEstadoUSBPrint();
}

/** Sends a raw byte buffer to the connected printer over Web Serial */
async function enviarBytesAImpresoraUSB(bytes) {
  if (!puertoImpresoraUSB || !puertoImpresoraUSB.writable) {
    throw new Error("La impresora USB no está conectada");
  }
  const writer = puertoImpresoraUSB.writable.getWriter();
  try {
    await writer.write(bytes);
  } finally {
    writer.releaseLock();
  }
}

function probarImpresoraUSB() {
  const b = new EscPosBuilder();
  b.init();
  b.center(); b.big(); b.text("PRUEBA"); b.feed(2);
  b.normal(); b.bold();
  b.text("Si ves esto, la impresión"); b.feed(1);
  b.text("directa por USB funciona bien."); b.feed(1);
  b.boldOff();
  b.feed(3);
  b.cut();

  enviarBytesAImpresoraUSB(b.build())
    .then(() => toast("Ticket de prueba enviado", "success"))
    .catch(error => {
      console.error("Error en impresión de prueba:", error);
      toast("No se pudo imprimir: revisá la conexión USB", "error");
    });
}

function onToggleUsbPrint() {
  const checked = document.getElementById("usbPrintToggle").checked;
  if (checked && !puertoImpresoraUSB) {
    toast("Conectá la impresora primero", "error");
    document.getElementById("usbPrintToggle").checked = false;
    return;
  }
  localStorage.setItem(USB_PRINT_PREF_KEY, checked ? "true" : "false");
  toast(checked ? "Impresión directa activada" : "Impresión directa desactivada", "success");
}

/** Refreshes the Configuración card UI to reflect support/connection state */
function actualizarEstadoUSBPrint() {
  const unsupportedEl = document.getElementById("usbPrintUnsupported");
  const supportedEl   = document.getElementById("usbPrintSupported");
  if (!unsupportedEl || !supportedEl) return; // section not in the DOM yet

  if (!soportaImpresionUSB()) {
    unsupportedEl.style.display = "flex";
    supportedEl.style.display = "none";
    return;
  }

  unsupportedEl.style.display = "none";
  supportedEl.style.display = "block";

  const statusEl     = document.getElementById("usbPrintStatus");
  const statusTextEl = document.getElementById("usbPrintStatusText");
  const btnConectar   = document.getElementById("btnConectarImpresora");
  const btnDesconectar = document.getElementById("btnDesconectarImpresora");
  const btnProbar      = document.getElementById("btnProbarImpresora");
  const toggle          = document.getElementById("usbPrintToggle");

  if (puertoImpresoraUSB) {
    statusEl.className = "usb-print-status ok";
    statusTextEl.textContent = "Impresora conectada";
    btnConectar.style.display = "none";
    btnDesconectar.style.display = "inline-block";
    btnProbar.style.display = "inline-block";
  } else {
    statusEl.className = "usb-print-status";
    statusTextEl.textContent = "Impresora no conectada";
    btnConectar.style.display = "inline-block";
    btnDesconectar.style.display = "none";
    btnProbar.style.display = "none";

    // Can't keep "impresión directa" on if there's nothing connected
    if (toggle) toggle.checked = false;
    localStorage.setItem(USB_PRINT_PREF_KEY, "false");
  }

  if (toggle) toggle.checked = usbPrintHabilitado();
}

/** Print the current (unsaved) ticket as a pre-sale receipt */
function imprimirTicketThermal() {
  if (ticketPOS.length === 0) { toast("El ticket está vacío", "error"); return; }
  const subtotal = ticketPOS.reduce((acc, i) => acc + i.PRECIO * i.cantidad, 0);
  const { montoDescuento, total } = calcularDescuentoPOS(subtotal);
  const etiqueta = obtenerEtiquetaDescuentoPOS(subtotal);
  _ejecutarImpresion("PREVIO", ticketPOS, total, formaPagoPOS, new Date(),
    montoDescuento > 0 ? { monto: montoDescuento, etiqueta } : null);
}

/** Print after a completed sale (from receipt modal) */
function imprimirUltimoRecibo() {
  if (!ultimaVentaImprimible) { toast("No hay venta para imprimir", "error"); return; }
  const u = ultimaVentaImprimible;
  _ejecutarImpresion(u.ventaId, u.items, u.total, u.formaPago, u.fecha,
    u.descuento > 0 ? { monto: u.descuento, etiqueta: u.descuentoEtiqueta } : null);
}

/** Print a sale from the dashboard recent-sales table or the Ventas POS history */
function imprimirVentaDesdeData(ventaObj) {
  const items = [];
  // Try to parse items if stored as JSON string or array
  if (ventaObj.CARRITO) {
    try {
      const parsed = typeof ventaObj.CARRITO === "string"
        ? JSON.parse(ventaObj.CARRITO)
        : ventaObj.CARRITO;
      if (Array.isArray(parsed)) items.push(...parsed);
    } catch(e) { /* ignore */ }
  }
  // Fallback: show just a total line if no item detail
  if (items.length === 0) {
    items.push({ PRODUCTO: ventaObj.DETALLE || "Venta", PRECIO: Number(ventaObj.TOTAL || 0), cantidad: 1 });
  }

  // El descuento (si lo hubo) quedó guardado como texto en OBSERVACIONES,
  // ej: "Descuento: 10% (-$500) — cliente frecuente". Lo reconstruimos
  // calculando subtotal real de items vs. el TOTAL guardado (ya con descuento).
  const subtotalItems = items.reduce((acc, i) => acc + Number(i.PRECIO) * Number(i.cantidad), 0);
  const totalGuardado = Number(ventaObj.TOTAL || 0);
  const diferencia = subtotalItems - totalGuardado;

  const obs = String(ventaObj.OBSERVACIONES || "");
  let descuentoInfo = null;
  if (diferencia > 0.5 && /descuento/i.test(obs)) {
    descuentoInfo = { monto: diferencia, etiqueta: obs.replace(/^Descuento:\s*/i, "") };
  }

  _ejecutarImpresion(
    ventaObj.VENTA_ID || ventaObj.ID || "—",
    items,
    totalGuardado,
    ventaObj.FORMA_PAGO || ventaObj.PAGO || "—",
    ventaObj.FECHA ? new Date(ventaObj.FECHA) : new Date(),
    descuentoInfo
  );
}

function _ejecutarImpresion(ventaId, items, total, formaPago, fecha, descuento) {
  if (usbPrintHabilitado() && puertoImpresoraUSB) {
    const bytes = buildThermalESCPOS(ventaId, items, total, formaPago, fecha, descuento);
    enviarBytesAImpresoraUSB(bytes).catch(error => {
      console.error("Error al imprimir por USB:", error);
      toast("Error al imprimir por USB — se abre el diálogo normal", "error");
      _imprimirConDialogo(buildThermalHTML(ventaId, items, total, formaPago, fecha, descuento));
    });
    return;
  }

  _imprimirConDialogo(buildThermalHTML(ventaId, items, total, formaPago, fecha, descuento));
}

/** Falls back to the regular browser print dialog (used when USB printing is off, unsupported, or fails) */
function _imprimirConDialogo(html) {
  const frame = document.getElementById("thermalPrintFrame");
  if (!frame) { toast("Error: frame de impresión no encontrado", "error"); return; }

  frame.innerHTML = html;

  // Small delay to let the DOM paint before triggering print dialog
  setTimeout(() => {
    window.print();
  }, 120);
}

/* =====================================================
   THERMAL PRINT — CIERRE DE CAJA (POS80 80mm)
   Reusa el mismo #thermalPrintFrame y las reglas @media
   print ya definidas para el ticket de venta.
===================================================== */

/**
 * Build the thermal HTML string for a cash-register closing (cierre de caja).
 * @param {Object} resumen  — { fecha, cierreId, vendedor, observaciones,
 *                               efectivo:{esperado,contado,diferencia},
 *                               transferencia:{...}, tarjeta:{...}, total:{...} }
 */
function buildThermalCierreHTML(resumen) {
  const cfg = obtenerConfigNegocio();

  const fechaStr = formatearFechaCierre(resumen.fecha);
  const horaStr = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  function filaMetodo(etiqueta, m) {
    const signo = m.diferencia > 0 ? "+" : "";
    return `
      <tr>
        <td colspan="2" style="padding-top:2mm;"><strong>${etiqueta}</strong></td>
      </tr>
      <tr>
        <td>Esperado</td>
        <td style="text-align:right;">$${Number(m.esperado).toLocaleString("es-AR")}</td>
      </tr>
      <tr>
        <td>Contado</td>
        <td style="text-align:right;">$${Number(m.contado).toLocaleString("es-AR")}</td>
      </tr>
      <tr>
        <td>Diferencia</td>
        <td style="text-align:right;">${signo}$${Math.round(m.diferencia).toLocaleString("es-AR")}</td>
      </tr>`;
  }

  const signoTotal = resumen.total.diferencia > 0 ? "+" : "";

  // Encabezado: nombre del local + dirección + teléfono(s) (sin subtítulo, este ticket no es de venta)
  let encabezado = `<div class="th-center th-big">${escapeHtml(cfg.nombre)}</div>`;
  encabezado += `<div class="th-center" style="font-size:13pt;font-weight:bold;">Cierre de Caja</div>`;
  if (cfg.direccion) {
    encabezado += `<div class="th-center" style="font-size:13pt;font-weight:bold;">${escapeHtml(cfg.direccion)}</div>`;
  }
  const telefonos = [cfg.telefono1, cfg.telefono2].filter(Boolean).join(" · ");
  if (telefonos) {
    encabezado += `<div class="th-center" style="font-size:13pt;font-weight:bold;margin-bottom:2mm;">Tel: ${escapeHtml(telefonos)}</div>`;
  } else {
    encabezado += `<div style="margin-bottom:2mm;"></div>`;
  }

  return `
    <div class="thermal-receipt">
      ${encabezado}
      <hr class="th-sep-solid">
      <div>Fecha: ${escapeHtml(fechaStr)}</div>
      <div>Hora impresión: ${escapeHtml(horaStr)}</div>
      <div>Cierre: #${escapeHtml(String(resumen.cierreId || "—"))}</div>
      <div>Vendedor: ${escapeHtml(String(resumen.vendedor || "—"))}</div>
      <hr class="th-sep">
      <table>
        <tbody>
          ${filaMetodo("EFECTIVO", resumen.efectivo)}
          ${filaMetodo("TRANSFERENCIA", resumen.transferencia)}
          ${filaMetodo("TARJETA", resumen.tarjeta)}
        </tbody>
        <tr class="th-total-row">
          <td><strong>TOTAL ESPERADO</strong></td>
          <td style="text-align:right;"><strong>$${Number(resumen.total.esperado).toLocaleString("es-AR")}</strong></td>
        </tr>
        <tr>
          <td><strong>TOTAL CONTADO</strong></td>
          <td style="text-align:right;"><strong>$${Number(resumen.total.contado).toLocaleString("es-AR")}</strong></td>
        </tr>
        <tr>
          <td><strong>DIFERENCIA</strong></td>
          <td style="text-align:right;"><strong>${signoTotal}$${Math.round(resumen.total.diferencia).toLocaleString("es-AR")}</strong></td>
        </tr>
      </table>
      <hr class="th-sep">
      ${resumen.observaciones ? `<div style="font-size:13pt;font-weight:bold;">Obs: ${escapeHtml(resumen.observaciones)}</div><hr class="th-sep">` : ""}
      <div class="th-footer">Cierre generado por ${escapeHtml(cfg.nombre)} POS</div>
      <br><br>
    </div>`;
}

/**
 * Imprime el cierre de caja actualmente visible en pantalla.
 * Usa los montos "esperado" ya cargados (cierreCajaResumenActual)
 * y los montos "contado" tal cual están en los inputs en este momento,
 * sin necesidad de haber guardado el cierre primero.
 */
function imprimirCierreCaja() {
  if (!cierreCajaResumenActual) {
    toast("Esperá a que se calculen las ventas del día", "error");
    return;
  }

  const esp = cierreCajaResumenActual.esperado;

  const efectivoContado      = Number(document.getElementById("ccEfectivoContado").value || 0);
  const transferenciaContado = Number(document.getElementById("ccTransferenciaContado").value || 0);
  const tarjetaContado       = Number(document.getElementById("ccTarjetaContado").value || 0);
  const observaciones        = document.getElementById("ccObservaciones").value || "";

  const efectivo = {
    esperado: esp.EFECTIVO,
    contado: efectivoContado,
    diferencia: efectivoContado - esp.EFECTIVO
  };
  const transferencia = {
    esperado: esp.TRANSFERENCIA,
    contado: transferenciaContado,
    diferencia: transferenciaContado - esp.TRANSFERENCIA
  };
  const tarjeta = {
    esperado: esp.TARJETA,
    contado: tarjetaContado,
    diferencia: tarjetaContado - esp.TARJETA
  };

  const totalEsperado = efectivo.esperado + transferencia.esperado + tarjeta.esperado;
  const totalContado  = efectivo.contado  + transferencia.contado  + tarjeta.contado;

  const resumen = {
    fecha: cierreCajaResumenActual.fecha,
    cierreId: (cierreCajaResumenActual.cierreExistente && cierreCajaResumenActual.cierreExistente.CIERRE_ID) || "PREVIO",
    vendedor: (cierreCajaResumenActual.cierreExistente && cierreCajaResumenActual.cierreExistente.VENDEDOR) || "ADMIN",
    observaciones,
    efectivo,
    transferencia,
    tarjeta,
    total: {
      esperado: totalEsperado,
      contado: totalContado,
      diferencia: totalContado - totalEsperado
    }
  };

  if (usbPrintHabilitado() && puertoImpresoraUSB) {
    const bytes = buildThermalCierreESCPOS(resumen);
    enviarBytesAImpresoraUSB(bytes).catch(error => {
      console.error("Error al imprimir cierre por USB:", error);
      toast("Error al imprimir por USB — se abre el diálogo normal", "error");
      _imprimirConDialogo(buildThermalCierreHTML(resumen));
    });
    return;
  }

  _imprimirConDialogo(buildThermalCierreHTML(resumen));
}

/* ===================================================================
   BARCODE SCANNER SUPPORT
=================================================================== */

let scanBuffer    = "";
let lastKeyTime   = 0;
const SCAN_KEY_THRESHOLD_MS = 40;

function setupScannerListener() {
  document.addEventListener("keydown", (e) => {
    const posSection = document.getElementById("pos");
    const posVisible = posSection && posSection.style.display === "block";
    if (!posVisible) return;

    const activeTag  = document.activeElement ? document.activeElement.tagName : "";
    const isOurInput = document.activeElement && document.activeElement.id === "posBusqueda";
    if (!isOurInput && (activeTag === "INPUT" || activeTag === "SELECT" || activeTag === "TEXTAREA")) return;

    const now     = Date.now();
    const elapsed = now - lastKeyTime;
    lastKeyTime   = now;

    if (e.key === "Enter") {
      if (scanBuffer.length >= 3) { agregarProductoPorCodigo(scanBuffer); setScannerStatus("listening"); }
      scanBuffer = "";
      return;
    }

    if (e.key.length === 1) {
      if (elapsed > 250) scanBuffer = "";
      scanBuffer += e.key;
      if (elapsed < SCAN_KEY_THRESHOLD_MS && scanBuffer.length >= 3) setScannerStatus("listening");
    }
  });

  setInterval(() => {
    if (Date.now() - lastKeyTime > 1200) setScannerStatus("idle");
  }, 500);
}

function setScannerStatus(estado) {
  const el = document.getElementById("scannerStatus");
  if (!el) return;
  if (estado === "listening") {
    el.className = "scanner-status listening";
    el.innerHTML = `<span class="dot"></span> Leyendo...`;
  } else if (estado === "camera") {
    el.className = "scanner-status camera";
    el.innerHTML = `<span class="dot"></span> Cámara activa`;
  } else {
    el.className = "scanner-status idle";
    el.innerHTML = `<span class="dot"></span> Listo`;
  }
}

/* ---- camera-based scanning ---- */

let camaraStream = null;
let camaraDetectorTimer = null;

async function abrirCamaraScan() {
  const backdrop  = document.getElementById("scanModalBackdrop");
  const videoWrap = document.getElementById("scanVideoWrap");
  const video     = document.getElementById("scanVideo");

  backdrop.classList.add("show");

  if (!("BarcodeDetector" in window)) {
    videoWrap.innerHTML = `
      <div class="scan-unsupported">
        Tu navegador no soporta el escaneo por cámara nativo.<br>
        Usá un lector USB, o Chrome/Edge en Android.
      </div>`;
    return;
  }

  try {
    camaraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = camaraStream;
    setScannerStatus("camera");
    document.getElementById("btnCameraScan").classList.add("active");

    const detector = new BarcodeDetector({
      formats: ["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code","itf"]
    });

    camaraDetectorTimer = setInterval(async () => {
      try {
        const codigos = await detector.detect(video);
        if (codigos.length > 0) {
          const valor = codigos[0].rawValue;
          cerrarCamaraScan();
          agregarProductoPorCodigo(valor);
        }
      } catch (err) { /* frame errors expected */ }
    }, 350);

  } catch (error) {
    console.error("Error de cámara:", error);
    videoWrap.innerHTML = `
      <div class="scan-unsupported">
        No se pudo acceder a la cámara.<br>
        Revisá los permisos del navegador e intentá de nuevo.
      </div>`;
  }
}

function cerrarCamaraScan() {
  const backdrop = document.getElementById("scanModalBackdrop");
  backdrop.classList.remove("show");

  if (camaraDetectorTimer) { clearInterval(camaraDetectorTimer); camaraDetectorTimer = null; }
  if (camaraStream) { camaraStream.getTracks().forEach(t => t.stop()); camaraStream = null; }

  document.getElementById("btnCameraScan").classList.remove("active");
  setScannerStatus("idle");

  document.getElementById("scanVideoWrap").innerHTML = `
    <video id="scanVideo" autoplay playsinline muted></video>
    <div class="scan-reticle"></div>`;
}

/* ===================================================================
   CIERRE DE CAJA — RECONCILIACION DIARIA
   Compara lo esperado (según VENTAS_LOCAL, por forma de pago) contra
   lo contado físicamente al cierre del día. Guarda el resultado en
   la hoja "CIERRES_CAJA" vía el backend.
=================================================================== */

let cierreCajaResumenActual = null; // último resumen "esperado" cargado del backend

/** Loads today's expected totals by payment method and pre-fills the form */
async function cargarResumenCierreCaja(fecha) {
  const estadoEl = document.getElementById("cierreCajaEstado");
  if (estadoEl) estadoEl.textContent = "Calculando ventas del día...";

  try {
    const url = API_URL + "?action=cierreCajaResumen" + (fecha ? "&fecha=" + encodeURIComponent(fecha) : "");
    const response = await fetch(url);
    const data = await response.json();

    if (!data.success) {
      toast(data.message || "No se pudo calcular el resumen de caja", "error");
      if (estadoEl) estadoEl.textContent = "";
      return;
    }

    cierreCajaResumenActual = data;

    actualizarElemento("ccFechaLabel", formatearFechaCierre(data.fecha));
    actualizarElemento("ccCantidadVentas", data.cantidadVentas + (data.cantidadVentas === 1 ? " venta" : " ventas"));

    actualizarElemento("ccEfectivoEsperado",      "$" + Number(data.esperado.EFECTIVO).toLocaleString("es-AR"));
    actualizarElemento("ccTransferenciaEsperado", "$" + Number(data.esperado.TRANSFERENCIA).toLocaleString("es-AR"));
    actualizarElemento("ccTarjetaEsperado",       "$" + Number(data.esperado.TARJETA).toLocaleString("es-AR"));
    actualizarElemento("ccTotalEsperado",         "$" + Number(data.esperado.TOTAL).toLocaleString("es-AR"));

    // If a closing already exists for this date, pre-fill counted amounts so the user can review/edit
    const inputEfectivo      = document.getElementById("ccEfectivoContado");
    const inputTransferencia = document.getElementById("ccTransferenciaContado");
    const inputTarjeta       = document.getElementById("ccTarjetaContado");

    if (data.yaCerrado && data.cierreExistente) {
      const c = data.cierreExistente;
      if (inputEfectivo)      inputEfectivo.value      = Number(c.EFECTIVO_CONTADO || 0);
      if (inputTransferencia) inputTransferencia.value = Number(c.TRANSFERENCIA_CONTADO || 0);
      if (inputTarjeta)       inputTarjeta.value        = Number(c.TARJETA_CONTADO || 0);
      const obsEl = document.getElementById("ccObservaciones");
      if (obsEl) obsEl.value = c.OBSERVACIONES || "";
      if (estadoEl) estadoEl.innerHTML = `⚠️ Ya existe un cierre guardado para esta fecha. Guardar de nuevo lo actualizará.`;
    } else {
      if (inputEfectivo)      inputEfectivo.value      = "";
      if (inputTransferencia) inputTransferencia.value = "";
      if (inputTarjeta)       inputTarjeta.value        = "";
      if (estadoEl) estadoEl.textContent = "";
    }

    calcularDiferenciasCierreCaja();
    cargarHistorialCierres();

  } catch (error) {
    console.error("Error al cargar resumen de cierre de caja:", error);
    toast("Error de conexión al calcular el cierre de caja", "error");
    if (estadoEl) estadoEl.textContent = "";
  }
}

function formatearFechaCierre(fechaStr) {
  if (!fechaStr) return "—";
  const [y, m, d] = fechaStr.split("-");
  return `${d}/${m}/${y}`;
}

/** Recalculates differences live as the user types counted amounts */
function calcularDiferenciasCierreCaja() {
  if (!cierreCajaResumenActual) return;

  const efectivoContado      = Number(document.getElementById("ccEfectivoContado").value || 0);
  const transferenciaContado = Number(document.getElementById("ccTransferenciaContado").value || 0);
  const tarjetaContado       = Number(document.getElementById("ccTarjetaContado").value || 0);

  const esp = cierreCajaResumenActual.esperado;

  const difEfectivo      = efectivoContado - esp.EFECTIVO;
  const difTransferencia = transferenciaContado - esp.TRANSFERENCIA;
  const difTarjeta       = tarjetaContado - esp.TARJETA;
  const difTotal         = difEfectivo + difTransferencia + difTarjeta;

  pintarDiferencia("ccEfectivoDif", difEfectivo);
  pintarDiferencia("ccTransferenciaDif", difTransferencia);
  pintarDiferencia("ccTarjetaDif", difTarjeta);
  pintarDiferencia("ccTotalDif", difTotal, true);

  const totalContado = efectivoContado + transferenciaContado + tarjetaContado;
  actualizarElemento("ccTotalContado", "$" + totalContado.toLocaleString("es-AR"));
}

function pintarDiferencia(id, valor, esTotal) {
  const el = document.getElementById(id);
  if (!el) return;

  const signo = valor > 0 ? "+" : "";
  el.textContent = signo + "$" + Math.round(valor).toLocaleString("es-AR");

  el.classList.remove("cc-dif-ok", "cc-dif-sobra", "cc-dif-falta");

  if (Math.abs(valor) < 1)      el.classList.add("cc-dif-ok");
  else if (valor > 0)           el.classList.add("cc-dif-sobra");
  else                          el.classList.add("cc-dif-falta");
}

/** Saves the daily reconciliation to the backend (CIERRES_CAJA sheet) */
async function guardarCierreCajaForm() {
  if (!cierreCajaResumenActual) { toast("Esperá a que se calculen las ventas del día", "error"); return; }

  const efectivoContado      = document.getElementById("ccEfectivoContado").value;
  const transferenciaContado = document.getElementById("ccTransferenciaContado").value;
  const tarjetaContado       = document.getElementById("ccTarjetaContado").value;
  const observaciones        = document.getElementById("ccObservaciones").value;

  if (efectivoContado === "" && transferenciaContado === "" && tarjetaContado === "") {
    toast("Ingresá al menos un monto contado", "error");
    return;
  }

  const btn = document.getElementById("btnGuardarCierreCaja");
  const textoOriginal = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = "Guardando..."; }

  try {
    const params = new URLSearchParams({
      action: "guardarCierreCaja",
      fecha: cierreCajaResumenActual.fecha,
      efectivoEsperado:      cierreCajaResumenActual.esperado.EFECTIVO,
      efectivoContado:       efectivoContado || 0,
      transferenciaEsperado: cierreCajaResumenActual.esperado.TRANSFERENCIA,
      transferenciaContado:  transferenciaContado || 0,
      tarjetaEsperado:       cierreCajaResumenActual.esperado.TARJETA,
      tarjetaContado:        tarjetaContado || 0,
      observaciones:         observaciones || ""
    });

    const response = await fetch(API_URL + "?" + params.toString());
    const data = await response.json();

    if (!data.success) {
      toast(data.message || "No se pudo guardar el cierre de caja", "error");
      return;
    }

    toast(data.actualizado ? "Cierre de caja actualizado" : "Cierre de caja guardado", "success");
    cargarHistorialCierres();

  } catch (error) {
    console.error("Error al guardar cierre de caja:", error);
    toast("Error de conexión al guardar el cierre", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
  }
}

/** Loads the recent reconciliation history table */
async function cargarHistorialCierres() {
  const tbody = document.getElementById("tablaCierresCaja");
  if (!tbody) return;

  try {
    const response = await fetch(API_URL + "?action=historialCierres");
    const data = await response.json();
    const lista = data.cierres || [];

    if (lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">Todavía no hay cierres guardados</td></tr>`;
      return;
    }

    let html = "";
    lista.forEach(c => {
      const fecha = formatearFechaCierre(
        c.FECHA instanceof Date
          ? c.FECHA.toISOString().slice(0, 10)
          : String(c.FECHA).slice(0, 10)
      );
      const totalDif = Number(c.TOTAL_DIFERENCIA || 0);
      const claseDif = Math.abs(totalDif) < 1 ? "cc-dif-ok" : (totalDif > 0 ? "cc-dif-sobra" : "cc-dif-falta");
      const signo = totalDif > 0 ? "+" : "";

      html += `
        <tr>
          <td>${escapeHtml(fecha)}</td>
          <td class="money">$${Number(c.TOTAL_ESPERADO || 0).toLocaleString("es-AR")}</td>
          <td class="money">$${Number(c.TOTAL_CONTADO || 0).toLocaleString("es-AR")}</td>
          <td class="money ${claseDif}">${signo}$${Math.round(totalDif).toLocaleString("es-AR")}</td>
          <td>${escapeHtml(c.VENDEDOR || "—")}</td>
          <td>${escapeHtml(c.OBSERVACIONES || "—")}</td>
        </tr>`;
    });

    tbody.innerHTML = html;

  } catch (error) {
    console.error("Error al cargar historial de cierres:", error);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">Error al cargar el historial</td></tr>`;
  }
}
