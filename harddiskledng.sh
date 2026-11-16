#!/bin/bash
set -euo pipefail
shopt -s nullglob

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
script_path="$script_dir/$(basename -- "${BASH_SOURCE[0]}")"
cd "$script_dir" || exit 1

extension="harddiskledNG@lauinger-clan.de"
extensionfile="$extension.shell-extension.zip"
metadata_file="$extension/metadata.json"

source "$script_dir/.githooks/version-utils.sh"
source "$script_dir/.githooks/version-actions.sh"

echo "Running $0 for $extension (${1:-})"

case "${1:-}" in
  install-dependencies)
    npm install
    ;;
  cleanup)
    if [[ -f "$extensionfile" ]]; then
      rm -- "$extensionfile"
      echo "Removed generated archive: $extensionfile"
    else
      echo "No generated archive to remove: $extensionfile"
    fi
    ;;
  check-version)
    check_version
    ;;
  update-version)
    update_version
    ;;
  setup-hooks)
    if git config --local core.hooksPath .githooks; then
      echo "Git hooks enabled using .githooks"
    else
      exit $?
    fi
    ;;
  zip|pack)
    output_dir="${2:-$script_dir}"
    mkdir -p -- "$output_dir"
    output_dir=$(cd -- "$output_dir" && pwd)
    pack_args=(--out-dir="$output_dir" --extra-source=ui/ --extra-source=icons/ --extra-source=../LICENSE --force)
    po_files=(po/*.po)
    if (( ${#po_files[@]} > 0 )); then
      pack_args+=(--podir=../po/)
    fi
    (
      cd "$extension"
      gnome-extensions pack "${pack_args[@]}"
    )
    echo "Extension zip created: $output_dir/$extensionfile"
    ;;
  install)
    "$script_path" zip
    gnome-extensions install "$extensionfile" --force
    gnome-extensions enable "$extension"
    echo "Extension zip installed ..."
    ;;
  upload)
    "$script_path" zip
    gnome-extensions upload --accept-tos --user ChrisLauinger77 --password-file /var/data/dev/ego_password "$extensionfile"
    ;;
  translate)
    reffile=harddiskledNG.pot
    mkdir -p po
    xgettext --from-code=UTF-8 --output=po/"$reffile" "$extension"/*.js "$extension"/schemas/*.xml "$extension"/ui/*.ui
    cd po
    for pofile in *.po
      do
        echo "Updating: $pofile"
        msgmerge --backup=off -N -U "$pofile" "$reffile"
        msgattrib --no-obsolete -o "$pofile" "$pofile"
      done
    echo "Done."
    ;;
  *)
    echo "Usage: $0 {install-dependencies|zip|pack [output-directory]|install|translate|upload|cleanup|check-version|update-version|setup-hooks}"
    exit 1
    ;;
esac
