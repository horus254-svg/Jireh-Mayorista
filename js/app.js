const API_URL = "https://script.google.com/macros/s/AKfycbw1eY_mXImG503rU0Cqddx1WBuGIOhxaW_SXGoIMsug_CjsSC-HLsb2XzYwrovaGBU/exec";

let productos = [];

let carrito =
JSON.parse(
localStorage.getItem("carrito")
) || [];

cargarProductos();

actualizarContador();

async function cargarProductos(){

    const res =
    await fetch(
      API_URL + "?action=productos"
    );

    const data =
    await res.json();

productos = data.productos
.filter(
  p => Number(String(p.STOCK).trim()) > 0
)
.sort((a,b)=>{

    const da =
    String(a.DESTACADO)
    .trim()
    .toUpperCase();

    const db =
    String(b.DESTACADO)
    .trim()
    .toUpperCase();

    return db.localeCompare(da);

});

    mostrarProductos(productos);

    cargarCategorias();

}

function mostrarProductos(lista){

    const container =
    document.getElementById(
      "productos"
    );

    let html = "";

    lista.forEach(p=>{

        html += `

        <div class="col-md-3 mb-4">

        <div class="card-product position-relative">
${
String(p.DESTACADO || "").trim().length > 0
? `
<div class="ribbon-destacado">
⭐ DESTACADO
</div>
`
: ''
}

${
String(p.OFERTA || "").trim().length > 0
? `
<div class="ribbon-oferta">
🔥 OFERTA
</div>
`
: ''
}
            <img src="${p.IMAGEN}">

            <div class="p-3">

     <h5>${p.PRODUCTO}</h5>
                <p>${p.CATEGORIA}</p>

                <div class="price">
                    $${Number(p.PRECIO).toLocaleString('es-AR')}
                </div>

                <button
                  class="btn btn-primary w-100 mt-2"
                  onclick="agregarCarrito('${p.CODIGO}')">

                  Agregar

                </button>

            </div>

        </div>

        </div>

        `;
    });

    container.innerHTML = html;

}

function agregarCarrito(codigo){

    const producto =
    productos.find(
      p => p.CODIGO == codigo
    );

    const existente =
    carrito.find(
      p => p.CODIGO == codigo
    );

    if(existente){

        existente.cantidad++;

    }else{

        carrito.push({
            ...producto,
            cantidad:1
        });

    }

    guardarCarrito();

}
function guardarCarrito(){

    localStorage.setItem(
      "carrito",
      JSON.stringify(carrito)
    );

    actualizarContador();

}
function cambiarCantidad(codigo,cambio){

    const item =
    carrito.find(
      p => p.CODIGO == codigo
    );

    if(!item) return;

    item.cantidad += cambio;

    if(item.cantidad <= 0){

        carrito =
        carrito.filter(
          p => p.CODIGO != codigo
        );

    }

    guardarCarrito();

    abrirCarrito();

}

function eliminarProducto(codigo){

    carrito = carrito.filter(
      p => p.CODIGO != codigo
    );

    guardarCarrito();

    abrirCarrito();

}

function vaciarCarrito(){

    if(!confirm("¿Vaciar carrito?"))
        return;

    carrito = [];

    guardarCarrito();

    const modalElement =
    document.getElementById("cartModal");

    const modal =
    bootstrap.Modal.getInstance(modalElement);

    if(modal){
        modal.hide();
    }

}

function actualizarContador(){

    const cantidad =
    carrito.reduce(
      (acc,item)=>
      acc + item.cantidad,
      0
    );

    document.getElementById(
      "cart-count"
    ).innerText =
    cantidad;

}

