import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import {
  BarChart3,
  Bot,
  CalendarDays,
  CloudSun,
  FileText,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Ticket,
  Users,
  Waves,
  X,
  ClipboardList,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

const groups = [
  {
    title: "Pilotage",
    items: [
      { to: "/admin", label: "Tableau de bord", icon: LayoutDashboard, end: true },
      { to: "/admin/analyses", label: "Analyses & rentabilité", icon: BarChart3 },
      { to: "/admin/assistant", label: "Assistant IA", icon: Bot },
    ],
  },
  {
    title: "Exploitation",
    items: [
      { to: "/admin/planning", label: "Planning", icon: CalendarDays },
      { to: "/admin/reservations", label: "Réservations", icon: ClipboardList },
      { to: "/admin/clients", label: "Clients", icon: Users },
      { to: "/admin/conditions", label: "Marées & météo", icon: CloudSun },
    ],
  },
  {
    title: "Ventes",
    items: [
      { to: "/admin/caisse", label: "Caisse", icon: ShoppingCart },
      { to: "/admin/produits", label: "Produits & stock", icon: Package },
      { to: "/admin/bons-cadeaux", label: "Bons cadeaux", icon: Gift },
      { to: "/admin/cartes", label: "Cartes multi-séances", icon: Ticket },
      { to: "/admin/facturation", label: "Devis & factures", icon: FileText },
    ],
  },
  {
    title: "Configuration",
    items: [{ to: "/admin/catalogue", label: "Sites, activités, tarifs", icon: Settings }],
  },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", open);
    return () => document.body.classList.remove("overflow-hidden");
  }, [open]);

  const sidebar = (
    <aside className="w-[min(18rem,88vw)] lg:w-64 shrink-0 bg-ocean-950 text-ocean-100 flex flex-col h-full">
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/10">
        <span className="w-9 h-9 rounded-xl bg-ocean-500 text-white grid place-items-center">
          <Waves className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-white leading-tight">Riding Factory</p>
          <p className="text-[11px] text-ocean-300 uppercase tracking-wider">Back-office</p>
        </div>
        <button type="button" className="lg:hidden p-2 rounded-lg text-ocean-200 hover:bg-white/10 hover:text-white" aria-label="Fermer le menu" onClick={() => setOpen(false)}>
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ocean-400">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={"end" in it && it.end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition", isActive ? "bg-white/10 text-white font-medium" : "text-ocean-200 hover:bg-white/5 hover:text-white")
                    }
                  >
                    <it.icon className="w-4 h-4" />
                    {it.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10">
        <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
        <p className="text-xs text-ocean-300 truncate">{user?.email} · {user?.role}</p>
        <button
          onClick={() => {
            logout();
            navigate("/admin/login");
          }}
          className="mt-3 w-full btn bg-white/10 text-white hover:bg-white/15 !py-2"
        >
          <LogOut className="w-4 h-4" /> Déconnexion
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-dvh flex bg-slate-50 overflow-x-hidden">
      <div className="hidden lg:block sticky top-0 h-dvh">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="h-full shadow-2xl">{sidebar}</div>
          <button type="button" className="flex-1 bg-black/40" aria-label="Fermer le menu" onClick={() => setOpen(false)} />
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden h-14 flex items-center gap-3 px-4 bg-white border-b border-slate-100 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
          <button type="button" onClick={() => setOpen(true)} className="btn-ghost p-2" aria-label="Ouvrir le menu">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-display font-semibold truncate">Riding Factory</span>
        </header>
        <main className="flex-1 min-w-0 overflow-x-auto p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
