/* LICITA · Extractor de puntos clave del proceso
 *
 * Toma el texto del pliego (cargado vía pdf.js o mammoth) y extrae con
 * regex especializadas los datos jurídicamente relevantes del proceso:
 *
 *   - Número del proceso              · presupuesto oficial
 *   - Entidad contratante             · plazo de ejecución
 *   - Objeto del contrato             · cronograma
 *   - Modalidad de selección          · garantías exigidas
 *   - Lugar de ejecución              · indicadores financieros
 *   - Experiencia mínima requerida    · capacidad organizacional
 *
 * No es OCR; si el PDF es imagen pura, no extrae. Pero sobre PDFs y
 * documentos Word con texto embebido, captura 80%+ de los campos.
 */
window.LICITA = window.LICITA || {};

LICITA.processExtractor = (function () {
  "use strict";

  function clean(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function toNum(s) {
    if (typeof s === "number") return s;
    let str = String(s || "").replace(/[^\d,.\-]/g, "");
    if (!str) return 0;
    if (str.indexOf(".") >= 0 && str.indexOf(",") >= 0) {
      if (str.lastIndexOf(".") > str.lastIndexOf(",")) {
        str = str.replace(/,/g, "");
      } else {
        str = str.replace(/\./g, "").replace(",", ".");
      }
    } else if (str.indexOf(",") >= 0) {
      const parts = str.split(",");
      if (parts.length === 2 && parts[1].length <= 2) str = str.replace(",", ".");
      else str = str.replace(/,/g, "");
    }
    return Math.round(Number(str) || 0);
  }

  function extractProceso(text) {
    const patterns = [
      /(?:proceso|invitaci[óo]n|licitaci[óo]n|concurso|selecci[óo]n)\s*(?:no\.?|n[úu]mero|#)?\s*[:\s]*([A-Z]{2,}[\-\s\.][A-Z0-9\-\.\s]{4,40})/i,
      /n[úu]mero\s+de\s+proceso[:\s]+([A-Z0-9\-\.\s\/]{6,40})/i,
      /(?:^|\n)\s*(?:Proceso|Radicado)[:\s]+([A-Z0-9\-\.\s]{6,40})\s*(?:\n|$)/m,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        let id = clean(m[1]).replace(/\s+/g, "-").toUpperCase();
        if (id.length >= 4 && id.length <= 60) return id;
      }
    }
    return null;
  }

  function extractEntidad(text) {
    const patterns = [
      /(?:entidad\s+(?:contratante|estatal|p[úu]blica)|entidad\s+que\s+contrata)[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ\s.,&\-]{8,150}?)(?=\s*(?:NIT|domicilio|direcci|tel[ée]fono|representante|sigla|c[óo]digo)\b)/i,
      /(?:^|\n)\s*(?:Entidad|Contratante)[:\s]+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.,&\-]{8,150}?)(?=\s*(?:\n|NIT|nit|—))/m,
      /(?:^|\n)\s*((?:ALCALD[ÍI]A|GOBERNACI[ÓO]N|MINISTERIO|SECRETAR[ÍI]A|HOSPITAL|UNIVERSIDAD|INSTITUTO|EMPRESA\s+SOCIAL|EMPRESA\s+DE\s+SERVICIOS)[\s\wÁÉÍÓÚÑáéíóúñ.,&\-]{6,120})/m,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const c = clean(m[1]);
        if (c.length > 8) return c;
      }
    }
    return null;
  }

  function extractObjeto(text) {
    const patterns = [
      /objeto\s+(?:del\s+(?:contrato|proceso))?\s*[:\s]+["']?([^"'\n]{30,800}?)(?=["']|\.\s+[A-Z]|\s+(?:presupuesto|plazo|duraci|cronograma|cuant[íi]a|valor\s+estimado|modalidad)\b)/i,
      /objeto\s+a\s+contratar[:\s]+([^\n]{20,500})/i,
      /(?:el\s+presente\s+(?:proceso|contrato)\s+tiene\s+por\s+objeto)\s+([^.]{20,500}\.)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const c = clean(m[1]).replace(/\s+\d+\s*$/, "");
        if (c.length > 20) return c.slice(0, 600);
      }
    }
    return null;
  }

  function extractModalidad(text) {
    const t = text.toLowerCase();
    const map = [
      { rx: /licitaci[óo]n\s+p[úu]blica/, label: "Licitación Pública", key: "licitacion" },
      { rx: /selecci[óo]n\s+abreviada\s+(?:de\s+)?menor\s+cuant[íi]a/, label: "Selección Abreviada - Menor Cuantía", key: "seleccion_abreviada" },
      { rx: /selecci[óo]n\s+abreviada\s+(?:por\s+)?subasta\s+inversa/, label: "Selección Abreviada - Subasta Inversa", key: "seleccion_abreviada" },
      { rx: /selecci[óo]n\s+abreviada/, label: "Selección Abreviada", key: "seleccion_abreviada" },
      { rx: /m[íi]nima\s+cuant[íi]a/, label: "Mínima Cuantía", key: "minima_cuantia" },
      { rx: /concurso\s+de\s+m[ée]ritos\s+abierto/, label: "Concurso de Méritos Abierto", key: "concurso_meritos" },
      { rx: /concurso\s+de\s+m[ée]ritos/, label: "Concurso de Méritos", key: "concurso_meritos" },
      { rx: /contrataci[óo]n\s+directa/, label: "Contratación Directa", key: "contratacion_directa" },
      { rx: /r[ée]gimen\s+especial/, label: "Régimen Especial", key: "contratacion_directa" },
    ];
    for (const m of map) {
      if (m.rx.test(t)) return { label: m.label, key: m.key };
    }
    return null;
  }

  function extractPresupuesto(text) {
    const patterns = [
      /presupuesto\s+(?:oficial|estimado|del\s+proceso)\s*(?:\(po\))?\s*[:\s]*\$?\s*([\d.,]+)/i,
      /valor\s+(?:estimado|del\s+contrato|del\s+proceso|total)\s*[:\s]*\$?\s*([\d.,]+)/i,
      /cuant[íi]a\s+(?:del\s+contrato|estimada)?\s*[:\s]*\$?\s*([\d.,]+)/i,
      /\$\s*([\d.,]+)\s*(?:m\.?\s*cte|COP|pesos|m\/cte)/i,
      /(?:el\s+presupuesto|presupuesto)\s+(?:asciende\s+a|es\s+(?:la\s+suma\s+)?de)\s+\$?\s*([\d.,]+)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const v = toNum(m[1]);
        if (v >= 1000000) return v;
      }
    }
    return 0;
  }

  function extractPlazo(text) {
    const patterns = [
      /plazo\s+(?:de\s+ejecuci[óo]n|del\s+contrato)\s*[:\s]+(\d{1,4})\s*(d[íi]as?(?:\s+(?:h[áa]biles|calendario))?|meses|a[ñn]os)/i,
      /duraci[óo]n\s+(?:del\s+contrato|del\s+proceso)?\s*[:\s]+(\d{1,4})\s*(d[íi]as?|meses|a[ñn]os)/i,
      /(\d{1,4})\s*(d[íi]as\s+(?:h[áa]biles|calendario)|meses)\s+(?:contados|a\s+partir|para\s+(?:la\s+)?ejecuci)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        return { cantidad: Number(m[1]), unidad: m[2].toLowerCase().replace(/\s+/g, " ") };
      }
    }
    return null;
  }

  function extractLugar(text) {
    const patterns = [
      /lugar\s+de\s+ejecuci[óo]n\s*[:\s]+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s,.\-]{4,80}?)(?=\s*(?:\n|fecha|plazo|cronograma|presupuesto|valor|departamento\b))/i,
      /lugar\s+de\s+entrega\s*[:\s]+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s,.\-]{4,80}?)(?=\s*(?:\n|fecha|plazo))/i,
      /(?:municipio|ciudad)\s+de\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\-\s]{3,40})\s*(?:,|\s+departamento)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const c = clean(m[1]);
        if (c.length > 3 && c.length < 120) return c;
      }
    }
    return null;
  }

  function extractFechas(text) {
    const out = {};
    const fechaRx = "(\\d{1,2}\\s*(?:de\\s+)?(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-zóé]*\\s*(?:de|del)?\\s*20\\d{2}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}\\/\\d{1,2}\\/20\\d{2})";
    const eventos = [
      { key: "publicacion",  rx: new RegExp("(?:fecha\\s+de\\s+)?publicaci[óo]n\\s*(?:del\\s+(?:pliego|proyecto))?[:\\s]+" + fechaRx, "i") },
      { key: "observaciones", rx: new RegExp("(?:plazo|fecha)\\s+(?:para\\s+)?(?:presentar\\s+)?observaciones[:\\s]+" + fechaRx, "i") },
      { key: "cierre",       rx: new RegExp("(?:fecha\\s+(?:l[íi]mite\\s+)?(?:de|para)\\s+)?(?:cierre|recepci[óo]n\\s+de\\s+ofertas|presentaci[óo]n\\s+de\\s+(?:ofertas|propuestas))[:\\s]+" + fechaRx, "i") },
      { key: "evaluacion",   rx: new RegExp("(?:informe|periodo)\\s+de\\s+evaluaci[óo]n[:\\s]+" + fechaRx, "i") },
      { key: "adjudicacion", rx: new RegExp("adjudicaci[óo]n[:\\s]+" + fechaRx, "i") },
    ];
    eventos.forEach((e) => {
      const m = text.match(e.rx);
      if (m) out[e.key] = clean(m[1]);
    });
    return Object.keys(out).length ? out : null;
  }

  function extractGarantias(text) {
    const out = {};
    const seriedad = text.match(/p[óo]liza\s+de\s+seriedad(?:\s+de\s+la\s+(?:oferta|propuesta))?\s*[:\s]+([^.]{10,200})/i);
    if (seriedad) out.seriedad = clean(seriedad[1]);
    const cumplimiento = text.match(/(?:garant[íi]a\s+de\s+)?cumplimiento\s*[:\s]+([^.]{10,200})/i);
    if (cumplimiento) out.cumplimiento = clean(cumplimiento[1]);
    const calidad = text.match(/(?:garant[íi]a\s+de\s+)?calidad(?:\s+(?:del\s+bien|del\s+servicio))?\s*[:\s]+([^.]{10,200})/i);
    if (calidad) out.calidad = clean(calidad[1]);
    const responsabilidad = text.match(/responsabilidad\s+civil\s+extracontractual\s*[:\s]+([^.]{10,200})/i);
    if (responsabilidad) out.responsabilidadCivil = clean(responsabilidad[1]);
    return Object.keys(out).length ? out : null;
  }

  function extractExperiencia(text) {
    const out = {};
    const smmlv = text.match(/experiencia[^.]*?(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:veces\s+(?:el\s+)?)?smmlv/i);
    if (smmlv) out.smmlv = Number(smmlv[1].replace(",", "."));
    const pct = text.match(/experiencia[^.]*?(\d{1,3})\s*%\s*(?:del\s+)?(?:presupuesto|valor\s+oficial|po)/i);
    if (pct) out.porcentajePresupuesto = Number(pct[1]);
    const contratos = text.match(/(?:m[áa]ximo|mínimo)?\s*(\d{1,3})\s+contratos?\s+(?:similares|ejecutados|terminados)/i);
    if (contratos) out.numeroContratos = Number(contratos[1]);
    const anios = text.match(/(\d{1,2})\s+a[ñn]os?\s+de\s+experiencia/i);
    if (anios) out.aniosExperiencia = Number(anios[1]);
    return Object.keys(out).length ? out : null;
  }

  function extractIndicadores(text) {
    const out = {};
    const find = (label) => {
      const rx = new RegExp(label + "[^\\d]{0,30}([\\d.,]+|\\d+\\s*%)", "i");
      const m = text.match(rx);
      if (!m) return null;
      const v = m[1].replace(/\s/g, "");
      return v.indexOf("%") >= 0 ? Number(v.replace(/[^\d.,]/g, "")) : toNum(v);
    };
    const patr = find("patrimonio");
    if (patr) out.patrimonio = patr;
    const cap = find("capital\\s+de\\s+trabajo");
    if (cap) out.capitalTrabajo = cap;
    const liq = find("(?:[íi]ndice\\s+de\\s+)?liquidez");
    if (liq != null && liq < 50) out.liquidez = liq;
    const end = find("(?:[íi]ndice\\s+de\\s+)?endeudamiento");
    if (end != null && end < 100) out.endeudamiento = end;
    return Object.keys(out).length ? out : null;
  }

  function extractAll(text) {
    const txt = (text || "").trim();
    if (!txt) return null;
    const corpus = txt.slice(0, 200000);
    return {
      proceso: extractProceso(corpus),
      entidad: extractEntidad(corpus),
      objeto: extractObjeto(corpus),
      modalidad: extractModalidad(corpus),
      presupuesto: extractPresupuesto(corpus),
      plazo: extractPlazo(corpus),
      lugar: extractLugar(corpus),
      cronograma: extractFechas(corpus),
      garantias: extractGarantias(corpus),
      experiencia: extractExperiencia(corpus),
      indicadores: extractIndicadores(corpus),
      _corpusSize: txt.length,
      _extractedAt: new Date().toISOString(),
    };
  }

  function coverage(extracted) {
    if (!extracted) return 0;
    const fields = ["proceso", "entidad", "objeto", "modalidad", "presupuesto",
      "plazo", "lugar", "cronograma", "garantias", "experiencia", "indicadores"];
    let hit = 0;
    fields.forEach((f) => {
      const v = extracted[f];
      if (v != null && v !== 0 && v !== "" &&
          !(typeof v === "object" && Object.keys(v).length === 0)) hit++;
    });
    return Math.round((hit / fields.length) * 100);
  }

  return { extractAll, coverage };
})();
