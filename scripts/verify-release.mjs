import { readFileSync, statSync } from "node:fs";
import process from "node:process";
import { resolve } from "node:path";

const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const root = process.cwd();
const tag = process.argv[2];

function readJson(name) {
	return JSON.parse(readFileSync(resolve(root, name), "utf8"));
}

function requireText(object, key, file) {
	if (typeof object[key] !== "string" || object[key].trim() === "") {
		throw new Error(`${file}.${key} must be a non-empty string.`);
	}
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const manifest = readJson("manifest.json");
const versions = readJson("versions.json");

for (const key of [
	"id",
	"name",
	"version",
	"minAppVersion",
	"description",
	"author",
]) {
	requireText(manifest, key, "manifest.json");
}

if (typeof manifest.isDesktopOnly !== "boolean") {
	throw new Error("manifest.json.isDesktopOnly must be a boolean.");
}

if (
	!/^[a-z]+(?:-[a-z]+)*$/.test(manifest.id) ||
	manifest.id.includes("obsidian") ||
	manifest.id.endsWith("-plugin")
) {
	throw new Error("manifest.json.id violates Obsidian community plugin rules.");
}

if (!SEMVER.test(manifest.version)) {
	throw new Error("manifest.json.version must be exact x.y.z SemVer.");
}

const lockRootVersion = packageLock.packages?.[""]?.version;
const versionsToCompare = [
	["package.json", packageJson.version],
	["package-lock.json packages[\"\"].version", lockRootVersion],
	["manifest.json", manifest.version],
];

if ("version" in packageLock) {
	versionsToCompare.push(["package-lock.json version", packageLock.version]);
}

for (const [source, value] of versionsToCompare) {
	if (value !== manifest.version) {
		throw new Error(
			`${source} version ${String(value)} does not match ${manifest.version}.`,
		);
	}
}

if (versions[manifest.version] !== manifest.minAppVersion) {
	throw new Error(
		`versions.json must map ${manifest.version} to ${manifest.minAppVersion}.`,
	);
}

if (tag !== undefined && tag !== manifest.version) {
	throw new Error(`Tag ${tag} must exactly match ${manifest.version}.`);
}

for (const asset of ["main.js", "manifest.json", "styles.css"]) {
	if (statSync(resolve(root, asset)).size === 0) {
		throw new Error(`${asset} must exist and be non-empty.`);
	}
}

process.stdout.write(
	`${JSON.stringify({
		id: manifest.id,
		version: manifest.version,
		minAppVersion: manifest.minAppVersion,
		assets: ["main.js", "manifest.json", "styles.css"],
	})}\n`,
);
