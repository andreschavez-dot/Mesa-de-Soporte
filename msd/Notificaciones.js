/**
 * Notificaciones.js — Correo a CORREO_NOTIFICACION (Config.js) por cada caso nuevo.
 * (El formulario no pide correo del asesor, así que no hay aviso al vendedor.)
 * Una falla de correo NUNCA revierte el caso: se deja constancia en Historial.
 */

function notificarNuevoCaso_(caso, detalle) {
  const para = String(CORREO_NOTIFICACION || '').trim();
  if (!esCorreo_(para)) {
    console.warn('CORREO_NOTIFICACION inválido: no se envía aviso de ' + caso.id);
    return false;
  }
  try {
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Cuota diaria de correos agotada');
    const tpl = HtmlService.createTemplateFromFile('Email');
    tpl.d = {
      caso: caso,
      detalle: detalle,
      fecha: fmtFecha_(caso.fechaRegistro),
      urlFila: urlFila_(caso.id)
    };
    MailApp.sendEmail({
      to: para,
      subject: `[${caso.tipoCaso}] Nuevo caso ${caso.id} – ${caso.distrito}`,
      htmlBody: tpl.evaluate().getContent(),
      name: APP.NOMBRE
    });
    return true;
  } catch (err) {
    console.error('notificarNuevoCaso_', err);
    registrarHistorial_({ idCaso: caso.id, usuario: 'sistema', accion: 'ERROR_CORREO', comentario: String(err.message || err).slice(0, 300) });
    return false;
  }
}

/** Enlace directo a la fila del caso en "Registro SC-SF". */
function urlFila_(id) {
  const sh = hoja_(HOJAS.REGISTRO);
  const fila = filaDeId_(HOJAS.REGISTRO, id);
  return `${ss_().getUrl()}#gid=${sh.getSheetId()}${fila ? '&range=A' + fila : ''}`;
}
