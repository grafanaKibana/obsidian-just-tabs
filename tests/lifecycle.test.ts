import type { App } from "obsidian";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { TabBlockRenderChild } from "../src/render";
import { componentUnloadMock, renderMock } from "./obsidian.mock";

interface Deferred {
	promise: Promise<void>;
	resolve: () => void;
	reject: (error: Error) => void;
}

function deferred(): Deferred {
	let resolvePromise: (() => void) | undefined;
	let rejectPromise: ((error: Error) => void) | undefined;
	const promise = new Promise<void>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return {
		promise,
		resolve: () => resolvePromise?.(),
		reject: (error) => rejectPromise?.(error),
	};
}

function flush(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function setup(
	generation: { value: number },
	tabs: { label: string; body: string }[] = [
		{ label: "One", body: "First" },
		{ label: "Two", body: "Second" },
	],
): {
	child: TabBlockRenderChild;
	container: HTMLElement;
} {
	const container = document.createElement("div");
	document.body.append(container);
	const child = new TabBlockRenderChild(
		{} as App,
		container,
		"Note.md",
		tabs,
		[],
		() => generation.value,
	);
	child.load();
	return { child, container };
}

beforeEach(() => {
	renderMock.mockReset();
	componentUnloadMock.mockReset();
	renderMock.mockImplementation(async (_app, markdown, element) => {
		element.textContent = markdown;
	});
});

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

test("cancels a stale height reset before pinning a lazy panel", async () => {
	vi.useFakeTimers();
	const pending = deferred();
	renderMock.mockImplementation(async (_app, markdown, element) => {
		if (markdown === "Third") await pending.promise;
		element.textContent = markdown;
	});
	const { container } = setup({ value: 0 }, [
		{ label: "One", body: "First" },
		{ label: "Two", body: "Second" },
		{ label: "Three", body: "Third" },
	]);
	const panels = container.querySelector<HTMLElement>(".tabsdown__panels");
	const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
	if (!panels) throw new Error("Expected panels.");
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
	await vi.advanceTimersByTimeAsync(0);

	buttons[1]?.click();
	await vi.advanceTimersByTimeAsync(0);

	buttons[2]?.click();
	expect(panels.style.height).toBe("0px");

	await vi.advanceTimersByTimeAsync(300);
	expect(panels.style.height).toBe("0px");
	expect(panels.classList.contains("tabsdown__panels--animating")).toBe(true);

	pending.resolve();
});

test("renders lazily, keeps current panels, and rebuilds stale hidden panels once", async () => {
	const generation = { value: 0 };
	const { container } = setup(generation);
	const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
	await flush();
	expect(renderMock).toHaveBeenCalledTimes(1);

	buttons[1]?.click();
	await flush();
	expect(renderMock).toHaveBeenCalledTimes(2);

	buttons[0]?.click();
	await flush();
	expect(renderMock).toHaveBeenCalledTimes(2);

	generation.value += 1;
	expect(renderMock).toHaveBeenCalledTimes(2);
	buttons[1]?.click();
	await flush();
	expect(renderMock).toHaveBeenCalledTimes(3);
	buttons[1]?.click();
	await flush();
	expect(renderMock).toHaveBeenCalledTimes(3);
});

test("does not rebuild a stale panel while it remains visible", async () => {
	const generation = { value: 0 };
	const { container } = setup(generation);
	const firstButton =
		container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0];
	await flush();
	const originalContent = container.querySelector(".tabsdown__content");

	generation.value = 1;
	firstButton?.click();
	await flush();

	expect(renderMock).toHaveBeenCalledOnce();
	expect(container.querySelector(".tabsdown__content")).toBe(originalContent);
});

test("does not cancel a still-owned visible render on generation change", async () => {
	const generation = { value: 0 };
	const pending = deferred();
	renderMock.mockImplementation((_app, markdown, element) =>
		pending.promise.then(() => {
			element.textContent = `${markdown}:generation-0`;
		}),
	);
	const { container } = setup(generation);
	const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');

	generation.value = 1;
	pending.resolve();
	await flush();
	expect(container.textContent).toContain("First:generation-0");

	buttons[1]?.click();
	await flush();
	buttons[0]?.click();
	await flush();
	expect(renderMock).toHaveBeenCalledTimes(3);
});

