#!/usr/bin/env bash
# Sets a repository's GitHub About box (description, website, topics) from its docs/site/repo.json.
#   repo-site/tools/apply-about.sh <app-repo-dir> [more dirs…]
# Needs the GitHub CLI (gh) logged in as the repository owner, and jq.
set -euo pipefail
for dir in "$@"; do
  meta="$dir/docs/site/repo.json"
  [ -f "$meta" ] || { echo "✗ $meta not found" >&2; continue; }
  slug=$(git -C "$dir" remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
  desc=$(jq -r .description "$meta"); home=$(jq -r .homepage "$meta")
  gh repo edit "$slug" --description "$desc" --homepage "$home"
  # Replace the topics with exactly the list in repo.json
  jq '{names: .topics}' "$meta" | gh api -X PUT "repos/$slug/topics" --input - >/dev/null
  echo "✓ $slug: $(jq -r '.topics | join(", ")' "$meta")"
done
