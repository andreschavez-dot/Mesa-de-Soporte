/**
 * RegistroApi.gs — API pública del formulario de asesores.
 *
 * Flujo en 3 llamadas (cada google.script.run tiene límite de payload y
 * de tiempo, por eso NO se manda todo junto):
 *   1. registrarCaso(payload)              -> { id, uploadToken }
 *   2. subirEvidencia(id, token, archivo)  -> una llamada por archivo
 *   3. finalizarRegistro(id, token)        -> envía el correo a la Mesa
 *
 * El uploadToken evita que cualquiera con la URL suba archivos a casos ajenos:
 * solo quien registró el caso lo recibe y caduca a los 30 min.
 */

/* ============================== 1. Registrar ============================== */

function registrarCaso(payload) {
  return endpoint_('registrarCaso', () => {
    const caso = validarRegistro_(payload || {});

    const n = incrementarContador_('rl_reg_' + caso.codigoAsesor, 3600);
    if (n > APP.MAX_REGISTROS_HORA_ASESOR) {
      throw new AppError('Superaste el número de registros por hora. Comunícate con la Mesa por Teams.', 'RATE_LIMIT');
    }

    const ahora = new Date();
    Object.assign(caso, {
      fechaRegistro: ahora,
      numEvidencias: 0,
      solucion: '',
      asignado: '',
      estado: ESTADO_INICIAL // siempre "Pendiente" al llegar
    });

    // Sección crítica mínima: solo correlativo + inserción.
    conLock_(() => {
      caso.id = siguienteId_();
      insertarCaso_(caso);
    });

    registrarHistorial_({
      idCaso: caso.id, usuario: `${caso.nombreAsesor} (${caso.codigoAsesor})`, accion: 'REGISTRO',
      estadoNuevo: caso.estado, comentario: `Canal ${caso.canal}`
    });

    // Carpeta de evidencias (fuera del lock: Drive es lento).
    const carpeta = carpetaRaiz_().createFolder(`${caso.id} · ${caso.tipoCaso} · ${caso.distrito}`);
    actualizarCaso_(filaDeCaso_(caso.id), { carpetaEvidencias: carpeta.getUrl() });

    const uploadToken = tokenAleatorio_();
    guardarEstadoSubida_(caso.id, { token: uploadToken, carpetaId: carpeta.getId(), n: 0 });

    return { id: caso.id, uploadToken: uploadToken };
  });
}

