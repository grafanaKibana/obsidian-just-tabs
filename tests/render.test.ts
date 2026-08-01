import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { App } from "obsidian";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	TabBlockRenderChild,
	renderTabsDiagnostic,
} from "../src/render";
import type { TabDefinition } from "../src/parser";
import { renderMock, setIcon } from "./obsidian.mock";
import { stubPanelHeights, stubResizeObserver } from "./panel-size";

const tabs = [
	{ label: "One", body: "First" },
	{ label: "Two", body: "Second" },
	{ label: "<img src=x onerror=alert(1)>", body: "Third" },
];
const scrollIntoViewMock = vi.fn();

function setup(generation = { value: 0 }): {
	child: TabBlockRenderChild;
	container: HTMLElement;
} {
	const container = document.createElement("div");
	document.body.append(container);
	const child = new TabBlockRenderChild(
		{} as App,
		container,
		"Folder/Note.md",
		tabs,
		[],
		() => generation.value,
	);
	child.load();
	return { child, container };
}

function keys(element: HTMLElement, key: string): void {
	element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
}

function readStyles(): string {
	return readFileSync(
		resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
		"utf8",
	);
}

function styleSetting(styles: string, field: "id" | "title", value: string): string {
	const metadata = /\/\* @settings([\s\S]*?)\*\//.exec(styles)?.[1] ?? "";
	return (
		metadata
			.split("\n  -\n")
			.find((entry) => entry.includes(`    ${field}: ${value}\n`)) ?? ""
	);
}

function settingId(setting: string): string {
	return /^\s{4}id: (.+)$/m.exec(setting)?.[1] ?? "";
}

function matchingRuleBodies(styles: string, selector: string): string {
	return [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
		.filter((match) => match[1]?.includes(selector))
		.map((match) => match[2])
		.join("\n");
}

function matchingSelectors(styles: string, selector: string): string {
	return [...styles.matchAll(/([^{}]+)\{[^{}]*\}/g)]
		.map((match) => match[1] ?? "")
		.filter((candidate) => candidate.includes(selector))
		.join("\n");
}

beforeEach(() => {
	renderMock.mockReset();
	renderMock.mockImplementation(async (_app, markdown, element) => {
		element.textContent = markdown;
	});
	scrollIntoViewMock.mockReset();
	Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
		configurable: true,
		value: scrollIntoViewMock,
	});
});

afterEach(() => {
	document.body.replaceChildren();
});

