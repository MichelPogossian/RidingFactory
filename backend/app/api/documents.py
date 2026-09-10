"""Devis, factures, avoirs + export comptable."""

import csv
import io
from datetime import date, datetime, UTC

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, Db, ManagerUser
from app.models import Document, DocumentKind, DocumentStatus, Sale, SaleLine
from app.schemas import DocumentIn, DocumentOut
from app.services import billing

router = APIRouter(prefix="/api", tags=["facturation"])


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(db: Db, _: CurrentUser, kind: DocumentKind | None = None, status: DocumentStatus | None = None, limit: int = 200):
    stmt = select(Document).order_by(Document.issued_at.desc(), Document.id.desc()).limit(limit)
    if kind:
        stmt = stmt.where(Document.kind == kind)
    if status:
        stmt = stmt.where(Document.status == status)
    return list(db.scalars(stmt))


@router.post("/documents", response_model=DocumentOut, status_code=201)
def create_document(data: DocumentIn, db: Db, _: CurrentUser):
    return billing.create_document(db, data)


@router.post("/documents/from-sale/{sale_id}", response_model=DocumentOut, status_code=201)
def invoice_from_sale(sale_id: int, db: Db, _: CurrentUser, customer_name: str | None = None, customer_email: str | None = None):
    """Génère la facture d'un ticket de caisse existant."""
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(404, "Vente introuvable")
    name = customer_name
    email = customer_email
    if sale.customer_id and not name:
        from app.models import Customer

        c = db.get(Customer, sale.customer_id)
        if c:
            name, email = f"{c.first_name} {c.last_name}", c.email
    lines = [
        {"label": ln.label, "quantity": ln.quantity, "unit_price_cents": round(ln.unit_price_cents / (1 + ln.vat_rate / 100)), "vat_rate": ln.vat_rate}
        for ln in sale.lines
    ]
    doc = billing.create_document(
        db,
        DocumentIn(kind=DocumentKind.invoice, customer_id=sale.customer_id, customer_name=name or "Client comptoir", customer_email=email, sale_id=sale.id, lines=lines),
    )
    doc.status = DocumentStatus.paid
    db.commit()
    db.refresh(doc)
    return doc


@router.patch("/documents/{doc_id}/status", response_model=DocumentOut)
def set_status(doc_id: int, status: DocumentStatus, db: Db, _: CurrentUser):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document introuvable")
    if doc.kind == DocumentKind.invoice and status == DocumentStatus.draft and doc.status != DocumentStatus.draft:
        raise HTTPException(400, "Une facture émise ne peut pas revenir en brouillon (utiliser un avoir)")
    doc.status = status
    db.commit()
    db.refresh(doc)
    return doc


@router.post("/documents/{doc_id}/convert", response_model=DocumentOut, status_code=201)
def convert_quote(doc_id: int, db: Db, _: CurrentUser):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document introuvable")
    try:
        return billing.convert_quote_to_invoice(db, doc)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/documents/{doc_id}/credit-note", response_model=DocumentOut, status_code=201)
def credit_note(doc_id: int, db: Db, _: ManagerUser):
    inv = db.get(Document, doc_id)
    if not inv or inv.kind != DocumentKind.invoice:
        raise HTTPException(404, "Facture introuvable")
    return billing.create_document(
        db,
        DocumentIn(
            kind=DocumentKind.credit_note, customer_id=inv.customer_id, customer_name=inv.customer_name,
            customer_address=inv.customer_address, customer_email=inv.customer_email, parent_id=inv.id,
            lines=inv.lines, notes=f"Avoir sur facture {inv.number}",
        ),
    )


@router.get("/documents/{doc_id}/html", response_class=HTMLResponse)
def document_html(doc_id: int, db: Db, _: CurrentUser):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document introuvable")
    return billing.render_html(doc)


@router.get("/accounting/export")
def accounting_export(db: Db, _: ManagerUser, date_from: date, date_to: date):
    """Export CSV des ventes (journal des ventes, une ligne par ligne de vente, TVA ventilée)
    pour import dans le logiciel comptable."""
    stmt = (
        select(Sale, SaleLine)
        .join(SaleLine, SaleLine.sale_id == Sale.id)
        .where(Sale.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC), Sale.created_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=UTC))
        .order_by(Sale.created_at)
    )
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["date", "reference", "canal", "moyen_paiement", "statut", "site_id", "activite_id", "categorie", "libelle", "quantite", "total_ttc", "taux_tva", "montant_tva", "total_ht"])
    for sale, ln in db.execute(stmt):
        ttc = ln.total_cents / 100
        ht = ttc / (1 + ln.vat_rate / 100)
        w.writerow([
            sale.created_at.strftime("%d/%m/%Y"), sale.reference, sale.channel, sale.payment_method.value, sale.status,
            ln.site_id or "", ln.activity_id or "", ln.category or "", ln.label, ln.quantity,
            f"{ttc:.2f}".replace(".", ","), f"{ln.vat_rate:g}", f"{ttc - ht:.2f}".replace(".", ","), f"{ht:.2f}".replace(".", ","),
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue().encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="ventes_{date_from}_{date_to}.csv"'},
    )
