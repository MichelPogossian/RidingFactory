import { Link, NavLink, Outlet } from "react-router-dom";
import { Waves } from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { to: "/reserver", label: "Réserver" },
  { to: "/bon-cadeau", label: "Bon cadeau" },
  { to: "/cartes", label: "Cartes multi-séances" },
];

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-ocean-600 text-white grid place-items-center">
              <Waves className="w-5 h-5" />
            </span>
            <span className="font-display font-semibold text-lg text-ocean-950">Riding Factory</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => clsx("px-3 py-2 rounded-lg text-sm font-medium transition", isActive ? "bg-ocean-50 text-ocean-800" : "text-slate-600 hover:text-ocean-800 hover:bg-slate-50")}>
                {n.label}
              </NavLink>
            ))}
            <Link to="/admin" className="hidden sm:inline-flex btn-secondary !py-1.5 ml-2">
              Espace équipe
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-sm text-slate-500 flex flex-wrap justify-between gap-4">
          <p>© {new Date().getFullYear()} Riding Factory · Écoles de surf de La Pège et des Demoiselles · Saint-Hilaire-de-Riez, Vendée</p>
          <p>Surf · Paddle · Skate · Natation · Location</p>
        </div>
      </footer>
    </div>
  );
}
