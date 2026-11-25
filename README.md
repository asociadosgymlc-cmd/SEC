# LICITA · Plataforma jurídica para contratación pública colombiana

LICITA asiste todo el ciclo de una licitación: encuentra procesos en SECOP
en vivo, anticipa lo que las entidades planean comprar, analiza pliegos con
IA para detectar riesgos jurídicos, hace análisis forense de entidades y
proveedores con datos públicos, y entrega la observación lista para
radicar — con fundamento normativo y jurisprudencial.

## Acceso

LICITA gestiona usuarios con dos roles:

- **Administrador** — administra clientes, ve el monitoreo y todas las
  funciones de la plataforma.
- **Cliente** — accede a su propio dashboard, análisis, historial y al
  resto de las funciones no administrativas.

**Credenciales del administrador:**

El usuario inicial es `admin`. La contraseña inicial **no se documenta
aquí**: se entrega una sola vez, por un canal privado, a quien despliega la
plataforma. Si no la tienes o sospechas que se expuso, cambia el hash en
`DEFAULT_ADMIN_HASH` (`assets/js/auth.js`) antes de publicar el sitio.

> ⚠️ Cambia esta contraseña en `Clientes → Cambiar clave` apenas entres. Como
> la app no tiene backend, esa contraseña solo protege lo guardado en el
> navegador de cada quien — si ya usaste el sitio antes de una rotación de
> contraseña, debes cambiarla manualmente desde tu propia sesión; un cambio
> de código en `DEFAULT_ADMIN_HASH` solo afecta a quien entre por primera
> vez desde ese commit en adelante.

Para registrar a un cliente: inicia sesión como admin → **Clientes → Nuevo
cliente**. La plataforma genera una contraseña aleatoria que puedes copiar
y entregar.

## Funcionalidades

| Sección | Qué hace |
|---|---|
| **Landing pública** | Mapa en vivo de oportunidades (antes del hero, sin login), hero, alianzas normativas, funcionalidades, estadísticas, precios, contacto. |
| **Dashboard** | Mapa de oportunidades por departamento, pulso del mercado en vivo, estadísticas y accesos rápidos. |
| **Mi empresa** | Perfil del proponente (NIT, capacidad financiera, experiencia). Habilita el Match Score. Permite buscar y cargar como experiencia tus contratos reales en SECOP II por NIT. |
| **Pipeline** | CRM de oportunidades por etapas (Interesado → Analizando → Ofertando → Adjudicado). |
| **Análisis de Pliego** | Carga de PDF/DOCX/TXT, detecta cláusulas restrictivas, cita norma y jurisprudencia, redacta la observación (copiar / descargar Word). |
| **Buscar en SECOP 2** | Búsqueda en vivo de procesos vigentes y planeación (Borrador), con filtros. |
| **Plan Anual (PAA)** | Dashboard oficial embebido + búsqueda sobre el dataset público cuando está disponible (con aviso si usa el respaldo de "procesos vigentes"). |
| **Análisis Forense** | HHI de concentración de mercado, dependencia de cliente único, anomalías de adjudicación, adiciones >50% (art. 40 Ley 80), abuso de contratación directa, oferente único, posible pliego "sastre", consorcios recurrentes, predictor de ganador. Todo sobre datos públicos de `datos.gov.co`. |
| **Mapa Nacional** | Choropleth de los 33 departamentos por procesos/valor, en vivo. Clic en un departamento → ranking real de municipios. |
| **Alertas** | Búsquedas guardadas que avisan de procesos nuevos. |
| **Historial** | Análisis de pliego guardados, con opción de reabrirlos. |
| **Marco Normativo** | Normas y criterios jurisprudenciales que aplica el motor. |
| **Formación** | Cursos cortos con certificado descargable en Word. |
| **Clientes** *(admin)* | Crear, editar, activar/desactivar, restablecer clave y eliminar clientes. |
| **Monitoreo** *(admin)* | Estadísticas globales y actividad de todos los clientes. |

## Cómo funciona el motor de análisis de pliego

`assets/js/analyzer.js` contrasta el texto del requisito contra un conjunto
de reglas (`assets/js/knowledge.js`) que detectan patrones de riesgo
frecuentes en pliegos colombianos: vinculación laboral exclusiva,
experiencia o indicadores financieros desproporcionados, marca o referencia
determinada, restricciones por domicilio geográfico, plazos insuficientes y
especificaciones ambiguas. Cada hallazgo suma un puntaje de riesgo (Bajo ·
Medio · Alto · Crítico), cita el fundamento normativo y genera el petitorio.

## Cómo funcionan las fuentes de datos en vivo

Todo lo que viene de SECOP (Buscar SECOP, PAA, Mapa Nacional, Análisis
Forense, mis contratos en Mi Empresa) consulta directamente, desde el
navegador del usuario, la API pública de Socrata en `datos.gov.co` — sin
backend propio, sin credenciales, sin App Token por defecto. Datasets en
uso (`assets/js/secop.js`):

