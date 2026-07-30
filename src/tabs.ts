import { createHeightAnimator, type HeightAnimator } from "./panel-height";

export interface TabSpec {
	id: string;
	label: string;
	panel: HTMLElement;
}

export interface MountTabsOptions {
	tabs: readonly TabSpec[];
	selection?: string | null;
	label: string;
	onSelectionChange?: (
		selection: string | null,
		previous: string | null,
	) => void;
}

export interface TabsController {
	readonly selection: string | null;
	setSelection(id: string | null): void;
	setAvailable(id: string, available: boolean): void;
	destroy(): void;
}

const panelAttributes = [
	"id",
	"role",
	"tabindex",
	"aria-labelledby",
	"hidden",
] as const;

let nextMountId = 0;

interface MountedTab {
	id: string;
	button: HTMLButtonElement;
	panel: HTMLElement;
	available: boolean;
	restore: Map<string, string | null>;
	hadPanelClass: boolean;
}

export function mountTabs(
	container: HTMLElement,
	options: MountTabsOptions,
): TabsController {
	if (options.tabs.length === 0) {
		throw new Error("Tabsdown: mountTabs needs at least one tab.");
	}
	if (
		new Set(options.tabs.map((tab) => tab.id)).size !== options.tabs.length
	) {
		throw new Error("Tabsdown: mountTabs tab ids must be unique.");
	}
	if (
		new Set(options.tabs.map((tab) => tab.panel)).size !== options.tabs.length
	) {
		throw new Error("Tabsdown: mountTabs panel elements must be unique.");
	}
	if (container.querySelector(":scope > .tabsdown--mounted")) {
		throw new Error("Tabsdown: this container already has mounted tabs.");
	}

	const mountId = `tabsdown-mount-${++nextMountId}`;
	const root = document.createElement("div");
	root.className = "tabsdown tabsdown--mounted";
	root.tabIndex = -1;

	const tabList = document.createElement("div");
	tabList.className = "tabsdown__tablist";
	tabList.setAttribute("role", "group");
	tabList.setAttribute("aria-label", options.label);

	const panelsEl = document.createElement("div");
	panelsEl.className = "tabsdown__panels";

	const animator: HeightAnimator = createHeightAnimator(panelsEl);
	const tabs: MountedTab[] = options.tabs.map((tab, index) => {
		const buttonId = `${mountId}-tab-${index}`;
		const button = document.createElement("button");
		button.type = "button";
		button.id = buttonId;
		button.className = "tabsdown__tab";
		const label = document.createElement("span");
		label.className = "tabsdown__tab-label";
		label.textContent = tab.label;
		button.append(label);
		tabList.append(button);

		const restore = new Map<string, string | null>(
			panelAttributes.map((name) => [name, tab.panel.getAttribute(name)]),
		);
		// A caller that already identifies its own panel keeps that id, so its
		// lookups still resolve while the panel is mounted.
		tab.panel.id ||= `${mountId}-panel-${index}`;
		tab.panel.setAttribute("role", "group");
		tab.panel.setAttribute("aria-labelledby", buttonId);
		tab.panel.tabIndex = 0;
		button.setAttribute("aria-controls", tab.panel.id);

		const hadPanelClass = tab.panel.classList.contains("tabsdown__panel");
		tab.panel.classList.add("tabsdown__panel");
		panelsEl.append(tab.panel);

		return {
			id: tab.id,
			button,
			panel: tab.panel,
			available: true,
			restore,
			hadPanelClass,
		};
	});

	root.append(tabList, panelsEl);
	container.append(root);

	let selection: string | null = null;
	let notifying = false;
	let destroyed = false;

	const find = (id: string): MountedTab | undefined =>
		tabs.find((tab) => tab.id === id);

	const applyState = (): void => {
		for (const tab of tabs) {
			const active = tab.id === selection;
			tab.button.hidden = !tab.available;
			tab.button.setAttribute("aria-expanded", active ? "true" : "false");
			tab.panel.hidden = !active;
		}
		root.classList.toggle("tabsdown--collapsed", selection === null);
	};

	// Committed before the callback runs, so a handler that calls back in sees
	// settled state; the guard then keeps that call from notifying again.
	const commit = (next: string | null, notify: boolean): void => {
		const previous = selection;
		if (next === previous) return;
		const from = panelsEl.getBoundingClientRect().height;
		selection = next;
		applyState();
		animator.animate(from);
		if (!notify || notifying) return;
		notifying = true;
		try {
			options.onSelectionChange?.(selection, previous);
		} finally {
			notifying = false;
		}
	};

	const onClick = (event: Event): void => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const button = target.closest("button");
		const tab = tabs.find((candidate) => candidate.button === button);
		if (!tab || !tab.available) return;
		commit(tab.id === selection ? null : tab.id, true);
	};

	tabList.addEventListener("click", onClick);

	const initial = options.selection ?? null;
	selection = initial !== null && find(initial) ? initial : null;
	applyState();

	return {
		get selection(): string | null {
			return selection;
		},

		setSelection(id: string | null): void {
			if (destroyed) return;
			if (id === null) {
				commit(null, false);
				return;
			}
			const tab = find(id);
			if (!tab?.available) return;
			commit(id, false);
		},

		setAvailable(id: string, available: boolean): void {
			if (destroyed) return;
			const tab = find(id);
			if (!tab || tab.available === available) return;
			tab.available = available;
			if (available) {
				tab.button.hidden = false;
				return;
			}
			// The button is about to disappear; leaving focus on it drops
			// the user at the top of the document.
			if (tab.button.ownerDocument.activeElement === tab.button) {
				const next = tabs.find(
					(candidate) => candidate !== tab && candidate.available,
				);
				(next?.button ?? root).focus();
			}
			if (selection === id) {
				commit(null, true);
			} else {
				applyState();
			}
		},

		destroy(): void {
			if (destroyed) return;
			destroyed = true;
			animator.cancel();
			tabList.removeEventListener("click", onClick);
			for (const tab of tabs) {
				for (const [name, value] of tab.restore) {
					if (value === null) {
						tab.panel.removeAttribute(name);
					} else {
						tab.panel.setAttribute(name, value);
					}
				}
				if (!tab.hadPanelClass) {
					tab.panel.classList.remove("tabsdown__panel");
				}
				container.append(tab.panel);
			}
			root.remove();
		},
	};
}
