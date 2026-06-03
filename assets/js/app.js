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
    alertas: { title: "Alertas inteligentes", sub: "Búsquedas guardadas que te avisan de procesos nuevos" },
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
    if (name === "alertas") renderAlerts();
    if (name === "dashboard") { renderPulse(); renderMap(); }
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
      unlockAchievement("first_analysis");
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
      (isHist ? "" :
        '<button class="text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1" data-sec-calc=\'' + payload + "'>" +
        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m-6 4h6m-2 4h2M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"/></svg>' +
        "Sugerir precio</button>"
      ) +
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
    $$("#sec-results [data-sec-calc]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = JSON.parse(b.dataset.secCalc);
        openCalcModal({
          valor: n.valor,
          texto: (n.objeto || "").split(/\s+/).filter((w) => w.length > 4).slice(0, 3).join(" "),
          departamento: n.departamento,
          tipoContrato: n.tipoContrato,
        });
      })
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
    if (reset) {
      const n = gamCounter("secop_searches");
      if (n >= 10) unlockAchievement("explorer_10");
    }
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
      '<div class="min-w-0 flex-1"><div class="flex items-center gap-1.5"><p class="text-sm font-semibold text-slate-800 truncate">' +
      escapeHtml(u.name) + "</p>" +
      '<span id="streakChip" class="streak-chip hidden"></span></div>' +
      '<p class="text-[11px] text-slate-500 flex items-center gap-1 flex-wrap">@' + escapeHtml(u.username) +
      ' · <span class="role-chip ' + u.role + '">' +
      (u.role === "admin" ? "Admin" : "Cliente") + "</span> " + planChip + "</p>" +
      '<button id="openAch" class="text-[10px] text-amber-700 hover:text-amber-900 mt-1 font-semibold flex items-center gap-1">🏆 Mis logros</button>' +
      "</div>";
    const upBtn = $("#sessionUpgradeBtn");
    if (upBtn) upBtn.addEventListener("click", openPremiumModal);
    const oa = $("#openAch");
    if (oa) oa.addEventListener("click", openAchievements);
    refreshStreakChip();
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
    maybeStartOnboarding();
    refreshAlertsSilent();
    unlockAchievement("first_login");
    bumpStreak();
    refreshStreakChip();
    maybeShowDailyBrief();
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

    // alertas
    const an = $("#alertNewBtn"); if (an) an.addEventListener("click", openAlertModal);
    const ac = $("#al-cancel"); if (ac) ac.addEventListener("click", closeAlertModal);
    const as = $("#al-save"); if (as) as.addEventListener("click", saveAlert);
    const am = $("#alertModal");
    if (am) am.addEventListener("click", (e) => { if (e.target.id === "alertModal") closeAlertModal(); });

    // calculadora
    const cr = $("#calc-run"); if (cr) cr.addEventListener("click", runCalc);
    const cc = $("#calc-close"); if (cc) cc.addEventListener("click", closeCalcModal);
    const cm = $("#calcModal");
    if (cm) cm.addEventListener("click", (e) => { if (e.target.id === "calcModal") closeCalcModal(); });

    // tema
    const tt = $("#themeToggle");
    if (tt) tt.addEventListener("click", toggleTheme);
    setTheme(currentTheme());

    // modal logros
    const ahc = $("#achClose");
    if (ahc) ahc.addEventListener("click", closeAchievements);
    const ahm = $("#achModal");
    if (ahm) ahm.addEventListener("click", (e) => { if (e.target.id === "achModal") closeAchievements(); });
  }

  /* =====================================================================
     PLAN ANUAL DE ADQUISICIONES (PAA) · datos.gov.co crbs-icmf
     Rediseñado: estilo Apple · didáctico · analítico · con calendario.
     Cruza con SECOP 2, SECOP 1 y el analizador.
     ===================================================================== */
  const paaState = {
    initialized: false,
    page: 0,
    pageSize: 24,
    total: null,
    filters: {},
    lastData: [],
    view: "lista",
  };

  const MESES_ABREV = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const MESES_LARGO = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  function paaCollectFilters() {
    return {
      texto: $("#paa-q").value.trim(),
      entidad: ($("#paa-entidad") && $("#paa-entidad").value || "").trim(),
      departamento: $("#paa-departamento") ? $("#paa-departamento").value : "",
      modalidad: $("#paa-modalidad") ? $("#paa-modalidad").value : "",
      precioMin: ($("#paa-pmin") && $("#paa-pmin").value || "").trim(),
      orden: "fecha_estimada_de_inicio ASC",
    };
  }

  /* Días hasta una fecha ISO. Negativo si ya pasó. Null si no hay fecha. */
  function daysUntil(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  function urgencyOf(days) {
    if (days == null) return { tone: "slate", label: "Sin fecha", hint: "Fecha no publicada" };
    if (days < 0) return { tone: "slate", label: "Pasó", hint: "Verifica si ya se publicó en SECOP" };
    if (days <= 7) return { tone: "rose", label: "Inminente", hint: "Abre en menos de una semana" };
    if (days <= 30) return { tone: "orange", label: "Pronto", hint: "Abre este mes" };
    if (days <= 90) return { tone: "amber", label: "Este trimestre", hint: "Aún hay tiempo de preparar" };
    return { tone: "sky", label: "Más adelante", hint: "Monitorea, falta tiempo" };
  }

  /* Calcula los analytics que alimentan stats, gráficas y calendario. */
  function paaAnalytics(items) {
    if (!items.length) return null;
    const norms = items.map((p) => SECOP.normalize("paa", p));
    const total = norms.reduce((s, n) => s + (Number(n.valor) || 0), 0);
    const byEntity = {};
    const byMonth = Array(12).fill(0);
    let nextOpening = null;
    norms.forEach((n) => {
      const e = n.entidad || "—";
      byEntity[e] = (byEntity[e] || 0) + 1;
      const d = n.fecha ? new Date(n.fecha) : null;
      if (d && !isNaN(d.getTime())) {
        byMonth[d.getMonth()] += 1;
        if (d >= new Date() && (!nextOpening || d < nextOpening)) nextOpening = d;
      }
    });
    const topEntities = Object.entries(byEntity)
      .sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      total, avg: total / items.length,
      count: items.length, entityCount: Object.keys(byEntity).length,
      topEntities, byMonth,
      nextOpening: nextOpening ? nextOpening.toISOString() : null,
    };
  }

  function paaRenderAnalytics(a) {
    if (!a) { $("#paa-analytics").classList.add("hidden"); $("#paa-charts").classList.add("hidden"); return; }
    $("#paa-analytics").classList.remove("hidden");
    $("#paa-charts").classList.remove("hidden");

    const next = a.nextOpening ? daysUntil(a.nextOpening) : null;
    const nextTxt = next == null ? "—" : (next <= 0 ? "Hoy" : "En " + next + " días");

    const cards = [
      { label: "Procesos planeados", val: a.count.toLocaleString("es-CO"), tone: "amber", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
      { label: "Valor total estimado", val: formatCOP(Math.round(a.total)), tone: "orange", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" },
      { label: "Entidades activas", val: a.entityCount.toLocaleString("es-CO"), tone: "indigo", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2.13a4 4 0 11-8 0 4 4 0 018 0z" },
      { label: "Próxima apertura", val: nextTxt, tone: "rose", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
    ];
    $("#paa-analytics").innerHTML = cards.map((c) =>
      '<div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 lift">' +
      '<div class="flex items-center gap-2.5">' +
      '<div class="w-9 h-9 rounded-lg bg-' + c.tone + '-100 flex items-center justify-center"><svg class="w-4 h-4 text-' + c.tone + '-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="' + c.icon + '"/></svg></div>' +
      '<p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">' + c.label + "</p></div>" +
      '<p class="text-xl lg:text-2xl font-extrabold text-' + c.tone + '-700 mt-2 leading-tight">' + escapeHtml(String(c.val)) + "</p></div>"
    ).join("");

    // Gráfica 1: top entidades (barras horizontales)
    const max = Math.max(1, ...a.topEntities.map((x) => x[1]));
    const topHtml = a.topEntities.length
      ? a.topEntities.map((e) => {
          const pct = Math.round((e[1] / max) * 100);
          return '<div><div class="flex items-baseline justify-between text-xs mb-1 gap-2">' +
            '<span class="font-medium text-slate-700 truncate">' + escapeHtml(e[0]) + "</span>" +
            '<span class="text-slate-500 font-bold flex-shrink-0">' + e[1] + "</span></div>" +
            '<div class="bar-track"><div class="bar-fill bg-amber-500" style="width:' + pct + '%"></div></div></div>';
        }).join('<div class="h-2"></div>')
      : '<p class="text-xs text-slate-400 text-center py-4">Sin datos</p>';

    // Gráfica 2: distribución por mes
    const maxMonth = Math.max(1, ...a.byMonth);
    const monthHtml = '<div class="flex items-end gap-1 h-32">' +
      a.byMonth.map((v, i) => {
        const h = Math.round((v / maxMonth) * 100);
        const isCurrent = i === new Date().getMonth();
        return '<div class="flex-1 flex flex-col items-center gap-1.5">' +
          '<div class="w-full rounded-t-md transition-all hover:opacity-80 ' +
          (isCurrent ? "bg-gradient-to-t from-rose-500 to-orange-400" : "bg-gradient-to-t from-amber-500 to-amber-300") +
          '" style="height:' + h + '%" title="' + v + ' procesos en ' + MESES_LARGO[i] + '"></div>' +
          '<span class="text-[9px] font-semibold ' + (isCurrent ? "text-rose-700" : "text-slate-500") + '">' + MESES_ABREV[i] + '</span>' +
          '<span class="text-[10px] font-bold text-slate-700">' + (v || "·") + '</span>' +
          '</div>';
      }).join("") + "</div>";

    $("#paa-charts").innerHTML =
      '<div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">' +
      '<div class="flex items-center justify-between mb-3"><h4 class="text-sm font-bold text-slate-900">Top entidades</h4>' +
      '<span class="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Que más planean</span></div>' +
      topHtml + "</div>" +
      '<div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">' +
      '<div class="flex items-center justify-between mb-3"><h4 class="text-sm font-bold text-slate-900">Distribución por mes</h4>' +
      '<span class="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Año en curso</span></div>' +
      monthHtml + "</div>";
  }

  /* Tarjeta visual de un proceso planeado, estilo Apple. */
  function paaCard(p) {
    const n = SECOP.normalize("paa", p);
    const days = daysUntil(n.fecha);
    const urg = urgencyOf(days);
    const fechaCorta = n.fecha ? n.fecha.slice(0, 10) : "—";
    const payload = escapeHtml(JSON.stringify(n));
    const dayBox = days == null
      ? '<div class="w-20 flex-shrink-0 text-center bg-slate-50 rounded-2xl p-3 border border-slate-200"><p class="text-xs text-slate-400">Sin</p><p class="text-xs text-slate-400">fecha</p></div>'
      : days < 0
        ? '<div class="w-20 flex-shrink-0 text-center bg-slate-50 rounded-2xl p-3 border border-slate-200"><p class="text-2xl font-extrabold text-slate-400">·</p><p class="text-[9px] font-bold uppercase tracking-wider text-slate-400">Pasó</p></div>'
        : '<div class="w-20 flex-shrink-0 text-center bg-' + urg.tone + '-50 rounded-2xl p-3 border border-' + urg.tone + '-100">' +
          '<p class="text-2xl font-extrabold text-' + urg.tone + '-700 leading-none">' + days + "</p>" +
          '<p class="text-[9px] font-bold uppercase tracking-wider text-' + urg.tone + '-700 mt-1">días</p></div>';
    return (
      '<div class="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg transition-all">' +
      '<div class="flex items-start gap-4">' +
      dayBox +
      '<div class="min-w-0 flex-1">' +
      '<div class="flex items-center gap-2 flex-wrap mb-1.5">' +
      '<span class="text-[10px] font-bold uppercase tracking-wider bg-' + urg.tone + '-100 text-' + urg.tone + '-700 px-2 py-0.5 rounded-full">' + urg.label + "</span>" +
      (n.modalidad ? '<span class="text-[10px] font-medium uppercase tracking-wide bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">' + escapeHtml(n.modalidad) + "</span>" : "") +
      (n.tipoContrato ? '<span class="text-[10px] font-medium uppercase tracking-wide bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded">' + escapeHtml(n.tipoContrato) + "</span>" : "") +
      "</div>" +
      '<h3 class="text-base font-bold text-slate-900 leading-snug">' + escapeHtml(n.entidad || "Entidad no informada") + "</h3>" +
      '<p class="text-sm text-slate-600 mt-1 leading-relaxed">' +
      escapeHtml((n.objeto || "").slice(0, 200)) + (n.objeto && n.objeto.length > 200 ? "…" : "") + "</p>" +
      '<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">' +
      '<span><span class="font-semibold text-slate-700">💰 Valor:</span> ' + formatCOP(n.valor) + "</span>" +
      (n.departamento ? '<span><span class="font-semibold text-slate-700">📍</span> ' + escapeHtml(n.departamento) + "</span>" : "") +
      '<span><span class="font-semibold text-slate-700">📅 Apertura:</span> ' + fechaCorta + "</span>" +
      (n.duracion ? '<span><span class="font-semibold text-slate-700">⏱️</span> ' + escapeHtml(n.duracion + " " + (n.unidadDuracion || "")) + "</span>" : "") +
      "</div></div></div>" +
      '<div class="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2">' +
      '<button class="text-xs font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5" data-paa-secop=\'' + payload + "'>" +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
      "Ya está en SECOP?</button>" +
      '<button class="text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5" data-paa-load=\'' + payload + "'>" +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' +
      "Preparar análisis</button>" +
      '<button class="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5" data-paa-history=\'' + payload + "'>" +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2"/></svg>' +
      "Quién ganó antes</button>" +
      "</div>" +
      '<div class="mt-2"><button class="w-full text-xs font-semibold text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5" data-paa-calc=\'' + payload + "'>" +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m-6 4h6m-2 4h2M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"/></svg>' +
      "🧮 Sugerir precio competitivo</button></div>" +
      "</div>"
    );
  }

  function bindPaaCardActions() {
    $$("#paa-results [data-paa-secop], #paa-calendar [data-paa-secop]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = JSON.parse(b.dataset.paaSecop);
        showSection("secop");
        setTimeout(() => {
          initSecopOnce();
          if (secopState.dataset !== "procesos") switchDataset("procesos");
          const kw = (n.objeto || "").split(/\s+/).filter((w) => w.length > 4).slice(0, 3).join(" ");
          $("#sec-q").value = kw;
          $("#sec-entidad").value = n.entidad || "";
          $("#sec-filters").classList.remove("hidden");
          runSecopSearch(true);
          toast("Buscando en SECOP 2: " + (kw || n.entidad), "ok");
        }, 100);
      })
    );
    $$("#paa-results [data-paa-load], #paa-calendar [data-paa-load]").forEach((b) =>
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
    $$("#paa-results [data-paa-history], #paa-calendar [data-paa-history]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = JSON.parse(b.dataset.paaHistory);
        showSection("secop");
        setTimeout(() => {
          initSecopOnce();
          if (secopState.dataset !== "contratos") switchDataset("contratos");
          const kw = (n.objeto || "").split(/\s+/).filter((w) => w.length > 4).slice(0, 3).join(" ");
          $("#sec-q").value = kw;
          $("#sec-filters").classList.remove("hidden");
          runSecopSearch(true);
          toast("Buscando históricos: " + kw, "ok");
        }, 100);
      })
    );
    $$("#paa-results [data-paa-calc], #paa-calendar [data-paa-calc]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = JSON.parse(b.dataset.paaCalc);
        openCalcModal({
          valor: n.valor,
          texto: (n.objeto || "").split(/\s+/).filter((w) => w.length > 4).slice(0, 3).join(" "),
          departamento: n.departamento,
          tipoContrato: n.tipoContrato,
        });
      })
    );
  }

  /* Vista calendario: 12 cards de mes con conteo y promedio de valor. */
  function renderPaaCalendar(items) {
    const calendar = $("#paa-calendar");
    const byMonth = Array.from({ length: 12 }, () => ({ items: [], total: 0 }));
    items.forEach((p) => {
      const n = SECOP.normalize("paa", p);
      const d = n.fecha ? new Date(n.fecha) : null;
      if (!d || isNaN(d.getTime())) return;
      const m = d.getMonth();
      byMonth[m].items.push(n);
      byMonth[m].total += Number(n.valor) || 0;
    });
    const today = new Date(); const curM = today.getMonth();
    const grid = byMonth.map((m, i) => {
      const isCur = i === curM;
      const future = i >= curM;
      const tone = isCur ? "rose" : (future ? "amber" : "slate");
      const count = m.items.length;
      return (
        '<button data-paa-month="' + i + '" class="text-left bg-white rounded-2xl border ' +
        (isCur ? "border-rose-300 shadow-md shadow-rose-100" : "border-slate-200 hover:shadow-md") +
        ' p-5 transition-all" ' + (count === 0 ? "disabled" : "") + '>' +
        '<div class="flex items-center justify-between">' +
        '<p class="text-sm font-bold ' + (count ? "text-" + tone + "-700" : "text-slate-300") + '">' + MESES_LARGO[i] + "</p>" +
        (isCur ? '<span class="text-[9px] font-bold uppercase tracking-wider text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">Ahora</span>' : "") +
        "</div>" +
        '<p class="text-4xl font-extrabold ' + (count ? "text-slate-900" : "text-slate-300") + ' mt-2 leading-none">' + count + "</p>" +
        '<p class="text-[10px] font-semibold uppercase tracking-wider ' + (count ? "text-slate-500" : "text-slate-300") + ' mt-1">' + (count === 1 ? "proceso" : "procesos") + "</p>" +
        (count ? '<p class="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-100"><span class="font-semibold">' + formatCOP(Math.round(m.total)) + "</span> en total</p>" : "") +
        "</button>"
      );
    }).join("");
    calendar.innerHTML =
      '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">' + grid + "</div>" +
      '<div id="paa-calendar-detail" class="hidden"></div>';

    $$("#paa-calendar [data-paa-month]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = Number(btn.dataset.paaMonth);
        const list = byMonth[m].items;
        if (!list.length) return;
        const detail = $("#paa-calendar-detail");
        detail.classList.remove("hidden");
        detail.innerHTML =
          '<div class="bg-amber-50/40 border border-amber-200 rounded-2xl p-4 mb-3 flex items-center justify-between flex-wrap gap-2">' +
          '<p class="text-sm font-bold text-amber-900">Procesos de ' + MESES_LARGO[m] + " · " + list.length + " planeados</p>" +
          '<button id="paa-calendar-close" class="text-xs font-medium text-slate-500 hover:text-slate-900">Cerrar</button>' +
          "</div>" +
          '<div class="space-y-3">' + list.slice(0, 20).map((n) => paaCard(n.raw)).join("") + "</div>";
        $("#paa-calendar-close").addEventListener("click", () => detail.classList.add("hidden"));
        bindPaaCardActions();
        detail.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function paaApplyView() {
    $$(".paa-vtab").forEach((b) =>
      b.classList.toggle("active", b.dataset.paaView === paaState.view)
    );
    if (paaState.view === "lista") {
      $("#paa-results").classList.remove("hidden");
      $("#paa-calendar").classList.add("hidden");
      $("#paa-pagination").classList.remove("hidden");
    } else {
      $("#paa-results").classList.add("hidden");
      $("#paa-calendar").classList.remove("hidden");
      $("#paa-pagination").classList.add("hidden");
      renderPaaCalendar(paaState.lastData);
      bindPaaCardActions();
    }
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
    $("#paa-calendar").classList.add("hidden");
    $("#paa-pagination").classList.add("hidden");
    $("#paa-analytics").classList.add("hidden");
    $("#paa-charts").classList.add("hidden");
    $("#paa-view-toggle").classList.remove("paa-view-toggle-show");
    $("#paa-loading").classList.remove("hidden");
    try {
      const [data, totalMaybe] = await Promise.all([
        SECOP.search("paa", f),
        reset ? SECOP.count("paa", f).catch(() => null) : Promise.resolve(paaState.total),
      ]);
      if (reset) paaState.total = totalMaybe;
      paaState.lastData = data;
      $("#paa-loading").classList.add("hidden");
      if (!data.length && paaState.page === 0) {
        $("#paa-empty").classList.remove("hidden");
        $("#paa-empty").innerHTML =
          '<div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">' +
          '<svg class="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>' +
          '<h3 class="text-base font-semibold text-slate-900">Sin resultados en el PAA</h3>' +
          '<p class="text-sm text-slate-400 mt-1 max-w-md">Prueba con palabras más amplias o quita filtros.</p>';
        return;
      }
      paaRenderAnalytics(paaAnalytics(data));
      $("#paa-results").innerHTML = data.map(paaCard).join("");
      bindPaaCardActions();
      $("#paa-view-toggle").classList.add("paa-view-toggle-show");
      paaApplyView();

      const start = paaState.page * paaState.pageSize + 1;
      const end = start + data.length - 1;
      $("#paa-pageinfo").textContent =
        "Mostrando " + start + "–" + end +
        (paaState.total != null ? " de " + paaState.total.toLocaleString("es-CO") + " procesos planeados" : "");
      $("#paa-prev").disabled = paaState.page === 0;
      $("#paa-next").disabled = data.length < paaState.pageSize ||
        (paaState.total != null && end >= paaState.total);
    } catch (err) {
      $("#paa-loading").classList.add("hidden");
      $("#paa-error").classList.remove("hidden");
      $("#paa-error").textContent = "Error consultando el PAA: " + (err && err.message ? err.message : err);
    }
  }

  function initPaaOnce() {
    if (paaState.initialized) return;
    paaState.initialized = true;
    unlockAchievement("first_paa");
    const ds = SECOP.DATASETS.paa;
    const fillSel = (id, items, placeholder) => {
      const el = $("#" + id);
      if (!el) return;
      el.innerHTML = '<option value="">' + (placeholder || "Todos") + "</option>" +
        items.map((it) => '<option value="' + escapeHtml(it) + '">' + escapeHtml(it) + "</option>").join("");
    };
    fillSel("paa-departamento", SECOP.DEPARTAMENTOS, "Todos los departamentos");
    fillSel("paa-modalidad", ds.modalidades, "Todas las modalidades");

    const chips = [
      { label: "⚡ Próximos a abrir" },
      { label: "💰 Mayor presupuesto" },
      { label: "🏗️ Obras" },
      { label: "💻 Tecnología" },
      { label: "🧹 Servicios generales" },
      { label: "📝 Consultoría" },
    ];
    const chipQueries = {
      "⚡ Próximos a abrir": { texto: "" },
      "💰 Mayor presupuesto": { texto: "" },
      "🏗️ Obras": { texto: "obra" },
      "💻 Tecnología": { texto: "software tecnología sistema" },
      "🧹 Servicios generales": { texto: "aseo cafetería vigilancia" },
      "📝 Consultoría": { texto: "consultoría asesoría" },
    };
    $("#paa-chips").innerHTML = chips
      .map((c) =>
        '<button data-paa-chip="' + escapeHtml(c.label) +
        '" class="text-xs font-semibold text-amber-800 bg-white/80 hover:bg-white border border-amber-100 hover:border-amber-300 px-3 py-1.5 rounded-full transition-colors backdrop-blur shadow-sm">' +
        escapeHtml(c.label) + "</button>"
      ).join("");
    $$("#paa-chips [data-paa-chip]").forEach((b) =>
      b.addEventListener("click", () => {
        const q = chipQueries[b.dataset.paaChip] || {};
        if (q.texto) $("#paa-q").value = q.texto;
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
    $$(".paa-vtab").forEach((b) =>
      b.addEventListener("click", () => {
        paaState.view = b.dataset.paaView;
        paaApplyView();
      })
    );
    paaState.view = "lista";
  }

  /* =====================================================================
     PULSO DEL MERCADO · feed en vivo en el dashboard
     ===================================================================== */
  const pulseState = { lastRunAt: 0 };

  async function renderPulse() {
    const wrap = $("#pulseWidget");
    if (!wrap) return;
    // throttle: solo recalcular si pasaron >2 minutos
    if (Date.now() - pulseState.lastRunAt < 120000 && wrap.dataset.rendered === "1") return;
    pulseState.lastRunAt = Date.now();
    wrap.classList.remove("hidden");
    wrap.innerHTML =
      '<div class="bg-gradient-to-br from-ink-900 via-ink-800 to-blue-900 text-white rounded-3xl p-6 lg:p-7 shadow-xl shadow-blue-900/20 relative overflow-hidden">' +
      '<div class="absolute -top-12 -right-12 w-64 h-64 bg-sky-400/20 rounded-full blur-3xl"></div>' +
      '<div class="relative flex items-center gap-3">' +
      '<span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50"></span>' +
      '<p class="text-[11px] uppercase tracking-widest font-bold text-sky-200">Pulso del mercado · ahora mismo</p>' +
      "</div>" +
      '<p class="text-sm text-sky-100/80 mt-3">Consultando procesos abiertos hoy en SECOP 2…</p>' +
      "</div>";
    let res;
    try { res = await LICITA.intel.pulse(); } catch (e) { res = { ok: false, items: [] }; }
    const items = (res && res.items) || [];
    const listHtml = items.length
      ? items.slice(0, 5).map((p) => {
          const n = SECOP.normalize("procesos", p);
          const payload = escapeHtml(JSON.stringify(n));
          return (
            '<button class="text-left bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl p-3 transition-colors block w-full" data-pulse-go=\'' + payload + "'>" +
            '<div class="flex items-center justify-between gap-3 flex-wrap">' +
            '<p class="text-xs font-bold text-white">' + escapeHtml((n.entidad || "Entidad no informada").slice(0, 60)) + "</p>" +
            '<span class="text-[10px] font-bold uppercase tracking-wider bg-emerald-400/20 text-emerald-200 px-2 py-0.5 rounded-full">Abierto</span></div>' +
            '<p class="text-[11px] text-sky-100/80 mt-1 leading-snug">' + escapeHtml((n.objeto || "").slice(0, 140)) + "…</p>" +
            '<p class="text-[10px] text-sky-200/60 mt-1">' + formatCOP(n.valor) + " · " + escapeHtml(n.modalidad || "—") + "</p>" +
            "</button>"
          );
        }).join("")
      : '<p class="text-sm text-sky-200/70 text-center py-3">No detectamos procesos abiertos en este momento. Vuelve más tarde.</p>';

    wrap.innerHTML =
      '<div class="bg-gradient-to-br from-ink-900 via-ink-800 to-blue-900 text-white rounded-3xl p-6 lg:p-7 shadow-xl shadow-blue-900/20 relative overflow-hidden">' +
      '<div class="absolute -top-12 -right-12 w-64 h-64 bg-sky-400/20 rounded-full blur-3xl"></div>' +
      '<div class="absolute -bottom-12 -left-12 w-72 h-72 bg-indigo-400/15 rounded-full blur-3xl"></div>' +
      '<div class="relative">' +
      '<div class="flex items-center justify-between flex-wrap gap-3">' +
      '<div class="flex items-center gap-3">' +
      '<span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50"></span>' +
      '<p class="text-[11px] uppercase tracking-widest font-bold text-sky-200">Pulso del mercado · en vivo</p>' +
      "</div>" +
      '<button id="pulseAll" class="text-xs font-medium text-sky-200 hover:text-white transition-colors flex items-center gap-1">' +
      "Ver todos en SECOP" +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>' +
      "</button></div>" +
      '<h3 class="text-3xl lg:text-4xl font-extrabold mt-3 leading-tight">' + items.length + ' <span class="text-base font-medium text-sky-200">' + (items.length === 1 ? "proceso abierto" : "procesos abiertos") + ' hoy</span></h3>' +
      '<p class="text-sm text-sky-100/80 mt-1">Aprovecha lo que se publicó en las últimas horas en todo el país.</p>' +
      '<div class="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">' + listHtml + "</div>" +
      "</div></div>";
    wrap.dataset.rendered = "1";
    $$("#pulseWidget [data-pulse-go]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = JSON.parse(b.dataset.pulseGo);
        showSection("secop");
        setTimeout(() => {
          initSecopOnce();
          if (secopState.dataset !== "procesos") switchDataset("procesos");
          $("#sec-q").value = n.id || (n.objeto || "").split(/\s+/).slice(0, 3).join(" ");
          runSecopSearch(true);
        }, 100);
      })
    );
    const pa = $("#pulseAll");
    if (pa) pa.addEventListener("click", () => {
      showSection("secop");
      setTimeout(() => {
        initSecopOnce();
        if (secopState.dataset !== "procesos") switchDataset("procesos");
        $("#sec-estado").value = "Presentación de oferta";
        $("#sec-filters").classList.remove("hidden");
        runSecopSearch(true);
      }, 100);
    });
  }

  /* =====================================================================
     ALERTAS INTELIGENTES · búsquedas guardadas con notificación
     ===================================================================== */
  function refreshAlertsBadge() {
    const u = Auth.currentUser();
    const badge = $("#alertsBadge");
    if (!u || !badge) return;
    const total = LICITA.intel.listAlerts(u.username)
      .reduce((s, a) => s + (a.pending || 0), 0);
    if (total > 0) {
      badge.textContent = total > 99 ? "99+" : String(total);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  async function refreshAlertsSilent() {
    const u = Auth.currentUser();
    if (!u) return;
    try { await LICITA.intel.refreshAllAlerts(u.username); refreshAlertsBadge(); }
    catch (e) { /* silencioso */ }
  }

  function alertSummary(al) {
    const f = al.filters;
    const parts = [];
    if (f.texto) parts.push('"' + f.texto + '"');
    if (f.entidad) parts.push("entidad: " + f.entidad);
    if (f.departamento) parts.push(f.departamento);
    if (f.modalidad) parts.push(f.modalidad);
    if (f.tipoContrato) parts.push(f.tipoContrato);
    return parts.join(" · ") || "Sin filtros";
  }

  function renderAlerts() {
    const u = Auth.currentUser();
    if (!u) return;
    const list = LICITA.intel.listAlerts(u.username);
    const box = $("#alertsList");
    const empty = $("#alertsEmpty");
    if (!list.length) {
      empty.classList.remove("hidden");
      box.innerHTML = "";
      return;
    }
    empty.classList.add("hidden");
    box.innerHTML = list.map((a) => {
      const dsLabel = a.dataset === "contratos" ? "Históricos" : (a.dataset === "paa" ? "Plan Anual" : "Procesos vigentes");
      const dsTone = a.dataset === "contratos" ? "indigo" : (a.dataset === "paa" ? "amber" : "sky");
      const pending = a.pending || 0;
      return (
        '<div class="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow">' +
        '<div class="flex items-start justify-between gap-3 flex-wrap">' +
        '<div class="min-w-0 flex-1">' +
        '<div class="flex items-center gap-2 flex-wrap mb-1">' +
        '<h3 class="text-base font-bold text-slate-900">' + escapeHtml(a.name) + "</h3>" +
        '<span class="text-[10px] font-bold uppercase tracking-wider bg-' + dsTone + '-100 text-' + dsTone + '-700 px-2 py-0.5 rounded-full">' + dsLabel + "</span>" +
        (pending > 0
          ? '<span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>' + pending + " nuevos</span>"
          : '<span class="text-[10px] font-medium text-slate-400">sin novedades</span>') +
        "</div>" +
        '<p class="text-xs text-slate-500">' + escapeHtml(alertSummary(a)) + "</p>" +
        '<p class="text-[11px] text-slate-400 mt-1">Última revisión: ' + relativeDate(a.lastCheckedAt) + "</p></div>" +
        '<div class="flex gap-2 flex-shrink-0">' +
        '<button class="text-xs font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-700 hover:shadow-lg px-3 py-2 rounded-lg transition-all flex items-center gap-1" data-al-open="' + a.id + '">' +
        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>' +
        "Abrir resultados</button>" +
        '<button class="text-xs font-medium text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-lg transition-colors" data-al-del="' + a.id + '">Eliminar</button>' +
        "</div></div></div>"
      );
    }).join("");
    $$("#alertsList [data-al-del]").forEach((b) =>
      b.addEventListener("click", () => {
        if (!confirm("¿Eliminar esta alerta?")) return;
        LICITA.intel.deleteAlert(u.username, b.dataset.alDel);
        renderAlerts();
        refreshAlertsBadge();
        toast("Alerta eliminada", "ok");
      })
    );
    $$("#alertsList [data-al-open]").forEach((b) =>
      b.addEventListener("click", () => {
        const al = LICITA.intel.listAlerts(u.username).find((x) => x.id === b.dataset.alOpen);
        if (!al) return;
        showSection("secop");
        setTimeout(() => {
          initSecopOnce();
          if (secopState.dataset !== al.dataset) switchDataset(al.dataset);
          $("#sec-q").value = al.filters.texto || "";
          if ($("#sec-entidad")) $("#sec-entidad").value = al.filters.entidad || "";
          if ($("#sec-departamento")) $("#sec-departamento").value = al.filters.departamento || "";
          if ($("#sec-modalidad")) $("#sec-modalidad").value = al.filters.modalidad || "";
          if (al.filters.entidad || al.filters.departamento || al.filters.modalidad) {
            $("#sec-filters").classList.remove("hidden");
          }
          runSecopSearch(true);
          LICITA.intel.markChecked(u.username, al.id);
          refreshAlertsBadge();
        }, 100);
      })
    );
  }

  function openAlertModal() {
    const fillSel = (id, items) => {
      const el = $("#" + id);
      el.innerHTML = '<option value="">Todos</option>' +
        items.map((it) => '<option value="' + escapeHtml(it) + '">' + escapeHtml(it) + "</option>").join("");
    };
    fillSel("al-depto", SECOP.DEPARTAMENTOS);
    fillSel("al-mod", SECOP.DATASETS.procesos.modalidades);
    ["al-name", "al-texto", "al-entidad"].forEach((id) => ($("#" + id).value = ""));
    $("#al-error").classList.add("hidden");
    $("#alertModal").classList.remove("hidden");
    $("#alertModal").classList.add("flex");
    setTimeout(() => $("#al-name").focus(), 50);
  }
  function closeAlertModal() {
    $("#alertModal").classList.add("hidden");
    $("#alertModal").classList.remove("flex");
  }
  function saveAlert() {
    const u = Auth.currentUser();
    if (!u) return;
    try {
      LICITA.intel.createAlert(u.username, {
        name: $("#al-name").value.trim() || $("#al-texto").value.trim(),
        texto: $("#al-texto").value.trim(),
        entidad: $("#al-entidad").value.trim(),
        departamento: $("#al-depto").value,
        modalidad: $("#al-mod").value,
        dataset: "procesos",
      });
      closeAlertModal();
      renderAlerts();
      refreshAlertsSilent();
      toast("Alerta creada · te avisaremos al volver", "ok");
      unlockAchievement("first_alert");
    } catch (e) {
      $("#al-error").textContent = e.message;
      $("#al-error").classList.remove("hidden");
    }
  }

  /* =====================================================================
     CALCULADORA DE OFERTA · sugiere precio a partir de SECOP 1
     ===================================================================== */
  function openCalcModal(prefill) {
    unlockAchievement("first_calc");
    $("#calc-result").innerHTML = "";
    $("#calc-base").value = (prefill && prefill.valor) ? prefill.valor : "";
    $("#calc-texto").value = (prefill && prefill.texto) || "";
    $("#calc-depto").value = (prefill && prefill.departamento) || "";
    $("#calc-tipo").value = (prefill && prefill.tipoContrato) || "";
    $("#calcModal").classList.remove("hidden");
    $("#calcModal").classList.add("flex");
  }
  function closeCalcModal() {
    $("#calcModal").classList.add("hidden");
    $("#calcModal").classList.remove("flex");
  }
  async function runCalc() {
    const base = Number($("#calc-base").value) || 0;
    const params = {
      texto: $("#calc-texto").value.trim(),
      departamento: $("#calc-depto").value.trim(),
      tipoContrato: $("#calc-tipo").value.trim(),
    };
    $("#calc-result").innerHTML =
      '<div class="flex items-center justify-center py-6"><div class="licita-spinner"></div></div>';
    try {
      const r = await LICITA.intel.suggestPrice(params);
      if (!r.ok) {
        $("#calc-result").innerHTML =
          '<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">' +
          escapeHtml(r.reason || "Sin datos suficientes para sugerir.") + "</div>";
        return;
      }
      // Tres escenarios: agresivo / balanceado / conservador
      const refBase = base > 0 ? base : r.median;
      const escenarios = [
        { label: "Agresivo", desc: "Alta probabilidad de ganar · margen ajustado", precio: Math.round(r.p25 * 0.97), tone: "rose" },
        { label: "Balanceado", desc: "Recomendado · cerca de la mediana histórica", precio: Math.round(r.median), tone: "emerald" },
        { label: "Conservador", desc: "Mejor margen · menos probable ganar", precio: Math.round(r.p75 * 1.02), tone: "indigo" },
      ];
      const pctOver = (p) => refBase > 0 ? Math.round(((p - refBase) / refBase) * 100) : null;
      const histBars = (() => {
        // Mini histograma de rangos en cinco columnas
        const min = r.min, max = r.max;
        const buckets = Array(5).fill(0);
        const step = (max - min) / 5 || 1;
        // No tenemos los valores individuales; aproximamos por percentiles
        // Pintamos altura simple ascendente hasta p50 y descendente.
        const heights = [40, 70, 100, 70, 40];
        return heights.map((h, i) =>
          '<div class="flex-1 flex flex-col items-center gap-1">' +
          '<div class="w-full bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-t" style="height:' + h + '%"></div>' +
          '<span class="text-[9px] text-slate-500">' + formatCOP(Math.round(min + step * (i + 0.5))).replace("$", "") + "</span>" +
          "</div>"
        ).join("");
      })();
      $("#calc-result").innerHTML =
        '<div class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-3">' +
        '<p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Análisis sobre ' + r.count + ' adjudicaciones similares</p>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-center">' +
        '<div><p class="text-[10px] text-slate-400 uppercase">Mín</p><p class="text-xs font-bold text-slate-800">' + formatCOP(r.min) + "</p></div>" +
        '<div><p class="text-[10px] text-slate-400 uppercase">Mediana</p><p class="text-xs font-bold text-emerald-700">' + formatCOP(r.median) + "</p></div>" +
        '<div><p class="text-[10px] text-slate-400 uppercase">Promedio</p><p class="text-xs font-bold text-slate-800">' + formatCOP(Math.round(r.mean)) + "</p></div>" +
        '<div><p class="text-[10px] text-slate-400 uppercase">Máx</p><p class="text-xs font-bold text-slate-800">' + formatCOP(r.max) + "</p></div>" +
        "</div>" +
        '<div class="flex items-end gap-1 h-16 mt-3">' + histBars + "</div>" +
        "</div>" +
        '<p class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Escenarios sugeridos</p>' +
        '<div class="space-y-2">' +
        escenarios.map((e) => {
          const pc = pctOver(e.precio);
          return (
            '<div class="bg-white border border-' + e.tone + '-200 rounded-xl p-3">' +
            '<div class="flex items-center justify-between gap-2 flex-wrap">' +
            '<div><p class="text-sm font-bold text-' + e.tone + '-700">' + e.label + "</p>" +
            '<p class="text-[11px] text-slate-500">' + escapeHtml(e.desc) + "</p></div>" +
            '<div class="text-right"><p class="text-lg font-extrabold text-slate-900">' + formatCOP(e.precio) + "</p>" +
            (pc != null ? '<p class="text-[10px] text-' + (pc < 0 ? "emerald" : "rose") + '-600 font-semibold">' + (pc >= 0 ? "+" : "") + pc + '% vs base</p>' : "") +
            "</div></div></div>"
          );
        }).join("") + "</div>" +
        '<p class="text-[11px] text-slate-400 mt-3 leading-relaxed">Heurística basada en valores adjudicados históricos · No reemplaza un estudio comercial propio.</p>';
    } catch (e) {
      $("#calc-result").innerHTML =
        '<div class="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">' +
        "Error al consultar SECOP 1: " + escapeHtml(e.message || String(e)) + "</div>";
    }
  }

  /* =====================================================================
     ONBOARDING TOUR (coachmark) — primera visita
     ===================================================================== */
  function onboardingDoneKey(u) { return "licita.onboarding." + u.username; }
  function maybeStartOnboarding() {
    const u = Auth.currentUser();
    if (!u) return;
    if (u.role === "admin") return; // admin no necesita el tour
    try {
      if (localStorage.getItem(onboardingDoneKey(u))) return;
    } catch (e) { return; }
    setTimeout(() => startOnboarding(), 700);
  }
  function startOnboarding() {
    const steps = [
      {
        emoji: "🎯",
        title: "Bienvenido a LICITA",
        body: "Tu ecosistema para encontrar, anticipar y ganar licitaciones en Colombia.",
      },
      {
        emoji: "🔍",
        title: "Busca procesos en SECOP",
        body: "Encuentra procesos vigentes (SECOP 2) o ve quién ganó antes (SECOP 1) en tu nicho.",
      },
      {
        emoji: "📅",
        title: "Anticipa con el PAA",
        body: "Mira qué planean comprar las entidades este año con un calendario interactivo.",
      },
      {
        emoji: "🤖",
        title: "Análisis con IA",
        body: "Carga un pliego y la IA detecta riesgos jurídicos. Tienes 3 análisis gratis al registrarte.",
      },
      {
        emoji: "🎓",
        title: "Aprende mientras usas",
        body: "Cursos cortos sobre contratación pública con certificado descargable.",
      },
    ];
    let i = 0;
    const root = document.createElement("div");
    root.className = "coach-backdrop";
    root.innerHTML = "";
    document.body.appendChild(root);

    function render() {
      const s = steps[i];
      root.innerHTML =
        '<div class="coach-card">' +
        '<div class="flex items-center gap-3">' +
        '<div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-2xl shadow-lg shadow-blue-200">' + s.emoji + "</div>" +
        '<div><p class="text-[10px] font-bold uppercase tracking-wider text-sky-700">Paso ' + (i + 1) + " de " + steps.length + "</p>" +
        '<h3 class="text-lg font-extrabold text-slate-900 leading-tight">' + escapeHtml(s.title) + "</h3></div></div>" +
        '<p class="text-base text-slate-600 mt-4 leading-relaxed">' + escapeHtml(s.body) + "</p>" +
        '<div class="flex items-center justify-between mt-6">' +
        '<div class="flex gap-1.5 items-center">' +
        steps.map((_, k) => '<span class="coach-dot' + (k === i ? " active" : "") + '"></span>').join("") + "</div>" +
        '<div class="flex gap-2">' +
        (i > 0 ? '<button id="coach-prev" class="text-sm font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg transition-colors">Atrás</button>' : '<button id="coach-skip" class="text-sm font-medium text-slate-400 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors">Saltar</button>') +
        '<button id="coach-next" class="text-sm font-bold text-white bg-gradient-to-r from-sky-600 to-blue-700 hover:shadow-lg px-4 py-2 rounded-lg transition-all">' +
        (i === steps.length - 1 ? "¡Empezar!" : "Siguiente →") + "</button></div></div></div>";
      const next = $("#coach-next");
      const prev = $("#coach-prev");
      const skip = $("#coach-skip");
      if (next) next.onclick = () => {
        if (i === steps.length - 1) finish();
        else { i++; render(); }
      };
      if (prev) prev.onclick = () => { i--; render(); };
      if (skip) skip.onclick = finish;
    }
    function finish() {
      const u = Auth.currentUser();
      try { if (u) localStorage.setItem(onboardingDoneKey(u), "1"); } catch (e) {}
      root.classList.add("fade-out");
      setTimeout(() => root.remove(), 250);
    }
    render();
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
      unlockAchievement("first_course");
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

  /* =====================================================================
     TEMA · claro / oscuro
     ===================================================================== */
  function currentTheme() {
    try { return localStorage.getItem("licita.theme") || "light"; }
    catch (e) { return "light"; }
  }
  function setTheme(t) {
    try { localStorage.setItem("licita.theme", t); } catch (e) {}
    document.documentElement.classList.toggle("dark", t === "dark");
    const dark = $("#themeIconDark"), light = $("#themeIconLight");
    if (dark && light) {
      dark.classList.toggle("hidden", t === "dark");
      light.classList.toggle("hidden", t !== "dark");
    }
  }
  function toggleTheme() {
    setTheme(currentTheme() === "dark" ? "light" : "dark");
    toast(currentTheme() === "dark" ? "Modo oscuro activado" : "Modo claro activado", "ok");
  }

  /* =====================================================================
     ENGAGEMENT · rachas + logros + daily brief
     ===================================================================== */
  const ACHIEVEMENTS = [
    { id: "first_login", name: "Bienvenido a bordo", desc: "Hiciste tu primer inicio de sesión", emoji: "🚀" },
    { id: "first_analysis", name: "Primer análisis", desc: "Analizaste tu primer pliego con IA", emoji: "🎯" },
    { id: "first_alert", name: "Cazador de oportunidades", desc: "Creaste tu primera alerta inteligente", emoji: "🔔" },
    { id: "first_calc", name: "Estratega", desc: "Usaste la calculadora de oferta", emoji: "🧮" },
    { id: "first_paa", name: "Visionario", desc: "Exploraste el Plan Anual de Adquisiciones", emoji: "🔮" },
    { id: "first_course", name: "Estudiante", desc: "Completaste tu primer curso", emoji: "📚" },
    { id: "explorer_10", name: "Explorador", desc: "Hiciste 10 búsquedas en SECOP", emoji: "🔍" },
    { id: "streak_3", name: "Constancia", desc: "3 días consecutivos en LICITA", emoji: "🔥" },
    { id: "streak_7", name: "Imparable", desc: "7 días consecutivos en LICITA", emoji: "⚡" },
    { id: "streak_30", name: "Maestro", desc: "30 días consecutivos en LICITA", emoji: "👑" },
  ];

  function gamKey(suffix) {
    const u = Auth.currentUser();
    return u ? "licita.gam." + suffix + "." + u.username : null;
  }
  function gamLoad(suffix, fallback) {
    const k = gamKey(suffix);
    if (!k) return fallback;
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function gamSave(suffix, value) {
    const k = gamKey(suffix);
    if (!k) return;
    try { localStorage.setItem(k, JSON.stringify(value)); } catch (e) {}
  }
  function gamCounter(name, by) {
    const c = gamLoad("counters", {});
    c[name] = (c[name] || 0) + (by || 1);
    gamSave("counters", c);
    return c[name];
  }

  function bumpStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const state = gamLoad("streak", { current: 0, longest: 0, lastDay: null });
    if (state.lastDay === today) return state;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const ydStr = y.toISOString().slice(0, 10);
    state.current = state.lastDay === ydStr ? state.current + 1 : 1;
    state.longest = Math.max(state.longest, state.current);
    state.lastDay = today;
    gamSave("streak", state);
    if (state.current >= 30) unlockAchievement("streak_30");
    else if (state.current >= 7) unlockAchievement("streak_7");
    else if (state.current >= 3) unlockAchievement("streak_3");
    return state;
  }
  function currentStreak() { return gamLoad("streak", { current: 0, longest: 0 }); }

  function unlockAchievement(id) {
    const earned = gamLoad("ach", []);
    if (earned.some((e) => e.id === id)) return null;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return null;
    earned.push({ id, at: new Date().toISOString() });
    gamSave("ach", earned);
    showAchievementToast(a);
    refreshStreakChip();
    return a;
  }
  function showAchievementToast(a) {
    const wrap = $("#toastWrap");
    const t = document.createElement("div");
    t.className = "toast achievement";
    t.innerHTML =
      '<span style="font-size:1.6rem">' + a.emoji + "</span>" +
      "<div><strong>¡Logro desbloqueado!</strong>" +
      "<span style='display:block;font-size:.85rem'>" + escapeHtml(a.name) + " · " + escapeHtml(a.desc) + "</span></div>";
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity .35s, transform .35s";
      t.style.opacity = "0";
      t.style.transform = "translateX(20px)";
      setTimeout(() => t.remove(), 360);
    }, 4500);
  }

  function refreshStreakChip() {
    const u = Auth.currentUser();
    if (!u) return;
    const chip = document.getElementById("streakChip");
    const s = currentStreak();
    if (!chip) return;
    if (s.current >= 2) {
      chip.classList.remove("hidden");
      chip.innerHTML = '<span>🔥</span>' + s.current + 'd';
      chip.title = "Llevas " + s.current + " días seguidos en LICITA";
    } else {
      chip.classList.add("hidden");
    }
  }

  /* Modal de logros */
  function openAchievements() {
    const earned = gamLoad("ach", []);
    const earnedIds = earned.reduce((m, e) => (m[e.id] = e.at, m), {});
    $("#achSubtitle").textContent = earned.length + " desbloqueado" + (earned.length === 1 ? "" : "s") + " de " + ACHIEVEMENTS.length;
    $("#achList").innerHTML = ACHIEVEMENTS.map((a) => {
      const got = !!earnedIds[a.id];
      return (
        '<div class="flex items-center gap-3 p-3 rounded-xl ' + (got ? "bg-amber-50 border border-amber-200" : "bg-slate-50 border border-slate-200 opacity-60") + '">' +
        '<div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl ' + (got ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-orange-200" : "bg-slate-200") + '">' + a.emoji + "</div>" +
        '<div class="flex-1 min-w-0">' +
        '<p class="text-sm font-bold text-slate-900">' + escapeHtml(a.name) + (got ? "" : ' <span class="text-[10px] font-medium text-slate-400 uppercase tracking-wider ml-1">bloqueado</span>') + "</p>" +
        '<p class="text-[11px] text-slate-500">' + escapeHtml(a.desc) + "</p></div>" +
        (got ? '<svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : "") +
        "</div>"
      );
    }).join("");
    $("#achModal").classList.remove("hidden");
    $("#achModal").classList.add("flex");
  }
  function closeAchievements() {
    $("#achModal").classList.add("hidden");
    $("#achModal").classList.remove("flex");
  }

  /* =====================================================================
     DAILY BRIEF · resumen al primer login del día
     ===================================================================== */
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  async function maybeShowDailyBrief() {
    const u = Auth.currentUser();
    if (!u) return;
    const lastShown = gamLoad("brief.lastShown", null);
    if (lastShown === todayKey()) return;
    gamSave("brief.lastShown", todayKey());

    const s = currentStreak();
    const alerts = LICITA.intel.listAlerts(u.username);
    const totalPending = alerts.reduce((a, b) => a + (b.pending || 0), 0);
    const hour = new Date().getHours();
    const saludo = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

    // Pulso en paralelo (no bloqueamos si falla)
    let pulseCount = "—";
    try {
      const r = await LICITA.intel.pulse();
      pulseCount = r.items ? r.items.length : "—";
    } catch (e) {}

    const banner = $("#dailyBriefBanner");
    if (!banner) return;
    banner.classList.remove("hidden");
    banner.innerHTML =
      '<div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-50 via-indigo-50 to-violet-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 border border-sky-200 p-5 lg:p-6">' +
      '<div class="absolute -top-12 -right-12 w-64 h-64 bg-sky-200/30 rounded-full blur-3xl"></div>' +
      '<div class="relative flex items-start gap-4 flex-wrap">' +
      '<div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200 flex-shrink-0">' +
      '<span class="text-2xl">☀️</span></div>' +
      '<div class="min-w-0 flex-1">' +
      '<p class="text-[10px] font-bold uppercase tracking-wider text-sky-700">Tu resumen de hoy</p>' +
      '<h3 class="text-xl font-extrabold text-slate-900 mt-0.5 leading-tight">' + saludo + ", " + escapeHtml(u.name.split(" ")[0]) + "</h3>" +
      '<div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">' +
      '<div class="bg-white/70 backdrop-blur border border-sky-100 rounded-xl p-3"><p class="text-[10px] text-slate-500 uppercase font-bold">Procesos hoy</p><p class="text-xl font-extrabold text-sky-700">' + pulseCount + "</p></div>" +
      '<div class="bg-white/70 backdrop-blur border border-rose-100 rounded-xl p-3"><p class="text-[10px] text-slate-500 uppercase font-bold">Alertas con novedades</p><p class="text-xl font-extrabold text-rose-700">' + totalPending + "</p></div>" +
      '<div class="bg-white/70 backdrop-blur border border-orange-100 rounded-xl p-3"><p class="text-[10px] text-slate-500 uppercase font-bold">Racha</p><p class="text-xl font-extrabold text-orange-700">' + s.current + 'd 🔥</p></div>' +
      '<div class="bg-white/70 backdrop-blur border border-amber-100 rounded-xl p-3"><p class="text-[10px] text-slate-500 uppercase font-bold">Logros</p><p class="text-xl font-extrabold text-amber-700">' + (gamLoad("ach", []).length) + '/' + ACHIEVEMENTS.length + "</p></div>" +
      "</div>" +
      '<div class="mt-4 flex flex-wrap gap-2">' +
      (totalPending > 0 ? '<button data-brief="alertas" class="text-xs font-bold text-white bg-gradient-to-r from-rose-500 to-pink-600 hover:shadow-lg px-3 py-1.5 rounded-lg transition-all">🔔 Ver mis alertas</button>' : "") +
      (Number(pulseCount) > 0 ? '<button data-brief="secop" class="text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-blue-700 hover:shadow-lg px-3 py-1.5 rounded-lg transition-all">🚀 Ver procesos abiertos</button>' : "") +
      '<button id="briefClose" class="text-xs font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 transition-colors">Cerrar</button>' +
      "</div></div></div></div>";
    const ba = banner.querySelector('[data-brief="alertas"]');
    if (ba) ba.addEventListener("click", () => showSection("alertas"));
    const bs = banner.querySelector('[data-brief="secop"]');
    if (bs) bs.addEventListener("click", () => showSection("secop"));
    const bc = $("#briefClose");
    if (bc) bc.addEventListener("click", () => banner.classList.add("hidden"));
  }

  /* =====================================================================
     MAPA DE OPORTUNIDADES · agregado por departamento (SECOP 2)
     ===================================================================== */
  const mapState = { lastRunAt: 0, data: null };

  async function renderMap() {
    const wrap = $("#mapWidget");
    if (!wrap) return;
    if (Date.now() - mapState.lastRunAt < 300000 && mapState.data) {
      paintMap(mapState.data);
      return;
    }
    wrap.classList.remove("hidden");
    wrap.innerHTML =
      '<div class="bg-white rounded-3xl border border-slate-200 p-5 lg:p-6">' +
      '<div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-md shadow-blue-200"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg></div>' +
      '<div><p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mapa de oportunidades</p><h3 class="text-base font-bold text-slate-900">Procesos abiertos por departamento</h3></div></div>' +
      '<p class="text-sm text-slate-500 mt-3">Consultando datos en vivo…</p></div>';
    try {
      const data = await SECOP.aggregate("procesos", {
        groupBy: "departamento",
        filters: { estado: "Presentación de oferta" },
        limit: 50,
      });
      mapState.data = data;
      mapState.lastRunAt = Date.now();
      paintMap(data);
    } catch (e) {
      wrap.innerHTML =
        '<div class="bg-white rounded-3xl border border-slate-200 p-5 text-sm text-slate-500">No se pudo cargar el mapa: ' +
        escapeHtml(e.message || String(e)) + "</div>";
    }
  }

  function paintMap(rows) {
    const valid = rows.filter((r) => r.grupo && r.grupo !== "—" && r.total > 0);
    const max = Math.max(1, ...valid.map((r) => r.total));
    const totalProcesos = valid.reduce((s, r) => s + r.total, 0);
    const totalValor = valid.reduce((s, r) => s + r.valor, 0);
    const top = valid.slice(0, 3);

    const cells = SECOP.DEPARTAMENTOS.map((dep) => {
      const r = valid.find((x) => x.grupo.toUpperCase().includes(dep.toUpperCase()) ||
                                  dep.toUpperCase().includes(x.grupo.toUpperCase()));
      const t = r ? r.total : 0;
      const v = r ? r.valor : 0;
      const intensity = Math.round((t / max) * 100);
      const tone = t === 0 ? "slate" : intensity > 66 ? "rose" : intensity > 33 ? "amber" : "sky";
      return (
        '<button class="dep-cell text-' + tone + '-700" data-dep="' + escapeHtml(dep) + '" ' + (t === 0 ? "disabled" : "") + '>' +
        '<div class="fill" style="height:' + intensity + '%"></div>' +
        '<div class="relative">' +
        '<p class="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">' + escapeHtml(dep) + "</p>" +
        '<p class="text-lg font-extrabold ' + (t === 0 ? "text-slate-300" : "text-slate-900") + ' leading-none mt-0.5">' + t + "</p>" +
        "</div></button>"
      );
    }).join("");

    $("#mapWidget").innerHTML =
      '<div class="bg-white rounded-3xl border border-slate-200 p-5 lg:p-6">' +
      '<div class="flex items-start justify-between gap-4 flex-wrap">' +
      '<div class="flex items-center gap-3">' +
      '<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-md shadow-blue-200"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg></div>' +
      '<div><p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mapa de oportunidades · SECOP 2</p>' +
      '<h3 class="text-base font-bold text-slate-900">' + totalProcesos.toLocaleString("es-CO") + " procesos abiertos hoy · " + formatCOP(Math.round(totalValor)) + "</h3></div></div>" +
      '<div class="flex gap-2 flex-wrap">' +
      top.map((t, i) => {
        const labels = ["🥇", "🥈", "🥉"];
        return '<div class="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-3 py-2"><p class="text-[10px] font-bold uppercase tracking-wider text-amber-700">' + labels[i] + " " + escapeHtml(t.grupo.slice(0, 18)) + '</p><p class="text-sm font-extrabold text-amber-900">' + t.total + ' <span class="text-[10px] font-medium text-amber-600">procesos</span></p></div>';
      }).join("") +
      "</div></div>" +
      '<div class="mt-5 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">' + cells + "</div>" +
      '<p class="text-[11px] text-slate-400 mt-3">Click en un departamento para filtrar la búsqueda SECOP · Color = densidad de procesos.</p>' +
      "</div>";

    $$("#mapWidget [data-dep]").forEach((b) =>
      b.addEventListener("click", () => {
        showSection("secop");
        setTimeout(() => {
          initSecopOnce();
          if (secopState.dataset !== "procesos") switchDataset("procesos");
          $("#sec-departamento").value = b.dataset.dep;
          $("#sec-estado").value = "Presentación de oferta";
          $("#sec-filters").classList.remove("hidden");
          runSecopSearch(true);
        }, 100);
      })
    );
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
