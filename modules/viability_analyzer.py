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

import datetime as dt
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

from modules.minima_cuantia import AnalisisPrecio, MinimaCuantia
from modules.rup_extractor import parse_numero
from modules.secop_client import SecopClient

logger = logging.getLogger(__name__)


# ============================================================================
# Modelos
# ============================================================================

VERDE = "🟢 VERDE"
AMARILLO = "🟡 AMARILLO"
ROJO = "🔴 ROJO"
NO_APLICA = "⚪ NO APLICA"

# SMMLV 2026. Solo se usa para pasar de pesos a SMMLV cuando el requisito y los
# contratos vienen en unidades distintas. Se puede cambiar con LICITA_SMMLV o en la página.
SMMLV_DEFAULT = float(os.getenv("LICITA_SMMLV", "1750905"))


@dataclass
class RequisitoExperiencia:
    valor_smmlv: Optional[float] = None
    no_exige: bool = False
    descripcion: str = ""
    en_pesos: bool = False   # el documento lo expresa en pesos (p. ej. % del presupuesto)


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
    modalidad: str = ""
    precio: Optional[AnalisisPrecio] = None
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

    def fetch_metadata_proceso(self, numero_proceso: str) -> dict:
        """
        Datos estructurados del proceso en p6dx-8zbt: modalidad, presupuesto, objeto.
        Más confiables que leerlos del PDF. Devuelve {} si no se encuentra.
        """
        numero = numero_proceso.replace("'", "''")
        with SecopClient(app_token=self.app_token) as cli:
            for campo in ("id_del_proceso", "referencia_del_proceso"):
                try:
                    df = cli.consultar(
                        dataset_key="procesos_secop2",
                        where=f"{campo} = '{numero}'",
                        limit=1,
                    )
                except Exception:
                    continue
                if not df.empty:
                    return df.iloc[0].to_dict()
        return {}

    @staticmethod
    def detectar_modalidad(texto: str, metadata: dict) -> str:
        modalidad = str(metadata.get("modalidad_de_contratacion", "") or "")
        if modalidad:
            return modalidad
        if re.search(r"(?i)m[íi]nima\s+cuant[íi]a", texto):
            return "Mínima cuantía"
        return ""

    @staticmethod
    def es_minima_cuantia(modalidad: str) -> bool:
        return bool(re.search(r"(?i)m[íi]nima\s+cuant[íi]a", modalidad or ""))

    def filtrar_relevantes(self, documentos: list[dict]) -> list[dict]:
        """Deja pliego definitivo y anexo técnico; en mínima cuantía, invitación y estudios previos."""
        patrones_relevantes = [
            r"pliego\s+(?:de\s+condiciones\s+)?definitiv",
            r"anexo\s+t[ée]cnico",
            r"documento\s+tipo",
            r"invitaci[óo]n",
            r"estudios?\s+previos?",
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
    def extraer_requisito_experiencia(
        texto: str,
        presupuesto: float = 0.0,
        smmlv: float = SMMLV_DEFAULT,
    ) -> RequisitoExperiencia:
        """
        Busca el valor exigido junto a la palabra "experiencia", no en todo el documento
        (si no, se confunde con la capacidad residual u otros valores en SMMLV).
        """
        if re.search(
            r"(?i)no\s+se\s+(?:exige|exigir[áa]|requiere|requerir[áa]|solicita|solicitar[áa])"
            r"\s+(?:acreditar\s+)?experiencia",
            texto,
        ):
            return RequisitoExperiencia(no_exige=True, descripcion="La invitación no exige experiencia")

        cerca = r"[\s\S]{0,400}?"
        especifica = r"(?i)experiencia\s+(?:espec[íi]fica|m[íi]nima|requerida|habilitante|del\s+proponente)"
        en_smmlv = (
            r"(\d[\d.,]*)\)?\s*(?:\([^)]{0,60}\)\s*)?(?:SMMLV|SMLMV|salarios\s+m[íi]nimos)"
        )
        en_pct = (
            r"(\d{1,3}(?:[.,]\d+)?)\s*%\s*\)?\s*(?:del?\s+)?(?:valor\s+del\s+)?presupuesto"
        )
        igual_presupuesto = (
            r"(?:igual\s+o\s+superior|mayor\s+o\s+igual|superior)\s+al?\s+"
            r"(?:valor\s+del\s+)?presupuesto\s+oficial"
        )

        def _smmlv(etiqueta: str) -> Optional[RequisitoExperiencia]:
            m = re.search(etiqueta + cerca + en_smmlv, texto, re.I)
            if not m:
                return None
            v = parse_numero(m.group(1), dinero=True)  # "1.500 SMMLV" = mil quinientos
            if v and 1 <= v <= 1_000_000:
                return RequisitoExperiencia(valor_smmlv=v, descripcion=f"{v:,.0f} SMMLV")
            return None

        req = _smmlv(especifica)
        if req:
            return req

        m = re.search(r"(?i)experiencia" + cerca + en_pct, texto)
        if m and presupuesto > 0:
            pct = parse_numero(m.group(1)) or 0
            if 0 < pct <= 1000:
                cop = presupuesto * pct / 100
                return RequisitoExperiencia(
                    valor_smmlv=cop / smmlv,
                    descripcion=f"{pct:g}% del presupuesto",
                    en_pesos=True,
                )

        if presupuesto > 0 and re.search(r"(?i)experiencia" + cerca + igual_presupuesto, texto):
            return RequisitoExperiencia(
                valor_smmlv=presupuesto / smmlv,
                descripcion="100% del presupuesto",
                en_pesos=True,
            )

        return _smmlv(r"(?i)experiencia") or RequisitoExperiencia()

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
            ("endeudamiento",         "Endeudamiento (%)",       "<=", True),
            ("razon_cobertura",       "Razón Cobertura Intereses", ">=", False),
            ("rentabilidad_patrimonio", "Rentabilidad Patrimonio (%)", ">=", True),
            ("rentabilidad_activo",   "Rentabilidad Activo (%)", ">=", True),
            ("k_contratacion",        "K Contratación (SMMLV)",  ">=", False),
        ]
        def _pct(v: float) -> float:
            # El RUP certifica estos índices como fracción (0,42); los pliegos usan % o fracción.
            return v * 100 if -1 <= v <= 1 else v

        for key, nombre, op, es_porcentaje in reglas:
            if key not in exigidos:
                continue
            exigido = exigidos[key]
            if es_porcentaje:
                exigido = _pct(exigido)
            cliente = rup.get(key)

            if key == "razon_cobertura" and isinstance(cliente, str) and cliente.upper().startswith("INDETERMINAD"):
                hallazgos.append(HallazgoCruce(
                    indicador=nombre,
                    exigido=f"{op} {exigido}",
                    cliente="Indeterminado",
                    semaforo=VERDE,
                    observacion="Sin gastos de intereses: cumple, salvo que el pliego diga expresamente lo contrario.",
                ))
                continue
            if key == "k_contratacion" and cliente is None:
                hallazgos.append(HallazgoCruce(
                    indicador=nombre,
                    exigido=f"{op} {exigido}",
                    cliente="No viene en el RUP",
                    semaforo=AMARILLO,
                    observacion=(
                        "La capacidad residual no se certifica en el RUP: se calcula con los "
                        "contratos en ejecución y el formato del pliego. Calcularla antes del cierre."
                    ),
                ))
                continue
            if cliente is None:
                hallazgos.append(HallazgoCruce(
                    indicador=nombre,
                    exigido=f"{op} {exigido}",
                    cliente="Sin dato",
                    semaforo=ROJO,
                    observacion=(
                        "El cliente no tiene este indicador cargado. Sale del RUP o, si no hay RUP "
                        "(mínima cuantía), de los estados financieros. Cargarlo antes de decidir."
                    ),
                    subsanable=False,
                ))
                continue

            cliente_norm = float(cliente)
            if es_porcentaje:
                cliente_norm = _pct(cliente_norm)

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
                    f"NO cumple. Déficit del {margen_pct:.1f}%. Los indicadores del RUP salen del "
                    "último cierre fiscal y no se pueden mejorar para este proceso: la vía es un "
                    "consorcio o unión temporal, o una observación al pliego si el indicador es desproporcionado."
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
        # El RUP clasifica a nivel clase (6 dígitos); el pliego suele listar el código de 8.
        set_cliente = {str(c)[:6] for c in (unspsc_cliente or [])}
        unspsc_pliego = list(dict.fromkeys(str(c)[:6] for c in unspsc_pliego))
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

    @staticmethod
    def _total_smmlv(contratos: list[dict], smmlv: float) -> float:
        """Suma en SMMLV. Acepta valor_smmlv o valor_cop; pondera por % de participación (consorcios/UT)."""
        total = 0.0
        for c in contratos or []:
            if c.get("valor_smmlv"):
                v = float(c["valor_smmlv"])
            elif c.get("valor_cop"):
                v = float(c["valor_cop"]) / smmlv
            else:
                continue
            total += v * float(c.get("participacion", 100) or 100) / 100
        return total

    @staticmethod
    def _anios_constituida(fecha_constitucion: str) -> Optional[float]:
        try:
            f = dt.date.fromisoformat(str(fecha_constitucion)[:10])
        except ValueError:
            return None
        return (dt.date.today() - f).days / 365.25

    def cruzar_experiencia(
        self,
        requisito: RequisitoExperiencia,
        cliente: dict,
        smmlv: float = SMMLV_DEFAULT,
    ) -> HallazgoCruce:
        """Experiencia propia y, en empresas de menos de 3 años, la de los socios."""
        contratos = cliente.get("experiencia_contratos", []) or []
        socios = cliente.get("experiencia_socios", []) or []
        propia = self._total_smmlv(contratos, smmlv)
        anios = self._anios_constituida(cliente.get("fecha_constitucion", ""))

        def fmt(v_smmlv: float) -> str:
            # Se muestra en la misma unidad en que el documento pide la experiencia
            return f"${v_smmlv * smmlv:,.0f}" if requisito.en_pesos else f"{v_smmlv:,.0f} SMMLV"

        texto_cliente = f"{fmt(propia)} ({len(contratos)} contrato(s))"

        if requisito.no_exige:
            return HallazgoCruce("Experiencia", "No exigida", texto_cliente, VERDE, requisito.descripcion + ".")
        if requisito.valor_smmlv is None:
            return HallazgoCruce(
                "Experiencia", "No detectado en el documento", texto_cliente, AMARILLO,
                "Verificar a mano qué experiencia pide el documento.",
            )

        exigido = requisito.valor_smmlv
        etiqueta_exigido = f"≥ {fmt(exigido)}" + (f" ({requisito.descripcion})" if requisito.en_pesos else "")
        if propia >= exigido:
            margen = (propia - exigido) / exigido * 100
            sem = VERDE if margen >= 20 else AMARILLO
            obs = f"Cumple{' holgadamente' if sem == VERDE else ' ajustado'} (margen {margen:.1f}%)."
            return HallazgoCruce("Experiencia", etiqueta_exigido, texto_cliente, sem, obs)

        # Empresas con menos de 3 años pueden acreditar la experiencia de sus socios
        # (art. 6 Ley 1150 de 2007, modificado por el art. 221 Decreto Ley 019 de 2012).
        if anios is not None and anios < 3 and socios:
            con_socios = propia + self._total_smmlv(socios, smmlv)
            texto_cliente += f" + socios = {fmt(con_socios)}"
            if con_socios >= exigido:
                return HallazgoCruce(
                    "Experiencia", etiqueta_exigido, texto_cliente, AMARILLO,
                    "Cumple sumando la experiencia de los socios, permitido porque la empresa tiene "
                    f"{anios:.1f} años de constituida. Aportar certificados de cada socio y revisar "
                    "que el documento no pida experiencia exclusiva de la persona jurídica.",
                )

        deficit = (exigido - propia) / exigido * 100
        opciones = ["formar un consorcio o unión temporal con quien aporte la experiencia faltante"]
        if anios is not None and anios < 3 and not socios:
            opciones.insert(0, "cargar la experiencia de los socios: la empresa tiene menos de 3 años y la ley lo permite")
        elif anios is None and not socios:
            opciones.insert(0, "si la empresa tiene menos de 3 años, cargar fecha de constitución y experiencia de los socios")
        opciones.append("buscar procesos con menor exigencia (en mínima cuantía muchas entidades piden poca o ninguna)")
        return HallazgoCruce(
            "Experiencia", etiqueta_exigido, texto_cliente, ROJO,
            f"Falta el {deficit:.1f}% de la experiencia exigida. Opciones: " + "; ".join(opciones) + ".",
        )

    # -----------------------------------------------------------------
    # Fase 4: Veredicto y recomendaciones
    # -----------------------------------------------------------------

    @staticmethod
    def _veredicto(hallazgos: list[HallazgoCruce], minima: bool = False,
                   precio: Optional[AnalisisPrecio] = None) -> str:
        n_rojo = sum(1 for h in hallazgos if h.semaforo == ROJO)
        n_amarillo = sum(1 for h in hallazgos if h.semaforo == AMARILLO)
        if n_rojo >= 2:
            return "🚫 **NO-GO** · Dos o más riesgos de rechazo insubsanable."
        if n_rojo == 1:
            return "⚠️ **GO CON RIESGO** · Un indicador rojo. Postular solo si se puede modificar vía observación."
        if minima and precio and precio.disponible and precio.margen_max is not None and precio.margen_max < 0:
            return "🚫 **NO-GO** · Habilitado, pero al precio que suele ganar no hay ganancia."
        if n_amarillo >= 3:
            return "⚠️ **GO CON ATENCIÓN** · Varios indicadores ajustados. Revisar márgenes antes del cierre."
        if minima:
            return "✅ **GO** · Habilitado. En mínima cuantía gana el menor precio: definir la oferta con el rango sugerido."
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
                    "Si el pliego exige códigos UNSPSC muy específicos sin relación clara con el objeto, "
                    "observarlo pidiendo que admita las clases relacionadas que sí tiene el cliente."
                )
            elif "Experiencia" in h.indicador:
                obs.append(
                    "Si la experiencia exigida supera el presupuesto oficial o no guarda relación con "
                    "el objeto, observarla por desproporcionada (art. 5 Ley 1150 de 2007)."
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
        if inf.modalidad:
            lineas.append(f"- **Modalidad:** {inf.modalidad}")
        if inf.presupuesto_oficial:
            lineas.append(f"- **Presupuesto Oficial:** $ {inf.presupuesto_oficial:,.0f}")
        if inf.duracion:
            lineas.append(f"- **Duración:** {inf.duracion}")
        lineas.append(f"- **Archivos analizados:** {len(inf.archivos_descargados)}")
        lineas.append("")
        lineas.append("## Veredicto")
        lineas.append(inf.veredicto)
        lineas.append("")
        if ViabilityAnalyzer.es_minima_cuantia(inf.modalidad):
            lineas.append(
                "> **Mínima cuantía:** no se exige RUP. La entidad ordena las ofertas por precio y solo "
                "revisa los requisitos habilitantes de la más barata; si no cumple, pasa a la siguiente. "
                "Ofertar barato sin cumplir los requisitos no sirve, y cumplirlos sin precio competitivo tampoco."
            )
            lineas.append("")
        if inf.precio:
            p = inf.precio
            lineas.append("## Precio")
            lineas.append("")
            if p.disponible:
                busqueda = f" (búsqueda: *{p.palabras_busqueda}*)" if p.palabras_busqueda else ""
                lineas.append(
                    f"- {p.procesos_comparados} mínimas cuantías parecidas{busqueda} "
                    f"se adjudicaron al **{p.pct_mediana}%** del presupuesto en la mitad de los casos "
                    f"(entre {p.pct_p25}% y {p.pct_p75}% en la mitad central)."
                )
                if p.precio_max:
                    lineas.append(f"- **Rango competitivo sugerido:** $ {p.precio_min:,.0f} – $ {p.precio_max:,.0f}")
                if p.margen_min is not None:
                    lineas.append(f"- **Margen sobre el costo estimado en ese rango:** {p.margen_min}% – {p.margen_max}%")
            for w in p.advertencias:
                lineas.append(f"- ⚠️ {w}")
            lineas.append("")
        if inf.financiero:
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
            lineas.append("## Riesgos y advertencias")
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

    def evaluar(
        self,
        numero_proceso: str,
        rup_cliente: dict,
        costo_estimado: Optional[float] = None,
        smmlv: float = SMMLV_DEFAULT,
    ) -> InformeViabilidad:
        inf = InformeViabilidad(numero_proceso=numero_proceso)
        inf.riesgos.extend(rup_cliente.get("advertencias", []))

        try:
            meta = self.fetch_metadata_proceso(numero_proceso)
        except Exception as exc:
            logger.warning("Sin metadata del proceso: %s", exc)
            meta = {}
        inf.objeto = str(meta.get("descripci_n_del_procedimiento") or meta.get("nombre_del_procedimiento") or "")
        inf.presupuesto_oficial = parse_numero(str(meta.get("precio_base") or "0")) or 0.0

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

        if not inf.presupuesto_oficial:
            inf.presupuesto_oficial = self.extraer_presupuesto(texto_combinado)
        inf.duracion = self.extraer_duracion(texto_combinado)
        inf.modalidad = self.detectar_modalidad(texto_combinado, meta)
        minima = self.es_minima_cuantia(inf.modalidad)

        exigidos = self.extraer_indicadores(texto_combinado)
        requisito_exp = self.extraer_requisito_experiencia(texto_combinado, inf.presupuesto_oficial, smmlv)

        logger.info("Fase 3 · cruce con datos del cliente")
        inf.financiero = self.cruzar_financieros(exigidos, rup_cliente)
        if minima:
            inf.unspsc = HallazgoCruce(
                "Códigos UNSPSC", "No se exige RUP", "—", NO_APLICA,
                "En mínima cuantía no se exige RUP ni clasificación UNSPSC.",
            )
        else:
            inf.unspsc = self.cruzar_unspsc(
                unspsc_pliego=self.extraer_unspsc(texto_combinado)[:30],
                unspsc_cliente=rup_cliente.get("unspsc_codes", []),
                presupuesto=inf.presupuesto_oficial,
            )
        inf.experiencia = self.cruzar_experiencia(requisito_exp, rup_cliente, smmlv)

        if minima and inf.objeto:
            try:
                inf.precio = MinimaCuantia(self.app_token).analizar_precio(
                    inf.objeto, inf.presupuesto_oficial, costo_estimado,
                    excluir_proceso=str(meta.get("id_del_proceso") or ""),
                )
            except Exception as exc:
                inf.precio = AnalisisPrecio(disponible=False, advertencias=[f"No se pudo consultar el histórico de precios: {exc}"])

        todos = list(inf.financiero) + [inf.unspsc, inf.experiencia]
        todos = [h for h in todos if h is not None]
        inf.veredicto = self._veredicto(todos, minima=minima, precio=inf.precio)
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
    fuente = parser.add_mutually_exclusive_group(required=True)
    fuente.add_argument("--rup", help="Ruta al JSON con datos del RUP cliente")
    fuente.add_argument("--rup-pdf", help="Ruta al certificado RUP en PDF")
    parser.add_argument("--salida", default=None, help="Archivo .md de salida (opcional)")
    parser.add_argument("--costo", type=float, default=None, help="Costo estimado de ejecución en COP (mínima cuantía)")
    parser.add_argument("--smmlv", type=float, default=SMMLV_DEFAULT, help="Valor del SMMLV vigente")
    args = parser.parse_args()

    if args.rup_pdf:
        from modules.rup_extractor import extraer_rup_pdf
        with open(args.rup_pdf, "rb") as fh:
            extraido = extraer_rup_pdf(fh.read())
        for w in extraido.advertencias + [f"No encontrado en el RUP: {f}" for f in extraido.faltantes]:
            print("⚠️ " + w)
        rup = extraido.to_rup_dict()
    else:
        with open(args.rup, encoding="utf-8") as fh:
            rup = json.load(fh)

    analyzer = ViabilityAnalyzer()
    informe = analyzer.evaluar(args.numero_proceso, rup, costo_estimado=args.costo, smmlv=args.smmlv)

    salida = args.salida or f"analisis_viabilidad_{args.numero_proceso}.md"
    with open(salida, "w", encoding="utf-8") as fh:
        fh.write(informe.markdown)
    print(f"OK · informe en {salida}")
    print(f"Veredicto: {informe.veredicto}")
