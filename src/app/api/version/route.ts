import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

const GITHUB_REPO = "sverrirsig/claude-control";

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string }[];
}

export async function GET() {
  const current = packageJson.version;

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json" },
      next: { revalidate: 300 }, // cache for 5 minutes
    });

    if (!res.ok) {
      return NextResponse.json({ current, latest: null, updateAvailable: false });
    }

    const release: GitHubRelease = await res.json();
    const latest = release.tag_name.replace(/^v/, "");
    const updateAvailable = latest !== current;

    // Find the DMG asset for the current architecture
    const dmgAsset = release.assets.find(
      (a) => a.name.endsWith(".dmg") && (a.name.includes("arm64") || !a.name.includes("x64")),
    );

    return NextResponse.json({
      current,
      latest,
      updateAvailable,
      releaseUrl: release.html_url,
      downloadUrl: dmgAsset?.browser_download_url ?? release.html_url,
    });
  } catch {
    return NextResponse.json({ current, latest: null, updateAvailable: false });
  }
}
