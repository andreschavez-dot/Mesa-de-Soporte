/**
 * Setup.js — Menú del Spreadsheet y construcción de hojas.
 * Las funciones públicas llaman a assertAdmin_() porque Apps Script también las
 * expone a google.script.run (un anónimo podría invocarlas desde la web app).
 *
 * Todo es IDEMPOTENTE: "Inicializar" se puede correr las veces que haga falta.
 *  - Nunca borra filas de casos. Las únicas hojas que elimina son las de
 *    HOJAS_RETIRADAS (Usuarios, Catalogos), y solo una vez.
 *  - Listas A–H se siembran solo si están vacías (la Mesa puede editarlas).
 *  - Listas J–R (ubigeo) se regeneran siempre desde UbigeoData.html.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('MSD')
    .addItem('1. Inicializar estructura', 'menuInicializar')
    .addItem('Refrescar listas y formatos', 'menuRefrescar')
    .addItem('Diagnóstico de acceso', 'diagnosticoAcceso')
    .addToUi();
}

function menuInicializar() {
  assertAdmin_();
  const r = inicializarEstructura_();
  SpreadsheetApp.getUi().alert(
    'Estructura lista.\n\n' +
    `• Hoja "${HOJAS.REGISTRO}": ${COLUMNAS_REGISTRO.length} columnas con formato, desplegables y fórmulas.\n` +
    `• Hoja "${HOJAS.LISTAS}": listas + ubigeo (${r.distritos} distritos).\n` +
    `• Hojas "${HOJA_DASHBOARD}" y "${HOJA_BASE}" reconstruidas.\n` +
    (r.eliminadas.length ? `• Hojas eliminadas: ${r.eliminadas.join(', ')}.\n` : '') +
    `• Fecha solución automática al pasar a "Cerrado": ${r.trigger}.\n\n` +
    `• Avisos de casos nuevos a: ${CORREO_NOTIFICACION}.\n\n` +
    'Siguiente: publica una nueva versión de la web app.');
}

function menuRefrescar() {
  assertAdmin_();
  limpiarCacheConfig_();
  aplicarFormatoRegistro_(hoja_(HOJAS.REGISTRO));
  SpreadsheetApp.getActive().toast('Listas, desplegables y formatos actualizados.');
}

/**
 * Verifica que la web app pueda abrir el Sheet por ID (causa del error
 * "No cuentas con el permiso necesario…"). Correr una vez desde el editor.
 */
function diagnosticoAcceso() {
  assertAdmin_();
  const ss = ss_();
  const info = {
    spreadsheetId: PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'),
    nombre: ss.getName(),
    hojas: ss.getSheets().map(s => s.getName()),
    usuario: Session.getEffectiveUser().getEmail(),
    correoNotificacion: CORREO_NOTIFICACION,
    carpetaEvidencias: PropertiesService.getScriptProperties().getProperty('CARPETA_EVIDENCIAS_ID'),
    distritosUbigeo: Object.keys(indiceUbigeo_()).length
  };
  console.log(JSON.stringify(info, null, 2));
  try { SpreadsheetApp.getUi().alert('Acceso OK\n\n' + JSON.stringify(info, null, 2)); } catch (e) { /* sin UI (editor) */ }
  return info;
}

/* ------------------------------------------------------------------------ */

function inicializarEstructura_() {
  const ss = ss_();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  const distritos = construirListas_(ss);

  // ANTES de borrar la hoja Config: rescata el ID de la carpeta de evidencias.
  asegurarCarpetaEvidencias_(ss);
  limpiarCacheConfig_();

  aplicarFormatoRegistro_(construirRegistro_(ss));

  const det = asegurarHoja_(ss, HOJAS.DETALLE, COLUMNAS_DETALLE.map(c => c.header));
  const mDet = mapaColumnas_(det);
  const colDet = h => det.getRange(2, mDet[h] + 1, det.getMaxRows() - 1, 1);
  colDet('Fecha y hora de registro').setNumberFormat(FMT_FECHA);
  ['DNI asesor', 'DNI / RUC cliente', 'Ubigeo (formulario)'].forEach(h => colDet(h).setNumberFormat('@'));

  const hist = asegurarHoja_(ss, HOJAS.HISTORIAL, COLUMNAS_HISTORIAL.map(c => c.header));
  hist.getRange('A:A').setNumberFormat('dd/mm/yyyy hh:mm:ss');

  construirDashboard_(ss);
  construirBaseReporte_(ss);
  const eliminadas = eliminarHojasRetiradas_(ss);
  ordenarHojas_(ss);

  return { distritos: distritos, eliminadas: eliminadas, trigger: instalarTriggerEstados_() };
}

