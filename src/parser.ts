export interface ParsedTab {
	label: string;
	body: string;
	configuration?: TabConfiguration[];
}

export type TabDefinition = ParsedTab;

export type TabConfiguration = "top" | "left" | "right" | "bottom" | "one" | "multi";

export type TabsDiagnosticCode =
	| "content-before-first-tab"
	| "duplicate-label"
	| "empty-label"
	| "too-few-tabs";

export interface TabsDiagnostic {
	code: TabsDiagnosticCode;
	message: string;
	line: number;
	source: string;
}

export type TabsParseResult =
	| { ok: true; tabs: ParsedTab[] }
	| { ok: false; diagnostic: TabsDiagnostic };

const markerPrefix = "tab:";
const configurationValues = new Set<TabConfiguration>([
	"top",
	"left",
	"right",
	"bottom",
	"one",
	"multi",
]);
const backtickFence = /^ {0,3}(`{3,})([^`]*)$/;
const tildeFence = /^ {0,3}(~{3,})(.*)$/;

function parseTabHeader(value: string): {
	configuration: TabConfiguration[];
	label: string;
} {
	const label = value.trim();
	const match = /^(.*)\s+\(([^()]*)\)$/.exec(label);
	if (!match) {
		return { configuration: [], label };
	}

	const [, rawLabel = "", rawConfiguration = ""] = match;
	const configuration = rawConfiguration
		.split(",")
		.map((item) => item.trim())
		.filter((item): item is TabConfiguration => configurationValues.has(item as TabConfiguration));
	return configuration.length === rawConfiguration.split(",").length
		? { configuration, label: rawLabel.trim() }
		: { configuration: [], label };
}

export function parseTabs(source: string): TabsParseResult {
	const tabs: ParsedTab[] = [];
	const labels = new Set<string>();
	const lines = source.split("\n");
	let current: ParsedTab | undefined;
	let openFence: string | undefined;
	let nested = false;

	const fail = (
		code: TabsDiagnosticCode,
		message: string,
		line: number,
	): TabsParseResult => ({
		ok: false,
		diagnostic: { code, message, line, source },
	});

	for (const [index, rawLine] of lines.entries()) {
		const hasNewline = index < lines.length - 1;
		const hasCarriageReturn = hasNewline && rawLine.endsWith("\r");
		const line = hasCarriageReturn ? rawLine.slice(0, -1) : rawLine;
		const ending = hasNewline ? (hasCarriageReturn ? "\r\n" : "\n") : "";
		const lineNumber = index + 1;

		const fenceMatch = backtickFence.exec(line) ?? tildeFence.exec(line);
		const fenceRun = fenceMatch?.[1];
		const fenceInfo = fenceMatch?.[2] ?? "";

		if (openFence) {
			if (fenceRun?.startsWith(openFence) && /^[ \t]*$/.test(fenceInfo)) {
				openFence = undefined;
				nested = false;
			}
		} else if (fenceRun) {
			openFence = fenceRun;
			// A nested block owns its own markers. CommonMark already forces the
			// outer fence to be the longer one, so the close above cannot be stolen
			// by an inner fence.
			nested = /^[ \t]*([^ \t]*)/.exec(fenceInfo)?.[1] === "tabsdown";
		}

		if (!nested && line.startsWith(markerPrefix)) {
			const { configuration, label } = parseTabHeader(
				line.slice(markerPrefix.length),
			);
			if (label === "") {
				return fail("empty-label", "Tab labels must not be empty.", lineNumber);
			}
			if (labels.has(label)) {
				return fail(
					"duplicate-label",
					`Duplicate tab label "${label}".`,
					lineNumber,
				);
			}

			current = {
				label,
				body: "",
				...(configuration.length > 0 ? { configuration } : {}),
			};
			tabs.push(current);
			labels.add(label);
			openFence = undefined;
			continue;
		}

		if (current === undefined) {
			if (source === "") {
				continue;
			}
			return fail(
				"content-before-first-tab",
				"Content before the first tab marker is not allowed.",
				lineNumber,
			);
		}

		// Nested source stays verbatim; the inner block unescapes its own markers.
		current.body += !nested && line.startsWith(`\\${markerPrefix}`)
			? `${line.slice(1)}${ending}`
			: `${line}${ending}`;
	}

	if (tabs.length < 2) {
		return fail(
			"too-few-tabs",
			"A tabs block must contain at least two tabs.",
			1,
		);
	}

	return { ok: true, tabs };
}
