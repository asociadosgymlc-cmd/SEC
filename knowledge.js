/* LICITA · Base de conocimiento jurídico
 * Marco normativo, criterios jurisprudenciales y reglas de detección de
 * riesgos para procesos de contratación pública en Colombia.
 *
 * Estructura por DIMENSIONES de evaluación:
 *   · habilitantes      — Requisitos financieros, organizacionales, experiencia
 *   · ponderables       — Factores de puntaje (técnico, MIPYME, industria nal.)
 *   · causalesRechazo   — Subsanabilidad (Ley 2195/2022)
 *   · pliegosTipo       — Validación estricta vs Documento Base (Ley 1882/2018)
 *   · riesgos           — Matriz de asignación (CONPES 3714)
 *   · transparencia     — Claridad, plazos, especificaciones
 *
 * Cada regla declara su `dimension` para análisis estratificado.
 *
 * AVISO: insumo de apoyo. Las citas deben verificarse por un profesional del
 * derecho antes de radicar cualquier observación.
 */
window.LICITA = window.LICITA || {};

LICITA.knowledge = (function () {
  "use strict";

  /* ----------------------------------------------------------------------
   * Marco normativo
   * -------------------------------------------------------------------- */
  const norms = [
    { code: "Ley 80 de 1993", title: "Estatuto General de Contratación de la Administración Pública",
      summary: "Consagra los principios de transparencia, economía y responsabilidad, y el deber de selección objetiva. El pliego de condiciones es la ley del proceso.",
      tags: ["principios", "pliego", "transparencia"] },
    { code: "Ley 1150 de 2007", title: "Medidas de eficiencia y transparencia en la contratación estatal",
      summary: "Art. 5 define la SELECCIÓN OBJETIVA: factores adecuados y proporcionales. Prohíbe puntuar habilitantes. Art. 5 par. 1° (modificado por Ley 2195/2022) regula la subsanabilidad.",
      tags: ["selección objetiva", "habilitantes", "subsanabilidad"] },
    { code: "Ley 1474 de 2011", title: "Estatuto Anticorrupción",
      summary: "Refuerza la transparencia y prohíbe el direccionamiento. Sanciona pliegos diseñados a la medida de un proponente.",
      tags: ["anticorrupción", "direccionamiento"] },
    { code: "Ley 1882 de 2018", title: "Pliegos Tipo en infraestructura, interventoría y consultoría",
      summary: "Art. 4 establece la obligatoriedad de los Documentos Tipo (Pliegos Tipo) para los procesos de obra, interventoría y consultoría en infraestructura. La inobservancia constituye causal de nulidad del proceso.",
      tags: ["pliegos tipo", "obra", "nulidad"] },
    { code: "Ley 2069 de 2020", title: "Política de emprendimiento y estímulos a MIPYMES",
      summary: "Promueve el acceso de MIPYMES a la contratación pública. Establece puntajes de promoción en factores ponderables y proscribe barreras desproporcionadas que limiten la concurrencia.",
      tags: ["mipymes", "ponderables", "libre concurrencia"] },
    { code: "Ley 2195 de 2022", title: "Reforma anticorrupción · subsanabilidad",
      summary: "Modifica el art. 5 de la Ley 1150/2007: los requisitos habilitantes son SIEMPRE subsanables hasta el traslado del informe de evaluación. Los documentos no susceptibles de comparación o calificación son insubsanables únicamente cuando afecten la asignación de puntaje.",
      tags: ["subsanabilidad", "habilitantes", "rechazo"] },
    { code: "Decreto 1082 de 2015", title: "Decreto Único Reglamentario del sector Planeación",
      summary: "Art. 2.2.1.1.1.5 reglamenta los requisitos habilitantes. Deben ser adecuados y proporcionales al valor del contrato. Define la fórmula de Capacidad Residual para obras civiles (art. 2.2.1.1.1.6.4).",
      tags: ["habilitantes", "capacidad residual", "experiencia"] },
    { code: "Ley 816 de 2003", title: "Apoyo a la industria nacional",
      summary: "Obliga a las entidades a otorgar puntaje a los bienes y servicios de origen nacional (entre 10 y 20 puntos sobre el total).",
      tags: ["ponderables", "industria nacional"] },
    { code: "CONPES 3714 de 2011", title: "Documento CONPES sobre riesgo previsible en contratación pública",
      summary: "Establece la doctrina de asignación de riesgos: cada riesgo debe asumirlo la parte que esté en mejor capacidad de administrarlo y mitigarlo. Prohíbe el traslado generalizado de riesgos al contratista.",
      tags: ["riesgos", "matriz", "previsibles"] },
    { code: "Constitución Política, art. 13 y 209", title: "Igualdad y función administrativa",
      summary: "La función administrativa se desarrolla con fundamento en la igualdad, moralidad, eficacia e imparcialidad.",
      tags: ["igualdad", "principios"] },
    { code: "Colombia Compra Eficiente — Guías y conceptos", title: "Lineamientos de la Agencia Nacional de Contratación",
      summary: "Concepto CCE 154/2019 establece que la experiencia acumulada superior al 100% del presupuesto oficial restringe injustificadamente la pluralidad de oferentes. Resoluciones de adopción de Pliegos Tipo.",
      tags: ["guías", "buenas prácticas", "concepto 154"] },
  ];

  /* ----------------------------------------------------------------------
   * Criterios jurisprudenciales / doctrinales
   * -------------------------------------------------------------------- */
  const jurisprudence = [
    { id: "ce-seleccion-objetiva", court: "Consejo de Estado — Sección Tercera",
      ref: "Doctrina reiterada sobre selección objetiva", topic: "Selección objetiva y proporcionalidad",
      holding: "Los requisitos habilitantes no pueden constituir barreras de entrada; deben guardar correspondencia y proporción con el objeto, el valor y la complejidad del contrato. Exigencias excesivas vulneran la libre concurrencia.",
      tags: ["selección objetiva", "proporcionalidad"] },
    { id: "ce-pliego-ley", court: "Consejo de Estado — Sección Tercera",
      ref: "Doctrina del pliego de condiciones", topic: "El pliego como ley del proceso",
      holding: "El pliego es la ley del proceso y del contrato; sus cláusulas oscuras o restrictivas se interpretan en contra de quien las redactó y a favor de la concurrencia.",
      tags: ["pliego", "interpretación"] },
    { id: "cc-libre-concurrencia", court: "Corte Constitucional",
      ref: "Doctrina sobre libre concurrencia e igualdad", topic: "Libre concurrencia",
      holding: "La libre concurrencia es manifestación del derecho a la igualdad en la contratación estatal; toda limitación debe perseguir un fin constitucional legítimo y ser idónea, necesaria y proporcional.",
      tags: ["libre concurrencia", "igualdad"] },
    { id: "ce-marca", court: "Consejo de Estado / CCE", ref: "Criterio sobre referencia a marcas",
      topic: "Prohibición de exigir marcas",
      holding: "Exigir una marca, nombre comercial o referencia determinada sin admitir equivalentes direcciona el proceso y vulnera la igualdad, salvo justificación técnica documentada.",
      tags: ["marca", "direccionamiento"] },
    { id: "ce-experiencia", court: "Consejo de Estado — Sección Tercera",
      ref: "Criterio sobre experiencia exigible", topic: "Experiencia proporcional",
      holding: "La experiencia debe ser la estrictamente necesaria. Exigir un número de contratos, valores en SMMLV o antigüedad desproporcionados frente al objeto limita injustificadamente el universo de proponentes.",
      tags: ["experiencia", "proporcionalidad"] },
    { id: "cce-154-2019", court: "Colombia Compra Eficiente",
      ref: "Concepto CCE 154 de 2019", topic: "Proporcionalidad de la experiencia",
      holding: "Los requisitos habilitantes deben ser adecuados y proporcionales a la naturaleza y valor del contrato. Exigir experiencia acumulada superior al 100% del presupuesto oficial, por regla general, restringe injustificadamente la pluralidad de oferentes.",
      tags: ["experiencia", "proporcionalidad", "concepto"] },
    { id: "cce-pliego-tipo", court: "Colombia Compra Eficiente",
      ref: "Resoluciones de adopción de Pliegos Tipo", topic: "Obligatoriedad e inalterabilidad de los Documentos Tipo",
      holding: "Los Documentos Tipo son de uso obligatorio. Las entidades no pueden modificar la regulación de requisitos habilitantes, factores de evaluación, ni causales de rechazo previstas en el Documento Base. La inobservancia es causal de nulidad del proceso.",
      tags: ["pliegos tipo", "ley 1882"] },
    { id: "ce-subsanabilidad", court: "Consejo de Estado — Sección Tercera",
      ref: "Doctrina sobre subsanabilidad (Ley 2195/2022)", topic: "Subsanabilidad de habilitantes",
      holding: "Todos los requisitos habilitantes y los documentos que los soportan son subsanables hasta el traslado del informe de evaluación. Solo es insubsanable lo que afecte la comparación o asignación de puntaje. El rechazo de plano por no entrega de habilitantes vulnera el debido proceso.",
      tags: ["subsanabilidad", "rechazo", "ley 2195"] },
    { id: "ce-riesgo-previsible", court: "Consejo de Estado — Sección Tercera",
      ref: "Doctrina sobre asignación de riesgos contractuales", topic: "Matriz de riesgos previsibles",
      holding: "La asignación de riesgos debe atender al principio de quien esté en mejor capacidad de administrar y mitigar el riesgo (CONPES 3714). El traslado generalizado de riesgos previsibles e imprevisibles al contratista vulnera el equilibrio contractual.",
      tags: ["riesgos", "equilibrio contractual", "conpes 3714"] },
  ];

  const jurisById = Object.fromEntries(jurisprudence.map((j) => [j.id, j]));

  /* ----------------------------------------------------------------------
   * Helper para construir reglas con dimensión
   * -------------------------------------------------------------------- */
  function rule(o) { return o; }

  /* ----------------------------------------------------------------------
   * REGLAS POR DIMENSIÓN
   * weight: 1 leve · 2 moderado · 3 serio · 4 crítico · 5 CRÍTICO PT
   * -------------------------------------------------------------------- */

  // 1) HABILITANTES — financieros, organizacionales y experiencia
  const habilitantes = [
    rule({
      id: "vinculacion_laboral_exclusiva",
      dimension: "habilitantes",
      category: "Selección objetiva · Personal",
      title: "Exigencia de vinculación laboral exclusiva del personal",
      weight: 3,
      include: [
        /v[ií]nculaci[óo]n\s+laboral/i, /contrato\s+de\s+trabajo/i,
        /personal\s+de\s+planta/i, /n[óo]mina/i, /v[ií]nculo\s+laboral\s+directo/i,
      ],
      exclude: [/prestaci[óo]n\s+de\s+servicios/i, /cualquier\s+(modalidad|forma)\s+de\s+vinculaci[óo]n/i],
      norma: "Art. 5 Ley 1150 de 2007 · Art. 23 Ley 80 de 1993",
      legalBasis: "Exigir vinculación laboral exclusiva restringe la forma de organización del proponente. El interés de la Entidad se satisface verificando idoneidad del personal y aportes a seguridad social (PILA), con independencia del tipo de vínculo.",
      jurisprudencia: ["ce-seleccion-objetiva", "cc-libre-concurrencia"],
      recomendacion: "Admitir indistintamente contrato laboral o de prestación de servicios, exigiendo afiliación y aportes (PILA).",
      peticion: "Modificar el numeral para permitir contrato laboral O contrato de prestación de servicios, exigiendo únicamente prueba de aportes al sistema de seguridad social.",
      estrategiaDefensa: "Si la entidad insiste, argumentar que el art. 17 de la Ley 80 establece la libertad de formas para el cumplimiento del objeto contractual.",
    }),

    rule({
      id: "experiencia_desproporcionada",
      dimension: "habilitantes",
      category: "Habilitantes · Experiencia",
      title: "Experiencia habilitante posiblemente desproporcionada",
      weight: 3,
      include: [
        /experiencia/i, /contratos?\s+(similares|ejecutados|terminados)/i,
        /a[ñn]os\s+de\s+experiencia/i, /smmlv|smlmv|salarios?\s+m[íi]nimos/i,
      ],
      requireCount: 2,
      norma: "Art. 5 Ley 1150 de 2007 · Art. 2.2.1.1.1.5.3 Decreto 1082 de 2015",
      legalBasis: "La experiencia exigida debe ser la estrictamente necesaria y proporcional al valor y complejidad del contrato. Concepto CCE 154 de 2019: la experiencia acumulada >100% del presupuesto oficial restringe la pluralidad.",
      jurisprudencia: ["ce-experiencia", "cce-154-2019"],
      recomendacion: "Ajustar la experiencia a la cuantía del proceso y publicar el análisis del sector.",
      peticion: "Reducir y proporcionar la experiencia al valor y objeto del contrato, y publicar el estudio del sector que la soporta.",
    }),

    rule({
      id: "exp_proporcionalidad_parametrica",
      dimension: "habilitantes",
      category: "Habilitantes · Experiencia paramétrica",
      title: "Experiencia exigida supera el 100% del presupuesto oficial",
      weight: 4,
      include: [
        /(?:experiencia|cuantia|cuant[íi]a).*?(?:sume|sumen|igual\s+o\s+superior|m[íi]nimo).*?\b(1[2-9]\d|2\d\d|3\d\d)\s*%/i,
        /\b(1[5-9]\d|2\d\d)\s*%\s*(?:del\s+)?(?:presupuesto|valor|cuant[íi]a)/i,
        /(?:dos|tres)\s+veces?\s+(?:el\s+)?(?:presupuesto|valor)\s+(?:oficial|del\s+contrato)/i,
      ],
      norma: "Concepto CCE 154 de 2019 · Art. 2.2.1.1.1.5.3 Decreto 1082 de 2015",
      legalBasis: "Exigir experiencia acumulada superior al 100% del presupuesto oficial (e.g. 150%, 200%) carece de justificación técnica y restringe injustificadamente la pluralidad de oferentes. CCE ha sido consistente: la experiencia debe ser adecuada, NO superlativa.",
      jurisprudencia: ["cce-154-2019", "ce-experiencia"],
      recomendacion: "Limitar la suma de los contratos exigidos al 100% del presupuesto oficial estimado.",
      peticion: "Modificar el numeral para que la sumatoria de la experiencia acreditable no supere el 100% del presupuesto oficial, en línea con el Concepto CCE 154 de 2019.",
      estrategiaDefensa: "Si la entidad pretende justificar la exigencia, exigir publicación del estudio del sector que la soporte. Sin estudio = vicio de motivación.",
    }),

    rule({
      id: "indicadores_financieros_excesivos",
      dimension: "habilitantes",
      category: "Habilitantes · Indicadores financieros",
      title: "Indicadores financieros posiblemente excesivos",
      weight: 3,
      include: [
        /capital\s+de\s+trabajo/i, /[íi]ndice\s+de\s+liquidez/i,
        /[íi]ndice\s+de\s+endeudamiento/i, /patrimonio\s+(m[íi]nimo|igual\s+o\s+superior)/i,
        /raz[óo]n\s+de\s+cobertura/i,
      ],
      requireCount: 2,
      norma: "Art. 2.2.1.1.1.5 Decreto 1082 de 2015 · Art. 5 Ley 1150 de 2007",
      legalBasis: "Los indicadores deben fijarse de forma proporcional al presupuesto del contrato, con base en el análisis del sector. Umbrales elevados sin soporte excluyen MIPYMES sin razón objetiva.",
      jurisprudencia: ["ce-seleccion-objetiva", "ce-experiencia"],
      recomendacion: "Recalcular los indicadores con base en el análisis del sector y la cuantía.",
      peticion: "Ajustar los indicadores de capacidad financiera y organizacional a la cuantía del proceso, publicando el análisis del sector que los soporta.",
    }),

    rule({
      id: "certificacion_restrictiva",
      dimension: "habilitantes",
      category: "Habilitantes · Certificaciones",
      title: "Certificación o acreditación restrictiva como habilitante",
      weight: 2,
      include: [
        /certificaci[óo]n\s+iso/i, /certificado\s+de\s+(gesti[óo]n|calidad)/i,
        /acreditaci[óo]n\s+ante/i, /sello\s+de\s+calidad/i,
      ],
      norma: "Art. 5 Ley 1150 de 2007 · Decreto 1082 de 2015",
      legalBasis: "Exigir certificaciones de calidad como requisito habilitante, cuando no son indispensables para ejecutar el objeto, constituye barrera de entrada injustificada.",
      jurisprudencia: ["ce-seleccion-objetiva"],
      recomendacion: "Evaluar si la certificación es indispensable; de no serlo, eliminarla o trasladarla a factor ponderable.",
      peticion: "Eliminar la certificación como requisito habilitante o justificar técnicamente su carácter indispensable.",
    }),

    rule({
      id: "restriccion_geografica",
      dimension: "habilitantes",
      category: "Igualdad · Geografía",
      title: "Restricción por domicilio o ubicación geográfica del proponente",
      weight: 3,
      include: [
        /domicilio\s+(en|principal\s+en)/i, /sede\s+(en\s+la\s+ciudad|principal\s+en)/i,
        /empresas?\s+locales/i, /residente\s+en\s+(el|la)\s+(municipio|departamento|ciudad)/i,
      ],
      norma: "Art. 13 y 209 Constitución Política · Art. 5 Ley 1150 de 2007",
      legalBasis: "Exigir domicilio o residencia en una zona determinada como habilitante rompe la igualdad y restringe la concurrencia sin justificación objetiva.",
      jurisprudencia: ["cc-libre-concurrencia", "ce-seleccion-objetiva"],
      recomendacion: "Eliminar la exigencia de domicilio o admitir el compromiso de disponer de infraestructura local únicamente durante la ejecución.",
      peticion: "Suprimir el requisito de domicilio o sede local como condición habilitante.",
    }),
  ];

  // 2) PONDERABLES — factores de puntaje
  const ponderables = [
    rule({
      id: "ponderable_no_industria_nacional",
      dimension: "ponderables",
      category: "Ponderables · Industria nacional",
      title: "Ausencia o puntaje insuficiente para industria nacional",
      weight: 3,
      include: [
        /no\s+(?:aplica|aplicar[áa])\s+(?:el\s+)?(?:apoyo|puntaje)\s+(?:a\s+la\s+)?industria\s+nacional/i,
        /sin\s+puntaje\s+(?:de|a)\s+industria\s+nacional/i,
        /industria\s+nacional[^.]{0,40}\b(0|cero|no\s+aplica)\b/i,
      ],
      norma: "Ley 816 de 2003",
      legalBasis: "Es obligación legal otorgar puntaje a bienes y servicios de origen nacional, entre 10 y 20 puntos sobre el total del puntaje técnico-económico. La omisión vulnera la Ley 816.",
      jurisprudencia: ["ce-pliego-ley"],
      recomendacion: "Incluir el puntaje obligatorio de industria nacional, entre 10 y 20 puntos.",
      peticion: "Incluir el factor de apoyo a la industria nacional (Ley 816/2003) con un puntaje no inferior al 10% del total, conforme al artículo 2 de la Ley 816.",
    }),

    rule({
      id: "ponderable_mipyme_no_puntaje",
      dimension: "ponderables",
      category: "Ponderables · MIPYMES",
      title: "Ausencia de estímulos a MIPYMES en los factores de puntaje",
      weight: 3,
      include: [
        /no\s+(?:aplica|otorga|otorgar[áa])\s+(?:puntaje|estimulo|est[íi]mulo)\s+(?:a\s+)?(?:mipymes|mype|pymes)/i,
        /sin\s+(?:est[íi]mulos?|puntaje)\s+(?:para|a)\s+(?:mipymes|mype)/i,
        /mipymes[^.]{0,40}\b(0|no\s+aplica|no\s+otorga)\b/i,
      ],
      norma: "Art. 32 y ss. Ley 2069 de 2020 · Decreto 1860 de 2021",
      legalBasis: "La Ley 2069/2020 obliga a estimular el acceso de MIPYMES a la contratación pública mediante puntajes adicionales en los factores de evaluación.",
      jurisprudencia: ["cc-libre-concurrencia"],
      recomendacion: "Incluir el estímulo a MIPYMES en los factores ponderables conforme al Decreto 1860/2021.",
      peticion: "Incorporar el estímulo a MIPYMES en los factores de evaluación, conforme a la Ley 2069 de 2020 y al Decreto 1860 de 2021.",
    }),

    rule({
      id: "ponderable_puntaje_habilitante",
      dimension: "ponderables",
      category: "Ponderables · Confusión con habilitantes",
      title: "Asignación de puntaje a requisitos habilitantes",
      weight: 4,
      include: [
        /se\s+otorgar[áa]?\s+puntaje\s+(?:a|por)\s+(?:experiencia|certificaci[óo]n|patrimonio|capacidad)/i,
        /puntaje\s+adicional\s+por\s+(?:experiencia\s+(?:adicional|mayor))/i,
        /puntos?\s+por\s+(?:contratos?|a[ñn]os)\s+(?:adicionales|de\s+experiencia)/i,
      ],
      norma: "Art. 5 par. 4° Ley 1150 de 2007",
      legalBasis: "Está expresamente prohibido otorgar puntaje a los requisitos habilitantes. Si la experiencia o un indicador financiero ya fue exigido como habilitante, no puede convertirse en factor de puntaje.",
      jurisprudencia: ["ce-seleccion-objetiva", "ce-pliego-ley"],
      recomendacion: "Trasladar la exigencia a habilitante únicamente, o reemplazar el ponderable por uno técnico independiente.",
      peticion: "Eliminar el puntaje por requisitos habilitantes, conforme al parágrafo 4° del art. 5 de la Ley 1150 de 2007.",
    }),
  ];

  // 3) CAUSALES DE RECHAZO — Subsanabilidad (Ley 2195/2022)
  const causalesRechazo = [
    rule({
      id: "subsanabilidad_violada_habilitantes",
      dimension: "causalesRechazo",
      category: "Causales de rechazo · Subsanabilidad",
      title: "Causal de rechazo por no presentación de documento subsanable",
      weight: 4,
      include: [
        /(?:no\s+presentaci[óo]n|ausencia|omisi[óo]n).*?(?:ser[áa]|constituir[áa]?)\s+causal\s+de\s+rechazo/i,
        /se\s+rechazar[áa]?\s+la\s+oferta\s+(?:si|cuando)\s+no\s+(?:se\s+)?presenta?\s+(?:el\s+)?(?:rup|certificado|certificaci[óo]n|c[ée]dula|registro)/i,
        /rechazo\s+(?:automaticamente|de\s+plano).*?(?:rup|experiencia|certificado|firma|c[ée]dula)/i,
      ],
      exclude: [
        /p[óo]liza\s+de\s+seriedad|garant[íi]a\s+de\s+seriedad/i,
        /documento\s+(?:que\s+contiene|de)\s+(?:la\s+oferta|el\s+precio)/i,
      ],
      norma: "Art. 5 par. 1° Ley 1150 de 2007 (modificado por Ley 2195 de 2022)",
      legalBasis: "Los requisitos habilitantes y los documentos que los soportan son SIEMPRE SUBSANABLES hasta el traslado del informe de evaluación. Solo es insubsanable lo que afecte la asignación de puntaje, la oferta económica o la póliza de seriedad. Establecer causal de rechazo por documentos subsanables vulnera el debido proceso.",
      jurisprudencia: ["ce-subsanabilidad", "ce-pliego-ley"],
      recomendacion: "Eliminar la causal de rechazo automático y establecer expresamente el derecho a subsanar durante el traslado del informe de evaluación.",
      peticion: "Modificar la causal para que la entidad otorgue el plazo de subsanación previsto en el art. 5 par. 1° de la Ley 1150 (modificado por Ley 2195/2022), eliminando el rechazo automático.",
      estrategiaDefensa: "Documentar la solicitud por escrito; el rechazo posterior puede ser objeto de reposición y de acción contractual.",
    }),
  ];

  // 4) PLIEGOS TIPO — Documento Base obligatorio (Ley 1882/2018)
  const pliegosTipo = [
    rule({
      id: "pt_modificacion_documento_base",
      dimension: "pliegosTipo",
      category: "Pliegos Tipo · Cero tolerancia",
      title: "Posible modificación de requisitos habilitantes del Documento Base",
      weight: 5,
      include: [
        /(?:modificaci[óo]n|adici[óo]n|complement(?:o|ar))\s+(?:al?\s+)?(?:documento\s+base|pliego\s+tipo)/i,
        /requisito\s+adicional\s+(?:al|del)\s+(?:documento\s+base|pliego\s+tipo)/i,
        /no\s+aplicar?[áa]?\s+(?:el\s+)?(?:documento\s+base|pliego\s+tipo)/i,
        /(?:experiencia|indicador|patrimonio)\s+(?:adicional|diferente|distinto)\s+(?:al?|del)\s+(?:documento\s+base|pliego\s+tipo)/i,
      ],
      norma: "Art. 4 Ley 1882 de 2018 · Resoluciones de adopción de CCE",
      legalBasis: "Los Documentos Tipo son de uso OBLIGATORIO en procesos de infraestructura, interventoría y consultoría. Las entidades no pueden modificar la regulación de requisitos habilitantes, factores de evaluación o causales de rechazo del Documento Base. La inobservancia constituye causal de nulidad del proceso y posible falta disciplinaria.",
      jurisprudencia: ["cce-pliego-tipo", "ce-pliego-ley"],
      recomendacion: "Aplicar estrictamente el Documento Base vigente publicado por CCE para la modalidad correspondiente.",
      peticion: "Modificar el numeral para aplicar EXCLUSIVAMENTE lo previsto en el Documento Base del Pliego Tipo vigente, eliminando toda exigencia adicional o modificación a los requisitos habilitantes regulados por CCE.",
      estrategiaDefensa: "Si la entidad no acoge la observación, denunciar ante CCE y la Procuraduría. La nulidad puede solicitarse vía acción de controversias contractuales (Ley 1437/2011 — CPACA).",
    }),
  ];

  // 5) RIESGOS — Matriz de asignación (CONPES 3714)
  const riesgos = [
    rule({
      id: "riesgo_traslado_total_imprevisibles",
      dimension: "riesgos",
      category: "Matriz de riesgos · Equilibrio contractual",
      title: "Traslado generalizado de riesgos previsibles e imprevisibles al contratista",
      weight: 4,
      include: [
        /(?:el\s+)?proponente\s+asume\s+(?:todos\s+los\s+riesgos|cualquier\s+riesgo)\s+(?:previsibles?\s+e\s+)?imprevisibles?/i,
        /todos\s+los\s+riesgos\s+(?:son|estar[áa]n)\s+(?:a\s+cargo\s+del|asumidos\s+por\s+el)\s+contratista/i,
        /fuerza\s+mayor\s+(?:y|o)\s+caso\s+fortuito.*?contratista/i,
        /el\s+contratista\s+asume.*?(?:imprevisibles|fuerza\s+mayor)/i,
      ],
      norma: "CONPES 3714 de 2011 · Doctrina Consejo de Estado",
      legalBasis: "La asignación de riesgos debe atender al principio de quien esté en mejor capacidad de administrar y mitigar el riesgo. El traslado generalizado de riesgos previsibles e imprevisibles (especialmente fuerza mayor) al contratista vulnera el equilibrio económico del contrato y el CONPES 3714.",
      jurisprudencia: ["ce-riesgo-previsible", "ce-pliego-ley"],
      recomendacion: "Construir una matriz de riesgos detallada asignando cada riesgo a la parte que esté en mejor posición de gestionarlo.",
      peticion: "Eliminar la cláusula de traslado generalizado y publicar una matriz de riesgos específica (CONPES 3714), con asignación expresa de cada riesgo a la parte que esté en mejor capacidad de administrarlo.",
    }),
  ];

  // 6) TRANSPARENCIA — Plazos, claridad, marcas
  const transparencia = [
    rule({
      id: "marca_especifica",
      dimension: "transparencia",
      category: "Libre concurrencia · Direccionamiento",
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
      legalBasis: "Los bienes deben describirse por sus características, no por marca. Exigir una marca sin admitir equivalentes direcciona el proceso.",
      jurisprudencia: ["ce-marca", "cc-libre-concurrencia"],
      recomendacion: "Describir el bien por especificaciones técnicas y admitir todo producto que las cumpla.",
      peticion: "Eliminar la exigencia de marca determinada y describir el bien por especificaciones técnicas, admitiendo equivalentes que las cumplan.",
    }),

    rule({
      id: "plazo_insuficiente",
      dimension: "transparencia",
      category: "Transparencia · Plazos",
      title: "Plazo posiblemente insuficiente para presentar ofertas",
      weight: 2,
      include: [
        /plazo\s+(para|de)\s+presentaci[óo]n/i,
        /(un|1|dos|2)\s+d[íi]as?\s+(h[áa]biles?\s+)?para\s+(presentar|ofertar)/i,
        /t[ée]rmino\s+(de\s+)?cierre/i,
      ],
      norma: "Art. 24 Ley 80 de 1993 · Principio de transparencia",
      legalBasis: "Un plazo demasiado breve para estructurar la oferta impide la concurrencia efectiva y puede evidenciar direccionamiento.",
      jurisprudencia: ["ce-pliego-ley", "cc-libre-concurrencia"],
      recomendacion: "Ampliar el plazo a un término razonable según la complejidad del objeto.",
      peticion: "Ampliar el plazo de presentación de ofertas garantizando un término razonable acorde con la complejidad del objeto contractual.",
    }),

    rule({
      id: "objeto_indeterminado",
      dimension: "transparencia",
      category: "Transparencia · Especificaciones",
      title: "Especificaciones técnicas ambiguas o indeterminadas",
      weight: 1,
      include: [
        /seg[úu]n\s+criterio\s+de\s+la\s+entidad/i,
        /a\s+juicio\s+de\s+la\s+entidad/i,
        /las?\s+que\s+(la\s+entidad\s+)?determine/i,
        /entre\s+otros/i,
      ],
      norma: "Art. 24 Ley 80 de 1993 · Principio de transparencia",
      legalBasis: "Las reglas del pliego deben ser claras, completas y objetivas. Las cláusulas que dejan a discreción de la Entidad generan inseguridad jurídica.",
      jurisprudencia: ["ce-pliego-ley"],
      recomendacion: "Precisar de forma objetiva y verificable las especificaciones técnicas.",
      peticion: "Precisar de manera clara, completa y objetiva las especificaciones técnicas, eliminando expresiones que dejen la definición a discreción.",
    }),
  ];

  /* Estructura por dimensiones — el analizador la consume directamente. */
  const dimensions = {
    habilitantes:     { label: "Requisitos Habilitantes",   tone: "sky",      rules: habilitantes,     order: 1 },
    ponderables:      { label: "Factores de Ponderación",   tone: "indigo",   rules: ponderables,      order: 2 },
    causalesRechazo:  { label: "Causales de Rechazo",       tone: "rose",     rules: causalesRechazo,  order: 3 },
    pliegosTipo:      { label: "Pliegos Tipo · Cero Tol.",  tone: "rose",     rules: pliegosTipo,      order: 4 },
    riesgos:          { label: "Matriz de Riesgos",         tone: "amber",    rules: riesgos,          order: 5 },
    transparencia:    { label: "Transparencia y Claridad",  tone: "slate",    rules: transparencia,    order: 6 },
  };

  /* Compatibilidad con la API previa: array plano de todas las reglas. */
  const rules = Object.values(dimensions).reduce((acc, d) => acc.concat(d.rules), []);

  /* ----------------------------------------------------------------------
   * Datos semilla del panel
   * -------------------------------------------------------------------- */
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
    norms, jurisprudence, jurisById,
    rules, dimensions, seedProcesses,
    disclaimer:
      "LICITA es una herramienta de apoyo. El análisis y los documentos generados " +
      "deben ser revisados por un profesional del derecho antes de su radicación.",
  };
})();
