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
import { renderMock } from "./obsidian.mock";

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

beforeEach(() => {
	renderMock.mockReset();
	renderMock.mockResolvedValue(undefined);
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

	test("animates the panel container from its old height to its new height", async () => {
		const { container } = setup();
		const panels = container.querySelector<HTMLElement>(".tabsdown__panels");
		const second = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
		if (!panels || !second) throw new Error("Expected panels and second tab.");
		const measure = vi
			.spyOn(panels, "getBoundingClientRect")
			.mockReturnValueOnce({ height: 240 } as DOMRect)
			.mockReturnValueOnce({ height: 80 } as DOMRect);
		let nextFrame: FrameRequestCallback | undefined;
		const frame = vi
			.spyOn(window, "requestAnimationFrame")
			.mockImplementation((callback) => {
				nextFrame = callback;
				return 1;
			});

		second.click();
		await Promise.resolve();

		expect(measure).toHaveBeenCalledTimes(2);
		expect(panels.style.height).toBe("240px");
		nextFrame?.(0);
		expect(panels.style.height).toBe("80px");
		frame.mockRestore();
	});

	test("cancels stale height frames during rapid tab switches", async () => {
		const { container } = setup();
		const panels = container.querySelector<HTMLElement>(".tabsdown__panels");
		const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
		if (!panels || !buttons[1] || !buttons[2]) {
			throw new Error("Expected panels and tabs.");
		}
		vi.spyOn(panels, "getBoundingClientRect").mockReturnValue({
			height: 120,
		} as DOMRect);
		const frames = new Map<number, FrameRequestCallback>();
		let frameId = 0;
		const request = vi
			.spyOn(window, "requestAnimationFrame")
			.mockImplementation((callback) => {
				const id = ++frameId;
				frames.set(id, callback);
				return id;
			});
		const cancel = vi
			.spyOn(window, "cancelAnimationFrame")
			.mockImplementation((id) => {
				frames.delete(id);
			});

		buttons[1].click();
		await Promise.resolve();
		frames.get(1)?.(0);
		buttons[2].click();
		await Promise.resolve();
		frames.get(2)?.(0);

		cancel.mockClear();
		buttons[1].click();
		buttons[2].click();
		frames.get(4)?.(0);

		expect(cancel).toHaveBeenCalledWith(3);
		expect(panels.style.height).toBe("120px");
		request.mockRestore();
		cancel.mockRestore();
	});

	test("clips overflow and cancels a frame delayed past height cleanup", async () => {
		vi.useFakeTimers();
		try {
			const { container } = setup();
			const panels =
				container.querySelector<HTMLElement>(".tabsdown__panels");
			const second =
				container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
			if (!panels || !second) {
				throw new Error("Expected panels and second tab.");
			}
			vi.spyOn(panels, "getBoundingClientRect")
				.mockReturnValueOnce({ height: 80 } as DOMRect)
				.mockReturnValueOnce({ height: 240 } as DOMRect);
			vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
			const cancel = vi
				.spyOn(window, "cancelAnimationFrame")
				.mockImplementation(() => undefined);

			second.click();
			await Promise.resolve();
			expect(
				panels.classList.contains("tabsdown__panels--animating"),
			).toBe(true);

			vi.advanceTimersByTime(250);
			expect(cancel).toHaveBeenCalledWith(1);
			expect(panels.style.height).toBe("");
			expect(
				panels.classList.contains("tabsdown__panels--animating"),
			).toBe(false);
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

test("layout modifiers style only their own tab list", () => {
	const styles = readFileSync(
		resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
		"utf8",
	);

	expect(styles).not.toMatch(/\.tabsdown--[a-z]+\s+\.tabsdown__/);
});

test("panels contain their own margins so height stays stable", () => {
	const styles = readFileSync(
		resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
		"utf8",
	);
	const panels = /\.tabsdown__panels \{([^}]*)\}/.exec(styles)?.[1] ?? "";

	expect(panels).toMatch(/display:\s*flow-root/);
});
