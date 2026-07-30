import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { mountTabs, type TabSpec, type TabsController } from "../src/tabs";

function panel(text: string): HTMLElement {
	const element = document.createElement("div");
	element.textContent = text;
	return element;
}

function setup(
	options: {
		selection?: string | null;
		onSelectionChange?: (
			selection: string | null,
			previous: string | null,
		) => void;
		panels?: HTMLElement[];
	} = {},
): {
	container: HTMLElement;
	controller: TabsController;
	tabs: TabSpec[];
	buttons: HTMLButtonElement[];
	panelsEl: HTMLElement;
} {
	const container = document.createElement("div");
	document.body.append(container);
	const [trace, watch] = options.panels ?? [panel("Trace"), panel("Watch")];
	const tabs: TabSpec[] = [
		{ id: "trace", label: "Trace", panel: trace as HTMLElement },
		{ id: "watch", label: "Watch", panel: watch as HTMLElement },
	];
	const controller = mountTabs(container, {
		tabs,
		label: "Trace and watch",
		...(options.selection !== undefined
			? { selection: options.selection }
			: {}),
		...(options.onSelectionChange
			? { onSelectionChange: options.onSelectionChange }
			: {}),
	});
	const buttons = Array.from(
		container.querySelectorAll<HTMLButtonElement>(".tabsdown__tab"),
	);
	const panelsEl = container.querySelector<HTMLElement>(".tabsdown__panels");
	if (!panelsEl) throw new Error("Expected a panels wrapper.");
	return { container, controller, tabs, buttons, panelsEl };
}

function visible(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(
			".tabsdown__panel:not([hidden])",
		),
	);
}

beforeEach(() => {
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
});

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

describe("selection", () => {
	test("starts with nothing selected", () => {
		const { container, controller } = setup();
		const root = container.querySelector<HTMLElement>(".tabsdown--mounted");

		expect(controller.selection).toBeNull();
		expect(visible(container)).toHaveLength(0);
		expect(
			container.querySelectorAll('[aria-expanded="true"]'),
		).toHaveLength(0);
		expect(root?.classList.contains("tabsdown--collapsed")).toBe(true);
	});

	test("shows exactly the selected panel and no more than one", () => {
		const { container, buttons, tabs } = setup();

		buttons[0]?.click();
		expect(visible(container)).toEqual([tabs[0]?.panel]);
		expect(buttons[0]?.getAttribute("aria-expanded")).toBe("true");

		buttons[1]?.click();
		expect(visible(container)).toEqual([tabs[1]?.panel]);
		expect(buttons[0]?.getAttribute("aria-expanded")).toBe("false");
	});

	test("collapses when the selected tab is activated again", () => {
		const changes: [string | null, string | null][] = [];
		const { container, controller, buttons } = setup({
			selection: "trace",
			onSelectionChange: (selection, previous) => {
				changes.push([selection, previous]);
			},
		});
		const root = container.querySelector<HTMLElement>(".tabsdown--mounted");
		expect(root?.classList.contains("tabsdown--collapsed")).toBe(false);

		buttons[0]?.click();

		expect(controller.selection).toBeNull();
		expect(visible(container)).toHaveLength(0);
		expect(changes).toEqual([[null, "trace"]]);
		expect(root?.classList.contains("tabsdown--collapsed")).toBe(true);
	});

	test("honours an external selection without notifying", () => {
		const onSelectionChange = vi.fn();
		const { container, controller, tabs } = setup({ onSelectionChange });

		controller.setSelection("watch");

		expect(controller.selection).toBe("watch");
		expect(visible(container)).toEqual([tabs[1]?.panel]);
		expect(onSelectionChange).not.toHaveBeenCalled();
	});

	test("ignores an unknown or unavailable selection", () => {
		const onSelectionChange = vi.fn();
		const { controller } = setup({ selection: "trace", onSelectionChange });

		controller.setSelection("nope");
		expect(controller.selection).toBe("trace");

		controller.setAvailable("watch", false);
		controller.setSelection("watch");
		expect(controller.selection).toBe("trace");
		expect(onSelectionChange).not.toHaveBeenCalled();
	});

	test("moves focus out of a panel before switching or collapsing", () => {
		const { container, controller, tabs, buttons } = setup({
			selection: "trace",
		});
		const traceInput = document.createElement("input");
		tabs[0]?.panel.append(traceInput);
		traceInput.focus();

		controller.setSelection("watch");

		expect(document.activeElement).toBe(buttons[1]);
		const watchInput = document.createElement("input");
		tabs[1]?.panel.append(watchInput);
		watchInput.focus();

		controller.setAvailable("watch", false);

		expect(document.activeElement).toBe(
			container.querySelector(".tabsdown--mounted"),
		);
	});
});

