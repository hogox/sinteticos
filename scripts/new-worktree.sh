#!/bin/sh

set -eu

if [ "${1:-}" = "" ]; then
  echo "Uso: ./scripts/new-worktree.sh <nombre-version>"
  exit 1
fi

version_name="$1"
repo_root=$(git rev-parse --show-toplevel)
repo_name=$(basename "$repo_root")
parent_dir=$(dirname "$repo_root")
worktrees_root="$parent_dir/${repo_name}-worktrees"
branch_name="version/$version_name"
worktree_path="$worktrees_root/$version_name"

mkdir -p "$worktrees_root"

if git show-ref --verify --quiet "refs/heads/$branch_name"; then
  git worktree add "$worktree_path" "$branch_name"
else
  git worktree add -b "$branch_name" "$worktree_path" main
fi

echo "Worktree listo:"
echo "  Rama:    $branch_name"
echo "  Carpeta: $worktree_path"
