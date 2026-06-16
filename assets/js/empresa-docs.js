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
    let str = String(s || "").replace(/[^\d,.\-]/g, "");
    // Heurística: si tiene tanto . como , el . es separador de miles y , decimales
    if (str.indexOf(".") >= 0 && str.indexOf(",") >= 0) {
      if (str.lastIndexOf(".") > str.lastIndexOf(",")) {
        // formato 1,234.56
        str = str.replace(/,/g, "");
      } else {
        // formato 1.234,56
        str = str.replace(/\./g, "").replace(",", ".");
      }
    } else if (str.indexOf(",") >= 0 && str.indexOf(".") < 0) {
      // solo coma: si tiene >3 dígitos después es miles, si <=2 es decimal
      const parts = str.split(",");
      if (parts.length === 2 && parts[1].length <= 2) str = str.replace(",", ".");
      else str = str.replace(/,/g, "");
    }
    return Number(str) || 0;
  }

  /* Número en letras mapeado a magnitud aproximada (para certificados). */
  function letrasAValor(text) {
    const t = text.toLowerCase();
    const order = [
      { kw: ["mil millones", "mil millon"], factor: 1_000_000_000 },
      { kw: ["millones", "millon"],          factor: 1_000_000 },
      { kw: ["mil pesos", "mil"],            factor: 1_000 },
    ];
    for (const o of order) {
      for (const k of o.kw) {
        const idx = t.indexOf(k);
        if (idx >= 0) {
          // toma el número antes de la palabra
          const pre = t.slice(Math.max(0, idx - 60), idx);
          const numNames = {
            "un": 1, "uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
            "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
            "veinte": 20, "treinta": 30, "cuarenta": 40, "cincuenta": 50,
            "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90,
            "cien": 100, "ciento": 100, "doscientos": 200, "trescientos": 300,
            "cuatrocientos": 400, "quinientos": 500, "seiscientos": 600,
            "setecientos": 700, "ochocientos": 800, "novecientos": 900,
            "mil": 1000,
          };
          // Ignoramos "un"/"uno"/"una" porque suelen aparecer en frases
          // como "por un valor de…" y generan falsos positivos.
          let val = 0;
          Object.keys(numNames).forEach((n) => {
            if (n === "un" || n === "uno" || n === "una") return;
            const re = new RegExp("\\b" + n + "\\b");
            if (re.test(pre)) val += numNames[n];
          });
          if (val > 0) return val * o.factor;
        }
      }
    }
    return 0;
  }

  /* Match NIT colombiano: 8-10 dígitos opcionalmente con dígito verificación. */
  function findNIT(text) {
    const re = /\b(\d{3}\.?\d{3}\.?\d{3}|\d{8,10})\s*[-]\s*(\d)\b/i;
    const m = text.match(re);
    if (!m) return null;
    return m[1].replace(/\./g, "") + "-" + m[2];
  }

  /* Razón social: se busca cerca de los marcadores típicos en docs Colombia. */
  function findRazonSocial(text) {
    const patterns = [
      /raz[óo]n\s+social\s*(?:o\s+denominaci[óo]n)?\s*[:\s]+([A-Z0-9&.\-,\s]{6,120}?)(?=\s*(?:nit|tipo|registro|fecha|matr[íi]cula|c[óo]digo|sigla|objeto|domicilio|representante|capital|duraci|estado)[:\s]|\s*\n\s*\n)/i,
      /denominaci[óo]n[:\s]+([A-Z0-9&.\-,\s]{6,120}?)(?=\s*(?:nit|tipo|matr[íi]cula|objeto|domicilio))/i,
      /(?:nombre|razon)\s+(?:o\s+raz[óo]n\s+social)?\s*[:\s]+([A-Z0-9&.\-,\s]{6,90}?)(?=\s*(?:nit|tipo|matr[íi]cula|objeto))/i,
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
  function findFinancial(text, labelRegex) {
    const patterns = [
      new RegExp(labelRegex + "[^\\d$]{0,40}\\$?\\s*([\\d.,]+)\\s*(?:%|cop)?", "i"),
      new RegExp(labelRegex + "[\\s:]*\\$?([\\d.,]+)", "i"),
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const v = toNum(m[1]);
        if (v > 0) return v;
      }
    }
    return 0;
  }

  function findCity(text) {
    const m = text.match(/(?:ciudad|municipio|domicilio)[:\s]+([A-Za-zÁÉÍÓÚáéíóúÑñ\s.\-]{3,40}?)(?=\s*(?:departamento|cod|nit|tel|email|matricula|direcci))/i);
    return m ? clean(m[1]) : null;
  }

  function findDepto(text) {
    const m = text.match(/departamento[:\s]+([A-Za-zÁÉÍÓÚáéíóúÑñ\s.\-]{3,30}?)(?=\s*(?:ciudad|municipio|cod|nit|matricula|direcci))/i);
    return m ? clean(m[1]) : null;
  }

  function findRepresentante(text) {
    // Lookahead detiene la captura en el siguiente campo típico de los docs.
    const re = /(?:representante\s+legal|representante|gerente)\s*(?:principal)?\s*[:\s]+([A-Za-záéíóúñÁÉÍÓÚÑ.\s]{6,80}?)(?=\s+(?:domicilio|direcci[óo]n|nit|tipo|fecha|c[óo]digo|email|tel[ée]fono|raz[óo]n|matr[íi]cula|objeto|capital|c[ée]dula|identific|fechaActa)|\s*\n|$)/i;
    const m = text.match(re);
    if (!m) return null;
    const c = clean(m[1]);
    if (c.split(/\s+/).length < 2) return null;
    return c;
  }

  /* OBJETO SOCIAL · puede ser un párrafo largo. Captura hasta el siguiente
   * campo conocido o un salto significativo. */
  function findObjetoSocial(text) {
    const patterns = [
      /objeto\s+(?:social)?\s*[:\s]+([\s\S]{40,2500}?)(?=\b(?:duraci[óo]n|capital|domicilio|reformas|representante|administra|vigencia|matr[íi]cula|terminaci[óo]n|disoluci[óo]n|fecha\s+de\s+constituci|junta\s+directiva|reservas|sociedad\s+adicional)\b\s*[:\s])/i,
      /objeto\s+(?:principal)?\s*[:\s]+([\s\S]{40,2500}?)(?=\b(?:duraci[óo]n|capital|domicilio|reformas)\b\s*[:\s])/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const c = clean(m[1]);
        if (c.length > 30) return c.slice(0, 2000);
      }
    }
    return null;
  }

  /* Detecta sectores por palabras clave en objeto social o actividades. */
  function detectSectores(text) {
    const t = text.toLowerCase();
    const found = [];
    const map = {
      obras: ["obra civil", "construcción", "construccion", "infraestructura", "pavimento", "edificación", "edificacion", "vías", "vias", "puentes"],
      tecnologia: ["software", "tecnología de la información", "tecnologia de la informacion", "desarrollo de sistemas", "informática", "informatica", "tic", "datos", "internet"],
      suministros: ["suministro", "compraventa de bienes", "comercialización", "comercializacion", "ferretería", "ferreteria", "papelería", "papeleria"],
      consultoria: ["consultoría", "consultoria", "asesoría", "asesoria", "interventoría", "interventoria", "estudios técnicos", "estudios tecnicos"],
      aseo: ["aseo", "limpieza", "cafetería", "cafeteria", "mantenimiento"],
      vigilancia: ["vigilancia y seguridad", "servicios de seguridad", "guarda", "celaduría", "celaduria"],
      salud: ["servicios médicos", "servicios medicos", "salud", "hospitalario", "clínic", "clinic", "farmacéut", "farmaceut"],
      educacion: ["educación", "educacion", "capacitación", "capacitacion", "formación", "formacion", "enseñanza", "ensenanza"],
      catering: ["alimentación", "alimentacion", "catering", "restaurante", "comidas"],
      transporte: ["transporte", "logística", "logistica", "carga", "fletes"],
      juridica: ["servicios jurídicos", "servicios juridicos", "asesoría legal", "asesoria legal", "abogado"],
      publicidad: ["publicidad", "diseño gráfico", "diseno grafico", "comunicaciones", "mercadeo", "marketing"],
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
    // Sectores desde CIIU (actividad económica) o palabras clave
    const sectores = detectSectores(text);
    if (sectores.length) out.sectores = sectores;
    return out;
  }

  function extractRUP(text) {
    const out = {};
    const nit = findNIT(text);
    if (nit) out.nit = nit;
    const razon = findRazonSocial(text);
    if (razon) out.razonSocial = razon;
    // Indicadores financieros con múltiples variantes de etiqueta
    const patr = findFinancial(text, "patrimonio");
    if (patr > 0) out.patrimonio = patr;
    const cap = findFinancial(text, "capital\\s+de\\s+trabajo");
    if (cap > 0) out.capitalTrabajo = cap;
    const liq = findFinancial(text, "(?:raz[óo]n\\s+de\\s+)?liquidez|[íi]ndice\\s+de\\s+liquidez");
    if (liq > 0 && liq < 50) out.indiceLiquidez = liq;
    const end = findFinancial(text, "(?:nivel|raz[óo]n|[íi]ndice)\\s+de\\s+endeudamiento|endeudamiento");
    if (end > 0 && end < 100) out.indiceEndeudamiento = end;
    // Sectores por descripción + UNSPSC
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
    // Objeto social — captura larga con boundary inteligente
    const obj = findObjetoSocial(text);
    if (obj) out.objetoSocial = obj;
    // Sectores desde el objeto social (más rico que solo palabras)
    const sec = detectSectores((obj || "") + " " + text);
    if (sec.length) out.sectores = sec;
    // Capital social → patrimonio aproximado
    const capSoc = text.match(/capital\s+(?:social|suscrito|pagado|autorizado)\s*[:\s]*\$?\s*([\d.,]+)/i);
    if (capSoc) {
      const v = toNum(capSoc[1]);
      if (v > 1000) out.patrimonio = v;
    }
    return out;
  }

  /* ---------- NUEVO: CERTIFICADO DE EXPERIENCIA ---------- */

  function extractExperiencia(text) {
    const out = {};

    /* ENTIDAD certificadora */
    const entPatterns = [
      /(?:suscrit[oa]\s+(?:[a-záéíóúñ\s]+?\s+)?(?:de\s+la|de|del)\s+)([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.,&\-]{10,90}?)(?=\s*,?\s*(?:certific|hace\s+constar|expide)|\s+identificad)/i,
      /(?:la\s+(?:empresa|entidad|secretar[ií]a|alcald[ií]a|gobernaci[óo]n|ministerio|hospital|universidad)\s+)([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.,&\-]{8,90}?)(?=\s+(?:certific|hace|expide|nit))/i,
      /(?:^|\n)\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.,&\-]{10,80}?(?:S\.?A\.?S?\.?|LTDA\.?|E\.?S\.?P\.?|S\.?A\.?|MUNICIPIO|ALCALDIA|GOBERNACION|HOSPITAL|UNIVERSIDAD))/m,
    ];
    for (const p of entPatterns) {
      const m = text.match(p);
      if (m) { out.entidad = clean(m[1]); break; }
    }

    /* OBJETO del contrato */
    const objPatterns = [
      /(?:objeto\s+(?:del\s+contrato|fue|es|del\s+convenio)|contrato\s+cuyo\s+objeto\s+(?:es|fue))[:\s]*["']?([^"']{20,500}?)(?=["']|\.\s*[A-Z(]|\s+valor|\s+fecha|\s+plazo|\s+duraci|\s+terminaci|\s+por\s+un\s+valor)/i,
      /ejecut[óo]\s+(?:el\s+(?:contrato|convenio)\s+(?:no\.?\s*[\w\-]+\s+)?(?:cuyo\s+objeto\s+(?:fue|es)\s*[:\s]*)?)["']?([^"']{20,500}?)(?=["']|\.\s*[A-Z(]|\s+valor|\s+por\s+un)/i,
      /(?:consistente\s+en|tuvo\s+por\s+objeto)\s*[:\s]*["']?([^"']{20,500}?)(?=["']|\.\s|valor|plazo)/i,
    ];
    for (const p of objPatterns) {
      const m = text.match(p);
      if (m && m[1].length > 15) { out.objeto = clean(m[1]); break; }
    }

    /* VALOR del contrato */
    const valPatterns = [
      /(?:valor|cuant[íi]a|monto)(?:\s+del\s+contrato|\s+total)?\s*[:\s]*\$\s*([\d.,]+)/i,
      /por\s+un\s+valor\s+(?:de|total\s+de)\s+\$\s*([\d.,]+)/i,
      /\$\s*([\d.,]+)\s*(?:M|millones|COP|m\.?\s*cte)/i,
    ];
    for (const p of valPatterns) {
      const m = text.match(p);
      if (m) {
        const v = toNum(m[1]);
        if (v > 1_000) { out.valor = v; break; }
      }
    }
    // Si no se halló, intentar con valor escrito en letras
    if (!out.valor) {
      const v = letrasAValor(text);
      if (v > 0) out.valor = v;
    }

    /* AÑO de ejecución / firma */
    // Buscamos el año más reciente entre los mencionados
    const years = (text.match(/\b(19[89]\d|20[0-3]\d)\b/g) || []).map(Number);
    if (years.length) {
      // Ignorar años obviamente fuera de rango realista
      const validYears = years.filter((y) => y >= 1995 && y <= 2030);
      if (validYears.length) out.anio = Math.max(...validYears);
    }

    return out;
  }

  /* Auto-detección del tipo de documento por encabezados. */
  function detectType(text) {
    const t = text.toLowerCase();
    if (/registro\s+[úu]nico\s+tributario|dian/.test(t) && /\bnit\b/.test(t)) return "rut";
    if (/registro\s+[úu]nico\s+de\s+proponentes|\brup\b/.test(t) || /indicadores\s+financieros/.test(t)) return "rup";
    if (/c[áa]mara\s+de\s+comercio|existencia\s+y\s+representaci[óo]n\s+legal/.test(t)) return "camara";
    if (/(?:certifica(?:do)?\s+(?:de\s+)?(?:cumplimiento|experiencia|ejecuci[óo]n)|hace\s+constar)/.test(t)) return "experiencia";
    return null;
  }

  function extract(docType, text) {
    const t = docType || detectType(text);
    if (t === "rut")         return Object.assign({ _type: "rut" },         extractRUT(text));
    if (t === "rup")         return Object.assign({ _type: "rup" },         extractRUP(text));
    if (t === "camara")      return Object.assign({ _type: "camara" },      extractCamara(text));
    if (t === "experiencia") return Object.assign({ _type: "experiencia" }, extractExperiencia(text));
    return { _type: "unknown" };
  }

  return { extract, extractRUT, extractRUP, extractCamara, extractExperiencia, detectType };
})();
