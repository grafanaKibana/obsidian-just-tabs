export interface ParsedTab {
	label: string;
	body: string;
}

export type TabDefinition = ParsedTab;

export type TabConfiguration = "top" | "left" | "right" | "bottom" | "one" | "multi";

export type TabsDiagnosticCode =
	| "content-before-first-tab"
	| "duplicate-label"
	| "empty-label"
	| "invalid-config"
	| "too-few-tabs"
	| "unclosed-nested-block";

export interface TabsDiagnostic {
	code: TabsDiagnosticCode;
	message: string;
	line: number;
	source: string;
}

export type TabsParseResult =
	| { ok: true; tabs: ParsedTab[]; configuration?: TabConfiguration[] }
	| { ok: false; diagnostic: TabsDiagnostic };

const markerPrefix = "tab:";
const configurationPrefix = "config:";
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

export function parseTabs(source: string): TabsParseResult {
	const tabs: ParsedTab[] = [];
	const configuration: TabConfiguration[] = [];
	const labels = new Set<string>();
	const lines = source.split("\n");
	let current: ParsedTab | undefined;
	let openFence: string | undefined;
	let nested = false;
	let nestedLine = 0;

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
			nestedLine = lineNumber;
		}

		if (!nested && current === undefined && line.startsWith(configurationPrefix)) {
			const values = line
				.slice(configurationPrefix.length)
				.split(",")
				.map((value) => value.trim());
			if (values.length === 1 && values[0] === "") {
				return fail(
					"invalid-config",
					"A config marker must list at least one value.",
					lineNumber,
				);
			}
			for (const value of values) {
				if (!configurationValues.has(value as TabConfiguration)) {
					return fail(
						"invalid-config",
						`Unknown configuration value "${value}".`,
						lineNumber,
					);
				}
				configuration.push(value as TabConfiguration);
			}
			continue;
		}

		if (!nested && line.startsWith(markerPrefix)) {
			const label = line.slice(markerPrefix.length).trim();
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

			current = { label, body: "" };
			tabs.push(current);
			labels.add(label);
			openFence = undefined;
			continue;
		}

		if (current === undefined) {
			if (line.trim() === "") {
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

	// Checked before the tab count, because an unclosed nested block swallows every
	// marker after it and would otherwise surface as a missing tab.
	if (nested) {
		return fail(
			"unclosed-nested-block",
			"A nested tabs block is never closed.",
			nestedLine,
		);
	}

	if (tabs.length < 2) {
		return fail(
			"too-few-tabs",
			"A tabs block must contain at least two tabs.",
			1,
		);
	}

	return {
		ok: true,
		tabs,
		...(configuration.length > 0 ? { configuration } : {}),
	};
}
