import { afterEach, expect, test } from "vitest";

import { trackSeparators } from "../src/separator";
import { stubResizeObserver } from "./panel-size";

afterEach(() => {
	document.body.replaceChildren();
});

function rect(left: number, top: number, width = 40, height = 32): DOMRect {
	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
		toJSON: () => ({}),
	};
}

test("centers separators between visible tabs and follows ancestor style changes", async () => {
	const resize = stubResizeObserver();
	const sheet = document.head.appendChild(document.createElement("style"));
	sheet.textContent = "body.separator-column .separator-test-list { flex-direction: column; }";
	try {
		const list = document.body.appendChild(document.createElement("div"));
		list.className = "separator-test-list";
		list.style.display = "flex";
		list.style.flexWrap = "wrap";
		const buttons = [0, 1, 2, 3].map(() => {
			const button = list.appendChild(document.createElement("button"));
			const separator = button.appendChild(document.createElement("span"));
			separator.className = "tabsdown__separator";
			separator.setAttribute("aria-hidden", "true");
			separator.hidden = true;
			return button;
		});
		const boxes = [rect(0, 0), rect(44, 0), rect(0, 36), rect(44, 36)];
		buttons.forEach((button, index) => {
			button.getBoundingClientRect = () => boxes[index] ?? rect(0, 0);
		});

		const tracker = trackSeparators(list, buttons);
		const separators = buttons.map((button) =>
			button.querySelector<HTMLElement>(".tabsdown__separator"),
		);
		expect(separators.map((separator) => separator?.hidden)).toEqual([
			true,
			false,
			true,
			false,
		]);
		expect(separators[1]?.style.left).toBe("-2px");
		expect(separators[1]?.style.top).toBe("16px");

		boxes.splice(0, 2, rect(80, 0, 30), rect(20, 0, 40));
		tracker.refresh();
		expect(separators[1]?.style.left).toBe("50px");

		buttons[0]!.hidden = true;
		tracker.refresh();
		expect(separators[1]?.hidden).toBe(true);

		boxes.splice(0, boxes.length, rect(0, 0), rect(0, 36), rect(44, 0), rect(44, 36));
		document.body.classList.add("separator-column");
		await Promise.resolve();
		expect(separators.map((separator) => separator?.hidden)).toEqual([
			true,
			true,
			true,
			false,
		]);
		expect(separators[3]?.classList.contains("tabsdown__separator--column")).toBe(true);
		expect(separators[3]?.style.left).toBe("20px");
		expect(separators[3]?.style.top).toBe("-2px");

		tracker.destroy();
		expect(resize.observed()).toHaveLength(0);
	} finally {
		sheet.remove();
		resize.restore();
	}
});
