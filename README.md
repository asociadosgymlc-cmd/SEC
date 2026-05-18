# LICITA · IA para Contratación Pública Colombiana

LICITA es una aplicación web que asiste el análisis jurídico de procesos de
contratación pública en Colombia: carga un pliego, detecta riesgos jurídicos
en los requisitos, los contrasta contra el marco normativo y redacta una
observación lista para radicar.

## Funcionalidades

| Pantalla | Funcionalidad |
|----------|---------------|
| **Dashboard** | Estadísticas dinámicas, procesos en seguimiento, distribución de riesgo y accesos rápidos. |
| **Análisis de Pliego** | Carga de PDF / DOCX / TXT con extracción de texto, formulario del requisito objetado y escaneo del pliego completo. |
| **Resultados** | Nivel de riesgo con medidor, análisis jurídico por hallazgo, criterios jurisprudenciales y observación redactada (copiar / descargar Word). |
| **Historial** | Análisis guardados localmente, con opción de reabrirlos. |
| **Marco Normativo** | Normas y criterios jurisprudenciales que aplica el motor. |

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
index.html               Interfaz (SPA)
assets/css/styles.css     Estilos propios
assets/js/knowledge.js    Marco normativo, jurisprudencia y reglas
assets/js/analyzer.js     Motor de análisis de riesgo
assets/js/docs.js         Redacción y exportación de la observación
assets/js/parsers.js      Extracción de texto de PDF/DOCX/TXT
assets/js/app.js          Controlador de interfaz
```

## Aviso

LICITA es una herramienta de apoyo. El análisis y los documentos generados
deben ser revisados por un profesional del derecho antes de su radicación.
