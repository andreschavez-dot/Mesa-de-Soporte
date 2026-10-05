/**
 * Config.js — Constantes del dominio y esquema de datos.
 *
 * v3: el formulario y la hoja replican el modelo "Registro y seguimiento de casos
 * Sin Cobertura y Sin Factibilidad" de la Mesa:
 *   - Hoja "Registro SC-SF": 41 columnas, idénticas a la plantilla.
 *       FORM    (azul)      -> las llena el formulario.
 *       FORMULA (turquesa)  -> fórmula de la hoja (o el trigger, en "Fecha solución").
 *       MANUAL  (naranja)   -> las llenan los técnicos; quedan vacías al registrar.
 *   - Hoja "Listas": valores de los desplegables + ubigeo oficial (UBIGEO.csv).
 *   - Hoja "Detalle formulario": datos del formulario que no tienen columna en
 *     Registro SC-SF (DNI/RUC cliente, coordenadas, evidencias). Se une por ID Caso.
 */

const APP = Object.freeze({
  NOMBRE: 'Mesa de Soporte de Direcciones',
  PREFIJO_ID: 'SCF-',
  DIGITOS_ID: 4,                  // SCF-0001 (crece solo a SCF-10000 si hiciera falta)
  MAX_ARCHIVOS: 5,
  MAX_MB_ARCHIVO: 5,
  TIPOS_PERMITIDOS: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
  MAX_DIRECCION: 250,
  MAX_REFERENCIA: 200,
  ORIGENES_COORDENADAS: ['GPS', 'Mapa', 'Manual'],
  MAX_REGISTROS_HORA_ASESOR: 20   // rate limit por DNI de asesor (el endpoint es público)
});

const HOJAS = Object.freeze({
  REGISTRO: 'Registro SC-SF',
  LISTAS: 'Listas',
  DETALLE: 'Detalle formulario',
  HISTORIAL: 'Historial'
});

/**
 * Hojas de versiones anteriores que se eliminan al inicializar. Cada nombre se
 * procesa UNA sola vez (se recuerda en Script Properties): si luego alguien crea
 * una hoja con ese nombre para otro fin, un nuevo "Inicializar" no la borra.
 */
const HOJAS_RETIRADAS = Object.freeze(['Usuarios', 'Catalogos', 'Casos', 'Config']);

const ESTADO_INICIAL = 'Pendiente';
const ESTADO_CERRADO = 'Cerrado';

/** Colores de encabezado de la plantilla (significado = quién llena la columna). */
const ORIGEN = Object.freeze({ FORM: 'FORM', FORMULA: 'FORMULA', MANUAL: 'MANUAL', MANUAL_ALT: 'MANUAL_ALT' });
const COLOR_ORIGEN = Object.freeze({
  FORM: '#0879D9',
  FORMULA: '#00FFFF',
  MANUAL: '#FF9900',
  MANUAL_ALT: '#E69138'   // "¿Dirección encontrada en OT?" usa este tono en la plantilla
});

const FMT_FECHA = 'dd/mm/yyyy hh:mm';
const FMT_HORAS = '0.00';

/**
 * Esquema de "Registro SC-SF" (orden = orden físico A..AO).
 * lista: clave de LISTAS cuyo rango alimenta el desplegable de la columna.
 * El acceso en código es SIEMPRE por encabezado (Repo.js).
 */