| Dataset | ID | Uso |
|---|---|---|
| Procesos SECOP II | `p6dx-8zbt` | Buscar SECOP, PAA, Mapa Nacional, Forense (oferente único) |
| Contratos SECOP II (vigente) | `jbjy-vk9h` | Mi empresa (mis contratos por NIT) |
| Contratos SECOP I (histórico) | `rpmr-utcd` | Forense (captura de mercado, adiciones, consorcios recurrentes) |
| Plan Anual de Adquisiciones | `c6dm-udt9` y 5 candidatos más | PAA (con aviso de respaldo si ninguno responde) |

**Limitaciones conocidas, verificadas en vivo:**
- Sin App Token (gratis en `https://evaluamos.datos.gov.co/signup`), la API
  aplica *throttling* agresivo. El timeout de cliente es de 30s
  (`FETCH_TIMEOUT_MS` en `secop.js`); consultas sobre `rpmr-utcd` (SECOP I,
  usado por buena parte del Análisis Forense) pueden agotarlo incluso para
  entidades pequeñas — el Análisis Forense se degrada parcialmente en ese
  caso, no se cae por completo.
- `estado_resumen` en `p6dx-8zbt` es un registro histórico acumulado, no un
  flag de "vigente hoy": cualquier conteo agregado por ese campo debe
  acotarse también por fecha, o el total queda inflado por años de
  histórico (ya corregido en Mapa Nacional y en el widget del Dashboard).
- `datos.gov.co` renombra/retira columnas sin avisar — ya pasó con
  `valor_total_de_adiciones`, `fecha_de_firma_del_contrato` y
  `nombre_del_proveedor` en `jbjy-vk9h` (ver `modules/secop_client.py` para
  el mismo saneamiento del lado Python).

## Pipeline Python/Streamlit (Buscador semántico SECOP II)

Pieza independiente del frontend LICITA: ingiere contratos de SECOP II,
genera embeddings y permite búsqueda semántica. Ver `README_SECOP.md` para
instalación y uso (`streamlit run app.py`, o CLI con `modules.secop_client`
/ `modules.secop_embeddings`).

## Ejecutar el frontend

Es una aplicación 100 % estática. Basta con servir la carpeta:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

También puede abrirse `index.html` directamente en el navegador.

Las librerías de lectura de archivos (pdf.js, mammoth), el mapa (topojson)
y los estilos (Tailwind) se cargan desde CDN, por lo que la primera carga
requiere conexión a internet. El historial, los procesos y los perfiles de
empresa se guardan en `localStorage` del navegador — no hay backend ni base
de datos compartida entre dispositivos.

## Estructura

```
index.html                     Interfaz (landing + login + SPA privada)
assets/css/styles.css           Estilos propios
assets/geo/colombia-departamentos.json  Límites departamentales (TopoJSON, MIT)
assets/js/knowledge.js          Marco normativo, jurisprudencia y reglas
assets/js/analyzer.js           Motor de análisis de riesgo del pliego
assets/js/docs.js               Redacción y exportación de la observación
assets/js/parsers.js            Extracción de texto de PDF/DOCX/TXT
assets/js/auth.js               Autenticación, sesión y gestión de usuarios
assets/js/secop.js              Cliente Socrata para SECOP 1/2 y PAA
assets/js/mapa.js               Choropleth del Mapa Nacional (DIVIPOLA)
assets/js/forensics.js          Motor de análisis forense (datos públicos)
assets/js/empresa.js            Perfil de empresa y Match Score
assets/js/empresa-docs.js       Extracción de documentos de empresa
assets/js/pipeline.js           CRM de oportunidades
assets/js/intel.js              Alertas y "pulso del mercado"
assets/js/cursos.js             Formación / cursos
assets/js/relatoria.js          Relatoría
assets/js/process-extractor.js  Extracción de datos del proceso
assets/js/tvec.js               Órdenes de compra TVEC
assets/js/core.js               Utilidades compartidas
assets/js/app.js                Controlador de interfaz y wiring de eventos
.github/workflows/pages.yml     Despliegue a GitHub Pages
modules/                        Pipeline Python/Streamlit (ver README_SECOP.md)
```

## Seguridad

La autenticación es **cliente-side** (SHA-256 vía Web Crypto). Es una
compuerta de acceso, no un sistema de seguridad criptográfico: alguien con
conocimientos técnicos podría inspeccionar el almacenamiento del
navegador. Para tu uso (despacho con clientes confiables) es suficiente;
si vas a vender esto a clientes nuevos y desconocidos, o a manejar
información sensible de terceros, hay que migrar a un backend con
autenticación y almacenamiento reales — ver la discusión de arquitectura
pendiente antes de comercializar.

## Aviso

LICITA es una herramienta de apoyo. El análisis y los documentos generados
deben ser revisados por un profesional del derecho antes de su radicación.
Los hallazgos del Análisis Forense son **indicios estadísticos sobre datos
públicos**, no prueba de irregularidad — deben verificarse por vías
institucionales (Contraloría, Fiscalía, Procuraduría) antes de cualquier
acción legal o comunicación.
