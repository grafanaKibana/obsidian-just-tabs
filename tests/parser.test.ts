import { describe, expect, test } from "vitest";

import { parseTabs } from "../src/parser";

describe("parseTabs", () => {
	test("parses multiple tabs, blank lines, whitespace, and empty bodies", () => {
		const source = [
			"--- tab: First",
			"",
			"  preserved  ",
			"--- tab: Second",
			"--- tab: Third",
		].join("\n");

		expect(parseTabs(source)).toEqual({
			ok: true,
			tabs: [
				{ label: "First", body: "\n  preserved  \n" },
				{ label: "Second", body: "" },
				{ label: "Third", body: "" },
			],
		});
	});

	test.each([
		{
			name: "LF",
			source: "--- tab: One\nbody\n--- tab: Two\nnext\n",
			bodies: ["body\n", "next\n"],
		},
		{
			name: "CRLF",
			source: "--- tab: One\r\nbody\r\n--- tab: Two\r\nnext\r\n",
			bodies: ["body\r\n", "next\r\n"],
		},
	])("preserves $name body bytes", ({ source, bodies }) => {
		const result = parseTabs(source);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tabs.map((tab) => tab.body)).toEqual(bodies);
		}
	});

	test("allows nested non-tabs fences", () => {
		const source = [
			"--- tab: Code",
			"```dataview",
			"TABLE file.name",
			"```",
			"--- tab: Other",
			"~~~js",
			"const value = 1;",
			"~~~",
		].join("\n");

		const result = parseTabs(source);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tabs[0]?.body).toBe(
				"```dataview\nTABLE file.name\n```\n",
			);
		}
	});

	test("unescapes one leading backslash from marker-looking body lines", () => {
		const result = parseTabs(
			"--- tab: One\r\n\\--- tab: literal\r\n--- tab: Two",
		);

		expect(result).toEqual({
			ok: true,
			tabs: [
				{ label: "One", body: "--- tab: literal\r\n" },
				{ label: "Two", body: "" },
			],
		});
	});

	test("keeps HTML-like labels as plain string values", () => {
		const result = parseTabs(
			"--- tab: <img src=x onerror=alert(1)>\n--- tab: <b>safe text</b>",
		);

		expect(result).toEqual({
			ok: true,
			tabs: [
				{ label: "<img src=x onerror=alert(1)>", body: "" },
				{ label: "<b>safe text</b>", body: "" },
			],
		});
	});

	test.each([
		{
			name: "content before the first marker",
			source: "before\n--- tab: One\n--- tab: Two",
			code: "content-before-first-tab",
			message: "Content before the first tab marker is not allowed.",
			line: 1,
		},
		{
			name: "only one tab",
			source: "--- tab: One\nbody",
			code: "too-few-tabs",
			message: "A tabs block must contain at least two tabs.",
			line: 1,
		},
		{
			name: "empty input",
			source: "",
			code: "too-few-tabs",
			message: "A tabs block must contain at least two tabs.",
			line: 1,
		},
		{
			name: "empty label",
			source: "--- tab: One\n--- tab:   ",
			code: "empty-label",
			message: "Tab labels must not be empty.",
			line: 2,
		},
		{
			name: "duplicate trimmed label",
			source: "--- tab: Same\n--- tab:  Same  ",
			code: "duplicate-label",
			message: 'Duplicate tab label "Same".',
			line: 2,
		},
		{
			name: "nested backtick tabs block",
			source: "--- tab: One\nbody\n```tabs\n--- tab: Two",
			code: "nested-tabs",
			message: "Nested tabs blocks are not supported.",
			line: 3,
		},
		{
			name: "nested tilde tabs block",
			source: "--- tab: One\n  ~~~~tabs  \n--- tab: Two",
			code: "nested-tabs",
			message: "Nested tabs blocks are not supported.",
			line: 2,
		},
	])("returns a deterministic diagnostic for $name", (expected) => {
		expect(parseTabs(expected.source)).toEqual({
			ok: false,
			diagnostic: {
				code: expected.code,
				message: expected.message,
				line: expected.line,
				source: expected.source,
			},
		});
	});

	test("treats indented markers as body content, not tab markers", () => {
		const source = "--- tab: One\n --- tab: not a marker\n--- tab: Two";
		const result = parseTabs(source);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tabs[0]?.body).toBe(" --- tab: not a marker\n");
		}
	});
});
