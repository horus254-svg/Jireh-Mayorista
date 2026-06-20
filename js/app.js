/* =========================================================
   CONFIG
========================================================= */

const API_URL = "https://script.google.com/macros/s/AKfycbw1eY_mXImG503rU0Cqddx1WBuGIOhxaW_SXGoIMsug_CjsSC-HLsb2XzYwrovaGBU/exec";

const PLACEHOLDER_IMG = "data:image/svg+xml;base64," + btoa(
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>" +
    "<rect width='100%' height='100%' fill='#eef1f6'/>" +
    "<text x='50%' y='50%' font-size='20' text-anchor='middle' fill='#94a3b8' font-family='sans-serif' dy='.3em'>Sin imagen</text>" +
    "</svg>"
);

const estado = {
    productos: [],
    carrito: JSON.parse(localStorage.getItem("carrito")) || [],
    busqueda: "",
    categoria: ""
};

// Número de WhatsApp usado por el botón flotante y por el checkout.
// Se sobreescribe con el valor de Sheets en aplicarApariencia(); este
// es solo el valor por defecto mientras carga o si falla la conexión.
let whatsappNumero = "5491140975795";

let qvProductoActual = null;
let debounceTimer = null;

/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(str){
    return String(str ?? "").replace(/[&<>"']/g, c => ({
        "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    }[c]));
}

function formatearPrecio(valor){
    return Number(valor || 0).toLocaleString("es-AR");
}

function obtenerEstadoStock(stock){

    const n = Number(String(stock ?? "").trim());

    if(isNaN(n)) return null;

    return n < 5
        ? { texto: "Últimas Unidades", clase: "stock-bajo" }
        : { texto: "Disponible", clase: "stock-ok" };
}

/* =========================================================
   TOASTS
========================================================= */

function mostrarToast(mensaje, tipo){

    const cont = document.getElementById("toast-container");

    const el = document.createElement("div");
    el.className = "app-toast " + (tipo || "info");
    el.textContent = mensaje;

    cont.appendChild(el);

    requestAnimationFrame(()=> el.classList.add("show"));

    setTimeout(()=>{
        el.classList.remove("show");
        setTimeout(()=> el.remove(), 300);
    }, 2600);
}

/* =========================================================
   CARGA DE PRODUCTOS
========================================================= */

function mostrarSkeleton(n){

    n = n || 8;

    const cont = document.getElementById("productos");

    let html = "";

    for(let i=0;i<n;i++){
        html += `
        <div class="col-xl-3 col-lg-4 col-md-6 col-sm-6 mb-4">
            <div class="skeleton-card">
                <div class="skeleton-img"></div>
                <div class="skeleton-line w-80"></div>
                <div class="skeleton-line w-60"></div>
            </div>
        </div>`;
    }

    cont.innerHTML = html;

    document.getElementById("resultados-info").textContent = "";
    document.getElementById("sin-resultados").classList.add("d-none");
}

async function cargarProductos(){

    mostrarSkeleton();

    try{

        const res = await fetch(API_URL + "?action=productos");
        const data = await res.json();

        estado.productos = (data.productos || [])
        .filter(p => Number(String(p.STOCK).trim()) > 0)
        .sort((a,b)=>{

            const da = String(a.DESTACADO).trim().toUpperCase();
            const db = String(b.DESTACADO).trim().toUpperCase();

            return db.localeCompare(da);
        });

        renderChips();
        aplicarFiltros();

    }catch(err){

        console.error(err);

        document.getElementById("productos").innerHTML = "";

        mostrarToast("No pudimos cargar el catálogo. Revisá tu conexión y volvé a intentar.", "error");
    }
}

/* =========================================================
   CATEGORÍAS (CHIPS)
========================================================= */

function renderChips(){

    const categorias = [...new Set(
        estado.productos
        .map(p => String(p.CATEGORIA || "").trim())
        .filter(Boolean)
    )];

    const cont = document.getElementById("categoria-chips");

    let html = `<button type="button" class="chip active" data-cat="">Todas</button>`;

    categorias.forEach(cat=>{
        html += `<button type="button" class="chip" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
    });

    cont.innerHTML = html;
}

function limpiarFiltros(){

    estado.categoria = "";
    estado.busqueda = "";

    document.getElementById("search").value = "";
    document.getElementById("search-clear").classList.remove("visible");

    document.querySelectorAll("#categoria-chips .chip").forEach(c => c.classList.remove("active"));

    const todas = document.querySelector('#categoria-chips .chip[data-cat=""]');
    if(todas) todas.classList.add("active");

    aplicarFiltros();
}

/* =========================================================
   FILTRADO (BÚSQUEDA + CATEGORÍA COMBINADOS)
========================================================= */

function aplicarFiltros(){

    let lista = estado.productos;

    if(estado.categoria){
        lista = lista.filter(p => String(p.CATEGORIA || "").trim() === estado.categoria);
    }

    if(estado.busqueda){
        lista = lista.filter(p =>
            String(p.PRODUCTO || "").toLowerCase().includes(estado.busqueda)
        );
    }

    mostrarProductos(lista);
}

function buscarProductos(){

    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(()=>{

        const texto = document.getElementById("search").value.toLowerCase().trim();

        estado.busqueda = texto;

        document.getElementById("search-clear").classList.toggle("visible", texto.length > 0);

        aplicarFiltros();

    }, 250);
}

function limpiarBusqueda(){

    document.getElementById("search").value = "";

    estado.busqueda = "";

    document.getElementById("search-clear").classList.remove("visible");

    aplicarFiltros();
}

/* =========================================================
   RENDER DE PRODUCTOS
========================================================= */

function mostrarProductos(lista){

    const container = document.getElementById("productos");
    const sinResultados = document.getElementById("sin-resultados");
    const info = document.getElementById("resultados-info");

    if(lista.length === 0){

        container.innerHTML = "";
        sinResultados.classList.remove("d-none");
        info.textContent = "";

        return;
    }

    sinResultados.classList.add("d-none");

    info.textContent = lista.length === 1
        ? "1 producto encontrado"
        : `${lista.length} productos encontrados`;

    let html = "";

    lista.forEach(p=>{

        const codigo = escapeHtml(p.CODIGO);
        const nombre = escapeHtml(p.PRODUCTO);
        const categoria = escapeHtml(p.CATEGORIA);
        const imagen = p.IMAGEN || "";

        const stock = obtenerEstadoStock(p.STOCK);

        html += `
        <div class="col-xl-3 col-lg-4 col-md-6 col-sm-6 mb-4">

            <div class="card-product h-100" data-code="${codigo}" data-action="quickview">

                ${String(p.DESTACADO || "").trim().length > 0 ? `<div class="ribbon-destacado">⭐ DESTACADO</div>` : ""}

                ${String(p.OFERTA || "").trim().length > 0 ? `<div class="ribbon-oferta">🔥 OFERTA</div>` : ""}

                <div class="card-img-wrap">
                    <img
                        src="${imagen}"
                        alt="${nombre}"
                        loading="lazy"
                        onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'">
                </div>

                <div class="ticket-perf"></div>

                <div class="card-body-custom">

                    <small>${categoria}</small>

                    <h5>${nombre}</h5>

                    <div class="price">$${formatearPrecio(p.PRECIO)}</div>

                    ${stock ? `<div class="stock-badge ${stock.clase}">${stock.texto}</div>` : ""}

                    <div class="qty-stepper">
                        <button type="button" class="qty-btn" data-action="qty-minus" aria-label="Restar">−</button>
                        <input type="number" class="qty-input" data-role="qty" value="1" min="1" inputmode="numeric">
                        <button type="button" class="qty-btn" data-action="qty-plus" aria-label="Sumar">+</button>
                    </div>

                    <button type="button" class="btn btn-primary" data-action="agregar">
                        🛒 Agregar
                    </button>

                </div>

            </div>

        </div>`;
    });

    container.innerHTML = html;
}

/* Delegación de eventos en la grilla de productos */
document.getElementById("productos").addEventListener("click", function(e){

    if(e.target.tagName === "INPUT") return;

    const actionEl = e.target.closest("[data-action]");
    if(!actionEl) return;

    const card = actionEl.closest(".card-product");
    if(!card) return;

    const codigo = card.dataset.code;
    const producto = estado.productos.find(p => String(p.CODIGO) === codigo);
    const qtyInput = card.querySelector('[data-role="qty"]');

    switch(actionEl.dataset.action){

        case "qty-plus":
            qtyInput.value = Math.max(1, (parseInt(qtyInput.value) || 1) + 1);
            break;

        case "qty-minus":
            qtyInput.value = Math.max(1, (parseInt(qtyInput.value) || 1) - 1);
            break;

        case "agregar":
            agregarAlCarrito(producto, parseInt(qtyInput.value) || 1);
            qtyInput.value = 1;
            break;

        case "quickview":
            abrirQuickView(producto);
            break;
    }
});

/* Delegación de clics en los chips de categoría */
document.getElementById("categoria-chips").addEventListener("click", function(e){

    const btn = e.target.closest(".chip");
    if(!btn) return;

    document.querySelectorAll("#categoria-chips .chip").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");

    estado.categoria = btn.dataset.cat || "";

    aplicarFiltros();
});

/* =========================================================
   VISTA RÁPIDA
========================================================= */

function cambiarQtyInput(id, delta){

    const el = document.getElementById(id);

    el.value = Math.max(1, (parseInt(el.value) || 1) + delta);
}

function abrirQuickView(producto){

    if(!producto) return;

    qvProductoActual = producto;

    document.getElementById("qv-titulo").textContent = producto.PRODUCTO;

    const img = document.getElementById("qv-imagen");
    img.src = producto.IMAGEN || "";
    img.alt = producto.PRODUCTO || "";
    img.onerror = function(){ this.onerror = null; this.src = PLACEHOLDER_IMG; };

    document.getElementById("qv-categoria").textContent = producto.CATEGORIA || "";
    document.getElementById("qv-precio").textContent = "$" + formatearPrecio(producto.PRECIO);

    const stockEl = document.getElementById("qv-stock");
    const stock = obtenerEstadoStock(producto.STOCK);

    if(stock){
        stockEl.textContent = stock.texto;
        stockEl.className = "stock-badge " + stock.clase;
        stockEl.classList.remove("d-none");
    }else{
        stockEl.classList.add("d-none");
    }

    document.getElementById("qv-cantidad").value = 1;

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("quickViewModal"));
    modal.show();
}

document.getElementById("qv-agregar").addEventListener("click", function(){

    const cantidad = parseInt(document.getElementById("qv-cantidad").value) || 1;

    agregarAlCarrito(qvProductoActual, cantidad);

    const modal = bootstrap.Modal.getInstance(document.getElementById("quickViewModal"));
    if(modal) modal.hide();
});

/* =========================================================
   CARRITO
========================================================= */

function agregarAlCarrito(producto, cantidad){

    if(!producto) return;

    cantidad = Math.max(1, cantidad || 1);

    const existente = estado.carrito.find(p => String(p.CODIGO) === String(producto.CODIGO));

    if(existente){
        existente.cantidad += cantidad;
    }else{
        estado.carrito.push({ ...producto, cantidad });
    }

    guardarCarrito();

    mostrarToast(`✓ ${producto.PRODUCTO} agregado (${cantidad})`, "success");
}

function guardarCarrito(){

    localStorage.setItem("carrito", JSON.stringify(estado.carrito));

    actualizarContador();
}

function actualizarContador(){

    const cantidadTotal = estado.carrito.reduce((acc,item) => acc + item.cantidad, 0);
    const totalPrecio = estado.carrito.reduce((acc,item) => acc + (item.PRECIO * item.cantidad), 0);

    document.getElementById("cart-count").innerText = cantidadTotal;

    const mcb = document.getElementById("mobile-cart-bar");

    if(cantidadTotal > 0){

        mcb.classList.remove("d-none");

        document.getElementById("mcb-count").innerText = cantidadTotal;
        document.getElementById("mcb-total").innerText = formatearPrecio(totalPrecio);

    }else{

        mcb.classList.add("d-none");
    }
}

function cambiarCantidad(codigo, cambio){

    const item = estado.carrito.find(p => String(p.CODIGO) === String(codigo));
    if(!item) return;

    item.cantidad += cambio;

    if(item.cantidad <= 0){
        estado.carrito = estado.carrito.filter(p => String(p.CODIGO) !== String(codigo));
    }

    guardarCarrito();
    abrirCarrito();
}

function actualizarCantidadManual(codigo, cantidad){

    const item = estado.carrito.find(p => String(p.CODIGO) === String(codigo));
    if(!item) return;

    cantidad = parseInt(cantidad);

    if(isNaN(cantidad) || cantidad < 1){
        cantidad = 1;
    }

    item.cantidad = cantidad;

    guardarCarrito();
    abrirCarrito();
}

function eliminarProducto(codigo){

    estado.carrito = estado.carrito.filter(p => String(p.CODIGO) !== String(codigo));

    guardarCarrito();
    abrirCarrito();
}

function vaciarCarrito(){

    if(estado.carrito.length === 0) return;

    if(!confirm("¿Vaciar carrito?")) return;

    estado.carrito = [];

    guardarCarrito();
    abrirCarrito();

    mostrarToast("Carrito vaciado", "success");
}

function abrirCarrito(){

    const cont = document.getElementById("cart-items");
    const emptyEl = document.getElementById("cart-empty");

    let total = 0;

    if(estado.carrito.length === 0){

        cont.innerHTML = "";
        emptyEl.classList.remove("d-none");

    }else{

        emptyEl.classList.add("d-none");

        let html = "";

        estado.carrito.forEach(item=>{

            const subtotal = item.PRECIO * item.cantidad;
            total += subtotal;

            html += `
            <div class="cart-item-row" data-code="${escapeHtml(item.CODIGO)}">

                <div class="d-flex justify-content-between align-items-center">

                    <span class="cart-item-name">${escapeHtml(item.PRODUCTO)}</span>

                    <button type="button" class="btn btn-sm btn-danger" data-action="eliminar" aria-label="Quitar producto">
                        🗑
                    </button>

                </div>

                <div class="qty-stepper">

                    <button type="button" class="qty-btn" data-action="menos" aria-label="Restar">−</button>

                    <input
                        type="number"
                        min="1"
                        value="${item.cantidad}"
                        class="qty-input"
                        data-action-input="cantidad"
                        inputmode="numeric">

                    <button type="button" class="qty-btn" data-action="mas" aria-label="Sumar">+</button>

                </div>

                <div class="cart-item-subtotal">$${formatearPrecio(subtotal)}</div>

            </div>`;
        });

        cont.innerHTML = html;
    }

    document.getElementById("cart-total").innerText = formatearPrecio(total);

    const btnCheckout = document.getElementById("btn-checkout");
    btnCheckout.disabled = estado.carrito.length === 0;

    const modalElement = document.getElementById("cartModal");
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

    modal.show();
}

/* Delegación de eventos dentro del carrito */
document.getElementById("cart-items").addEventListener("click", function(e){

    const btn = e.target.closest("[data-action]");
    if(!btn) return;

    const row = btn.closest(".cart-item-row");
    if(!row) return;

    const codigo = row.dataset.code;

    if(btn.dataset.action === "eliminar") eliminarProducto(codigo);
    if(btn.dataset.action === "menos") cambiarCantidad(codigo, -1);
    if(btn.dataset.action === "mas") cambiarCantidad(codigo, 1);
});

document.getElementById("cart-items").addEventListener("change", function(e){

    if(e.target.dataset.actionInput === "cantidad"){

        const row = e.target.closest(".cart-item-row");
        actualizarCantidadManual(row.dataset.code, e.target.value);
    }
});

/* =========================================================
   CHECKOUT (WHATSAPP)
========================================================= */

async function checkoutWhatsapp(){

    const nombre = document.getElementById("clienteNombre").value.trim();
    const empresa = document.getElementById("clienteEmpresa").value.trim();
    const direccion = document.getElementById("clienteDireccion").value.trim();
    const telefono = document.getElementById("clienteTelefono").value.trim();
    const dni = document.getElementById("clienteDni").value.trim();

    if(nombre === "" || direccion === "" || telefono === "" || dni === ""){
        mostrarToast("Completá Nombre, Dirección, Teléfono y DNI o CUIT.", "error");
        return;
    }

    if(estado.carrito.length === 0){
        mostrarToast("Tu carrito está vacío.", "error");
        return;
    }

    let total = 0;
    estado.carrito.forEach(item => { total += item.PRECIO * item.cantidad; });

    const btnCheckout = document.getElementById("btn-checkout");
    btnCheckout.disabled = true;
    btnCheckout.textContent = "Enviando...";

    const url =
        API_URL +
        "?action=guardarPedido" +
        "&nombre=" + encodeURIComponent(nombre) +
        "&empresa=" + encodeURIComponent(empresa) +
        "&direccion=" + encodeURIComponent(direccion) +
        "&telefono=" + encodeURIComponent(telefono) +
        "&dni=" + encodeURIComponent(dni) +
        "&total=" + total +
        "&carrito=" + encodeURIComponent(JSON.stringify(estado.carrito));

    try{

        const response = await fetch(url);
        const resultado = await response.json();

        if(!resultado.success){
            mostrarToast("No se pudo guardar el pedido. Intentá de nuevo.", "error");
            btnCheckout.disabled = false;
            btnCheckout.textContent = "Enviar pedido por WhatsApp";
            return;
        }

        let mensaje = `*PEDIDO JIREH MAYORISTA*

🧾 Pedido: ${resultado.pedidoId}

👤 Cliente: ${nombre}
🏢 Empresa: ${empresa}
🏠 Dirección: ${direccion}
📱 Teléfono: ${telefono}
🆔 DNI/CUIT: ${dni}

`;

        estado.carrito.forEach(item=>{

            const subtotal = item.PRECIO * item.cantidad;

            mensaje += `
• ${item.PRODUCTO}
Cantidad: ${item.cantidad}
Subtotal: $${formatearPrecio(subtotal)}

`;
        });

        mensaje += `
💰 TOTAL: $${formatearPrecio(total)}
`;

        estado.carrito = [];
        localStorage.removeItem("carrito");
        guardarCarrito();

        document.getElementById("cart-items").innerHTML = "";
        document.getElementById("cart-total").innerText = "0";

        const modalElement = document.getElementById("cartModal");
        const modal = bootstrap.Modal.getInstance(modalElement);
        if(modal) modal.hide();

        btnCheckout.disabled = false;
        btnCheckout.textContent = "Enviar pedido por WhatsApp";

        setTimeout(()=>{
            window.location.href = `https://api.whatsapp.com/send?phone=${whatsappNumero}&text=${encodeURIComponent(mensaje)}`;
        }, 300);

    }catch(error){

        console.error(error);

        mostrarToast("Error al registrar el pedido.", "error");

        btnCheckout.disabled = false;
        btnCheckout.textContent = "Enviar pedido por WhatsApp";
    }
}

/* =========================================================
   VOLVER ARRIBA
========================================================= */

window.addEventListener("scroll", function(){

    const btn = document.getElementById("scroll-top-btn");

    if(window.scrollY > 400){
        btn.classList.remove("d-none");
    }else{
        btn.classList.add("d-none");
    }
});

/* =========================================================
   SINCRONIZACIÓN AL VOLVER A LA PÁGINA
========================================================= */

window.addEventListener("pageshow", function(){

    estado.carrito = JSON.parse(localStorage.getItem("carrito")) || [];

    actualizarContador();
});

/* =========================================================
   APARIENCIA (BANNER + TEMA) — DESDE GOOGLE SHEETS
   Se trae de la misma hoja CONFIGURACION que usa el panel
   admin, así ambos quedan siempre sincronizados.
========================================================= */

async function aplicarApariencia(){

    try{

        const res = await fetch(API_URL + "?action=configuracionNegocio");
        const data = await res.json();

        if(!data.success || !data.config) return;

        const cfg = data.config;

        // --- Tema de color ---
        const tema = (cfg.tema || "navy").toLowerCase();
        document.body.setAttribute("data-tema", tema);

        // --- Texto del encabezado (navbar) ---
        const navbarTextoEl = document.getElementById("navbar-brand-texto");

        if(navbarTextoEl && cfg.navbarTexto){
            navbarTextoEl.textContent = cfg.navbarTexto;
        }

        // --- Título / subtítulo del banner ---
        const tituloEl = document.getElementById("hero-titulo");
        const subtituloEl = document.getElementById("hero-subtitulo");

        if(tituloEl && cfg.bannerTitulo){
            tituloEl.textContent = cfg.bannerTitulo;
        }

        if(subtituloEl && cfg.bannerSubtitulo){
            subtituloEl.textContent = cfg.bannerSubtitulo;
        }

        // --- Imagen de fondo del banner (opcional) ---
        const heroEl = document.getElementById("hero");

        if(heroEl && cfg.bannerImagen){
            heroEl.style.setProperty("--hero-bg-img", `url("${cfg.bannerImagen}")`);
            heroEl.classList.add("hero--imagen");
        }

        // --- Título de la pestaña del navegador ---
        if(cfg.nombre){
            document.title = cfg.nombre;
        }

        // --- Sección "Beneficios" (chips bajo el banner) ---
        aplicarBeneficios(cfg);

    }catch(err){
        // Si falla, la página sigue mostrando los valores fijos del HTML.
        console.error("No se pudo cargar la apariencia desde Sheets:", err);
    }
}

/**
 * Limpia un número de teléfono dejando solo dígitos y un "+" inicial
 * opcional, para armar un link tel: válido a partir de lo que el
 * admin haya escrito en Sheets (con guiones, espacios, paréntesis, etc).
 */
function limpiarTelefonoParaLink(telefono){
    return String(telefono || "").trim().replace(/[^\d+]/g, "");
}

/**
 * Muestra u oculta un chip de la sección Beneficios según tenga
 * contenido o no, para no dejar espacios vacíos en la fila.
 */
function configurarChipBeneficio(wrapId, visible){
    const wrap = document.getElementById(wrapId);
    if(wrap) wrap.classList.toggle("d-none", !visible);
}

function aplicarBeneficios(cfg){

    // --- WhatsApp: actualiza el botón flotante y la variable de checkout ---
    const numeroWa = limpiarTelefonoParaLink(cfg.beneficioWhatsappNumero) || whatsappNumero;
    whatsappNumero = numeroWa;

    const btnFlotanteWa = document.getElementById("whatsapp-float-btn");
    if(btnFlotanteWa){
        btnFlotanteWa.href = `https://wa.me/${numeroWa}`;
    }

    // --- Instagram ---
    const instagramUrl = (cfg.beneficioInstagramUrl || "").trim();
    const instagramEl = document.getElementById("beneficio-instagram");
    const instagramTextoEl = document.getElementById("beneficio-instagram-texto");

    if(instagramEl && instagramTextoEl && instagramUrl){
        instagramEl.href = instagramUrl;
        // Si pegaron solo "@usuario" o "usuario", se usa como texto;
        // si es una URL completa, se muestra "Instagram" como texto fijo.
        instagramTextoEl.textContent = instagramUrl.startsWith("http")
            ? "Instagram"
            : instagramUrl;
    }
    configurarChipBeneficio("beneficio-instagram-wrap", !!instagramUrl);

    // --- Teléfono 1 ---
    const tel1 = (cfg.beneficioTelefono1 || "").trim();
    const tel1El = document.getElementById("beneficio-telefono1");
    const tel1TextoEl = document.getElementById("beneficio-telefono1-texto");

    if(tel1El && tel1TextoEl && tel1){
        tel1El.href = `tel:${limpiarTelefonoParaLink(tel1)}`;
        tel1TextoEl.textContent = tel1;
    }
    configurarChipBeneficio("beneficio-telefono1-wrap", !!tel1);

    // --- Teléfono 2 ---
    const tel2 = (cfg.beneficioTelefono2 || "").trim();
    const tel2El = document.getElementById("beneficio-telefono2");
    const tel2TextoEl = document.getElementById("beneficio-telefono2-texto");

    if(tel2El && tel2TextoEl && tel2){
        tel2El.href = `tel:${limpiarTelefonoParaLink(tel2)}`;
        tel2TextoEl.textContent = tel2;
    }
    configurarChipBeneficio("beneficio-telefono2-wrap", !!tel2);

    // --- Dirección ---
    const direccion = (cfg.beneficioDireccion || "").trim();
    const direccionTextoEl = document.getElementById("beneficio-direccion-texto");

    if(direccionTextoEl && direccion){
        direccionTextoEl.textContent = direccion;
    }
    configurarChipBeneficio("beneficio-direccion-wrap", !!direccion);

    // --- Textos libres ---
    const texto1 = (cfg.beneficioTextoLibre1 || "").trim();
    const texto1El = document.getElementById("beneficio-texto1");
    if(texto1El) texto1El.textContent = texto1;
    configurarChipBeneficio("beneficio-texto1-wrap", !!texto1);

    const texto2 = (cfg.beneficioTextoLibre2 || "").trim();
    const texto2El = document.getElementById("beneficio-texto2");
    if(texto2El) texto2El.textContent = texto2;
    configurarChipBeneficio("beneficio-texto2-wrap", !!texto2);
}

/* =========================================================
   INICIO
========================================================= */

aplicarApariencia();
actualizarContador();
cargarProductos();
