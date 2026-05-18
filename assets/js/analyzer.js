/* LICITA · Motor de análisis jurídico
 * Contrasta el texto de un requisito (o de un pliego completo) contra las
 * reglas de la base de conocimiento y produce un dictamen estructurado.
 */
window.LICITA = window.LICITA || {};

LICITA.analyzer = (function () {
  "use strict";

  const K = LICITA.knowledge;

  const RISK = {
    NONE: { label: "Sin hallazgos", color: "emerald", score: 0 },
    LOW: { label: "Bajo", color: "emerald" },
    MEDIUM: { label: "Medio", color: "amber" },
    HIGH: { label: "Alto", color: "orange" },
    CRITICAL: { label: "Crítico", color: "rose" },
  };

  function snippet(text, regex) {
    const m = text.match(regex);
    if (!m) return null;
    const i = Math.max(0, m.index - 60);
    const j = Math.min(text.length, m.index + m[0].length + 90);
    let frag = text.slice(i, j).replace(/\s+/g, " ").trim();
    if (i > 0) frag = "…" + frag;
    if (j < text.length) frag = frag + "…";
    return { match: m[0], context: frag };
  }

  function ruleMatches(rule, text) {
    if (rule.exclude && rule.exclude.some((rx) => rx.test(text))) return null;
    const hits = [];
    for (const rx of rule.include) {
      const s = snippet(text, rx);
      if (s) hits.push(s);
    }
    const need = rule.requireCount || 1;
    if (hits.length < need) return null;
    return hits;
  }

  function levelFromScore(score, hasCritical) {
    if (score === 0) return RISK.NONE;
    if (hasCritical || score >= 10) return RISK.CRITICAL;
    if (score >= 6) return RISK.HIGH;
    if (score >= 3) return RISK.MEDIUM;
    return RISK.LOW;
  }

  /* Analiza un fragmento de texto y devuelve la lista de hallazgos. */
  function scanText(text) {
    const clean = (text || "").trim();
    const findings = [];
    if (!clean) return findings;
    for (const rule of K.rules) {
      const hits = ruleMatches(rule, clean);
      if (!hits) continue;
      findings.push({
        id: rule.id,
        category: rule.category,
        title: rule.title,
        weight: rule.weight,
        norma: rule.norma,
        legalBasis: rule.legalBasis,
        recomendacion: rule.recomendacion,
        peticion: rule.peticion,
        evidence: hits.slice(0, 3),
        jurisprudencia: (rule.jurisprudencia || [])
          .map((jid) => K.jurisById[jid])
          .filter(Boolean),
      });
    }
    return findings;
  }

  /* Análisis principal del requisito objetado. */
  function analyze(input) {
    const requisito = input.textoRequisito || "";
    const findings = scanText(requisito);

    let score = findings.reduce((s, f) => s + f.weight, 0);
    const hasCritical = findings.some((f) => f.weight >= 4);
    const level = levelFromScore(score, hasCritical);

    const jurMap = new Map();
    findings.forEach((f) =>
      f.jurisprudencia.forEach((j) => jurMap.set(j.id, j))
    );

    let summary;
    if (findings.length === 0) {
      summary =
        "No se identificaron patrones de riesgo conocidos en el texto analizado. " +
        "Ello no descarta la existencia de otros vicios; se recomienda revisión " +
        "integral del pliego por un profesional del derecho.";
    } else {
      const cats = [...new Set(findings.map((f) => f.category))];
      summary =
        "Se identificaron " +
        findings.length +
        (findings.length === 1 ? " hallazgo" : " hallazgos") +
        " con incidencia jurídica en materia de " +
        cats.join(", ").toLowerCase() +
        ". El requisito objetado podría restringir la libre concurrencia y " +
        "comprometer el deber de selección objetiva.";
    }

    const result = {
      meta: {
        proceso: input.proceso || "",
        entidad: input.entidad || "",
        objeto: input.objeto || "",
        numeral: input.numeral || "",
        modalidad: input.modalidad || "",
        textoRequisito: requisito,
        proponente: input.proponente || "",
        fecha: new Date().toISOString(),
      },
      riskLevel: level.label,
      riskColor: level.color,
      riskScore: score,
      summary,
      findings,
      jurisprudencia: [...jurMap.values()],
    };
    result.observation = LICITA.docs.buildObservation(result);
    return result;
  }

  /* Escaneo de un pliego completo: segmenta y reporta riesgos por bloque. */
  function scanPliego(fullText) {
    const text = (fullText || "").replace(/\r/g, "");
    const findings = scanText(text);
    let score = findings.reduce((s, f) => s + f.weight, 0);
    const hasCritical = findings.some((f) => f.weight >= 4);
    const level = levelFromScore(score, hasCritical);
    return {
      level: level.label,
      color: level.color,
      score,
      findings,
      chars: text.length,
      words: text.split(/\s+/).filter(Boolean).length,
    };
  }

  return { analyze, scanPliego, scanText, RISK };
})();
