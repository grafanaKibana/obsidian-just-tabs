<%*
const languages = (await tp.system.prompt("Languages, comma separated", "python, javascript"))
	.split(",")
	.map((language) => language.trim())
	.filter(Boolean);

tR += "````tabsdown\n";
tR += languages
	.map(
		(language, index) =>
			`tab: ${language}${index === 0 ? " (top, one)" : ""}\n\n` +
			"```" +
			`${language}\n\n` +
			"```\n",
	)
	.join("\n");
tR += "````";
%>
