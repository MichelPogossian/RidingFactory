import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export const fmtDate = (iso: string, pattern = "EEE d MMM") => format(parseISO(iso), pattern, { locale: fr });
export const fmtTime = (iso: string) => format(parseISO(iso), "HH:mm", { locale: fr });
export const fmtDateTime = (iso: string) => format(parseISO(iso), "EEE d MMM · HH:mm", { locale: fr });
export const fmtLongDate = (iso: string) => format(parseISO(iso), "EEEE d MMMM yyyy", { locale: fr });
export const isoDay = (d: Date) => format(d, "yyyy-MM-dd");
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
