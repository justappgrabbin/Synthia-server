#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
IFS=$'\n\t'

# Cynthia Batch Phone Hand
# Scans a Downloads folder for ZIP projects and feeds each unprocessed one
# through phone-to-github.sh. Existing repositories are skipped.

say(){ printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
slug(){ printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g;s/^-+//;s/-+$//' | cut -c1-90; }

DOWNLOADS="${1:-$HOME/downloads}"
HAND="${SYNTHIA_PHONE_HAND:-$HOME/phone-to-github.sh}"
LOG_DIR="$HOME/.synthia-phone-hand"
LOG_FILE="$LOG_DIR/batch.log"
mkdir -p "$LOG_DIR"

[ -d "$DOWNLOADS" ] || { echo "Downloads folder not found: $DOWNLOADS" >&2; exit 1; }
[ -x "$HAND" ] || { echo "Phone hand not executable: $HAND" >&2; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "Missing GitHub CLI (gh)" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "GitHub CLI is not logged in" >&2; exit 1; }

OWNER="$(gh api user --jq .login)"
shopt -s nullglob nocaseglob
ZIPS=("$DOWNLOADS"/*.zip)

if [ "${#ZIPS[@]}" -eq 0 ]; then
  say "No ZIP files found in $DOWNLOADS"
  exit 0
fi

CREATED=0
SKIPPED=0
FAILED=0
TOTAL=0

say "Scanning ${#ZIPS[@]} ZIP file(s) in $DOWNLOADS"

for ZIP in "${ZIPS[@]}"; do
  BASE="$(basename "$ZIP")"

  # The Automaton is Cynthia's seed/tooling, not a project to publish by itself.
  case "${BASE,,}" in
    github-app-automaton*.zip)
      say "Skipping seed ZIP: $BASE"
      SKIPPED=$((SKIPPED + 1))
      continue
      ;;
  esac

  TOTAL=$((TOTAL + 1))
  NAME="${BASE%.zip}"
  REPO="$(slug "$NAME")"
  [ -n "$REPO" ] || REPO="synthia-intake"
  FULL="$OWNER/$REPO"

  if gh repo view "$FULL" >/dev/null 2>&1; then
    say "Already in GitHub, skipping: $FULL"
    printf '%s\tSKIP\t%s\n' "$(date -Iseconds)" "$FULL" >> "$LOG_FILE"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  say "Sending: $BASE"
  if "$HAND" "$ZIP"; then
    CREATED=$((CREATED + 1))
    printf '%s\tCREATED\t%s\n' "$(date -Iseconds)" "$FULL" >> "$LOG_FILE"
  else
    FAILED=$((FAILED + 1))
    printf '%s\tFAILED\t%s\n' "$(date -Iseconds)" "$ZIP" >> "$LOG_FILE"
    say "Failed, continuing to the next ZIP: $BASE"
  fi
done

say "Batch complete"
printf 'Projects considered: %s\n' "$TOTAL"
printf 'Repositories created: %s\n' "$CREATED"
printf 'Skipped: %s\n' "$SKIPPED"
printf 'Failed: %s\n' "$FAILED"
printf 'Log: %s\n' "$LOG_FILE"

if [ "$FAILED" -gt 0 ]; then
  exit 2
fi
