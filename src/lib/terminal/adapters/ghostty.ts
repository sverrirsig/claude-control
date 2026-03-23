import { createGenericAdapter } from "./generic";

export const ghosttyAdapter = createGenericAdapter((command) => ({
  bin: "ghostty",
  args: ["-e", "sh", "-c", command],
}));
