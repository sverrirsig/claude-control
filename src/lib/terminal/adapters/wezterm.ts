import { createGenericAdapter } from "./generic";

export const weztermAdapter = createGenericAdapter((command) => ({
  bin: "wezterm",
  args: ["start", "--", "sh", "-c", command],
}));
