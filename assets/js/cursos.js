/* LICITA · Cursos de Formación
 * Curriculum sobre contratación pública colombiana, listo para usar dentro
 * de la plataforma. Cada lección incluye introducción, puntos clave,
 * fundamento normativo y un tip aplicado al motor de LICITA.
 *
 * Todo el contenido proviene de fuentes públicas (Ley 80/93, Ley 1150/07,
 * Decreto 1082/2015, Ley 1474/2011, doctrina del Consejo de Estado y de
 * Colombia Compra Eficiente). Las afirmaciones deben verificarse en cada
 * caso concreto antes de usarse profesionalmente.
 */
window.LICITA = window.LICITA || {};

LICITA.cursos = (function () {
  "use strict";

  const COURSES = [
    {
      id: "fundamentos",
      titulo: "Fundamentos de contratación estatal",
      resumen: "Marco normativo, principios y actores del sistema colombiano de compras públicas.",
      nivel: "Inicial",
      duracion: "≈ 25 min",
      color: "sky",
      icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
      lecciones: [
        {
          id: "marco",
          titulo: "El marco normativo en una página",
          intro: "Tres normas estructurales y un decreto reglamentario soportan casi todo el sistema. Conocerlas en orden te ahorra meses de jurisprudencia.",
          puntos: [
            "Ley 80 de 1993 — Estatuto General de Contratación. Define principios (transparencia, economía, responsabilidad), modalidades y procedimientos básicos.",
            "Ley 1150 de 2007 — Introduce la selección objetiva, los requisitos habilitantes y nuevas modalidades como la mínima cuantía y la selección abreviada.",
            "Ley 1474 de 2011 — Estatuto Anticorrupción. Refuerza inhabilidades, supervisión y sanciones al direccionamiento.",
            "Decreto 1082 de 2015 — Decreto Único Reglamentario del sector Planeación. Reglamenta el día a día: registros, garantías, indicadores financieros.",
          ],
          norma: "Ley 80 de 1993 · Ley 1150 de 2007 · Ley 1474 de 2011 · Decreto 1082 de 2015",
          tip: "En LICITA · Marco Normativo encuentras estas normas con sus puntos clave para citarlas en tus observaciones.",
        },
        {
          id: "principios",
          titulo: "Los principios que mandan",
          intro: "Por encima de los formatos, los principios son la guía interpretativa que usan jueces y tribunales.",
          puntos: [
            "Transparencia — reglas claras, completas y públicas en cada etapa.",
            "Selección objetiva — la oferta más favorable se elige con criterios objetivos, proporcionales y verificables.",
            "Igualdad y libre concurrencia — todos los oferentes idóneos pueden competir; cualquier barrera debe justificarse.",
            "Economía — solo se exige lo necesario; no hay requisitos redundantes ni costos innecesarios.",
            "Responsabilidad y planeación — el contratante motiva sus decisiones y proyecta los riesgos.",
          ],
          norma: "Art. 23 Ley 80 de 1993 · Art. 5 Ley 1150 de 2007 · Art. 209 Constitución Política",
          tip: "Cuando objetes un requisito, vincúlalo siempre a uno de estos principios — es la mejor manera de fundar un petitorio.",
        },
        {
          id: "actores",
          titulo: "¿Quién es quién en el proceso?",
          intro: "Identificar bien al actor te da claridad sobre a quién observar y qué exigir.",
          puntos: [
            "Entidad contratante — la entidad pública que abre el proceso (alcaldía, ministerio, hospital, etc.).",
            "Ordenador del gasto — el funcionario que firma el contrato y compromete los recursos.",
            "Estructurador — quien redacta los estudios previos y el pliego (a veces con consultores externos).",
            "Oferente / proponente — la empresa o persona que se postula.",
            "Supervisor o interventor — quien vigila la ejecución del contrato después de la adjudicación.",
            "Colombia Compra Eficiente (CCE) — autoridad rectora del sistema, emite guías y maneja el SECOP.",
          ],
          norma: "Art. 26 Ley 80 de 1993 · Art. 83 Ley 1474 de 2011",
          tip: "Tu observación se dirige a la Entidad contratante, pero CCE puede emitir conceptos vinculantes en caso de duda.",
        },
        {
          id: "inhabilidades",
          titulo: "Inhabilidades e incompatibilidades",
          intro: "Saber quién no puede contratar evita pérdidas de tiempo y permite detectar conflictos en la competencia.",
          puntos: [
            "Inhabilidad — prohibición general de contratar (condenas penales, sanciones disciplinarias, etc.).",
            "Incompatibilidad — situación particular que impide contratar con cierta entidad (parentesco, cargo previo, etc.).",
            "Régimen sancionatorio — declarar contrato bajo inhabilidad acarrea nulidad y responsabilidad del funcionario.",
            "Caducidad de 5 años — varias inhabilidades operan por períodos definidos tras la causal.",
          ],
          norma: "Art. 8, 9 y 10 Ley 80 de 1993 · Ley 1474 de 2011",
          tip: "Cuando hagas inteligencia competitiva en SECOP 1 (LICITA), revisa si tu competidor tiene contratos liquidados recientes con sanciones — pueden generarle inhabilidades.",
        },
      ],
      quiz: [
        {
          q: "¿Cuál norma introdujo formalmente el deber de selección objetiva?",
          opciones: ["Ley 80 de 1993", "Ley 1150 de 2007", "Decreto 1082 de 2015", "Ley 1474 de 2011"],
          correcta: 1,
        },
        {
          q: "¿Qué norma reglamenta hoy la capacidad financiera y la experiencia exigible?",
          opciones: ["Ley 80 de 1993", "Constitución Política", "Decreto 1082 de 2015", "Ley 2069 de 2020"],
          correcta: 2,
        },
        {
          q: "¿Cuál principio sostiene que cualquier oferente idóneo puede participar?",
          opciones: ["Economía", "Responsabilidad", "Libre concurrencia", "Anualidad"],
          correcta: 2,
        },
      ],
    },

    {
      id: "modalidades",
      titulo: "Modalidades de selección",
      resumen: "Cuándo se usa cada modalidad, sus umbrales y sus reglas particulares.",
      nivel: "Inicial",
      duracion: "≈ 30 min",
      color: "indigo",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
      lecciones: [
        {
          id: "licitacion",
          titulo: "Licitación Pública",
          intro: "La regla general. Aplica cuando ninguna otra modalidad encaja y la cuantía es relevante.",
          puntos: [
            "Procedimiento abierto, concurrente, con audiencias de aclaración y de adjudicación.",
            "Requiere estudios previos completos, pliego de condiciones y resolución de apertura.",
            "Plazos amplios para presentar observaciones al proyecto de pliego y al pliego definitivo.",
            "La selección se hace por puntaje sobre criterios técnicos y económicos previamente publicados.",
          ],
          norma: "Art. 30 Ley 80 de 1993 · Art. 2.2.1.2 Decreto 1082 de 2015",
          tip: "En licitación tienes dos oportunidades formales para observar: el proyecto de pliego y el pliego definitivo. Aprovecha ambas con LICITA.",
        },
        {
          id: "abreviada",
          titulo: "Selección Abreviada",
          intro: "Procedimiento simplificado para casos típicos: bienes de características técnicas uniformes, menor cuantía, subasta inversa y otros.",
          puntos: [
            "Acuerdos marco y bolsa de productos para bienes uniformes.",
            "Subasta inversa cuando interesa minimizar el precio sobre especificaciones cerradas.",
            "Menor cuantía: aplica entre el 10% de la menor cuantía y la menor cuantía de la entidad.",
            "Plazos más cortos que la licitación, pero conservando publicidad y selección objetiva.",
          ],
          norma: "Art. 2 Ley 1150 de 2007 · Art. 2.2.1.2.1 Decreto 1082 de 2015",
          tip: "En subasta inversa, los habilitantes ya están verificados antes del lance; el lance es solo precio.",
        },
        {
          id: "concurso",
          titulo: "Concurso de Méritos",
          intro: "Modalidad para consultoría y proyectos de arquitectura. La calidad pesa más que el precio.",
          puntos: [
            "Aplica a servicios de consultoría (interventoría, estudios, diseños) y proyectos de arquitectura.",
            "La evaluación de la propuesta técnica precede a la apertura de la propuesta económica.",
            "Puede usar lista corta de hasta 6 oferentes preseleccionados por experiencia.",
            "Prohibido evaluar por precio como factor principal — sería violar el espíritu del concurso.",
          ],
          norma: "Art. 2.2.1.2.1.3 Decreto 1082 de 2015 · Ley 1150 de 2007",
          tip: "Si te aparece un 'Concurso de méritos' con precio como factor de desempate, revisa con cuidado: no debería puntuar precio como criterio principal.",
        },
        {
          id: "directa",
          titulo: "Contratación Directa",
          intro: "Excepción al deber general de licitar. Solo procede en causales taxativas y motivadas.",
          puntos: [
            "Urgencia manifiesta declarada por acto administrativo motivado.",
            "Contratos de empréstito, interadministrativos, prestación de servicios profesionales.",
            "Arrendamiento de inmuebles, contratos sin pluralidad de oferentes.",
            "Cada causal exige justificación documentada que se publica en SECOP.",
          ],
          norma: "Art. 2 num. 4 Ley 1150 de 2007 · Art. 2.2.1.2.1.4 Decreto 1082 de 2015",
          tip: "Si un proceso aparece como contratación directa sin causal evidente, es señal de riesgo. LICITA · SECOP te muestra el motivo en la justificación.",
        },
        {
          id: "minima",
          titulo: "Mínima Cuantía",
          intro: "Procedimiento expedito para contratos de bajo valor. La modalidad más accesible.",
          puntos: [
            "Aplica para contratos hasta el 10% de la menor cuantía de la entidad (varía por entidad).",
            "Una sola invitación pública con plazo corto para presentar ofertas.",
            "Sin pliego de condiciones formal — basta con la invitación con condiciones técnicas mínimas.",
            "La oferta ganadora es la de menor precio que cumpla las condiciones mínimas.",
          ],
          norma: "Art. 94 Ley 1474 de 2011 · Art. 2.2.1.2.1.5 Decreto 1082 de 2015",
          tip: "En mínima cuantía es donde más se direccionan procesos. Revisa cada requisito 'técnico mínimo' con escepticismo: muchos esconden exigencias desproporcionadas.",
        },
      ],
      quiz: [
        {
          q: "¿Qué modalidad debe usarse para contratos de consultoría?",
          opciones: ["Licitación Pública", "Mínima Cuantía", "Concurso de Méritos", "Selección Abreviada"],
          correcta: 2,
        },
        {
          q: "¿Cuál es el límite habitual de la Mínima Cuantía?",
          opciones: ["Hasta la menor cuantía completa", "Hasta el 10% de la menor cuantía", "Hasta el 50% de la mayor cuantía", "Sin límite"],
          correcta: 1,
        },
        {
          q: "¿Cuál NO es causal de contratación directa?",
          opciones: ["Urgencia manifiesta", "Contrato interadministrativo", "Compra de papelería corriente", "Prestación de servicios profesionales"],
          correcta: 2,
        },
      ],
    },

    {
      id: "pliego",
      titulo: "Cómo leer un pliego de condiciones",
      resumen: "Estructura, requisitos habilitantes y dónde se esconden los riesgos de direccionamiento.",
      nivel: "Intermedio",
      duracion: "≈ 35 min",
      color: "emerald",
      icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      lecciones: [
        {
          id: "estructura",
          titulo: "Anatomía de un pliego",
          intro: "Aunque cada entidad tiene su plantilla, todos los pliegos comparten una columna vertebral común.",
          puntos: [
            "Capítulo I — Información general del proceso (objeto, cuantía, plazo, modalidad).",
            "Capítulo II — Requisitos habilitantes: jurídicos, financieros, organizacionales y de experiencia.",
            "Capítulo III — Factores de evaluación: cómo se asignan puntajes a las ofertas habilitadas.",
            "Capítulo IV — Aspectos contractuales: obligaciones, garantías, forma de pago, multas.",
            "Anexos — Condiciones técnicas mínimas, minuta del contrato, formatos.",
          ],
          norma: "Art. 24 Ley 80 de 1993 · Art. 2.2.1.1.2 Decreto 1082 de 2015",
          tip: "Los riesgos más altos suelen estar en los Anexos Técnicos, no en el cuerpo principal. Léelos con la misma atención.",
        },
        {
          id: "habilitantes",
          titulo: "Requisitos habilitantes",
          intro: "Definen quién puede competir. Si son desproporcionados, son barreras de entrada.",
          puntos: [
            "Jurídicos — capacidad de obrar, certificado de existencia, RUP.",
            "Financieros — índices de liquidez, endeudamiento, razón de cobertura y capital de trabajo.",
            "Organizacionales — rentabilidad y patrimonio.",
            "Experiencia — número y valor de contratos similares ejecutados.",
            "Regla de oro: deben ser proporcionales al valor y la complejidad del objeto (Art. 5 Ley 1150).",
          ],
          norma: "Art. 5 Ley 1150 de 2007 · Art. 2.2.1.1.1.5 Decreto 1082 de 2015",
          tip: "El motor de LICITA detecta automáticamente exigencias desproporcionadas en estos puntos. Úsalo como primer filtro.",
        },
        {
          id: "factores",
          titulo: "Factores de evaluación",
          intro: "Aquí se define cómo se asigna el puntaje. Aquí también se esconden los direccionamientos sutiles.",
          puntos: [
            "Precio — habitualmente el factor de mayor peso, excepto en concurso de méritos.",
            "Calidad — puede valorarse por especificaciones superiores, soporte o tiempos de respuesta.",
            "Apoyo a la industria nacional — bonificación por bienes y servicios nacionales (Ley 816/2003).",
            "Estímulos a MIPYMES — beneficios para pequeñas empresas (Ley 2069/2020).",
            "Mira las fórmulas: una fórmula que premia desproporcionadamente la experiencia adicional puede ser direccionada.",
          ],
          norma: "Art. 5 Ley 1150 de 2007 · Ley 816 de 2003 · Ley 2069 de 2020",
          tip: "Si la fórmula económica no es lineal y favorece a los precios bajos extremos, puede estar diseñada para una oferta específica.",
        },
        {
          id: "señales",
          titulo: "Señales de direccionamiento",
          intro: "Patrones repetidos en pliegos que apuntan a una oferta predefinida.",
          puntos: [
            "Marcas o referencias específicas sin admitir equivalentes.",
            "Experiencia muy puntual (p. ej. 'haber ejecutado exactamente este contrato').",
            "Certificaciones raras o costosas que pocos tienen.",
            "Plazos muy cortos entre publicación y cierre.",
            "Restricciones geográficas (domicilio en el municipio).",
            "Exigencias de personal con vinculación laboral exclusiva.",
            "Especificaciones técnicas redactadas en estilo de catálogo del fabricante.",
          ],
          norma: "Art. 5 Ley 1150 de 2007 · Doctrina Consejo de Estado",
          tip: "LICITA detecta automáticamente estos siete patrones. Cuando aparezcan en un análisis, fundan la observación con confianza.",
        },
      ],
      quiz: [
        {
          q: "¿Dónde suelen esconderse los riesgos de direccionamiento?",
          opciones: ["En el objeto del contrato", "En los anexos técnicos", "En la minuta", "En el cronograma"],
          correcta: 1,
        },
        {
          q: "Los indicadores financieros deben ser:",
          opciones: ["Los más altos posibles", "Proporcionales al objeto y la cuantía", "Iguales para todo proceso", "Definidos por el contratista"],
          correcta: 1,
        },
        {
          q: "Una exigencia de domicilio en el municipio normalmente vulnera:",
          opciones: ["La economía", "La igualdad y libre concurrencia", "La planeación", "La responsabilidad"],
          correcta: 1,
        },
      ],
    },

    {
      id: "observaciones",
      titulo: "Redacción de observaciones efectivas",
      resumen: "Cómo escribir una observación que la entidad no pueda ignorar.",
      nivel: "Intermedio",
      duracion: "≈ 25 min",
      color: "amber",
      icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
      lecciones: [
        {
          id: "derecho",
          titulo: "El derecho a observar",
          intro: "Cualquier interesado puede observar el proyecto de pliego y el pliego definitivo. La entidad debe responder de fondo.",
          puntos: [
            "El derecho de observación es manifestación del principio de transparencia.",
            "Aplica al proyecto de pliego y al pliego definitivo en licitaciones y selecciones abreviadas.",
            "También aplica en mínima cuantía durante el plazo de la invitación.",
            "La respuesta debe ser motivada y publicada en SECOP, no basta con 'no se acepta'.",
          ],
          norma: "Art. 24 Ley 80 de 1993 · Art. 2.2.1.1.2.1.4 Decreto 1082 de 2015",
          tip: "Si la entidad no responde motivadamente, es causal para acción de tutela por vulneración del derecho de petición.",
        },
        {
          id: "estructura",
          titulo: "Estructura de la observación",
          intro: "Una observación bien hecha tiene una arquitectura predecible. Sigue este orden.",
          puntos: [
            "Encabezado — fecha, destinatario, referencia al proceso y modalidad.",
            "Identificación del observante — nombre, NIT, calidad en que actúa.",
            "Identificación del numeral objetado — cita exacta del aparte del pliego.",
            "Argumentación jurídica — qué principio o norma se vulnera y por qué.",
            "Cita de jurisprudencia — Consejo de Estado o Corte Constitucional aplicable.",
            "Petición concreta — qué se solicita modificar, eliminar o aclarar.",
            "Firma — datos de contacto y compromiso de respuesta.",
          ],
          norma: "Buena práctica · Doctrina CCE",
          tip: "El motor de LICITA genera la observación con esta estructura automáticamente. La puedes editar antes de descargarla.",
        },
        {
          id: "citas",
          titulo: "Cómo citar normas y jurisprudencia",
          intro: "Una observación con citas precisas tiene peso técnico; sin ellas se ve como una queja.",
          puntos: [
            "Normas — escribir el número y año, el artículo y el inciso o numeral exacto.",
            "Jurisprudencia — corte, sala/sección, número de radicado, fecha y magistrado ponente cuando se conozca.",
            "Doctrina de CCE — referenciar la guía o concepto con su código y fecha.",
            "Nunca inventes citas: si dudas del radicado, cita el principio general y aclara que se trata de doctrina reiterada.",
            "Las observaciones con citas verificables generan mejor respuesta institucional.",
          ],
          norma: "Buena práctica jurídica",
          tip: "LICITA agrupa los criterios jurisprudenciales por temática. Cita la doctrina pertinente y verifica los radicados antes de radicar.",
        },
        {
          id: "petitorio",
          titulo: "El petitorio efectivo",
          intro: "El petitorio convierte la queja en acción. Debe ser concreto, medible y posible.",
          puntos: [
            "Solicita modificaciones específicas — no 'aclárese' sino 'modifíquese para que ...'.",
            "Ofrece una redacción alternativa cuando sea posible.",
            "Pide publicación motivada de la respuesta — eso compromete a la entidad.",
            "Cuando aplique, solicita ampliación del plazo de cierre para que otros conozcan la respuesta.",
            "Cierra invocando los principios de transparencia y selección objetiva.",
          ],
          norma: "Art. 23 Ley 80 de 1993 · Art. 5 Ley 1150 de 2007",
          tip: "Un buen petitorio reduce la latencia: la entidad solo tiene que aceptarlo o motivar el rechazo.",
        },
      ],
      quiz: [
        {
          q: "¿Quién puede presentar observaciones al pliego?",
          opciones: ["Solo abogados", "Solo proponentes ya inscritos", "Cualquier interesado", "Solo entidades de control"],
          correcta: 2,
        },
        {
          q: "Lo más importante en el petitorio es que sea:",
          opciones: ["Largo y exhaustivo", "Concreto y posible", "Crítico y enérgico", "Genérico para cubrir varios casos"],
          correcta: 1,
        },
        {
          q: "Si dudas del radicado exacto de una sentencia, lo correcto es:",
          opciones: ["Inventarlo aproximadamente", "Citar la doctrina general como reiterada", "Omitir cualquier referencia", "Usar Wikipedia"],
          correcta: 1,
        },
      ],
    },

    {
      id: "competitiva",
      titulo: "Inteligencia competitiva en SECOP",
      resumen: "Cómo usar los datos públicos para entender a tu competencia y al mercado.",
      nivel: "Intermedio",
      duracion: "≈ 20 min",
      color: "rose",
      icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
      lecciones: [
        {
          id: "datasets",
          titulo: "Los dos SECOP y para qué sirve cada uno",
          intro: "SECOP es público pero está partido en dos. Saber cuál consultar te ahorra ruido.",
          puntos: [
            "SECOP 1 — contratos históricos firmados, con adjudicatarios. Útil para inteligencia competitiva.",
            "SECOP 2 — procesos vigentes y recientes. Útil para encontrar oportunidades hoy.",
            "Ambos están en datos.gov.co con la API SODA (Socrata), sin captcha ni login.",
            "La búsqueda por texto, departamento o proveedor opera sobre los mismos campos del dataset.",
          ],
          norma: "Decreto 1082 de 2015 · Política de datos abiertos",
          tip: "LICITA usa estos dos datasets en vivo. La pestaña 'Históricos · SECOP 1' es tu fuente de inteligencia competitiva.",
        },
        {
          id: "competidor",
          titulo: "Analizar a tu competidor",
          intro: "Conocer al ganador habitual cambia tu estrategia de precio y de oferta.",
          puntos: [
            "Busca por nombre o NIT del competidor en SECOP 1.",
            "Cuenta cuántos contratos similares ha ganado en los últimos 24 meses.",
            "Calcula el valor promedio y el descuento típico sobre el presupuesto base.",
            "Identifica las entidades con las que trabaja habitualmente — son su zona de comodidad.",
            "Compara su patrimonio y experiencia con tus propios indicadores.",
          ],
          norma: "Datos públicos · Política de transparencia",
          tip: "El botón 'Ver más de este proveedor' en LICITA SECOP 1 hace este análisis con un clic.",
        },
        {
          id: "precio",
          titulo: "Estrategia de precio basada en datos",
          intro: "El precio óptimo no es el más bajo: es el que gana sin quemar margen.",
          puntos: [
            "Calcula el precio mediano histórico para contratos similares (mismo tipo, similar cuantía).",
            "Identifica si la entidad descuenta consistentemente sobre el presupuesto base.",
            "En subasta inversa, prepárate para varios lances — no abras con tu precio mínimo.",
            "En mínima cuantía sin subasta, el precio inicial es tu precio final: optimiza una vez.",
            "El margen del 3-5% sobre el precio mediano histórico suele ser competitivo.",
          ],
          norma: "Buena práctica comercial",
          tip: "Usa el filtro 'Mayor valor' o 'Menor valor' en SECOP 1 para acotar el rango de tu oferta.",
        },
      ],
      quiz: [
        {
          q: "¿Qué dataset usarías para ver quién ha ganado contratos parecidos al tuyo?",
          opciones: ["SECOP 2", "SECOP 1", "RUP", "Sistema BPIN"],
          correcta: 1,
        },
        {
          q: "El precio óptimo en una subasta inversa es:",
          opciones: ["El más bajo que puedas dar de entrada", "El precio mediano histórico ligeramente ajustado", "Un descuento del 50% sobre el base", "El precio base sin descuento"],
          correcta: 1,
        },
      ],
    },

    {
      id: "recursos",
      titulo: "Recursos y reclamaciones",
      resumen: "Qué hacer cuando la entidad no atiende la observación o cuando se adjudica mal.",
      nivel: "Avanzado",
      duracion: "≈ 25 min",
      color: "violet",
      icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
      lecciones: [
        {
          id: "reposicion",
          titulo: "Recurso de reposición",
          intro: "Primer mecanismo administrativo para impugnar actos del proceso.",
          puntos: [
            "Procede contra el acto de adjudicación, declaratoria de desierta y otros actos definitivos.",
            "Se presenta ante la misma entidad que dictó el acto.",
            "Plazo: 5 días siguientes a la notificación o publicación.",
            "Debe motivarse jurídicamente con normas, hechos y pruebas.",
          ],
          norma: "Art. 77 Ley 80 de 1993 · Código de Procedimiento Administrativo",
          tip: "El recurso de reposición no requiere abogado, pero sí estructura jurídica clara.",
        },
        {
          id: "tutela",
          titulo: "Acción de tutela",
          intro: "Cuando la entidad vulnera derechos fundamentales en el proceso.",
          puntos: [
            "Procede ante vulneración del derecho de petición, igualdad, debido proceso o información.",
            "Es subsidiaria: usa primero los recursos administrativos cuando existan.",
            "Plazo: 'término razonable' tras la vulneración, generalmente 6 meses.",
            "Permite medidas provisionales cuando hay perjuicio irremediable.",
          ],
          norma: "Art. 86 Constitución Política · Decreto 2591 de 1991",
          tip: "Si la entidad ignora tu observación, la tutela por derecho de petición puede ser la vía más rápida.",
        },
        {
          id: "nulidad",
          titulo: "Acción de controversias contractuales",
          intro: "Vía judicial principal para impugnar adjudicaciones contrarias a derecho.",
          puntos: [
            "Conoce la jurisdicción contencioso administrativa.",
            "Plazo de caducidad: 2 años desde la firmeza del acto.",
            "Puede declarar la nulidad del acto y, en algunos casos, indemnizar perjuicios.",
            "Requiere abogado titulado y trámite procesal complejo.",
          ],
          norma: "Ley 1437 de 2011 (CPACA) · Ley 80 de 1993",
          tip: "Para adjudicaciones direccionadas con perjuicio económico claro, esta es la vía indemnizatoria.",
        },
        {
          id: "control",
          titulo: "Denuncia ante órganos de control",
          intro: "Cuando hay indicios de corrupción o irregularidad grave.",
          puntos: [
            "Procuraduría General — investigación disciplinaria contra funcionarios.",
            "Contraloría General o territorial — control fiscal por daño al patrimonio público.",
            "Fiscalía General — investigación penal cuando hay delitos contra la administración pública.",
            "Las denuncias son confidenciales en cuanto al denunciante.",
          ],
          norma: "Ley 1474 de 2011 (Anticorrupción) · Constitución Política",
          tip: "Estas denuncias no detienen el proceso por sí solas, pero soportan medidas cautelares posteriores.",
        },
      ],
      quiz: [
        {
          q: "El recurso de reposición se presenta ante:",
          opciones: ["El juez administrativo", "La Procuraduría", "La misma entidad", "Colombia Compra Eficiente"],
          correcta: 2,
        },
        {
          q: "El plazo del recurso de reposición desde la notificación es de:",
          opciones: ["2 días", "5 días", "10 días", "30 días"],
          correcta: 1,
        },
        {
          q: "La tutela procede principalmente cuando:",
          opciones: ["Se quiere bajar el precio", "Se vulnera un derecho fundamental", "Hay diferencia técnica", "El contrato venció"],
          correcta: 1,
        },
      ],
    },
  ];

  function byId(id) { return COURSES.find((c) => c.id === id) || null; }
  function totalLecciones() {
    return COURSES.reduce((s, c) => s + c.lecciones.length, 0);
  }
  function totalCursos() { return COURSES.length; }

  return { COURSES, byId, totalLecciones, totalCursos };
})();
