from __future__ import annotations

import datetime
import pandas as pd
import streamlit as st

from modules.data_processor import (
    Quote,
    LineItem,
    build_comparison_dataframe,
    get_summary_dataframe,
    validate_quote,
    find_best_price_per_item,
)
from modules.pdf_extractor import extract_from_pdf, extract_from_excel
from modules.excel_exporter import export_to_excel


st.set_page_config(
    page_title="Cotizaciones — Contratación Pública Ecuador",
    page_icon="📋",
    layout="wide",
    initial_sidebar_state="expanded",
)

_CSS = """
<style>
    .block-container { padding-top: 1.5rem; }
    .stTabs [data-baseweb="tab-list"] { gap: 8px; }
    .stTabs [data-baseweb="tab"] {
        border-radius: 6px 6px 0 0;
        padding: 8px 20px;
        font-weight: 600;
    }
    .metric-card {
        background: #f0f4f8;
        border-left: 4px solid #1F4E79;
        border-radius: 6px;
        padding: 12px 16px;
        margin-bottom: 6px;
    }
    .best-badge {
        background: #C6EFCE;
        color: #276221;
        padding: 4px 12px;
        border-radius: 20px;
        font-weight: 700;
        font-size: 0.85rem;
    }
    .section-title {
        color: #1F4E79;
        font-weight: 700;
        font-size: 1.05rem;
        margin-bottom: 8px;
        border-bottom: 2px solid #1F4E79;
        padding-bottom: 4px;
    }
    div[data-testid="stDataFrame"] { border-radius: 6px; overflow: hidden; }
</style>
"""
st.markdown(_CSS, unsafe_allow_html=True)


if "quotes" not in st.session_state:
    st.session_state.quotes: list[Quote] = []
if "form_items" not in st.session_state:
    st.session_state.form_items: list[dict] = [{}]
if "upload_key" not in st.session_state:
    st.session_state.upload_key: int = 0


def _reset_form() -> None:
    st.session_state.form_items = [{}]


def _add_item_row() -> None:
    st.session_state.form_items.append({})
    st.rerun()


def _remove_item_row(idx: int) -> None:
    if len(st.session_state.form_items) > 1:
        st.session_state.form_items.pop(idx)
        st.rerun()


def _render_item_table() -> list[LineItem]:
    items: list[LineItem] = []

    hdr = st.columns([2.2, 4.5, 1.5, 1.5, 2, 2, 0.6])
    for col, lbl in zip(hdr, [
        "Código CPC/UNSPSC", "Descripción *", "Unidad", "Cantidad *",
        "P. Unitario *", "P. Total", ""
    ]):
        col.markdown(f"<span style='font-size:0.8rem;font-weight:700;color:#1F4E79'>{lbl}</span>",
                     unsafe_allow_html=True)

    for i in range(len(st.session_state.form_items)):
        cols = st.columns([2.2, 4.5, 1.5, 1.5, 2, 2, 0.6])
        cpc = cols[0].text_input(
            "CPC", key=f"fi_cpc_{i}", label_visibility="collapsed",
            placeholder="Ej: 25171506"
        )
        desc = cols[1].text_input(
            "Descripción", key=f"fi_desc_{i}", label_visibility="collapsed",
            placeholder="Descripción del bien o servicio"
        )
        unit = cols[2].text_input(
            "Unidad", key=f"fi_unit_{i}", value="UND", label_visibility="collapsed"
        )
        qty = cols[3].number_input(
            "Cant.", key=f"fi_qty_{i}", min_value=0.0, step=1.0,
            format="%.2f", label_visibility="collapsed"
        )
        pu = cols[4].number_input(
            "P.Unit.", key=f"fi_pu_{i}", min_value=0.0, step=0.01,
            format="%.4f", label_visibility="collapsed"
        )
        pt = round(qty * pu, 2)
        cols[5].text_input(
            "P.Total", value=f"$ {pt:,.2f}", key=f"fi_pt_{i}",
            disabled=True, label_visibility="collapsed"
        )
        if cols[6].button("✕", key=f"fi_del_{i}", help="Eliminar ítem"):
            _remove_item_row(i)

        if desc.strip() and qty > 0 and pu > 0:
            items.append(LineItem(
                codigo_cpc=cpc.strip(),
                descripcion=desc.strip(),
                unidad=unit.strip(),
                cantidad=qty,
                precio_unitario=pu,
                precio_total=pt,
            ))

    return items


