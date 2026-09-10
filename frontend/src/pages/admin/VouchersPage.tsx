import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api, eur } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { Offer, PaymentMethod, Voucher } from "@/lib/types";
import { PAYMENT_LABELS } from "@/lib/types";
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, Stat } from "@/components/ui";

const STATUS: Record<Voucher["status"], { label: string; tone: "green" | "slate" | "amber" | "red" }> = {
  active: { label: "Actif", tone: "green" },
  used: { label: "Utilisé", tone: "slate" },
  expired: { label: "Expiré", tone: "amber" },
  cancelled: { label: "Annulé", tone: "red" },
};

export default function VouchersPage() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const list = useQuery({ queryKey: ["vouchers"], queryFn: () => api.get<Voucher[]>("/api/vouchers") });
  const cancel = useMutation({ mutationFn: (id: number) => api.post(`/api/vouchers/${id}/cancel`), onSuccess: () => qc.invalidateQueries({ queryKey: ["vouchers"] }) });
  const stats = useMemo(() => {
    const v = list.data ?? [];
    return {
      sold: v.reduce((a, x) => a + x.value_cents, 0),
      outstanding: v.filter((x) => x.status === "active").reduce((a, x) => a + x.remaining_cents, 0),
      used: v.filter((x) => x.status === "used").length,
      active: v.filter((x) => x.status === "active").length,
    };
  }, [list.data]);

  return (
    <div>
      <PageHeader
        title="Bons cadeaux"
        subtitle="Suivi des bons vendus, utilisés, non utilisés, leur valeur et leur validité."
        actions={
          <button className="btn-primary" onClick={() => setShow(true)}>
            <Plus className="w-4 h-4" /> Vendre un bon
          </button>
        }
      />
      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        <Stat label="Valeur vendue" value={eur(stats.sold)} />
        <Stat label="Encours non utilisé" value={eur(stats.outstanding)} hint="Passif à honorer" tone="warn" />
        <Stat label="Bons actifs" value={String(stats.active)} />
        <Stat label="Bons utilisés" value={String(stats.used)} tone="good" />
      </div>
      <Card>
        {list.isLoading ? (
          <Loading />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Acheteur</th>
                <th>Bénéficiaire</th>
                <th className="text-right">Valeur</th>
                <th className="text-right">Restant</th>
                <th>Émis</th>
                <th>Expire</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((v) => (
                <tr key={v.id}>
                  <td className="font-mono font-medium">{v.code}</td>
                  <td>
                    {v.buyer_name}
                    <p className="text-xs text-slate-400">{v.buyer_email}</p>
                  </td>
                  <td>{v.recipient_name ?? "—"}</td>
                  <td className="text-right">{eur(v.value_cents)}</td>
                  <td className="text-right font-medium">{eur(v.remaining_cents)}</td>
                  <td>{fmtDate(v.issued_at, "d MMM yyyy")}</td>
                  <td>{fmtDate(v.expires_at, "d MMM yyyy")}</td>
                  <td>
                    <Badge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</Badge>
                  </td>
                  <td>
                    {v.status === "active" && (
                      <button className="text-xs text-rose-600 hover:underline" onClick={() => confirm("Annuler ce bon ?") && cancel.mutate(v.id)}>
                        Annuler
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <SellVoucherModal open={show} onClose={() => setShow(false)} />
    </div>
  );
}

function SellVoucherModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const offers = useQuery({ queryKey: ["offers-all"], queryFn: () => api.get<Offer[]>("/api/offers") });
  const [form, setForm] = useState({ value: 45, offer_id: 0, buyer_name: "", buyer_email: "", recipient_name: "", message: "", payment_method: "card_terminal" as PaymentMethod });
  const sell = useMutation({
    mutationFn: () =>
      api.post<Voucher>("/api/vouchers", {
        value_cents: form.offer_id ? null : Math.round(form.value * 100),
        offer_id: form.offer_id || null,
        buyer_name: form.buyer_name,
        buyer_email: form.buyer_email,
        recipient_name: form.recipient_name || null,
        message: form.message || null,
        payment_method: form.payment_method,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      onClose();
    },
  });
  return (
    <Modal open={open} onClose={onClose} title="Vendre un bon cadeau à l'accueil">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Prestation (ou montant libre)">
          <select className="input" value={form.offer_id} onChange={(e) => setForm({ ...form, offer_id: Number(e.target.value) })}>
            <option value={0}>Montant libre</option>
            {offers.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — {eur(o.price_cents)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Montant (€)">
          <input type="number" className="input" disabled={!!form.offer_id} value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
        </Field>
        <Field label="Acheteur">
          <input className="input" value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} />
        </Field>
        <Field label="E-mail acheteur">
          <input className="input" value={form.buyer_email} onChange={(e) => setForm({ ...form, buyer_email: e.target.value })} />
        </Field>
        <Field label="Bénéficiaire">
          <input className="input" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
        </Field>
        <Field label="Paiement">
          <select className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}>
            {(["card_terminal", "cash", "check", "transfer"] as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorBox error={sell.error} />
      <button className="btn-primary mt-4" disabled={!form.buyer_name || !form.buyer_email || sell.isPending} onClick={() => sell.mutate()}>
        Encaisser et générer le code
      </button>
    </Modal>
  );
}