test("pins the old height and measures a lazy target after rendering", async () => {
	const pending = deferred();
	renderMock
		.mockImplementationOnce(async (_app, markdown, element) => {
			element.textContent = markdown;
		})
		.mockImplementationOnce((_app, markdown, element) =>
			pending.promise.then(() => {
				element.textContent = markdown;
			}),
		);
	const generation = { value: 0 };
	const { container } = setup(generation);
	await flush();
	const panels = container.querySelector<HTMLElement>(".tabsdown__panels");
	const second =
		container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
	if (!panels || !second) throw new Error("Expected panels and second tab.");
	const measure = vi
		.spyOn(panels, "getBoundingClientRect")
		.mockReturnValueOnce({ height: 80 } as DOMRect)
		.mockReturnValueOnce({ height: 240 } as DOMRect);
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);

	second.click();
	expect(measure).toHaveBeenCalledOnce();
	expect(panels.style.height).toBe("80px");
	expect(panels.classList.contains("tabsdown__panels--animating")).toBe(true);

	pending.resolve();
	await flush();
	expect(measure).toHaveBeenCalledTimes(2);
	expect(panels.style.height).toBe("80px");
});

test("ignores a superseded hidden render and installs only its replacement", async () => {
	const generation = { value: 0 };
	const pending: Deferred[] = [];
	renderMock.mockImplementation((_app, markdown, element) => {
		const operation = deferred();
		pending.push(operation);
		return operation.promise.then(() => {
			element.textContent = markdown;
		});
	});
	const { container } = setup(generation);
	const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');

	buttons[1]?.click();
	buttons[0]?.click();
	generation.value = 1;
	buttons[1]?.click();
	expect(renderMock).toHaveBeenCalledTimes(3);

	pending[1]?.resolve();
	await flush();
	expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent).toBe(
		"",
	);

	pending[2]?.resolve();
	await flush();
	expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent).toBe(
		"Second",
	);
});

test("contains nested renderer rejection to one panel", async () => {
	renderMock
		.mockRejectedValueOnce(new Error("<render failed>"))
		.mockImplementationOnce(async (_app, markdown, element) => {
			element.textContent = markdown;
		});
	const generation = { value: 0 };
	const { container } = setup(generation);
	await flush();

	const error = container.querySelector<HTMLElement>(".tabsdown__panel-error");
	expect(error?.textContent).toContain("<render failed>");
	expect(error?.querySelector("render")).toBeNull();

	container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]?.click();
	await flush();
	expect(container.textContent).toContain("Second");
});

test("removes attempt containers before late completion after unload", async () => {
	const pending = deferred();
	renderMock.mockImplementation((_app, markdown, element) =>
		pending.promise.then(() => {
			element.textContent = markdown;
		}),
	);
	const generation = { value: 0 };
	const { child, container } = setup(generation);

	child.unload();
	expect(container.querySelector(".tabsdown__content")).toBeNull();
	pending.resolve();
	await flush();
	expect(container.textContent).not.toContain("First");
});

test("removes listeners on unload and gives a replacement child one handler", async () => {
	const generation = { value: 0 };
	const first = setup(generation);
	const retainedButton =
		first.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
	await flush();
	first.child.unload();
	retainedButton?.click();
	expect(renderMock).toHaveBeenCalledOnce();

	const replacement = new TabBlockRenderChild(
		{} as App,
		first.container,
		"Note.md",
		[
			{ label: "One", body: "First" },
			{ label: "Two", body: "Second" },
		],
		[],
		() => generation.value,
	);
	replacement.load();
	replacement.containerEl
		.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]
		?.click();
	await flush();
	expect(renderMock).toHaveBeenCalledTimes(3);
});

test("unloads a stale component before starting its replacement render", async () => {
	const generation = { value: 0 };
	const { container } = setup(generation);
	const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
	buttons[1]?.click();
	buttons[0]?.click();
	await flush();

	const order: string[] = [];
	componentUnloadMock.mockImplementation(() => order.push("unload"));
	renderMock.mockImplementation(async () => {
		order.push("render");
	});
	generation.value = 1;
	buttons[1]?.click();

	expect(order.slice(0, 2)).toEqual(["unload", "render"]);
});