/* ------------------------------- Listas -------------------------------- */

function construirListas_(ss) {
  const sh = ss.getSheetByName(HOJAS.LISTAS) || ss.insertSheet(HOJAS.LISTAS);
  const azul = c => c.setBackground(COLOR_ORIGEN.FORM).setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // 1) Listas editables (A–H): solo si la columna está vacía.
  Object.keys(LISTAS).filter(k => !LISTAS[k].generada).forEach(k => {
    const l = LISTAS[k];
    if (String(sh.getRange(1, l.col).getValue()).trim()) return;
    const vals = [[l.header]].concat(l.valores.map(v => [v]));
    sh.getRange(1, l.col, vals.length, 1).setValues(vals);
  });

  // 2) Ubigeo (J–L listas únicas, N–R tabla completa): se regenera siempre.
  const u = getUbigeo_();
  const es = (a, b) => a.localeCompare(b, 'es');
  const tabla = [];
  const deps = new Set(), provs = new Set(), dists = new Set();
  Object.keys(u).forEach(dep => Object.keys(u[dep]).forEach(prov => u[dep][prov].forEach(([dist, cod]) => {
    deps.add(dep); provs.add(prov); dists.add(dist);
    tabla.push([dep, prov, dist, cod, `${dep}|${prov}|${dist}`]);
  })));
  tabla.sort((a, b) => a[3].localeCompare(b[3]));
  const listasUbigeo = {
    departamento: Array.from(deps).sort(es),
    provincia: Array.from(provs).sort(es),
    distrito: Array.from(dists).sort(es)
  };

  const necesarias = tabla.length + 1;
  if (sh.getMaxRows() < necesarias) sh.insertRowsAfter(sh.getMaxRows(), necesarias - sh.getMaxRows());
  const ultimaCol = TABLA_UBIGEO.col + TABLA_UBIGEO.headers.length - 1;
  if (sh.getMaxColumns() < ultimaCol) sh.insertColumnsAfter(sh.getMaxColumns(), ultimaCol - sh.getMaxColumns());

  const filas = sh.getMaxRows();
  sh.getRange(1, LISTAS.departamento.col, filas, 3).clearContent();
  sh.getRange(1, TABLA_UBIGEO.col, filas, TABLA_UBIGEO.headers.length).clearContent();

  ['departamento', 'provincia', 'distrito'].forEach(k => {
    const vals = [[LISTAS[k].header]].concat(listasUbigeo[k].map(v => [v]));
    sh.getRange(1, LISTAS[k].col, vals.length, 1).setValues(vals);
  });
  sh.getRange(2, TABLA_UBIGEO.col + 3, filas - 1, 1).setNumberFormat('@'); // UBIGEO con ceros a la izquierda
  sh.getRange(1, TABLA_UBIGEO.col, tabla.length + 1, TABLA_UBIGEO.headers.length)
    .setValues([TABLA_UBIGEO.headers].concat(tabla));

  // 3) Formato (igual a la plantilla: encabezado azul, Carlito 11).
  sh.getRange(1, 1, filas, ultimaCol).setFontFamily('Carlito').setFontSize(11);
  Object.keys(LISTAS).forEach(k => {
    azul(sh.getRange(1, LISTAS[k].col));
    sh.setColumnWidth(LISTAS[k].col, anchoPx_(LISTAS[k].ancho));
  });
  azul(sh.getRange(1, TABLA_UBIGEO.col, 1, TABLA_UBIGEO.headers.length));
  TABLA_UBIGEO.anchos.forEach((a, i) => sh.setColumnWidth(TABLA_UBIGEO.col + i, anchoPx_(a)));

  _memo.rangosListas = rangosListas_(sh, listasUbigeo);
  limpiarCacheConfig_();
  return tabla.length;
}

