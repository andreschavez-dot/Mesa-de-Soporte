/**
 * Main.gs — Punto de entrada de la web app (formulario público de vendedores).
 * Los datos iniciales (catálogos, límites) se inyectan en la plantilla para
 * ahorrar un round-trip de google.script.run al cargar la página.
 */
function doGet() {
  const tpl = HtmlService.createTemplateFromFile('Registro');
  tpl.bootstrapJson = jsonParaScript_(bootstrapRegistro_());
  return tpl.evaluate()
    .setTitle('Reportar caso · Mesa de Soporte de Direcciones')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    // DEFAULT = no embebible en otros sitios (anti-clickjacking).
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Serializa a JSON seguro para incrustar dentro de <script>: escapa "<" para que
 * un valor de catálogo como "</script><script>..." no rompa la página (XSS).
 */
function jsonParaScript_(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function bootstrapRegistro_() {
  return {
    catalogos: getCatalogos_(),
    limites: {
      maxArchivos: APP.MAX_ARCHIVOS,
      maxBytesArchivo: APP.MAX_BYTES_ARCHIVO,
      mimes: APP.MIME_PERMITIDOS,
      maxDescripcion: APP.MAX_DESCRIPCION
    }
  };
}
