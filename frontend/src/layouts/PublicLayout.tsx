import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, Waves, X } from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { to: "/reserver", label: "Réserver" },
  { to: "/bon-cadeau", label: "Bon cadeau" },
  { to: "/cartes", label: "Cartes multi-séances" },
];

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", open);
    return () => document.body.classList.remove("overflow-hidden");
  }, [open]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      "block px-3 py-2.5 rounded-lg text-sm font-medium transition",
      isActive ? "bg-ocean-50 text-ocean-800" : "text-slate-600 hover:text-ocean-800 hover:bg-slate-50",
    );

  return (
    <div className="min-h-dvh flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100 pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 shrink-0 rounded-xl bg-ocean-600 text-white grid place-items-center">
              <Waves className="w-5 h-5" />
            </span>
            <span className="font-display font-semibold text-base sm:text-lg text-ocean-950 truncate">Riding Factory</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass}>
                {n.label}
              </NavLink>
            ))}
            <Link to="/admin" className="btn-secondary !py-1.5 ml-2">
              Espace équipe
            </Link>
          </nav>
          <button
            type="button"
            className="md:hidden btn-ghost p-2 shrink-0"
            aria-expanded={open}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {open && (
          <div className="md:hidden border-t border-slate-100 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 space-y-1 shadow-lg">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass}>
                {n.label}
              </NavLink>
            ))}
            <Link to="/admin" className="btn-primary w-full mt-2">
              Espace équipe
            </Link>
          </div>
        )}
      </header>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
      <footer className="border-t border-slate-100 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-sm text-slate-500 flex flex-col sm:flex-row sm:flex-wrap justify-between gap-4">
          <p>© {new Date().getFullYear()} Riding Factory · Écoles de surf de La Pège et des Demoiselles · Saint-Hilaire-de-Riez, Vendée</p>
          <p>Surf · Paddle · Skate · Natation · Location</p>
        </div>
      </footer>
    </div>
  );
}
