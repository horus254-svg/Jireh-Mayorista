/**
 * CONFIGURACIÓN DEL NEGOCIO
 * ---------------------------------------------------------
 * Este es el ÚNICO archivo que hay que editar al instalar
 * el sistema para un cliente nuevo. Todas las páginas
 * (index.html, login.html, stock.html, precio.html, lector.html)
 * leen estos valores en vez de tenerlos escritos adentro.
 *
 * Pasos para un cliente nuevo:
 *  1. Reemplazá API_URL con la URL del Google Apps Script del cliente.
 *  2. Reemplazá NOMBRE_NEGOCIO con el nombre que se muestra en pantalla.
 *  3. (Opcional) Cambiá TEMA si querés un color por defecto distinto
 *     mientras carga la configuración remota.
 * ---------------------------------------------------------
 */

const CONFIG_NEGOCIO = {
  API_URL: "https://script.google.com/macros/s/AKfycbw1eY_mXImG503rU0Cqddx1WBuGIOhxaW_SXGoIMsug_CjsSC-HLsb2XzYwrovaGBU/exec",
  NOMBRE_NEGOCIO: "JIREH MAYORISTA",
  NOMBRE_CORTO: "JIREH",
  TEMA: "azul", // azul | verde | rojo (tema por defecto, se puede sobreescribir desde el panel)

  // ---- Usados en la tienda (index.html del catálogo) ----
  URL_SITIO: "https://horus254-svg.github.io/Jireh-Mayorista/",
  WHATSAPP_NUMERO: "5491140975795", // solo números, con código de país, sin +
  WHATSAPP_ICONO_URL: "https://cdn-icons-png.flaticon.com/512/733/733585.png", // ícono del botón flotante de WhatsApp
  ICONO_URL: "icon-512.png", // usado como imagen al compartir en WhatsApp/Facebook (og:image) y en X/Twitter (twitter:image)

  SEO_TITULO: "Jireh Mayorista — Juguetes y Artículos Mayoristas | Envíos a todo el país",
  SEO_DESCRIPCION: "Catálogo mayorista de juguetes y artículos al por mayor. Comprá online con envíos a todo el país. Precios mayoristas, grandes cantidades y variedad de productos.",
  SEO_KEYWORDS: "juguetes mayoristas, mayorista juguetes, juguetes al por mayor, compra mayorista, artículos mayoristas, juguetes baratos, mayorista argentina, envíos todo el país",

  HERO_TITULO: "Mayorista Jireh",
  HERO_SUBTITULO: "Catálogo Mayorista Online",

  FOOTER_TITULO_1: "Jireh Mayorista",
  FOOTER_TEXTO_1: "Venta mayorista de juguetes y artículos al por mayor. Somos distribuidores con envíos a todo el país. Precios mayoristas, grandes cantidades y amplia variedad de productos para revendedores y comercios.",
  FOOTER_TEXTO_2: "Juguetes mayoristas · Artículos infantiles · Muñecos y peluches · Juegos de mesa · Juguetes educativos · Artículos de temporada · Productos para reventa",
  FOOTER_TEXTO_3: "Realizamos envíos a todo el país. Los pedidos se hacen directamente desde este catálogo online. Consultas y atención por WhatsApp. Pagos en efectivo, transferencia y tarjeta.",
  FOOTER_COPYRIGHT: "© 2026 Jireh Mayorista — Venta mayorista de juguetes · Argentina"
};

/**
 * Aplica automáticamente los datos de arriba al <title>, meta tags,
 * Open Graph, Twitter Card y JSON-LD (schema.org) de la página.
 * Se ejecuta apenas carga este script, así que hay que incluirlo
 * en el <head>, después de los tags de SEO originales.
 */
(function aplicarConfigSEO(){
  const c = CONFIG_NEGOCIO;

  function setMeta(selector, attr, valor){
    const el = document.querySelector(selector);
    if(el && valor) el.setAttribute(attr, valor);
  }

  document.title = c.SEO_TITULO;
  setMeta('meta[name="description"]', "content", c.SEO_DESCRIPCION);
  setMeta('meta[name="keywords"]', "content", c.SEO_KEYWORDS);
  setMeta('meta[name="author"]', "content", c.NOMBRE_NEGOCIO);
  setMeta('link[rel="canonical"]', "href", c.URL_SITIO);

  setMeta('meta[property="og:url"]', "content", c.URL_SITIO);
  setMeta('meta[property="og:title"]', "content", c.SEO_TITULO);
  setMeta('meta[property="og:description"]', "content", c.SEO_DESCRIPCION);
  setMeta('meta[property="og:image"]', "content", c.URL_SITIO.replace(/\/$/, "") + "/" + c.ICONO_URL);
  setMeta('meta[property="og:site_name"]', "content", c.NOMBRE_NEGOCIO);

  setMeta('meta[name="twitter:title"]', "content", c.SEO_TITULO);
  setMeta('meta[name="twitter:description"]', "content", c.SEO_DESCRIPCION);
  setMeta('meta[name="twitter:image"]', "content", c.URL_SITIO.replace(/\/$/, "") + "/" + c.ICONO_URL);

  const schemaEl = document.querySelector('script[type="application/ld+json"]');
  if(schemaEl){
    try{
      const schema = JSON.parse(schemaEl.textContent);
      schema.name = c.NOMBRE_NEGOCIO;
      schema.url = c.URL_SITIO;
      schema.logo = c.URL_SITIO.replace(/\/$/, "") + "/" + c.ICONO_URL;
      schema.image = schema.logo;
      schemaEl.textContent = JSON.stringify(schema, null, 2);
    }catch(e){ /* si el JSON-LD tiene otro formato, se deja como está */ }
  }
})();
