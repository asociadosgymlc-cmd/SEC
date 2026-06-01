/* LICITA · Cliente de la API SECOP 2 (datos.gov.co · dataset p6dx-8zbt)
 *
 * Búsqueda en vivo de procesos de contratación pública colombianos.
 * Replica la lógica del cliente Python compartido, en navegador.
 *
 * Socrata expone CORS, por lo que no se requiere backend.
 */
window.LICITA = window.LICITA || {};

LICITA.secop = (function () {
  "use strict";

  const ENDPOINT = "https://www.datos.gov.co/resource/p6dx-8zbt.json";

  const ESTADOS = [
    "Presentación de oferta",
    "Adjudicado",
    "Celebrado",
    "Liquidado",
    "Seleccionado",
    "Borrador",
    "Descartado",
    "Terminado Anormalmente",
  ];

  const MODALIDADES = [
    "Mínima cuantía",
    "Selección abreviada",
    "Licitación Pública",
    "Concurso de méritos abierto",
    "Contratación directa",
    "Régimen Especial",
  ];

  const DEPARTAMENTOS = [
    "Amazonas","Antioquia","Arauca","Atlántico","Bogotá D.C.","Bolívar","Boyacá",
    "Caldas","Caquetá","Casanare","Cauca","Cesar","Chocó","Córdoba","Cundinamarca",
    "Guainía","Guaviare","Huila","La Guajira","Magdalena","Meta","Nariño",
    "Norte de Santander","Putumayo","Quindío","Risaralda","San Andrés y Providencia",
    "Santander","Sucre","Tolima","Valle del Cauca","Vaupés","Vichada",
  ];

  const TIPOS_CONTRATO = [
    "Prestación de servicios",
    "Suministro",
    "Obra",
    "Compraventa",
    "Consultoría",
    "Interventoría",
    "Arrendamiento",
    "Seguros",
  ];

  function escapeSoql(value) {
    return String(value).replace(/'/g, "''");
  }

  function buildWhere(f) {
    const conds = [];
    if (f.texto) {
      const t = escapeSoql(String(f.texto).toUpperCase());
      conds.push(
        "(upper(descripci_n_del_procedimiento) like '%" + t + "%' " +
        "OR upper(nombre_del_procedimiento) like '%" + t + "%')"
      );
    }
    if (f.entidad)
      conds.push("upper(entidad) like '%" + escapeSoql(f.entidad.toUpperCase()) + "%'");
    if (f.departamento)
      conds.push("upper(departamento_entidad) like '%" + escapeSoql(f.departamento.toUpperCase()) + "%'");
    if (f.ciudad)
      conds.push("upper(ciudad_de_la_unidad_de) like '%" + escapeSoql(f.ciudad.toUpperCase()) + "%'");
    if (f.modalidad)
      conds.push("upper(modalidad_de_contratacion) like '%" + escapeSoql(f.modalidad.toUpperCase()) + "%'");
    if (f.tipoContrato)
      conds.push("upper(tipo_de_contrato) like '%" + escapeSoql(f.tipoContrato.toUpperCase()) + "%'");
    if (f.estado)
      conds.push("estado_resumen='" + escapeSoql(f.estado) + "'");
    if (f.precioMin != null && f.precioMin !== "")
      conds.push("precio_base >= '" + Number(f.precioMin) + "'");
    if (f.precioMax != null && f.precioMax !== "")
      conds.push("precio_base <= '" + Number(f.precioMax) + "'");
    if (f.fechaDesde)
      conds.push("fecha_de_publicacion_del >= '" + f.fechaDesde + "T00:00:00.000'");
    if (f.fechaHasta)
      conds.push("fecha_de_publicacion_del <= '" + f.fechaHasta + "T23:59:59.000'");
    return conds.join(" AND ");
  }

  async function search(filters) {
    const params = new URLSearchParams();
    params.set("$limit", String(filters.limite || 25));
    params.set("$offset", String(filters.offset || 0));
    params.set("$order", filters.orden || "fecha_de_publicacion_del DESC");
    const where = buildWhere(filters);
    if (where) params.set("$where", where);
    const r = await fetch(ENDPOINT + "?" + params.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(
        "SECOP 2 (" + r.status + "): " + (txt.slice(0, 200) || r.statusText)
      );
    }
    return r.json();
  }

  async function count(filters) {
    const params = new URLSearchParams();
    params.set("$select", "count(*)");
    const where = buildWhere(filters);
    if (where) params.set("$where", where);
    const r = await fetch(ENDPOINT + "?" + params.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error("SECOP 2 (" + r.status + ")");
    const j = await r.json();
    return parseInt((j[0] || {}).count || "0", 10);
  }

  /* Normaliza un registro para uso en la UI. */
  function normalize(p) {
    let url = null;
    if (p.urlproceso) {
      if (typeof p.urlproceso === "string") url = p.urlproceso;
      else if (typeof p.urlproceso === "object") url = p.urlproceso.url || null;
    }
    return {
      id: p.id_del_proceso || p.referencia_del_proceso || "",
      referencia: p.referencia_del_proceso || "",
      entidad: p.entidad || "",
      nit: p.nit_entidad || "",
      departamento: p.departamento_entidad || "",
      ciudad: p.ciudad_de_la_unidad_de || p.ciudad_entidad || "",
      objeto: p.descripci_n_del_procedimiento || p.nombre_del_procedimiento || "",
      nombre: p.nombre_del_procedimiento || "",
      precio: Number(p.precio_base || 0),
      valorAdjudicacion: Number(p.valor_total_adjudicacion || 0),
      modalidad: p.modalidad_de_contratacion || "",
      tipoContrato: p.tipo_de_contrato || "",
      subtipo: p.subtipo_de_contrato || "",
      estado: p.estado_resumen || p.estado_del_procedimiento || "",
      adjudicado: p.adjudicado || "",
      proveedor: p.nombre_del_proveedor || "",
      fechaPublicacion: p.fecha_de_publicacion_del || "",
      fechaCierre: p.fecha_de_publicacion_fase_3 || "",
      duracion: p.duracion || "",
      unidadDuracion: p.unidad_de_duracion || "",
      url,
      raw: p,
    };
  }

  return {
    search, count, normalize,
    ESTADOS, MODALIDADES, DEPARTAMENTOS, TIPOS_CONTRATO,
  };
})();
