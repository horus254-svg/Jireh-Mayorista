/* =====================================================================
   INFORMES DE ERROR (panel web y app de escritorio)
   - Guarda en memoria los últimos errores de la página (errores de
     JavaScript, promesas rechazadas, console.error y llamadas al
     servidor que fallaron), para adjuntarlos al informe.
   - "🐞 Informar un problema": la persona cuenta qué pasó y se manda
     por correo a soporte (backend: action=reportarError).
   - Los errores inesperados de JavaScript se avisan solos (agrupados;
     el backend también los agrupa y tiene tope diario).
   Se carga ANTES de admin.js para capturar también sus errores.
===================================================================== */
(function () {
  const MAX_REGISTRO = 30;
  const registro = [];            // { hora, tipo, mensaje, origen, pila }
  const yaAvisados = new Set();   // mensajes automáticos ya mandados en esta sesión
  let automaticosEnviados = 0;
  let pendienteAuto = null;

  const hora = () => new Date().toLocaleTimeString("es-AR", { hour12: false });
  const corto = (t, n) => { t = String(t == null ? "" : t); return t.length > n ? t.slice(0, n) + "…" : t; };

  // Ruido que no son fallas del sistema (extensiones del navegador, red caída, etc.)
  const RUIDO = /ResizeObserver loop|^Script error\.?$|AbortError|The user aborted|Failed to fetch|NetworkError|Load failed|Network request failed|signal is aborted|chrome-extension:|moz-extension:/i;

  function anotar(tipo, mensaje, origen, pila) {
    registro.push({ hora: hora(), tipo, mensaje: corto(mensaje, 600), origen: corto(origen, 200), pila: corto(pila, 1500) });
    if (registro.length > MAX_REGISTRO) registro.shift();
  }

  function programarAutomatico(mensaje, origen, pila) {
    if (RUIDO.test(mensaje) || RUIDO.test(origen || "")) return;
    const clave = String(mensaje).slice(0, 160);
    if (yaAvisados.has(clave) || automaticosEnviados >= 5) return;
    yaAvisados.add(clave);
    // Se espera un poco: si salen varios errores juntos, van en un solo informe.
    if (pendienteAuto) { pendienteAuto.extra++; return; }
    pendienteAuto = { titulo: clave, extra: 0 };
    setTimeout(() => {
      const p = pendienteAuto; pendienteAuto = null;
      automaticosEnviados++;
      enviarAlServidor({
        automatico: true,
        titulo: p.titulo + (p.extra ? ` (+${p.extra} más)` : ""),
        descripcion: "Error inesperado en el panel (aviso automático).",
        contexto: datosDelEquipo(),
        errores: registro.slice(-12)
      }).catch(() => {});
    }, 4000);
  }

  window.addEventListener("error", (e) => {
    // Errores de carga de imágenes/recursos: no son de código
    if (!e || (e.target && e.target !== window && !e.error)) return;
    const msg = e.message || (e.error && e.error.message) || "Error";
    const origen = (e.filename ? e.filename.split("/").pop() : "") + (e.lineno ? ":" + e.lineno + ":" + (e.colno || 0) : "");
    const pila = e.error && e.error.stack || "";
    anotar("error", msg, origen, pila);
    programarAutomatico(msg, origen, pila);
  }, true);

  window.addEventListener("unhandledrejection", (e) => {
    const r = e && e.reason;
    const msg = (r && (r.message || r.toString && r.toString())) || "Promesa rechazada";
    anotar("promesa", msg, "", r && r.stack || "");
    programarAutomatico(msg, "", r && r.stack || "");
  });

  // console.error: solo se anota (el sistema lo usa también para avisos esperados)
  const errorOriginal = console.error.bind(console);
  console.error = function (...args) {
    try {
      anotar("console", args.map(a => a instanceof Error ? (a.message + (a.stack ? "\n" + a.stack : "")) : (typeof a === "object" ? (() => { try { return JSON.stringify(a); } catch (x) { return String(a); } })() : String(a))).join(" "), "", "");
    } catch (x) {}
    return errorOriginal(...args);
  };

  /** Lo que se adjunta del equipo (nada de contraseñas ni datos de clientes). */
  function datosDelEquipo() {
    const seccionVisible = [...document.querySelectorAll(".seccion")].find(s => s.style.display === "block");
    const enApp = !!(window.veekpos || window.posOffline);
    let estilo = "";
    try { estilo = localStorage.getItem("veekEstiloPanel") || ""; } catch (e) {}
    return {
      seccion: seccionVisible ? seccionVisible.id : "",
      app: enApp ? "App de escritorio" + (window.__versionAppVeek ? " " + window.__versionAppVeek : "") : "Panel web",
      navegador: navigator.userAgent,
      pantalla: `${window.innerWidth}×${window.innerHeight} (x${window.devicePixelRatio || 1})`,
      conexion: navigator.onLine ? "con internet" : "SIN internet",
      rol: (() => { try { return sessionStorage.getItem("rol") || ""; } catch (e) { return ""; } })(),
      estiloPanel: estilo,
      pagina: location.pathname.split("/").pop() || "index.html",
      servidor: (() => { try { return new URL(API_URL).host; } catch (e) { return ""; } })()
    };
  }

  async function enviarAlServidor(cuerpo) {
    if (typeof API_URL === "undefined" || !API_URL) throw new Error("El panel todavía no está conectado al servidor.");
    const f = typeof fetchAPI === "function" ? fetchAPI : (u, o) => fetch(u, o);
    const res = await f(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: "reportarError" }, cuerpo))
    }, { timeoutMs: 30000 });
    return res.json();
  }

  /* ---------- Ventana "Informar un problema" ---------- */
  function abrirInformeProblema() {
    const fondo = document.getElementById("informeModalBackdrop");
    if (!fondo) return;
    const desc = document.getElementById("informeDescripcion");
    const contacto = document.getElementById("informeContacto");
    const estado = document.getElementById("informeEstado");
    desc.value = "";
    try { contacto.value = localStorage.getItem("vpos_informe_contacto") || ""; } catch (e) {}
    estado.textContent = ""; estado.className = "informe-estado";
    document.getElementById("informeIncluirDatos").checked = true;
    const n = registro.length;
    document.getElementById("informeResumenDatos").textContent =
      `Sección, versión, navegador y tamaño de pantalla` + (n ? ` · ${n} error${n === 1 ? "" : "es"} registrado${n === 1 ? "" : "s"} en esta sesión` : " · sin errores registrados en esta sesión");
    document.getElementById("informeDetalleDatos").textContent = JSON.stringify({ equipo: datosDelEquipo(), errores: registro.slice(-12) }, null, 2);
    document.getElementById("btnEnviarInforme").disabled = false;
    fondo.classList.add("show");
    setTimeout(() => desc.focus(), 80);
  }

  function cerrarInformeProblema() {
    document.getElementById("informeModalBackdrop")?.classList.remove("show");
  }

  async function enviarInformeProblema() {
    const desc = document.getElementById("informeDescripcion").value.trim();
    const contacto = document.getElementById("informeContacto").value.trim();
    const incluir = document.getElementById("informeIncluirDatos").checked;
    const estado = document.getElementById("informeEstado");
    const btn = document.getElementById("btnEnviarInforme");
    if (desc.length < 5) {
      estado.textContent = "Contá en pocas palabras qué pasó (qué estabas haciendo y qué salió mal).";
      estado.className = "informe-estado error";
      document.getElementById("informeDescripcion").focus();
      return;
    }
    try { localStorage.setItem("vpos_informe_contacto", contacto); } catch (e) {}
    btn.disabled = true;
    estado.textContent = "Enviando…"; estado.className = "informe-estado";
    try {
      const r = await enviarAlServidor({
        descripcion: desc,
        contacto,
        contexto: incluir ? datosDelEquipo() : { seccion: datosDelEquipo().seccion },
        errores: incluir ? registro.slice(-20) : []
      });
      if (!r || !r.success) throw new Error((r && r.message) || "El servidor no pudo recibir el informe.");
      if (r.enviado === false && r.message) {
        estado.textContent = "⚠️ " + r.message;
        estado.className = "informe-estado aviso";
        btn.disabled = false;
        return;
      }
      cerrarInformeProblema();
      if (typeof toast === "function") toast("✅ Informe enviado a soporte. ¡Gracias!", "success");
    } catch (e) {
      estado.textContent = "No se pudo enviar: " + (e.message || "error de conexión") + ". Probá de nuevo en un rato.";
      estado.className = "informe-estado error";
      btn.disabled = false;
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("informeModalBackdrop")?.classList.contains("show")) {
      e.preventDefault(); cerrarInformeProblema();
    }
  });

  // Versión de la app de escritorio (para el informe)
  try {
    if (window.veekpos && typeof window.veekpos.versionApp === "function") {
      window.veekpos.versionApp().then(v => { window.__versionAppVeek = v; }).catch(() => {});
    }
  } catch (e) {}

  window.abrirInformeProblema = abrirInformeProblema;
  window.cerrarInformeProblema = cerrarInformeProblema;
  window.enviarInformeProblema = enviarInformeProblema;
  window.anotarErrorParaInforme = anotar; // lo usa fetchAPI para anotar llamadas fallidas
})();
