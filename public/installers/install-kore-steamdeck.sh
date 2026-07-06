#!/usr/bin/env bash
set -euo pipefail

APP_NAME="KORE"
APP_ID="com.bggames.kore"
APPIMAGE_URL="${KORE_APPIMAGE_URL:-https://playkore.com/installers/KORE-0.1.0-linux-x64.AppImage}"
INSTALL_DIR="${KORE_INSTALL_DIR:-$HOME/Games/KORE}"
APPIMAGE_PATH="$INSTALL_DIR/KORE.AppImage"
ICON_PATH="$INSTALL_DIR/kore.png"
DESKTOP_FILE="$HOME/.local/share/applications/${APP_ID}.desktop"
DESKTOP_SHORTCUT="$HOME/Desktop/KORE.desktop"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --appimage-url=*) APPIMAGE_URL="${arg#*=}" ;;
    --install-dir=*) INSTALL_DIR="${arg#*=}"; APPIMAGE_PATH="$INSTALL_DIR/KORE.AppImage"; ICON_PATH="$INSTALL_DIR/kore.png" ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

write_file() {
  local path="$1"
  local mode="$2"
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] write %s\n' "$path"
    cat >/dev/null
  else
    umask 022
    cat >"$path"
    chmod "$mode" "$path"
  fi
}

download_appimage() {
  run mkdir -p "$INSTALL_DIR"
  if [ -f "$APPIMAGE_PATH" ]; then
    echo "Using existing $APPIMAGE_PATH"
  elif [ -f "./KORE.AppImage" ]; then
    run cp "./KORE.AppImage" "$APPIMAGE_PATH"
  elif command -v curl >/dev/null 2>&1; then
    run curl -L "$APPIMAGE_URL" -o "$APPIMAGE_PATH"
  elif command -v wget >/dev/null 2>&1; then
    run wget -O "$APPIMAGE_PATH" "$APPIMAGE_URL"
  else
    echo "curl or wget is required to download KORE.AppImage." >&2
    exit 1
  fi
  run chmod +x "$APPIMAGE_PATH"
}

install_icon() {
  if [ -f "$ICON_PATH" ]; then
    return
  fi
  if command -v curl >/dev/null 2>&1; then
    run curl -L "https://playkore.com/brand/kore-favicon.png" -o "$ICON_PATH"
  elif command -v wget >/dev/null 2>&1; then
    run wget -O "$ICON_PATH" "https://playkore.com/brand/kore-favicon.png"
  fi
}

create_desktop_entries() {
  run mkdir -p "$HOME/.local/share/applications"
  run mkdir -p "$HOME/Desktop"
  write_file "$DESKTOP_FILE" 755 <<EOF
[Desktop Entry]
Type=Application
Name=KORE
Comment=Play KORE in a Chromium desktop shell
Exec=$APPIMAGE_PATH
Icon=$ICON_PATH
Categories=Game;
Terminal=false
StartupNotify=true
EOF
  write_file "$DESKTOP_SHORTCUT" 755 <<EOF
[Desktop Entry]
Type=Application
Name=KORE
Comment=Play KORE in a Chromium desktop shell
Exec=$APPIMAGE_PATH
Icon=$ICON_PATH
Categories=Game;
Terminal=false
StartupNotify=true
EOF
  if command -v update-desktop-database >/dev/null 2>&1; then
    run update-desktop-database "$HOME/.local/share/applications" || true
  fi
}

find_steam_shortcuts() {
  find "$HOME/.steam" "$HOME/.local/share/Steam" "$HOME/.var/app/com.valvesoftware.Steam/.steam" \
    -path '*/userdata/*/config/shortcuts.vdf' -type f 2>/dev/null | head -n 1
}

