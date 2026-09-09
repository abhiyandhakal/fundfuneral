#!/usr/bin/env bash
# Per-user install. No root permissions required; records are never overwritten.
set -euo pipefail
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ ! -x "$source_dir/AppRun" ]]; then
  echo 'Run install.sh from an extracted Fund Funeral Linux release.' >&2
  exit 1
fi
data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
bin_home=${FUND_FUNERAL_BIN_DIR:-"$HOME/.local/bin"}
app_dir="$data_home/fund-funeral/app"
mkdir -p "$data_home/fund-funeral" "$bin_home" "$data_home/applications" "$data_home/icons/hicolor/256x256/apps"
stage=$(mktemp -d "$data_home/fund-funeral/install.XXXXXX")
trap 'rm -rf -- "$stage"' EXIT
cp -a "$source_dir/." "$stage/"
if [[ -e "$app_dir" ]]; then mv -- "$app_dir" "$stage/previous-install"; fi
mv -- "$stage" "$app_dir"
trap - EXIT
rm -rf -- "$app_dir/previous-install"
ln -sfn -- "$app_dir/AppRun" "$bin_home/fund-funeral"
cp -- "$app_dir/share/fund-funeral.png" "$data_home/icons/hicolor/256x256/apps/fund-funeral.png"
# Desktop Exec quoting has its own escaping rules, including literal percent signs.
escaped=${app_dir//\\/\\\\}; escaped=${escaped//\"/\\\"}; escaped=${escaped//\$/\\\$}; escaped=${escaped//\`/\\\`}; escaped=${escaped//%/%%}
cat > "$data_home/applications/fund-funeral.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Version=1.0
Name=Fund Funeral
Comment=Local-first personal finance
Exec="$escaped/AppRun"
Icon=fund-funeral
Terminal=false
Categories=Office;Finance;
StartupNotify=true
StartupWMClass=fund-funeral
DESKTOP
chmod 644 "$data_home/applications/fund-funeral.desktop"
if command -v update-desktop-database >/dev/null; then update-desktop-database "$data_home/applications"; fi
if command -v gtk-update-icon-cache >/dev/null; then gtk-update-icon-cache -f -t "$data_home/icons/hicolor" >/dev/null 2>&1 || true; fi
printf 'Installed Fund Funeral. Launch it from your applications menu or %s/fund-funeral\n' "$bin_home"
