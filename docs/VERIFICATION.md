# Release verification — 1.0.0

All test data is synthetic. Physical-device native tests use separate cache
SQLite databases and preference namespaces; they never modify the user's vault.

## Automated domain and UI checks

- Exact integer parsing/formatting, precision and range limits.
- Income, expense, fees, same-currency transfers and signed adjustments.
- Editing/deletion restores the correct balance; invalid changes are atomic.
- Cross-currency transfers, malformed dates/times and invalid fees are rejected.
- Concurrent edits and edit/delete conflicts remain visible and resolve causally.
- Three-device relaying converges; retries are idempotent across JSON key ordering.
- Missing causal changes, sequence collisions and reserved object keys are rejected.
- Quoted/multiline CSV, duplicate preview, atomic imports, and 1,000-row import.
- Complete backup/restore validation, filters and persistent dynamic categories.
- React Native first-launch UI flow creates currency, account and expense with fee.
- Qt native self-test covers empty first launch, populated UI, SQLite reopening,
  preserved device identity and the actual QJSEngine domain runtime.

## Transport

The independent TLS client tests the real Qt listener: one-time pairing,
unauthorized rejection, incremental commits, restart/retry, device/certificate
binding, and adoption of a populated phone vault by an empty desktop.

An independent Python DNS-SD client resolves the built-in service, port, IPv4
address and device identity. No Avahi daemon is needed.

On the connected A059 phone running Android API 36, instrumentation verifies
native SQLite persistence, Android NSD discovery, rejection of an incorrect
certificate pin, and mutual TLS with an Android Keystore P-256 identity. These
checks also pass against the actual portable Ubuntu desktop bundle on the laptop.

## Packaging

The Linux package is built in Ubuntu 24.04 CI and tested on the target Arch Linux
Wayland desktop. It includes Qt, OpenSSL and linked runtime libraries, but uses
system glibc, display services, fonts and hardware drivers. Minimum Linux baseline:
x86_64 with glibc 2.39 (Ubuntu 24.04 or newer/equivalent).

Installer tests cover first install, upgrade, paths containing spaces, actual
launcher execution, desktop-file validation, uninstall and preservation of vaults.
The package's TLS and DNS-SD tests run against the packaged executable as well.

The signed release APK includes ARM64 and x86_64 native libraries and the compiled
Hermes bundle. It does not require a development server. The private update-signing
key is stored outside the repository; CI produces an unsigned verification APK,
while the published APK is signed locally with the persistent release identity.

## Reproduce

```sh
npm test
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j1
ctest --test-dir build --output-on-failure
python3 tests/sync_transport.py
python3 -m venv /tmp/fund-qa
/tmp/fund-qa/bin/pip install -r tests/requirements.txt
/tmp/fund-qa/bin/python tests/discovery.py
(cd mobile && npm ci && npm test -- --runInBand)
scripts/build-android.sh :app:assembleReleaseAndroidTest
python3 scripts/test-android-native.py <adb-device-serial>
# Only emulator-5554; clears only that emulator's app data:
python3 scripts/test-android-ui.py
```

Set `FUND_FUNERAL_BINARY` to an extracted release's `AppRun` to run transport or
native-device interoperability checks against the portable package.
