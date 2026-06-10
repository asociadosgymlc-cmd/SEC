from __future__ import annotations

import datetime
import streamlit as st

from modules.data_processor import (
    Quote, LineItem, build_comparison_dataframe,
    get_summary_dataframe, validate_quote,
)
from modules.pdf_extractor import extract_from_pdf, extract_from_excel
from modules.excel_exporter import export_to_excel

st.set_page_config(
    page_title="Cotizaciones — Contratación Pública",
    page_icon="📋",
    layout="wide",
)

if "quotes" not in st.session_state:
    st.session_state.quotes: list[Quote] = []
if "edit_items" not in st.session_state:
    st.session_state.edit_items: list[dict] = [{}]


def _reset_form() -> None:
    st.session_state.edit_items = [{}]


def _add_item_row() -> None:
    st.session_state.edit_items.append({})


def _remove_item_row(idx: int) -> None:
    if len(st.session_state.edit_items) > 1:
        st.session_state.edit_items.pop(idx)


def _render_items_form() -> list[LineItem]:
    items: list[LineItem] = []
    cols_header = st.columns([2, 4, 1.5, 1.5, 2, 2, 0.5])
    labels = ["Código CPC", "Descripción", "Unidad", "Cantidad", "P. Unitario", "P. Total", ""]
    for col, lbl in zip(cols_header, labels):
        col.markdown(f"**{lbl}**")

    for i, _ in enumerate(st.session_state.edit_items):
        cols = st.columns([2, 4, 1.5, 1.5, 2, 2, 0.5])
        cpc = cols[0].text_input("CPC", key=f"cpc_{i}", label_visibility="collapsed")
        desc = cols[1].text_input("Descripción", key=f"desc_{i}", label_visibility="collapsed")
        unit = cols[2].text_input("Unidad", key=f"unit_{i}", value="UND", label_visibility="collapsed")
        qty = cols[3].number_input("Cant.", key=f"qty_{i}", min_value=0.0, step=1.0, label_visibility="collapsed")
        pu = cols[4].number_input("P.Unit.", key=f"pu_{i}", min_value=0.0, step=0.01, format="%.2f", label_visibility="collapsed")
        pt = round(qty * pu, 2)
        cols[5].text_input("P.Total", value=f"{pt:.2f}", key=f"pt_{i}", disabled=True, label_visibility="collapsed")
        if cols[6].button("✕", key=f"del_{i}"):
            _remove_item_row(i)
            st.rerun()

        if desc and qty > 0 and pu > 0:
            item = LineItem(
                codigo_cpc=cpc,
                descripcion=desc,
                unidad=unit,
                cantidad=qty,
                precio_unitario=pu,
                precio_total=pt,
            )
            items.append(item)

    return items


st.title("📋 Gestión de Cotizaciones — Contratación Pública")
st.caption("Extrae, compara y exporta cotizaciones a Excel para procesos de contratación pública (SERCOP/SOCE)")

tab_ingresar, tab_comparar, tab_exportar = st.tabs([
    "➕ Ingresar Cotización",
    "🔍 Comparar Cotizaciones",
    "📥 Exportar a Excel",
])

