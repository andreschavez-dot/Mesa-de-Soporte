/**
 * Notificaciones.gs — Correos automáticos.
 *
 *  - Caso nuevo      -> CORREO_MESA (+ confirmación al vendedor si NOTIFICAR_ASESOR = SI)
 *  - Caso "Resuelto" -> vendedor (columna "Correo asesor"), disparado desde Estados.gs
 *
 * Una falla de correo NUNCA revierte el caso: se deja constancia en Historial.
 */

function notificarNuevoCaso_(caso) {
  const cfg = getConfig_();
  const ok = enviarCorreo_(cfg.CORREO_MESA, `[${caso.tipoCaso}] Nuevo caso ${caso.id} – ${caso.distrito}`, {
    titulo: `Nuevo caso ${caso.id} — ${caso.tipoCaso}`,
    intro: caso.prioridad === 'Alta' ? 'Prioridad ALTA: el cliente está esperando o hay una falla de sistema.' : '',
    caso: caso
  }, caso.id, { replyTo: caso.correoAsesor });

  if (String(cfg.NOTIFICAR_ASESOR).toUpperCase() === 'SI') {
    enviarCorreo_(caso.correoAsesor, `Recibimos tu caso ${caso.id}`, {
      titulo: `Tu caso ${caso.id} fue registrado`,
      intro: 'La Mesa de Soporte de Direcciones ya recibió tu caso. Te escribiremos a este correo cuando esté resuelto.',
      caso: caso,
      paraAsesor: true
    }, caso.id);
  }
  return ok;
}

function notificarResuelto_(caso) {
  return enviarCorreo_(caso.correoAsesor, `Caso ${caso.id} resuelto – ${caso.distrito}`, {
    titulo: `Tu caso ${caso.id} fue resuelto`,
    intro: 'La Mesa de Soporte de Direcciones resolvió tu caso. Ya puedes continuar con la venta en One Touch / APP.',
    solucion: String(caso.solucion || ''),
    atendidoPor: String(caso.asignado || ''),
    caso: caso,
    paraAsesor: true
  }, caso.id, { replyTo: getConfig_().CORREO_MESA });
}

/** Renderiza Email.html (los <?= ?> escapan HTML automáticamente). */
function enviarCorreo_(destinatarios, asunto, datos, idCaso, opciones) {
  const para = String(destinatarios || '').split(/[,;]/).map(s => s.trim()).filter(esCorreo_).join(',');
  if (!para) {
    console.warn(`Sin destinatarios válidos para "${asunto}"`);
    return false;
  }
  try {
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Cuota diaria de correos agotada');
    const tpl = HtmlService.createTemplateFromFile('Email');
    tpl.d = Object.assign({ intro: '', comentario: '', solucion: '', atendidoPor: '', paraAsesor: false }, datos);
    tpl.d.fecha = fmtFecha_(datos.caso.fechaRegistro);
    tpl.d.mapa = `https://www.google.com/maps?q=${datos.caso.latitud},${datos.caso.longitud}`;
    tpl.d.urlBase = urlFilaCaso_(datos.caso.id);
    MailApp.sendEmail(Object.assign({
      to: para,
      subject: asunto,
      htmlBody: tpl.evaluate().getContent(),
      name: APP.NOMBRE
    }, opciones && opciones.replyTo && esCorreo_(String(opciones.replyTo).split(',')[0].trim())
      ? { replyTo: String(opciones.replyTo).split(',')[0].trim() } : {}));
    return true;
  } catch (err) {
    console.error('enviarCorreo_', err);
    registrarHistorial_({ idCaso: idCaso, usuario: 'sistema', accion: 'ERROR_CORREO', comentario: String(err.message || err).slice(0, 300) });
    return false;
  }
}

/** Enlace directo a la fila del caso en el Sheet (para el correo de la Mesa). */
function urlFilaCaso_(id) {
  const sh = hoja_(HOJAS.CASOS);
  const fila = filaDeCaso_(id);
  return `${ss_().getUrl()}#gid=${sh.getSheetId()}${fila ? '&range=A' + fila : ''}`;
}
