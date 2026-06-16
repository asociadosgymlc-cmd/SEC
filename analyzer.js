/* LICITA · Motor de análisis jurídico
 *
 * Contrasta el texto del requisito (o pliego) contra las reglas y produce un
 * dictamen ESTRATIFICADO por dimensión jurídica:
 *   habilitantes · ponderables · causalesRechazo · pliegosTipo · riesgos · transparencia
 *
 * Capacidades clave:
 *   · Modo "Cero Tolerancia" en procesos de obra/interventoría/consultoría
 *     (Pliegos Tipo · Ley 1882/2018). Si se detecta sector de infraestructura,
 *     las violaciones suben de severidad automáticamente.
 *   · Cálculo de Capacidad Residual (K de contratación) cuando el perfil
 *     empresarial está disponible.
 */
window.LICITA = window.LICITA || {};

LICITA.analyzer = (function () {
  "use strict";

  const K = LICITA.knowledge;

  const RISK = {
    NONE:     { label: "Sin hallazgos", color: "emerald", score: 0 },
    LOW:      { label: "Bajo",          color: "emerald" },
    MEDIUM:   { label: "Medio",         color: "amber" },
    HIGH:     { label: "Alto",          color: "orange" },
    CRITICAL: { label: "Crítico",       color: "rose" },
  };

  function snippet(text, regex) {
    const m = text.match(regex);
    if (!m) return null;
    const i = Math.max(0, m.index - 60);
    const j = Math.min(text.length, m.index + m[0].length + 110);
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
    if (hasCritical || score >= 12) return RISK.CRITICAL;
    if (score >= 7) return RISK.HIGH;
    if (score >= 3) return RISK.MEDIUM;
    return RISK.LOW;
  }

  /* -------------------------------------------------------------------
   * Detector de modalidad estricta · Pliegos Tipo (Ley 1882/2018)
   * Si el proceso es de infraestructura / consultoría / interventoría,
   * activamos el modo "Cero Tolerancia": las reglas de Pliegos Tipo
   * suben de severidad y las violaciones se reportan como Críticas.
   * ----------------------------------------------------------------- */
  const SECTOR_PLIEGO_TIPO = [
    /\bobra\s+p[úu]blica\b/i, /\bobras?\s+civil(?:es)?\b/i,
    /\binfraestructura\b/i, /\bedificaci[óo]n(?:es)?\b/i,
    /\bv[íi]as?\b/i, /\bpavimento\b/i, /\bpuentes?\b/i,
    /\binterventor[íi]a\b/i, /\bconsultor[íi]a\b/i,
  ];
  function detectarModoEstricto(input) {
    const objeto = String(input.objeto || "").toLowerCase();
    const modalidad = String(input.modalidad || "").toLowerCase();
    const haySectorPT = SECTOR_PLIEGO_TIPO.some((re) => re.test(objeto));
    const esLicitacionOConcurso =
      modalidad.includes("licitacion") || modalidad.includes("licitación") ||
      modalidad.includes("concurso") || modalidad.includes("meritos") || modalidad.includes("méritos");
    return haySectorPT || esLicitacionOConcurso;
  }

  function ajustarWeightPorContexto(rule, modoEstricto) {
    if (!modoEstricto) return rule.weight;
    // Reglas de Pliegos Tipo o Causales de Rechazo se vuelven críticas
    if (rule.dimension === "pliegosTipo" || rule.dimension === "causalesRechazo") {
      return Math.max(rule.weight, 5);
    }
    // Habilitantes con desviación paramétrica suben 1 punto
    if (rule.dimension === "habilitantes" && rule.id === "exp_proporcionalidad_parametrica") {
      return Math.max(rule.weight, 5);
    }
    return rule.weight;
  }

  /* -------------------------------------------------------------------
   * Scan principal · genera findings con dimensión
   * ----------------------------------------------------------------- */
  function scanText(text, opts) {
    const clean = (text || "").trim();
    const findings = [];
    if (!clean) return findings;
    const modoEstricto = !!(opts && opts.modoEstricto);
    for (const rule of K.rules) {
      const hits = ruleMatches(rule, clean);
      if (!hits) continue;
      const weight = ajustarWeightPorContexto(rule, modoEstricto);
      findings.push({
        id: rule.id,
        dimension: rule.dimension || "transparencia",
        category: rule.category,
        title: rule.title,
        weight,
        weightBoosted: weight > rule.weight,
        norma: rule.norma,
        legalBasis: rule.legalBasis,
        recomendacion: rule.recomendacion,
        peticion: rule.peticion,
        estrategiaDefensa: rule.estrategiaDefensa || null,
        evidence: hits.slice(0, 3),
        jurisprudencia: (rule.jurisprudencia || [])
          .map((jid) => K.jurisById[jid])
          .filter(Boolean),
      });
    }
    return findings;
  }

  function groupByDimension(findings) {
    const groups = {};
    const order = K.dimensions || {};
    findings.forEach((f) => {
      const dim = f.dimension || "transparencia";
      if (!groups[dim]) {
        const meta = order[dim] || { label: dim, tone: "slate", order: 99 };
        groups[dim] = {
          dimension: dim, label: meta.label, tone: meta.tone, order: meta.order,
          findings: [], totalWeight: 0,
        };
      }
      groups[dim].findings.push(f);
      groups[dim].totalWeight += f.weight;
    });
    return Object.values(groups).sort((a, b) => a.order - b.order);
  }

  /* -------------------------------------------------------------------
   * CAPACIDAD RESIDUAL (K) · solo aplica a obras civiles
   * Versión heurística simplificada del art. 2.2.1.1.1.6.4 del Dec. 1082.
   *
   *   K_practica = patrimonio · 0.30 · factorExperiencia · factorLiquidez
   *
   *   factorExperiencia = min(1.0, contratos_obra_recientes / 5)
   *   factorLiquidez    = min(1.0, indiceLiquidez / 1.5)
   *
   * Si K_practica < presupuestoOficial → STOP (no califica).
   * ----------------------------------------------------------------- */
  function analizarCapacidadResidual(profile, opportunity) {
    if (!profile || !opportunity) return null;
    const objeto = String(opportunity.objeto || "").toLowerCase();
    const esObra = SECTOR_PLIEGO_TIPO.some((re) => re.test(objeto));
    if (!esObra) return null;

    const presupuesto = Number(opportunity.valor) || 0;
    const patrimonio = Number(profile.patrimonio) || 0;
    if (presupuesto === 0 || patrimonio === 0) return null;

    const expArr = profile.experiencia || [];
    const obraRecientes = expArr.filter((e) => {
      const obj = String(e.objeto || "").toLowerCase();
      const hayObra = SECTOR_PLIEGO_TIPO.some((re) => re.test(obj));
      const anio = Number(e.anio) || 0;
      const recienteAprox = !anio || anio >= (new Date().getFullYear() - 5);
      return hayObra && recienteAprox;
    }).length;

    const factorExp = Math.min(1.0, obraRecientes / 5);
    const liq = Number(profile.indiceLiquidez) || 1;
    const factorLiq = Math.min(1.0, liq / 1.5);
    const kPractica = patrimonio * 0.30 * Math.max(factorExp, 0.20) * Math.max(factorLiq, 0.30);

    const stop = kPractica < presupuesto;
    const ratio = presupuesto > 0 ? (kPractica / presupuesto) : 0;
    return {
      aplica: true,
      presupuesto, kPractica,
      ratio,                     // 1.0 = exacto, >1 sobra, <1 falta
      cubre: kPractica >= presupuesto,
      stop,
      factores: {
        patrimonio, factorExperiencia: factorExp, factorLiquidez: factorLiq,
        contratosObraRecientes: obraRecientes,
      },
      recomendacion: stop
        ? "Tu Capacidad Residual estimada (K) es inferior al presupuesto oficial. Antes de invertir en estructurar oferta, verifica que puedas acreditar la K exigida o considera presentarte en consorcio."
        : "Tu Capacidad Residual estimada cubre el presupuesto oficial con un margen aceptable.",
    };
  }

  /* -------------------------------------------------------------------
   * ANÁLISIS PRINCIPAL
   * ----------------------------------------------------------------- */
  function analyze(input) {
    const requisito = input.textoRequisito || "";
    const modoEstricto = detectarModoEstricto(input);
    const findings = scanText(requisito, { modoEstricto });

    let score = findings.reduce((s, f) => s + f.weight, 0);
    const hasCritical = findings.some((f) => f.weight >= 4);
    const level = levelFromScore(score, hasCritical);

    const jurMap = new Map();
    findings.forEach((f) => f.jurisprudencia.forEach((j) => jurMap.set(j.id, j)));

    const byDimension = groupByDimension(findings);

    let summary;
    if (findings.length === 0) {
      summary =
        "No se identificaron patrones de riesgo conocidos en el texto analizado. " +
        "Ello no descarta la existencia de otros vicios; se recomienda revisión " +
        "integral del pliego por un profesional del derecho.";
    } else {
      const dims = byDimension.map((g) => g.label).join(", ");
      summary =
        "Se identificaron " + findings.length +
        (findings.length === 1 ? " hallazgo" : " hallazgos") +
        " con incidencia jurídica en " + dims.toLowerCase() +
        (modoEstricto
          ? ". Modo CERO TOLERANCIA activo por tratarse de obra/consultoría sujeta a Pliegos Tipo (Ley 1882/2018)."
          : ". El requisito objetado podría restringir la libre concurrencia y comprometer el deber de selección objetiva.");
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
        modoEstricto,
      },
      riskLevel: level.label,
      riskColor: level.color,
      riskScore: score,
      summary,
      findings,
      findingsByDimension: byDimension,
      jurisprudencia: [...jurMap.values()],
    };
    result.observation = LICITA.docs.buildObservation(result);
    return result;
  }

  /* Escaneo de un pliego completo. */
  function scanPliego(fullText, opts) {
    const text = (fullText || "").replace(/\r/g, "");
    const modoEstricto = !!(opts && opts.modoEstricto);
    const findings = scanText(text, { modoEstricto });
    let score = findings.reduce((s, f) => s + f.weight, 0);
    const hasCritical = findings.some((f) => f.weight >= 4);
    const level = levelFromScore(score, hasCritical);
    return {
      level: level.label,
      color: level.color,
      score,
      findings,
      findingsByDimension: groupByDimension(findings),
      chars: text.length,
      words: text.split(/\s+/).filter(Boolean).length,
      modoEstricto,
    };
  }

  return {
    analyze, scanPliego, scanText,
    analizarCapacidadResidual, detectarModoEstricto,
    RISK,
  };
})();
