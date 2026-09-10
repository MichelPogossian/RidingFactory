import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, CloudSun, Plus, RefreshCw, Users, Wand2, XCircle } from "lucide-react";
import { api, eur } from "@/lib/api";
import { isoDay, cap, fmtDateTime } from "@/lib/format";
import type { Activity, Customer, GroupProposal, Instructor, Level, PlanningCell, Roster, SessionOut } from "@/lib/types";
import { GROUP_LABELS, LEVEL_SHORT, PAYMENT_LABELS, type PaymentMethod } from "@/lib/types";
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, Progress, Spinner } from "@/components/ui";
import { SiteSelect, useSites } from "@/components/SiteSelect";

export default function PlanningPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [siteId, setSiteId] = useState<number | null>(null);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);

  const activities = useQuery({ queryKey: ["activities"], queryFn: () => api.get<Activity[]>("/api/activities") });
  const week = useQuery({
    queryKey: ["planning-week", isoDay(weekStart), siteId, activityId],
    queryFn: () => api.get<PlanningCell[]>("/api/planning/week", { start: isoDay(weekStart), site_id: siteId, activity_id: activityId }),
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const byDay = useMemo(() => {
    const m: Record<string, PlanningCell[]> = {};
    for (const c of week.data ?? []) (m[c.day] ??= []).push(c);
    return m;
  }, [week.data]);
  const totals = useMemo(() => {
    const cells = week.data ?? [];
    const cap = cells.reduce((a, c) => a + c.capacity, 0);
    const booked = cells.reduce((a, c) => a + c.booked, 0);
    return { sessions: cells.length, cap, booked, remaining: cap - booked };
  }, [week.data]);

  return (
    <div>
      <PageHeader
        title="Planning de la semaine"
        subtitle="Places restantes par jour, horaire, école et activité — pour répondre en un coup d'œil à une demande de dernière minute."
        actions={
          <>
            <SiteSelect value={siteId} onChange={setSiteId} />
            <select className="input !w-auto" value={activityId ?? ""} onChange={(e) => setActivityId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Toutes les activités</option>
              {activities.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button className="btn-primary" onClick={() => setShowGenerate(true)}>
              <Wand2 className="w-4 h-4" /> Générer des créneaux
            </button>
          </>
        }
      />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button className="btn-secondary !px-2.5" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button className="btn-secondary" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Aujourd'hui
          </button>
          <button className="btn-secondary !px-2.5" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="ml-2 font-display font-semibold text-lg">
            Semaine du {format(weekStart, "d MMMM", { locale: fr })} au {format(addDays(weekStart, 6), "d MMMM yyyy", { locale: fr })}
          </span>
        </div>
        <div className="text-sm text-slate-600 flex gap-4">
          <span>
            <strong>{totals.sessions}</strong> créneaux
          </span>
          <span>
            <strong>{totals.remaining}</strong> places restantes / {totals.cap}
          </span>
        </div>
      </div>

      {week.isLoading ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {days.map((d) => {
            const key = isoDay(d);
            const cells = (byDay[key] ?? []).sort((a, b) => a.time.localeCompare(b.time) || a.site.localeCompare(b.site));
            const isToday = key === isoDay(new Date());
            return (
              <div key={key} className={clsx("card p-2 min-h-[140px]", isToday && "ring-2 ring-ocean-300")}>
                <p className={clsx("text-xs font-semibold uppercase tracking-wide px-1 mb-2", isToday ? "text-ocean-700" : "text-slate-500")}>
                  {cap(format(d, "EEE d", { locale: fr }))}
                </p>
                <div className="space-y-1.5">
                  {cells.length === 0 && <p className="text-xs text-slate-400 px-1">—</p>}
                  {cells.map((c) => (
                    <button key={c.session_id} onClick={() => setSelected(c.session_id)} className={clsx("w-full text-left rounded-lg border px-2 py-1.5 text-xs transition hover:shadow", c.status === "cancelled" && "opacity-40 line-through", c.remaining === 0 ? "border-rose-200 bg-rose-50" : c.remaining <= 2 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white hover:border-ocean-300")} style={{ borderLeftWidth: 3, borderLeftColor: c.color }}>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">{c.time}</span>
                        <span className={clsx("font-semibold", c.remaining === 0 ? "text-rose-700" : c.remaining <= 2 ? "text-amber-700" : "text-emerald-700")}>{c.remaining} pl.</span>
                      </div>
                      <p className="text-slate-600 truncate">
                        {c.site} · {c.activity}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Progress value={c.booked} max={c.capacity} className="flex-1" />
                        {c.conditions_ok === false && <CloudSun className="w-3 h-3 text-rose-500" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card className="mt-6" title="Vue tableau">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Jour</th>
                <th>Horaire</th>
                <th>Site</th>
                <th>Activité</th>
                <th>Niveau</th>
                <th>Moniteur</th>
                <th>Conditions</th>
                <th className="text-right">Réservés</th>
                <th className="text-right">Places dispo</th>
              </tr>
            </thead>
            <tbody>
              {(week.data ?? [])
                .slice()
                .sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time))
                .map((c) => (
                  <tr key={c.session_id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(c.session_id)}>
                    <td>{cap(format(new Date(c.day), "EEEE d", { locale: fr }))}</td>
                    <td className="font-medium">{c.time}</td>
                    <td>{c.site}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: c.color }} /> {c.activity}
                      </span>
                    </td>
                    <td className="text-slate-500">
                      {LEVEL_SHORT[c.level_min]} → {LEVEL_SHORT[c.level_max]}
                    </td>
                    <td className="text-slate-500">{c.instructor ?? "—"}</td>
                    <td>{c.conditions_ok === false ? <Badge tone="red">Défavorables</Badge> : c.conditions_ok ? <Badge tone="green">OK</Badge> : <Badge>—</Badge>}</td>
                    <td className="text-right">
                      {c.booked}/{c.capacity}
                    </td>
                    <td className={clsx("text-right font-semibold", c.remaining === 0 ? "text-rose-700" : "text-emerald-700")}>{c.remaining}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && <SessionDrawer sessionId={selected} onClose={() => setSelected(null)} />}
      <GenerateModal open={showGenerate} onClose={() => setShowGenerate(false)} />
    </div>
  );
}

/* ----------------------------------------------------------------------------- détail d'un créneau */
function SessionDrawer({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const roster = useQuery({ queryKey: ["roster", sessionId], queryFn: () => api.get<Roster>(`/api/sessions/${sessionId}/roster`) });
  const session = useQuery({ queryKey: ["session", sessionId], queryFn: () => api.get<SessionOut>(`/api/planning/sessions/${sessionId}`) });
  const [groups, setGroups] = useState<GroupProposal | null>(null);
  const [booking, setBooking] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["roster", sessionId] });
    qc.invalidateQueries({ queryKey: ["planning-week"] });
    qc.invalidateQueries({ queryKey: ["session", sessionId] });
  };
  const propose = useMutation({ mutationFn: () => api.get<GroupProposal>(`/api/planning/sessions/${sessionId}/groups`), onSuccess: setGroups });
  const apply = useMutation({ mutationFn: () => api.post(`/api/planning/sessions/${sessionId}/groups/apply`, groups?.groups), onSuccess: invalidate });
  const refresh = useMutation({ mutationFn: () => api.post(`/api/planning/sessions/${sessionId}/refresh-conditions`), onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: () => api.delete(`/api/planning/sessions/${sessionId}`), onSuccess: () => { invalidate(); onClose(); } });
  const patchCapacity = useMutation({ mutationFn: (capacity: number) => api.patch(`/api/planning/sessions/${sessionId}`, { capacity }), onSuccess: invalidate });
  const cancelBooking = useMutation({ mutationFn: (id: number) => api.patch(`/api/bookings/${id}`, { status: "cancelled" }), onSuccess: invalidate });

  const s = session.data;
  return (
    <Modal open onClose={onClose} title={s ? `${s.activity_name} · ${s.site_name} · ${fmtDateTime(s.start_at)}` : "Créneau"} wide>
      {!s || roster.isLoading ? (
        <Loading />
      ) : (
        <div className="grid lg:grid-cols-[1fr_280px] gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Badge tone="blue">
                {s.booked}/{s.capacity} places
              </Badge>
              <Badge>
                {LEVEL_SHORT[s.level_min]} → {LEVEL_SHORT[s.level_max]}
              </Badge>
              {s.instructor_name && <Badge>{s.instructor_name}</Badge>}
              {s.conditions_ok === false ? <Badge tone="red">Conditions défavorables</Badge> : <Badge tone="green">Conditions OK</Badge>}
              {s.status === "cancelled" && <Badge tone="red">Annulé</Badge>}
            </div>
            {s.conditions_note && <p className="text-xs text-slate-500 mb-4">{s.conditions_note}</p>}

            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" /> Feuille de séance
            </h4>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Niveau</th>
                    <th>Âge</th>
                    <th>Combi</th>
                    <th>Planche</th>
                    <th>Souhait</th>
                    <th>Groupe</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {roster.data?.participants.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-slate-400 text-center">
                        Aucune réservation
                      </td>
                    </tr>
                  )}
                  {roster.data?.participants.map((p) => (
                    <tr key={p.booking_id} className={clsx(p.status === "cancelled" && "opacity-40")}>
                      <td>
                        <p className="font-medium">
                          {p.name} {p.participants > 1 && <span className="text-slate-500">×{p.participants}</span>}
                        </p>
                        <p className="text-xs text-slate-400">
                          {p.reference} · {p.phone ?? "—"}
                        </p>
                      </td>
                      <td>{LEVEL_SHORT[p.level]}</td>
                      <td>{p.age ?? "—"}</td>
                      <td>{p.wetsuit ?? "—"}</td>
                      <td className="text-xs">{p.board ?? "—"}</td>
                      <td className="text-xs text-slate-500">{p.group_preference !== "none" ? GROUP_LABELS[p.group_preference] : "—"}</td>
                      <td>{p.group_label ? <Badge tone="violet">{p.group_label}</Badge> : "—"}</td>
                      <td>
                        {p.status !== "cancelled" && (
                          <button className="btn-ghost !p-1 text-rose-600" title="Annuler la réservation" onClick={() => cancelBooking.mutate(p.booking_id)}>
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {groups && (
              <div className="mt-4 rounded-xl bg-violet-50 border border-violet-100 p-4">
                <p className="text-xs text-violet-800 mb-3">{groups.rationale}</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {groups.groups.map((g) => (
                    <div key={g.label} className="bg-white rounded-lg p-3 text-sm">
                      <p className="font-semibold mb-1">
                        {g.label} <span className="text-slate-400 font-normal">· {g.size} pers.</span>
                      </p>
                      <ul className="text-xs text-slate-600 space-y-0.5">
                        {g.members.map((m) => (
                          <li key={m.booking_id}>
                            {m.customer} {m.participants > 1 && `×${m.participants}`} · {LEVEL_SHORT[m.level]} {m.age && `· ${m.age} ans`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <button className="btn-primary mt-3 !py-1.5" onClick={() => apply.mutate()} disabled={apply.isPending}>
                  Appliquer ces groupes
                </button>
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <button className="btn-primary w-full" onClick={() => setBooking(true)} disabled={s.remaining === 0 || s.status === "cancelled"}>
              <Plus className="w-4 h-4" /> Réserver à l'accueil
            </button>
            <button className="btn-secondary w-full" onClick={() => propose.mutate()} disabled={propose.isPending}>
              <Wand2 className="w-4 h-4" /> Proposer des groupes
            </button>
            <button className="btn-secondary w-full" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              <RefreshCw className={clsx("w-4 h-4", refresh.isPending && "animate-spin")} /> Recontrôler marée & météo
            </button>
            <Field label="Capacité">
              <input type="number" className="input" defaultValue={s.capacity} onBlur={(e) => Number(e.target.value) !== s.capacity && patchCapacity.mutate(Number(e.target.value))} />
            </Field>
            <p className="text-xs text-slate-500">Prix : {eur(s.price_cents)} / pers.</p>
            {s.status !== "cancelled" && (
              <button className="btn w-full text-rose-700 bg-rose-50 hover:bg-rose-100" onClick={() => confirm("Annuler ce créneau et toutes ses réservations ?") && cancel.mutate()}>
                <XCircle className="w-4 h-4" /> Annuler le créneau
              </button>
            )}
          </aside>
        </div>
      )}
      {booking && s && <CounterBookingModal session={s} onClose={() => setBooking(false)} onDone={() => { setBooking(false); invalidate(); }} />}
    </Modal>
  );
}

/* ----------------------------------------------------------------------------- réservation accueil */
function CounterBookingModal({ session, onClose, onDone }: { session: SessionOut; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [newCustomer, setNewCustomer] = useState({ first_name: "", last_name: "", email: "", phone: "", level: "beginner" as Level });
  const [participants, setParticipants] = useState(1);
  const [method, setMethod] = useState<PaymentMethod>("card_terminal");
  const [voucher, setVoucher] = useState("");
  const [pass, setPass] = useState("");
  const search = useQuery({ queryKey: ["customers", q], queryFn: () => api.get<Customer[]>("/api/customers", { q, limit: 8 }), enabled: q.length >= 2 });
  const create = useMutation({
    mutationFn: () =>
      api.post("/api/bookings", {
        customer_id: customerId,
        customer: customerId ? null : { ...newCustomer, phone: newCustomer.phone || null },
        session_id: session.id,
        participants,
        payment_method: method,
        voucher_code: voucher || null,
        pass_card_code: pass || null,
      }),
    onSuccess: onDone,
  });
  const chosen = search.data?.find((c) => c.id === customerId);

  return (
    <Modal open onClose={onClose} title="Réservation à l'accueil">
      <div className="space-y-4">
        <Field label="Client existant">
          <input className="input" placeholder="Rechercher nom, e-mail, téléphone…" value={q} onChange={(e) => { setQ(e.target.value); setCustomerId(null); }} />
          {q.length >= 2 && !customerId && (
            <ul className="mt-1 border border-slate-200 rounded-xl divide-y max-h-40 overflow-y-auto">
              {search.data?.map((c) => (
                <li key={c.id}>
                  <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={() => { setCustomerId(c.id); setQ(`${c.first_name} ${c.last_name}`); }}>
                    {c.first_name} {c.last_name} <span className="text-slate-400">· {c.email} · {LEVEL_SHORT[c.level]}</span>
                  </button>
                </li>
              ))}
              {search.data?.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">Aucun client — créez-le ci-dessous</li>}
            </ul>
          )}
          {chosen && <p className="text-xs text-emerald-700 mt-1">Client sélectionné : {chosen.first_name} {chosen.last_name}</p>}
        </Field>
        {!customerId && (
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="Prénom" value={newCustomer.first_name} onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })} />
            <input className="input" placeholder="Nom" value={newCustomer.last_name} onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })} />
            <input className="input" placeholder="E-mail" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
            <input className="input" placeholder="Téléphone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
            <select className="input col-span-2" value={newCustomer.level} onChange={(e) => setNewCustomer({ ...newCustomer, level: e.target.value as Level })}>
              {(Object.keys(LEVEL_SHORT) as Level[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_SHORT[l]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Participants">
            <input type="number" min={1} max={session.remaining} className="input" value={participants} onChange={(e) => setParticipants(Number(e.target.value))} />
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
          <Field label="Bon cadeau (code)">
            <input className="input uppercase" value={voucher} onChange={(e) => setVoucher(e.target.value)} />
          </Field>
          <Field label="Carte multi-séances (code)">
            <input className="input uppercase" value={pass} onChange={(e) => setPass(e.target.value)} />
          </Field>
        </div>
        <p className="text-sm text-slate-600">
          Total : <strong>{pass ? "décompte carte" : eur(session.price_cents * participants)}</strong>
        </p>
        <ErrorBox error={create.error} />
        <button className="btn-primary w-full" disabled={create.isPending || (!customerId && (!newCustomer.first_name || !newCustomer.email))} onClick={() => create.mutate()}>
          {create.isPending && <Spinner className="w-4 h-4 text-white" />} Enregistrer la réservation
        </button>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------------------- génération de créneaux */
function GenerateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const sites = useSites();
  const activities = useQuery({ queryKey: ["activities"], queryFn: () => api.get<Activity[]>("/api/activities") });
  const instructors = useQuery({ queryKey: ["instructors"], queryFn: () => api.get<Instructor[]>("/api/instructors") });
  const [form, setForm] = useState({
    site_id: 0,
    activity_id: 0,
    instructor_id: 0,
    date_from: isoDay(new Date()),
    date_to: isoDay(addDays(new Date(), 13)),
    start_times: "09:00, 11:00, 14:00, 16:30",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    capacity: 8,
    price_cents: 4500,
    level_min: "beginner" as Level,
    level_max: "advanced" as Level,
    only_if_conditions_ok: true,
  });
  const gen = useMutation({
    mutationFn: () =>
      api.post<{ created: number; skipped: number; details: { start_at: string; created: boolean; reason: string }[] }>("/api/planning/generate", {
        ...form,
        instructor_id: form.instructor_id || null,
        start_times: form.start_times.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planning-week"] }),
  });
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title="Générer des créneaux selon la marée et la météo" wide>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="École">
          <select className="input" value={form.site_id} onChange={(e) => set("site_id", Number(e.target.value))}>
            <option value={0}>—</option>
            {sites.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Activité">
          <select className="input" value={form.activity_id} onChange={(e) => set("activity_id", Number(e.target.value))}>
            <option value={0}>—</option>
            {activities.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Du">
          <input type="date" className="input" value={form.date_from} onChange={(e) => set("date_from", e.target.value)} />
        </Field>
        <Field label="Au">
          <input type="date" className="input" value={form.date_to} onChange={(e) => set("date_to", e.target.value)} />
        </Field>
        <Field label="Horaires de début (séparés par des virgules)">
          <input className="input" value={form.start_times} onChange={(e) => set("start_times", e.target.value)} />
        </Field>
        <Field label="Moniteur">
          <select className="input" value={form.instructor_id} onChange={(e) => set("instructor_id", Number(e.target.value))}>
            <option value={0}>Non affecté</option>
            {instructors.data?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jours">
          <div className="flex gap-1">
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
              <button key={i} className={clsx("w-9 h-9 rounded-lg text-sm font-medium border", form.weekdays.includes(i) ? "bg-ocean-600 text-white border-ocean-600" : "border-slate-200")} onClick={() => set("weekdays", form.weekdays.includes(i) ? form.weekdays.filter((x) => x !== i) : [...form.weekdays, i])}>
                {d}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Capacité">
            <input type="number" className="input" value={form.capacity} onChange={(e) => set("capacity", Number(e.target.value))} />
          </Field>
          <Field label="Prix (€)">
            <input type="number" className="input" value={form.price_cents / 100} onChange={(e) => set("price_cents", Number(e.target.value) * 100)} />
          </Field>
        </div>
        <Field label="Niveau min">
          <select className="input" value={form.level_min} onChange={(e) => set("level_min", e.target.value)}>
            {(Object.keys(LEVEL_SHORT) as Level[]).map((l) => (
              <option key={l} value={l}>
                {LEVEL_SHORT[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Niveau max">
          <select className="input" value={form.level_max} onChange={(e) => set("level_max", e.target.value)}>
            {(Object.keys(LEVEL_SHORT) as Level[]).map((l) => (
              <option key={l} value={l}>
                {LEVEL_SHORT[l]}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={form.only_if_conditions_ok} onChange={(e) => set("only_if_conditions_ok", e.target.checked)} />
          Ne créer que les créneaux dont marée et météo respectent les règles du site
        </label>
      </div>
      <ErrorBox error={gen.error} />
      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary" disabled={!form.site_id || !form.activity_id || gen.isPending} onClick={() => gen.mutate()}>
          {gen.isPending && <Spinner className="w-4 h-4 text-white" />} Générer
        </button>
        {gen.data && (
          <p className="text-sm">
            <strong className="text-emerald-700">{gen.data.created} créés</strong> · <span className="text-slate-500">{gen.data.skipped} ignorés</span>
          </p>
        )}
      </div>
      {gen.data && (
        <ul className="mt-4 max-h-56 overflow-y-auto text-xs space-y-1 border border-slate-100 rounded-xl p-3">
          {gen.data.details.map((d) => (
            <li key={d.start_at} className={d.created ? "text-emerald-700" : "text-slate-500"}>
              {fmtDateTime(d.start_at)} — {d.created ? "créé" : "ignoré"} · {d.reason}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