const COLUMNAS_REGISTRO = Object.freeze([
  ['id', 'ID Caso', 'FORM', 13],
  ['fechaRegistro', 'Fecha y hora de registro', 'FORM', 20, { formato: FMT_FECHA }],
  ['canal', 'Canal', 'FORM', 15, { lista: 'canal' }],
  ['asesor', 'Asesor solicitante', 'MANUAL', 19, { formato: '@' }],   // el form deja el DNI; el técnico pone el nombre
  ['supervisor', 'Supervisor', 'MANUAL', 18],
  ['tipoCaso', 'Tipo de caso', 'FORM', 13, { lista: 'tipoCaso' }],
  ['provincia', 'Provincia', 'FORM', 13, { lista: 'provincia' }],
  ['departamento', 'Departamento', 'FORM', 13, { lista: 'departamento' }],
  ['distrito', 'Distrito', 'FORM', 13, { lista: 'distrito' }],
  ['tipoVia', 'Tipo de vía', 'MANUAL', 13, { lista: 'tipoVia' }],
  ['nombreVia', 'Nombre de vía', 'MANUAL', 22],
  ['direccion', 'Dirección completa', 'FORM', 32],
  ['zona', 'Zona', 'MANUAL', 13],
  ['numero', 'Numero', 'MANUAL', 13],
  ['interior', 'Interior', 'MANUAL', 13],
  ['manzana', 'Manzana/Bloque', 'MANUAL', 13],
  ['lote', 'Lote', 'MANUAL', 13],
  ['referencia', 'Referencia', 'FORM', 13],
  ['encontradaOt', '¿Dirección encontrada en OT?', 'MANUAL_ALT', 18, { lista: 'siNo' }],
  ['locationId', 'Location ID', 'FORMULA', 14],   // sin formato texto: en una celda '@' la fórmula se guardaría como texto
  ['mensajeOt', 'Mensaje / error en OT', 'MANUAL', 28],
  ['direccionCorrecta', '¿Dirección correcta?', 'MANUAL', 18, { lista: 'siNo' }],
  ['normalizada', '¿Normalizada?', 'MANUAL', 15, { lista: 'siNo' }],
  ['cobertura', '¿Cobertura?', 'MANUAL', 14, { lista: 'siNo' }],
  ['factibilidad', '¿Factibilidad?', 'MANUAL', 16, { lista: 'siNo' }],
  ['causa', 'Causa identificada', 'MANUAL', 34, { lista: 'causa' }],
  ['requiereEscalamiento', '¿Requiere escalamiento?', 'MANUAL', 18, { lista: 'siNo' }],
  ['destino', 'Destino (Nivel)', 'MANUAL', 22, { lista: 'destino' }],
  ['idTicket', 'ID Ticket', 'MANUAL', 15],
  ['fechaEscalamiento', 'Fecha escalamiento', 'MANUAL', 20, { formato: FMT_FECHA }],
  ['estado', 'Estado', 'FORM', 13, { lista: 'estado' }],
  ['fechaPrimeraRespuesta', 'Fecha 1ra respuesta', 'MANUAL', 13, { formato: FMT_FECHA }],
  ['fechaSolucion', 'Fecha solución', 'FORMULA', 13, { formato: FMT_FECHA }],
  ['tiempoAtencion', 'Tiempo de atención (h)', 'FORMULA', 19, { formato: FMT_HORAS }],
  ['sla', 'SLA (h)', 'MANUAL', 12, { formato: FMT_HORAS, lista: 'sla' }],
  ['cumpleSla', 'Cumple SLA', 'MANUAL', 14, { formato: FMT_HORAS }],
  ['resultadoFinal', 'Resultado final', 'MANUAL', 28, { lista: 'resultado' }],
  ['solucionAplicada', 'Solución aplicada', 'MANUAL', 32],
  ['respuestaCanal', 'Respuesta al canal', 'MANUAL', 25],
  ['casoRecuperado', '¿Caso recuperado?', 'MANUAL', 18, { lista: 'siNo' }],
  ['observaciones', 'Observaciones', 'MANUAL', 38]
].map(([key, header, origen, ancho, extra]) => Object.freeze(Object.assign({ key, header, origen, ancho }, extra || {}))));

/**
 * Fórmulas por fila (mismas de la plantilla). Se escriben al registrar cada caso
 * con referencias A1 de esa fila. Nombres de función en inglés (Sheets los
 * acepta en cualquier configuración regional cuando se escriben vía API).
 *  - locationId: ubigeo del distrito buscado por "Departamento|Provincia|Distrito"
 *    en la tabla de Listas. Si el técnico corrige el distrito, se recalcula solo.
 */
const FORMULAS_REGISTRO = Object.freeze({
  locationId: r => `=IF(I${r}="","",IFERROR(INDEX(Listas!$Q:$Q,MATCH(H${r}&"|"&G${r}&"|"&I${r},Listas!$R:$R,0)),""))`,
  tiempoAtencion: r => `=IF(OR(B${r}="",AG${r}=""),"",ROUND((AG${r}-B${r})*24,2))`,
  cumpleSla: r => `=IF(AH${r}="","",IF(AH${r}<=AI${r},"Sí","No"))`
});

/** Formato condicional de la plantilla: [header, valor, fondo, texto]. */
const COLORES_CONDICIONALES = Object.freeze([
  ['Estado', 'Cerrado', '#DCFCE7', '#166534'],
  ['Estado', 'Vencido (fuera SLA)', '#FECACA', '#B91C1C'],
  ['Estado', 'En gestión', '#FEF3C7', '#92400E'],
  ['Cumple SLA', 'Sí', '#DCFCE7', '#166534'],
  ['Cumple SLA', 'No', '#FEE2E2', '#B91C1C']
]);

/**
 * Hoja "Listas". Columnas A–H = plantilla (se siembran solo si están vacías:
 * la Mesa puede editarlas). J–L y N–R = ubigeo oficial, se regeneran siempre
 * desde UbigeoData.html (única fuente de verdad, igual a UBIGEO.csv).
 */
