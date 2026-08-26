# MG PRO S.A.S — sitio comercial

Landing de captación para MG PRO S.A.S: facility management (mantenimiento
locativo, aseo institucional, dotación) + asesoría en contratación pública
SECOP II.

- `index.html` — sitio completo (una sola página, sin dependencias de build).
- `guia-secop-ii.html` — guía descargable que se entrega como imán de leads.

Publicado en `https://asociadosgymlc-cmd.github.io/SEC/mgpro/`.

---

## 1. Lo único que hay que configurar

Abra `index.html`, busque el bloque `const CONFIG` (cerca del final del
archivo) y cambie estos cuatro valores:

```js
const CONFIG = {
  whatsapp: "573000000000",              // ← número real: código país + número, sin + ni espacios
  correo:   "comercial@mgprosas.com",    // ← correo comercial real
  endpoint: "",                          // ← dónde se guardan las solicitudes (ver abajo)
  ga4:      "",                          // ← opcional: "G-XXXXXXXXXX" de Google Analytics
  guia:     "guia-secop-ii.html"
};
```

Cambie además, en el HTML, los datos que hoy son de ejemplo:
NIT del footer y del modal de datos, dirección de la sede, y los valores de
los planes si las tarifas son otras.

## 2. Dónde llegan las solicitudes

El sitio **funciona sin servidor**: aunque `endpoint` esté vacío, ninguna
solicitud se pierde.

| Situación | Qué pasa |
|---|---|
| `endpoint` configurado | La solicitud se envía al servicio y el cliente ve la confirmación normal. |
| `endpoint` vacío o el envío falla | La solicitud se guarda en el navegador del cliente y la pantalla de éxito le ofrece **confirmar por WhatsApp** (mensaje ya redactado con todos sus datos) o **enviarla por correo**. |

Siempre, además, queda una copia local exportable: pulse **Ctrl + Shift + L**
en el sitio (o abra la URL con `#leads`) y se descarga un CSV con las
solicitudes registradas en ese navegador.

### Opciones de `endpoint`

- **Google Apps Script** (gratis, guarda en Google Sheets)
  Cree un Apps Script vinculado a una hoja, publique como aplicación web con
  acceso "cualquier persona" y pegue la URL `.../exec`. El sitio envía JSON
  como `text/plain`, así que su `doPost(e)` lee `JSON.parse(e.postData.contents)`.
- **Formspree** — pegue `https://formspree.io/f/xxxxxxx`. Se detecta solo y
  envía en formato JSON.
- **FormSubmit** — pegue `https://formsubmit.co/ajax/su-correo@dominio.com`.

## 3. Imágenes

Las fotos del hero y de los servicios apuntan hoy a un host externo temporal
(`image.qwenlm.ai`). **Reemplácelas por fotos reales de MG PRO**: suba las
imágenes a este mismo repositorio y cambie los `src`. Si una imagen no carga,
el sitio la oculta automáticamente sin romper el diseño, pero fotos propias
venden mucho más que fotos genéricas.

## 4. Qué mide

Cada acción relevante emite un evento a `window.dataLayer` (y a Google
Analytics 4 si configuró `ga4`): `hero_cotizar`, `hero_whatsapp`,
`cotizador_servicio`, `cotizador_frecuencia`, `cotizar_linea`,
`estimado_adjuntado`, `estimado_descargado`, `plan_seleccionado`,
`guia_solicitada`, `modal_salida_mostrado`, `faq_abierta`,
`form_error_validacion`, `lead_enviado`.

## 5. Aviso sobre las cifras

Las estadísticas, casos y testimonios del sitio son el material comercial
entregado por MG PRO. Los valores del cotizador y de los planes son
**estimados de referencia**, no ofertas vinculantes, y así se advierte en el
sitio. Revise que cada cifra publicada sea sustentable antes de salir a
producción.
