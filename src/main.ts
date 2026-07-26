import { Plugin } from "obsidian";
import { parseTabs } from "./parser";
import { TabBlockRenderChild, renderTabsDiagnostic } from "./render";

export default class JustTabsPlugin extends Plugin {
	private freshnessGeneration = 0;

	onload(): void {
		const markContentStale = (): void => {
			this.freshnessGeneration += 1;
		};

		this.registerEvent(this.app.vault.on("create", markContentStale));
		this.registerEvent(this.app.vault.on("modify", markContentStale));
		this.registerEvent(this.app.vault.on("delete", markContentStale));
		this.registerEvent(this.app.vault.on("rename", markContentStale));
		this.registerEvent(
			this.app.metadataCache.on("changed", markContentStale),
		);

		this.registerMarkdownCodeBlockProcessor("tabs", (source, element, context) => {
			const result = parseTabs(source);
			if (!result.ok) {
				renderTabsDiagnostic(element, result.diagnostic);
				return;
			}

			context.addChild(
				new TabBlockRenderChild(
					this.app,
					element,
					context.sourcePath,
					result.tabs,
					() => this.freshnessGeneration,
				),
			);
		});

		this.app.workspace.trigger("parse-style-settings");
	}
}
