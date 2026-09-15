#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
IFS=$'\n\t'

# Cynthia Phone Hand
# Usage: bash phone-to-github.sh '/sdcard/Download/MyProject.zip' [repo-name]
# The original input is never modified.

say(){ printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die(){ printf '\n[FAIL] %s\n' "$*" >&2; exit 1; }
slug(){ printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g;s/^-+//;s/-+$//' | cut -c1-90; }

[ $# -ge 1 ] || die "Usage: bash phone-to-github.sh <zip-or-folder> [repo-name]"
INPUT="$1"
REQUESTED="${2:-}"
[ -e "$INPUT" ] || die "Not found: $INPUT"

if command -v pkg >/dev/null 2>&1; then
  pkg install -y git gh unzip >/dev/null
fi
for c in git gh; do command -v "$c" >/dev/null 2>&1 || die "Missing $c"; done

if ! gh auth status >/dev/null 2>&1; then
  say "GitHub login is required once on this phone"
  gh auth login
fi

OWNER="$(gh api user --jq .login)"
STAMP="$(date +%Y%m%d-%H%M%S)"
RUN="$HOME/.synthia-phone-hand/$STAMP"
SRC="$RUN/source"
WORK="$RUN/repo"
mkdir -p "$SRC" "$WORK"

if [ -f "$INPUT" ] && [[ "${INPUT,,}" == *.zip ]]; then
  command -v unzip >/dev/null 2>&1 || die "unzip is required"
  say "Extracting ZIP first"
  unzip -q "$INPUT" -d "$SRC"
  COUNT_DIRS="$(find "$SRC" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  COUNT_FILES="$(find "$SRC" -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d ' ')"
  if [ "$COUNT_DIRS" = "1" ] && [ "$COUNT_FILES" = "0" ]; then
    SOURCE="$(find "$SRC" -mindepth 1 -maxdepth 1 -type d | head -n1)"
  else
    SOURCE="$SRC"
  fi
elif [ -d "$INPUT" ]; then
  SOURCE="$INPUT"
else
  die "Input must be a ZIP or folder"
fi

NAME="$REQUESTED"
[ -n "$NAME" ] || NAME="$(basename "$INPUT")"
NAME="${NAME%.zip}"
REPO="$(slug "$NAME")"
[ -n "$REPO" ] || REPO="synthia-intake-$STAMP"
FULL="$OWNER/$REPO"

say "Copying into temporary staging area"
# Exclusions apply only to the temporary upload copy.
tar -C "$SOURCE" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='*.pem' \
  --exclude='*.key' \
  -cf - . | tar -C "$WORK" -xf -

cd "$WORK"
git init -b main >/dev/null
git config user.name "Synthia Phone Hand"
git config user.email "synthia-phone-hand@users.noreply.github.com"
git add -A
git commit -m "Synthia phone intake: $(basename "$INPUT")" >/dev/null

if gh repo view "$FULL" >/dev/null 2>&1; then
  REPO="${REPO}-${STAMP}"
  FULL="$OWNER/$REPO"
fi

say "Creating $FULL"
gh repo create "$FULL" --private --source . --remote origin --push

URL="$(gh repo view "$FULL" --json url --jq .url)"
say "Done"
printf 'Repository: %s\n' "$URL"
printf 'Original input preserved: yes\n'
