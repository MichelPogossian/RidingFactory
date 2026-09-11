import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Send, Sparkles, User } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import type { AssistantOut } from "@/lib/types";
import { PageHeader, Spinner } from "@/components/ui";
import { SiteSelect } from "@/components/SiteSelect";

type Msg = { role: "user" | "assistant"; text: string; intent?: string; engine?: string };

export default function AssistantPage() {
  const [siteId, setSiteId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "Bonjour ! Je réponds à vos questions de pilotage à partir des données réelles : rentabilité, chiffre d'affaires, remplissage, places disponibles, stages peu remplis, créneaux à ouvrir. Posez votre question ou choisissez une suggestion." },
  ]);
  const suggestions = useQuery({ queryKey: ["suggestions"], queryFn: () => api.get<string[]>("/api/assistant/suggestions") });
  const ask = useMutation({
    mutationFn: (question: string) => api.post<AssistantOut>("/api/assistant", { question, site_id: siteId }),
    onSuccess: (r) => setMsgs((m) => [...m, { role: "assistant", text: r.answer, intent: r.intent, engine: r.engine }]),
    onError: (e) => setMsgs((m) => [...m, { role: "assistant", text: `Erreur : ${e instanceof Error ? e.message : e}` }]),
  });
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = (q: string) => {
    if (!q.trim()) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    ask.mutate(q);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-7.5rem)] lg:h-[calc(100dvh-4rem)]">
      <PageHeader title="Assistant IA" subtitle="Aide à la décision en langage naturel. Moteur d'analyse interne, enrichi par un LLM si une clé OpenAI est configurée." actions={<SiteSelect value={siteId} onChange={setSiteId} />} />
      <div className="card flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {msgs.map((m, i) => (
            <div key={i} className={clsx("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <span className={clsx("w-8 h-8 rounded-full grid place-items-center shrink-0", m.role === "user" ? "bg-slate-200 text-slate-700" : "bg-ocean-600 text-white")}>{m.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}</span>
              <div className={clsx("max-w-[min(85%,28rem)] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed", m.role === "user" ? "bg-ocean-600 text-white" : "bg-slate-50 border border-slate-100")}>
                {m.text.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part))}
                {m.intent && (
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-2">
                    {m.intent} · {m.engine === "llm" ? "LLM" : "moteur de règles"}
                  </p>
                )}
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="flex gap-3">
              <span className="w-8 h-8 rounded-full grid place-items-center bg-ocean-600 text-white">
                <Bot className="w-4 h-4" />
              </span>
              <div className="rounded-2xl px-4 py-3 bg-slate-50 border border-slate-100">
                <Spinner className="w-4 h-4" />
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>
        <div className="border-t border-slate-100 p-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {suggestions.data?.map((s) => (
              <button key={s} className="btn-secondary !py-1 !px-3 text-xs" onClick={() => send(s)}>
                <Sparkles className="w-3 h-3" /> {s}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input className="input" placeholder="Posez votre question…" value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="btn-primary shrink-0" disabled={!input.trim() || ask.isPending}>
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
