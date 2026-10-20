"""
Herramientas para contratación de mínima cuantía en SECOP II.

En mínima cuantía no se exige RUP, gana el menor precio y la entidad solo revisa
los requisitos habilitantes de la oferta más barata. Por eso este módulo se
enfoca en dos cosas:

  - analizar_precio(): a qué porcentaje del presupuesto se adjudicaron mínimas
    cuantías parecidas, y qué rango de precio es competitivo.
  - buscar_abiertas(): mínimas cuantías que están recibiendo ofertas ahora.

Fuente: dataset p6dx-8zbt (Procesos SECOP II) en datos.gov.co.
"""
from __future__ import annotations

import re
import statistics
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

import pandas as pd

from modules.secop_client import SecopClient

MODALIDAD = "Mínima cuantía"

_STOPWORDS = {
    "para", "con", "los", "las", "del", "por", "que", "una", "uno", "sus", "como",
    "entre", "sobre", "segun", "desde", "hasta", "contratar", "contratacion",
    "prestacion", "servicio", "servicios", "suministro", "adquisicion", "municipio",
    "entidad", "objeto", "contrato", "proceso", "realizar", "ejecutar", "demas",
}


@dataclass
class AnalisisPrecio:
    disponible: bool
    procesos_comparados: int = 0
    pct_mediana: float = 0.0        # adjudicado / presupuesto, en %
    pct_p25: float = 0.0
    pct_p75: float = 0.0
    precio_min: float = 0.0         # rango competitivo sugerido, en COP
    precio_max: float = 0.0
    margen_min: Optional[float] = None   # margen sobre costo al precio más bajo del rango, en %
    margen_max: Optional[float] = None
    palabras_busqueda: str = ""
    advertencias: list[str] = field(default_factory=list)


def palabras_clave(objeto: str, maximo: int = 4) -> list[str]:
    """Las palabras más distintivas del objeto, para la búsqueda de texto completo."""
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", objeto.lower()) if unicodedata.category(c) != "Mn"
    )
    palabras = [p for p in re.findall(r"[a-zñ]{4,}", sin_tildes) if p not in _STOPWORDS]
    unicas = list(dict.fromkeys(palabras))
    return sorted(unicas, key=len, reverse=True)[:maximo]


def calcular_rango(
    df: pd.DataFrame,
    presupuesto: float,
    costo_estimado: Optional[float] = None,
) -> AnalisisPrecio:
    """
    Con procesos adjudicados (columnas precio_base, valor_total_adjudicacion) calcula
    a qué % del presupuesto suelen adjudicarse y el rango de precio competitivo.
    """
    if df.empty or not {"precio_base", "valor_total_adjudicacion"} <= set(df.columns):
        return AnalisisPrecio(disponible=False, advertencias=["Sin histórico comparable."])

    base = pd.to_numeric(df["precio_base"], errors="coerce")
    adj = pd.to_numeric(df["valor_total_adjudicacion"], errors="coerce")
    ratios = (adj / base)[(base > 0) & (adj > 0)]
    # Fuera de este rango suele ser un error de digitación en SECOP, no un precio real
    ratios = ratios[(ratios >= 0.3) & (ratios <= 1.05)].sort_values().tolist()

    if len(ratios) < 5:
        return AnalisisPrecio(
            disponible=False,
            procesos_comparados=len(ratios),
            advertencias=[f"Solo {len(ratios)} mínimas cuantías comparables: muy pocas para sugerir un precio."],
        )

    q = statistics.quantiles(ratios, n=4)
    r = AnalisisPrecio(
        disponible=True,
        procesos_comparados=len(ratios),
        pct_p25=round(q[0] * 100, 1),
        pct_mediana=round(q[1] * 100, 1),
        pct_p75=round(q[2] * 100, 1),
    )
    if presupuesto > 0:
        r.precio_min = round(presupuesto * q[0])
        r.precio_max = round(presupuesto * q[1])

    if costo_estimado and presupuesto > 0:
        r.margen_min = round((r.precio_min - costo_estimado) / r.precio_min * 100, 1)
        r.margen_max = round((r.precio_max - costo_estimado) / r.precio_max * 100, 1)
        if costo_estimado >= presupuesto:
            r.advertencias.append(
                "El costo estimado iguala o supera el presupuesto oficial: no hay forma de ofertar con ganancia."
            )
        elif r.margen_max < 0:
            r.advertencias.append(
                "Al precio que suele ganar estas mínimas, el costo estimado deja pérdida. "
                "Solo vale la pena si se puede bajar el costo."
            )
        elif r.margen_min < 0:
            r.advertencias.append(
                f"En el extremo bajo del rango quedaría con pérdida ({r.margen_min}%); en el alto, "
                f"el margen es apenas {r.margen_max}%. Revisar si el costo incluye impuestos, "
                "pólizas y estampillas antes de decidir."
            )
        elif r.margen_min < 5:
            r.advertencias.append(
                f"Para quedar en el rango más competitivo el margen baja a {r.margen_min}%. "
                "Revisar si el costo estimado incluye impuestos, pólizas y estampillas."
            )
    return r