/** Valida y normaliza TODO en servidor. El cliente valida solo por UX. */
function validarRegistro_(p) {
  if (p.website) throw new AppError('Solicitud inválida.'); // honeypot anti-bots

  const cat = getCatalogos_();
  const c = {};

  // 1. Asesor
  c.canal = enLista_(requerido_(texto_(p.canal, 40), 'Canal'), cat.canal, 'Canal');
  c.nombreAsesor = requerido_(texto_(p.nombreAsesor, 120), 'Nombre del asesor');
  c.codigoAsesor = requerido_(texto_(p.codigoAsesor, 20).toUpperCase(), 'Código/DNI del asesor');
  if (!/^[A-Z0-9-]{4,20}$/.test(c.codigoAsesor)) throw new AppError('El código/DNI solo admite letras, números y guion.');
  c.correoAsesor = requerido_(texto_(p.correoAsesor, 120).toLowerCase(), 'Correo de contacto');
  if (!esCorreo_(c.correoAsesor)) throw new AppError('El correo de contacto no es válido.');
  c.telefonoAsesor = requerido_(texto_(p.telefonoAsesor, 15).replace(/\s/g, ''), 'Teléfono de contacto');
  if (!/^9\d{8}$/.test(c.telefonoAsesor)) throw new AppError('El teléfono debe ser un celular de 9 dígitos que empiece con 9.');

  // 2. Cliente
  c.tipoCliente = enLista_(requerido_(texto_(p.tipoCliente, 60), 'Tipo de cliente'), cat.tipoCliente, 'Tipo de cliente');
  c.nombreCliente = texto_(p.nombreCliente, 120);
  c.dniCliente = requerido_(texto_(p.dniCliente, 8), 'DNI del cliente');
  if (!/^\d{8}$/.test(c.dniCliente)) throw new AppError('El DNI del cliente debe tener 8 dígitos.');

  // 3. Dirección (ubigeo validado contra el mismo JSON del cliente)
  c.departamento = requerido_(texto_(p.departamento, 60), 'Departamento');
  c.provincia = requerido_(texto_(p.provincia, 60), 'Provincia');
  c.distrito = requerido_(texto_(p.distrito, 60), 'Distrito');
  const provs = getUbigeo_()[c.departamento];
  const dists = provs && provs[c.provincia];
  const dist = dists && dists.find(d => d[0] === c.distrito);
  if (!dist) throw new AppError('Departamento, provincia y distrito no coinciden.');
  c.ubigeo = dist[1];

  c.tipoVia = enLista_(requerido_(texto_(p.tipoVia, 40), 'Tipo de vía'), cat.tipoVia, 'Tipo de vía');
  c.nombreVia = requerido_(texto_(p.nombreVia, 120), 'Nombre de vía');
  c.numero = requerido_(texto_(p.numero, 10).toUpperCase(), 'Número de vía');
  if (!/^(\d{1,6}[A-Z]?|S\/N)$/.test(c.numero)) throw new AppError('El número de vía debe ser numérico o "S/N".');
  c.manzana = texto_(p.manzana, 10).toUpperCase();
  c.lote = texto_(p.lote, 10).toUpperCase();
  c.tipoEdificacion = enLista_(requerido_(texto_(p.tipoEdificacion, 40), 'Tipo de edificación'), cat.tipoEdificacion, 'Tipo de edificación');
  c.interior = texto_(p.interior, 60);
  c.referencia = texto_(p.referencia, 200);
  c.direccionCompleta = componerDireccion_(c);

  // Ubicación: rango aproximado del territorio peruano
  c.latitud = Number(p.latitud);
  c.longitud = Number(p.longitud);
  if (!isFinite(c.latitud) || !isFinite(c.longitud) || p.latitud === '' || p.longitud === '') {
    throw new AppError('Marca la ubicación del inmueble en el mapa.');
  }
  if (c.latitud < -18.5 || c.latitud > 0.1 || c.longitud < -81.5 || c.longitud > -68.5) {
    throw new AppError('Las coordenadas están fuera del territorio peruano.');
  }
  c.latitud = Math.round(c.latitud * 1e6) / 1e6;
  c.longitud = Math.round(c.longitud * 1e6) / 1e6;
  c.origenCoordenadas = enLista_(texto_(p.origenCoordenadas, 10) || 'MAPA', ['GPS', 'MAPA', 'BUSQUEDA', 'MANUAL'], 'Origen de coordenadas');

  // 4. Detalle
  c.tipoCaso = enLista_(requerido_(texto_(p.tipoCaso, 60), 'Tipo de caso'), cat.tipoCaso, 'Tipo de caso');
  c.descripcion = requerido_(texto_(p.descripcion, APP.MAX_DESCRIPCION), 'Descripción del caso');

  // 6. Confirmación
  if (p.confirmacion !== true) throw new AppError('Debes confirmar que la información es correcta.');
  return c;
}

function componerDireccion_(c) {
  const partes = [`${c.tipoVia} ${c.nombreVia} ${c.numero}`];
  if (c.manzana) partes.push(`Mz. ${c.manzana}`);
  if (c.lote) partes.push(`Lt. ${c.lote}`);
  if (c.interior) partes.push(c.interior);
  return `${partes.join(' ')}, ${c.distrito}, ${c.provincia}, ${c.departamento}`;
}


/* ============================ 2. Evidencias ============================= */

const FIRMAS_ARCHIVO = {
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'image/webp': [0x52, 0x49, 0x46, 0x46]
};

