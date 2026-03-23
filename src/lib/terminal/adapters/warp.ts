import { createGenericAdapter } from "./generic";

export const warpAdapter = createGenericAdapter((command) => ({
  bin: "open",
  args: ["-a", "Warp", "--args", "sh", "-c", command],
}));
