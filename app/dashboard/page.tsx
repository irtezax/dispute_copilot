import dynamic from "next/dynamic";

const DisputeDashboard = dynamic(() => import("@/components/DisputeDashboard"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-signal border-t-transparent" />
      <p className="text-sm font-mono">booting dispute queue…</p>
    </div>
  ),
});

export default function DashboardPage() {
  return <DisputeDashboard />;
}