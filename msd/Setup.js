/**
 * Setup.gs — Menú del Spreadsheet y tareas administrativas.
 * Las funciones públicas llaman a assertAdmin_() porque Apps Script también las
 * expone a google.script.run (un anónimo podría invocarlas desde la web app).
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('MSD')
    .addItem('1. Inicializar estructura', 'menuInicializar')
    .addItem('Refrescar config y catálogos', 'menuRefrescar')
    .addToUi();
}

function menuInicializar() {
  assertAdmin_();
  const r = inicializarEstructura_();
  SpreadsheetApp.getUi().alert(
    'Estructura lista.\n\n' +
    (r.respaldo ? `• La hoja anterior se guardó como "${r.respaldo}".\n` : '') +
    `• Aviso automático al marcar "Resuelto": ${r.trigger}.\n\n` +
    'Siguiente: completa CORREO_MESA en la hoja Config y despliega la web app ' +
    '(Implementar > Nueva implementación > Aplicación web).');
}

function menuRefrescar() {
  assertAdmin_();
  limpiarCacheConfig_();
  aplicarFormatoCasos_(hoja_(HOJAS.CASOS));
  SpreadsheetApp.getActive().toast('Config, catálogos y desplegables actualizados.');
}

/* ------------------------------------------------------------------------ */

function inicializarEstructura_() {
  const ss = ss_();
  const respaldo = respaldarEsquemaAnterior_(ss);

  const cat = asegurarHoja_(ss, HOJAS.CATALOGOS, ['Catálogo', 'Valor', 'Activo', 'Orden']);
  if (cat.getLastRow() === 1) {
    const filas = [];
    Object.keys(CATALOGOS_DEFAULT).forEach(k => CATALOGOS_DEFAULT[k].forEach((v, i) => filas.push([k, v, 'SI', i + 1])));
    cat.getRange(2, 1, filas.length, 4).setValues(filas);
  }

  retirarValoresCatalogo_(cat);

  const cfg = asegurarHoja_(ss, HOJAS.CONFIG, ['Clave', 'Valor', 'Descripción']);
  const existentes = cfg.getDataRange().getValues().map(r => r[0]);
  Object.keys(CONFIG_DEFAULT).forEach(k => {
    if (existentes.indexOf(k) === -1) cfg.appendRow([k, CONFIG_DEFAULT[k], '']);
  });
  asegurarCarpetaEvidencias_(cfg);

  limpiarCacheConfig_();

  // Casos al final: su formato lee Catalogos (desplegable de Asignado).
  const casos = sincronizarColumnasCasos_(ss);
  casos.setFrozenColumns(1);
  aplicarFormatoCasos_(casos);

  const hist = asegurarHoja_(ss, HOJAS.HISTORIAL, COLUMNAS_HISTORIAL.map(c => c.header));
  hist.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm:ss');

  return { respaldo: respaldo, trigger: instalarTriggerEstados_() };
}

/** Desactiva (Activo = NO) los valores de CATALOGOS_RETIRADOS, solo la primera vez. */
function retirarValoresCatalogo_(cat) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRACION_CATALOGOS_V4') === 'OK') return;
  const filas = cat.getDataRange().getValues();
  for (let r = 1; r < filas.length; r++) {
    const retirados = CATALOGOS_RETIRADOS[String(filas[r][0]).trim()] || [];
    if (retirados.indexOf(String(filas[r][1]).trim()) !== -1) cat.getRange(r + 1, 3).setValue('NO');
  }
  props.setProperty('MIGRACION_CATALOGOS_V4', 'OK');
}

/**
 * Migración desde la versión con bandeja (v1): si la hoja Casos tiene la
 * columna "Nivel", se renombra como respaldo y se crea una limpia. Así no
 * conviven dos columnas "Estado" (la vieja y la nueva).
 */
function respaldarEsquemaAnterior_(ss) {
  const sh = ss.getSheetByName(HOJAS.CASOS);
  if (!sh || sh.getLastColumn() === 0) return '';
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  if (headers.indexOf('Nivel') === -1) return '';
  const nombre = `Casos v1 (respaldo ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm')})`;
  sh.setName(nombre);
  const hist = ss.getSheetByName(HOJAS.HISTORIAL);
  if (hist) hist.setName(nombre.replace('Casos', 'Historial'));
  delete _memo['cols_' + HOJAS.CASOS];
  delete _memo['cols_' + HOJAS.HISTORIAL];
  return nombre;
}

/**
 * Deja la hoja Casos EXACTAMENTE con el orden de COLUMNAS_CASOS, sin perder datos:
 *  1. Renombra encabezados según RENOMBRES_COLUMNAS (ej. "Número" -> "Número de vía").
 *  2. Recorre el esquema de izquierda a derecha: si la columna existe en otra
 *     posición la mueve (moveColumns conserva datos, formatos y validaciones);
 *     si no existe la inserta en su lugar.
 *  3. Borra las columnas de COLUMNAS_RETIRADAS (ya no las llena el formulario).
 * Columnas desconocidas (agregadas a mano) quedan al final, intactas.
 */
