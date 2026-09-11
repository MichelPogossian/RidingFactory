import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Site } from "@/lib/types";

export function useSites() {
  return useQuery({ queryKey: ["sites"], queryFn: () => api.get<Site[]>("/api/sites") });
}

export function SiteSelect({ value, onChange, allLabel = "Toutes les écoles", className }: { value: number | null; onChange: (v: number | null) => void; allLabel?: string; className?: string }) {
  const sites = useSites();
  return (
    <select className={className ?? "input w-full sm:w-auto"} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{allLabel}</option>
      {sites.data?.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
