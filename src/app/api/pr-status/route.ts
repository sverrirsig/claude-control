import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { PrStatus, PrChecks } from "@/lib/types";

const execFileAsync = promisify(execFile);

// Cache: prUrl → { data, timestamp }
const cache = new Map<string, { data: PrStatus; ts: number }>();
const CACHE_TTL_MS = 30_000;

function parsePrNumber(prUrl: string): { owner: string; repo: string; number: number } | null {
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: parseInt(match[3]) };
}

async function fetchReviewThreads(
  prUrl: string,
  cwd: string,
): Promise<{ unresolvedThreads: number; commentCount: number }> {
  const parsed = parsePrNumber(prUrl);
  if (!parsed) return { unresolvedThreads: 0, commentCount: 0 };

  try {
    const query = `query {
      repository(owner: "${parsed.owner}", name: "${parsed.repo}") {
        pullRequest(number: ${parsed.number}) {
          reviewThreads(first: 100) {
            nodes { isResolved }
          }
          comments { totalCount }
        }
      }
    }`;

    const { stdout } = await execFileAsync("gh", ["api", "graphql", "-f", `query=${query}`], {
      cwd,
      timeout: 10000,
    });

    const data = JSON.parse(stdout.trim());
    const pr = data?.data?.repository?.pullRequest;
    if (!pr) return { unresolvedThreads: 0, commentCount: 0 };

    const threads = pr.reviewThreads?.nodes ?? [];
    const unresolvedThreads = threads.filter((t: { isResolved: boolean }) => !t.isResolved).length;
    const commentCount = pr.comments?.totalCount ?? 0;

    return { unresolvedThreads, commentCount };
  } catch {
    return { unresolvedThreads: 0, commentCount: 0 };
  }
}

async function fetchPrStatus(prUrl: string, cwd: string): Promise<PrStatus | null> {
  try {
    // Fetch checks + merge state and review threads in parallel
    const [ghResult, threadResult] = await Promise.all([
      execFileAsync(
        "gh",
        ["pr", "view", prUrl, "--json", "url,state,statusCheckRollup,reviewDecision,mergeable,mergeStateStatus"],
        { cwd, timeout: 10000 },
      ),
      fetchReviewThreads(prUrl, cwd),
    ]);

    const data = JSON.parse(ghResult.stdout.trim());

    // Parse check rollup
    const rollup: Array<{ status?: string; conclusion?: string; state?: string }> = data.statusCheckRollup ?? [];
    let passing = 0;
    let failing = 0;
    let pending = 0;

    for (const check of rollup) {
      if (check.conclusion === "SUCCESS" || check.state === "SUCCESS") {
        passing++;
      } else if (
        check.conclusion === "FAILURE" ||
        check.conclusion === "TIMED_OUT" ||
        check.conclusion === "CANCELLED" ||
        check.state === "FAILURE" ||
        check.state === "ERROR"
      ) {
        failing++;
      } else {
        pending++;
      }
    }

    const total = rollup.length;
    let checks: PrChecks = "none";
    if (total > 0) {
      if (failing > 0) checks = "failing";
      else if (pending > 0) checks = "pending";
      else checks = "passing";
    }

    return {
      url: data.url ?? prUrl,
      state: data.state ?? "OPEN",
      checks,
      reviewDecision: data.reviewDecision || null,
      mergeable: data.mergeable ?? "UNKNOWN",
      mergeStateStatus: data.mergeStateStatus ?? "UNKNOWN",
      checksDetail: total > 0 ? { total, passing, failing, pending } : undefined,
      unresolvedThreads: threadResult.unresolvedThreads,
      commentCount: threadResult.commentCount,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prUrls, cwds } = body as { prUrls: string[]; cwds: string[] };

    if (!prUrls || !Array.isArray(prUrls)) {
      return NextResponse.json({ error: "Missing prUrls array" }, { status: 400 });
    }

    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now - entry.ts > CACHE_TTL_MS) cache.delete(key);
    }
    const results: Record<string, PrStatus | null> = {};

    const fetches = prUrls.map(async (url, i) => {
      const cached = cache.get(url);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        results[url] = cached.data;
        return;
      }

      const cwd = cwds?.[i] || process.cwd();
      const status = await fetchPrStatus(url, cwd);
      if (status) {
        cache.set(url, { data: status, ts: now });
      }
      results[url] = status;
    });

    await Promise.all(fetches);

    return NextResponse.json({ statuses: results });
  } catch (error) {
    console.error("PR status fetch failed:", error);
    return NextResponse.json({ error: "Failed to fetch PR statuses" }, { status: 500 });
  }
}
