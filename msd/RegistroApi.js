/**
 * RegistroApi.js — API pública del formulario (contrato del HTML de referencia).
 *
 *   obtenerDatosIniciales() -> { listas, ubigeo, reglas }
 *   registrarCaso(datos)    -> { ok: true, idCaso } | { ok: false, errores: [...] }
 *
 * Por qué devolvemos { ok:false, errores } en vez de lanzar: el HTML muestra la
 * lista `errores` en su banner. Lanzar solo se usa para fallas inesperadas
 * (el withFailureHandler del cliente muestra err.message), y en ese caso el
 * mensaje es genérico para no filtrar detalles internos.
 *
 * Flujo de registrarCaso (pensado para concurrencia de 100+ vendedores):
 *   1. Validar todo (sin lock): campos + archivos (tamaño y firma binaria).
 *   2. Lock corto: correlativo SCF-#### + fila en Registro SC-SF + Detalle.
 *   3. Sin lock: carpeta en Drive + archivos, actualizar Detalle, Historial, correo.
 */

/* ======================== 1. Datos para el formulario ===================== */

function obtenerDatosIniciales() {
  try {
    const l = getListas_();
    return {
      listas: { 'Canal': l.canal, 'Tipo de caso': l.tipoCaso },
      ubigeo: getUbigeo_(),
      reglas: {
        maxDireccion: APP.MAX_DIRECCION,
        maxReferencia: APP.MAX_REFERENCIA,
        maxArchivos: APP.MAX_ARCHIVOS,
        maxMbArchivo: APP.MAX_MB_ARCHIVO,
        tiposPermitidos: APP.TIPOS_PERMITIDOS.slice(),
        coordenadasObligatorias: true
      }
    };
  } catch (err) {
    console.error('[obtenerDatosIniciales]', err && err.stack ? err.stack : err);
    throw new Error('El formulario no está disponible en este momento. Avisa a la Mesa.');
  }
}

/* ============================ 2. Registrar caso =========================== */

function registrarCaso(datos) {
  try {
    const v = validarCaso_(datos || {});
    if (v.errores.length) return { ok: false, errores: v.errores };

    if (incrementarContador_('rl_' + v.caso.dniAsesor, 3600) > APP.MAX_REGISTROS_HORA_ASESOR) {
      return { ok: false, errores: ['Registraste demasiados casos en la última hora. Comunícate con la Mesa.'] };
    }

    const caso = v.caso;
    const detalle = v.detalle;
    conLock_(() => {
      caso.id = detalle.id = siguienteId_();
      caso.fechaRegistro = detalle.fechaRegistro = new Date();
      insertarRegistro_(caso);
      insertarDetalle_(detalle);
    });

    // Fuera del lock: Drive es lento y no debe frenar a otros vendedores.
    guardarEvidencias_(caso.id, v.archivos, detalle);
    registrarHistorial_({ idCaso: caso.id, usuario: 'DNI ' + detalle.dniAsesor, accion: 'REGISTRO',
      estadoNuevo: ESTADO_INICIAL, comentario: `${caso.tipoCaso} · ${caso.canal} · ${detalle.numEvidencias} evidencia(s)` });
    notificarNuevoCaso_(caso, detalle);

    return { ok: true, idCaso: caso.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, errores: [err.message] };
    console.error('[registrarCaso]', err && err.stack ? err.stack : err);
    throw new Error('Ocurrió un error inesperado. Inténtalo nuevamente o contacta a la Mesa.');
  }
}

/**
 * Valida y normaliza. Nunca confía en el cliente: repite las reglas del HTML
 * y agrega las que el navegador no puede garantizar (listas vigentes, ubigeo
 * real, coordenadas dentro del Perú, firma binaria de los archivos).
 */
function validarCaso_(d) {
  const errores = [];
  const listas = getListas_();
  const err = m => errores.push(m);

  const canal = texto_(d.canal, 40);
  if (!canal) err('Selecciona el canal.');
  else if (listas.canal.indexOf(canal) === -1) err('El canal seleccionado no es válido.');

  const dniAsesor = texto_(d.dniAsesor, 20);
  if (!/^\d{8,12}$/.test(dniAsesor)) err('El DNI del asesor debe tener entre 8 y 12 dígitos.');

  const documentoCliente = texto_(d.documentoCliente, 20);
  if (!/^\d{8}$|^\d{11}$/.test(documentoCliente)) err('Ingresa un DNI (8 dígitos) o un RUC (11 dígitos) del cliente.');

  const ubigeo = texto_(d.ubigeo, 10);
  const lugar = indiceUbigeo_()[ubigeo];
  if (!lugar) err('Selecciona departamento, provincia y distrito.');

  const direccion = texto_(d.direccion, APP.MAX_DIRECCION + 1);
  if (!direccion) err('Ingresa la dirección completa.');
  else if (direccion.length > APP.MAX_DIRECCION) err(`La dirección admite máximo ${APP.MAX_DIRECCION} caracteres.`);

  const referencia = texto_(d.referencia, APP.MAX_REFERENCIA + 1);
  if (referencia.length > APP.MAX_REFERENCIA) err(`La referencia admite máximo ${APP.MAX_REFERENCIA} caracteres.`);

  const lat = Number(d.latitud), lon = Number(d.longitud);
  const coordsOk = d.latitud !== '' && d.longitud !== '' && isFinite(lat) && isFinite(lon) &&
    lat >= -18.5 && lat <= 0.1 && lon >= -81.5 && lon <= -68.5;
  if (!coordsOk) err('Marca la ubicación en el mapa (debe estar dentro del Perú).');

  const origen = APP.ORIGENES_COORDENADAS.indexOf(d.origenCoordenadas) !== -1 ? d.origenCoordenadas : 'Manual';
  const precision = Number(d.precisionGps);
  const precisionGps = d.precisionGps !== '' && isFinite(precision) && precision >= 0 ? Math.round(precision) : '';

  const tipoCaso = texto_(d.tipoCaso, 40);
  if (listas.tipoCaso.indexOf(tipoCaso) === -1) err('Selecciona el tipo de caso.');

  const archivos = validarArchivos_(d.archivos, err);

  if (d.confirmacion !== true) err('Debes confirmar la información.');

  return {
    errores: errores,
    archivos: archivos,
    caso: {
      canal: canal,
      asesor: dniAsesor,              // col. D: el técnico lo reemplaza por el nombre
      tipoCaso: tipoCaso,
      departamento: lugar ? lugar.departamento : '',
      provincia: lugar ? lugar.provincia : '',
      distrito: lugar ? lugar.distrito : '',
      direccion: direccion,
      referencia: referencia,
      estado: ESTADO_INICIAL,
      dniAsesor: dniAsesor            // no es columna; lo usa el correo
    },
    detalle: {
      dniAsesor: dniAsesor,
      documentoCliente: documentoCliente,
      ubigeo: ubigeo,
      latitud: coordsOk ? lat : '',
      longitud: coordsOk ? lon : '',
      origenCoordenadas: origen,
      precisionGps: precisionGps,
      mapa: coordsOk ? `https://www.google.com/maps?q=${lat},${lon}` : '',
      carpetaEvidencias: '',
      numEvidencias: 0
    }
  };
}

