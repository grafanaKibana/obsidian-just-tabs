# Contributing

Just Tabs is intentionally small: Markdown remains the source of truth, Obsidian's public renderer handles panel content, and optional plugins are integrations rather than runtime dependencies.

## Before opening a pull request

1. Open or select an issue.
2. Keep the change inside that issue's acceptance criteria.
3. Do not add private Obsidian APIs, runtime dependencies, plugin-specific adapters, or source-mutating tab behavior.
4. Run:

   ```bash
   npm ci
   npm run check
   ```

5. Complete the relevant manual checks from [Compatibility](docs/compatibility.md).

## Development

Use Node 24 for release parity.

```bash
npm install
npm run dev
```

For manual testing, copy or link this repository into:

```text
<Vault>/.obsidian/plugins/just-tabs/
```

Build `main.js`, reload Obsidian, then enable **Just Tabs** under **Settings → Community plugins**.

## Pull requests

- Use one short-lived branch per issue.
- Prefer one independently verifiable issue per squash-merged pull request.
- Include command output and manual test evidence.
- Treat inaccessible focus, leaked render children, source mutation, and release-contract failures as blockers.

## Releases

Run `npm run version -- <x.y.z>` and commit all four version authorities:

- `package.json`
- `package-lock.json`
- `manifest.json`
- `versions.json`

The exact unprefixed tag creates a draft release. Publish it only after installing the draft assets in a clean vault and completing the manual release matrix. Do not replace a published tag or its assets; corrections require a higher version.

Submit only a published stable release through the current [Obsidian Community site](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin): sign in, link the GitHub owner, open **Plugins → New plugin**, enter this repository URL, accept the policies and maintenance commitment, and submit. Do not open a manual submission pull request to `obsidianmd/obsidian-releases`. Only the initial release is submitted through the Community site; later versions are discovered from published GitHub Releases.

Automated-review changes require a higher patch release and the same release gates before using **Retry**. Do not claim Community Plugins availability until review passes and the listing is published.
