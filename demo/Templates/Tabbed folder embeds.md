<%*
const folder = (await tp.system.prompt("Folder path", "")).replace(/^\/|\/$/g, "");
const matches = app.vault
	.getMarkdownFiles()
	.filter((file) => (folder === "" ? true : file.path.startsWith(`${folder}/`)))
	.filter((file) => file.path !== tp.file.path(true))
	.sort((a, b) => a.basename.localeCompare(b.basename));
const notes = [...new Map(matches.map((file) => [file.basename, file])).values()];

if (notes.length < 2) {
	tR += `> [!warning] Found ${notes.length} note(s) under "${folder}". A tabsdown block needs at least two tabs.`;
} else {
	tR += "````tabsdown\n";
	tR += notes
		.map(
			(file, index) =>
				`tab: ${file.basename}${index === 0 ? " (left, multi)" : ""}\n\n![[${file.path}]]\n`,
		)
		.join("\n");
	tR += "````";
}
%>
