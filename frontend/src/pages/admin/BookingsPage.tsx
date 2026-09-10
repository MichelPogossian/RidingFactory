import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { api, eur } from "@/lib/api";
import { fmtDateTime, isoDay } from "@/lib/format";
import type { Booking, BookingStatus } from "@/lib/types";
import { LEVEL_SHORT, PAYMENT_LABELS } from "@/lib/types";
import { Badge, Card, Empty, Loading, PageHeader } from "@/components/ui";
import { SiteSelect } from "@/components/SiteSelect";

const STATUS: Record<BookingStatus, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
  confirmed: { label: "Confirmée", tone: "green" },
  pending: { label: "En attente", tone: "amber" },
  cancelled: { label: "Annulée", tone: "red" },
  no_show: { label: "Absent", tone: "slate" },
};

export default function BookingsPage() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(isoDay(new Date()));
  const [to, setTo] = useState(isoDay(addDays(new Date(), 14)));
  const [siteId, setSiteId] = useState<number | null>(null);
  const [status, setStatus] = useState<BookingStatus | "">("");
  const list = useQuery({
    queryKey: ["bookings", from, to, siteId, status],
    queryFn: () => api.get<Booking[]>("/api/bookings", { date_from: from, date_to: to, site_id: siteId, status: status || undefined }),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Booking> }) => api.patch(`/api/bookings/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });

  return (
    <div>
      <PageHeader
        title="Réservations"
        subtitle="Toutes les réservations, en ligne et à l'accueil."
        actions={
          <>
            <input type="date" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
            <SiteSelect value={siteId} onChange={setSiteId} />
            <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | "")}>
              <option value="">Tous statuts</option>
              {(Object.keys(STATUS) as BookingStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].label}
                </option>
              ))}
            </select>
          </>
        }
      />
      <Card>
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.length ? (
          <Empty>Aucune réservation sur la période.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Séance</th>
                  <th>Client</th>
                  <th>Niveau</th>
                  <th className="text-right">Pers.</th>
                  <th className="text-right">Payé</th>
                  <th>Moyen</th>
                  <th>Canal</th>
                  <th>Groupe</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((b) => (
                  <tr key={b.id}>
                    <td className="font-mono text-xs">{b.reference}</td>
                    <td>
                      <p className="font-medium">{b.session_start && fmtDateTime(b.session_start)}</p>
                      <p className="text-xs text-slate-500">
                        {b.site_name} · {b.activity_name}
                      </p>
                    </td>
                    <td>{b.customer_name}</td>
                    <td className="text-slate-500">{b.customer_level && LEVEL_SHORT[b.customer_level]}</td>
                    <td className="text-right">{b.participants}</td>
                    <td className="text-right font-medium">{eur(b.paid_cents)}</td>
                    <td className="text-xs text-slate-500">{b.payment_method ? PAYMENT_LABELS[b.payment_method] : "—"}</td>
                    <td>
                      <Badge tone={b.source === "online" ? "blue" : "slate"}>{b.source === "online" ? "En ligne" : "Accueil"}</Badge>
                    </td>
                    <td>
                      <input className="input !py-1 !px-2 !w-24 text-xs" defaultValue={b.group_label ?? ""} placeholder="Groupe" onBlur={(e) => e.target.value !== (b.group_label ?? "") && patch.mutate({ id: b.id, body: { group_label: e.target.value || null } })} />
                    </td>
                    <td>
                      <Badge tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Badge>
                    </td>
                    <td>
                      <select className="input !py-1 !px-2 text-xs !w-auto" value={b.status} onChange={(e) => patch.mutate({ id: b.id, body: { status: e.target.value as BookingStatus } })}>
                        {(Object.keys(STATUS) as BookingStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS[s].label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
