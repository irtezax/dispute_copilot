import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatDate(value: string): string {
  const d = new Date(value);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Human countdown to a deadline, e.g. "21h 4m" or "3d 4h". */
export function formatRemaining(iso: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  if (Number.isNaN(diff)) return "—";
  if (diff <= 0) return "overdue";
  const minutes = Math.floor(diff / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function hoursUntil(iso: string, now: number = Date.now()): number {
  return (new Date(iso).getTime() - now) / 3_600_000;
}

export function confidenceTone(score: number): {
  chip: string;
  dot: string;
  label: string;
} {
  if (score >= 70) {
    return {
      chip: "bg-signal-faint text-signal border-signal/30",
      dot: "bg-signal",
      label: "High",
    };
  }
  if (score >= 40) {
    return {
      chip: "bg-alert-faint text-alert border-alert/30",
      dot: "bg-alert",
      label: "Medium",
    };
  }
  return { chip: "bg-danger-faint text-danger border-danger/30", dot: "bg-danger", label: "Low" };
}

export function statusTone(status: string): { chip: string; label: string } {
  switch (status) {
    case "REQUIRED_ACTION":
      return { chip: "bg-alert-faint text-alert border-alert/30", label: "Action needed" };
    case "UNDER_REVIEW":
      return { chip: "bg-fintech-faint text-fintech border-fintech/30", label: "Under review" };
    case "RESOLVED":
      return { chip: "bg-signal-faint text-signal border-signal/30", label: "Resolved" };
    default:
      return { chip: "bg-ink-700/40 text-slate-300 border-ink-600/60", label: status };
  }
}