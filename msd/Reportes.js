/**
 * Reportes.js — Pestañas "Dashboard" y "Base para reporte" (réplica de la plantilla).
 *
 * Son hojas 100 % derivadas: solo fórmulas que leen "Registro SC-SF". Por eso se
 * reconstruyen completas en cada "Inicializar" (no guardan datos propios).
 *
 * Dos mejoras deliberadas respecto a la plantilla (mismo resultado visible):
 *  1. Rangos abiertos ('Registro SC-SF'!A2:A) en vez de A2:A501: la plantilla
 *     dejaba de contar a partir del caso 501.
 *  2. "Base para reporte" usa una fórmula FILTER por columna en vez de 6 500
 *     referencias fila a fila. La plantilla además tenía la columna Distrito
 *     rota desde la fila 6 (='Registro SC-SF'!#REF!).
 */

const HOJA_DASHBOARD = 'Dashboard';
const HOJA_BASE = 'Base para reporte';

const R_ = col => `'${HOJAS.REGISTRO}'!${col}2:${col}`;   // rango abierto de una columna

/** KPIs de la fila 4–5: [columna, título, fórmula, formato]. */
const KPIS_DASHBOARD = Object.freeze([
  ['A', 'Total reportadas', `=COUNTIF(${R_('A')},"<>")`],
  ['C', 'Sin cobertura', `=COUNTIF(${R_('F')},"Sin cobertura")`],
  ['E', 'Sin factibilidad', `=COUNTIF(${R_('F')},"Sin factibilidad")`],
  ['G', 'Resueltas', `=COUNTIF(${R_('AE')},"Cerrado")`],
  ['I', 'Pendientes', ['Abierto', 'En gestión', 'En escalamiento', 'Pendiente']
    .map(e => `COUNTIF(${R_('AE')},"${e}")`).join('+').replace(/^/, '=')],
  // Denominador = casos ya evaluados (Sí + No). COUNTIF "<>" de la plantilla contaba
  // también las celdas con fórmula que devuelve "" (casos aún sin Fecha solución).
  ['K', '% dentro SLA', `=IFERROR(COUNTIF(${R_('AJ')},"Sí")/(COUNTIF(${R_('AJ')},"Sí")+COUNTIF(${R_('AJ')},"No")),0)`, '0%'],
  ['M', '% recuperables', `=IFERROR(COUNTIF(${R_('AN')},"Sí")/COUNTIF(${R_('AN')},"<>"),0)`, '0%']
]);

/** Tablas resumen: fila de encabezado, títulos, columna contada en Registro y valores. */
const TABLAS_DASHBOARD = Object.freeze([
  { fila: 8, titulo: 'Canal', col: 'C', lista: 'canal', grafico: { titulo: 'Casos por canal', columna: 4 } },
  { fila: 15, titulo: 'Tipo de caso', col: 'F', lista: 'tipoCaso', grafico: { titulo: 'Sin cobertura vs. Sin factibilidad', columna: 10 } },
  { fila: 22, titulo: 'Principales causas', col: 'Z', lista: 'causa' }
]);

/** Columnas de "Base para reporte": [encabezado, columna de Registro, formato]. */
const COLUMNAS_BASE = Object.freeze([
  ['ID Caso', 'A'], ['Fecha', 'B', FMT_FECHA], ['Canal', 'C'], ['Tipo de caso', 'F'],
  ['Distrito', 'I'], ['Causa', 'Z'], ['Destino', 'AB'], ['Estado', 'AE'], ['Resultado', 'AK'],
  ['Recuperado', 'AN'], ['SLA', 'AI', FMT_HORAS], ['Cumple SLA', 'AJ', FMT_HORAS], ['Tiempo atención', 'AH', FMT_HORAS]
]);
const ANCHOS_BASE = [20, 20, 20, 20, 20, 34, 20, 20, 20, 20, 20, 20, 20];

const AZUL_TITULO = '#0B5FA5', FONDO_KPI = '#EAF4FD', TEXTO_KPI = '#0B3F8A';

/* ------------------------------------------------------------------------ */

function construirDashboard_(ss) {
  const sh = ss.getSheetByName(HOJA_DASHBOARD) || ss.insertSheet(HOJA_DASHBOARD, 0);
  sh.getCharts().forEach(c => sh.removeChart(c));
  sh.clear();
  const listas = getListas_();

  sh.getRange(1, 1, sh.getMaxRows(), 14).setFontFamily('Carlito').setFontSize(11);
  sh.setColumnWidth(1, anchoPx_(38));
  sh.setColumnWidth(2, anchoPx_(14));
  for (let c = 3; c <= 14; c++) sh.setColumnWidth(c, anchoPx_(8.63));

  sh.getRange('A1:N2').merge()
    .setValue('Seguimiento de direcciones – Sin Cobertura / Sin Factibilidad')
    .setBackground(AZUL_TITULO).setFontColor('#FFFFFF').setFontSize(18).setFontWeight('bold')
    .setVerticalAlignment('middle');

  KPIS_DASHBOARD.forEach(([col, titulo, formula, formato]) => {
    sh.getRange(`${col}4`).setValue(titulo).setFontSize(11);
    sh.getRange(`${col}5`).setFormula(formula).setFontSize(18).setNumberFormat(formato || 'General');
    sh.getRange(`${col}4:${col}5`).setBackground(FONDO_KPI).setFontColor(TEXTO_KPI).setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
  });

  TABLAS_DASHBOARD.forEach(t => {
    const valores = listas[t.lista];
    sh.getRange(t.fila, 1, 1, 2).setValues([[t.titulo, 'Casos']])
      .setBackground(COLOR_ORIGEN.FORM).setFontColor('#FFFFFF').setFontWeight('bold');
    const filas = valores.map((v, i) => [v, `=COUNTIF(${R_(t.col)},A${t.fila + 1 + i})`]);
    sh.getRange(t.fila + 1, 1, filas.length, 2).setValues(filas);

    if (t.grafico) {
      sh.insertChart(sh.newChart().asColumnChart()
        .addRange(sh.getRange(t.fila, 1, filas.length + 1, 2))
        .setNumHeaders(1)
        .setPosition(8, t.grafico.columna, 0, 0)
        .setOption('title', t.grafico.titulo)
        .setOption('legend', { position: 'none' })
        .setOption('colors', ['#4472C4'])
        .setOption('width', 567).setOption('height', 283)
        .build());
    }
  });
  return sh;
}

function construirBaseReporte_(ss) {
  const sh = ss.getSheetByName(HOJA_BASE) || ss.insertSheet(HOJA_BASE);
  sh.clear();
  const n = COLUMNAS_BASE.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  const filas = sh.getMaxRows();

  sh.getRange(1, 1, 1, n).setValues([COLUMNAS_BASE.map(c => c[0])])
    .setBackground(COLOR_ORIGEN.FORM).setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('left');
  sh.getRange(1, 1, filas, n).setFontFamily('Carlito').setFontSize(11).setVerticalAlignment('middle');

  // Una fórmula por columna: trae solo las filas con ID Caso (crece sola, sin tope).
  const formulas = COLUMNAS_BASE.map(([, col]) => `=IFERROR(FILTER(${R_(col)},${R_('A')}<>""),"")`);
  sh.getRange(2, 1, 1, n).setFormulas([formulas]);

  COLUMNAS_BASE.forEach(([, , formato], i) => {
    if (formato) sh.getRange(2, i + 1, filas - 1, 1).setNumberFormat(formato);
    sh.setColumnWidth(i + 1, anchoPx_(ANCHOS_BASE[i]));
  });
  return sh;
}
