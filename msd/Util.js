/**
 * Util.js — Utilidades transversales.
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

/** Ejecuta fn con un lock de script (secciones críticas: correlativo, fila destino). */
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

function esCorreo_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

function fmtFecha_(d) {
  return d instanceof Date && !isNaN(d)
    ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
    : '';
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
