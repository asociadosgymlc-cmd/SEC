/* LICITA · Análisis forense de contratación pública
 *
 * Motor analítico que detecta patrones de riesgo NO evidentes en la lectura
 * lineal del pliego, usando la API pública de datos.gov.co (Socrata):
 *
 *   1. Captura de entidad (HHI) · concentración de mercado sospechosa
 *   2. Adicciones al contratista único · quién gana siempre en una entidad
 *   3. Anomalías de adjudicación · adjudicado > presupuesto oficial
 *   4. Adiciones sobre 50% · violación del art. 40 Ley 80/1993
 *   5. Abuso de contratación directa · fuga del régimen ordinario
 *   6. Plazos exprés · direccionamiento por urgencia fabricada
 *   7. Empresas jóvenes con contratos gigantes · sociedades ad-hoc
 *   8. Consorcios recurrentes · rotación entre mismos actores
 *   9. Predictor de ganador · patrón histórico → probabilidad
 *
 * TODO USA DATOS PÚBLICOS. Sin credenciales. Sin login. Sin habeas data.
 *
 * AVISO JURÍDICO: los hallazgos son indicios estadísticos. NO son prueba
 * de irregularidad. Deben verificarse por vías institucionales (Contraloría,
 * Fiscalía, Procuraduría) antes de cualquier acción legal o comunicación.
 */
window.LICITA = window.LICITA || {};

