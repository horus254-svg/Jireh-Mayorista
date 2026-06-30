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
    productosVisibles: [],
    carrito: JSON.parse(localStorage.getItem("carrito")) || [],
    busqueda: "",
    categoria: ""
};

// Número de WhatsApp usado por el botón flotante y por el checkout.
// Se sobreescribe con el valor de Sheets en aplicarApariencia(); este
// es solo el valor por defecto mientras carga o si falla la conexión.
let whatsappNumero = "5491140975795";

// Promesa de la carga de configuración (se asigna más abajo, al llamar
// aplicarApariencia()). checkoutWhatsapp() la espera antes de armar el
// link de WhatsApp, para nunca mandar el pedido al número de respaldo
// por una carrera entre el clic del cliente y la respuesta del backend.
let apariencaCargadaPromise = null;

// Nombre del negocio, para el encabezado del PDF del catálogo. Se
// sobreescribe con el valor de Sheets en aplicarApariencia().
let nombreNegocio = "Catálogo";

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

            // Antes esto comparaba el texto alfabéticamente, lo cual hacía
            // que cualquier valor no vacío en DESTACADO (no solo "SI")
            // pudiera ordenarse antes que uno verdaderamente destacado.
            // Ahora es una comparación real de "es destacado sí o no".
            const esDestacadaA = String(a.DESTACADO || "").trim().toUpperCase() === "SI";
            const esDestacadaB = String(b.DESTACADO || "").trim().toUpperCase() === "SI";

            if(esDestacadaA === esDestacadaB) return 0;
            return esDestacadaA ? -1 : 1; // los destacados reales van primero
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

    // Se guarda la lista visible actual, para que el botón de descarga
    // de PDF siempre tome exactamente lo que se está mostrando en pantalla.
    estado.productosVisibles = lista;

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

                ${String(p.DESTACADO || "").trim().toUpperCase() === "SI" ? `<div class="ribbon-destacado">⭐ DESTACADO</div>` : ""}

                ${String(p.OFERTA || "").trim().toUpperCase() === "SI" ? `<div class="ribbon-oferta">🔥 OFERTA</div>` : ""}

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

    const descripcionEl = document.getElementById("qv-descripcion");
    const descripcion = String(producto.DESCRIPCION || "").trim();
    descripcionEl.textContent = descripcion;
    descripcionEl.classList.toggle("d-none", !descripcion);

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

    const avisoMinimo = document.getElementById("cart-minimo-aviso");
    if(avisoMinimo){
        if(total > 0 && total < 100000) avisoMinimo.classList.remove("d-none");
        else avisoMinimo.classList.add("d-none");
    }

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

// Bandera explícita además de btn.disabled — evita que dos clics
// disparados casi en simultáneo (doble clic muy rápido) entren ambos
// a la función antes de que el atributo "disabled" surta efecto.
let enviandoPedido = false;

/** Puts the checkout button into its "sending" state: spinner, disabled, locked */
function activarCargaCheckout(){
    enviandoPedido = true;
    const btn = document.getElementById("btn-checkout");
    const texto = document.getElementById("btn-checkout-texto");
    if(btn){ btn.disabled = true; btn.classList.add("loading"); }
    if(texto) texto.textContent = "Enviando pedido...";
}

/** Restores the checkout button to its normal, clickable state */
function desactivarCargaCheckout(){
    enviandoPedido = false;
    const btn = document.getElementById("btn-checkout");
    const texto = document.getElementById("btn-checkout-texto");
    if(btn){ btn.disabled = false; btn.classList.remove("loading"); }
    if(texto) texto.textContent = "Enviar pedido por WhatsApp";
}

