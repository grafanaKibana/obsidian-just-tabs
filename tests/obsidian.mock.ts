import { vi } from "vitest";

type RenderFunction = (
	app: unknown,
	markdown: string,
	element: HTMLElement,
	sourcePath: string,
	component: unknown,
) => Promise<void>;

export const renderMock = vi.fn<RenderFunction>();
export const componentUnloadMock = vi.fn<(component: Component) => void>();
export const processorRegistrationMock = vi.fn<
	(
		language: string,
		handler: (
			source: string,
			element: HTMLElement,
			context: unknown,
		) => Promise<unknown> | void,
	) => void
>();

export class Component {
	private readonly cleanup: Array<() => void> = [];
	private readonly children: Component[] = [];
	private loaded = false;

	load(): void {
		this.loaded = true;
		this.onload();
		this.children.forEach((child) => child.load());
	}

	onload(): void {}

	unload(): void {
		for (const child of [...this.children]) child.unload();
		for (const callback of this.cleanup.splice(0).reverse()) callback();
		this.loaded = false;
		this.onunload();
		componentUnloadMock(this);
	}

	onunload(): void {}

	addChild<T extends Component>(component: T): T {
		this.children.push(component);
		if (this.loaded) component.load();
		return component;
	}

	removeChild<T extends Component>(component: T): T {
		const index = this.children.indexOf(component);
		if (index >= 0) this.children.splice(index, 1);
		component.unload();
		return component;
	}

	register(callback: () => void): void {
		this.cleanup.push(callback);
	}

	registerDomEvent(
		element: HTMLElement,
		type: keyof HTMLElementEventMap,
		callback: EventListener,
	): void {
		element.addEventListener(type, callback);
		this.register(() => element.removeEventListener(type, callback));
	}
}

export class MarkdownRenderChild extends Component {
	constructor(public readonly containerEl: HTMLElement) {
		super();
	}
}

export const MarkdownRenderer = { render: renderMock };

export class MarkdownView {}

export class Plugin extends Component {
	constructor(public readonly app: unknown) {
		super();
	}

	registerEvent<T>(event: T): T {
		return event;
	}

	registerMarkdownCodeBlockProcessor(
		language: string,
		handler: (
			source: string,
			element: HTMLElement,
			context: unknown,
		) => Promise<unknown> | void,
	): void {
		processorRegistrationMock(language, handler);
	}
}
