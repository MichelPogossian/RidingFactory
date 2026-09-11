import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Minus, Plus, Receipt, ShoppingCart, Trash2 } from "lucide-react";
import { api, eur } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Offer, PaymentMethod, Product, Sale } from "@/lib/types";
import { KIND_LABELS, PAYMENT_LABELS } from "@/lib/types";
import { Badge, Card, ErrorBox, Field, PageHeader, Spinner } from "@/components/ui";
import { SiteSelect } from "@/components/SiteSelect";

type CartLine = { key: string; label: string; unit: number; qty: number; product_id?: number; offer_id?: number; vat: number };

const CATEGORIES: Record<string, string> = { creme_solaire: "Crème solaire", vetements: "Vêtements", accessoires: "Accessoires", boutique: "Boutique", location: "Location" };

export default function PosPage() {
  const qc = useQueryClient();
  const [siteId, setSiteId] = useState<number | null>(1);
  const [tab, setTab] = useState<"products" | "offers">("products");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("card_terminal");
  const [voucher, setVoucher] = useState("");
  const [last, setLast] = useState<Sale | null>(null);
  const products = useQuery({ queryKey: ["products"], queryFn: () => api.get<Product[]>("/api/products") });
  const offers = useQuery({ queryKey: ["offers-all"], queryFn: () => api.get<Offer[]>("/api/offers") });
  const sales = useQuery({ queryKey: ["sales-today", siteId], queryFn: () => api.get<Sale[]>("/api/sales", { date_from: new Date().toISOString().slice(0, 10), site_id: siteId, limit: 20 }) });

  const total = useMemo(() => cart.reduce((a, l) => a + l.unit * l.qty, 0), [cart]);
  const add = (line: Omit<CartLine, "qty">) =>
    setCart((c) => {
      const ex = c.find((l) => l.key === line.key);
      return ex ? c.map((l) => (l.key === line.key ? { ...l, qty: l.qty + 1 } : l)) : [...c, { ...line, qty: 1 }];
    });
  const setQty = (key: string, qty: number) => setCart((c) => (qty <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, qty } : l))));

  const checkout = useMutation({
    mutationFn: () =>
      api.post<Sale>("/api/sales", {
        site_id: siteId,
        payment_method: method,
        voucher_code: voucher || null,
        lines: cart.map((l) => ({ product_id: l.product_id, offer_id: l.offer_id, label: l.label, quantity: l.qty, unit_price_cents: l.unit, vat_rate: l.vat })),
      }),
    onSuccess: (s) => {
      setLast(s);
      setCart([]);
      setVoucher("");
      qc.invalidateQueries({ queryKey: ["sales-today"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const grouped = useMemo(() => {
    const m: Record<string, Product[]> = {};
    for (const p of products.data ?? []) (m[p.category] ??= []).push(p);
    return m;
  }, [products.data]);

  return (
    <div>
      <PageHeader title="Caisse" subtitle="Vente de produits boutique, cours, cartes et locations." actions={<SiteSelect value={siteId} onChange={setSiteId} allLabel="Point de vente…" />} />
      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        <div>
          <div className="flex gap-2 mb-4">
            <button className={clsx("btn", tab === "products" ? "btn-primary" : "btn-secondary")} onClick={() => setTab("products")}>
              Produits
            </button>
            <button className={clsx("btn", tab === "offers" ? "btn-primary" : "btn-secondary")} onClick={() => setTab("offers")}>
              Cours, cartes & locations
            </button>
          </div>
          {tab === "products" ? (
            <div className="space-y-6">
              {Object.entries(grouped).map(([cat, list]) => (
                <div key={cat}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{CATEGORIES[cat] ?? cat}</h3>
                  <div className="grid sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    {list.map((p) => (
                      <button key={p.id} disabled={p.stock === 0} onClick={() => add({ key: `p${p.id}`, label: p.name, unit: p.price_cents, product_id: p.id, vat: p.vat_rate })} className="card p-4 text-left hover:border-ocean-300 transition disabled:opacity-40">
                        <p className="font-medium text-sm leading-tight">{p.name}</p>
                        <div className="flex justify-between items-end mt-3">
                          <span className="font-display font-semibold">{eur(p.price_cents, 2)}</span>
                          {p.stock !== null && <span className={clsx("text-xs", p.stock <= 5 ? "text-amber-600" : "text-slate-400")}>stock {p.stock}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {offers.data?.map((o) => (
                <button key={o.id} onClick={() => add({ key: `o${o.id}`, label: o.name, unit: o.price_cents, offer_id: o.id, vat: o.vat_rate })} className="card p-4 text-left hover:border-ocean-300 transition">
                  <Badge tone={o.kind === "pass_card" ? "amber" : o.kind === "course" ? "violet" : o.kind === "rental" ? "slate" : "blue"}>{KIND_LABELS[o.kind]}</Badge>
                  <p className="font-medium text-sm mt-2">{o.name}</p>
                  <p className="font-display font-semibold mt-2">{eur(o.price_cents)}</p>
                </button>
              ))}
              <p className="sm:col-span-2 xl:col-span-3 text-xs text-slate-400">Pour vendre une carte multi-séances nominative ou un bon cadeau avec code, utilisez les écrans dédiés « Cartes » et « Bons cadeaux ». Pour placer un client sur un créneau, passez par le planning.</p>
            </div>
          )}

          <Card className="mt-6" title="Ventes du jour">
            <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Heure</th>
                  <th>Réf.</th>
                  <th>Lignes</th>
                  <th>Paiement</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.data?.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDateTime(s.created_at)}</td>
                    <td className="font-mono text-xs">{s.reference}</td>
                    <td className="text-xs text-slate-500">{s.lines.map((l) => `${l.quantity}× ${l.label}`).join(", ")}</td>
                    <td className="text-xs">{PAYMENT_LABELS[s.payment_method]}</td>
                    <td className="text-right font-medium">{eur(s.total_cents, 2)}</td>
                  </tr>
                ))}
                {sales.data?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-400">
                      Aucune vente aujourd'hui
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </Card>
        </div>

        <aside className="card p-5 h-fit lg:sticky lg:top-6">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <ShoppingCart className="w-4 h-4" /> Ticket
          </h3>
          {cart.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Ajoutez des articles</p>
          ) : (
            <ul className="space-y-2">
              {cart.map((l) => (
                <li key={l.key} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{l.label}</p>
                    <p className="text-xs text-slate-500">{eur(l.unit, 2)} · TVA {l.vat}%</p>
                  </div>
                  <button className="btn-ghost !p-1" onClick={() => setQty(l.key, l.qty - 1)}>
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-5 text-center">{l.qty}</span>
                  <button className="btn-ghost !p-1" onClick={() => setQty(l.key, l.qty + 1)}>
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-16 text-right font-medium">{eur(l.unit * l.qty, 2)}</span>
                  <button className="btn-ghost !p-1 text-rose-600" onClick={() => setQty(l.key, 0)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 mt-4 pt-4 space-y-3">
            <div className="flex justify-between text-lg font-semibold">
              <span>Total TTC</span>
              <span>{eur(total, 2)}</span>
            </div>
            <Field label="Moyen de paiement">
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {(["card_terminal", "cash", "check", "transfer"] as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bon cadeau">
              <input className="input uppercase" placeholder="BC-XXXXXXXX" value={voucher} onChange={(e) => setVoucher(e.target.value)} />
            </Field>
            <ErrorBox error={checkout.error} />
            <button className="btn-primary w-full" disabled={!cart.length || !siteId || checkout.isPending} onClick={() => checkout.mutate()}>
              {checkout.isPending ? <Spinner className="w-4 h-4 text-white" /> : <Receipt className="w-4 h-4" />} Encaisser {eur(total, 2)}
            </button>
            {!siteId && <p className="text-xs text-amber-600">Choisissez un point de vente.</p>}
            {last && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-800">
                Vente <strong>{last.reference}</strong> enregistrée ({eur(last.total_cents, 2)}).
                <a className="underline ml-1" href="/admin/facturation">
                  Générer une facture
                </a>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
