/*
 * Service Worker mínimo, necesario únicamente para que Chrome en
 * Android trate lector.html como una app instalable de verdad (con
 * pantalla completa, sin barra de navegador) en vez de un simple
 * acceso directo. No implementa ninguna estrategia de caché — la
 * página ya funciona sin internet por sí sola (no depende de ningún
 * backend para escanear), así que no hace falta cachear nada extra.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

// Chrome exige que el fetch handler no esté vacío para contar como
// "real" — simplemente deja pasar cada pedido tal cual, sin cachear.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