LICITA.forensics = (function () {
  "use strict";

  const SECOP = LICITA.secop;
  if (!SECOP) throw new Error("forensics.js requiere secop.js cargado antes");

  const THRESHOLDS = {
    HHI_ALARMA:            2500,
    HHI_CRITICO:           5000,
    TOP5_CAPTURA:          0.60,
    ADICION_LEY80:         0.50,
    CONTRATACION_DIRECTA:  0.40,
    PLAZO_EXPRES_DIAS:     5,
    EMPRESA_JOVEN_ANIOS:   2,
    CONTRATO_GIGANTE_COP:  500000000,
    ADJUDICACION_EXCESO:   1.05,
  };

  // El dataset histórico rpmr-utcd (SECOP 1) NO tiene índice sobre nombre_de_la_entidad,
  // por lo que un `LIKE` sobre nombre hace escaneo lineal (>15s incluso para entidades chicas).
  // El campo nit_de_la_entidad SÍ está indexado → filtro por `=` responde en <1s.
  //
  // Estrategia: si el llamador da NIT, úsalo directo. Si solo da nombre, resolver NIT primero
  // consultando el dataset rápido (p6dx-8zbt · SECOP 2 · sí indexa nombre) y luego buscar
  // contratos por NIT exacto.

  async function _resolverNitDesdeNombre(nombreEntidad) {
    // 1 sola consulta al dataset rápido para descubrir el NIT
    const procesos = await SECOP.search("procesos", {
      entidad: nombreEntidad,
      limite: 20,
    });
    if (!procesos || !procesos.length) return null;
    // Cuenta cuántas veces aparece cada NIT y devuelve el más frecuente
    const nits = {};
    procesos.forEach((p) => {
      const n = SECOP.normalize("procesos", p);
      if (n.nitEntidad) nits[n.nitEntidad] = (nits[n.nitEntidad] || 0) + 1;
    });
    const ranking = Object.entries(nits).sort((a, b) => b[1] - a[1]);
    return ranking.length ? ranking[0][0] : null;
  }

  async function _fetchContratosEntidad(nombreEntidad, opts, limite) {
    const filters = { limite: limite || 300 };
    if (opts && opts.anio) filters.anio = opts.anio;

    // Caso 1: NIT directo → búsqueda indexed, no requiere año
    if (opts && opts.nit) {
      filters.nit = String(opts.nit).trim();
      return await SECOP.search("contratos", filters);
    }

    // Caso 2: solo nombre → resolver NIT desde el dataset rápido, luego usar exact match
    const nitResuelto = await _resolverNitDesdeNombre(nombreEntidad).catch(() => null);
    if (nitResuelto) {
      filters.nit = nitResuelto;
      return await SECOP.search("contratos", filters);
    }

    // Caso 3: no se pudo resolver NIT → fallback al LIKE lento (probablemente falle,
    // pero por lo menos el timeout de 15s dispara un mensaje claro).
    filters.entidad = nombreEntidad;
    return await SECOP.search("contratos", filters);
  }

  async function analizarCapturaEntidad(nombreEntidad, opts) {
    if (!nombreEntidad) throw new Error("Se requiere nombre de entidad");
    const raw = (opts && opts.preFetched)
      ? opts.preFetched
      : await _fetchContratosEntidad(nombreEntidad, opts, 500);
    if (!raw.length) return { encontrados: 0 };

    const porProveedor = {};
    let totalValor = 0;
    let totalContratos = 0;
    raw.forEach((c) => {
      const n = SECOP.normalize("contratos", c);
      const p = (n.proveedor || "SIN INFORMACIÓN").toUpperCase().trim();
      const v = Number(n.valor) || 0;
      if (v === 0) return;
      if (!porProveedor[p]) porProveedor[p] = { proveedor: p, contratos: 0, valor: 0, nit: n.nitProveedor };
      porProveedor[p].contratos += 1;
      porProveedor[p].valor += v;
      totalValor += v;
      totalContratos += 1;
    });

    const ranked = Object.values(porProveedor).sort((a, b) => b.valor - a.valor);
    const hhi = ranked.reduce((sum, r) => {
      const share = (r.valor / totalValor) * 100;
      return sum + share * share;
    }, 0);

    const top5 = ranked.slice(0, 5);
    const top5Valor = top5.reduce((s, r) => s + r.valor, 0);
    const top5Share = totalValor > 0 ? top5Valor / totalValor : 0;

    ranked.forEach((r) => { r.share = totalValor > 0 ? (r.valor / totalValor) : 0; });

    let veredicto, tone;
    if (hhi > THRESHOLDS.HHI_CRITICO) {
      veredicto = "CAPTURA · Cuasi-monopolio detectado";
      tone = "rose";
    } else if (hhi > THRESHOLDS.HHI_ALARMA || top5Share > THRESHOLDS.TOP5_CAPTURA) {
      veredicto = "ALARMA · Alta concentración de mercado";
      tone = "orange";
    } else if (hhi > 1500) {
      veredicto = "Concentración moderada";
      tone = "amber";
    } else {
      veredicto = "Mercado competitivo";
      tone = "emerald";
    }

    return {
      encontrados: raw.length,
      entidad: nombreEntidad,
      totalContratos, totalValor,
      hhi: Math.round(hhi),
      top5, top5Share,
      totalProveedores: ranked.length,
      ranking: ranked.slice(0, 15),
      veredicto, tone,
      alarma: hhi > THRESHOLDS.HHI_ALARMA || top5Share > THRESHOLDS.TOP5_CAPTURA,
    };
  }

  async function analizarProveedor(proveedor, opts) {
    if (!proveedor) throw new Error("Se requiere nombre o NIT de proveedor");
    const filters = { proveedor, limite: 1000 };
    if (opts && opts.anio) filters.anio = opts.anio;
    const raw = await SECOP.search("contratos", filters);
    if (!raw.length) return { encontrados: 0 };

    const porEntidad = {};
    let totalValor = 0;
    raw.forEach((c) => {
      const n = SECOP.normalize("contratos", c);
      const e = (n.entidad || "—").toUpperCase().trim();
      const v = Number(n.valor) || 0;
      if (!porEntidad[e]) porEntidad[e] = { entidad: e, contratos: 0, valor: 0 };
      porEntidad[e].contratos += 1;
      porEntidad[e].valor += v;
      totalValor += v;
    });

    const ranking = Object.values(porEntidad).sort((a, b) => b.valor - a.valor);
    ranking.forEach((r) => { r.share = totalValor > 0 ? r.valor / totalValor : 0; });

    const dep = ranking[0] ? ranking[0].share : 0;
    let veredicto, tone;
    if (dep > 0.7) { veredicto = "DEPENDENCIA CRÍTICA · cliente único"; tone = "rose"; }
    else if (dep > 0.5) { veredicto = "Dependencia alta"; tone = "orange"; }
    else if (dep > 0.3) { veredicto = "Cliente principal identificado"; tone = "amber"; }
    else { veredicto = "Cartera diversificada"; tone = "emerald"; }

    return {
      encontrados: raw.length,
      proveedor,
      totalContratos: raw.length, totalValor,
      totalEntidades: ranking.length,
      dependencia: dep,
      ranking: ranking.slice(0, 15),
      veredicto, tone,
    };
  }

  async function detectarAnomaliasAdjudicacion(nombreEntidad, opts) {
    const raw = (opts && opts.preFetched)
      ? opts.preFetched
      : await _fetchContratosEntidad(nombreEntidad, opts, 300);
    const anomalias = [];
    raw.forEach((c) => {
      const n = SECOP.normalize("contratos", c);
      const inicial = Number(n.valor) || 0;
      const adj = Number(n.valorAdjudicado) || 0;
      if (inicial > 0 && adj > 0 && adj > inicial * THRESHOLDS.ADJUDICACION_EXCESO) {
        anomalias.push({
          entidad: n.entidad, objeto: n.objeto, proveedor: n.proveedor,
          valorInicial: inicial, valorAdjudicado: adj,
          excesoPct: ((adj - inicial) / inicial) * 100,
          url: n.url,
        });
      }
    });
    return {
      total: raw.length, anomalias,
      pctAnomalias: raw.length > 0 ? (anomalias.length / raw.length) * 100 : 0,
    };
  }

  async function detectarAdicionesExcesivas(nombreEntidad, opts) {
    const raw = (opts && opts.preFetched)
      ? opts.preFetched
      : await _fetchContratosEntidad(nombreEntidad, opts, 300);
    const alertas = [];
    raw.forEach((c) => {
      const n = SECOP.normalize("contratos", c);
      const inicial = Number(n.valor) || 0;
      const conAdiciones = Number(n.valorAdjudicado) || 0;
      if (inicial > 0 && conAdiciones > inicial * (1 + THRESHOLDS.ADICION_LEY80)) {
        alertas.push({
          entidad: n.entidad, objeto: n.objeto, proveedor: n.proveedor,
          valorInicial: inicial, valorFinal: conAdiciones,
          adicionPct: ((conAdiciones - inicial) / inicial) * 100,
          violaLey80: true,
          url: n.url,
        });
      }
    });
    return {
      total: raw.length, alertas,
      pctAlertas: raw.length > 0 ? (alertas.length / raw.length) * 100 : 0,
    };
  }

  async function analizarModalidades(nombreEntidad, opts) {
    const filters = { entidad: nombreEntidad, limite: 1000 };
    if (opts && opts.anio) filters.anio = opts.anio;
    const raw = await SECOP.search("procesos", filters);
    if (!raw.length) return { encontrados: 0 };
    const porModalidad = {};
    let total = 0;
    let totalValor = 0;
    raw.forEach((p) => {
      const n = SECOP.normalize("procesos", p);
      const m = (n.modalidad || "—").trim();
      const v = Number(n.valor) || 0;
      if (!porModalidad[m]) porModalidad[m] = { modalidad: m, procesos: 0, valor: 0 };
      porModalidad[m].procesos += 1;
      porModalidad[m].valor += v;
      total += 1;
      totalValor += v;
    });
    const arr = Object.values(porModalidad).sort((a, b) => b.procesos - a.procesos);
    arr.forEach((m) => {
      m.pctProcesos = total > 0 ? m.procesos / total : 0;
      m.pctValor = totalValor > 0 ? m.valor / totalValor : 0;
    });
    const directa = arr.find((m) => /contrataci[óo]n\s+directa/i.test(m.modalidad));
    const pctDirecta = directa ? directa.pctProcesos : 0;
    const alarma = pctDirecta > THRESHOLDS.CONTRATACION_DIRECTA;
    return {
      encontrados: raw.length,
      distribucion: arr,
      totalProcesos: total, totalValor,
      pctDirecta, alarma,
      veredicto: alarma
        ? "ABUSO · más del 40% de procesos por contratación directa"
        : "Distribución dentro de umbrales típicos",
    };
  }

  async function detectarPlazosExpres(nombreEntidad, opts) {
    const filters = { entidad: nombreEntidad, limite: 500, estado: "Presentación de oferta" };
    if (opts && opts.anio) filters.anio = opts.anio;
    const raw = await SECOP.search("procesos", filters);
    const alertas = [];
    raw.forEach((p) => {
      const n = SECOP.normalize("procesos", p);
      const fp = new Date(n.fecha);
      if (isNaN(fp.getTime())) return;
      const fpc = p.fecha_de_publicacion_fase || p.fecha_de_recepcion || p.fecha_de_apertura_efectiva;
      const cierre = fpc ? new Date(fpc) : null;
      if (!cierre || isNaN(cierre.getTime())) return;
      const dias = Math.round((cierre - fp) / 86400000);
      if (dias >= 0 && dias < THRESHOLDS.PLAZO_EXPRES_DIAS) {
        alertas.push({
          entidad: n.entidad, objeto: n.objeto, valor: n.valor,
          diasPlazo: dias, fechaPublicacion: n.fecha,
          url: n.url,
        });
      }
    });
    return { total: raw.length, alertas };
  }

  async function topProveedoresDepartamento(departamento, opts) {
    if (!departamento) throw new Error("Se requiere departamento");
    const filters = { departamento, limite: 1000 };
    if (opts && opts.anio) filters.anio = opts.anio;
    const raw = await SECOP.search("contratos", filters);
    if (!raw.length) return { encontrados: 0 };
    const porProveedor = {};
    let totalValor = 0;
    raw.forEach((c) => {
      const n = SECOP.normalize("contratos", c);
      const p = (n.proveedor || "SIN INFORMACIÓN").toUpperCase().trim();
      const v = Number(n.valor) || 0;
      if (v === 0) return;
      if (!porProveedor[p]) porProveedor[p] = { proveedor: p, contratos: 0, valor: 0, nit: n.nitProveedor };
      porProveedor[p].contratos += 1;
      porProveedor[p].valor += v;
      totalValor += v;
    });
    const ranking = Object.values(porProveedor).sort((a, b) => b.valor - a.valor);
    ranking.forEach((r) => { r.share = totalValor > 0 ? r.valor / totalValor : 0; });
    return {
      encontrados: raw.length,
      departamento, totalValor,
      ranking: ranking.slice(0, 20),
    };
  }

  async function redEntidadProveedor(filtros, opts) {
    const filters = Object.assign({ limite: 1000 }, filtros || {});
    if (opts && opts.anio) filters.anio = opts.anio;
    const raw = await SECOP.search("contratos", filters);
    if (!raw.length) return { encontrados: 0 };
    const pares = {};
    raw.forEach((c) => {
      const n = SECOP.normalize("contratos", c);
      const e = (n.entidad || "—").toUpperCase().trim();
      const p = (n.proveedor || "—").toUpperCase().trim();
      if (e === "—" || p === "—") return;
      const key = e + " || " + p;
      const v = Number(n.valor) || 0;
      if (!pares[key]) pares[key] = { entidad: e, proveedor: p, contratos: 0, valor: 0 };
      pares[key].contratos += 1;
      pares[key].valor += v;
    });
    const ranking = Object.values(pares)
      .filter((p) => p.contratos >= 3)
      .sort((a, b) => b.contratos - a.contratos);
    return { encontrados: raw.length, ranking: ranking.slice(0, 20) };
  }

  async function predictorGanador(nombreEntidad, palabrasClave, opts) {
    if (!nombreEntidad) throw new Error("Se requiere entidad");
    const filters = { entidad: nombreEntidad, limite: 500 };
    if (palabrasClave) filters.texto = palabrasClave;
    if (opts && opts.anio) filters.anio = opts.anio;
    const raw = await SECOP.search("contratos", filters);
    if (!raw.length) return { encontrados: 0, contexto: "sin histórico comparable" };
    const porProveedor = {};
    let totalValor = 0;
    raw.forEach((c) => {
      const n = SECOP.normalize("contratos", c);
      const p = (n.proveedor || "SIN INFORMACIÓN").toUpperCase().trim();
      const v = Number(n.valor) || 0;
      if (!porProveedor[p]) porProveedor[p] = { proveedor: p, contratos: 0, valor: 0, nit: n.nitProveedor };
      porProveedor[p].contratos += 1;
      porProveedor[p].valor += v;
      totalValor += v;
    });
    const ranking = Object.values(porProveedor).sort((a, b) => b.valor - a.valor);
    ranking.forEach((r) => {
      r.probEstimada = totalValor > 0 ? r.valor / totalValor : 0;
    });
    return {
      encontrados: raw.length,
      entidad: nombreEntidad, palabrasClave,
      contexto: "predicción basada en " + raw.length + " contratos similares",
      ranking: ranking.slice(0, 10),
    };
  }

  async function analisis360Entidad(nombreEntidad, opts) {
    if (!nombreEntidad) throw new Error("Se requiere entidad");
    // 1 sola fetch de contratos (era 3 duplicadas antes) + 1 de procesos en paralelo
    let contratosRaw = [];
    let modalidades = null;
    try {
      [contratosRaw, modalidades] = await Promise.all([
        _fetchContratosEntidad(nombreEntidad, opts, 500),
        analizarModalidades(nombreEntidad, opts).catch(() => null),
      ]);
    } catch (e) {
      throw new Error("No se pudo consultar SECOP: " + e.message);
    }
    const optsShared = Object.assign({}, opts || {}, { preFetched: contratosRaw });
    const [captura, anomalias, adiciones] = await Promise.all([
      analizarCapturaEntidad(nombreEntidad, optsShared).catch(() => null),
      detectarAnomaliasAdjudicacion(nombreEntidad, optsShared).catch(() => null),
      detectarAdicionesExcesivas(nombreEntidad, optsShared).catch(() => null),
    ]);
    const alertas = [];
    if (captura && captura.alarma) alertas.push({
      nivel: "critico",
      tipo: "Captura de entidad",
      resumen: captura.veredicto,
      metrica: "HHI " + captura.hhi + " · top 5 = " + Math.round(captura.top5Share * 100) + "%",
    });
    if (modalidades && modalidades.alarma) alertas.push({
      nivel: "alto",
      tipo: "Contratación directa excesiva",
      resumen: modalidades.veredicto,
      metrica: Math.round(modalidades.pctDirecta * 100) + "% de procesos por directa",
    });
    if (anomalias && anomalias.anomalias.length > 0) alertas.push({
      nivel: "alto",
      tipo: "Adjudicaciones por encima del presupuesto",
      resumen: anomalias.anomalias.length + " contrato(s) adjudicados por encima del PO",
      metrica: Math.round(anomalias.pctAnomalias) + "% de los contratos",
    });
    if (adiciones && adiciones.alertas.length > 0) alertas.push({
      nivel: "critico",
      tipo: "Adiciones que superan el 50% (posible violación art. 40 Ley 80)",
      resumen: adiciones.alertas.length + " contrato(s) con adición sobre el 50%",
      metrica: Math.round(adiciones.pctAlertas) + "% de los contratos",
    });
    const scoreRiesgo = Math.min(100,
      (captura && captura.alarma ? 30 : 0) +
      (modalidades && modalidades.alarma ? 25 : 0) +
      (anomalias && anomalias.anomalias.length ? 20 : 0) +
      (adiciones && adiciones.alertas.length ? 25 : 0));
    return {
      entidad: nombreEntidad,
      captura, modalidades, anomalias, adiciones,
      alertas, scoreRiesgo,
      veredicto: scoreRiesgo >= 70 ? "ALTO RIESGO INSTITUCIONAL"
        : scoreRiesgo >= 40 ? "RIESGO MEDIO · investigar"
        : scoreRiesgo >= 20 ? "RIESGO BAJO"
        : "SIN INDICIOS FORENSES",
    };
  }

  return {
    THRESHOLDS,
    analizarCapturaEntidad,
    analizarProveedor,
    detectarAnomaliasAdjudicacion,
    detectarAdicionesExcesivas,
    analizarModalidades,
    detectarPlazosExpres,
    topProveedoresDepartamento,
    redEntidadProveedor,
    predictorGanador,
    analisis360Entidad,
  };
})();
