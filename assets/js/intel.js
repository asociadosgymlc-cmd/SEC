/* LICITA · Capa de inteligencia de mercado
 * Tres herramientas que comparten infraestructura sobre SECOP:
 *
 *   1) Alertas inteligentes — búsquedas guardadas que avisan cuántos
 *      procesos nuevos hay desde la última revisión.
 *   2) Calculadora de oferta — sugiere un precio competitivo a partir de
 *      adjudicaciones históricas similares en SECOP 1.
 *   3) Pulso del mercado — feed en vivo de procesos abiertos hoy.
 */
window.LICITA = window.LICITA || {};

LICITA.intel = (function () {
  "use strict";
  const SECOP = LICITA.secop;
  const MAX_ALERTS = 10;

  /* ---------------------- Alertas inteligentes ---------------------- */
  function alertsKey(username) { return "licita.alerts." + username; }

  function listAlerts(username) {
    try {
      const raw = localStorage.getItem(alertsKey(username));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function persistAlerts(username, alerts) {
    try { localStorage.setItem(alertsKey(username), JSON.stringify(alerts)); }
    catch (e) {}
  }
  function newId() { return "al_" + Math.random().toString(36).slice(2, 10); }

  function createAlert(username, data) {
    const alerts = listAlerts(username);
    if (alerts.length >= MAX_ALERTS)
      throw new Error("Máximo " + MAX_ALERTS + " alertas. Elimina alguna antes de crear otra.");
    const name = String(data.name || data.texto || "Alerta").trim().slice(0, 60);
    if (!name) throw new Error("La alerta necesita un nombre.");
    const al = {
      id: newId(),
      name,
      dataset: data.dataset === "contratos" || data.dataset === "paa" ? data.dataset : "procesos",
      filters: {
        texto: String(data.texto || "").trim(),
        entidad: String(data.entidad || "").trim(),
        departamento: String(data.departamento || "").trim(),
        modalidad: String(data.modalidad || "").trim(),
        tipoContrato: String(data.tipoContrato || "").trim(),
      },
      createdAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      pending: 0,
    };
    alerts.unshift(al);
    persistAlerts(username, alerts);
    return al;
  }
  function deleteAlert(username, id) {
    persistAlerts(username, listAlerts(username).filter((a) => a.id !== id));
  }
  function markChecked(username, id) {
    const list = listAlerts(username);
    const a = list.find((x) => x.id === id);
    if (a) {
      a.lastCheckedAt = new Date().toISOString();
      a.pending = 0;
      persistAlerts(username, list);
    }
  }
  async function checkAlert(al) {
    const since = (al.lastCheckedAt || al.createdAt).slice(0, 10);
    const filters = Object.assign({}, al.filters, {
      fechaDesde: since,
      limite: 50,
      orden: al.dataset === "contratos"
        ? "fecha_de_firma_del_contrato DESC"
        : (al.dataset === "paa"
            ? "fecha_estimada_de_inicio ASC"
            : "fecha_de_publicacion_del DESC"),
    });
    try {
      const items = await SECOP.search(al.dataset, filters);
      return { ok: true, items, count: items.length };
    } catch (e) {
      return { ok: false, items: [], count: 0, error: e.message };
    }
  }
  async function refreshAllAlerts(username) {
    const list = listAlerts(username);
    const out = [];
    for (const a of list) {
      const r = await checkAlert(a);
      a.pending = r.count;
      out.push({ alert: a, items: r.items, error: r.error });
    }
    persistAlerts(username, list);
    return out;
  }

  /* ---------------------- Calculadora de oferta ---------------------- */
  async function suggestPrice(opts) {
    const palabras = String(opts.texto || "")
      .split(/\s+/).filter((w) => w.length > 4).slice(0, 3).join(" ");
    const filters = {
      texto: palabras,
      departamento: opts.departamento || "",
      tipoContrato: opts.tipoContrato || "",
      limite: 100,
      orden: "fecha_de_firma_del_contrato DESC",
    };
    if (!palabras && !opts.departamento && !opts.tipoContrato)
      throw new Error("Indica al menos algún criterio (objeto, departamento o tipo).");
    const data = await SECOP.search("contratos", filters);
    const valores = data
      .map((p) => SECOP.normalize("contratos", p).valor)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    if (!valores.length)
      return { ok: false, count: 0, reason: "Sin adjudicaciones históricas con esos criterios." };
    const n = valores.length;
    const pct = (k) => valores[Math.min(n - 1, Math.floor(n * k))];
    const mean = valores.reduce((a, b) => a + b, 0) / n;
    return {
      ok: true,
      count: n,
      min: valores[0],
      max: valores[n - 1],
      mean,
      median: pct(0.5),
      p25: pct(0.25),
      p75: pct(0.75),
    };
  }

  /* ---------------------- Pulso del mercado ---------------------- */
  async function pulse(texto) {
    const filters = {
      estado: "Presentación de oferta",
      texto: String(texto || "").trim(),
      limite: 10,
      orden: "fecha_de_publicacion_del DESC",
    };
    try {
      const items = await SECOP.search("procesos", filters);
      return { ok: true, items };
    } catch (e) {
      return { ok: false, items: [], error: e.message };
    }
  }

  return {
    MAX_ALERTS,
    listAlerts, createAlert, deleteAlert, markChecked, checkAlert, refreshAllAlerts,
    suggestPrice, pulse,
  };
})();
