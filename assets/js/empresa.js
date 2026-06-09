/* LICITA · Perfil empresarial y Match Score
 *
 * El perfil convierte LICITA en copiloto:
 *   - Captura datos del proponente (sectores, geografía, capacidad
 *     financiera, experiencia, MIPYME).
 *   - Match Score: dada cualquier oportunidad de SECOP/PAA, calcula
 *     una probabilidad de ajuste (0–100) con desglose explicable.
 *
 * Persistido por usuario en localStorage.
 */
window.LICITA = window.LICITA || {};

LICITA.empresa = (function () {
  "use strict";

  const SECTORES = [
    { id: "obras",       label: "Obras civiles e infraestructura", icon: "🏗️" },
    { id: "tecnologia",  label: "Tecnología y software",           icon: "💻" },
    { id: "suministros", label: "Suministros y bienes",            icon: "📦" },
    { id: "consultoria", label: "Consultoría profesional",         icon: "📝" },
    { id: "aseo",        label: "Aseo y mantenimiento",            icon: "🧹" },
    { id: "vigilancia",  label: "Vigilancia y seguridad",          icon: "🛡️" },
    { id: "salud",       label: "Servicios médicos y salud",       icon: "🏥" },
    { id: "educacion",   label: "Educación y capacitación",        icon: "🎓" },
    { id: "catering",    label: "Alimentación y catering",         icon: "🍽️" },
    { id: "transporte",  label: "Transporte y logística",          icon: "🚚" },
    { id: "juridica",    label: "Asesoría jurídica",               icon: "⚖️" },
    { id: "publicidad",  label: "Comunicaciones y publicidad",     icon: "📣" },
  ];

  function sectorById(id) { return SECTORES.find((s) => s.id === id) || null; }

  function profileKey(u) { return u ? "licita.empresa." + u.username : null; }

  function blank() {
    return {
      razonSocial: "",
      nit: "",
      tipo: "juridica",      // natural | juridica
      esMipyme: false,
      patrimonio: 0,
      capitalTrabajo: 0,
      indiceLiquidez: 0,
      indiceEndeudamiento: 0,
      sectores: [],
      departamentos: [],
      personalClave: "",
      experiencia: [],       // { entidad, objeto, valor, anio }
    };
  }

  function load(currentUser) {
    if (!currentUser) return blank();
    try {
      const raw = localStorage.getItem(profileKey(currentUser));
      return raw ? Object.assign(blank(), JSON.parse(raw)) : blank();
    } catch (e) { return blank(); }
  }

  function save(currentUser, profile) {
    if (!currentUser) return;
    try { localStorage.setItem(profileKey(currentUser), JSON.stringify(profile)); }
    catch (e) {}
  }

  function isProfileSetup(p) {
    if (!p) return false;
    return !!(p.razonSocial && (p.sectores.length || p.departamentos.length));
  }

  /* ----------------------------------------------------------------
   * MATCH SCORE
   * Calcula un score de 0–100 con desglose explicable para una
   * oportunidad concreta de SECOP/PAA. La lógica es transparente: el
   * usuario ve por qué un proceso le encaja o no.
   * ---------------------------------------------------------------- */
  function score(profile, opportunity) {
    if (!profile || !opportunity) return null;
    const op = opportunity || {};
    const items = [];
    let total = 0;

    /* 1. Geografía — opera en ese departamento (25 pts) */
    const depOp = (op.departamento || "").toLowerCase();
    const hasGeo = !!(profile.departamentos || []).find((d) => {
      const dl = d.toLowerCase();
      return dl === depOp || dl.includes(depOp) || depOp.includes(dl);
    });
    if (depOp && profile.departamentos && profile.departamentos.length) {
      if (hasGeo) {
        total += 25;
        items.push({ k: "geografia", pts: 25, max: 25, ok: true,
          reason: "Operas en " + op.departamento });
      } else {
        items.push({ k: "geografia", pts: 0, max: 25, ok: false,
          reason: "No marcaste " + op.departamento + " como zona de operación" });
      }
    } else {
      items.push({ k: "geografia", pts: 0, max: 25, ok: null,
        reason: depOp ? "Configura tus departamentos en Mi empresa" : "Sin ubicación en la oportunidad" });
    }

    /* 2. Sector / experiencia objeto (25 pts) */
    const objetoText = (op.objeto || "").toLowerCase();
    const tipoText = (op.tipoContrato || "").toLowerCase();
    const keywordsPorSector = {
      obras: ["obra", "construcción", "construccion", "infraestructura", "pavimento", "edificación", "edificacion", "vía", "via"],
      tecnologia: ["software", "sistema", "tecnología", "tecnologia", "informática", "informatica", "desarrollo", "aplicación", "aplicacion", "tic"],
      suministros: ["suministro", "compraventa", "adquisición", "adquisicion", "bienes"],
      consultoria: ["consultoría", "consultoria", "asesoría", "asesoria", "estudio", "diseño", "diseno"],
      aseo: ["aseo", "limpieza", "cafetería", "cafeteria", "mantenimiento"],
      vigilancia: ["vigilancia", "seguridad", "guarda"],
      salud: ["salud", "médic", "medic", "hospital", "clínic", "clinic", "farmac"],
      educacion: ["educación", "educacion", "capacitación", "capacitacion", "formación", "formacion"],
      catering: ["alimentación", "alimentacion", "catering", "refrigerio", "comida"],
      transporte: ["transporte", "logística", "logistica", "flete"],
      juridica: ["jurídic", "juridic", "abogad", "contratación", "contratacion"],
      publicidad: ["publicidad", "comunicación", "comunicacion", "diseño gráfico", "diseno grafico"],
    };
    let matchedSector = null;
    for (const s of profile.sectores || []) {
      const kws = keywordsPorSector[s] || [];
      if (kws.some((k) => objetoText.includes(k) || tipoText.includes(k))) {
        matchedSector = s; break;
      }
    }
    if (matchedSector) {
      total += 25;
      const sec = sectorById(matchedSector);
      items.push({ k: "sector", pts: 25, max: 25, ok: true,
        reason: "Tu sector " + (sec ? sec.icon + " " + sec.label : matchedSector) + " coincide con el objeto" });
    } else if ((profile.sectores || []).length) {
      items.push({ k: "sector", pts: 0, max: 25, ok: false,
        reason: "El objeto no coincide con tus sectores configurados" });
    } else {
      items.push({ k: "sector", pts: 0, max: 25, ok: null,
        reason: "Selecciona tus sectores en Mi empresa" });
    }

    /* 3. Capacidad financiera (20 pts) */
    const valorOp = Number(op.valor) || 0;
    if (valorOp > 0 && profile.patrimonio > 0) {
      // Regla práctica: patrimonio sugerido ≈ 30% del valor del contrato.
      const patrSugerido = valorOp * 0.30;
      if (profile.patrimonio >= patrSugerido) {
        total += 20;
        items.push({ k: "financiera", pts: 20, max: 20, ok: true,
          reason: "Tu patrimonio cubre cómodamente la cuantía estimada" });
      } else if (profile.patrimonio >= patrSugerido * 0.5) {
        total += 10;
        items.push({ k: "financiera", pts: 10, max: 20, ok: false,
          reason: "Tu patrimonio queda justo; revisa indicadores específicos" });
      } else {
        items.push({ k: "financiera", pts: 0, max: 20, ok: false,
          reason: "Patrimonio podría no alcanzar para los indicadores típicos" });
      }
    } else {
      items.push({ k: "financiera", pts: 0, max: 20, ok: null,
        reason: valorOp ? "Configura tu patrimonio en Mi empresa" : "Sin cuantía en la oportunidad" });
    }

    /* 4. Experiencia comparable (15 pts) */
    const expRel = (profile.experiencia || []).filter((e) => {
      const obj = (e.objeto || "").toLowerCase();
      const sectorMatch = matchedSector ?
        (keywordsPorSector[matchedSector] || []).some((k) => obj.includes(k)) : false;
      const valorOk = valorOp > 0 && e.valor > 0 ? e.valor >= valorOp * 0.25 : true;
      return sectorMatch && valorOk;
    });
    if (expRel.length >= 2) {
      total += 15;
      items.push({ k: "experiencia", pts: 15, max: 15, ok: true,
        reason: expRel.length + " contratos previos comparables en tu historial" });
    } else if (expRel.length === 1) {
      total += 8;
      items.push({ k: "experiencia", pts: 8, max: 15, ok: false,
        reason: "Solo 1 contrato comparable; las entidades suelen pedir más" });
    } else if ((profile.experiencia || []).length) {
      items.push({ k: "experiencia", pts: 0, max: 15, ok: false,
        reason: "Tu experiencia registrada no coincide con esta oportunidad" });
    } else {
      items.push({ k: "experiencia", pts: 0, max: 15, ok: null,
        reason: "Registra tus contratos previos en Mi empresa" });
    }

    /* 5. Modalidad accesible (10 pts) */
    const mod = (op.modalidad || "").toLowerCase();
    if (mod) {
      if (mod.includes("mínima") || mod.includes("minima")) {
        total += 10;
        items.push({ k: "modalidad", pts: 10, max: 10, ok: true,
          reason: "Mínima cuantía: alta accesibilidad" });
      } else if (mod.includes("selección abreviada") || mod.includes("seleccion abreviada")) {
        total += 7;
        items.push({ k: "modalidad", pts: 7, max: 10, ok: true,
          reason: "Selección abreviada: accesibilidad media-alta" });
      } else if (mod.includes("licitación") || mod.includes("licitacion")) {
        total += 4;
        items.push({ k: "modalidad", pts: 4, max: 10, ok: false,
          reason: "Licitación pública: requisitos exigentes" });
      } else if (mod.includes("contratación directa") || mod.includes("contratacion directa")) {
        total += 1;
        items.push({ k: "modalidad", pts: 1, max: 10, ok: false,
          reason: "Contratación directa: entrada muy restringida" });
      } else {
        total += 5;
        items.push({ k: "modalidad", pts: 5, max: 10, ok: null,
          reason: "Modalidad: " + op.modalidad });
      }
    } else {
      items.push({ k: "modalidad", pts: 0, max: 10, ok: null, reason: "Sin modalidad informada" });
    }

    /* 6. Bonus MIPYME en cuantías favorables (5 pts) */
    if (profile.esMipyme && valorOp > 0 && valorOp < 500_000_000) {
      total += 5;
      items.push({ k: "mipyme", pts: 5, max: 5, ok: true,
        reason: "Estímulos a MIPYMES aplican en esta cuantía (Ley 2069/2020)" });
    } else if (profile.esMipyme) {
      items.push({ k: "mipyme", pts: 0, max: 5, ok: null,
        reason: "MIPYME registrada (sin bonus para esta cuantía)" });
    }

    const cap = Math.max(0, Math.min(100, total));
    let label, color;
    if (cap >= 75) { label = "Excelente match"; color = "emerald"; }
    else if (cap >= 55) { label = "Buen match"; color = "sky"; }
    else if (cap >= 35) { label = "Match moderado"; color = "amber"; }
    else if (cap > 0)   { label = "Match bajo"; color = "orange"; }
    else                { label = "Sin datos suficientes"; color = "slate"; }

    return { score: cap, label, color, breakdown: items };
  }

  /* Recomendaciones para subir el score con el perfil actual */
  function recommendationsToImprove(profile) {
    const r = [];
    if (!profile.razonSocial) r.push("Completa la razón social y el NIT en Mi empresa.");
    if (!profile.sectores || profile.sectores.length < 2) r.push("Marca al menos 2 sectores donde realmente compitas.");
    if (!profile.departamentos || profile.departamentos.length === 0) r.push("Define los departamentos donde operas.");
    if (!profile.patrimonio) r.push("Registra tu patrimonio actual para validar capacidad financiera.");
    if (!profile.experiencia || profile.experiencia.length < 3) r.push("Sube al menos 3 contratos ejecutados con entidad, objeto y valor.");
    return r;
  }

  return {
    SECTORES, sectorById,
    blank, load, save, isProfileSetup,
    score, recommendationsToImprove,
  };
})();
