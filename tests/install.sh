#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d)
trap 'rm -rf -- "$test_root"' EXIT
export XDG_DATA_HOME="$test_root/data with spaces"
export FUND_FUNERAL_BIN_DIR="$test_root/bin with spaces"
export QT_QPA_PLATFORM=offscreen
bundle="$root/dist/fund-funeral-1.0.1-linux-x86_64"
"$bundle/install.sh"
"$FUND_FUNERAL_BIN_DIR/fund-funeral" --self-test
"$bundle/install.sh"
"$FUND_FUNERAL_BIN_DIR/fund-funeral" --self-test
test -f "$XDG_DATA_HOME/applications/fund-funeral.desktop"
if command -v desktop-file-validate >/dev/null; then desktop-file-validate "$XDG_DATA_HOME/applications/fund-funeral.desktop"; fi
mkdir -p "$XDG_DATA_HOME/FundFuneral"
printf 'preserve me\n' > "$XDG_DATA_HOME/FundFuneral/test-vault"
"$bundle/uninstall.sh"
test ! -e "$FUND_FUNERAL_BIN_DIR/fund-funeral"
test -f "$XDG_DATA_HOME/FundFuneral/test-vault"
echo 'PASS: install, upgrade, paths with spaces, launcher, uninstall, data preservation'
