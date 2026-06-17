if(sessionStorage.getItem("admin") !== "true"){

    window.location.href = "login.html";

}
const API_URL =
"https://script.google.com/macros/s/AKfycbw1eY_mXImG503rU0Cqddx1WBuGIOhxaW_SXGoIMsug_CjsSC-HLsb2XzYwrovaGBU/exec";

document.addEventListener(
"DOMContentLoaded",
() => {
cargarPedidos();
}
);

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
  console.error("No llegaron pedidos");
  return;
}

data.pedidos.forEach(p=>{

  if(p.ESTADO === "NUEVO"){
    nuevos++;
  }

  const fecha =
  new Date(p.FECHA);

  if(fecha.toDateString() === hoy){
    ventasHoy += Number(p.TOTAL || 0);
  }

  if(fecha.getMonth() === mesActual){
    ventasMes += Number(p.TOTAL || 0);
  }

  const colorEstado =
  p.ESTADO === "NUEVO"
  ? "table-warning"
  : "";

  html += `
  <tr class="${colorEstado}">

    <td>${p.PEDIDO_ID || ""}</td>

    <td>
    ${new Date(p.FECHA)
    .toLocaleString("es-AR")}
    </td>

    <td>${p.NOMBRE || ""}</td>

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
function logout(){

    sessionStorage.removeItem("admin");

    window.location.href = "login.html";

}
