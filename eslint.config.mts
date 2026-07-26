import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
	globalIgnores([
		".omx",
		"main.js",
		"node_modules",
		"package-lock.json",
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"eslint.config.mts",
						"esbuild.config.mjs",
						"scripts/*.mjs",
					],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: [
			"esbuild.config.mjs",
			"scripts/**/*.mjs",
			"tests/**/*.ts",
		],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
		},
	},
);
