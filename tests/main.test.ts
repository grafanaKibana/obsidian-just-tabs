import type { App, PluginManifest } from "obsidian";
import { beforeEach, expect, test, vi } from "vitest";
import TabsdownPlugin from "../src/main";
import {
	processorRegistrationMock,
	renderMock,
} from "./obsidian.mock";

interface CapturedEvent {
	name: string;
	callback: () => void;
}

function createPlugin(): {
	app: App;
	editor: {
		focus: ReturnType<typeof vi.fn>;
		setCursor: ReturnType<typeof vi.fn>;
	};
	events: CapturedEvent[];
	getMode: ReturnType<typeof vi.fn>;
	trigger: ReturnType<typeof vi.fn>;
	plugin: TabsdownPlugin;
} {
	const events: CapturedEvent[] = [];
	const on = (name: string, callback: () => void): object => {
		events.push({ name, callback });
		return {};
	};
	const trigger = vi.fn();
	const editor = {
		focus: vi.fn(),
		setCursor: vi.fn(),
	};
	const getMode = vi.fn(() => "source");
	const app = {
		vault: { on },
		metadataCache: { on },
		workspace: {
			getActiveViewOfType: vi.fn(() => ({
				editor,
				file: { path: "Folder/Note.md" },
				getMode,
			})),
			trigger,
		},
	} as unknown as App;
	const manifest = {
		id: "tabsdown",
		name: "Tabsdown",
		version: "0.1.0",
		minAppVersion: "1.0.0",
		description: "Tabbed blocks.",
		author: "grafanaKibana",
		isDesktopOnly: false,
		dir: "",
	} satisfies PluginManifest;
	return {
		app,
		editor,
		events,
		getMode,
		trigger,
		plugin: new TabsdownPlugin(app, manifest),
	};
}

function flush(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}

beforeEach(() => {
	processorRegistrationMock.mockReset();
	renderMock.mockReset();
	renderMock.mockImplementation(async (_app, markdown, element) => {
		element.textContent = markdown;
	});
});

test("registers one processor, forwards sourcePath, and advances freshness events", async () => {
	const { events, plugin, trigger } = createPlugin();
	plugin.onload();

	expect(processorRegistrationMock).toHaveBeenCalledOnce();
	expect(processorRegistrationMock.mock.calls[0]?.[0]).toBe("tabs");
	expect(events.map((event) => event.name)).toEqual([
		"create",
		"modify",
		"delete",
		"rename",
		"changed",
	]);
	expect(trigger).toHaveBeenCalledWith("parse-style-settings");

	const handler = processorRegistrationMock.mock.calls[0]?.[1];
	if (!handler) throw new Error("Expected a tabs processor.");
	const container = document.createElement("div");
	const addChild = vi.fn((child: { load(): void }) => child.load());
	void handler(
		"--- tab: One\nFirst\n--- tab: Two\nSecond",
		container,
		{
			sourcePath: "Folder/Note.md",
			addChild,
			getSectionInfo: () => null,
		},
	);
	await flush();

	expect(addChild).toHaveBeenCalledOnce();
	expect(renderMock).toHaveBeenCalledWith(
		expect.anything(),
		"First\n",
		expect.any(HTMLElement),
		"Folder/Note.md",
		expect.anything(),
	);

	const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
	buttons[1]?.click();
	buttons[0]?.click();
	await flush();
	expect(renderMock).toHaveBeenCalledTimes(2);

	for (const event of events) event.callback();
	buttons[1]?.click();
	await flush();
	expect(renderMock).toHaveBeenCalledTimes(3);
});

test("renders invalid source as text with only the edit bridge", () => {
	const { plugin } = createPlugin();
	plugin.onload();
	const handler = processorRegistrationMock.mock.calls[0]?.[1];
	if (!handler) throw new Error("Expected a tabs processor.");
	const container = document.createElement("div");
	const addChild = vi.fn();

	void handler("<img src=x onerror=alert(1)>", container, {
		sourcePath: "Note.md",
		addChild,
		getSectionInfo: () => null,
	});

	expect(addChild).toHaveBeenCalledOnce();
	expect(container.querySelector("img")).toBeNull();
	expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
});

test("moves the Live Preview editing locus into a tapped block", async () => {
	const { editor, getMode, plugin } = createPlugin();
	plugin.onload();
	const handler = processorRegistrationMock.mock.calls[0]?.[1];
	if (!handler) throw new Error("Expected a tabs processor.");
	const container = document.createElement("div");
	const editorRoot = document.createElement("div");
	editorRoot.setAttribute("contenteditable", "true");
	editorRoot.append(container);
	const addChild = vi.fn((child: { load(): void }) => child.load());
	const section = {
		lineEnd: 8,
		lineStart: 3,
		text: "",
	};
	const getSectionInfo = vi.fn<() => typeof section | null>(() => section);

	void handler(
		"--- tab: One\nFirst\n--- tab: Two\nSecond",
		container,
		{ sourcePath: "Folder/Note.md", addChild, getSectionInfo },
	);
	await flush();

	container
		.querySelector<HTMLElement>('[role="tabpanel"]')
		?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

	expect(editor.setCursor).toHaveBeenCalledWith({ line: 4, ch: 0 });
	expect(editor.focus).toHaveBeenCalledOnce();
	expect(getSectionInfo).toHaveBeenCalledTimes(2);

	getSectionInfo.mockReturnValue(null);
	container
		.querySelector<HTMLElement>('[role="tabpanel"]')
		?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	expect(editor.setCursor).toHaveBeenCalledTimes(2);

	container.querySelector<HTMLButtonElement>('[role="tab"]')?.click();
	expect(editor.setCursor).toHaveBeenCalledTimes(2);

	getMode.mockReturnValue("preview");
	container
		.querySelector<HTMLElement>('[role="tabpanel"]')
		?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	expect(editor.setCursor).toHaveBeenCalledTimes(2);
});
