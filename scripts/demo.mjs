import { copyFileSync, mkdirSync } from "node:fs";
import process from "node:process";
import { resolve } from "node:path";

const root = process.cwd();
const target = resolve(root, "demo/.obsidian/plugins/tabsdown");

mkdirSync(target, { recursive: true });

for (const asset of ["main.js", "manifest.json", "styles.css"]) {
	copyFileSync(resolve(root, asset), resolve(target, asset));
}
