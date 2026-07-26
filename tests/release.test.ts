// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

interface PackageFixture {
	version: string;
}

interface LockFixture {
	version: string;
	packages: {
		"": {
			version: string;
		};
	};
}

interface ManifestFixture {
	version: string;
}

type VersionsFixture = Record<string, string>;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versionScript = resolve(repositoryRoot, "scripts/version.mjs");
const verifyScript = resolve(repositoryRoot, "scripts/verify-release.mjs");
const fixtures: string[] = [];

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function createFixture(): string {
	const root = mkdtempSync(resolve(tmpdir(), "just-tabs-release-"));
	fixtures.push(root);
	writeJson(resolve(root, "package.json"), {
		name: "obsidian-just-tabs",
		version: "0.1.0",
	});
	writeJson(resolve(root, "package-lock.json"), {
		name: "obsidian-just-tabs",
		version: "0.1.0",
		lockfileVersion: 3,
		requires: true,
		packages: {
			"": {
				name: "obsidian-just-tabs",
				version: "0.1.0",
			},
		},
	});
	writeJson(resolve(root, "manifest.json"), {
		id: "just-tabs",
		name: "Just Tabs",
		version: "0.1.0",
		minAppVersion: "1.0.0",
		description: "Tabbed blocks.",
		author: "grafanaKibana",
		isDesktopOnly: false,
	});
	writeJson(resolve(root, "versions.json"), { "0.1.0": "1.0.0" });
	writeFileSync(resolve(root, "main.js"), "module.exports = {};\n");
	writeFileSync(resolve(root, "styles.css"), ".just-tabs {}\n");
	return root;
}

function runVerify(root: string): ReturnType<typeof spawnSync> {
	return spawnSync(process.execPath, [verifyScript], {
		cwd: root,
		encoding: "utf8",
	});
}

afterEach(() => {
	for (const fixture of fixtures.splice(0)) {
		rmSync(fixture, { recursive: true, force: true });
	}
});

test("updates package, lockfile, manifest, and versions together", () => {
	const root = createFixture();

	execFileSync(process.execPath, [versionScript, "0.2.0"], { cwd: root });

	const packageJson = readJson<PackageFixture>(resolve(root, "package.json"));
	const lock = readJson<LockFixture>(resolve(root, "package-lock.json"));
	const manifest = readJson<ManifestFixture>(resolve(root, "manifest.json"));
	const versions = readJson<VersionsFixture>(resolve(root, "versions.json"));
	expect(packageJson.version).toBe("0.2.0");
	expect(lock.version).toBe("0.2.0");
	expect(lock.packages[""].version).toBe("0.2.0");
	expect(manifest.version).toBe("0.2.0");
	expect(versions["0.2.0"]).toBe("1.0.0");
	expect(runVerify(root).status).toBe(0);
});

test("rejects invalid versions without modifying release metadata", () => {
	const root = createFixture();
	const before = ["package.json", "package-lock.json", "manifest.json", "versions.json"]
		.map((name) => readFileSync(resolve(root, name), "utf8"));

	const result = spawnSync(process.execPath, [versionScript, "v0.2.0"], {
		cwd: root,
		encoding: "utf8",
	});

	expect(result.status).not.toBe(0);
	expect(
		["package.json", "package-lock.json", "manifest.json", "versions.json"]
			.map((name) => readFileSync(resolve(root, name), "utf8")),
	).toEqual(before);
});

test.each([
	"package.json",
	"package-lock.json",
	"manifest.json",
	"versions.json",
])("rejects a mismatched %s", (name) => {
	const root = createFixture();
	const path = resolve(root, name);

	if (name === "package.json") {
		const value = readJson<PackageFixture>(path);
		value.version = "0.2.0";
		writeJson(path, value);
	} else if (name === "package-lock.json") {
		const value = readJson<LockFixture>(path);
		value.packages[""].version = "0.2.0";
		writeJson(path, value);
	} else if (name === "manifest.json") {
		const value = readJson<ManifestFixture>(path);
		value.version = "0.2.0";
		writeJson(path, value);
	} else {
		const value = readJson<VersionsFixture>(path);
		value["0.1.0"] = "2.0.0";
		writeJson(path, value);
	}

	expect(runVerify(root).status).not.toBe(0);
});

test("rejects missing release assets", () => {
	const root = createFixture();
	rmSync(resolve(root, "styles.css"));
	expect(runVerify(root).status).not.toBe(0);
});
