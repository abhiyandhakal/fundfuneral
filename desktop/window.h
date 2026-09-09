#pragma once
#include "engine.h"
#include "sync.h"
#include <QtWidgets>
class Window : public QMainWindow {
  Q_OBJECT
public:
  Window(Engine *engine);
  void refresh();

private:
  Engine *e;
  SyncServer *sync;
  QComboBox *currency, *accountFilter, *typeFilter, *categoryFilter;
  QLineEdit *search, *from, *until, *minAmount, *maxAmount;
  QDateEdit *month;
  QLabel *totals, *syncStatus, *conflictStatus;
  QTableWidget *history;
  QListWidget *accounts;
  QJsonArray visible;
  void guarded(const std::function<void()> &fn);
  QJsonObject currentCurrency();
  QString money(QJsonValue amount);
  void addCurrency();
  void accountDialog(QJsonObject a = {});
  void entryDialog(QJsonObject entry = {});
  void importCsv();
  void exportCsv();
  void backup();
  void restore();
  void conflicts();
  void devices(bool pair);
};
