from __future__ import annotations

import re
import io
from typing import List, Optional, Tuple

import pdfplumber
import pandas as pd

from modules.data_processor import Quote, LineItem


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _parse_number(value: str) -> float:
    cleaned = re.sub(r"[^\d.,]", "", value or "")
    cleaned = cleaned.replace(",", ".")
    parts = cleaned.split(".")
    if len(parts) > 2:
        cleaned = "".join(parts[:-1]) + "." + parts[-1]
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _extract_field(pattern: str, text: str, flags: int = re.IGNORECASE) -> str:
    m = re.search(pattern, text, flags)
    if m:
        return _clean(m.group(1))
    return ""


def _extract_ruc(text: str) -> str:
    patterns = [
        r"R\.?U\.?C\.?\s*[:\-]?\s*(\d{10,13})",
        r"RUC\s*[:\-]?\s*(\d{10,13})",
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return ""


def _extract_date(text: str) -> str:
    m = re.search(
        r"fecha\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
        text, re.IGNORECASE
    )
    if m:
        return _clean(m.group(1))
    m = re.search(
        r"(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})", text
    )
    if m:
        return _clean(m.group(1))
    return ""


def _extract_quote_number(text: str) -> str:
    patterns = [
        r"(?:N[°oº]|No\.?|N[uú]mero)\s*(?:de\s+)?cotizaci[oó]n\s*[:\-]?\s*([A-Z0-9\-\/]+)",
        r"cotizaci[oó]n\s*[:\-]?\s*([A-Z0-9\-\/]+)",
        r"oferta\s*(?:N[°oº])?\s*[:\-]?\s*([A-Z0-9\-\/]+)",
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return _clean(m.group(1))
    return ""


def _extract_validity(text: str) -> str:
    m = re.search(
        r"vigencia\s*[:\-]?\s*(.{0,60}?)(?:\n|$)",
        text, re.IGNORECASE
    )
    if m:
        return _clean(m.group(1))
    m = re.search(
        r"v[áa]lid[oa]?\s*(?:por|hasta|)\s*(.{0,40}?)(?:\n|$)",
        text, re.IGNORECASE
    )
    if m:
        return _clean(m.group(1))
    return ""


def _parse_table_row(row: List[Optional[str]], headers: List[str]) -> Optional[LineItem]:
    def cell(idx: int) -> str:
        if idx < len(row) and row[idx] is not None:
            return _clean(str(row[idx]))
        return ""

    header_lower = [h.lower() if h else "" for h in headers]

    def col_idx(*keywords: str) -> int:
        for kw in keywords:
            for i, h in enumerate(header_lower):
                if kw in h:
                    return i
        return -1

    desc_idx = col_idx("descripcion", "descripción", "detalle", "producto", "servicio", "item", "ítem")
    qty_idx = col_idx("cantidad", "qty", "cant")
    unit_idx = col_idx("unidad", "u/m", "u.m", "um", "medida")
    pu_idx = col_idx("p.unit", "p. unit", "precio unit", "valor unit", "p/u", "unitario")
    pt_idx = col_idx("p.total", "p. total", "precio total", "valor total", "total")
    cpc_idx = col_idx("cpc", "unspsc", "código", "codigo", "cod")

    if desc_idx == -1:
        return None

    descripcion = cell(desc_idx)
    if not descripcion or descripcion.lower() in ("descripción", "descripcion", "detalle", "item", "ítem"):
        return None

    item = LineItem()
    item.descripcion = descripcion
    item.codigo_cpc = cell(cpc_idx) if cpc_idx != -1 else ""
    item.unidad = cell(unit_idx) if unit_idx != -1 else ""

    if qty_idx != -1:
        item.cantidad = _parse_number(cell(qty_idx))
    if pu_idx != -1:
        item.precio_unitario = _parse_number(cell(pu_idx))
    if pt_idx != -1:
        item.precio_total = _parse_number(cell(pt_idx))

    if item.cantidad > 0 and item.precio_unitario > 0 and item.precio_total == 0:
        item.calcular_total()

    if item.descripcion and (item.cantidad > 0 or item.precio_unitario > 0):
        return item
    return None


def _parse_line_items_from_text(text: str) -> List[LineItem]:
    items: List[LineItem] = []

    pattern = re.compile(
        r"([A-Z0-9\.]{4,20})?\s+"
        r"(.{5,80?}?)\s+"
        r"(UND|UNIDAD|KG|LITRO|LT|M2|M3|ML|GL|CAJA|PAR|JGO|SRV|SVC|UN|U)\s+"
        r"(\d+[\.,]?\d*)\s+"
        r"(\d+[\.,]\d{2})\s+"
        r"(\d+[\.,]\d{2})",
        re.IGNORECASE
    )

    for m in pattern.finditer(text):
        item = LineItem()
        item.codigo_cpc = _clean(m.group(1) or "")
        item.descripcion = _clean(m.group(2))
        item.unidad = _clean(m.group(3))
        item.cantidad = _parse_number(m.group(4))
        item.precio_unitario = _parse_number(m.group(5))
        item.precio_total = _parse_number(m.group(6))
        if item.descripcion and item.cantidad > 0:
            items.append(item)

    return items


def extract_from_pdf(file_bytes: bytes) -> Quote:
    quote = Quote(origen="pdf")
    full_text = ""

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        all_tables: List[Tuple] = []
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text += "\n" + page_text
            tables = page.extract_tables()
            for table in tables:
                if table and len(table) > 1:
                    all_tables.append(table)

    quote.proveedor = _extract_field(
        r"(?:raz[oó]n\s+social|empresa|proveedor|nombre)\s*[:\-]?\s*(.+?)(?:\n|RUC|$)",
        full_text
    )
    quote.ruc = _extract_ruc(full_text)
    quote.direccion = _extract_field(
        r"direcci[oó]n\s*[:\-]?\s*(.+?)(?:\n|tel[eé]fono|fax|$)",
        full_text
    )
    quote.telefono = _extract_field(
        r"tel[eé]fono\s*[:\-]?\s*([+\d\s\(\)\-]{6,20})",
        full_text
    )
    quote.fecha = _extract_date(full_text)
    quote.numero_cotizacion = _extract_quote_number(full_text)
    quote.vigencia = _extract_validity(full_text)

    for table in all_tables:
        if not table or len(table) < 2:
            continue
        headers = [str(h).strip() if h is not None else "" for h in table[0]]
        has_desc = any(
            kw in h.lower()
            for h in headers
            for kw in ("descripcion", "descripción", "detalle", "producto", "servicio")
        )
        if not has_desc:
            continue
        for row in table[1:]:
            if row is None:
                continue
            item = _parse_table_row(row, headers)
            if item:
                quote.items.append(item)

    if not quote.items:
        items = _parse_line_items_from_text(full_text)
        quote.items.extend(items)

    subtotal_match = re.search(r"subtotal\s*[:\$]?\s*([\d\.,]+)", full_text, re.IGNORECASE)
    iva_match = re.search(r"iva\s*(?:12%?)?\s*[:\$]?\s*([\d\.,]+)", full_text, re.IGNORECASE)
    total_match = re.search(r"total\s*(?:general|a\s+pagar)?\s*[:\$]?\s*([\d\.,]+)", full_text, re.IGNORECASE)

    if subtotal_match:
        quote.subtotal = _parse_number(subtotal_match.group(1))
    if iva_match:
        quote.iva = _parse_number(iva_match.group(1))
    if total_match:
        quote.total = _parse_number(total_match.group(1))

    if quote.items and (quote.subtotal == 0 or quote.total == 0):
        quote.calcular_totales()

    return quote


def extract_from_excel(file_bytes: bytes) -> Quote:
    quote = Quote(origen="excel")

    try:
        xl = pd.ExcelFile(io.BytesIO(file_bytes))
        sheet_names = xl.sheet_names
    except Exception:
        return quote

    header_sheet = None
    items_sheet = None

    for name in sheet_names:
        nl = name.lower()
        if any(kw in nl for kw in ("cotiz", "oferta", "proforma", "encabez", "datos")):
            header_sheet = name
        if any(kw in nl for kw in ("item", "ítem", "detalle", "producto", "precio")):
            items_sheet = name

    if header_sheet is None and sheet_names:
        header_sheet = sheet_names[0]
    if items_sheet is None and sheet_names:
        items_sheet = sheet_names[0]

    def search_cell_value(df: pd.DataFrame, keyword: str) -> str:
        for _, row in df.iterrows():
            for i, cell in enumerate(row):
                cell_str = str(cell).lower() if cell is not None else ""
                if keyword in cell_str:
                    if i + 1 < len(row):
                        val = row.iloc[i + 1]
                        if val is not None and str(val).strip() not in ("nan", ""):
                            return _clean(str(val))
        return ""

    try:
        df_header = pd.read_excel(io.BytesIO(file_bytes), sheet_name=header_sheet, header=None)
        full_text = df_header.to_string()

        quote.proveedor = search_cell_value(df_header, "proveedor") or \
                          search_cell_value(df_header, "razón social") or \
                          search_cell_value(df_header, "empresa")
        quote.ruc = search_cell_value(df_header, "ruc")
        quote.direccion = search_cell_value(df_header, "dirección") or \
                          search_cell_value(df_header, "direccion")
        quote.telefono = search_cell_value(df_header, "teléfono") or \
                         search_cell_value(df_header, "telefono")
        quote.fecha = search_cell_value(df_header, "fecha") or _extract_date(full_text)
        quote.numero_cotizacion = search_cell_value(df_header, "cotización") or \
                                   search_cell_value(df_header, "cotizacion") or \
                                   search_cell_value(df_header, "n°") or \
                                   _extract_quote_number(full_text)
        quote.vigencia = search_cell_value(df_header, "vigencia")
    except Exception:
        pass

    try:
        df_items = pd.read_excel(io.BytesIO(file_bytes), sheet_name=items_sheet)
        df_items.columns = [str(c).strip() for c in df_items.columns]

        col_lower = {c.lower(): c for c in df_items.columns}

        def find_col(*keywords: str) -> Optional[str]:
            for kw in keywords:
                for cl, orig in col_lower.items():
                    if kw in cl:
                        return orig
            return None

        desc_col = find_col("descripcion", "descripción", "detalle", "producto", "servicio")
        qty_col = find_col("cantidad", "cant", "qty")
        unit_col = find_col("unidad", "u/m", "um", "medida")
        pu_col = find_col("precio unit", "p.unit", "unitario", "p/u", "valor unit")
        pt_col = find_col("precio total", "p.total", "valor total", "total item")
        cpc_col = find_col("cpc", "unspsc", "código", "codigo", "cod")

        if desc_col:
            for _, row in df_items.iterrows():
                desc = _clean(str(row[desc_col])) if row[desc_col] is not None else ""
                if not desc or desc.lower() in ("nan", "descripcion", "descripción", "detalle"):
                    continue

                item = LineItem()
                item.descripcion = desc
                item.codigo_cpc = _clean(str(row[cpc_col])) if cpc_col and row[cpc_col] is not None else ""
                item.unidad = _clean(str(row[unit_col])) if unit_col and row[unit_col] is not None else ""

                try:
                    item.cantidad = float(row[qty_col]) if qty_col and row[qty_col] is not None else 0.0
                except (ValueError, TypeError):
                    item.cantidad = 0.0

                try:
                    item.precio_unitario = float(row[pu_col]) if pu_col and row[pu_col] is not None else 0.0
                except (ValueError, TypeError):
                    item.precio_unitario = 0.0

                try:
                    item.precio_total = float(row[pt_col]) if pt_col and row[pt_col] is not None else 0.0
                except (ValueError, TypeError):
                    item.precio_total = 0.0

                if item.cantidad > 0 and item.precio_unitario > 0 and item.precio_total == 0:
                    item.calcular_total()

                if item.descripcion and (item.cantidad > 0 or item.precio_unitario > 0):
                    quote.items.append(item)
    except Exception:
        pass

    quote.calcular_totales()
    return quote