/**
 * Rango de cada lista (para los desplegables de Registro SC-SF).
 *  - Listas editables (A–H): filas 2..100 fijas. Sheets omite las celdas vacías
 *    del desplegable, así un valor nuevo que la Mesa agregue aparece solo,
 *    sin tener que volver a aplicar la validación.
 *  - Ubigeo (J–L): rango exacto (se regenera en cada inicialización).
 */
function rangosListas_(sh, listasUbigeo) {
  const out = {};
  Object.keys(LISTAS).forEach(k => {
    const l = LISTAS[k];
    if (!l.generada) { out[k] = sh.getRange(2, l.col, 99, 1); return; }
    let n = listasUbigeo ? listasUbigeo[k].length : 0;
    if (!n) {
      const vals = sh.getRange(2, l.col, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
      while (n < vals.length && String(vals[n][0]).trim()) n++;
    }
    out[k] = sh.getRange(2, l.col, Math.max(n, 1), 1);
  });
  return out;
}

/* ---------------------------- Registro SC-SF ---------------------------- */

/**
 * Crea la hoja con los encabezados exactos. Si ya existe con OTROS encabezados,
 * se detiene en vez de sobreescribir: escribir encima desalinearía datos reales.
 */
function construirRegistro_(ss) {
  const headers = COLUMNAS_REGISTRO.map(c => c.header);
  let sh = ss.getSheetByName(HOJAS.REGISTRO);
  if (!sh) sh = ss.insertSheet(HOJAS.REGISTRO, 0);
  if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());

  const actuales = sh.getRange(1, 1, 1, headers.length).getValues()[0].map(h => String(h).trim());
  const vacia = actuales.every(h => !h);
  if (vacia) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const difs = headers.map((h, i) => h === actuales[i] ? null : `${colLetra_(i + 1)}: "${actuales[i]}" ≠ "${h}"`).filter(Boolean);
    if (difs.length) {
      throw new Error(`La hoja "${HOJAS.REGISTRO}" ya existe con otros encabezados. Revisa:\n` + difs.slice(0, 10).join('\n'));
    }
  }
  olvidarColumnas_(HOJAS.REGISTRO);
  return sh;
}

/**
 * Formato idéntico a la plantilla: colores de encabezado por origen, Carlito 11,
 * anchos, formatos de fecha/horas, desplegables desde Listas y colores condicionales.
 * Sin filas inmovilizadas ni filtro (como la plantilla).
 */
function aplicarFormatoRegistro_(sh) {
  const n = COLUMNAS_REGISTRO.length;
  const filas = sh.getMaxRows() - 1;
  const rangos = _memo.rangosListas || rangosListas_(hoja_(HOJAS.LISTAS));

  sh.getRange(1, 1, 1, n)
    .setFontFamily('Carlito').setFontSize(11).setFontWeight('bold').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true)
    .setBackgrounds([COLUMNAS_REGISTRO.map(c => COLOR_ORIGEN[c.origen])]);
  sh.getRange(2, 1, filas, n).setFontFamily('Carlito').setFontSize(11).setVerticalAlignment('middle');

  COLUMNAS_REGISTRO.forEach((c, i) => {
    const col = i + 1;
    sh.setColumnWidth(col, anchoPx_(c.ancho));
    const rango = sh.getRange(2, col, filas, 1);
    if (c.formato) rango.setNumberFormat(c.formato);
    if (c.lista) {
      const l = LISTAS[c.lista];
      const regla = SpreadsheetApp.newDataValidation()
        .requireValueInRange(rangos[c.lista], true)
        .setAllowInvalid(!l.estricta);  // la plantilla advierte pero no bloquea, salvo listas estrictas
      if (l.ayuda) regla.setHelpText(l.ayuda);
      rango.setDataValidation(regla.build());
    }
  });

  // Colores condicionales: reemplaza solo los de Estado y Cumple SLA.
  const mapa = mapaColumnas_(sh);
  const colsPropias = {};
  COLORES_CONDICIONALES.forEach(([h]) => { colsPropias[mapa[h] + 1] = true; });
  const otras = sh.getConditionalFormatRules().filter(rule =>
    !rule.getRanges().some(rg => colsPropias[rg.getColumn()] && rg.getNumColumns() === 1));
  const nuevas = COLORES_CONDICIONALES.map(([h, valor, fondo, texto]) =>
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(valor).setBackground(fondo).setFontColor(texto)
      .setRanges([sh.getRange(2, mapa[h] + 1, filas, 1)]).build());
  sh.setConditionalFormatRules(otras.concat(nuevas));
}

