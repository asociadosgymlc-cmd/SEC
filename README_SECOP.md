# 🔍 Buscador semántico SECOP II · guía rápida

Pipeline **100% gratis, offline, sin API keys**:

```
datos.gov.co (Socrata) → SecopClient → sentence-transformers → ChromaDB → búsqueda semántica
```

## Instalar

```bash
pip install -r requirements.txt
```

Instala todo lo del proyecto + `sodapy` + `chromadb` + `sentence-transformers`.

## Primera corrida (2 minutos)

```bash
streamlit run app.py
```

En la sidebar hacé clic en **🔍 Buscador SECOP**. Luego:

1. **Ingesta**: en la sidebar de la página, click "🚀 Ingestar SECOP II" (por defecto 5 000 contratos desde 2025-01-01).
2. **Buscar**: escribí en el input principal — no palabras exactas, significados.
   - `mantenimiento de vías rurales boyacá` ← encuentra "reparación de carreteras terciarias"
   - `equipos tecnológicos para colegios` ← encuentra "computadores para instituciones educativas"

## Comandos CLI (sin Streamlit)

```bash
# Descargar 10 000 contratos e indexarlos
python -m modules.secop_embeddings ingest --desde 2025-01-01 --limite 10000

# Buscar
python -m modules.secop_embeddings search "obra vial en cundinamarca"

# Ver cuántos hay
python -m modules.secop_embeddings stats
```

## Solo descarga (sin embeddings)

```bash
python -m modules.secop_client --desde 2025-01-01 --limite 5000 --salida contratos.csv
```

## Recomendado: App Token

Registrate gratis en https://evaluamos.datos.gov.co/signup y exportá:

```bash
export SOCRATA_APP_TOKEN=tu_token_aqui
```

Sin token la API responde pero con quota agresiva por IP.

## Stack

| Componente | Qué hace | Por qué elegido |
|---|---|---|
| **sodapy** | Cliente Socrata SODA 2.1 | Oficial datos.gov.co, soporta paginación y `$where` |
| **sentence-transformers** | Embeddings de texto | `paraphrase-multilingual-MiniLM-L12-v2` (384d, español, 120 MB) — mejor calidad/velocidad para español |
| **ChromaDB** | Vector store persistente | Embedded, sin servidor, sin API keys, disco local en `./data/chroma/` |

## Uso programático

```python
from modules.secop_embeddings import SecopVectorStore

store = SecopVectorStore()

# Ingestar
n = store.ingestar_desde_secop(desde_iso="2025-01-01", limite_total=10_000)

# Buscar
resultados = store.buscar(
    consulta="mantenimiento de infraestructura educativa",
    top_k=20,
    filtros={"departamento": "Antioquia"},  # opcional
)
```

## Notas

- La primera ingesta descarga el modelo (~120 MB) desde Hugging Face. Después es 100% offline.
- El índice Chroma se persiste en `./data/chroma/` — hacé backup si es crítico.
- Para reingestar sin duplicar: Chroma usa `upsert` — mismo `id_contrato` sobrescribe.
- Para migrar a Pinecone/Qdrant cuando crezcas: cambiá el import de `SecopVectorStore`, la API es la misma.