describe("tab interaction", () => {
	test("selects the first tab and renders only its panel", () => {
		const { container } = setup();
		const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
		const panels = container.querySelectorAll<HTMLElement>('[role="tabpanel"]');

		expect(buttons).toHaveLength(3);
		expect(buttons[0]?.getAttribute("aria-selected")).toBe("true");
		expect(buttons[0]?.tabIndex).toBe(0);
		expect(buttons[1]?.getAttribute("aria-selected")).toBe("false");
		expect(panels[0]?.hidden).toBe(false);
		expect(panels[1]?.hidden).toBe(true);
		expect(
			container.querySelectorAll('[role="tab"][aria-selected="true"]'),
		).toHaveLength(1);
		expect(
			Array.from(buttons).filter((button) => button.tabIndex === 0),
		).toHaveLength(1);
		expect(Array.from(panels).filter((panel) => !panel.hidden)).toHaveLength(1);
		for (const button of Array.from(buttons)) {
			const panel = container.querySelector<HTMLElement>(
				`#${button.getAttribute("aria-controls") ?? ""}`,
			);
			expect(panel?.getAttribute("aria-labelledby")).toBe(button.id);
		}
		expect(renderMock).toHaveBeenCalledOnce();
		expect(renderMock).toHaveBeenCalledWith(
			expect.anything(),
			"First",
			expect.any(HTMLElement),
			"Folder/Note.md",
			expect.anything(),
		);
	});

	test("uses manual keyboard activation with roving focus", () => {
		const { container } = setup();
		const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
		const panels = container.querySelectorAll<HTMLElement>('[role="tabpanel"]');
		const first = buttons[0];
		const second = buttons[1];
		if (!first || !second) throw new Error("Expected tab buttons.");

		first.focus();
		keys(first, "ArrowRight");
		expect(document.activeElement).toBe(second);
		expect(second.tabIndex).toBe(0);
		expect(second.getAttribute("aria-selected")).toBe("false");
		expect(panels[0]?.hidden).toBe(false);

		keys(second, "Enter");
		expect(second.getAttribute("aria-selected")).toBe("true");
		expect(panels[0]?.hidden).toBe(true);
		expect(panels[1]?.hidden).toBe(false);

		keys(second, "End");
		expect(document.activeElement).toBe(buttons[2]);
		keys(buttons[2]!, "Home");
		expect(document.activeElement).toBe(first);
		expect(scrollIntoViewMock).toHaveBeenCalledWith({
			block: "nearest",
			inline: "nearest",
		});
	});

	test("wraps focus without selection and activates with Space", () => {
		const { container } = setup();
		const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
		const first = buttons[0];
		const last = buttons[2];
		if (!first || !last) throw new Error("Expected tab buttons.");

		first.focus();
		keys(first, "ArrowLeft");
		expect(document.activeElement).toBe(last);
		expect(first.getAttribute("aria-selected")).toBe("true");
		keys(last, "ArrowRight");
		expect(document.activeElement).toBe(first);
		keys(first, "ArrowLeft");
		keys(last, " ");
		expect(last.getAttribute("aria-selected")).toBe("true");
	});

	test("activates with pointer input and keeps blocks independent", () => {
		const first = setup();
		const second = setup();
		const firstButtons =
			first.container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
		const secondButtons =
			second.container.querySelectorAll<HTMLButtonElement>('[role="tab"]');

		firstButtons[1]?.click();
		expect(firstButtons[1]?.getAttribute("aria-selected")).toBe("true");
		expect(secondButtons[0]?.getAttribute("aria-selected")).toBe("true");
	});

	test("moves the box from the outgoing height to the visible panel's height", async () => {
		const { container } = setup();
		const panels = container.querySelector<HTMLElement>(".tabsdown__panels");
		const second = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
		if (!panels || !second) throw new Error("Expected panels and second tab.");
		stubPanelHeights(container, [240, 80, 0]);

		second.click();
		await Promise.resolve();

		expect(panels.style.height).toBe("80px");
	});

	test("tracks a panel that grows after it is already on screen", async () => {
		const resize = stubResizeObserver();
		try {
			const { container } = setup();
			const panels =
				container.querySelector<HTMLElement>(".tabsdown__panels");
			const second =
				container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
			if (!panels || !second) throw new Error("Expected panels and tab.");
			const grow = stubPanelHeights(container, [240, 80, 0]);

			second.click();
			await Promise.resolve();
			expect(panels.style.height).toBe("80px");

			// Nothing predicted this: the panel simply got taller, and the box
			// follows rather than staying on a height it guessed earlier.
			grow(1, 640);
			resize.fire();
			expect(panels.style.height).toBe("640px");

			grow(1, 300);
			resize.fire();
			expect(panels.style.height).toBe("300px");
		} finally {
			resize.restore();
		}
	});

	test("lands on the final panel through rapid switches", async () => {
		const { container } = setup();
		const panels = container.querySelector<HTMLElement>(".tabsdown__panels");
		const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
		if (!panels || !buttons[1] || !buttons[2]) {
			throw new Error("Expected panels and tabs.");
		}
		stubPanelHeights(container, [240, 80, 500]);

		buttons[1].click();
		buttons[2].click();
		buttons[1].click();
		await Promise.resolve();

		expect(panels.style.height).toBe("80px");
	});

	test("clips only while a height transition is running", async () => {
		const { container } = setup();
		const panels = container.querySelector<HTMLElement>(".tabsdown__panels");
		const second = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
		if (!panels || !second) throw new Error("Expected panels and second tab.");
		stubPanelHeights(container, [240, 80, 0]);
		const frames = new Map<number, FrameRequestCallback>();
		let nextFrame = 0;
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			frames.set(++nextFrame, callback);
			return nextFrame;
		});
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
			frames.delete(id);
		});
		const runFrames = (): void => {
			const pending = [...frames.values()];
			frames.clear();
			for (const frame of pending) frame(0);
		};
		const transition = (type: string): void => {
			const event = new Event(type);
			Object.defineProperty(event, "propertyName", { value: "height" });
			panels.dispatchEvent(event);
		};

		second.click();
		await Promise.resolve();
		expect(panels.classList.contains("tabsdown__panels--animating")).toBe(false);

		transition("transitionstart");
		expect(panels.classList.contains("tabsdown__panels--animating")).toBe(true);

		// A retarget cancels and restarts within the frame; the clip has to survive
		// the gap or the content spills out mid-run.
		transition("transitioncancel");
		transition("transitionstart");
		runFrames();
		expect(panels.classList.contains("tabsdown__panels--animating")).toBe(true);

		transition("transitionend");
		runFrames();
		expect(panels.classList.contains("tabsdown__panels--animating")).toBe(false);
	});

	test("holds the outgoing height until an empty query container fills", async () => {
		const resize = stubResizeObserver();
		vi.useFakeTimers();
		try {
			// A query block renders an empty container and fills it when the query
			// resolves. Text alongside it gives the panel height the whole time, so
			// height alone can never say whether the panel is finished.
			renderMock.mockImplementation(
				async (_app: unknown, _body: unknown, el: HTMLElement) => {
					el.createEl("p").textContent = "Heading above the query";
					el.createEl("div", { cls: "block-language-dataview" });
					el.createEl("div", { cls: "block-language-datacorejsx" });
				},
			);
			const { container } = setup();
			const panels =
				container.querySelector<HTMLElement>(".tabsdown__panels");
			const second =
				container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
			if (!panels || !second) throw new Error("Expected panels and tab.");
			const grow = stubPanelHeights(container, [240, 40, 0]);

			second.click();
			await vi.advanceTimersByTimeAsync(0);
			expect(panels.style.height).toBe("240px");

			await vi.advanceTimersByTimeAsync(1000);
			expect(panels.getBoundingClientRect().height).toBe(240);

			const query = container.querySelectorAll<HTMLElement>(
				".block-language-dataview",
			)[1];
			const slower = container.querySelectorAll<HTMLElement>(
				".block-language-datacorejsx",
			)[1];
			if (!query || !slower) throw new Error("Expected query containers.");

			// One of two containers filling is not the panel being done.
			query.createEl("table");
			grow(1, 300);
			resize.fire();
			expect(panels.getBoundingClientRect().height).toBe(300);

			grow(1, 90);
			resize.fire();
			expect(panels.getBoundingClientRect().height).toBe(240);

			slower.createEl("table");
			grow(1, 700);
			resize.fire();
			expect(panels.getBoundingClientRect().height).toBe(700);
		} finally {
			vi.useRealTimers();
			resize.restore();
		}
	});

	test.each(["load", "error"] as const)(
		"holds the outgoing height until an incomplete image emits %s",
		async (terminalEvent) => {
			let complete = false;
			renderMock.mockImplementation(
				async (_app: unknown, body: unknown, el: HTMLElement) => {
					if (body !== "Second") {
						el.textContent = String(body);
						return;
					}
					const image = el.createEl("img", {
						attr: { src: "https://example.invalid/pending.png" },
					});
					Object.defineProperty(image, "complete", {
						configurable: true,
						get: () => complete,
					});
				},
			);
			const { container } = setup();
			const panels =
				container.querySelector<HTMLElement>(".tabsdown__panels");
			const second =
				container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
			if (!panels || !second) throw new Error("Expected panels and tab.");
			const setHeight = stubPanelHeights(container, [240, 40, 0]);

			second.click();
			await Promise.resolve();
			const image = panels.querySelector<HTMLImageElement>("img");
			if (!image) throw new Error("Expected a pending image.");
			expect(image.complete).toBe(false);
			expect(panels.getBoundingClientRect().height).toBe(240);

			complete = true;
			const settledHeight = terminalEvent === "load" ? 300 : 40;
			setHeight(1, settledHeight);
			image.dispatchEvent(new Event(terminalEvent));
			expect(panels.getBoundingClientRect().height).toBe(settledHeight);
		},
	);

	test("re-arms the floor on each switch instead of inheriting a stale one", async () => {
		vi.useFakeTimers();
		try {
			renderMock.mockImplementation(
				async (_app: unknown, _body: unknown, el: HTMLElement) => {
					el.createEl("p").textContent = "Text above the query";
					el.createEl("div", { cls: "block-language-dataview" });
				},
			);
			const { container } = setup();
			const panels =
				container.querySelector<HTMLElement>(".tabsdown__panels");
			const buttons =
				container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
			if (!panels || !buttons[1] || !buttons[2]) {
				throw new Error("Expected panels and tabs.");
			}
			stubPanelHeights(container, [240, 40, 30]);

			buttons[1].click();
			await vi.advanceTimersByTimeAsync(2400);
			expect(panels.getBoundingClientRect().height).toBe(240);

			// The second switch owns the floor now. Leaving the first switch's cap
			// armed drops the box two seconds after the user already moved on.
			buttons[2].click();
			await vi.advanceTimersByTimeAsync(200);
			expect(panels.getBoundingClientRect().height).toBe(240);
		} finally {
			vi.useRealTimers();
		}
	});

	test("gives up the floor when a container never fills", async () => {
		vi.useFakeTimers();
		try {
			renderMock.mockImplementation(
				async (_app: unknown, _body: unknown, el: HTMLElement) => {
					el.createEl("div", { cls: "block-language-dataview" });
				},
			);
			const { container } = setup();
			const panels =
				container.querySelector<HTMLElement>(".tabsdown__panels");
			const second =
				container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
			if (!panels || !second) throw new Error("Expected panels and tab.");
			stubPanelHeights(container, [240, 20, 0]);

			second.click();
			await vi.advanceTimersByTimeAsync(2000);
			expect(panels.getBoundingClientRect().height).toBe(240);

			await vi.advanceTimersByTimeAsync(600);
			expect(panels.getBoundingClientRect().height).toBe(20);
		} finally {
			vi.useRealTimers();
		}
	});

	test("shrinks straight to a shorter panel with nothing pending", async () => {
		vi.useFakeTimers();
		try {
			renderMock.mockImplementation(
				async (_app: unknown, _body: unknown, el: HTMLElement) => {
					el.createEl("p").textContent = "Content";
				},
			);
			const { container } = setup();
			const panels =
				container.querySelector<HTMLElement>(".tabsdown__panels");
			const second =
				container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
			if (!panels || !second) throw new Error("Expected panels and tab.");
			stubPanelHeights(container, [240, 30, 0]);

			second.click();
			await vi.advanceTimersByTimeAsync(0);

			expect(panels.style.height).toBe("30px");
		} finally {
			vi.useRealTimers();
		}
	});

	test("settles an empty tab without waiting out the floor", async () => {
		vi.useFakeTimers();
		try {
			renderMock.mockImplementation(async () => undefined);
			const { container } = setup();
			const panels =
				container.querySelector<HTMLElement>(".tabsdown__panels");
			const second =
				container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
			if (!panels || !second) throw new Error("Expected panels and tab.");
			stubPanelHeights(container, [240, 0, 0]);

			second.click();
			await vi.advanceTimersByTimeAsync(0);

			expect(panels.style.height).toBe("0px");
		} finally {
			vi.useRealTimers();
		}
	});

	test("scrolls an activated tab into view", () => {
		const { container } = setup();
		const second =
			container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
		scrollIntoViewMock.mockReset();

		second?.click();

		expect(scrollIntoViewMock).toHaveBeenCalledOnce();
		expect(scrollIntoViewMock).toHaveBeenCalledWith({
			block: "nearest",
			inline: "nearest",
		});
	});

	test("uses generated identifiers and treats labels as text", () => {
		const { container } = setup();
		const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
		const unsafe = buttons[2];
		if (!unsafe) throw new Error("Expected third tab.");

		expect(unsafe.textContent).toBe("<img src=x onerror=alert(1)>");
		expect(unsafe.querySelector("img")).toBeNull();
		expect(unsafe.id).not.toContain("img");
		expect(
			container.querySelector(`#${unsafe.getAttribute("aria-controls") ?? ""}`),
		).not.toBeNull();
	});
});