/* --------------------------- Orden de pestañas --------------------------- */

/**
 * Elimina las hojas de versiones anteriores que ya no usa ningún código.
 * Cada nombre se procesa una sola vez (lista en Script Properties), así se
 * pueden agregar nombres a HOJAS_RETIRADAS en versiones futuras.
 */
function eliminarHojasRetiradas_(ss) {
  const props = PropertiesService.getScriptProperties();
  const procesadas = JSON.parse(props.getProperty('HOJAS_RETIRADAS_PROCESADAS') || '[]');
  const eliminadas = [];
  HOJAS_RETIRADAS.filter(n => procesadas.indexOf(n) === -1).forEach(nombre => {
    const sh = ss.getSheetByName(nombre);
    if (sh) { ss.deleteSheet(sh); eliminadas.push(nombre); }
    procesadas.push(nombre);
  });
  props.setProperty('HOJAS_RETIRADAS_PROCESADAS', JSON.stringify(procesadas));
  return eliminadas;
}

/** Orden de la plantilla primero; las hojas de soporte y antiguas, después. */
function ordenarHojas_(ss) {
  const orden = [HOJA_DASHBOARD, HOJAS.REGISTRO, HOJAS.LISTAS, HOJA_BASE, HOJAS.DETALLE, HOJAS.HISTORIAL];
  orden.forEach((nombre, i) => {
    const sh = ss.getSheetByName(nombre);
    if (!sh) return;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  });
  ss.setActiveSheet(ss.getSheetByName(HOJA_DASHBOARD));
}

/* ------------------------------ Auxiliares ------------------------------ */

/** Ancho de Excel (caracteres) -> píxeles de Sheets. */
function anchoPx_(caracteres) {
  return Math.round(caracteres * 7 + 5);
}

function colLetra_(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

function asegurarHoja_(ss, nombre, headers) {
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  const estilo = r => r.setFontWeight('bold').setBackground(COLOR_ORIGEN.FORM).setFontColor('#FFFFFF')
    .setFontFamily('Carlito').setHorizontalAlignment('center');
  if (sh.getLastRow() === 0) {
    estilo(sh.getRange(1, 1, 1, headers.length).setValues([headers]));
    sh.setFrozenRows(1);
  } else {
    // Migración aditiva: agrega al final las columnas nuevas del esquema.
    const actuales = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const faltantes = headers.filter(h => actuales.indexOf(h) === -1);
    if (faltantes.length) estilo(sh.getRange(1, actuales.length + 1, 1, faltantes.length).setValues([faltantes]));
  }
  olvidarColumnas_(nombre);
  return sh;
}

/**
 * El ID de la carpeta raíz de evidencias vive en Script Properties.
 * Migración: si aún existe la hoja Config con CARPETA_EVIDENCIAS_ID, se reutiliza
 * esa carpeta (las evidencias anteriores siguen juntas). Si no hay ninguna, se crea.
 */
function asegurarCarpetaEvidencias_(ss) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CARPETA_EVIDENCIAS_ID')) return;
  let id = '';
  const cfg = ss.getSheetByName('Config');
  if (cfg && cfg.getLastRow() > 0) {
    const fila = cfg.getDataRange().getValues().find(r => String(r[0]).trim() === 'CARPETA_EVIDENCIAS_ID');
    id = fila ? String(fila[1]).trim() : '';
  }
  // Carpeta privada (hereda permisos de "Mi unidad" del dueño). Compártela solo con la Mesa.
  if (!id) id = DriveApp.createFolder('MSD - Evidencias').getId();
  props.setProperty('CARPETA_EVIDENCIAS_ID', id);
}
