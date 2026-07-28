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

For this repository's demo vault, enable the included hook once:

```bash
git config core.hooksPath .githooks
```

Before each commit, the hook builds, copies, and stages `main.js`, `manifest.json`, and `styles.css` for the demo vault so the commit remains directly testable.

## Pull requests

- Use one short-lived branch per issue, named `feature/<name>`. CI rejects any other branch name into `dev`, apart from Dependabot's.
- Link the issue in the pull request body with a closing keyword, such as `Closes #17`. The issue must exist.
- Prefer one independently verifiable issue per squash-merged pull request.
- Include command output and manual test evidence.
- Treat inaccessible focus, leaked render children, source mutation, and release-contract failures as blockers.

## Branches

| Branch | Role |
| --- | --- |
| `feature/<name>` | Short-lived, one per issue |
| `dev` | Integration branch; every feature lands here first |
| `main` | Protected release branch; reachable only by a promotion pull request from `dev` |

Pull requests into `dev` need the `quality` and `policy` checks and one approval. Pull requests into `main` need the same, and are rejected unless they come from `dev`.

Issues and pull requests are for complete features. The repository owner pushes small changes — a fix, a tweak, a doc correction — straight to `dev`. CI runs on the push either way.

The owner holds `admin`, which bypasses every rule. These gates are hard for contributors and a deliberate speed bump for the owner; owner-authored merges are recorded as bypasses in the repository rule-suite log. The one-approval requirement exists so that contributor pull requests get a review — it is satisfied by the owner approving someone else's work, and bypassed on the owner's own.

## Releases

A release is produced by promoting `dev` to `main`. There is no manual tag step, and **pushing a tag by hand no longer creates a release.**

1. On `dev`, run `npm run version -- <x.y.z>` and commit all four version authorities:
   - `package.json`
   - `package-lock.json`
   - `manifest.json`
   - `versions.json`
2. Open a pull request from `dev` into `main`. CI fails it before merge if the version is already tagged, or if it does not increase on the version already on `main`.
3. Merging it creates the exact unprefixed tag at the merge commit and a **draft** release carrying `main.js`, `manifest.json`, `styles.css`, checksums, the manual gate, and the pull requests merged into `dev` since the previous release.
4. Publish the draft only after installing its assets in a clean vault and completing the manual release matrix.

The notes window runs from the previous release tag to the promotion's merge time, so an unpublished draft does not distort the next release and work merged into `dev` after the promotion is not advertised as shipped.

If the tagging step succeeds and a later step fails, re-run the job. Tagging is idempotent while the tag points at the promoted commit, and refuses to proceed when it points anywhere else.

Do not replace a published tag or its assets; corrections require a higher version.

### The release token

Tag creation is blocked by the `release tags` ruleset for every actor except the repository owner, and a user-owned repository cannot grant the GitHub Actions app a bypass. The tagging step therefore runs as the owner, using a fine-grained personal access token stored as the `RELEASE_TOKEN` secret:

- Scope it to **this repository only**, with `Contents: Read and write` and nothing else.
- Only the tagging step uses it. Every other step runs on the default `GITHUB_TOKEN`.
- Set an expiry and rotate it. Once it lapses, promotions fail at the tagging step with an explicit error.

Repository secrets are readable by workflows running on same-repo pull requests, so a workflow change merged into `dev` could read this token. Review workflow diffs in promotion pull requests deliberately.

Never add `build` or `draft-release` to a required-status-check list. They only run on a merged promotion, so they would never report on an open pull request and would block every merge permanently.

Submit only a published stable release through the current [Obsidian Community site](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin): sign in, link the GitHub owner, open **Plugins → New plugin**, enter this repository URL, accept the policies and maintenance commitment, and submit. Do not open a manual submission pull request to `obsidianmd/obsidian-releases`. Only the initial release is submitted through the Community site; later versions are discovered from published GitHub Releases.

Automated-review changes require a higher patch release and the same release gates before using **Retry**. Do not claim Community Plugins availability until review passes and the listing is published.
