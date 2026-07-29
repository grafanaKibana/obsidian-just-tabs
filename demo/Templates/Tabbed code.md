<%*
const languages = (await tp.system.prompt("Languages, comma separated", "python, javascript"))
	.split(",")
	.map((language) => language.trim())
	.filter(Boolean);

tR += "````tabsdown\nconfig: top, one\n\n";
tR += languages
	.map(
		(language) =>
			`tab: ${language}\n\n` + "```" + `${language}\n\n` + "```\n",
	)
	.join("\n");
tR += "````";
%>
