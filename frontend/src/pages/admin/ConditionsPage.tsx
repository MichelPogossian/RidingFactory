import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { clsx } from "clsx";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Trash2, Wind } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtTime, isoDay } from "@/lib/format";
import type { Activity, ConditionsCheck, Level, TideEvent, TideRule, Weather } from "@/lib/types";
import { LEVEL_SHORT } from "@/lib/types";
import { Card, ErrorBox, Field, Loading, Modal, PageHeader } from "@/components/ui";
import { SiteSelect, useSites } from "@/components/SiteSelect";

const PHASES = { any: "Indifférent", low: "Autour de la basse mer", high: "Autour de la pleine mer", rising: "Marée montante", falling: "Marée descendante" };

export default function ConditionsPage() {
  const qc = useQueryClient();
  const sites = useSites();
  const [siteId, setSiteId] = useState<number | null>(null);
  const sid = siteId ?? sites.data?.[0]?.id ?? null;
  const from = isoDay(new Date());
  const to = isoDay(addDays(new Date(), 6));
  const tides = useQuery({ queryKey: ["tides", sid, from], queryFn: () => api.get<TideEvent[]>("/api/conditions/tides", { site_id: sid, date_from: from, date_to: to }), enabled: !!sid });
  const weather = useQuery({ queryKey: ["weather", sid, from], queryFn: () => api.get<Weather[]>("/api/conditions/weather", { site_id: sid, date_from: from, date_to: to }), enabled: !!sid });
  const rules = useQuery({ queryKey: ["rules"], queryFn: () => api.get<TideRule[]>("/api/conditions/rules") });
  const activities = useQuery({ queryKey: ["activities"], queryFn: () => api.get<Activity[]>("/api/activities") });
  const sync = useMutation({
    mutationFn: () => api.post("/api/conditions/sync", undefined, { days: 10 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tides"] });
      qc.invalidateQueries({ queryKey: ["weather"] });
    },
  });
  const delRule = useMutation({ mutationFn: (id: number) => api.delete(`/api/conditions/rules/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }) });
  const [showRule, setShowRule] = useState(false);
  const [checkAt, setCheckAt] = useState(`${from}T10:00`);
  const [checkActivity, setCheckActivity] = useState<number | null>(null);
  const [checkLevel, setCheckLevel] = useState<Level>("beginner");
  const check = useQuery({
    queryKey: ["check", sid, checkAt, checkActivity, checkLevel],
    queryFn: () => api.get<ConditionsCheck>("/api/conditions/check", { site_id: sid, at: new Date(checkAt).toISOString(), activity_id: checkActivity, level: checkLevel }),
    enabled: !!sid && !!checkAt,
  });

  const tideByDay = useMemo(() => {
    const m: Record<string, TideEvent[]> = {};
    for (const t of tides.data ?? []) (m[t.at.slice(0, 10)] ??= []).push(t);
    return Object.entries(m);
  }, [tides.data]);
  const wxSeries = useMemo(() => (weather.data ?? []).filter((_, i) => i % 3 === 0).map((w) => ({ ...w, label: fmtDateTime(w.at) })), [weather.data]);
  const siteRules = (rules.data ?? []).filter((r) => r.site_id === sid);
  const source = weather.data?.[0]?.source;

  return (
    <div>
      <PageHeader
        title="Marées, météo & règles"
        subtitle="Les conditions pilotent la construction des créneaux : marnage, phase de marée, houle et vent, par site, activité et niveau."
        actions={
          <>
            <SiteSelect value={sid} onChange={setSiteId} allLabel="Choisir un site" />
            <button className="btn-secondary" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={clsx("w-4 h-4", sync.isPending && "animate-spin")} /> Actualiser (10 j)
            </button>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card title="Marées des 7 prochains jours" className="lg:col-span-1">
          {tides.isLoading ? (
            <Loading />
          ) : (
            <div className="space-y-3">
              {tideByDay.map(([day, evs]) => (
                <div key={day}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fmtDate(day, "EEEE d MMM")}</p>
                  <ul className="mt-1 grid grid-cols-2 gap-1">
                    {evs.map((e) => (
                      <li key={e.id} className={clsx("flex items-center gap-1.5 text-sm rounded-lg px-2 py-1", e.kind === "high" ? "bg-ocean-50 text-ocean-800" : "bg-sand-50 text-sand-800")}>
                        {e.kind === "high" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                        <span className="font-medium">{fmtTime(e.at)}</span>
                        <span className="text-xs">{e.height_m.toFixed(1)} m</span>
                        {e.coefficient && <span className="text-xs ml-auto opacity-70">c.{e.coefficient}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <Card title={`Houle & vent · source ${source === "open-meteo" ? "Open-Meteo" : "modèle de démonstration"}`}>
            <div className="h-48">
              <ResponsiveContainer>
                <AreaChart data={wxSeries}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="at" tickFormatter={(v) => fmtDate(v, "EEE d")} tick={{ fontSize: 11 }} interval={7} />
                  <YAxis yAxisId="w" tick={{ fontSize: 11 }} width={35} unit=" m" />
                  <YAxis yAxisId="v" orientation="right" tick={{ fontSize: 11 }} width={45} unit=" km/h" />
                  <Tooltip labelFormatter={(l) => fmtDateTime(String(l))} />
                  <Area yAxisId="w" type="monotone" dataKey="wave_height_m" name="Vagues (m)" stroke="#1f8fb5" fill="#b0e2ef" />
                  <Area yAxisId="v" type="monotone" dataKey="wind_speed_kmh" name="Vent (km/h)" stroke="#f59e0b" fill="#fde68a" fillOpacity={0.4} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Températures air / eau">
            <div className="h-36">
              <ResponsiveContainer>
                <LineChart data={wxSeries}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="at" tickFormatter={(v) => fmtDate(v, "EEE d")} tick={{ fontSize: 11 }} interval={7} />
                  <YAxis tick={{ fontSize: 11 }} width={35} unit="°" />
                  <Tooltip labelFormatter={(l) => fmtDateTime(String(l))} />
                  <Line type="monotone" dataKey="air_temp_c" name="Air" stroke="#ef4444" dot={false} />
                  <Line type="monotone" dataKey="water_temp_c" name="Eau" stroke="#1f8fb5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <Card
          title="Règles de faisabilité du site"
          action={
            <button className="btn-primary !py-1.5" onClick={() => setShowRule(true)}>
              <Plus className="w-4 h-4" /> Règle
            </button>
          }
        >
          <table className="table">
            <thead>
              <tr>
                <th>Règle</th>
                <th>Activité</th>
                <th>Niveaux</th>
                <th>Marnage</th>
                <th>Phase</th>
                <th>Vagues</th>
                <th>Vent max</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {siteRules.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td>{activities.data?.find((a) => a.id === r.activity_id)?.name ?? "Toutes"}</td>
                  <td className="text-xs text-slate-500">
                    {r.level_min ? LEVEL_SHORT[r.level_min] : "—"} → {r.level_max ? LEVEL_SHORT[r.level_max] : "—"}
                  </td>
                  <td>
                    {r.min_range_m ?? "0"} – {r.max_range_m ?? "∞"} m
                  </td>
                  <td className="text-xs">
                    {PHASES[r.phase]} {r.phase !== "any" && r.phase !== "rising" && r.phase !== "falling" && `±${r.phase_window_hours} h`}
                  </td>
                  <td>
                    {r.min_wave_height_m ?? "0"} – {r.max_wave_height_m ?? "∞"} m
                  </td>
                  <td>{r.max_wind_kmh ? `${r.max_wind_kmh} km/h` : "—"}</td>
                  <td>
                    <button className="btn-ghost !p-1 text-rose-600" onClick={() => confirm("Supprimer la règle ?") && delRule.mutate(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {siteRules.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-400">
                    Aucune règle : tous les créneaux sont autorisés sur ce site.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title="Tester un créneau">
          <div className="space-y-3">
            <Field label="Date et heure">
              <input type="datetime-local" className="input" value={checkAt} onChange={(e) => setCheckAt(e.target.value)} />
            </Field>
            <Field label="Activité">
              <select className="input" value={checkActivity ?? ""} onChange={(e) => setCheckActivity(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Toutes</option>
                {activities.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Niveau">
              <select className="input" value={checkLevel} onChange={(e) => setCheckLevel(e.target.value as Level)}>
                {(Object.keys(LEVEL_SHORT) as Level[]).map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_SHORT[l]}
                  </option>
                ))}
              </select>
            </Field>
            {check.data && (
              <div className={clsx("rounded-xl p-4 text-sm", check.data.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900")}>
                <p className="font-semibold mb-2">{check.data.ok ? "Créneau praticable" : "Créneau non praticable"}</p>
                <ul className="text-xs space-y-1">
                  {check.data.reasons.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-1 mt-3 text-xs">
                  <span>Hauteur : {check.data.snapshot.tide_height_m ?? "—"} m</span>
                  <span>Marnage : {check.data.snapshot.tide_range_m ?? "—"} m</span>
                  <span>Marée : {check.data.snapshot.tide_phase === "rising" ? "montante" : "descendante"}</span>
                  <span>Coef. : {check.data.snapshot.coefficient ?? "—"}</span>
                  <span>Vagues : {check.data.snapshot.wave_height_m ?? "—"} m</span>
                  <span className="flex items-center gap-1">
                    <Wind className="w-3 h-3" /> {check.data.snapshot.wind_speed_kmh ?? "—"} km/h
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {sid && <RuleModal open={showRule} onClose={() => setShowRule(false)} siteId={sid} />}
    </div>
  );
}

function RuleModal({ open, onClose, siteId }: { open: boolean; onClose: () => void; siteId: number }) {
  const qc = useQueryClient();
  const activities = useQuery({ queryKey: ["activities"], queryFn: () => api.get<Activity[]>("/api/activities") });
  const [form, setForm] = useState({ name: "", activity_id: "" as string, level_min: "" as string, level_max: "" as string, min_range_m: "", max_range_m: "", phase: "any", phase_window_hours: 2, min_wave_height_m: "", max_wave_height_m: "", max_wind_kmh: "" });
  const create = useMutation({
    mutationFn: () =>
      api.post("/api/conditions/rules", {
        site_id: siteId,
        name: form.name,
        activity_id: form.activity_id ? Number(form.activity_id) : null,
        level_min: form.level_min || null,
        level_max: form.level_max || null,
        min_range_m: form.min_range_m ? Number(form.min_range_m) : null,
        max_range_m: form.max_range_m ? Number(form.max_range_m) : null,
        phase: form.phase,
        phase_window_hours: form.phase_window_hours,
        min_wave_height_m: form.min_wave_height_m ? Number(form.min_wave_height_m) : null,
        max_wave_height_m: form.max_wave_height_m ? Number(form.max_wave_height_m) : null,
        max_wind_kmh: form.max_wind_kmh ? Number(form.max_wind_kmh) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      onClose();
    },
  });
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="Nouvelle règle de faisabilité">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Field label="Nom">
            <input className="input" placeholder="ex. Débutants : marnage 2–3 m" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
        </div>
        <Field label="Activité">
          <select className="input" value={form.activity_id} onChange={(e) => set("activity_id", e.target.value)}>
            <option value="">Toutes</option>
            {activities.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phase de marée">
          <select className="input" value={form.phase} onChange={(e) => set("phase", e.target.value)}>
            {Object.entries(PHASES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Niveau min">
          <select className="input" value={form.level_min} onChange={(e) => set("level_min", e.target.value)}>
            <option value="">—</option>
            {(Object.keys(LEVEL_SHORT) as Level[]).map((l) => (
              <option key={l} value={l}>
                {LEVEL_SHORT[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Niveau max">
          <select className="input" value={form.level_max} onChange={(e) => set("level_max", e.target.value)}>
            <option value="">—</option>
            {(Object.keys(LEVEL_SHORT) as Level[]).map((l) => (
              <option key={l} value={l}>
                {LEVEL_SHORT[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Marnage min (m)">
          <input type="number" step="0.1" className="input" value={form.min_range_m} onChange={(e) => set("min_range_m", e.target.value)} />
        </Field>
        <Field label="Marnage max (m)">
          <input type="number" step="0.1" className="input" value={form.max_range_m} onChange={(e) => set("max_range_m", e.target.value)} />
        </Field>
        <Field label="Fenêtre autour de la phase (± h)">
          <input type="number" step="0.5" className="input" value={form.phase_window_hours} onChange={(e) => set("phase_window_hours", Number(e.target.value))} />
        </Field>
        <Field label="Vent max (km/h)">
          <input type="number" className="input" value={form.max_wind_kmh} onChange={(e) => set("max_wind_kmh", e.target.value)} />
        </Field>
        <Field label="Vagues min (m)">
          <input type="number" step="0.1" className="input" value={form.min_wave_height_m} onChange={(e) => set("min_wave_height_m", e.target.value)} />
        </Field>
        <Field label="Vagues max (m)">
          <input type="number" step="0.1" className="input" value={form.max_wave_height_m} onChange={(e) => set("max_wave_height_m", e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-slate-500 mt-3">Plusieurs règles pour un même site/activité sont des alternatives : le créneau est praticable si l'une d'elles est satisfaite.</p>
      <ErrorBox error={create.error} />
      <button className="btn-primary mt-4" disabled={!form.name || create.isPending} onClick={() => create.mutate()}>
        Créer la règle
      </button>
    </Modal>
  );
}
