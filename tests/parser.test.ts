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

	test("parses parenthesized configuration without including it in the label", () => {
		expect(parseTabs("tab: Python (top, multi)\ntab: JavaScript")).toEqual({
			ok: true,
			tabs: [
				{ label: "Python", body: "", configuration: ["top", "multi"] },
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

	test("keeps a nested block whole and resumes markers after it closes", () => {
		const source = [
			"tab: One",
			"````tabsdown",
			"tab: Inner one",
			"tab: Inner two",
			"````",
			"tab: Two",
		].join("\n");

		expect(parseTabs(source)).toEqual({
			ok: true,
			tabs: [
				{
					label: "One",
					body: "````tabsdown\ntab: Inner one\ntab: Inner two\n````\n",
				},
				{ label: "Two", body: "" },
			],
		});
	});

	test("treats a nested tilde block with a padded info string as nested", () => {
		const source = [
			"tab: One",
			"  ~~~~tabsdown  ",
			"tab: Inner",
			"  ~~~~",
			"tab: Two",
		].join("\n");

		const result = parseTabs(source);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tabs.map((tab) => tab.label)).toEqual(["One", "Two"]);
		}
	});

	test("leaves escaped markers inside a nested block for the inner parser", () => {
		const source = [
			"tab: One",
			"``` tabsdown",
			"\\tab: literal",
			"tab: Inner",
			"```",
			"tab: Two",
		].join("\n");

		const result = parseTabs(source);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tabs[0]?.body).toBe(
				"``` tabsdown\n\\tab: literal\ntab: Inner\n```\n",
			);
		}
	});

	test("nests to three levels when each fence outgrows the one it contains", () => {
		const source = [
			"tab: Outer one",
			"``````tabsdown",
			"tab: Middle one",
			"`````tabsdown",
			"tab: Inner one",
			"tab: Inner two",
			"`````",
			"tab: Middle two",
			"``````",
			"tab: Outer two",
		].join("\n");

		const result = parseTabs(source);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.tabs.map((tab) => tab.label)).toEqual([
			"Outer one",
			"Outer two",
		]);

		const middle = parseTabs(
			result.tabs[0]?.body.split("\n").slice(1, -2).join("\n") ?? "",
		);
		expect(middle.ok).toBe(true);
		if (!middle.ok) return;
		expect(middle.tabs.map((tab) => tab.label)).toEqual([
			"Middle one",
			"Middle two",
		]);
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
			name: "an unclosed nested block swallowing the only other marker",
			source: "tab: One\nbody\n```tabsdown\ntab: Two",
			code: "unclosed-nested-block",
			message: "A nested tabs block is never closed.",
			line: 3,
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