function subirEvidencia(id, token, archivo) {
  return endpoint_('subirEvidencia', () => {
    const estado = validarTokenSubida_(id, token);
    if (estado.n >= APP.MAX_ARCHIVOS) throw new AppError(`Máximo ${APP.MAX_ARCHIVOS} archivos por caso.`);

    archivo = archivo || {};
    const mime = texto_(archivo.mime, 60);
    enLista_(mime, APP.MIME_PERMITIDOS, 'Tipo de archivo');
    const bytes = Utilities.base64Decode(String(archivo.base64 || ''));
    if (!bytes.length) throw new AppError('El archivo está vacío.');
    if (bytes.length > APP.MAX_BYTES_ARCHIVO) throw new AppError('Cada archivo debe pesar como máximo 5 MB.');

    // No confiamos en el MIME que declara el navegador: verificamos la firma binaria.
    const firma = FIRMAS_ARCHIVO[mime];
    const esWebpReal = mime !== 'image/webp' || Utilities.newBlob(bytes.slice(8, 12)).getDataAsString() === 'WEBP';
    if (!firma.every((b, i) => (bytes[i] & 0xff) === b) || !esWebpReal) {
      throw new AppError('El contenido del archivo no coincide con su tipo.');
    }

    const nombreSeguro = texto_(archivo.nombre, 80).replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_') || 'evidencia';
    estado.n += 1;
    const nombre = `${String(estado.n).padStart(2, '0')}_${nombreSeguro}`;
    DriveApp.getFolderById(estado.carpetaId).createFile(Utilities.newBlob(bytes, mime, nombre));

    guardarEstadoSubida_(id, estado);
    return { subidos: estado.n };
  });
}

/* ============================ 3. Finalizar ============================== */

function finalizarRegistro(id, token) {
  return endpoint_('finalizarRegistro', () => {
    const estado = validarTokenSubida_(id, token);
    if (estado.n < 1) throw new AppError('Adjunta al menos una captura de pantalla como evidencia.');

    const caso = leerCaso_(id);
    actualizarCaso_(caso._fila, { numEvidencias: estado.n });
    caso.numEvidencias = estado.n;

    const enviado = notificarNuevoCaso_(caso);
    CacheService.getScriptCache().remove('up_' + id); // el token deja de servir
    return { id: id, correoEnviado: enviado };
  });
}

/* ======================= Búsqueda de dirección (mapa) =================== */

/**
 * Geocodifica con el servicio Maps de Apps Script (sin API key, con cuota
 * diaria de la cuenta). Se cachea 6 h y se limita por minuto porque el
 * endpoint es público.
 */
function buscarDireccion(textoBusqueda, contexto) {
  return endpoint_('buscarDireccion', () => {
    const q = texto_(textoBusqueda, 150);
    if (q.length < 4) throw new AppError('Escribe al menos 4 caracteres para buscar.');
    const ctx = contexto || {};
    const consulta = [q, texto_(ctx.distrito, 60), texto_(ctx.provincia, 60), 'Perú'].filter(Boolean).join(', ');

    const cache = CacheService.getScriptCache();
    const clave = 'geo_' + bytesAHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, consulta.toLowerCase()));
    const enCache = cache.get(clave);
    if (enCache) return JSON.parse(enCache);

    if (incrementarContador_('rl_geo', 60) > 60) {
      throw new AppError('Demasiadas búsquedas en este momento. Marca el punto directamente en el mapa.', 'RATE_LIMIT');
    }

    const resp = Maps.newGeocoder().setRegion('pe').setLanguage('es').geocode(consulta);
    if (resp.status !== 'OK' && resp.status !== 'ZERO_RESULTS') {
      console.warn('Geocoder', resp.status);
      throw new AppError('El buscador no está disponible. Marca el punto directamente en el mapa.');
    }
    const resultados = (resp.results || []).slice(0, 5).map(r => ({
      etiqueta: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng
    }));
    cache.put(clave, JSON.stringify(resultados), 21600);
    return resultados;
  });
}

/* ------------------------------ Auxiliares ------------------------------ */

function guardarEstadoSubida_(id, estado) {
  CacheService.getScriptCache().put('up_' + id, JSON.stringify(estado), APP.UPLOAD_TOKEN_SEG);
}

function validarTokenSubida_(id, token) {
  id = texto_(id, 20);
  const raw = CacheService.getScriptCache().get('up_' + id);
  const estado = raw ? JSON.parse(raw) : null;
  if (!estado || !igualSeguro_(String(token || ''), estado.token)) {
    throw new AppError('La sesión de carga expiró. Comunícate con la Mesa indicando tu número de caso.', 'TOKEN');
  }
  return estado;
}

function carpetaRaiz_() {
  const id = getConfig_().CARPETA_EVIDENCIAS_ID;
  if (!id) throw new Error('CARPETA_EVIDENCIAS_ID no configurado. Ejecuta MSD > Inicializar estructura.');
  return DriveApp.getFolderById(id);
}