def _render_totals(items: list[LineItem], iva_pct: float) -> None:
    if not items:
        return
    subtotal = round(sum(it.precio_total for it in items), 2)
    iva_val = round(subtotal * iva_pct / 100, 2)
    total = round(subtotal + iva_val, 2)
    c1, c2, c3 = st.columns(3)
    c1.metric("Subtotal", f"$ {subtotal:,.2f}")
    c2.metric(f"IVA ({iva_pct:.0f}%)", f"$ {iva_val:,.2f}")
    c3.metric("Total con IVA", f"$ {total:,.2f}")


def _save_quote(quote: Quote) -> None:
    errors = validate_quote(quote)
    if errors:
        for err in errors:
            st.error(f"⚠ {err}")
        return

    existing_rucs = [q.ruc for q in st.session_state.quotes]
    if quote.ruc in existing_rucs:
        st.session_state.quotes = [
            q for q in st.session_state.quotes if q.ruc != quote.ruc
        ]
        st.warning(
            f"Ya existía una cotización con RUC {quote.ruc}. "
            "Se ha reemplazado con la nueva información."
        )

    st.session_state.quotes.append(quote)
    _reset_form()
    st.session_state.upload_key += 1
    st.success(
        f"✔ Cotización de **{quote.proveedor}** guardada exitosamente. "
        f"Total: **$ {quote.total:,.2f}**"
    )
    st.rerun()


def _sidebar() -> None:
    with st.sidebar:
        st.markdown("## 📋 Gestión de Cotizaciones")
        st.caption("Sistema de Contratación Pública – Ecuador (SERCOP/SOCE)")
        st.divider()

        n = len(st.session_state.quotes)
        if n == 0:
            st.info("No hay cotizaciones cargadas.")
        else:
            st.markdown(f"**Cotizaciones cargadas:** {n}")
            for i, q in enumerate(st.session_state.quotes):
                cols = st.columns([5, 1])
                cols[0].markdown(
                    f"<div style='font-size:0.82rem;padding:2px 0'>"
                    f"<b>{i+1}.</b> {q.proveedor}<br>"
                    f"<span style='color:#595959;font-size:0.75rem'>RUC: {q.ruc} | "
                    f"$ {q.total:,.2f}</span></div>",
                    unsafe_allow_html=True
                )
                if cols[1].button("🗑", key=f"sb_del_{i}", help="Eliminar"):
                    st.session_state.quotes.pop(i)
                    st.rerun()

        st.divider()
        if n >= 2:
            best_map = find_best_price_per_item(st.session_state.quotes)
            best_prov = best_map.get("__TOTAL__")
            if best_prov:
                best_q = next(
                    (q for q in st.session_state.quotes if q.proveedor == best_prov),
                    None
                )
                if best_q:
                    st.markdown("**Mejor oferta total:**")
                    st.markdown(
                        f"<span class='best-badge'>✔ {best_q.proveedor}</span>",
                        unsafe_allow_html=True
                    )
                    st.markdown(f"$ {best_q.total:,.2f}")

        if n > 0:
            st.divider()
            if st.button("🗑 Limpiar todas", use_container_width=True):
                st.session_state.quotes = []
                st.rerun()

        st.divider()
        st.caption("v1.0 — Contratación Pública Ecuador")


