import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { api, eur, pct } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { KPI } from "@/lib/types";
import { Card, Loading, PageHeader, Progress, Stat } from "@/components/ui";
import { SiteSelect } from "@/components/SiteSelect";

const COLORS = ["#1f8fb5", "#10b981", "#f59e0b", "#8b5cf6", "#64748b", "#ef4444"];

export default function DashboardPage() {
  const [siteId, setSiteId] = useState<number | null>(null);
  const kpi = useQuery({ queryKey: ["dashboard", siteId], queryFn: () => api.get<KPI>("/api/dashboard", { site_id: siteId }) });

  if (kpi.isLoading || !kpi.data) return <Loading />;
  const d = kpi.data;

  return (
    <div>
      <PageHeader title="Tableau de bord" subtitle="Vision instantanée de l'activité, toutes écoles ou par site." actions={<SiteSelect value={siteId} onChange={setSiteId} />} />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Stat label="CA du jour" value={eur(d.revenue_today_cents)} />
        <Stat label="CA du mois" value={eur(d.revenue_month_cents)} hint={`Panier moyen ${eur(d.average_basket_cents)}`} />
        <Stat label="CA de la saison" value={eur(d.revenue_season_cents)} hint="Avril → octobre" />
        <Stat label="CA de l'année" value={eur(d.revenue_year_cents)} />
        <Stat label="Taux de remplissage (mois)" value={pct(d.fill_rate_month)} tone={d.fill_rate_month >= 60 ? "good" : d.fill_rate_month < 35 ? "warn" : "default"} />
        <Stat label="Réservations du mois" value={String(d.bookings_month)} />
        <Stat label="Clients en base" value={String(d.customers_count)} />
        <Stat label="Créneaux peu remplis (7 j)" value={String(d.upcoming_low_fill.length)} tone={d.upcoming_low_fill.length > 5 ? "warn" : "default"} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card title="CA saison par école">
          <div className="h-52">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.revenue_by_site.filter((r) => r.id)} dataKey="total_cents" nameKey="label" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {d.revenue_by_site.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => eur(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="text-sm space-y-1 mt-2">
            {d.revenue_by_site.map((r, i) => (
              <li key={r.label} className="flex justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /> {r.label}
                </span>
                <span className="font-medium">{eur(r.total_cents)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="CA saison par activité">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={d.revenue_by_activity} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => eur(v)} />
                <Bar dataKey="total_cents" fill="#1f8fb5" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Créneaux les plus rentables (saison)">
          <ul className="space-y-3">
            {d.top_slots.map((s) => (
              <li key={`${s.site}-${s.activity}-${s.hour}`} className="text-sm">
                <div className="flex justify-between gap-3 items-start">
                  <span className="font-medium min-w-0 break-words">
                    {s.hour} · {s.site} · {s.activity}
                  </span>
                  <span className="font-semibold shrink-0">{eur(s.revenue_cents)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {s.participants} participants sur {s.sessions} séances
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card
          title="Créneaux à pousser (≤ 40 % dans les 7 jours)"
          action={
            <Link to="/admin/assistant" className="text-xs text-ocean-700 hover:underline flex items-center gap-1">
              Demander une action commerciale <ArrowRight className="w-3 h-3" />
            </Link>
          }
        >
          {d.upcoming_low_fill.length === 0 ? (
            <p className="text-sm text-slate-500">Tous les créneaux à venir sont bien remplis.</p>
          ) : (
            <ul className="space-y-3">
              {d.upcoming_low_fill.slice(0, 8).map((s) => (
                <li key={s.session_id} className="text-sm">
                  <div className="flex justify-between items-start gap-3">
                    <span className="flex items-start gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <span className="break-words">{fmtDateTime(s.start_at)} · {s.site} · {s.activity}</span>
                    </span>
                    <span className="text-slate-500 shrink-0">
                      {s.booked}/{s.capacity}
                    </span>
                  </div>
                  <Progress value={s.booked} max={s.capacity} className="mt-1.5" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Produits boutique les plus vendus (saison)">
          <div className="overflow-x-auto -mx-1">
          <table className="table">
            <thead>
              <tr>
                <th>Produit</th>
                <th className="text-right">Qté</th>
                <th className="text-right">CA</th>
              </tr>
            </thead>
            <tbody>
              {d.top_products.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="text-right">{p.quantity}</td>
                  <td className="text-right font-medium">{eur(p.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
