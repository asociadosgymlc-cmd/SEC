/* LICITA · Extractor de RUT / RUP / Cámara de Comercio
 *
 * Toma texto extraído de un PDF (con pdf.js / parsers.js) y aplica
 * heurísticas regex específicas a cada tipo de documento para recuperar
 * los campos clave del perfil empresarial.
 *
 * NO es OCR perfecto: si el documento es una imagen escaneada sin texto
 * embebido, no podrá extraer. El usuario siempre ve un preview antes de
 * aplicar al perfil.
 */
window.LICITA = window.LICITA || {};

LICITA.empresaDocs = (function () {
  "use strict";

  function clean(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function toNum(s) {
    if (typeof s === "number") return s;
    const n = String(s || "").replace(/[^\d,.\-]/g, "").replace(/\./g, "").replace(",", ".");
    return Number(n) || 0;
  }

  /* Match NIT colombiano: 8-10 dígitos opcionalmente con dígito verificación. */
  function findNIT(text) {
    const re = /\b(\d{3}\.?\d{3}\.?\d{3}|\d{8,10})\s*-?\s*(\d)\b/i;
    const m = text.match(re);
    if (!m) return null;
    return m[1].replace(/\./g, "") + "-" + m[2];
  }

  /* Razón social: se busca cerca de los marcadores típicos en docs Colombia. */
  function findRazonSocial(text) {
    const patterns = [
      /raz[óo]n\s+social[:\s]*([A-Z0-9\s&.\-,]{6,90}?)(?=\n|nit|tipo|registro|fecha)/i,
      /denominaci[óo]n[:\s]*([A-Z0-9\s&.\-,]{6,90}?)(?=\n|nit|tipo|registro)/i,
      /nombre[:\s]*([A-Z0-9\s&.\-,]{6,90}?)(?=\n|nit|tipo)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const c = clean(m[1])
          .replace(/\bS\.?\s*A\.?\s*S\.?$/i, "S.A.S")
          .replace(/\bL\.?\s*T\.?\s*D\.?\s*A\.?$/i, "LTDA");
        if (c.length > 5) return c;
      }
    }
    return null;
  }

  /* Indicador financiero del RUP. Acepta varios separadores y formatos. */
  function findFinancial(text, label) {
    const re = new RegExp(label + "[\\s:]*([\\d.,\\s]+)", "i");
    const m = text.match(re);
    if (!m) return 0;
    return toNum(m[1]);
  }

  /* Dirección y municipio (RUT y Cámara). */
  function findCity(text) {
    const m = text.match(/(?:ciudad|municipio|domicilio)[:\s]*([A-Za-zÁÉÍÓÚáéíóúÑñ\s.\-]{3,40}?)(?=\n|departamento|cod|nit)/i);
    return m ? clean(m[1]) : null;
  }

  function findDepto(text) {
    const m = text.match(/departamento[:\s]*([A-Za-zÁÉÍÓÚáéíóúÑñ\s.\-]{3,30}?)(?=\n|ciudad|municipio|cod|nit)/i);
    return m ? clean(m[1]) : null;
  }

  function findRepresentante(text) {
    // Lookahead detiene la captura en el siguiente campo típico de los docs.
    const re = /(?:representante\s+legal|representante|gerente)[:\s]*([A-Za-záéíóúñÁÉÍÓÚÑ.\s]{6,80}?)(?=\s+(?:domicilio|direcci[óo]n|nit|tipo|fecha|c[óo]digo|email|tel[ée]fono|raz[óo]n|matr[íi]cula|objeto|capital)|\s*\n|$)/i;
    const m = text.match(re);
    if (!m) return null;
    const c = clean(m[1]);
    if (c.split(/\s+/).length < 2) return null;
    return c;
  }

  function findObjetoSocial(text) {
    const m = text.match(/objeto\s+social[:\s]*(.{30,500}?)(?=duraci[óo]n|capital|representante|fecha|domicilio)/i);
    return m ? clean(m[1]).slice(0, 400) : null;
  }

  /* Detecta sectores por palabras clave en objeto social o actividades. */
  function detectSectores(text) {
    const t = text.toLowerCase();
    const found = [];
    const map = {
      obras: ["obra civil", "construcción", "construccion", "infraestructura", "pavimento", "edificación", "edificacion"],
      tecnologia: ["software", "tecnología de la información", "tecnologia de la informacion", "desarrollo de sistemas", "informática", "informatica"],
      suministros: ["suministro", "compraventa de bienes", "comercialización", "comercializacion"],
      consultoria: ["consultoría", "consultoria", "asesoría", "asesoria", "interventoría", "interventoria"],
      aseo: ["aseo", "limpieza", "cafetería", "cafeteria"],
      vigilancia: ["vigilancia y seguridad", "servicios de seguridad", "guarda"],
      salud: ["servicios médicos", "servicios medicos", "salud", "hospitalario"],
      educacion: ["educación", "educacion", "capacitación", "capacitacion"],
      catering: ["alimentación", "alimentacion", "catering"],
      transporte: ["transporte", "logística", "logistica"],
      juridica: ["servicios jurídicos", "servicios juridicos", "asesoría legal", "asesoria legal"],
      publicidad: ["publicidad", "diseño gráfico", "diseno grafico"],
    };
    Object.keys(map).forEach((k) => {
      if (map[k].some((kw) => t.includes(kw))) found.push(k);
    });
    return found;
  }

  /* ---------- EXTRACTORES POR TIPO DE DOCUMENTO ---------- */

  function extractRUT(text) {
    const out = {};
    const nit = findNIT(text);
    if (nit) out.nit = nit;
    const razon = findRazonSocial(text);
    if (razon) out.razonSocial = razon;
    if (/persona\s+natural/i.test(text)) out.tipo = "natural";
    else if (/persona\s+jur[ií]dica/i.test(text) || /raz[óo]n\s+social/i.test(text)) out.tipo = "juridica";
    const ciudad = findCity(text);
    if (ciudad) out.ciudad = ciudad;
    const dpto = findDepto(text);
    if (dpto) out.departamentos = [dpto.replace(/^([a-z])/, (m) => m.toUpperCase())];
    return out;
  }

  function extractRUP(text) {
    const out = {};
    const nit = findNIT(text);
    if (nit) out.nit = nit;
    const razon = findRazonSocial(text);
    if (razon) out.razonSocial = razon;
    // Indicadores financieros típicos
    const patr = findFinancial(text, "patrimonio");
    if (patr > 0) out.patrimonio = patr;
    const cap = findFinancial(text, "capital\\s+de\\s+trabajo");
    if (cap > 0) out.capitalTrabajo = cap;
    const liqM = text.match(/(?:raz[óo]n\s+de\s+)?liquidez[\s:]+([\d.,]+)/i);
    if (liqM) {
      const v = Number(liqM[1].replace(",", "."));
      if (v > 0 && v < 50) out.indiceLiquidez = v;
    }
    const endM = text.match(/(?:nivel|raz[óo]n)\s+de\s+endeudamiento[\s:]+([\d.,]+)\s*%?/i);
    if (endM) {
      const v = Number(endM[1].replace(",", "."));
      if (v > 0 && v < 100) out.indiceEndeudamiento = v;
    }
    // Sectores por descripción de actividades
    const sec = detectSectores(text);
    if (sec.length) out.sectores = sec;
    return out;
  }

  function extractCamara(text) {
    const out = {};
    const nit = findNIT(text);
    if (nit) out.nit = nit;
    const razon = findRazonSocial(text);
    if (razon) out.razonSocial = razon;
    const rep = findRepresentante(text);
    if (rep) out.representanteLegal = rep;
    const ciudad = findCity(text);
    if (ciudad) out.ciudad = ciudad;
    const dpto = findDepto(text);
    if (dpto) out.departamentos = [dpto.replace(/^([a-z])/, (m) => m.toUpperCase())];
    const obj = findObjetoSocial(text);
    if (obj) out.objetoSocial = obj;
    const sec = detectSectores(text);
    if (sec.length) out.sectores = sec;
    // Capital social ~ patrimonio aproximado
    const capSoc = text.match(/capital\s+(?:social|suscrito|pagado)[\s:]*\$?\s*([\d.,]+)/i);
    if (capSoc) {
      const v = toNum(capSoc[1]);
      if (v > 1000) out.patrimonio = v;
    }
    return out;
  }

  /* Auto-detección del tipo de documento por encabezados. */
  function detectType(text) {
    const t = text.toLowerCase();
    if (/registro\s+[úu]nico\s+tributario|dian/.test(t) && /\bnit\b/.test(t)) return "rut";
    if (/registro\s+[úu]nico\s+de\s+proponentes|\brup\b/.test(t)) return "rup";
    if (/c[áa]mara\s+de\s+comercio|existencia\s+y\s+representaci[óo]n\s+legal/.test(t)) return "camara";
    return null;
  }

  function extract(docType, text) {
    const t = docType || detectType(text);
    if (t === "rut")    return Object.assign({ _type: "rut" },    extractRUT(text));
    if (t === "rup")    return Object.assign({ _type: "rup" },    extractRUP(text));
    if (t === "camara") return Object.assign({ _type: "camara" }, extractCamara(text));
    return { _type: "unknown" };
  }

  return { extract, extractRUT, extractRUP, extractCamara, detectType };
})();
