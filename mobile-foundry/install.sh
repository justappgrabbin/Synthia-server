#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

echo "Pocket Foundry installer"
echo "This keeps your source files intact and works on copies."

pkg update -y
pkg install -y python git unzip termux-services

if command -v termux-setup-storage >/dev/null 2>&1; then
  echo
  echo "Android may ask for storage permission now."
  termux-setup-storage || true
fi

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HOME/.synthia-foundry"
BIN="$ROOT/bin"
mkdir -p "$BIN" "$ROOT/jobs" "$ROOT/outbox" "$ROOT/logs" "$ROOT/state" "$HOME/.termux/boot"
mkdir -p /sdcard/Download/SynthiaInbox 2>/dev/null || true

cp "$SRC_DIR/foundry_worker.py" "$BIN/foundry_worker.py"
cp "$SRC_DIR/foundryctl" "$BIN/foundryctl"
chmod +x "$BIN/foundryctl"

if [ ! -f "$ROOT/config.env" ]; then
  cp "$SRC_DIR/config.example.env" "$ROOT/config.env"
fi

SERVICE_DIR="$PREFIX/var/service/synthia-foundry"
mkdir -p "$SERVICE_DIR"
cat > "$SERVICE_DIR/run" <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
ROOT="$HOME/.synthia-foundry"
mkdir -p "$ROOT/logs"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
exec "$PREFIX/bin/python" "$ROOT/bin/foundry_worker.py" >>"$ROOT/logs/worker.log" 2>&1
RUN
chmod +x "$SERVICE_DIR/run"

cat > "$HOME/.termux/boot/start-synthia-foundry.sh" <<'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
sv up synthia-foundry 2>/dev/null || true
BOOT
chmod +x "$HOME/.termux/boot/start-synthia-foundry.sh"

sv-enable synthia-foundry 2>/dev/null || true
sv up synthia-foundry 2>/dev/null || true

echo
echo "Installed."
echo "Drop ZIPs, folders, code, docs, or project files into:"
echo "  /sdcard/Download/SynthiaInbox"
echo
echo "Optional intent file:"
echo "  MyApp.zip"
echo "  MyApp.intent.txt"
echo
echo "Edit config:"
echo "  nano ~/.synthia-foundry/config.env"
echo
echo "Controls:"
echo "  ~/.synthia-foundry/bin/foundryctl status"
echo "  ~/.synthia-foundry/bin/foundryctl logs"
echo "  ~/.synthia-foundry/bin/foundryctl outbox"
echo
echo "For reliable locked-screen operation, allow Termux to run in the background"
echo "and exclude it from Android battery optimization. Android may keep a"
echo "persistent notification visible while the service is alive."
