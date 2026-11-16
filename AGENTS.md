# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

Harddisk LED NG is a GNOME Shell extension that reads disk activity from
`/proc/diskstats` and displays IO speed, an activity LED, and an optional disk
icon in the top panel. Left-clicking the indicator cycles forward through
eight display modes, right-clicking cycles backward, and middle-clicking
opens the preferences. Preferences
control the active mode, default mode, and LED color.

The extension UUID is `harddiskledNG@lauinger-clan.de`; extension source lives
inside the directory with that exact name. The extension supports GNOME Shell
48 through 51 inclusive. The `shell-version` field in
`harddiskledNG@lauinger-clan.de/metadata.json` covers only the release in the
source tree, currently 49 through 51; GNOME Shell 48 is served by the
published `v51.0.0` release.

The GNOME Shell compatibility badge in `README.md` lists every GNOME Shell
major version supported by any Harddisk LED NG release. It currently covers
GNOME 48 through 51 inclusive. The `shell-version` field in
`harddiskledNG@lauinger-clan.de/metadata.json` covers only the current
extension release. When updating the README badge, include GNOME versions that
older extension releases support, even if the current `shell-version` list
omits them. Tags before `v51.0.0` are releases of the upstream Harddisk LED
extension (UUID `harddiskled@bijidroid.gmail.com`) and do not count toward the
badge.

The fork uses GSettings schema ID `org.gnome.shell.extensions.HardDiskLEDNG`
and path `/org/gnome/shell/extensions/HardDiskLEDNG/`. Keep metadata's
`settings-schema` and the schema XML filename consistent with that ID; treat
future changes to the schema ID or path as settings migrations.

## Repository Layout

- `harddiskledNG@lauinger-clan.de/extension.js`: GNOME Shell runtime code,
  disk-stat parsing, IO speed formatting, panel indicator, settings watchers,
  and periodic refresh.
- `harddiskledNG@lauinger-clan.de/prefs.js`: preferences UI logic using
  Gtk/Gdk, settings bindings, and LED color conversion.
- `harddiskledNG@lauinger-clan.de/ui/prefs.ui`: Gtk Builder UI using libadwaita
  preferences pages, mode selectors, and the LED color picker.
- `harddiskledNG@lauinger-clan.de/schemas/org.gnome.shell.extensions.HardDiskLEDNG.gschema.xml`:
  GSettings schema. Keep keys in sync with `extension.js`, `prefs.js`, and the
  preferences UI.
- `harddiskledNG@lauinger-clan.de/metadata.json`: extension metadata,
  supported Shell versions, release version, gettext domain, and schema ID.
- `harddiskledNG@lauinger-clan.de/stylesheet.css`: panel indicator styling.
- `harddiskledNG@lauinger-clan.de/lib/diskStats.js`: diskstats parsing and
  per-device rate sampling, shared by the runtime and Node tests.
- `harddiskledNG@lauinger-clan.de/lib/diskStatsReader.js`: cancellable
  asynchronous sysfs enumeration and diskstats reads using native Gio APIs.
- `harddiskledNG@lauinger-clan.de/icons/activity-led-symbolic.svg`: symbolic
  LED artwork loaded by the panel's `St.Icon`.
- `test/diskStats.test.js`: coverage for disk selection, elapsed sampling time,
  counter resets, and device additions/removals.
- `test/display.test.js`: runtime refresh, display-mode, panel-button, and
  click-gesture coverage with stubbed Shell actors, including cancellation,
  overlapping reads, read failures, and disable/re-enable while a read is
  pending.
- `test/diskStatsReader.test.js`: asynchronous Gio read, enumeration, cleanup,
  and cancellation coverage.
- `test/tooling.test.js`: Node test-runner coverage for version updates,
  staged-version hooks, packaging paths, and command failure handling. Tests
  use temporary checkouts and mocked GNOME commands.
- `po/`: gettext template `harddiskledNG.pot` and any translations.
- `docs/`: project screenshots.
- `.githooks/`: optional Git hook and shared version helpers that synchronize
  npm versions with metadata's `version-name`.
- `.github/ISSUE_TEMPLATE/`: bug-report and feature-request forms.
- `.github/FUNDING.yml`: sponsorship links matching the extension's donations.
- `.github/workflows/eslint.yml`: Node.js lint/tests/version checks, SARIF
  reporting, and a separate Shexli review report.
- `.github/workflows/release.yml`: tag-triggered GitHub/EGO releases and
  manual builds with an optional EGO upload.
