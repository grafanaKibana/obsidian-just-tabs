import { describe, expect, test } from "vitest";

import { parseTabs } from "../src/parser";

describe("parseTabs", () => {
	test("parses multiple tabs, blank lines, whitespace, and empty bodies", () => {
		const source = [
			"tab: First",
			"",
			"  preserved  ",
			"tab: Second",
			"tab: Third",
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
			source: "tab: One\nbody\ntab: Two\nnext\n",
			bodies: ["body\n", "next\n"],
		},
		{
			name: "CRLF",
			source: "tab: One\r\nbody\r\ntab: Two\r\nnext\r\n",
			bodies: ["body\r\n", "next\r\n"],
		},
	])("preserves $name body bytes", ({ source, bodies }) => {
		const result = parseTabs(source);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tabs.map((tab) => tab.body)).toEqual(bodies);
		}
	});

	test("parses a leading config marker and keeps it out of the tabs", () => {
		expect(
			parseTabs("config: top, multi\n\ntab: Python\ntab: JavaScript"),
		).toEqual({
			ok: true,
			configuration: ["top", "multi"],
			tabs: [
				{ label: "Python", body: "" },
				{ label: "JavaScript", body: "" },
			],
		});
	});

	test("merges repeated config markers in source order", () => {
		expect(parseTabs("config: left\nconfig: multi\ntab: One\ntab: Two")).toEqual({
			ok: true,
			configuration: ["left", "multi"],
			tabs: [
				{ label: "One", body: "" },
				{ label: "Two", body: "" },
			],
		});
	});

	test("keeps a config marker after the first tab as body content", () => {
		expect(parseTabs("tab: One\nconfig: left\ntab: Two")).toEqual({
			ok: true,
			tabs: [
				{ label: "One", body: "config: left\n" },
				{ label: "Two", body: "" },
			],
		});
	});

	test("does not support the previous parenthesized configuration", () => {
		expect(parseTabs("tab: Python (top, multi)\ntab: JavaScript")).toEqual({
			ok: true,
			tabs: [
				{ label: "Python (top, multi)", body: "" },
				{ label: "JavaScript", body: "" },
			],
		});
	});

	test("allows nested non-tabs fences", () => {
		const source = [
			"tab: Code",
			"```dataview",
			"TABLE file.name",
			"```",
			"tab: Other",
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

	test("preserves a shorter tabs fence inside a longer static code fence", () => {
		const source = [
			"tab: Code",
			"````text",
			"```tabsdown",
			"literal fenced source",
			"```",
			"````",
			"tab: Other",
		].join("\n");

		const result = parseTabs(source);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tabs[0]?.body).toBe(
				"````text\n```tabsdown\nliteral fenced source\n```\n````\n",
			);
		}
	});

	test("treats an unescaped marker inside a static fence as structural", () => {
		const result = parseTabs(
			[
				"tab: One",
				"````text",
				"tab: Two",
				"Second body",
			].join("\n"),
		);

		expect(result).toEqual({
			ok: true,
			tabs: [
				{ label: "One", body: "````text\n" },
				{ label: "Two", body: "Second body" },
			],
		});
	});

	test("keeps an escaped marker inside a static fence as literal body content", () => {
		const result = parseTabs(
			[
				"tab: One",
				"````text",
				"\\tab: literal",
				"````",
				"tab: Two",
			].join("\n"),
		);

		expect(result).toEqual({
			ok: true,
			tabs: [
				{ label: "One", body: "````text\ntab: literal\n````\n" },
				{ label: "Two", body: "" },
			],
		});
	});

	test("rejects top-level nested tabs after an invalid backtick fence opener", () => {
		const source = [
			"tab: One",
			"```text`invalid",
			"```tabsdown",
			"tab: Two",
		].join("\n");

		expect(parseTabs(source)).toEqual({
			ok: false,
			diagnostic: {
				code: "nested-tabs",
				message: "Nested tabs blocks are not supported.",
				line: 3,
				source,
			},
		});
	});

	test("rejects nested tabs with leading ASCII whitespace in the info string", () => {
		const source = [
			"tab: One",
			"``` tabsdown",
			"\\tab: Nested one",
			"\\tab: Nested two",
			"```",
			"tab: Two",
		].join("\n");

		expect(parseTabs(source)).toEqual({
			ok: false,
			diagnostic: {
				code: "nested-tabs",
				message: "Nested tabs blocks are not supported.",
				line: 2,
				source,
			},
		});
	});

	test("does not close a static fence when its suffix is NBSP", () => {
		const invalidClose = "````\u00a0";
		const source = [
			"tab: Code",
			"````text",
			invalidClose,
			"```tabsdown",
			"literal fenced source",
			"```",
			"````",
			"tab: Other",
		].join("\n");

		const result = parseTabs(source);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tabs[0]?.body).toBe(
				[
					"````text",
					invalidClose,
					"```tabsdown",
					"literal fenced source",
					"```",
					"````",
					"",
				].join("\n"),
			);
		}
	});

	test("unescapes one leading backslash from marker-looking body lines", () => {
		const result = parseTabs(
			"tab: One\r\n\\tab: literal\r\ntab: Two",
		);

		expect(result).toEqual({
			ok: true,
			tabs: [
				{ label: "One", body: "tab: literal\r\n" },
				{ label: "Two", body: "" },
			],
		});
	});

	test("keeps HTML-like labels as plain string values", () => {
		const result = parseTabs(
			"tab: <img src=x onerror=alert(1)>\ntab: <b>safe text</b>",
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
			source: "before\ntab: One\ntab: Two",
			code: "content-before-first-tab",
			message: "Content before the first tab marker is not allowed.",
			line: 1,
		},
		{
			name: "only one tab",
			source: "tab: One\nbody",
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
			source: "tab: One\ntab:   ",
			code: "empty-label",
			message: "Tab labels must not be empty.",
			line: 2,
		},
		{
			name: "duplicate trimmed label",
			source: "tab: Same\ntab:  Same  ",
			code: "duplicate-label",
			message: 'Duplicate tab label "Same".',
			line: 2,
		},
		{
			name: "an unknown configuration value",
			source: "config: top, sideways\ntab: One\ntab: Two",
			code: "invalid-config",
			message: 'Unknown configuration value "sideways".',
			line: 1,
		},
		{
			name: "an empty config marker",
			source: "config:  \ntab: One\ntab: Two",
			code: "invalid-config",
			message: "A config marker must list at least one value.",
			line: 1,
		},
		{
			name: "nested backtick tabs block",
			source: "tab: One\nbody\n```tabsdown\ntab: Two",
			code: "nested-tabs",
			message: "Nested tabs blocks are not supported.",
			line: 3,
		},
		{
			name: "nested tilde tabs block",
			source: "tab: One\n  ~~~~tabsdown  \ntab: Two",
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
		const source = "tab: One\n tab: not a marker\ntab: Two";
		const result = parseTabs(source);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tabs[0]?.body).toBe(" tab: not a marker\n");
		}
	});

	test("does not support the previous marker syntax", () => {
		const source = "--- tab: One\ntab: Two";

		expect(parseTabs(source)).toEqual({
			ok: false,
			diagnostic: {
				code: "content-before-first-tab",
				message: "Content before the first tab marker is not allowed.",
				line: 1,
				source,
			},
		});
	});
});
