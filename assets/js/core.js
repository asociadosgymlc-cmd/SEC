/* LICITA 3.0 · Ecosistema Integrado (core)
 *
 * Módulo autónomo que activa la arquitectura de 3 capas:
 *   1. DataLayer       — caché + fallback + discovery multiendpoint
 *   2. MatchScore      — motor predictivo de 6 dimensiones
 *   3. PriceStrategy   — estrategia de precios con percentiles reales
 *   4. Consejero       — chat flotante experto en contratación pública
 *
 * Se auto-registra al cargar. No depende de app.js. Puede convivir con
 * los módulos previos (secop, forensics, tvec, knowledge, relatoria,
 * process-extractor, docs) y los usa cuando están disponibles.
 *
 * VERSIÓN: 3.0.0 · 2026-06-17
 */
window.LICITA = window.LICITA || {};

LICITA.core = (function () {
  "use strict";

  const CONFIG = {
    version: "3.0.0",
    fecha: "2026-06-17",
    umbrales: {
      matchMinimoGanable: 65,
      matchExcelente: 85,
      patrimonioVsCuantia: 0.10,
      liquidezMinima: 1.0,
      endeudamientoMaximo: 60,
      experienciaMinima: 3,
    },
    cache: { duracionMs: 5 * 60 * 1000, maxItems: 500 },
    pesos: {
      default:  { financiero: 0.25, experiencia: 0.25, competencia: 0.20, estrategico: 0.15, geografico: 0.10, sectorial: 0.05 },
      licitacion: { financiero: 0.30, experiencia: 0.25, competencia: 0.20, estrategico: 0.10, geografico: 0.10, sectorial: 0.05 },
      concurso:   { financiero: 0.20, experiencia: 0.35, competencia: 0.15, estrategico: 0.15, geografico: 0.10, sectorial: 0.05 },
      minima:     { financiero: 0.20, experiencia: 0.20, competencia: 0.25, estrategico: 0.20, geografico: 0.10, sectorial: 0.05 },
    },
  };

  const DataLayer = {
    async consultar(datasetKey, filtros = {}, opts = {}) {
      const cacheKey = "licita.core.cache." + datasetKey + "." + JSON.stringify(filtros);
      if (!opts.fuerzaRefresh) {
        const cached = readCache(cacheKey);
        if (cached) return cached;
      }
      if (!LICITA.secop) throw new Error("secop.js no está cargado");
      try {
        const raw = await LICITA.secop.search(datasetKey, filtros);
        const norm = raw.map((r) => LICITA.secop.normalize(datasetKey, r));
        writeCache(cacheKey, norm);
        return norm;
      } catch (errPrimario) {
        const alternativa = { paa: "procesos", procesos: "contratos" }[datasetKey];
        if (alternativa) {
          try {
            const raw = await LICITA.secop.search(alternativa, filtros);
            const norm = raw.map((r) => LICITA.secop.normalize(alternativa, r));
            writeCache(cacheKey, norm, { fuenteAlternativa: alternativa });
            return norm;
          } catch (e2) { }
        }
        const stale = readCache(cacheKey, { ignorarExpiracion: true });
        if (stale) return Object.assign(stale, { _offline: true });
        throw errPrimario;
      }
    },
  };

  function readCache(key, opts) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      const ahora = Date.now();
      if (!(opts && opts.ignorarExpiracion) &&
          ahora - entry.timestamp > CONFIG.cache.duracionMs) {
        localStorage.removeItem(key);
        return null;
      }
      return entry.data;
    } catch (e) { return null; }
  }
  function writeCache(key, data, meta) {
    try {
      localStorage.setItem(key, JSON.stringify(Object.assign({ timestamp: Date.now(), data }, meta || {})));
    } catch (e) { pruneCache(); }
  }
  function pruneCache() {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("licita.core.cache.")) {
        try {
          const e = JSON.parse(localStorage.getItem(k));
          entries.push({ k, t: e.timestamp || 0 });
        } catch (_) {}
      }
    }
    entries.sort((a, b) => a.t - b.t).slice(0, Math.floor(entries.length * 0.3))
      .forEach((e) => localStorage.removeItem(e.k));
  }

  const MatchScore = {
    async calcular(perfil, oportunidad) {
      const scores = {
        financiero: MatchScore.scoreFinanciero(perfil, oportunidad),
        experiencia: MatchScore.scoreExperiencia(perfil, oportunidad),
        competencia: await MatchScore.scoreCompetencia(oportunidad),
        estrategico: MatchScore.scoreEstrategico(perfil, oportunidad),
        geografico: MatchScore.scoreGeografico(perfil, oportunidad),
        sectorial: MatchScore.scoreSectorial(perfil, oportunidad),
      };
      const pesos = MatchScore.pesosSegun(oportunidad.modalidad);
      let ponderado = 0, maximo = 0;
      Object.keys(scores).forEach((k) => {
        const s = scores[k], p = pesos[k] || 0;
        ponderado += (s.score / s.max) * p * 100;
        maximo += p * 100;
      });
      const scoreFinal = Math.round((ponderado / maximo) * 100);
      return {
        score: scoreFinal,
        label: MatchScore.etiqueta(scoreFinal),
        color: MatchScore.color(scoreFinal),
        desglose: scores,
        recomendacion: MatchScore.recomendacion(scoreFinal),
        acciones: MatchScore.mejoras(scores),
      };
    },
    scoreFinanciero(perfil, op) {
      const cuantia = Number(op.valor) || 0;
      const patrimonio = Number(perfil && perfil.patrimonio) || 0;
      const liq = Number(perfil && perfil.indiceLiquidez) || 0;
      const end = Number(perfil && perfil.indiceEndeudamiento) || 0;
      let score = 0;
      if (patrimonio >= cuantia * 0.15) score += 40;
      else if (patrimonio >= cuantia * 0.10) score += 30;
      else if (patrimonio >= cuantia * 0.05) score += 15;
      else score += 5;
      if (liq >= 1.5) score += 30;
      else if (liq >= 1.0) score += 20;
      else if (liq >= 0.8) score += 10;
      if (end > 0 && end <= 40) score += 30;
      else if (end <= 60) score += 20;
      else if (end <= 80) score += 10;
      return { score, max: 100, detalle: { patrimonio, liquidez: liq, endeudamiento: end } };
    },
    scoreExperiencia(perfil, op) {
      const exp = (perfil && perfil.experiencia) || [];
      if (!exp.length) return { score: 0, max: 100, detalle: { contratos: 0 } };
      let sc = 0;
      if (exp.length >= 10) sc += 30;
      else if (exp.length >= 5) sc += 25;
      else if (exp.length >= 3) sc += 20;
      else sc += 10;
      const palObj = (op.objeto || "").toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      const similares = exp.filter((e) => {
        const p = (e.objeto || "").toLowerCase().split(/\s+/).filter((w) => w.length > 4);
        return palObj.filter((x) => p.includes(x)).length >= 2;
      });
      if (similares.length >= 5) sc += 40;
      else if (similares.length >= 3) sc += 30;
      else if (similares.length >= 1) sc += 20;
      else sc += 5;
      const valorTotal = exp.reduce((s, e) => s + (Number(e.valor) || 0), 0);
      const valorObj = Number(op.valor) || 0;
      if (valorTotal >= valorObj * 3) sc += 30;
      else if (valorTotal >= valorObj * 1.5) sc += 20;
      else if (valorTotal >= valorObj * 0.5) sc += 10;
      else sc += 5;
      return { score: sc, max: 100, detalle: { contratos: exp.length, similares: similares.length, valorTotal } };
    },
    async scoreCompetencia(op) {
      if (!LICITA.secop) return { score: 50, max: 100, detalle: { mensaje: "secop.js no cargado" } };
      try {
        const hist = await DataLayer.consultar("contratos", {
          texto: op.objeto, departamento: op.departamento, limite: 100,
        });
        if (!hist || !hist.length) return { score: 50, max: 100, detalle: { mensaje: "Sin datos históricos" } };
        const ganadores = {};
        hist.forEach((h) => { const p = h.proveedor || "Desconocido"; ganadores[p] = (ganadores[p] || 0) + 1; });
        const total = hist.length;
        const unicos = Object.keys(ganadores).length;
        let hhi = 0;
        Object.values(ganadores).forEach((c) => { const s = c / total; hhi += s * s; });
        let sc = 0;
        if (unicos >= 10) sc += 40; else if (unicos >= 5) sc += 30; else if (unicos >= 3) sc += 20; else sc += 10;
        if (hhi <= 0.15) sc += 30; else if (hhi <= 0.25) sc += 20; else if (hhi <= 0.35) sc += 10; else sc += 5;
        const precios = hist.map((h) => Number(h.valor) || 0).filter((v) => v > 0);
        const prom = precios.length ? precios.reduce((a, b) => a + b, 0) / precios.length : 0;
        const cuantia = Number(op.valor) || 0;
        if (prom > 0 && cuantia <= prom * 1.2) sc += 30;
        else if (prom > 0 && cuantia <= prom * 1.5) sc += 20;
        else sc += 10;
        const topGanadores = Object.entries(ganadores).sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([nombre, c]) => ({ nombre, contratos: c, pct: Math.round((c / total) * 100) }));
        return { score: sc, max: 100, detalle: { contratosAnalizados: total, proveedoresUnicos: unicos, hhi: Math.round(hhi * 100) / 100, precioPromedio: prom, ganadoresFrecuentes: topGanadores } };
      } catch (e) { return { score: 50, max: 100, detalle: { error: e.message } }; }
    },
    scoreEstrategico(perfil, op) {
      let sc = 0;
      const mod = (op.modalidad || "").toLowerCase();
      if (mod.indexOf("m") >= 0 && mod.indexOf("cuant") >= 0) sc += 30;
      else if (mod.indexOf("abreviada") >= 0) sc += 25;
      else if (mod.indexOf("concurso") >= 0) sc += 20;
      else if (mod.indexOf("licitac") >= 0) sc += 15;
      else sc += 10;
      const est = op.estado || "";
      if (est === "Presentación de oferta") sc += 30;
      else if (est === "Borrador") sc += 20;
      else if (est === "Adjudicado") sc += 0;
      else sc += 15;
      const tipo = (op.tipoContrato || "").toLowerCase();
      if (tipo.indexOf("prestac") >= 0 || tipo.indexOf("servicio") >= 0) sc += 25;
      else if (tipo.indexOf("suministro") >= 0) sc += 20;
      else if (tipo.indexOf("obra") >= 0) sc += 15;
      else sc += 20;
      const dias = diasHasta(op.fecha);
      if (dias == null) sc += 25;
      else if (dias > 30) sc += 25;
      else if (dias > 14) sc += 20;
      else if (dias > 7) sc += 15;
      else if (dias > 0) sc += 10;
      return { score: sc, max: 100, detalle: { modalidad: mod, estado: est, tipo, diasRestantes: dias } };
    },
    scoreGeografico(perfil, op) {
      const deptos = (perfil && perfil.departamentos) || [];
      const d = op.departamento;
      if (!d) return { score: 50, max: 100, detalle: { mensaje: "Sin departamento" } };
      if (deptos.indexOf(d) >= 0) return { score: 100, max: 100, detalle: { operasEn: d } };
      const expAlli = ((perfil && perfil.experiencia) || []).some((e) => e.entidad && e.entidad.toLowerCase().indexOf(d.toLowerCase()) >= 0);
      if (expAlli) return { score: 70, max: 100, detalle: { mensaje: "Experiencia previa" } };
      const vecinos = { "Cundinamarca": ["Bogotá D.C.", "Boyacá", "Tolima"], "Bogotá D.C.": ["Cundinamarca"], "Antioquia": ["Caldas", "Bolívar", "Córdoba", "Chocó", "Santander"], "Valle del Cauca": ["Cauca", "Risaralda", "Quindío", "Chocó"], "Atlántico": ["Bolívar", "Magdalena"] };
      const cerca = vecinos[d] || [];
      if (deptos.some((x) => cerca.indexOf(x) >= 0)) return { score: 40, max: 100, detalle: { mensaje: "Departamento vecino" } };
      return { score: 15, max: 100, detalle: { mensaje: "No operas en la zona" } };
    },
    scoreSectorial(perfil, op) {
      const sectores = (perfil && perfil.sectores) || [];
      const obj = (op.objeto || "").toLowerCase();
      const mapa = {
        obras: ["obra", "construcc", "infraestructura", "edificaci", "civil", "pavimento", "via", "puente"],
        tecnologia: ["software", "tecnología", "sistema", "informát", "digital", "tic", "datos"],
        salud: ["salud", "médic", "hospital", "medicament", "clínic", "farmacéut"],
        consultoria: ["consultoría", "asesoría", "interventoría", "estudios técn"],
        suministros: ["suministro", "compraventa", "adquisición", "comercializ"],
        aseo: ["aseo", "limpieza", "cafetería", "mantenimiento"],
        vigilancia: ["vigilancia", "seguridad", "guarda", "celadur"],
        educacion: ["educación", "capacitación", "formación", "enseñanza"],
        catering: ["alimentación", "catering", "restaurante", "comidas"],
        transporte: ["transporte", "logística", "carga", "fletes"],
      };
      let sectorDetectado = "general";
      Object.keys(mapa).forEach((s) => { if (mapa[s].some((p) => obj.indexOf(p) >= 0)) sectorDetectado = s; });
      if (sectores.indexOf(sectorDetectado) >= 0) return { score: 100, max: 100, detalle: { sector: sectorDetectado, match: true } };
      if (!sectores.length) return { score: 50, max: 100, detalle: { sector: sectorDetectado, mensaje: "Sin sectores definidos" } };
      return { score: 20, max: 100, detalle: { sector: sectorDetectado, match: false } };
    },
    pesosSegun(modalidad) {
      const m = (modalidad || "").toLowerCase();
      if (m.indexOf("licitac") >= 0) return CONFIG.pesos.licitacion;
      if (m.indexOf("concurso") >= 0) return CONFIG.pesos.concurso;
      if (m.indexOf("cuant") >= 0)   return CONFIG.pesos.minima;
      return CONFIG.pesos.default;
    },
    etiqueta(s) { if (s >= 85) return "Excelente"; if (s >= 70) return "Bueno"; if (s >= 55) return "Regular"; if (s >= 40) return "Difícil"; return "Muy difícil"; },
    color(s) { if (s >= 85) return "emerald"; if (s >= 70) return "sky"; if (s >= 55) return "amber"; if (s >= 40) return "orange"; return "rose"; },
    recomendacion(s) {
      if (s >= 85) return "Proceso altamente viable. Tienes ventajas claras. Postula con estrategia de precio balanceada.";
      if (s >= 70) return "Proceso viable. Asegura documentos habilitantes y define precio competitivo.";
      if (s >= 55) return "Proceso factible con trabajo. Revisa los gaps antes de postular.";
      if (s >= 40) return "Proceso difícil. Considera Unión Temporal o acumular más experiencia primero.";
      return "Proceso no viable actualmente. Enfócate en construir capacidad antes de postular.";
    },
    mejoras(scores) {
      const acc = [];
      if (scores.financiero.score < 60) acc.push("Aumentar patrimonio o presentar carta de crédito bancaria");
      if (scores.experiencia.score < 60) acc.push("Acreditar más contratos similares o formar Unión Temporal");
      if (scores.competencia.score < 50) acc.push("Investigar al ganador típico y diferenciarse en precio o técnica");
      if (scores.geografico.score < 50) acc.push("Asociarse con empresa local del departamento");
      if (scores.sectorial.score < 50) acc.push("Marcar el sector correspondiente en tu perfil o formar Unión Temporal con especialista");
      return acc;
    },
  };

  const PriceStrategy = {
    async calcular(perfil, oportunidad) {
      const cuantia = Number(oportunidad.valor) || 0;
      if (!LICITA.secop) return { disponible: false, razon: "secop.js no está cargado" };
      let hist;
      try {
        hist = await DataLayer.consultar("contratos", { texto: oportunidad.objeto, departamento: oportunidad.departamento, modalidad: oportunidad.modalidad, limite: 200 });
      } catch (e) { return { disponible: false, razon: "Error consultando SECOP: " + e.message }; }
      if (!hist || hist.length < 5) return { disponible: false, razon: "Insuficientes datos históricos (" + (hist ? hist.length : 0) + " contratos)", recomendacion: "Investigar precio de mercado manualmente o contactar la entidad" };
      const precios = hist.map((h) => Number(h.valor) || 0).filter((v) => v > 0).sort((a, b) => a - b);
      if (!precios.length) return { disponible: false, razon: "Sin precios válidos en histórico" };
      const n = precios.length;
      const p10 = precios[Math.floor(n * 0.10)], p25 = precios[Math.floor(n * 0.25)], p50 = precios[Math.floor(n * 0.50)], p75 = precios[Math.floor(n * 0.75)], p90 = precios[Math.floor(n * 0.90)];
      const costoEstimado = PriceStrategy.estimarCosto(oportunidad);
      const competencia = PriceStrategy.competenciaHeuristica(hist);
      const estrategias = [
        { nombre: "Precio de Penetración", descripcion: "Ganar a toda costa, establecer referencia", precio: Math.round(p25 * 0.95), probabilidad: PriceStrategy.prob(p25 * 0.95, p50, competencia, "agresivo"), margen: PriceStrategy.margen(p25 * 0.95, costoEstimado), riesgo: "Margen muy ajustado. Riesgo de pérdida si hay imprevistos.", cuandoUsar: "Primera vez con entidad, necesitas referencia, margen secundario" },
        { nombre: "Precio Competitivo", descripcion: "Balance óptimo entre probabilidad y margen", precio: Math.round(p50 * 0.92), probabilidad: PriceStrategy.prob(p50 * 0.92, p50, competencia, "balanceado"), margen: PriceStrategy.margen(p50 * 0.92, costoEstimado), riesgo: "Riesgo moderado. Buena relación costo-beneficio.", cuandoUsar: "Tienes experiencia, proceso estándar, competencia normal", recomendado: true },
        { nombre: "Precio Diferenciado", descripcion: "Valor por propuesta técnica superior", precio: Math.round(p50 * 1.05), probabilidad: PriceStrategy.prob(p50 * 1.05, p50, competencia, "premium"), margen: PriceStrategy.margen(p50 * 1.05, costoEstimado), riesgo: "Pierdes si la evaluación es 100% precio. Ganas si hay factor técnico.", cuandoUsar: "Proceso con evaluación técnica ponderada, ventaja diferencial" },
        { nombre: "Precio de Oportunidad", descripcion: "Máximo margen, aceptas riesgo de perder", precio: Math.round(p75 * 1.02), probabilidad: PriceStrategy.prob(p75 * 1.02, p50, competencia, "conservador"), margen: PriceStrategy.margen(p75 * 1.02, costoEstimado), riesgo: "Alta probabilidad de perder. Solo si tienes ventaja única.", cuandoUsar: "Eres proveedor preferencial, proceso complejo, poca competencia" },
      ];
      const optima = PriceStrategy.optima(estrategias, perfil, competencia);
      return { disponible: true, cuantiaBase: cuantia, estadisticas: { n, p10, p25, p50, p75, p90, min: precios[0], max: precios[n - 1] }, competencia, costoEstimado, estrategias, recomendada: optima };
    },
    prob(precio, mediana, competencia, tipo) {
      const ratio = precio / mediana;
      let base;
      if (ratio <= 0.85) base = 0.75; else if (ratio <= 0.95) base = 0.60; else if (ratio <= 1.05) base = 0.45; else if (ratio <= 1.15) base = 0.30; else base = 0.15;
      const aC = competencia.nivel === "bajo" ? 0.15 : competencia.nivel === "medio" ? 0 : -0.10;
      const aT = tipo === "agresivo" ? 0.05 : tipo === "premium" ? -0.05 : 0;
      return Math.round(Math.min(0.95, Math.max(0.05, base + aC + aT)) * 100);
    },
    margen(precio, costo) { if (!costo || costo <= 0) return null; return ((precio - costo) / precio * 100).toFixed(1) + "%"; },
    estimarCosto(op) {
      const cuantia = Number(op.valor) || 0;
      const tipo = (op.tipoContrato || "").toLowerCase();
      const margenes = { obra: 0.20, prestac: 0.30, suministro: 0.15, consultor: 0.40 };
      let m = 0.25;
      Object.keys(margenes).forEach((k) => { if (tipo.indexOf(k) >= 0) m = margenes[k]; });
      return Math.round(cuantia * (1 - m));
    },
    competenciaHeuristica(hist) {
      const ganadores = {};
      hist.forEach((h) => { const p = h.proveedor || "?"; ganadores[p] = (ganadores[p] || 0) + 1; });
      const unicos = Object.keys(ganadores).length;
      const topShare = Math.max.apply(null, Object.values(ganadores)) / hist.length;
      let nivel = "medio";
      if (unicos >= 8 && topShare < 0.25) nivel = "bajo";
      else if (unicos < 4 || topShare > 0.5) nivel = "alto";
      const [ganadorNombre, ganadorCount] = Object.entries(ganadores).sort((a, b) => b[1] - a[1])[0] || [null, 0];
      return { nivel, proponentesEsperados: Math.min(10, unicos), ganadorRecurrente: topShare > 0.4 ? { nombre: ganadorNombre, contratos: ganadorCount, pct: Math.round(topShare * 100) } : null };
    },
    optima(estrategias, perfil, competencia) {
      const exp = (perfil && perfil.experiencia && perfil.experiencia.length) || 0;
      if (exp < 3) return estrategias.find((e) => e.nombre === "Precio de Penetración") || estrategias[0];
      if (exp > 10 && competencia.nivel === "bajo") return estrategias[2];
      return estrategias.find((e) => e.recomendado) || estrategias[1];
    },
  };

  const Consejero = {
    inited: false,
    init() {
      if (Consejero.inited) return;
      if (!document.body) return;
      const appRoot = document.getElementById("appRoot");
      if (!appRoot) { setTimeout(Consejero.init, 500); return; }
      Consejero.render();
      Consejero.bind();
      Consejero.inited = true;
    },
    render() {
      if (document.getElementById("licitaConsejeroPanel")) return;
      const wrap = document.createElement("div");
      wrap.id = "licitaConsejeroPanel";
      wrap.className = "fixed bottom-4 right-4 z-[70] flex flex-col items-end";
      wrap.innerHTML =
        '<button id="cnsToggle" title="Consejero LICITA" class="w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-xl shadow-violet-900/30 flex items-center justify-center hover:scale-105 transition-transform text-2xl">🧠</button>' +
        '<div id="cnsChat" class="hidden w-[26rem] max-w-[calc(100vw-2rem)] h-[34rem] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden mt-3">' +
        '<div class="bg-gradient-to-r from-violet-600 to-purple-700 p-3 flex items-center justify-between">' +
        '<div class="flex items-center gap-2"><div class="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-lg">🧠</div>' +
        '<div><p class="text-sm font-bold text-white">Consejero LICITA</p><p class="text-[10px] text-violet-200">Experto en contratación pública</p></div></div>' +
        '<button id="cnsClose" class="text-white/80 hover:text-white text-xl leading-none">×</button></div>' +
        '<div id="cnsMessages" class="flex-1 overflow-y-auto p-3 space-y-2 text-sm bg-slate-50 dark:bg-slate-900/50"></div>' +
        '<div class="p-3 border-t border-slate-200 dark:border-slate-700"><div class="flex gap-2">' +
        '<input id="cnsInput" type="text" placeholder="Pregúntame sobre procesos, pliegos, precios..." class="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500" />' +
        '<button id="cnsSend" class="bg-violet-600 hover:bg-violet-700 text-white px-3 rounded-lg text-sm font-semibold">→</button></div>' +
        '<div id="cnsSug" class="flex gap-1.5 mt-2 overflow-x-auto pb-1"></div></div></div>';
      document.body.appendChild(wrap);
      Consejero.addBot(Consejero.bienvenida());
      Consejero.renderSugerencias();
    },
    bienvenida() {
      const u = (window.Auth && window.Auth.currentUser && window.Auth.currentUser()) || null;
      const hora = new Date().getHours();
      const s = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
      const nombre = u && u.name ? ", " + u.name.split(" ")[0] : "";
      return s + nombre + ". Soy tu consejero experto. Puedo evaluar procesos, interpretar pliegos, calcular precios y mostrarte qué te falta para ganar. Escribe una pregunta o usa un botón rápido.";
    },
    renderSugerencias() {
      const host = document.getElementById("cnsSug");
      if (!host) return;
      const opts = [
        { emoji: "🎯", texto: "¿Puedo ganar este proceso?", tipo: "evaluar" },
        { emoji: "🏗️", texto: "¿Qué me falta?", tipo: "construir" },
        { emoji: "💰", texto: "¿A qué precio oferto?", tipo: "precio" },
        { emoji: "📋", texto: "Analiza mi pliego", tipo: "pliego" },
        { emoji: "📊", texto: "Salud financiera", tipo: "contable" },
        { emoji: "🔎", texto: "Investiga entidad", tipo: "forense" },
      ];
      host.innerHTML = opts.map((o) => '<button class="cns-sug whitespace-nowrap text-[11px] bg-slate-100 dark:bg-slate-700 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-full transition-colors" data-tipo="' + o.tipo + '">' + o.emoji + " " + o.texto + "</button>").join("");
      host.querySelectorAll(".cns-sug").forEach((b) => b.addEventListener("click", () => Consejero.procesarSugerencia(b.dataset.tipo)));
    },
    bind() {
      document.getElementById("cnsToggle").addEventListener("click", Consejero.toggle);
      document.getElementById("cnsClose").addEventListener("click", Consejero.toggle);
      document.getElementById("cnsSend").addEventListener("click", Consejero.enviar);
      document.getElementById("cnsInput").addEventListener("keydown", (e) => { if (e.key === "Enter") Consejero.enviar(); });
    },
    toggle() {
      const c = document.getElementById("cnsChat");
      c.classList.toggle("hidden");
      if (!c.classList.contains("hidden")) document.getElementById("cnsInput").focus();
    },
    addUser(txt) {
      const host = document.getElementById("cnsMessages");
      host.insertAdjacentHTML("beforeend", '<div class="flex justify-end"><div class="bg-violet-600 text-white px-3 py-2 rounded-2xl rounded-br-sm max-w-[80%]">' + escapeHtml(txt) + "</div></div>");
      host.scrollTop = host.scrollHeight;
    },
    addBot(html) {
      const host = document.getElementById("cnsMessages");
      host.insertAdjacentHTML("beforeend", '<div class="flex justify-start"><div class="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 rounded-2xl rounded-bl-sm max-w-[85%]">' + html + "</div></div>");
      host.scrollTop = host.scrollHeight;
    },
    typing(on) {
      const id = "cns-typing";
      const host = document.getElementById("cnsMessages");
      if (on) {
        if (!document.getElementById(id)) host.insertAdjacentHTML("beforeend", '<div id="' + id + '" class="flex justify-start"><div class="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-3 py-2 rounded-2xl rounded-bl-sm text-xs text-slate-500">Analizando...</div></div>');
        host.scrollTop = host.scrollHeight;
      } else { const t = document.getElementById(id); if (t) t.remove(); }
    },
    async enviar() {
      const inp = document.getElementById("cnsInput");
      const txt = inp.value.trim();
      if (!txt) return;
      inp.value = "";
      Consejero.addUser(txt);
      Consejero.typing(true);
      try { const r = await Consejero.procesarConsulta(txt); Consejero.typing(false); Consejero.addBot(r); }
      catch (e) { Consejero.typing(false); Consejero.addBot('<span class="text-rose-600">No pude procesar: ' + escapeHtml(e.message) + "</span>"); }
    },
    async procesarSugerencia(tipo) {
      const map = { evaluar: "¿Puedo ganar el proceso que estoy viendo?", construir: "¿Qué me falta para calificar en contratación pública?", pliego: "Analiza el pliego que tengo cargado", precio: "¿A qué precio debería ofertar?", contable: "¿Cómo debo presentar mis estados financieros?", forense: "Investiga la entidad del proceso actual" };
      Consejero.addUser(map[tipo] || tipo);
      Consejero.typing(true);
      try { const r = await Consejero.procesarConsulta(map[tipo], { tipoForzado: tipo }); Consejero.typing(false); Consejero.addBot(r); }
      catch (e) { Consejero.typing(false); Consejero.addBot('<span class="text-rose-600">No pude procesar: ' + escapeHtml(e.message) + "</span>"); }
    },
    async procesarConsulta(msg, opts) {
      opts = opts || {};
      const lower = msg.toLowerCase();
      const perfil = (LICITA.empresa && window.Auth && window.Auth.currentUser) ? LICITA.empresa.load(window.Auth.currentUser()) : null;
      const state = window.state || {};
      const proceso = (state.lastResult && state.lastResult.meta) || null;
      if (opts.tipoForzado === "evaluar" || tieneAlguno(lower, ["ganar", "viable", "probabilidad", "chance", "posibilidad"])) return await Consejero.respuestaEvaluar(perfil, proceso);
      if (opts.tipoForzado === "construir" || tieneAlguno(lower, ["falta", "calificar", "habilitante", "construir", "preparar", "necesito"])) return Consejero.respuestaConstruir(perfil);
      if (opts.tipoForzado === "precio" || tieneAlguno(lower, ["precio", "oferta", "valor", "ofertar", "cobrar", "proponer"])) return await Consejero.respuestaPrecio(perfil, proceso);
      if (opts.tipoForzado === "pliego" || tieneAlguno(lower, ["pliego", "requisito", "anexo", "condiciones", "términos"])) return Consejero.respuestaPliego(state);
      if (opts.tipoForzado === "contable" || tieneAlguno(lower, ["estados", "financiero", "contable", "balance", "renta"])) return Consejero.respuestaContable(perfil);
      if (opts.tipoForzado === "forense" || tieneAlguno(lower, ["forense", "captura", "adiciones", "investiga", "corrupci"])) return await Consejero.respuestaForense(proceso);
      return Consejero.respuestaGeneral(msg);
    },
    async respuestaEvaluar(perfil, proceso) {
      if (!proceso) return "No veo un proceso cargado en el analizador. Ve a <b>Análisis de Pliego</b>, carga uno y vuelve. Puedo evaluar tu probabilidad real de ganar en 3 segundos.";
      if (!perfil || !perfil.razonSocial) return "Necesito tu perfil empresarial completo para calcular el match. Ve a <b>Mi Empresa</b> y completa razón social, sectores, geografía y experiencia.";
      const op = { objeto: proceso.objeto, valor: proceso.presupuesto || 0, modalidad: proceso.modalidad, departamento: proceso.departamento, tipoContrato: proceso.tipoContrato, estado: proceso.estado, fecha: proceso.fecha };
      const r = await MatchScore.calcular(perfil, op);
      const rows = Object.keys(r.desglose).map((k) => '<tr><td class="pr-2 py-0.5 capitalize text-slate-500">' + k + '</td><td class="text-right font-bold text-' + r.color + '-700">' + Math.round((r.desglose[k].score / r.desglose[k].max) * 100) + "%</td></tr>").join("");
      const acciones = r.acciones.length ? '<p class="mt-2 text-xs"><b>Acciones para mejorar:</b></p><ul class="text-xs list-disc list-inside space-y-0.5">' + r.acciones.map((a) => "<li>" + escapeHtml(a) + "</li>").join("") + "</ul>" : "";
      return '<p class="text-2xl font-extrabold text-' + r.color + '-700">' + r.score + '<span class="text-sm text-slate-400"> / 100 · ' + r.label + "</span></p>" + '<p class="text-xs text-slate-600 mt-1">' + r.recomendacion + "</p>" + '<table class="mt-2 text-xs w-full"><tbody>' + rows + "</tbody></table>" + acciones;
    },
    respuestaConstruir(perfil) {
      if (!perfil) return "Aún no tienes perfil empresarial. Ve a <b>Mi Empresa</b>. Sin perfil no puedo decirte con precisión qué te falta.";
      const gaps = [];
      if (!perfil.patrimonio) gaps.push("Registrar patrimonio actual (RUP o balance)");
      if (!perfil.indiceLiquidez || perfil.indiceLiquidez < 1) gaps.push("Mejorar índice de liquidez (mínimo 1.0)");
      if ((perfil.indiceEndeudamiento || 0) > 60) gaps.push("Reducir endeudamiento (máximo 60%)");
      if (!perfil.experiencia || perfil.experiencia.length < 3) gaps.push("Acreditar al menos 3 contratos similares");
      if (!perfil.departamentos || !perfil.departamentos.length) gaps.push("Definir departamentos donde operas");
      if (!perfil.sectores || !perfil.sectores.length) gaps.push("Marcar tus sectores de negocio");
      if (!gaps.length) return "Tu perfil está sólido. Foco ahora: <b>generar experiencia comparable</b> en el sector-objetivo (3+ contratos similares) y <b>mantener indicadores</b> en cada corte de RUP.";
      return "<b>Para calificar mejor te falta:</b><ol class='mt-1 text-xs list-decimal list-inside space-y-0.5'>" + gaps.map((g) => "<li>" + escapeHtml(g) + "</li>").join("") + "</ol>" + "<p class='mt-2 text-xs text-slate-500'>Trabajemos en el más urgente. ¿Cuál abordas primero?</p>";
    },
    async respuestaPrecio(perfil, proceso) {
      if (!proceso) return "Necesito un proceso cargado. Ve a <b>Análisis de Pliego</b> o al <b>importador SECOP</b> y vuelve.";
      const op = { objeto: proceso.objeto, valor: proceso.presupuesto || 0, modalidad: proceso.modalidad, departamento: proceso.departamento, tipoContrato: proceso.tipoContrato };
      const r = await PriceStrategy.calcular(perfil, op);
      if (!r.disponible) return escapeHtml(r.razon || "No disponible") + (r.recomendacion ? "<br><span class='text-xs text-slate-500'>" + escapeHtml(r.recomendacion) + "</span>" : "");
      const rec = r.recomendada;
      const rows = r.estrategias.map((e) => '<tr class="' + (e === rec ? "bg-violet-50 dark:bg-violet-900/20" : "") + '"><td class="pr-2 py-0.5">' + escapeHtml(e.nombre) + (e === rec ? ' <span class="text-[9px] font-bold text-violet-700">RECOMENDADA</span>' : "") + '</td><td class="text-right font-bold">$' + Number(e.precio).toLocaleString("es-CO") + '</td><td class="text-right text-slate-500">' + e.probabilidad + "%</td></tr>").join("");
      return '<p class="text-xs">Basado en <b>' + r.estadisticas.n + "</b> contratos históricos similares:</p>" + '<p class="text-xs mt-1"><b>Mediana (P50):</b> $' + Number(r.estadisticas.p50).toLocaleString("es-CO") + "</p>" + '<table class="mt-2 text-xs w-full"><thead><tr class="text-[10px] uppercase text-slate-400"><th class="text-left">Estrategia</th><th class="text-right">Precio</th><th class="text-right">Prob.</th></tr></thead><tbody>' + rows + "</tbody></table>" + '<p class="mt-2 text-xs"><b>Competencia:</b> ' + r.competencia.nivel + " (" + r.competencia.proponentesEsperados + " esperados)</p>";
    },
    respuestaPliego(state) {
      if (state && state.lastResult && state.lastResult.findings) {
        const r = state.lastResult;
        return "El pliego ya lo analicé: <b>" + r.riskLevel + "</b> · " + r.findings.length + " hallazgos. Revisa la observación redactada en la sección Análisis y descárgala en Word.";
      }
      return "Sube el PDF o DOCX del pliego en <b>Análisis de Pliego</b>. Detecto vinculación laboral exclusiva, marcas, experiencia desproporcionada, restricciones geográficas y 5+ vicios más. Te doy la observación jurídica lista para radicar.";
    },
    respuestaContable(perfil) {
      const rows = [];
      const patrimonio = perfil && perfil.patrimonio ? perfil.patrimonio : 0;
      if (perfil && perfil.indiceLiquidez) {
        const l = Number(perfil.indiceLiquidez);
        rows.push(["Liquidez", l.toFixed(2), l >= 1.5 ? "✅ Excelente" : l >= 1 ? "🟡 Aceptable" : "🔴 Baja"]);
      }
      if (perfil && perfil.indiceEndeudamiento) {
        const e = Number(perfil.indiceEndeudamiento);
        rows.push(["Endeudamiento", e.toFixed(1) + "%", e <= 40 ? "✅ Bajo" : e <= 60 ? "🟡 Medio" : "🔴 Alto"]);
      }
      if (patrimonio) rows.push(["Patrimonio", "$" + patrimonio.toLocaleString("es-CO"), ""]);
      if (!rows.length) return "No tengo tus indicadores en el perfil. Sube tu <b>RUP</b> en Mi Empresa y los extraigo automáticamente. Los procesos exigen: liquidez ≥1.0, endeudamiento ≤60%, patrimonio ≥10% de la cuantía.";
      return "<b>Tus indicadores actuales:</b><table class='mt-1 text-xs w-full'>" + rows.map((r) => "<tr><td class='pr-2'>" + r[0] + "</td><td class='font-bold'>" + r[1] + "</td><td class='text-right'>" + r[2] + "</td></tr>").join("") + "</table><p class='mt-2 text-xs text-slate-500'>Referencia normativa: art. 2.2.1.1.1.5 Decreto 1082/2015.</p>";
    },
    async respuestaForense(proceso) {
      if (!LICITA.forensics) return "El módulo forense no está cargado. Recarga la página con Ctrl+Shift+R.";
      if (!proceso || !proceso.entidad) return "No veo entidad en el proceso cargado. Ve a <b>Análisis Forense</b> desde el sidebar y escribe la entidad manualmente.";
      Consejero.addBot('<span class="text-xs text-slate-500">Consultando SECOP 1 histórico...</span>');
      try {
        const r = await LICITA.forensics.analisis360Entidad(proceso.entidad);
        const alertas = r.alertas.length ? "<ul class='mt-1 text-xs list-disc list-inside'>" + r.alertas.map((a) => "<li><b>" + escapeHtml(a.tipo) + ":</b> " + escapeHtml(a.metrica) + "</li>").join("") + "</ul>" : "<p class='text-xs mt-1 text-emerald-700'>Sin indicios forenses en la entidad.</p>";
        return "<b>" + escapeHtml(proceso.entidad) + "</b><br>Score de riesgo: <b>" + r.scoreRiesgo + "/100</b> · " + r.veredicto + alertas;
      } catch (e) { return "Error consultando: " + escapeHtml(e.message); }
    },
    respuestaGeneral(msg) {
      return "No estoy seguro de qué me pides exactamente. Prueba con: <br>" + "• <b>¿Puedo ganar este proceso?</b> — evalúo con match score de 6 dimensiones<br>" + "• <b>¿Qué me falta?</b> — te digo los gaps de tu perfil<br>" + "• <b>¿A qué precio oferto?</b> — 4 estrategias con datos históricos reales<br>" + "• <b>Investiga la entidad</b> — análisis forense (captura, adiciones)<br>" + "O escribe tu duda concreta.";
    },
  };

  function escapeHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function diasHasta(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((d - hoy) / 86400000);
  }
  function tieneAlguno(str, keywords) { return keywords.some((k) => str.indexOf(k) >= 0); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(Consejero.init, 800));
  } else { setTimeout(Consejero.init, 800); }

  return { VERSION: CONFIG.version, CONFIG, DataLayer, MatchScore, PriceStrategy, Consejero };
})();