test("rapid activation never attaches output to the wrong panel", async () => {
	const generation = { value: 0 };
	const operations: Deferred[] = [];
	renderMock.mockImplementation((_app, markdown, element) => {
		const operation = deferred();
		operations.push(operation);
		return operation.promise.then(() => {
			element.textContent = markdown;
		});
	});
	const { container } = setup(generation);
	const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
	const panels = container.querySelectorAll<HTMLElement>('[role="tabpanel"]');

	buttons[1]?.click();
	buttons[0]?.click();
	operations[1]?.resolve();
	operations[0]?.resolve();
	await flush();

	expect(panels[0]?.textContent).toBe("First");
	expect(panels[1]?.textContent).toBe("Second");
	expect(panels[0]?.hidden).toBe(false);
	expect(panels[1]?.hidden).toBe(true);
});

test("releases the height pin when a panel holds a nested block", async () => {
	renderMock.mockImplementation(async (_app, markdown, element) => {
		element.textContent = markdown;
		if (markdown.startsWith("Second")) {
			element.createEl("div", { cls: "tabsdown" });
		}
	});
	const { container } = setup({ value: 0 });
	await flush();
	const panels = container.querySelector<HTMLElement>(".tabsdown__panels");
	const second =
		container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
	if (!panels) throw new Error("Expected panels.");
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);

	second?.click();
	expect(panels.classList.contains("tabsdown__panels--animating")).toBe(true);

	await flush();
	expect(panels.style.height).toBe("");
	expect(panels.classList.contains("tabsdown__panels--animating")).toBe(false);
});

test("keeps the selected panel's pin when a superseded render resolves first", async () => {
	vi.useFakeTimers();
	const pending: Record<string, Deferred> = {};
	renderMock.mockImplementation((_app, markdown, element) => {
		const operation = deferred();
		pending[markdown] = operation;
		return operation.promise.then(() => {
			element.textContent = markdown;
		});
	});
	const { container } = setup({ value: 0 }, [
		{ label: "One", body: "First" },
		{ label: "Two", body: "Second" },
		{ label: "Three", body: "Third" },
	]);
	const panels = container.querySelector<HTMLElement>(".tabsdown__panels");
	const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
	if (!panels) throw new Error("Expected panels.");
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
	pending.First?.resolve();
	await vi.advanceTimersByTimeAsync(0);

	buttons[1]?.click();
	buttons[2]?.click();
	expect(panels.classList.contains("tabsdown__panels--animating")).toBe(true);

	// Both renders are in flight and the superseded one lands first. Its pin is
	// its own; reading it must not consume the one the selected panel waits on,
	// or nothing arms the reset and the pinned height never comes off.
	pending.Second?.resolve();
	await vi.advanceTimersByTimeAsync(0);
	pending.Third?.resolve();
	await vi.advanceTimersByTimeAsync(0);

	await vi.advanceTimersByTimeAsync(300);
	expect(panels.style.height).toBe("");
	expect(panels.classList.contains("tabsdown__panels--animating")).toBe(false);
});

test("measures the old height before the outgoing panel is emptied", async () => {
	const { container } = setup({ value: 0 });
	await flush();
	const panels = container.querySelector<HTMLElement>(".tabsdown__panels");
	const second =
		container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
	if (!panels) throw new Error("Expected panels.");
	let measured: { id?: string; text?: string } | undefined;
	vi.spyOn(panels, "getBoundingClientRect").mockImplementation(() => {
		const visible = panels.querySelector<HTMLElement>(
			".tabsdown__panel:not([hidden])",
		);
		measured ??= { id: visible?.id, text: visible?.textContent ?? undefined };
		return { height: 80 } as DOMRect;
	});
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);

	second?.click();

	// Measuring later than this reads the incoming panel, which is hidden or
	// already emptied, so every switch would animate up from nothing.
	expect(measured?.id).toBe(panels.children[0]?.id);
	expect(measured?.text).toBe("First");
});
