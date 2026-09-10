"""Devis / factures / avoirs conformes aux usages français : numérotation chronologique
continue par type et par année, mentions obligatoires, TVA par ligne."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.config import get_settings
from app.models import Document, DocumentKind, DocumentSequence, DocumentStatus
from app.schemas import DocumentIn

PREFIX = {DocumentKind.quote: "D", DocumentKind.invoice: "F", DocumentKind.credit_note: "A"}


def next_number(db: DbSession, kind: DocumentKind, year: int) -> str:
    seq = db.scalars(
        select(DocumentSequence).where(DocumentSequence.kind == kind.value, DocumentSequence.year == year)
    ).first()
    if not seq:
        seq = DocumentSequence(kind=kind.value, year=year, last_value=0)
        db.add(seq)
        db.flush()
    seq.last_value += 1
    return f"{PREFIX[kind]}-{year}-{seq.last_value:05d}"


def compute_totals(lines: list[dict]) -> tuple[int, int, int]:
    ht = 0
    vat = 0
    for ln in lines:
        line_ht = round(ln["unit_price_cents"] * ln["quantity"])
        ht += line_ht
        vat += round(line_ht * ln["vat_rate"] / 100)
    return ht, vat, ht + vat


def create_document(db: DbSession, data: DocumentIn) -> Document:
    issued = data.issued_at or date.today()
    lines = [ln.model_dump() for ln in data.lines]
    ht, vat, ttc = compute_totals(lines)
    if data.kind == DocumentKind.credit_note:
        ht, vat, ttc = -abs(ht), -abs(vat), -abs(ttc)
    doc = Document(
        number=next_number(db, data.kind, issued.year),
        kind=data.kind,
        status=DocumentStatus.draft,
        customer_id=data.customer_id,
        customer_name=data.customer_name,
        customer_address=data.customer_address,
        customer_email=data.customer_email,
        sale_id=data.sale_id,
        parent_id=data.parent_id,
        issued_at=issued,
        due_at=data.due_at or (issued + timedelta(days=30) if data.kind != DocumentKind.quote else None),
        lines=lines,
        total_ht_cents=ht,
        total_vat_cents=vat,
        total_ttc_cents=ttc,
        notes=data.notes,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def convert_quote_to_invoice(db: DbSession, quote: Document) -> Document:
    if quote.kind != DocumentKind.quote:
        raise ValueError("Seul un devis peut être converti en facture")
    inv = Document(
        number=next_number(db, DocumentKind.invoice, date.today().year),
        kind=DocumentKind.invoice,
        status=DocumentStatus.sent,
        customer_id=quote.customer_id,
        customer_name=quote.customer_name,
        customer_address=quote.customer_address,
        customer_email=quote.customer_email,
        parent_id=quote.id,
        issued_at=date.today(),
        due_at=date.today() + timedelta(days=30),
        lines=quote.lines,
        total_ht_cents=quote.total_ht_cents,
        total_vat_cents=quote.total_vat_cents,
        total_ttc_cents=quote.total_ttc_cents,
        notes=quote.notes,
    )
    quote.status = DocumentStatus.accepted
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


def render_html(doc: Document) -> str:
    """Rendu HTML imprimable (→ PDF via le navigateur) avec les mentions légales françaises."""
    s = get_settings()
    kind_label = {
        DocumentKind.quote: "DEVIS",
        DocumentKind.invoice: "FACTURE",
        DocumentKind.credit_note: "AVOIR",
    }[doc.kind]
    rows = "".join(
        f"<tr><td>{ln['label']}</td><td class='r'>{ln['quantity']:g}</td>"
        f"<td class='r'>{ln['unit_price_cents'] / 100:.2f} €</td><td class='r'>{ln['vat_rate']:g} %</td>"
        f"<td class='r'>{ln['unit_price_cents'] * ln['quantity'] / 100:.2f} €</td></tr>"
        for ln in doc.lines
    )
    due = f"<p>Échéance : {doc.due_at:%d/%m/%Y}</p>" if doc.due_at else ""
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>{kind_label} {doc.number}</title>
<style>
body{{font-family:Helvetica,Arial,sans-serif;color:#111;margin:40px;font-size:13px}}
h1{{font-size:26px;letter-spacing:.08em;margin:0}}
.head{{display:flex;justify-content:space-between;margin-bottom:32px}}
table{{width:100%;border-collapse:collapse;margin-top:24px}}
th,td{{padding:8px;border-bottom:1px solid #ddd;text-align:left}} th{{background:#f3f4f6}}
.r{{text-align:right}} .totals{{margin-top:16px;width:320px;margin-left:auto}}
.totals td{{border:none;padding:4px 8px}} .grand{{font-weight:bold;font-size:15px}}
.legal{{margin-top:40px;font-size:11px;color:#555}}
</style></head><body>
<div class="head"><div><h1>{kind_label}</h1><p><strong>N° {doc.number}</strong><br>Date : {doc.issued_at:%d/%m/%Y}</p>{due}</div>
<div><strong>{s.company_name}</strong><br>{s.company_address}<br>SIRET {s.company_siret}<br>TVA {s.company_vat_number}</div></div>
<div><strong>Client</strong><br>{doc.customer_name}<br>{(doc.customer_address or '').replace(chr(10), '<br>')}<br>{doc.customer_email or ''}</div>
<table><thead><tr><th>Désignation</th><th class="r">Qté</th><th class="r">PU HT</th><th class="r">TVA</th><th class="r">Total HT</th></tr></thead>
<tbody>{rows}</tbody></table>
<table class="totals"><tr><td>Total HT</td><td class="r">{doc.total_ht_cents / 100:.2f} €</td></tr>
<tr><td>TVA</td><td class="r">{doc.total_vat_cents / 100:.2f} €</td></tr>
<tr class="grand"><td>Total TTC</td><td class="r">{doc.total_ttc_cents / 100:.2f} €</td></tr></table>
{f'<p>{doc.notes}</p>' if doc.notes else ''}
<div class="legal">
{"Devis valable 30 jours. Bon pour accord : date et signature du client." if doc.kind == DocumentKind.quote else
 "Paiement à réception. En cas de retard de paiement, pénalités au taux légal en vigueur et indemnité forfaitaire de recouvrement de 40 € (art. L441-10 C. com.). Pas d'escompte pour paiement anticipé."}
</div></body></html>"""
