"""
Página Streamlit · Buscador semántico SECOP II con embeddings locales.

Ejecutar:
    pip install -r requirements.txt
    streamlit run app.py
    # abrí la sidebar y clic en '🔍 Buscador SECOP'
"""
from __future__ import annotations

import os

import pandas as pd
import streamlit as st

from modules.secop_embeddings import SecopVectorStore, RUTA_DB

st.set_page_config(page_title="Buscador SECOP II", page_icon="🔍", layout="wide")

st.title("🔍 Buscador Semántico SECOP II")
st.caption(
    "Contratos indexados con embeddings multilingües locales · sin API keys · "
    "búsqueda por significado, no por palabras exactas."
)


# ---------------------------------------------------------------------------
# Store singleton en session_state
# ---------------------------------------------------------------------------

@st.cache_resource(show_spinner="Cargando modelo de embeddings...")
def get_store() -> SecopVectorStore:
    return SecopVectorStore()


try:
    store = get_store()
    total_indexado = store.total()
except ImportError as exc:
    st.error(
        "Faltan dependencias. Instalá con:\n\n"
        "```\npip install chromadb sentence-transformers sodapy\n```"
    )
    st.stop()


# ---------------------------------------------------------------------------
# Sidebar · ingesta / configuración
# ---------------------------------------------------------------------------

with st.sidebar:
    st.header("📥 Ingesta de datos")
    st.metric("Contratos indexados", f"{total_indexado:,}")

    with st.form("ingest_form"):
        desde = st.date_input(
            "Firmados desde",
            value=pd.Timestamp("2025-01-01"),
        )
        limite = st.number_input(
            "Máximo a descargar",
            min_value=500,
            max_value=100_000,
            value=5_000,
            step=500,
        )
        token = st.text_input(
            "App Token (opcional)",
            type="password",
            value=os.getenv("SOCRATA_APP_TOKEN", ""),
            help="Registrate gratis en evaluamos.datos.gov.co para mayor cuota",
        )
        submitted = st.form_submit_button("🚀 Ingestar SECOP II", type="primary")

    if submitted:
        progress = st.progress(0.0)
        status = st.empty()

        def _prog(acum, lote):
            pct = min(1.0, acum / limite)
            progress.progress(pct)
            status.info(f"Descargados: {acum:,} contratos (+{lote} en último lote)")

        try:
            n = store.ingestar_desde_secop(
                desde_iso=desde.isoformat(),
                limite_total=int(limite),
                chunk_size=2000,
                app_token=token or None,
                callback=_prog,
            )
            progress.progress(1.0)
            status.success(f"✅ {n:,} contratos nuevos indexados")
            st.rerun()
        except Exception as exc:
            status.error(f"❌ {exc}")

    st.divider()
    if st.button("🗑️ Borrar índice", use_container_width=True):
        store.reset()
        st.success("Índice borrado.")
        st.rerun()


# ---------------------------------------------------------------------------
# Búsqueda principal
# ---------------------------------------------------------------------------

if total_indexado == 0:
    st.warning(
        "Todavía no hay contratos indexados. Abrí la sidebar y hacé clic en "
        "**🚀 Ingestar SECOP II** para empezar."
    )
    st.info(
        "**Ejemplo de flujo:**\n\n"
        "1. Ingestá contratos desde 2025-01-01 (≈2 min con 5000 contratos)\n"
        "2. Buscá por significado: *'mantenimiento vías rurales boyacá'*\n"
        "3. El buscador entiende sinónimos: *'obras viales'*, *'reparación de carreteras'*, etc."
    )
    st.stop()


col_q, col_top = st.columns([4, 1])
with col_q:
    consulta = st.text_input(
        "Buscá por significado",
        placeholder="Ej: mantenimiento de puesta a tierra en escuelas de policía",
        help="El buscador entiende sinónimos y contexto, no requiere palabras exactas",
    )
with col_top:
    top_k = st.number_input("Top-K", min_value=5, max_value=50, value=10)


col_ent, col_dep, col_min, col_max = st.columns(4)
with col_ent:
    filtro_entidad = st.text_input("Filtrar por entidad (contiene)", "")
with col_dep:
    filtro_depto = st.text_input("Departamento (exacto)", "")
with col_min:
    filtro_val_min = st.number_input("Valor mínimo", min_value=0, value=0, step=1_000_000)
with col_max:
    filtro_val_max = st.number_input("Valor máximo (0 = sin tope)", min_value=0, value=0, step=1_000_000)


if consulta:
    with st.spinner("Buscando por significado..."):
        # Filtros Chroma
        chroma_where = {}
        if filtro_depto:
            chroma_where["departamento"] = filtro_depto

        if filtro_entidad:
            df = store.buscar_por_entidad(filtro_entidad, consulta, top_k=int(top_k))
        else:
            df = store.buscar(consulta, top_k=int(top_k), filtros=chroma_where or None)

    if df.empty:
        st.warning("Sin resultados. Probá otra consulta o menos filtros.")
    else:
        # Post-filtros de valor (Chroma no soporta rangos numéricos sobre strings)
        if "valor_del_contrato" in df.columns:
            df["_valor"] = pd.to_numeric(df["valor_del_contrato"], errors="coerce").fillna(0)
            if filtro_val_min:
                df = df[df["_valor"] >= filtro_val_min]
            if filtro_val_max:
                df = df[df["_valor"] <= filtro_val_max]
            df = df.drop(columns=["_valor"])

        st.success(f"{len(df)} resultados")

        for _, row in df.iterrows():
            sim_pct = int(row["similitud"] * 100)
            color = "green" if sim_pct >= 70 else "orange" if sim_pct >= 50 else "gray"

            with st.container(border=True):
                c1, c2 = st.columns([5, 1])
                with c1:
                    st.markdown(f"**{row.get('nombre_entidad', '?')}**")
                    st.write(row["objeto"])

                    tags = []
                    if row.get("modalidad_de_contratacion"):
                        tags.append(f"📋 {row['modalidad_de_contratacion']}")
                    if row.get("departamento"):
                        tags.append(f"📍 {row['departamento']}")
                    if row.get("valor_del_contrato"):
                        try:
                            v = float(row["valor_del_contrato"])
                            tags.append(f"💰 ${v:,.0f}")
                        except (ValueError, TypeError):
                            pass
                    if row.get("fecha_de_firma_del_contrato"):
                        tags.append(f"📅 {row['fecha_de_firma_del_contrato'][:10]}")
                    st.caption(" · ".join(tags))

                    if row.get("urlproceso"):
                        st.markdown(f"[Ver en SECOP II ↗]({row['urlproceso']})")

                with c2:
                    st.markdown(
                        f"<div style='text-align:center;padding:8px;"
                        f"background:rgba(0,0,0,0.03);border-radius:8px'>"
                        f"<div style='font-size:1.5rem;font-weight:800;color:{color}'>{sim_pct}%</div>"
                        f"<div style='font-size:0.7rem;color:gray'>similitud</div>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )

        st.divider()
        st.caption(
            "💡 Similitud = coseno entre embeddings. "
            "≥70% muy relevante · 50-70% relacionado · <50% marginal."
        )
