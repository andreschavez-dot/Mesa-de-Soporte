# Mesa de Soporte de Direcciones (MSD) — versión 13

Formulario web público para que los vendedores reporten casos de dirección. La Mesa gestiona cada caso en la hoja `Casos`. Esta descripción corresponde al código de la **versión 13** publicada (`clasp pull --versionNumber 13`).

```
Vendedor llena el formulario
        │
        ▼
registrarCaso → subirEvidencia (una vez por archivo) → finalizarRegistro
        │
        ▼
Fila nueva en Casos (Estado = Pendiente) y correo a la Mesa
        │
        ▼
La Mesa edita la hoja: Pendiente → En Proceso → Escalado → Resuelto
        │
        ▼
Estado = Resuelto y hay Solución → correo automático al Correo asesor
```

La URL pública de la versión 13 no cambia al guardar o al hacer `clasp push`. Esos cambios quedan en el código guardado (`HEAD`). La versión 13 sigue sirviendo hasta publicar una versión nueva sobre la misma implementación.

| Copia | Identificador |
|---|---|
| Proyecto Apps Script | `1Zme7cmJ-aDv-5LOF7HZ4o_DIDuI13D34T0CajdQGWUbZukqy1RB9HGL3` |
| Implementación publicada @13 | `AKfycbwZfmb6gvvZKYDUocI91cqM9P0wHCT-ttACswW-fZdBNkq07bk7CPloynf1Bj60ZqpxDw` |
| Implementación @HEAD | `AKfycbxXB6nC7t1VjkqVZ_YOmYOEEB3FmK1st-gZkYxmlm-4` |

Zona horaria `America/Lima`. Runtime V8. La web app se ejecuta como quien la publicó (`USER_DEPLOYING`) y es accesible sin iniciar sesión (`ANYONE_ANONYMOUS`). Los errores van a Cloud Logging.

## Funcionalidad

### Formulario (6 pasos)

1. **Tus datos.** Canal, nombre, código o DNI, correo y celular del asesor.
2. **Cliente.** Tipo de cliente, nombre y DNI.
3. **Dirección.** Tipo y nombre de vía, número, manzana, lote, tipo de edificación, interior, referencia, departamento, provincia y distrito.
4. **Ubicación.** Punto en el mapa (Leaflet). La búsqueda usa el geocoder de Apps Script. Si el CDN del mapa no carga, el resto del formulario sigue usable.
5. **El caso.** Tipo de caso y descripción.
6. **Evidencia.** Al menos una captura o PDF. Se pueden pegar con Ctrl+V. El navegador comprime las fotos antes de subirlas.

Al enviar, el servidor hace tres llamadas: crea el caso, sube cada archivo y, al final, avisa a la Mesa. Si falla una subida, se reintenta con el mismo caso y el mismo token, sin duplicar la fila.

El estado inicial lo fija el servidor en `Pendiente`. El formulario no puede enviar un caso ya resuelto.

### Gestión en la hoja

El menú **MSD** de la hoja tiene dos acciones:

- **1. Inicializar estructura.** Crea o alinea hojas, columnas, formatos, carpeta de evidencias y el aviso de `Resuelto`. Si la hoja `Casos` todavía tiene la columna `Nivel` (esquema de la bandeja), la renombra a `Casos v1 (respaldo …)` y crea una hoja nueva.
- **Refrescar config y catálogos.** Limpia la caché de 5 minutos y vuelve a aplicar desplegables y colores.

| Columna | Uso |
|---|---|
| **Solución** | Texto que recibe el vendedor. Lo escribe quien atiende el caso. |
| **Asignado** | Texto libre. Si en `Catalogos` hay filas con catálogo `asignado` y Activo distinto de `NO`, al refrescar pasa a ser un desplegable. |
| **Estado** | Desplegable: Pendiente, En Proceso, Escalado, Resuelto. |

El correo al vendedor sale cuando el caso está en **Resuelto** y **Solución** tiene texto. El orden de las dos celdas no importa.

- Resuelto sin solución: la celda Estado muestra la nota *Falta la Solución…* y el correo espera.
- Después de enviar, la nota queda *Notificado al asesor (…)*. Volver a elegir Resuelto o corregir la Solución no reenvía.
- Si el caso sale de Resuelto, la nota se borra. Al resolverlo otra vez, se vuelve a avisar.
- Si el correo falla, el caso no se revierte. Queda una fila `ERROR_CORREO` en `Historial`.

### Correos

