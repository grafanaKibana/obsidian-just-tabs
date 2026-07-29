# Contributing

Tabsdown is intentionally small: Markdown remains the source of truth, Obsidian's public renderer handles panel content, and optional plugins are integrations rather than runtime dependencies.

## Before opening a pull request

1. Open or select an issue.
2. Keep the change inside that issue's acceptance criteria.
3. Do not add private Obsidian APIs, runtime dependencies, plugin-specific adapters, or source-mutating tab behavior.
4. Run:

   ```bash
   npm ci
   npm run check
   ```

5. Test the affected behavior in the relevant Obsidian modes and platforms.

## Development

Use Node 24 for release parity.

```bash
npm install
npm run dev
```

For manual testing, copy or link this repository into:

```text
<Vault>/.obsidian/plugins/tabsdown/
```

Build `main.js`, reload Obsidian, then enable **Tabsdown** under **Settings → Community plugins**.

The demo vault always ships the plugin built from the same commit, so anyone can open `demo/` in Obsidian and exercise the current behavior. After changing `src/`, `styles.css`, or `manifest.json`, run `npm run demo` and commit the result; CI fails the `quality` check when the committed build does not match the source.

## Pull requests

- Use one short-lived branch per change, branched from `main` and squash-merged back into it.
- Link the issue in the pull request body with a closing keyword, such as `Closes #17`.
- Prefer one independently verifiable issue per pull request.
- Include command output and manual test evidence.
- Treat inaccessible focus, leaked render children, source mutation, and release-contract failures as blockers.

Pull requests into `main` need the `quality` check. `main` cannot be force-pushed or deleted.

## Releases

`main` is always releasable, and a release is cut on demand rather than as a side effect of merging.

1. Run `npm run version -- <x.y.z>`, which updates `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` together. Merge that bump into `main` like any other change.
2. Run the **Release** workflow from the Actions tab with **dry-run** checked. It builds, verifies, and prints the notes it would publish, without tagging anything.
3. Run it again with **dry-run** unchecked. It creates the exact unprefixed tag at the current `main` commit and a **draft** release carrying `main.js`, `manifest.json`, `styles.css`, checksums, the manual gate, and the commits since the previous tag.
4. Publish the draft only after installing its assets in a clean vault and completing the manual release matrix.

If a step fails, fix it and re-run the workflow. Tagging accepts an existing tag only when it points at the commit being released, and drafting resumes an existing draft and replaces its assets.

Do not replace a published tag or its assets; corrections require a higher version.

### Tagging permissions

The workflow tags with the default `GITHUB_TOKEN`, which requires the `release tags` ruleset to restrict `update` and `deletion` but **not** `creation`. A user-owned repository cannot grant the GitHub Actions app a ruleset bypass, so restoring a `creation` restriction breaks every release at the tagging step, and would mean reintroducing an owner-scoped personal access token. Tags stay immutable either way: the remaining rules still forbid moving or deleting one.

Submit only a published stable release through the current [Obsidian Community site](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin): sign in, link the GitHub owner, open **Plugins → New plugin**, enter this repository URL, accept the policies and maintenance commitment, and submit. Do not open a manual submission pull request to `obsidianmd/obsidian-releases`. Only the initial release is submitted through the Community site; later versions are discovered from published GitHub Releases.

Automated-review changes require a higher patch release and the same release gates before using **Retry**. Do not claim Community Plugins availability until review passes and the listing is published.