with tab_ingresar:
    st.subheader("Nueva Cotización")

    modo = st.radio(
        "Modo de ingreso",
        ["Formulario manual", "Cargar archivo (PDF / Excel)"],
        horizontal=True,
    )

    quote_to_save: Quote | None = None

    if modo == "Cargar archivo (PDF / Excel)":
        uploaded = st.file_uploader(
            "Selecciona el archivo de cotización",
            type=["pdf", "xlsx", "xls"],
        )
        if uploaded:
            with st.spinner("Extrayendo datos del archivo..."):
                file_bytes = uploaded.read()
                if uploaded.name.lower().endswith(".pdf"):
                    extracted = extract_from_pdf(file_bytes)
                else:
                    extracted = extract_from_excel(file_bytes)

            st.success("Archivo procesado. Revisa y completa los datos antes de guardar.")

            with st.expander("Datos del proveedor extraídos", expanded=True):
                c1, c2 = st.columns(2)
                extracted.proveedor = c1.text_input("Proveedor *", value=extracted.proveedor, key="up_prov")
                extracted.ruc = c2.text_input("RUC *", value=extracted.ruc, key="up_ruc")
                extracted.direccion = c1.text_input("Dirección", value=extracted.direccion, key="up_dir")
                extracted.telefono = c2.text_input("Teléfono", value=extracted.telefono, key="up_tel")
                extracted.numero_cotizacion = c1.text_input("N° Cotización", value=extracted.numero_cotizacion, key="up_num")
                extracted.fecha = c2.text_input("Fecha", value=extracted.fecha, key="up_fecha")
                extracted.vigencia = c1.text_input("Vigencia", value=extracted.vigencia, key="up_vig")
                extracted.iva_porcentaje = c2.number_input("IVA (%)", value=float(extracted.iva_porcentaje), min_value=0.0, max_value=100.0, step=0.5, key="up_iva")

            st.markdown("**Ítems extraídos**")
            if extracted.items:
                df_preview = extracted.items_to_dataframe()
                st.dataframe(df_preview, use_container_width=True)
                extracted.calcular_totales()
                st.metric("Total cotización", f"$ {extracted.total:,.2f}")
            else:
                st.warning("No se encontraron ítems automáticamente. Agrega los ítems manualmente abajo.")

            quote_to_save = extracted

    else:
        with st.expander("Datos del proveedor", expanded=True):
            c1, c2 = st.columns(2)
            prov = c1.text_input("Proveedor *", placeholder="Razón social del proveedor")
            ruc = c2.text_input("RUC *", placeholder="1234567890001")
            dir_ = c1.text_input("Dirección", placeholder="Calle, ciudad")
            tel = c2.text_input("Teléfono", placeholder="02-2345678")
            num_cot = c1.text_input("N° Cotización", placeholder="COT-2024-001")
            fecha = c2.text_input("Fecha", value=datetime.date.today().strftime("%d/%m/%Y"))
            vigencia = c1.text_input("Vigencia", placeholder="30 días")
            iva_pct = c2.number_input("IVA (%)", value=12.0, min_value=0.0, max_value=100.0, step=0.5)
            obs = st.text_area("Observaciones", height=60)

        st.markdown("**Ítems de la cotización**")
        items = _render_items_form()

        col_add, _ = st.columns([1, 8])
        if col_add.button("+ Agregar ítem"):
            _add_item_row()
            st.rerun()

        if items:
            subtotal = round(sum(i.precio_total for i in items), 2)
            iva_val = round(subtotal * iva_pct / 100, 2)
            total = round(subtotal + iva_val, 2)
            m1, m2, m3 = st.columns(3)
            m1.metric("Subtotal", f"$ {subtotal:,.2f}")
            m2.metric(f"IVA ({iva_pct:.0f}%)", f"$ {iva_val:,.2f}")
            m3.metric("Total", f"$ {total:,.2f}")

        if prov or ruc:
            q = Quote(
                proveedor=prov,
                ruc=ruc,
                direccion=dir_,
                telefono=tel,
                numero_cotizacion=num_cot,
                fecha=fecha,
                vigencia=vigencia,
                iva_porcentaje=iva_pct,
                items=items,
                observaciones=obs,
            )
            q.calcular_totales()
            quote_to_save = q

    st.divider()
    if st.button("💾 Guardar cotización", type="primary", use_container_width=True):
        if quote_to_save is None:
            st.error("Completa los datos del proveedor.")
        else:
            errors = validate_quote(quote_to_save)
            if errors:
                for e in errors:
                    st.error(e)
            else:
                existing_ids = [q.ruc for q in st.session_state.quotes]
                if quote_to_save.ruc in existing_ids:
                    st.warning("Ya existe una cotización de este proveedor (RUC). Se reemplazará.")
                    st.session_state.quotes = [
                        q for q in st.session_state.quotes if q.ruc != quote_to_save.ruc
                    ]
                st.session_state.quotes.append(quote_to_save)
                _reset_form()
                st.success(f"Cotización de **{quote_to_save.proveedor}** guardada exitosamente.")
                st.rerun()

    if st.session_state.quotes:
        st.divider()
        st.subheader("Cotizaciones guardadas")
        for i, q in enumerate(st.session_state.quotes):
            with st.expander(f"{q.proveedor} — RUC {q.ruc} — Total: $ {q.total:,.2f}"):
                st.dataframe(q.items_to_dataframe(), use_container_width=True)
                if st.button(f"Eliminar esta cotización", key=f"del_q_{i}"):
                    st.session_state.quotes.pop(i)
                    st.rerun()

