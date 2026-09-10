import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Plus, Printer, Trash2 } from "lucide-react";
import { api, eur } from "@/lib/api";
import { fmtDate, isoDay } from "@/lib/format";
import type { Doc, DocumentKind, DocumentLine, DocumentStatus, Sale } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader } from "@/components/ui";

const KIND: Record<DocumentKind, string> = { quote: "Devis", invoice: "Facture", credit_note: "Avoir" };
const STATUS: Record<DocumentStatus, { label: string; tone: "slate" | "blue" | "green" | "red" | "amber" }> = {
  draft: { label: "Brouillon", tone: "slate" },
  sent: { label: "Envoyé", tone: "blue" },
  accepted: { label: "Accepté", tone: "green" },
  paid: { label: "Payé", tone: "green" },
  cancelled: { label: "Annulé", tone: "red" },
};

export default function DocumentsPage() {
  const qc = useQueryClient();
  const token = useAuth((s) => s.token);
  const [kind, setKind] = useState<DocumentKind | "">("");
  const [creating, setCreating] = useState(false);
  const [fromSale, setFromSale] = useState(false);
  const [exportFrom, setExportFrom] = useState(isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [exportTo, setExportTo] = useState(isoDay(new Date()));
  const list = useQuery({ queryKey: ["documents", kind], queryFn: () => api.get<Doc[]>("/api/documents", { kind: kind || undefined }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["documents"] });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: number; status: DocumentStatus }) => api.patch(`/api/documents/${id}/status`, undefined, { status }), onSuccess: invalidate });
  const convert = useMutation({ mutationFn: (id: number) => api.post(`/api/documents/${id}/convert`), onSuccess: invalidate });
  const credit = useMutation({ mutationFn: (id: number) => api.post(`/api/documents/${id}/credit-note`), onSuccess: invalidate });

  async function openHtml(id: number) {
    const res = await fetch(`/api/documents/${id}/html`, { headers: { Authorization: `Bearer ${token}` } });
    const html = await res.text();
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }
  async function exportCsv() {
    const res = await fetch(`/api/accounting/export?date_from=${exportFrom}&date_to=${exportTo}`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ventes_${exportFrom}_${exportTo}.csv`;
    a.click();
  }

  return (
    <div>
      <PageHeader
        title="Devis, factures & avoirs"
        subtitle="Numérotation chronologique continue par année, mentions légales françaises, export comptable."
        actions={
          <>
            <select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind | "")}>
              <option value="">Tous</option>
              {(Object.keys(KIND) as DocumentKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND[k]}
                </option>
              ))}
            </select>
            <button className="btn-secondary" onClick={() => setFromSale(true)}>
              <FileText className="w-4 h-4" /> Facture depuis un ticket
            </button>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" /> Nouveau document
            </button>
          </>
        }
      />
      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <Card>
          {list.isLoading ? (
            <Loading />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Type</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th className="text-right">HT</th>
                  <th className="text-right">TVA</th>
                  <th className="text-right">TTC</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.data?.map((d) => (
                  <tr key={d.id}>
                    <td className="font-mono font-medium">{d.number}</td>
                    <td>
                      <Badge tone={d.kind === "invoice" ? "blue" : d.kind === "quote" ? "amber" : "red"}>{KIND[d.kind]}</Badge>
                    </td>
                    <td>{d.customer_name}</td>
                    <td>{fmtDate(d.issued_at, "d MMM yyyy")}</td>
                    <td className="text-right">{eur(d.total_ht_cents, 2)}</td>
                    <td className="text-right text-slate-500">{eur(d.total_vat_cents, 2)}</td>
                    <td className="text-right font-medium">{eur(d.total_ttc_cents, 2)}</td>
                    <td>
                      <select className="input !py-1 !px-2 text-xs !w-auto" value={d.status} onChange={(e) => setStatus.mutate({ id: d.id, status: e.target.value as DocumentStatus })}>
                        {(Object.keys(STATUS) as DocumentStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS[s].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap">
                      <button className="btn-ghost !p-1.5" title="Imprimer / PDF" onClick={() => openHtml(d.id)}>
                        <Printer className="w-4 h-4" />
                      </button>
                      {d.kind === "quote" && d.status !== "accepted" && (
                        <button className="text-xs text-ocean-700 hover:underline ml-1" onClick={() => convert.mutate(d.id)}>
                          → Facture
                        </button>
                      )}
                      {d.kind === "invoice" && (
                        <button className="btn-ghost !p-1.5 text-rose-600" title="Créer un avoir" onClick={() => confirm("Créer un avoir annulant cette facture ?") && credit.mutate(d.id)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Export comptable">
          <p className="text-sm text-slate-500 mb-3">Journal des ventes (CSV, séparateur « ; », TVA ventilée par ligne) pour import dans votre logiciel comptable.</p>
          <div className="space-y-3">
            <Field label="Du">
              <input type="date" className="input" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
            </Field>
            <Field label="Au">
              <input type="date" className="input" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
            </Field>
            <button className="btn-secondary w-full" onClick={exportCsv}>
              <Download className="w-4 h-4" /> Télécharger le CSV
            </button>
          </div>
        </Card>
      </div>
      <NewDocumentModal open={creating} onClose={() => setCreating(false)} />
      <FromSaleModal open={fromSale} onClose={() => setFromSale(false)} />
    </div>
  );
}

function NewDocumentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ kind: "quote" as DocumentKind, customer_name: "", customer_address: "", customer_email: "", notes: "" });
  const [lines, setLines] = useState<DocumentLine[]>([{ label: "", quantity: 1, unit_price_cents: 0, vat_rate: 20 }]);
  const create = useMutation({
    mutationFn: () => api.post("/api/documents", { ...form, lines }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      onClose();
    },
  });
  const ht = lines.reduce((a, l) => a + l.unit_price_cents * l.quantity, 0);
  const vat = lines.reduce((a, l) => a + (l.unit_price_cents * l.quantity * l.vat_rate) / 100, 0);
  return (
    <Modal open={open} onClose={onClose} title="Nouveau document" wide>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Field label="Type">
          <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as DocumentKind })}>
            <option value="quote">Devis</option>
            <option value="invoice">Facture</option>
          </select>
        </Field>
        <Field label="Client">
          <input className="input" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
        </Field>
        <Field label="E-mail">
          <input className="input" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Adresse">
            <textarea className="input" rows={2} value={form.customer_address} onChange={(e) => setForm({ ...form, customer_address: e.target.value })} />
          </Field>
        </div>
      </div>
      <table className="table mb-3">
        <thead>
          <tr>
            <th>Désignation</th>
            <th className="w-20">Qté</th>
            <th className="w-32">PU HT (€)</th>
            <th className="w-24">TVA</th>
            <th className="text-right w-28">Total HT</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>
                <input className="input !py-1.5" value={l.label} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              </td>
              <td>
                <input type="number" className="input !py-1.5" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} />
              </td>
              <td>
                <input type="number" step="0.01" className="input !py-1.5" value={l.unit_price_cents / 100} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit_price_cents: Math.round(Number(e.target.value) * 100) } : x)))} />
              </td>
              <td>
                <select className="input !py-1.5" value={l.vat_rate} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, vat_rate: Number(e.target.value) } : x)))}>
                  {[20, 10, 5.5, 0].map((r) => (
                    <option key={r} value={r}>
                      {r} %
                    </option>
                  ))}
                </select>
              </td>
              <td className="text-right">{eur(l.unit_price_cents * l.quantity, 2)}</td>
              <td>
                <button className="btn-ghost !p-1 text-rose-600" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn-secondary !py-1.5" onClick={() => setLines([...lines, { label: "", quantity: 1, unit_price_cents: 0, vat_rate: 20 }])}>
        <Plus className="w-4 h-4" /> Ligne
      </button>
      <div className="flex justify-end gap-6 mt-4 text-sm">
        <span>HT {eur(ht, 2)}</span>
        <span>TVA {eur(vat, 2)}</span>
        <strong>TTC {eur(ht + vat, 2)}</strong>
      </div>
      <Field label="Notes">
        <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>
      <ErrorBox error={create.error} />
      <button className="btn-primary mt-4" disabled={!form.customer_name || lines.some((l) => !l.label) || create.isPending} onClick={() => create.mutate()}>
        Créer le {KIND[form.kind].toLowerCase()}
      </button>
    </Modal>
  );
}

function FromSaleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const sales = useQuery({ queryKey: ["sales-recent"], queryFn: () => api.get<Sale[]>("/api/sales", { limit: 50 }), enabled: open });
  const [saleId, setSaleId] = useState(0);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api.post(`/api/documents/from-sale/${saleId}`, undefined, { customer_name: name || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      onClose();
    },
  });
  return (
    <Modal open={open} onClose={onClose} title="Facture depuis un ticket de caisse">
      <div className="space-y-3">
        <Field label="Ticket">
          <select className="input" value={saleId} onChange={(e) => setSaleId(Number(e.target.value))}>
            <option value={0}>—</option>
            {sales.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.reference} — {eur(s.total_cents, 2)} — {s.lines.map((l) => l.label).join(", ").slice(0, 60)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nom du client (si différent)">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <ErrorBox error={create.error} />
        <button className="btn-primary w-full" disabled={!saleId || create.isPending} onClick={() => create.mutate()}>
          Générer la facture
        </button>
      </div>
    </Modal>
  );
}