- `.github/workflows/claude.yml`: Claude Code automation for `@claude`
  mentions, using the repository's `CLAUDE_CODE_OAUTH_TOKEN` secret.
- `.github/workflows/stale.yml`: weekly issue inactivity checks; pull-request
  staleness is disabled.
- `harddiskledng.sh`: root helper for packaging, installing, uploading,
  translation updates, version checks, and hook setup. Keep development
  commands in this script; the former `bin/` scripts have been removed.
- `CLAUDE.md`: forwards coding-agent guidance to this file.

## Useful Commands

- `./harddiskledng.sh install-dependencies`: install JavaScript development
  dependencies with npm.
- `npm run lint`: run ESLint across the repository.
- `npm test`: run the disk sampling, display, and tooling regression tests.
- `./harddiskledng.sh zip`: build
  `harddiskledNG@lauinger-clan.de.shell-extension.zip` at the repository root.
- `./harddiskledng.sh pack [output-directory]`: build the same archive into an
  optional output directory. Relative output paths resolve from the repository
  root.
- `./harddiskledng.sh install`: rebuild, install, and enable the extension
  locally.
- `./harddiskledng.sh upload`: rebuild and upload the archive to
  extensions.gnome.org using the credentials configured in the script.
- `./harddiskledng.sh translate`: update `po/harddiskledNG.pot` and merge
  existing `.po` files after user-visible string changes.
- `./harddiskledng.sh cleanup`: remove the archive at the repository root.
- `./harddiskledng.sh check-version` / `update-version`: check or synchronize
  the npm versions against metadata's `version-name`.
- `./harddiskledng.sh setup-hooks`: enable the optional hook in `.githooks/`.
- `gnome-extensions prefs harddiskledNG@lauinger-clan.de`: open preferences
  after installing the extension.

Run `./harddiskledng.sh install-dependencies` after pulling or rebasing remote
changes that modify `package-lock.json`, particularly Renovate updates.

Notes:

- Packaging requires `gnome-extensions` and gettext's `msgfmt`; translation
  updates require `xgettext`, `msgmerge`, and `msgattrib`.
- Version commands require `jq`; version updates also require Node.js/npm.
  The tooling tests require Node.js/npm, Bash, Git, and `jq`.
- Tests mock Shell actors and installation/upload commands. Passing them does
  not verify the live GNOME Shell UI.
- Packaging includes translation catalogs only when `.po` files exist.

## Coding Conventions

- Use `$review-gnome-shell-extension` when changing runtime, preferences,
  metadata, schema, packaging, or user-data behavior that may affect
  extensions.gnome.org review.
- Use modern GJS ES modules and imports consistent with the existing files.
- Keep Gtk/Gdk/Adw imports in the preferences process and Shell-only imports
  such as St/Clutter in the runtime process.
- Keep settings schema keys, display-mode indices, UI widget IDs, and
  preferences bindings aligned.
- Preserve existing settings IDs and storage paths unless the task includes a
  migration.
- Mark user-visible Gtk Builder strings as translatable and add gettext
  wrapping for new JavaScript UI strings. Keep the gettext domain consistent
  across metadata, the schema, and preferences.
- Keep changes scoped. Avoid unrelated runtime cleanup because GNOME Shell
  extension regressions can be hard to diagnose.
- Follow `.editorconfig` and `.prettierrc`: JavaScript, CSS, JSON, and YAML use
  four-space indentation; other file types default to two spaces. JavaScript
  uses double quotes and semicolons.

## Runtime Behavior To Handle Carefully

- `extension.js` refreshes disk statistics with a repeating
  `GLib.timeout_add_seconds()` source, currently every two seconds. Remove the
  timeout, disconnect settings signals, destroy the panel button and its
  children, and clear references in `disable()`.
- Runtime objects, timers, and settings connections belong to `enable()` and
  must be recreated cleanly when the extension is enabled again.
- Whole physical disks are selected through `/sys/block`; virtual block
  devices and partitions are excluded. Sysfs writes `/` in device names as
  `!` (for example `cciss!c0d0`); map it back before matching
  `/proc/diskstats`. Disk speed uses per-device read/write
  counter deltas, elapsed monotonic time, and a 512-byte sector conversion.
  New or reset devices establish a fresh baseline. Removing a disk must not
  subtract its lifetime counters from the total. Clear the sampler on disable.
