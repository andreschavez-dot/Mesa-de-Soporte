# MSD – Registro de casos Sin Cobertura / Sin Factibilidad (v3)

Formulario público (web app de Apps Script) + Google Sheet con el modelo **"Registro y seguimiento de casos SC-SF"** de la Mesa de Soporte de Direcciones.

## Archivos

| Archivo | Rol |
|---|---|
| `Registro.html` | Formulario: es el HTML de referencia de la Mesa, sin cambios. |
| `UbigeoData.html` | El ubigeo oficial (`UBIGEO.csv`, 1885 distritos) más las coordenadas de la capital distrital. Lo usan el formulario, la validación del servidor y la hoja Listas. |
| `Main.js` | `doGet()` sirve el formulario. |
| `RegistroApi.js` | API pública: `obtenerDatosIniciales()` y `registrarCaso(datos)`. También valida y guarda las evidencias. |
| `Repo.js` | Acceso a la hoja: lectura por encabezado, correlativo `SCF-0001` y `openById`. |
| `Config.js` | Esquema de las 41 columnas, las fórmulas, las listas y los colores. |
| `Setup.js` | Menú **MSD**. Construye las hojas Registro SC-SF, Listas, Detalle formulario e Historial, y elimina las hojas antiguas. |
| `Reportes.js` | Las pestañas **Dashboard** (KPIs, 3 tablas y 2 gráficos) y **Base para reporte**. Solo tienen fórmulas y se reconstruyen en cada Inicializar. |
| `Estados.js` | Trigger `alEditarCasos`: pone la *Fecha solución* cuando el caso pasa a **Cerrado**. |
| `Notificaciones.js` + `Email.html` | Envía un correo por cada caso nuevo a `CORREO_NOTIFICACION`, definido en `Config.js` (hoy `andres.chavez@nexalyze.io`). |

## Hoja "Registro SC-SF" (idéntica a la plantilla)

| Color del encabezado | Quién llena la columna | Columnas |
|---|---|---|
| Azul `#0879D9` | El formulario | ID Caso, Fecha y hora de registro, Canal, Tipo de caso, Provincia, Departamento, Distrito, Dirección completa, Referencia, Estado (= `Pendiente`) |
| Turquesa `#00FFFF` | Una fórmula o el sistema | **Location ID**: es una fórmula que busca `Dep\|Prov\|Dist` en `Listas!N:R`. **Fecha solución**: la pone el trigger al pasar a Cerrado. **Tiempo de atención (h)**: es una fórmula. |
| Naranja `#FF9900` | Los técnicos, a mano | Quedan vacías al registrar. Hay dos excepciones. **Asesor solicitante (D)** recibe el DNI del asesor y el técnico lo cambia por su nombre. **Cumple SLA** lleva la fórmula de la plantilla. |

Los datos del formulario que no tienen columna en la plantilla van a la hoja **Detalle formulario**, unida por *ID Caso*: DNI asesor, DNI/RUC cliente, ubigeo, lat/long, origen y precisión GPS, enlace al mapa, carpeta de evidencias y N° de archivos.

## Despliegue

1. **Haz una copia del Sheet** (Archivo > Hacer una copia) como respaldo.
2. `clasp push -f`
3. En el Sheet, ejecuta **MSD > 1. Inicializar estructura**. Autoriza el nuevo permiso de Sheets.
4. Ejecuta **MSD > Diagnóstico de acceso**. Debe responder "Acceso OK".
5. Ve a Implementar > Gestionar implementaciones > ✏️ > Versión: **Nueva versión** > Implementar. La URL no cambia.

Inicializar elimina las hojas antiguas `Usuarios`, `Catalogos`, `Casos` y `Config`. Cada nombre se procesa una sola vez (`HOJAS_RETIRADAS_PROCESADAS` en Script Properties). Antes de borrar `Config`, rescata el ID de la carpeta de evidencias y lo guarda en Script Properties (`CARPETA_EVIDENCIAS_ID`).