| Momento | Destino | Asunto |
|---|---|---|
| Caso nuevo | `CORREO_MESA` (varios correos separados por coma o punto y coma) | `[Tipo de caso] Nuevo caso MSD-…… – Distrito` |
| Caso nuevo, si `NOTIFICAR_ASESOR` es `SI` | Correo asesor | `Recibimos tu caso MSD-……` |
| Resuelto con solución | Correo asesor | `Caso MSD-…… resuelto – Distrito` |

El correo a la Mesa incluye enlace a la fila, a la carpeta de evidencias y a Google Maps, y responde al correo del asesor. El correo al asesor responde a `CORREO_MESA` e incluye la solución y quién figuraba en **Asignado**.

## Valores

Constantes de `Config.js`:

| Constante | Valor |
|---|---|
| Nombre | Mesa de Soporte de Direcciones |
| ID de caso | `MSD-` + 6 dígitos (`MSD-000001`) |
| Archivos por caso | 5 |
| Peso máximo por archivo | 5 MB |
| Tipos permitidos | PNG, JPEG, WebP, PDF (se comprueba la firma binaria, no solo el tipo que declara el navegador) |
| Descripción | 500 caracteres |
| Token de subida | 30 minutos |
| Registros por hora y código de asesor | 20 |
| Búsquedas de dirección | 60 por minuto, caché de 6 horas |
| Caché de Config y catálogos | 5 minutos |

Hoja `Config` (se siembran al inicializar; `CARPETA_EVIDENCIAS_ID` se llena sola con la carpeta `MSD - Evidencias`):

| Clave | Valor inicial |
|---|---|
| `CORREO_MESA` | vacío |
| `NOTIFICAR_ASESOR` | `SI` |
| `CARPETA_EVIDENCIAS_ID` | vacío hasta inicializar |

Estados y colores (fondo, texto):

| Estado | Color |
|---|---|
| Pendiente | `#FFF4D6` / `#8A5A00` |
| En Proceso | `#E3EAFF` / `#1E3FC4` |
| Escalado | `#F0E6FF` / `#6A2BC2` |
| Resuelto | `#DDF5EA` / `#0B6E4C` |

Catálogos semilla. En la hoja `Catalogos` cada fila es Catálogo, Valor, Activo, Orden. Activo `NO` oculta el valor.

| Catálogo | Valores |
|---|---|
| `canal` | Tiendas, APP Terreno, Digital, Outbound |
| `tipoCaso` | Sin cobertura, Sin factibilidad |
| `tipoCliente` | B2B (Empresa), B2C (Hogar) |
| `tipoVia` | Avenida, Calle, Jirón, Pasaje, Prolongación, Carretera, Malecón, Alameda, Óvalo, Plaza, Camino, Otro |
| `tipoEdificacion` | Casa, Edificio, Condominio, Multifamiliar, Quinta, Otro |
| `asignado` | No viene sembrado. Se carga a mano si se quiere el desplegable. |

La primera inicialización marca Activo `NO` en `tipoCaso` para *Error o caída del sistema* y *Otras consultas* (propiedad `MIGRACION_CATALOGOS_V4`). Si alguien los reactiva en la hoja, se respetan.

Validación del registro en el servidor:

- Código o DNI del asesor: 4 a 20 caracteres, letras, números y guion.
- Celular: 9 dígitos y empieza en 9.
- DNI del cliente: 8 dígitos.
- Número de vía: hasta 6 dígitos, letra final opcional, o `S/N`.
- Departamento, provincia y distrito tienen que coincidir con `UbigeoData.html`. El ubigeo lo pone el servidor.
- Coordenadas dentro de Perú: latitud de -18.5 a 0.1, longitud de -81.5 a -68.5. Origen: `GPS`, `MAPA`, `BUSQUEDA` o `MANUAL`.
- Hay que confirmar que los datos son correctos.
- Un campo oculto `website` (honeypot) rechaza el envío si viene lleno.
- Hace falta al menos una evidencia para cerrar el registro.
- Textos que empiezan por `=`, `+`, `-` o `@` se guardan con un apóstrofo para que la hoja no los ejecute como fórmula.

Acciones que quedan en `Historial`: `REGISTRO`, `CAMBIO_ESTADO`, `NOTIFICADO_RESUELTO`, `ERROR_CORREO`.

## Estructura

Archivos de la versión 13. `clasp` los guarda en local con extensión `.js`; en Apps Script son scripts del servidor.

