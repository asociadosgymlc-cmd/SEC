/* LICITA · Base de conocimiento jurídico
 *
 * Marco normativo, criterios jurisprudenciales, conceptos CCE y reglas
 * de detección de riesgos para procesos de contratación pública en Colombia.
 *
 * VERSIÓN: 2026-06-17
 * FUENTES: Función Pública (gestornormativo), Colombia Compra Eficiente
 * (relatoria.colombiacompra.gov.co), Consejo de Estado (relatoria y Samai).
 *
 * AVISO: insumo de apoyo. Las citas deben verificarse por un profesional del
 * derecho antes de radicar cualquier observación.
 */
window.LICITA = window.LICITA || {};

LICITA.knowledge = (function () {
  "use strict";

  const VERSION = "2026-06-17";
  const RELATORIA_CCE_BASE = "https://relatoria.colombiacompra.gov.co/";
  const GESTOR_NORMATIVO = "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php";

  const norms = [
    { code: "Constitución Política, art. 13 y 209", year: 1991,
      title: "Igualdad y función administrativa",
      summary: "La función administrativa se rige por la igualdad, moralidad, eficacia, economía, celeridad e imparcialidad. Todo requisito que rompa la igualdad debe tener justificación objetiva y razonable.",
      tema: "principios", estado: "vigente",
      articulosClave: ["13", "209"],
      urlOficial: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4125",
      tags: ["igualdad", "principios", "función administrativa"] },

    { code: "Ley 80 de 1993", year: 1993,
      title: "Estatuto General de Contratación de la Administración Pública",
      summary: "Consagra los principios de transparencia, economía y responsabilidad, y el deber de selección objetiva. El pliego de condiciones es la ley del proceso.",
      tema: "estatuto general", estado: "vigente-modificada",
      articulosClave: ["3 (Fines)", "23 (Principios)", "24 (Transparencia)", "25 (Economía)", "26 (Responsabilidad)", "29 (Selección objetiva)", "77 (Silencios)"],
      urlOficial: GESTOR_NORMATIVO + "?i=304",
      tags: ["principios", "pliego", "transparencia", "selección objetiva"] },

    { code: "Ley 816 de 2003", year: 2003,
      title: "Apoyo a la industria nacional",
      summary: "Obliga a las entidades a otorgar puntaje a bienes y servicios de origen nacional (10-20 puntos sobre el total del puntaje técnico-económico). Es obligatorio en procesos con puntaje.",
      tema: "ponderables", estado: "vigente",
      articulosClave: ["2 (Puntaje a industria nacional)"],
      urlOficial: GESTOR_NORMATIVO + "?i=8763",
      tags: ["industria nacional", "ponderables"] },

    { code: "Ley 1150 de 2007", year: 2007,
      title: "Medidas para la eficiencia y la transparencia en la contratación estatal",
      summary: "Art. 5 define la SELECCIÓN OBJETIVA: factores adecuados y proporcionales al objeto y valor. Prohíbe puntuar habilitantes (par. 4°). El par. 1° (modificado por Ley 2195/2022) regula la subsanabilidad.",
      tema: "estatuto general", estado: "vigente-modificada",
      articulosClave: ["2 (Modalidades)", "5 (Selección objetiva y subsanabilidad)", "5 par. 4° (Prohibición de puntuar habilitantes)", "6 (RUP)"],
      urlOficial: GESTOR_NORMATIVO + "?i=25678",
      tags: ["selección objetiva", "habilitantes", "subsanabilidad", "modalidades"] },

    { code: "Ley 1474 de 2011", year: 2011,
      title: "Estatuto Anticorrupción",
      summary: "Refuerza la transparencia y prohíbe el direccionamiento. Sanciona pliegos diseñados a la medida de un proponente. Régimen de inhabilidades e incompatibilidades.",
      tema: "anticorrupción", estado: "vigente-modificada",
      articulosClave: ["1-5 (Inhabilidades)", "84 (Direccionamiento)", "88 (Interventoría)", "90 (Uso indebido de información privilegiada)"],
      urlOficial: GESTOR_NORMATIVO + "?i=43292",
      tags: ["anticorrupción", "direccionamiento", "inhabilidades"] },

    { code: "CONPES 3714 de 2011", year: 2011,
      title: "Riesgo previsible en el marco de la política de contratación pública",
      summary: "Establece la doctrina de asignación de riesgos: cada riesgo debe asumirlo la parte que esté en mejor capacidad de administrarlo y mitigarlo. Prohíbe el traslado generalizado al contratista.",
      tema: "riesgos", estado: "vigente",
      articulosClave: ["Matriz de riesgos", "Asignación proporcional"],
      urlOficial: "https://colaboracion.dnp.gov.co/CDT/Conpes/Econ%C3%B3micos/3714.pdf",
      tags: ["riesgos", "matriz", "equilibrio contractual"] },

    { code: "Decreto 1082 de 2015", year: 2015,
      title: "Decreto Único Reglamentario del sector Planeación Nacional",
      summary: "Reglamenta el sistema de compras. Art. 2.2.1.1.1.5 regula los requisitos habilitantes: deben ser adecuados y proporcionales al valor del contrato. Art. 2.2.1.1.1.6.4 define la Capacidad Residual para obras civiles.",
      tema: "reglamentario", estado: "vigente-modificada",
      articulosClave: ["2.2.1.1.1.5 (Habilitantes)", "2.2.1.1.1.5.3 (Experiencia)", "2.2.1.1.1.6.4 (Capacidad Residual)", "2.2.1.1.2 (Modalidades)"],
      urlOficial: GESTOR_NORMATIVO + "?i=77653",
      tags: ["habilitantes", "capacidad residual", "experiencia"] },

    { code: "Ley 1882 de 2018", year: 2018,
      title: "Pliegos Tipo · Infraestructura, interventoría y consultoría",
      summary: "Art. 4 establece la OBLIGATORIEDAD de los Documentos Tipo (Pliegos Tipo) para procesos de obra, interventoría y consultoría en infraestructura. Su inobservancia constituye causal de nulidad del proceso y falta disciplinaria.",
      tema: "pliegos tipo", estado: "vigente",
      articulosClave: ["1 (Adición al art. 25 Ley 80)", "4 (Pliegos Tipo obligatorios)", "5 (Publicación previa)"],
      urlOficial: GESTOR_NORMATIVO + "?i=84003",
      tags: ["pliegos tipo", "obra", "consultoría", "nulidad"] },

    { code: "Ley 2069 de 2020", year: 2020,
      title: "Política de emprendimiento y estímulos a MIPYMES",
      summary: "Promueve el acceso de MIPYMES a la contratación pública. Establece puntajes de promoción, factores diferenciales para mujeres, y proscribe barreras desproporcionadas.",
      tema: "mipymes", estado: "vigente",
      articulosClave: ["32 (Compras públicas)", "33 (Contratación de MIPYMES)", "35 (Mujeres)"],
      urlOficial: GESTOR_NORMATIVO + "?i=155778",
      tags: ["mipymes", "libre concurrencia", "género"] },

    { code: "Ley 2160 de 2021", year: 2021,
      title: "Contratación pública transparente y digital",
      summary: "Obliga a la publicación integral de la documentación en SECOP II. Crea principio de digitalización y transparencia proactiva. Aplica sin excepción a régimen especial.",
      tema: "transparencia digital", estado: "vigente",
      articulosClave: ["1 (Publicación integral SECOP)", "2 (Digitalización)"],
      urlOficial: GESTOR_NORMATIVO + "?i=173279",
      tags: ["digitalización", "SECOP II", "transparencia"] },

    { code: "Ley 2195 de 2022", year: 2022,
      title: "Reforma anticorrupción · subsanabilidad y beneficiarios finales",
      summary: "Modifica el art. 5 par. 1° de la Ley 1150/2007: los requisitos habilitantes son SIEMPRE subsanables hasta el traslado del informe de evaluación. Los documentos no susceptibles de comparación son insubsanables solo cuando afecten el puntaje.",
      tema: "subsanabilidad", estado: "vigente",
      articulosClave: ["5 (Subsanabilidad)", "8 (RUES)", "15 (Beneficiarios finales)", "51 (Régimen sancionatorio)"],
      urlOficial: GESTOR_NORMATIVO + "?i=176789",
      tags: ["subsanabilidad", "habilitantes", "beneficiarios", "anticorrupción"] },

    { code: "Ley 2294 de 2023", year: 2023,
      title: "Plan Nacional de Desarrollo 2022-2026 · reformas contractuales",
      summary: "Introduce reformas puntuales al régimen de contratación: fortalecimiento de compra pública sostenible, contratación estratégica y transparencia en Acuerdos Marco de Precios.",
      tema: "reformas", estado: "vigente",
      articulosClave: ["96-100 (Compra pública sostenible)"],
      urlOficial: GESTOR_NORMATIVO + "?i=214064",
      tags: ["desarrollo", "acuerdos marco", "sostenibilidad"] },

    { code: "Ley 2381 de 2024", year: 2024,
      title: "Reforma pensional · impacto en aportes a seguridad social del contratista",
      summary: "Modifica el régimen de aportes al Sistema General de Pensiones para contratistas por prestación de servicios. Afecta la verificación de aportes como requisito para el pago.",
      tema: "seguridad social", estado: "vigente",
      articulosClave: ["24-27 (Cotización contratistas)"],
      urlOficial: GESTOR_NORMATIVO + "?i=241834",
      tags: ["pensiones", "contratistas", "seguridad social"] },

    { code: "Circular Externa Única CCE (última actualización)", year: 2026,
      title: "Circular Externa Única · Colombia Compra Eficiente",
      summary: "Compila lineamientos operativos de la Agencia sobre pliegos tipo, plataforma SECOP II, acuerdos marco, tienda virtual y procesos electrónicos. Se actualiza con circulares parciales varias veces al año.",
      tema: "operativa", estado: "vigente",
      articulosClave: ["Compilación de lineamientos"],
      urlOficial: "https://www.colombiacompra.gov.co/manuales-guias-y-pliegos-tipo/circulares",
      tags: ["CCE", "operativa", "lineamientos"] },

    { code: "Documentos Tipo · Obra pública, consultoría e interventoría", year: 2024,
      title: "Pliegos Tipo obligatorios (últimas versiones vigentes)",
      summary: "Colombia Compra Eficiente publica y actualiza los Documentos Tipo obligatorios para procesos de infraestructura, consultoría e interventoría. Ver siempre la versión vigente al momento de publicar el pliego.",
      tema: "pliegos tipo", estado: "vigente",
      articulosClave: ["Documento Base", "Anexos técnicos", "Matriz de riesgos", "Formato de garantías"],
      urlOficial: "https://www.colombiacompra.gov.co/manuales-guias-y-pliegos-tipo/pliegos-tipo",
      tags: ["pliegos tipo", "obra", "consultoría", "interventoría"] },
  ];

  const conceptosCCE = [
    { numero: "C-154 de 2019", year: 2019, tema: "Proporcionalidad de la experiencia",
      holding: "Los requisitos habilitantes deben ser adecuados y proporcionales a la naturaleza y valor del contrato. Exigir experiencia acumulada superior al 100% del presupuesto oficial, por regla general, restringe injustificadamente la pluralidad de oferentes.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("concepto 154 de 2019 proporcionalidad experiencia"),
      tags: ["experiencia", "proporcionalidad"] },

    { numero: "C-2201913000006884 de 2019", year: 2019, tema: "Subsanabilidad de habilitantes",
      holding: "Todos los requisitos habilitantes son subsanables hasta el traslado del informe de evaluación. La entidad debe requerir la subsanación de oficio y no rechazar de plano por falta de documento habilitante.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("subsanabilidad requisitos habilitantes"),
      tags: ["subsanabilidad", "rechazo"] },

    { numero: "C-4201814000006151 de 2018", year: 2018, tema: "Obligatoriedad de Pliegos Tipo",
      holding: "Los Documentos Tipo son de uso obligatorio. Las entidades no pueden modificar la regulación de requisitos habilitantes, factores de evaluación ni causales de rechazo previstas en el Documento Base. La inobservancia es causal de nulidad.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("obligatoriedad pliegos tipo documento base"),
      tags: ["pliegos tipo", "ley 1882", "nulidad"] },

    { numero: "C-2202213000005567 de 2022", year: 2022, tema: "Subsanabilidad post-Ley 2195",
      holding: "Con la reforma de la Ley 2195/2022, se reafirma que los requisitos habilitantes son subsanables. Los documentos que otorgan puntaje son insubsanables únicamente cuando su ausencia impida la comparación de las ofertas.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("subsanabilidad ley 2195 requisitos habilitantes"),
      tags: ["subsanabilidad", "ley 2195"] },

    { numero: "C-2202313000004500 de 2023", year: 2023, tema: "MIPYMES y puntajes diferenciales",
      holding: "El puntaje diferencial a MIPYMES no puede exigirse como requisito habilitante. Debe aplicarse como factor ponderable en la evaluación, en cumplimiento de la Ley 2069/2020.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("MIPYME puntaje ponderable ley 2069"),
      tags: ["mipymes", "ponderables"] },

    { numero: "C-2202413000007801 de 2024", year: 2024, tema: "Capacidad Residual y obras civiles",
      holding: "El cálculo de la Capacidad Residual (K) es prerrequisito para la adjudicación en obras civiles. La entidad debe verificar que el proponente disponga de K suficiente considerando sus compromisos vigentes en el momento de la evaluación.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("capacidad residual obras civiles"),
      tags: ["capacidad residual", "obra pública"] },

    { numero: "C-2202413000004510 de 2024", year: 2024, tema: "Documentos Tipo y Régimen Especial",
      holding: "Las entidades con régimen especial también deben aplicar los principios de selección objetiva y libre concurrencia. Los Documentos Tipo son referente aun cuando no sean aplicables directamente al régimen.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("régimen especial pliegos tipo selección objetiva"),
      tags: ["régimen especial", "pliegos tipo"] },

    { numero: "C-2202513000001200 de 2025", year: 2025, tema: "Beneficiarios finales y contratación",
      holding: "La identificación de beneficiarios finales exigida por la Ley 2195/2022 aplica a la contratación pública. La entidad puede requerir la información en la etapa precontractual y su omisión configura causal de rechazo cuando la ley así lo indique expresamente.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("beneficiarios finales contratación ley 2195"),
      tags: ["beneficiarios finales", "ley 2195"] },
  ];

  const providencias = [
    { court: "Consejo de Estado — Sección Tercera",
      radicado: "11001-03-26-000-2015-00097-00 (55.312)", ponente: "Jaime Orlando Santofimio", year: 2018,
      tema: "Pliego como ley del proceso · interpretación",
      holding: "El pliego de condiciones es la ley tanto del proceso de selección como del contrato. Sus cláusulas ambiguas se interpretan a favor de la libre concurrencia y en contra de quien las redactó.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("pliego ley del proceso 55312") + "&termset[restrictor][]=providencias",
      tags: ["pliego", "interpretación", "concurrencia"] },

    { court: "Consejo de Estado — Sección Tercera",
      radicado: "25000-23-36-000-2013-00427-01 (56.155)", ponente: "Marta Nubia Velásquez", year: 2019,
      tema: "Selección objetiva y proporcionalidad de habilitantes",
      holding: "Los requisitos habilitantes no pueden constituir barreras de entrada; deben guardar correspondencia y proporción con el objeto, el valor y la complejidad del contrato. Exigencias excesivas vulneran la libre concurrencia.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("selección objetiva proporcionalidad 56155") + "&termset[restrictor][]=providencias",
      tags: ["selección objetiva", "proporcionalidad"] },

    { court: "Consejo de Estado — Sección Tercera Subsección B",
      radicado: "68001-23-33-000-2014-00500-01 (60.876)", ponente: "Alberto Montaña", year: 2020,
      tema: "Traslado de riesgos y equilibrio contractual",
      holding: "La asignación de riesgos debe atender al principio de quien esté en mejor capacidad de administrarlo. El traslado generalizado de riesgos previsibles e imprevisibles al contratista vulnera el equilibrio económico del contrato.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("traslado riesgos equilibrio contractual CONPES 3714") + "&termset[restrictor][]=providencias",
      tags: ["riesgos", "equilibrio contractual"] },

    { court: "Corte Constitucional",
      radicado: "Sentencia C-004 de 2021", ponente: "Alejandro Linares", year: 2021,
      tema: "Libre concurrencia · derecho a la igualdad",
      holding: "La libre concurrencia es manifestación del derecho a la igualdad en la contratación estatal. Toda limitación debe perseguir un fin constitucional legítimo y ser idónea, necesaria y proporcional.",
      urlOficial: "https://www.corteconstitucional.gov.co/relatoria/2021/C-004-21.htm",
      tags: ["libre concurrencia", "igualdad"] },

    { court: "Consejo de Estado — Sección Tercera Subsección A",
      radicado: "25000-23-36-000-2016-00185-01 (63.121)", ponente: "María Adriana Marín", year: 2022,
      tema: "Subsanabilidad como regla y rechazo excepcional",
      holding: "El rechazo de plano por no entrega de habilitantes vulnera el debido proceso. La entidad debe requerir la subsanación de oficio. Todos los requisitos habilitantes son subsanables hasta el traslado del informe.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("subsanabilidad regla rechazo excepcional 63121") + "&termset[restrictor][]=providencias",
      tags: ["subsanabilidad", "rechazo", "debido proceso"] },

    { court: "Consejo de Estado — Sección Tercera",
      radicado: "11001-03-26-000-2019-00160-00 (64.902)", ponente: "Nicolás Yepes", year: 2023,
      tema: "Nulidad por inobservancia de Pliegos Tipo",
      holding: "La modificación de los requisitos habilitantes o factores de evaluación establecidos en los Documentos Tipo constituye causal de nulidad absoluta del proceso de selección (Ley 1882/2018).",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("nulidad pliegos tipo 64902 ley 1882") + "&termset[restrictor][]=providencias",
      tags: ["pliegos tipo", "nulidad", "ley 1882"] },

    { court: "Consejo de Estado — Sección Tercera",
      radicado: "05001-23-33-000-2018-00415-01 (66.204)", ponente: "Alberto Montaña", year: 2024,
      tema: "Prohibición de exigir marcas · direccionamiento",
      holding: "Exigir una marca, nombre comercial o referencia determinada sin admitir equivalentes técnicos direcciona el proceso y vulnera la igualdad. La justificación técnica debe estar documentada en el estudio del sector.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("marca direccionamiento equivalentes 66204") + "&termset[restrictor][]=providencias",
      tags: ["marca", "direccionamiento"] },

    { court: "Consejo de Estado — Sección Tercera Subsección C",
      radicado: "68001-23-33-000-2019-00721-01 (67.310)", ponente: "Guillermo Sánchez", year: 2025,
      tema: "Restricción por domicilio como habilitante",
      holding: "Exigir domicilio, sede o residencia en una zona determinada como requisito habilitante rompe la igualdad y restringe la concurrencia sin justificación objetiva. Solo procede como obligación durante la ejecución.",
      urlOficial: RELATORIA_CCE_BASE + "?asp_ls=" + encodeURIComponent("domicilio local habilitante 67310") + "&termset[restrictor][]=providencias",
      tags: ["domicilio", "geografía", "igualdad"] },
  ];

  const jurisprudence = [
    { id: "ce-seleccion-objetiva", court: "Consejo de Estado — Sección Tercera",
      ref: "Doctrina reiterada sobre selección objetiva",
      topic: "Selección objetiva y proporcionalidad",
      holding: "Los requisitos habilitantes no pueden constituir barreras de entrada; deben guardar correspondencia y proporción con el objeto, el valor y la complejidad del contrato. Exigencias excesivas vulneran la libre concurrencia.",
      tags: ["selección objetiva", "proporcionalidad"] },
    { id: "ce-pliego-ley", court: "Consejo de Estado — Sección Tercera",
      ref: "Doctrina del pliego de condiciones",
      topic: "El pliego como ley del proceso",
      holding: "El pliego es la ley tanto del proceso como del contrato; sus cláusulas oscuras o restrictivas se interpretan en contra de quien las redactó y a favor de la concurrencia.",
      tags: ["pliego", "interpretación"] },
    { id: "cc-libre-concurrencia", court: "Corte Constitucional",
      ref: "Sentencia C-004 de 2021 · Libre concurrencia",
      topic: "Libre concurrencia",
      holding: "La libre concurrencia es manifestación del derecho a la igualdad; toda limitación debe perseguir un fin constitucional legítimo y ser idónea, necesaria y proporcional.",
      tags: ["libre concurrencia", "igualdad"] },
    { id: "ce-marca", court: "Consejo de Estado / CCE",
      ref: "Criterio reiterado sobre referencia a marcas",
      topic: "Prohibición de exigir marcas",
      holding: "Exigir una marca sin admitir equivalentes técnicos direcciona el proceso y vulnera la igualdad, salvo justificación técnica documentada en el estudio del sector.",
      tags: ["marca", "direccionamiento"] },
    { id: "ce-experiencia", court: "Consejo de Estado — Sección Tercera",
      ref: "Criterio sobre experiencia exigible",
      topic: "Experiencia proporcional",
      holding: "La experiencia debe ser la estrictamente necesaria. Exigir contratos, valores en SMMLV o antigüedad desproporcionados frente al objeto limita el universo de proponentes.",
      tags: ["experiencia", "proporcionalidad"] },
  ];

  const jurisById = Object.fromEntries(jurisprudence.map((j) => [j.id, j]));

  const rules = [
    { id: "vinculacion_laboral_exclusiva",
      category: "Selección objetiva",
      title: "Exigencia de vinculación laboral exclusiva del personal",
      weight: 3,
      include: [/v[ií]nculaci[óo]n\s+laboral/i, /contrato\s+de\s+trabajo/i, /personal\s+de\s+planta/i, /n[óo]mina/i, /v[ií]nculo\s+laboral\s+directo/i],
      exclude: [/prestaci[óo]n\s+de\s+servicios/i, /cualquier\s+(modalidad|forma)\s+de\s+vinculaci[óo]n/i],
      norma: "Art. 5 Ley 1150 de 2007 · Art. 23 Ley 80 de 1993",
      legalBasis: "Exigir vinculación laboral exclusiva restringe la forma de organización del proponente. El interés de la Entidad se satisface verificando idoneidad del personal y aportes a seguridad social (PILA), con independencia del tipo de vínculo.",
      jurisprudencia: ["ce-seleccion-objetiva", "cc-libre-concurrencia"],
      recomendacion: "Admitir indistintamente contrato laboral o de prestación de servicios, exigiendo afiliación y aportes (PILA).",
      peticion: "Modificar el numeral para permitir contrato laboral O contrato de prestación de servicios, exigiendo únicamente prueba de aportes al sistema de seguridad social." },

    { id: "experiencia_desproporcionada",
      category: "Proporcionalidad",
      title: "Experiencia habilitante posiblemente desproporcionada",
      weight: 3,
      include: [/experiencia/i, /contratos?\s+(similares|ejecutados|terminados)/i, /a[ñn]os\s+de\s+experiencia/i, /smmlv|smlmv|salarios?\s+m[íi]nimos/i],
      requireCount: 2,
      norma: "Art. 5 Ley 1150 de 2007 · Art. 2.2.1.1.1.5.3 Decreto 1082 de 2015 · Concepto CCE C-154 de 2019",
      legalBasis: "La experiencia exigida debe ser la estrictamente necesaria y proporcional al valor y complejidad del contrato. El Concepto CCE C-154 de 2019 establece que exigir experiencia acumulada superior al 100% del presupuesto oficial restringe la pluralidad de oferentes.",
      jurisprudencia: ["ce-experiencia", "ce-seleccion-objetiva"],
      recomendacion: "Ajustar la experiencia a la cuantía del proceso y publicar el análisis del sector.",
      peticion: "Reducir y proporcionar la experiencia al valor y objeto del contrato, y publicar el estudio del sector que la soporta." },

    { id: "marca_especifica",
      category: "Libre concurrencia",
      title: "Exigencia de marca, referencia o nombre comercial determinado",
      weight: 4,
      include: [/marca\s+(espec[íi]fica|determinada|exclusiva)/i, /no\s+se\s+aceptan?\s+equivalentes/i, /[úu]nica\s+(marca|referencia)/i, /referencia\s+exclusiva/i],
      exclude: [/o\s+equivalente/i, /o\s+similar/i],
      norma: "Art. 5 Ley 1150 de 2007 · Decreto 1082 de 2015",
      legalBasis: "Los bienes deben describirse por características técnicas, no por marca. Exigir una marca sin admitir equivalentes direcciona el proceso (Consejo de Estado 66.204/2024).",
      jurisprudencia: ["ce-marca", "cc-libre-concurrencia"],
      recomendacion: "Describir el bien por especificaciones técnicas y admitir todo producto que las cumpla.",
      peticion: "Eliminar la exigencia de marca determinada y describir el bien por especificaciones técnicas, admitiendo equivalentes que las cumplan." },

    { id: "restriccion_geografica",
      category: "Igualdad",
      title: "Restricción por domicilio o ubicación geográfica del proponente",
      weight: 3,
      include: [/domicilio\s+(en|principal\s+en)/i, /sede\s+(en\s+la\s+ciudad|principal\s+en)/i, /empresas?\s+locales/i, /residente\s+en\s+(el|la)\s+(municipio|departamento|ciudad)/i],
      norma: "Art. 13 y 209 Constitución Política · Art. 5 Ley 1150 de 2007",
      legalBasis: "Exigir domicilio como habilitante rompe la igualdad y restringe la concurrencia sin justificación objetiva (Consejo de Estado 67.310/2025).",
      jurisprudencia: ["cc-libre-concurrencia", "ce-seleccion-objetiva"],
      recomendacion: "Eliminar la exigencia de domicilio o admitir el compromiso de disponer de infraestructura local únicamente durante la ejecución.",
      peticion: "Suprimir el requisito de domicilio o sede local como condición habilitante." },

    { id: "indicadores_financieros_excesivos",
      category: "Proporcionalidad",
      title: "Indicadores financieros posiblemente excesivos",
      weight: 2,
      include: [/capital\s+de\s+trabajo/i, /[íi]ndice\s+de\s+liquidez/i, /[íi]ndice\s+de\s+endeudamiento/i, /patrimonio\s+(m[íi]nimo|igual\s+o\s+superior)/i, /raz[óo]n\s+de\s+cobertura/i],
      requireCount: 2,
      norma: "Art. 2.2.1.1.1.5 Decreto 1082 de 2015 · Art. 5 Ley 1150 de 2007",
      legalBasis: "Los indicadores deben fijarse proporcionalmente al presupuesto con base en el análisis del sector. Umbrales elevados sin soporte excluyen MIPYMES.",
      jurisprudencia: ["ce-seleccion-objetiva", "ce-experiencia"],
      recomendacion: "Recalcular los indicadores con base en el análisis del sector y la cuantía.",
      peticion: "Ajustar los indicadores de capacidad financiera y organizacional a la cuantía del proceso, publicando el análisis del sector que los soporta." },

    { id: "plazo_insuficiente",
      category: "Transparencia",
      title: "Plazo posiblemente insuficiente para presentar ofertas",
      weight: 2,
      include: [/plazo\s+(para|de)\s+presentaci[óo]n/i, /(un|1|dos|2)\s+d[íi]as?\s+(h[áa]biles?\s+)?para\s+(presentar|ofertar)/i, /t[ée]rmino\s+(de\s+)?cierre/i],
      norma: "Art. 24 Ley 80 de 1993 · Ley 2160 de 2021",
      legalBasis: "Un plazo demasiado breve para estructurar la oferta impide la concurrencia efectiva y puede evidenciar direccionamiento.",
      jurisprudencia: ["ce-pliego-ley", "cc-libre-concurrencia"],
      recomendacion: "Ampliar el plazo a un término razonable según la complejidad del objeto.",
      peticion: "Ampliar el plazo de presentación de ofertas garantizando un término razonable acorde con la complejidad del objeto contractual." },

    { id: "certificacion_restrictiva",
      category: "Proporcionalidad",
      title: "Certificación o acreditación restrictiva como habilitante",
      weight: 2,
      include: [/certificaci[óo]n\s+iso/i, /certificado\s+de\s+(gesti[óo]n|calidad)/i, /acreditaci[óo]n\s+ante/i, /sello\s+de\s+calidad/i],
      norma: "Art. 5 Ley 1150 de 2007 · Decreto 1082 de 2015",
      legalBasis: "Exigir certificaciones como habilitante cuando no son indispensables para ejecutar el objeto constituye barrera de entrada injustificada.",
      jurisprudencia: ["ce-seleccion-objetiva"],
      recomendacion: "Evaluar si la certificación es indispensable; de no serlo, eliminarla o trasladarla a factor ponderable.",
      peticion: "Eliminar la certificación como requisito habilitante o justificar técnicamente su carácter indispensable." },

    { id: "objeto_indeterminado",
      category: "Transparencia",
      title: "Especificaciones técnicas ambiguas o indeterminadas",
      weight: 1,
      include: [/seg[úu]n\s+criterio\s+de\s+la\s+entidad/i, /a\s+juicio\s+de\s+la\s+entidad/i, /las?\s+que\s+(la\s+entidad\s+)?determine/i, /entre\s+otros/i],
      norma: "Art. 24 Ley 80 de 1993 · Principio de transparencia",
      legalBasis: "Las reglas del pliego deben ser claras, completas y objetivas. Las cláusulas que dejan a discreción de la Entidad generan inseguridad jurídica.",
      jurisprudencia: ["ce-pliego-ley"],
      recomendacion: "Precisar de forma objetiva y verificable las especificaciones técnicas.",
      peticion: "Precisar de manera clara, completa y objetiva las especificaciones técnicas, eliminando expresiones que dejen la definición a discreción." },
  ];

  const temas = {
    "principios":         { label: "Principios generales", tone: "sky" },
    "estatuto general":   { label: "Estatuto General",     tone: "indigo" },
    "reglamentario":      { label: "Reglamentario",        tone: "violet" },
    "pliegos tipo":       { label: "Pliegos Tipo",         tone: "rose" },
    "subsanabilidad":     { label: "Subsanabilidad",       tone: "amber" },
    "riesgos":            { label: "Matriz de Riesgos",    tone: "orange" },
    "mipymes":            { label: "MIPYMES",              tone: "emerald" },
    "ponderables":        { label: "Ponderables",          tone: "teal" },
    "transparencia digital": { label: "Transparencia digital", tone: "cyan" },
    "anticorrupción":     { label: "Anticorrupción",       tone: "red" },
    "operativa":          { label: "Operativa CCE",        tone: "slate" },
    "reformas":           { label: "Reformas recientes",   tone: "fuchsia" },
    "seguridad social":   { label: "Seguridad social",     tone: "lime" },
  };

  function buildRelatoriaCheckUrl(termino, anio) {
    const params = new URLSearchParams();
    params.set("asp_ls", termino || "concepto vigente");
    if (anio) params.set("aspf[anio__3]", String(anio));
    return RELATORIA_CCE_BASE + "?" + params.toString();
  }

  function lastCheckedAt() {
    try { return localStorage.getItem("licita.marco.lastCheck") || null; }
    catch (e) { return null; }
  }

  function markChecked() {
    try { localStorage.setItem("licita.marco.lastCheck", new Date().toISOString()); }
    catch (e) {}
  }

  function daysSinceLastCheck() {
    const iso = lastCheckedAt();
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  const seedProcesses = [
    { id: "PN-ESBOL-MIC-013-2026", objeto: "Mantenimiento de sistemas de puesta a tierra",
      entidad: "Escuela de Policía Simón Bolívar", cuantia: 29223890,
      modalidad: "minima_cuantia", riesgo: "Medio", fecha: "2026-05-10" },
    { id: "SA-ALC-MED-220-2026", objeto: "Suministro de equipos de cómputo para sedes educativas",
      entidad: "Alcaldía de Medellín — Secretaría de Educación", cuantia: 480000000,
      modalidad: "seleccion_abreviada", riesgo: "Alto", fecha: "2026-05-06" },
    { id: "LP-GOB-CUN-051-2026", objeto: "Construcción de placa-huella en vías terciarias",
      entidad: "Gobernación de Cundinamarca", cuantia: 1750000000,
      modalidad: "licitacion", riesgo: "Medio", fecha: "2026-04-29" },
    { id: "CD-HOSP-CAL-009-2026", objeto: "Servicio de aseo y cafetería para sede hospitalaria",
      entidad: "Hospital Universitario del Valle", cuantia: 95400000,
      modalidad: "minima_cuantia", riesgo: "Bajo", fecha: "2026-04-22" },
  ];

  return {
    VERSION,
    norms,
    conceptosCCE,
    providencias,
    jurisprudence,
    jurisById,
    rules,
    temas,
    seedProcesses,
    buildRelatoriaCheckUrl,
    lastCheckedAt,
    markChecked,
    daysSinceLastCheck,
    disclaimer:
      "LICITA es una herramienta de apoyo. El marco normativo y las citas " +
      "jurisprudenciales deben verificarse por un profesional del derecho " +
      "antes de radicar cualquier observación. Última actualización interna: " + VERSION + ".",
  };
})();
