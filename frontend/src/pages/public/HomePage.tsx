import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Compass, Gift, MapPin, Sparkles, Ticket, Waves } from "lucide-react";
import { api } from "@/lib/api";
import type { Activity, Site } from "@/lib/types";
import { Loading } from "@/components/ui";

export default function HomePage() {
  const activities = useQuery({ queryKey: ["activities"], queryFn: () => api.get<Activity[]>("/api/activities") });
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => api.get<Site[]>("/api/sites") });

  return (
    <div>
      <section className="relative overflow-hidden bg-ocean-950 text-white">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top_left,_#3bacd0_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#c39043_0%,_transparent_50%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ocean-300 mb-5">
            <Waves className="w-4 h-4" /> Saint-Hilaire-de-Riez · Vendée
          </p>
          <h1 className="text-3xl sm:text-6xl font-semibold text-white leading-[1.1] max-w-3xl">
            Réservez votre session en trois clics, on s'occupe des vagues.
          </h1>
          <p className="mt-6 text-lg text-ocean-100 max-w-2xl">
            Dites-nous votre niveau : nous croisons marées, houle, vent et places disponibles pour vous proposer le meilleur spot et le meilleur créneau, à La Pège ou aux Demoiselles.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row flex-wrap gap-3">
            <Link to="/reserver" className="btn bg-white text-ocean-900 hover:bg-ocean-50 !px-6 !py-3 text-base w-full sm:w-auto justify-center">
              Réserver une séance <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/bon-cadeau" className="btn bg-white/10 text-white hover:bg-white/15 !px-6 !py-3 text-base w-full sm:w-auto justify-center">
              <Gift className="w-4 h-4" /> Offrir un bon cadeau
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 -mt-10 relative">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Compass, title: "Le bon spot pour vous", text: "Débutant ? Cap sur les Demoiselles. Confirmé ? La Pège et ses vagues plus engagées." },
            { icon: Sparkles, title: "Créneaux vraiment disponibles", text: "Vous ne voyez que les horaires où un cours est programmé, avec des places, et adapté à votre niveau." },
            { icon: Ticket, title: "Cartes & bons cadeaux", text: "Cartes 5, 10 ou 20 séances à réserver quand vous voulez ; bons cadeaux valables toute l'année." },
          ].map((f) => (
            <div key={f.title} className="card p-6">
              <f.icon className="w-6 h-6 text-ocean-600 mb-3" />
              <h3 className="font-semibold text-base">{f.title}</h3>
              <p className="text-sm text-slate-500 mt-1.5">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-semibold mb-6">Nos activités</h2>
        {activities.isLoading ? (
          <Loading />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activities.data?.map((a) => (
              <Link key={a.id} to={`/reserver/${a.slug}`} className="card p-6 group hover:-translate-y-0.5 transition border-l-4" style={{ borderLeftColor: a.color }}>
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-lg">{a.name}</h3>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-ocean-600 transition" />
                </div>
                <p className="text-sm text-slate-500 mt-2 min-h-[40px]">{a.description}</p>
                <p className="text-xs text-slate-400 mt-4">
                  {a.default_duration_minutes} min · {a.default_capacity} pers. max {a.requires_conditions && "· selon marée & météo"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-2xl font-semibold mb-6">Nos écoles</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {sites.data?.map((s) => (
              <article key={s.id} className="card p-6">
                <div className="flex items-center gap-2 text-ocean-700 text-sm font-medium">
                  <MapPin className="w-4 h-4" /> {s.city}
                </div>
                <h3 className="text-xl font-semibold mt-2">École de surf {s.name}</h3>
                <p className="text-sm text-slate-500 mt-2">{s.description}</p>
                <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
                  <span>Niveau d'exposition</span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <span key={i} className={`h-1.5 w-3 rounded-sm ${i < s.exposure_score ? "bg-ocean-500" : "bg-slate-200"}`} />
                    ))}
                  </div>
                  <span>{s.exposure_score <= 4 ? "Idéal débutants" : s.exposure_score >= 7 ? "Confirmés" : "Tous niveaux"}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