describe("availability", () => {
	test("hides an unavailable tab and collapses when it was selected", () => {
		const onSelectionChange = vi.fn();
		const { container, controller, buttons } = setup({
			selection: "watch",
			onSelectionChange,
		});

		controller.setAvailable("watch", false);

		expect(buttons[1]?.hidden).toBe(true);
		expect(controller.selection).toBeNull();
		expect(visible(container)).toHaveLength(0);
		expect(onSelectionChange).toHaveBeenCalledOnce();
		expect(onSelectionChange).toHaveBeenCalledWith(null, "watch");

		controller.setAvailable("watch", true);
		controller.setSelection("watch");
		expect(buttons[1]?.hidden).toBe(false);
		expect(controller.selection).toBe("watch");
	});

	test("moves focus off a button it is about to hide", () => {
		const { controller, buttons } = setup({ selection: "watch" });
		buttons[1]?.focus();
		expect(document.activeElement).toBe(buttons[1]);

		controller.setAvailable("watch", false);

		expect(document.activeElement).toBe(buttons[0]);
		expect(document.activeElement).not.toBe(document.body);
	});

	test("moves focus within a pop-out document", () => {
		const frame = document.createElement("iframe");
		document.body.append(frame);
		const popup = frame.contentDocument;
		if (!popup) throw new Error("Expected an iframe document.");
		const container = popup.createElement("div");
		const trace = popup.createElement("div");
		const watch = popup.createElement("div");
		popup.body.append(container);
		const controller = mountTabs(container, {
			label: "Trace and watch",
			selection: "watch",
			tabs: [
				{ id: "trace", label: "Trace", panel: trace },
				{ id: "watch", label: "Watch", panel: watch },
			],
		});
		const buttons = container.querySelectorAll<HTMLButtonElement>("button");
		buttons[1]?.focus();

		controller.setAvailable("watch", false);

		expect(popup.activeElement).toBe(buttons[0]);
	});

	test("falls back to the root when no other tab remains", () => {
		const { container, controller, buttons } = setup({
			selection: "trace",
		});
		controller.setAvailable("watch", false);
		buttons[0]?.focus();

		controller.setAvailable("trace", false);

		expect(document.activeElement).toBe(
			container.querySelector(".tabsdown--mounted"),
		);
	});

	test("settles before a reentrant callback and notifies only once", () => {
		const seen: (string | null)[] = [];
		let controller: TabsController | undefined;
		const mounted = setup({
			selection: "trace",
			onSelectionChange: (selection) => {
				seen.push(selection);
				controller?.setAvailable("trace", false);
			},
		});
		controller = mounted.controller;

		mounted.buttons[0]?.click();

		expect(seen).toEqual([null]);
		expect(controller.selection).toBeNull();
	});
});

