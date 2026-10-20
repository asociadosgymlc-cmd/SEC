"""
Lector del certificado RUP (Registro Único de Proponentes) en PDF.

Extrae del certificado que expide la Cámara de Comercio:
  - Indicadores de capacidad financiera: liquidez, endeudamiento,
    razón de cobertura de intereses, capital de trabajo, patrimonio
  - Indicadores de capacidad organizacional: rentabilidad del patrimonio y del activo
  - Clasificación UNSPSC (normalizada a nivel clase · 6 dígitos)
  - Experiencia: contratos reportados con valor en SMMLV, contratante,
    % de participación y sus códigos UNSPSC

Devuelve un dict con el formato que consume ViabilityAnalyzer.evaluar().

Uso:
    from modules.rup_extractor import extraer_rup_pdf
    rup = extraer_rup_pdf(open("rup_cliente.pdf", "rb").read())
    rup.to_rup_dict()      # listo para el analizador
    rup.faltantes          # campos que no se encontraron en el certificado

CLI:
    python -m modules.rup_extractor rup_cliente.pdf > rup_cliente.json
"""
from __future__ import annotations

import datetime as dt
import io
import json
import re
import unicodedata
from dataclasses import asdict, dataclass, field
from typing import Optional

# Número en formato colombiano o anglosajón: 1.234.567,89 · 2,35 · 0.42 · -1,5
_NUM = r"(-?\d[\d.]*(?:,\d+)?)"


@dataclass
class ContratoRUP:
    consecutivo: str = ""
    contratante: str = ""
    valor_smmlv: float = 0.0
    participacion: float = 100.0
    unspsc: list[str] = field(default_factory=list)


@dataclass
class RupExtraido:
    razon_social: str = ""
    nit: str = ""
    fecha_corte: str = ""
    liquidez: Optional[float] = None
    endeudamiento: Optional[float] = None          # en %
    razon_cobertura: Optional[float | str] = None  # float o "INDETERMINADO"
    capital_trabajo: Optional[float] = None
    patrimonio: Optional[float] = None
    rentabilidad_patrimonio: Optional[float] = None  # en %
    rentabilidad_activo: Optional[float] = None      # en %
    unspsc_codes: list[str] = field(default_factory=list)
    experiencia_contratos: list[ContratoRUP] = field(default_factory=list)
    faltantes: list[str] = field(default_factory=list)
    advertencias: list[str] = field(default_factory=list)

    def to_rup_dict(self) -> dict:
        """Formato que consume ViabilityAnalyzer.evaluar()."""
        d = {
            "razon_social": self.razon_social,
            "nit": self.nit,
            "fecha_corte": self.fecha_corte,
            "unspsc_codes": self.unspsc_codes,
            "experiencia_contratos": [asdict(c) for c in self.experiencia_contratos],
            "advertencias": self.advertencias,
        }
        for k in ("liquidez", "endeudamiento", "razon_cobertura", "capital_trabajo",
                  "patrimonio", "rentabilidad_patrimonio", "rentabilidad_activo"):
            v = getattr(self, k)
            if v is not None:
                d[k] = v
        return d


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalizar(texto: str) -> str:
    """Mayúsculas sin tildes, para que las regex no dependan de la ortografía del PDF."""
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )
    return sin_tildes.upper()


def _parse_num(raw: str, dinero: bool = False) -> Optional[float]:
    s = raw.strip().rstrip(".")
    if not s or s == "-":
        return None
    if "," in s:
        # Formato colombiano: punto = miles, coma = decimal
        s = s.replace(".", "").replace(",", ".")
    elif dinero or s.count(".") > 1:
        # 1.234.567 → separador de miles
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def _buscar_num(texto: str, etiqueta: str, ventana: int = 60, dinero: bool = False) -> Optional[float]:
    m = re.search(etiqueta + r"[^0-9\-]{0," + str(ventana) + r"}" + _NUM, texto)
    return _parse_num(m.group(1), dinero) if m else None


def _a_porcentaje(v: Optional[float]) -> Optional[float]:
    """El RUP certifica endeudamiento y rentabilidades como fracción (0,42); los pliegos en %."""
    if v is None:
        return None
    return round(v * 100, 4) if -1 <= v <= 1 else v


