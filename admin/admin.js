if(sessionStorage.getItem("admin") !== "true"){

window.location.href = "login.html";

}

const API_URL =
"https://script.google.com/macros/s/AKfycbw1eY_mXImG503rU0Cqddx1WBuGIOhxaW_SXGoIMsug_CjsSC-HLsb2XzYwrovaGBU/exec";
async function cargarMetricas(){

  try{

    const response =
      await fetch(
        API_URL + "?action=metricas"
      );

    const data =
      await response.json();

    document.getElementById(
      "pedidosNuevos"
    ).textContent =
      data.pedidosNuevos;

    document.getElementById(
      "ventasHoy"
    ).textContent =
      "$" + data.ventasHoy.toLocaleString();

    document.getElementById(
      "ventasMes"
    ).textContent =
      "$" + data.ventasMes.toLocaleString();

    document.getElementById(
      "productosActivos"
    ).textContent =
      data.productosActivos;

    document.getElementById(
      "stockBajo"
    ).textContent =
      data.stockBajo;

    document.getElementById(
      "agotados"
    ).textContent =
      data.agotados;
    
    document.getElementById(
  "clientesUnicos"
).textContent =
  data.clientesUnicos;

    document.getElementById(
      "totalPedidos"
    ).textContent =
      data.totalPedidos;

    document.getElementById(
      "ticketPromedio"
    ).textContent =
      "$" +
      Math.round(
        data.ticketPromedio
      ).toLocaleString();

  }catch(error){

    console.error(
      "Error cargando métricas:",
      error
    );

  }

}

document.addEventListener(
"DOMContentLoaded",
async () => {

mostrarSeccion("dashboard");

await cargarMetricas();

}
);

function mostrarSeccion(id){

document
.querySelectorAll(".seccion")
.forEach(s => {
s.style.display = "none";
});

const seccion =
document.getElementById(id);

if(seccion){
seccion.style.display = "block";
}

if(id === "pedidos"){
cargarPedidos();
}

if(id === "productos"){
cargarProductos();
}

}

async function cargarPedidos(){

try{

const res =
await fetch(
API_URL + "?action=pedidos"
);

const data =
await res.json();

let html = "";

let nuevos = 0;
let ventasHoy = 0;
let ventasMes = 0;

const hoy =
new Date().toDateString();

const mesActual =
new Date().getMonth();

if(!data.pedidos){
return;
}

data.pedidos.forEach(p=>{

if(p.ESTADO === "NUEVO"){
nuevos++;
}

const fecha =
new Date(p.FECHA);

if(fecha.toDateString() === hoy){
ventasHoy += Number(
p.TOTAL || 0
);
}

if(fecha.getMonth() === mesActual){
ventasMes += Number(
p.TOTAL || 0
);
}

const colorEstado =
p.ESTADO === "NUEVO"
? "table-warning"
: "";

html += `

<tr class="${colorEstado}">

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

<td>

<select
class="form-select form-select-sm"
onchange="
cambiarEstado(
'${p.PEDIDO_ID}',
this.value
)">

<option
value="NUEVO"
${p.ESTADO==="NUEVO"?"selected":""}>
NUEVO
</option>

<option
value="PREPARANDO"
${p.ESTADO==="PREPARANDO"?"selected":""}>
PREPARANDO
</option>

<option
value="ENVIADO"
${p.ESTADO==="ENVIADO"?"selected":""}>
ENVIADO
</option>

<option
value="ENTREGADO"
${p.ESTADO==="ENTREGADO"?"selected":""}>
ENTREGADO
</option>

<option
value="CANCELADO"
${p.ESTADO==="CANCELADO"?"selected":""}>
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
class="btn btn-sm btn-primary">
PDF </a>`
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

document.getElementById(
"pedidosNuevos"
).innerText = nuevos;

document.getElementById(
"ventasHoy"
).innerText =
"$" +
ventasHoy.toLocaleString("es-AR");

document.getElementById(
"ventasMes"
).innerText =
"$" +
ventasMes.toLocaleString("es-AR");

}
catch(error){

console.error(
"Error cargando pedidos:",
error
);

}

}

async function cambiarEstado(
pedidoId,
estado
){

try{

const res =
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
await res.json();

if(!data.success){

alert(
"No se pudo actualizar el estado"
);

return;

}

console.log(
"Estado actualizado"
);

}
catch(error){

console.error(
"Error actualizando estado:",
error
);

alert(
"Error de conexión"
);

}

}

async function cargarProductos(){

try{

const res =
await fetch(
API_URL + "?action=productos"
);

const data =
await res.json();

let html = "";

data.productos.forEach(p => {

html += `

<tr>

<td>${p.CODIGO || ""}</td>

<td>${p.PRODUCTO || ""}</td>

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
catch(error){

console.error(
"Error cargando productos:",
error
);

}

}

function nuevoProducto(){

alert(
"Próximo paso: formulario alta producto"
);

}

function editarProducto(codigo){

alert(
"Editar producto: " + codigo
);

}

function eliminarProducto(codigo){

if(
!confirm(
"¿Eliminar producto?"
)
){
return;
}

alert(
"Eliminar producto: " + codigo
);

}

function logout(){

sessionStorage.removeItem("admin");

window.location.href =
"login.html";

}
