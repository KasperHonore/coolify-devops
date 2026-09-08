#!/usr/bin/env sh
# Publish ONLY the library/ subtree to the public GitHub repo, where consumers install
# it with `npx skills add KasperHonore/coolify-devops`.
# Run via `npm run publish-library` inside library/, from the deployment repo.
# The deployment repo itself has no push remote on purpose — see docs/conventions.md in the deployment repo.
set -eu
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
REMOTE="${LIBRARY_REMOTE:-library}"
git remote get-url "$REMOTE" >/dev/null 2>&1 || { echo "no remote named '$REMOTE'; add it: git remote add $REMOTE <url>"; exit 1; }
if [ -n "$(git status --porcelain -- library)" ]; then echo "library/ has uncommitted changes; commit first"; exit 1; fi

# The same checks CI runs on the public repo, so a publish never ships what CI would reject.
(cd library && npm run check --silent) || { echo "refusing: npm run check failed in library/"; exit 1; }

# Leak guard. The instance's own identifiers come from instance.yaml at run time so
# that this script never carries them itself. Any IP outside loopback/private ranges
# also counts.
PATTERN='\b[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\b'
if [ -f instance.yaml ]; then
  for key in internal_suffix public_suffix operator_tailnet; do
    v="$(sed -nE "s/^[[:space:]]*${key}:[[:space:]]*\"?([^\"# ]+).*/\1/p" instance.yaml | head -1)"
    # the distinctive part: the tailnet name (first label) or the apex name of a
    # public domain (label before the TLD), never a generic prefix like "apps"
    case "$key" in
      public_suffix) label="$(printf '%s' "$v" | awk -F. 'NF>=2{print $(NF-1)}')" ;;
      *)             label="$(printf '%s' "$v" | cut -d. -f1)" ;;
    esac
    [ -n "$label" ] && PATTERN="$PATTERN|$label"
  done
fi
if grep -rnE "$PATTERN" library/ --exclude-dir=node_modules \
   | grep -vE 'package\.json|127\.0\.0\.1|0\.0\.0\.0|\b10\.[0-9]+\.|192\.168\.|\b172\.(1[6-9]|2[0-9]|3[01])\.' ; then
  echo "refusing: instance-looking strings in library/ (see above)"; exit 1
fi

git subtree split --prefix=library -b library-main >/dev/null 2>&1
git push "$REMOTE" "+library-main:main"
git branch -D library-main >/dev/null
echo "published library/ -> $REMOTE main"
