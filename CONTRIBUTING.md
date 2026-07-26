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

The exact unprefixed tag creates a draft release. Publish it only after clean-vault installation and the manual release matrix.
