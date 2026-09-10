import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { clsx } from "clsx";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, MapPin, Sparkles, Star, Users, Waves } from "lucide-react";
import { api, eur } from "@/lib/api";
import { fmtDate, fmtTime, cap } from "@/lib/format";
import type { Activity, AvailableSlot, CustomerInput, GroupPreference, Level, Offer, PassCard, PublicBookingOut, Recommendation, Voucher } from "@/lib/types";
import { GROUP_LABELS, LEVEL_LABELS } from "@/lib/types";
import { Badge, ErrorBox, Field, Loading, Spinner } from "@/components/ui";

type Formula = { kind: "single" } | { kind: "course"; offer: Offer } | { kind: "pass"; card: PassCard };

const STEPS = ["Activité", "Formule", "Votre profil", "Créneaux", "Paiement"];

export default function BookingPage() {
  const { activitySlug } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(activitySlug ? 1 : 0);
  const [formula, setFormula] = useState<Formula | null>(null);
  const [profile, setProfile] = useState<CustomerInput & { participants: number; group_preference: GroupPreference }>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    birth_date: "",
    height_cm: null,
    weight_kg: null,
    level: "beginner",
    board_type: "",
    practice_frequency: "",
    participants: 1,
    group_preference: "none",
    marketing_consent: false,
  });
  const [selected, setSelected] = useState<AvailableSlot[]>([]);
  const [result, setResult] = useState<PublicBookingOut | null>(null);

  const activities = useQuery({ queryKey: ["activities"], queryFn: () => api.get<Activity[]>("/api/activities") });
  const activity = activities.data?.find((a) => a.slug === activitySlug);

  useEffect(() => {
    if (!activitySlug) setStep(0);
  }, [activitySlug]);

  const needed = formula?.kind === "course" ? formula.offer.sessions_count : 1;

  if (result) return <Confirmation result={result} slots={selected} onRestart={() => navigate("/")} />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <ol className="flex items-center gap-2 mb-8 overflow-x-auto">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2 shrink-0">
            <span className={clsx("w-7 h-7 rounded-full grid place-items-center text-xs font-semibold", i < step ? "bg-emerald-500 text-white" : i === step ? "bg-ocean-600 text-white" : "bg-slate-200 text-slate-500")}>
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </span>
            <span className={clsx("text-sm", i === step ? "font-semibold text-ocean-950" : "text-slate-500")}>{s}</span>
            {i < STEPS.length - 1 && <span className="w-6 h-px bg-slate-200 mx-1" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <StepActivity
          activities={activities.data ?? []}
          loading={activities.isLoading}
          onPick={(a) => {
            navigate(`/reserver/${a.slug}`);
            setStep(1);
          }}
        />
      )}
      {step === 1 && activity && (
        <StepFormula
          activity={activity}
          onBack={() => navigate("/reserver")}
          onNext={(f) => {
            setFormula(f);
            setSelected([]);
            setStep(2);
          }}
        />
      )}
      {step === 2 && activity && (
        <StepProfile activity={activity} value={profile} onChange={setProfile} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}
      {step === 3 && activity && (
        <StepSlots
          activity={activity}
          level={profile.level}
          participants={profile.participants}
          age={profile.birth_date ? Math.floor((Date.now() - new Date(profile.birth_date).getTime()) / 31557600000) : undefined}
          needed={needed}
          selected={selected}
          onChange={setSelected}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && activity && formula && (
        <StepPayment
          activity={activity}
          formula={formula}
          profile={profile}
          onChange={setProfile}
          slots={selected}
          onBack={() => setStep(3)}
          onDone={setResult}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------- étape 1 */
function StepActivity({ activities, loading, onPick }: { activities: Activity[]; loading: boolean; onPick: (a: Activity) => void }) {
  if (loading) return <Loading />;
  return (
    <div>
      <h1 className="text-3xl font-semibold mb-2">Quelle activité ?</h1>
      <p className="text-slate-500 mb-8">Choisissez, le reste se fait en quelques clics.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {activities.map((a) => (
          <button key={a.id} onClick={() => onPick(a)} className="card p-6 text-left hover:-translate-y-0.5 hover:border-ocean-300 transition border-l-4" style={{ borderLeftColor: a.color }}>
            <h3 className="font-semibold text-lg">{a.name}</h3>
            <p className="text-sm text-slate-500 mt-1.5">{a.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------- étape 2 */
function StepFormula({ activity, onBack, onNext }: { activity: Activity; onBack: () => void; onNext: (f: Formula) => void }) {
  const offers = useQuery({ queryKey: ["offers", activity.id], queryFn: () => api.get<Offer[]>("/api/offers", { activity_id: activity.id }) });
  const [passCode, setPassCode] = useState("");
  const [passError, setPassError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const courses = offers.data?.filter((o) => o.kind === "course") ?? [];
  const single = offers.data?.find((o) => o.kind === "single");

  async function usePass() {
    setChecking(true);
    setPassError(null);
    try {
      const card = await api.get<PassCard>(`/api/public/pass-cards/${encodeURIComponent(passCode.trim())}`);
      if (card.activity_id !== activity.id) {
        setPassError(`Cette carte est valable pour « ${card.activity_name} », pas pour ${activity.name}.`);
        return;
      }
      onNext({ kind: "pass", card });
    } catch (e) {
      setPassError(e instanceof Error ? e.message : "Carte introuvable");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold mb-2">{activity.name} : une séance ou plusieurs ?</h1>
      <p className="text-slate-500 mb-8">Séance à l'unité, stage sur plusieurs jours, ou utilisez votre carte multi-séances.</p>
      {offers.isLoading ? (
        <Loading />
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          <button onClick={() => onNext({ kind: "single" })} className="card p-6 text-left hover:border-ocean-300 transition">
            <Badge tone="blue">Séance unique</Badge>
            <h3 className="font-semibold text-lg mt-3">{single?.name ?? `Séance de ${activity.name.toLowerCase()}`}</h3>
            <p className="text-sm text-slate-500 mt-1">{single?.duration_minutes ?? activity.default_duration_minutes} min, matériel inclus.</p>
            {single && <p className="text-2xl font-display font-semibold mt-4">{eur(single.price_cents)}</p>}
          </button>
          {courses.map((o) => (
            <button key={o.id} onClick={() => onNext({ kind: "course", offer: o })} className="card p-6 text-left hover:border-ocean-300 transition">
              <Badge tone="violet">Stage · {o.sessions_count} séances</Badge>
              <h3 className="font-semibold text-lg mt-3">{o.name}</h3>
              <p className="text-sm text-slate-500 mt-1">{o.description ?? `Choisissez vos ${o.sessions_count} créneaux.`}</p>
              <p className="text-2xl font-display font-semibold mt-4">
                {eur(o.price_cents)} <span className="text-sm text-slate-400 font-sans font-normal">soit {eur(o.price_cents / o.sessions_count)} / séance</span>
              </p>
            </button>
          ))}
          <div className="card p-6 md:col-span-3 flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Badge tone="amber">J'ai une carte multi-séances</Badge>
              <p className="text-sm text-slate-500 mt-2">Saisissez le code de votre carte (ex. CM-XXXXXXXX) : une séance sera décomptée par réservation.</p>
              <input className="input mt-3 uppercase" placeholder="CM-XXXXXXXX" value={passCode} onChange={(e) => setPassCode(e.target.value)} />
              {passError && <p className="text-sm text-rose-600 mt-2">{passError}</p>}
            </div>
            <button className="btn-secondary" disabled={!passCode || checking} onClick={usePass}>
              {checking ? <Spinner className="w-4 h-4" /> : null} Utiliser ma carte
            </button>
          </div>
        </div>
      )}
      <div className="mt-8">
        <button className="btn-ghost" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" /> Retour
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------- étape 3 */
type Profile = CustomerInput & { participants: number; group_preference: GroupPreference };

function StepProfile({ activity, value, onChange, onBack, onNext }: { activity: Activity; value: Profile; onChange: (p: Profile) => void; onBack: () => void; onNext: () => void }) {
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-8">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Parlez-nous de vous</h1>
        <p className="text-slate-500 mb-8">Ces informations nous permettent de préparer combinaison, planche et groupe adaptés, et de vous orienter vers le bon spot.</p>

        <section className="card p-6 mb-4">
          <h3 className="font-semibold mb-4">Niveau et expérience</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {(Object.keys(LEVEL_LABELS) as Level[]).map((lvl) => (
              <button key={lvl} onClick={() => set("level", lvl)} className={clsx("rounded-xl border px-4 py-3 text-left text-sm transition", value.level === lvl ? "border-ocean-500 bg-ocean-50 text-ocean-900 font-medium" : "border-slate-200 hover:border-slate-300")}>
                {LEVEL_LABELS[lvl]}
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <Field label="Fréquence de pratique">
              <select className="input" value={value.practice_frequency ?? ""} onChange={(e) => set("practice_frequency", e.target.value)}>
                <option value="">—</option>
                {["Jamais", "Vacances", "Quelques fois par an", "Chaque mois", "Chaque semaine"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
            {value.level !== "beginner" && (
              <Field label="Planche habituelle">
                <select className="input" value={value.board_type ?? ""} onChange={(e) => set("board_type", e.target.value)}>
                  <option value="">—</option>
                  {["Mousse", "Mini-malibu", "Longboard", "Fish", "Shortboard"].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </section>

        <section className="card p-6 mb-4">
          <h3 className="font-semibold mb-4">Gabarit</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Date de naissance">
              <input type="date" className="input" value={value.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} />
            </Field>
            <Field label="Taille (cm)">
              <input type="number" className="input" placeholder="175" value={value.height_cm ?? ""} onChange={(e) => set("height_cm", e.target.value ? Number(e.target.value) : null)} />
            </Field>
            <Field label="Poids (kg)">
              <input type="number" className="input" placeholder="70" value={value.weight_kg ?? ""} onChange={(e) => set("weight_kg", e.target.value ? Number(e.target.value) : null)} />
            </Field>
          </div>
        </section>

        <section className="card p-6">
          <h3 className="font-semibold mb-4">Votre groupe</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nombre de participants" hint="Même niveau pour tous, sinon réservez séparément.">
              <div className="flex items-center gap-3">
                <button className="btn-secondary !px-3" onClick={() => set("participants", Math.max(1, value.participants - 1))}>−</button>
                <span className="text-lg font-semibold w-8 text-center">{value.participants}</span>
                <button className="btn-secondary !px-3" onClick={() => set("participants", Math.min(8, value.participants + 1))}>+</button>
              </div>
            </Field>
            <Field label="Préférence de groupe">
              <select className="input" value={value.group_preference} onChange={(e) => set("group_preference", e.target.value as GroupPreference)}>
                {(Object.keys(GROUP_LABELS) as GroupPreference[]).map((g) => (
                  <option key={g} value={g}>
                    {GROUP_LABELS[g]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <div className="mt-8 flex justify-between">
          <button className="btn-ghost" onClick={onBack}>
            <ChevronLeft className="w-4 h-4" /> Retour
          </button>
          <button className="btn-primary" onClick={onNext}>
            Voir les créneaux <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <aside className="hidden lg:block">
        <div className="card p-5 sticky top-24">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Pourquoi ces questions ?</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>• Taille et poids → combinaison et volume de planche prêts à votre arrivée.</li>
            <li>• Niveau → créneaux compatibles uniquement, et spot recommandé.</li>
            <li>• Préférences → constitution des groupes par nos moniteurs.</li>
          </ul>
          {activity.requires_conditions && <p className="mt-4 text-xs text-slate-400">Les créneaux de {activity.name.toLowerCase()} affichés dépendent des marées et prévisions.</p>}
        </div>
      </aside>
    </div>
  );
}

/* ----------------------------------------------------------------------------- étape 4 */
function StepSlots({ activity, level, participants, age, needed, selected, onChange, onBack, onNext }: { activity: Activity; level: Level; participants: number; age?: number; needed: number; selected: AvailableSlot[]; onChange: (s: AvailableSlot[]) => void; onBack: () => void; onNext: () => void }) {
  const [siteFilter, setSiteFilter] = useState<number | null>(null);
  const reco = useQuery({
    queryKey: ["availability", activity.slug, level, participants, age],
    queryFn: () => api.get<Recommendation>("/api/public/availability", { activity: activity.slug, level, participants, age }),
  });
  const slots = useMemo(() => (reco.data?.slots ?? []).filter((s) => !siteFilter || s.site_id === siteFilter), [reco.data, siteFilter]);
  const byDay = useMemo(() => {
    const m = new Map<string, AvailableSlot[]>();
    for (const s of slots) {
      const k = s.start_at.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [slots]);

  const toggle = (s: AvailableSlot) => {
    if (selected.some((x) => x.session_id === s.session_id)) onChange(selected.filter((x) => x.session_id !== s.session_id));
    else if (needed === 1) onChange([s]);
    else if (selected.length < needed) onChange([...selected, s]);
  };

  return (
    <div>
      <h1 className="text-3xl font-semibold mb-2">{needed === 1 ? "Choisissez votre créneau" : `Choisissez vos ${needed} créneaux`}</h1>
      <p className="text-slate-500 mb-6">
        Uniquement les horaires programmés avec au moins {participants} place{participants > 1 && "s"} et adaptés à votre niveau. Les créneaux marqués ★ sont ceux que nous vous recommandons.
      </p>

      {reco.isLoading ? (
        <Loading label="Analyse des marées, de la météo et des disponibilités…" />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3 mb-6">
            {reco.data?.sites.map((s) => (
              <button key={s.site_id} onClick={() => setSiteFilter(siteFilter === s.site_id ? null : s.site_id)} className={clsx("card p-4 text-left transition", siteFilter === s.site_id && "ring-2 ring-ocean-400", s.recommended && "border-emerald-300 bg-emerald-50/40")}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-semibold">
                    <MapPin className="w-4 h-4 text-ocean-600" /> {s.site_name}
                  </span>
                  {s.recommended ? <Badge tone="green">Recommandé pour vous</Badge> : <Badge>Score {Math.round(s.score)}</Badge>}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">{s.reasons.join(" · ") || "Conditions à confirmer"}</p>
              </button>
            ))}
          </div>

          {byDay.length === 0 ? (
            <div className="card p-10 text-center text-slate-500">Aucun créneau disponible sur les 15 prochains jours pour ce profil. Essayez un autre niveau ou moins de participants.</div>
          ) : (
            <div className="space-y-5">
              {byDay.map(([day, list]) => (
                <div key={day}>
                  <h3 className="text-sm font-semibold text-slate-600 mb-2">{cap(fmtDate(list[0].start_at, "EEEE d MMMM"))}</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {list.map((s) => {
                      const on = selected.some((x) => x.session_id === s.session_id);
                      return (
                        <button key={s.session_id} onClick={() => toggle(s)} className={clsx("card p-4 text-left transition relative", on ? "ring-2 ring-ocean-500 border-ocean-300" : "hover:border-ocean-300")}>
                          {s.recommended && <Star className="absolute top-3 right-3 w-4 h-4 text-amber-500 fill-amber-400" />}
                          <p className="text-xl font-display font-semibold">
                            {fmtTime(s.start_at)} <span className="text-sm text-slate-400 font-sans font-normal">→ {fmtTime(s.end_at)}</span>
                          </p>
                          <p className="text-sm text-slate-600 mt-1 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" /> {s.site_name}
                          </p>
                          <div className="mt-3 flex items-center justify-between text-xs">
                            <span className={clsx("flex items-center gap-1", s.remaining <= 2 ? "text-amber-700 font-medium" : "text-slate-500")}>
                              <Users className="w-3.5 h-3.5" /> {s.remaining} place{s.remaining > 1 && "s"}
                            </span>
                            <span className="font-semibold text-ocean-900">{eur(s.price_cents)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-8 flex items-center justify-between sticky bottom-4">
        <button className="btn-ghost bg-white" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" /> Retour
        </button>
        <button className="btn-primary shadow-lg" disabled={selected.length !== needed} onClick={onNext}>
          {selected.length}/{needed} sélectionné{needed > 1 && "s"} · Continuer <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------- étape 5 */
function StepPayment({ activity, formula, profile, onChange, slots, onBack, onDone }: { activity: Activity; formula: Formula; profile: Profile; onChange: (p: Profile) => void; slots: AvailableSlot[]; onBack: () => void; onDone: (r: PublicBookingOut) => void }) {
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => onChange({ ...profile, [k]: v });
  const [voucherCode, setVoucherCode] = useState("");
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [voucherErr, setVoucherErr] = useState<string | null>(null);

  const subtotal = formula.kind === "course" ? formula.offer.price_cents * profile.participants : formula.kind === "pass" ? 0 : slots.reduce((a, s) => a + s.price_cents, 0) * profile.participants;
  const voucherUsed = voucher ? Math.min(voucher.remaining_cents, subtotal) : 0;
  const due = subtotal - voucherUsed;

  const mutation = useMutation({
    mutationFn: () => {
      const { participants, group_preference, ...customer } = profile;
      return api.post<PublicBookingOut>("/api/public/bookings", {
        customer: { ...customer, birth_date: customer.birth_date || null, phone: customer.phone || null, board_type: customer.board_type || null, practice_frequency: customer.practice_frequency || null },
        session_ids: slots.map((s) => s.session_id),
        participants,
        group_preference,
        offer_id: formula.kind === "course" ? formula.offer.id : null,
        voucher_code: voucher?.code ?? null,
        pass_card_code: formula.kind === "pass" ? formula.card.code : null,
        payment_method: "card_online",
        payment_token: due > 0 ? "tok_demo" : null,
      });
    },
    onSuccess: onDone,
  });

  async function applyVoucher() {
    setVoucherErr(null);
    try {
      setVoucher(await api.get<Voucher>(`/api/public/vouchers/${encodeURIComponent(voucherCode.trim())}`));
    } catch (e) {
      setVoucher(null);
      setVoucherErr(e instanceof Error ? e.message : "Bon introuvable");
    }
  }

  const valid = profile.first_name && profile.last_name && /.+@.+\..+/.test(profile.email);

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Vos coordonnées</h1>
        <p className="text-slate-500 mb-8">Confirmation immédiate par e-mail.</p>
        <section className="card p-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Prénom">
              <input className="input" value={profile.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </Field>
            <Field label="Nom">
              <input className="input" value={profile.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </Field>
            <Field label="E-mail">
              <input type="email" className="input" value={profile.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Téléphone">
              <input className="input" value={profile.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 mt-4 text-sm text-slate-600">
            <input type="checkbox" checked={!!profile.marketing_consent} onChange={(e) => set("marketing_consent", e.target.checked)} /> Je souhaite recevoir les actualités et offres de Riding Factory.
          </label>
        </section>

        {formula.kind !== "pass" && (
          <section className="card p-6 mt-4">
            <h3 className="font-semibold mb-3">Bon cadeau ?</h3>
            <div className="flex gap-2">
              <input className="input uppercase" placeholder="BC-XXXXXXXX" value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} />
              <button className="btn-secondary shrink-0" onClick={applyVoucher} disabled={!voucherCode}>
                Appliquer
              </button>
            </div>
            {voucherErr && <p className="text-sm text-rose-600 mt-2">{voucherErr}</p>}
            {voucher && (
              <p className="text-sm text-emerald-700 mt-2">
                Bon {voucher.code} appliqué : {eur(voucherUsed)} déduits{voucher.remaining_cents - voucherUsed > 0 && ` (reste ${eur(voucher.remaining_cents - voucherUsed)} sur le bon)`}.
              </p>
            )}
          </section>
        )}

        {due > 0 && (
          <section className="card p-6 mt-4">
            <h3 className="font-semibold mb-3">Paiement sécurisé</h3>
            <div className="grid sm:grid-cols-[1fr_120px_100px] gap-3">
              <input className="input" placeholder="Numéro de carte" defaultValue="4242 4242 4242 4242" />
              <input className="input" placeholder="MM/AA" defaultValue="12/28" />
              <input className="input" placeholder="CVC" defaultValue="123" />
            </div>
            <p className="text-xs text-slate-400 mt-2">Mode démonstration : le paiement est simulé. Branchez Stripe via `STRIPE_SECRET_KEY` pour encaisser réellement.</p>
          </section>
        )}

        <ErrorBox error={mutation.error} />

        <div className="mt-8 flex items-center justify-between">
          <button className="btn-ghost" onClick={onBack}>
            <ChevronLeft className="w-4 h-4" /> Retour
          </button>
          <button className="btn-primary !px-6" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Spinner className="w-4 h-4 text-white" />}
            {due > 0 ? `Payer ${eur(due, 2)} et confirmer` : "Confirmer la réservation"}
          </button>
        </div>
      </div>

      <aside>
        <div className="card p-5 sticky top-24">
          <h3 className="font-semibold flex items-center gap-2">
            <Waves className="w-4 h-4 text-ocean-600" /> Récapitulatif
          </h3>
          <p className="text-sm text-slate-600 mt-2">
            {activity.name} · {formula.kind === "course" ? formula.offer.name : formula.kind === "pass" ? `Carte ${formula.card.code}` : "Séance unique"}
          </p>
          <p className="text-sm text-slate-600">
            {profile.participants} participant{profile.participants > 1 && "s"} · {LEVEL_LABELS[profile.level]}
          </p>
          <ul className="mt-4 space-y-2">
            {slots.map((s) => (
              <li key={s.session_id} className="flex justify-between text-sm">
                <span>
                  {cap(fmtDate(s.start_at))} {fmtTime(s.start_at)} · {s.site_name}
                </span>
                <span className="text-slate-500">{formula.kind === "pass" ? "1 séance" : eur(s.price_cents)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 mt-4 pt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Sous-total</span>
              <span>{eur(subtotal, 2)}</span>
            </div>
            {voucherUsed > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Bon cadeau</span>
                <span>− {eur(voucherUsed, 2)}</span>
              </div>
            )}
            {formula.kind === "pass" && (
              <div className="flex justify-between text-amber-700">
                <span>Décompte carte</span>
                <span>
                  {slots.length * profile.participants} séance{slots.length * profile.participants > 1 && "s"} (reste {formula.card.remaining_sessions - slots.length * profile.participants})
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base pt-2">
              <span>À payer</span>
              <span>{eur(due, 2)}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ----------------------------------------------------------------------------- confirmation */
function Confirmation({ result, slots, onRestart }: { result: PublicBookingOut; slots: AvailableSlot[]; onRestart: () => void }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
      <h1 className="text-3xl font-semibold mt-6">C'est réservé !</h1>
      <p className="text-slate-600 mt-3">{result.message}</p>
      <div className="card p-6 mt-8 text-left">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Vos références</p>
        <p className="font-mono text-lg mt-1">{result.references.join(" · ")}</p>
        <ul className="mt-4 space-y-1.5 text-sm">
          {slots.map((s) => (
            <li key={s.session_id} className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-ocean-500" /> {cap(fmtDate(s.start_at, "EEEE d MMMM"))} à {fmtTime(s.start_at)} — {s.site_name}
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-500 mt-4">
          Montant réglé : <strong>{eur(result.paid_cents, 2)}</strong>
          {result.sale_reference && ` · ticket ${result.sale_reference}`}
        </p>
        <p className="text-sm text-slate-500 mt-3">Rendez-vous 20 minutes avant le début de la séance. Pensez au maillot et à la serviette : combinaison et planche sont préparées pour vous.</p>
      </div>
      <button className="btn-primary mt-8" onClick={onRestart}>
        Retour à l'accueil
      </button>
    </div>
  );
}
