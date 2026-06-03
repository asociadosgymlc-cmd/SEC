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
      label: "Plan Anual · PAA",
      sub: "Qué van a comprar las entidades este año",
      endpoint: BASE + "crbs-icmf.json",
      f: {
        id: "id_de_paa",
        objeto: "descripcion_del_proceso",
        nombre: "descripcion_del_proceso",
        entidad: "entidad",
        nitEntidad: "nit_entidad",
        departamento: "ubicaci_n",
        ciudad: "ubicaci_n",
        modalidad: "modalidad_de_contrataci_n",
        tipoContrato: "tipo_de_contrato",
        estado: "estado_de_suma",
        valor: "valor_total_estimado",
        valorAdjudicado: "valor_total_estimado",
        proveedor: "",
        nitProveedor: "",
        fecha: "fecha_estimada_de_inicio",
        url: null,
        duracion: "duracion_estimada_del",
        unidadDuracion: "unidad_de_duraci_n_estimada",
      },
      ordenDefault: "fecha_estimada_de_inicio ASC",
      ordenOptions: [
        { v: "fecha_estimada_de_inicio ASC", t: "Más próximos" },
        { v: "fecha_estimada_de_inicio DESC", t: "Más lejanos" },
        { v: "valor_total_estimado DESC", t: "Mayor valor" },
        { v: "valor_total_estimado ASC", t: "Menor valor" },
      ],
      estados: [],
      modalidades: [
        "Mínima cuantía", "Selección abreviada", "Licitación pública",
        "Concurso de méritos", "Contratación directa", "Régimen Especial",
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

  /* Campos donde el cuadro principal de texto busca con OR. Permite que el
   * usuario escriba un objeto, un número de proceso, una entidad o un lugar
   * sin tener que abrir filtros avanzados. */
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
      "descripcion_del_proceso",
      "entidad",
      "ubicaci_n",
      "modalidad_de_contrataci_n",
      "tipo_de_contrato",
    ],
  };

  function esc(value) { return String(value).replace(/'/g, "''"); }

  function buildWhere(dsKey, filters) {
    const ds = DATASETS[dsKey];
    if (!ds) throw new Error("Dataset desconocido: " + dsKey);
    const f = ds.f;
    const c = [];

    if (filters.texto) {
      const t = esc(String(filters.texto).toUpperCase());
      const fields = SEARCH_FIELDS[dsKey] || [f.objeto];
      const ors = fields.map((fld) => "upper(" + fld + ") like '%" + t + "%'");
      c.push("(" + ors.join(" OR ") + ")");
    }
    if (filters.entidad)
      c.push("upper(" + f.entidad + ") like '%" + esc(filters.entidad.toUpperCase()) + "%'");
    if (filters.departamento && f.departamento)
      c.push("upper(" + f.departamento + ") like '%" + esc(filters.departamento.toUpperCase()) + "%'");
    if (filters.ciudad && f.ciudad)
      c.push("upper(" + f.ciudad + ") like '%" + esc(filters.ciudad.toUpperCase()) + "%'");
    if (filters.modalidad && f.modalidad)
      c.push("upper(" + f.modalidad + ") like '%" + esc(filters.modalidad.toUpperCase()) + "%'");
    if (filters.tipoContrato && f.tipoContrato)
      c.push("upper(" + f.tipoContrato + ") like '%" + esc(filters.tipoContrato.toUpperCase()) + "%'");
    if (filters.estado && f.estado)
      c.push(f.estado + "='" + esc(filters.estado) + "'");
    if (filters.proveedor && f.proveedor)
      c.push("upper(" + f.proveedor + ") like '%" + esc(filters.proveedor.toUpperCase()) + "%'");
    if (filters.precioMin != null && filters.precioMin !== "" && f.valor)
      c.push(f.valor + " >= '" + Number(filters.precioMin) + "'");
    if (filters.precioMax != null && filters.precioMax !== "" && f.valor)
      c.push(f.valor + " <= '" + Number(filters.precioMax) + "'");
    if (filters.fechaDesde && f.fecha)
      c.push(f.fecha + " >= '" + filters.fechaDesde + "T00:00:00.000'");
    if (filters.fechaHasta && f.fecha)
      c.push(f.fecha + " <= '" + filters.fechaHasta + "T23:59:59.000'");
    return c.join(" AND ");
  }

  async function fetchSoda(endpoint, params) {
    const r = await fetch(endpoint + "?" + params.toString(), {
      headers: { Accept: "application/json" },
    });
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

  async function count(dsKey, filters) {
    const ds = DATASETS[dsKey];
    const params = new URLSearchParams();
    params.set("$select", "count(*)");
    const w = buildWhere(dsKey, filters);
    if (w) params.set("$where", w);
    const j = await fetchSoda(ds.endpoint, params);
    return parseInt((j[0] || {}).count || "0", 10);
  }

  /* Normaliza un registro al modelo común usado por la UI. */
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

  return {
    DATASETS, DEPARTAMENTOS, TIPOS_CONTRATO,
    search, count, normalize, buildWhere,
  };
})();
