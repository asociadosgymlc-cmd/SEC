/* LICITA · Generación de documentos
 * Redacta la solicitud / observación formal y la exporta a Word (.doc).
 */
window.LICITA = window.LICITA || {};

LICITA.docs = (function () {
  "use strict";

  const MODALIDAD = {
    minima_cuantia: "Mínima Cuantía",
    seleccion_abreviada: "Selección Abreviada",
    licitacion: "Licitación Pública",
    concurso_meritos: "Concurso de Méritos",
    contratacion_directa: "Contratación Directa",
  };

  function modalidadLabel(m) {
    return MODALIDAD[m] || "No especificada";
  }

  function fechaLarga(iso) {
    const d = iso ? new Date(iso) : new Date();
    const meses = [
      "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
      "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
  }

  /* Redacta el cuerpo de la observación a partir del resultado del análisis. */
  function buildObservation(result) {
    const m = result.meta;
    const L = [];
    L.push(fechaLarga(m.fecha));
    L.push("");
    L.push("Señores");
    L.push((m.entidad || "[ENTIDAD CONTRATANTE]").toUpperCase());
    L.push("La ciudad");
    L.push("");
    L.push(
      "Referencia: Observaciones al pliego de condiciones del proceso de " +
        "selección No. " + (m.proceso || "[NÚMERO DE PROCESO]")
    );
    L.push("Modalidad: " + modalidadLabel(m.modalidad));
    if (m.objeto) L.push("Objeto: " + m.objeto);
    // Puntos clave del proceso extraídos del pliego (si están disponibles).
    // Da peso jurídico a la observación: situamos el contexto antes del análisis.
    if (m.processKey) {
      const pk = m.processKey;
      const ctx = [];
      if (pk.presupuesto) ctx.push("Presupuesto oficial: $" + Number(pk.presupuesto).toLocaleString("es-CO") + " COP");
      if (pk.plazo) ctx.push("Plazo de ejecución: " + pk.plazo.cantidad + " " + pk.plazo.unidad);
      if (pk.lugar) ctx.push("Lugar de ejecución: " + pk.lugar);
      if (ctx.length) {
        L.push("");
        L.push("Datos relevantes del proceso (extraídos del pliego):");
        ctx.forEach((c) => L.push("  · " + c));
      }
    }
    L.push("");
    L.push("Respetados señores:");
    L.push("");
    L.push(
      (m.proponente || "[NOMBRE DEL OBSERVANTE]") +
        ", en calidad de posible oferente interesado en el proceso de la " +
        "referencia y dentro del término previsto para presentar observaciones, " +
        "de manera respetuosa formulo las siguientes:"
    );
    L.push("");
    L.push("OBSERVACIONES");
    L.push("");
    L.push(
      "Sobre el " + (m.numeral || "[NUMERAL OBJETADO]") + " del pliego de condiciones."
    );
    L.push("");
    if (m.textoRequisito) {
      L.push("Texto objetado:");
      L.push('"' + m.textoRequisito.trim() + '"');
      L.push("");
    }

    if (result.findings.length === 0) {
      L.push(
        "Revisado el aparte objetado no se identifican, prima facie, vicios que " +
          "ameriten observación; no obstante, se solicita a la Entidad confirmar " +
          "la proporcionalidad del requisito frente al objeto y la cuantía."
      );
    } else {
      result.findings.forEach((f, i) => {
        L.push(`${i + 1}. ${f.title}.`);
        L.push("");
        L.push(f.legalBasis);
        L.push("");
        L.push("Fundamento normativo: " + f.norma + ".");
        if (f.jurisprudencia.length) {
          f.jurisprudencia.forEach((j) => {
            L.push(
              "Criterio jurisprudencial — " + j.court + ": " + j.holding
            );
          });
        }
        L.push("");
      });
    }

    L.push("PETICIÓN");
    L.push("");
    L.push(
      "Con fundamento en lo expuesto, y en garantía de los principios de " +
        "transparencia, selección objetiva, igualdad, libre concurrencia y " +
        "economía (Ley 80 de 1993 y Ley 1150 de 2007), solicito comedidamente " +
        "a la Entidad:"
    );
    L.push("");
    if (result.findings.length === 0) {
      L.push(
        "Único. Confirmar y motivar la proporcionalidad del requisito objetado " +
          "frente al objeto y la cuantía del proceso."
      );
    } else {
      result.findings.forEach((f, i) => {
        L.push(`${i + 1}. ${f.peticion}`);
      });
    }
    L.push("");
    L.push(
      "Solicito que la presente observación sea resuelta de fondo y de manera " +
        "motivada dentro del término legal, y que la respuesta sea publicada en " +
        "el SECOP para conocimiento de todos los interesados."
    );
    L.push("");
    L.push("Atentamente,");
    L.push("");
    L.push("");
    L.push("__________________________________");
    L.push((m.proponente || "[NOMBRE DEL OBSERVANTE]"));
    L.push("C.C. / NIT: ____________________");
    L.push("Correo electrónico: ____________________");
    L.push("Teléfono de contacto: ____________________");

    return L.join("\n");
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])
    );
  }

  /* Exporta la observación a un archivo .doc abrible por Word. */
  function downloadWord(result) {
    const m = result.meta;
    const bodyHtml = buildObservation(result)
      .split("\n")
      .map((line) =>
        line.trim() === ""
          ? "<p style='margin:0 0 10px 0'>&nbsp;</p>"
          : "<p style='margin:0 0 10px 0;text-align:justify'>" +
            escapeHtml(line) +
            "</p>"
      )
      .join("");

    const html =
      "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
      "xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>" +
      "<head><meta charset='utf-8'><title>Observación</title></head>" +
      "<body style=\"font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;\">" +
      bodyHtml +
      "<hr><p style='font-size:8pt;color:#777'>Documento generado por LICITA — " +
      "herramienta de apoyo. Revíselo con un profesional del derecho antes de radicarlo.</p>" +
      "</body></html>";

    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = (m.proceso || "observacion").replace(/[^\w.-]+/g, "_");
    a.href = url;
    a.download = "Observacion_" + slug + ".doc";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return { buildObservation, downloadWord, modalidadLabel, fechaLarga };
})();
