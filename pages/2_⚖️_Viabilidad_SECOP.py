"""
Página Streamlit · Analizador de viabilidad SECOP II con cruce RUP.

Flujo:
  1. Usuario ingresa número de proceso + datos del RUP (manual o JSON)
  2. LICITA descarga pliegos desde dmgg-8hin
  3. Extrae indicadores exigidos
  4. Cruza contra el RUP del cliente
  5. Muestra tabla semáforo + veredicto Go/No-Go + informe .md descargable
"""
from __future__ import annotations

import json

import streamlit as st

from modules.rup_extractor import extraer_rup_pdf
from modules.viability_analyzer import (
    ViabilityAnalyzer, VERDE, AMARILLO, ROJO,
)

st.set_page_config(page_title="Viabilidad SECOP II", page_icon="⚖️", layout="wide")

st.title("⚖️ Análisis de Viabilidad · SECOP II vs RUP Cliente")
st.caption(
    "Cruza los indicadores habilitantes del pliego contra el RUP del cliente "
    "y produce un veredicto Go/No-Go con tabla semáforo y recomendaciones."
)


# ---------------------------------------------------------------------------
# Form del RUP del cliente
# ---------------------------------------------------------------------------

with st.sidebar:
    st.header("📋 RUP del Cliente")
    tab_pdf, tab_manual, tab_json = st.tabs(["Certificado PDF", "Manual", "Subir JSON"])

    with tab_pdf:
        rup_pdf = st.file_uploader(
            "Certificado RUP (PDF de la Cámara de Comercio)",
            type=["pdf"],
            help="El certificado digital, no un escaneo. LICITA extrae indicadores, UNSPSC y experiencia.",
        )
        if rup_pdf:
            try:
                extraido = extraer_rup_pdf(rup_pdf.getvalue())
            except Exception as exc:
                st.error(f"No se pudo leer el certificado: {exc}")
            else:
                st.session_state["rup_data"] = extraido.to_rup_dict()
                if extraido.razon_social or extraido.nit:
                    st.success(f"{extraido.razon_social or 'Proponente'} · NIT {extraido.nit or '—'}")
                filas = [
                    ("Liquidez", extraido.liquidez),
                    ("Endeudamiento (%)", extraido.endeudamiento),
                    ("Cobertura de intereses", extraido.razon_cobertura),
                    ("Rentabilidad patrimonio (%)", extraido.rentabilidad_patrimonio),
                    ("Rentabilidad activo (%)", extraido.rentabilidad_activo),
                    ("Patrimonio (COP)", f"{extraido.patrimonio:,.0f}" if extraido.patrimonio else None),
                ]
                for nombre, valor in filas:
                    st.write(f"**{nombre}:** {valor if valor is not None else '—'}")
                st.write(f"**Códigos UNSPSC:** {len(extraido.unspsc_codes)}")
                total_exp = sum(c.valor_smmlv * c.participacion / 100 for c in extraido.experiencia_contratos)
                st.write(f"**Experiencia:** {len(extraido.experiencia_contratos)} contratos · {total_exp:,.0f} SMMLV")
                for f in extraido.faltantes:
                    st.warning(f"No encontrado en el certificado: {f}. Revísalo a mano; el informe lo marcará.")
                for w in extraido.advertencias:
                    st.warning(w)

    with tab_json:
        uploaded = st.file_uploader(
            "rup_cliente.json",
            type=["json"],
            help="Estructura esperada: liquidez, endeudamiento, razon_cobertura, patrimonio, "
                 "k_contratacion (SMMLV), unspsc_codes[], experiencia_contratos[]",
        )
        if uploaded:
            try:
                rup_data = json.loads(uploaded.read().decode("utf-8"))
                st.success(f"Cargado · {len(rup_data)} campos")
                st.session_state["rup_data"] = rup_data
            except json.JSONDecodeError as e:
                st.error(f"JSON inválido: {e}")

    with tab_manual:
        with st.form("rup_form"):
            liquidez = st.number_input("Liquidez", min_value=0.0, value=1.5, step=0.1)
            endeudamiento = st.number_input("Endeudamiento (%)", min_value=0.0, max_value=100.0, value=40.0, step=1.0)
            cobertura = st.number_input("Razón Cobertura Intereses", min_value=0.0, value=3.0, step=0.1)
            rent_pat = st.number_input("Rentabilidad del Patrimonio (%)", min_value=-100.0, max_value=200.0, value=10.0, step=0.5)
            rent_act = st.number_input("Rentabilidad del Activo (%)", min_value=-100.0, max_value=200.0, value=5.0, step=0.5)
            patrimonio = st.number_input("Patrimonio (COP)", min_value=0, value=500_000_000, step=10_000_000)
            k = st.number_input("K de contratación (SMMLV)", min_value=0, value=2000, step=100)
            unspsc_raw = st.text_input(
                "Códigos UNSPSC (separados por coma)",
                "43211500, 43222600",
                help="Códigos de 8 dígitos registrados en el RUP del cliente",
            )
            exp_raw = st.text_area(
                "Experiencia (una línea: objeto; valor_smmlv)",
                "Suministro equipos TIC; 800\nSoporte software; 1200",
            )
            if st.form_submit_button("Guardar RUP", type="primary"):
                exp_contratos = []
                for linea in exp_raw.strip().splitlines():
                    partes = [p.strip() for p in linea.split(";")]
                    if len(partes) == 2:
                        try:
                            exp_contratos.append({"objeto": partes[0], "valor_smmlv": float(partes[1])})
                        except ValueError:
                            continue
                st.session_state["rup_data"] = {
                    "liquidez": liquidez,
                    "endeudamiento": endeudamiento,
                    "razon_cobertura": cobertura,
                    "rentabilidad_patrimonio": rent_pat,
                    "rentabilidad_activo": rent_act,
                    "patrimonio": patrimonio,
                    "k_contratacion": k,
                    "unspsc_codes": [c.strip() for c in unspsc_raw.split(",") if c.strip()],
                    "experiencia_contratos": exp_contratos,
                }
                st.success("RUP cargado en memoria.")


