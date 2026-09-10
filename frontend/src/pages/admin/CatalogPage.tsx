import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Plus } from "lucide-react";
import { api, eur } from "@/lib/api";
import type { Activity, Instructor, Level, Offer, OfferKind, Site } from "@/lib/types";
import { KIND_LABELS, LEVEL_SHORT } from "@/lib/types";
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader } from "@/components/ui";

type Tab = "sites" | "activities" | "offers" | "instructors";

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>("sites");
  return (
    <div>
      <PageHeader title="Sites, activités, tarifs & moniteurs" subtitle="Le référentiel multi-site et multi-activité : chaque activité a ses tarifs, durées, capacités, niveaux ; chaque site ses règles." />
      <div className="flex gap-2 mb-6">
        {(["sites", "activities", "offers", "instructors"] as Tab[]).map((t) => (
          <button key={t} className={clsx("btn", tab === t ? "btn-primary" : "btn-secondary")} onClick={() => setTab(t)}>
            {{ sites: "Écoles / sites", activities: "Activités", offers: "Tarifs & formules", instructors: "Moniteurs" }[t]}
          </button>
        ))}
      </div>
      {tab === "sites" && <Sites />}
      {tab === "activities" && <Activities />}
      {tab === "offers" && <Offers />}
      {tab === "instructors" && <Instructors />}
    </div>
  );
}

/* ------------------------------------------------------------------ Sites */
function Sites() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["sites-all"], queryFn: () => api.get<Site[]>("/api/sites", { include_inactive: true }) });
  const [editing, setEditing] = useState<Partial<Site> | null>(null);
  const save = useMutation({
    mutationFn: (s: Partial<Site>) => (s.id ? api.put(`/api/sites/${s.id}`, s) : api.post("/api/sites", s)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites-all"] });
      qc.invalidateQueries({ queryKey: ["sites"] });
      setEditing(null);
    },
  });
  if (list.isLoading) return <Loading />;
  return (
    <Card
      action={
        <button className="btn-primary !py-1.5" onClick={() => setEditing({ name: "", slug: "", city: "Saint-Hilaire-de-Riez", latitude: 46.72, longitude: -1.97, exposure_score: 5, is_active: true })}>
          <Plus className="w-4 h-4" /> Site
        </button>
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th>École</th>
            <th>Ville</th>
            <th>Exposition</th>
            <th>Coordonnées</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setEditing(s)}>
              <td className="font-medium">{s.name}</td>
              <td>{s.city}</td>
              <td>{s.exposure_score}/10</td>
              <td className="text-xs text-slate-500">
                {s.latitude}, {s.longitude}
              </td>
              <td>{s.is_active ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Inactif</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? editing.name ?? "" : "Nouveau site"}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nom">
              <input className="input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value, slug: editing.id ? editing.slug : slugify(e.target.value) })} />
            </Field>
            <Field label="Slug (URL)">
              <input className="input" value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
            </Field>
            <Field label="Ville">
              <input className="input" value={editing.city ?? ""} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
            </Field>
            <Field label="Adresse">
              <input className="input" value={editing.address ?? ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
            </Field>
            <Field label="Latitude">
              <input type="number" step="0.0001" className="input" value={editing.latitude ?? ""} onChange={(e) => setEditing({ ...editing, latitude: Number(e.target.value) })} />
            </Field>
            <Field label="Longitude">
              <input type="number" step="0.0001" className="input" value={editing.longitude ?? ""} onChange={(e) => setEditing({ ...editing, longitude: Number(e.target.value) })} />
            </Field>
            <Field label="Exposition (0 abrité → 10 engagé)" hint="Utilisé pour orienter les débutants vers les sites abrités.">
              <input type="range" min={0} max={10} className="w-full" value={editing.exposure_score ?? 5} onChange={(e) => setEditing({ ...editing, exposure_score: Number(e.target.value) })} />
              <span className="text-sm">{editing.exposure_score}/10</span>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Actif
            </label>
            <div className="sm:col-span-2">
              <Field label="Description (site public & SEO)">
                <textarea className="input" rows={3} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </Field>
            </div>
          </div>
          <ErrorBox error={save.error} />
          <button className="btn-primary mt-4" onClick={() => save.mutate(editing)} disabled={save.isPending}>
            Enregistrer
          </button>
        </Modal>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Activités */
function Activities() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["activities-all"], queryFn: () => api.get<Activity[]>("/api/activities", { include_inactive: true }) });
  const [editing, setEditing] = useState<Partial<Activity> | null>(null);
  const save = useMutation({
    mutationFn: (a: Partial<Activity>) => (a.id ? api.put(`/api/activities/${a.id}`, a) : api.post("/api/activities", a)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities-all"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      setEditing(null);
    },
  });
  if (list.isLoading) return <Loading />;
  return (
    <Card
      action={
        <button className="btn-primary !py-1.5" onClick={() => setEditing({ name: "", slug: "", category: "autre", color: "#0ea5e9", default_duration_minutes: 90, default_capacity: 8, requires_conditions: false, is_active: true })}>
          <Plus className="w-4 h-4" /> Activité
        </button>
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th>Activité</th>
            <th>Catégorie</th>
            <th>Durée</th>
            <th>Capacité</th>
            <th>Conditions</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setEditing(a)}>
              <td className="font-medium">
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: a.color }} /> {a.name}
                </span>
              </td>
              <td>{a.category}</td>
              <td>{a.default_duration_minutes} min</td>
              <td>{a.default_capacity}</td>
              <td>{a.requires_conditions ? <Badge tone="blue">Marée / météo</Badge> : <Badge>Indépendante</Badge>}</td>
              <td>{a.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? editing.name ?? "" : "Nouvelle activité"}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nom">
              <input className="input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value, slug: editing.id ? editing.slug : slugify(e.target.value) })} />
            </Field>
            <Field label="Slug">
              <input className="input" value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
            </Field>
            <Field label="Catégorie">
              <input className="input" value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
            </Field>
            <Field label="Couleur">
              <input type="color" className="input h-10" value={editing.color ?? "#0ea5e9"} onChange={(e) => setEditing({ ...editing, color: e.target.value })} />
            </Field>
            <Field label="Durée par défaut (min)">
              <input type="number" className="input" value={editing.default_duration_minutes ?? 90} onChange={(e) => setEditing({ ...editing, default_duration_minutes: Number(e.target.value) })} />
            </Field>
            <Field label="Capacité par défaut">
              <input type="number" className="input" value={editing.default_capacity ?? 8} onChange={(e) => setEditing({ ...editing, default_capacity: Number(e.target.value) })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.requires_conditions ?? false} onChange={(e) => setEditing({ ...editing, requires_conditions: e.target.checked })} /> Dépend de la marée / météo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Active
            </label>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea className="input" rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </Field>
            </div>
          </div>
          <ErrorBox error={save.error} />
          <button className="btn-primary mt-4" onClick={() => save.mutate(editing)} disabled={save.isPending}>
            Enregistrer
          </button>
        </Modal>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Offres */