function abrirCarrito(){

    let html = "";

    let total = 0;

    carrito.forEach(item=>{

        const subtotal =
        item.PRECIO * item.cantidad;

        total += subtotal;

html += `

<div class="border-bottom py-3">

    <div class="d-flex justify-content-between align-items-center">

        <strong>
        ${item.PRODUCTO}
        </strong>

        <button
        class="btn btn-sm btn-danger"
        onclick="eliminarProducto('${item.CODIGO}')">

        🗑

        </button>

    </div>

    <div class="mt-2">

        <button
        class="btn btn-sm btn-outline-secondary"
        onclick="cambiarCantidad('${item.CODIGO}',-1)">
        -
        </button>

        <span class="mx-2">
        ${item.cantidad}
        </span>

        <button
        class="btn btn-sm btn-outline-secondary"
        onclick="cambiarCantidad('${item.CODIGO}',1)">
        +
        </button>

    </div>

    <div class="mt-2">

        $${subtotal.toLocaleString('es-AR')}

    </div>

</div>

`;
    });

    html += `

    <button
    class="btn btn-danger w-100 mt-3"
    onclick="vaciarCarrito()">

    Vaciar carrito

    </button>

    `;

    document.getElementById(
      "cart-items"
    ).innerHTML = html;

    document.getElementById(
      "cart-total"
    ).innerText =
    total.toLocaleString('es-AR');

   const modalElement =
document.getElementById("cartModal");

let modal =
bootstrap.Modal.getInstance(modalElement);

if(!modal){
    modal = new bootstrap.Modal(modalElement);
}

modal.show();

}

async function checkoutWhatsapp(){

    const nombre =
    document.getElementById("clienteNombre").value;

    const empresa =
    document.getElementById("clienteEmpresa").value;

    const direccion =
    document.getElementById("clienteDireccion").value;

    const telefono =
    document.getElementById("clienteTelefono").value;

    const dni =
    document.getElementById("clienteDni").value;

    if(nombre === "" ||direccion === "" ||telefono === "" ||dni === ""){
        alert("Complete Nombre, Dirección y DNI");
        return;
    }

    let total = 0;

    carrito.forEach(item=>{
        total += item.PRECIO * item.cantidad;
    });

    const url =
    API_URL +
    "?action=guardarPedido" +
    "&nombre=" + encodeURIComponent(nombre) +
    "&empresa=" + encodeURIComponent(empresa) +
    "&direccion=" + encodeURIComponent(direccion) +
    "&telefono=" + encodeURIComponent(telefono) +
    "&dni=" + encodeURIComponent(dni) +
    "&total=" + total +
    "&carrito=" + encodeURIComponent(
      JSON.stringify(carrito)
    );

    try {

        const response = await fetch(url);

        const resultado =
        await response.json();

        if(!resultado.success){
            alert("No se pudo guardar el pedido");
            return;
        }
alert(
`✅ Pedido registrado

Pedido: ${resultado.pedidoId}

Total: $${total.toLocaleString('es-AR')}

Se abrirá el PDF en una nueva pestaña.`
);

window.open(
  resultado.pdfUrl,
  "_blank"
);
        let mensaje = `*PEDIDO JIREH MAYORISTA*

🧾 Pedido: ${resultado.pedidoId}

👤 Cliente: ${nombre}
🏢 Empresa: ${empresa}
🏠 Dirección: ${direccion}
📱 Teléfono: ${telefono}
🆔 DNI: ${dni}

`;

carrito.forEach(item => {

    const subtotal =
    item.PRECIO * item.cantidad;

    mensaje += `
• ${item.PRODUCTO}
Cantidad: ${item.cantidad}
Subtotal: $${subtotal.toLocaleString('es-AR')}

`;

});

mensaje += `
💰 TOTAL: $${total.toLocaleString('es-AR')}

📄 PDF DEL PEDIDO:
${resultado.pdfUrl}
`;

window.open(
`https://wa.me/5491140975795?text=${encodeURIComponent(mensaje)}`,
"_blank"
);

} catch(error){

    console.error(error);

    alert(
      "Error al registrar el pedido"
    );

}

}
function cargarCategorias(){

    const select =
    document.getElementById(
      "categorias"
    );

    const categorias =
    [...new Set(
      productos.map(
        p=>p.CATEGORIA
      )
    )];

    categorias.forEach(cat=>{

        select.innerHTML +=

`<option value="${cat}">
${cat}
</option>`;

    });

}

function filtrarCategoria(){

    const categoria =
    document.getElementById(
      "categorias"
    ).value;

    if(categoria===""){

        mostrarProductos(productos);

        return;

    }

    const filtrados =
    productos.filter(
      p =>
      p.CATEGORIA === categoria
    );

    mostrarProductos(
      filtrados
    );

}

function buscarProductos(){

    const texto =
    document
    .getElementById(
      "search"
    )
    .value
    .toLowerCase();

    const resultado =
    productos.filter(p=>

        p.PRODUCTO
        .toLowerCase()
        .includes(texto)

    );

    mostrarProductos(
      resultado
    );

}
