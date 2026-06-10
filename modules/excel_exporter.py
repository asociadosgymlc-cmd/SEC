from __future__ import annotations

import io
from typing import List

import openpyxl
from openpyxl.styles import (
    Font, PatternFill, Alignment, Border, Side, numbers
)
from openpyxl.utils import get_column_letter

from modules.data_processor import Quote, find_best_price_per_item

_HEADER_FILL = PatternFill("solid", fgColor="1F4E79")
_HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
_BEST_FILL = PatternFill("solid", fgColor="C6EFCE")
_BEST_FONT = Font(bold=True, color="276221")
_WORST_FILL = PatternFill("solid", fgColor="FFCCCC")
_TOTAL_FILL = PatternFill("solid", fgColor="D6E4F0")
_ALT_FILL = PatternFill("solid", fgColor="EBF5FB")
_BORDER = Border(
    left=Side(style="thin"),
    right=Side(style="thin"),
    top=Side(style="thin"),
    bottom=Side(style="thin"),
)
_MONEY_FORMAT = '#,##0.00'
_PERCENT_FORMAT = '0.00%'


def _apply_header(ws, row: int, col: int, value: str) -> None:
    cell = ws.cell(row=row, column=col, value=value)
    cell.font = _HEADER_FONT
    cell.fill = _HEADER_FILL
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border = _BORDER


def _apply_cell(ws, row: int, col: int, value, fmt: str | None = None,
                fill=None, font=None, align: str = "left") -> None:
    cell = ws.cell(row=row, column=col, value=value)
    cell.border = _BORDER
    cell.alignment = Alignment(horizontal=align, vertical="center")
    if fmt:
        cell.number_format = fmt
    if fill:
        cell.fill = fill
    if font:
        cell.font = font


def _auto_width(ws) -> None:
    for col_cells in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col_cells[0].column)
        for cell in col_cells:
            if cell.value:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max(max_len + 4, 10), 50)


def _write_quote_sheet(wb: openpyxl.Workbook, quote: Quote) -> None:
    safe_name = "".join(c for c in quote.proveedor[:25] if c.isalnum() or c in " -_")
    ws = wb.create_sheet(title=safe_name or f"Cotiz_{quote.id[:6]}")

    ws.merge_cells("A1:F1")
    title = ws.cell(row=1, column=1, value=f"COTIZACIÓN — {quote.proveedor.upper()}")
    title.font = Font(bold=True, size=14, color="1F4E79")
    title.alignment = Alignment(horizontal="center")

    meta = [
        ("Proveedor", quote.proveedor),
        ("RUC", quote.ruc),
        ("Dirección", quote.direccion),
        ("Teléfono", quote.telefono),
        ("N° Cotización", quote.numero_cotizacion),
        ("Fecha", quote.fecha),
        ("Vigencia", quote.vigencia),
    ]
    for i, (label, val) in enumerate(meta, start=2):
        ws.cell(row=i, column=1, value=label).font = Font(bold=True)
        ws.cell(row=i, column=2, value=val)

    header_row = len(meta) + 3
    headers = ["Código CPC/UNSPSC", "Descripción", "Unidad", "Cantidad",
               "Precio Unitario", "Precio Total"]
    for col, h in enumerate(headers, start=1):
        _apply_header(ws, header_row, col, h)

    for r, item in enumerate(quote.items, start=header_row + 1):
        fill = _ALT_FILL if r % 2 == 0 else None
        _apply_cell(ws, r, 1, item.codigo_cpc, fill=fill)
        _apply_cell(ws, r, 2, item.descripcion, fill=fill)
        _apply_cell(ws, r, 3, item.unidad, fill=fill)
        _apply_cell(ws, r, 4, item.cantidad, fmt='#,##0.00', fill=fill, align="right")
        _apply_cell(ws, r, 5, item.precio_unitario, fmt=_MONEY_FORMAT, fill=fill, align="right")
        _apply_cell(ws, r, 6, item.precio_total, fmt=_MONEY_FORMAT, fill=fill, align="right")

    totals_row = header_row + len(quote.items) + 2
    ws.cell(row=totals_row, column=5, value="Subtotal").font = Font(bold=True)
    _apply_cell(ws, totals_row, 6, quote.subtotal, fmt=_MONEY_FORMAT, fill=_TOTAL_FILL, align="right")
    ws.cell(row=totals_row + 1, column=5, value=f"IVA ({quote.iva_porcentaje}%)").font = Font(bold=True)
    _apply_cell(ws, totals_row + 1, 6, quote.iva, fmt=_MONEY_FORMAT, fill=_TOTAL_FILL, align="right")
    ws.cell(row=totals_row + 2, column=5, value="TOTAL").font = Font(bold=True, size=12)
    _apply_cell(ws, totals_row + 2, 6, quote.total, fmt=_MONEY_FORMAT,
                fill=PatternFill("solid", fgColor="1F4E79"),
                font=Font(bold=True, color="FFFFFF", size=12), align="right")

    if quote.observaciones:
        ws.cell(row=totals_row + 4, column=1, value="Observaciones:").font = Font(bold=True)
        ws.cell(row=totals_row + 5, column=1, value=quote.observaciones)

    _auto_width(ws)
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)