# ---------------------------------------------------------------------------
# Main · ejecución del análisis
# ---------------------------------------------------------------------------

col1, col2 = st.columns([3, 1])
with col1:
    numero_proceso = st.text_input(
        "Número de proceso SECOP II",
        placeholder="Ej: LP-DNP-001-2026",
        help="El código completo del proceso tal como aparece en SECOP II",
    )
with col2:
    btn = st.button("🔍 Analizar viabilidad", type="primary", use_container_width=True)

if btn:
    if not numero_proceso:
        st.error("Ingresa el número de proceso.")
        st.stop()
    rup = st.session_state.get("rup_data")
    if not rup:
        st.error("Primero carga el RUP del cliente en la sidebar.")
        st.stop()

    with st.spinner("Descargando pliego y extrayendo requerimientos..."):
        try:
            analyzer = ViabilityAnalyzer()
            inf = analyzer.evaluar(numero_proceso, rup)
        except Exception as exc:
            st.error(f"Error durante el análisis: {exc}")
            st.stop()

    st.markdown("---")
    st.markdown(f"## {inf.veredicto}")

    if inf.presupuesto_oficial or inf.duracion:
        m1, m2, m3 = st.columns(3)
        if inf.presupuesto_oficial:
            m1.metric("Presupuesto Oficial", f"$ {inf.presupuesto_oficial:,.0f}")
        if inf.duracion:
            m2.metric("Duración", inf.duracion)
        m3.metric("Archivos analizados", len(inf.archivos_descargados))

    # Tabla semáforo financiero
    if inf.financiero:
        st.subheader("📊 Indicadores Financieros")
        for h in inf.financiero:
            color = {VERDE: "#dcfce7", AMARILLO: "#fef3c7", ROJO: "#fee2e2"}.get(h.semaforo, "#f1f5f9")
            txt = {VERDE: "#166534", AMARILLO: "#92400e", ROJO: "#991b1b"}.get(h.semaforo, "#334155")
            st.markdown(
                f"""<div style="background:{color};padding:12px 14px;border-radius:10px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;align-items:baseline">
                <b style="color:{txt}">{h.indicador}</b>
                <span style="color:{txt};font-size:0.85rem">{h.semaforo}</span>
                </div>
                <div style="font-size:0.85rem;color:{txt};margin-top:4px">
                Exigido: <b>{h.exigido}</b> · Cliente: <b>{h.cliente}</b>
                </div>
                <div style="font-size:0.8rem;color:{txt};opacity:0.85;margin-top:4px">
                {h.observacion}
                </div>
                </div>""",
                unsafe_allow_html=True,
            )

    # Capacidad técnica
    if inf.unspsc or inf.experiencia:
        st.subheader("🔧 Capacidad Técnica")
        for h in [inf.unspsc, inf.experiencia]:
            if not h:
                continue
            color = {VERDE: "#dcfce7", AMARILLO: "#fef3c7", ROJO: "#fee2e2"}.get(h.semaforo, "#f1f5f9")
            txt = {VERDE: "#166534", AMARILLO: "#92400e", ROJO: "#991b1b"}.get(h.semaforo, "#334155")
            st.markdown(
                f"""<div style="background:{color};padding:12px 14px;border-radius:10px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;align-items:baseline">
                <b style="color:{txt}">{h.indicador}</b>
                <span style="color:{txt};font-size:0.85rem">{h.semaforo}</span>
                </div>
                <div style="font-size:0.85rem;color:{txt};margin-top:4px">
                Exigido: <b>{h.exigido}</b> · Cliente: <b>{h.cliente}</b>
                </div>
                <div style="font-size:0.8rem;color:{txt};opacity:0.85;margin-top:4px">
                {h.observacion}
                </div>
                </div>""",
                unsafe_allow_html=True,
            )

    if inf.oportunidades_observacion:
        st.subheader("📝 Oportunidades de Observación al Pliego")
        for o in inf.oportunidades_observacion:
            st.markdown(f"- {o}")

    if inf.riesgos:
        st.subheader("⚠️ Riesgos")
        for r in inf.riesgos:
            st.warning(r)

    st.subheader("📄 Informe completo (.md)")
    st.download_button(
        label=f"⬇️ Descargar analisis_viabilidad_{numero_proceso}.md",
        data=inf.markdown.encode("utf-8"),
        file_name=f"analisis_viabilidad_{numero_proceso}.md",
        mime="text/markdown",
        type="primary",
    )
    with st.expander("Ver preview"):
        st.markdown(inf.markdown)
