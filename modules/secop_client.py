"""
Cliente SECOP II para pipelines de IA / análisis batch.

Usa la API oficial Socrata (SODA 2.1) de datos.gov.co para descargar
contratos, procesos y planes anuales de forma paginada y segura, con
retry exponencial y soporte para App Token.

Datasets clave:
  - jbjy-vk9h : SECOP II · Contratos Electrónicos (adjudicados)
  - p6dx-8zbt : SECOP II · Procesos de Contratación
  - rpmr-utcd : SECOP I  · Contratos históricos
  - c6dm-udt9 : Plan Anual de Adquisiciones (PAA)

Ejemplo mínimo:

    from modules.secop_client import SecopClient

    cli = SecopClient(app_token="TU_TOKEN")
    df = cli.contratos_desde("2025-01-01", limite=5000)
    df.to_csv("contratos_secop.csv", index=False)

Ejemplo con paginación completa (todo el histórico de una entidad):

    for chunk in cli.iterar_contratos(
        where="nombre_entidad LIKE '%ALCALDIA MEDELLIN%'",
        chunk_size=2000,
    ):
        procesar(chunk)   # tu pipeline de embeddings / vector store

Requiere: pip install sodapy pandas
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Iterator, Optional

try:
    from sodapy import Socrata
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "Falta la dependencia 'sodapy'. Instala con:\n"
        "    pip install sodapy pandas"
    ) from exc

import pandas as pd


# ---------------------------------------------------------------------------
# Constantes: datasets oficiales del ecosistema SECOP
# ---------------------------------------------------------------------------

DOMAIN = "www.datos.gov.co"

DATASETS = {
    "contratos_secop2": "jbjy-vk9h",     # Contratos electrónicos SECOP II
    "procesos_secop2":  "p6dx-8zbt",     # Procesos de contratación SECOP II
    "contratos_secop1": "rpmr-utcd",     # Contratos SECOP I (histórico)
    "paa":              "c6dm-udt9",     # Plan Anual de Adquisiciones
    "tvec_ordenes":     "rgxm-mmea",     # Órdenes de compra TVEC
}

# Columnas mínimas útiles para IA (evita traer todo el ancho de tabla)
COLS_CONTRATOS = [
    "nombre_entidad",
    "nit_entidad",
    "departamento",
    "modalidad_de_contratacion",
    "tipo_de_contrato",
    "objeto_del_contrato",
    "valor_del_contrato",
    "valor_total_de_adiciones",
    "fecha_de_firma_del_contrato",
    "fecha_de_inicio_del_contrato",
    "fecha_de_fin_del_contrato",
    "nombre_del_proveedor",
    "documento_proveedor",
    "estado_contrato",
    "urlproceso",
]

COLS_PROCESOS = [
    "id_del_proceso",
    "nombre_entidad",
    "nit_entidad",
    "departamento_entidad",
    "modalidad_de_contratacion",
    "tipo_de_contrato",
    "objeto_del_contrato",
    "precio_base",
    "estado_del_procedimiento",
    "fecha_de_publicacion_del",
    "fecha_de_recepcion_de",
    "urlproceso",
]


# ---------------------------------------------------------------------------
# Cliente
# ---------------------------------------------------------------------------

@dataclass
class SecopClient:
    """
    Wrapper thin sobre sodapy.Socrata con paginación y retry.

    Parámetros
    ----------
    app_token : Optional[str]
        Token de aplicación de Datos Abiertos Colombia. Sin token la API
        responde pero con quota agresiva por IP. Registro gratis en
        https://evaluamos.datos.gov.co/signup.
    timeout : int
        Segundos antes de timeout de socket. Default 60.
    max_retries : int
        Reintentos con backoff exponencial ante fallos de red o 5xx.
    """

    app_token: Optional[str] = None
    timeout: int = 60
    max_retries: int = 3

    def __post_init__(self) -> None:
        self._client = Socrata(DOMAIN, self.app_token, timeout=self.timeout)

    # -----------------------------------------------------------------
    # Consulta genérica
    # -----------------------------------------------------------------

    def consultar(
        self,
        dataset_key: str,
        select: Optional[list[str]] = None,
        where: Optional[str] = None,
        order: Optional[str] = None,
        limit: int = 1000,
        offset: int = 0,
    ) -> pd.DataFrame:
        """
        Consulta un dataset con SoQL. Devuelve DataFrame listo para
        pandas/embeddings/joins.
        """
        dataset_id = self._resolve_dataset(dataset_key)
        kwargs = {"limit": limit, "offset": offset}
        if select:
            kwargs["select"] = ", ".join(select)
        if where:
            kwargs["where"] = where
        if order:
            kwargs["order"] = order

        rows = self._get_with_retry(dataset_id, **kwargs)
        return pd.DataFrame.from_records(rows)

    # -----------------------------------------------------------------
    # Helpers de alto nivel
    # -----------------------------------------------------------------

    def contratos_desde(
        self,
        fecha_iso: str,
        limite: int = 5000,
        columnas: Optional[list[str]] = None,
    ) -> pd.DataFrame:
        """Contratos SECOP II firmados desde una fecha (formato YYYY-MM-DD)."""
        return self.consultar(
            dataset_key="contratos_secop2",
            select=columnas or COLS_CONTRATOS,
            where=f"fecha_de_firma_del_contrato >= '{fecha_iso}T00:00:00.000'",
            order="fecha_de_firma_del_contrato DESC",
            limit=limite,
        )

    def contratos_de_entidad(
        self,
        entidad_like: str,
        limite: int = 2000,
    ) -> pd.DataFrame:
        """Contratos de una entidad (búsqueda por texto en nombre_entidad)."""
        return self.consultar(
            dataset_key="contratos_secop2",
            select=COLS_CONTRATOS,
            where=f"UPPER(nombre_entidad) LIKE '%{entidad_like.upper()}%'",
            order="fecha_de_firma_del_contrato DESC",
            limit=limite,
        )

    def procesos_vigentes(
        self,
        departamento: Optional[str] = None,
        modalidad: Optional[str] = None,
        limite: int = 1000,
    ) -> pd.DataFrame:
        """Procesos SECOP II vigentes (estado != Adjudicado)."""
        clauses = ["estado_del_procedimiento != 'Adjudicado'"]
        if departamento:
            clauses.append(f"departamento_entidad = '{departamento}'")
        if modalidad:
            clauses.append(f"modalidad_de_contratacion = '{modalidad}'")
        return self.consultar(
            dataset_key="procesos_secop2",
            select=COLS_PROCESOS,
            where=" AND ".join(clauses),
            order="fecha_de_publicacion_del DESC",
            limit=limite,
        )

    # -----------------------------------------------------------------
    # Paginación completa · generador para pipelines de IA
    # -----------------------------------------------------------------

    def iterar_contratos(
        self,
        where: str,
        chunk_size: int = 2000,
        columnas: Optional[list[str]] = None,
    ) -> Iterator[pd.DataFrame]:
        """
        Itera todo el histórico que cumpla `where` en chunks de `chunk_size`
        para no saturar memoria. Ideal para embeddings/ETL/vector stores.
        """
        offset = 0
        while True:
            df = self.consultar(
                dataset_key="contratos_secop2",
                select=columnas or COLS_CONTRATOS,
                where=where,
                order="fecha_de_firma_del_contrato DESC",
                limit=chunk_size,
                offset=offset,
            )
            if df.empty:
                break
            yield df
            if len(df) < chunk_size:
                break
            offset += chunk_size

    # -----------------------------------------------------------------
    # Normalización útil para pipelines de IA
    # -----------------------------------------------------------------

    @staticmethod
    def normalizar_montos(df: pd.DataFrame, columnas: list[str]) -> pd.DataFrame:
        """Convierte columnas de valores string a float64. Errores → NaN."""
        for col in columnas:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        return df

    @staticmethod
    def normalizar_fechas(df: pd.DataFrame, columnas: list[str]) -> pd.DataFrame:
        """Convierte columnas ISO a datetime64. Errores → NaT."""
        for col in columnas:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors="coerce", utc=False)
        return df

    # -----------------------------------------------------------------
    # Internals
    # -----------------------------------------------------------------

    def _resolve_dataset(self, key: str) -> str:
        if key in DATASETS:
            return DATASETS[key]
        # Permite pasar el ID crudo (jbjy-vk9h) sin friendly-name
        if "-" in key and len(key) == 9:
            return key
        raise ValueError(f"Dataset desconocido: {key}. Válidos: {list(DATASETS)}")

    def _get_with_retry(self, dataset_id: str, **kwargs) -> list[dict]:
        last_exc: Optional[Exception] = None
        for intento in range(self.max_retries):
            try:
                return self._client.get(dataset_id, **kwargs)
            except Exception as exc:
                last_exc = exc
                espera = 2 ** intento  # 1s, 2s, 4s
                time.sleep(espera)
        raise RuntimeError(
            f"SECOP no respondió tras {self.max_retries} intentos: {last_exc}"
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "SecopClient":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()


# ---------------------------------------------------------------------------
# CLI mínimo para prueba manual:  python -m modules.secop_client
# ---------------------------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    import argparse
    import os

    parser = argparse.ArgumentParser(description="Descarga contratos SECOP II a CSV")
    parser.add_argument("--desde", default="2025-01-01", help="Fecha inicio YYYY-MM-DD")
    parser.add_argument("--limite", type=int, default=5000)
    parser.add_argument("--salida", default="contratos_secop.csv")
    args = parser.parse_args()

    token = os.getenv("SOCRATA_APP_TOKEN")
    with SecopClient(app_token=token) as cli:
        df = cli.contratos_desde(args.desde, limite=args.limite)
        df = cli.normalizar_montos(df, ["valor_del_contrato", "valor_total_de_adiciones"])
        df = cli.normalizar_fechas(df, ["fecha_de_firma_del_contrato"])
        df.to_csv(args.salida, index=False)
        print(f"OK · {len(df)} contratos → {args.salida}")
