/* LICITA · Controlador de interfaz
 * Navegación, panel, análisis interactivo, historial y marco normativo.
 */
(function () {
  "use strict";

  const K = LICITA.knowledge;
  const A = LICITA.analyzer;
  const D = LICITA.docs;
  const P = LICITA.parsers;

  const LS_PROC = "licita.processes.v1";
  const LS_HIST = "licita.history.v1";

  const state = {
    processes: [],
    history: [],
    pliego: null, // { text, name, type, size }
    lastResult: null,
  };

  /* ---------------------------- utilidades ---------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function formatCOP(n) {
    const v = Number(n) || 0;
    return "$" + v.toLocaleString("es-CO");
  }

  function riskTone(label) {
    return (
      {
        Bajo: "emerald",
        "Sin hallazgos": "emerald",
        Medio: "amber",
        Alto: "orange",
        Crítico: "rose",
      }[label] || "slate"
    );
  }

  function riskBadge(label) {
    const tone = riskTone(label);
    return (
      '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-' +
      tone +
      "-100 text-" +
      tone +
      '-700">' +
      escapeHtml(label) +
      "</span>"
    );
  }

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* almacenamiento no disponible */
    }
  }

  function toast(msg, kind) {
    const wrap = $("#toastWrap");
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.innerHTML =
      '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' +
      '<span>' + escapeHtml(msg) + "</span>";
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity .3s, transform .3s";
      t.style.opacity = "0";
      t.style.transform = "translateX(20px)";
      setTimeout(() => t.remove(), 320);
    }, 3200);
  }

  /* ---------------------------- navegación ---------------------------- */
  const SECTIONS = {
    dashboard: { title: "Dashboard", sub: "Resumen de tu actividad de seguimiento" },
    analisis: { title: "Análisis de Pliego", sub: "Carga un pliego y detecta riesgos jurídicos con IA" },
    historial: { title: "Historial", sub: "Análisis guardados en este navegador" },
    marco: { title: "Marco Normativo", sub: "Normas y criterios que aplica el motor de análisis" },
  };

  function showSection(name) {
    Object.keys(SECTIONS).forEach((s) => {
      const sec = $("#" + s + "-section");
      if (sec) sec.classList.toggle("hidden", s !== name);
    });
    $$("#navMenu .nav-link").forEach((a) =>
      a.classList.toggle("active", a.dataset.section === name)
    );
    const meta = SECTIONS[name];
    $("#page-title").textContent = meta.title;
    $("#page-sub").textContent = meta.sub;
    $("#newAnalysisBtn").classList.toggle("hidden", name === "analisis");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------------------- dashboard ----------------------------- */
  function renderStats() {
    const procs = state.processes;
    const alertCount = procs.filter((p) => /Alto|Crítico/.test(p.riesgo)).length;
    const cards = [
      { label: "Procesos monitoreados", value: procs.length, trend: "Seguimiento activo", tone: "sky" },
      { label: "Análisis realizados", value: state.history.length, trend: "Histórico local", tone: "indigo" },
      {
        label: "Observaciones generadas",
        value: state.history.reduce((s, h) => s + (h.findings ? h.findings.length : 0), 0),
        trend: "Listas para radicar",
        tone: "emerald",
      },
      { label: "Alertas de riesgo", value: alertCount, trend: "Riesgo alto o crítico", tone: "rose" },
    ];
    $("#statsGrid").innerHTML = cards
      .map(
        (c) =>
          '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 card-hover">' +
          '<p class="text-xs font-medium text-slate-500">' + c.label + "</p>" +
          '<p class="text-3xl font-bold text-slate-900 mt-1.5">' + c.value + "</p>" +
          '<p class="text-xs text-' + c.tone + '-600 mt-1">' + c.trend + "</p>" +
          "</div>"
      )
      .join("");
  }

  function renderProcesses() {
    const body = $("#processesBody");
    if (!state.processes.length) {
      body.innerHTML =
        '<tr><td colspan="4" class="py-6 text-center text-sm text-slate-400">Sin procesos en seguimiento.</td></tr>';
      return;
    }
    body.innerHTML = state.processes
      .map(
        (p, i) =>
          '<tr class="hover:bg-sky-50/60 cursor-pointer transition-colors" data-proc="' + i + '">' +
          '<td class="py-3 pr-2"><p class="text-sm font-semibold text-slate-900">' +
          escapeHtml(p.id) + "</p>" +
          '<p class="text-xs text-slate-500">' + escapeHtml(p.objeto) + "</p></td>" +
          '<td class="py-3 pr-2 text-sm text-slate-600">' + escapeHtml(p.entidad) + "</td>" +
          '<td class="py-3 pr-2 text-sm text-slate-900 font-medium text-right whitespace-nowrap">' +
          formatCOP(p.cuantia) + "</td>" +
          '<td class="py-3 text-center">' + riskBadge(p.riesgo) + "</td>" +
          "</tr>"
      )
      .join("");
    $$("#processesBody tr[data-proc]").forEach((tr) => {
      tr.addEventListener("click", () => {
        const p = state.processes[Number(tr.dataset.proc)];
        prefillFromProcess(p);
        showSection("analisis");
        toast("Proceso " + p.id + " precargado en el análisis");
      });
    });
  }

  function renderRiskChart() {
    const levels = ["Bajo", "Medio", "Alto", "Crítico"];
    const counts = levels.map(
      (l) => state.processes.filter((p) => p.riesgo === l).length
    );
    const max = Math.max(1, ...counts);
    $("#riskChart").innerHTML = levels
      .map((l, i) => {
        const tone = riskTone(l);
        const pct = Math.round((counts[i] / max) * 100);
        return (
          '<div><div class="flex justify-between text-xs mb-1">' +
          '<span class="font-medium text-slate-600">' + l + "</span>" +
          '<span class="text-slate-400">' + counts[i] + "</span></div>" +
          '<div class="bar-track"><div class="bar-fill bg-' + tone +
          '-500" style="width:0%" data-w="' + pct + '"></div></div></div>'
        );
      })
      .join("");
    requestAnimationFrame(() =>
      $$("#riskChart .bar-fill").forEach(
        (b) => (b.style.width = b.dataset.w + "%")
      )
    );
  }

  function renderQuickActions() {
    const actions = [
      {
        title: "Analizar un pliego",
        desc: "Detecta riesgos jurídicos con IA",
        icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
        tone: "sky",
        go: "analisis",
      },
      {
        title: "Revisar historial",
        desc: state.history.length + " análisis guardados",
        icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
        tone: "indigo",
        go: "historial",
      },
      {
        title: "Consultar marco normativo",
        desc: K.norms.length + " normas · " + K.jurisprudence.length + " criterios",
        icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253",
        tone: "emerald",
        go: "marco",
      },
    ];
    $("#quickActions").innerHTML = actions
      .map(
        (a) =>
          '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 card-hover cursor-pointer" data-go="' +
          a.go + '">' +
          '<div class="flex items-center gap-4">' +
          '<div class="w-11 h-11 bg-' + a.tone + '-100 rounded-lg flex items-center justify-center flex-shrink-0">' +
          '<svg class="w-5 h-5 text-' + a.tone + '-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="' + a.icon + '"/></svg></div>' +
          '<div><p class="text-sm font-semibold text-slate-900">' + a.title + "</p>" +
          '<p class="text-xs text-slate-500">' + a.desc + "</p></div></div></div>"
      )
      .join("");
    $$("#quickActions [data-go]").forEach((c) =>
      c.addEventListener("click", () => showSection(c.dataset.go))
    );
  }

  function renderDashboard() {
    renderStats();
    renderProcesses();
    renderRiskChart();
    renderQuickActions();
  }

  /* ---------------------------- modal proceso ------------------------- */
  function openModal() {
    $("#processModal").classList.remove("hidden");
    $("#processModal").classList.add("flex");
  }
  function closeModal() {
    $("#processModal").classList.add("hidden");
    $("#processModal").classList.remove("flex");
    ["m-id", "m-objeto", "m-entidad", "m-cuantia"].forEach((id) => ($("#" + id).value = ""));
  }
  function saveProcess() {
    const id = $("#m-id").value.trim();
    if (!id) {
      toast("Indica el número de proceso", "err");
      return;
    }
    state.processes.unshift({
      id,
      objeto: $("#m-objeto").value.trim() || "Sin descripción",
      entidad: $("#m-entidad").value.trim() || "Entidad no especificada",
      cuantia: Number($("#m-cuantia").value) || 0,
      riesgo: $("#m-riesgo").value,
      modalidad: "minima_cuantia",
      fecha: new Date().toISOString().slice(0, 10),
    });
    save(LS_PROC, state.processes);
    renderDashboard();
    closeModal();
    toast("Proceso agregado a seguimiento", "ok");
  }

  /* ---------------------------- análisis ------------------------------ */
  function prefillFromProcess(p) {
    $("#f-proceso").value = p.id || "";
    $("#f-entidad").value = p.entidad || "";
    $("#f-objeto").value = p.objeto || "";
    if (p.modalidad) $("#f-modalidad").value = p.modalidad;
  }

  function collectInput() {
    return {
      proceso: $("#f-proceso").value.trim(),
      entidad: $("#f-entidad").value.trim(),
      objeto: $("#f-objeto").value.trim(),
      proponente: $("#f-proponente").value.trim(),
      numeral: $("#f-numeral").value.trim(),
      modalidad: $("#f-modalidad").value,
      textoRequisito: $("#f-texto").value.trim(),
    };
  }

  const LOADING_STEPS = [
    "Extrayendo cláusulas del requisito",
    "Contrastando con el marco normativo",
    "Buscando criterios jurisprudenciales",
    "Calculando el nivel de riesgo",
    "Redactando la observación",
  ];

  function runLoadingAnimation(done) {
    $("#emptyState").classList.add("hidden");
    $("#resultsPanel").classList.add("hidden");
    $("#loadingState").classList.remove("hidden");
    const stepsBox = $("#loadingSteps");
    stepsBox.innerHTML = LOADING_STEPS.map(
      (s) => '<div class="load-step pending">' + s + "</div>"
    ).join("");
    const nodes = $$("#loadingSteps .load-step");
    let i = 0;
    const tick = () => {
      if (i > 0) {
        nodes[i - 1].classList.remove("pending");
        nodes[i - 1].classList.add("done");
      }
      if (i < nodes.length) {
        $("#loadingText").textContent = LOADING_STEPS[i] + "…";
        i++;
        setTimeout(tick, 480);
      } else {
        $("#loadingState").classList.add("hidden");
        done();
      }
    };
    tick();
  }

  function findingCard(f, idx) {
    const tone = f.weight >= 4 ? "rose" : f.weight >= 3 ? "orange" : "amber";
    const evidence = f.evidence
      .map(
        (e) =>
          '<p class="text-xs text-slate-500 italic bg-slate-50 border-l-2 border-' +
          tone + '-300 pl-2 py-1 mt-1">' + escapeHtml(e.context) + "</p>"
      )
      .join("");
    const juris = f.jurisprudencia
      .map(
        (j) =>
          '<li class="text-xs text-slate-600 mt-1"><span class="font-semibold text-slate-700">' +
          escapeHtml(j.court) + ":</span> " + escapeHtml(j.holding) + "</li>"
      )
      .join("");
    return (
      '<div class="border border-slate-200 rounded-lg p-4">' +
      '<div class="flex items-start gap-3">' +
      '<span class="w-6 h-6 rounded-full bg-' + tone + '-100 text-' + tone +
      '-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">' +
      (idx + 1) + "</span>" +
      '<div class="flex-1 min-w-0">' +
      '<div class="flex items-center gap-2 flex-wrap">' +
      '<p class="text-sm font-semibold text-slate-900">' + escapeHtml(f.title) + "</p>" +
      '<span class="text-[10px] font-medium uppercase tracking-wide bg-' + tone +
      '-50 text-' + tone + '-700 px-1.5 py-0.5 rounded">' + escapeHtml(f.category) + "</span></div>" +
      evidence +
      '<p class="text-sm text-slate-700 mt-2 leading-relaxed">' + escapeHtml(f.legalBasis) + "</p>" +
      '<p class="text-xs text-slate-500 mt-2"><span class="font-semibold">Fundamento normativo:</span> ' +
      escapeHtml(f.norma) + "</p>" +
      (juris ? '<ul class="mt-1.5 list-none">' + juris + "</ul>" : "") +
      '<div class="mt-2 bg-sky-50 border border-sky-100 rounded p-2">' +
      '<p class="text-xs text-sky-800"><span class="font-semibold">Recomendación:</span> ' +
      escapeHtml(f.recomendacion) + "</p></div>" +
      "</div></div></div>"
    );
  }

  function renderResults(result) {
    state.lastResult = result;
    const tone = riskTone(result.riskLevel);
    const needlePct = Math.min(96, 6 + result.riskScore * 7);
    const panel = $("#resultsPanel");

    const findingsHtml = result.findings.length
      ? result.findings.map((f, i) => findingCard(f, i)).join("")
      : '<p class="text-sm text-slate-500">No se detectaron patrones de riesgo conocidos. ' +
        "Se recomienda revisión integral por un profesional del derecho.</p>";

    const jurisHtml = result.jurisprudencia.length
      ? result.jurisprudencia
          .map(
            (j) =>
              '<div class="border border-slate-200 rounded-lg p-3">' +
              '<p class="text-xs font-semibold text-sky-700">' + escapeHtml(j.court) + "</p>" +
              '<p class="text-xs font-medium text-slate-700 mt-0.5">' + escapeHtml(j.topic) + "</p>" +
              '<p class="text-xs text-slate-600 mt-1 leading-relaxed">' + escapeHtml(j.holding) + "</p>" +
              "</div>"
          )
          .join("")
      : '<p class="text-sm text-slate-500">Sin criterios jurisprudenciales asociados.</p>';

    panel.innerHTML =
      /* --- tarjeta de riesgo --- */
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in">' +
      '<div class="flex items-center justify-between flex-wrap gap-4">' +
      '<div class="flex items-center gap-4">' +
      '<div class="w-14 h-14 rounded-full bg-' + tone + '-100 flex items-center justify-center">' +
      '<svg class="w-7 h-7 text-' + tone + '-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></div>' +
      '<div><p class="text-xs font-medium text-slate-500 uppercase tracking-wide">Nivel de riesgo jurídico</p>' +
      '<p class="text-2xl font-bold text-' + tone + '-700">' + escapeHtml(result.riskLevel) + "</p></div></div>" +
      '<div class="text-right"><p class="text-xs text-slate-400">Hallazgos</p>' +
      '<p class="text-2xl font-bold text-slate-900">' + result.findings.length + "</p></div></div>" +
      '<div class="mt-5"><div class="risk-meter"><div class="needle" style="left:' + needlePct + '%"></div></div>' +
      '<div class="flex justify-between text-[10px] text-slate-400 mt-1.5">' +
      "<span>Bajo</span><span>Medio</span><span>Alto</span><span>Crítico</span></div></div>" +
      '<p class="text-sm text-slate-600 mt-4 leading-relaxed">' + escapeHtml(result.summary) + "</p></div>" +

      /* --- análisis jurídico --- */
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in">' +
      '<h3 class="text-base font-semibold text-slate-900 mb-4">Análisis jurídico</h3>' +
      '<div class="space-y-3">' + findingsHtml + "</div></div>" +

      /* --- jurisprudencia --- */
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in">' +
      '<h3 class="text-base font-semibold text-slate-900 mb-1">Criterios jurisprudenciales</h3>' +
      '<p class="text-xs text-slate-400 mb-4">Doctrina de apoyo — verifica el radicado antes de citar</p>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' + jurisHtml + "</div></div>" +

      /* --- observación redactada --- */
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in">' +
      '<div class="flex items-center justify-between mb-3 flex-wrap gap-2">' +
      '<h3 class="text-base font-semibold text-slate-900">Observación redactada</h3>' +
      '<span class="text-xs text-slate-400">Editable antes de descargar</span></div>' +
      '<textarea id="obsText" class="field doc-text h-96">' + escapeHtml(result.observation) + "</textarea>" +
      '<div class="mt-4 flex flex-wrap gap-3">' +
      '<button id="copyObsBtn" class="bg-sky-600 text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-sky-700 transition-colors flex items-center gap-2">' +
      '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>Copiar</button>' +
      '<button id="downloadObsBtn" class="border border-slate-300 text-slate-700 text-sm font-medium py-2 px-4 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2">' +
      '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Descargar Word</button>' +
      "</div>" +
      '<p class="text-[11px] text-slate-400 mt-3">' + escapeHtml(K.disclaimer) + "</p></div>";

    panel.classList.remove("hidden");

    $("#copyObsBtn").addEventListener("click", () => {
      const txt = $("#obsText").value;
      navigator.clipboard
        ? navigator.clipboard.writeText(txt).then(() => toast("Observación copiada", "ok"))
        : (function () {
            $("#obsText").select();
            document.execCommand("copy");
            toast("Observación copiada", "ok");
          })();
    });
    $("#downloadObsBtn").addEventListener("click", () => {
      const r = Object.assign({}, result);
      r.observation = $("#obsText").value;
      D.downloadWord(r);
      toast("Documento Word generado", "ok");
    });
  }

  function pushHistory(result) {
    state.history.unshift({
      fecha: result.meta.fecha,
      proceso: result.meta.proceso,
      entidad: result.meta.entidad,
      numeral: result.meta.numeral,
      modalidad: result.meta.modalidad,
      riskLevel: result.riskLevel,
      findings: result.findings.map((f) => ({ title: f.title })),
      input: result.meta,
    });
    state.history = state.history.slice(0, 40);
    save(LS_HIST, state.history);
    renderStats();
  }

  function doAnalyze() {
    const input = collectInput();
    if (!input.textoRequisito) {
      toast("Pega el texto del requisito que deseas analizar", "err");
      $("#f-texto").focus();
      return;
    }
    runLoadingAnimation(() => {
      const result = A.analyze(input);
      renderResults(result);
      pushHistory(result);
      toast("Análisis completado · riesgo " + result.riskLevel, "ok");
    });
  }

  /* ------------------------ escaneo de pliego ------------------------- */
  function renderPliegoScan(scan) {
    const tone = riskTone(scan.level);
    const panel = $("#resultsPanel");
    $("#emptyState").classList.add("hidden");
    const findingsHtml = scan.findings.length
      ? scan.findings.map((f, i) => findingCard(f, i)).join("")
      : '<p class="text-sm text-emerald-700">No se detectaron patrones de riesgo conocidos en el documento.</p>';
    panel.innerHTML =
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in">' +
      '<div class="flex items-center justify-between flex-wrap gap-3">' +
      '<div><p class="text-xs font-medium text-slate-500 uppercase tracking-wide">Escaneo del pliego completo</p>' +
      '<p class="text-xl font-bold text-' + tone + '-700">Riesgo ' + escapeHtml(scan.level) + "</p></div>" +
      '<div class="flex gap-6 text-right">' +
      '<div><p class="text-xs text-slate-400">Palabras</p><p class="text-lg font-bold text-slate-900">' +
      scan.words.toLocaleString("es-CO") + "</p></div>" +
      '<div><p class="text-xs text-slate-400">Hallazgos</p><p class="text-lg font-bold text-slate-900">' +
      scan.findings.length + "</p></div></div></div>" +
      '<p class="text-sm text-slate-600 mt-3">Se revisó el documento cargado (' +
      escapeHtml(state.pliego ? state.pliego.name : "") +
      ") contra las reglas del motor. Revisa cada hallazgo y úsalo como guía para " +
      "redactar observaciones específicas.</p></div>" +
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in">' +
      '<h3 class="text-base font-semibold text-slate-900 mb-4">Hallazgos en el pliego</h3>' +
      '<div class="space-y-3">' + findingsHtml + "</div></div>";
    panel.classList.remove("hidden");
  }

  function doScanPliego() {
    if (!state.pliego || !state.pliego.text) {
      toast("Primero carga un pliego", "err");
      return;
    }
    runLoadingAnimation(() => {
      const scan = A.scanPliego(state.pliego.text);
      renderPliegoScan(scan);
      toast("Pliego escaneado · " + scan.findings.length + " hallazgos", "ok");
    });
  }

  async function handleFile(file) {
    $("#fileText").textContent = "Procesando " + file.name + "…";
    try {
      const res = await P.extract(file);
      state.pliego = res;
      $("#fileText").textContent = res.name;
      $("#fileMeta").classList.remove("hidden");
      $("#fileMeta").innerHTML =
        '<div class="flex items-center justify-between">' +
        '<span class="font-medium text-slate-700">' + escapeHtml(res.type) + " · " +
        Math.max(1, Math.round(res.size / 1024)) + " KB</span>" +
        '<span class="text-emerald-600 font-medium">' +
        res.text.split(/\s+/).filter(Boolean).length.toLocaleString("es-CO") +
        " palabras</span></div>";
      $("#scanPliegoBtn").classList.remove("hidden");
      toast("Pliego cargado correctamente", "ok");
    } catch (err) {
      state.pliego = null;
      $("#fileText").textContent = "Arrastra o haz clic para cargar PDF, DOCX o TXT";
      $("#fileMeta").classList.add("hidden");
      $("#scanPliegoBtn").classList.add("hidden");
      toast(err.message || "No se pudo leer el archivo", "err");
    }
  }

  /* ---------------------------- historial ----------------------------- */
  function renderHistory() {
    const box = $("#historyList");
    if (!state.history.length) {
      box.innerHTML =
        '<p class="text-sm text-slate-400 py-8 text-center">Aún no has realizado análisis. ' +
        'Ve a "Análisis de Pliego" para comenzar.</p>';
      return;
    }
    box.innerHTML = state.history
      .map((h, i) => {
        const d = new Date(h.fecha);
        return (
          '<div class="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4" data-hist="' +
          i + '">' +
          '<div class="min-w-0"><div class="flex items-center gap-2 flex-wrap">' +
          '<p class="text-sm font-semibold text-slate-900">' +
          escapeHtml(h.proceso || "Proceso sin número") + "</p>" + riskBadge(h.riskLevel) + "</div>" +
          '<p class="text-xs text-slate-500 mt-0.5">' +
          escapeHtml(h.entidad || "Entidad no especificada") +
          (h.numeral ? " · " + escapeHtml(h.numeral) : "") + "</p>" +
          '<p class="text-[11px] text-slate-400 mt-0.5">' +
          d.toLocaleDateString("es-CO") + " · " + h.findings.length + " hallazgo(s)</p></div>" +
          '<button class="text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0" data-reopen="' +
          i + '">Reabrir</button></div>'
        );
      })
      .join("");
    $$("#historyList [data-reopen]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const h = state.history[Number(btn.dataset.reopen)];
        const result = A.analyze(h.input);
        showSection("analisis");
        prefillFromProcess({
          id: h.input.proceso,
          entidad: h.input.entidad,
          objeto: h.input.objeto,
          modalidad: h.input.modalidad,
        });
        $("#f-numeral").value = h.input.numeral || "";
        $("#f-texto").value = h.input.textoRequisito || "";
        $("#f-proponente").value = h.input.proponente || "";
        renderResults(result);
        toast("Análisis reabierto");
      });
    });
  }

  /* ------------------------- marco normativo -------------------------- */
  function renderMarco() {
    $("#normsList").innerHTML = K.norms
      .map(
        (n) =>
          '<div class="border border-slate-200 rounded-lg p-3.5">' +
          '<p class="text-sm font-semibold text-sky-700">' + escapeHtml(n.code) + "</p>" +
          '<p class="text-xs font-medium text-slate-700 mt-0.5">' + escapeHtml(n.title) + "</p>" +
          '<p class="text-xs text-slate-600 mt-1 leading-relaxed">' + escapeHtml(n.summary) + "</p></div>"
      )
      .join("");
    $("#jurisList").innerHTML = K.jurisprudence
      .map(
        (j) =>
          '<div class="border border-slate-200 rounded-lg p-3.5">' +
          '<p class="text-sm font-semibold text-slate-800">' + escapeHtml(j.court) + "</p>" +
          '<p class="text-xs font-medium text-sky-700 mt-0.5">' + escapeHtml(j.topic) + "</p>" +
          '<p class="text-xs text-slate-600 mt-1 leading-relaxed">' + escapeHtml(j.holding) + "</p></div>"
      )
      .join("");
    $("#disclaimerText").textContent = K.disclaimer;
  }

  /* ---------------------------- ejemplos ------------------------------ */
  function loadSample() {
    $("#f-proceso").value = "PN-ESBOL-MIC-013-2026";
    $("#f-entidad").value = "Escuela de Policía Simón Bolívar";
    $("#f-objeto").value = "Mantenimiento de sistemas de puesta a tierra";
    $("#f-modalidad").value = "minima_cuantia";
    $("#f-proponente").value = "Asociados GYM LC S.A.S.";
    $("#f-numeral").value = "19 del Anexo Condiciones Técnicas Mínimas";
    $("#f-texto").value =
      "El proponente deberá acreditar que el personal técnico ofrecido se " +
      "encuentra vinculado mediante contrato de trabajo y figura en la nómina " +
      "de la empresa. Adicionalmente deberá demostrar mínimo cinco (5) contratos " +
      "similares ejecutados y diez (10) años de experiencia, así como certificación " +
      "ISO 9001 vigente y domicilio principal en la ciudad de ejecución.";
    toast("Requisito de ejemplo cargado");
  }

  /* ----------------------------- eventos ------------------------------ */
  function bindEvents() {
    $$("#navMenu .nav-link").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        showSection(a.dataset.section);
      })
    );
    $("#newAnalysisBtn").addEventListener("click", () => showSection("analisis"));

    // modal
    $("#addProcessBtn").addEventListener("click", openModal);
    $("#m-cancel").addEventListener("click", closeModal);
    $("#m-save").addEventListener("click", saveProcess);
    $("#processModal").addEventListener("click", (e) => {
      if (e.target.id === "processModal") closeModal();
    });

    // archivo
    const dz = $("#dropZone");
    dz.addEventListener("click", () => $("#fileInput").click());
    $("#fileInput").addEventListener("change", (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });
    ["dragover", "dragenter"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add("border-sky-400", "bg-sky-50/40");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove("border-sky-400", "bg-sky-50/40");
      })
    );
    dz.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    });

    $("#scanPliegoBtn").addEventListener("click", doScanPliego);
    $("#analyzeBtn").addEventListener("click", doAnalyze);
    $("#loadSampleBtn").addEventListener("click", loadSample);

    // historial
    $("#clearHistoryBtn").addEventListener("click", () => {
      if (!state.history.length) return;
      state.history = [];
      save(LS_HIST, state.history);
      renderHistory();
      renderStats();
      toast("Historial vaciado", "ok");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  /* ------------------------------ init -------------------------------- */
  function init() {
    state.processes = load(LS_PROC, null) || K.seedProcesses.slice();
    save(LS_PROC, state.processes);
    state.history = load(LS_HIST, []) || [];

    bindEvents();
    renderDashboard();
    renderHistory();
    renderMarco();
    showSection("dashboard");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
