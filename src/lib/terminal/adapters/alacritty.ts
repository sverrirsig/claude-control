import { createGenericAdapter } from "./generic";

export const alacrittyAdapter = createGenericAdapter((command) => ({
  bin: "alacritty",
  args: ["-e", "sh", "-c", command],
}));
