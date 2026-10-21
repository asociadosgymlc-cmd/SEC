"""
Página Streamlit · Viabilidad SECOP II.

Tres pasos:
  ① Mi empresa      · con RUP (certificado PDF) o sin RUP (mínima cuantía)
  ② Analizar proceso · cruce del pliego/invitación contra la empresa, veredicto y precio
  ③ Mínimas abiertas · mínimas cuantías recibiendo ofertas hoy
"""
from __future__ import annotations

import html
import json

import streamlit as st

from modules.minima_cuantia import MinimaCuantia
from modules.rup_extractor import extraer_rup_pdf, parse_numero
from modules.viability_analyzer import (
    AMARILLO, NO_APLICA, ROJO, SMMLV_DEFAULT, VERDE, ViabilityAnalyzer,
)

st.set_page_config(page_title="Viabilidad SECOP II · LICITA", page_icon="⚖️", layout="wide")

COLORES = {
    VERDE: ("#ecfdf5", "#065f46", "#10b981"),
    AMARILLO: ("#fffbeb", "#92400e", "#f59e0b"),
    ROJO: ("#fef2f2", "#991b1b", "#ef4444"),
    NO_APLICA: ("#f8fafc", "#475569", "#cbd5e1"),
}

st.markdown(
    """
    <style>
      .lc-header {display:flex; align-items:center; gap:14px; margin-bottom:4px}
      .lc-header h1 {font-size:1.7rem; margin:0; color:#0f172a}
      .lc-header p {margin:0; color:#64748b; font-size:0.9rem}
      .lc-card {border-radius:12px; padding:12px 16px; margin-bottom:10px; border-left:5px solid}
      .lc-card .t {display:flex; justify-content:space-between; font-weight:600}
      .lc-card .m {font-size:0.85rem; margin-top:4px}
      .lc-card .o {font-size:0.82rem; margin-top:4px; opacity:.9}
      .lc-verdict {border-radius:14px; padding:18px 20px; font-size:1.15rem; font-weight:600;
                   background:linear-gradient(135deg,#1e3a8a,#2563eb); color:white; margin:8px 0 16px}
      .lc-chip {display:inline-block; padding:2px 10px; border-radius:999px; font-size:.75rem;
                font-weight:600; background:#e0f2fe; color:#0369a1; margin-right:6px}
    </style>
    <div class="lc-header">
      <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="12" fill="#1e3a8a"/>
        <path d="M15 11V33H23L37 16" stroke="#f59e0b" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div>
        <h1>Viabilidad SECOP II</h1>
        <p>¿Me presento a este proceso? Cruce de requisitos, experiencia y precio · LICITA</p>
      </div>
    </div>
    """,
    unsafe_allow_html=True,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_contratos(texto: str) -> list[dict]:
    """
    Una línea por contrato: objeto; valor; [SMMLV|COP]; [% participación]
    Sin unidad: valores de 100.000 o más se toman como pesos, menores como SMMLV.
    """
    contratos = []
    for linea in texto.strip().splitlines():
        partes = [p.strip() for p in linea.split(";")]
        if len(partes) < 2:
            continue
        valor = parse_numero(partes[1], dinero=True)
        if not valor:
            continue
        unidad = partes[2].upper() if len(partes) > 2 and partes[2] else ("COP" if valor >= 100_000 else "SMMLV")
        c = {"objeto": partes[0], "participacion": 100.0}
        c["valor_cop" if unidad.startswith("COP") or unidad == "$" else "valor_smmlv"] = valor
        if len(partes) > 3 and partes[3]:
            c["participacion"] = parse_numero(partes[3].replace("%", "")) or 100.0
        contratos.append(c)
    return contratos


def num_opcional(etiqueta: str, ayuda: str = "") -> object:
    raw = st.text_input(etiqueta, placeholder="Sin dato", help=ayuda or None)
    return parse_numero(raw) if raw.strip() else None


def tarjeta(h) -> None:
    fondo, texto, borde = COLORES.get(h.semaforo, COLORES[NO_APLICA])
    st.markdown(
        f"""<div class="lc-card" style="background:{fondo};color:{texto};border-color:{borde}">
          <div class="t"><span>{html.escape(h.indicador)}</span><span>{html.escape(h.semaforo)}</span></div>
          <div class="m">Exigido: <b>{html.escape(h.exigido)}</b> · Empresa: <b>{html.escape(h.cliente)}</b></div>
          <div class="o">{html.escape(h.observacion)}</div>
        </div>""",
        unsafe_allow_html=True,
    )


def mostrar_informe(inf) -> None:
    st.markdown(f'<div class="lc-verdict">{html.escape(inf.veredicto.replace("**", ""))}</div>',
                unsafe_allow_html=True)
    c1, c2, c3 = st.columns(3)
    c1.metric("Presupuesto oficial", f"$ {inf.presupuesto_oficial:,.0f}" if inf.presupuesto_oficial else "—")
    c2.metric("Modalidad", inf.modalidad or "—")
    c3.metric("Plazo", inf.duracion or "—")
    if inf.objeto:
        st.caption(inf.objeto)

    if ViabilityAnalyzer.es_minima_cuantia(inf.modalidad):
        st.info(
            "**Mínima cuantía:** no se exige RUP. La entidad ordena las ofertas por precio y solo revisa "
            "los requisitos de la más barata; si no cumple, pasa a la siguiente."
        )

    if inf.precio:
        st.subheader("💰 Precio")
        p = inf.precio
        if p.disponible:
            a, b, c = st.columns(3)
            a.metric("Se adjudican al", f"{p.pct_mediana}% del presupuesto", help="Mediana de mínimas cuantías parecidas")
            if p.precio_max:
                b.metric("Rango competitivo", f"$ {p.precio_min:,.0f}", f"hasta $ {p.precio_max:,.0f}", delta_color="off")
            if p.margen_min is not None:
                c.metric("Tu margen en ese rango", f"{p.margen_min}% – {p.margen_max}%")
            st.caption(f"Basado en {p.procesos_comparados} procesos adjudicados · búsqueda: {p.palabras_busqueda}")
        for w in p.advertencias:
            st.warning(w)

    hallazgos = list(inf.financiero) + [h for h in (inf.unspsc, inf.experiencia) if h]
    if hallazgos:
        st.subheader("🚦 Requisitos habilitantes")
        izq, der = st.columns(2)
        for i, h in enumerate(hallazgos):
            with (izq if i % 2 == 0 else der):
                tarjeta(h)

    if inf.oportunidades_observacion:
        st.subheader("📝 Observaciones que vale la pena presentar")
        for o in inf.oportunidades_observacion:
            st.markdown(f"- {o}")
    for r in inf.riesgos:
        st.warning(r)

    st.download_button(
        "⬇️ Descargar informe (.md)",
        data=inf.markdown.encode("utf-8"),
        file_name=f"analisis_viabilidad_{inf.numero_proceso}.md",
        mime="text/markdown",
        type="primary",
    )
    st.caption("Insumo de apoyo: la decisión de presentar oferta debe pasar por revisión profesional.")


def correr_analisis(numero: str, costo, smmlv: float) -> None:
    perfil = st.session_state.get("perfil")
    if not perfil:
        st.error("Primero carga los datos de la empresa en ① Mi empresa.")
        return
    with st.spinner("Descargando documentos del proceso y cruzando requisitos..."):
        try:
            st.session_state["informe"] = ViabilityAnalyzer().evaluar(
                numero, perfil, costo_estimado=costo, smmlv=smmlv)
        except Exception as exc:
            st.error(f"No se pudo completar el análisis: {exc}")


def resumen_perfil(perfil: dict) -> None:
    contratos = perfil.get("experiencia_contratos", [])
    socios = perfil.get("experiencia_socios", [])
    chips = [
        perfil.get("razon_social") or "Empresa",
        "Con RUP" if perfil.get("unspsc_codes") else "Sin RUP",
        f"{len(contratos)} contrato(s)",
    ]
    if socios:
        chips.append(f"{len(socios)} contrato(s) de socios")
    st.markdown("".join(f'<span class="lc-chip">{html.escape(c)}</span>' for c in chips), unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Pasos
# ---------------------------------------------------------------------------

paso1, paso2, paso3 = st.tabs(["① Mi empresa", "② Analizar proceso", "③ Buscar mínimas abiertas"])

with paso1:
    if st.session_state.get("perfil"):
        resumen_perfil(st.session_state["perfil"])
    fuente = st.radio(
        "¿Cómo cargas los datos de la empresa?",
        ["Tengo RUP · subir certificado PDF", "No tengo RUP · mínima cuantía", "Subir JSON"],
        horizontal=True,
    )

    if fuente.startswith("Tengo RUP"):
        rup_pdf = st.file_uploader("Certificado RUP en PDF (el digital de la Cámara de Comercio, no un escaneo)", type=["pdf"])
        if rup_pdf:
            try:
                extraido = extraer_rup_pdf(rup_pdf.getvalue())
            except Exception as exc:
                st.error(f"No se pudo leer el certificado: {exc}")
            else:
                st.session_state["perfil"] = {**st.session_state.get("extra", {}), **extraido.to_rup_dict()}
                st.success(f"{extraido.razon_social or 'Proponente'} · NIT {extraido.nit or '—'}")
                a, b, c, d = st.columns(4)
                a.metric("Liquidez", extraido.liquidez if extraido.liquidez is not None else "—")
                b.metric("Endeudamiento", f"{extraido.endeudamiento}%" if extraido.endeudamiento is not None else "—")
                c.metric("UNSPSC", len(extraido.unspsc_codes))
                total = sum(x.valor_smmlv * x.participacion / 100 for x in extraido.experiencia_contratos)
                d.metric("Experiencia", f"{total:,.0f} SMMLV")
                for f in extraido.faltantes:
                    st.warning(f"No encontrado en el certificado: {f}. Revísalo a mano.")
                for w in extraido.advertencias:
                    st.warning(w)

    elif fuente.startswith("No tengo RUP"):
        st.caption("En mínima cuantía la experiencia y los estados financieros se prueban con certificados. "
                   "Deja vacío lo que no tengas: cuenta como sin dato, no como cero.")
        with st.form("sin_rup"):
            razon = st.text_input("Razón social")
            st.markdown("**Estados financieros** (solo si la invitación los pide)")
            f1, f2, f3 = st.columns(3)
            with f1:
                liquidez = num_opcional("Índice de liquidez", "Activo corriente / pasivo corriente")
            with f2:
                endeud = num_opcional("Endeudamiento (%)", "Pasivo total / activo total × 100")
            with f3:
                patrimonio = num_opcional("Patrimonio (COP)")
            contratos_txt = st.text_area(
                "Contratos ejecutados (uno por línea: objeto; valor; SMMLV o COP; % participación)",
                placeholder="Mantenimiento eléctrico sede norte; 15.000.000; COP\nObra civil en consorcio; 120; SMMLV; 50",
            )
            enviado = st.form_submit_button("Guardar empresa", type="primary")
        if enviado:
            perfil = {"razon_social": razon, "experiencia_contratos": parse_contratos(contratos_txt)}
            for k, v in (("liquidez", liquidez), ("endeudamiento", endeud), ("patrimonio", patrimonio)):
                if v is not None:
                    perfil[k] = v
            st.session_state["perfil"] = {**st.session_state.get("extra", {}), **perfil}
            st.success("Empresa guardada.")

    else:
        subido = st.file_uploader("Archivo JSON con los datos de la empresa", type=["json"])
        if subido:
            try:
                st.session_state["perfil"] = {**st.session_state.get("extra", {}), **json.loads(subido.getvalue())}
                st.success("Datos cargados.")
            except json.JSONDecodeError as exc:
                st.error(f"JSON inválido: {exc}")

    with st.expander("¿La empresa tiene menos de 3 años? Usa la experiencia de los socios"):
        st.caption("Las empresas con menos de 3 años de constituidas pueden acreditar la experiencia de "
                   "sus socios (art. 6 Ley 1150 de 2007, modificado por el Decreto Ley 019 de 2012).")
        with st.form("socios"):
            fecha = st.date_input("Fecha de constitución", value=None, format="DD/MM/YYYY")
            socios_txt = st.text_area(
                "Contratos de los socios (uno por línea: objeto; valor; SMMLV o COP)",
                placeholder="Instalación de pararrayos (socio Ing. Pérez); 30.000.000; COP",
            )
            if st.form_submit_button("Guardar"):
                extra = {"experiencia_socios": parse_contratos(socios_txt)}
                if fecha:
                    extra["fecha_constitucion"] = fecha.isoformat()
                st.session_state["extra"] = extra
                if st.session_state.get("perfil"):
                    st.session_state["perfil"].update(extra)
                st.success("Datos de socios guardados.")

with paso2:
    c1, c2, c3 = st.columns([2, 1, 1])
    with c1:
        numero = st.text_input("Número del proceso en SECOP II", value=st.session_state.get("numero", ""),
                               placeholder="Ej: CO1.REQ.1234567 o MC-012-2026")
    with c2:
        costo_raw = st.text_input("Tu costo estimado (COP)", placeholder="Opcional",
                                  help="Con impuestos, pólizas y estampillas. Sirve para calcular tu margen.")
    with c3:
        smmlv = st.number_input("SMMLV vigente", value=float(SMMLV_DEFAULT), step=1000.0,
                                help="Verifica el valor del año. Se usa para convertir entre pesos y SMMLV.")
    if st.button("🔍 Analizar viabilidad", type="primary", width="stretch"):
        if not numero.strip():
            st.error("Ingresa el número del proceso.")
        else:
            st.session_state["numero"] = numero.strip()
            costo = parse_numero(costo_raw, dinero=True) if costo_raw.strip() else None
            correr_analisis(numero.strip(), costo, smmlv)
    if st.session_state.get("informe"):
        mostrar_informe(st.session_state["informe"])

with paso3:
    st.caption("Mínimas cuantías que hoy están recibiendo ofertas. La experiencia exigida solo se conoce "
               "leyendo la invitación: analiza cada una en el paso ②.")
    b1, b2, b3 = st.columns([2, 1, 1])
    with b1:
        palabras = st.text_input("¿Qué ofreces?", placeholder="Ej: mantenimiento eléctrico")
    with b2:
        depto = st.text_input("Departamento", placeholder="Ej: Antioquia")
    with b3:
        tope_raw = st.text_input("Presupuesto máximo (COP)", placeholder="Opcional")
    if st.button("Buscar mínimas abiertas", width="stretch"):
        with st.spinner("Consultando SECOP II..."):
            try:
                st.session_state["abiertas"] = MinimaCuantia().buscar_abiertas(
                    palabras=palabras.strip(), departamento=depto.strip(),
                    presupuesto_max=parse_numero(tope_raw, dinero=True) if tope_raw.strip() else None,
                )
            except Exception as exc:
                st.error(f"No se pudo consultar SECOP II: {exc}")
    df = st.session_state.get("abiertas")
    if df is not None:
        if df.empty:
            st.info("No hay mínimas cuantías abiertas con esos filtros.")
        else:
            st.dataframe(
                df, width="stretch", hide_index=True,
                column_config={
                    "urlproceso": st.column_config.LinkColumn("SECOP II", display_text="Abrir"),
                    "precio_base": st.column_config.NumberColumn("Presupuesto", format="$ %d"),
                },
            )
            ids = df["id_del_proceso"].tolist() if "id_del_proceso" in df.columns else []
            elegido = st.selectbox("Proceso a analizar", ids)
            if ids and st.button("Usar este proceso en ②"):
                st.session_state["numero"] = elegido
                st.success("Listo: abre la pestaña ② Analizar proceso y pulsa Analizar.")