const LISTAS = Object.freeze({
  canal: { col: 1, header: 'CANAL', ancho: 18, nombreForm: 'Canal', valores: ['Tiendas', 'Digital', 'APP Terreno', 'Outbound'] },
  tipoCaso: { col: 2, header: 'TIPO CASO', ancho: 20, nombreForm: 'Tipo de caso', valores: ['Sin cobertura', 'Sin factibilidad'] },
  tipoVia: { col: 3, header: 'TIPO VÍA', ancho: 14, valores: ['Av.', 'Jr.', 'Calle', 'Pasaje'] },
  causa: { col: 4, header: 'CAUSA IDENTIFICADA', ancho: 38, valores: ['Dirección no existe en maestro', 'Dirección no normalizada', 'Dirección mal ingresada', 'Edificio no cargado (sin interiores)', 'Sin NAP asociada', 'NAP sin disponibilidad', 'Fuera de cobertura real', 'Inconsistencia de data', 'Error de sistema', 'Otros'] },
  destino: { col: 5, header: 'DESTINO ESCALAMIENTO', ancho: 24, valores: ['WINET (N3)', 'Analytics (N4)', 'TI / Sistemas (N4)'] },
  estado: { col: 6, header: 'ESTADO', ancho: 22, valores: ['Abierto', 'En gestión', 'En escalamiento', 'Pendiente', 'Cerrado', 'Vencido (fuera SLA)'] },
  resultado: { col: 7, header: 'RESULTADO FINAL', ancho: 30, valores: ['Dirección corregida', 'Dirección creada / actualizada', 'Cobertura habilitada', 'Factibilidad confirmada', 'No viable', 'Escalado', 'Pendiente de información', 'Recuperado', 'Otros'] },
  siNo: { col: 8, header: 'SÍ/NO', ancho: 12, valores: ['Sí', 'No'] },
  // SLA en horas (número, no texto: "Cumple SLA" compara AH <= AI). 0.25 = 15 min.
  // estricta: la hoja rechaza cualquier otro valor (las demás listas solo advierten).
  sla: { col: 9, header: 'SLA (H)', ancho: 12, valores: [0.25, 4], estricta: true,
    ayuda: 'Elige 0.25 (15 minutos) o 4 (4 horas).' },
  // --- Ubigeo (generadas) ---
  departamento: { col: 10, header: 'DEPARTAMENTO', ancho: 22, generada: true },
  provincia: { col: 11, header: 'PROVINCIA', ancho: 26, generada: true },
  distrito: { col: 12, header: 'DISTRITO', ancho: 30, generada: true }
});

/** Tabla ubigeo completa en Listas (N..R) para la fórmula de Location ID. */
const TABLA_UBIGEO = Object.freeze({
  col: 14, // N
  headers: ['DEP (UBIGEO)', 'PROV (UBIGEO)', 'DIST (UBIGEO)', 'UBIGEO', 'CLAVE'],
  anchos: [22, 26, 30, 10, 50]
});

const COLUMNAS_DETALLE = Object.freeze([
  ['id', 'ID Caso'],
  ['fechaRegistro', 'Fecha y hora de registro'],
  ['dniAsesor', 'DNI asesor'],
  ['documentoCliente', 'DNI / RUC cliente'],
  ['ubigeo', 'Ubigeo (formulario)'],
  ['latitud', 'Latitud'],
  ['longitud', 'Longitud'],
  ['origenCoordenadas', 'Origen coordenadas'],
  ['precisionGps', 'Precisión GPS (m)'],
  ['mapa', 'Ver en mapa'],
  ['carpetaEvidencias', 'Carpeta evidencias'],
  ['numEvidencias', 'N° evidencias']
].map(([key, header]) => Object.freeze({ key, header })));

const COLUMNAS_HISTORIAL = Object.freeze([
  ['fecha', 'Fecha'],
  ['idCaso', 'ID Caso'],
  ['usuario', 'Usuario'],
  ['accion', 'Acción'],
  ['estadoAnterior', 'Estado anterior'],
  ['estadoNuevo', 'Estado nuevo'],
  ['comentario', 'Comentario']
].map(([key, header]) => Object.freeze({ key, header })));

/**
 * Único destinatario del aviso de caso nuevo. Vive en el código (versionado con
 * git/clasp) en lugar de una hoja: así nadie lo cambia por error desde el Sheet.
 * Para cambiarlo: edita esta línea, `clasp push -f` y publica una nueva versión de
 * la web app (el correo lo envía la web app, que corre la versión publicada).
 */
const CORREO_NOTIFICACION = 'andres.chavez@nexalyze.io';
