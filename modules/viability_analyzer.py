"""
Analizador de viabilidad SECOP II · pliego vs RUP del cliente.

Pipeline:
    1. Fetch URLs de documentos del proceso desde dmgg-8hin (datos.gov.co)
    2. Descarga pliego + anexo técnico
    3. Extrae índices financieros, códigos UNSPSC y experiencia específica
    4. Cruza contra el RUP del cliente
    5. Genera veredicto por indicador (Verde / Amarillo / Rojo)
    6. Produce informe .md con recomendaciones Go/No-Go

Uso programático:
    from modules.viability_analyzer import ViabilityAnalyzer

    analyzer = ViabilityAnalyzer()
    informe = analyzer.evaluar(
        numero_proceso="LP-DNP-001-2026",
        rup_cliente={
            "liquidez": 1.8,
            "endeudamiento": 45.0,
            "razon_cobertura": 3.2,
            "rentabilidad_patrimonio": 0.12,
            "rentabilidad_activo": 0.08,
            "patrimonio": 500_000_000,
            "k_contratacion": 2500,  # en SMMLV
            "unspsc_codes": ["43211500", "43222600"],
            "experiencia_contratos": [
                {"objeto": "Suministro equipos TIC", "valor_smmlv": 800},
                {"objeto": "Soporte software", "valor_smmlv": 1200},
            ],
        },
    )
    print(informe.markdown)

CLI:
    python -m modules.viability_analyzer PROCESO_123 --rup rup_cliente.json
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import pdfplumber
except ImportError as exc:
    raise ImportError("Falta pdfplumber. pip install pdfplumber") from exc

import requests

from modules.secop_client import SecopClient

logger = logging.getLogger(__name__)


# ============================================================================
# Modelos
# ============================================================================

VERDE = "🟢 VERDE"
AMARILLO = "🟡 AMARILLO"
ROJO = "🔴 ROJO"


@dataclass
class IndicadorRequerido:
    """Un indicador exigido por el pliego."""
    nombre: str
    operador: str          # ">=", "<=", ">", "<", "="
    valor_requerido: float
    unidad: str = ""


@dataclass
class HallazgoCruce:
    """Resultado del cruce de un indicador contra el RUP del cliente."""
    indicador: str
    exigido: str           # "≥ 1.5"
    cliente: str           # "1.8"
    semaforo: str          # VERDE / AMARILLO / ROJO
    observacion: str
    subsanable: bool = False


@dataclass
class InformeViabilidad:
    """Entregable completo."""
    numero_proceso: str
    presupuesto_oficial: float = 0.0
    duracion: str = ""
    objeto: str = ""
    financiero: list[HallazgoCruce] = field(default_factory=list)
    unspsc: HallazgoCruce = None
    experiencia: HallazgoCruce = None
    riesgos: list[str] = field(default_factory=list)
    oportunidades_observacion: list[str] = field(default_factory=list)
    veredicto: str = ""
    archivos_descargados: list[str] = field(default_factory=list)
    markdown: str = ""


# ============================================================================
# Patrones de extracción (regex adaptados a pliegos típicos colombianos)
# ============================================================================

PATRONES_FINANCIEROS = {
    "liquidez": [
        r"(?i)[íi]ndice\s+de\s+liquidez[\s\S]{0,80}?(?:≥|>=|mayor\s+o?\s*igual\s+a|igual\s+o?\s+superior\s+a|m[íi]nimo)[\s\S]{0,20}?(\d+[.,]?\d*)",
        r"(?i)liquidez[\s\S]{0,40}?(?:≥|>=|m[íi]nimo)\s*(\d+[.,]?\d*)",
    ],
    "endeudamiento": [
        r"(?i)[íi]ndice\s+de\s+endeudamiento[\s\S]{0,80}?(?:≤|<=|menor\s+o?\s*igual\s+a|m[áa]ximo|no\s+superior\s+al?)[\s\S]{0,20}?(\d+[.,]?\d*)\s*%?",
        r"(?i)endeudamiento[\s\S]{0,40}?(?:≤|<=|m[áa]ximo)\s*(\d+[.,]?\d*)\s*%?",
    ],
    "razon_cobertura": [
        r"(?i)raz[óo]n\s+de\s+cobertura\s+(?:de\s+)?intereses[\s\S]{0,80}?(?:≥|>=|m[íi]nimo)[\s\S]{0,20}?(\d+[.,]?\d*)",
        r"(?i)cobertura\s+de\s+intereses[\s\S]{0,40}?(?:≥|>=|m[íi]nimo)\s*(\d+[.,]?\d*)",
    ],
    "rentabilidad_patrimonio": [
        r"(?i)rentabilidad\s+del?\s+patrimonio[\s\S]{0,80}?(?:≥|>=|m[íi]nimo)[\s\S]{0,20}?(\d+[.,]?\d*)\s*%?",
    ],
    "rentabilidad_activo": [
        r"(?i)rentabilidad\s+del?\s+activo[\s\S]{0,80}?(?:≥|>=|m[íi]nimo)[\s\S]{0,20}?(\d+[.,]?\d*)\s*%?",
    ],
    "k_contratacion": [
        r"(?i)capacidad\s+(?:residual\s+)?de\s+contrataci[óo]n[\s\S]{0,80}?(?:≥|>=|m[íi]nimo)[\s\S]{0,20}?(\d+[.,]?\d*)\s*SMMLV",
        r"(?i)K[\s\-]?(?:de\s+)?contrataci[óo]n[\s\S]{0,60}?(?:≥|>=|m[íi]nimo)[\s\S]{0,20}?(\d+[.,]?\d*)\s*SMMLV",
    ],
}

PATRON_UNSPSC = re.compile(r"\b(\d{8})\b")
PATRON_SMMLV = re.compile(r"(?i)(\d+(?:[.,]\d+)?)\s*SMMLV")
PATRON_PRESUPUESTO = re.compile(
    r"(?i)presupuesto\s+oficial[\s\S]{0,80}?\$?\s*([\d.,]+)"
)
PATRON_DURACION = re.compile(
    r"(?i)plazo\s+(?:de\s+)?ejecuci[óo]n[\s\S]{0,80}?(\d+)\s*(d[íi]as|meses|a[ñn]os)"
)


# ============================================================================
# Analizador
# ============================================================================

class ViabilityAnalyzer:

    def __init__(self, app_token: Optional[str] = None, workdir: Optional[Path] = None):
        self.app_token = app_token or os.getenv("SOCRATA_APP_TOKEN")
        self.workdir = Path(workdir) if workdir else Path(tempfile.mkdtemp(prefix="licita_viab_"))
        self.workdir.mkdir(parents=True, exist_ok=True)

    # -----------------------------------------------------------------
    # Fase 1: Fetch URLs + descarga
    # -----------------------------------------------------------------

    def fetch_documentos(self, numero_proceso: str, limite: int = 20) -> list[dict]:
        """Obtiene lista de documentos descargables del proceso desde dmgg-8hin."""
        with SecopClient(app_token=self.app_token) as cli:
            # El dataset dmgg-8hin tiene columnas típicas:
            # id_del_proceso, nombre_archivo, tipo_de_documento, url_descarga_documento
            df = cli.consultar(
                dataset_key="archivos_descarga",
                where=f"id_del_proceso = '{numero_proceso}'",
                limit=limite,
            )
        if df.empty:
            # Fallback: buscar sin el filtro exacto por si la columna se llama distinto
            with SecopClient(app_token=self.app_token) as cli:
                df = cli.consultar(
                    dataset_key="archivos_descarga",
                    where=f"UPPER(id_del_proceso) LIKE '%{numero_proceso.upper()}%'",
                    limit=limite,
                )
        return df.to_dict("records") if not df.empty else []

    def filtrar_relevantes(self, documentos: list[dict]) -> list[dict]:
        """Deja solo pliego definitivo y anexo técnico."""
        patrones_relevantes = [
            r"pliego\s+(?:de\s+condiciones\s+)?definitiv",
            r"anexo\s+t[ée]cnico",
            r"documento\s+tipo",
        ]
        relevantes = []
        for d in documentos:
            nombre = str(d.get("nombre_archivo", "") or d.get("tipo_de_documento", "")).lower()
            if any(re.search(p, nombre) for p in patrones_relevantes):
                relevantes.append(d)
        return relevantes

    def descargar(self, documento: dict) -> Optional[Path]:
        url = documento.get("url_descarga_documento") or documento.get("urlproceso")
        if not url:
            return None
        nombre = re.sub(r"[^\w\.\-]", "_", str(documento.get("nombre_archivo") or "doc.pdf"))
        destino = self.workdir / nombre
        try:
            r = requests.get(url, timeout=60, stream=True)
            r.raise_for_status()
            with destino.open("wb") as fh:
                for chunk in r.iter_content(chunk_size=65536):
                    fh.write(chunk)
            return destino
        except (requests.RequestException, OSError) as exc:
            logger.warning("No se pudo descargar %s: %s", url, exc)
            return None

    # -----------------------------------------------------------------
    # Fase 2: Extracción
    # -----------------------------------------------------------------

    @staticmethod
    def texto_pdf(path: Path) -> str:
        try:
            with pdfplumber.open(path) as pdf:
                return "\n".join(page.extract_text() or "" for page in pdf.pages)
        except Exception as exc:
            logger.warning("No se pudo leer PDF %s: %s", path, exc)
            return ""

    @staticmethod
    def extraer_indicadores(texto: str) -> dict[str, float]:
        """Extrae índices financieros del pliego."""
        indicadores = {}
        for key, patterns in PATRONES_FINANCIEROS.items():
            for pat in patterns:
                m = re.search(pat, texto)
                if m:
                    try:
                        indicadores[key] = float(m.group(1).replace(",", "."))
                        break
                    except (ValueError, IndexError):
                        continue
        return indicadores

    @staticmethod
    def extraer_unspsc(texto: str) -> list[str]:
        """UNSPSC son códigos de 8 dígitos. Filtra duplicados preservando orden."""
        encontrados = PATRON_UNSPSC.findall(texto)
        vistos = set()
        unicos = []
        for c in encontrados:
            if c not in vistos:
                vistos.add(c)
                unicos.append(c)
        return unicos

    @staticmethod
    def extraer_experiencia_minima_smmlv(texto: str) -> Optional[float]:
        """Busca el valor en SMMLV de experiencia específica requerida."""
        matches = PATRON_SMMLV.findall(texto)
        valores = []
        for m in matches:
            try:
                valores.append(float(m.replace(",", ".")))
            except ValueError:
                continue
        if not valores:
            return None
        # Toma el valor más común que esté dentro de un rango razonable (10-100000)
        valores_filtrados = [v for v in valores if 10 <= v <= 100_000]
        if not valores_filtrados:
            return None
        # El valor típico es la mediana (evita outliers)
        valores_filtrados.sort()
        return valores_filtrados[len(valores_filtrados) // 2]

    @staticmethod
    def extraer_presupuesto(texto: str) -> float:
        m = PATRON_PRESUPUESTO.search(texto)
        if not m:
            return 0.0
        raw = m.group(1).replace(".", "").replace(",", ".")
        try:
            return float(raw)
        except ValueError:
            return 0.0

    @staticmethod
    def extraer_duracion(texto: str) -> str:
        m = PATRON_DURACION.search(texto)
        return f"{m.group(1)} {m.group(2)}" if m else ""

    # -----------------------------------------------------------------
    # Fase 3: Cruce con RUP
    # -----------------------------------------------------------------

    def cruzar_financieros(
        self,
        exigidos: dict[str, float],
        rup: dict,
    ) -> list[HallazgoCruce]:
        """Compara cada indicador exigido contra el RUP del cliente."""
        hallazgos = []
        reglas = [
            ("liquidez",              "Liquidez",                ">=", False),
            ("endeudamiento",         "Endeudamiento (%)",       "<=", False),
            ("razon_cobertura",       "Razón Cobertura Intereses", ">=", False),
            ("rentabilidad_patrimonio", "Rentabilidad Patrimonio (%)", ">=", True),
            ("rentabilidad_activo",   "Rentabilidad Activo (%)", ">=", True),
            ("k_contratacion",        "K Contratación (SMMLV)",  ">=", False),
        ]
        for key, nombre, op, es_porcentaje in reglas:
            if key not in exigidos:
                continue
            exigido = exigidos[key]
            cliente = rup.get(key)
            if cliente is None:
                hallazgos.append(HallazgoCruce(
                    indicador=nombre,
                    exigido=f"{op} {exigido}",
                    cliente="No reportado en RUP",
                    semaforo=ROJO,
                    observacion="El RUP del cliente no reporta este indicador. Verificar renovación.",
                    subsanable=False,
                ))
                continue

            # Normalizar % si el cliente lo entrega como fracción (0.12 → 12.0)
            cliente_norm = float(cliente)
            if es_porcentaje and cliente_norm < 1 and exigido > 1:
                cliente_norm *= 100

            cumple = (op == ">=" and cliente_norm >= exigido) or \
                     (op == "<=" and cliente_norm <= exigido)
            margen_pct = abs(cliente_norm - exigido) / max(exigido, 0.01) * 100

            if cumple:
                if margen_pct >= 20:
                    sem, obs = VERDE, "Cumple holgadamente."
                else:
                    sem, obs = AMARILLO, f"Cumple ajustado (margen {margen_pct:.1f}%). Vigilar durante ejecución."
            else:
                sem = ROJO
                obs = (
                    f"NO cumple. Déficit del {margen_pct:.1f}%. "
                    "Insubsanable sin modificar el RUP vigente — "
                    "evaluar renovación extraordinaria o Unión Temporal."
                )
            hallazgos.append(HallazgoCruce(
                indicador=nombre,
                exigido=f"{op} {exigido}",
                cliente=f"{cliente_norm:.2f}",
                semaforo=sem,
                observacion=obs,
                subsanable=False,  # Habilitantes del RUP no son subsanables post-cierre
            ))
        return hallazgos

    def cruzar_unspsc(
        self,
        unspsc_pliego: list[str],
        unspsc_cliente: list[str],
        presupuesto: float,
    ) -> HallazgoCruce:
        """Valida que los UNSPSC del cliente cubran lo exigido."""
        if not unspsc_pliego:
            return HallazgoCruce(
                indicador="Códigos UNSPSC",
                exigido="No detectados en el pliego",
                cliente=", ".join(unspsc_cliente[:5]) if unspsc_cliente else "—",
                semaforo=AMARILLO,
                observacion="No se extrajeron códigos UNSPSC del pliego. Verificar manualmente.",
            )
        set_cliente = set(unspsc_cliente or [])
        coincidentes = [c for c in unspsc_pliego if c in set_cliente]
        pct = len(coincidentes) / len(unspsc_pliego) if unspsc_pliego else 0

        if pct >= 0.5:
            sem = VERDE
            obs = f"Cliente cubre {pct*100:.0f}% de los códigos exigidos."
        elif pct > 0:
            sem = AMARILLO
            obs = (
                f"Cobertura parcial ({pct*100:.0f}%). Puede ser suficiente si el pliego exige "
                "solo cobertura del 50% del presupuesto en UNSPSC coincidentes."
            )
        else:
            sem = ROJO
            obs = (
                "Cliente no tiene registrados los UNSPSC exigidos. "
                "Insubsanable: inscribirlos en el RUP toma semanas."
            )
        return HallazgoCruce(
            indicador="Códigos UNSPSC",
            exigido=f"{len(unspsc_pliego)} códigos ({', '.join(unspsc_pliego[:5])}...)",
            cliente=f"{len(set_cliente)} registrados · {len(coincidentes)} coincidentes",
            semaforo=sem,
            observacion=obs,
        )

    def cruzar_experiencia(
        self,
        valor_minimo_smmlv: Optional[float],
        contratos_cliente: list[dict],
        presupuesto: float,
    ) -> HallazgoCruce:
        """Valida que la experiencia del cliente supere lo exigido."""
        if valor_minimo_smmlv is None:
            return HallazgoCruce(
                indicador="Experiencia específica",
                exigido="No detectado en el pliego",
                cliente=f"{len(contratos_cliente)} contratos aportables",
                semaforo=AMARILLO,
                observacion="Verificar manualmente el requisito de experiencia.",
            )
        total_cliente = sum(float(c.get("valor_smmlv", 0)) for c in (contratos_cliente or []))
        if total_cliente >= valor_minimo_smmlv:
            margen = (total_cliente - valor_minimo_smmlv) / valor_minimo_smmlv * 100
            sem = VERDE if margen >= 20 else AMARILLO
            obs = f"Cumple{' holgadamente' if sem == VERDE else ' ajustado'} (margen {margen:.1f}%)."
        else:
            deficit = (valor_minimo_smmlv - total_cliente) / valor_minimo_smmlv * 100
            sem = ROJO
            obs = (
                f"Déficit del {deficit:.1f}% en SMMLV acreditables. "
                "Evaluar Unión Temporal con empresa que aporte el resto."
            )
        return HallazgoCruce(
            indicador="Experiencia específica (SMMLV)",
            exigido=f"≥ {valor_minimo_smmlv:.0f} SMMLV",
            cliente=f"{total_cliente:.0f} SMMLV ({len(contratos_cliente)} contratos)",
            semaforo=sem,
            observacion=obs,
        )

    # -----------------------------------------------------------------
    # Fase 4: Veredicto y recomendaciones
    # -----------------------------------------------------------------

    @staticmethod
    def _veredicto(hallazgos: list[HallazgoCruce]) -> str:
        n_rojo = sum(1 for h in hallazgos if h.semaforo == ROJO)
        n_amarillo = sum(1 for h in hallazgos if h.semaforo == AMARILLO)
        if n_rojo >= 2:
            return "🚫 **NO-GO** · Dos o más riesgos de rechazo insubsanable."
        if n_rojo == 1:
            return "⚠️ **GO CON RIESGO** · Un indicador rojo. Postular solo si se puede modificar vía observación."
        if n_amarillo >= 3:
            return "⚠️ **GO CON ATENCIÓN** · Varios indicadores ajustados. Revisar márgenes antes del cierre."
        return "✅ **GO** · Perfil habilitado. Enfocarse en propuesta técnica/económica."

    @staticmethod
    def _oportunidades_observacion(hallazgos: list[HallazgoCruce]) -> list[str]:
        """Para cada ROJO en habilitantes, sugiere observación al pliego."""
        obs = []
        for h in hallazgos:
            if h.semaforo != ROJO:
                continue
            if "Liquidez" in h.indicador or "Endeudamiento" in h.indicador or "Rentabilidad" in h.indicador:
                obs.append(
                    f"Observar el indicador '{h.indicador}' por desproporción vs. presupuesto "
                    "(art. 5 Ley 1150, Decreto 1082). Solicitar ajuste proporcional antes del cierre."
                )
            elif "UNSPSC" in h.indicador:
                obs.append(
                    f"Observar la exigencia estricta de UNSPSC exactos; el Decreto 1082 permite "
                    "cobertura por códigos equivalentes o del mismo segmento."
                )
            elif "Experiencia" in h.indicador:
                obs.append(
                    f"Observar el valor mínimo de experiencia en SMMLV por desproporción "
                    "al presupuesto oficial (jurisprudencia Consejo de Estado · Sección Tercera)."
                )
        return obs

    # -----------------------------------------------------------------
    # Fase 5: Informe markdown
    # -----------------------------------------------------------------

    @staticmethod
    def render_markdown(inf: InformeViabilidad) -> str:
        lineas = []
        lineas.append(f"# Análisis de Viabilidad · Proceso {inf.numero_proceso}")
        lineas.append("")
        lineas.append(f"- **Objeto:** {inf.objeto or '—'}")
        if inf.presupuesto_oficial:
            lineas.append(f"- **Presupuesto Oficial:** $ {inf.presupuesto_oficial:,.0f}")
        if inf.duracion:
            lineas.append(f"- **Duración:** {inf.duracion}")
        lineas.append(f"- **Archivos analizados:** {len(inf.archivos_descargados)}")
        lineas.append("")
        lineas.append("## Veredicto")
        lineas.append(inf.veredicto)
        lineas.append("")
        lineas.append("## Tabla Semáforo · Indicadores Financieros")
        lineas.append("")
        lineas.append("| Indicador | Exigido | Cliente | Semáforo | Observación |")
        lineas.append("|---|---|---|---|---|")
        for h in inf.financiero:
            lineas.append(f"| {h.indicador} | {h.exigido} | {h.cliente} | {h.semaforo} | {h.observacion} |")
        lineas.append("")
        lineas.append("## Capacidad Técnica")
        lineas.append("")
        lineas.append("| Indicador | Exigido | Cliente | Semáforo | Observación |")
        lineas.append("|---|---|---|---|---|")
        if inf.unspsc:
            lineas.append(f"| {inf.unspsc.indicador} | {inf.unspsc.exigido} | {inf.unspsc.cliente} | {inf.unspsc.semaforo} | {inf.unspsc.observacion} |")
        if inf.experiencia:
            lineas.append(f"| {inf.experiencia.indicador} | {inf.experiencia.exigido} | {inf.experiencia.cliente} | {inf.experiencia.semaforo} | {inf.experiencia.observacion} |")
        lineas.append("")
        if inf.oportunidades_observacion:
            lineas.append("## Oportunidades de Observación al Pliego")
            lineas.append("")
            for o in inf.oportunidades_observacion:
                lineas.append(f"- {o}")
            lineas.append("")
        if inf.riesgos:
            lineas.append("## Riesgos de Rechazo")
            lineas.append("")
            for r in inf.riesgos:
                lineas.append(f"- {r}")
            lineas.append("")
        lineas.append("---")
        lineas.append("")
        lineas.append(
            "> ⚠️ Insumo de apoyo generado por LICITA. Debe ser revisado por un "
            "profesional del derecho antes de radicar observaciones o decidir Go/No-Go."
        )
        return "\n".join(lineas)

    # -----------------------------------------------------------------
    # Orquestador
    # -----------------------------------------------------------------

    def evaluar(self, numero_proceso: str, rup_cliente: dict) -> InformeViabilidad:
        inf = InformeViabilidad(numero_proceso=numero_proceso)

        logger.info("Fase 1 · fetch documentos")
        docs = self.fetch_documentos(numero_proceso)
        relevantes = self.filtrar_relevantes(docs)
        if not relevantes:
            inf.riesgos.append(
                f"No se encontraron documentos descargables para el proceso {numero_proceso} "
                "en el dataset dmgg-8hin. Verificar el número de proceso o buscar en el "
                "portal SECOP II directamente."
            )
            inf.veredicto = "⚠️ **ANÁLISIS INCOMPLETO** · No se pudieron descargar los pliegos."
            inf.markdown = self.render_markdown(inf)
            return inf

        logger.info("Fase 2 · descarga y extracción")
        texto_combinado = ""
        for d in relevantes:
            path = self.descargar(d)
            if path:
                inf.archivos_descargados.append(str(path))
                texto_combinado += "\n" + self.texto_pdf(path)

        if not texto_combinado.strip():
            inf.riesgos.append("Los documentos descargados no contienen texto extraíble (posible OCR requerido).")
            inf.veredicto = "⚠️ **ANÁLISIS INCOMPLETO** · Documentos sin texto extraíble."
            inf.markdown = self.render_markdown(inf)
            return inf

        inf.presupuesto_oficial = self.extraer_presupuesto(texto_combinado)
        inf.duracion = self.extraer_duracion(texto_combinado)

        exigidos = self.extraer_indicadores(texto_combinado)
        unspsc_pliego = self.extraer_unspsc(texto_combinado)
        exp_minima = self.extraer_experiencia_minima_smmlv(texto_combinado)

        logger.info("Fase 3 · cruce con RUP cliente")
        inf.financiero = self.cruzar_financieros(exigidos, rup_cliente)
        inf.unspsc = self.cruzar_unspsc(
            unspsc_pliego=unspsc_pliego[:30],
            unspsc_cliente=rup_cliente.get("unspsc_codes", []),
            presupuesto=inf.presupuesto_oficial,
        )
        inf.experiencia = self.cruzar_experiencia(
            valor_minimo_smmlv=exp_minima,
            contratos_cliente=rup_cliente.get("experiencia_contratos", []),
            presupuesto=inf.presupuesto_oficial,
        )

        todos = list(inf.financiero) + [inf.unspsc, inf.experiencia]
        todos = [h for h in todos if h is not None]
        inf.veredicto = self._veredicto(todos)
        inf.oportunidades_observacion = self._oportunidades_observacion(todos)
        inf.markdown = self.render_markdown(inf)
        return inf


# ============================================================================
# CLI
# ============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Analiza viabilidad de un proceso SECOP II")
    parser.add_argument("numero_proceso", help="Número del proceso (ej: LP-DNP-001-2026)")
    parser.add_argument("--rup", required=True, help="Ruta al JSON con datos del RUP cliente")
    parser.add_argument("--salida", default=None, help="Archivo .md de salida (opcional)")
    args = parser.parse_args()

    with open(args.rup, encoding="utf-8") as fh:
        rup = json.load(fh)

    analyzer = ViabilityAnalyzer()
    informe = analyzer.evaluar(args.numero_proceso, rup)

    salida = args.salida or f"analisis_viabilidad_{args.numero_proceso}.md"
    with open(salida, "w", encoding="utf-8") as fh:
        fh.write(informe.markdown)
    print(f"OK · informe en {salida}")
    print(f"Veredicto: {informe.veredicto}")
