# Mesa de Soporte de Direcciones (MSD) — Apps Script · v2

Formulario web **público** para que los **vendedores** reporten casos de dirección. La Mesa gestiona cada caso **directamente en la hoja `Casos`**, con las columnas finales **Asignado** y **Estado**.

```
Vendedor llena el formulario ──► fila nueva en Casos (Estado = Pendiente) ──► correo a la Mesa
                                              │
              La Mesa cambia Estado: Pendiente → En Proceso → Escalado → Resuelto
                                              │
                         Estado = Resuelto ──► correo automático al "Correo asesor"
```

## Archivos

```
appsscript.json      Manifiesto (scopes mínimos + web app pública)
Config.gs            Columnas, estados, colores y catálogos semilla
Util.gs              Errores, saneamiento, lock, tokens, rate limiting
Repo.gs              Acceso a Sheets (por encabezado, no por índice)
Main.gs              doGet: sirve el formulario
RegistroApi.gs       API pública: registrarCaso → subirEvidencia (×N) → finalizarRegistro, buscarDireccion
Estados.gs           Trigger onEdit instalable: "Resuelto" → correo al vendedor
Notificaciones.gs    Correos (caso nuevo, confirmación y resuelto)
Setup.gs             Menú MSD: inicializar, migrar desde v1 y aplicar formatos
Registro.html / RegistroJs.html / Styles.html / Common.html   Interfaz
Email.html           Plantilla de correo
UbigeoData.html      1 893 distritos INEI con coordenadas
```

## Actualizar desde la v1 (con bandeja)

1. En tu carpeta local, **borra** `Auth.gs`, `BandejaApi.gs`, `Bandeja.html` y `BandejaJs.html`. Después copia los archivos nuevos y conserva `.clasp.json` y `.claspignore`.
2. Ejecuta `clasp push -f`. Esto también elimina del proyecto remoto los archivos que ya no existen en tu carpeta.
3. En el Sheet, ve a **MSD → 1. Inicializar estructura** y **autoriza el nuevo permiso**, que sirve para crear el trigger:
   - La hoja `Casos` anterior se renombra a **"Casos v1 (respaldo …)"** y se crea una nueva con **Asignado** y **Estado** al final.
   - Se instala el aviso automático de "Resuelto".
   - La hoja `Usuarios` ya no se usa; puedes borrarla.
4. Ve a **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. Así la URL se mantiene.

## Uso diario (Mesa)

| Columna | Cómo se usa |
|---|---|
| **Solución** | La escribe a mano quien atiende el caso. Es el texto que recibe el vendedor. |
| **Asignado** | Quién atiende el caso. Texto libre, o un desplegable si cargas nombres en `Catalogos` con *Catálogo* = `asignado` y ejecutas **MSD → Refrescar**. |
| **Estado** | Desplegable con colores: **Pendiente** (llega solo) → **En Proceso** → **Escalado** → **Resuelto**. |

**Correo al vendedor:** se envía cuando el caso está en **Resuelto** y **tiene Solución**, sin importar el orden en que llenes las dos columnas.
- Si eliges Resuelto sin Solución, la celda muestra la nota *"Falta la Solución…"*. El correo sale solo en cuanto escribes la Solución.
- Después de enviar, la celda queda con la nota *"Notificado…"*. Si vuelves a elegir Resuelto o corriges la Solución, no se reenvía.
- Si reabres el caso, la nota se borra. Al resolverlo de nuevo, se vuelve a avisar.

## Orden de columnas (hoja Casos)

La sección de dirección queda en este orden: Tipo de vía, Nombre de vía, Número de vía, Departamento, Provincia, Distrito, Longitud, Latitud, Tipo de edificación, Manzana, Lote. Después siguen Ubigeo, Interior, Referencia, Dirección completa y Origen coordenadas.

Para cambiar el orden, edita solo el arreglo `COLUMNAS_CASOS` en `Config.gs` y ejecuta **MSD → 1. Inicializar estructura**. La migración **mueve las columnas existentes con sus datos**, inserta las que falten y deja al final cualquier columna que hayas agregado a mano.

## Configuración (hoja Config)

| Clave | Valor |
|---|---|
| `CORREO_MESA` | Correo o correos que reciben cada caso nuevo, separados por coma |
| `NOTIFICAR_ASESOR` | `SI`/`NO`: confirmación al vendedor cuando registra el caso |
| `CARPETA_EVIDENCIAS_ID` | Se llena solo |

## Decisiones técnicas

- **Trigger instalable, no `onEdit` simple.** El `onEdit` simple corre sin autorización y no puede enviar correos. El instalable corre con los permisos de quien ejecutó *Inicializar* y nunca se duplica.
- **Estado inicial forzado en el servidor.** El cliente nunca envía el estado, así que un registro no puede llegar marcado como "Resuelto".
- **Seguridad del formulario público:** validación en el servidor contra catálogos y ubigeo, honeypot, límite de registros por hora, firma binaria de los archivos, token de subida, protección contra formula injection y escape de HTML.
- **Interfaz:**
  - Validación al salir de cada campo, con el mensaje junto al campo.
  - Placa con la dirección compuesta en vivo, para revisarla antes de enviar.
  - Progreso por paso y barra fija en celular.
  - Las fotos se comprimen antes de subirse y se pueden pegar con Ctrl+V.
  - Reintento sin duplicar el caso.
  - Funciona sin el mapa si la red bloquea el CDN.
  - Respeta `prefers-reduced-motion`.
