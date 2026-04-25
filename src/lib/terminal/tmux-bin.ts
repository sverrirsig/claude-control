import { arch, platform } from "os";

const HOMEBREW_TMUX = "/opt/homebrew/bin/tmux";

let resolved: string | null = null;

export function getTmuxBin(): string {
  if (resolved !== null) return resolved;
  if (platform() === "darwin" && arch() === "arm64") {
    try {
      require("fs").accessSync(HOMEBREW_TMUX);
      resolved = HOMEBREW_TMUX;
    } catch {
      resolved = "tmux";
    }
  } else {
    resolved = "tmux";
  }
  return resolved;
}
