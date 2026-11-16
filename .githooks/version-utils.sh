# Shared Bash helpers for the development script and Git hook.

normalize_version() {
  local version=${1:-}
  if [[ "$version" =~ ^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))?(\.(0|[1-9][0-9]*))?$ ]]; then
    printf '%s.%s.%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[3]:-0}" "${BASH_REMATCH[5]:-0}"
    return 0
  fi
  return 2
}

read_metadata_version() {
  jq -er '.["version-name"] | strings' "$metadata_file"
}

read_package_version() {
  jq -er '.version | strings' package.json
}

check_lock_version() {
  jq -e --arg version "$1" \
    '.version == $version and .packages[""].version == $version' \
    "${2:-package-lock.json}" >/dev/null
}