def _tab_ingresar() -> None:
    st.subheader("Nueva Cotización")

    modo = st.radio(
        "Modo de ingreso:",
        ["Formulario manual", "Cargar archivo (PDF o Excel)"],
        horizontal=True,
        key="modo_ingreso",
    )

    quote_to_save: Quote | None = None

    if modo == "Cargar archivo (PDF o Excel)":
        st.markdown(
            "<div class='section-title'>Cargar archivo de cotización</div>",
            unsafe_allow_html=True
        )
        uploaded = st.file_uploader(
            "Selecciona el archivo de cotización del proveedor",
            type=["pdf", "xlsx", "xls"],
            key=f"uploader_{st.session_state.upload_key}",
            help="Soporta archivos PDF y Excel (.xlsx, .xls)",
        )

        if uploaded is not None:
            with st.spinner("Extrayendo datos del archivo…"):
                file_bytes = uploaded.read()
                if uploaded.name.lower().endswith(".pdf"):
                    extracted = extract_from_pdf(file_bytes)
                else:
                    extracted = extract_from_excel(file_bytes)

            if extracted.proveedor or extracted.items:
                st.success(
                    "Archivo procesado correctamente. "
                    "Revisa y completa los datos antes de guardar."
                )
            else:
                st.warning(
                    "No se encontraron datos estructurados en el archivo. "
                    "Ingresa los datos manualmente."
                )

            st.markdown(
                "<div class='section-title'>Datos del proveedor (editable)</div>",
                unsafe_allow_html=True
            )
            with st.container():
                c1, c2 = st.columns(2)
                extracted.proveedor = c1.text_input(
                    "Proveedor / Razón Social *",
                    value=extracted.proveedor,
                    key="up_prov",
                    placeholder="Nombre o razón social del proveedor"
                )
                extracted.ruc = c2.text_input(
                    "RUC *",
                    value=extracted.ruc,
                    key="up_ruc",
                    placeholder="Ej: 1234567890001"
                )
                extracted.direccion = c1.text_input(
                    "Dirección",
                    value=extracted.direccion,
                    key="up_dir",
                    placeholder="Calle, número, ciudad"
                )
                extracted.telefono = c2.text_input(
                    "Teléfono",
                    value=extracted.telefono,
                    key="up_tel",
                    placeholder="02-2345678 / 0999000000"
                )
                extracted.numero_cotizacion = c1.text_input(
                    "N° Cotización",
                    value=extracted.numero_cotizacion,
                    key="up_num",
                    placeholder="COT-2024-001"
                )
                extracted.fecha = c2.text_input(
                    "Fecha",
                    value=extracted.fecha or datetime.date.today().strftime("%d/%m/%Y"),
                    key="up_fecha"
                )
                extracted.vigencia = c1.text_input(
                    "Vigencia",
                    value=extracted.vigencia,
                    key="up_vig",
                    placeholder="30 días"
                )
                extracted.iva_porcentaje = c2.number_input(
                    "IVA (%)",
                    value=float(extracted.iva_porcentaje),
                    min_value=0.0,
                    max_value=100.0,
                    step=0.5,
                    key="up_iva"
                )
                extracted.observaciones = st.text_area(
                    "Observaciones",
                    value=extracted.observaciones,
                    key="up_obs",
                    height=60,
                    placeholder="Condiciones de pago, entrega, garantía, etc."
                )

            st.markdown(
                "<div class='section-title'>Ítems extraídos</div>",
                unsafe_allow_html=True
            )
            if extracted.items:
                df_preview = extracted.items_to_dataframe()
                df_preview["Precio Unitario"] = df_preview["Precio Unitario"].apply(
                    lambda x: f"$ {x:,.4f}" if isinstance(x, float) else x
                )
                df_preview["Precio Total"] = df_preview["Precio Total"].apply(
                    lambda x: f"$ {x:,.2f}" if isinstance(x, float) else x
                )
                st.dataframe(df_preview, use_container_width=True, hide_index=True)
                extracted.calcular_totales()
                _render_totals(extracted.items, extracted.iva_porcentaje)
            else:
                st.info(
                    "No se detectaron ítems automáticamente en el archivo. "
                    "Puedes agregar los ítems mediante el formulario manual."
                )

            quote_to_save = extracted

    else:
        st.markdown(
            "<div class='section-title'>Datos del proveedor</div>",
            unsafe_allow_html=True
        )
        with st.container():
            c1, c2 = st.columns(2)
            prov = c1.text_input(
                "Proveedor / Razón Social *",
                placeholder="Nombre o razón social",
                key="man_prov"
            )
            ruc = c2.text_input(
                "RUC *",
                placeholder="1234567890001",
                key="man_ruc"
            )
            dir_ = c1.text_input(
                "Dirección",
                placeholder="Calle, número, ciudad",
                key="man_dir"
            )
            tel = c2.text_input(
                "Teléfono",
                placeholder="02-2345678 / 0999000000",
                key="man_tel"
            )
            num_cot = c1.text_input(
                "N° Cotización",
                placeholder="COT-2024-001",
                key="man_num"
            )
            fecha = c2.text_input(
                "Fecha",
                value=datetime.date.today().strftime("%d/%m/%Y"),
                key="man_fecha"
            )
            vigencia = c1.text_input(
                "Vigencia",
                placeholder="30 días",
                key="man_vig"
            )
            iva_pct = c2.number_input(
                "IVA (%)",
                value=12.0,
                min_value=0.0,
                max_value=100.0,
                step=0.5,
                key="man_iva"
            )
            obs = st.text_area(
                "Observaciones",
                height=60,
                placeholder="Condiciones de pago, entrega, garantía, etc.",
                key="man_obs"
            )

        st.markdown(
            "<div class='section-title'>Ítems de la cotización</div>",
            unsafe_allow_html=True
        )
        items = _render_item_table()

        c_add, _ = st.columns([1.5, 8])
        if c_add.button("＋ Agregar ítem", use_container_width=True):
            _add_item_row()

        if items:
            st.divider()
            _render_totals(items, iva_pct)

        if prov.strip() or ruc.strip():
            q = Quote(
                proveedor=prov.strip(),
                ruc=ruc.strip(),
                direccion=dir_.strip(),
                telefono=tel.strip(),
                numero_cotizacion=num_cot.strip(),
                fecha=fecha.strip(),
                vigencia=vigencia.strip(),
                iva_porcentaje=iva_pct,
                items=items,
                observaciones=obs.strip(),
                origen="manual",
            )
            q.calcular_totales()
            quote_to_save = q

    st.divider()
    if st.button("💾 Guardar cotización", type="primary", use_container_width=True):
        if quote_to_save is None:
            st.error("Completa al menos el nombre del proveedor y el RUC.")
        else:
            _save_quote(quote_to_save)

    if st.session_state.quotes:
        st.divider()
        st.markdown(
            "<div class='section-title'>Cotizaciones guardadas en esta sesión</div>",
            unsafe_allow_html=True
        )
        for i, q in enumerate(st.session_state.quotes):
            with st.expander(
                f"**{q.proveedor}** — RUC: {q.ruc} | "
                f"N°: {q.numero_cotizacion} | Total: $ {q.total:,.2f} | "
                f"Origen: {q.origen.upper()}"
            ):
                tab_items, tab_info = st.tabs(["Ítems", "Información del proveedor"])
                with tab_items:
                    if q.items:
                        df = q.items_to_dataframe()
                        st.dataframe(df, use_container_width=True, hide_index=True)
                        c1, c2, c3 = st.columns(3)
                        c1.metric("Subtotal", f"$ {q.subtotal:,.2f}")
                        c2.metric(f"IVA ({q.iva_porcentaje:.0f}%)", f"$ {q.iva:,.2f}")
                        c3.metric("Total", f"$ {q.total:,.2f}")
                    else:
                        st.info("Esta cotización no tiene ítems registrados.")

                with tab_info:
                    info_data = {
                        "Proveedor": q.proveedor,
                        "RUC": q.ruc,
                        "Dirección": q.direccion,
                        "Teléfono": q.telefono,
                        "N° Cotización": q.numero_cotizacion,
                        "Fecha": q.fecha,
                        "Vigencia": q.vigencia,
                        "Observaciones": q.observaciones,
                    }
                    for k, v in info_data.items():
                        if v:
                            cols = st.columns([2, 5])
                            cols[0].markdown(f"**{k}:**")
                            cols[1].write(v)

                st.divider()
                if st.button(
                    "🗑 Eliminar esta cotización",
                    key=f"del_cot_{i}",
                    type="secondary"
                ):
                    st.session_state.quotes.pop(i)
                    st.rerun()


