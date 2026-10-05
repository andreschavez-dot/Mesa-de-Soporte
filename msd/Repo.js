/**
 * Repo.js — Capa de acceso a datos sobre Google Sheets.
 *
 * Aísla al resto del código de los detalles de la hoja (posiciones de columnas,
 * filas, formatos). Si mañana migran a otra base, se reemplaza este archivo.
 */

const _memo = {}; // caché por ejecución (cada llamada de google.script.run es una ejecución nueva)

/**
 * Abre el Spreadsheet por ID (guardado en Script Properties al inicializar).
 * Por qué no getActive(): en la web app no hay "documento activo" y, con el scope
 * spreadsheets.currentonly, Google devuelve "No cuentas con el permiso necesario
 * para acceder al documento". openById + scope completo funciona en ambos contextos.
 */
function ss_() {
  if (_memo.ss) return _memo.ss;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) return (_memo.ss = SpreadsheetApp.openById(id));
  const activo = SpreadsheetApp.getActive(); // solo existe al correr desde el editor/menú
  if (!activo) throw new Error('Falta SPREADSHEET_ID. Ejecuta MSD > Inicializar estructura desde la hoja.');
  props.setProperty('SPREADSHEET_ID', activo.getId());
  return (_memo.ss = activo);
}

function hoja_(nombre) {
  const sh = ss_().getSheetByName(nombre);
  if (!sh) throw new Error(`Falta la hoja "${nombre}". Ejecuta MSD > Inicializar estructura.`);
  return sh;
}

/** { 'ID Caso': 0, 'Canal': 2, ... } leyendo la fila de encabezados. */
function mapaColumnas_(sh) {
  const k = 'cols_' + sh.getName();
  if (_memo[k]) return _memo[k];
  const headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  const mapa = {};
  headers.forEach((h, i) => { if (String(h).trim()) mapa[String(h).trim()] = i; });
  return (_memo[k] = mapa);
}

function olvidarColumnas_(nombre) { delete _memo['cols_' + nombre]; }

/**
 * Convierte un objeto en fila según el esquema. Los textos pasan por
 * celdaSegura_ (anti formula-injection); las fórmulas propias van en
 * `formulas` y NO se sanean (son nuestras, no del usuario).
 */