def _write_comparison_sheet(wb: openpyxl.Workbook, quotes: List[Quote]) -> None:
    ws = wb.create_sheet(title="Comparación", index=0)
    best = find_best_price_per_item(quotes)

    ws.merge_cells(f"A1:{get_column_letter(1 + len(quotes) * 2)}1")
    title = ws.cell(row=1, column=1, value="CUADRO COMPARATIVO DE COTIZACIONES")
    title.font = Font(bold=True, size=14, color="1F4E79")
    title.alignment = Alignment(horizontal="center")

    _apply_header(ws, 2, 1, "Descripción")
    col = 2
    for q in quotes:
        ws.merge_cells(start_row=2, start_column=col, end_row=2, end_column=col + 1)
        _apply_header(ws, 2, col, q.proveedor)
        col += 2

    row = 3
    _apply_header(ws, row, 1, "")
    col = 2
    for _ in quotes:
        _apply_header(ws, row, col, "P. Unitario")
        _apply_header(ws, row, col + 1, "P. Total")
        col += 2

    all_descriptions: list[str] = []
    for q in quotes:
        for item in q.items:
            desc = item.descripcion.strip()
            if desc and desc not in all_descriptions:
                all_descriptions.append(desc)

    for r, desc in enumerate(all_descriptions, start=4):
        fill = _ALT_FILL if r % 2 == 0 else None
        _apply_cell(ws, r, 1, desc, fill=fill)
        best_prov = best.get(desc)
        col = 2
        prices: list[float] = []
        for q in quotes:
            matched = next((it for it in q.items if it.descripcion.strip() == desc), None)
            if matched:
                prices.append(matched.precio_unitario)
        min_price = min(prices) if prices else None

        col = 2
        for q in quotes:
            matched = next((it for it in q.items if it.descripcion.strip() == desc), None)
            if matched:
                is_best = (best_prov == q.proveedor)
                item_fill = _BEST_FILL if is_best else (_WORST_FILL if len(prices) > 1 and matched.precio_unitario > min_price else fill)
                item_font = _BEST_FONT if is_best else None
                _apply_cell(ws, r, col, matched.precio_unitario, fmt=_MONEY_FORMAT,
                            fill=item_fill, font=item_font, align="right")
                _apply_cell(ws, r, col + 1, matched.precio_total, fmt=_MONEY_FORMAT,
                            fill=item_fill, font=item_font, align="right")
            else:
                _apply_cell(ws, r, col, "N/D", fill=fill, align="center")
                _apply_cell(ws, r, col + 1, "N/D", fill=fill, align="center")
            col += 2

    total_row = 4 + len(all_descriptions)
    ws.cell(row=total_row, column=1, value="TOTAL COTIZACIÓN").font = Font(bold=True, size=11)
    best_total_prov = best.get("__TOTAL__")
    totals: list[float] = [q.total for q in quotes]
    min_total = min(totals) if totals else None
    col = 2
    for q in quotes:
        is_best = (best_total_prov == q.proveedor)
        tfill = _BEST_FILL if is_best else (_WORST_FILL if q.total > min_total else _TOTAL_FILL)
        tfont = _BEST_FONT if is_best else Font(bold=True)
        ws.merge_cells(start_row=total_row, start_column=col, end_row=total_row, end_column=col + 1)
        _apply_cell(ws, total_row, col, q.total, fmt=_MONEY_FORMAT,
                    fill=tfill, font=tfont, align="right")
        col += 2

    legend_row = total_row + 2
    ws.cell(row=legend_row, column=1, value="Leyenda:").font = Font(bold=True)
    lc = ws.cell(row=legend_row + 1, column=1, value="■ Mejor precio")
    lc.fill = _BEST_FILL
    lc.font = _BEST_FONT
    lc2 = ws.cell(row=legend_row + 2, column=1, value="■ Precio más alto")
    lc2.fill = _WORST_FILL

    _auto_width(ws)
    ws.freeze_panes = ws.cell(row=4, column=2)


def _write_summary_sheet(wb: openpyxl.Workbook, quotes: List[Quote]) -> None:
    ws = wb.create_sheet(title="Resumen", index=1)
    ws.merge_cells("A1:I1")
    title = ws.cell(row=1, column=1, value="RESUMEN DE COTIZACIONES — CONTRATACIÓN PÚBLICA")
    title.font = Font(bold=True, size=13, color="1F4E79")
    title.alignment = Alignment(horizontal="center")

    headers = ["Proveedor", "RUC", "N° Cotización", "Fecha", "Vigencia",
               "Subtotal", "IVA", "Total", "Origen"]
    for col, h in enumerate(headers, start=1):
        _apply_header(ws, 2, col, h)

    for r, q in enumerate(quotes, start=3):
        fill = _ALT_FILL if r % 2 == 0 else None
        _apply_cell(ws, r, 1, q.proveedor, fill=fill)
        _apply_cell(ws, r, 2, q.ruc, fill=fill)
        _apply_cell(ws, r, 3, q.numero_cotizacion, fill=fill)
        _apply_cell(ws, r, 4, q.fecha, fill=fill)
        _apply_cell(ws, r, 5, q.vigencia, fill=fill)
        _apply_cell(ws, r, 6, q.subtotal, fmt=_MONEY_FORMAT, fill=fill, align="right")
        _apply_cell(ws, r, 7, q.iva, fmt=_MONEY_FORMAT, fill=fill, align="right")

        best = find_best_price_per_item(quotes)
        is_best = best.get("__TOTAL__") == q.proveedor
        _apply_cell(ws, r, 8, q.total, fmt=_MONEY_FORMAT,
                    fill=_BEST_FILL if is_best else fill,
                    font=_BEST_FONT if is_best else None,
                    align="right")
        _apply_cell(ws, r, 9, q.origen, fill=fill)

    _auto_width(ws)


def export_to_excel(quotes: List[Quote]) -> bytes:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    _write_comparison_sheet(wb, quotes)
    _write_summary_sheet(wb, quotes)

    for q in quotes:
        _write_quote_sheet(wb, q)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
