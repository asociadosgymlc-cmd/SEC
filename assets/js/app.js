/* LICITA · Controlador de interfaz
 * Sesión, navegación con permisos, panel, análisis, historial por usuario,
 * gestión de clientes y monitoreo de la firma.
 */
(function () {
  "use strict";

  const K = LICITA.knowledge;
  const A = LICITA.analyzer;
  const D = LICITA.docs;
  const P = LICITA.parsers;
  const Auth = LICITA.auth;

  const LS_PROC = "licita.processes.v1";
  const histKey = (username) => "licita.history." + username;

  const state = {
    processes: [],
    history: [],
    pliego: null,
    lastResult: null,
    editingClientId: null,
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

  function initials(name) {
    return (name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "·";
  }

  function relativeDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const ms = Date.now() - d.getTime();
    const min = Math.round(ms / 60000);
    if (min < 1) return "hace instantes";
    if (min < 60) return "hace " + min + " min";
    const h = Math.round(min / 60);
    if (h < 24) return "hace " + h + " h";
    return d.toLocaleDateString("es-CO");
  }

  function riskTone(label) {
    return ({
      Bajo: "emerald",
      "Sin hallazgos": "emerald",
      Medio: "amber",
      Alto: "orange",
      Crítico: "rose",
    }[label] || "slate");
  }

  function riskBadge(label) {
    const tone = riskTone(label);
    return (
      '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-' +
      tone + "-100 text-" + tone + '-700">' + escapeHtml(label) + "</span>"
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
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function toast(msg, kind) {
    const wrap = $("#toastWrap");
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.innerHTML =
      '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' +
      "<span>" + escapeHtml(msg) + "</span>";
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity .3s, transform .3s";
      t.style.opacity = "0";
      t.style.transform = "translateX(20px)";
      setTimeout(() => t.remove(), 320);
    }, 3200);
  }

  function genPassword(len) {
    const a = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const b = "abcdefghijkmnpqrstuvwxyz";
    const c = "23456789";
    const all = a + b + c;
    let out = a.charAt(Math.floor(Math.random() * a.length)) +
              b.charAt(Math.floor(Math.random() * b.length)) +
              c.charAt(Math.floor(Math.random() * c.length));
    for (let i = out.length; i < (len || 10); i++)
      out += all.charAt(Math.floor(Math.random() * all.length));
    return out.split("").sort(() => Math.random() - 0.5).join("");
  }

  /* ---------------------------- navegación ---------------------------- */
  const SECTIONS = {
    dashboard: { title: "Dashboard", sub: "Resumen de tu actividad" },
    analisis: { title: "Análisis de Pliego", sub: "Carga un pliego y detecta riesgos jurídicos con IA" },
    historial: { title: "Historial", sub: "Tus análisis guardados" },
    marco: { title: "Marco Normativo", sub: "Normas y criterios que aplica el motor" },
    clientes: { title: "Clientes", sub: "Gestiona los accesos de tus clientes" },
    monitoreo: { title: "Monitoreo", sub: "Actividad de tus clientes en la plataforma" },
  };

  const ADMIN_ONLY_SECTIONS = ["clientes", "monitoreo"];

  function showSection(name) {
    if (ADMIN_ONLY_SECTIONS.includes(name) && !Auth.isAdmin()) name = "dashboard";
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
    if (name === "clientes") renderClients();
    if (name === "monitoreo") renderMonitoring();
    if (name === "historial") renderHistory();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------------------- dashboard ----------------------------- */
  function renderStats() {
    const procs = state.processes;
    const alertCount = procs.filter((p) => /Alto|Crítico/.test(p.riesgo)).length;
    const isAdmin = Auth.isAdmin();
    const cards = isAdmin
      ? [
          { label: "Procesos monitoreados", value: procs.length, trend: "Seguimiento activo", tone: "sky" },
          { label: "Clientes activos", value: Auth.listUsers().filter((u) => u.role === "client" && u.active).length, trend: "Con acceso a la plataforma", tone: "indigo" },
          { label: "Análisis (firma)", value: countAllAnalyses(), trend: "En todos los clientes", tone: "emerald" },
          { label: "Alertas de riesgo", value: alertCount, trend: "Procesos en alto/crítico", tone: "rose" },
        ]
      : [
          { label: "Procesos monitoreados", value: procs.length, trend: "Definidos por tu firma", tone: "sky" },
          { label: "Tus análisis", value: state.history.length, trend: "Histórico personal", tone: "indigo" },
          {
            label: "Observaciones generadas",
            value: state.history.reduce((s, h) => s + (h.findings ? h.findings.length : 0), 0),
            trend: "Listas para radicar",
            tone: "emerald",
          },
          { label: "Alertas de riesgo", value: alertCount, trend: "Procesos en alto/crítico", tone: "rose" },
        ];
    $("#statsGrid").innerHTML = cards
      .map((c) =>
        '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 card-hover">' +
        '<p class="text-xs font-medium text-slate-500">' + c.label + "</p>" +
        '<p class="text-3xl font-bold text-slate-900 mt-1.5">' + c.value + "</p>" +
        '<p class="text-xs text-' + c.tone + '-600 mt-1">' + c.trend + "</p></div>"
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
      .map((p, i) =>
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
    const counts = levels.map((l) => state.processes.filter((p) => p.riesgo === l).length);
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
      $$("#riskChart .bar-fill").forEach((b) => (b.style.width = b.dataset.w + "%"))
    );
  }

  function renderQuickActions() {
    const baseActions = [
      {
        title: "Analizar un pliego",
        desc: "Detecta riesgos jurídicos con IA",
        icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
        tone: "sky", go: "analisis",
      },
      {
        title: "Revisar historial",
        desc: state.history.length + " análisis guardados",
        icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
        tone: "indigo", go: "historial",
      },
      {
        title: "Consultar marco normativo",
        desc: K.norms.length + " normas · " + K.jurisprudence.length + " criterios",
        icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13",
        tone: "emerald", go: "marco",
      },
    ];
    if (Auth.isAdmin()) {
      baseActions.push({
        title: "Administrar clientes",
        desc: Auth.listUsers().filter((u) => u.role === "client").length + " clientes registrados",
        icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2.13a4 4 0 11-8 0 4 4 0 018 0z",
        tone: "amber", go: "clientes",
      });
      baseActions.push({
        title: "Monitorear actividad",
        desc: "Ver análisis y uso por cliente",
        icon: "M9 19V6h12M9 19a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h2a2 2 0 012 2",
        tone: "rose", go: "monitoreo",
      });
    }
    $("#quickActions").innerHTML = baseActions
      .map((a) =>
        '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 card-hover cursor-pointer" data-go="' + a.go + '">' +
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
    if (!id) { toast("Indica el número de proceso", "err"); return; }
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
      .map((e) =>
        '<p class="text-xs text-slate-500 italic bg-slate-50 border-l-2 border-' +
        tone + '-300 pl-2 py-1 mt-1">' + escapeHtml(e.context) + "</p>"
      )
      .join("");
    const juris = f.jurisprudencia
      .map((j) =>
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
          .map((j) =>
            '<div class="border border-slate-200 rounded-lg p-3">' +
            '<p class="text-xs font-semibold text-sky-700">' + escapeHtml(j.court) + "</p>" +
            '<p class="text-xs font-medium text-slate-700 mt-0.5">' + escapeHtml(j.topic) + "</p>" +
            '<p class="text-xs text-slate-600 mt-1 leading-relaxed">' + escapeHtml(j.holding) + "</p>" +
            "</div>"
          )
          .join("")
      : '<p class="text-sm text-slate-500">Sin criterios jurisprudenciales asociados.</p>';

    panel.innerHTML =
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
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in">' +
      '<h3 class="text-base font-semibold text-slate-900 mb-4">Análisis jurídico</h3>' +
      '<div class="space-y-3">' + findingsHtml + "</div></div>" +
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in">' +
      '<h3 class="text-base font-semibold text-slate-900 mb-1">Criterios jurisprudenciales</h3>' +
      '<p class="text-xs text-slate-400 mb-4">Doctrina de apoyo — verifica el radicado antes de citar</p>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' + jurisHtml + "</div></div>" +
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
    save(histKey(Auth.currentUser().username), state.history);
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
      ") contra las reglas del motor.</p></div>" +
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
          '<div class="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">' +
          '<div class="min-w-0"><div class="flex items-center gap-2 flex-wrap">' +
          '<p class="text-sm font-semibold text-slate-900">' +
          escapeHtml(h.proceso || "Proceso sin número") + "</p>" + riskBadge(h.riskLevel) + "</div>" +
          '<p class="text-xs text-slate-500 mt-0.5">' +
          escapeHtml(h.entidad || "Entidad no especificada") +
          (h.numeral ? " · " + escapeHtml(h.numeral) : "") + "</p>" +
          '<p class="text-[11px] text-slate-400 mt-0.5">' +
          d.toLocaleDateString("es-CO") + " · " + h.findings.length + " hallazgo(s)</p></div>" +
          '<button class="text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0" data-reopen="' + i + '">Reabrir</button></div>'
        );
      })
      .join("");
    $$("#historyList [data-reopen]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const h = state.history[Number(btn.dataset.reopen)];
        const result = A.analyze(h.input);
        showSection("analisis");
        prefillFromProcess({
          id: h.input.proceso, entidad: h.input.entidad,
          objeto: h.input.objeto, modalidad: h.input.modalidad,
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
      .map((n) =>
        '<div class="border border-slate-200 rounded-lg p-3.5">' +
        '<p class="text-sm font-semibold text-sky-700">' + escapeHtml(n.code) + "</p>" +
        '<p class="text-xs font-medium text-slate-700 mt-0.5">' + escapeHtml(n.title) + "</p>" +
        '<p class="text-xs text-slate-600 mt-1 leading-relaxed">' + escapeHtml(n.summary) + "</p></div>"
      )
      .join("");
    $("#jurisList").innerHTML = K.jurisprudence
      .map((j) =>
        '<div class="border border-slate-200 rounded-lg p-3.5">' +
        '<p class="text-sm font-semibold text-slate-800">' + escapeHtml(j.court) + "</p>" +
        '<p class="text-xs font-medium text-sky-700 mt-0.5">' + escapeHtml(j.topic) + "</p>" +
        '<p class="text-xs text-slate-600 mt-1 leading-relaxed">' + escapeHtml(j.holding) + "</p></div>"
      )
      .join("");
    $("#disclaimerText").textContent = K.disclaimer;
  }

  /* --------------------------- ejemplos ------------------------------ */
  function loadSample() {
    $("#f-proceso").value = "PN-ESBOL-MIC-013-2026";
    $("#f-entidad").value = "Escuela de Policía Simón Bolívar";
    $("#f-objeto").value = "Mantenimiento de sistemas de puesta a tierra";
    $("#f-modalidad").value = "minima_cuantia";
    const u = Auth.currentUser();
    $("#f-proponente").value = u ? u.name : "Asociados GYM LC S.A.S.";
    $("#f-numeral").value = "19 del Anexo Condiciones Técnicas Mínimas";
    $("#f-texto").value =
      "El proponente deberá acreditar que el personal técnico ofrecido se " +
      "encuentra vinculado mediante contrato de trabajo y figura en la nómina " +
      "de la empresa. Adicionalmente deberá demostrar mínimo cinco (5) contratos " +
      "similares ejecutados y diez (10) años de experiencia, así como certificación " +
      "ISO 9001 vigente y domicilio principal en la ciudad de ejecución.";
    toast("Requisito de ejemplo cargado");
  }

  /* --------------------- clientes (admin) ----------------------------- */
  function loadHistoryFor(username) {
    return load(histKey(username), []) || [];
  }
  function countAllAnalyses() {
    return Auth.listUsers().reduce(
      (s, u) => s + loadHistoryFor(u.username).length, 0
    );
  }

  function renderClients() {
    const body = $("#clientsBody");
    const all = Auth.listUsers();
    body.innerHTML = all
      .map((u) => {
        const total = loadHistoryFor(u.username).length;
        const isMe = Auth.currentUser() && Auth.currentUser().id === u.id;
        return (
          '<tr class="hover:bg-slate-50">' +
          '<td class="py-3 pr-3"><div class="flex items-center gap-3">' +
          '<div class="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white text-xs font-semibold">' +
          initials(u.name) + "</div>" +
          '<div><p class="text-sm font-semibold text-slate-900">' + escapeHtml(u.name) +
          (isMe ? ' <span class="text-[10px] text-slate-400">(tú)</span>' : "") + "</p>" +
          '<p class="text-xs text-slate-500">@' + escapeHtml(u.username) + "</p></div></div></td>" +
          '<td class="py-3 pr-3 text-xs text-slate-600">' +
          (u.email ? escapeHtml(u.email) + "<br>" : "") +
          (u.organization ? '<span class="text-slate-400">' + escapeHtml(u.organization) + "</span>" : "") + "</td>" +
          '<td class="py-3 pr-3 text-center"><span class="role-chip ' + u.role + '">' +
          (u.role === "admin" ? "Admin" : "Cliente") + "</span></td>" +
          '<td class="py-3 pr-3 text-center">' +
          '<label class="switch"><input type="checkbox" ' + (u.active ? "checked" : "") +
          (isMe ? " disabled" : "") + ' data-toggle="' + u.id + '"><span class="slider"></span></label></td>' +
          '<td class="py-3 pr-3 text-xs text-slate-500">' + relativeDate(u.lastLogin) + "</td>" +
          '<td class="py-3 pr-3 text-center text-sm font-semibold text-slate-700">' + total + "</td>" +
          '<td class="py-3 text-right whitespace-nowrap">' +
          '<button class="table-action primary" data-resetpass="' + u.id + '">Cambiar clave</button> ' +
          (isMe ? "" : '<button class="table-action danger" data-delete="' + u.id + '">Eliminar</button>') +
          "</td></tr>"
        );
      })
      .join("");

    $$("#clientsBody input[data-toggle]").forEach((cb) =>
      cb.addEventListener("change", async () => {
        try {
          await Auth.updateUser(cb.dataset.toggle, { active: cb.checked });
          toast(cb.checked ? "Cliente activado" : "Cliente desactivado", "ok");
          renderClients(); renderStats();
        } catch (e) { toast(e.message, "err"); cb.checked = !cb.checked; }
      })
    );
    $$("#clientsBody [data-delete]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.delete;
        const u = Auth.getUser(id);
        if (!confirm("¿Eliminar al cliente \"" + u.name + "\"? También se borrará su historial.")) return;
        try {
          Auth.deleteUser(id);
          try { localStorage.removeItem(histKey(u.username)); } catch (e) {}
          renderClients(); renderStats();
          toast("Cliente eliminado", "ok");
        } catch (e) { toast(e.message, "err"); }
      })
    );
    $$("#clientsBody [data-resetpass]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.resetpass;
        const u = Auth.getUser(id);
        const np = prompt("Nueva contraseña para " + u.username + " (mínimo 6 caracteres):", genPassword(10));
        if (!np) return;
        try {
          await Auth.updateUser(id, { password: np });
          showCredentials(u.username, np, u.name);
          renderClients();
        } catch (e) { toast(e.message, "err"); }
      })
    );
  }

  function openClientModal() {
    state.editingClientId = null;
    $("#clientModalTitle").textContent = "Nuevo cliente";
    ["c-name", "c-username", "c-password", "c-email", "c-org", "c-notes"].forEach((id) => ($("#" + id).value = ""));
    $("#c-password").value = genPassword(10);
    $("#c-error").classList.add("hidden");
    $("#clientModal").classList.remove("hidden");
    $("#clientModal").classList.add("flex");
    setTimeout(() => $("#c-name").focus(), 50);
  }
  function closeClientModal() {
    $("#clientModal").classList.add("hidden");
    $("#clientModal").classList.remove("flex");
  }
  async function saveClient() {
    const data = {
      name: $("#c-name").value,
      username: $("#c-username").value,
      password: $("#c-password").value,
      email: $("#c-email").value,
      organization: $("#c-org").value,
      notes: $("#c-notes").value,
      role: "client",
    };
    try {
      const u = await Auth.createUser(data);
      closeClientModal();
      showCredentials(u.username, data.password, u.name);
      renderClients(); renderStats();
    } catch (e) {
      $("#c-error").textContent = e.message;
      $("#c-error").classList.remove("hidden");
    }
  }

  function showCredentials(username, password, name) {
    $("#credentialsBox").innerHTML =
      '<div><span class="text-slate-500 text-xs">Cliente:</span><br><span class="text-slate-900">' +
      escapeHtml(name) + "</span></div>" +
      '<div class="pt-1.5 border-t border-slate-200"><span class="text-slate-500 text-xs">Usuario:</span><br><span class="text-slate-900 font-semibold">' +
      escapeHtml(username) + "</span></div>" +
      '<div class="pt-1.5 border-t border-slate-200"><span class="text-slate-500 text-xs">Contraseña:</span><br><span class="text-slate-900 font-semibold">' +
      escapeHtml(password) + "</span></div>";
    $("#credentialsModal").dataset.payload =
      "Bienvenido a LICITA — Plataforma jurídica de Asociados GYM LC.\n\n" +
      "Usuario: " + username + "\nContraseña: " + password +
      "\n\nAccede a la plataforma y cambia tu contraseña en el primer ingreso.";
    $("#credentialsModal").classList.remove("hidden");
    $("#credentialsModal").classList.add("flex");
  }
  function closeCredentialsModal() {
    $("#credentialsModal").classList.add("hidden");
    $("#credentialsModal").classList.remove("flex");
  }

  /* ------------------------ monitoreo (admin) ------------------------- */
  function allActivity() {
    const out = [];
    Auth.listUsers().forEach((u) => {
      const h = loadHistoryFor(u.username);
      h.forEach((item) => out.push(Object.assign({}, item, { _user: u.username, _name: u.name })));
    });
    out.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return out;
  }

  function renderMonitoring() {
    const users = Auth.listUsers();
    const clients = users.filter((u) => u.role === "client");
    const activeClients = clients.filter((u) => u.active);
    const activity = allActivity();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todays = activity.filter((a) => new Date(a.fecha) >= today).length;

    const cards = [
      { label: "Clientes registrados", value: clients.length, tone: "sky", trend: activeClients.length + " activos" },
      { label: "Análisis hoy", value: todays, tone: "indigo", trend: "Inicia a las 00:00" },
      { label: "Análisis totales", value: activity.length, tone: "emerald", trend: "Toda la firma" },
      { label: "Alertas de riesgo Alto/Crítico", value: activity.filter((a) => /Alto|Crítico/.test(a.riskLevel)).length, tone: "rose", trend: "Histórico" },
    ];
    $("#monStats").innerHTML = cards
      .map((c) =>
        '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">' +
        '<p class="text-xs font-medium text-slate-500">' + c.label + "</p>" +
        '<p class="text-3xl font-bold text-slate-900 mt-1.5">' + c.value + "</p>" +
        '<p class="text-xs text-' + c.tone + '-600 mt-1">' + c.trend + "</p></div>"
      )
      .join("");

    const feed = activity.slice(0, 25);
    $("#monFeed").innerHTML = feed.length
      ? feed
          .map((a) =>
            '<div class="border border-slate-200 rounded-lg p-3 flex items-center gap-3">' +
            '<div class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">' +
            initials(a._name) + "</div>" +
            '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-2 flex-wrap">' +
            '<p class="text-sm font-semibold text-slate-900">' + escapeHtml(a._name) + "</p>" +
            riskBadge(a.riskLevel) + "</div>" +
            '<p class="text-xs text-slate-500">' +
            escapeHtml(a.proceso || "Proceso sin número") + " · " +
            escapeHtml(a.entidad || "Entidad no especificada") + "</p>" +
            '<p class="text-[11px] text-slate-400">' + relativeDate(a.fecha) + " · " +
            (a.findings ? a.findings.length : 0) + " hallazgo(s)</p>" +
            "</div></div>"
          )
          .join("")
      : '<p class="text-sm text-slate-400 py-6 text-center">Aún no hay actividad. Cuando tus clientes hagan análisis, aparecerán aquí.</p>';

    const perClient = clients
      .map((u) => ({ u, n: loadHistoryFor(u.username).length }))
      .sort((a, b) => b.n - a.n);
    const max = Math.max(1, ...perClient.map((x) => x.n));
    $("#monPerClient").innerHTML = perClient.length
      ? perClient
          .map((x) => {
            const pct = Math.round((x.n / max) * 100);
            return (
              '<div><div class="flex justify-between text-xs mb-1">' +
              '<span class="font-medium text-slate-700">' + escapeHtml(x.u.name) + "</span>" +
              '<span class="text-slate-400">' + x.n + "</span></div>" +
              '<div class="bar-track"><div class="bar-fill bg-sky-500" style="width:0%" data-w="' + pct + '"></div></div></div>'
            );
          })
          .join("")
      : '<p class="text-sm text-slate-400 py-6 text-center">Crea tu primer cliente para ver esta gráfica.</p>';
    requestAnimationFrame(() =>
      $$("#monPerClient .bar-fill").forEach((b) => (b.style.width = b.dataset.w + "%"))
    );
  }

  /* ----------------------------- sesión ------------------------------- */
  function applyRoleVisibility() {
    const isAdmin = Auth.isAdmin();
    $$("[data-admin-only]").forEach((el) => el.classList.toggle("hidden", !isAdmin));
  }

  function renderSessionCard() {
    const u = Auth.currentUser();
    if (!u) return;
    $("#sessionCard").innerHTML =
      '<div class="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">' +
      initials(u.name) + "</div>" +
      '<div class="min-w-0 flex-1"><p class="text-sm font-semibold text-slate-800 truncate">' +
      escapeHtml(u.name) + "</p>" +
      '<p class="text-[11px] text-slate-500">@' + escapeHtml(u.username) +
      ' · <span class="role-chip ' + u.role + '">' +
      (u.role === "admin" ? "Admin" : "Cliente") + "</span></p></div>";
    $("#headerUserName").textContent = u.name;
    $("#headerUserRole").textContent = u.role === "admin" ? "Administrador · " + (u.organization || "") : (u.organization || "Cliente");
    $("#headerAvatar").textContent = initials(u.name);
  }

  function showLanding() {
    document.body.classList.remove("locked");
    $("#loginScreen").classList.add("hidden");
    $("#loginScreen").classList.remove("flex");
    $("#appRoot").classList.add("hidden");
    $("#landingPage").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function showApp() {
    const u = Auth.currentUser();
    if (!u) { showLogin(); return; }
    document.body.classList.remove("locked");
    $("#landingPage").classList.add("hidden");
    $("#loginScreen").classList.add("hidden");
    $("#loginScreen").classList.remove("flex");
    $("#appRoot").classList.remove("hidden");

    state.processes = load(LS_PROC, null) || K.seedProcesses.slice();
    save(LS_PROC, state.processes);
    state.history = loadHistoryFor(u.username);

    applyRoleVisibility();
    renderSessionCard();
    renderDashboard();
    renderHistory();
    renderMarco();
    showSection("dashboard");

    if (u.mustChangePassword) {
      setTimeout(() =>
        toast("Recuerda cambiar la contraseña por defecto desde Clientes.", "err"), 800);
    }
  }

  function showLogin() {
    document.body.classList.add("locked");
    $("#landingPage").classList.add("hidden");
    $("#appRoot").classList.add("hidden");
    $("#loginScreen").classList.remove("hidden");
    $("#loginScreen").classList.add("flex");
    $("#loginError").classList.add("hidden");
    $("#loginUser").value = "";
    $("#loginPass").value = "";
    setTimeout(() => $("#loginUser").focus(), 100);
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = $("#loginUser").value.trim();
    const password = $("#loginPass").value;
    if (!username || !password) {
      $("#loginError").textContent = "Ingresa usuario y contraseña.";
      $("#loginError").classList.remove("hidden");
      return;
    }
    $("#loginBtn").disabled = true;
    $("#loginBtnLabel").textContent = "Verificando…";
    const res = await Auth.login(username, password);
    $("#loginBtn").disabled = false;
    $("#loginBtnLabel").textContent = "Entrar a la plataforma";
    if (!res.ok) {
      $("#loginError").textContent = res.error;
      $("#loginError").classList.remove("hidden");
      return;
    }
    showApp();
    toast("Bienvenido, " + res.user.name, "ok");
  }

  function handleLogout() {
    Auth.logout();
    showLanding();
  }

  /* ------------------ landing pública (rutas/scroll) ------------------ */
  function bindLanding() {
    document.querySelectorAll("[data-go-login]").forEach((b) =>
      b.addEventListener("click", (e) => { e.preventDefault(); showLogin(); })
    );
    document.querySelectorAll("[data-scroll]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.preventDefault();
        const id = b.dataset.scroll;
        if (id === "hero") {
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      })
    );
    const cf = $("#contactForm");
    if (cf) cf.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#ct-name").value.trim();
      const org = $("#ct-org").value.trim();
      const phone = $("#ct-phone").value.trim();
      const email = $("#ct-email").value.trim();
      const subject = $("#ct-subject").value.trim() || "Solicitud de acceso a LICITA";
      const msg = $("#ct-message").value.trim();
      if (!name || !email) {
        toast("Indica al menos tu nombre y correo", "err");
        return;
      }
      const body =
        "Hola, equipo de Asociados GYM LC,\n\n" +
        "Quiero solicitar acceso a LICITA.\n\n" +
        "Nombre: " + name + "\n" +
        (org ? "Empresa: " + org + "\n" : "") +
        (phone ? "WhatsApp: " + phone + "\n" : "") +
        "Correo: " + email + "\n\n" +
        (msg ? "Mensaje:\n" + msg + "\n" : "");
      const href =
        "mailto:asociadosgym.lc@gmail.com?subject=" +
        encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      window.location.href = href;
      toast("Abriendo tu cliente de correo…", "ok");
    });
  }

  /* ----------------------------- eventos ------------------------------ */
  function bindEvents() {
    // login
    $("#loginForm").addEventListener("submit", handleLogin);
    $("#togglePass").addEventListener("click", () => {
      const i = $("#loginPass");
      i.type = i.type === "password" ? "text" : "password";
    });
    $("#logoutBtn").addEventListener("click", handleLogout);
    $("#backToLanding").addEventListener("click", showLanding);
    bindLanding();

    // nav
    $$("#navMenu .nav-link").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        showSection(a.dataset.section);
      })
    );
    $("#newAnalysisBtn").addEventListener("click", () => showSection("analisis"));

    // modal proceso
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
      if (!confirm("¿Vaciar tu historial de análisis?")) return;
      state.history = [];
      save(histKey(Auth.currentUser().username), state.history);
      renderHistory(); renderStats();
      toast("Historial vaciado", "ok");
    });

    // clientes
    $("#addClientBtn").addEventListener("click", openClientModal);
    $("#c-cancel").addEventListener("click", closeClientModal);
    $("#c-save").addEventListener("click", saveClient);
    $("#c-genpass").addEventListener("click", () => ($("#c-password").value = genPassword(10)));
    $("#clientModal").addEventListener("click", (e) => {
      if (e.target.id === "clientModal") closeClientModal();
    });

    // credenciales
    $("#cred-close").addEventListener("click", closeCredentialsModal);
    $("#cred-copy").addEventListener("click", () => {
      const txt = $("#credentialsModal").dataset.payload || "";
      navigator.clipboard.writeText(txt).then(() => toast("Credenciales copiadas", "ok"));
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal(); closeClientModal(); closeCredentialsModal();
      }
    });
  }

  /* ------------------------------ init -------------------------------- */
  function init() {
    Auth.init();
    bindEvents();
    if (Auth.currentUser()) showApp();
    else showLanding();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
