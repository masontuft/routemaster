---
name: gstack-bootstrap
description: Use before running a skill that depends on gstack, to check it is installed and install it from Mason's fork if it is not.
---

# Bootstrap gstack from the fork

gstack lives in its own repo, `masontuft/gstack` (a mirror of `garrytan/gstack`), and is installed globally at `~/.claude/skills/gstack`. It is never copied into this repo. This skill only checks for it and, with Mason's approval, installs it from his fork. Mason signs off before any install script runs.

1. Check for the install: `test -d ~/.claude/skills/gstack/.git`. If it is missing, go to step 5.
2. If it exists, run `git -C ~/.claude/skills/gstack remote get-url origin`. If `origin` is the fork (`masontuft/gstack`), stop here and carry on with the task.
3. If `origin` is `garrytan/gstack`, do not change it. Tell Mason and stop. The sync script expects the fork as `origin`. It fast-forwards that fork with `gh repo sync` on GitHub, and it does not read a local `upstream` remote.
4. If `origin` is any other URL, stop and tell Mason. Do not add, remove, or rewrite the remote.
5. Check the requirements before installing: Git, and Bun v1.3.3 or newer (`bun --version`). gstack's setup refuses anything older, and v1.4.2 is the version it is tested on. If either is missing or too old, stop and tell Mason.
6. Show Mason the exact commands and wait for a clear yes. The setup script is code from a cloned repo, so it never runs unasked:

   ```bash
   git clone --single-branch https://github.com/masontuft/gstack.git ~/.claude/skills/gstack
   cd ~/.claude/skills/gstack
   git checkout <pinned-ref>   # servers and CI only; a laptop can stay on main
   ./setup
   ```

7. A local `upstream` remote is optional, for manual diffs and logs. The sync script does not read it. If Mason wants it and it is not already there, add it: `git remote add upstream https://github.com/garrytan/gstack.git`. The fork itself moves only when `gh repo sync` runs.
8. Tell Mason to start a new session. Skills are probably only discovered at session start.

On a server or CI agent, install at build time, pinned to a tag or commit SHA, and never track `main` at runtime. Updates are manual and laptop-only: Mason runs `sync-gstack`, which is not scheduled.

## Syncing by hand

`AGENTS.md` allows only `SKILL.md` in a skill folder, so the sync script lives at `~/bin/sync-gstack` and this block is its reference copy. If the script is missing, recreate it from here with `chmod +x`. Run `sync-gstack --check` to see what would change without changing anything. `--check` asks GitHub how far the fork is behind `garrytan/gstack`, fetches `origin`, and reports how far this clone is behind `origin/main`. It does not sync the fork, merge, or change the worktree. A real run fast-forwards the fork with `gh repo sync`, then fast-forwards this clone. It runs `./setup` only when `VERSION` changed and Mason answers yes (`y` or `yes`, any case) after seeing the CHANGELOG diff. gstack keeps that version in a `VERSION` file at the repo root (the same file `./setup` reads). If that file is missing or empty, the script stops.

