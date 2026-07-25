"""
Pipeline SECOP → Embeddings → Búsqueda semántica.

Stack: 100% gratis y offline
  - sentence-transformers (paraphrase-multilingual-MiniLM-L12-v2, 384d, español)
  - ChromaDB persistente (embedded, sin servidor, sin API keys)
  - SecopClient (nuestro cliente sodapy)

Flujo:
  1. ingestar(desde="2025-01-01") → descarga N contratos y los embebe
  2. buscar("obra vial en Cundinamarca") → top-K similares con score coseno
  3. buscar_por_entidad("ALCALDIA MEDELLIN", "software") → filtro + semántica

La primera ingesta descarga el modelo (~120 MB) desde Hugging Face; el
cache queda en ~/.cache/huggingface/. Después es 100% offline.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Iterable, Optional

import pandas as pd

from modules.secop_client import SecopClient

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

MODELO_EMBEDDING = "paraphrase-multilingual-MiniLM-L12-v2"  # 384d, multilingüe
COLECCION = "secop_contratos"
RUTA_DB = Path(os.getenv("LICITA_CHROMA_DIR", "./data/chroma"))
LOTE_EMBEDDING = 64  # tamaño de batch para embedder


# ---------------------------------------------------------------------------
# Lazy imports: solo cargar chromadb/torch si el usuario invoca el pipeline
# ---------------------------------------------------------------------------

def _lazy_chroma():
    try:
        import chromadb
        from chromadb.utils import embedding_functions
    except ImportError as exc:
        raise ImportError(
            "Falta instalar chromadb y sentence-transformers:\n"
            "    pip install chromadb sentence-transformers"
        ) from exc
    return chromadb, embedding_functions


# ---------------------------------------------------------------------------
# Cliente vectorial
# ---------------------------------------------------------------------------

class SecopVectorStore:
    """Wrapper sobre Chroma con embedding multilingüe y helpers de SECOP."""

    def __init__(self, ruta: Optional[Path] = None, modelo: str = MODELO_EMBEDDING):
        chromadb, embedding_functions = _lazy_chroma()

        self.ruta = Path(ruta) if ruta else RUTA_DB
        self.ruta.mkdir(parents=True, exist_ok=True)

        self._client = chromadb.PersistentClient(path=str(self.ruta))
        self._embedder = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=modelo
        )
        self._col = self._client.get_or_create_collection(
            name=COLECCION,
            embedding_function=self._embedder,
            metadata={"hnsw:space": "cosine"},
        )

    # -----------------------------------------------------------------
    # Ingesta
    # -----------------------------------------------------------------

    def ingestar_df(self, df: pd.DataFrame) -> int:
        """Embebe y guarda contratos. Devuelve cuántos ingresó."""
        if df.empty:
            return 0

        df = df.dropna(subset=["objeto_del_contrato"])
        df = df[df["objeto_del_contrato"].astype(str).str.strip() != ""]
        if df.empty:
            return 0

        ids = [
            str(r.get("id_contrato") or r.get("urlproceso") or f"secop-{i}")
            for i, r in df.iterrows()
        ]
        # Chroma requiere IDs únicos por colección
        ids = self._ids_unicos(ids)

        documentos = df["objeto_del_contrato"].astype(str).tolist()
        metadatos = [self._meta_limpio(r) for _, r in df.iterrows()]

        # Insertar por lotes para no reventar memoria
        n = 0
        for i in range(0, len(ids), LOTE_EMBEDDING):
            self._col.upsert(
                ids=ids[i : i + LOTE_EMBEDDING],
                documents=documentos[i : i + LOTE_EMBEDDING],
                metadatas=metadatos[i : i + LOTE_EMBEDDING],
            )
            n += min(LOTE_EMBEDDING, len(ids) - i)
        return n

    def ingestar_desde_secop(
        self,
        desde_iso: str = "2025-01-01",
        limite_total: int = 10_000,
        chunk_size: int = 2000,
        app_token: Optional[str] = None,
        callback=None,
    ) -> int:
        """
        Descarga SECOP en chunks paginados, embebe cada uno y lo persiste.
        `callback(n_acumulado, n_lote)` recibe progreso tras cada chunk.
        """
        where = f"fecha_de_firma_del_contrato >= '{desde_iso}T00:00:00.000'"
        total = 0
        with SecopClient(app_token=app_token) as cli:
            for chunk in cli.iterar_contratos(where=where, chunk_size=chunk_size):
                n = self.ingestar_df(chunk)
                total += n
                if callback:
                    callback(total, n)
                if total >= limite_total:
                    break
        return total

    # -----------------------------------------------------------------
    # Búsqueda semántica
    # -----------------------------------------------------------------

    def buscar(
        self,
        consulta: str,
        top_k: int = 10,
        filtros: Optional[dict] = None,
    ) -> pd.DataFrame:
        """
        Top-K contratos más similares semánticamente a la consulta.
        `filtros` acepta el formato where de Chroma:
            {"departamento": "Antioquia"}
            {"valor_del_contrato": {"$gte": 100000000}}
        """
        res = self._col.query(
            query_texts=[consulta],
            n_results=top_k,
            where=filtros,
        )
        if not res["ids"] or not res["ids"][0]:
            return pd.DataFrame()

        filas = []
        for i, doc_id in enumerate(res["ids"][0]):
            m = res["metadatas"][0][i] if res["metadatas"] else {}
            filas.append({
                "id": doc_id,
                "similitud": round(1 - res["distances"][0][i], 4),
                "objeto": res["documents"][0][i],
                **m,
            })
        return pd.DataFrame(filas)

    def buscar_por_entidad(
        self,
        entidad_like: str,
        consulta: str,
        top_k: int = 10,
    ) -> pd.DataFrame:
        """Filtra por entidad (contains, case-insensitive) + búsqueda semántica."""
        # Chroma no tiene ILIKE, así que hacemos post-filter simple
        crudos = self.buscar(consulta, top_k=top_k * 3)
        if crudos.empty or "nombre_entidad" not in crudos.columns:
            return crudos
        mask = crudos["nombre_entidad"].astype(str).str.upper().str.contains(
            entidad_like.upper(), na=False
        )
        return crudos[mask].head(top_k).reset_index(drop=True)

    # -----------------------------------------------------------------
    # Estadísticas
    # -----------------------------------------------------------------

    def total(self) -> int:
        return self._col.count()

    def reset(self) -> None:
        """Borra la colección completa. Úsalo con cuidado."""
        chromadb, _ = _lazy_chroma()
        self._client.delete_collection(COLECCION)
        self._col = self._client.get_or_create_collection(
            name=COLECCION,
            embedding_function=self._embedder,
            metadata={"hnsw:space": "cosine"},
        )

    # -----------------------------------------------------------------
    # Internals
    # -----------------------------------------------------------------

    @staticmethod
    def _meta_limpio(fila: pd.Series) -> dict:
        """Chroma solo acepta str/int/float/bool en metadatos."""
        meta = {}
        for k, v in fila.items():
            if k == "objeto_del_contrato":
                continue
            if pd.isna(v) or v is None:
                continue
            if isinstance(v, (str, int, float, bool)):
                meta[k] = v
            else:
                meta[k] = str(v)
        return meta

    @staticmethod
    def _ids_unicos(ids: list[str]) -> list[str]:
        vistos: dict[str, int] = {}
        salida = []
        for id_ in ids:
            if id_ in vistos:
                vistos[id_] += 1
                salida.append(f"{id_}#{vistos[id_]}")
            else:
                vistos[id_] = 0
                salida.append(id_)
        return salida


# ---------------------------------------------------------------------------
# CLI: python -m modules.secop_embeddings ingest --desde 2025-01-01
#      python -m modules.secop_embeddings search "obra vial cundinamarca"
# ---------------------------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="SECOP → embeddings → búsqueda")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_ing = sub.add_parser("ingest", help="Descarga e ingesta contratos")
    p_ing.add_argument("--desde", default="2025-01-01")
    p_ing.add_argument("--limite", type=int, default=10_000)
    p_ing.add_argument("--chunk", type=int, default=2000)

    p_srch = sub.add_parser("search", help="Búsqueda semántica")
    p_srch.add_argument("consulta")
    p_srch.add_argument("--top", type=int, default=10)

    p_stats = sub.add_parser("stats", help="Cuántos contratos hay indexados")

    args = parser.parse_args()
    store = SecopVectorStore()

    if args.cmd == "ingest":
        token = os.getenv("SOCRATA_APP_TOKEN")
        def _prog(acum, lote):
            print(f"  · {acum:,} contratos ingestados (+{lote})", file=sys.stderr)
        n = store.ingestar_desde_secop(
            desde_iso=args.desde,
            limite_total=args.limite,
            chunk_size=args.chunk,
            app_token=token,
            callback=_prog,
        )
        print(f"OK · {n:,} contratos indexados en {RUTA_DB}")

    elif args.cmd == "search":
        df = store.buscar(args.consulta, top_k=args.top)
        if df.empty:
            print("Sin resultados.")
        else:
            for _, r in df.iterrows():
                print(f"[{r['similitud']:.3f}] {r.get('nombre_entidad', '?')}")
                print(f"        {r['objeto'][:120]}")
                print(f"        ${r.get('valor_del_contrato', '?')}")
                print()

    elif args.cmd == "stats":
        print(f"{store.total():,} contratos indexados en {RUTA_DB}")
