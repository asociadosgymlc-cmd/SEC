from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import List, Optional
import pandas as pd


@dataclass
class LineItem:
    codigo_cpc: str = ""
    descripcion: str = ""
    unidad: str = ""
    cantidad: float = 0.0
    precio_unitario: float = 0.0
    precio_total: float = 0.0

    def calcular_total(self) -> float:
        self.precio_total = round(self.cantidad * self.precio_unitario, 2)
        return self.precio_total

    def to_dict(self) -> dict:
        return {
            "Código CPC/UNSPSC": self.codigo_cpc,
            "Descripción": self.descripcion,
            "Unidad": self.unidad,
            "Cantidad": self.cantidad,
            "Precio Unitario": self.precio_unitario,
            "Precio Total": self.precio_total,
        }


@dataclass
class Quote:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    proveedor: str = ""
    ruc: str = ""
    direccion: str = ""
    telefono: str = ""
    numero_cotizacion: str = ""
    fecha: str = ""
    vigencia: str = ""
    items: List[LineItem] = field(default_factory=list)
    subtotal: float = 0.0
    iva: float = 0.0
    total: float = 0.0
    iva_porcentaje: float = 12.0
    observaciones: str = ""
    origen: str = "manual"

    def calcular_totales(self) -> None:
        self.subtotal = round(sum(item.precio_total for item in self.items), 2)
        self.iva = round(self.subtotal * self.iva_porcentaje / 100, 2)
        self.total = round(self.subtotal + self.iva, 2)

    def to_summary_dict(self) -> dict:
        return {
            "ID": self.id,
            "Proveedor": self.proveedor,
            "RUC": self.ruc,
            "N° Cotización": self.numero_cotizacion,
            "Fecha": self.fecha,
            "Vigencia": self.vigencia,
            "Subtotal": self.subtotal,
            f"IVA ({self.iva_porcentaje}%)": self.iva,
            "Total": self.total,
            "Origen": self.origen,
        }

    def items_to_dataframe(self) -> pd.DataFrame:
        if not self.items:
            return pd.DataFrame(columns=[
                "Código CPC/UNSPSC", "Descripción", "Unidad",
                "Cantidad", "Precio Unitario", "Precio Total"
            ])
        return pd.DataFrame([item.to_dict() for item in self.items])


def build_comparison_dataframe(quotes: List[Quote]) -> pd.DataFrame:
    if not quotes:
        return pd.DataFrame()

    all_descriptions = []
    for q in quotes:
        for item in q.items:
            desc = item.descripcion.strip()
            if desc and desc not in all_descriptions:
                all_descriptions.append(desc)

    rows = []
    for desc in all_descriptions:
        row: dict = {"Descripción": desc}
        for q in quotes:
            matched = next(
                (it for it in q.items if it.descripcion.strip() == desc), None
            )
            if matched:
                row[f"{q.proveedor}\nP.Unit."] = matched.precio_unitario
                row[f"{q.proveedor}\nP.Total"] = matched.precio_total
            else:
                row[f"{q.proveedor}\nP.Unit."] = None
                row[f"{q.proveedor}\nP.Total"] = None
        rows.append(row)

    totals_row: dict = {"Descripción": "TOTAL COTIZACIÓN"}
    for q in quotes:
        totals_row[f"{q.proveedor}\nP.Unit."] = None
        totals_row[f"{q.proveedor}\nP.Total"] = q.total

    rows.append(totals_row)
    return pd.DataFrame(rows)


def find_best_price_per_item(quotes: List[Quote]) -> dict:
    best: dict = {}

    all_descriptions = []
    for q in quotes:
        for item in q.items:
            desc = item.descripcion.strip()
            if desc and desc not in all_descriptions:
                all_descriptions.append(desc)

    for desc in all_descriptions:
        min_price: Optional[float] = None
        best_provider: Optional[str] = None
        for q in quotes:
            matched = next(
                (it for it in q.items if it.descripcion.strip() == desc), None
            )
            if matched and matched.precio_unitario > 0:
                if min_price is None or matched.precio_unitario < min_price:
                    min_price = matched.precio_unitario
                    best_provider = q.proveedor
        if best_provider:
            best[desc] = best_provider

    totals = {q.proveedor: q.total for q in quotes if q.total > 0}
    if totals:
        best_total_provider = min(totals, key=lambda k: totals[k])
        best["__TOTAL__"] = best_total_provider

    return best


def get_summary_dataframe(quotes: List[Quote]) -> pd.DataFrame:
    if not quotes:
        return pd.DataFrame()
    return pd.DataFrame([q.to_summary_dict() for q in quotes])


def validate_quote(quote: Quote) -> List[str]:
    errors = []
    if not quote.proveedor.strip():
        errors.append("El nombre del proveedor es obligatorio.")
    if not quote.ruc.strip():
        errors.append("El RUC del proveedor es obligatorio.")
    elif len(quote.ruc.replace("-", "").replace(" ", "")) not in (10, 13):
        errors.append("El RUC debe tener 10 o 13 dígitos.")
    if not quote.items:
        errors.append("La cotización debe tener al menos un ítem.")
    for i, item in enumerate(quote.items, 1):
        if not item.descripcion.strip():
            errors.append(f"El ítem {i} no tiene descripción.")
        if item.cantidad <= 0:
            errors.append(f"El ítem {i} tiene cantidad inválida.")
        if item.precio_unitario <= 0:
            errors.append(f"El ítem {i} tiene precio unitario inválido.")
    return errors
