# Fund Funeral

A local-first personal finance app for Linux and Android. Built with Qt Widgets
and React Native, with one shared finance engine and independent SQLite vaults.
The original Fund Funeral logo is reused with its gold palette.

## Install

**Linux x86_64:** download and extract the Linux release archive, then run
`./install.sh`. It installs the app under `$XDG_DATA_HOME/fund-funeral/app`
(default `~/.local/share`), a launcher in `~/.local/bin`, an application-menu entry,
and an icon. Run `./AppRun` from the extracted folder for a portable launch.
The bundle includes Qt and linked libraries but uses the system glibc, display
server, graphics drivers and fonts. `openssl` is needed to create the device
identity. On Debian, Ubuntu or Arch install `openssl` if it is missing.
LAN discovery runs inside the desktop app and does not require an Avahi daemon.

**Android 7 or newer (ARM64 or x86_64):** download the release APK and open it on
Android. Permit installation from the app used to open the APK when Android asks.
The APK includes its JavaScript bundle and runs without Metro or internet access.
Camera permission is requested only when scanning a pairing QR code.

The uninstaller removes only the app and launchers, keeping your vault and backups.

## Everyday use

1. Add a currency (NPR is suggested), then an account with an optional opening balance.
2. Add expenses, income, same-currency transfers, or signed adjustments. Dates default
   to today; time is absent unless entered. Type a category to create it immediately.
3. Edit or delete an entry from history. Search and filter by account, category, type,
   dates and amounts. Balances recalculate from the records.
4. Use an adjustment with an actual balance to reconcile forgotten transactions.

The desktop transaction form remembers selections separately for each currency.
Unfinished forms retain every field across closing and restarting. After saving,
amount, fee, actual balance, time and description reset; type, accounts, category
and an explicitly chosen date remain selected. An untouched date follows today.

Money uses integer minor units with a supported bound of 9,000,000,000,000 minor
units per amount and aggregate. Currency precision is 0–4 places. Expense and
transfer fees are separate; transfers and adjustments never inflate income or
expense totals. Currencies are never combined using guessed exchange rates.

## Pair and sync

Keep your existing data on either device and start with an empty vault on the other. On the
desktop choose **Devices → Pair new phone**. On the phone choose **Devices → Scan
pairing QR**, scan the invitation, then tap **Pair with desktop**. An invitation
is private, expires after five minutes, and can be used once. Pasting it also works.

For later syncs, open a sync session on the desktop, then tap **Sync now** on the
phone. Keep both devices on the same LAN. Discovery uses mDNS; the device
certificate is pinned during pairing. TLS encrypts all records. No cloud service
is involved. The desktop listener closes after the exchange or five minutes.
A desktop listener is the v1 transport role, not a canonical copy of the data.

If discovery is blocked by a guest network or firewall, move both devices to a
normal private LAN, or open a new pairing QR on the desktop and choose **Update
connection QR** on the already-paired phone. This updates the endpoint while
retaining the trusted identity. Never expose the
listener through router port forwarding. Concurrent changes remain visible as
conflicts; choose a version on either device, then sync again.

## CSV and backups

Import accepts comma-separated UTF-8 CSV with quoted fields, including multiline
notes. Select a destination account, map columns, and review every row before
importing. Map either `amount` + `type` or `debit` + `credit`. Dates use
`YYYY-MM-DD`, optional times use `HH:MM`, and amounts use a decimal point without
thousands separators. Possible duplicates are skipped unless explicitly included.
Fix invalid rows before importing; no partial import is committed.

Export includes readable currency/account names, transfer destinations, amount,
fee, category and description. Spreadsheet formula prefixes in text are escaped.
**CSV is not a backup.** Create a versioned JSON backup for the full vault.
Restoring validates the complete backup, keeps a local safety copy, starts a new
vault identity and forgets paired devices. Backups never contain private keys.
Re-pair an empty peer after restoring; independently populated vaults are not merged.

Desktop data lives in the Qt application-data directory, normally
`~/.local/share/FundFuneral/Fund Funeral`. Android stores data in its private app
directory and the device identity in Android Keystore. Back up before uninstalling
Android, since Android removes the app's private data when it is uninstalled.

## Develop and test

Desktop dependencies: C++17 compiler, CMake, Qt 6.4+ Core/Widgets/Qml/Sql/Network,
Qt's SQLite plugin and the OpenSSL command. Build with bounded parallelism:

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j1
ctest --test-dir build --output-on-failure
npm test
python3 tests/sync_transport.py
```

Android requires Node 22.11+, JDK 17, Android SDK platform 37.0, build-tools 37.0.0,
NDK 27.1.12297006 and CMake 3.22.1. React Native and its lockfile are pinned.

```sh
cd mobile
npm ci
npm test -- --runInBand
cd ..
# Set JAVA_HOME and ANDROID_HOME to valid installations.
# Set FUND_FUNERAL_KEYSTORE and FUND_FUNERAL_STORE_PASSWORD privately.
# Keystore alias must be fund-funeral. Never commit the key or password.
scripts/build-android.sh
python3 scripts/package-desktop.py
```

Keep the release keystore and its password backed up privately; Android updates
must use the same signing identity. Architecture and sync semantics are documented
in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Verification results and supported
release environments are in [docs/VERIFICATION.md](docs/VERIFICATION.md).
