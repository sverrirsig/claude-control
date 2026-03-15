import { mutate } from "swr";

const REFRESH_DELAYS = [300, 700, 1200, 2000, 3000];

/** Burst SWR revalidations to catch backend state changes quickly after an action. */
export function refreshAfterAction() {
  for (const ms of REFRESH_DELAYS) {
    setTimeout(() => mutate("/api/sessions"), ms);
  }
}

/** Send a keystroke to a Claude session via the API, then refresh. */
export async function sendKeystrokeAction(pid: number, keystroke: string) {
  const response = await fetch("/api/actions/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send-keystroke", pid, keystroke }),
  });
  if (!response.ok) throw new Error(`Keystroke failed: ${response.status}`);
  refreshAfterAction();
}
