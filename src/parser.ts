export interface ParsedTab {
	label: string;
	body: string;
}

export type TabDefinition = ParsedTab;

export type TabsDiagnosticCode =
	| "content-before-first-tab"
	| "duplicate-label"
	| "empty-label"
	| "nested-tabs"
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

const markerPrefix = "--- tab:";
const nestedTabsFence = /^ {0,3}(?:`{3,}|~{3,})tabs[ \t]*$/;

export function parseTabs(source: string): TabsParseResult {
	const tabs: ParsedTab[] = [];
	const labels = new Set<string>();
	const lines = source.split("\n");
	let current: ParsedTab | undefined;

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

		if (nestedTabsFence.test(line)) {
			return fail(
				"nested-tabs",
				"Nested tabs blocks are not supported.",
				lineNumber,
			);
		}

		if (line.startsWith(markerPrefix)) {
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

		current.body += line.startsWith(`\\${markerPrefix}`)
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
