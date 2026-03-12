import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST() {
  try {
    const script = `
tell application "System Events"
  activate
end tell
set chosenFolder to choose folder with prompt "Select your code directory"
return POSIX path of chosenFolder`;

    const { stdout } = await execAsync(
      `osascript -e '${script.replace(/'/g, "'\"'\"'")}'`,
      { timeout: 60000 }
    );

    const folderPath = stdout.trim().replace(/\/$/, "");

    if (!folderPath) {
      return NextResponse.json({ error: "No folder selected" }, { status: 400 });
    }

    return NextResponse.json({ path: folderPath });
  } catch {
    // User cancelled the dialog
    return NextResponse.json({ cancelled: true });
  }
}
