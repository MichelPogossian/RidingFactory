import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Waves } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth";
import { ErrorBox, Field, Spinner } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@ridingfactory.fr");
  const [password, setPassword] = useState("admin123");
  const setSession = useAuth((s) => s.setSession);
  const navigate = useNavigate();

  const login = useMutation({
    mutationFn: () => api.post<{ access_token: string; user: User }>("/api/auth/login", { email, password }),
    onSuccess: (data) => {
      setSession(data.access_token, data.user);
      navigate("/admin");
    },
  });

  return (
    <div className="min-h-screen grid place-items-center bg-ocean-950 p-4">
      <form
        className="card w-full max-w-sm p-8"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <div className="flex items-center gap-3 mb-6">
          <span className="w-10 h-10 rounded-xl bg-ocean-600 text-white grid place-items-center">
            <Waves className="w-5 h-5" />
          </span>
          <div>
            <p className="font-display font-semibold text-lg leading-tight">Riding Factory</p>
            <p className="text-xs text-slate-500">Espace équipe</p>
          </div>
        </div>
        <div className="space-y-4">
          <Field label="E-mail">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Mot de passe">
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorBox error={login.error} />
          <button className="btn-primary w-full" disabled={login.isPending}>
            {login.isPending && <Spinner className="w-4 h-4 text-white" />} Se connecter
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-6">Démo : admin@ridingfactory.fr / admin123 · accueil@ridingfactory.fr / accueil123</p>
      </form>
    </div>
  );
}