def _tab_comparar() -> None:
    st.subheader("Comparación de Cotizaciones")

    n = len(st.session_state.quotes)
    if n == 0:
        st.info(
            "No hay cotizaciones registradas. "
            "Ve a la pestaña **Ingresar Cotización** para agregar."
        )
        return

    if n == 1:
        st.warning(
            "Solo hay **1 cotización** registrada. "
            "Agrega al menos una cotización más para comparar."
        )

    st.markdown(
        "<div class='section-title'>Resumen de proveedores</div>",
        unsafe_allow_html=True
    )
    df_sum = get_summary_dataframe(st.session_state.quotes)
    display_cols = [
        "Proveedor", "RUC", "N° Cotización", "Fecha", "Vigencia",
        f"IVA ({st.session_state.quotes[0].iva_porcentaje}%)",
        "Subtotal", "Total"
    ]
    actual_cols = [c for c in display_cols if c in df_sum.columns]
    st.dataframe(
        df_sum[actual_cols].style.format({
            "Subtotal": "$ {:,.2f}",
            "Total": "$ {:,.2f}",
            **{c: "$ {:,.2f}" for c in actual_cols if "IVA" in c},
        }),
        use_container_width=True,
        hide_index=True,
    )

    if n >= 2:
        st.markdown(
            "<div class='section-title'>Cuadro comparativo de precios</div>",
            unsafe_allow_html=True
        )
        st.caption(
            "Los precios se comparan ítem por ítem según la descripción. "
            "Si un proveedor no cotizó un ítem aparece como vacío."
        )

        df_comp = build_comparison_dataframe(st.session_state.quotes)

        best_map = find_best_price_per_item(st.session_state.quotes)

        def _highlight(df: pd.DataFrame) -> pd.DataFrame:
            styles = pd.DataFrame("", index=df.index, columns=df.columns)
            for ridx, row in df.iterrows():
                desc = str(row.get("Descripción del Ítem", ""))
                best_prov = best_map.get(desc)
                if best_prov:
                    for col in df.columns:
                        if best_prov in str(col) and "P.Total" in str(col):
                            styles.at[ridx, col] = (
                                "background-color: #C6EFCE; color: #276221; font-weight: bold"
                            )
                if desc == "TOTAL COTIZACIÓN (con IVA)":
                    for col in df.columns:
                        styles.at[ridx, col] = "background-color: #FFF2CC; font-weight: bold"
            return styles

        try:
            styled = df_comp.style.apply(_highlight, axis=None)
            st.dataframe(styled, use_container_width=True, hide_index=True)
        except Exception:
            st.dataframe(df_comp, use_container_width=True, hide_index=True)

        st.divider()
        totals = {q.proveedor: q.total for q in st.session_state.quotes}
        best_prov_name = min(totals, key=lambda k: totals[k])
        best_total_val = totals[best_prov_name]

        st.markdown(
            "<div class='section-title'>Resultado de la comparación</div>",
            unsafe_allow_html=True
        )
        cols = st.columns(len(st.session_state.quotes))
        sorted_quotes = sorted(st.session_state.quotes, key=lambda q: q.total)
        for ci, q in enumerate(sorted_quotes):
            is_best = q.proveedor == best_prov_name
            badge = "🥇 **MEJOR PRECIO**" if is_best else f"#{ci + 1}"
            bg = "#C6EFCE" if is_best else "#f5f5f5"
            border = "#276221" if is_best else "#cccccc"
            cols[ci].markdown(
                f"<div style='background:{bg};border:2px solid {border};"
                f"border-radius:8px;padding:12px;text-align:center'>"
                f"<div style='font-size:0.75rem;color:#595959'>{badge}</div>"
                f"<div style='font-weight:700;font-size:1rem;color:#1F4E79'>{q.proveedor}</div>"
                f"<div style='font-size:1.3rem;font-weight:700;color:#276221 if is_best else #333'>"
                f"$ {q.total:,.2f}</div>"
                f"<div style='font-size:0.75rem;color:#595959'>Subtotal: $ {q.subtotal:,.2f}</div>"
                f"</div>",
                unsafe_allow_html=True
            )

        st.success(
            f"**Recomendación:** La cotización con **menor precio total** es la de "
            f"**{best_prov_name}** con un total de **$ {best_total_val:,.2f}**."
        )

        try:
            import plotly.express as px
            prov_names = [q.proveedor for q in st.session_state.quotes]
            prov_totals = [q.total for q in st.session_state.quotes]
            colors = [
                "#C6EFCE" if p == best_prov_name else "#2E75B6"
                for p in prov_names
            ]
            fig = px.bar(
                x=prov_names,
                y=prov_totals,
                labels={"x": "Proveedor", "y": "Total con IVA ($)"},
                title="Comparación de totales por proveedor",
                color=prov_names,
                color_discrete_sequence=["#1F4E79", "#2E75B6", "#5BA3D9", "#9DC3E6"],
            )
            fig.update_layout(
                showlegend=False,
                plot_bgcolor="white",
                yaxis=dict(tickprefix="$ ", tickformat=",.2f"),
                title_font_size=14,
            )
            st.plotly_chart(fig, use_container_width=True)
        except ImportError:
            pass

        st.divider()
        st.markdown(
            "<div class='section-title'>Comparación de precios por ítem</div>",
            unsafe_allow_html=True
        )

        all_descs: list[str] = []
        for q in st.session_state.quotes:
            for item in q.items:
                d = item.descripcion.strip()
                if d and d not in all_descs:
                    all_descs.append(d)

        if all_descs:
            try:
                import plotly.graph_objects as go
                fig2 = go.Figure()
                for q in st.session_state.quotes:
                    y_vals = []
                    for d in all_descs:
                        matched = next(
                            (it for it in q.items if it.descripcion.strip() == d), None
                        )
                        y_vals.append(matched.precio_unitario if matched else 0)
                    fig2.add_trace(go.Bar(
                        name=q.proveedor,
                        x=all_descs,
                        y=y_vals,
                        text=[f"$ {v:,.2f}" for v in y_vals],
                        textposition="auto",
                    ))
                fig2.update_layout(
                    barmode="group",
                    title="Precio unitario por ítem y proveedor",
                    xaxis_title="Descripción del ítem",
                    yaxis_title="Precio Unitario ($)",
                    plot_bgcolor="white",
                    yaxis=dict(tickprefix="$ "),
                    title_font_size=14,
                    legend_title="Proveedor",
                )
                st.plotly_chart(fig2, use_container_width=True)
            except ImportError:
                pass


