#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
IFS=$'\n\t'

# Cynthia Phone Hand
# Usage: bash phone-to-github.sh '/sdcard/Download/MyProject.zip' [repo-name]
# The original input is never modified.
# If the Synthia Automaton ZIP and Field Scanner YAML are present in Downloads,
# they are copied into the new repo before the first push.

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

# Optional Synthia seed files already on the phone.
AUTOMATON_ZIP="${SYNTHIA_AUTOMATON_ZIP:-/sdcard/Download/github-app-automaton-FIXED-v2.1.0.zip}"
FIELD_SCANNER="${SYNTHIA_FIELD_SCANNER:-/sdcard/Download/synthia-field-scanner.yml}"
SEED_DIR="$RUN/seed"
mkdir -p "$WORK/.github/workflows" "$SEED_DIR"
SEEDED=()

if [ -f "$AUTOMATON_ZIP" ]; then
  if [ -e "$WORK/automaton" ]; then
    say "Automaton folder already exists in project; preserving it and skipping Automaton seed"
  else
    say "Seeding App Automaton from $(basename "$AUTOMATON_ZIP")"
    unzip -q "$AUTOMATON_ZIP" '.github/workflows/app-automaton.yml' 'automaton/*' -d "$SEED_DIR"
    if [ -d "$SEED_DIR/automaton" ]; then
      cp -a "$SEED_DIR/automaton" "$WORK/automaton"
    fi
    if [ -f "$SEED_DIR/.github/workflows/app-automaton.yml" ]; then
      TARGET="$WORK/.github/workflows/app-automaton.yml"
      if [ -e "$TARGET" ]; then
        TARGET="$WORK/.github/workflows/app-automaton.synthia-$STAMP.yml"
      fi
      cp "$SEED_DIR/.github/workflows/app-automaton.yml" "$TARGET"
    fi
    SEEDED+=("automaton")
  fi
else
  say "Automaton seed not found at $AUTOMATON_ZIP; continuing without it"
fi

if [ -f "$FIELD_SCANNER" ]; then
  say "Seeding Synthia Field Scanner from $(basename "$FIELD_SCANNER")"
  TARGET="$WORK/.github/workflows/synthia-field-scanner.yml"
  if [ -e "$TARGET" ]; then
    TARGET="$WORK/.github/workflows/synthia-field-scanner.synthia-$STAMP.yml"
  fi
  cp "$FIELD_SCANNER" "$TARGET"
  SEEDED+=("field-scanner")
else
  say "Field Scanner seed not found at $FIELD_SCANNER; continuing without it"
fi

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
if [ "${#SEEDED[@]}" -gt 0 ]; then
  printf 'Synthia seed: %s\n' "$(IFS=,; echo "${SEEDED[*]}")"
else
  printf 'Synthia seed: none found locally\n'
fi
