/**
 * Main.js — Punto de entrada de la web app (formulario público de vendedores).
 *
 * Registro.html es el formulario de referencia de la Mesa tal cual: carga sus
 * datos con google.script.run.obtenerDatosIniciales() y envía con
 * registrarCaso(datos). Por eso se sirve como HTML estático (sin scriptlets).
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Registro')
    .setTitle('Registro de casos - Mesa de Soporte de Direcciones')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    // DEFAULT = no embebible en otros sitios (anti-clickjacking).
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
