import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: fileURLToPath(
				new URL("./tests/obsidian.mock.ts", import.meta.url),
			),
		},
	},
	test: {
		environment: "jsdom",
		include: ["tests/**/*.test.ts"],
		restoreMocks: true,
	},
});