```bash
#!/usr/bin/env bash
# Sync gstack: upstream (garrytan) -> Mason's fork -> this machine.
# Usage: sync-gstack [--check]
# --check reports fork-vs-upstream and clone-vs-fork, and changes neither
# the fork nor the worktree. It does not read a local upstream remote.
set -euo pipefail

FORK="masontuft/gstack"
UPSTREAM="garrytan/gstack"
UPSTREAM_OWNER="${UPSTREAM%%/*}"
DIR="$HOME/.claude/skills/gstack"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

cd "$DIR"

# 1. Refuse to run if the install is not wired to the fork.
origin_url=$(git remote get-url origin)
case "$origin_url" in
  *"$FORK"*) ;;
  *) echo "origin is $origin_url, not the fork. Stopping." >&2; exit 1 ;;
esac

# 2. Refuse to overwrite local edits.
if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes in $DIR. Stopping." >&2
  exit 1
fi

# 3. gh must be signed in as the fork's owner (more than one account is logged in).
if [ "$(gh api user --jq .login)" != "${FORK%%/*}" ]; then
  echo "Active gh account is not ${FORK%%/*}. Run: gh auth switch" >&2
  exit 1
fi

# 4. --check: how far the fork is behind upstream. Read-only.
#    base is the fork's main, head is garrytan/gstack main.
#    ahead_by is commits on upstream that the fork lacks (the fork is behind).
#    behind_by is commits on the fork that upstream lacks (the fork is ahead).
#    gh repo sync would update the fork, so it is not used here.
if [ "$CHECK" -eq 1 ]; then
  if ! compare=$(gh api "repos/${FORK}/compare/main...${UPSTREAM_OWNER}:main" --jq '[.status, .ahead_by, .behind_by] | @tsv'); then
    echo "Could not compare ${FORK} with ${UPSTREAM}. Stopping." >&2
    exit 1
  fi
  IFS=$'\t' read -r cmp_status upstream_only fork_only <<< "$compare"
  case "$upstream_only" in
    ''|*[!0-9]*)
      echo "Unexpected compare result from GitHub: ${compare}" >&2
      exit 1
      ;;
  esac
  case "$fork_only" in
    ''|*[!0-9]*)
      echo "Unexpected compare result from GitHub: ${compare}" >&2
      exit 1
      ;;
  esac
  case "$cmp_status" in
    identical)
      echo "Fork main matches ${UPSTREAM} main (behind by 0)."
      ;;
    ahead)
      echo "Fork main is behind ${UPSTREAM} main by ${upstream_only} commit(s)."
      ;;
    behind)
      echo "Fork main is behind ${UPSTREAM} main by 0 commit(s), and ahead of it by ${fork_only}."
      ;;
    diverged)
      echo "Fork main has diverged from ${UPSTREAM} main. It is behind by ${upstream_only} commit(s) and ahead by ${fork_only}. gh repo sync will refuse to fast-forward."
      ;;
    *)
      echo "Unexpected compare status '${cmp_status}' from GitHub. Stopping." >&2
      exit 1
      ;;
  esac
fi

# 5. gstack stores its version in VERSION at the repo root. Stop before
#    syncing if this clone cannot report the version it is on.
if [ ! -s VERSION ]; then
  echo "VERSION is missing or empty in $DIR. gstack stores its version in a VERSION file at the repo root. Stopping." >&2
  exit 1
fi
old_head=$(git rev-parse HEAD)
old_version=$(cat VERSION)

# 6. Upstream -> fork. Fast-forward only: fails loudly if the fork has diverged.
#    Server-side. A local upstream remote is not required and is not read.
if [ "$CHECK" -eq 0 ]; then
  gh repo sync "$FORK"
fi

# 7. Fork -> this machine.
git fetch --quiet origin
behind=$(git rev-list --count HEAD..origin/main)
echo "This clone is behind origin/main by $behind commit(s). VERSION now: $old_version"
[ "$CHECK" -eq 1 ] && exit 0
[ "$behind" -eq 0 ] && { echo "Already up to date."; exit 0; }

git pull --ff-only --quiet origin main
if [ ! -s VERSION ]; then
  echo "VERSION is missing or empty in $DIR after the pull. gstack stores its version in a VERSION file at the repo root. Stopping." >&2
  exit 1
fi
new_version=$(cat VERSION)

# 8. Setup is code from a clone: run it only on a version change, and only after a yes.
#    Capture the diff before printing it. Piping git diff into head under
#    pipefail aborts on SIGPIPE (exit 141) when the unread diff fills the
#    pipe buffer, which skips the setup prompt after the pull.
if [ "$new_version" != "$old_version" ]; then
  echo "VERSION $old_version -> $new_version. CHANGELOG diff:"
  if ! changelog_diff=$(git diff "$old_head" HEAD -- CHANGELOG.md); then
    echo "git diff of CHANGELOG.md failed. Stopping." >&2
    exit 1
  fi
  if [ -n "$changelog_diff" ]; then
    mapfile -t diff_lines <<< "$changelog_diff"
    shown=0
    for line in "${diff_lines[@]}"; do
      printf '%s\n' "$line"
      shown=$((shown + 1))
      if [ "$shown" -ge 80 ]; then
        break
      fi
    done
    if [ "${#diff_lines[@]}" -gt 80 ]; then
      echo "(CHANGELOG diff truncated to 80 lines.)"
    fi
  fi
  read -r -p "Run ./setup now? [y/N] " answer
  answer_lc=$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')
  case "$answer_lc" in
    y|yes)
      if ./setup; then
        echo "Setup finished."
      else
        status=$?
        echo "Setup failed (exit $status). Run ./setup in $DIR after fixing it." >&2
        exit "$status"
      fi
      ;;
    *)
      echo "Skipped. Run ./setup in $DIR when ready."
      ;;
  esac
else
  echo "VERSION unchanged. Pulled commits, skipped setup."
fi
```

Example check:

```bash
$ git -C ~/.claude/skills/gstack remote get-url origin
https://github.com/masontuft/gstack.git
```

TODO (Mason): confirm which tag or commit SHA servers should pin to, and whether `./setup` needs flags on a server (such as `--host`). Do not invent them.
