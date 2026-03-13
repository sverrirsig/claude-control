"use client";

import { PrStatus } from "@/lib/types";

function checksTooltip(pr: PrStatus): string {
  const parts: string[] = [];

  if (pr.checksDetail) {
    const d = pr.checksDetail;
    if (pr.checks === "passing") parts.push(`${d.total} checks passing`);
    else if (pr.checks === "failing") parts.push(`${d.failing} failing, ${d.passing} passing`);
    else if (pr.checks === "pending") parts.push(`${d.pending} pending, ${d.passing} passing`);
  }

  if (pr.reviewDecision === "APPROVED") parts.push("Approved");
  else if (pr.reviewDecision === "CHANGES_REQUESTED") parts.push("Changes requested");
  else if (pr.reviewDecision === "REVIEW_REQUIRED") parts.push("Review required");

  if (pr.unresolvedThreads > 0) parts.push(`${pr.unresolvedThreads} unresolved`);
  if (pr.mergeStateStatus === "BEHIND") parts.push("Behind base branch");
  if (pr.mergeable === "CONFLICTING") parts.push("Has conflicts");
  if (pr.mergeStateStatus === "BLOCKED") parts.push("Merge blocked");

  if (pr.state === "MERGED") return "PR merged";
  if (pr.state === "CLOSED") return "PR closed";
  return parts.join(" · ") || "PR open";
}

function overallColor(pr: PrStatus): string {
  if (pr.state === "MERGED") return "purple";
  if (pr.state === "CLOSED") return "red";
  if (pr.checks === "failing" || pr.mergeable === "CONFLICTING") return "red";
  if (pr.checks === "pending") return "amber";
  if (pr.unresolvedThreads > 0 || pr.mergeStateStatus === "BEHIND" || pr.mergeStateStatus === "BLOCKED") return "amber";
  if (pr.checks === "passing" && pr.reviewDecision === "APPROVED") return "green";
  if (pr.checks === "passing") return "green";
  return "zinc";
}

export function PrStatusBadge({ pr }: { pr: PrStatus }) {
  const color = overallColor(pr);

  const borderColors: Record<string, string> = {
    green: "border-emerald-500/[0.15] bg-emerald-500/[0.06]",
    red: "border-red-500/[0.15] bg-red-500/[0.06]",
    amber: "border-amber-500/[0.12] bg-amber-500/[0.05]",
    purple: "border-violet-500/[0.15] bg-violet-500/[0.06]",
    zinc: "border-white/[0.08] bg-white/[0.03]",
  };

  // Merged or closed — show a simple badge
  if (pr.state === "MERGED") {
    return (
      <div
        className={`has-tooltip inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] ${borderColors.purple}`}
        data-tip="PR merged"
      >
        <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        <span className="font-medium text-violet-400">Merged</span>
      </div>
    );
  }

  if (pr.state === "CLOSED") {
    return (
      <div
        className={`has-tooltip inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] ${borderColors.red}`}
        data-tip="PR closed"
      >
        <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span className="font-medium text-red-400">Closed</span>
      </div>
    );
  }

  const items: React.ReactNode[] = [];

  // CI checks
  if (pr.checksDetail && pr.checks !== "none") {
    const checkColor = pr.checks === "passing" ? "green" : pr.checks === "failing" ? "red" : "amber";
    const icon = pr.checks === "passing" ? (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ) : pr.checks === "failing" ? (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ) : (
      <span className="w-3 h-3 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
    );

    items.push(
      <span key="checks" className={`inline-flex items-center gap-1 ${checkColor === "green" ? "text-emerald-400" : checkColor === "red" ? "text-red-400" : "text-amber-400"}`}>
        {icon}
        <span className="font-mono font-medium">{pr.checksDetail.passing}/{pr.checksDetail.total}</span>
      </span>
    );
  }

  // Unresolved conversations
  if (pr.unresolvedThreads > 0) {
    items.push(
      <span key="threads" className="inline-flex items-center gap-1 text-amber-400">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        <span className="font-mono font-medium">{pr.unresolvedThreads}</span>
      </span>
    );
  }

  // Review decision
  if (pr.reviewDecision === "APPROVED") {
    items.push(
      <span key="review" className="inline-flex items-center text-emerald-400">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
    );
  } else if (pr.reviewDecision === "CHANGES_REQUESTED") {
    items.push(
      <span key="review" className="inline-flex items-center text-red-400">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
      </span>
    );
  }

  // Behind base branch
  if (pr.mergeStateStatus === "BEHIND") {
    items.push(
      <span key="behind" className="inline-flex items-center gap-1 text-amber-400">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
        </svg>
      </span>
    );
  }

  // Conflicts
  if (pr.mergeable === "CONFLICTING") {
    items.push(
      <span key="conflict" className="inline-flex items-center text-red-400 font-bold text-[10px]">!</span>
    );
  }

  if (items.length === 0) return null;

  return (
    <div
      className={`has-tooltip inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] ${borderColors[color] || borderColors.zinc}`}
      data-tip={checksTooltip(pr)}
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="w-px h-3 bg-white/[0.08]" />}
          {item}
        </span>
      ))}
    </div>
  );
}