describe("keyboard and roles", () => {
	test("uses disclosure semantics rather than a tablist", () => {
		const { container, tabs, buttons } = setup();

		expect(container.querySelector('[role="tablist"]')).toBeNull();
		expect(container.querySelector('[role="region"]')).toBeNull();
		expect(
			container.querySelector(".tabsdown__tablist")?.getAttribute("role"),
		).toBe("group");
		for (const [index, tab] of tabs.entries()) {
			expect(tab.panel.getAttribute("role")).toBe("group");
			expect(tab.panel.getAttribute("aria-labelledby")).toBe(
				buttons[index]?.id,
			);
			expect(buttons[index]?.getAttribute("aria-controls")).toBe(
				tab.panel.id,
			);
			expect(tab.panel.tabIndex).toBe(0);
		}
	});

	test("leaves activation to the native button and keeps focus on it", () => {
		const { controller, buttons } = setup();
		const button = buttons[0];
		if (!button) throw new Error("Expected a button.");

		// Enter and Space are the browser's job: jsdom fires no click for
		// them, so the contract worth pinning is that nothing intercepts them.
		expect(button.type).toBe("button");
		button.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
		expect(controller.selection).toBeNull();

		button.focus();
		button.click();
		expect(controller.selection).toBe("trace");
		expect(document.activeElement).toBe(button);
	});

	test("gives every mount its own ids", () => {
		const first = setup();
		const second = setup();

		for (const mounted of [first, second]) {
			for (const [index, tab] of mounted.tabs.entries()) {
				const labelledBy =
					tab.panel.getAttribute("aria-labelledby") ?? "";
				expect(mounted.container.querySelector(`#${labelledBy}`)).toBe(
					mounted.buttons[index],
				);
			}
		}
		expect(first.buttons[0]?.id).not.toBe(second.buttons[0]?.id);
	});
});

describe("animation and teardown", () => {
	test("leaves no pinned height, frame, or timer after switching", () => {
		vi.useFakeTimers();
		const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
		const { buttons, panelsEl } = setup();

		buttons[0]?.click();
		buttons[1]?.click();
		buttons[0]?.click();
		expect(panelsEl.classList.contains("tabsdown__panels--animating")).toBe(
			true,
		);
		expect(cancelFrame).toHaveBeenCalled();

		vi.advanceTimersByTime(300);

		expect(panelsEl.style.height).toBe("");
		expect(panelsEl.classList.contains("tabsdown__panels--animating")).toBe(
			false,
		);
		expect(vi.getTimerCount()).toBe(0);
	});

	test("settles with no residual height when motion is disabled", () => {
		vi.useFakeTimers();
		document.body.classList.add("tabsdown-animations-disabled");
		const { buttons, panelsEl } = setup();

		buttons[0]?.click();
		vi.advanceTimersByTime(300);

		expect(panelsEl.style.height).toBe("");
		expect(panelsEl.classList.contains("tabsdown__panels--animating")).toBe(
			false,
		);
		document.body.classList.remove("tabsdown-animations-disabled");
	});

	test("returns bare panels to the container untouched", () => {
		vi.useFakeTimers();
		const { container, controller, tabs, buttons } = setup();
		buttons[0]?.click();

		controller.destroy();

		expect(container.querySelector(".tabsdown--mounted")).toBeNull();
		expect(container.classList.contains("tabsdown")).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		for (const tab of tabs) {
			expect(tab.panel.parentElement).toBe(container);
			expect(tab.panel.id).toBe("");
			expect(tab.panel.getAttribute("role")).toBeNull();
			expect(tab.panel.getAttribute("aria-labelledby")).toBeNull();
			expect(tab.panel.getAttribute("tabindex")).toBeNull();
			expect(tab.panel.hidden).toBe(false);
			expect(tab.panel.classList.contains("tabsdown__panel")).toBe(false);
		}
		expect(tabs[0]?.panel.textContent).toBe("Trace");

		buttons[1]?.click();
		expect(controller.selection).toBe("trace");
	});

	test("restores attributes the caller's panels arrived with", () => {
		const trace = panel("Trace");
		trace.id = "steptrace-trace";
		trace.setAttribute("role", "log");
		trace.setAttribute("hidden", "until-found");
		const watch = panel("Watch");
		watch.tabIndex = 3;
		const { controller, tabs, buttons } = setup({ panels: [trace, watch] });

		expect(buttons[0]?.getAttribute("aria-controls")).toBe(
			"steptrace-trace",
		);

		controller.destroy();

		expect(trace.id).toBe("steptrace-trace");
		expect(trace.getAttribute("role")).toBe("log");
		expect(trace.getAttribute("hidden")).toBe("until-found");
		expect(watch.tabIndex).toBe(3);
		expect(tabs[1]?.panel.getAttribute("role")).toBeNull();
	});

	test("tolerates being destroyed twice", () => {
		const { controller } = setup();
		controller.destroy();

		expect(() => {
			controller.destroy();
		}).not.toThrow();
	});
});

