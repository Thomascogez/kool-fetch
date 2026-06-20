import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["__tests__/**/*.spec.ts"],
		typecheck: {
			include: ["__tests__/**/*.test-d.ts"],
		},
	},
});