/* ============================== Evidencias ============================== */

/** Firma binaria ("magic bytes") por tipo: no confiamos en el MIME del navegador. */
const FIRMAS_ARCHIVO = {
  'image/png': b => eq_(b, 0, [0x89, 0x50, 0x4E, 0x47]),
  'image/jpeg': b => eq_(b, 0, [0xFF, 0xD8, 0xFF]),
  'application/pdf': b => eq_(b, 0, [0x25, 0x50, 0x44, 0x46]),
  'image/webp': b => eq_(b, 0, [0x52, 0x49, 0x46, 0x46]) && eq_(b, 8, [0x57, 0x45, 0x42, 0x50]),
  'image/heic': b => eq_(b, 4, [0x66, 0x74, 0x79, 0x70])   // contenedor ISO-BMFF "ftyp"
};

function eq_(bytes, desde, firma) {
  return bytes.length >= desde + firma.length && firma.every((x, i) => (bytes[desde + i] & 0xff) === x);
}

function validarArchivos_(lista, err) {
  if (!Array.isArray(lista) || !lista.length) { err('Adjunta al menos una captura de pantalla.'); return []; }
  if (lista.length > APP.MAX_ARCHIVOS) { err(`Máximo ${APP.MAX_ARCHIVOS} archivos.`); return []; }
  const maxBytes = APP.MAX_MB_ARCHIVO * 1024 * 1024;
  const ok = [];
  lista.forEach((a, i) => {
    a = a || {};
    const nombre = (texto_(a.nombre, 80).replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_')) || `evidencia_${i + 1}`;
    const tipo = texto_(a.tipo, 40);
    if (APP.TIPOS_PERMITIDOS.indexOf(tipo) === -1) { err(`"${nombre}" no es una imagen o PDF permitido.`); return; }
    const b64 = String(a.base64 || '').replace(/^data:[^,]*,/, '');
    let bytes;
    try { bytes = Utilities.base64Decode(b64); } catch (e) { bytes = []; }
    if (!bytes.length) { err(`No se pudo leer "${nombre}".`); return; }
    if (bytes.length > maxBytes) { err(`"${nombre}" supera ${APP.MAX_MB_ARCHIVO} MB.`); return; }
    if (!FIRMAS_ARCHIVO[tipo](bytes)) { err(`El contenido de "${nombre}" no coincide con su tipo.`); return; }
    ok.push({ nombre: `${String(i + 1).padStart(2, '0')}_${nombre}`, tipo: tipo, bytes: bytes });
  });
  return ok;
}

/**
 * Crea la carpeta del caso y guarda los archivos. Si Drive falla, el caso YA
 * está registrado: se deja constancia en Historial en vez de perder el registro.
 */
function guardarEvidencias_(id, archivos, detalle) {
  try {
    const carpeta = carpetaRaiz_().createFolder(id);
    archivos.forEach(a => carpeta.createFile(Utilities.newBlob(a.bytes, a.tipo, a.nombre)));
    detalle.carpetaEvidencias = carpeta.getUrl();
    detalle.numEvidencias = archivos.length;
    actualizarDetalle_(id, { carpetaEvidencias: detalle.carpetaEvidencias, numEvidencias: detalle.numEvidencias });
  } catch (e) {
    console.error('[guardarEvidencias_]', e && e.stack ? e.stack : e);
    registrarHistorial_({ idCaso: id, usuario: 'sistema', accion: 'ERROR_EVIDENCIAS', comentario: String(e.message || e).slice(0, 300) });
  }
}

function carpetaRaiz_() {
  const id = PropertiesService.getScriptProperties().getProperty('CARPETA_EVIDENCIAS_ID');
  if (!id) throw new Error('CARPETA_EVIDENCIAS_ID no configurado. Ejecuta MSD > Inicializar estructura.');
  return DriveApp.getFolderById(id);
}
