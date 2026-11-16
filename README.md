# Harddisk LED NG

GNOME Shell extension that shows harddisk activity with IO speed and an LED. Click the indicator to cycle through display modes.

Fork of [Harddisk LED](https://extensions.gnome.org/extension/988/harddisk-led/).

## Development

Extension sources live in `harddiskledNG@lauinger-clan.de/`.

- `./harddiskledng.sh install-dependencies`: install npm development dependencies.
- `npm run lint` / `npm test`: lint JavaScript and run the disk sampling, display, and tooling regression tests.
- `./harddiskledng.sh zip`: create `harddiskledNG@lauinger-clan.de.shell-extension.zip` at the repository root.
- `./harddiskledng.sh pack [output-directory]`: build into an optional output directory.
- `./harddiskledng.sh install`: build, install, and enable the extension locally.
- `./harddiskledng.sh translate`: create `po/harddiskledNG.pot` and update existing translations.
- `./harddiskledng.sh check-version` / `update-version`: check or synchronize npm versions with metadata's `version-name`.
- `./harddiskledng.sh setup-hooks`: enable the optional staged-version check before commits.

Packaging requires `gnome-extensions`; version commands and hooks require Node.js/npm and `jq`; translation updates require gettext tools.

## Preferences

Open the preferences dialog (`gnome-extensions prefs harddiskledNG@lauinger-clan.de`) to

- **Mode** – select the currently active display mode
- **Default mode** – mode applied when the extension is loaded; *None* keeps the last used mode
- **LED color** – pick the color of the activity LED (reset button restores the default green)
