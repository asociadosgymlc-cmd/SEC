/* LICITA · Cliente Socrata para SECOP 1 y SECOP 2
 *
 * Conecta en vivo con el portal de datos abiertos del Gobierno
 * (datos.gov.co). No requiere autenticación ni captcha.
 *
 *   PROCESOS  · SECOP 2 (procesos vigentes) → p6dx-8zbt
 *   CONTRATOS · SECOP 1 (contratos históricos / quién ganó) → rpmr-utcd
 */
window.LICITA = window.LICITA || {};

LICITA.secop = (function () {
  "use strict";

  const BASE = "https://www.datos.gov.co/resource/";

  /* Mapeo de campos por dataset. Permite usar una sola UI para ambos. */
  const DATASETS = {
    procesos: {
      key: "procesos",
      label: "Procesos · SECOP 2",
      sub: "Procesos de contratación vigentes",
      endpoint: BASE + "p6dx-8zbt.json",
      f: {
        id: "id_del_proceso",
        objeto: "descripci_n_del_procedimiento",
        nombre: "nombre_del_procedimiento",
        entidad: "entidad",
        nitEntidad: "nit_entidad",
        departamento: "departamento_entidad",
        ciudad: "ciudad_de_la_unidad_de",
        modalidad: "modalidad_de_contratacion",
        tipoContrato: "tipo_de_contrato",
        estado: "estado_resumen",
        valor: "precio_base",
        valorAdjudicado: "valor_total_adjudicacion",
        proveedor: "nombre_del_proveedor",
        nitProveedor: "nit_del_proveedor_adjudicado",
        fecha: "fecha_de_publicacion_del",
        url: "urlproceso",
        duracion: "duracion",
        unidadDuracion: "unidad_de_duracion",
      },
      ordenDefault: "fecha_de_publicacion_del DESC",
      ordenOptions: [
        { v: "fecha_de_publicacion_del DESC", t: "Más recientes" },
        { v: "fecha_de_publicacion_del ASC", t: "Más antiguos" },
        { v: "precio_base DESC", t: "Mayor precio" },
        { v: "precio_base ASC", t: "Menor precio" },
      ],
      estados: [
        "Presentación de oferta", "Adjudicado", "Celebrado", "Liquidado",
        "Seleccionado", "Borrador", "Descartado", "Terminado Anormalmente",
      ],
      modalidades: [
        "Mínima cuantía", "Selección abreviada", "Licitación Pública",
        "Concurso de méritos abierto", "Contratación directa", "Régimen Especial",
      ],
    },

    paa: {
      key: "paa",
      label: "Procesos en planeación · SECOP 2",
      sub: "Procesos en estado Borrador, próximos a abrir",
      endpoint: BASE + "p6dx-8zbt.json",
      f: {
        id: "id_del_proceso",
        objeto: "descripci_n_del_procedimiento",
        nombre: "nombre_del_procedimiento",
        entidad: "entidad",
        nitEntidad: "nit_entidad",
        departamento: "departamento_entidad",
        ciudad: "ciudad_de_la_unidad_de",
        modalidad: "modalidad_de_contratacion",
        tipoContrato: "tipo_de_contrato",
        estado: "estado_resumen",
        valor: "precio_base",
        valorAdjudicado: "valor_total_adjudicacion",
        proveedor: "nombre_del_proveedor",
        nitProveedor: "nit_del_proveedor_adjudicado",
        fecha: "fecha_de_publicacion_del",
        url: "urlproceso",
        duracion: "duracion",
        unidadDuracion: "unidad_de_duracion",
      },
      ordenDefault: "fecha_de_publicacion_del DESC",
      ordenOptions: [
        { v: "fecha_de_publicacion_del DESC", t: "Más recientes" },
        { v: "fecha_de_publicacion_del ASC", t: "Más antiguos" },
        { v: "precio_base DESC", t: "Mayor presupuesto" },
        { v: "precio_base ASC", t: "Menor presupuesto" },
      ],
      estados: ["Borrador", "Presentación de oferta", "Convocado"],
      modalidades: [
        "Mínima cuantía", "Selección abreviada", "Licitación Pública",
        "Concurso de méritos abierto", "Contratación directa", "Régimen Especial",
      ],
    },

    contratos: {
      key: "contratos",
      label: "Contratos · SECOP 1",
      sub: "Histórico — quién ganó, cuánto y cuándo",
      endpoint: BASE + "rpmr-utcd.json",
      f: {
        id: "uid",
        objeto: "objeto_del_contrato_a_la",
        nombre: "objeto_del_proceso_a_contratar",
        entidad: "nombre_de_la_entidad",
        nitEntidad: "nit_de_la_entidad",
        departamento: "departamento",
        ciudad: "municipio_entrega",
        tipoContrato: "tipo_de_contrato",
        estado: "estado_del_proceso",
        valor: "cuantia_contrato",
        valorAdjudicado: "valor_contrato_con_adiciones",
        proveedor: "nom_raz_social_contratista",
        nitProveedor: "documento_proveedor",
        fecha: "fecha_de_firma_del_contrato",
        url: "ruta_proceso_en_secop",
      },
      ordenDefault: "fecha_de_firma_del_contrato DESC",
      ordenOptions: [
        { v: "fecha_de_firma_del_contrato DESC", t: "Más recientes" },
        { v: "fecha_de_firma_del_contrato ASC", t: "Más antiguos" },
        { v: "cuantia_contrato DESC", t: "Mayor valor" },
        { v: "cuantia_contrato ASC", t: "Menor valor" },
      ],
      estados: [],
      modalidades: [],
    },
  };

  const DEPARTAMENTOS = [
    "Amazonas","Antioquia","Arauca","Atlántico","Bogotá D.C.","Bolívar","Boyacá",
    "Caldas","Caquetá","Casanare","Cauca","Cesar","Chocó","Córdoba","Cundinamarca",
    "Guainía","Guaviare","Huila","La Guajira","Magdalena","Meta","Nariño",
    "Norte de Santander","Putumayo","Quindío","Risaralda","San Andrés y Providencia",
    "Santander","Sucre","Tolima","Valle del Cauca","Vaupés","Vichada",
  ];

  const TIPOS_CONTRATO = [
    "Prestación de servicios", "Suministro", "Obra", "Compraventa",
    "Consultoría", "Interventoría", "Arrendamiento", "Seguros",
  ];

  const SEARCH_FIELDS = {
    procesos: [
      "descripci_n_del_procedimiento",
      "nombre_del_procedimiento",
      "id_del_proceso",
      "referencia_del_proceso",
      "entidad",
      "departamento_entidad",
      "ciudad_de_la_unidad_de",
    ],
    contratos: [
      "objeto_del_contrato_a_la",
      "objeto_del_proceso_a_contratar",
      "nombre_de_la_entidad",
      "nom_raz_social_contratista",
      "departamento",
      "municipio_entrega",
      "numero_de_proceso",
      "numero_del_contrato",
    ],
    paa: [
      "descripci_n_del_procedimiento",
      "nombre_del_procedimiento",
      "id_del_proceso",
      "referencia_del_proceso",
      "entidad",
      "departamento_entidad",
      "ciudad_de_la_unidad_de",
    ],
  };

  function esc(value) { return String(value).replace(/'/g, "''"); }

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

  function buildWhere(dsKey, filters) {
    const ds = DATASETS[dsKey];
    if (!ds) throw new Error("Dataset desconocido: " + dsKey);
    const f = ds.f;
    const c = [];

    if (filters.texto) {
      const variants = accentVariants(filters.texto);
      const base = SEARCH_FIELDS[dsKey] || [f.objeto].filter(Boolean);
      const fields = base.filter(Boolean);
      if (!fields.length && f.objeto) fields.push(f.objeto);
      if (fields.length) {
        const ors = [];
        fields.forEach((fld) => {
          variants.forEach((v) => {
            ors.push("upper(" + fld + ") like '%" + esc(v) + "%'");
          });
        });
        c.push("(" + ors.join(" OR ") + ")");
      }
    }
    if (filters.entidad && f.entidad) c.push(likeAny(f.entidad, filters.entidad));
    if (filters.departamento && f.departamento) c.push(likeAny(f.departamento, filters.departamento));
    if (filters.ciudad && f.ciudad) c.push(likeAny(f.ciudad, filters.ciudad));
    if (filters.modalidad && f.modalidad) c.push(likeAny(f.modalidad, filters.modalidad));
    if (filters.tipoContrato && f.tipoContrato) c.push(likeAny(f.tipoContrato, filters.tipoContrato));
    if (filters.estado && f.estado) c.push(f.estado + "='" + esc(filters.estado) + "'");
    if (filters.proveedor && f.proveedor) c.push(likeAny(f.proveedor, filters.proveedor));
    if (filters.precioMin != null && filters.precioMin !== "" && f.valor)
      c.push(f.valor + " >= '" + Number(filters.precioMin) + "'");
    if (filters.precioMax != null && filters.precioMax !== "" && f.valor)
      c.push(f.valor + " <= '" + Number(filters.precioMax) + "'");
    if (filters.fechaDesde && f.fecha)
      c.push(f.fecha + " >= '" + filters.fechaDesde + "T00:00:00.000'");
    if (filters.fechaHasta && f.fecha)
      c.push(f.fecha + " <= '" + filters.fechaHasta + "T23:59:59.000'");
    // Filtro por AÑO (estilo PAA SECOP oficial): genera rango anual sobre fecha.
    if (filters.anio && /^\d{4}$/.test(String(filters.anio)) && f.fecha) {
      const y = String(filters.anio);
      c.push(f.fecha + " >= '" + y + "-01-01T00:00:00.000'");
      c.push(f.fecha + " <= '" + y + "-12-31T23:59:59.000'");
    }
    const expr = c.join(" AND ");
    return expr.includes("undefined") ? "" : expr;
  }

  const FETCH_TIMEOUT_MS = 15000;

  async function fetchSoda(endpoint, params) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let r;
    try {
      r = await fetch(endpoint + "?" + params.toString(), {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(t);
      if (e && e.name === "AbortError") {
        throw new Error(
          "SECOP no respondió en " + (FETCH_TIMEOUT_MS / 1000) + "s. " +
          "Reintenta con un filtro más específico (año, departamento o NIT)."
        );
      }
      throw e;
    }
    clearTimeout(t);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(
        "API respondió " + r.status + " · " + (txt.slice(0, 200) || r.statusText)
      );
    }
    return r.json();
  }

  async function search(dsKey, filters) {
    const ds = DATASETS[dsKey];
    const params = new URLSearchParams();
    params.set("$limit", String(filters.limite || 25));
    params.set("$offset", String(filters.offset || 0));
    params.set("$order", filters.orden || ds.ordenDefault);
    const w = buildWhere(dsKey, filters);
    if (w) params.set("$where", w);
    return fetchSoda(ds.endpoint, params);
  }

  async function aggregate(dsKey, opts) {
    const ds = DATASETS[dsKey];
    const f = ds.f;
    const groupField = opts.groupBy === "departamento" ? f.departamento : f.entidad;
    const valueField = f.valor || "1";
    const params = new URLSearchParams();
    params.set("$select", groupField + " AS grupo, count(*) AS total, sum(" + valueField + ") AS valor");
    params.set("$group", groupField);
    params.set("$order", "total DESC");
    params.set("$limit", String(opts.limit || 50));
    const w = buildWhere(dsKey, opts.filters || {});
    if (w) params.set("$where", w);
    const data = await fetchSoda(ds.endpoint, params);
    return data.map((r) => ({
      grupo: (r.grupo || "—").toString().trim(),
      total: parseInt(r.total || "0", 10),
      valor: Number(r.valor || 0),
    }));
  }

  async function count(dsKey, filters) {
    const ds = DATASETS[dsKey];
    const params = new URLSearchParams();
    params.set("$select", "count(*)");
    const w = buildWhere(dsKey, filters);
    if (w) params.set("$where", w);
    const j = await fetchSoda(ds.endpoint, params);
    return parseInt((j[0] || {}).count || "0", 10);
  }

  function normalize(dsKey, p) {
    const f = DATASETS[dsKey].f;
    const url = (() => {
      if (!f.url) return null;
      const raw = p[f.url];
      if (!raw) return null;
      if (typeof raw === "string" && /^https?:\/\//i.test(raw)) return raw;
      if (typeof raw === "object" && raw.url && /^https?:\/\//i.test(raw.url)) return raw.url;
      return null;
    })();
    return {
      dataset: dsKey,
      id: p[f.id] || "",
      entidad: p[f.entidad] || "",
      nitEntidad: p[f.nitEntidad] || "",
      objeto: p[f.objeto] || p[f.nombre] || "",
      nombre: p[f.nombre] || "",
      departamento: p[f.departamento] || "",
      ciudad: p[f.ciudad] || "",
      modalidad: p[f.modalidad] || "",
      tipoContrato: p[f.tipoContrato] || "",
      estado: p[f.estado] || "",
      valor: Number(p[f.valor] || 0),
      valorAdjudicado: Number(p[f.valorAdjudicado] || 0),
      proveedor: p[f.proveedor] || "",
      nitProveedor: p[f.nitProveedor] || "",
      fecha: p[f.fecha] || "",
      duracion: p[f.duracion] || "",
      unidadDuracion: p[f.unidadDuracion] || "",
      url,
      raw: p,
    };
  }

  const PAA_CANDIDATES = [
    { id: "xvdy-vrsj", name: "Plan Anual de Adquisiciones" },
    { id: "4dyc-vyat", name: "PAA - Entidades estatales" },
    { id: "ce4n-8usk", name: "Plan Anual de Adquisiciones SECOP" },
    { id: "rqbr-4uy5", name: "PAA Colombia Compra Eficiente" },
    { id: "8mhx-tkpd", name: "Plan Anual de Adquisiciones - PAA" },
    { id: "crbs-icmf", name: "PAA (legado)" },
  ];

  async function discoverPaaDataset() {
    const probes = PAA_CANDIDATES.map((c) => {
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

  async function probeDataset(dsKey) {
    const ds = DATASETS[dsKey];
    if (!ds) return { ok: false, error: "Dataset desconocido" };
    try {
      const r = await fetch(ds.endpoint + "?$limit=1", {
        headers: { Accept: "application/json" },
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return { ok: false, status: r.status, error: (txt.slice(0, 200) || r.statusText) };
      }
      const data = await r.json();
      const sample = data && data[0] ? data[0] : null;
      return { ok: true, sample, keys: sample ? Object.keys(sample) : [] };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function detectFields(keys) {
    const lower = keys.map((k) => k.toLowerCase());
    const find = (candidates) => {
      for (const c of candidates) {
        const i = lower.indexOf(c.toLowerCase());
        if (i >= 0) return keys[i];
      }
      return null;
    };
    return {
      id: find(["uid", "id_de_paa", "id_paa", "id_del_proceso", "id", "codigo_proceso", "codigo_unspsc", "identificador"]),
      objeto: find([
        "descripcion", "descripci_n", "descripcion_del_proceso",
        "descripci_n_del_procedimiento", "descripcion_del_procedimiento",
        "objeto_a_contratar", "objeto", "objeto_del_proceso_a_contratar",
        "objeto_del_contrato_a_la",
      ]),
      nombre: find(["nombre_del_procedimiento", "nombre", "nombre_del_proceso", "nombre_descripcion"]),
      entidad: find(["entidad", "nombre_entidad", "nombre_de_la_entidad", "entidad_estatal", "unidad_responsable"]),
      nitEntidad: find(["nit_entidad", "nit_de_la_entidad", "nit"]),
      valor: find([
        "valor_total_estimado", "valor_estimado", "valor_estimado_en_la",
        "valor_estimado_en_la_vigencia_actual", "precio_base",
        "cuantia_contrato", "cuantia", "valor",
      ]),
      valorAdjudicado: find(["valor_total_adjudicacion", "valor_contrato_con_adiciones", "valor_adjudicado"]),
      fecha: find([
        "fecha_estimada_de_inicio_de", "fecha_estimada_de_inicio_de_proceso",
        "fecha_estimada_de_inicio", "fecha_de_publicacion_del",
        "fecha_de_firma_del_contrato", "fecha_inicio", "fecha",
      ]),
      modalidad: find([
        "modalidad_de_contratacion", "modalidad_de_contrataci_n",
        "modalidad_de_seleccion", "modalidad_de_selecci_n", "modalidad",
      ]),
      tipoContrato: find(["tipo_de_contrato", "tipo_contrato", "tipo"]),
      departamento: find([
        "departamento_entidad", "departamento",
        "ubicacion", "ubicaci_n", "ubicacion_geografica",
      ]),
      ciudad: find(["ciudad_de_la_unidad_de", "ciudad", "municipio_entrega", "municipio"]),
      estado: find(["estado_resumen", "estado_del_proceso", "estado_de_suma", "estado_contrato", "estado_de_solicitud"]),
      proveedor: find(["nombre_del_proveedor", "nom_raz_social_contratista", "contratista"]),
      nitProveedor: find(["nit_del_proveedor_adjudicado", "documento_proveedor", "documento_contratista"]),
      duracion: find([
        "duracion_estimada_del", "duracion_estimada_del_contrato",
        "duracion_estimada", "duracion",
      ]),
      unidadDuracion: find([
        "unidad_de_duracion_estimada", "unidad_de_duraci_n_estimada",
        "unidad_de_duracion", "unidad_duracion",
      ]),
      url: find(["urlproceso", "url_proceso", "ruta_proceso_en_secop", "url"]),
    };
  }

  function setDatasetFields(dsKey, fields) {
    const ds = DATASETS[dsKey];
    if (!ds) return;
    ds.f = Object.assign({}, ds.f, fields);
  }

  function setDatasetEndpoint(dsKey, endpoint) {
    const ds = DATASETS[dsKey];
    if (!ds) return;
    ds.endpoint = endpoint;
  }

  return {
    DATASETS, DEPARTAMENTOS, TIPOS_CONTRATO, PAA_CANDIDATES,
    search, count, aggregate, normalize, buildWhere,
    probeDataset, discoverPaaDataset, detectFields, setDatasetFields, setDatasetEndpoint,
  };
})();
