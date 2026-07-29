<%*
const labels = (await tp.system.prompt("Tab labels, comma separated", "First, Second"))
	.split(",")
	.map((label) => label.trim())
	.filter(Boolean);
const position = await tp.system.suggester(
	["top", "left", "right", "bottom"],
	["top", "left", "right", "bottom"],
	false,
	"Tab list position",
);
const layout = await tp.system.suggester(
	["one line", "wrap labels"],
	["one", "multi"],
	false,
	"Tab list layout",
);

tR += "````tabsdown\n" + `config: ${position}, ${layout}\n\n`;
tR += labels.map((label) => `tab: ${label}\n\n`).join("\n");
tR += "````";
%>
