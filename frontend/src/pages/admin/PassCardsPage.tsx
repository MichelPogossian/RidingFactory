import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api, eur } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { Customer, Offer, PassCard, PaymentMethod } from "@/lib/types";
import { PAYMENT_LABELS } from "@/lib/types";
import { Card, ErrorBox, Field, Loading, Modal, PageHeader, Progress } from "@/components/ui";

export default function PassCardsPage() {
  const [show, setShow] = useState(false);
  const list = useQuery({ queryKey: ["pass-cards"], queryFn: () => api.get<PassCard[]>("/api/pass-cards") });
  return (
    <div>
      <PageHeader
        title="Cartes multi-séances"
        subtitle="Crédit de séances par client : décompte automatique à chaque réservation, re-crédit en cas d'annulation."
        actions={
          <button className="btn-primary" onClick={() => setShow(true)}>
            <Plus className="w-4 h-4" /> Vendre une carte
          </button>
        }
      />
      <Card>
        {list.isLoading ? (
          <Loading />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Client</th>
                <th>Activité</th>
                <th>Séances restantes</th>
                <th className="text-right">Prix</th>
                <th>Achat</th>
                <th>Expire</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono font-medium">{c.code}</td>
                  <td>{c.customer_name}</td>
                  <td>{c.activity_name}</td>
                  <td className="min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold w-12">
                        {c.remaining_sessions}/{c.total_sessions}
                      </span>
                      <Progress value={c.total_sessions - c.remaining_sessions} max={c.total_sessions} />
                    </div>
                  </td>
                  <td className="text-right">{eur(c.price_cents)}</td>
                  <td>{fmtDate(c.purchased_at, "d MMM yyyy")}</td>
                  <td>{c.expires_at ? fmtDate(c.expires_at, "d MMM yyyy") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <SellModal open={show} onClose={() => setShow(false)} />
    </div>
  );
}

function SellModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const offers = useQuery({ queryKey: ["offers-pass"], queryFn: () => api.get<Offer[]>("/api/offers", { kind: "pass_card" }) });
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [offerId, setOfferId] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("card_terminal");
  const search = useQuery({ queryKey: ["customers", q], queryFn: () => api.get<Customer[]>("/api/customers", { q, limit: 8 }), enabled: q.length >= 2 });
  const sell = useMutation({
    mutationFn: () => api.post("/api/pass-cards", { customer_id: customerId, offer_id: offerId, payment_method: method }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pass-cards"] });
      onClose();
    },
  });
  const offer = offers.data?.find((o) => o.id === offerId);
  return (
    <Modal open={open} onClose={onClose} title="Vendre une carte multi-séances">
      <div className="space-y-3">
        <Field label="Client">
          <input className="input" placeholder="Rechercher un client…" value={q} onChange={(e) => { setQ(e.target.value); setCustomerId(null); }} />
          {q.length >= 2 && !customerId && (
            <ul className="mt-1 border border-slate-200 rounded-xl divide-y max-h-40 overflow-y-auto">
              {search.data?.map((c) => (
                <li key={c.id}>
                  <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={() => { setCustomerId(c.id); setQ(`${c.first_name} ${c.last_name}`); }}>
                    {c.first_name} {c.last_name} <span className="text-slate-400">· {c.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>
        <Field label="Carte">
          <select className="input" value={offerId} onChange={(e) => setOfferId(Number(e.target.value))}>
            <option value={0}>—</option>
            {offers.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — {eur(o.price_cents)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Paiement">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(["card_terminal", "cash", "check", "transfer"] as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <ErrorBox error={sell.error} />
        <button className="btn-primary w-full" disabled={!customerId || !offerId || sell.isPending} onClick={() => sell.mutate()}>
          Encaisser {offer ? eur(offer.price_cents) : ""} et créditer {offer?.sessions_count ?? ""} séances
        </button>
      </div>
    </Modal>
  );
}
