"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function SessionError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error("Session error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-32">
      <p className="text-zinc-400 text-base mb-3">Session unavailable</p>
      <p className="text-zinc-600 text-sm mb-6">The session may have been closed.</p>
      <Link
        href="/"
        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