def _codigos_unspsc(texto: str, todas_las_lineas: bool) -> list[str]:
    """
    Códigos UNSPSC normalizados a clase (6 dígitos: segmento+familia+clase).
    Acepta 43211500 · 43 21 15 · 43 21 15 00 · 432115.
    Con todas_las_lineas=False solo mira líneas que mencionan UNSPSC/código/clasificación.
    """
    codigos: list[str] = []
    for linea in texto.splitlines():
        es_linea_codigo = todas_las_lineas or bool(re.search(r"UNSPSC|CLASIFICA|CODIGO|SEGMENTO", linea))
        if not es_linea_codigo:
            continue
        candidatos = re.findall(r"\b(\d{2})\s(\d{2})\s(\d{2})(?:\s\d{2})?\b", linea)
        candidatos = ["".join(c) for c in candidatos]
        candidatos += [c[:6] for c in re.findall(r"\b\d{8}\b", linea)]
        if es_linea_codigo:
            candidatos += re.findall(r"\b\d{6}\b", linea)
        for c in candidatos:
            # Segmentos UNSPSC válidos: 10-95. Descarta NITs, fechas y valores.
            if 10 <= int(c[:2]) <= 95 and c not in codigos:
                codigos.append(c)
    return codigos


# ---------------------------------------------------------------------------
# Extracción
# ---------------------------------------------------------------------------

