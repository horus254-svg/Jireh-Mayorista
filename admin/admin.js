const API_URL =
"https://script.google.com/macros/s/AKfycbw1eY_mXImG503rU0Cqddx1WBuGIOhxaW_SXGoIMsug_CjsSC-HLsb2XzYwrovaGBU/exec";

let pedidosGlobal = [];

if (sessionStorage.getItem("admin") !== "true") {
window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", async () => {

  mostrarSeccion("dashboard");

  await cargarMetricas();

  setInterval(() => {

    cargarMetricas();

    if(document.getElementById("pedidos").style.display === "block"){
      cargarPedidos();
    }

    if(document.getElementById("clientes").style.display === "block"){
      cargarClientes();
    }

  }, 5000);

});

function escapeHtml(text) {

const div = document.createElement("div");

div.textContent = text || "";

return div.innerHTML;

}

function actualizarElemento(id, valor) {

const el = document.getElementById(id);

if (el) {
    el.textContent = valor;
}

}

async function cargarMetricas() {

try {

    const response =
        await fetch(
            API_URL + "?action=metricas"
        );

    const data =
        await response.json();

    actualizarElemento(
        "pedidosNuevos",
        data.pedidosNuevos || 0
    );

    actualizarElemento(
        "ventasHoy",
        "$" +
        Number(
            data.ventasHoy || 0
        ).toLocaleString("es-AR")
    );

    actualizarElemento(
        "ventasMes",
        "$" +
        Number(
            data.ventasMes || 0
        ).toLocaleString("es-AR")
    );

    actualizarElemento(
        "productosActivos",
        data.productosActivos || 0
    );

    actualizarElemento(
        "stockBajo",
        data.stockBajo || 0
    );

    actualizarElemento(
        "agotados",
        data.agotados || 0
    );

    actualizarElemento(
        "clientesUnicos",
        data.clientesUnicos || 0
    );

    actualizarElemento(
        "TotalPedidos",
        data.totalPedidos || 0
    );

    actualizarElemento(
        "totalPedidos",
        data.totalPedidos || 0
    );

    actualizarElemento(
        "TicketPromedio",
        "$" +
        Math.round(
            data.ticketPromedio || 0
        ).toLocaleString("es-AR")
    );

    actualizarElemento(
        "ticketPromedio",
        "$" +
        Math.round(
            data.ticketPromedio || 0
        ).toLocaleString("es-AR")
    );

    actualizarElemento(
        "ventasTotales",
        "$" +
        Number(
            data.ventasMes || 0
        ).toLocaleString("es-AR")
    );

}
catch (error) {

    console.error(
        "Error métricas:",
        error
    );

}
}

function mostrarSeccion(id) {

document
    .querySelectorAll(".seccion")
    .forEach(sec => {
        sec.style.display = "none";
    });

const seccion =
    document.getElementById(id);

if (seccion) {
    seccion.style.display = "block";
}

if (id === "pedidos") {
    cargarPedidos();
}

if (id === "productos") {
    cargarProductos();
}

}

async function cargarPedidos() {

try {

    const response =
        await fetch(
            API_URL + "?action=pedidos"
        );

    const data =
        await response.json();
    pedidosGlobal = data.pedidos || [];

    let html = "";

    if (!data.pedidos) {
        return;
    }

   pedidosGlobal.forEach(p=>{

        const estadoColor =
            p.ESTADO === "NUEVO"
            ? "table-warning"
            : "";

        html += `
        <tr class="${estadoColor}">

            <td>${escapeHtml(p.PEDIDO_ID)}</td>

            <td>
                ${new Date(
                    p.FECHA
                ).toLocaleString("es-AR")}
            </td>

            <td>
                ${escapeHtml(p.CLIENTE)}
            </td>

            <td>
                $${Number(
                    p.TOTAL || 0
                ).toLocaleString("es-AR")}
            </td>

            <td>

                <select
                    class="form-select form-select-sm"
                    onchange="cambiarEstado('${p.PEDIDO_ID}',this.value)">

                    <option value="NUEVO" ${p.ESTADO==="NUEVO"?"selected":""}>
                        NUEVO
                    </option>

                    <option value="PREPARANDO" ${p.ESTADO==="PREPARANDO"?"selected":""}>
                        PREPARANDO
                    </option>

                    <option value="ENVIADO" ${p.ESTADO==="ENVIADO"?"selected":""}>
                        ENVIADO
                    </option>

                    <option value="ENTREGADO" ${p.ESTADO==="ENTREGADO"?"selected":""}>
                        ENTREGADO
                    </option>

                    <option value="CANCELADO" ${p.ESTADO==="CANCELADO"?"selected":""}>
                        CANCELADO
                    </option>

                </select>

            </td>

            <td>

                ${
                    p.PDF_URL
                    ?
                    `<a
                        href="${p.PDF_URL}"
                        target="_blank"
                        class="btn btn-primary btn-sm">
                        PDF
                    </a>`
                    :
                    "-"
                }

            </td>

        </tr>
        `;

    });

    document.getElementById(
        "tablaPedidos"
    ).innerHTML = html;

}
catch (error) {

    console.error(
        "Error pedidos:",
        error
    );

}

}

