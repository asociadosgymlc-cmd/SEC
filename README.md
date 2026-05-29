# LICITA · IA para Contratación Pública Colombiana

LICITA es una aplicación web que asiste el análisis jurídico de procesos de
contratación pública en Colombia: carga un pliego, detecta riesgos jurídicos
en los requisitos, los contrasta contra el marco normativo y redacta una
observación lista para radicar.

## Acceso

LICITA gestiona usuarios con dos roles:

- **Administrador** — administra clientes, ve el monitoreo y todas las
  funciones de la plataforma.
- **Cliente** — accede al dashboard, al análisis, a su historial y al
  marco normativo. Solo ve sus propios análisis.

**Credenciales del administrador (por defecto):**

| Usuario | Contraseña    |
|---------|---------------|
| `admin` | `licita2026`  |

> ⚠️ Cambia esta contraseña en `Clientes → Cambiar clave` apenas entres.

Para registrar a un cliente: inicia sesión como admin → **Clientes → Nuevo
cliente**. La plataforma generará una contraseña aleatoria que puedes
copiar y entregar.

## Funcionalidades

| Pantalla | Funcionalidad |
|----------|---------------|
| **Landing pública** | Hero, alianzas normativas, funcionalidades, estadísticas, testimonios, precios, contacto y footer. |
| **Login** | Pantalla split con marca + formulario, mostrar/ocultar contraseña, retorno a landing. |
| **Dashboard** | Estadísticas dinámicas, procesos en seguimiento, distribución de riesgo y accesos rápidos. |
| **Análisis de Pliego** | Carga de PDF / DOCX / TXT con extracción de texto, formulario del requisito objetado y escaneo del pliego completo. |
| **Resultados** | Nivel de riesgo con medidor, análisis jurídico por hallazgo, criterios jurisprudenciales y observación redactada (copiar / descargar Word). |
| **Historial** | Análisis guardados por usuario, con opción de reabrirlos. |
| **Marco Normativo** | Normas y criterios jurisprudenciales que aplica el motor. |
| **Clientes (admin)** | Crear, editar, activar/desactivar, restablecer contraseña y eliminar clientes. |
| **Monitoreo (admin)** | Estadísticas globales, actividad reciente de todos los clientes y análisis por cliente. |

## Cómo funciona

El motor (`assets/js/analyzer.js`) contrasta el texto del requisito contra un
conjunto de reglas (`assets/js/knowledge.js`) que detectan patrones de riesgo
frecuentes en pliegos colombianos:

- Exigencia de vinculación laboral exclusiva del personal.
- Experiencia o indicadores financieros desproporcionados.
- Exigencia de marca o referencia determinada.
- Restricciones por domicilio geográfico.
- Plazos insuficientes y especificaciones ambiguas.

Cada hallazgo suma un puntaje de riesgo (Bajo · Medio · Alto · Crítico),
cita el fundamento normativo y genera el petitorio correspondiente.

## Ejecutar

Es una aplicación 100 % estática. Basta con servir la carpeta:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

También puede abrirse `index.html` directamente en el navegador.

Las librerías de lectura de archivos (pdf.js, mammoth) y los estilos (Tailwind)
se cargan desde CDN, por lo que la primera carga requiere conexión a internet.
El historial y los procesos se guardan en `localStorage` del navegador.

## Estructura

```
index.html                Interfaz (landing + login + SPA privada)
assets/css/styles.css      Estilos propios
assets/js/knowledge.js     Marco normativo, jurisprudencia y reglas
assets/js/analyzer.js      Motor de análisis de riesgo
assets/js/docs.js          Redacción y exportación de la observación
assets/js/parsers.js       Extracción de texto de PDF/DOCX/TXT
assets/js/auth.js          Autenticación, sesión y gestión de usuarios
assets/js/app.js           Controlador de interfaz
.github/workflows/pages.yml Despliegue a GitHub Pages
```

## Seguridad

La autenticación es **cliente-side** (SHA-256 vía Web Crypto). Es una
compuerta de acceso, no un sistema de seguridad criptográfico: alguien con
conocimientos técnicos podría inspeccionar el almacenamiento del
navegador. Para tu uso (despacho con clientes confiables) es suficiente;
si en el futuro necesitas seguridad fuerte, hay que migrar a un backend.

## Aviso

LICITA es una herramienta de apoyo. El análisis y los documentos generados
deben ser revisados por un profesional del derecho antes de su radicación.
