#!/usr/bin/env bash
# Deploys the current HEAD commit to the SquadJS install over SFTP. Run from anywhere inside the repo.
#
# Uploads files changed since the commit in the server's REVISION file, deletes removed ones, then replaces REVISION,
# which TTDeployWatcher picks up to restart SquadJS. Server-only files (node_modules, config, data) are never touched
# because only paths from the git diff are sent. Uncommitted changes are not deployed.
#
# If package.json or yarn.lock changed, the files are uploaded but REVISION is not written and the script fails:
# dependencies must be installed on the server first, then the deploy re-run with DEPENDENCIES_INSTALLED=true.
#
# Connection details are read from the environment, or from .deploy.env in the repo root (git-ignored):
#   SFTP_HOST, SFTP_PORT, SFTP_USER, SFTP_PASSWORD, DEPLOY_DIR (remote SquadJS root)
# Options: DEPENDENCIES_INSTALLED=true, DRY_RUN=1 (print the lftp script instead of running it)
# The host key must already be in ~/.ssh/known_hosts.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
# shellcheck disable=SC1091
[[ -f .deploy.env ]] && source .deploy.env
: "${SFTP_HOST:?}" "${SFTP_PORT:?}" "${SFTP_USER:?}" "${SFTP_PASSWORD:?}" "${DEPLOY_DIR:?}"
export LFTP_PASSWORD=$SFTP_PASSWORD

lftp_run() {
  lftp -c "set sftp:auto-confirm no; set net:timeout 30; set net:max-retries 3; set net:reconnect-interval-base 5
open --env-password -u '$SFTP_USER' sftp://$SFTP_HOST:$SFTP_PORT
cd '$DEPLOY_DIR'
$1"
}

head=$(git rev-parse HEAD)
[[ -z $(git status --porcelain --untracked-files=no) ]] || echo "Warning: uncommitted changes will not be deployed." >&2

deployed=$(lftp_run 'cat REVISION' | tr -d '[:space:]') || {
  echo "Could not read REVISION. Upload the SHA of the commit the server currently matches to bootstrap." >&2
  exit 1
}

if [[ $deployed == "$head" ]]; then
  echo "Already deployed $head."
  exit 0
fi
if ! git cat-file -e "$deployed^{commit}" 2>/dev/null || ! git merge-base --is-ancestor "$deployed" "$head"; then
  echo "Deployed revision '$deployed' is not an ancestor of $head, refusing to deploy a diff against it." >&2
  exit 1
fi

script=$(mktemp)
trap 'rm -f "$script" "$script.rev"' EXIT
deps_changed=false
count=0
while IFS= read -r -d '' status && IFS= read -r -d '' path; do
  [[ $path =~ ^(\.github/|\.husky/|tests/|scripts/|config\.json$) ]] && continue
  [[ $path == *[\'\"]* ]] && { echo "Unsupported quote in path: $path" >&2; exit 1; }
  [[ $path =~ (^|/)(package\.json|yarn\.lock)$ ]] && deps_changed=true
  if [[ $status == D ]]; then
    echo "rm -f '$path'" >>"$script"
  else
    [[ $path == */* ]] && echo "mkdir -p -f '$(dirname "$path")'" >>"$script"
    echo "put '$path' -o '$path'" >>"$script"
  fi
  count=$((count + 1))
done < <(git diff -z --name-status --no-renames "$deployed" "$head")

write_revision=true
if $deps_changed && [[ ${DEPENDENCIES_INSTALLED:-false} != true ]]; then write_revision=false; fi

if $write_revision; then
  printf '%s\n' "$head" >"$script.rev"
  # the SFTP server can't rename over an existing file, so REVISION is briefly missing between rm and mv
  printf '%s\n' "put '$script.rev' -o REVISION.new" 'rm -f REVISION' 'mv REVISION.new REVISION' >>"$script"
fi

echo "Deploying $deployed..$head ($count file changes):"
cat "$script"
if [[ ${DRY_RUN:-} == 1 ]]; then
  echo "Dry run, nothing sent."
  exit 0
fi
lftp_run "$(cat "$script")"

if ! $write_revision; then
  echo "package.json or yarn.lock changed: files were uploaded but REVISION was not updated, so SquadJS was not" \
    "restarted. Run yarn install on the server, then re-run with DEPENDENCIES_INSTALLED=true." >&2
  exit 1
fi
echo "Deployed $head."
