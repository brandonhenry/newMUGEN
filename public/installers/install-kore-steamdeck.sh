#!/usr/bin/env bash
set -euo pipefail

APP_NAME="KORE"
APP_ID="com.bggames.kore"
GAME_SUMMARY="A free 3D fighter with arcade, training, ranked online, custom fighters, and wild stages."
APPIMAGE_URL="${KORE_APPIMAGE_URL:-https://playkore.com/installers/KORE-0.1.0-linux-x86_64.AppImage}"
STEAM_ART_BASE_URL="${KORE_STEAM_ART_BASE_URL:-https://playkore.com/steam-art}"
STEAM_TARGET="${KORE_STEAM_TARGET:-auto}"
INSTALL_DIR="${KORE_INSTALL_DIR:-$HOME/Games/KORE}"
APPIMAGE_PATH="$INSTALL_DIR/KORE.AppImage"
ICON_PATH="$INSTALL_DIR/kore.png"
STEAM_ART_DIR="$INSTALL_DIR/steam-art"
DESKTOP_FILE="$HOME/.local/share/applications/${APP_ID}.desktop"
DESKTOP_SHORTCUT=""
DRY_RUN=0
ADD_STEAM_SHORTCUT=0
PROMPT_STEAM_SHORTCUT=0

usage() {
  cat <<EOF
KORE Steam Deck fallback installer

Usage:
  curl -fsSL https://playkore.com/installers/install-kore-steamdeck.sh | bash
  ./install-kore-steamdeck.sh [options]

Options:
  --dry-run                 Print planned paths and commands without writing files.
  --appimage-url=URL        Download a specific KORE AppImage URL.
  --install-dir=PATH        Install KORE.AppImage into PATH.
  --add-steam-shortcut      Advanced: edit Steam shortcuts.vdf after backing it up.
  --prompt-steam-shortcut   Advanced: ask before editing Steam shortcuts.vdf.
  --no-steam-shortcut       Do not edit Steam shortcuts.vdf. This is the default.
  --steam-target=auto       Use installed Flatpak when available, otherwise AppImage.
  --steam-target=flatpak    Add Steam shortcut for com.bggames.kore Flatpak.
  --steam-target=appimage   Add Steam shortcut for the AppImage fallback.
  --help                    Show this help.
EOF
}

desktop_dir() {
  local resolved=""
  if command -v xdg-user-dir >/dev/null 2>&1; then
    resolved="$(xdg-user-dir DESKTOP 2>/dev/null || true)"
  fi
  if [ -z "$resolved" ] || [ "$resolved" = "$HOME" ]; then
    resolved="$HOME/Desktop"
  fi
  printf '%s\n' "$resolved"
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --appimage-url=*) APPIMAGE_URL="${arg#*=}" ;;
    --install-dir=*) INSTALL_DIR="${arg#*=}"; APPIMAGE_PATH="$INSTALL_DIR/KORE.AppImage"; ICON_PATH="$INSTALL_DIR/kore.png"; STEAM_ART_DIR="$INSTALL_DIR/steam-art" ;;
    --add-steam-shortcut) ADD_STEAM_SHORTCUT=1 ;;
    --prompt-steam-shortcut) PROMPT_STEAM_SHORTCUT=1 ;;
    --no-steam-shortcut) ADD_STEAM_SHORTCUT=0; PROMPT_STEAM_SHORTCUT=0 ;;
    --steam-target=*) STEAM_TARGET="${arg#*=}" ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

DESKTOP_SHORTCUT="$(desktop_dir)/KORE.desktop"

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

download_file() {
  local url="$1"
  local path="$2"
  if [ -f "$path" ]; then
    return
  fi
  if command -v curl >/dev/null 2>&1; then
    run curl -L "$url" -o "$path"
  elif command -v wget >/dev/null 2>&1; then
    run wget -O "$path" "$url"
  else
    echo "curl or wget is required to download KORE files." >&2
    exit 1
  fi
}

download_appimage() {
  run mkdir -p "$INSTALL_DIR"
  if [ -f "$APPIMAGE_PATH" ]; then
    echo "Using existing $APPIMAGE_PATH"
  elif [ -f "./KORE.AppImage" ]; then
    run cp "./KORE.AppImage" "$APPIMAGE_PATH"
  else
    download_file "$APPIMAGE_URL" "$APPIMAGE_PATH"
  fi
  run chmod +x "$APPIMAGE_PATH"
}

install_icon() {
  run mkdir -p "$INSTALL_DIR"
  download_file "https://playkore.com/brand/kore-favicon.png" "$ICON_PATH"
}

