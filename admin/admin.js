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

    actualizarElemento("pedidosNuevos",   data.pedidosNuevos  || 0);
    actualizarElemento("ventasHoy",       "$" + Number(data.ventasHoy  || 0).toLocaleString("es-AR"));
    actualizarElemento("ventasMes",       "$" + Number(data.ventasMes  || 0).toLocaleString("es-AR"));
    actualizarElemento("productosActivos", data.productosActivos || 0);
    actualizarElemento("stockBajo",       data.stockBajo || 0);
    actualizarElemento("agotados",        data.agotados  || 0);
    actualizarElemento("clientesUnicos",  data.clientesUnicos || 0);
    actualizarElemento("TotalPedidos",    data.totalPedidos   || 0);
    actualizarElemento("totalPedidos",    data.totalPedidos   || 0);

    const tp = "$" + Math.round(data.ticketPromedio || 0).toLocaleString("es-AR");
    actualizarElemento("TicketPromedio", tp);
    actualizarElemento("ticketPromedio", tp);

    actualizarElemento("ventasTotales",   "$" + Number(data.ventasMes || 0).toLocaleString("es-AR"));

    // POS summary banner (dashboard)
    actualizarElemento("posVentasHoyBanner",  "$" + Number(data.ventasHoy  || 0).toLocaleString("es-AR"));
    actualizarElemento("posVentasMesBanner",  "$" + Number(data.ventasMes  || 0).toLocaleString("es-AR"));
    actualizarElemento("posTicketPromBanner", tp);
    actualizarElemento("posTotalPedBanner",   data.totalPedidos || 0);

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
    const response = await fetch(API_URL + "?action=productos");
    const data = await response.json();
    let html = "";
    if (!data.productos) return;
    if (data.productos.length === 0) {
      html = `<tr><td colspan="4" class="text-center text-muted py-4">No hay productos</td></tr>`;
    }
    data.productos.forEach(p => {
      html += `
      <tr>
        <td class="mono">${escapeHtml(p.CODIGO)}</td>
        <td>${escapeHtml(p.PRODUCTO)}</td>
        <td class="money">$${Number(p.PRECIO || 0).toLocaleString("es-AR")}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="editarProducto('${p.CODIGO}')">Editar</button>
          <button class="btn btn-danger btn-sm ms-2" onclick="eliminarProducto('${p.CODIGO}')">Eliminar</button>
        </td>
      </tr>`;
    });
    document.getElementById("tablaProductos").innerHTML = html;
  } catch (error) {
    console.error("Error productos:", error);
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
let ticketPOS       = [];
let categoriaActivaPOS = "TODAS";
let formaPagoPOS    = "EFECTIVO";

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
  renderTicketPOS();
}

/* ---- ticket rendering ---- */

