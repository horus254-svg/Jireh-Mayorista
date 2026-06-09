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

    productos =
    data.productos;

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

        <div class="card-product">

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

    carrito.push(producto);

    guardarCarrito();

}

function guardarCarrito(){

    localStorage.setItem(
      "carrito",
      JSON.stringify(carrito)
    );

    actualizarContador();

}

function actualizarContador(){

    document.getElementById(
      "cart-count"
    ).innerText =
    carrito.length;

}

function abrirCarrito(){

    let html = "";

    let total = 0;

    carrito.forEach(item=>{

        total +=
        Number(item.PRECIO);

        html += `

        <div class="border-bottom mb-2">

            ${item.PRODUCTO}

            - $

            ${Number(item.PRECIO).toLocaleString('es-AR')}

        </div>

        `;

    });

    document.getElementById(
      "cart-items"
    ).innerHTML = html;

    document.getElementById(
      "cart-total"
    ).innerText =
    total.toLocaleString('es-AR');

    new bootstrap.Modal(
      document.getElementById(
        "cartModal"
      )
    ).show();

}

function checkoutWhatsapp(){

    let mensaje =
`*Pedido Jireh Mayorista*%0A%0A`;

    let total = 0;

    carrito.forEach(item=>{

        total +=
        Number(item.PRECIO);

        mensaje +=

`${item.PRODUCTO}
- $${item.PRECIO}%0A`;

    });

    mensaje +=

`%0A*TOTAL:* $${total}`;

    window.open(

`https://wa.me/5491140975795?text=${mensaje}`,

"_blank"

    );

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