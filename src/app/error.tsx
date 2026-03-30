"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-32">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <p className="text-zinc-400 text-base font-medium mb-2">Something went wrong</p>
      <p className="text-zinc-600 text-sm mb-6 max-w-xs text-center">A session may have disappeared while the page was rendering.</p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 transition-colors"
      >
        Reload dashboard
      </button>
    </div>
  );
}