function renderTicketPOS() {
  let html = "";
  let total = 0;
  let totalItems = 0;

  ticketPOS.forEach(item => {
    const subtotal = item.PRECIO * item.cantidad;
    total += subtotal;
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
        <div class="ti-sub money">$${subtotal.toLocaleString("es-AR")}</div>
        <button class="ti-remove" onclick="quitarProductoPOS('${item.CODIGO}')" title="Quitar">✕</button>
      </div>`;
  });

  const tabla = document.getElementById("ticketPOS");
  if (tabla) tabla.innerHTML = html;

  const emptyState = document.getElementById("ticketEmptyState");
  if (emptyState) emptyState.style.display = ticketPOS.length === 0 ? "flex" : "none";

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

  const total = ticketPOS.reduce((acc, item) => acc + (item.PRECIO * item.cantidad), 0);

  const btn = document.getElementById("btnFinalizarVenta");
  const textoOriginal = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = "Procesando..."; }

  try {
    const response = await fetch(
      API_URL +
      "?action=guardarVenta" +
      "&total="      + encodeURIComponent(total) +
      "&formaPago="  + encodeURIComponent(formaPagoPOS) +
      "&carrito="    + encodeURIComponent(JSON.stringify(ticketPOS))
    );
    const data = await response.json();

    if (!data.success) {
      toast(data.message || "No se pudo registrar la venta", "error");
      if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
      return;
    }

    // Save a copy for thermal printing from receipt modal
    ultimaVentaImprimible = {
      ventaId:   data.ventaId,
      items:     [...ticketPOS],
      total:     total,
      formaPago: formaPagoPOS,
      fecha:     new Date()
    };

    mostrarRecibo(data.ventaId, ticketPOS, total);
    ticketPOS = [];
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

function mostrarRecibo(ventaId, items, total) {
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
 */
function buildThermalHTML(ventaId, items, total, formaPago, fecha) {
  const fechaStr = (fecha || new Date()).toLocaleString("es-AR", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });

  let rows = "";
  items.forEach(item => {
    const sub = (item.PRECIO * item.cantidad).toLocaleString("es-AR");
    const unitStr = `${item.cantidad} x $${Number(item.PRECIO).toLocaleString("es-AR")}`;
    rows += `
      <tr>
        <td colspan="2" style="padding-bottom:0;">${escapeHtml(item.PRODUCTO)}</td>
      </tr>
      <tr>
        <td style="color:#555;">${unitStr}</td>
        <td style="text-align:right;">$${sub}</td>
      </tr>`;
  });

  return `
    <div class="thermal-receipt">
      <div class="th-center th-big">JIREH</div>
      <div class="th-center" style="font-size:9pt;margin-bottom:2mm;">Punto de Venta</div>
      <hr class="th-sep-solid">
      <div>Fecha: ${fechaStr}</div>
      <div>Venta: #${escapeHtml(String(ventaId || "—"))}</div>
      <div>Pago: ${escapeHtml(String(formaPago || "—"))}</div>
      <hr class="th-sep">
      <table>
        <tbody>${rows}</tbody>
        <tr class="th-total-row">
          <td><strong>TOTAL</strong></td>
          <td style="text-align:right;"><strong>$${Number(total).toLocaleString("es-AR")}</strong></td>
        </tr>
      </table>
      <hr class="th-sep">
      <div class="th-footer">¡Gracias por su compra!</div>
      <div class="th-footer" style="margin-top:1mm;">JIREH &bull; Sistema POS</div>
      <br><br>
    </div>`;
}

/** Print the current (unsaved) ticket as a pre-sale receipt */
function imprimirTicketThermal() {
  if (ticketPOS.length === 0) { toast("El ticket está vacío", "error"); return; }
  const total = ticketPOS.reduce((acc, i) => acc + i.PRECIO * i.cantidad, 0);
  _ejecutarImpresion("PREVIO", ticketPOS, total, formaPagoPOS, new Date());
}

/** Print after a completed sale (from receipt modal) */
function imprimirUltimoRecibo() {
  if (!ultimaVentaImprimible) { toast("No hay venta para imprimir", "error"); return; }
  const u = ultimaVentaImprimible;
  _ejecutarImpresion(u.ventaId, u.items, u.total, u.formaPago, u.fecha);
}

/** Print a sale from the dashboard recent-sales table */
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
  _ejecutarImpresion(
    ventaObj.VENTA_ID || ventaObj.ID || "—",
    items,
    Number(ventaObj.TOTAL || 0),
    ventaObj.FORMA_PAGO || ventaObj.PAGO || "—",
    ventaObj.FECHA ? new Date(ventaObj.FECHA) : new Date()
  );
}

function _ejecutarImpresion(ventaId, items, total, formaPago, fecha) {
  const frame = document.getElementById("thermalPrintFrame");
  if (!frame) { toast("Error: frame de impresión no encontrado", "error"); return; }

  frame.innerHTML = buildThermalHTML(ventaId, items, total, formaPago, fecha);

  // Small delay to let the DOM paint before triggering print dialog
  setTimeout(() => {
    window.print();
  }, 120);
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
