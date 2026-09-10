import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { clsx } from "clsx";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, eur, pct } from "@/lib/api";
import { fmtDate, isoDay } from "@/lib/format";
import type { ProfitabilityRow, RevenueBreakdown } from "@/lib/types";
import { Card, Loading, PageHeader, Stat } from "@/components/ui";
import { SiteSelect } from "@/components/SiteSelect";

const PRESETS = [
  { label: "7 jours", days: 7 },
  { label: "30 jours", days: 30 },
  { label: "90 jours", days: 90 },
  { label: "Saison", days: 0 },
];

export default function AnalyticsPage() {
  const [from, setFrom] = useState(isoDay(subDays(new Date(), 30)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const [siteId, setSiteId] = useState<number | null>(null);
  const [dimension, setDimension] = useState<"activity" | "site" | "slot">("activity");

  const rev = useQuery({
    queryKey: ["revenue", from, to, granularity, siteId],
    queryFn: () => api.get<RevenueBreakdown>("/api/analytics/revenue", { date_from: from, date_to: to, granularity, site_id: siteId }),
  });
  const prof = useQuery({
    queryKey: ["profitability", from, to, dimension],
    queryFn: () => api.get<ProfitabilityRow[]>("/api/analytics/profitability", { date_from: from, date_to: to, dimension }),
  });

  const applyPreset = (days: number) => {
    if (days === 0) {
      const y = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
      setFrom(`${y}-04-01`);
      setTo(isoDay(new Date()));
      setGranularity("week");
    } else {
      setFrom(isoDay(subDays(new Date(), days)));
      setTo(isoDay(new Date()));
      setGranularity(days > 60 ? "week" : "day");
    }
  };

  return (
    <div>
      <PageHeader
        title="Analyses & rentabilité"
        subtitle="Combien je réalise, où, quand, sur quelle activité, grâce à quel produit — et avec quelle marge."
        actions={
          <>
            {PRESETS.map((p) => (
              <button key={p.label} className="btn-secondary !py-1.5" onClick={() => applyPreset(p.days)}>
                {p.label}
              </button>
            ))}
            <input type="date" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
            <select className="input !w-auto" value={granularity} onChange={(e) => setGranularity(e.target.value as typeof granularity)}>
              <option value="day">Jour</option>
              <option value="week">Semaine</option>
              <option value="month">Mois</option>
            </select>
            <SiteSelect value={siteId} onChange={setSiteId} />
          </>
        }
      />

      {rev.isLoading || !rev.data ? (
        <Loading />
      ) : (
        <>
          <div className="grid sm:grid-cols-4 gap-4 mb-6">
            <Stat label="CA période" value={eur(rev.data.total_cents)} />
            <Stat label="Meilleure école" value={rev.data.by_site.find((r) => r.id)?.label ?? "—"} hint={rev.data.by_site[0] && eur(rev.data.by_site[0].total_cents)} />
            <Stat label="Meilleure activité" value={rev.data.by_activity.find((r) => r.id)?.label ?? "—"} hint={rev.data.by_activity[0] && eur(rev.data.by_activity[0].total_cents)} />
            <Stat label="Meilleure famille produit" value={rev.data.by_category[0]?.label ?? "—"} hint={rev.data.by_category[0] && eur(rev.data.by_category[0].total_cents)} />
          </div>

          <Card title="Évolution du chiffre d'affaires" className="mb-6">
            <div className="h-72">
              <ResponsiveContainer>
                <AreaChart data={rev.data.series}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1f8fb5" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#1f8fb5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="period" tickFormatter={(v) => fmtDate(v, granularity === "month" ? "MMM yy" : "d MMM")} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 100)} €`} tick={{ fontSize: 11 }} width={60} />
                  <Tooltip formatter={(v: number) => eur(v)} labelFormatter={(l) => fmtDate(String(l), "EEEE d MMMM yyyy")} />
                  <Area type="monotone" dataKey="total_cents" stroke="#1f8fb5" strokeWidth={2} fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid lg:grid-cols-3 gap-4 mb-6">
            <Breakdown title="Par école" rows={rev.data.by_site} total={rev.data.total_cents} />
            <Breakdown title="Par activité" rows={rev.data.by_activity} total={rev.data.total_cents} />
            <Breakdown title="Par famille de produits" rows={rev.data.by_category} total={rev.data.total_cents} />
          </div>
        </>
      )}

      <Card
        title="Rentabilité"
        action={
          <div className="flex gap-1">
            {(["activity", "site", "slot"] as const).map((d) => (
              <button key={d} className={clsx("btn !py-1 !px-3 text-xs", dimension === d ? "btn-primary" : "btn-secondary")} onClick={() => setDimension(d)}>
                {d === "activity" ? "Par activité" : d === "site" ? "Par école" : "Par créneau horaire"}
              </button>
            ))}
          </div>
        }
      >
        {prof.isLoading ? (
          <Loading />
        ) : (
          <>
            <div className="h-56 mb-4">
              <ResponsiveContainer>
                <BarChart data={prof.data}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 100)} €`} tick={{ fontSize: 11 }} width={60} />
                  <Tooltip formatter={(v: number) => eur(v)} />
                  <Bar dataKey="revenue_cents" name="CA" fill="#b0e2ef" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="margin_cents" name="Marge" fill="#1f8fb5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{dimension === "slot" ? "Créneau" : dimension === "site" ? "École" : "Activité"}</th>
                    <th className="text-right">CA</th>
                    <th className="text-right">Séances</th>
                    <th className="text-right">Clients</th>
                    <th className="text-right">Remplissage</th>
                    <th className="text-right">Prix moyen</th>
                    <th className="text-right">Coût moniteurs</th>
                    <th className="text-right">Coût produits</th>
                    <th className="text-right">Marge</th>
                    <th className="text-right">Taux</th>
                  </tr>
                </thead>
                <tbody>
                  {prof.data?.map((r) => (
                    <tr key={r.key}>
                      <td className="font-medium">{r.label}</td>
                      <td className="text-right">{eur(r.revenue_cents)}</td>
                      <td className="text-right">{r.sessions}</td>
                      <td className="text-right">{r.customers}</td>
                      <td className={clsx("text-right", r.fill_rate < 40 && "text-amber-600")}>{pct(r.fill_rate)}</td>
                      <td className="text-right">{eur(r.avg_price_cents)}</td>
                      <td className="text-right text-slate-500">{eur(r.instructor_cost_cents)}</td>
                      <td className="text-right text-slate-500">{eur(r.product_cost_cents)}</td>
                      <td className={clsx("text-right font-semibold", r.margin_cents < 0 ? "text-rose-600" : "text-emerald-700")}>{eur(r.margin_cents)}</td>
                      <td className="text-right">{pct(r.margin_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: { label: string; total_cents: number }[]; total: number }) {
  return (
    <Card title={title}>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="text-sm">
            <div className="flex justify-between mb-1">
              <span>{r.label}</span>
              <span className="font-medium">
                {eur(r.total_cents)} <span className="text-slate-400 text-xs">({total ? Math.round((100 * r.total_cents) / total) : 0} %)</span>
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-ocean-500 rounded-full" style={{ width: `${total ? (100 * r.total_cents) / total : 0}%` }} />
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-slate-400 text-sm">Aucune donnée</li>}
      </ul>
    </Card>
  );
}