async function checkoutWhatsapp(){

    // Primera línea de defensa contra doble envío: si ya hay un pedido
    // en curso, no hace nada más — ni siquiera vuelve a validar.
    if(enviandoPedido) return;
    activarCargaCheckout();

    // Espera a que termine de cargar la configuración del negocio (de donde
    // sale whatsappNumero), por si el cliente hizo clic muy rápido y esa
    // carga todavía estaba en curso. Si ya terminó, esto no demora nada.
    // Si falla, igual sigue: whatsappNumero ya tiene el valor de respaldo.
    if(apariencaCargadaPromise){
        try{ await apariencaCargadaPromise; }catch(e){ /* whatsappNumero ya tiene el valor de respaldo */ }
    }

    const nombre = document.getElementById("clienteNombre").value.trim();
    const empresa = document.getElementById("clienteEmpresa").value.trim();
    const direccion = document.getElementById("clienteDireccion").value.trim();
    const localidad = document.getElementById("clienteLocalidad").value.trim();
    const provincia = document.getElementById("clienteProvincia").value.trim();
    const codigoPostal = document.getElementById("clienteCodigoPostal").value.trim();
    const telefono = document.getElementById("clienteTelefono").value.trim();
    const dni = document.getElementById("clienteDni").value.trim();

    if(nombre === "" || direccion === "" || localidad === "" || provincia === "" || telefono === "" || dni === ""){
        mostrarToast("Completá Nombre, Dirección, Localidad, Provincia, Teléfono y DNI o CUIT.", "error");
        desactivarCargaCheckout();
        return;
    }

    if(estado.carrito.length === 0){
        mostrarToast("Tu carrito está vacío.", "error");
        desactivarCargaCheckout();
        return;
    }

    let total = 0;
    estado.carrito.forEach(item => { total += item.PRECIO * item.cantidad; });

    if(total < 100000){
        mostrarToast("El pedido mínimo es $100.000. Agregá más productos para continuar.", "error");
        desactivarCargaCheckout();
        return;
    }

    try{

        // POST en vez de GET: con varios productos en el carrito, armar
        // todo en la URL (como antes) podía superar el límite de longitud
        // de URL de Safari/iOS y el pedido fallaba sin guardarse. Con el
        // carrito en el body, no hay ese límite. El backend (doPost) ya
        // espera exactamente este formato para action: "guardarPedido".
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita que el navegador dispare un preflight CORS contra Apps Script
            body: JSON.stringify({
                action: "guardarPedido",
                nombre,
                empresa,
                direccion,
                localidad,
                provincia,
                codigoPostal,
                telefono,
                dni,
                total,
                carrito: estado.carrito
            })
        });
        const resultado = await response.json();

        if(!resultado.success){
            mostrarToast("No se pudo guardar el pedido. Intentá de nuevo.", "error");
            desactivarCargaCheckout();
            return;
        }

        let mensaje = `*PEDIDO JIREH MAYORISTA*

🧾 Pedido: ${resultado.pedidoId}

👤 Cliente: ${nombre}
🏢 Empresa: ${empresa}
🏠 Dirección: ${direccion}
📍 Localidad: ${localidad} (${provincia})${codigoPostal ? " - CP: " + codigoPostal : ""}
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

        desactivarCargaCheckout();

        setTimeout(()=>{
            window.location.href = `https://api.whatsapp.com/send?phone=${whatsappNumero}&text=${encodeURIComponent(mensaje)}`;
        }, 300);

    }catch(error){

        console.error(error);

        mostrarToast("Error al registrar el pedido.", "error");

        desactivarCargaCheckout();
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
        // Si vienen vacíos desde Configuración, se ocultan del todo (en vez
        // de dejar el texto de respaldo del HTML para siempre) — pensado
        // para cuando el banner ya es una imagen con su propio diseño y
        // texto incorporado, que no necesita nada del sistema superpuesto.
        const tituloEl = document.getElementById("hero-titulo");
        const subtituloEl = document.getElementById("hero-subtitulo");

        const tituloVacio = !cfg.bannerTitulo || !cfg.bannerTitulo.trim();

        if(tituloEl){
            if(tituloVacio){
                tituloEl.style.display = "none";
            }else{
                tituloEl.textContent = cfg.bannerTitulo;
                tituloEl.style.display = "";
            }
        }

        if(subtituloEl){
            if(!cfg.bannerSubtitulo || !cfg.bannerSubtitulo.trim()){
                subtituloEl.style.display = "none";
            }else{
                subtituloEl.textContent = cfg.bannerSubtitulo;
                subtituloEl.style.display = "";
            }
        }

        // --- Imagen de fondo del banner (opcional) ---
        const heroEl = document.getElementById("hero");

        if(heroEl && cfg.bannerImagen){
            heroEl.style.setProperty("--hero-bg-img", `url("${cfg.bannerImagen}")`);
            heroEl.classList.add("hero--imagen");

            // Si no hay título de texto del sistema, tampoco hace falta el
            // oscurecido que existe solo para que ese texto se lea bien
            // sobre la foto — así la imagen del banner se ve nítida, sin
            // ningún velo encima.
            heroEl.classList.toggle("hero--sin-degradado", tituloVacio);
        }

        // --- Título de la pestaña del navegador ---
        if(cfg.nombre){
            document.title = cfg.nombre;
            nombreNegocio = cfg.nombre;
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

    // --- Textos libres (si el contenido es un link, se muestra como
    // botón clickable con el nombre de la red social detectada en vez
    // del texto plano original) ---
    const texto1 = (cfg.beneficioTextoLibre1 || "").trim();
    renderBeneficioTextoLibre("beneficio-texto1-wrap", texto1);
    configurarChipBeneficio("beneficio-texto1-wrap", !!texto1);

    const texto2 = (cfg.beneficioTextoLibre2 || "").trim();
    renderBeneficioTextoLibre("beneficio-texto2-wrap", texto2);
    configurarChipBeneficio("beneficio-texto2-wrap", !!texto2);

    aplicarBannerTop(cfg.bannerTopMensajes);
}

/**
 * Muestra la franja superior con los mensajes configurados desde
 * Configuración → "Banner superior" (uno por línea). Si no hay
 * ningún mensaje, la franja queda oculta y el navbar/contenido vuelven
 * a su posición normal (--top-banner-h en 0). Con más de un mensaje,
 * rota entre ellos cada pocos segundos con un fade simple.
 */
let bannerTopIntervalId = null;

function aplicarBannerTop(mensajesTexto){
    const banner = document.getElementById("top-banner");
    const track = document.getElementById("top-banner-track");
    if(!banner || !track) return;

    if(bannerTopIntervalId){
        clearInterval(bannerTopIntervalId);
        bannerTopIntervalId = null;
    }

    const mensajes = String(mensajesTexto || "")
        .split("\n")
        .map(m => m.trim())
        .filter(m => m.length > 0);

    if(mensajes.length === 0){
        banner.classList.add("d-none");
        document.documentElement.style.setProperty("--top-banner-h", "0px");
        return;
    }

    track.innerHTML = mensajes
        .map((m, i) => `<span class="msg${i === 0 ? " activo" : ""}">${escapeHtml(m)}</span>`)
        .join("");

    banner.classList.remove("d-none");

    // La altura real (34px definidos en CSS para .top-banner-track,
    // pero se mide en vivo por si el texto necesita más de una línea
    // en pantallas angostas) se aplica recién después de que el
    // navegador ya puso la franja en el DOM, para que la medición sea
    // exacta — sin esto, podría medir 0 y dejar el navbar mal ubicado.
    requestAnimationFrame(() => {
        const alturaReal = banner.offsetHeight;
        document.documentElement.style.setProperty("--top-banner-h", alturaReal + "px");
    });

    if(mensajes.length > 1){
        let indiceActual = 0;
        bannerTopIntervalId = setInterval(() => {
            const spans = track.querySelectorAll(".msg");
            spans[indiceActual].classList.remove("activo");
            indiceActual = (indiceActual + 1) % spans.length;
            spans[indiceActual].classList.add("activo");
        }, 4000);
    }
}

/**
 * Lista de redes sociales/plataformas que se reconocen por su dominio,
 * con el nombre y la clase de ícono (Bootstrap Icons) que se muestran
 * en el chip cuando el texto libre es un link a ese sitio. Si el link
 * no coincide con ninguna, se usa el genérico "Visitar enlace" (ver
 * más abajo).
 */
const REDES_SOCIALES_CONOCIDAS = [
    { dominio: "tiktok.com",     nombre: "TikTok",    iconoClase: "bi-tiktok" },
    { dominio: "instagram.com",  nombre: "Instagram", iconoClase: "bi-instagram" },
    { dominio: "facebook.com",   nombre: "Facebook",  iconoClase: "bi-facebook" },
    { dominio: "fb.com",         nombre: "Facebook",  iconoClase: "bi-facebook" },
    { dominio: "wa.me",          nombre: "WhatsApp",  iconoClase: "bi-whatsapp" },
    { dominio: "whatsapp.com",   nombre: "WhatsApp",  iconoClase: "bi-whatsapp" },
    { dominio: "youtube.com",    nombre: "YouTube",   iconoClase: "bi-youtube" },
    { dominio: "youtu.be",       nombre: "YouTube",   iconoClase: "bi-youtube" },
    { dominio: "twitter.com",    nombre: "Twitter",   iconoClase: "bi-twitter-x" },
    { dominio: "x.com",          nombre: "X",         iconoClase: "bi-twitter-x" },
    { dominio: "linkedin.com",   nombre: "LinkedIn",  iconoClase: "bi-linkedin" },
    { dominio: "t.me",           nombre: "Telegram",  iconoClase: "bi-telegram" }
];

/** Returns {nombre, iconoClase} for a known social network, by matching its domain against the URL */
function detectarRedSocial(url){
    const urlMin = url.toLowerCase();
    const encontrada = REDES_SOCIALES_CONOCIDAS.find(r => urlMin.includes(r.dominio));
    return encontrada || { nombre: "Visitar enlace", iconoClase: "bi-link-45deg" };
}

/** Returns true if the text looks like a URL (with or without an explicit http(s):// scheme) */
function esLinkValido(texto){
    if(/^https?:\/\//i.test(texto)) return true;
    // También se acepta sin "https://" adelante (ej. "tiktok.com/@negocio"),
    // siempre que tenga la forma de un dominio con algo después.
    return /^[a-z0-9.-]+\.[a-z]{2,}\/?\S*$/i.test(texto);
}

/**
 * Pinta el contenido de un chip de "texto libre": si el texto es un
 * link, lo muestra como botón clickable (mismo estilo que el chip de
 * Instagram) con el nombre de la red social detectada; si no, lo
 * muestra como antes, como texto plano sin link.
 */
function renderBeneficioTextoLibre(idWrap, texto){
    const wrap = document.getElementById(idWrap);
    if(!wrap) return;

    if(!texto){
        wrap.innerHTML = `<span class="beneficio-item"></span>`;
        return;
    }

    if(esLinkValido(texto)){
        const href = /^https?:\/\//i.test(texto) ? texto : ("https://" + texto);
        const { nombre, iconoClase } = detectarRedSocial(texto);

        wrap.innerHTML = `
            <a href="${escapeHtml(href)}" class="beneficio-item beneficio-link" target="_blank" rel="noopener">
                <i class="bi ${escapeHtml(iconoClase)}"></i> <span>${escapeHtml(nombre)}</span>
            </a>
        `;
    } else {
        wrap.innerHTML = `<span class="beneficio-item">${escapeHtml(texto)}</span>`;
    }
}

/* =========================================================
   DESCARGA DE CATÁLOGO EN PDF
   Genera un PDF con los productos que se están mostrando AHORA
   (respeta búsqueda y filtro de categoría activos), 4 por hoja,
   en una grilla de 2x2 con foto, nombre, categoría y precio.
========================================================= */

/**
 * Loads an image URL and returns it as a base64 data URL ready for
 * jsPDF.addImage(), or null if it couldn't be loaded — never rejects.
 *
 * Importante: pasa por el backend (?action=imagenProxy), no se pide
 * la imagen directo al navegador. Esto es a propósito: Drive no
 * siempre responde con los headers de CORS necesarios para que el
 * navegador pueda leer los píxeles de una imagen externa, y además
 * el navegador puede haber cacheado esa misma imagen antes (mostrada
 * en una tarjeta del catálogo) sin esos headers, lo que hace fallar
 * cualquier intento posterior de leerla para el PDF. Apps Script, al
 * descargarla del lado del servidor, no tiene esa restricción.
 */
async function cargarImagenParaPDF(url){
    if(!url) return null;

    try{
        const response = await fetch(API_URL + "?action=imagenProxy&url=" + encodeURIComponent(url));
        const data = await response.json();

        if(!data.success || !data.dataUrl) return null;

        return data.dataUrl;

    }catch(error){
        // Falla de red, backend caído, URL inválida, etc. — la
        // tarjeta se dibuja sin foto, no se interrumpe el PDF entero.
        return null;
    }
}

/** Reads the real image format from a data URL's MIME type, for jsPDF.addImage()'s format argument */
function detectarFormatoImagenPDF(dataUrl){
    const match = /^data:image\/(\w+);/.exec(dataUrl);
    const tipo = match ? match[1].toLowerCase() : "jpeg";

    if(tipo === "png") return "PNG";
    if(tipo === "webp") return "WEBP";
    return "JPEG"; // jpeg, jpg, y cualquier otro caso por defecto
}

/** Draws a single product card inside the given box (x, y, width, height) */
function dibujarTarjetaProductoPDF(doc, producto, imagenCargada, x, y, w, h){

    const margenInterno = 10;
    const anchoImagen = w - margenInterno * 2;
    const altoImagen = anchoImagen; // tarjeta de imagen cuadrada

    // --- Marco de la tarjeta ---
    doc.setDrawColor(225, 228, 235);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, w, h, 4, 4, "S");

    // --- Imagen (o placeholder si no cargó) ---
    const imgX = x + margenInterno;
    const imgY = y + margenInterno;

    if(imagenCargada){
        try{
            const formato = detectarFormatoImagenPDF(imagenCargada);
            doc.addImage(imagenCargada, formato, imgX, imgY, anchoImagen, altoImagen, undefined, "FAST");
        }catch(e){
            dibujarPlaceholderImagenPDF(doc, imgX, imgY, anchoImagen, altoImagen);
        }
    } else {
        dibujarPlaceholderImagenPDF(doc, imgX, imgY, anchoImagen, altoImagen);
    }

    // --- Textos, debajo de la imagen ---
    let cursorY = imgY + altoImagen + 14;
    const textoX = x + margenInterno;
    const anchoTexto = w - margenInterno * 2;

    const categoria = String(producto.CATEGORIA || "").trim();
    if(categoria){
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(140, 145, 160);
        doc.text(categoria.toUpperCase(), textoX, cursorY);
        cursorY += 13;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 35, 50);
    const nombreLineas = doc.splitTextToSize(String(producto.PRODUCTO || ""), anchoTexto);
    doc.text(nombreLineas.slice(0, 2), textoX, cursorY); // máximo 2 líneas, para no desbordar la tarjeta
    cursorY += nombreLineas.slice(0, 2).length * 13 + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(20, 130, 90);
    doc.text("$" + formatearPrecio(producto.PRECIO), textoX, cursorY);
}

/** Simple gray placeholder box, used when a product has no image or it failed to load */
function dibujarPlaceholderImagenPDF(doc, x, y, w, h){
    doc.setFillColor(238, 241, 246);
    doc.rect(x, y, w, h, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(170, 175, 190);
    doc.text("Sin imagen", x + w / 2, y + h / 2, { align: "center" });
}

/** Draws the small header repeated at the top of every page */
function dibujarEncabezadoPaginaPDF(doc, anchoPagina, margen){
    const fecha = new Date().toLocaleDateString("es-AR");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 25, 40);
    doc.text(nombreNegocio, margen, margen + 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(140, 145, 160);
    doc.text(fecha, anchoPagina - margen, margen + 4, { align: "right" });

    doc.setDrawColor(225, 228, 235);
    doc.setLineWidth(0.8);
    doc.line(margen, margen + 12, anchoPagina - margen, margen + 12);
}

/** Shows (or updates, if already shown) a single persistent progress toast — used for the PDF generation progress */
function mostrarProgresoToast(mensaje){
    let el = document.getElementById("pdf-progreso-toast");

    if(!el){
        el = document.createElement("div");
        el.id = "pdf-progreso-toast";
        el.className = "app-toast info";
        document.getElementById("toast-container").appendChild(el);
        requestAnimationFrame(()=> el.classList.add("show"));
    }

    el.textContent = mensaje;
}

/** Removes the persistent progress toast, if present */
function ocultarProgresoToast(){
    const el = document.getElementById("pdf-progreso-toast");
    if(!el) return;
    el.classList.remove("show");
    setTimeout(()=> el.remove(), 300);
}

/**
 * Carga las imágenes de a lotes (no todas en paralelo de una sola vez).
 * Necesario porque cada imagen pasa por el backend (?action=imagenProxy,
 * ver cargarImagenParaPDF), y Apps Script tiene un límite de cuántas
 * ejecuciones puede atender en simultáneo por usuario — con catálogos
 * grandes (100+ productos), lanzar todo de una vez puede saturar esa
 * cuota y hacer que varias fallen. `onProgreso` se llama después de
 * cada lote, para poder mostrar un mensaje de avance al usuario.
 */
async function cargarImagenesEnLotes(urls, tamanoLote, onProgreso){
    const resultados = [];

    for(let i = 0; i < urls.length; i += tamanoLote){
        const lote = urls.slice(i, i + tamanoLote);
        const cargadas = await Promise.all(lote.map(url => cargarImagenParaPDF(url)));
        resultados.push(...cargadas);

        if(onProgreso) onProgreso(resultados.length, urls.length);
    }

    return resultados;
}

/** Main entry point: builds and downloads the PDF for the products currently visible on screen */
async function descargarCatalogoPDF(){

    const lista = estado.productosVisibles || [];

    if(lista.length === 0){
        mostrarToast("No hay productos para descargar con el filtro actual.", "error");
        return;
    }

    const btn = document.getElementById("btn-descargar-pdf");
    const textoOriginal = btn ? btn.innerHTML : "";
    if(btn){ btn.disabled = true; btn.innerHTML = "⏳ Generando..."; }

    try{

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

        const anchoPagina = doc.internal.pageSize.getWidth();
        const altoPagina = doc.internal.pageSize.getHeight();
        const margen = 36;
        const espacioEncabezado = 50;

        const anchoDisponible = anchoPagina - margen * 2;
        const altoDisponible = altoPagina - margen * 2 - espacioEncabezado;

        const gap = 14;
        const anchoTarjeta = (anchoDisponible - gap) / 2;
        const altoTarjeta = (altoDisponible - gap) / 2;

        // Pre-carga todas las imágenes antes de dibujar — en lotes, no
        // todas en paralelo de una sola vez (ver cargarImagenesEnLotes),
        // mostrando el avance real si hay muchos productos.
        const TAMANO_LOTE = 8;
        mostrarProgresoToast(`Preparando PDF... (0/${lista.length} fotos)`);
        const imagenesCargadas = await cargarImagenesEnLotes(
            lista.map(p => p.IMAGEN),
            TAMANO_LOTE,
            (cargadas, total) => mostrarProgresoToast(`Preparando PDF... (${cargadas}/${total} fotos)`)
        );
        ocultarProgresoToast();

        lista.forEach((producto, idx) => {

            const posicionEnPagina = idx % 4;

            if(posicionEnPagina === 0){
                if(idx > 0) doc.addPage();
                dibujarEncabezadoPaginaPDF(doc, anchoPagina, margen);
            }

            const col = posicionEnPagina % 2;
            const fila = Math.floor(posicionEnPagina / 2);

            const x = margen + col * (anchoTarjeta + gap);
            const y = margen + espacioEncabezado + fila * (altoTarjeta + gap);

            dibujarTarjetaProductoPDF(doc, producto, imagenesCargadas[idx], x, y, anchoTarjeta, altoTarjeta);
        });

        const fechaArchivo = new Date().toISOString().slice(0, 10);
        doc.save(`catalogo_${fechaArchivo}.pdf`);

        mostrarToast("PDF descargado correctamente.", "success");

    }catch(error){
        console.error("Error al generar el PDF del catálogo:", error);
        ocultarProgresoToast();
        mostrarToast("No se pudo generar el PDF. Intentá de nuevo.", "error");
    }finally{
        if(btn){ btn.disabled = false; btn.innerHTML = textoOriginal; }
    }
}

/* =========================================================
   INICIO
========================================================= */

apariencaCargadaPromise = aplicarApariencia();
actualizarContador();
cargarProductos();
