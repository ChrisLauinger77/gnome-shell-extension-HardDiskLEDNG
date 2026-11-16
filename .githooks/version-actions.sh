check_version() {
  local metadata_version package_version normalized_metadata_version
  if ! metadata_version=$(read_metadata_version); then
    echo "ERROR: Unable to read version-name from $metadata_file" >&2
    return 2
  fi
  if ! package_version=$(read_package_version); then
    echo "ERROR: Unable to read version from package.json" >&2
    return 2
  fi
  if ! normalized_metadata_version=$(normalize_version "$metadata_version"); then
    echo "ERROR: Invalid metadata.json version-name: $metadata_version" >&2
    return 2
  fi
  echo "metadata.json version-name: $metadata_version"
  echo "package.json version:       $package_version"
  if [[ "$package_version" != "$normalized_metadata_version" ]]; then
    echo "ERROR: Version mismatch; expected $normalized_metadata_version" >&2
    return 1
  fi
  if ! check_lock_version "$normalized_metadata_version"; then
    echo "ERROR: package-lock.json versions must both be $normalized_metadata_version" >&2
    return 1
  fi
  echo "Version check OK."
}

update_version() {
  local metadata_version normalized_metadata_version
  if ! metadata_version=$(read_metadata_version); then
    echo "ERROR: Unable to read version-name from $metadata_file" >&2
    return 2
  fi
  if ! normalized_metadata_version=$(normalize_version "$metadata_version"); then
    echo "ERROR: Invalid metadata.json version-name: $metadata_version" >&2
    return 2
  fi
  npm version "$normalized_metadata_version" --no-git-tag-version --ignore-scripts --allow-same-version
  check_version
}
