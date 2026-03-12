import { SessionStatus } from "@/lib/types";

const statusConfig: Record<SessionStatus, { label: string; dotColor: string; textColor: string; bgColor: string; pulse: boolean }> = {
  working: { label: "Working", dotColor: "bg-emerald-400", textColor: "text-emerald-300", bgColor: "bg-emerald-500/10", pulse: true },
  idle: { label: "Idle", dotColor: "bg-amber-400", textColor: "text-amber-300", bgColor: "bg-amber-500/10", pulse: false },
  waiting: { label: "Waiting", dotColor: "bg-blue-400", textColor: "text-blue-300", bgColor: "bg-blue-500/10", pulse: true },
  errored: { label: "Error", dotColor: "bg-red-400", textColor: "text-red-300", bgColor: "bg-red-500/10", pulse: false },
  finished: { label: "Finished", dotColor: "bg-zinc-500", textColor: "text-zinc-400", bgColor: "bg-zinc-500/10", pulse: false },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${config.textColor} ${config.bgColor}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotColor} ${config.pulse ? "animate-soft-pulse" : ""}`} />
      {config.label}
    </span>
  );
}
