import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dispute Copilot — PayPal Merchant Dispute Dashboard",
  description:
    "AI-powered financial operations dashboard for PayPal merchants: webhook-driven dispute ingest, AI evidence drafting with human-in-the-loop review, and a full compliance audit trail.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ink-950 font-sans text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}