import { createGenericAdapter } from "./generic";

export const kittyAdapter = createGenericAdapter((command) => ({
  bin: "kitty",
  args: ["sh", "-c", command],
}));
