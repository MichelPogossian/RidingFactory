import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api, eur } from "@/lib/api";
import type { Activity, Product } from "@/lib/types";
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader } from "@/components/ui";
import { useSites } from "@/components/SiteSelect";

type ProductForm = Omit<Product, "id">;
const empty: ProductForm = { name: "", sku: "", category: "boutique", price_cents: 0, cost_cents: null, vat_rate: 20, stock: null, supplier: "", site_id: null, activity_id: null, is_active: true };
const CATEGORIES = ["creme_solaire", "vetements", "accessoires", "boutique", "location"];

export default function ProductsPage() {
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const list = useQuery({ queryKey: ["products-all"], queryFn: () => api.get<Product[]>("/api/products", { include_inactive: true }) });

  return (
    <div>
      <PageHeader
        title="Produits & stock"
        subtitle="Catalogue boutique : catégorie, prix, TVA, fournisseur, stock et coût d'achat pour la marge."
        actions={
          <button className="btn-primary" onClick={() => setEditing("new")}>
            <Plus className="w-4 h-4" /> Nouveau produit
          </button>
        }
      />
      <Card>
        {list.isLoading ? (
          <Loading />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>SKU</th>
                <th>Catégorie</th>
                <th>Fournisseur</th>
                <th className="text-right">Prix TTC</th>
                <th className="text-right">Coût</th>
                <th className="text-right">Marge</th>
                <th className="text-right">TVA</th>
                <th className="text-right">Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((p) => {
                const ht = p.price_cents / (1 + p.vat_rate / 100);
                const margin = p.cost_cents != null ? ((ht - p.cost_cents) / ht) * 100 : null;
                return (
                  <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setEditing(p)}>
                    <td className="font-medium">{p.name}</td>
                    <td className="font-mono text-xs text-slate-500">{p.sku}</td>
                    <td>
                      <Badge>{p.category}</Badge>
                    </td>
                    <td className="text-slate-500">{p.supplier ?? "—"}</td>
                    <td className="text-right font-medium">{eur(p.price_cents, 2)}</td>
                    <td className="text-right text-slate-500">{p.cost_cents != null ? eur(p.cost_cents, 2) : "—"}</td>
                    <td className="text-right">{margin != null ? `${margin.toFixed(0)} %` : "—"}</td>
                    <td className="text-right">{p.vat_rate} %</td>
                    <td className={`text-right font-medium ${p.stock !== null && p.stock <= 5 ? "text-amber-600" : ""}`}>{p.stock ?? "∞"}</td>
                    <td>{!p.is_active && <Badge tone="red">Inactif</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {editing && <ProductModal product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProductModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const qc = useQueryClient();
  const sites = useSites();
  const activities = useQuery({ queryKey: ["activities"], queryFn: () => api.get<Activity[]>("/api/activities") });
  const [form, setForm] = useState<ProductForm>(product ? { ...product } : empty);
  const save = useMutation({
    mutationFn: () => (product ? api.put(`/api/products/${product.id}`, { ...form, sku: form.sku || null, supplier: form.supplier || null }) : api.post("/api/products", { ...form, sku: form.sku || null, supplier: form.supplier || null })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products-all"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
  });
  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => setForm({ ...form, [k]: v });
  return (
    <Modal open onClose={onClose} title={product ? product.name : "Nouveau produit"}>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Field label="Nom">
            <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
        </div>
        <Field label="SKU">
          <input className="input" value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value)} />
        </Field>
        <Field label="Catégorie">
          <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Prix TTC (€)">
          <input type="number" step="0.01" className="input" value={form.price_cents / 100} onChange={(e) => set("price_cents", Math.round(Number(e.target.value) * 100))} />
        </Field>
        <Field label="Coût d'achat (€)">
          <input type="number" step="0.01" className="input" value={form.cost_cents != null ? form.cost_cents / 100 : ""} onChange={(e) => set("cost_cents", e.target.value ? Math.round(Number(e.target.value) * 100) : null)} />
        </Field>
        <Field label="TVA (%)">
          <select className="input" value={form.vat_rate} onChange={(e) => set("vat_rate", Number(e.target.value))}>
            {[20, 10, 5.5, 2.1, 0].map((r) => (
              <option key={r} value={r}>
                {r} %
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stock (vide = illimité)">
          <input type="number" className="input" value={form.stock ?? ""} onChange={(e) => set("stock", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Fournisseur">
          <input className="input" value={form.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)} />
        </Field>
        <Field label="Point de vente">
          <select className="input" value={form.site_id ?? ""} onChange={(e) => set("site_id", e.target.value ? Number(e.target.value) : null)}>
            <option value="">Tous</option>
            {sites.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Activité rattachée">
          <select className="input" value={form.activity_id ?? ""} onChange={(e) => set("activity_id", e.target.value ? Number(e.target.value) : null)}>
            <option value="">Aucune</option>
            {activities.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Actif
        </label>
      </div>
      <ErrorBox error={save.error} />
      <button className="btn-primary mt-4" onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
        Enregistrer
      </button>
    </Modal>
  );
}
