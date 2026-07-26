import type { App, PluginManifest } from "obsidian";
import { beforeEach, expect, test, vi } from "vitest";
import JustTabsPlugin from "../src/main";
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
	events: CapturedEvent[];
	trigger: ReturnType<typeof vi.fn>;
	plugin: JustTabsPlugin;
} {
	const events: CapturedEvent[] = [];
	const on = (name: string, callback: () => void): object => {
		events.push({ name, callback });
		return {};
	};
	const trigger = vi.fn();
	const app = {
		vault: { on },
		metadataCache: { on },
		workspace: { trigger },
	} as unknown as App;
	const manifest = {
		id: "just-tabs",
		name: "Just Tabs",
		version: "0.1.0",
		minAppVersion: "1.0.0",
		description: "Tabbed blocks.",
		author: "grafanaKibana",
		isDesktopOnly: false,
		dir: "",
	} satisfies PluginManifest;
	return {
		app,
		events,
		trigger,
		plugin: new JustTabsPlugin(app, manifest),
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
		{ sourcePath: "Folder/Note.md", addChild },
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

test("renders invalid source as text without creating a child", () => {
	const { plugin } = createPlugin();
	plugin.onload();
	const handler = processorRegistrationMock.mock.calls[0]?.[1];
	if (!handler) throw new Error("Expected a tabs processor.");
	const container = document.createElement("div");
	const addChild = vi.fn();

	void handler("<img src=x onerror=alert(1)>", container, {
		sourcePath: "Note.md",
		addChild,
	});

	expect(addChild).not.toHaveBeenCalled();
	expect(container.querySelector("img")).toBeNull();
	expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
});
