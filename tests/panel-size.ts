import { vi } from "vitest";

export interface ResizeObserverStub {
	fire(): void;
	observed(): Element[];
	restore(): void;
}

// jsdom ships no ResizeObserver, and the tracker needs one to follow content that
// arrives after a panel is shown.
export function stubResizeObserver(target: Window = window): ResizeObserverStub {
	const callbacks: ResizeObserverCallback[] = [];
	const elements: Element[] = [];
	class Stub {
		constructor(callback: ResizeObserverCallback) {
			callbacks.push(callback);
		}
		observe(element: Element): void {
			elements.push(element);
		}
		unobserve(element: Element): void {
			const index = elements.indexOf(element);
			if (index >= 0) elements.splice(index, 1);
		}
		disconnect(): void {
			elements.length = 0;
		}
	}
	const original = Reflect.get(target, "ResizeObserver") as unknown;
	Reflect.set(target, "ResizeObserver", Stub);
	return {
		fire(): void {
			for (const callback of callbacks) {
				callback([], {} as ResizeObserver);
			}
		},
		observed: () => [...elements],
		restore(): void {
			Reflect.set(target, "ResizeObserver", original);
		},
	};
}

// The panels box is as tall as whichever panel is visible, which is what the
// tracker reads and what the DOM would report for real.
export function stubPanelHeights(
	container: HTMLElement,
	heights: readonly number[],
): (index: number, height: number) => void {
	const panelsEl = container.querySelector<HTMLElement>(".tabsdown__panels");
	if (!panelsEl) throw new Error("Expected a panels wrapper.");
	const panels = Array.from(
		panelsEl.querySelectorAll<HTMLElement>(":scope > .tabsdown__panel"),
	);
	const current = [...heights];
	// A panel that has not rendered yet, or was just emptied for a re-render,
	// measures nothing at all. Reporting its eventual height instead would hide
	// every case the floor exists for.
	const measure = (index: number): number => {
		const panel = panels[index];
		if (!panel) return 0;
		const content =
			panel.querySelector<HTMLElement>(".tabsdown__content") ?? panel;
		const filled =
			content.childElementCount > 0 || (content.textContent ?? "") !== "";
		return filled ? (current[index] ?? 0) : 0;
	};
	panels.forEach((panel, index) => {
		vi.spyOn(panel, "getBoundingClientRect").mockImplementation(
			() => ({ height: measure(index) }) as DOMRect,
		);
	});
	vi.spyOn(panelsEl, "getBoundingClientRect").mockImplementation(() => {
		// Once the box is pinned its rect is that pin, not the panel underneath it.
		// Reporting the panel instead would hand every switch a floor it never had.
		const pinned = Number.parseFloat(panelsEl.style.height);
		if (Number.isFinite(pinned)) return { height: pinned } as DOMRect;
		const visible = panels.findIndex((panel) => !panel.hidden);
		return { height: visible < 0 ? 0 : measure(visible) } as DOMRect;
	});
	return (index: number, height: number): void => {
		current[index] = height;
	};
}
