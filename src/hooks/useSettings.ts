import useSWR from "swr";

interface AppOption {
  id: string;
  installed: boolean;
}

interface SettingsResponse {
  config: {
    notifications: boolean;
    notificationSound: boolean;
    alwaysNotify: boolean;
    editor: string;
    gitGui: string;
    terminalApp: string;
  };
  options: {
    editors: AppOption[];
    gitGuis: AppOption[];
  };
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isAppAvailable(options: AppOption[] | undefined, selectedId: string | undefined): boolean {
  if (!options || !selectedId || selectedId === "none") return false;
  return options.find((o) => o.id === selectedId)?.installed ?? false;
}

export function useSettings() {
  const { data } = useSWR<SettingsResponse>("/api/settings", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 0,
  });

  const config = data?.config as (SettingsResponse["config"] & { terminalUseTmux?: boolean; terminalTmuxMode?: string }) | undefined;

  return {
    notifications: config?.notifications ?? true,
    notificationSound: config?.notificationSound ?? true,
    alwaysNotify: config?.alwaysNotify ?? false,
    editorAvailable: isAppAvailable(data?.options?.editors, config?.editor),
    gitGuiAvailable: isAppAvailable(data?.options?.gitGuis, config?.gitGui),
    inlineTerminal: config?.terminalApp === "inline",
    terminalUseTmux: config?.terminalUseTmux ?? false,
    terminalTmuxMode: (config?.terminalTmuxMode as "per-project" | "choose") ?? "per-project",
  };
}
