/**
 * Util.gs — Utilidades transversales.
 *
 * Convención de seguridad: toda función que termina en "_" es PRIVADA para
 * google.script.run (Apps Script no la expone al cliente). Solo las funciones
 * sin "_" forman la API pública de la web app.
 */

/** Error de negocio: su mensaje SÍ se muestra al usuario. */
class AppError extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.name = 'AppError';
    this.codigo = codigo || 'VALIDACION';
  }
}

/**
 * Envuelve cada endpoint público: los AppError se devuelven tal cual y los
 * errores inesperados se registran en Stackdriver y se devuelven genéricos,
 * para no filtrar detalles internos (IDs de archivos, stack traces) al cliente.
 */
function endpoint_(nombre, fn) {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, error: err.message, codigo: err.codigo };
    }
    console.error(`[${nombre}]`, err && err.stack ? err.stack : err);
    return { ok: false, error: 'Ocurrió un error inesperado. Inténtalo nuevamente o contacta a la Mesa.', codigo: 'INTERNO' };
  }
}

/** Ejecuta fn con un lock de script (secciones críticas: correlativo, updates). */
function conLock_(fn, timeoutMs) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(timeoutMs || 20000)) {
    throw new AppError('El sistema está ocupado. Inténtalo en unos segundos.', 'OCUPADO');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ----------------------------- Saneamiento ----------------------------- */

/** Limpia texto: recorta, colapsa espacios, quita caracteres de control y limita longitud. */
function texto_(valor, max) {
  if (valor === null || valor === undefined) return '';
  let s = String(valor).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  s = s.replace(/[ \t]+/g, ' ');
  return max ? s.slice(0, max) : s;
}

/**
 * Evita "formula injection": si un texto empieza con = + - @ la hoja lo
 * interpretaría como fórmula (p. ej. =IMPORTXML(...) exfiltrando datos).
 */
function celdaSegura_(valor) {
  if (typeof valor !== 'string') return valor;
  return /^[=+\-@\t\r]/.test(valor) ? "'" + valor : valor;
}

function requerido_(valor, etiqueta) {
  if (valor === '' || valor === null || valor === undefined) {
    throw new AppError(`El campo "${etiqueta}" es obligatorio.`);
  }
  return valor;
}

function enLista_(valor, lista, etiqueta) {
  if (lista.indexOf(valor) === -1) {
    throw new AppError(`El valor de "${etiqueta}" no es válido.`);
  }
  return valor;
}

function esCorreo_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/* -------------------------------- Fechas -------------------------------- */

/** google.script.run no serializa Date: siempre devolvemos ISO 8601. */
function iso_(d) {
  return d instanceof Date && !isNaN(d) ? d.toISOString() : '';
}

function fmtFecha_(d) {
  return d instanceof Date && !isNaN(d)
    ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
    : '';
}

/* ----------------------------- Criptografía ----------------------------- */

function bytesAHex_(bytes) {
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/** Token aleatorio no adivinable (2 UUID v4 = 244 bits de entropía). */
function tokenAleatorio_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/** Comparación en tiempo constante (evita timing attacks triviales). */
function igualSeguro_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* -------------------------------- Varios -------------------------------- */

/** Incluye un archivo HTML del proyecto dentro de una plantilla (scriptlets). */
function include_(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/** Contador con ventana de tiempo en CacheService (rate limiting). */
function incrementarContador_(clave, ventanaSeg) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(clave) || 0) + 1;
  cache.put(clave, String(n), ventanaSeg);
  return n;
}

/**
 * Bloquea funciones administrativas si las invoca alguien distinto del dueño.
 * En la web app (ANYONE_ANONYMOUS, ejecuta como dueño) el usuario activo viene
 * vacío, así que un anónimo que llame a la función desde la consola es rechazado.
 */
function assertAdmin_() {
  const activo = Session.getActiveUser().getEmail();
  const efectivo = Session.getEffectiveUser().getEmail();
  if (!activo || activo !== efectivo) {
    throw new AppError('Operación permitida solo para el administrador.', 'PROHIBIDO');
  }
}
