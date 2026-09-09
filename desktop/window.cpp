#include "window.h"
#include "vendor/qrcodegen.hpp"
static QPushButton *button(const QString &text, QLayout *layout,
                           const std::function<void()> &fn) {
  auto *b = new QPushButton(text);
  layout->addWidget(b);
  QObject::connect(b, &QPushButton::clicked, b, fn);
  return b;
}
static QLineEdit *field(QFormLayout *f, const QString &label,
                        const QString &value = {}) {
  auto *w = new QLineEdit(value);
  f->addRow(label, w);
  return w;
}
static void writeFile(const QString &path, const QString &text) {
  QSaveFile f(path);
  if (!f.open(QIODevice::WriteOnly) || f.write(text.toUtf8()) < 0 ||
      !f.commit())
    throw std::runtime_error("Could not save file");
}
static QString readFile(const QString &path) {
  QFile f(path);
  if (!f.open(QIODevice::ReadOnly) || f.size() > 32 * 1024 * 1024)
    throw std::runtime_error("Cannot read file (maximum 32 MiB)");
  return QString::fromUtf8(f.readAll());
}
Window::Window(Engine *engine) : e(engine) {
  setWindowTitle("Fund Funeral");
  setWindowIcon(QIcon(":/logo.png"));
  resize(1180, 800);
  setMinimumSize(880, 600);
  setStyleSheet(
      "QWidget{font-family:'Noto "
      "Sans';font-size:14px;color:#342c31;background:#faf7f2;} "
      "QLineEdit,QComboBox,QDateEdit,QSpinBox,QTextEdit{background:white;"
      "border:1px solid "
      "#d9d0c7;border-radius:7px;padding:8px;min-height:22px;} "
      "QPushButton{background:#703c4b;color:white;border:0;border-radius:7px;"
      "padding:10px 16px;} QPushButton:hover{background:#885062;} "
      "QTableWidget,QListWidget{background:white;border:1px solid "
      "#e7ded3;border-radius:8px;selection-background-color:#eee1d7;selection-"
      "color:#342c31;} "
      "QHeaderView::section{background:#eee7de;padding:10px;border:0;font-"
      "weight:bold;} QTabBar::tab{padding:12px 22px;} "
      "QTabBar::tab:selected{color:#703c4b;border-bottom:3px solid #703c4b;} "
      "QGroupBox{border:1px solid "
      "#e5d9cb;border-radius:8px;margin-top:15px;padding:15px;} "
      "QLabel#title{font-size:28px;font-weight:700;} "
      "QLabel#muted{color:#796d70;} QCheckBox{padding:6px;}");
  auto *root = new QWidget;
  setCentralWidget(root);
  auto *layout = new QVBoxLayout(root);
  layout->setContentsMargins(28, 22, 28, 22);
  layout->setSpacing(16);
  auto *top = new QHBoxLayout;
  layout->addLayout(top);
  auto *logo = new QLabel;
  logo->setPixmap(
      QPixmap(":/logo.png")
          .scaled(42, 55, Qt::KeepAspectRatio, Qt::SmoothTransformation));
  top->addWidget(logo);
  auto *title = new QLabel("Fund Funeral");
  title->setObjectName("title");
  top->addWidget(title);
  top->addStretch();
  currency = new QComboBox;
  currency->setMinimumWidth(125);
  top->addWidget(currency);
  button("+ Currency", top, [this] { addCurrency(); });
  auto *subtitle =
      new QLabel("Your money, accounted for. Stored on this device.");
  subtitle->setObjectName("muted");
  layout->addWidget(subtitle);
  auto *summaryRow = new QHBoxLayout;
  layout->addLayout(summaryRow);
  month = new QDateEdit(QDate::currentDate());
  month->setDisplayFormat("MMMM yyyy");
  month->setCalendarPopup(true);
  summaryRow->addWidget(month);
  totals = new QLabel;
  totals->setWordWrap(true);
  summaryRow->addWidget(totals, 1);
  conflictStatus = new QLabel;
  layout->addWidget(conflictStatus);
  connect(conflictStatus, &QLabel::linkActivated, this,
          [this] { conflicts(); });
  auto *tabs = new QTabWidget;
  layout->addWidget(tabs, 1);
  auto *historyPage = new QWidget;
  auto *hl = new QVBoxLayout(historyPage);
  tabs->addTab(historyPage, "Transactions");
  auto *filters = new QGridLayout;
  hl->addLayout(filters);
  search = new QLineEdit;
  search->setPlaceholderText("Search description, category or account");
  filters->addWidget(search, 0, 0, 1, 2);
  accountFilter = new QComboBox;
  filters->addWidget(accountFilter, 0, 2);
  typeFilter = new QComboBox;
  typeFilter->addItem("All types", "");
  for (auto type : {"expense", "income", "transfer", "adjustment"})
    typeFilter->addItem(type, type);
  filters->addWidget(typeFilter, 0, 3);
  categoryFilter = new QComboBox;
  filters->addWidget(categoryFilter, 0, 4);
  from = new QLineEdit;
  until = new QLineEdit;
  minAmount = new QLineEdit;
  maxAmount = new QLineEdit;
  from->setPlaceholderText("From YYYY-MM-DD");
  until->setPlaceholderText("Until YYYY-MM-DD");
  minAmount->setPlaceholderText("Min amount");
  maxAmount->setPlaceholderText("Max amount");
  filters->addWidget(from, 1, 0);
  filters->addWidget(until, 1, 1);
  filters->addWidget(minAmount, 1, 2);
  filters->addWidget(maxAmount, 1, 3);
  button("Apply filters", filters, [this] { refresh(); });
  history = new QTableWidget(0, 7);
  history->setHorizontalHeaderLabels({"Date / time", "Type",
                                      "Account → destination", "Category",
                                      "Amount", "Fee", "Description"});
  history->horizontalHeader()->setSectionResizeMode(
      QHeaderView::ResizeToContents);
  history->horizontalHeader()->setSectionResizeMode(6, QHeaderView::Stretch);
  history->setSelectionBehavior(QAbstractItemView::SelectRows);
  history->setSelectionMode(QAbstractItemView::SingleSelection);
  history->setEditTriggers(QAbstractItemView::NoEditTriggers);
  history->verticalHeader()->hide();
  hl->addWidget(history, 1);
  auto *actions = new QHBoxLayout;
  hl->addLayout(actions);
  button("+ Add transaction", actions, [this] { entryDialog(); });
  button("Edit selected", actions, [this] {
    int r = history->currentRow();
    if (r >= 0)
      entryDialog(visible[r].toObject());
  });
  button("Delete selected", actions, [this] {
    int r = history->currentRow();
    if (r >= 0 &&
        QMessageBox::question(
            this, "Delete transaction",
            "Delete this entry? Its balance effects will be removed.") ==
            QMessageBox::Yes)
      guarded([&] { e->mutate("entry", visible[r].toObject(), true); });
  });
  actions->addStretch();
  button("Export CSV", actions, [this] { exportCsv(); });
  connect(history, &QTableWidget::cellDoubleClicked, this,
          [this](int r, int) { entryDialog(visible[r].toObject()); });
  auto *ap = new QWidget;
  auto *al = new QVBoxLayout(ap);
  tabs->addTab(ap, "Accounts");
  auto *hint = new QLabel("Opening balances plus your recorded transactions. "
                          "Use an adjustment to reconcile with reality.");
  hint->setWordWrap(true);
  al->addWidget(hint);
  accounts = new QListWidget;
  accounts->setSpacing(8);
  al->addWidget(accounts, 1);
  auto *ab = new QHBoxLayout;
  al->addLayout(ab);
  button("+ Add account", ab, [this] { accountDialog(); });
  button("Edit account", ab, [this] {
    if (accounts->currentItem())
      accountDialog(
          e->query("get",
                   {"account",
                    accounts->currentItem()->data(Qt::UserRole).toString()})
              .toObject());
  });
  button("Delete empty account", ab, [this] {
    if (accounts->currentItem() &&
        QMessageBox::question(
            this, "Delete account",
            "Delete this account? Accounts with history cannot be deleted.") ==
            QMessageBox::Yes)
      guarded([&] {
        e->mutate(
            "account",
            e->query("get",
                     {"account",
                      accounts->currentItem()->data(Qt::UserRole).toString()})
                .toObject(),
            true);
      });
  });
  ab->addStretch();
  auto *dp = new QWidget;
  auto *dl = new QVBoxLayout(dp);
  tabs->addTab(dp, "Devices");
  auto *dt = new QLabel(
      "Keep your phone and laptop in sync\n\nConnect both devices to the same "
      "Wi-Fi. Pair once, then open a sync session here and tap Sync on your "
      "phone. The connection closes automatically.");
  dt->setWordWrap(true);
  dl->addWidget(dt);
  syncStatus = new QLabel("No sync session running");
  syncStatus->setWordWrap(true);
  dl->addWidget(syncStatus);
  button("Pair new phone", dl, [this] { devices(true); });
  button("Open sync session", dl, [this] { devices(false); });
  button("Stop session", dl, [this] {
    if (sync)
      sync->stop();
  });
  button("Resolve conflicts", dl, [this] { conflicts(); });
  button("Forget paired devices", dl, [this] {
    if (QMessageBox::question(this, "Forget devices",
                              "Remove trust for all paired devices?") ==
        QMessageBox::Yes) {
      sync->stop();
      e->setSetting("peers", "{}");
      syncStatus->setText("Paired devices removed");
    }
  });
  dl->addStretch();
  auto *data = new QWidget;
  auto *dataLayout = new QVBoxLayout(data);
  tabs->addTab(data, "Import & backup");
  auto *dataHint =
      new QLabel("Catch up from a bank statement, or keep a complete copy of "
                 "your records.\n\nCSV is for spreadsheets. A Fund Funeral "
                 "backup includes your complete vault.");
  dataHint->setWordWrap(true);
  dataLayout->addWidget(dataHint);
  button("Import CSV…", dataLayout, [this] { importCsv(); });
  button("Export filtered history…", dataLayout, [this] { exportCsv(); });
  button("Create backup…", dataLayout, [this] { backup(); });
  button("Restore backup…", dataLayout, [this] { restore(); });
  dataLayout->addStretch();
  sync = new SyncServer(e);
  connect(sync, &SyncServer::status, syncStatus, &QLabel::setText);
  connect(e, &Engine::changed, this, &Window::refresh);
  connect(currency, &QComboBox::currentIndexChanged, this, &Window::refresh);
  connect(month, &QDateEdit::dateChanged, this, &Window::refresh);
  connect(search, &QLineEdit::textChanged, this, &Window::refresh);
  connect(typeFilter, &QComboBox::currentIndexChanged, this, &Window::refresh);
  connect(accountFilter, &QComboBox::currentIndexChanged, this,
          &Window::refresh);
  connect(categoryFilter, &QComboBox::currentIndexChanged, this,
          &Window::refresh);
  refresh();
}
void Window::guarded(const std::function<void()> &fn) {
  try {
    fn();
  } catch (const std::exception &error) {
    QMessageBox::warning(this, "Fund Funeral", QString::fromUtf8(error.what()));
  }
}
QJsonObject Window::currentCurrency() {
  return e->query("get", {"currency", currency->currentData().toString()})
      .toObject();
}
QString Window::money(QJsonValue n) {
  return e->call("money", {n, currentCurrency()["digits"]}).toString();
}
void Window::refresh() {
  guarded([&] {
    QSignalBlocker cb(currency), af(accountFilter), cf(categoryFilter);
    auto selected = currency->currentData().toString();
    currency->clear();
    for (auto v : e->query("rows", {"currency"}).toArray()) {
      auto c = v.toObject();
      currency->addItem(c["code"].toString(), c["id"].toString());
    }
    int ci = currency->findData(selected);
    if (ci >= 0)
      currency->setCurrentIndex(ci);
    auto c = currentCurrency();
    accounts->clear();
    auto oldAccount = accountFilter->currentData();
    accountFilter->clear();
    accountFilter->addItem("All accounts", "");
    for (auto v : e->query("rows", {"account"}).toArray()) {
      auto a = v.toObject();
      if (a["currency"] != c["id"])
        continue;
      auto *item = new QListWidgetItem(a["name"].toString() + "     " +
                                       c["code"].toString() + " " +
                                       money(e->query("balance", {a["id"]})));
      item->setData(Qt::UserRole, a["id"].toString());
      item->setSizeHint(QSize(200, 60));
      accounts->addItem(item);
      accountFilter->addItem(a["name"].toString(), a["id"].toString());
    }
    accountFilter->setCurrentIndex(
        qMax(0, accountFilter->findData(oldAccount)));
    auto oldCategory = categoryFilter->currentData();
    categoryFilter->clear();
    categoryFilter->addItem("All categories", "");
    QSet<QString> cats;
    for (auto v : e->query("rows", {"entry"}).toArray()) {
      auto cat = v.toObject()["category"].toString();
      if (!cat.isEmpty())
        cats.insert(cat);
    }
    QStringList sorted(cats.begin(), cats.end());
    sorted.sort();
    for (auto cat : sorted)
      categoryFilter->addItem(cat, cat);
    categoryFilter->setCurrentIndex(
        qMax(0, categoryFilter->findData(oldCategory)));
    if (c.isEmpty()) {
      conflictStatus->hide();
      totals->setText(
          "Welcome. Add a currency and your first account to get started.");
      history->setRowCount(0);
      return;
    }
    auto summary =
        e->query("summary", {c["id"], month->date().toString("yyyy-MM")})
            .toObject();
    totals->setText("<b>Balance " + money(summary["balance"]) + " " +
                    c["code"].toString() + "</b><br>Income " +
                    money(summary["income"]) + " &nbsp; · &nbsp; Expenses " +
                    money(summary["expense"]) + " &nbsp; · &nbsp; Fees " +
                    money(summary["fees"]) + " &nbsp; · &nbsp; Net " +
                    money(summary["net"]) + " &nbsp; · &nbsp; Adjustments " +
                    money(summary["adjustment"]));
    auto conflicts = e->query("conflicts").toArray();
    conflictStatus->setText(
        conflicts.isEmpty()
            ? ""
            : QString("<a href='resolve'>%1 conflicting record(s) need your "
                      "choice. Totals include a provisional version.</a>")
                  .arg(conflicts.size()));
    conflictStatus->setVisible(!conflicts.isEmpty());
    QJsonObject f{{"currency", c["id"]},
                  {"text", search->text()},
                  {"account", accountFilter->currentData().toString()},
                  {"type", typeFilter->currentData().toString()},
                  {"category", categoryFilter->currentData().toString()},
                  {"from", from->text()},
                  {"until", until->text()}};
    if (!minAmount->text().isEmpty())
      f["min"] = e->call("parse", {minAmount->text(), c["digits"]});
    if (!maxAmount->text().isEmpty())
      f["max"] = e->call("parse", {maxAmount->text(), c["digits"]});
    visible = e->query("history", {f}).toArray();
    history->setRowCount(visible.size());
    for (int i = 0; i < visible.size(); i++) {
      auto t = visible[i].toObject();
      auto a = e->query("get", {"account", t["account"]}).toObject();
      QString account = a["name"].toString();
      if (!t["to"].isNull())
        account +=
            " → " +
            e->query("get", {"account", t["to"]}).toObject()["name"].toString();
      QStringList values{t["date"].toString() + " " + t["time"].toString(),
                         t["type"].toString(),
                         account,
                         t["category"].toString(),
                         money(t["amount"]),
                         money(t["fee"]),
                         t["description"].toString()};
      for (int col = 0; col < values.size(); col++)
        history->setItem(i, col, new QTableWidgetItem(values[col]));
    }
    statusBar()->showMessage(
        QString("%1 transactions · Saved locally").arg(visible.size()));
  });
}
void Window::addCurrency() {
  QDialog d(this);
  d.setWindowTitle("Add currency");
  auto *f = new QFormLayout(&d);
  auto *code = field(f, "Code", "NPR"),
       *name = field(f, "Name", "Nepalese rupee");
  auto *precision = new QSpinBox;
  precision->setRange(0, 4);
  precision->setValue(2);
  f->addRow("Decimal places", precision);
  button("Create currency", f, [&] {
    guarded([&] {
      for (auto v : e->query("rows", {"currency"}).toArray())
        if (v.toObject()["code"] == code->text().trimmed().toUpper())
          throw std::runtime_error("That currency already exists");
      e->mutate("currency", {{"code", code->text().trimmed().toUpper()},
                             {"name", name->text().trimmed()},
                             {"digits", precision->value()}});
      d.accept();
    });
  });
  d.exec();
}
void Window::accountDialog(QJsonObject a) {
  if (currentCurrency().isEmpty()) {
    addCurrency();
    return;
  }
  QDialog d(this);
  d.setWindowTitle(a.isEmpty() ? "Create account" : "Edit account");
  auto *f = new QFormLayout(&d);
  auto *name = field(f, "Account name", a["name"].toString());
  auto *opening =
      field(f, "Opening balance", a.isEmpty() ? "0" : money(a["opening"]));
  f->addRow(new QLabel("Currency: " + currency->currentText()));
  button("Save account", f, [&] {
    guarded([&] {
      a["name"] = name->text().trimmed();
      a["currency"] = currentCurrency()["id"];
      a["opening"] =
          e->call("parse", {opening->text(), currentCurrency()["digits"]});
      e->mutate("account", a);
      d.accept();
    });
  });
  d.exec();
}
void Window::entryDialog(QJsonObject t) {
  if (accounts->count() == 0) {
    accountDialog();
    return;
  }
  QDialog d(this);
  d.setWindowTitle(t.isEmpty() ? "Add transaction" : "Edit transaction");
  d.setMinimumWidth(460);
  auto *f = new QFormLayout(&d);
  auto *type = new QComboBox;
  type->addItems({"expense", "income", "transfer", "adjustment"});
  if (!t.isEmpty())
    type->setCurrentText(t["type"].toString());
  f->addRow("Type", type);
  auto *account = new QComboBox, *to = new QComboBox;
  for (auto v : e->query("rows", {"account"}).toArray()) {
    auto a = v.toObject();
    if (a["currency"] == currentCurrency()["id"]) {
      account->addItem(a["name"].toString(), a["id"].toString());
      to->addItem(a["name"].toString(), a["id"].toString());
    }
  }
  if (!t.isEmpty()) {
    account->setCurrentIndex(account->findData(t["account"].toString()));
    to->setCurrentIndex(to->findData(t["to"].toString()));
  } else if (to->count() > 1)
    to->setCurrentIndex(1);
  f->addRow("Account", account);
  f->addRow("To account", to);
  auto *amount = field(f, "Amount", t.isEmpty() ? "" : money(t["amount"])),
       *fee = field(f, "Transaction fee", t.isEmpty() ? "0" : money(t["fee"]));
  auto *actual = field(f, "Actual balance (optional)");
  actual->setPlaceholderText("Calculate adjustment from current balance");
  auto *category = new QComboBox;
  category->setEditable(true);
  category->addItem("");
  category->addItems({"Food", "Transport", "Education", "Health", "Shopping",
                      "Bills", "Entertainment", "Salary", "Donation", "Other"});
  for (int i = 1; i < categoryFilter->count(); i++)
    if (category->findText(categoryFilter->itemText(i)) < 0)
      category->addItem(categoryFilter->itemText(i));
  category->setCurrentText(t["category"].toString());
  f->addRow("Category", category);
  auto *date = new QDateEdit(
      t.isEmpty() ? QDate::currentDate()
                  : QDate::fromString(t["date"].toString(), Qt::ISODate));
  date->setCalendarPopup(true);
  date->setDisplayFormat("yyyy-MM-dd");
  f->addRow("Date", date);
  auto *time = field(f, "Time (optional)", t["time"].toString());
  time->setPlaceholderText("HH:MM, or leave blank");
  auto *description = field(f, "Description", t["description"].toString());
  auto update = [&] {
    to->setEnabled(type->currentText() == "transfer");
    fee->setEnabled(type->currentText() == "expense" ||
                    type->currentText() == "transfer");
    actual->setEnabled(type->currentText() == "adjustment" && t.isEmpty());
  };
  connect(type, &QComboBox::currentTextChanged, &d, update);
  update();
  button("Save transaction", f, [&] {
    guarded([&] {
      auto precision = currentCurrency()["digits"];
      t["type"] = type->currentText();
      t["account"] = account->currentData().toString();
      t["to"] = type->currentText() == "transfer"
                    ? QJsonValue(to->currentData().toString())
                    : QJsonValue::Null;
      t["amount"] =
          e->call("parse",
                  {amount->text().isEmpty() ? "0" : amount->text(), precision});
      if (actual->isEnabled() && !actual->text().isEmpty())
        t["amount"] =
            e->call("parse", {actual->text(), precision}).toInteger() -
            e->query("balance", {t["account"]}).toInteger();
      t["fee"] = fee->isEnabled() ? e->call("parse", {fee->text(), precision})
                                  : QJsonValue(0);
      t["category"] = category->currentText().trimmed();
      t["date"] = date->date().toString(Qt::ISODate);
      t["time"] = time->text().trimmed().isEmpty()
                      ? QJsonValue::Null
                      : QJsonValue(time->text().trimmed());
      t["description"] = description->text();
      e->mutate("entry", t);
      d.accept();
    });
  });
  d.exec();
}
void Window::exportCsv() {
  guarded([&] {
    auto path = QFileDialog::getSaveFileName(this, "Export transactions",
                                             "fund-funeral.csv", "CSV (*.csv)");
    if (path.isEmpty())
      return;
    writeFile(
        path,
        e->query("csvExport",
                 {QJsonObject{
                     {"currency", currentCurrency()["id"]},
                     {"text", search->text()},
                     {"account", accountFilter->currentData().toString()},
                     {"type", typeFilter->currentData().toString()},
                     {"category", categoryFilter->currentData().toString()},
                     {"from", from->text()},
                     {"until", until->text()}}})
            .toString());
    statusBar()->showMessage("CSV exported");
  });
}
void Window::backup() {
  guarded([&] {
    auto path = QFileDialog::getSaveFileName(
        this, "Create backup",
        "fund-funeral-" + QDate::currentDate().toString(Qt::ISODate) + ".json",
        "Backup (*.json)");
    if (!path.isEmpty())
      writeFile(path, e->query("backup").toString());
  });
}
void Window::restore() {
  guarded([&] {
    auto path = QFileDialog::getOpenFileName(this, "Restore backup", {},
                                             "Backup (*.json)");
    if (path.isEmpty())
      return;
    auto next = e->call("restore",
                        {readFile(path), e->state()["device"], Engine::uuid()})
                    .toObject();
    if (QMessageBox::warning(
            this, "Restore backup",
            "Replace this vault with the validated backup? A safety backup "
            "will be saved locally. Devices must be paired again.",
            QMessageBox::Cancel | QMessageBox::Yes) != QMessageBox::Yes)
      return;
    writeFile(e->directory + "/before-restore-" +
                  QString::number(QDateTime::currentMSecsSinceEpoch()) +
                  ".json",
              e->query("backup").toString());
    sync->stop();
    e->save(next);
    e->setSetting("peers", "{}");
  });
}
void Window::importCsv() {
  guarded([&] {
    if (accounts->count() == 0)
      throw std::runtime_error("Create an account first");
    auto path = QFileDialog::getOpenFileName(this, "Import statement", {},
                                             "CSV (*.csv)");
    if (path.isEmpty())
      return;
    auto text = readFile(path);
    auto parsed = e->call("csvParse", {text}).toObject();
    QDialog d(this);
    d.setWindowTitle("Map statement columns");
    d.resize(550, 700);
    auto *f = new QFormLayout(&d);
    auto *account = new QComboBox;
    for (int i = 1; i < accountFilter->count(); i++)
      account->addItem(accountFilter->itemText(i), accountFilter->itemData(i));
    f->addRow("Import into", account);
    QMap<QString, QComboBox *> mapping;
    for (QString key : {"date", "description", "amount", "type", "debit",
                        "credit", "fee", "category", "time", "to_account"}) {
      auto *combo = new QComboBox;
      combo->addItem("");
      for (auto h : parsed["headers"].toArray())
        combo->addItem(h.toString());
      for (int i = 1; i < combo->count(); i++)
        if (combo->itemText(i).compare(key, Qt::CaseInsensitive) == 0)
          combo->setCurrentIndex(i);
      mapping[key] = combo;
      f->addRow(key, combo);
    }
    f->addRow(new QLabel(
        "Map amount + type, or debit + credit. Dates use YYYY-MM-DD.\nBlank "
        "type means expense. Fees default to zero."));
    button("Preview import", f, [&] { d.accept(); });
    if (d.exec() != QDialog::Accepted)
      return;
    QJsonObject map;
    for (auto i = mapping.begin(); i != mapping.end(); ++i)
      map[i.key()] = i.value()->currentText();
    QJsonArray ids;
    for (int i = 0; i < parsed["rows"].toArray().size(); i++)
      ids.append(Engine::uuid());
    auto preview = e->query("previewIds",
                            {text, map, account->currentData().toString(), ids})
                       .toArray();
    QDialog p(this);
    p.setWindowTitle("Review before import");
    p.resize(900, 550);
    auto *layout = new QVBoxLayout(&p);
    auto *table = new QTableWidget(preview.size(), 5);
    table->setHorizontalHeaderLabels(
        {"Row", "Status", "Date", "Amount", "Description"});
    table->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    table->setEditTriggers(QAbstractItemView::NoEditTriggers);
    layout->addWidget(table);
    bool errors = false;
    for (int i = 0; i < preview.size(); i++) {
      auto r = preview[i].toObject(), entry = r["entry"].toObject();
      QString status =
          r["error"].isNull()
              ? (r["duplicate"].toBool() ? "Possible duplicate — skipped"
                                         : "Ready")
              : r["error"].toString();
      if (!r["error"].isNull())
        errors = true;
      QStringList values{QString::number(r["line"].toInt()), status,
                         entry["date"].toString(),
                         entry.isEmpty() ? "" : money(entry["amount"]),
                         entry["description"].toString()};
      for (int j = 0; j < 5; j++)
        table->setItem(i, j, new QTableWidgetItem(values[j]));
    }
    auto *duplicates = new QCheckBox("Import possible duplicates anyway");
    layout->addWidget(duplicates);
    auto *save = button(
        errors ? "Fix invalid rows in the CSV before importing"
               : "Import reviewed rows",
        layout, [&] {
          guarded([&] {
            QJsonArray eventIds;
            for (int i = 0; i < preview.size(); i++)
              eventIds.append(Engine::uuid());
            e->save(e->query("importRowsIds",
                             {preview, duplicates->isChecked(), eventIds})
                        .toObject());
            p.accept();
          });
        });
    save->setEnabled(!errors);
    p.exec();
  });
}
void Window::devices(bool pair) {
  guarded([&] {
    auto invitation = sync->start(pair);
    if (!pair)
      return;
    QDialog d(this);
    d.setWindowTitle("Pair your phone");
    d.resize(650, 700);
    auto *l = new QVBoxLayout(&d);
    auto *hint = new QLabel(
        "On your phone, choose Devices → Scan pairing QR.\nScan or paste this "
        "invitation while both devices are on the same Wi-Fi.\nThe invitation "
        "is private, one-use, and expires in five minutes.");
    hint->setWordWrap(true);
    l->addWidget(hint);
    auto qr = qrcodegen::QrCode::encodeText(invitation.toUtf8().constData(),
                                            qrcodegen::QrCode::Ecc::MEDIUM);
    int scale = 4, border = 4;
    QImage qrImage((qr.getSize() + border * 2) * scale,
                   (qr.getSize() + border * 2) * scale, QImage::Format_RGB32);
    qrImage.fill(Qt::white);
    QPainter painter(&qrImage);
    painter.setPen(Qt::NoPen);
    painter.setBrush(Qt::black);
    for (int y = 0; y < qr.getSize(); y++)
      for (int x = 0; x < qr.getSize(); x++)
        if (qr.getModule(x, y))
          painter.drawRect((x + border) * scale, (y + border) * scale, scale,
                           scale);
    painter.end();
    auto *qrLabel = new QLabel;
    qrLabel->setPixmap(QPixmap::fromImage(qrImage));
    qrLabel->setAlignment(Qt::AlignCenter);
    l->addWidget(qrLabel);
    auto *text = new QTextEdit(invitation);
    text->setReadOnly(true);
    l->addWidget(text);
    button("Copy invitation", l,
           [invitation] { QApplication::clipboard()->setText(invitation); });
    button("Done", l, [&] { d.accept(); });
    d.exec();
  });
}
void Window::conflicts() {
  guarded([&] {
    for (auto v : e->query("conflicts").toArray()) {
      auto conflict = v.toObject();
      QDialog d(this);
      d.setWindowTitle("Choose the correct version");
      d.resize(600, 350);
      auto *l = new QVBoxLayout(&d);
      l->addWidget(new QLabel(
          "Both devices changed this record. Select the version to keep."));
      for (auto version : conflict["versions"].toArray()) {
        auto event = version.toObject();
        auto *label =
            new QLabel(QString::fromUtf8(QJsonDocument(event["data"].toObject())
                                             .toJson(QJsonDocument::Indented)));
        label->setWordWrap(true);
        l->addWidget(label);
        button(
            event["deleted"].toBool() ? "Keep deletion" : "Keep this version",
            l, [&, event] {
              guarded([&] {
                e->save(e->query("resolve",
                                 {conflict["key"], event["id"], Engine::uuid()})
                            .toObject());
                d.accept();
              });
            });
      }
      if (d.exec() != QDialog::Accepted)
        break;
    }
  });
}
