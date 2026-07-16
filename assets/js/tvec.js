/* LICITA · Tienda Virtual del Estado Colombiano (TVEC)
 *
 * Cliente para el ecosistema de compra pública transaccional de
 * Colombia Compra Eficiente: Acuerdos Marco de Precios, Grandes
 * Superficies, Mínima Cuantía en línea (Compra Ágil) y Bolsa de
 * Productos.
 *
 * FUENTE: datos.gov.co (Socrata). Solo datos públicos. Sin login.
 *
 * Los IDs de dataset en Socrata pueden cambiar. Este módulo usa el
 * mismo patrón de discovery del PAA: prueba varios candidatos en
 * paralelo y usa el primero que responde con datos reales.
 *
 * FUNCIONALIDAD:
 *   1. Discovery automático de datasets vivos
 *   2. Buscar órdenes de compra (por entidad, proveedor, AMP, valor)
 *   3. Ranking de proveedores por Acuerdo Marco → quién domina
 *   4. Análisis de proveedor → cuánto vende y a quién
 *   5. Análisis de entidad → cuánto compra por AMP y a qué proveedor
 *   6. Precios de referencia → media, min, max por descripción
 *   7. Instrumentos vigentes → catálogo de AMP activos con URL
 *
 * AVISO: Los datos vienen de datos.gov.co con la periodicidad que
 * publique CCE. Verificar precios y disponibilidad en la Tienda
 * Virtual antes de citar.
 */
window.LICITA = window.LICITA || {};

