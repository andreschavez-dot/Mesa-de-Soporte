/**
 * Estados.js — Reacción a los cambios que hacen los técnicos en "Registro SC-SF".
 *
 * Regla: "Fecha solución" = momento en que el caso pasa a "Cerrado".
 *   - Estado -> Cerrado y Fecha solución vacía  => se escribe la fecha/hora actual
 *     y una nota "automática" en la celda.
 *   - Estado deja de ser Cerrado (reapertura)    => se borra esa fecha SOLO si la
 *     puso el sistema (tiene la nota). Una fecha escrita a mano no se toca.
 *   - Cada cambio de Estado queda en la hoja Historial.
 * Con "Fecha solución" llena, la fórmula "Tiempo de atención (h)" se calcula sola.
 *
 * Por qué un trigger INSTALABLE: el onEdit simple no puede escribir en otras
 * hojas con permisos completos ni identificar bien al editor. El nombre del
 * handler (alEditarCasos) se mantiene para que el trigger ya instalado siga
 * funcionando sin reinstalarlo.
 */
const NOTA_FECHA_AUTO = 'Registrada automáticamente al pasar el caso a "Cerrado".';

function alEditarCasos(e) {
  // También es invocable desde google.script.run: sin un Range real, no hace nada.
  if (!e || !e.range || typeof e.range.getSheet !== 'function') return;
  const sh = e.range.getSheet();
  if (sh.getName() !== HOJAS.REGISTRO) return;

  const mapa = mapaColumnas_(sh);
  if (!('Estado' in mapa) || !('Fecha solución' in mapa)) return;
  const colEstado = mapa['Estado'] + 1;
  const colSolucion = mapa['Fecha solución'] + 1;
  const r = e.range;
  if (colEstado < r.getColumn() || colEstado > r.getLastColumn()) return;

  const filaIni = Math.max(r.getRow(), 2);
  const filaFin = r.getLastRow();
  if (filaFin < filaIni) return;

  const unaCelda = r.getNumRows() === 1 && r.getNumColumns() === 1;
  const usuario = correoEditor_(e);

  conLock_(() => {
    for (let fila = filaIni; fila <= filaFin; fila++) {
      const caso = leerRegistroPorFila_(fila);
      if (!caso.id) continue;
      const nuevo = String(caso.estado || '').trim();
      const anterior = unaCelda ? String(e.oldValue || '') : '(edición múltiple)';
      if (unaCelda && nuevo === anterior) continue;

      const celda = sh.getRange(fila, colSolucion);
      const esAuto = celda.getNote() === NOTA_FECHA_AUTO;
      let comentario = '';
      if (nuevo === ESTADO_CERRADO && caso.fechaSolucion === '') {
        celda.setValue(new Date()).setNote(NOTA_FECHA_AUTO);
        comentario = 'Fecha solución registrada';
      } else if (nuevo !== ESTADO_CERRADO && esAuto) {
        celda.clearContent();
        celda.clearNote();
        comentario = 'Caso reabierto: se borró la fecha solución automática';
      }
      registrarHistorial_({ idCaso: caso.id, usuario: usuario, accion: 'CAMBIO_ESTADO',
        estadoAnterior: anterior, estadoNuevo: nuevo, comentario: comentario });
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
 * Crea el trigger instalable una sola vez. Los triggers pertenecen a quien los
 * crea: si otro editor lo instalara de nuevo, cada edición se procesaría dos veces.
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