test("diagnostics preserve raw source through text-only DOM APIs", () => {
	const container = document.createElement("div");
	renderTabsDiagnostic(container, {
		code: "empty-label",
		message: "Tab labels cannot be empty.",
		line: 2,
		source: '<img src=x onerror="alert(1)">',
	});

	expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
	expect(container.querySelector("img")).toBeNull();
	expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

test("applies the final position and layout configuration without showing it in labels", () => {
	const configuredTabs = [
		{ label: "Python", body: "First" },
		{ label: "JavaScript", body: "Second" },
	] satisfies TabDefinition[];
	const container = document.createElement("div");
	const child = new TabBlockRenderChild(
		{} as App,
		container,
		"Folder/Note.md",
		configuredTabs,
		["left", "multi", "bottom", "one"],
		() => 0,
	);

	child.load();

	expect(container.classList.contains("tabsdown--bottom")).toBe(true);
	expect(container.classList.contains("tabsdown--one")).toBe(true);
	expect(container.classList.contains("tabsdown--left")).toBe(false);
	expect(container.classList.contains("tabsdown--multi")).toBe(false);
	expect(container.querySelector('[role="tab"]')?.textContent).toBe("Python");
});

test("renders a tab icon beside the label and hides it from assistive tech", () => {
	const container = document.createElement("div");
	const child = new TabBlockRenderChild(
		{} as App,
		container,
		"Folder/Note.md",
		[
			{ label: "Python", body: "First", icon: "code" },
			{ label: "Notes", body: "Second" },
		] satisfies TabDefinition[],
		[],
		() => 0,
	);

	child.load();
	const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
	const icon = buttons[0]?.querySelector(".tabsdown__tab-icon");

	expect(setIcon).toHaveBeenCalledWith(icon, "code");
	expect(icon?.getAttribute("aria-hidden")).toBe("true");
	expect(buttons[0]?.textContent).toBe("Python");
	expect(buttons[1]?.querySelector(".tabsdown__tab-icon")).toBeNull();
});

test("layout modifiers style only their own tab list", () => {
	const styles = readStyles();

	expect(styles).not.toMatch(/\.tabsdown--[a-z]+\s+\.tabsdown__/);
});

test("preserves global Style Settings and adds the approved hierarchy", () => {
	const styles = readStyles();
	for (const [id, fragments] of Object.entries({
		"tabsdown-density": ["default: tabsdown-density-default", "value: tabsdown-density-compact"],
		"tabsdown-personality": ["default: tabsdown-personality-default", "value: tabsdown-personality-underline"],
		"tabsdown-overflow": ["default: tabsdown-overflow-scroll", "value: tabsdown-overflow-wrap"],
		"tabsdown-palette": ["default: tabsdown-palette-primary", "value: tabsdown-palette-secondary"],
		"tabsdown-accent-override": ["type: variable-color"],
		"tabsdown-alignment": ["default: tabsdown-alignment-start", "value: tabsdown-alignment-center", "value: tabsdown-alignment-equal-width"],
		"tabsdown-gap": ["default: 4", "min: 0", "step: 1", "format: px"],
		"tabsdown-radius": ["default: 4", "min: 0", "max: 24", "step: 1", "format: px"],
		"tabsdown-content-spacing": ["default: 12", "min: 0", "max: 48", "step: 1", "format: px"],
		"tabsdown-animation-speed": ["default: 160", "min: 0", "max: 500", "step: 20", "format: ms"],
		"tabsdown-animations-disabled": ["type: class-toggle", "default: false"],
	})) {
		const setting = styleSetting(styles, "id", id);
		for (const fragment of fragments) expect(setting, `${id}: ${fragment}`).toContain(fragment);
	}

	for (const [title, level, collapsed] of [
		["Defaults and global controls", "1", "false"],
		["Position overrides", "1", "false"],
		["Top", "2", "true"],
		["Bottom", "2", "true"],
		["Left", "2", "true"],
		["Right", "2", "true"],
		["Motion", "1", "true"],
	] as const) {
		const heading = styleSetting(styles, "title", title);
		expect(heading, title).toMatch(/type: heading/);
		expect(heading, title).toContain(`level: ${level}`);
		expect(heading, title).toContain(`collapsed: ${collapsed}`);
	}
});

test("gives every position explicit inheritable appearance controls", () => {
	const styles = readStyles();
	for (const position of ["top", "bottom", "left", "right"]) {
		for (const [axis, options] of [
			["personality", ["inherit", "button", "underline"]],
			["palette", ["inherit", "primary", "secondary"]],
			["alignment", ["inherit", "start", "center", "equal-width"]],
		] as const) {
			const id = `tabsdown-${position}-${axis}`;
			const setting = styleSetting(styles, "id", id);
			expect(setting, id).toMatch(/type: class-select/);
			expect(setting, id).toMatch(/allowEmpty: false/);
			expect(setting, id).toContain(`default: ${id}-inherit`);
			for (const option of options) {
				expect(setting, `${id}-${option}`).toContain(`value: ${id}-${option}`);
			}
		}
	}
});

test("defines the requested control ranges and selected weights", () => {
	const styles = readStyles();
	const expectFields = (title: string, fields: readonly string[]): void => {
		const setting = styleSetting(styles, "title", title);
		for (const field of fields) expect(setting, `${title}: ${field}`).toContain(field);
	};

	expectFields("Gap between tabs", ["default: 4", "min: 0", "max: 48", "step: 1"]);
	expectFields("Underline thickness", ["default: 1", "min: 1", "max: 8", "step: 1"]);
	expectFields("Use custom horizontal padding", ["type: class-toggle", "default: false"]);
	expectFields("Horizontal padding", ["default: 36", "min: 0", "max: 48", "step: 1"]);
	expectFields("Use custom side-list width", ["type: class-toggle", "default: false"]);
	expectFields("Side-list width", ["default: 160", "min: 96", "max: 320", "step: 8"]);
	expectFields("Icon size", ["default: 16", "min: 12", "max: 32", "step: 1"]);
	expectFields("Icon spacing", ["default: 6", "min: 0", "max: 16", "step: 1"]);
	const weight = styleSetting(styles, "title", "Selected tab font weight");
	for (const option of ["Theme default", "Medium", "Bold"]) {
		expect(weight).toContain(`label: ${option}`);
	}
	expect(weight).toMatch(/default: tabsdown-[\w-]+-theme-default/);
	expect(weight).toMatch(/value: tabsdown-[\w-]+-medium/);
	expect(weight).toMatch(/value: tabsdown-[\w-]+-bold/);
	const weightId = settingId(weight);
	expect(matchingRuleBodies(styles, `body.${weightId}-medium`)).toMatch(/font-weight:\s*var\(--font-medium\)/);
	expect(matchingRuleBodies(styles, `body.${weightId}-bold`)).toMatch(/font-weight:\s*var\(--font-bold,\s*700\)/);
	expect(styles).not.toContain(`body.${weightId}-theme-default`);
});

test("keeps position overrides direct, ordered, and mounted-global", () => {
	const styles = readStyles();
	for (const position of ["top", "bottom", "left", "right"]) {
		for (const axis of ["personality", "palette", "alignment"]) {
			const positionClass = `body.tabsdown-${position}-${axis}-`;
			expect(styles, positionClass).toContain(positionClass);
			expect(styles, positionClass).toMatch(
				new RegExp(`tabsdown--${position}[^,{]*> \\.tabsdown__tablist`),
			);
		}
		expect(styles).not.toMatch(
			new RegExp(`\\.tabsdown--${position}\\s+\\.tabsdown__`),
		);
	}

	const globalFallback = styles.indexOf("body.tabsdown-personality-underline");
	const positionOverride = styles.indexOf("body.tabsdown-top-personality-");
	const responsiveReset = styles.indexOf("@container (max-width: 28rem)");
	expect(globalFallback).toBeGreaterThan(-1);
	expect(positionOverride).toBeGreaterThan(globalFallback);
	expect(responsiveReset).toBeGreaterThan(positionOverride);
	expect(styles).not.toMatch(/tabsdown--mounted[^,{]*tabsdown-(top|bottom|left|right)-/);
});

test("fully resets position personality, palette, and alignment", () => {
	const styles = readStyles();
	for (const position of ["top", "bottom", "left", "right"]) {
		const button = matchingRuleBodies(styles, `body.tabsdown-${position}-personality-button`);
		for (const property of [
			"border-width:",
			"border-color:",
			"border-radius:",
			"background-color:",
			"color:",
		]) {
			expect(button, `${position} Button ${property}`).toContain(property);
		}
		expect(button).toContain("--tabsdown-tab-hover-");
		expect(button).toContain("--tabsdown-tab-selected-");

		const underline = matchingRuleBodies(styles, `body.tabsdown-${position}-personality-underline`);
		for (const declaration of [
			"border-color: transparent",
			"border-radius: 0",
			"background-color: transparent",
			"border-block-end-width: var(--tabsdown-underline-thickness",
		]) {
			expect(underline, `${position} Underline ${declaration}`).toContain(declaration);
		}

		for (const palette of ["primary", "secondary"]) {
			const body = matchingRuleBodies(styles, `body.tabsdown-${position}-palette-${palette}`);
			for (const variable of [
				"--tabsdown-tab-background:",
				"--tabsdown-tab-border:",
				"--tabsdown-tab-color:",
				"--tabsdown-tab-hover-background:",
				"--tabsdown-tab-hover-border:",
				"--tabsdown-tab-selected-background:",
				"--tabsdown-tab-selected-border:",
				"--tabsdown-tab-selected-color:",
				"--tabsdown-tab-underline-color:",
			]) {
				expect(body, `${position} ${palette} ${variable}`).toContain(variable);
			}
		}

		for (const [alignment, justify, flex] of [
			["start", "flex-start", "0 0 auto"],
			["center", "safe center", "0 0 auto"],
			["equal-width", "flex-start", "1 0 7rem"],
		] as const) {
			const body = matchingRuleBodies(styles, `body.tabsdown-${position}-alignment-${alignment}`);
			expect(body, `${position} ${alignment}`).toContain(`justify-content: ${justify}`);
			expect(body, `${position} ${alignment}`).toContain(`flex: ${flex}`);
		}
	}

	for (const position of ["left", "right"]) {
		for (const alignment of ["start", "center"]) {
			const reset = styles.indexOf(`body.tabsdown-${position}-alignment-${alignment}`, styles.indexOf("@container (max-width: 28rem)"));
			const restore = styles.indexOf(`body.tabsdown-${position}-alignment-equal-width`, styles.indexOf("@container (max-width: 28rem)"));
			expect(reset, `${position} narrow ${alignment}`).toBeGreaterThan(-1);
			expect(restore, `${position} narrow equal`).toBeGreaterThan(reset);
		}
		expect(matchingRuleBodies(styles, `body.tabsdown-${position}-alignment-equal-width`)).toContain("flex: 0 0 auto");
		expect(matchingSelectors(styles, `body.tabsdown-${position}-alignment-equal-width`)).toContain(
			`.tabsdown--${position} > .tabsdown__tablist > .tabsdown__tab`,
		);
	}
});

test("wires appearance controls without breaking touch, labels, or spacing", () => {
	const styles = readStyles();

	expect(styles).toMatch(/@media \(hover: hover\) \{[\s\S]*?\.tabsdown__tab:hover/);
	expect(styles).toMatch(/\.tabsdown__tab:focus-visible[\s\S]*?outline:/);
	expect(styles).toMatch(/box-shadow:\s*none/);
	const outlineId = settingId(styleSetting(styles, "title", "Use theme button outline"));
	const outline = matchingRuleBodies(styles, `body.${outlineId}`);
	expect(outline).toContain("--input-shadow");
	expect(outline).toContain("--input-shadow-hover");
	expect(outline).not.toContain("outline:");
	const selectedUnderline = matchingRuleBodies(styles, "personality-underline");
	expect(selectedUnderline).toMatch(/border-block-end-width:\s*var\(--tabsdown-underline-thickness/);
	expect(matchingRuleBodies(styles, "personality-underline .tabsdown__tab:hover")).toMatch(
		/border-block-end-width:\s*var\(--tabsdown-underline-thickness/,
	);
	expect(matchingRuleBodies(styles, "body.tabsdown-overflow-wrap")).toMatch(
		/calc\(var\(--tabsdown-gap[^)]*\)\s*\/\s*2\)/,
	);
	expect(matchingRuleBodies(styles, ".tabsdown--multi > .tabsdown__tablist")).toMatch(
		/calc\(var\(--tabsdown-gap[^)]*\)\s*\/\s*2\)/,
	);
	expect(
		matchingRuleBodies(
			styles,
			"body.tabsdown-overflow-scroll .tabsdown--multi > .tabsdown__tablist",
		),
	).toMatch(/gap:\s*var\(--tabsdown-gap/);
	expect(styles).toMatch(/\.tabsdown__tab \{[^}]*max-inline-size:\s*100%/);
	expect(styles).toMatch(/\.tabsdown__tab-label \{[^}]*min-inline-size:\s*0[^}]*overflow-wrap:\s*anywhere/);
	expect(styles).not.toMatch(/\.tabsdown__tab-label \{[^}]*(text-overflow:\s*ellipsis|white-space:\s*nowrap)/);
	expect(styles).toMatch(/\.tabsdown__tab-icon \{[^}]*--icon-size:\s*var\([^,]+,\s*1em\)/);
	expect(styles).toMatch(/\.tabsdown__tab-icon \{[^}]*margin-inline-end:\s*var\([^,]+,\s*0\.35em\)/);

	const defaultDensity = /body\.tabsdown-density-default \.tabsdown \{([^}]*)\}/.exec(styles)?.[1] ?? "";
	const compactDensity = /body\.tabsdown-density-compact \.tabsdown \{([^}]*)\}/.exec(styles)?.[1] ?? "";
	expect(defaultDensity).not.toContain("--tabsdown-content-spacing");
	expect(defaultDensity).toMatch(/--tabsdown-tab-padding-inline:\s*(36px|2\.25rem)/);
	expect(compactDensity).toMatch(/--tabsdown-tab-padding-inline:\s*(12px|0\.75rem)/);
	const paddingToggle = settingId(styleSetting(styles, "title", "Use custom horizontal padding"));
	const paddingSlider = settingId(styleSetting(styles, "title", "Horizontal padding"));
	expect(matchingRuleBodies(styles, `body.${paddingToggle}`)).toContain(`var(--${paddingSlider})`);
	const sideToggle = settingId(styleSetting(styles, "title", "Use custom side-list width"));
	const sideSlider = settingId(styleSetting(styles, "title", "Side-list width"));
	for (const position of ["left", "right"]) {
		expect(matchingRuleBodies(styles, `body.${sideToggle} .tabsdown--${position}`)).toContain(
			`var(--${sideSlider})`,
		);
	}
	const weightId = settingId(styleSetting(styles, "title", "Selected tab font weight"));
	for (const value of ["medium", "bold"]) {
		const selectors = [...styles.matchAll(/([^{}]+)\{[^{}]*font-weight:[^{}]*\}/g)]
			.map((match) => match[1] ?? "")
			.filter((selector) => selector.includes(`body.${weightId}-${value}`))
			.join("\n");
		expect(selectors).toMatch(/\[aria-(selected|expanded)="true"\]/);
		expect(selectors).not.toMatch(/\.tabsdown__tab\s*(,|$)/m);
	}
	expect(styles).toMatch(/\.tabsdown--top > \.tabsdown__tablist \{[^}]*margin-block-end:\s*var\(--tabsdown-content-spacing/);
	expect(styles).toMatch(/\.tabsdown--bottom > \.tabsdown__tablist \{[^}]*margin-block-start:\s*var\(--tabsdown-content-spacing/);
	expect(styles).toMatch(/\.tabsdown--left,[\s\S]*?\.tabsdown--right \{[^}]*gap:\s*var\(--tabsdown-content-spacing/);
	const narrow = styles.slice(styles.indexOf("@container (max-width: 28rem)"));
	expect(narrow).toMatch(/inline-size:\s*100%/);
	expect(narrow).not.toContain(`var(--${sideSlider})`);
});

test("panels contain their own margins so height stays stable", () => {
	const styles = readFileSync(
		resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
		"utf8",
	);
	// Anchored, so a position-specific rule ending in the same class does not
	// shadow the base rule this asserts on.
	const panels = /^\.tabsdown__panels \{([^}]*)\}/m.exec(styles)?.[1] ?? "";
	const panel =
		/^\.tabsdown__panel,\s*\n\.tabsdown__content \{([^}]*)\}/m.exec(styles)?.[1] ??
		"";

	expect(panels).toMatch(/display:\s*flow-root/);
	expect(panels).toMatch(/box-sizing:\s*border-box/);
	expect(styles).toMatch(/^\.tabsdown__content \{\s*display:\s*flow-root/m);
	expect(panel).not.toMatch(/\bdisplay\s*:/);
});

test("a narrow block moves its side tab list off the panels' line", () => {
	const styles = readFileSync(
		resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
		"utf8",
	);
	const query = /@container \([^)]*\) \{([\s\S]*?)\n\}/.exec(styles)?.[1] ?? "";

	// A grid here collapsed the panel column to zero width in a narrow pane, and
	// the query has to measure the block, not the viewport, so a note docked in a
	// sidebar recovers too.
	expect(styles).toMatch(/^\.tabsdown \{[^}]*container-type:\s*inline-size/m);
	expect(styles).not.toMatch(/\.tabsdown--(left|right)[^{]*\{[^}]*grid-template-columns/);
	expect(query).toMatch(/flex-basis:\s*100%/);
	expect(query).toMatch(/flex-direction:\s*row/);
});

test("a wrapped right-side tab list stays above its panels", () => {
	const styles = readFileSync(
		resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
		"utf8",
	);

	// Ordering the tab list instead would hand the first line to the panels
	// whenever a long list forces a wrap, at any width, leaving the tabs stranded
	// below the content.
	expect(styles).toMatch(/\.tabsdown--right \{[^}]*flex-direction:\s*row-reverse/);
	expect(styles).not.toMatch(/\.tabsdown--right > \.tabsdown__tablist \{[^}]*order:/);
});

test("equal-width tabs do not stretch down a side list", () => {
	const styles = readFileSync(
		resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
		"utf8",
	);
	// A grow factor along a column's main axis sizes height, not width, so every
	// tab ended up as tall as the panel beside it.
	const reset =
		/body\.tabsdown-alignment-equal-width \.tabsdown--left > \.tabsdown__tablist > \.tabsdown__tab[\s\S]*?flex:\s*0 0 auto/.exec(
			styles,
		);
	// Restored where the list is a row again. Both rules carry the same
	// specificity, so this one only wins by coming later in the file.
	const restore =
		/@container \([^)]*\) \{[\s\S]*?body\.tabsdown-alignment-equal-width[\s\S]*?flex:\s*1 0 7rem/.exec(
			styles,
		);

	expect(reset).not.toBeNull();
	expect(restore).not.toBeNull();
	expect(restore!.index).toBeGreaterThan(reset!.index);
});