function Offers() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["offers-admin"], queryFn: () => api.get<Offer[]>("/api/offers", { include_inactive: true }) });
  const activities = useQuery({ queryKey: ["activities"], queryFn: () => api.get<Activity[]>("/api/activities") });
  const [editing, setEditing] = useState<Partial<Offer> | null>(null);
  const save = useMutation({
    mutationFn: (o: Partial<Offer>) => (o.id ? api.put(`/api/offers/${o.id}`, o) : api.post("/api/offers", o)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers-admin"] });
      qc.invalidateQueries({ queryKey: ["offers"] });
      qc.invalidateQueries({ queryKey: ["offers-all"] });
      qc.invalidateQueries({ queryKey: ["offers-pass"] });
      setEditing(null);
    },
  });
  if (list.isLoading) return <Loading />;
  return (
    <Card
      action={
        <button className="btn-primary !py-1.5" onClick={() => setEditing({ activity_id: activities.data?.[0]?.id, name: "", kind: "single", sessions_count: 1, price_cents: 4500, vat_rate: 20, is_active: true })}>
          <Plus className="w-4 h-4" /> Tarif
        </button>
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th>Formule</th>
            <th>Activité</th>
            <th>Type</th>
            <th className="text-right">Séances</th>
            <th className="text-right">Prix</th>
            <th className="text-right">TVA</th>
            <th>Niveaux</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setEditing(o)}>
              <td className="font-medium">{o.name}</td>
              <td>{activities.data?.find((a) => a.id === o.activity_id)?.name}</td>
              <td>
                <Badge tone={o.kind === "pass_card" ? "amber" : o.kind === "course" ? "violet" : "blue"}>{KIND_LABELS[o.kind]}</Badge>
              </td>
              <td className="text-right">{o.sessions_count}</td>
              <td className="text-right font-medium">{eur(o.price_cents)}</td>
              <td className="text-right">{o.vat_rate} %</td>
              <td className="text-xs text-slate-500">
                {o.level_min ? LEVEL_SHORT[o.level_min] : "—"} → {o.level_max ? LEVEL_SHORT[o.level_max] : "—"}
              </td>
              <td>{o.is_active ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Inactif</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? editing.name ?? "" : "Nouveau tarif"}>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Field label="Nom">
                <input className="input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
            </div>
            <Field label="Activité">
              <select className="input" value={editing.activity_id ?? ""} onChange={(e) => setEditing({ ...editing, activity_id: Number(e.target.value) })}>
                {activities.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select className="input" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as OfferKind })}>
                {(Object.keys(KIND_LABELS) as OfferKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nombre de séances">
              <input type="number" className="input" value={editing.sessions_count ?? 1} onChange={(e) => setEditing({ ...editing, sessions_count: Number(e.target.value) })} />
            </Field>
            <Field label="Prix TTC (€)">
              <input type="number" step="0.01" className="input" value={(editing.price_cents ?? 0) / 100} onChange={(e) => setEditing({ ...editing, price_cents: Math.round(Number(e.target.value) * 100) })} />
            </Field>
            <Field label="TVA (%)">
              <input type="number" step="0.1" className="input" value={editing.vat_rate ?? 20} onChange={(e) => setEditing({ ...editing, vat_rate: Number(e.target.value) })} />
            </Field>
            <Field label="Durée (min)">
              <input type="number" className="input" value={editing.duration_minutes ?? ""} onChange={(e) => setEditing({ ...editing, duration_minutes: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Validité (jours, cartes)">
              <input type="number" className="input" value={editing.validity_days ?? ""} onChange={(e) => setEditing({ ...editing, validity_days: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Âge minimum">
              <input type="number" className="input" value={editing.min_age ?? ""} onChange={(e) => setEditing({ ...editing, min_age: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Niveau min">
              <select className="input" value={editing.level_min ?? ""} onChange={(e) => setEditing({ ...editing, level_min: (e.target.value || null) as Level | null })}>
                <option value="">—</option>
                {(Object.keys(LEVEL_SHORT) as Level[]).map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_SHORT[l]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Niveau max">
              <select className="input" value={editing.level_max ?? ""} onChange={(e) => setEditing({ ...editing, level_max: (e.target.value || null) as Level | null })}>
                <option value="">—</option>
                {(Object.keys(LEVEL_SHORT) as Level[]).map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_SHORT[l]}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Actif
            </label>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea className="input" rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </Field>
            </div>
          </div>
          <ErrorBox error={save.error} />
          <button className="btn-primary mt-4" onClick={() => save.mutate(editing)} disabled={save.isPending}>
            Enregistrer
          </button>
        </Modal>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Moniteurs */
function Instructors() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["instructors"], queryFn: () => api.get<Instructor[]>("/api/instructors") });
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => api.get<Site[]>("/api/sites") });
  const activities = useQuery({ queryKey: ["activities"], queryFn: () => api.get<Activity[]>("/api/activities") });
  const [editing, setEditing] = useState<Partial<Instructor> | null>(null);
  const save = useMutation({
    mutationFn: (i: Partial<Instructor>) => (i.id ? api.put(`/api/instructors/${i.id}`, i) : api.post("/api/instructors", i)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instructors"] });
      setEditing(null);
    },
  });
  if (list.isLoading) return <Loading />;
  return (
    <Card
      action={
        <button className="btn-primary !py-1.5" onClick={() => setEditing({ full_name: "", activity_slugs: [], hourly_cost_cents: 2500, is_active: true })}>
          <Plus className="w-4 h-4" /> Moniteur
        </button>
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th>Moniteur</th>
            <th>Site principal</th>
            <th>Activités</th>
            <th className="text-right">Coût horaire</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((i) => (
            <tr key={i.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setEditing(i)}>
              <td className="font-medium">{i.full_name}</td>
              <td>{sites.data?.find((s) => s.id === i.home_site_id)?.name ?? "—"}</td>
              <td className="text-xs">{i.activity_slugs.join(", ")}</td>
              <td className="text-right">{eur(i.hourly_cost_cents)}</td>
              <td>{i.is_active ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Inactif</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? editing.full_name ?? "" : "Nouveau moniteur"}>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Field label="Nom complet">
                <input className="input" value={editing.full_name ?? ""} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
              </Field>
            </div>
            <Field label="E-mail">
              <input className="input" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            </Field>
            <Field label="Téléphone">
              <input className="input" value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </Field>
            <Field label="Site principal">
              <select className="input" value={editing.home_site_id ?? ""} onChange={(e) => setEditing({ ...editing, home_site_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {sites.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Coût horaire chargé (€)" hint="Utilisé pour la rentabilité par créneau.">
              <input type="number" className="input" value={(editing.hourly_cost_cents ?? 0) / 100} onChange={(e) => setEditing({ ...editing, hourly_cost_cents: Math.round(Number(e.target.value) * 100) })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Activités encadrées">
                <div className="flex flex-wrap gap-2">
                  {activities.data?.map((a) => {
                    const on = editing.activity_slugs?.includes(a.slug);
                    return (
                      <button key={a.id} className={clsx("btn !py-1 !px-3 text-xs", on ? "btn-primary" : "btn-secondary")} onClick={() => setEditing({ ...editing, activity_slugs: on ? editing.activity_slugs?.filter((s) => s !== a.slug) : [...(editing.activity_slugs ?? []), a.slug] })}>
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Actif
            </label>
          </div>
          <ErrorBox error={save.error} />
          <button className="btn-primary mt-4" onClick={() => save.mutate(editing)} disabled={save.isPending}>
            Enregistrer
          </button>
        </Modal>
      )}
    </Card>
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