install_steam_art_sources() {
  run mkdir -p "$STEAM_ART_DIR"
  download_file "$STEAM_ART_BASE_URL/kore_capsule_460x215.png" "$STEAM_ART_DIR/kore_capsule_460x215.png"
  download_file "$STEAM_ART_BASE_URL/kore_capsule_460x215.jpg" "$STEAM_ART_DIR/kore_capsule_460x215.jpg"
  download_file "$STEAM_ART_BASE_URL/kore_library_600x900.png" "$STEAM_ART_DIR/kore_library_600x900.png"
  download_file "$STEAM_ART_BASE_URL/kore_library_600x900.jpg" "$STEAM_ART_DIR/kore_library_600x900.jpg"
  download_file "$STEAM_ART_BASE_URL/kore_hero_3840x1240.png" "$STEAM_ART_DIR/kore_hero_3840x1240.png"
  download_file "$STEAM_ART_BASE_URL/kore_hero_3840x1240.jpg" "$STEAM_ART_DIR/kore_hero_3840x1240.jpg"
  download_file "$STEAM_ART_BASE_URL/kore_logo.png" "$STEAM_ART_DIR/kore_logo.png"
  download_file "$STEAM_ART_BASE_URL/kore_icon_256.png" "$STEAM_ART_DIR/kore_icon_256.png"
  download_file "$STEAM_ART_BASE_URL/kore_icon_256.jpg" "$STEAM_ART_DIR/kore_icon_256.jpg"
}

create_desktop_entries() {
  run mkdir -p "$HOME/.local/share/applications"
  run mkdir -p "$(dirname "$DESKTOP_SHORTCUT")"
  write_file "$DESKTOP_FILE" 755 <<EOF
[Desktop Entry]
Type=Application
Name=KORE
Comment=$GAME_SUMMARY
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
Comment=$GAME_SUMMARY
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

default_steam_shortcuts_path() {
  printf '%s\n' "$HOME/.local/share/Steam/userdata/0/config/shortcuts.vdf"
}

flatpak_is_installed() {
  command -v flatpak >/dev/null 2>&1 && flatpak info "$APP_ID" >/dev/null 2>&1
}

resolve_steam_target() {
  case "$STEAM_TARGET" in
    flatpak)
      STEAM_EXE="/usr/bin/flatpak"
      STEAM_START_DIR="/usr/bin"
      STEAM_LAUNCH_OPTIONS="run $APP_ID"
      ;;
    appimage)
      STEAM_EXE="$APPIMAGE_PATH"
      STEAM_START_DIR="$INSTALL_DIR"
      STEAM_LAUNCH_OPTIONS=""
      ;;
    auto)
      if flatpak_is_installed; then
        STEAM_EXE="/usr/bin/flatpak"
        STEAM_START_DIR="/usr/bin"
        STEAM_LAUNCH_OPTIONS="run $APP_ID"
      else
        STEAM_EXE="$APPIMAGE_PATH"
        STEAM_START_DIR="$INSTALL_DIR"
        STEAM_LAUNCH_OPTIONS=""
      fi
      ;;
    *)
      echo "Invalid --steam-target value: $STEAM_TARGET" >&2
      exit 2
      ;;
  esac
}

add_steam_shortcut() {
  local shortcuts_path="$1"
  local backup_path="${shortcuts_path}.kore-backup-$(date +%Y%m%d%H%M%S)"
  resolve_steam_target
  install_steam_art_sources
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] Steam target: $STEAM_EXE $STEAM_LAUNCH_OPTIONS"
    echo "[dry-run] would back up $shortcuts_path to $backup_path"
    echo "[dry-run] would add or update KORE in $shortcuts_path"
    echo "[dry-run] would install Steam artwork from $STEAM_ART_DIR"
  else
    mkdir -p "$(dirname "$shortcuts_path")"
    if [ -f "$shortcuts_path" ]; then
      cp "$shortcuts_path" "$backup_path"
    fi
  fi
  SHORTCUTS_PATH="$shortcuts_path" \
    STEAM_EXE="$STEAM_EXE" \
    STEAM_START_DIR="$STEAM_START_DIR" \
    STEAM_LAUNCH_OPTIONS="$STEAM_LAUNCH_OPTIONS" \
    STEAM_ICON_PATH="$ICON_PATH" \
    STEAM_ART_DIR="$STEAM_ART_DIR" \
    DRY_RUN="$DRY_RUN" \
    python3 <<'PY'
import os
import shutil
import struct
import zlib
from pathlib import Path

path = Path(os.environ["SHORTCUTS_PATH"])
exe = os.environ["STEAM_EXE"]
start_dir = os.environ["STEAM_START_DIR"]
launch_options = os.environ["STEAM_LAUNCH_OPTIONS"]
icon = os.environ["STEAM_ICON_PATH"]
art_dir = Path(os.environ["STEAM_ART_DIR"])
dry_run = os.environ["DRY_RUN"] == "1"
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
            output.extend(b"\x02" + encoded_key + struct.pack("<I", value & 0xFFFFFFFF))
        else:
            output.extend(b"\x01" + encoded_key + str(value).encode("utf-8") + b"\x00")
    output.extend(b"\x08")
    return bytes(output)

