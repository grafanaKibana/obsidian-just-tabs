import {
	App,
	Component,
	MarkdownRenderChild,
	MarkdownRenderer,
} from "obsidian";
import type { TabDefinition, TabsDiagnostic } from "./parser";

interface PanelState {
	panelEl: HTMLElement;
	component?: Component;
	attemptEl?: HTMLElement;
	generation?: number;
	epoch: number;
	status: "unrendered" | "rendering" | "rendered" | "error";
}

let nextBlockId = 0;

function createElement<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className: string,
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	element.className = className;
	return element;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function renderTabsDiagnostic(
	containerEl: HTMLElement,
	diagnostic: TabsDiagnostic,
): void {
	containerEl.replaceChildren();
	const root = createElement("div", "just-tabs just-tabs__diagnostic");
	root.setAttribute("role", "alert");

	const title = createElement("strong", "just-tabs__diagnostic-title");
	title.textContent = `Just Tabs: ${diagnostic.message}`;
	const location = createElement("div", "just-tabs__diagnostic-location");
	location.textContent = `Line ${diagnostic.line}`;
	const source = createElement("pre", "just-tabs__diagnostic-source");
	source.textContent = diagnostic.source;

	root.append(title, location, source);
	containerEl.append(root);
}

export class TabBlockRenderChild extends MarkdownRenderChild {
	private readonly blockId = `just-tabs-${++nextBlockId}`;
	private readonly buttons: HTMLButtonElement[] = [];
	private readonly panels: PanelState[] = [];
	private selectedIndex = 0;
	private focusIndex = 0;
	private disposed = false;

	constructor(
		private readonly app: App,
		containerEl: HTMLElement,
		private readonly sourcePath: string,
		private readonly tabs: readonly TabDefinition[],
		private readonly getGeneration: () => number,
	) {
		super(containerEl);
	}

	onload(): void {
		this.containerEl.replaceChildren();
		this.containerEl.classList.add("just-tabs");

		const tabList = createElement("div", "just-tabs__tablist");
		tabList.setAttribute("role", "tablist");
		tabList.setAttribute("aria-label", "Tabbed content");

		const panels = createElement("div", "just-tabs__panels");

		this.tabs.forEach((tab, index) => {
			const tabId = `${this.blockId}-tab-${index}`;
			const panelId = `${this.blockId}-panel-${index}`;
			const button = createElement("button", "just-tabs__tab");
			button.type = "button";
			button.id = tabId;
			button.textContent = tab.label;
			button.setAttribute("role", "tab");
			button.setAttribute("aria-controls", panelId);

			const panel = createElement("div", "just-tabs__panel");
			panel.id = panelId;
			panel.setAttribute("role", "tabpanel");
			panel.setAttribute("aria-labelledby", tabId);

			this.buttons.push(button);
			this.panels.push({
				panelEl: panel,
				epoch: 0,
				status: "unrendered",
			});
			tabList.append(button);
			panels.append(panel);

			this.registerDomEvent(button, "click", () => {
				this.activate(index, true);
			});
			this.registerDomEvent(button, "keydown", (event) => {
				this.onKeyDown(event, index);
			});
			this.registerDomEvent(button, "focus", () => {
				this.focusIndex = index;
				this.updateState();
			});
		});

		this.containerEl.append(tabList, panels);
		this.updateState();
		this.ensureRendered(0);
	}

	onunload(): void {
		this.disposed = true;
		for (const panel of this.panels) {
			this.disposePanel(panel);
		}
	}

	private onKeyDown(event: KeyboardEvent, index: number): void {
		let nextIndex: number | undefined;

		switch (event.key) {
			case "ArrowRight":
				nextIndex = (index + 1) % this.tabs.length;
				break;
			case "ArrowLeft":
				nextIndex = (index - 1 + this.tabs.length) % this.tabs.length;
				break;
			case "Home":
				nextIndex = 0;
				break;
			case "End":
				nextIndex = this.tabs.length - 1;
				break;
			case "Enter":
			case " ":
				event.preventDefault();
				this.activate(index, true);
				return;
			default:
				return;
		}

		event.preventDefault();
		this.focusIndex = nextIndex;
		this.updateState();
		this.buttons[nextIndex]?.focus();
		this.scrollTabIntoView(nextIndex);
	}

	private activate(index: number, focus: boolean): void {
		const wasSelected = index === this.selectedIndex;
		this.selectedIndex = index;
		this.focusIndex = index;
		this.updateState();
		this.ensureRendered(index, !wasSelected);
		if (focus) {
			this.buttons[index]?.focus();
		}
		this.scrollTabIntoView(index);
	}

	private updateState(): void {
		this.buttons.forEach((button, index) => {
			button.tabIndex = index === this.focusIndex ? 0 : -1;
			button.setAttribute(
				"aria-selected",
				index === this.selectedIndex ? "true" : "false",
			);
		});
		this.panels.forEach((panel, index) => {
			panel.panelEl.hidden = index !== this.selectedIndex;
		});
	}

	private scrollTabIntoView(index: number): void {
		this.buttons[index]?.scrollIntoView?.({
			block: "nearest",
			inline: "nearest",
		});
	}

	private ensureRendered(index: number, rebuildStale = false): void {
		const tab = this.tabs[index];
		const state = this.panels[index];
		if (!tab || !state || this.disposed) {
			return;
		}

		const generation = this.getGeneration();
		if (state.component) {
			if (
				state.generation === generation &&
				(state.status === "rendering" || state.status === "rendered")
			) {
				return;
			}
			if (state.generation !== generation && !rebuildStale) {
				return;
			}
		}

		this.disposePanel(state);
		const epoch = ++state.epoch;
		const component = this.addChild(new Component());
		const attemptEl = createElement("div", "just-tabs__content");
		state.panelEl.replaceChildren(attemptEl);
		state.component = component;
		state.attemptEl = attemptEl;
		state.generation = generation;
		state.status = "rendering";

		void MarkdownRenderer.render(
			this.app,
			tab.body,
			attemptEl,
			this.sourcePath,
			component,
		)
			.then(() => {
				if (!this.disposed && state.epoch === epoch) {
					state.status = "rendered";
				}
			})
			.catch((error: unknown) => {
				if (this.disposed || state.epoch !== epoch) {
					return;
				}
				if (state.component) {
					this.removeChild(state.component);
					state.component = undefined;
				}
				attemptEl.replaceChildren();
				const message = createElement("div", "just-tabs__panel-error");
				message.setAttribute("role", "alert");
				message.textContent = `This tab could not be rendered: ${errorMessage(error)}`;
				attemptEl.append(message);
				state.status = "error";
			});
	}

	private disposePanel(state: PanelState): void {
		state.epoch += 1;
		if (state.component) {
			this.removeChild(state.component);
			state.component = undefined;
		}
		state.attemptEl?.remove();
		state.attemptEl = undefined;
		state.status = "unrendered";
	}
}
