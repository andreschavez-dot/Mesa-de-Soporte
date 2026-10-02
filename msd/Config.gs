/**
 * Config.gs — Constantes del dominio y esquema de datos.
 *
 * Modelo simplificado (v2): solo los vendedores usan el formulario. La gestión
 * se hace directamente en la hoja `Casos` con las columnas finales
 * "Asignado" y "Estado". Al pasar un caso a "Resuelto" se notifica al vendedor.
 */

const APP = Object.freeze({
  NOMBRE: 'Mesa de Soporte de Direcciones',
  PREFIJO_ID: 'MSD-',
  DIGITOS_ID: 6,
  MAX_ARCHIVOS: 5,
  MAX_BYTES_ARCHIVO: 5 * 1024 * 1024,
  MIME_PERMITIDOS: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
  MAX_DESCRIPCION: 500,
  UPLOAD_TOKEN_SEG: 30 * 60,      // ventana para subir evidencias tras registrar
  MAX_REGISTROS_HORA_ASESOR: 20   // rate limit por código de vendedor (endpoint público)
});

const HOJAS = Object.freeze({
  CASOS: 'Casos',
  HISTORIAL: 'Historial',
  CATALOGOS: 'Catalogos',
  CONFIG: 'Config'
});

/** Estados que gestiona la Mesa desde la hoja (columna "Estado"). */
const ESTADOS = Object.freeze({
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En Proceso',
  ESCALADO: 'Escalado',
  RESUELTO: 'Resuelto'
});
const ESTADO_INICIAL = ESTADOS.PENDIENTE;

/** Colores del formato condicional de la columna Estado (fondo, texto). */
const COLORES_ESTADO = Object.freeze({
  'Pendiente': ['#FFF4D6', '#8A5A00'],
  'En Proceso': ['#E3EAFF', '#1E3FC4'],
  'Escalado': ['#F0E6FF', '#6A2BC2'],
  'Resuelto': ['#DDF5EA', '#0B6E4C']
});

/**
 * Esquema de la hoja Casos. `key` = nombre en código; `header` = encabezado.
 * El acceso es SIEMPRE por encabezado (Repo.gs): el orden físico puede cambiar.
 * "Asignado" y "Estado" van al final, como pidió la Mesa.
 */
const COLUMNAS_CASOS = Object.freeze([
  ['id', 'ID Caso'],
  ['fechaRegistro', 'Fecha registro'],
  ['prioridad', 'Prioridad'],
  ['canal', 'Canal'],
  ['tipoCaso', 'Tipo de caso'],
  ['nombreAsesor', 'Nombre asesor'],
  ['codigoAsesor', 'Código/DNI asesor'],
  ['correoAsesor', 'Correo asesor'],
  ['telefonoAsesor', 'Teléfono asesor'],
  ['tipoCliente', 'Tipo de cliente'],
  ['nombreCliente', 'Nombre cliente'],
  ['dniCliente', 'DNI cliente'],
  // --- Sección dirección: orden definido por la Mesa ---
  ['tipoVia', 'Tipo de vía'],
  ['nombreVia', 'Nombre de vía'],
  ['numero', 'Número de vía'],
  ['departamento', 'Departamento'],
  ['provincia', 'Provincia'],
  ['distrito', 'Distrito'],
  ['longitud', 'Longitud'],
  ['latitud', 'Latitud'],
  ['tipoEdificacion', 'Tipo de edificación'],
  ['manzana', 'Manzana'],
  ['lote', 'Lote'],
  // --- Resto de la sección dirección (orden relativo original) ---
  ['ubigeo', 'Ubigeo'],
  ['interior', 'Interior'],
  ['referencia', 'Referencia'],
  ['direccionCompleta', 'Dirección completa'],
  ['origenCoordenadas', 'Origen coordenadas'],
  // --- Detalle del caso ---
  ['clienteEsperando', 'Cliente esperando'],
  ['codigoError', 'Mensaje/código error'],
  ['descripcion', 'Descripción'],
  ['carpetaEvidencias', 'Carpeta evidencias'],
  ['numEvidencias', 'N° evidencias'],
  // --- Gestión de la Mesa (se llenan a mano en la hoja) ---
  ['solucion', 'Solución'],
  ['asignado', 'Asignado'],
  ['estado', 'Estado']
].map(([key, header]) => Object.freeze({ key, header })));

/**
 * Encabezados renombrados entre versiones: {anterior: nuevo}. La migración
 * (Setup.gs) renombra la celda de encabezado sin perder los datos de la columna.
 */
const RENOMBRES_COLUMNAS = Object.freeze({
  'Número': 'Número de vía'
});

const COLUMNAS_HISTORIAL = Object.freeze([
  ['fecha', 'Fecha'],
  ['idCaso', 'ID Caso'],
  ['usuario', 'Usuario'],
  ['accion', 'Acción'],
  ['estadoAnterior', 'Estado anterior'],
  ['estadoNuevo', 'Estado nuevo'],
  ['comentario', 'Comentario']
].map(([key, header]) => Object.freeze({ key, header })));

/** Valores por defecto de la hoja Config (se siembran en la inicialización). */
const CONFIG_DEFAULT = Object.freeze({
  CORREO_MESA: '',
  NOTIFICAR_ASESOR: 'SI',
  CARPETA_EVIDENCIAS_ID: ''
});

/**
 * Catálogos semilla. Se editan en la hoja `Catalogos` (columna Activo).
 * `asignado` es opcional: si se cargan nombres, la columna "Asignado" de Casos
 * muestra un desplegable con ellos (MSD > Refrescar).
 */
/**
 * Valores retirados del formulario. La migración los marca Activo = NO una sola
 * vez en la hoja Catalogos (si luego los reactivas a mano, se respeta tu cambio).
 */
const CATALOGOS_RETIRADOS = Object.freeze({
  tipoCaso: ['Error o caída del sistema', 'Otras consultas']
});

const CATALOGOS_DEFAULT = Object.freeze({
  canal: ['Tiendas', 'APP Terreno', 'Digital', 'Outbound'],
  tipoCaso: ['Sin cobertura', 'Sin factibilidad'],
  tipoCliente: ['Persona natural', 'Empresa / Negocio'],
  tipoVia: ['Avenida', 'Calle', 'Jirón', 'Pasaje', 'Prolongación', 'Carretera', 'Malecón', 'Alameda', 'Óvalo', 'Plaza', 'Camino', 'Otro'],
  tipoEdificacion: ['Casa', 'Edificio', 'Condominio', 'Multifamiliar', 'Quinta', 'Otro']
});