def shortcut_appid():
    seed = f"{exe}{appname}".encode("utf-8")
    return (zlib.crc32(seed) | 0x80000000) & 0xFFFFFFFF

data = path.read_bytes() if path.exists() else b"\x00shortcuts\x00\x08\x08"
root, _ = read_map(data)
shortcuts = root.setdefault("shortcuts", {})
selected = None
for shortcut in shortcuts.values():
    if isinstance(shortcut, dict) and shortcut.get("AppName") == appname:
        selected = shortcut
        break
if selected is None:
    next_key = str(max([int(key) for key in shortcuts.keys() if str(key).isdigit()] + [-1]) + 1)
    selected = {}
    shortcuts[next_key] = selected

appid = int(selected.get("appid") or shortcut_appid())
selected.update({
    "appid": appid,
    "AppName": appname,
    "exe": f'"{exe}"',
    "StartDir": f'"{start_dir}"',
    "icon": icon,
    "ShortcutPath": "",
    "LaunchOptions": launch_options,
    "IsHidden": 0,
    "AllowDesktopConfig": 1,
    "AllowOverlay": 1,
    "OpenVR": 0,
    "Devkit": 0,
    "DevkitGameID": "",
    "LastPlayTime": 0,
    "tags": {"0": "KORE"}
})

config_dir = path.parent
userdata_dir = config_dir.parent
steam_root = userdata_dir.parent.parent
grid_dir = config_dir / "grid"
librarycache_dir = steam_root / "appcache" / "librarycache"
copies = [
    (art_dir / "kore_capsule_460x215.png", grid_dir / f"{appid}.png"),
    (art_dir / "kore_capsule_460x215.jpg", grid_dir / f"{appid}.jpg"),
    (art_dir / "kore_library_600x900.png", grid_dir / f"{appid}p.png"),
    (art_dir / "kore_library_600x900.jpg", grid_dir / f"{appid}p.jpg"),
    (art_dir / "kore_hero_3840x1240.png", grid_dir / f"{appid}_hero.png"),
    (art_dir / "kore_logo.png", grid_dir / f"{appid}_logo.png"),
    (art_dir / "kore_icon_256.png", grid_dir / f"{appid}_icon.png"),
    (art_dir / "kore_icon_256.jpg", librarycache_dir / f"{appid}_icon.jpg"),
    (art_dir / "kore_library_600x900.jpg", librarycache_dir / f"{appid}_library_600x900.jpg"),
    (art_dir / "kore_hero_3840x1240.jpg", librarycache_dir / f"{appid}_library_hero.jpg"),
    (art_dir / "kore_logo.png", librarycache_dir / f"{appid}_logo.png"),
    (art_dir / "kore_capsule_460x215.jpg", librarycache_dir / f"{appid}.jpg"),
]

if dry_run:
    print(f"[dry-run] Steam shortcut appid: {appid}")
    for _, target in copies:
        print(f"[dry-run] would write Steam artwork {target}")
else:
    path.write_bytes(write_map(root))
    for source, target in copies:
        if not source.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    print(f"Added or updated KORE in {path}")
    print(f"Installed Steam artwork for shortcut appid {appid}")
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

maybe_install_steam_shortcut() {
  if [ "$ADD_STEAM_SHORTCUT" -eq 1 ]; then
    if ! command -v python3 >/dev/null 2>&1; then
      echo "python3 is required for binary shortcuts.vdf editing. Use the manual Steam path instead."
      return
    fi
    shortcuts_path="$(find_steam_shortcuts || true)"
    if [ -z "$shortcuts_path" ]; then
      if [ "$DRY_RUN" -eq 1 ]; then
        shortcuts_path="$(default_steam_shortcuts_path)"
      else
        echo "Could not find Steam shortcuts.vdf. Use Steam > Games > Add a Non-Steam Game to My Library > KORE."
        return
      fi
    fi
    add_steam_shortcut "$shortcuts_path"
    echo "Restart Steam to see KORE in your library."
    return
  fi
  if [ "$PROMPT_STEAM_SHORTCUT" -eq 1 ]; then
    offer_steam_shortcut
    return
  fi
  echo "Steam Library integration skipped."
  echo "Manual Steam path: Steam > Games > Add a Non-Steam Game to My Library > KORE."
  echo "Advanced automatic Steam shortcut option: rerun with --add-steam-shortcut."
}

echo "Installing KORE for Steam Deck / SteamOS"
echo "Install path: $APPIMAGE_PATH"
echo "Desktop shortcut: $DESKTOP_SHORTCUT"
download_appimage
install_icon
create_desktop_entries
maybe_install_steam_shortcut
echo "Done."