```
appsscript.json     Manifiesto: scopes, zona horaria y web app pública
Config.js           Constantes, columnas, estados, colores y catálogos semilla
Util.js             Errores, saneamiento, lock, tokens y límites
Repo.js             Lectura y escritura de Sheets por encabezado
Main.js             doGet: sirve el formulario
RegistroApi.js      registrarCaso, subirEvidencia, finalizarRegistro, buscarDireccion
Estados.js          Trigger instalable onEdit: Resuelto con Solución avisa al vendedor
Notificaciones.js   Correos de caso nuevo, confirmación y resuelto
Setup.js            Menú MSD: inicializar y refrescar
Registro.html       Formulario
RegistroJs.html     Comportamiento del formulario
Styles.html         Estilos
Common.html         Fragmentos compartidos de la interfaz
Email.html          Plantilla de correo
UbigeoData.html     Distritos INEI con coordenadas
.clasp.json         scriptId del proyecto (no se publica como código)
.claspignore        Excluye este README del clasp push
```

En la carpeta también pueden quedar archivos `.gs` de una copia local anterior. La versión 13 bajada con `clasp pull --versionNumber 13` es el conjunto `.js` de esta lista.

### Hojas

| Hoja | Rol |
|---|---|
| `Casos` | Un caso por fila. La primera columna queda congelada. |
| `Historial` | Fecha, ID, usuario, acción, estado anterior, estado nuevo y comentario. |
| `Catalogos` | Listas del formulario y, si se carga, de Asignado. |
| `Config` | Correo de la Mesa, aviso al asesor y carpeta de evidencias. |

### Columnas de Casos

El código localiza cada columna por su encabezado. El orden es:

ID Caso, Fecha registro, Canal, Tipo de caso, Nombre asesor, Código/DNI asesor, Correo asesor, Teléfono asesor, Tipo de cliente, Nombre cliente, DNI cliente, Dirección completa, Nombre de vía, Interior, Número de vía, Departamento, Provincia, Distrito, Longitud, Latitud, Tipo de vía, Tipo de edificación, Manzana, Lote, Ubigeo, Referencia, Origen coordenadas, Descripción, Carpeta evidencias, N° evidencias, Solución, Asignado, Estado.

El bloque de dirección sigue el orden de la tabla de referencia (Dirección completa, Nombre calle, Piso y Depto, Número, Región/Departamento, Provincia, Comuna/Distrito, Longitud, Latitud, Tipo de dirección, Tipo de edificación, Manzana). Una columna de esa tabla equivale a un campo del formulario cuando ambos guardan el mismo dato, aunque el rótulo no coincida:

| Tabla | Excel | Criterio |
|---|---|---|
| Dirección completa | Dirección completa | Mismo rótulo: el texto armado de la dirección. |
| Nombre calle | Nombre de vía | «Calle» y «vía» nombran la arteria. |
| Piso y Depto | Interior | Interior guarda piso, departamento o torre. |
| Número | Número de vía | Número de puerta. Prefijo y postfijo no tienen campo propio. |
| Región/Departamento | Departamento | En Perú el primer nivel es el departamento. |
| Provincia | Provincia | Mismo nombre y mismo nivel. |
| Comuna/Distrito | Distrito | «Comuna» es el nombre de la tabla para el distrito. |
| Longitud | Longitud | La misma coordenada; en la tabla va antes que la latitud. |
| Latitud | Latitud | La misma coordenada. |
| Tipo de dirección | Tipo de vía | Columna de clasificación de la dirección; la tabla no tiene «Tipo de vía». |
| Tipo de edificación | Tipo de edificación | Mismo rótulo. |
| Manzana | Manzana | Mismo rótulo. |

Lote, Ubigeo, Referencia y Origen coordenadas no aparecen en la tabla (Código postal no es el ubigeo INEI) y quedan al final del bloque, en ese orden. No se agregan columnas que el formulario no captura: Principal, Prefijo de numeración, Postfijo de numeración, Código postal, País, Normalizada, Centro Poblado e Id XYGO.

La dirección compuesta queda así: `Tipo de vía Nombre de vía Número, Mz. … Lt. … interior, Distrito, Provincia, Departamento`.

Códigos, DNI, teléfono, ubigeo, número, manzana y lote se guardan como texto para conservar ceros a la izquierda. La fecha de registro usa `dd/MM/yyyy HH:mm`.

Para cambiar el orden se edita `COLUMNAS_CASOS` en `Config.js` y se ejecuta **MSD → 1. Inicializar estructura**. La migración mueve las columnas existentes con sus datos, inserta las que falten y deja al final cualquier columna agregada a mano. El encabezado antiguo `Número` se renombra a `Número de vía`. Borra `Prioridad`, `Cliente esperando` y `Mensaje/código error`: el formulario no los recoge.

### Permisos del script

- Hoja de cálculo actual
- Drive (carpeta de evidencias)
- Envío de correo
- Triggers instalables
- Interfaz del contenedor (menú MSD)
- Correo del usuario que ejecuta el script