- Filesystem reads and enumeration must remain asynchronous. Each in-flight
  read owns a `Gio.Cancellable`; cancel it in `disable()`. Ignore cancelled
  completions and keep old reads from clearing a new session's cancellable.
  Timer callbacks return `GLib.SOURCE_CONTINUE`, rather than a Promise.
- A failed read sets the last speed to `null`: the LED turns off, the label
  shows `--` until a read succeeds, and only the first failure of a series
  is logged with `console.error()`. Do not put raw error messages in the
  panel label.
- Display-mode changes redraw the current sample without reading disk counters
  or advancing the sampler's timestamp.
- The eight supported display modes are indexed 0 through 7 and described by
  the `MODES` table in `extension.js`, in the same order as the combo rows in
  `ui/prefs.ui` and the schema's `mode` range. Clicking the
  indicator updates the `mode` setting; the settings-change handler updates
  the view. Preserve this flow so preferences and panel clicks stay in sync.
- `defaultmode` uses `-1` for "None", which preserves the last active mode.
  The preferences selector maps index 0 to `-1` and subsequent indices to the
  corresponding display mode. It is applied on every `enable()`, including
  after a screen unlock; this is intended behavior.
- LED color is persisted as a CSS color string. Preserve validation before
  using it in the indicator's inline style and keep the reset action tied to
  the schema default.
- Use the symbolic `St.Icon` for the LED, with 8-pixel and 12-pixel sizes for
  small and large modes. Set opacity to zero when idle to preserve spacing;
  do not replace the icon with a Unicode glyph or ASCII indicator.
- Preferences keep a settings reference for the window lifetime and disconnect
  settings-change handlers when the associated widgets are destroyed. Preserve
  this ownership when adding bindings.
- The panel indicator is a menu-less `PanelMenu.Button` added with
  `Main.panel.addToStatusArea()` under the extension UUID; destroying it in
  `disable()` also removes the status-area entry. Handle clicks with
  `Clutter.ClickGesture` actions (primary cycles the mode forward, secondary
  backward, middle opens the preferences) rather than connecting raw event signals such as
  `button-press-event`, which GNOME 51 deprecates. Treat changes to this Shell
  integration as GNOME-version-sensitive.

## Validation Checklist

Before finishing changes, run the validations that match the edit:

- JavaScript changes: `npm run lint`.
- GitHub Actions changes: run `actionlint .github/workflows/*.yml` and check
  referenced helper paths, version checks, and archive names.
- Disk sampling or display changes: run or extend `npm test`.
- Helper script, version logic, or hook changes: run or extend `npm test` and
  run `./harddiskledng.sh check-version`.
- Schema changes: run
  `glib-compile-schemas --strict --dry-run harddiskledNG@lauinger-clan.de/schemas`
  and check that metadata's schema ID resolves from the compiled schema.
- Schema, metadata, packaging, icon, UI, or translation changes:
  `./harddiskledng.sh zip`. Inspect the archive for runtime assets, schema XML,
  and the license; exclude development scripts, npm dependencies, and source
  `.po`/`.pot` catalogs.
- User-visible strings: `./harddiskledng.sh translate`.
- Runtime or preferences changes: verify enable/disable cycles, display-mode
  changes, default-mode behavior, and LED color updates in a supported GNOME
  Shell session. State clearly when live UI verification was unavailable.

If a required GNOME or gettext command is unavailable in the environment,
state that clearly in the final response.

## Release Notes For Agents

- The release version is `version-name` in `metadata.json`; numeric `version`
  stays at the placeholder `999`. `package.json`'s version and both root
  version fields in `package-lock.json` must match `version-name`, normalized
  to `major.minor.patch`.
- `./harddiskledng.sh update-version` synchronizes the npm files. The optional
  pre-commit hook validates staged metadata and npm files, so stage all changed
  version files together after synchronizing them.
- The release artifact name is
  `harddiskledNG@lauinger-clan.de.shell-extension.zip`.
- A new `v*` tag push triggers the release workflow. The tag must match
  `v<version-name>` from metadata. It builds the archive, creates a GitHub
  release, and uploads to EGO using repository secrets `EGO_USERNAME` and
  `EGO_PASSWORD`.
- Manual release-workflow runs publish a build artifact. EGO upload happens
  only when `do_ego_upload` is selected; manual runs do not create a GitHub
  release, including when the selected ref is an existing tag.
- The root helper rebuilds the archive before installation or upload and
  stops when a command fails. Preserve these guarantees when changing it.
- Do not commit generated extension archives or `gschemas.compiled` files
  unless the maintainer explicitly requests it.