LICITA.tvec = (function () {
  "use strict";

  const BASE = "https://www.datos.gov.co/resource/";
  const TVEC_HOME = "https://www.colombiacompra.gov.co/tienda-virtual-del-estado-colombiano";

  const ORDENES_CANDIDATES = [
    { id: "rgxm-mmea", name: "Órdenes de compra Tienda Virtual" },
    { id: "nyx8-2bpq", name: "TVEC · Órdenes emitidas" },
    { id: "q7ka-ig4k", name: "Órdenes de compra AMP" },
    { id: "4rgt-y6cc", name: "Tienda Virtual · Compras" },
    { id: "8rmp-c7mv", name: "Órdenes CCE" },
  ];

  const AMP_CANDIDATES = [
    { id: "3fkp-6pfp", name: "Acuerdos Marco vigentes" },
    { id: "aiw4-hg5r", name: "Instrumentos de agregación" },
  ];

  const INSTRUMENTOS_CONOCIDOS = [
    { key: "combustibles",   label: "Combustibles",                    url: TVEC_HOME + "/instrumentos-agregacion-demanda/combustibles" },
    { key: "papeleria",      label: "Papelería y útiles",              url: TVEC_HOME + "/instrumentos-agregacion-demanda/papeleria" },
    { key: "aseo",           label: "Aseo y cafetería",                url: TVEC_HOME + "/instrumentos-agregacion-demanda/aseo-y-cafeteria" },
    { key: "nube",           label: "Nube pública",                    url: TVEC_HOME + "/instrumentos-agregacion-demanda/nube-publica" },
    { key: "vehiculos",      label: "Vehículos",                       url: TVEC_HOME + "/instrumentos-agregacion-demanda/vehiculos" },
    { key: "soat",           label: "SOAT",                            url: TVEC_HOME + "/instrumentos-agregacion-demanda/soat" },
    { key: "tics",           label: "Tecnología (Microsoft, Oracle)",  url: TVEC_HOME + "/instrumentos-agregacion-demanda/tics" },
    { key: "conectividad",   label: "Conectividad",                    url: TVEC_HOME + "/instrumentos-agregacion-demanda/conectividad" },
    { key: "seguros",        label: "Seguros generales",               url: TVEC_HOME + "/instrumentos-agregacion-demanda/seguros" },
    { key: "combustible-aviacion", label: "Combustible de aviación",   url: TVEC_HOME + "/instrumentos-agregacion-demanda/combustible-de-aviacion" },
    { key: "servicios-financieros", label: "Servicios financieros",   url: TVEC_HOME + "/instrumentos-agregacion-demanda/servicios-financieros" },
    { key: "grandes-superficies", label: "Grandes superficies (compra ágil)", url: TVEC_HOME + "/tienda-virtual/grandes-superficies" },
  ];

  const state = {
    ordenesEndpoint: null,
    ordenesFields: null,
    ampEndpoint: null,
    ready: false,
    probeError: null,
  };

  function esc(v) { return String(v).replace(/'/g, "''"); }

  function accentVariants(s) {
    const upper = String(s).toUpperCase();
    const noAcc = upper
      .replace(/[ÁÀÄÂ]/g, "A").replace(/[ÉÈËÊ]/g, "E")
      .replace(/[ÍÌÏÎ]/g, "I").replace(/[ÓÒÖÔ]/g, "O")
      .replace(/[ÚÙÜÛ]/g, "U").replace(/Ñ/g, "N");
    return upper === noAcc ? [upper] : [upper, noAcc];
  }

  function likeAny(field, value) {
    return "(" + accentVariants(value)
      .map((v) => "upper(" + field + ") like '%" + esc(v) + "%'")
      .join(" OR ") + ")";
  }

  async function fetchSoda(endpoint, params) {
    const r = await fetch(endpoint + "?" + params.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error("TVEC API " + r.status + ": " + (txt.slice(0, 200) || r.statusText));
    }
    return r.json();
  }

  function detectFieldsOrdenes(keys) {
    const lower = keys.map((k) => k.toLowerCase());
    const find = (candidates) => {
      for (const c of candidates) {
        const i = lower.indexOf(c.toLowerCase());
        if (i >= 0) return keys[i];
      }
      return null;
    };
    return {
      id: find(["orden_de_compra", "numero_orden_de_compra", "orden", "numero_orden", "id"]),
      entidad: find(["entidad", "nombre_entidad", "entidad_compradora", "nombre_de_la_entidad"]),
      nitEntidad: find(["nit_entidad", "nit_de_la_entidad", "nit_entidad_compradora"]),
      proveedor: find(["proveedor", "nombre_proveedor", "razon_social_proveedor", "nom_raz_social_contratista"]),
      nitProveedor: find(["nit_proveedor", "documento_proveedor", "nit"]),
      instrumento: find(["instrumento_agregacion", "acuerdo_marco", "amp", "instrumento", "tipo_instrumento"]),
      objeto: find(["objeto", "descripcion", "concepto"]),
      valor: find(["valor_total", "valor", "valor_total_orden", "monto", "cuantia"]),
      fecha: find(["fecha_orden", "fecha_de_orden", "fecha", "fecha_emision"]),
      estado: find(["estado", "estado_orden"]),
      departamento: find(["departamento", "departamento_entidad"]),
      ciudad: find(["ciudad", "municipio"]),
      url: find(["url_orden", "urlorden", "enlace", "url"]),
    };
  }

  async function discoverOrdenesDataset() {
    const probes = ORDENES_CANDIDATES.map((c) => {
      const url = BASE + c.id + ".json";
      return fetch(url + "?$limit=1", { headers: { Accept: "application/json" } })
        .then(async (r) => {
          if (!r.ok) return { ok: false, id: c.id };
          const data = await r.json().catch(() => null);
          if (data && data.length > 0) {
            return { ok: true, id: c.id, name: c.name, url, sample: data[0], keys: Object.keys(data[0]) };
          }
          return { ok: false, id: c.id, empty: true };
        })
        .catch(() => ({ ok: false, id: c.id, error: true }));
    });
    const results = await Promise.all(probes);
    const winner = results.find((r) => r.ok);
    return { winner, results };
  }

  async function prepareOrdenesSource() {
    if (state.ready) return { mode: "ready", endpoint: state.ordenesEndpoint };
    const { winner, results } = await discoverOrdenesDataset();
    if (winner) {
      state.ordenesEndpoint = winner.url;
      state.ordenesFields = detectFieldsOrdenes(winner.keys);
      state.ready = true;
      return { mode: "live", winner, fields: state.ordenesFields };
    }
    state.probeError = "Ningún dataset TVEC conocido respondió. Candidatos probados: " +
      results.map((r) => r.id).join(", ");
    return { mode: "fallback", error: state.probeError };
  }

  function buildWhere(filters) {
    const f = state.ordenesFields;
    if (!f) return "";
    const c = [];
    if (filters.entidad && f.entidad) c.push(likeAny(f.entidad, filters.entidad));
    if (filters.proveedor && f.proveedor) c.push(likeAny(f.proveedor, filters.proveedor));
    if (filters.nitProveedor && f.nitProveedor) c.push(f.nitProveedor + "='" + esc(filters.nitProveedor) + "'");
    if (filters.instrumento && f.instrumento) c.push(likeAny(f.instrumento, filters.instrumento));
    if (filters.objeto && f.objeto) c.push(likeAny(f.objeto, filters.objeto));
    if (filters.departamento && f.departamento) c.push(likeAny(f.departamento, filters.departamento));
    if (filters.estado && f.estado) c.push(f.estado + "='" + esc(filters.estado) + "'");
    if (filters.valorMin != null && filters.valorMin !== "" && f.valor)
      c.push(f.valor + " >= '" + Number(filters.valorMin) + "'");
    if (filters.valorMax != null && filters.valorMax !== "" && f.valor)
      c.push(f.valor + " <= '" + Number(filters.valorMax) + "'");
    if (filters.anio && /^\d{4}$/.test(String(filters.anio)) && f.fecha) {
      const y = String(filters.anio);
      c.push(f.fecha + " >= '" + y + "-01-01T00:00:00.000'");
      c.push(f.fecha + " <= '" + y + "-12-31T23:59:59.000'");
    }
    const expr = c.join(" AND ");
    return expr.includes("undefined") ? "" : expr;
  }

  function normalize(raw) {
    const f = state.ordenesFields || {};
    return {
      id: raw[f.id] || "",
      entidad: raw[f.entidad] || "",
      nitEntidad: raw[f.nitEntidad] || "",
      proveedor: raw[f.proveedor] || "",
      nitProveedor: raw[f.nitProveedor] || "",
      instrumento: raw[f.instrumento] || "",
      objeto: raw[f.objeto] || "",
      valor: Number(raw[f.valor] || 0),
      fecha: raw[f.fecha] || "",
      estado: raw[f.estado] || "",
      departamento: raw[f.departamento] || "",
      ciudad: raw[f.ciudad] || "",
      url: raw[f.url] || "",
      raw,
    };
  }

  async function buscarOrdenes(filters) {
    filters = filters || {};
    await prepareOrdenesSource();
    if (!state.ready) throw new Error(state.probeError || "TVEC no disponible");
    const f = state.ordenesFields;
    const params = new URLSearchParams();
    params.set("$limit", String(filters.limite || 25));
    params.set("$offset", String(filters.offset || 0));
    const orderField = filters.orden || (f.fecha ? f.fecha + " DESC" : (f.valor ? f.valor + " DESC" : "$id"));
    params.set("$order", orderField);
    const w = buildWhere(filters);
    if (w) params.set("$where", w);
    return fetchSoda(state.ordenesEndpoint, params);
  }

  async function topProveedoresPorAMP(instrumentoAgregacion, opts) {
    await prepareOrdenesSource();
    if (!state.ready) throw new Error(state.probeError || "TVEC no disponible");
    const filters = { instrumento: instrumentoAgregacion, limite: 1000 };
    if (opts && opts.anio) filters.anio = opts.anio;
    const raw = await buscarOrdenes(filters);
    if (!raw.length) return { encontrados: 0 };

    const porProveedor = {};
    let totalValor = 0;
    raw.forEach((c) => {
      const n = normalize(c);
      const p = (n.proveedor || "SIN INFORMACIÓN").toUpperCase().trim();
      const v = Number(n.valor) || 0;
      if (v === 0) return;
      if (!porProveedor[p]) porProveedor[p] = { proveedor: p, ordenes: 0, valor: 0, nit: n.nitProveedor };
      porProveedor[p].ordenes += 1;
      porProveedor[p].valor += v;
      totalValor += v;
    });
    const ranking = Object.values(porProveedor).sort((a, b) => b.valor - a.valor);
    ranking.forEach((r) => { r.share = totalValor > 0 ? r.valor / totalValor : 0; });
    return {
      encontrados: raw.length,
      instrumento: instrumentoAgregacion,
      totalOrdenes: raw.length, totalValor,
      totalProveedores: ranking.length,
      ranking: ranking.slice(0, 20),
    };
  }

  async function analizarProveedorTVEC(nombreOnit, opts) {
    await prepareOrdenesSource();
    if (!state.ready) throw new Error(state.probeError || "TVEC no disponible");
    const filters = { limite: 1000 };
    if (/^\d{8,}/.test(String(nombreOnit))) filters.nitProveedor = nombreOnit;
    else filters.proveedor = nombreOnit;
    if (opts && opts.anio) filters.anio = opts.anio;
    const raw = await buscarOrdenes(filters);
    if (!raw.length) return { encontrados: 0, target: nombreOnit };

    const porEntidad = {}, porInstrumento = {};
    let totalValor = 0;
    raw.forEach((c) => {
      const n = normalize(c);
      const e = (n.entidad || "—").toUpperCase().trim();
      const inst = (n.instrumento || "—").trim();
      const v = Number(n.valor) || 0;
      if (!porEntidad[e]) porEntidad[e] = { entidad: e, ordenes: 0, valor: 0 };
      porEntidad[e].ordenes += 1;
      porEntidad[e].valor += v;
      if (!porInstrumento[inst]) porInstrumento[inst] = { instrumento: inst, ordenes: 0, valor: 0 };
      porInstrumento[inst].ordenes += 1;
      porInstrumento[inst].valor += v;
      totalValor += v;
    });
    const rankingEntidades = Object.values(porEntidad).sort((a, b) => b.valor - a.valor);
    const rankingInstrumentos = Object.values(porInstrumento).sort((a, b) => b.valor - a.valor);
    rankingEntidades.forEach((r) => { r.share = totalValor > 0 ? r.valor / totalValor : 0; });
    rankingInstrumentos.forEach((r) => { r.share = totalValor > 0 ? r.valor / totalValor : 0; });
    return {
      encontrados: raw.length,
      target: nombreOnit, totalValor, totalOrdenes: raw.length,
      totalEntidades: rankingEntidades.length,
      totalInstrumentos: rankingInstrumentos.length,
      rankingEntidades: rankingEntidades.slice(0, 15),
      rankingInstrumentos: rankingInstrumentos.slice(0, 15),
    };
  }

  async function analizarEntidadTVEC(nombreEntidad, opts) {
    await prepareOrdenesSource();
    if (!state.ready) throw new Error(state.probeError || "TVEC no disponible");
    const filters = { entidad: nombreEntidad, limite: 1000 };
    if (opts && opts.anio) filters.anio = opts.anio;
    const raw = await buscarOrdenes(filters);
    if (!raw.length) return { encontrados: 0, entidad: nombreEntidad };

    const porInstrumento = {}, porProveedor = {};
    let totalValor = 0;
    raw.forEach((c) => {
      const n = normalize(c);
      const inst = (n.instrumento || "—").trim();
      const prov = (n.proveedor || "—").toUpperCase().trim();
      const v = Number(n.valor) || 0;
      if (!porInstrumento[inst]) porInstrumento[inst] = { instrumento: inst, ordenes: 0, valor: 0 };
      porInstrumento[inst].ordenes += 1;
      porInstrumento[inst].valor += v;
      if (!porProveedor[prov]) porProveedor[prov] = { proveedor: prov, ordenes: 0, valor: 0 };
      porProveedor[prov].ordenes += 1;
      porProveedor[prov].valor += v;
      totalValor += v;
    });
    const rankingInstrumentos = Object.values(porInstrumento).sort((a, b) => b.valor - a.valor);
    const rankingProveedores = Object.values(porProveedor).sort((a, b) => b.valor - a.valor);
    rankingInstrumentos.forEach((r) => { r.share = totalValor > 0 ? r.valor / totalValor : 0; });
    rankingProveedores.forEach((r) => { r.share = totalValor > 0 ? r.valor / totalValor : 0; });
    return {
      encontrados: raw.length,
      entidad: nombreEntidad, totalValor, totalOrdenes: raw.length,
      rankingInstrumentos: rankingInstrumentos.slice(0, 15),
      rankingProveedores: rankingProveedores.slice(0, 15),
    };
  }

  async function preciosReferencia(objetoKeywords, opts) {
    await prepareOrdenesSource();
    if (!state.ready) throw new Error(state.probeError || "TVEC no disponible");
    const filters = { objeto: objetoKeywords, limite: 1000 };
    if (opts && opts.anio) filters.anio = opts.anio;
    const raw = await buscarOrdenes(filters);
    if (!raw.length) return { encontrados: 0, objeto: objetoKeywords };
    const valores = raw.map((c) => Number(normalize(c).valor) || 0).filter((v) => v > 0).sort((a, b) => a - b);
    if (!valores.length) return { encontrados: raw.length, sinValor: true };
    const suma = valores.reduce((s, v) => s + v, 0);
    const media = suma / valores.length;
    const mediana = valores[Math.floor(valores.length / 2)];
    const min = valores[0];
    const max = valores[valores.length - 1];
    const varianza = valores.reduce((s, v) => s + Math.pow(v - media, 2), 0) / valores.length;
    const desvest = Math.sqrt(varianza);
    return {
      encontrados: raw.length,
      objeto: objetoKeywords,
      muestraConValor: valores.length,
      min, max, media, mediana, desvest,
      valorTotal: suma,
    };
  }

  function instrumentosVigentes() {
    return INSTRUMENTOS_CONOCIDOS.slice();
  }

  function urlBusquedaTVEC(termino) {
    return TVEC_HOME + "/tienda-virtual?query=" + encodeURIComponent(termino || "");
  }

  return {
    BASE, TVEC_HOME, INSTRUMENTOS_CONOCIDOS,
    state,
    discoverOrdenesDataset,
    prepareOrdenesSource,
    buscarOrdenes,
    normalize,
    topProveedoresPorAMP,
    analizarProveedorTVEC,
    analizarEntidadTVEC,
    preciosReferencia,
    instrumentosVigentes,
    urlBusquedaTVEC,
  };
})();
