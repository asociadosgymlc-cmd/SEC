/* LICITA · Mapa Nacional de Oportunidades
 *
 * Choropleth de los 33 departamentos de Colombia a partir de TopoJSON
 * (límites: jacasta2/colombian_map, MIT, códigos DIVIPOLA del DANE) y datos
 * en vivo de SECOP II vía LICITA.secop.aggregate(). Sin dependencia de
 * licitaciones.info ni de ningún backend propio: todo corre en el navegador.
 *
 * Los municipios NO se dibujan como polígonos: no hay una tabla código→nombre
 * de los 1.121 municipios verificada en este proyecto, y reconstruirla de
 * memoria sería inventar datos geográficos. En su lugar, el detalle por
 * municipio se muestra como un ranking (agregado SoQL por el campo de
 * ciudad/municipio que ya reporta SECOP), que no depende de esa tabla.
 */
window.LICITA = window.LICITA || {};

LICITA.mapa = (function () {
  "use strict";

  // Códigos DIVIPOLA (DANE) de los 33 departamentos. Verificado contra la
  // nomenclatura oficial; estable desde 1954, sin cambios recientes.
  var DIVIPOLA = {
    "05": "Antioquia",
    "08": "Atlántico",
    "11": "Bogotá, D.C.",
    "13": "Bolívar",
    "15": "Boyacá",
    "17": "Caldas",
    "18": "Caquetá",
    "19": "Cauca",
    "20": "Cesar",
    "23": "Córdoba",
    "25": "Cundinamarca",
    "27": "Chocó",
    "41": "Huila",
    "44": "La Guajira",
    "47": "Magdalena",
    "50": "Meta",
    "52": "Nariño",
    "54": "Norte de Santander",
    "63": "Quindío",
    "66": "Risaralda",
    "68": "Santander",
    "70": "Sucre",
    "73": "Tolima",
    "76": "Valle del Cauca",
    "81": "Arauca",
    "85": "Casanare",
    "86": "Putumayo",
    "88": "Archipiélago de San Andrés, Providencia y Santa Catalina",
    "91": "Amazonas",
    "94": "Guainía",
    "95": "Guaviare",
    "97": "Vaupés",
    "99": "Vichada",
  };

  // Rampa secuencial validada (dataviz skill · palette.md), un solo tono,
  // claro→oscuro. 6 pasos para bucketing por cuantiles.
  var RAMP = ["#cce3fd", "#9dc8f7", "#519ced", "#2370cd", "#1757ac", "#0e3d7e"];
  var RAMP_EMPTY = "#eef2f7"; // sin datos

  function norm(s) {
    return String(s || "")
      .toUpperCase()
      .replace(/[ÁÀÄÂ]/g, "A").replace(/[ÉÈËÊ]/g, "E")
      .replace(/[ÍÌÏÎ]/g, "I").replace(/[ÓÒÖÔ]/g, "O")
      .replace(/[ÚÙÜÛ]/g, "U").replace(/Ñ/g, "N")
      .replace(/[^A-Z]/g, "")
      .trim();
  }

  // Nombres con los que SECOP/datos.gov.co reporta un departamento en la
  // práctica, cuando difieren demasiado del nombre largo DIVIPOLA como para
  // que la coincidencia por subcadena funcione (verificado en vivo:
  // "departamento_entidad" trae "Distrito Capital de Bogotá", no "Bogotá").
  var ALIASES = {
    "11": ["BOGOTA"],
    "88": ["SANANDRES", "PROVIDENCIA"],
  };

  function matchDeptName(apiName) {
    var n = norm(apiName);
    if (!n) return null;
    var codes = Object.keys(DIVIPOLA);
    for (var i = 0; i < codes.length; i++) {
      var dn = norm(DIVIPOLA[codes[i]]);
      if (dn === n) return codes[i];
    }
    var aliasCodes = Object.keys(ALIASES);
    for (i = 0; i < aliasCodes.length; i++) {
      var tokens = ALIASES[aliasCodes[i]];
      for (var j = 0; j < tokens.length; j++) {
        if (n.indexOf(tokens[j]) >= 0) return aliasCodes[i];
      }
    }
    for (i = 0; i < codes.length; i++) {
      var dn2 = norm(DIVIPOLA[codes[i]]);
      if (dn2.indexOf(n) >= 0 || n.indexOf(dn2) >= 0) return codes[i];
    }
    return null;
  }

  var topoCache = null;
  async function loadTopology(url) {
    if (topoCache) return topoCache;
    var r = await fetch(url);
    if (!r.ok) throw new Error("No se pudo cargar el mapa base (" + r.status + ")");
    topoCache = await r.json();
    return topoCache;
  }

  // Proyección plana simple (equirectangular, sin distorsión de Colombia es
  // mínima a esta escala) sobre el bbox de la topología.
  function buildProjection(topology, width, height, padding) {
    var bbox = topology.bbox; // [minLon, minLat, maxLon, maxLat]
    var lonSpan = bbox[2] - bbox[0];
    var latSpan = bbox[3] - bbox[1];
    var sx = (width - 2 * padding) / lonSpan;
    var sy = (height - 2 * padding) / latSpan;
    var scale = Math.min(sx, sy);
    var offX = padding + (width - 2 * padding - lonSpan * scale) / 2;
    var offY = padding + (height - 2 * padding - latSpan * scale) / 2;
    return function (lon, lat) {
      var x = offX + (lon - bbox[0]) * scale;
      var y = offY + (bbox[3] - lat) * scale; // invertir: lat crece hacia arriba
      return [x, y];
    };
  }

  function ringToPath(ring, project) {
    return ring.map(function (pt, i) {
      var p = project(pt[0], pt[1]);
      return (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1);
    }).join(" ") + " Z";
  }

  function geometryToPath(geometry, project) {
    if (!geometry) return "";
    if (geometry.type === "Polygon") {
      return geometry.coordinates.map(function (ring) { return ringToPath(ring, project); }).join(" ");
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.map(function (poly) {
        return poly.map(function (ring) { return ringToPath(ring, project); }).join(" ");
      }).join(" ");
    }
    return "";
  }

  function quantileColor(value, sortedValues) {
    if (!value || value <= 0 || !sortedValues.length) return RAMP_EMPTY;
    var n = sortedValues.length;
    var idx = sortedValues.length - 1;
    for (var i = 0; i < n; i++) {
      if (value <= sortedValues[i]) { idx = i; break; }
    }
    var bucket = Math.floor((idx / Math.max(1, n - 1)) * (RAMP.length - 1));
    return RAMP[Math.max(0, Math.min(RAMP.length - 1, bucket))];
  }

  /**
   * Dibuja el choropleth dentro de `container` (un elemento DOM vacío).
   * `dataByCode`: { "76": { total, valor, grupo } , ... } ya resuelto por DIVIPOLA.
   * `metrica`: "total" | "valor" — cuál campo pinta el color.
   * `onSelect(codigo, nombre)`: callback al hacer click en un departamento.
   * `onHover(codigo, nombre, datum, evt)` / `onHoverEnd()`: para tooltip.
   */
  function render(container, topology, dataByCode, opts) {
    opts = opts || {};
    var metrica = opts.metrica || "total";
    var width = opts.width || 480;
    var height = opts.height || 560;
    var objName = Object.keys(topology.objects)[0];
    var fc = topojson.feature(topology, topology.objects[objName]);
    var project = buildProjection(topology, width, height, 16);

    var values = Object.keys(dataByCode)
      .map(function (c) { return dataByCode[c][metrica] || 0; })
      .filter(function (v) { return v > 0; })
      .sort(function (a, b) { return a - b; });

    var svgParts = [];
    svgParts.push(
      '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" height="100%" ' +
      'preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de calor de procesos SECOP por departamento">'
    );

    fc.features.forEach(function (f) {
      var code = String(f.properties.codigo_departamento_s || f.properties.codigo_departamento_n || "").padStart(2, "0");
      var nombre = DIVIPOLA[code] || "Departamento " + code;
      var datum = dataByCode[code];
      var value = datum ? (datum[metrica] || 0) : 0;
      var fill = quantileColor(value, values);
      var d = geometryToPath(f.geometry, project);
      svgParts.push(
        '<path d="' + d + '" fill="' + fill + '" stroke="#ffffff" stroke-width="1" ' +
        'fill-rule="evenodd" class="mapa-dep" data-code="' + code + '" data-nombre="' + nombre.replace(/"/g, "&quot;") + '" ' +
        'tabindex="0" role="button" aria-label="' + nombre + (datum ? ", " + datum.total + " procesos" : ", sin datos") + '" ' +
        'style="cursor:' + (datum ? "pointer" : "default") + ';outline:none;transition:filter .12s">'  +
        "</path>"
      );
    });

    svgParts.push("</svg>");
    container.innerHTML = svgParts.join("");

    var svgEl = container.querySelector("svg");
    container.querySelectorAll(".mapa-dep").forEach(function (path) {
      var code = path.getAttribute("data-code");
      var nombre = path.getAttribute("data-nombre");
      var datum = dataByCode[code];

      path.addEventListener("mouseenter", function () { path.style.filter = "brightness(0.9)"; });
      path.addEventListener("mouseleave", function () {
        path.style.filter = "";
        if (opts.onHoverEnd) opts.onHoverEnd();
      });
      path.addEventListener("mousemove", function (evt) {
        if (opts.onHover) opts.onHover(code, nombre, datum, evt);
      });
      if (datum) {
        path.addEventListener("click", function () {
          container.querySelectorAll(".mapa-dep").forEach(function (p) { p.setAttribute("stroke-width", "1"); p.setAttribute("stroke", "#ffffff"); });
          path.setAttribute("stroke-width", "2.5");
          path.setAttribute("stroke", "#0e3d7e");
          if (opts.onSelect) opts.onSelect(code, nombre, datum);
        });
        path.addEventListener("keydown", function (evt) {
          if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); path.click(); }
        });
      }
    });

    return { svgEl: svgEl, values: values };
  }

  function renderLegend(container, values) {
    if (!values.length) {
      container.innerHTML = '<span>Sin datos suficientes para la leyenda.</span>';
      return;
    }
    var min = values[0];
    var max = values[values.length - 1];
    var fmt = function (n) { return n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n)); };
    var swatches = RAMP.map(function (c) {
      return '<span style="display:inline-block;width:18px;height:10px;background:' + c + ';border-radius:2px"></span>';
    }).join("");
    container.innerHTML =
      '<span>' + fmt(min) + '</span>' + swatches + '<span>' + fmt(max) + '</span>' +
      '<span class="ml-2 flex items-center gap-1"><span style="display:inline-block;width:18px;height:10px;background:' + RAMP_EMPTY + ';border-radius:2px;border:1px solid #e2e8f0"></span> Sin procesos</span>';
  }

  return {
    DIVIPOLA: DIVIPOLA,
    matchDeptName: matchDeptName,
    loadTopology: loadTopology,
    render: render,
    renderLegend: renderLegend,
  };
})();
