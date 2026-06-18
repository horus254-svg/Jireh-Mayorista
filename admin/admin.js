const API_URL =
"https://script.google.com/macros/s/AKfycbw1eY_mXImG503rU0Cqddx1WBuGIOhxaW_SXGoIMsug_CjsSC-HLsb2XzYwrovaGBU/exec";

if (sessionStorage.getItem("admin") !== "true") {
window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", async () => {

mostrarSeccion("dashboard");

await cargarMetricas();

setInterval(cargarMetricas, 5000);

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

    let html = "";

    if (!data.pedidos) {
        return;
    }

    data.pedidos.forEach(p => {

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

    mostrarSeccion("productos");

    const response =
        await fetch(API_URL + "?action=productos");

    const data =
        await response.json();

    let html = "";

    data.productos
    .filter(p => Number(p.STOCK || 0) < 5)
    .forEach(p => {

        html += `
        <tr>
            <td>${p.CODIGO}</td>
            <td>${p.PRODUCTO}</td>
            <td>$${Number(p.PRECIO || 0).toLocaleString("es-AR")}</td>
            <td>
                Stock: ${p.STOCK}
            </td>
        </tr>
        `;

    });

    document.getElementById(
        "tablaProductos"
    ).innerHTML = html;

}
async function cargarAgotados() {

    mostrarSeccion("productos");

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
            <td>${p.CODIGO}</td>
            <td>${p.PRODUCTO}</td>
            <td>$${Number(p.PRECIO || 0).toLocaleString("es-AR")}</td>
            <td>
                AGOTADO
            </td>
        </tr>
        `;

    });

    document.getElementById(
        "tablaProductos"
    ).innerHTML = html;

}
