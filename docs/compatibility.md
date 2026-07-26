# Compatibility

Just Tabs passes each tab body to Obsidian's Markdown renderer with the containing note's source path. It does not sanitize or whitelist content, call third-party plugin APIs, emit plugin-specific refresh events, or ship plugin-specific adapters.

The compatibility promise is broad pipeline compatibility, not universal certification. Fix incompatibilities at the shared parser, renderer, lifecycle, or source-path boundary when possible. Otherwise, record the limitation here. Do not add an adapter for one plugin.

This document separates one recorded development snapshot from the manual matrix required for each release.

## Freshness behavior

The first panel renders immediately. Other panels render on first activation, and visited panels remain mounted while current.

Relevant public vault or metadata events advance a shared freshness generation. A hidden visited panel from an older generation is disposed and rebuilt once when reactivated. This is the Dataview freshness check: change indexed vault data while the Dataview panel is hidden, reactivate it, and confirm the new result appears.

Visible processors keep responsibility for their normal live refresh behavior. Network-, clock-, or private-state-driven changes cannot be inferred from Obsidian's public vault events and remain the embedded processor's responsibility.

## Test setup

1. Use a disposable vault or a privacy-safe copy.
2. Install the exact `main.js`, `manifest.json`, and `styles.css` under test.
3. Create a `Just Tabs Fixtures` folder.
4. Save the two fixture notes below in that folder.
5. Add representative local files named `fixture.png`, `fixture.mp3`, and `fixture.pdf` to the same folder, or update the fixture links to existing assets.
6. For optional-plugin checks, install Dataview and the selected additional processor through Obsidian. Do not commit a vault or third-party plugin binaries to this repository.

