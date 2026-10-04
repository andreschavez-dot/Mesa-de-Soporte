/**
 * Estados.gs — Reacción a los cambios hechos a mano en la hoja Casos.
 *
 * Por qué un trigger INSTALABLE y no el onEdit() simple:
 * el onEdit simple corre sin autorización y NO puede enviar correos.
 * El instalable (creado en MSD > Inicializar) corre con los permisos del instalador.
 *
 * Regla de notificación: el vendedor recibe el correo cuando el caso está en
 * "Resuelto" Y tiene "Solución". No importa el orden en que la Mesa llene ambas:
 *   - Elige Resuelto sin Solución  -> nota "Falta la Solución…" (no se envía aún).
 *   - Luego escribe la Solución     -> se envía en ese momento.
 *
 * Idempotencia: tras enviar, la celda Estado queda con la nota "Notificado…";
 * re-elegir Resuelto o corregir la Solución no reenvía. Si el caso sale de
 * "Resuelto", la nota se borra y una nueva resolución vuelve a notificar.
 */
const NOTA_NOTIFICADO = /^Notificado/;
const NOTA_FALTA_SOLUCION = 'Falta la Solución: el correo al vendedor se enviará automáticamente apenas la completes.';

function alEditarCasos(e) {
  // También es invocable desde google.script.run: sin un Range real, no hace nada.
  if (!e || !e.range || typeof e.range.getSheet !== 'function') return;
  const sh = e.range.getSheet();
  if (sh.getName() !== HOJAS.CASOS) return;

  const mapa = mapaColumnas_(sh);
  if (!('Estado' in mapa) || !('Solución' in mapa)) return;
  const colEstado = mapa['Estado'] + 1;
  const colSolucion = mapa['Solución'] + 1;
  const r = e.range;
  const toca = col => col >= r.getColumn() && col <= r.getLastColumn();
  const tocoEstado = toca(colEstado);
  if (!tocoEstado && !toca(colSolucion)) return;

  const filaIni = Math.max(r.getRow(), 2);
  const filaFin = r.getLastRow();
  if (filaFin < filaIni) return;

  const unaCelda = r.getNumRows() === 1 && r.getNumColumns() === 1;
  const usuario = correoEditor_(e);

  for (let fila = filaIni; fila <= filaFin; fila++) {
    const caso = leerCasoPorFila_(fila);
    if (!caso.id) continue;
    const nuevo = String(caso.estado || '').trim();

    if (tocoEstado) {
      const anterior = unaCelda ? String(e.oldValue || '') : '';
      if (unaCelda && nuevo === anterior) continue;
      registrarHistorial_({
        idCaso: caso.id, usuario: usuario, accion: 'CAMBIO_ESTADO',
        estadoAnterior: unaCelda ? anterior : '(edición múltiple)', estadoNuevo: nuevo,
        comentario: caso.asignado ? `Asignado: ${caso.asignado}` : ''
      });
    }
    evaluarNotificacion_(sh.getRange(fila, colEstado), caso, usuario);
  }
}

/** Decide si toca enviar el correo de "Resuelto" para una fila. */
function evaluarNotificacion_(celdaEstado, caso, usuario) {
  // Sección crítica: evita doble correo si dos ediciones llegan a la vez.
  conLock_(() => {
    const nota = celdaEstado.getNote();
    if (String(caso.estado).trim() !== ESTADOS.RESUELTO) {
      if (nota) celdaEstado.clearNote();
      return;
    }
    if (NOTA_NOTIFICADO.test(nota)) return;
    if (!String(caso.solucion || '').trim()) {
      if (nota !== NOTA_FALTA_SOLUCION) celdaEstado.setNote(NOTA_FALTA_SOLUCION);
      return;
    }
    const ok = notificarResuelto_(caso);
    celdaEstado.setNote(ok
      ? `Notificado al asesor (${caso.correoAsesor}) el ${fmtFecha_(new Date())}`
      : `No se pudo notificar al asesor (${fmtFecha_(new Date())}). Revisa la hoja Historial.`);
    if (ok) {
      registrarHistorial_({ idCaso: caso.id, usuario: usuario, accion: 'NOTIFICADO_RESUELTO',
        estadoNuevo: ESTADOS.RESUELTO, comentario: String(caso.solucion).slice(0, 300) });
    }
  }, 30000);
}

/** Correo de quien editó, si Google lo expone (depende del dominio de la cuenta). */
function correoEditor_(e) {
  try {
    const u = e.user && typeof e.user.getEmail === 'function' ? e.user.getEmail() : '';
    return u || Session.getActiveUser().getEmail() || 'editor de la hoja';
  } catch (err) {
    return 'editor de la hoja';
  }
}

/**
 * Crea el trigger instalable una sola vez. Los triggers pertenecen al usuario que
 * los crea: si otro editor lo creara de nuevo, cada edición dispararía dos correos.
 * Por eso se registra quién lo instaló y no se duplica.
 */
function instalarTriggerEstados_() {
  const props = PropertiesService.getScriptProperties();
  const yo = Session.getEffectiveUser().getEmail();
  const instalador = props.getProperty('TRIGGER_ESTADOS_DE');
  const propio = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'alEditarCasos');
  if (propio) return 'ya instalado';
  if (instalador && instalador !== yo) return `ya instalado por ${instalador}`;
  ScriptApp.newTrigger('alEditarCasos').forSpreadsheet(ss_()).onEdit().create();
  props.setProperty('TRIGGER_ESTADOS_DE', yo);
  return 'instalado';
}
