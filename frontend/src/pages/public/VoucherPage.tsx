import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Gift, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";
import { api, eur } from "@/lib/api";
import type { Offer, Voucher } from "@/lib/types";
import { ErrorBox, Field, Spinner } from "@/components/ui";

const AMOUNTS = [3000, 4500, 9000, 12500, 19500];

export default function VoucherPage() {
  const offers = useQuery({ queryKey: ["offers-all"], queryFn: () => api.get<Offer[]>("/api/offers") });
  const [mode, setMode] = useState<"amount" | "offer">("offer");
  const [amount, setAmount] = useState(4500);
  const [offerId, setOfferId] = useState<number | null>(null);
  const [form, setForm] = useState({ buyer_name: "", buyer_email: "", recipient_name: "", recipient_email: "", message: "" });
  const [done, setDone] = useState<Voucher | null>(null);

  const selectedOffer = offers.data?.find((o) => o.id === offerId);
  const value = mode === "offer" ? selectedOffer?.price_cents ?? 0 : amount;

  const buy = useMutation({
    mutationFn: () =>
      api.post<Voucher>("/api/public/vouchers", {
        value_cents: mode === "amount" ? amount : null,
        offer_id: mode === "offer" ? offerId : null,
        buyer_name: form.buyer_name,
        buyer_email: form.buyer_email,
        recipient_name: form.recipient_name || null,
        recipient_email: form.recipient_email || null,
        message: form.message || null,
        payment_method: "card_online",
      }),
    onSuccess: setDone,
  });

  if (done)
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
        <h1 className="text-3xl font-semibold mt-6">Bon cadeau créé</h1>
        <div className="card p-8 mt-8 bg-gradient-to-br from-ocean-600 to-ocean-900 text-white border-0">
          <Gift className="w-8 h-8 mx-auto mb-3 text-sand-200" />
          <p className="text-sm text-ocean-100">Bon cadeau Riding Factory</p>
          <p className="text-4xl font-display font-semibold mt-1">{eur(done.value_cents)}</p>
          <p className="font-mono text-2xl mt-4 tracking-widest bg-white/10 rounded-lg py-2">{done.code}</p>
          <p className="text-xs text-ocean-200 mt-4">Valable jusqu'au {new Date(done.expires_at).toLocaleDateString("fr-FR")} · Utilisable à la réservation en ligne ou à l'accueil</p>
        </div>
        <p className="text-sm text-slate-500 mt-6">Le bon a été envoyé à {done.buyer_email}{done.recipient_email && ` et à ${done.recipient_email}`}.</p>
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 grid lg:grid-cols-[1fr_320px] gap-8">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Offrir un bon cadeau</h1>
        <p className="text-slate-500 mb-8">Le bénéficiaire choisit lui-même sa date et son créneau. Valable 12 mois, toute l'année.</p>

        <div className="flex gap-2 mb-4">
          <button className={clsx("btn", mode === "offer" ? "btn-primary" : "btn-secondary")} onClick={() => setMode("offer")}>
            Une prestation
          </button>
          <button className={clsx("btn", mode === "amount" ? "btn-primary" : "btn-secondary")} onClick={() => setMode("amount")}>
            Un montant libre
          </button>
        </div>

        {mode === "offer" ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {offers.data
              ?.filter((o) => o.kind !== "rental")
              .map((o) => (
                <button key={o.id} onClick={() => setOfferId(o.id)} className={clsx("card p-4 text-left transition", offerId === o.id ? "ring-2 ring-ocean-500" : "hover:border-ocean-300")}>
                  <p className="font-semibold">{o.name}</p>
                  <p className="text-lg font-display mt-1">{eur(o.price_cents)}</p>
                </button>
              ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {AMOUNTS.map((a) => (
              <button key={a} onClick={() => setAmount(a)} className={clsx("btn", amount === a ? "btn-primary" : "btn-secondary")}>
                {eur(a)}
              </button>
            ))}
            <input type="number" className="input !w-40" min={5} step={5} value={amount / 100} onChange={(e) => setAmount(Number(e.target.value) * 100)} />
          </div>
        )}

        <section className="card p-6 mt-6 grid sm:grid-cols-2 gap-4">
          <Field label="Votre nom">
            <input className="input" value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} />
          </Field>
          <Field label="Votre e-mail">
            <input type="email" className="input" value={form.buyer_email} onChange={(e) => setForm({ ...form, buyer_email: e.target.value })} />
          </Field>
          <Field label="Nom du bénéficiaire">
            <input className="input" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
          </Field>
          <Field label="E-mail du bénéficiaire (optionnel)">
            <input type="email" className="input" value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Message personnalisé">
              <textarea className="input" rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </Field>
          </div>
        </section>
        <ErrorBox error={buy.error} />
        <button className="btn-primary mt-6 !px-6" disabled={!value || !form.buyer_name || !form.buyer_email || buy.isPending} onClick={() => buy.mutate()}>
          {buy.isPending && <Spinner className="w-4 h-4 text-white" />} Payer {eur(value)} et recevoir le bon
        </button>
      </div>
      <aside>
        <div className="card p-6 sticky top-24 bg-gradient-to-br from-ocean-600 to-ocean-900 text-white border-0">
          <Gift className="w-8 h-8 text-sand-200" />
          <p className="text-sm text-ocean-100 mt-4">Aperçu</p>
          <p className="text-3xl font-display font-semibold">{value ? eur(value) : "—"}</p>
          <p className="text-sm mt-2 text-ocean-100">{mode === "offer" ? selectedOffer?.name ?? "Choisissez une prestation" : "Montant libre"}</p>
          <p className="text-sm mt-4 italic text-ocean-100">{form.message || "« Bon vent et belles vagues ! »"}</p>
        </div>
      </aside>
    </div>
  );
}
