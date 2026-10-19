import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[96px] w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus-visible:border-signal/60 focus-visible:ring-2 focus-visible:ring-signal/30 disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";