function sincronizarColumnasCasos_(ss) {
  const deseados = COLUMNAS_CASOS.map(c => c.header);
  const sh = ss.getSheetByName(HOJAS.CASOS);
  if (!sh || sh.getLastRow() === 0) return asegurarHoja_(ss, HOJAS.CASOS, deseados);

  const leer = () => sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  let actuales = leer();
  Object.keys(RENOMBRES_COLUMNAS).forEach(viejo => {
    const i = actuales.indexOf(viejo);
    if (i !== -1 && actuales.indexOf(RENOMBRES_COLUMNAS[viejo]) === -1) sh.getRange(1, i + 1).setValue(RENOMBRES_COLUMNAS[viejo]);
  });

  deseados.forEach((header, i) => {
    const destino = i + 1;
    actuales = leer();
    const pos = actuales.indexOf(header) + 1;
    if (pos === destino) return;
    if (pos > 0) {
      // Las columnas a la izquierda ya están en su lugar, así que pos > destino.
      sh.moveColumns(sh.getRange(1, pos, sh.getMaxRows(), 1), destino);
    } else {
      if (destino > sh.getLastColumn()) sh.insertColumnAfter(sh.getLastColumn());
      else sh.insertColumnBefore(destino);
      sh.getRange(1, destino).setValue(header)
        .setFontWeight('bold').setBackground('#0E1B3D').setFontColor('#ffffff');
    }
  });

  COLUMNAS_RETIRADAS.forEach(header => {
    actuales = leer();
    const pos = actuales.indexOf(header) + 1;
    if (pos > 0) sh.deleteColumn(pos);
  });
  delete _memo['cols_' + HOJAS.CASOS];
  return sh;
}

function asegurarHoja_(ss, nombre, headers) {
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#0E1B3D').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  } else {
    // Migración aditiva: agrega al final las columnas nuevas del esquema.
    const actuales = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const faltantes = headers.filter(h => actuales.indexOf(h) === -1);
    if (faltantes.length) {
      sh.getRange(1, actuales.length + 1, 1, faltantes.length).setValues([faltantes])
        .setFontWeight('bold').setBackground('#0E1B3D').setFontColor('#ffffff');
    }
  }
  delete _memo['cols_' + nombre];
  return sh;
}

/**
 * Formatos de la hoja Casos:
 *  - Texto plano en códigos (conservan ceros a la izquierda: DNI, ubigeo).
 *  - Desplegable fijo en "Estado" + colores por estado.
 *  - Desplegable opcional en "Asignado" (si hay valores en Catalogos > asignado).
 */
function aplicarFormatoCasos_(sh) {
  const mapa = mapaColumnas_(sh);
  const filas = sh.getMaxRows() - 1;
  const rangoCol = header => sh.getRange(2, mapa[header] + 1, filas, 1);

  const comoTexto = ['codigoAsesor', 'telefonoAsesor', 'dniCliente', 'ubigeo', 'numero', 'manzana', 'lote'];
  COLUMNAS_CASOS.forEach(c => {
    if (comoTexto.indexOf(c.key) !== -1) rangoCol(c.header).setNumberFormat('@');
    else if (c.key === 'fechaRegistro') rangoCol(c.header).setNumberFormat('dd/MM/yyyy HH:mm');
  });

  const estados = Object.values(ESTADOS);
  const rEstado = rangoCol('Estado');
  rEstado.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(estados, true).setAllowInvalid(false)
    .setHelpText('Pendiente → En Proceso → Escalado → Resuelto. Al elegir "Resuelto" se envía la Solución al vendedor por correo.')
    .build());

  // Reemplaza solo las reglas de color de la columna Estado (respeta las demás).
  const colEstado = mapa['Estado'] + 1;
  const otras = sh.getConditionalFormatRules().filter(rule =>
    !rule.getRanges().some(rg => rg.getColumn() === colEstado && rg.getNumColumns() === 1));
  const nuevas = estados.map(est => SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(est)
    .setBackground(COLORES_ESTADO[est][0]).setFontColor(COLORES_ESTADO[est][1]).setBold(true)
    .setRanges([rEstado]).build());
  sh.setConditionalFormatRules(otras.concat(nuevas));

  const asignables = (getCatalogos_().asignado || []);
  const rAsignado = rangoCol('Asignado');
  if (asignables.length) {
    rAsignado.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(asignables, true).setAllowInvalid(true).build());
  } else {
    rAsignado.clearDataValidations();
  }
}

function asegurarCarpetaEvidencias_(cfgSheet) {
  const filas = cfgSheet.getDataRange().getValues();
  const idx = filas.findIndex(r => r[0] === 'CARPETA_EVIDENCIAS_ID');
  if (idx > 0 && filas[idx][1]) return;
  // Carpeta privada (hereda permisos de "Mi unidad" del dueño). Compártela solo con la Mesa.
  const carpeta = DriveApp.createFolder('MSD - Evidencias');
  cfgSheet.getRange(idx + 1, 2).setValue(carpeta.getId());
}