def _tab_exportar() -> None:
    st.subheader("Exportar a Excel")

    if not st.session_state.quotes:
        st.info(
            "No hay cotizaciones guardadas. "
            "Ve a **Ingresar Cotización** para agregar al menos una cotización."
        )
        return

    n = len(st.session_state.quotes)
    st.markdown(
        f"Se exportarán **{n} cotización(es)** al archivo Excel.",
        unsafe_allow_html=False
    )

    st.markdown(
        "<div class='section-title'>Información del proceso de contratación</div>",
        unsafe_allow_html=True
    )
    c1, c2 = st.columns(2)
    nombre_proceso = c1.text_input(
        "Nombre del proceso de contratación",
        placeholder="Ej: Adquisición de insumos médicos 2024",
        key="exp_proceso"
    )
    entidad = c2.text_input(
        "Entidad contratante",
        placeholder="Ej: Ministerio de Salud Pública",
        key="exp_entidad"
    )
    responsable = c1.text_input(
        "Responsable / Técnico a cargo",
        placeholder="Nombre del funcionario responsable",
        key="exp_resp"
    )
    codigo_proceso = c2.text_input(
        "Código del proceso (SOCE)",
        placeholder="Ej: RE-MINSAL-2024-0001",
        key="exp_cod"
    )

    st.divider()
    st.markdown(
        "<div class='section-title'>Vista previa de cotizaciones a exportar</div>",
        unsafe_allow_html=True
    )

    df_prev = pd.DataFrame([
        {
            "Proveedor": q.proveedor,
            "RUC": q.ruc,
            "N° Cotización": q.numero_cotizacion,
            "Fecha": q.fecha,
            "Ítems": len(q.items),
            "Subtotal": f"$ {q.subtotal:,.2f}",
            "IVA": f"$ {q.iva:,.2f}",
            "Total": f"$ {q.total:,.2f}",
        }
        for q in st.session_state.quotes
    ])
    st.dataframe(df_prev, use_container_width=True, hide_index=True)

    if n >= 2:
        best_map = find_best_price_per_item(st.session_state.quotes)
        best_prov = best_map.get("__TOTAL__")
        if best_prov:
            best_q = next(
                (q for q in st.session_state.quotes if q.proveedor == best_prov), None
            )
            if best_q:
                st.success(
                    f"✔ Mejor oferta: **{best_q.proveedor}** — $ {best_q.total:,.2f}"
                )

    st.divider()
    st.markdown(
        "<div class='section-title'>Generar archivo Excel</div>",
        unsafe_allow_html=True
    )

    if st.button(
        "📥 Generar archivo Excel",
        type="primary",
        use_container_width=True,
        key="btn_generar_excel"
    ):
        with st.spinner("Generando archivo Excel con todas las hojas…"):
            excel_bytes = export_to_excel(st.session_state.quotes)

        safe_name = "cotizaciones_contratacion_publica"
        if nombre_proceso.strip():
            safe_name = "".join(
                c for c in nombre_proceso.strip()
                if c.isalnum() or c in (" ", "_", "-")
            )[:50].strip().replace(" ", "_")

        filename = f"{safe_name}.xlsx"

        st.download_button(
            label="⬇️ Descargar Excel",
            data=excel_bytes,
            file_name=filename,
            mime=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
            use_container_width=True,
            key="btn_descarga_excel",
        )
        st.success(
            f"Archivo **{filename}** generado correctamente. "
            "Haz clic en **Descargar Excel** para guardarlo."
        )

    st.divider()
    with st.expander("Contenido del archivo Excel generado", expanded=True):
        st.markdown("""
**Hoja 1 — Comparativo:**
- Tabla comparativa de todos los proveedores por ítem
- Mejor precio resaltado en **verde**
- Precio más alto resaltado en **rojo**
- Total de cada cotización al final

**Hoja 2 — Resumen:**
- Tabla resumen con todos los proveedores
- Subtotal, IVA y Total por cotización
- Proveedor con menor precio destacado en verde

**Hojas individuales (una por proveedor):**
- Encabezado con información del proveedor (Razón Social, RUC, Dirección, Teléfono)
- Detalle completo de ítems cotizados (Código CPC/UNSPSC, Descripción, Unidad, Cantidad, Precios)
- Subtotal, IVA (12%) y Total al pie de la hoja
        """)


def main() -> None:
    _sidebar()

    st.markdown(
        "<h2 style='color:#1F4E79;margin-bottom:0'>📋 Gestión de Cotizaciones</h2>"
        "<p style='color:#595959;margin-top:4px'>Sistema de Contratación Pública – "
        "Ecuador (SERCOP / SOCE)</p>",
        unsafe_allow_html=True,
    )

    tab_ingresar, tab_comparar, tab_exportar = st.tabs([
        "➕  Ingresar Cotización",
        "🔍  Comparar Cotizaciones",
        "📥  Exportar a Excel",
    ])

    with tab_ingresar:
        _tab_ingresar()

    with tab_comparar:
        _tab_comparar()

    with tab_exportar:
        _tab_exportar()


if __name__ == "__main__":
    main()