async function cambiarEstado(
pedidoId,
estado
) {

try {

    const response =
        await fetch(

            API_URL +

            "?action=actualizarEstado" +

            "&pedidoId=" +
            encodeURIComponent(
                pedidoId
            ) +

            "&estado=" +
            encodeURIComponent(
                estado
            )

        );

    const data =
        await response.json();

    if (!data.success) {

        alert(
            "No se pudo actualizar"
        );

        return;
    }

}
catch (error) {

    console.error(error);

    alert(
        "Error de conexión"
    );

}

}

async function cargarProductos() {

try {

    const response =
        await fetch(
            API_URL + "?action=productos"
        );

    const data =
        await response.json();

    let html = "";

    if (!data.productos) {
        return;
    }

    data.productos.forEach(p => {

        html += `
        <tr>

            <td>
                ${escapeHtml(p.CODIGO)}
            </td>

            <td>
                ${escapeHtml(p.PRODUCTO)}
            </td>

            <td>
                $${Number(
                    p.PRECIO || 0
                ).toLocaleString("es-AR")}
            </td>

            <td>

                <button
                    class="btn btn-primary btn-sm"
                    onclick="editarProducto('${p.CODIGO}')">

                    Editar

                </button>

                <button
                    class="btn btn-danger btn-sm ms-2"
                    onclick="eliminarProducto('${p.CODIGO}')">

                    Eliminar

                </button>

            </td>

        </tr>
        `;

    });

    document.getElementById(
        "tablaProductos"
    ).innerHTML = html;

}
catch (error) {

    console.error(
        "Error productos:",
        error
    );

}

}

function nuevoProducto() {

alert(
    "Debes crear la acción crearProducto en Apps Script."
);

}

function editarProducto(codigo) {

alert(
    "Editar producto: " + codigo
);

}

function eliminarProducto(codigo) {

if (
    !confirm(
        "¿Eliminar producto?"
    )
) {
    return;
}

alert(
    "Debes crear la acción eliminarProducto en Apps Script.\nCódigo: " + codigo
);

}

