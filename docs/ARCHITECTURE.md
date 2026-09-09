# Fund Funeral v1

Local-first personal finance for Linux (Qt Widgets) and Android (React Native).
Both installations own a SQLite database and remain usable offline. No cloud,
login, notification scraping, budgets, goals, or cross-currency conversion.

## Financial model

Currencies have a code, name and minor-unit precision. Accounts belong to one
currency and start with an opening balance, defaulting to zero. Money is stored
as bounded integer minor units; parsing and formatting never use decimal
floating-point arithmetic. Expense and transfer fees are separate. Income adds
money, expense subtracts amount plus fee, same-currency transfers debit amount
plus fee and credit amount, and signed adjustments correct discrepancies.
Only income and expense contribute to those monthly totals; fees and adjustments
are reported separately. Balances are derived, never overwritten.

Transactions have a required date (today by default), nullable time, description,
and an optional dynamic global category. All entries can be edited or deleted.
History supports text, category, account, type, date and amount filters.

## Shared core and persistence

The same dependency-free JavaScript domain module runs in Qt's QJSEngine and
React Native's Hermes. Native adapters persist each mutation and its logical
change together in one SQLite transaction. UUID identifiers, per-origin sequences,
causal version vectors and retained tombstones permit multi-device offline use.
Concurrent versions stay visible until the user resolves them; clock timestamps
do not decide the winner. Receiving the same operation again is idempotent.

## Recovery

CSV import maps columns and previews rows and possible duplicates before an
atomic import. CSV export is for spreadsheets, not a backup. Versioned JSON
backups contain the vault's data and change history, but never device private
keys or paired-device credentials. Restore validates the entire backup before
replacing the vault and retains a safety copy. Restoring creates a new vault
identity and clears pairing to avoid propagating obsolete data to existing peers.

## LAN synchronization

TLS 1.2 or newer encrypts traffic. Each installation owns a self-signed device
certificate and private key; pairing pins the exact certificate fingerprint
through a user-transferred invitation. A short-lived, one-use random pairing
secret authorizes the joining device. Paired devices authenticate with pinned
certificates. Discovery advertises only a device name and port through mDNS.
The desktop listener is temporary; it does not own the canonical data.
Android connects to it and both exchange only changes missing from their vector
cursors. Native network adapters bound message size and connection duration.

## Release deliverables

Linux x86_64 executable with Qt runtime bundle, per-user XDG installer and
uninstaller, desktop entry and original brand icon. Android release APK with
embedded JavaScript, a persistent private signing key outside source control,
and physical-device smoke tests. CI builds and tests each platform.
