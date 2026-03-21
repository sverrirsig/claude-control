import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const script = `
use framework "AppKit"
set screens to current application's NSScreen's screens()
set output to ""
repeat with i from 1 to count of screens
  set scr to item i of screens
  set scrName to (scr's localizedName()) as text
  set f to scr's frame()
  set w to item 1 of item 2 of f as integer
  set h to item 2 of item 2 of f as integer
  set output to output & scrName & "|" & w & "x" & h & linefeed
end repeat
return output
`;
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { timeout: 5000 });
    const screens = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line, index) => {
        const [name, resolution] = line.split("|");
        return { index, name: name.trim(), resolution: resolution?.trim() || "" };
      });

    return NextResponse.json({ screens });
  } catch (error) {
    console.error("Failed to get screens:", error);
    return NextResponse.json({ screens: [] });
  }
}
