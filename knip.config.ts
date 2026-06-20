import type { KnipConfig } from "knip";

const config: KnipConfig = {
    ignoreBinaries: ["publish"],
    entry: ["__tests__/**/*.test-d.ts"],
};

export default config;