class MinimaCuantia:

    def __init__(self, app_token: Optional[str] = None):
        self.app_token = app_token

    def analizar_precio(
        self,
        objeto: str,
        presupuesto: float,
        costo_estimado: Optional[float] = None,
        excluir_proceso: Optional[str] = None,
    ) -> AnalisisPrecio:
        palabras = palabras_clave(objeto)
        if not palabras:
            return AnalisisPrecio(disponible=False, advertencias=["No se pudo identificar el objeto del proceso."])

        where = (
            f"modalidad_de_contratacion = '{MODALIDAD}' "
            "AND estado_resumen = 'Adjudicado'"
        )
        df = pd.DataFrame()
        usadas = palabras
        with SecopClient(app_token=self.app_token) as cli:
            # Si con todas las palabras hay muy pocos resultados, se afloja la búsqueda
            for n in (len(palabras), 2):
                usadas = palabras[:n]
                df = cli.consultar(
                    dataset_key="procesos_secop2",
                    select=["id_del_proceso", "precio_base", "valor_total_adjudicacion"],
                    where=where,
                    q=" ".join(usadas),
                    limit=300,
                )
                if len(df) >= 15:
                    break
        if excluir_proceso and "id_del_proceso" in df.columns:
            df = df[df["id_del_proceso"] != excluir_proceso]

        r = calcular_rango(df, presupuesto, costo_estimado)
        r.palabras_busqueda = " ".join(usadas)
        return r

    def buscar_abiertas(
        self,
        palabras: str = "",
        departamento: str = "",
        presupuesto_max: Optional[float] = None,
        limite: int = 50,
    ) -> pd.DataFrame:
        """Mínimas cuantías que hoy están en etapa de presentación de ofertas."""
        clausulas = [
            f"modalidad_de_contratacion = '{MODALIDAD}'",
            "estado_resumen = 'Presentación de oferta'",
        ]
        if departamento:
            depto = departamento.upper().replace("'", "''")
            clausulas.append(f"upper(departamento_entidad) like '%{depto}%'")
        with SecopClient(app_token=self.app_token) as cli:
            df = cli.consultar(
                dataset_key="procesos_secop2",
                where=" AND ".join(clausulas),
                q=palabras or None,
                order="fecha_de_publicacion_del DESC",
                limit=limite * 2 if presupuesto_max else limite,
            )
        if df.empty:
            return df
        if "precio_base" in df.columns:
            df["precio_base"] = pd.to_numeric(df["precio_base"], errors="coerce")
        if presupuesto_max and "precio_base" in df.columns:
            df = df[df["precio_base"] <= presupuesto_max]
        if "urlproceso" in df.columns:
            # El dataset entrega la URL como objeto {"url": ...}
            df["urlproceso"] = df["urlproceso"].apply(
                lambda u: u.get("url") if isinstance(u, dict) else u
            )
        columnas = [
            "id_del_proceso", "referencia_del_proceso", "entidad", "departamento_entidad",
            "nombre_del_procedimiento", "descripci_n_del_procedimiento",
            "precio_base", "fecha_de_publicacion_del", "urlproceso",
        ]
        df = df[[c for c in columnas if c in df.columns]]
        return df.head(limite).reset_index(drop=True)