def extraer_de_texto(texto_original: str) -> RupExtraido:
    t = _normalizar(texto_original)
    r = RupExtraido()

    m = re.search(r"(?:RAZON SOCIAL|NOMBRE)\s*:?\s*([^\n]{3,120})", t)
    if m:
        r.razon_social = m.group(1).strip()
    m = re.search(r"\bNIT\b\.?\s*(?:NO\.?|NUMERO)?\s*:?\s*([\d.]{6,15}(?:\s*-\s*\d)?)", t)
    if m:
        r.nit = re.sub(r"\s", "", m.group(1))
    m = re.search(r"FECHA DE CORTE[^0-9]{0,40}(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})", t)
    if m:
        r.fecha_corte = m.group(1)

    r.liquidez = _buscar_num(t, r"INDICE DE LIQUIDEZ")
    r.endeudamiento = _a_porcentaje(_buscar_num(t, r"INDICE DE ENDEUDAMIENTO"))

    m = re.search(r"RAZON DE COBERTURA DE INTERESES[^0-9\-]{0,60}?(INDETERMINAD[OA]|NO APLICA|" + _NUM + ")", t)
    if m:
        if m.group(1).startswith(("INDETERMINAD", "NO APLICA")):
            r.razon_cobertura = "INDETERMINADO"
        else:
            r.razon_cobertura = _parse_num(m.group(2) or m.group(1))

    r.capital_trabajo = _buscar_num(t, r"CAPITAL DE TRABAJO", dinero=True)
    m = re.search(r"(?<!DEL )(?<!EL )\bPATRIMONIO\b\s*(?:TOTAL)?\s*:?\s*\$\s*" + _NUM, t)
    if m:
        r.patrimonio = _parse_num(m.group(1), dinero=True)
    r.rentabilidad_patrimonio = _a_porcentaje(
        _buscar_num(t, r"RENTABILIDAD (?:DEL|SOBRE EL) PATRIMONIO"))
    r.rentabilidad_activo = _a_porcentaje(
        _buscar_num(t, r"RENTABILIDAD (?:DEL|SOBRE EL) ACTIVO"))

    # Separar la sección de experiencia del resto (clasificación vs contratos)
    corte_exp = re.search(r"\n\s*(?:INFORMACION DE LA\s+)?EXPERIENCIA\b", t)
    cuerpo = t[: corte_exp.start()] if corte_exp else t
    seccion_exp = t[corte_exp.start():] if corte_exp else ""

    # La clasificación es una tabla: va desde el título de clasificación hasta la información financiera
    m_fin = re.search(r"INFORMACION FINANCIERA|CAPACIDAD FINANCIERA|INDICE DE LIQUIDEZ", cuerpo)
    titulos = [m for m in re.finditer(r"CLASIFICACION", cuerpo) if m_fin and m.start() < m_fin.start()]
    m_cls = titulos[-1] if titulos else None
    if m_cls and m_fin:
        r.unspsc_codes = _codigos_unspsc(cuerpo[m_cls.start():m_fin.start()], todas_las_lineas=True)
        for c in _codigos_unspsc(cuerpo[m_fin.start():], todas_las_lineas=False):
            if c not in r.unspsc_codes:
                r.unspsc_codes.append(c)
    else:
        r.unspsc_codes = _codigos_unspsc(cuerpo, todas_las_lineas=False)

    if seccion_exp:
        bloques = re.split(r"(?=(?:NUMERO\s+)?CONSECUTIVO)", seccion_exp)
        for b in bloques:
            if "CONSECUTIVO" not in b:
                continue
            c = ContratoRUP()
            m = re.search(r"CONSECUTIVO[^0-9]{0,60}(\d+)", b)
            c.consecutivo = m.group(1) if m else ""
            m = re.search(r"CONTRATANTE\s*:?\s*([^\n]{3,120})", b)
            c.contratante = m.group(1).strip() if m else ""
            m = re.search(r"(?:SMMLV|SALARIOS MINIMOS)[^0-9\-]{0,40}" + _NUM, b) \
                or re.search(_NUM + r"\s*SMMLV", b)
            c.valor_smmlv = (_parse_num(m.group(1)) or 0.0) if m else 0.0
            m = re.search(r"PARTICIPACION[^0-9]{0,40}" + _NUM, b)
            if m:
                p = _parse_num(m.group(1))
                if p is not None:
                    c.participacion = p * 100 if 0 < p <= 1 else p
            c.unspsc = _codigos_unspsc(b, todas_las_lineas=False)
            if c.valor_smmlv > 0:
                r.experiencia_contratos.append(c)

    # Faltantes y advertencias
    for campo, etiqueta in (
        ("liquidez", "Índice de liquidez"),
        ("endeudamiento", "Índice de endeudamiento"),
        ("razon_cobertura", "Razón de cobertura de intereses"),
        ("rentabilidad_patrimonio", "Rentabilidad del patrimonio"),
        ("rentabilidad_activo", "Rentabilidad del activo"),
    ):
        if getattr(r, campo) is None:
            r.faltantes.append(etiqueta)
    if not r.unspsc_codes:
        r.faltantes.append("Clasificación UNSPSC")
    if not r.experiencia_contratos:
        r.faltantes.append("Contratos de experiencia")

    if r.fecha_corte:
        anio = int(re.search(r"\d{4}", r.fecha_corte).group(0))
        hoy = dt.date.today()
        # Desde abril, el RUP vigente debe traer el cierre del año anterior
        corte_minimo = hoy.year - 1 if hoy.month > 4 else hoy.year - 2
        if anio < corte_minimo:
            r.advertencias.append(
                f"Los indicadores tienen fecha de corte {r.fecha_corte}. Si el RUP no se "
                "renovó antes del quinto día hábil de abril, la inscripción cesa en sus "
                "efectos y no habilita (art. 2.2.1.1.1.5.1 Decreto 1082 de 2015)."
            )
    if "EN FIRME" not in t:
        r.advertencias.append(
            "No se encontró la constancia de firmeza en el texto. Verificar que la "
            "inscripción esté en firme antes del cierre del proceso; si no lo está, no habilita."
        )
    return r


def extraer_rup_pdf(pdf_bytes: bytes) -> RupExtraido:
    import pdfplumber

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        texto = "\n".join(page.extract_text() or "" for page in pdf.pages)
    if not texto.strip():
        raise ValueError(
            "El PDF no tiene texto extraíble (probablemente escaneado). "
            "Descarga el certificado digital desde la Cámara de Comercio, no una foto o escaneo."
        )
    return extraer_de_texto(texto)


if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Extrae los datos del certificado RUP en PDF")
    parser.add_argument("pdf", help="Ruta al certificado RUP")
    args = parser.parse_args()
    with open(args.pdf, "rb") as fh:
        rup = extraer_rup_pdf(fh.read())
    for w in rup.advertencias + [f"No encontrado: {f}" for f in rup.faltantes]:
        print("⚠️ " + w, file=sys.stderr)
    print(json.dumps(rup.to_rup_dict(), ensure_ascii=False, indent=2))
