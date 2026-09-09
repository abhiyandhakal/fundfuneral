#!/usr/bin/env bash
set -euo pipefail
data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
bin_home=${FUND_FUNERAL_BIN_DIR:-"$HOME/.local/bin"}
app_dir="$data_home/fund-funeral/app"
if [[ -L "$bin_home/fund-funeral" && $(readlink "$bin_home/fund-funeral") == "$app_dir/AppRun" ]]; then rm -- "$bin_home/fund-funeral"; fi
rm -f -- "$data_home/applications/fund-funeral.desktop" "$data_home/icons/hicolor/256x256/apps/fund-funeral.png"
rm -rf -- "$app_dir"
printf 'Fund Funeral uninstalled. Your vault and backups have been preserved.\n'
