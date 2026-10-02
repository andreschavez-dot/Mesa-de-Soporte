/**
 * Repo.gs — Capa de acceso a datos sobre Google Sheets.
 *
 * Aísla al resto del código de los detalles de la hoja (índices de columnas,
 * filas, formatos). Si mañana migran a Cloud SQL / Firestore, se reemplaza
 * este archivo y la lógica de negocio queda intacta.
 */

const _memo = {}; // caché por ejecución (cada llamada a google.script.run es una ejecución nueva)

function ss_() {
  return _memo.ss || (_memo.ss = SpreadsheetApp.getActive());
}

function hoja_(nombre) {
  const sh = ss_().getSheetByName(nombre);
  if (!sh) throw new Error(`Falta la hoja "${nombre}". Ejecuta MSD > Inicializar estructura.`);
  return sh;
}

/** { 'ID Caso': 0, 'Fecha registro': 1, ... } leyendo la fila de encabezados. */
function mapaColumnas_(sh) {
  const k = 'cols_' + sh.getName();
  if (_memo[k]) return _memo[k];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const mapa = {};
  headers.forEach((h, i) => { mapa[String(h).trim()] = i; });
  return (_memo[k] = mapa);
}

function objetoAFila_(sh, columnas, obj) {
  const mapa = mapaColumnas_(sh);
  const fila = new Array(Object.keys(mapa).length).fill('');
  columnas.forEach(c => {
    if (!(c.header in mapa)) throw new Error(`Columna faltante en ${sh.getName()}: ${c.header}`);
    const v = obj[c.key];
    fila[mapa[c.header]] = v === undefined || v === null ? '' : celdaSegura_(v);
  });
  return fila;
}

function filaAObjeto_(sh, columnas, fila) {
  const mapa = mapaColumnas_(sh);
  const obj = {};
  columnas.forEach(c => { obj[c.key] = c.header in mapa ? fila[mapa[c.header]] : ''; });
  return obj;
}

/* --------------------------------- Casos -------------------------------- */

function insertarCaso_(caso) {
  const sh = hoja_(HOJAS.CASOS);
  sh.appendRow(objetoAFila_(sh, COLUMNAS_CASOS, caso));
}

/** Busca la fila por ID con TextFinder (no carga toda la hoja en memoria). */
function filaDeCaso_(id) {
  const sh = hoja_(HOJAS.CASOS);
  const col = mapaColumnas_(sh)['ID Caso'] + 1;
  const celda = sh.getRange(2, col, Math.max(sh.getLastRow() - 1, 1), 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  return celda ? celda.getRow() : 0;
}

function leerCaso_(id) {
  const fila = filaDeCaso_(id);
  if (!fila) throw new AppError(`No existe el caso ${id}.`, 'NO_ENCONTRADO');
  const sh = hoja_(HOJAS.CASOS);
  const valores = sh.getRange(fila, 1, 1, sh.getLastColumn()).getValues()[0];
  const caso = filaAObjeto_(sh, COLUMNAS_CASOS, valores);
  caso._fila = fila;
  return caso;
}

/** Actualiza solo las celdas que cambian (menos escrituras = menos cuota). */
function actualizarCaso_(fila, cambios) {
  const sh = hoja_(HOJAS.CASOS);
  const mapa = mapaColumnas_(sh);
  COLUMNAS_CASOS.forEach(c => {
    if (c.key in cambios) {
      sh.getRange(fila, mapa[c.header] + 1).setValue(celdaSegura_(cambios[c.key]));
    }
  });
}

function leerCasoPorFila_(fila) {
  const sh = hoja_(HOJAS.CASOS);
  const caso = filaAObjeto_(sh, COLUMNAS_CASOS, sh.getRange(fila, 1, 1, sh.getLastColumn()).getValues()[0]);
  caso._fila = fila;
  return caso;
}

/* ------------------------------- Historial ------------------------------ */

function registrarHistorial_(evento) {
  const sh = hoja_(HOJAS.HISTORIAL);
  sh.appendRow(objetoAFila_(sh, COLUMNAS_HISTORIAL, Object.assign({ fecha: new Date() }, evento)));
}

/* --------------------------- Correlativo de IDs -------------------------- */

/**
 * Genera MSD-000001, MSD-000002… DEBE llamarse dentro de conLock_ para que
 * dos registros simultáneos no obtengan el mismo número.
 */
function siguienteId_() {
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty('ULTIMO_CORRELATIVO') || 0) + 1;
  props.setProperty('ULTIMO_CORRELATIVO', String(n));
  return APP.PREFIJO_ID + String(n).padStart(APP.DIGITOS_ID, '0');
}

/* ------------------------- Config y catálogos --------------------------- */

/** Config con caché de 5 min: evita leer la hoja en cada request. */
function getConfig_() {
  if (_memo.config) return _memo.config;
  const cache = CacheService.getScriptCache();
  const enCache = cache.get('config');
  if (enCache) return (_memo.config = JSON.parse(enCache));
  const cfg = Object.assign({}, CONFIG_DEFAULT);
  const valores = hoja_(HOJAS.CONFIG).getDataRange().getValues().slice(1);
  valores.forEach(([k, v]) => { if (k) cfg[String(k).trim()] = v; });
  cache.put('config', JSON.stringify(cfg), 300);
  return (_memo.config = cfg);
}

function getCatalogos_() {
  if (_memo.catalogos) return _memo.catalogos;
  const cache = CacheService.getScriptCache();
  const enCache = cache.get('catalogos');
  if (enCache) return (_memo.catalogos = JSON.parse(enCache));
  const cat = {};
  Object.keys(CATALOGOS_DEFAULT).forEach(k => { cat[k] = []; });
  const filas = hoja_(HOJAS.CATALOGOS).getDataRange().getValues().slice(1)
    .filter(([c, v, activo]) => c && v && String(activo).toUpperCase() !== 'NO')
    .sort((a, b) => Number(a[3] || 0) - Number(b[3] || 0));
  filas.forEach(([c, v]) => { (cat[c] = cat[c] || []).push(String(v)); });
  cache.put('catalogos', JSON.stringify(cat), 300);
  return (_memo.catalogos = cat);
}

/** Ubigeo para validar en servidor (mismo JSON que usa el cliente). */
function getUbigeo_() {
  if (_memo.ubigeo) return _memo.ubigeo;
  const html = HtmlService.createHtmlOutputFromFile('UbigeoData').getContent();
  const json = html.slice(html.indexOf('window.UBIGEO=') + 14, html.lastIndexOf(';'));
  return (_memo.ubigeo = JSON.parse(json));
}

function limpiarCacheConfig_() {
  CacheService.getScriptCache().removeAll(['config', 'catalogos']);
}
