const API_URL =
"https://script.google.com/macros/s/AKfycbw1eY_mXImG503rU0Cqddx1WBuGIOhxaW_SXGoIMsug_CjsSC-HLsb2XzYwrovaGBU/exec";

cargarPedidos();

async function cargarPedidos(){

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

  data.pedidos.forEach(p=>{

    if(p.ESTADO==="NUEVO")
      nuevos++;

    const fecha =
    new Date(p.FECHA);

    if(fecha.toDateString()===hoy)
      ventasHoy += Number(p.TOTAL);

    if(fecha.getMonth()===mesActual)
      ventasMes += Number(p.TOTAL);

    html += `
    <tr>
      <td>${p.PEDIDO_ID}</td>
      <td>${p.FECHA}</td>
      <td>${p.NOMBRE}</td>
      <td>$${Number(p.TOTAL).toLocaleString('es-AR')}</td>
      <td>${p.ESTADO}</td>
      <td>
        <a href="${p.PDF_URL}" target="_blank">
        Ver PDF
        </a>
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
  "$" + ventasHoy.toLocaleString('es-AR');

  document.getElementById(
    "ventasMes"
  ).innerText =
  "$" + ventasMes.toLocaleString('es-AR');
}