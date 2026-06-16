/* LICITA · Base de conocimiento jurídico
 * Marco normativo, criterios jurisprudenciales y reglas de detección de riesgos
 * para procesos de contratación pública en Colombia.
 *
 * AVISO: Esta base es un insumo de apoyo. Las citas deben verificarse por un
 * profesional del derecho antes de radicar cualquier observación.
 */
window.LICITA = window.LICITA || {};

LICITA.knowledge = (function () {
  "use strict";

  /* ----------------------------------------------------------------------
   * Marco normativo (normas verificables del ordenamiento colombiano)
   * -------------------------------------------------------------------- */
  const norms = [
    {
      code: "Ley 80 de 1993",
      title: "Estatuto General de Contratación de la Administración Pública",
      summary:
        "Consagra los principios de transparencia, economía y responsabilidad, " +
        "y el deber de selección objetiva. El pliego de condiciones es la ley del proceso.",
      tags: ["principios", "pliego", "transparencia"],
    },
    {
      code: "Ley 1150 de 2007",
      title: "Medidas de eficiencia y transparencia en la contratación estatal",
      summary:
        "Su artículo 5 define la SELECCIÓN OBJETIVA: los factores de escogencia y " +
        "los requisitos habilitantes deben ser adecuados y proporcionales al objeto " +
        "y a su valor. Prohíbe puntuar requisitos habilitantes.",
      tags: ["selección objetiva", "habilitantes", "proporcionalidad"],
    },
    {
      code: "Decreto 1082 de 2015",
      title: "Decreto Único Reglamentario del sector Planeación Nacional",
      summary:
        "Reglamenta el sistema de compras públicas. Regula la capacidad jurídica, " +
        "financiera, organizacional y la experiencia exigible, que deben fijarse de " +
        "forma proporcional al valor y naturaleza del contrato.",
      tags: ["requisitos habilitantes", "experiencia", "capacidad financiera"],
    },
    {
      code: "Ley 1474 de 2011",
      title: "Estatuto Anticorrupción",
      summary:
        "Refuerza la transparencia y prohíbe el direccionamiento de procesos. " +
        "Sanciona pliegos diseñados a la medida de un proponente.",
      tags: ["anticorrupción", "direccionamiento", "transparencia"],
    },
    {
      code: "Ley 2069 de 2020",
      title: "Política de emprendimiento",
      summary:
        "Promueve el acceso de las MIPYMES a la contratación pública y proscribe " +
        "barreras desproporcionadas que limiten la concurrencia de oferentes.",
      tags: ["mipymes", "libre concurrencia"],
    },
    {
      code: "Constitución Política, art. 13 y 209",
      title: "Igualdad y función administrativa",
      summary:
        "La función administrativa se desarrolla con fundamento en la igualdad, " +
        "moralidad, eficacia e imparcialidad. Todo requisito que rompa la igualdad " +
        "entre oferentes debe tener justificación objetiva y razonable.",
      tags: ["igualdad", "principios"],
    },
    {
      code: "Colombia Compra Eficiente — Guías y conceptos",
      title: "Lineamientos de la Agencia Nacional de Contratación",
      summary:
        "Recomienda definir requisitos habilitantes proporcionales, evitar marcas " +
        "y exigir solo la experiencia estrictamente necesaria para ejecutar el objeto.",
      tags: ["guías", "buenas prácticas"],
    },
  ];

  /* ----------------------------------------------------------------------
   * Criterios jurisprudenciales (doctrina reiterada — verificar radicado)
   * -------------------------------------------------------------------- */
  const jurisprudence = [
    {
      id: "ce-seleccion-objetiva",
      court: "Consejo de Estado — Sección Tercera",
      ref: "Jurisprudencia reiterada sobre selección objetiva",
      topic: "Selección objetiva y proporcionalidad",
      holding:
        "Los requisitos habilitantes no pueden constituir barreras de entrada; " +
        "deben guardar correspondencia y proporción con el objeto, el valor y la " +
        "complejidad del contrato. Exigencias excesivas vulneran la libre concurrencia.",
      tags: ["selección objetiva", "proporcionalidad", "habilitantes"],
    },
    {
      id: "ce-pliego-ley",
      court: "Consejo de Estado — Sección Tercera",
      ref: "Doctrina del pliego de condiciones",
      topic: "El pliego como ley del proceso",
      holding:
        "El pliego es la ley tanto del proceso de selección como del contrato; " +
        "sus cláusulas oscuras o que restrinjan la participación se interpretan en " +
        "contra de quien las redactó y a favor de la concurrencia.",
      tags: ["pliego", "interpretación"],
    },
    {
      id: "cc-libre-concurrencia",
      court: "Corte Constitucional",
      ref: "Doctrina sobre libre concurrencia e igualdad",
      topic: "Libre concurrencia",
      holding:
        "La libre concurrencia es manifestación del derecho a la igualdad en la " +
        "contratación estatal; toda limitación debe perseguir un fin constitucional " +
        "legítimo y ser idónea, necesaria y proporcional.",
      tags: ["libre concurrencia", "igualdad"],
    },
    {
      id: "ce-marca",
      court: "Consejo de Estado / Colombia Compra Eficiente",
      ref: "Criterio sobre referencia a marcas",
      topic: "Prohibición de exigir marcas",
      holding:
        "Exigir una marca, nombre comercial o referencia determinada sin admitir " +
        "equivalentes direcciona el proceso y vulnera la igualdad, salvo justificación " +
        "técnica documentada de imposibilidad de describir el bien por características.",
      tags: ["marca", "direccionamiento"],
    },
    {
      id: "ce-experiencia",
      court: "Consejo de Estado — Sección Tercera",
      ref: "Criterio sobre experiencia exigible",
      topic: "Experiencia proporcional",
      holding:
        "La experiencia debe ser la estrictamente necesaria. Exigir un número de " +
        "contratos, valores en SMMLV o antigüedad desproporcionados frente al objeto " +
        "limita injustificadamente el universo de proponentes.",
      tags: ["experiencia", "proporcionalidad"],
    },
  ];

  const jurisById = Object.fromEntries(jurisprudence.map((j) => [j.id, j]));

  /* ----------------------------------------------------------------------
   * Reglas de detección de riesgos
   * weight: 1 leve · 2 moderado · 3 serio · 4 crítico
   * -------------------------------------------------------------------- */
  const rules = [
    {
      id: "vinculacion_laboral_exclusiva",
      category: "Selección objetiva",
      title: "Exigencia de vinculación laboral exclusiva del personal",
      weight: 3,
      include: [
        /v[ií]nculaci[óo]n\s+laboral/i,
        /contrato\s+de\s+trabajo/i,
        /personal\s+de\s+planta/i,
        /n[óo]mina/i,
        /v[ií]nculo\s+laboral\s+directo/i,
      ],
      exclude: [
        /prestaci[óo]n\s+de\s+servicios/i,
        /cualquier\s+(modalidad|forma)\s+de\s+vinculaci[óo]n/i,
      ],
      norma: "Art. 5 Ley 1150 de 2007 · Art. 23 Ley 80 de 1993",
      legalBasis:
        "Exigir que el personal esté vinculado exclusivamente mediante contrato " +
        "laboral restringe la forma de organización del proponente y no constituye " +
        "un factor adecuado de selección. El interés de la Entidad se satisface " +
        "verificando la idoneidad del personal y el pago de aportes a seguridad " +
        "social (PILA), con independencia del tipo de vínculo.",
      jurisprudencia: ["ce-seleccion-objetiva", "cc-libre-concurrencia"],
      recomendacion:
        "Admitir indistintamente contrato laboral o contrato de prestación de " +
        "servicios, exigiendo como prueba la afiliación y los aportes al Sistema " +
        "de Seguridad Social (planilla PILA).",
      peticion:
        "Modificar el numeral para que el personal requerido pueda acreditarse " +
        "mediante contrato laboral O contrato de prestación de servicios, " +
        "exigiendo únicamente la prueba de aportes al sistema de seguridad social.",
    },
    {
      id: "experiencia_desproporcionada",
      category: "Proporcionalidad",
      title: "Experiencia habilitante posiblemente desproporcionada",
      weight: 3,
      include: [
        /experiencia/i,
        /contratos?\s+(similares|ejecutados|terminados)/i,
        /a[ñn]os\s+de\s+experiencia/i,
        /smmlv|smlmv|salarios?\s+m[íi]nimos/i,
      ],
      requireCount: 2,
      norma: "Art. 5 Ley 1150 de 2007 · Decreto 1082 de 2015",
      legalBasis:
        "La experiencia exigida debe ser la estrictamente necesaria y proporcional " +
        "al valor y complejidad del contrato. Solicitar un número elevado de " +
        "contratos, valores acumulados altos en SMMLV o antigüedad excesiva sin " +
        "estudio que lo soporte limita el universo de proponentes habilitados.",
      jurisprudencia: ["ce-experiencia", "ce-seleccion-objetiva"],
      recomendacion:
        "Ajustar la experiencia a la naturaleza y cuantía del proceso y publicar " +
        "el análisis del sector que la justifica.",
      peticion:
        "Reducir y proporcionar la experiencia exigida al valor y objeto del " +
        "contrato, y publicar el estudio del sector que soporta dicha exigencia.",
    },
    {
      id: "marca_especifica",
      category: "Libre concurrencia",
      title: "Exigencia de marca, referencia o nombre comercial determinado",
      weight: 4,
      include: [
        /marca\s+(espec[íi]fica|determinada|exclusiva)/i,
        /no\s+se\s+aceptan?\s+equivalentes/i,
        /[úu]nica\s+(marca|referencia)/i,
        /referencia\s+exclusiva/i,
      ],
      exclude: [/o\s+equivalente/i, /o\s+similar/i],
      norma: "Art. 5 Ley 1150 de 2007 · Decreto 1082 de 2015",
      legalBasis:
        "Salvo justificación técnica documentada, los bienes y servicios deben " +
        "describirse por sus características y especificaciones, no por marca. " +
        "Exigir una marca sin admitir equivalentes direcciona el proceso.",
      jurisprudencia: ["ce-marca", "cc-libre-concurrencia"],
      recomendacion:
        "Describir el bien por especificaciones técnicas y admitir todo producto " +
        "que las cumpla, o bien las marcas 'o equivalentes'.",
      peticion:
        "Eliminar la exigencia de marca determinada y describir el bien por sus " +
        "especificaciones técnicas, admitiendo equivalentes que las cumplan.",
    },
    {
      id: "restriccion_geografica",
      category: "Igualdad",
      title: "Restricción por domicilio o ubicación geográfica del proponente",
      weight: 3,
      include: [
        /domicilio\s+(en|principal\s+en)/i,
        /sede\s+(en\s+la\s+ciudad|principal\s+en)/i,
        /empresas?\s+locales/i,
        /residente\s+en\s+(el|la)\s+(municipio|departamento|ciudad)/i,
      ],
      norma: "Art. 13 y 209 Constitución Política · Art. 5 Ley 1150 de 2007",
      legalBasis:
        "Exigir domicilio, sede o residencia en una zona determinada como requisito " +
        "habilitante rompe la igualdad entre oferentes y restringe la concurrencia " +
        "sin justificación objetiva.",
      jurisprudencia: ["cc-libre-concurrencia", "ce-seleccion-objetiva"],
      recomendacion:
        "Eliminar la exigencia de domicilio o admitir el compromiso de disponer de " +
        "infraestructura local únicamente durante la ejecución del contrato.",
      peticion:
        "Suprimir el requisito de domicilio o sede local como condición habilitante.",
    },
    {
      id: "indicadores_financieros_excesivos",
      category: "Proporcionalidad",
      title: "Indicadores financieros posiblemente excesivos",
      weight: 2,
      include: [
        /capital\s+de\s+trabajo/i,
        /[íi]ndice\s+de\s+liquidez/i,
        /[íi]ndice\s+de\s+endeudamiento/i,
        /patrimonio\s+(m[íi]nimo|igual\s+o\s+superior)/i,
        /raz[óo]n\s+de\s+cobertura/i,
      ],
      requireCount: 2,
      norma: "Decreto 1082 de 2015 · Art. 5 Ley 1150 de 2007",
      legalBasis:
        "Los indicadores de capacidad financiera y organizacional deben fijarse de " +
        "forma proporcional al presupuesto del contrato, con base en el análisis " +
        "del sector. Umbrales elevados sin soporte excluyen MIPYMES sin razón.",
      jurisprudencia: ["ce-seleccion-objetiva", "ce-experiencia"],
      recomendacion:
        "Recalcular los indicadores con base en el análisis del sector y la cuantía.",
      peticion:
        "Ajustar los indicadores de capacidad financiera y organizacional a la " +
        "cuantía del proceso y publicar el análisis del sector que los soporta.",
    },
    {
      id: "plazo_insuficiente",
      category: "Transparencia",
      title: "Plazo posiblemente insuficiente para presentar ofertas",
      weight: 2,
      include: [
        /plazo\s+(para|de)\s+presentaci[óo]n/i,
        /(un|1|dos|2)\s+d[íi]as?\s+(h[áa]biles?\s+)?para\s+(presentar|ofertar)/i,
        /t[ée]rmino\s+(de\s+)?cierre/i,
      ],
      norma: "Art. 24 Ley 80 de 1993 · Principio de transparencia",
      legalBasis:
        "Un plazo demasiado breve para estructurar la oferta impide la concurrencia " +
        "efectiva y puede evidenciar direccionamiento del proceso.",
      jurisprudencia: ["ce-pliego-ley", "cc-libre-concurrencia"],
      recomendacion:
        "Ampliar el plazo de presentación de ofertas a un término razonable según " +
        "la complejidad del objeto.",
      peticion:
        "Ampliar el plazo para la presentación de ofertas garantizando un término " +
        "razonable acorde con la complejidad del objeto contractual.",
    },
    {
      id: "certificacion_restrictiva",
      category: "Proporcionalidad",
      title: "Certificación o acreditación restrictiva como habilitante",
      weight: 2,
      include: [
        /certificaci[óo]n\s+iso/i,
        /certificado\s+de\s+(gesti[óo]n|calidad)/i,
        /acreditaci[óo]n\s+ante/i,
        /sello\s+de\s+calidad/i,
      ],
      norma: "Art. 5 Ley 1150 de 2007 · Decreto 1082 de 2015",
      legalBasis:
        "Exigir certificaciones de calidad o acreditaciones como requisito " +
        "habilitante, cuando no son indispensables para ejecutar el objeto, " +
        "constituye una barrera de entrada injustificada.",
      jurisprudencia: ["ce-seleccion-objetiva"],
      recomendacion:
        "Evaluar si la certificación es indispensable; de no serlo, eliminarla o " +
        "trasladarla a un factor ponderable, no habilitante.",
      peticion:
        "Eliminar la certificación como requisito habilitante o justificar " +
        "técnicamente su carácter indispensable para la ejecución del objeto.",
    },
    {
      id: "objeto_indeterminado",
      category: "Transparencia",
      title: "Especificaciones técnicas ambiguas o indeterminadas",
      weight: 1,
      include: [
        /seg[úu]n\s+criterio\s+de\s+la\s+entidad/i,
        /a\s+juicio\s+de\s+la\s+entidad/i,
        /las?\s+que\s+(la\s+entidad\s+)?determine/i,
        /entre\s+otros/i,
      ],
      norma: "Art. 24 Ley 80 de 1993 · Principio de transparencia",
      legalBasis:
        "Las reglas del pliego deben ser claras, completas y objetivas. Las " +
        "cláusulas que dejan a discreción de la Entidad la definición de requisitos " +
        "generan inseguridad jurídica y se interpretan contra quien las redactó.",
      jurisprudencia: ["ce-pliego-ley"],
      recomendacion:
        "Precisar de forma objetiva y verificable las especificaciones técnicas.",
      peticion:
        "Precisar de manera clara, completa y objetiva las especificaciones " +
        "técnicas, eliminando expresiones que dejen la definición a discreción.",
    },
  ];

  /* ----------------------------------------------------------------------
   * Datos semilla del panel (procesos en seguimiento)
   * -------------------------------------------------------------------- */
  const seedProcesses = [
    {
      id: "PN-ESBOL-MIC-013-2026",
      objeto: "Mantenimiento de sistemas de puesta a tierra",
      entidad: "Escuela de Policía Simón Bolívar",
      cuantia: 29223890,
      modalidad: "minima_cuantia",
      riesgo: "Medio",
      fecha: "2026-05-10",
    },
    {
      id: "SA-ALC-MED-220-2026",
      objeto: "Suministro de equipos de cómputo para sedes educativas",
      entidad: "Alcaldía de Medellín — Secretaría de Educación",
      cuantia: 480000000,
      modalidad: "seleccion_abreviada",
      riesgo: "Alto",
      fecha: "2026-05-06",
    },
    {
      id: "LP-GOB-CUN-051-2026",
      objeto: "Construcción de placa-huella en vías terciarias",
      entidad: "Gobernación de Cundinamarca",
      cuantia: 1750000000,
      modalidad: "licitacion",
      riesgo: "Medio",
      fecha: "2026-04-29",
    },
    {
      id: "CD-HOSP-CAL-009-2026",
      objeto: "Servicio de aseo y cafetería para sede hospitalaria",
      entidad: "Hospital Universitario del Valle",
      cuantia: 95400000,
      modalidad: "minima_cuantia",
      riesgo: "Bajo",
      fecha: "2026-04-22",
    },
  ];

  return {
    norms,
    jurisprudence,
    jurisById,
    rules,
    seedProcesses,
    disclaimer:
      "LICITA es una herramienta de apoyo. El análisis y los documentos generados " +
      "deben ser revisados por un profesional del derecho antes de su radicación.",
  };
})();
