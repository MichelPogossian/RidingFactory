import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Ticket } from "lucide-react";
import { clsx } from "clsx";
import { api, eur } from "@/lib/api";
import type { Activity, Offer, PassCard } from "@/lib/types";
import { ErrorBox, Field, Spinner } from "@/components/ui";

export default function PassCardPage() {
  const offers = useQuery({ queryKey: ["offers-pass"], queryFn: () => api.get<Offer[]>("/api/offers", { kind: "pass_card" }) });
  const activities = useQuery({ queryKey: ["activities"], queryFn: () => api.get<Activity[]>("/api/activities") });
  const [offerId, setOfferId] = useState<number | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [done, setDone] = useState<PassCard | null>(null);
  const [lookup, setLookup] = useState("");
  const [cards, setCards] = useState<PassCard[] | null>(null);

  const offer = offers.data?.find((o) => o.id === offerId);
  const buy = useMutation({
    mutationFn: () => api.post<PassCard>("/api/public/pass-cards", { customer: { ...form, level: "several" }, offer_id: offerId, payment_method: "card_online" }),
    onSuccess: setDone,
  });

  if (done)
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
        <h1 className="text-3xl font-semibold mt-6">Votre carte est prête</h1>
        <div className="card p-8 mt-8 bg-ocean-950 text-white border-0">
          <Ticket className="w-8 h-8 mx-auto mb-3 text-sand-300" />
          <p className="text-sm text-ocean-200">{done.activity_name}</p>
          <p className="text-3xl font-display font-semibold mt-1">{done.total_sessions} séances</p>
          <p className="font-mono text-2xl mt-4 tracking-widest bg-white/10 rounded-lg py-2">{done.code}</p>
          {done.expires_at && <p className="text-xs text-ocean-300 mt-4">Valable jusqu'au {new Date(done.expires_at).toLocaleDateString("fr-FR")}</p>}
        </div>
        <Link to="/reserver" className="btn-primary mt-8">
          Réserver ma première séance
        </Link>
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-semibold mb-2">Cartes multi-séances</h1>
      <p className="text-slate-500 mb-8">Achetez vos séances à l'avance, réservez-les une par une selon vos disponibilités. Une séance est décomptée à chaque réservation.</p>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {offers.data?.map((o) => {
          const act = activities.data?.find((a) => a.id === o.activity_id);
          return (
            <button key={o.id} onClick={() => setOfferId(o.id)} className={clsx("card p-6 text-left transition border-t-4", offerId === o.id ? "ring-2 ring-ocean-500" : "hover:border-ocean-300")} style={{ borderTopColor: act?.color }}>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">{act?.name}</p>
              <p className="text-2xl font-display font-semibold mt-1">{o.sessions_count} séances</p>
              <p className="text-lg mt-3">{eur(o.price_cents)}</p>
              <p className="text-xs text-slate-500">
                soit {eur(o.price_cents / o.sessions_count)} / séance {o.validity_days && `· valable ${Math.round(o.validity_days / 30)} mois`}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-6">
          <h3 className="font-semibold mb-4">Acheter {offer ? `la ${offer.name.toLowerCase()}` : "une carte"}</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Prénom">
              <input className="input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </Field>
            <Field label="Nom">
              <input className="input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Téléphone">
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <ErrorBox error={buy.error} />
          <button className="btn-primary mt-5" disabled={!offer || !form.first_name || !form.last_name || !form.email || buy.isPending} onClick={() => buy.mutate()}>
            {buy.isPending && <Spinner className="w-4 h-4 text-white" />} Payer {offer ? eur(offer.price_cents) : ""}
          </button>
        </section>

        <section className="card p-6">
          <h3 className="font-semibold mb-4">Consulter mes cartes</h3>
          <div className="flex gap-2">
            <input type="email" className="input" placeholder="Votre e-mail" value={lookup} onChange={(e) => setLookup(e.target.value)} />
            <button className="btn-secondary shrink-0" onClick={async () => setCards(await api.get<PassCard[]>(`/api/public/pass-cards/by-customer/${encodeURIComponent(lookup)}`))} disabled={!lookup}>
              Rechercher
            </button>
          </div>
          {cards && (
            <ul className="mt-4 space-y-2">
              {cards.length === 0 && <li className="text-sm text-slate-500">Aucune carte pour cet e-mail.</li>}
              {cards.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm">
                  <div>
                    <p className="font-mono font-semibold">{c.code}</p>
                    <p className="text-slate-500">{c.activity_name}</p>
                  </div>
                  <span className={clsx("font-semibold", c.remaining_sessions === 0 ? "text-slate-400" : "text-ocean-800")}>
                    {c.remaining_sessions}/{c.total_sessions} restantes
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
