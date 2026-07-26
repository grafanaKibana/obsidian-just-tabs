import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { resolve } from "node:path";

const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const version = process.argv[2];
const root = process.cwd();
const paths = {
	package: resolve(root, "package.json"),
	lock: resolve(root, "package-lock.json"),
	manifest: resolve(root, "manifest.json"),
	versions: resolve(root, "versions.json"),
};

if (!version || !SEMVER.test(version)) {
	throw new Error("Usage: npm run version -- <x.y.z> (no v prefix or prerelease suffix).");
}

const backups = new Map(
	Object.values(paths).map((path) => [path, readFileSync(path)]),
);
const manifest = JSON.parse(backups.get(paths.manifest).toString());
const versions = JSON.parse(backups.get(paths.versions).toString());

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}

try {
	const npm = process.platform === "win32" ? "npm.cmd" : "npm";
	const result = spawnSync(
		npm,
		[
			"version",
			version,
			"--no-git-tag-version",
			"--ignore-scripts",
			"--allow-same-version",
		],
		{ cwd: root, encoding: "utf8" },
	);

	if (result.status !== 0) {
		throw new Error(result.stderr || result.stdout || "npm version failed.");
	}

	manifest.version = version;
	versions[version] = manifest.minAppVersion;
	writeJson(paths.manifest, manifest);
	writeJson(paths.versions, versions);
	process.stdout.write(`Updated release metadata to ${version}.\n`);
} catch (error) {
	for (const [path, contents] of backups) {
		writeFileSync(path, contents);
	}
	throw error;
}