describe("mount guards", () => {
	test("rejects empty and duplicated input", () => {
		const container = document.createElement("div");
		const sharedPanel = panel("Shared");
		document.body.append(container);

		expect(() =>
			mountTabs(container, { tabs: [], label: "Empty" }),
		).toThrow(/at least one tab/);
		expect(() =>
			mountTabs(container, {
				label: "Duplicated",
				tabs: [
					{ id: "trace", label: "One", panel: panel("One") },
					{ id: "trace", label: "Two", panel: panel("Two") },
				],
			}),
		).toThrow(/unique/);
		expect(() =>
			mountTabs(container, {
				label: "Duplicated panel",
				tabs: [
					{ id: "trace", label: "One", panel: sharedPanel },
					{ id: "watch", label: "Two", panel: sharedPanel },
				],
			}),
		).toThrow(/panel elements must be unique/);
	});

	test("rejects a second mount but not a neighbouring markdown block", () => {
		const { container } = setup();

		expect(() =>
			mountTabs(container, {
				label: "Second",
				tabs: [{ id: "trace", label: "Trace", panel: panel("Trace") }],
			}),
		).toThrow(/already has mounted tabs/);

		const plain = document.createElement("div");
		document.body.append(plain);
		const block = document.createElement("div");
		block.className = "tabsdown";
		plain.append(block);
		expect(() =>
			mountTabs(plain, {
				label: "Beside a block",
				tabs: [{ id: "trace", label: "Trace", panel: panel("Trace") }],
			}),
		).not.toThrow();
	});

	test("rejects duplicate panel ids and container ancestors before mounting", () => {
		const container = document.createElement("div");
		const first = panel("First");
		const second = panel("Second");
		first.id = "shared";
		second.id = "shared";

		expect(() =>
			mountTabs(container, {
				label: "Duplicated ids",
				tabs: [
					{ id: "first", label: "First", panel: first },
					{ id: "second", label: "Second", panel: second },
				],
			}),
		).toThrow(/panel DOM ids must be unique/);
		expect(first.getAttribute("role")).toBeNull();
		expect(second.getAttribute("role")).toBeNull();

		const ancestor = panel("Ancestor");
		ancestor.append(container);
		expect(() =>
			mountTabs(container, {
				label: "Cycle",
				tabs: [{ id: "ancestor", label: "Ancestor", panel: ancestor }],
			}),
		).toThrow(/cannot contain its container/);
		expect(container.parentElement).toBe(ancestor);
		expect(container.querySelector(".tabsdown--mounted")).toBeNull();
	});
});

test("keeps mounted roots out of their own container query", () => {
	const styles = readFileSync(
		resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
		"utf8",
	);

	// Doubled on purpose: a single class only ties .tabsdown and would
	// depend on sitting later in the file.
	expect(styles).toMatch(
		/\.tabsdown\.tabsdown--mounted \{[^}]*container-type:\s*normal/,
	);
});

test("styles mounted selections as active", () => {
	const styles = readFileSync(
		resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
		"utf8",
	);

	expect(styles).toMatch(
		/\.tabsdown__tab\[aria-selected="true"\],\s*\.tabsdown__tab\[aria-expanded="true"\] \{/,
	);
	expect(styles).toMatch(
		/body\.tabsdown-personality-underline \.tabsdown__tab\[aria-selected="true"\],\s*body\.tabsdown-personality-underline \.tabsdown__tab\[aria-expanded="true"\] \{/,
	);
});
