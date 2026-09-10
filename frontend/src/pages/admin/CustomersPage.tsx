import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { api, eur } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Booking, Customer, CustomerInput, Level } from "@/lib/types";
import { LEVEL_LABELS, LEVEL_SHORT } from "@/lib/types";
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader } from "@/components/ui";

const empty: CustomerInput = { first_name: "", last_name: "", email: "", phone: "", birth_date: "", height_cm: null, weight_kg: null, level: "beginner", board_type: "", practice_frequency: "", wetsuit_size: "", notes: "" };

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const list = useQuery({ queryKey: ["customers", q], queryFn: () => api.get<Customer[]>("/api/customers", { q }) });

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Fiche client, questionnaire, matériel suggéré et historique."
        actions={
          <>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input className="input !pl-9 !w-64" placeholder="Nom, e-mail, téléphone…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={() => setEditing("new")}>
              <Plus className="w-4 h-4" /> Nouveau client
            </button>
          </>
        }
      />
      <Card>
        {list.isLoading ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Niveau</th>
                  <th>Âge</th>
                  <th>Gabarit</th>
                  <th>Combi</th>
                  <th>Planche suggérée</th>
                  <th className="text-right">Séances</th>
                  <th className="text-right">Dépensé</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setEditing(c)}>
                    <td className="font-medium">
                      {c.first_name} {c.last_name}
                    </td>
                    <td className="text-xs text-slate-500">
                      {c.email}
                      <br />
                      {c.phone}
                    </td>
                    <td>
                      <Badge tone="blue">{LEVEL_SHORT[c.level]}</Badge>
                    </td>
                    <td>{c.age ?? "—"}</td>
                    <td className="text-slate-500">{c.height_cm && c.weight_kg ? `${c.height_cm} cm · ${c.weight_kg} kg` : "—"}</td>
                    <td>{c.suggested_wetsuit ?? "—"}</td>
                    <td className="text-xs">{c.suggested_board ?? "—"}</td>
                    <td className="text-right">{c.bookings_count}</td>
                    <td className="text-right font-medium">{eur(c.total_spent_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <CustomerModal customer={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CustomerModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CustomerInput>(customer ? { ...empty, ...customer, birth_date: customer.birth_date ?? "", phone: customer.phone ?? "", board_type: customer.board_type ?? "", practice_frequency: customer.practice_frequency ?? "", wetsuit_size: customer.wetsuit_size ?? "", notes: customer.notes ?? "" } : empty);
  const history = useQuery({ queryKey: ["bookings-cust", customer?.id], queryFn: () => api.get<Booking[]>("/api/bookings", { customer_id: customer!.id, limit: 20 }), enabled: !!customer });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, birth_date: form.birth_date || null, phone: form.phone || null, board_type: form.board_type || null, practice_frequency: form.practice_frequency || null, wetsuit_size: form.wetsuit_size || null, notes: form.notes || null };
      return customer ? api.put(`/api/customers/${customer.id}`, body) : api.post("/api/customers", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      onClose();
    },
  });
  const set = <K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) => setForm({ ...form, [k]: v });

  return (
    <Modal open onClose={onClose} title={customer ? `${customer.first_name} ${customer.last_name}` : "Nouveau client"} wide>
      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Prénom">
            <input className="input" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label="Nom">
            <input className="input" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
          <Field label="E-mail">
            <input className="input" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Téléphone">
            <input className="input" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Date de naissance">
            <input type="date" className="input" value={form.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} />
          </Field>
          <Field label="Niveau">
            <select className="input" value={form.level} onChange={(e) => set("level", e.target.value as Level)}>
              {(Object.keys(LEVEL_LABELS) as Level[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Taille (cm)">
            <input type="number" className="input" value={form.height_cm ?? ""} onChange={(e) => set("height_cm", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Poids (kg)">
            <input type="number" className="input" value={form.weight_kg ?? ""} onChange={(e) => set("weight_kg", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Planche habituelle">
            <input className="input" value={form.board_type ?? ""} onChange={(e) => set("board_type", e.target.value)} />
          </Field>
          <Field label="Fréquence de pratique">
            <input className="input" value={form.practice_frequency ?? ""} onChange={(e) => set("practice_frequency", e.target.value)} />
          </Field>
          <Field label="Taille de combinaison (ajustée)" hint={customer?.suggested_wetsuit ? `Suggestion : ${customer.suggested_wetsuit}` : undefined}>
            <input className="input" value={form.wetsuit_size ?? ""} onChange={(e) => set("wetsuit_size", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes équipe">
              <textarea className="input" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <ErrorBox error={save.error} />
            <button className="btn-primary mt-2" onClick={() => save.mutate()} disabled={save.isPending}>
              Enregistrer
            </button>
          </div>
        </div>
        {customer && (
          <aside>
            <p className="label">Historique</p>
            {history.isLoading ? (
              <Loading />
            ) : (
              <ul className="space-y-2 text-sm max-h-96 overflow-y-auto">
                {history.data?.map((b) => (
                  <li key={b.id} className="rounded-lg border border-slate-100 p-2.5">
                    <p className="font-medium">{b.session_start && fmtDateTime(b.session_start)}</p>
                    <p className="text-xs text-slate-500">
                      {b.site_name} · {b.activity_name} · {b.participants} pers. · {eur(b.paid_cents)}
                    </p>
                  </li>
                ))}
                {history.data?.length === 0 && <li className="text-slate-400">Aucune réservation</li>}
              </ul>
            )}
          </aside>
        )}
      </div>
    </Modal>
  );
}