function objetoAFila_(sh, columnas, obj, formulas) {
  const mapa = mapaColumnas_(sh);
  const fila = new Array(Math.max(sh.getLastColumn(), columnas.length)).fill('');
  columnas.forEach(c => {
    if (!(c.header in mapa)) throw new Error(`Columna faltante en "${sh.getName()}": ${c.header}`);
    if (formulas && c.key in formulas) { fila[mapa[c.header]] = formulas[c.key]; return; }
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

/* ---------------------------- Registro SC-SF ---------------------------- */

/**
 * Escribe el caso en la siguiente fila libre con sus fórmulas por fila.
 * DEBE llamarse dentro de conLock_ (la fila destino se calcula aquí).
 */
function insertarRegistro_(caso) {
  const sh = hoja_(HOJAS.REGISTRO);
  const fila = sh.getLastRow() + 1;
  const formulas = {};
  Object.keys(FORMULAS_REGISTRO).forEach(k => { formulas[k] = FORMULAS_REGISTRO[k](fila); });
  const valores = objetoAFila_(sh, COLUMNAS_REGISTRO, caso, formulas);
  sh.getRange(fila, 1, 1, valores.length).setValues([valores]);
  return fila;
}

function leerRegistroPorFila_(fila) {
  const sh = hoja_(HOJAS.REGISTRO);
  const obj = filaAObjeto_(sh, COLUMNAS_REGISTRO, sh.getRange(fila, 1, 1, sh.getLastColumn()).getValues()[0]);
  obj._fila = fila;
  return obj;
}

/** Fila de un ID con TextFinder (no carga la hoja completa en memoria). */
function filaDeId_(nombreHoja, id) {
  const sh = hoja_(nombreHoja);
  if (sh.getLastRow() < 2) return 0;
  const col = mapaColumnas_(sh)['ID Caso'] + 1;
  const celda = sh.getRange(2, col, sh.getLastRow() - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  return celda ? celda.getRow() : 0;
}

/* ------------------------- Detalle del formulario ------------------------ */

function insertarDetalle_(detalle) {
  const sh = hoja_(HOJAS.DETALLE);
  sh.appendRow(objetoAFila_(sh, COLUMNAS_DETALLE, detalle));
}

function actualizarDetalle_(id, cambios) {
  const sh = hoja_(HOJAS.DETALLE);
  const fila = filaDeId_(HOJAS.DETALLE, id);
  if (!fila) return;
  const mapa = mapaColumnas_(sh);
  COLUMNAS_DETALLE.forEach(c => {
    if (c.key in cambios) sh.getRange(fila, mapa[c.header] + 1).setValue(celdaSegura_(cambios[c.key]));
  });
}

/* ------------------------------- Historial ------------------------------ */

function registrarHistorial_(evento) {
  const sh = hoja_(HOJAS.HISTORIAL);
  sh.appendRow(objetoAFila_(sh, COLUMNAS_HISTORIAL, Object.assign({ fecha: new Date() }, evento)));
}

/* --------------------------- Correlativo de IDs -------------------------- */

/**
 * SCF-0001, SCF-0002… DEBE llamarse dentro de conLock_.
 * Si la propiedad no existe (primera vez o proyecto nuevo), parte del mayor ID
 * que ya esté en la hoja: así nunca se repite un ID cargado a mano.
 */
function siguienteId_() {
  const props = PropertiesService.getScriptProperties();
  let n = Number(props.getProperty('ULTIMO_SCF'));
  if (!n) n = mayorIdEnHoja_();
  n += 1;
  props.setProperty('ULTIMO_SCF', String(n));
  return APP.PREFIJO_ID + String(n).padStart(APP.DIGITOS_ID, '0');
}

function mayorIdEnHoja_() {
  const sh = hoja_(HOJAS.REGISTRO);
  if (sh.getLastRow() < 2) return 0;
  const col = mapaColumnas_(sh)['ID Caso'] + 1;
  const re = new RegExp('^' + APP.PREFIJO_ID + '(\\d+)$');
  return sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues()
    .reduce((max, [v]) => { const m = re.exec(String(v).trim()); return m ? Math.max(max, Number(m[1])) : max; }, 0);
}

/* ------------------------------- Listas -------------------------------- */

/**
 * Valores de las listas editables (A–H) leídos de la hoja "Listas".
 * Fuente única: lo que la Mesa edite en Listas aparece en el formulario y en los
 * desplegables de la hoja (tras MSD > Refrescar o 5 min de caché).
 */
function getListas_() {
  if (_memo.listas) return _memo.listas;
  const cache = CacheService.getScriptCache();
  const enCache = cache.get('listas');
  if (enCache) return (_memo.listas = JSON.parse(enCache));
  const sh = hoja_(HOJAS.LISTAS);
  const editables = Object.keys(LISTAS).filter(k => !LISTAS[k].generada);
  const ultimaCol = Math.max.apply(null, editables.map(k => LISTAS[k].col));
  const datos = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), ultimaCol).getValues();
  const out = {};
  editables.forEach(k => {
    out[k] = datos.map(r => String(r[LISTAS[k].col - 1]).trim()).filter(Boolean);
    if (!out[k].length) out[k] = LISTAS[k].valores.slice(); // hoja vacía: no romper el form
  });
  cache.put('listas', JSON.stringify(out), 300);
  return (_memo.listas = out);
}

/** Ubigeo {DEP:{PROV:[[DIST, CODIGO, LAT, LON]]}} — mismo JSON que usa el cliente. */
function getUbigeo_() {
  if (_memo.ubigeo) return _memo.ubigeo;
  const html = HtmlService.createHtmlOutputFromFile('UbigeoData').getContent();
  const json = html.slice(html.indexOf('window.UBIGEO=') + 14, html.lastIndexOf('};') + 1);
  return (_memo.ubigeo = JSON.parse(json));
}

/** Índice código -> {departamento, provincia, distrito, lat, lon}. */
function indiceUbigeo_() {
  if (_memo.idxUbigeo) return _memo.idxUbigeo;
  const u = getUbigeo_();
  const idx = {};
  Object.keys(u).forEach(dep => Object.keys(u[dep]).forEach(prov => u[dep][prov].forEach(([dist, cod, lat, lon]) => {
    idx[cod] = { departamento: dep, provincia: prov, distrito: dist, lat: lat, lon: lon };
  })));
  return (_memo.idxUbigeo = idx);
}

function limpiarCacheConfig_() {
  CacheService.getScriptCache().remove('listas');
  delete _memo.listas;
}