add_steam_shortcut() {
  local shortcuts_path="$1"
  local backup_path="${shortcuts_path}.kore-backup-$(date +%Y%m%d%H%M%S)"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] would back up $shortcuts_path to $backup_path"
  else
    cp "$shortcuts_path" "$backup_path"
  fi
  SHORTCUTS_PATH="$shortcuts_path" APPIMAGE_PATH="$APPIMAGE_PATH" python3 <<'PY'
import os
import struct
from pathlib import Path

path = Path(os.environ["SHORTCUTS_PATH"])
exe = os.environ["APPIMAGE_PATH"]
appname = "KORE"

def read_cstr(data, index):
    end = data.index(b"\x00", index)
    return data[index:end].decode("utf-8", "replace"), end + 1

def read_map(data, index=0):
    result = {}
    while index < len(data):
        item_type = data[index]
        index += 1
        if item_type == 0x08:
            return result, index
        key, index = read_cstr(data, index)
        if item_type == 0x00:
            value, index = read_map(data, index)
        elif item_type == 0x01:
            value, index = read_cstr(data, index)
        elif item_type == 0x02:
            value = struct.unpack_from("<I", data, index)[0]
            index += 4
        else:
            raise ValueError(f"Unsupported VDF item type {item_type}")
        result[key] = value
    return result, index

def write_map(mapping):
    output = bytearray()
    for key, value in mapping.items():
        encoded_key = key.encode("utf-8") + b"\x00"
        if isinstance(value, dict):
            output.extend(b"\x00" + encoded_key + write_map(value))
        elif isinstance(value, int):
            output.extend(b"\x02" + encoded_key + struct.pack("<I", value))
        else:
            output.extend(b"\x01" + encoded_key + str(value).encode("utf-8") + b"\x00")
    output.extend(b"\x08")
    return bytes(output)

data = path.read_bytes() if path.exists() else b"\x00shortcuts\x00\x08\x08"
root, _ = read_map(data)
shortcuts = root.setdefault("shortcuts", {})
for shortcut in shortcuts.values():
    if isinstance(shortcut, dict) and shortcut.get("AppName") == appname:
        shortcut["exe"] = f'"{exe}"'
        shortcut["StartDir"] = f'"{Path(exe).parent}"'
        break
else:
    next_key = str(max([int(key) for key in shortcuts.keys() if str(key).isdigit()] + [-1]) + 1)
    shortcuts[next_key] = {
        "AppName": appname,
        "exe": f'"{exe}"',
        "StartDir": f'"{Path(exe).parent}"',
        "icon": "",
        "ShortcutPath": "",
        "LaunchOptions": "",
        "IsHidden": 0,
        "AllowDesktopConfig": 1,
        "AllowOverlay": 1,
        "OpenVR": 0,
        "Devkit": 0,
        "DevkitGameID": "",
        "LastPlayTime": 0,
        "tags": {"0": "KORE"}
    }
path.write_bytes(write_map(root))
print(f"Added or updated KORE in {path}")
PY
}

offer_steam_shortcut() {
  echo
  echo "Desktop shortcuts are installed."
  echo "Manual Steam path: Steam > Games > Add a Non-Steam Game to My Library > KORE."
  printf "Try advanced automatic Steam Library integration now? [y/N] "
  read -r answer
  case "$answer" in
    [Yy]*)
      if ! command -v python3 >/dev/null 2>&1; then
        echo "python3 is required for binary shortcuts.vdf editing. Use the manual Steam path above."
        return
      fi
      shortcuts_path="$(find_steam_shortcuts || true)"
      if [ -z "$shortcuts_path" ]; then
        echo "Could not find Steam shortcuts.vdf. Use the manual Steam path above."
        return
      fi
      add_steam_shortcut "$shortcuts_path"
      echo "Restart Steam to see KORE in your library."
      ;;
    *) echo "Skipping Steam Library integration." ;;
  esac
}

echo "Installing KORE for Steam Deck / SteamOS"
echo "Install path: $APPIMAGE_PATH"
download_appimage
install_icon
create_desktop_entries
offer_steam_shortcut
echo "Done."