Tracker is the planned additional code-block processor. At each compatibility milestone, revalidate that [Tracker](https://github.com/pyrochlore/obsidian-tracker) is maintained and installable. Record its version if selected. If it is no longer suitable, choose another maintained community code-block processor and replace only that fixture block; the no-adapter policy does not change.

The development snapshot below records one Dataview and Tracker result. Both must be rerun against the exact release candidate before certification.

## Development validation snapshot

This is an isolated development result, not release certification. The complete manual matrix remains required against the exact release candidate.

- Date: 2026-07-26
- Build: Just Tabs `0.1.0` from commit `65b1076`
- Runtime: Obsidian `1.12.7` on macOS with an isolated profile and vault
- Optional plugins: Dataview `0.5.68`, Style Settings `1.0.9`, Tracker `1.19.0`, Templater `2.20.6`

| Status | Surface | Recorded result |
| --- | --- | --- |
| PASS | Reading View | Rendered 3 independent groups with 9 tabs; pointer selection remained independent; ArrowRight moved focus and Enter manually activated the focused tab. |
| PASS | Source Mode | Showed raw source with 0 Just Tabs widgets. |
| PASS | Live Preview outside the block | Rendered 3 widgets with 9 tabs. |
| PASS | Dataview freshness | A hidden panel refreshed from `1` to `2` after a real vault change and reactivation. |
| PASS | Tracker | Rendered one matching entry. |
| PARTIAL | Mobile-sized layout | At `390 × 844`, document containment and CSS metrics for 44 px targets and tab-list overflow were observed; no actual mobile, touch, or real scrolling was exercised. |
| PARTIAL | Style Settings | Plugin loaded and default classes were present; the five UI controls were not exercised. |
| PARTIAL | Templater | Plugin loaded; template generation was not executed. |
| GAP | Live Preview inside-block transition | macOS input authority was unavailable, so moving the editing locus inside the block could not be exercised. |
| GAP | Remaining release surfaces | Actual mobile/touch/real scrolling, light/dark/custom themes, optional plugins absent, and unload/rerender were not exercised. |

## Fixture source

Create `Just Tabs Fixture Target.md`:

````markdown
# Just Tabs fixture target

This note gives the fixture a note link, note embed, and block reference.

The Tracker smoke text is just-tabs-smoke.

This paragraph is the block-reference target.
^just-tabs-fixture-block
````

Create `Just Tabs Compatibility Fixture.md`:

`````markdown
# Just Tabs compatibility fixture

## Core and built-in processors

````tabs
--- tab: Core Markdown

### Heading

- First list item
- Second list item

| Item | State |
| --- | --- |
| Core Markdown | Present |

[[Just Tabs Fixture Target]]
[[Just Tabs Fixture Target#^just-tabs-fixture-block]]

--- tab: Embeds and rich content

![[Just Tabs Fixture Target]]
![[fixture.png]]
![[fixture.mp3]]
![[fixture.pdf]]

> [!info] Callout
> This callout is inside a tab.

Inline math: $a^2 + b^2 = c^2$

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

- [ ] Open task
- [x] Completed task

```mermaid
flowchart LR
    A[Markdown] --> B[Just Tabs]
    B --> C[Obsidian renderer]
```

```text
Static nested code block
\--- tab: this escaped line renders literally
```
````

## Community processors

````tabs
--- tab: Dataview

```dataview
TABLE file.mtime AS "Modified"
FROM "Just Tabs Fixtures"
SORT file.mtime DESC
LIMIT 5
```

--- tab: Tracker candidate

```tracker
searchType: text
searchTarget: just-tabs-smoke
folder: "Just Tabs Fixtures"
summary:
    template: "Found {{sum()}} matching text entries."
```
````

## Independent second group

````tabs
--- tab: First

This verifies that multiple tab groups remain independent.

--- tab: Second

Switching this group must not change the selected tab above.
````
`````

The static nested fence and both community processor blocks use three backticks, so their surrounding `tabs` fences use four.

## Diagnostic fixtures

Paste these blocks below the valid fixture, one at a time, and confirm that each diagnostic preserves its raw source.

### Fewer than two tabs

````markdown
```tabs
--- tab: Only

One tab is invalid.
```
````

### Content before the first marker

````markdown
```tabs
This content appears too early.

--- tab: First

First body.

--- tab: Second

Second body.
```
````

### Duplicate label

````markdown
```tabs
--- tab: Duplicate

First body.

--- tab: Duplicate

Second body.
```
````

### Empty label

````markdown
```tabs
--- tab: First

First body.

--- tab:

Second body.
```
````

### Nested tabs

``````markdown
`````tabs
--- tab: Outer

````tabs
--- tab: Nested one

Nested body.

--- tab: Nested two

Nested body.
````

--- tab: Other

Other body.
`````
``````

## Manual matrix

Use `PASS`, `FAIL`, `GAP`, or `N/A`. A viewport simulation does not replace an actual mobile runtime; record `GAP` when the required device or runtime is unavailable.

| Surface | Required checks | Required evidence |
| --- | --- | --- |
| Desktop Reading View | Render both valid groups; use pointer and all keyboard commands; open links; inspect note, image, audio, and PDF embeds; confirm groups remain independent | Obsidian/plugin/OS versions, fixture revision, result, and screenshot or concise observation |
| Desktop Live Preview | Confirm tabs render outside the editing locus, raw source appears inside it, and both transitions are clean | Obsidian/plugin/OS versions and observed transitions |
| Desktop Source Mode | Confirm only raw fenced source appears and no visual editor is injected | Obsidian/plugin/OS versions and observation |
| Mobile Reading View | Measure computed touch-target size; use touch; test real horizontal tab scrolling; confirm no note-wide overflow | Device, OS, Obsidian/plugin versions, measurements, and screenshot/video |
| Mobile Live Preview | Confirm the same edit-locus behavior where the mobile editor supports it | Device, OS, Obsidian/plugin versions, or explicit `GAP` |
| Themes | Test default light, default dark, and one representative custom theme; inspect inherited colors, visible computed focus, reduced-motion behavior, and overflow | Theme names/versions, platform, computed observations, and screenshots |
| Optional plugins absent | Disable Style Settings, Templater, Dataview, and the selected additional processor; reload Just Tabs | Plugin list/state and confirmation that Just Tabs loads without errors |
| Optional plugins present | Exercise all five Style Settings controls; render Dataview and the selected processor | Optional-plugin versions, settings used, source, and result |
| Lifecycle | Visit the Dataview panel, hide it, change indexed vault data, wait for metadata to update, and reactivate it | Before/after query result and confirmation of one fresh rebuild |
| Unload/rerender | Disable and re-enable Just Tabs; edit a source block to force rerender; repeat switching | Console observation, duplicate-handler/duplicate-output check, and result |

Also verify every valid fixture item: headings, lists, tables, internal links, block references, all four embed types, callout, math, Tasks, Mermaid, static nested code, Dataview, the selected additional processor, multiple groups, and each malformed diagnostic.

## Evidence record

The release issue and draft GitHub Release body are the canonical record. Copy this section into that record and replace every placeholder:

```markdown
## Compatibility evidence

- Commit SHA: `<sha>`
- Plugin version: `<x.y.z>`
- Obsidian version: `<version>`
- Node/npm versions: `<versions>`
- Platform/device/OS: `<details>`
- Fixture revision: `<commit or exact source hash>`
- Dataview version: `<version or absent>`
- Additional processor and version: `<name/version or absent>`
- Style Settings version: `<version or absent>`
- Custom theme and version: `<name/version or N/A>`
- Actual mobile: `<tested device or GAP with reason>`
- Known incompatibilities: `<none observed or precise list>`

| Surface | Status | Evidence |
| --- | --- | --- |
| Desktop Reading View | `<PASS/FAIL/GAP/N/A>` | `<link or observation>` |
| Desktop Live Preview | `<PASS/FAIL/GAP/N/A>` | `<link or observation>` |
| Desktop Source Mode | `<PASS/FAIL/GAP/N/A>` | `<link or observation>` |
| Mobile Reading View | `<PASS/FAIL/GAP/N/A>` | `<link or observation>` |
| Mobile Live Preview | `<PASS/FAIL/GAP/N/A>` | `<link or observation>` |
| Themes | `<PASS/FAIL/GAP/N/A>` | `<link or observation>` |
| Optional plugins absent | `<PASS/FAIL/GAP/N/A>` | `<link or observation>` |
| Optional plugins present | `<PASS/FAIL/GAP/N/A>` | `<link or observation>` |
| Lifecycle | `<PASS/FAIL/GAP/N/A>` | `<link or observation>` |
| Unload/rerender | `<PASS/FAIL/GAP/N/A>` | `<link or observation>` |
```

For a release, also record the CI run, `npm ci` and `npm run check` results, exact tag, package/lockfile/manifest/versions parity, clean-vault installation result, and SHA-256 hashes of `main.js`, `manifest.json`, and `styles.css`.