function logout() {

sessionStorage.removeItem(
    "admin"
);

window.location.href =
    "login.html";

}
async function cargarClientes(){

const response =
await fetch(
API_URL + "?action=clientes"
);

const data =
await response.json();

let html = "";

data.clientes.forEach(c => {

html += `
<tr>

<td>${c.CLIENTE}</td>
<td>${c.EMPRESA}</td>
<td>${c.DIRECCION}</td>
<td>${c.TELEFONO}</td>
<td>${c.DNI}</td>
<td>${c.PEDIDOS}</td>
<td>$${c.TOTAL.toLocaleString("es-AR")}</td>

</tr>
`;

});

document.getElementById(
"tablaClientes"
).innerHTML = html;

}
async function cargarClientes(){

try{

const response =
await fetch(
API_URL + "?action=clientes"
);

const data =
await response.json();

let html = "";

if(!data.clientes){
return;
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
<td>$${Number(c.TOTAL || 0).toLocaleString("es-AR")}</td>
</tr>
`;

});

document.getElementById(
"tablaClientes"
).innerHTML = html;

}
catch(error){

console.error(
"Error clientes:",
error
);

}

}
async function cargarStockBajo() {

    mostrarSeccion("stockBajoProductos");

    try {

        const response =
            await fetch(API_URL + "?action=productos");

        const data =
            await response.json();

        let html = "";

        data.productos
        .filter(p => {
            const stock = Number(p.STOCK || 0);
            return stock > 0 && stock <= 5;
        })
        .forEach(p => {

            html += `
            <tr>
                <td>${escapeHtml(p.CODIGO)}</td>
                <td>${escapeHtml(p.PRODUCTO)}</td>
                <td>${p.STOCK}</td>
            </tr>
            `;

        });

        document.getElementById(
            "tablaStockBajo"
        ).innerHTML = html;

    }
    catch(error){

        console.error(
            "Error stock bajo:",
            error
        );

    }

}

async function cargarAgotados() {

    mostrarSeccion("productosAgotados");

    try {

        const response =
            await fetch(API_URL + "?action=productos");

        const data =
            await response.json();

        let html = "";

        data.productos
        .filter(p => Number(p.STOCK || 0) === 0)
        .forEach(p => {

            html += `
            <tr>
                <td>${escapeHtml(p.CODIGO)}</td>
                <td>${escapeHtml(p.PRODUCTO)}</td>
                <td>0</td>
            </tr>
            `;

        });

        document.getElementById(
            "tablaAgotados"
        ).innerHTML = html;

    }
    catch(error){

        console.error(
            "Error agotados:",
            error
        );

    }

}
async function cargarMasVendidos(){

try{

const response =
await fetch(
API_URL + "?action=masVendidos"
);

const data =
await response.json();

let html = "";

data.productos.forEach(p => {

html += `
<tr>
<td>${p.CODIGO}</td>
<td>${p.PRODUCTO}</td>
<td>${p.VENDIDOS}</td>
</tr>
`;

});

document.getElementById(
"tablaMasVendidos"
).innerHTML = html;

}
catch(error){

console.error(
"Error más vendidos:",
error
);

}

}
function filtrarPedidos(){

  const texto =
    document.getElementById(
      "buscarPedido"
    ).value.toLowerCase();

  const filtrados =
    pedidosGlobal.filter(p => {

      return (
        String(p.PEDIDO_ID || "")
          .toLowerCase()
          .includes(texto)

        ||

        String(p.CLIENTE || "")
          .toLowerCase()
          .includes(texto)

        ||

        String(p.DNI || "")
          .toLowerCase()
          .includes(texto)
      );

    });

  renderPedidos(filtrados);

}

function renderPedidos(lista){

  let html = "";

  lista.forEach(p => {

    html += `
      <tr>

        <td>${p.PEDIDO_ID || ""}</td>

        <td>
          ${new Date(
            p.FECHA
          ).toLocaleString("es-AR")}
        </td>

        <td>${p.CLIENTE || ""}</td>

        <td>
          $${Number(
            p.TOTAL || 0
          ).toLocaleString("es-AR")}
        </td>

        <td>${p.ESTADO || ""}</td>

        <td>
          ${
            p.PDF_URL
            ?
            `<a href="${p.PDF_URL}"
               target="_blank"
               class="btn btn-primary btn-sm">
               PDF
             </a>`
            :
            "-"
          }
        </td>

      </tr>
    `;

  });

  document.getElementById(
    "tablaPedidos"
  ).innerHTML = html;

}
let ventaLocal = [];

function agregarProductoVenta(codigo){

  codigo = String(codigo).trim();

  const producto = productos.find(
    p => String(p.CODIGO).trim() === codigo
  );

  if(!producto){
    alert("Producto no encontrado");
    return;
  }

  const existente = ventaLocal.find(
    p => p.CODIGO === codigo
  );

  if(existente){

    existente.cantidad++;

  }else{

    ventaLocal.push({
      CODIGO: producto.CODIGO,
      PRODUCTO: producto.PRODUCTO,
      PRECIO: Number(producto.PRECIO),
      cantidad: 1
    });

  }

  renderVentaLocal();

}
function renderVentaLocal(){

  let html = "";
  let total = 0;

  ventaLocal.forEach(item => {

    const subtotal =
      item.PRECIO * item.cantidad;

    total += subtotal;

    html += `
      <tr>

        <td>${item.CODIGO}</td>

        <td>${item.PRODUCTO}</td>

        <td>${item.cantidad}</td>

        <td>
          $${item.PRECIO.toLocaleString("es-AR")}
        </td>

        <td>
          $${subtotal.toLocaleString("es-AR")}
        </td>

      </tr>
    `;

  });

  document.getElementById(
    "tablaVentaLocal"
  ).innerHTML = html;

  document.getElementById(
    "totalVentaLocal"
  ).innerText =
    "$" + total.toLocaleString("es-AR");

}
function buscarProductoPOS(){

  const texto =
    document.getElementById("buscarPOS")
    .value
    .trim();

  if(texto === ""){
    return;
  }

  agregarProductoVenta(texto);

  document.getElementById("buscarPOS")
    .value = "";

}
let productosPOS = [];
let ticketPOS = [];

async function buscarProductoPOS(){

  const input =
    document.getElementById("posBusqueda");

  if(!input){
    return;
  }

  const texto =
    input.value.toLowerCase().trim();

  if(texto.length < 2){

    document.getElementById(
      "resultadosPOS"
    ).innerHTML = "";

    return;
  }

  if(productosPOS.length === 0){

    const response =
      await fetch(
        API_URL + "?action=productos"
      );

    const data =
      await response.json();

    productosPOS =
      data.productos || [];
  }

  const resultados =
    productosPOS.filter(p =>

      String(p.CODIGO)
        .toLowerCase()
        .includes(texto)

      ||

      String(p.PRODUCTO)
        .toLowerCase()
        .includes(texto)

    ).slice(0,10);

  let html = "";

  resultados.forEach(p => {

    html += `
      <button
        class="btn btn-outline-primary m-1"
        onclick="agregarProductoPOS('${p.CODIGO}')">

        ${p.CODIGO} - ${p.PRODUCTO}

      </button>
    `;

  });

  document.getElementById(
    "resultadosPOS"
  ).innerHTML = html;

}