with tab_comparar:
    st.subheader("Comparación de Cotizaciones")

    if len(st.session_state.quotes) < 2:
        st.info("Ingresa al menos **2 cotizaciones** para compararlas.")
    else:
        df_comp = build_comparison_dataframe(st.session_state.quotes)
        st.markdown("#### Cuadro Comparativo")
        st.dataframe(df_comp, use_container_width=True)

        st.divider()
        st.markdown("#### Resumen de proveedores")
        df_sum = get_summary_dataframe(st.session_state.quotes)
        cols_to_show = ["Proveedor", "RUC", "N° Cotización", "Fecha", "Subtotal", "IVA (12.0%)", "Total"]
        available = [c for c in cols_to_show if c in df_sum.columns]
        st.dataframe(df_sum[available], use_container_width=True)

        totals = {q.proveedor: q.total for q in st.session_state.quotes}
        best_prov = min(totals, key=lambda k: totals[k])
        best_total = totals[best_prov]
        st.success(f"**Mejor oferta total:** {best_prov} — $ {best_total:,.2f}")

        try:
            import plotly.express as px
            fig = px.bar(
                x=list(totals.keys()),
                y=list(totals.values()),
                labels={"x": "Proveedor", "y": "Total ($)"},
                title="Comparación de totales por proveedor",
                color=list(totals.keys()),
            )
            st.plotly_chart(fig, use_container_width=True)
        except ImportError:
            pass

with tab_exportar:
    st.subheader("Exportar a Excel")

    if not st.session_state.quotes:
        st.info("No hay cotizaciones guardadas aún. Ve a **Ingresar Cotización** para agregar.")
    else:
        st.markdown(f"Se exportarán **{len(st.session_state.quotes)} cotización(es)**.")

        nombre_proceso = st.text_input(
            "Nombre del proceso de contratación",
            placeholder="Ej: Adquisición de insumos médicos 2024",
        )
        entidad = st.text_input(
            "Entidad contratante",
            placeholder="Ej: Ministerio de Salud Pública",
        )

        if st.button("📥 Generar archivo Excel", type="primary", use_container_width=True):
            with st.spinner("Generando Excel..."):
                excel_bytes = export_to_excel(st.session_state.quotes)

            filename = "cotizaciones_contratacion_publica.xlsx"
            if nombre_proceso:
                safe = "".join(c for c in nombre_proceso if c.isalnum() or c in " _-")[:40]
                filename = f"{safe.strip().replace(' ', '_')}.xlsx"

            st.download_button(
                label="⬇️ Descargar Excel",
                data=excel_bytes,
                file_name=filename,
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True,
            )
            st.success("Excel generado. Haz clic en **Descargar Excel** para guardarlo.")

        st.divider()
        st.markdown("**El archivo Excel incluye:**")
        st.markdown("""
- 📊 **Hoja Comparación** — Tabla comparativa con mejor precio resaltado en verde
- 📋 **Hoja Resumen** — Resumen de todos los proveedores
- 🏢 **Una hoja por proveedor** — Detalle completo de cada cotización
        """)
