"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof Dialog.Content>,
  React.ComponentPropsWithoutRef<typeof Dialog.Content>
>(({ className, children, ...props }, ref) => (
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm" />
    <Dialog.Content
      ref={ref}
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-ink-700 bg-ink-900 shadow-2xl shadow-black/50 outline-none",
        className,
      )}
      {...props}
    >
      <Dialog.Close className="absolute right-4 top-4 rounded-md p-1 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-100">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </Dialog.Close>
      {children}
    </Dialog.Content>
  </Dialog.Portal>
));
SheetContent.displayName = "SheetContent";

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("shrink-0 border-b border-ink-700 px-6 py-5 pr-12", className)} {...props} />
);

export const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("shrink-0 border-t border-ink-700 bg-ink-850/80 px-6 py-4", className)}
    {...props}
  />
);

export const SheetTitle = Dialog.Title;
export const SheetDescription = Dialog.Description;