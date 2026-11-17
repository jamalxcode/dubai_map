#!/usr/bin/env bash
# Generated data lives on the `data` branch; code and hand-kept inputs live on `main`.
#
#   scripts/data-branch.sh load            copy the data branch's files into ./data
#                                          (plain files: git's index is not touched)
#   scripts/data-branch.sh save "message"  commit ./data's generated files to the data
#                                          branch and push; reports changed=true|false,
#                                          true only when a file the page loads changed
#                                          (also as a step output under GitHub Actions)
#
# Generated (data branch): build output, source state, the contract archive, the
# Dubai Data mirror and the computed map points. Hand-kept (main): area_locations.csv,
# community_locations.csv, dld_dm_aliases.csv and the inbox.
set -euo pipefail
shopt -s nullglob
cd "$(git rev-parse --show-toplevel)"

BRANCH=${DATA_BRANCH:-data}
PAGE_FILES=(data/areas.json 'data/areas_*.json' data/latest.json data/meta.json data/outlines.json)
GENERATED=(data/areas.json data/areas_*.json data/latest.json data/meta.json data/state.json
           data/contracts data/datadubai data/crosscheck data/osm_area_points.csv data/dm_communities.csv data/dm_outlines.json)

# Tell the workflow whether anything changed (step output `changed`), and say it in the log.
result() {
  echo "changed=$1"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "changed=$1" >> "$GITHUB_OUTPUT"; fi
}

load() {
  if git fetch -q --depth=1 origin "$BRANCH" 2>/dev/null; then
    git archive FETCH_HEAD data | tar -x
    echo "loaded ./data from $BRANCH @ $(git rev-parse --short FETCH_HEAD)"
  else
    echo "no $BRANCH branch on origin yet; using ./data as it is"
  fi
}

save() {
  local msg=${1:?commit message}
  local tmp; tmp=$(mktemp -d)
  trap 'git worktree remove --force "$tmp" >/dev/null 2>&1 || true' RETURN
  if git fetch -q --depth=1 origin "$BRANCH" 2>/dev/null; then
    git worktree add -q --detach "$tmp" FETCH_HEAD
  else
    git worktree add -q --detach "$tmp"
    (cd "$tmp" && git checkout -q --orphan "$BRANCH" && git rm -rqf --ignore-unmatch . && git clean -fdq)
  fi
  # Add and update only, never delete: another job may have saved a file this job
  # never loaded, and a stale leftover is harmless (the page only loads what meta.json lists).
  local f
  for f in "${GENERATED[@]}"; do
    [ -e "$f" ] && cp -r --parents "$f" "$tmp/"
  done
  (
    cd "$tmp"
    export GIT_AUTHOR_NAME=${GIT_AUTHOR_NAME:-dubai_map bot} GIT_COMMITTER_NAME=${GIT_COMMITTER_NAME:-dubai_map bot}
    export GIT_AUTHOR_EMAIL=${GIT_AUTHOR_EMAIL:-github-actions[bot]@users.noreply.github.com}
    export GIT_COMMITTER_EMAIL=${GIT_COMMITTER_EMAIL:-github-actions[bot]@users.noreply.github.com}
    git add -A
    if git diff --cached --quiet; then
      echo "no data changes"; result false; exit 0
    fi
    # Redeploy only when a file the page loads changed. Source state (state.json, the
    # mirrors) is saved on every run (the 6-hour gap between pulls depends on it) but
    # doesn't need a new deploy.
    if git diff --cached --quiet -- "${PAGE_FILES[@]}"; then page=false; else page=true; fi
    git commit -qm "$msg"
    # Another job may have saved meanwhile: put our commit on top of theirs and retry.
    # (cherry-pick, not rebase: in a shallow clone rebase can't find the common parent.)
    mine=$(git rev-parse HEAD)
    for i in 1 2 3; do
      if git push -q origin "HEAD:refs/heads/$BRANCH"; then
        echo "saved to $BRANCH @ $(git rev-parse --short HEAD) (page files changed: $page)"; result "$page"; exit 0
      fi
      sleep $((i * 5))
      git fetch -q --depth=1 origin "$BRANCH" && git reset -q --hard FETCH_HEAD && git cherry-pick "$mine" >/dev/null
    done
    echo "could not push to $BRANCH" >&2; exit 1
  )
}

case "${1:-}" in
  load) load ;;
  save) shift; save "$@" ;;
  *) echo "usage: $0 load | save \"message\"" >&2; exit 2 ;;
esac
