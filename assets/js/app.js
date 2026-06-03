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
    secop: { title: "Buscar en SECOP 2", sub: "Procesos publicados en vivo · Colombia Compra Eficiente" },
    paa: { title: "Plan Anual de Adquisiciones", sub: "Anticipa lo que las entidades planean comprar este año" },
    historial: { title: "Historial", sub: "Tus análisis guardados" },
    marco: { title: "Marco Normativo", sub: "Normas y criterios que aplica el motor" },
    formacion: { title: "Formación", sub: "Aprende a ganar licitaciones · cursos cortos y certificados" },
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
    if (name === "secop") initSecopOnce();
    if (name === "analisis") renderQuotaBanner();
    if (name === "paa") initPaaOnce();
    if (name === "formacion") showCursosCatalog();
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

  function renderQuotaBanner() {
    const banner = $("#quotaBanner");
    if (!banner) return;
    const left = Auth.freeUsesLeft();
    if (left === Infinity) {
      banner.classList.add("hidden");
      banner.innerHTML = "";
      return;
    }
    if (left > 0) {
      banner.classList.remove("hidden");
      banner.innerHTML =
        '<div class="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">' +
        '<div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center"><svg class="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg></div>' +
        '<div><p class="text-sm font-semibold text-amber-900">Te quedan ' + left + ' análisis IA gratis</p>' +
        '<p class="text-xs text-amber-700/80">Cuando se acaben, activa IA Premium para seguir analizando.</p></div></div>' +
        '<button id="quotaUpgrade" class="text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 px-4 py-2 rounded-lg shadow-sm transition-all">⚡ Activar Premium</button>' +
        "</div>";
    } else {
      banner.classList.remove("hidden");
      banner.innerHTML =
        '<div class="bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">' +
        '<div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center"><svg class="w-5 h-5 text-rose-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>' +
        '<div><p class="text-sm font-semibold text-rose-900">Has usado tus 3 análisis gratis</p>' +
        '<p class="text-xs text-rose-700/80">Activa IA Premium para continuar analizando pliegos.</p></div></div>' +
        '<button id="quotaUpgrade" class="text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 px-4 py-2 rounded-lg shadow-sm transition-all">⚡ Activar Premium</button>' +
        "</div>";
    }
    const btn = $("#quotaUpgrade");
    if (btn) btn.addEventListener("click", openPremiumModal);
  }

  function doAnalyze() {
    const input = collectInput();
    if (!input.textoRequisito) {
      toast("Pega el texto del requisito que deseas analizar", "err");
      $("#f-texto").focus();
      return;
    }
    if (!Auth.consumeFreeUse()) {
      openPremiumModal();
      toast("Has usado tus 3 análisis gratis. Activa Premium.", "err");
      return;
    }
    runLoadingAnimation(() => {
      const result = A.analyze(input);
      renderResults(result);
      pushHistory(result);
      renderQuotaBanner();
      const left = Auth.freeUsesLeft();
      const tail = left === Infinity ? "" : " · te quedan " + left + " gratis";
      toast("Análisis completado · riesgo " + result.riskLevel + tail, "ok");
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
        const planActivo = u.role === "admin" ||
          (u.plan === "premium" && (!u.planExpira || new Date(u.planExpira) >= new Date()));
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
          (u.role === "admin"
            ? '<span class="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Premium ∞</span>'
            : '<div class="flex items-center gap-2 justify-center"><span class="text-[10px] font-bold uppercase tracking-wider ' +
              (planActivo ? "text-amber-700 bg-amber-100" : "text-slate-500 bg-slate-100") +
              ' px-2 py-0.5 rounded-full">' + (planActivo ? "Premium" : "Free") + "</span>" +
              '<label class="switch"><input type="checkbox" ' + (planActivo ? "checked" : "") +
              ' data-plan="' + u.id + '"><span class="slider"></span></label></div>') +
          "</td>" +
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

    $$("#clientsBody input[data-plan]").forEach((cb) =>
      cb.addEventListener("change", async () => {
        try {
          await Auth.updateUser(cb.dataset.plan, {
            plan: cb.checked ? "premium" : "free",
            planExpira: null,
          });
          toast(cb.checked ? "Premium activado" : "Premium desactivado", "ok");
          renderClients(); renderStats();
        } catch (e) { toast(e.message, "err"); cb.checked = !cb.checked; }
      })
    );

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

  /* ------------------------- premium modal ---------------------------- */
  function openPremiumModal() {
    $("#premiumModal").classList.remove("hidden");
    $("#premiumModal").classList.add("flex");
  }
  function closePremiumModal() {
    $("#premiumModal").classList.add("hidden");
    $("#premiumModal").classList.remove("flex");
  }
  function requestPlan(planLabel) {
    const u = Auth.currentUser() || {};
    const subject = encodeURIComponent("Activar IA Premium · " + planLabel);
    const body = encodeURIComponent(
      "Hola Asociados GYM LC,\n\n" +
      "Quiero activar IA Premium en LICITA.\n\n" +
      "Usuario: " + (u.username || "") + "\n" +
      "Nombre: " + (u.name || "") + "\n" +
      "Plan: " + planLabel + "\n\n" +
      "Quedo atento al medio de pago.\n"
    );
    window.location.href =
      "mailto:asociadosgym.lc@gmail.com?subject=" + subject + "&body=" + body;
    toast("Abriendo correo a Asociados GYM LC…", "ok");
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

  /* --------------------- buscar SECOP 2 (en vivo) --------------------- */
  const SECOP = LICITA.secop;
  const secopState = {
    initialized: false,
    dataset: "procesos",
    page: 0,
    pageSize: 25,
    total: null,
    filters: {},
  };

  /* Score heurístico de oportunidad sobre un proceso normalizado.
   * No requiere conocer al proponente; estima qué tan atractivo es
   * el proceso en términos de cuantía, modalidad, estado y tipo. */
  function opportunityScore(n) {
    let s = 50;
    const r = [];
    const v = Number(n.valor) || 0;
    if (v >= 50_000_000 && v <= 500_000_000) { s += 18; r.push("Cuantía en rango competitivo (50M–500M)"); }
    else if (v > 500_000_000 && v <= 2_000_000_000) { s += 6; r.push("Cuantía considerable (mayor concurrencia)"); }
    else if (v > 0 && v < 10_000_000) { s -= 18; r.push("Cuantía muy baja (margen reducido)"); }
    else if (v > 2_000_000_000) { s -= 6; r.push("Cuantía muy alta (requisitos exigentes)"); }
    else if (v === 0) { r.push("Cuantía no informada"); }

    const mod = (n.modalidad || "").toLowerCase();
    if (mod.includes("mínima cuantía") || mod.includes("minima cuantia")) { s += 12; r.push("Modalidad accesible: mínima cuantía"); }
    else if (mod.includes("licitación") || mod.includes("licitacion")) { s -= 4; r.push("Licitación pública (requisitos altos)"); }
    else if (mod.includes("contratación directa") || mod.includes("contratacion directa")) { s -= 28; r.push("Contratación directa (entrada restringida)"); }
    else if (mod.includes("selección abreviada") || mod.includes("seleccion abreviada")) { s += 6; r.push("Selección abreviada"); }
    else if (mod.includes("concurso")) { s += 2; r.push("Concurso de méritos"); }

    if (n.estado === "Presentación de oferta") { s += 16; r.push("Estado: abierto a ofertas"); }
    else if (n.estado === "Adjudicado") { s = 5; r.push("Ya adjudicado — fuera de competencia"); }
    else if (n.estado === "Borrador") { s -= 12; r.push("Aún en borrador"); }
    else if (n.estado === "Descartado" || n.estado === "Terminado Anormalmente") { s = 0; r.push("Proceso cerrado anormalmente"); }
    else if (n.estado === "Celebrado" || n.estado === "Liquidado") { r.push("Histórico (referencia)"); }

    const tipo = (n.tipoContrato || "").toLowerCase();
    if (tipo.includes("prestación") || tipo.includes("prestacion")) { s += 4; r.push("Prestación de servicios"); }
    if (tipo.includes("obra")) { s -= 2; r.push("Obra (suele exigir más experiencia)"); }

    s = Math.max(0, Math.min(100, s));
    let label, color;
    if (s >= 70) { label = "Alta"; color = "emerald"; }
    else if (s >= 50) { label = "Media"; color = "amber"; }
    else if (s >= 30) { label = "Baja"; color = "orange"; }
    else { label = "Muy baja"; color = "rose"; }
    return { score: s, label, color, reasons: r };
  }

  function estadoChip(estado) {
    const map = {
      "Presentación de oferta": "sky",
      Adjudicado: "emerald",
      Celebrado: "indigo",
      Liquidado: "slate",
      Seleccionado: "violet",
      Borrador: "amber",
      Descartado: "rose",
      "Terminado Anormalmente": "rose",
    };
    const tone = map[estado] || "slate";
    return (
      '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-' +
      tone + "-100 text-" + tone + '-700">' + escapeHtml(estado || "—") + "</span>"
    );
  }

  function secopCard(p) {
    const n = SECOP.normalize(secopState.dataset, p);
    const fecha = n.fecha ? n.fecha.slice(0, 10) : "—";
    const isHist = secopState.dataset === "contratos";
    const labelFecha = isHist ? "Firmado" : "Publicado";
    const cardId = "sc_" + Math.random().toString(36).slice(2, 10);
    const sc = opportunityScore(n);
    const isPro = Auth.isPremium();
    const payload = escapeHtml(JSON.stringify(n));

    const headerBlock =
      '<div class="flex items-start justify-between gap-4 flex-wrap">' +
      '<div class="min-w-0 flex-1">' +
      '<div class="flex items-center gap-2 flex-wrap mb-1">' +
      '<p class="text-sm font-bold text-slate-900">' + escapeHtml(n.id || "Sin ID") + "</p>" +
      (n.estado ? estadoChip(n.estado) : "") +
      (n.modalidad ? '<span class="text-[10px] font-medium uppercase tracking-wide bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">' + escapeHtml(n.modalidad) + "</span>" : "") +
      (isHist ? '<span class="text-[10px] font-medium uppercase tracking-wide bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Histórico</span>' : "") +
      '<span class="ml-auto text-[10px] font-bold tracking-wider uppercase text-' + sc.color + '-700 bg-' + sc.color + '-50 border border-' + sc.color + '-100 px-2 py-0.5 rounded-full">Oportunidad ' + sc.label + " · " + sc.score + "</span>" +
      "</div>" +
      '<p class="text-sm text-slate-800 font-medium leading-snug">' + escapeHtml(n.entidad || "Entidad no informada") + "</p>" +
      '<p class="text-xs text-slate-600 mt-1 leading-relaxed">' +
      escapeHtml((n.objeto || "").slice(0, 220)) + (n.objeto && n.objeto.length > 220 ? "…" : "") + "</p>" +
      (isHist && n.proveedor
        ? '<div class="mt-2 bg-emerald-50 border border-emerald-100 rounded p-2">' +
          '<p class="text-[10px] uppercase font-bold tracking-wider text-emerald-700">Adjudicatario</p>' +
          '<p class="text-sm font-semibold text-emerald-900 leading-tight mt-0.5">' + escapeHtml(n.proveedor) + "</p>" +
          (n.nitProveedor ? '<p class="text-[11px] text-emerald-700/80">NIT/Doc: ' + escapeHtml(n.nitProveedor) + "</p>" : "") +
          "</div>"
        : "") +
      '<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">' +
      '<span><span class="font-semibold text-slate-700">' + (isHist ? "Valor contrato" : "Cuantía") + ":</span> " + formatCOP(n.valor) + "</span>" +
      (isHist && n.valorAdjudicado ? '<span><span class="font-semibold text-slate-700">Con adiciones:</span> ' + formatCOP(n.valorAdjudicado) + "</span>" : "") +
      (n.tipoContrato ? '<span><span class="font-semibold text-slate-700">Tipo:</span> ' + escapeHtml(n.tipoContrato) + "</span>" : "") +
      (n.departamento ? '<span><span class="font-semibold text-slate-700">Ubicación:</span> ' + escapeHtml(n.departamento) + (n.ciudad ? " · " + escapeHtml(n.ciudad) : "") + "</span>" : "") +
      '<span><span class="font-semibold text-slate-700">' + labelFecha + ":</span> " + fecha + "</span>" +
      (n.duracion ? '<span><span class="font-semibold text-slate-700">Duración:</span> ' + escapeHtml(n.duracion + " " + (n.unidadDuracion || "")) + "</span>" : "") +
      "</div></div></div>";

    const footer =
      '<div class="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">' +
      '<button class="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1" data-sec-ia="' + cardId + '">' +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.989-2.386l-.548-.547z"/></svg>' +
      "Resumen IA</button>" +
      '<button class="text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1" data-sec-follow=\'' + payload + "'>" +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
      (isHist ? "Marcar como referencia" : "Seguir") + "</button>" +
      (isHist && n.proveedor
        ? '<button class="text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1" data-sec-provider="' + escapeHtml(n.proveedor) + '">' +
          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
          "Ver más de este proveedor</button>"
        : "") +
      (n.url
        ? '<a href="' + escapeHtml(n.url) + '" target="_blank" rel="noopener" class="text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">' +
          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>' +
          "Abrir en SECOP</a>"
        : "") +
      "</div>";

    const reasonsHtml = sc.reasons
      .map((x) => '<li class="text-[11px] text-slate-600 leading-relaxed">' + escapeHtml(x) + "</li>")
      .join("");

    const proActions =
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">' +
      (isHist ? "" :
        '<button class="text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1" data-sec-load=\'' + payload + "'>" +
        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' +
        "Análisis profundo de pliego</button>"
      ) +
      '<button class="text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1" data-sec-history=\'' + payload + "'>" +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2"/></svg>' +
      "Competencia histórica</button>" +
      "</div>";

    const lockedActions =
      '<div class="mt-3 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3 text-center">' +
      '<p class="text-xs font-semibold text-amber-900">🔒 Análisis profundo · Competencia histórica · Score detallado</p>' +
      '<p class="text-[11px] text-amber-700/80 mt-1">Activa IA Premium para desbloquearlo en este y todos tus procesos.</p>' +
      '<button data-premium class="mt-2 w-full text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 px-3 py-2 rounded-lg transition-all shadow-sm">⚡ Activar IA Premium</button>' +
      "</div>";

    const iaPanel =
      '<div id="iap_' + cardId + '" class="hidden mt-3 bg-amber-50/50 border border-amber-200 rounded-lg p-4">' +
      '<div class="flex items-center justify-between gap-3 flex-wrap">' +
      '<p class="text-xs font-bold uppercase tracking-wider text-amber-800">🤖 Resumen IA</p>' +
      '<span class="text-[10px] font-semibold uppercase tracking-wider ' +
      (isPro ? "text-emerald-700 bg-emerald-100" : "text-slate-500 bg-slate-100") +
      ' px-2 py-0.5 rounded-full">' + (isPro ? "Plan Premium" : "Vista previa gratis") + "</span></div>" +
      '<div class="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">' +
      '<div class="bg-white rounded-md border border-amber-100 p-2"><p class="text-slate-400 text-[10px] uppercase font-bold">Modalidad</p><p class="text-slate-800 font-medium leading-tight">' + escapeHtml(n.modalidad || "N/D") + "</p></div>" +
      '<div class="bg-white rounded-md border border-amber-100 p-2"><p class="text-slate-400 text-[10px] uppercase font-bold">Presupuesto</p><p class="text-slate-800 font-medium leading-tight">' + formatCOP(n.valor) + "</p></div>" +
      '<div class="bg-white rounded-md border border-amber-100 p-2"><p class="text-slate-400 text-[10px] uppercase font-bold">Ubicación</p><p class="text-slate-800 font-medium leading-tight">' + escapeHtml(n.departamento || "N/D") + (n.ciudad ? " · " + escapeHtml(n.ciudad) : "") + "</p></div>" +
      '<div class="bg-white rounded-md border border-amber-100 p-2"><p class="text-slate-400 text-[10px] uppercase font-bold">Duración</p><p class="text-slate-800 font-medium leading-tight">' + escapeHtml((n.duracion || "—") + " " + (n.unidadDuracion || "")) + "</p></div>" +
      '<div class="bg-white rounded-md border border-amber-100 p-2"><p class="text-slate-400 text-[10px] uppercase font-bold">Tipo</p><p class="text-slate-800 font-medium leading-tight">' + escapeHtml(n.tipoContrato || "N/D") + "</p></div>" +
      '<div class="bg-white rounded-md border border-amber-100 p-2"><p class="text-slate-400 text-[10px] uppercase font-bold">Estado</p><p class="text-slate-800 font-medium leading-tight">' + escapeHtml(n.estado || "N/D") + "</p></div>" +
      "</div>" +
      '<div class="mt-3">' +
      '<div class="flex items-center justify-between text-[11px] mb-1">' +
      '<span class="font-semibold text-slate-700">Score de oportunidad</span>' +
      '<span class="font-bold text-' + sc.color + '-700">' + sc.score + "/100 · " + sc.label + "</span></div>" +
      '<div class="bar-track"><div class="bar-fill bg-' + sc.color + '-500" style="width:' + sc.score + '%"></div></div>' +
      '<ul class="mt-2 list-disc pl-5 space-y-0.5">' + reasonsHtml + "</ul>" +
      "</div>" +
      (isPro ? proActions : lockedActions) +
      "</div>";

    return (
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">' +
      headerBlock +
      footer +
      iaPanel +
      "</div>"
    );
  }

  function bindSecopCardActions() {
    $$("#sec-results [data-sec-ia]").forEach((b) =>
      b.addEventListener("click", () => {
        const panel = document.getElementById("iap_" + b.dataset.secIa);
        if (!panel) return;
        const open = panel.classList.toggle("hidden") === false;
        b.textContent = "";
        b.innerHTML =
          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.989-2.386l-.548-.547z"/></svg>' +
          (open ? "Cerrar resumen" : "Resumen IA");
      })
    );
    $$("#sec-results [data-sec-load]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = JSON.parse(b.dataset.secLoad);
        const mod = (n.modalidad || "").toLowerCase();
        const map = {
          "mínima cuantía": "minima_cuantia",
          "selección abreviada": "seleccion_abreviada",
          "licitación pública": "licitacion",
          "concurso de méritos abierto": "concurso_meritos",
          "contratación directa": "contratacion_directa",
        };
        $("#f-proceso").value = n.id || "";
        $("#f-entidad").value = n.entidad || "";
        $("#f-objeto").value = n.objeto || "";
        $("#f-modalidad").value = map[mod] || "minima_cuantia";
        showSection("analisis");
        toast("Proceso " + n.id + " cargado en el análisis", "ok");
      })
    );
    $$("#sec-results [data-sec-history]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = JSON.parse(b.dataset.secHistory);
        // Salta al dataset contratos buscando el objeto + entidad
        switchDataset("contratos");
        // Tomar primeras 3 palabras significativas del objeto para buscar
        const keywords = (n.objeto || "")
          .split(/\s+/).filter((w) => w.length > 4)
          .slice(0, 3).join(" ");
        $("#sec-q").value = keywords;
        $("#sec-entidad").value = "";
        runSecopSearch(true);
      })
    );
    $$("#sec-results [data-sec-follow]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = JSON.parse(b.dataset.secFollow);
        if (state.processes.some((p) => p.id === n.id)) {
          toast("Ya está en seguimiento", "err");
          return;
        }
        state.processes.unshift({
          id: n.id || "Sin ID",
          objeto: n.objeto || "Sin descripción",
          entidad: n.entidad || "Entidad no especificada",
          cuantia: n.valor || 0,
          riesgo: "Medio",
          modalidad: "minima_cuantia",
          fecha: (n.fecha || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
        });
        save(LS_PROC, state.processes);
        renderDashboard();
        toast(secopState.dataset === "contratos" ? "Referencia guardada" : "Proceso agregado a seguimiento", "ok");
      })
    );
    $$("#sec-results [data-sec-provider]").forEach((b) =>
      b.addEventListener("click", () => {
        $("#sec-filters").classList.remove("hidden");
        $("#sec-q").value = "";
        $("#sec-proveedor").value = b.dataset.secProvider;
        runSecopSearch(true);
      })
    );
    $$("#sec-results [data-premium]").forEach((b) =>
      b.addEventListener("click", openPremiumModal)
    );
  }

  function collectSecopFilters() {
    return {
      texto: $("#sec-q").value.trim(),
      entidad: $("#sec-entidad").value.trim(),
      departamento: $("#sec-departamento").value,
      ciudad: $("#sec-ciudad").value.trim(),
      modalidad: $("#sec-modalidad").value,
      tipoContrato: $("#sec-tipo").value,
      estado: $("#sec-estado").value,
      proveedor: $("#sec-proveedor") ? $("#sec-proveedor").value.trim() : "",
      precioMin: $("#sec-pmin").value.trim(),
      precioMax: $("#sec-pmax").value.trim(),
      fechaDesde: $("#sec-fdesde").value,
      fechaHasta: $("#sec-fhasta").value,
      orden: $("#sec-orden").value,
    };
  }

  async function runSecopSearch(reset) {
    if (reset) secopState.page = 0;
    secopState.filters = collectSecopFilters();
    const f = Object.assign({}, secopState.filters, {
      limite: secopState.pageSize,
      offset: secopState.page * secopState.pageSize,
    });
    $("#sec-error").classList.add("hidden");
    $("#sec-empty").classList.add("hidden");
    $("#sec-results").classList.add("hidden");
    $("#sec-pagination").classList.add("hidden");
    $("#sec-status").classList.add("hidden");
    $("#sec-loading").classList.remove("hidden");
    try {
      const ds = secopState.dataset;
      const [data, totalMaybe] = await Promise.all([
        SECOP.search(ds, f),
        reset ? SECOP.count(ds, f).catch(() => null) : Promise.resolve(secopState.total),
      ]);
      if (reset) secopState.total = totalMaybe;
      $("#sec-loading").classList.add("hidden");
      if (!data.length && secopState.page === 0) {
        $("#sec-empty").classList.remove("hidden");
        const otroDs = secopState.dataset === "procesos" ? "contratos" : "procesos";
        const otroLabel = secopState.dataset === "procesos" ? "los contratos históricos (SECOP 1)" : "los procesos vigentes (SECOP 2)";
        $("#sec-empty").innerHTML =
          '<div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">' +
          '<svg class="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>' +
          '<h3 class="text-base font-semibold text-slate-900">Sin resultados</h3>' +
          '<p class="text-sm text-slate-400 mt-1 max-w-md">No encontramos coincidencias con esos filtros. Pruebá a quitar alguno, escribir solo la palabra clave principal o cambiar a ' + otroLabel + '.</p>' +
          '<div class="mt-4 flex gap-2 flex-wrap justify-center">' +
          '<button id="sec-emp-clear" class="text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition-colors">Limpiar filtros</button>' +
          '<button id="sec-emp-switch" class="text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">Probar en ' + otroLabel + '</button>' +
          "</div>";
        const cb = $("#sec-emp-clear"); if (cb) cb.addEventListener("click", () => { $("#sec-clear").click(); runSecopSearch(true); });
        const sb = $("#sec-emp-switch"); if (sb) sb.addEventListener("click", () => switchDataset(otroDs));
        return;
      }
      $("#sec-results").innerHTML = data.map(secopCard).join("");
      $("#sec-results").classList.remove("hidden");
      bindSecopCardActions();
      // Estado/paginación
      const start = secopState.page * secopState.pageSize + 1;
      const end = start + data.length - 1;
      $("#sec-pageinfo").textContent =
        "Mostrando " + start.toLocaleString("es-CO") + "–" + end.toLocaleString("es-CO") +
        (secopState.total != null ? " de " + secopState.total.toLocaleString("es-CO") + " procesos" : "");
      $("#sec-prev").disabled = secopState.page === 0;
      $("#sec-next").disabled =
        data.length < secopState.pageSize ||
        (secopState.total != null && end >= secopState.total);
      $("#sec-pagination").classList.remove("hidden");
    } catch (err) {
      $("#sec-loading").classList.add("hidden");
      $("#sec-error").classList.remove("hidden");
      $("#sec-error").textContent =
        "Error consultando SECOP 2: " + (err && err.message ? err.message : err);
    }
  }

  function fillSelect(id, items, placeholder) {
    const sel = $("#" + id);
    if (!sel) return;
    sel.innerHTML = '<option value="">' + (placeholder || "Todos") + "</option>" +
      items.map((it) => '<option value="' + escapeHtml(it) + '">' + escapeHtml(it) + "</option>").join("");
  }
  function fillOrden(options) {
    $("#sec-orden").innerHTML = options
      .map((o) => '<option value="' + escapeHtml(o.v) + '">' + escapeHtml(o.t) + "</option>")
      .join("");
  }

  function applyDatasetUI() {
    const ds = SECOP.DATASETS[secopState.dataset];
    $$(".sec-tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.ds === secopState.dataset)
    );
    $$("[data-only-procesos]").forEach((el) =>
      el.classList.toggle("hidden", secopState.dataset !== "procesos")
    );
    $$("[data-only-contratos]").forEach((el) =>
      el.classList.toggle("hidden", secopState.dataset !== "contratos")
    );
    fillOrden(ds.ordenOptions);
    fillSelect("sec-modalidad", ds.modalidades || []);
    fillSelect("sec-estado", ds.estados || []);
    // Chips por dataset
    const procesosChips = [
      { label: "Abiertos hoy", set: { estado: "Presentación de oferta" } },
      { label: "Mínima cuantía", set: { modalidad: "Mínima cuantía" } },
      { label: "Licitación Pública", set: { modalidad: "Licitación Pública" } },
      { label: "Mayor precio", set: { orden: "precio_base DESC" } },
    ];
    const contratosChips = [
      { label: "Más recientes", set: { orden: "fecha_de_firma_del_contrato DESC" } },
      { label: "Mayor valor", set: { orden: "cuantia_contrato DESC" } },
      { label: "Obras", set: { tipoContrato: "Obra" } },
      { label: "Prestación de servicios", set: { tipoContrato: "Prestación de servicios" } },
    ];
    const chips = secopState.dataset === "procesos" ? procesosChips : contratosChips;
    $("#sec-quickchips").innerHTML = chips
      .map((c, i) =>
        '<button data-chip="' + i + '" class="text-[11px] font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-full transition-colors">' +
        escapeHtml(c.label) + "</button>"
      )
      .join("");
    $$("#sec-quickchips [data-chip]").forEach((b) =>
      b.addEventListener("click", () => {
        const c = chips[Number(b.dataset.chip)];
        if (c.set.estado) $("#sec-estado").value = c.set.estado;
        if (c.set.modalidad) $("#sec-modalidad").value = c.set.modalidad;
        if (c.set.orden) $("#sec-orden").value = c.set.orden;
        if (c.set.tipoContrato) $("#sec-tipo").value = c.set.tipoContrato;
        $("#sec-filters").classList.remove("hidden");
        runSecopSearch(true);
      })
    );
    // Placeholder dinámico
    $("#sec-q").placeholder = secopState.dataset === "procesos"
      ? "Busca por objeto, entidad, departamento, ciudad o número de proceso…"
      : "Busca por objeto, entidad, contratista, departamento o número…";
  }

  function switchDataset(ds) {
    if (!SECOP.DATASETS[ds] || ds === secopState.dataset) return;
    secopState.dataset = ds;
    secopState.page = 0;
    secopState.total = null;
    applyDatasetUI();
    // Limpiar resultados
    $("#sec-results").classList.add("hidden");
    $("#sec-pagination").classList.add("hidden");
    $("#sec-error").classList.add("hidden");
    $("#sec-empty").classList.remove("hidden");
  }

  function initSecopOnce() {
    if (secopState.initialized) return;
    secopState.initialized = true;

    fillSelect("sec-departamento", SECOP.DEPARTAMENTOS);
    fillSelect("sec-tipo", SECOP.TIPOS_CONTRATO);
    applyDatasetUI();

    $$(".sec-tab").forEach((b) =>
      b.addEventListener("click", () => switchDataset(b.dataset.ds))
    );

    $("#sec-toggle-filters").addEventListener("click", () =>
      $("#sec-filters").classList.toggle("hidden")
    );
    $("#sec-search").addEventListener("click", () => runSecopSearch(true));
    $("#sec-q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") runSecopSearch(true);
    });
    $("#sec-clear").addEventListener("click", () => {
      ["sec-q","sec-entidad","sec-ciudad","sec-pmin","sec-pmax","sec-fdesde","sec-fhasta","sec-proveedor"]
        .forEach((id) => { if ($("#" + id)) $("#" + id).value = ""; });
      ["sec-departamento","sec-modalidad","sec-tipo","sec-estado"]
        .forEach((id) => ($("#" + id).value = ""));
      const ds = SECOP.DATASETS[secopState.dataset];
      $("#sec-orden").value = ds.ordenDefault;
    });
    $("#sec-prev").addEventListener("click", () => {
      if (secopState.page > 0) { secopState.page--; runSecopSearch(false); }
    });
    $("#sec-next").addEventListener("click", () => {
      secopState.page++; runSecopSearch(false);
    });
  }

  /* ----------------------------- sesión ------------------------------- */
  function applyRoleVisibility() {
    const isAdmin = Auth.isAdmin();
    $$("[data-admin-only]").forEach((el) => el.classList.toggle("hidden", !isAdmin));
  }

  function renderSessionCard() {
    const u = Auth.currentUser();
    if (!u) return;
    const premium = Auth.isPremium();
    const planChip = u.role === "admin"
      ? '<span class="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Premium ∞</span>'
      : (premium
          ? '<span class="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Premium</span>'
          : '<button id="sessionUpgradeBtn" class="text-[9px] font-bold uppercase tracking-wider text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 px-1.5 py-0.5 rounded">Activar</button>');
    $("#sessionCard").innerHTML =
      '<div class="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">' +
      initials(u.name) + "</div>" +
      '<div class="min-w-0 flex-1"><p class="text-sm font-semibold text-slate-800 truncate">' +
      escapeHtml(u.name) + "</p>" +
      '<p class="text-[11px] text-slate-500 flex items-center gap-1 flex-wrap">@' + escapeHtml(u.username) +
      ' · <span class="role-chip ' + u.role + '">' +
      (u.role === "admin" ? "Admin" : "Cliente") + "</span> " + planChip + "</p></div>";
    const upBtn = $("#sessionUpgradeBtn");
    if (upBtn) upBtn.addEventListener("click", openPremiumModal);
    $("#headerUserName").textContent = u.name;
    $("#headerUserRole").textContent = u.role === "admin"
      ? "Administrador · " + (u.organization || "")
      : (premium ? "Premium · " : "Plan Free · ") + (u.organization || "Cliente");
    $("#headerAvatar").textContent = initials(u.name);
  }

  function showLanding() {
    document.body.classList.remove("locked");
    $("#loginScreen").classList.add("hidden");
    $("#loginScreen").classList.remove("flex");
    $("#appRoot").classList.add("hidden");
    $("#landingPage").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    initLandingFX();
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

  function showLogin(view) {
    document.body.classList.add("locked");
    $("#landingPage").classList.add("hidden");
    $("#appRoot").classList.add("hidden");
    $("#loginScreen").classList.remove("hidden");
    $("#loginScreen").classList.add("flex");
    const showReg = view === "register";
    $("#authLoginView").classList.toggle("hidden", showReg);
    $("#authRegisterView").classList.toggle("hidden", !showReg);
    $("#loginError").classList.add("hidden");
    $("#regError").classList.add("hidden");
    if (showReg) {
      setTimeout(() => $("#regEmail").focus(), 100);
    } else {
      $("#loginUser").value = "";
      $("#loginPass").value = "";
      setTimeout(() => $("#loginUser").focus(), 100);
    }
  }

  function showRegister() { showLogin("register"); }

  /* ------------------ efectos visuales de la landing ------------------ */
  function animateCounter(el) {
    const target = parseInt(el.dataset.count, 10) || 0;
    const dur = 1100;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  let landingFXReady = false;
  function initLandingFX() {
    if (landingFXReady) return;
    landingFXReady = true;

    // Reveal al hacer scroll
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              e.target.querySelectorAll("[data-count]").forEach(animateCounter);
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
      );
      document.querySelectorAll(".reveal, .reveal-scale").forEach((el) => io.observe(el));
    } else {
      document.querySelectorAll(".reveal, .reveal-scale").forEach((el) => el.classList.add("in"));
      document.querySelectorAll("[data-count]").forEach(animateCounter);
    }

    // Sombra del nav al scrollear
    const nav = $("#landingNav");
    if (nav) {
      const onScroll = () => nav.classList.toggle("nav-scrolled", window.scrollY > 10);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    // Inclinación que sigue el cursor sobre el mockup del hero
    const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wrap = $(".tilt-wrap");
    const tilt = wrap ? wrap.querySelector(".tilt") : null;
    if (wrap && tilt && !prefersReduced && window.matchMedia("(pointer:fine)").matches) {
      wrap.addEventListener("mousemove", (e) => {
        const r = wrap.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.transform =
          "rotateY(" + (-8 - px * 12) + "deg) rotateX(" + (4 + py * 10) + "deg) translateY(-6px)";
      });
      wrap.addEventListener("mouseleave", () => {
        tilt.style.transform = "";
      });
    }
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

  async function handleRegister(e) {
    e.preventDefault();
    const name = $("#regName").value.trim();
    const email = $("#regEmail").value.trim();
    const password = $("#regPass").value;
    $("#registerBtn").disabled = true;
    $("#registerBtnLabel").textContent = "Creando cuenta…";
    try {
      const u = await Auth.publicRegister({ name, email, password });
      $("#registerBtn").disabled = false;
      $("#registerBtnLabel").textContent = "Crear cuenta y empezar";
      showApp();
      toast("¡Cuenta creada! Tienes 3 análisis gratis · @" + u.username, "ok");
    } catch (err) {
      $("#registerBtn").disabled = false;
      $("#registerBtnLabel").textContent = "Crear cuenta y empezar";
      $("#regError").textContent = err.message || "No se pudo crear la cuenta.";
      $("#regError").classList.remove("hidden");
    }
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
    document.querySelectorAll("[data-go-register]").forEach((b) =>
      b.addEventListener("click", (e) => { e.preventDefault(); showRegister(); })
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
    // login / registro
    $("#loginForm").addEventListener("submit", handleLogin);
    $("#registerForm").addEventListener("submit", handleRegister);
    $("#togglePass").addEventListener("click", () => {
      const i = $("#loginPass");
      i.type = i.type === "password" ? "text" : "password";
    });
    $("#toggleRegPass").addEventListener("click", () => {
      const i = $("#regPass");
      i.type = i.type === "password" ? "text" : "password";
    });
    $("#goRegisterBtn").addEventListener("click", () => showLogin("register"));
    $("#goLoginBtn").addEventListener("click", () => showLogin("login"));
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

    // premium
    $("#prem-close").addEventListener("click", closePremiumModal);
    $("#premiumModal").addEventListener("click", (e) => {
      if (e.target.id === "premiumModal") closePremiumModal();
    });
    $$("#premiumModal [data-plan-req]").forEach((b) =>
      b.addEventListener("click", () => { requestPlan(b.dataset.planReq); closePremiumModal(); })
    );

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal(); closeClientModal(); closeCredentialsModal();
      }
    });

    // formación
    const cb = $("#curso-back");
    if (cb) cb.addEventListener("click", showCursosCatalog);
  }

  /* =====================================================================
     PLAN ANUAL DE ADQUISICIONES (PAA) · datos.gov.co crbs-icmf
     Cruza con SECOP 2 (procesos vigentes) y con el analizador de pliegos.
     ===================================================================== */
  const paaState = {
    initialized: false,
    page: 0,
    pageSize: 25,
    total: null,
    filters: {},
  };

  function paaCollectFilters() {
    return {
      texto: $("#paa-q").value.trim(),
      entidad: $("#paa-entidad").value.trim(),
      departamento: $("#paa-departamento").value,
      modalidad: $("#paa-modalidad").value,
      precioMin: $("#paa-pmin").value.trim(),
      orden: "fecha_estimada_de_inicio ASC",
    };
  }

  function paaForensicSummary(items) {
    if (!items.length) return null;
    const total = items.reduce((s, p) => {
      const n = SECOP.normalize("paa", p);
      return s + (Number(n.valor) || 0);
    }, 0);
    const byEntity = {};
    items.forEach((p) => {
      const n = SECOP.normalize("paa", p);
      const e = n.entidad || "—";
      byEntity[e] = (byEntity[e] || 0) + 1;
    });
    const topEntity = Object.entries(byEntity).sort((a, b) => b[1] - a[1])[0];
    const months = {};
    items.forEach((p) => {
      const n = SECOP.normalize("paa", p);
      const m = (n.fecha || "").slice(0, 7);
      if (m) months[m] = (months[m] || 0) + 1;
    });
    const peakMonth = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
    return {
      total,
      avg: total / items.length,
      entityCount: Object.keys(byEntity).length,
      topEntity: topEntity ? topEntity[0] : "—",
      topEntityCount: topEntity ? topEntity[1] : 0,
      peakMonth: peakMonth ? peakMonth[0] : "—",
      peakMonthCount: peakMonth ? peakMonth[1] : 0,
    };
  }

  function paaRenderForensic(sum) {
    if (!sum) { $("#paa-forensic").classList.add("hidden"); return; }
    $("#paa-forensic").classList.remove("hidden");
    const cards = [
      { label: "Valor total estimado", value: formatCOP(sum.total), tone: "amber" },
      { label: "Promedio por proceso", value: formatCOP(Math.round(sum.avg)), tone: "indigo" },
      { label: "Entidades involucradas", value: sum.entityCount, tone: "sky" },
      { label: "Entidad con más planes", value: sum.topEntity + " (" + sum.topEntityCount + ")", tone: "emerald" },
    ];
    $("#paa-forensic").innerHTML = cards
      .map((c) =>
        '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 card-hover">' +
        '<p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">' + c.label + "</p>" +
        '<p class="text-lg font-bold text-' + c.tone + '-700 mt-1 leading-tight">' + escapeHtml(String(c.value)) + "</p></div>"
      ).join("");
  }

  function paaCard(p) {
    const n = SECOP.normalize("paa", p);
    const fecha = n.fecha ? n.fecha.slice(0, 10) : "—";
    const payload = escapeHtml(JSON.stringify(n));
    return (
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">' +
      '<div class="flex items-start justify-between gap-4 flex-wrap">' +
      '<div class="min-w-0 flex-1">' +
      '<div class="flex items-center gap-2 flex-wrap mb-1">' +
      '<span class="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Planeado</span>' +
      (n.modalidad ? '<span class="text-[10px] font-medium uppercase tracking-wide bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">' + escapeHtml(n.modalidad) + "</span>" : "") +
      (n.tipoContrato ? '<span class="text-[10px] font-medium uppercase tracking-wide bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded">' + escapeHtml(n.tipoContrato) + "</span>" : "") +
      "</div>" +
      '<p class="text-sm font-bold text-slate-900 leading-snug mt-1">' + escapeHtml(n.entidad || "Entidad no informada") + "</p>" +
      '<p class="text-xs text-slate-600 mt-1 leading-relaxed">' +
      escapeHtml((n.objeto || "").slice(0, 240)) + (n.objeto && n.objeto.length > 240 ? "…" : "") + "</p>" +
      '<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">' +
      '<span><span class="font-semibold text-slate-700">Valor estimado:</span> ' + formatCOP(n.valor) + "</span>" +
      (n.departamento ? '<span><span class="font-semibold text-slate-700">Ubicación:</span> ' + escapeHtml(n.departamento) + "</span>" : "") +
      '<span><span class="font-semibold text-slate-700">Apertura prevista:</span> ' + fecha + "</span>" +
      (n.duracion ? '<span><span class="font-semibold text-slate-700">Duración:</span> ' + escapeHtml(n.duracion + " " + (n.unidadDuracion || "")) + "</span>" : "") +
      "</div></div></div>" +
      '<div class="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">' +
      '<button class="text-xs font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1" data-paa-secop=\'' + payload + "'>" +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
      "Buscar en SECOP cuando se abra</button>" +
      '<button class="text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1" data-paa-load=\'' + payload + "'>" +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' +
      "Preparar análisis</button>" +
      '<button class="text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1" data-paa-history=\'' + payload + "'>" +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2"/></svg>' +
      "Ver históricos similares</button>" +
      "</div></div>"
    );
  }

  function bindPaaCardActions() {
    $$("#paa-results [data-paa-secop]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = JSON.parse(b.dataset.paaSecop);
        showSection("secop");
        setTimeout(() => {
          initSecopOnce();
          if (secopState.dataset !== "procesos") switchDataset("procesos");
          $("#sec-q").value = (n.objeto || "").split(/\s+/).filter((w) => w.length > 4).slice(0, 3).join(" ");
          $("#sec-entidad").value = n.entidad || "";
          runSecopSearch(true);
        }, 60);
      })
    );
    $$("#paa-results [data-paa-load]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = JSON.parse(b.dataset.paaLoad);
        const map = {
          "mínima cuantía": "minima_cuantia",
          "selección abreviada": "seleccion_abreviada",
          "licitación pública": "licitacion",
          "concurso de méritos": "concurso_meritos",
          "contratación directa": "contratacion_directa",
        };
        $("#f-proceso").value = n.id || "";
        $("#f-entidad").value = n.entidad || "";
        $("#f-objeto").value = n.objeto || "";
        $("#f-modalidad").value = map[(n.modalidad || "").toLowerCase()] || "minima_cuantia";
        showSection("analisis");
        toast("Proceso planeado cargado en el analizador", "ok");
      })
    );
    $$("#paa-results [data-paa-history]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = JSON.parse(b.dataset.paaHistory);
        showSection("secop");
        setTimeout(() => {
          initSecopOnce();
          if (secopState.dataset !== "contratos") switchDataset("contratos");
          $("#sec-q").value = (n.objeto || "").split(/\s+/).filter((w) => w.length > 4).slice(0, 3).join(" ");
          runSecopSearch(true);
        }, 60);
      })
    );
  }

  async function runPaaSearch(reset) {
    if (reset) paaState.page = 0;
    paaState.filters = paaCollectFilters();
    const f = Object.assign({}, paaState.filters, {
      limite: paaState.pageSize,
      offset: paaState.page * paaState.pageSize,
    });
    $("#paa-error").classList.add("hidden");
    $("#paa-empty").classList.add("hidden");
    $("#paa-results").classList.add("hidden");
    $("#paa-pagination").classList.add("hidden");
    $("#paa-forensic").classList.add("hidden");
    $("#paa-loading").classList.remove("hidden");
    try {
      const [data, totalMaybe] = await Promise.all([
        SECOP.search("paa", f),
        reset ? SECOP.count("paa", f).catch(() => null) : Promise.resolve(paaState.total),
      ]);
      if (reset) paaState.total = totalMaybe;
      $("#paa-loading").classList.add("hidden");
      if (!data.length && paaState.page === 0) {
        $("#paa-empty").classList.remove("hidden");
        $("#paa-empty").innerHTML =
          '<div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">' +
          '<svg class="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>' +
          '<h3 class="text-base font-semibold text-slate-900">Sin resultados en el PAA</h3>' +
          '<p class="text-sm text-slate-400 mt-1 max-w-md">Las entidades no han publicado planes con esos filtros. Prueba con palabras más amplias o quita filtros.</p>';
        return;
      }
      paaRenderForensic(paaForensicSummary(data));
      $("#paa-results").innerHTML = data.map(paaCard).join("");
      $("#paa-results").classList.remove("hidden");
      bindPaaCardActions();
      const start = paaState.page * paaState.pageSize + 1;
      const end = start + data.length - 1;
      $("#paa-pageinfo").textContent =
        "Mostrando " + start + "–" + end +
        (paaState.total != null ? " de " + paaState.total.toLocaleString("es-CO") + " procesos planeados" : "");
      $("#paa-prev").disabled = paaState.page === 0;
      $("#paa-next").disabled = data.length < paaState.pageSize ||
        (paaState.total != null && end >= paaState.total);
      $("#paa-pagination").classList.remove("hidden");
    } catch (err) {
      $("#paa-loading").classList.add("hidden");
      $("#paa-error").classList.remove("hidden");
      $("#paa-error").textContent = "Error consultando el PAA: " + (err && err.message ? err.message : err);
    }
  }

  function initPaaOnce() {
    if (paaState.initialized) return;
    paaState.initialized = true;
    const ds = SECOP.DATASETS.paa;
    const fillSel = (id, items) => {
      const el = $("#" + id);
      el.innerHTML = '<option value="">Todos</option>' +
        items.map((it) => '<option value="' + escapeHtml(it) + '">' + escapeHtml(it) + "</option>").join("");
    };
    fillSel("paa-departamento", SECOP.DEPARTAMENTOS);
    fillSel("paa-modalidad", ds.modalidades);
    const chips = [
      { label: "Próximos a abrir", set: { orden: "fecha_estimada_de_inicio ASC" } },
      { label: "Mayor presupuesto", set: { orden: "valor_total_estimado DESC" } },
      { label: "Mínima cuantía", set: { modalidad: "Mínima cuantía" } },
      { label: "Licitación pública", set: { modalidad: "Licitación pública" } },
    ];
    $("#paa-chips").innerHTML = chips
      .map((c, i) =>
        '<button data-paa-chip="' + i + '" class="text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full transition-colors">' +
        escapeHtml(c.label) + "</button>"
      ).join("");
    $$("#paa-chips [data-paa-chip]").forEach((b) =>
      b.addEventListener("click", () => {
        const c = chips[Number(b.dataset.paaChip)];
        if (c.set.modalidad) $("#paa-modalidad").value = c.set.modalidad;
        runPaaSearch(true);
      })
    );
    $("#paa-search").addEventListener("click", () => runPaaSearch(true));
    $("#paa-q").addEventListener("keydown", (e) => { if (e.key === "Enter") runPaaSearch(true); });
    $("#paa-prev").addEventListener("click", () => {
      if (paaState.page > 0) { paaState.page--; runPaaSearch(false); }
    });
    $("#paa-next").addEventListener("click", () => {
      paaState.page++; runPaaSearch(false);
    });
  }

  /* =====================================================================
     FORMACIÓN · cursos integrados al ecosistema LICITA
     Cruza con: analizador (CTAs aplicados), SECOP (citas) y Marco.
     ===================================================================== */
  const CURSOS = (LICITA.cursos || { COURSES: [] }).COURSES;

  function progressKey(u) { return "licita.progress." + u.username; }
  function loadProgress() {
    const u = Auth.currentUser();
    if (!u) return {};
    return load(progressKey(u), {}) || {};
  }
  function saveProgress(p) {
    const u = Auth.currentUser();
    if (!u) return;
    save(progressKey(u), p);
  }
  function progressPct(courseId) {
    const p = loadProgress();
    const c = LICITA.cursos.byId(courseId);
    if (!c) return 0;
    const done = (p[courseId] && p[courseId].lessons) ? Object.keys(p[courseId].lessons).length : 0;
    return Math.round((done / c.lecciones.length) * 100);
  }

  function showCursosCatalog() {
    $("#cursoDetail").classList.add("hidden");
    $("#cursosCatalog").classList.remove("hidden");
    const grid = $("#cursosGrid");
    grid.innerHTML = CURSOS.map((c) => {
      const pct = progressPct(c.id);
      const done = pct === 100;
      return (
        '<div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lift cursor-pointer flex flex-col" data-curso="' + c.id + '">' +
        '<div class="flex items-start justify-between gap-3">' +
        '<div class="w-12 h-12 bg-gradient-to-br from-' + c.color + '-400 to-' + c.color + '-600 rounded-xl flex items-center justify-center shadow-lg shadow-' + c.color + '-200">' +
        '<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="' + c.icon + '"/></svg></div>' +
        '<span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">' + escapeHtml(c.nivel) + "</span></div>" +
        '<h3 class="text-base font-bold text-slate-900 mt-4 leading-tight">' + escapeHtml(c.titulo) + "</h3>" +
        '<p class="text-xs text-slate-500 mt-1.5 leading-relaxed flex-1">' + escapeHtml(c.resumen) + "</p>" +
        '<div class="mt-4 pt-3 border-t border-slate-100">' +
        '<div class="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">' +
        '<span class="font-medium">' + c.lecciones.length + " lecciones · " + escapeHtml(c.duracion) + "</span>" +
        (done ? '<span class="text-emerald-700 font-bold">✓ Completado</span>' : '<span class="font-bold text-' + c.color + '-700">' + pct + "%</span>") +
        "</div>" +
        '<div class="bar-track"><div class="bar-fill bg-' + c.color + '-500" style="width:' + pct + '%"></div></div>' +
        "</div></div>"
      );
    }).join("");
    $$("#cursosGrid [data-curso]").forEach((el) =>
      el.addEventListener("click", () => showCurso(el.dataset.curso))
    );
  }

  function showCurso(courseId) {
    const c = LICITA.cursos.byId(courseId);
    if (!c) return;
    $("#cursosCatalog").classList.add("hidden");
    $("#cursoDetail").classList.remove("hidden");
    const pct = progressPct(c.id);
    $("#cursoHeader").innerHTML =
      '<div class="flex items-start gap-4">' +
      '<div class="w-14 h-14 bg-gradient-to-br from-' + c.color + '-400 to-' + c.color + '-600 rounded-2xl flex items-center justify-center shadow-lg shadow-' + c.color + '-200 flex-shrink-0">' +
      '<svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="' + c.icon + '"/></svg></div>' +
      '<div class="min-w-0 flex-1">' +
      '<p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">' + escapeHtml(c.nivel) + " · " + escapeHtml(c.duracion) + "</p>" +
      '<h2 class="text-2xl font-extrabold text-slate-900 mt-0.5 leading-tight">' + escapeHtml(c.titulo) + "</h2>" +
      '<p class="text-sm text-slate-600 mt-1.5 leading-relaxed">' + escapeHtml(c.resumen) + "</p>" +
      '<div class="mt-4">' +
      '<div class="flex items-center justify-between text-xs mb-1.5"><span class="font-semibold text-slate-700">Progreso</span><span class="font-bold text-' + c.color + '-700">' + pct + "%</span></div>" +
      '<div class="bar-track"><div class="bar-fill bg-' + c.color + '-500" style="width:' + pct + '%"></div></div></div></div></div>';
    renderLeccionesList(c, 0);
    renderLeccion(c, 0);
  }

  function renderLeccionesList(c, activeIdx) {
    const p = loadProgress();
    const done = (p[c.id] && p[c.id].lessons) ? p[c.id].lessons : {};
    const list = $("#cursoLeccionesList");
    list.innerHTML = c.lecciones.map((l, i) => {
      const isDone = !!done[l.id];
      const isActive = i === activeIdx;
      return (
        '<li><button data-leccion-idx="' + i + '" class="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors ' +
        (isActive ? "bg-" + c.color + "-50 text-" + c.color + "-800 font-semibold" : "text-slate-600 hover:bg-slate-50") + '">' +
        '<span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ' +
        (isDone ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500") + '">' +
        (isDone ? "✓" : (i + 1)) + "</span>" +
        '<span class="truncate">' + escapeHtml(l.titulo) + "</span></button></li>"
      );
    }).join("");
    // entrada de quiz
    const allDone = c.lecciones.every((l) => done[l.id]);
    list.innerHTML += '<li class="mt-2 pt-2 border-t border-slate-100"><button data-quiz="1" class="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold ' +
      (allDone ? "text-" + c.color + "-700 hover:bg-" + c.color + "-50" : "text-slate-400 cursor-not-allowed") +
      '"' + (allDone ? "" : " disabled") + ">" +
      '<span class="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">★</span>' +
      "Quiz final + certificado</button></li>";
    $$("#cursoLeccionesList [data-leccion-idx]").forEach((b) =>
      b.addEventListener("click", () => renderLeccion(c, Number(b.dataset.leccionIdx)))
    );
    const qb = $("#cursoLeccionesList [data-quiz]");
    if (qb && allDone) qb.addEventListener("click", () => renderQuiz(c));
  }

  function renderLeccion(c, idx) {
    const l = c.lecciones[idx];
    if (!l) return;
    renderLeccionesList(c, idx);
    const p = loadProgress();
    const isDone = !!(p[c.id] && p[c.id].lessons && p[c.id].lessons[l.id]);
    const puntos = l.puntos.map((x) => '<li class="flex gap-2.5 text-sm text-slate-700 leading-relaxed"><svg class="w-4 h-4 text-' + c.color + '-500 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg><span>' + escapeHtml(x) + "</span></li>").join("");
    $("#cursoContenido").innerHTML =
      '<p class="text-[10px] font-bold uppercase tracking-wider text-' + c.color + '-700">Lección ' + (idx + 1) + " de " + c.lecciones.length + "</p>" +
      '<h3 class="text-2xl font-extrabold text-slate-900 mt-1 leading-tight">' + escapeHtml(l.titulo) + "</h3>" +
      '<p class="text-base text-slate-600 mt-3 leading-relaxed">' + escapeHtml(l.intro) + "</p>" +
      '<ul class="mt-5 space-y-2.5">' + puntos + "</ul>" +
      (l.norma ? '<div class="mt-5 bg-slate-50 border border-slate-200 rounded-lg p-3"><p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fundamento normativo</p><p class="text-sm text-slate-700 mt-1">' + escapeHtml(l.norma) + "</p></div>" : "") +
      (l.tip ? '<div class="mt-3 bg-' + c.color + '-50 border border-' + c.color + '-100 rounded-lg p-3 flex gap-2.5"><svg class="w-5 h-5 text-' + c.color + '-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg><p class="text-sm text-' + c.color + '-900 leading-relaxed"><span class="font-bold">Tip aplicado a LICITA · </span>' + escapeHtml(l.tip) + "</p></div>" : "") +
      '<div class="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">' +
      '<button data-leccion-prev="' + (idx - 1) + '" class="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1 ' + (idx === 0 ? "invisible" : "") + '">' +
      '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>Anterior</button>' +
      '<button data-leccion-done="' + l.id + '" class="text-sm font-semibold ' +
      (isDone
        ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
        : "text-white bg-gradient-to-r from-" + c.color + "-500 to-" + c.color + "-700 hover:shadow-lg hover:shadow-" + c.color + "-200") +
      ' px-5 py-2 rounded-lg transition-all flex items-center gap-1.5">' +
      (isDone ? '✓ Lección completada' : 'Marcar como completada') + "</button>" +
      '<button data-leccion-next="' + (idx + 1) + '" class="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1 ' + (idx >= c.lecciones.length - 1 ? "invisible" : "") + '">' +
      'Siguiente<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg></button>' +
      "</div>";

    $("#cursoContenido [data-leccion-done]").addEventListener("click", () => {
      const p2 = loadProgress();
      if (!p2[c.id]) p2[c.id] = { lessons: {} };
      if (!p2[c.id].lessons) p2[c.id].lessons = {};
      if (p2[c.id].lessons[l.id]) delete p2[c.id].lessons[l.id];
      else p2[c.id].lessons[l.id] = new Date().toISOString();
      saveProgress(p2);
      renderLeccion(c, idx);
      // Actualiza barra del header
      const pct = progressPct(c.id);
      const bar = $("#cursoHeader .bar-fill");
      if (bar) bar.style.width = pct + "%";
      const txt = $("#cursoHeader [class*='font-bold text-" + c.color + "-700']");
      if (txt) txt.textContent = pct + "%";
    });
    const prev = $("#cursoContenido [data-leccion-prev]");
    if (prev) prev.addEventListener("click", () => renderLeccion(c, idx - 1));
    const next = $("#cursoContenido [data-leccion-next]");
    if (next) next.addEventListener("click", () => renderLeccion(c, idx + 1));
  }

  function renderQuiz(c) {
    const q = c.quiz || [];
    if (!q.length) return;
    $("#cursoContenido").innerHTML =
      '<p class="text-[10px] font-bold uppercase tracking-wider text-amber-700">Quiz final</p>' +
      '<h3 class="text-2xl font-extrabold text-slate-900 mt-1">Verifica lo aprendido</h3>' +
      '<p class="text-sm text-slate-500 mt-2">Necesitas acertar al menos el 70 % para obtener tu certificado.</p>' +
      '<div id="quizForm" class="mt-6 space-y-5">' +
      q.map((qq, qi) =>
        '<div class="border border-slate-200 rounded-xl p-4">' +
        '<p class="text-sm font-semibold text-slate-900">' + (qi + 1) + ". " + escapeHtml(qq.q) + "</p>" +
        '<div class="mt-3 space-y-1.5">' +
        qq.opciones.map((op, oi) =>
          '<label class="flex items-start gap-2 cursor-pointer text-sm text-slate-700 hover:bg-slate-50 rounded p-2 transition-colors">' +
          '<input type="radio" name="q' + qi + '" value="' + oi + '" class="mt-1" />' +
          '<span>' + escapeHtml(op) + "</span></label>"
        ).join("") +
        "</div></div>"
      ).join("") +
      "</div>" +
      '<button id="quizSubmit" class="mt-6 w-full sm:w-auto text-sm font-bold text-white bg-gradient-to-r from-' + c.color + '-500 to-' + c.color + '-700 hover:shadow-lg hover:shadow-' + c.color + '-200 px-6 py-3 rounded-lg transition-all">Calificar y emitir certificado</button>';
    $("#quizSubmit").addEventListener("click", () => evaluateQuiz(c));
  }

  function evaluateQuiz(c) {
    const q = c.quiz;
    let aciertos = 0;
    q.forEach((qq, qi) => {
      const sel = document.querySelector('input[name="q' + qi + '"]:checked');
      if (sel && Number(sel.value) === qq.correcta) aciertos++;
    });
    const pct = Math.round((aciertos / q.length) * 100);
    const p = loadProgress();
    if (!p[c.id]) p[c.id] = { lessons: {} };
    p[c.id].quiz = { score: pct, date: new Date().toISOString(), passed: pct >= 70 };
    saveProgress(p);
    const passed = pct >= 70;
    $("#cursoContenido").innerHTML =
      '<div class="text-center py-6">' +
      '<div class="w-20 h-20 mx-auto rounded-full bg-' + (passed ? c.color + "-100" : "rose-100") + ' flex items-center justify-center">' +
      '<span class="text-3xl">' + (passed ? "🏆" : "✏️") + "</span></div>" +
      '<h3 class="text-2xl font-extrabold text-slate-900 mt-4">' + (passed ? "¡Curso aprobado!" : "Casi lo logras") + "</h3>" +
      '<p class="text-base text-slate-600 mt-2">Calificación: <span class="font-bold text-' + (passed ? c.color : "rose") + '-700">' + pct + "% (" + aciertos + "/" + q.length + ")</span></p>" +
      (passed
        ? '<p class="text-sm text-slate-500 mt-1 max-w-md mx-auto">Descarga tu certificado y consérvalo. Aplica de inmediato lo aprendido analizando un pliego en LICITA.</p>' +
          '<div class="mt-6 flex flex-wrap gap-3 justify-center">' +
          '<button id="dlCert" class="text-sm font-bold text-white bg-gradient-to-r from-' + c.color + '-500 to-' + c.color + '-700 hover:shadow-lg px-5 py-2.5 rounded-lg transition-all">Descargar certificado (Word)</button>' +
          '<button id="goAnalisisCurso" class="text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 px-5 py-2.5 rounded-lg transition-colors">Aplicarlo en el analizador →</button>' +
          "</div>"
        : '<button id="retryQuiz" class="mt-6 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-700 px-5 py-2.5 rounded-lg transition-colors">Volver a intentarlo</button>'
      ) +
      "</div>";
    if (passed) {
      $("#dlCert").addEventListener("click", () => downloadCertificate(c, pct));
      $("#goAnalisisCurso").addEventListener("click", () => showSection("analisis"));
    } else {
      $("#retryQuiz").addEventListener("click", () => renderQuiz(c));
    }
  }

  function downloadCertificate(c, pct) {
    const u = Auth.currentUser();
    const fecha = D.fechaLarga(new Date().toISOString());
    const serial = "LIC-" + Math.random().toString(36).slice(2, 8).toUpperCase() + "-" + Date.now().toString().slice(-5);
    const html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>Certificado LICITA</title></head>' +
      '<body style="font-family:Georgia,serif;text-align:center;padding:60px 40px;color:#1e293b">' +
      '<div style="border:6px double #2563eb;padding:60px 40px;border-radius:8px">' +
      '<p style="font-size:11pt;letter-spacing:3px;color:#64748b">ASOCIADOS GYM LC · LICITA</p>' +
      '<h1 style="font-size:24pt;color:#0b1220;margin:20px 0 8px">Certificado de Aprobación</h1>' +
      '<p style="font-size:11pt;color:#64748b">Se hace constar que</p>' +
      '<h2 style="font-size:20pt;color:#1e3a8a;margin:14px 0">' + (u ? u.name : "Estudiante") + "</h2>" +
      '<p style="font-size:11pt;color:#64748b">aprobó satisfactoriamente el curso</p>' +
      '<h3 style="font-size:18pt;color:#0b1220;margin:14px 0">' + c.titulo + "</h3>" +
      '<p style="font-size:11pt;color:#64748b">con una calificación de <b>' + pct + "%</b></p>" +
      '<p style="font-size:10pt;color:#64748b;margin-top:30px">' + fecha + "</p>" +
      '<p style="font-size:9pt;color:#94a3b8;margin-top:6px">Código de verificación: ' + serial + "</p>" +
      '<p style="font-size:9pt;color:#94a3b8;margin-top:60px">Plataforma jurídica para contratación pública · Asociados GYM LC</p>' +
      "</div></body></html>";
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Certificado_LICITA_" + c.id + ".doc";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("Certificado descargado", "ok");
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
