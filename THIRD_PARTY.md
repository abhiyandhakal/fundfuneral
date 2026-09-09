# Third-party components

Fund Funeral source is MIT licensed (see LICENSE).

- The original Fund Funeral mark is reused from the owner's `fund_funeral` projects.
- QR Code generator 1.8.0 by Project Nayuki is MIT licensed. Its complete copyright
  and permission notice is retained in `desktop/vendor/qrcodegen.cpp` and `.hpp`.
  Source: https://github.com/nayuki/QR-Code-generator/tree/v1.8.0
- Qt is dynamically linked under its applicable LGPL terms. The Linux archive
  includes replaceable Qt libraries and plugins. Qt source and license information:
  https://www.qt.io/licensing/open-source-lgpl-obligations and
  https://download.qt.io/archive/qt/
- Linux runtime dependencies retain their upstream licenses. Libraries are bundled
  dynamically; glibc, the display server and hardware-specific drivers remain system
  dependencies. The release's Ubuntu libraries are available as source packages at
  https://archive.ubuntu.com/ubuntu/pool/ .
- React Native, React and Hermes are MIT licensed. Android dependency versions and
  source references are recorded in `mobile/package-lock.json` and Gradle files.
- ZXing Android Embedded 4.3.0 is Apache-2.0 licensed:
  https://github.com/journeyapps/zxing-android-embedded/tree/v4.3.0
- AndroidX libraries are Apache-2.0 licensed: https://android.googlesource.com/platform/frameworks/support/

The shared domain core has no runtime npm dependencies. The DNS-SD responder uses
Qt Network and the standard DNS record format; it does not require a system daemon.
