#include "window.h"
#include <iostream>

static QPushButton *button(QWidget *w, const QString &text) {
  for (auto *b : w->findChildren<QPushButton *>())
    if (b->text() == text) return b;
  throw std::runtime_error("Missing button");
}
static QWidget *field(QDialog *d, const QString &text) {
  auto *form = qobject_cast<QFormLayout *>(d->layout());
  for (int r = 0; r < form->rowCount(); ++r) {
    auto *label = form->itemAt(r, QFormLayout::LabelRole);
    if (label && qobject_cast<QLabel *>(label->widget()) &&
        qobject_cast<QLabel *>(label->widget())->text() == text)
      return form->itemAt(r, QFormLayout::FieldRole)->widget();
  }
  throw std::runtime_error("Missing field");
}
static void require(bool ok, const char *message) {
  if (!ok) throw std::runtime_error(message);
}
int main(int argc, char **argv) {
  QApplication app(argc, argv);
  QTemporaryDir dir;
  try {
    Engine e(dir.path());
    e.mutate("currency", {{"id","npr"},{"code","NPR"},{"name","Rupee"},{"digits",2}});
    for (auto id : {"cash", "bank"})
      e.mutate("account", {{"id",id},{"name",id},{"currency","npr"},{"opening",100000}});
    Window w(&e); w.show(); app.processEvents();
    QString failure;
    // Exercise the real account dialog before setting up transaction forms.
    auto accountForm = [&](bool editing) {
      QTimer::singleShot(0, [&] {
        auto *d = qobject_cast<QDialog *>(QApplication::activeModalWidget());
        try {
          require(d, "No account dialog");
          auto *opening=qobject_cast<QLineEdit *>(field(d,"Opening balance"));
          require(opening->text()==(editing ? "0.00" : "0"), "Incorrect account opening default");
          qobject_cast<QLineEdit *>(field(d,"Account name"))->setText("Savings");
          if(editing) opening->setText("125.50");
          button(d,"Save account")->click();
          require(!d->isVisible(),"Account save failed");
        } catch(const std::exception &ex) { failure=ex.what(); if(d)d->reject(); }
      });
      button(&w,editing ? "Edit account" : "+ Add account")->click();
      require(failure.isEmpty(),qPrintable(failure));
    };
    accountForm(false);
    QString savings;
    for(auto value:e.query("rows",{"account"}).toArray())
      if(value.toObject().value("name")=="Savings") savings=value.toObject().value("id").toString();
    require(!savings.isEmpty(),"New account not saved");
    require(e.query("balance",{savings}).toInteger()==0,"New account is not zero balance");
    auto *accountList=w.findChild<QListWidget *>();
    for(int row=0;row<accountList->count();++row)
      if(accountList->item(row)->data(Qt::UserRole)==savings) accountList->setCurrentRow(row);
    accountForm(true);
    {
      Engine verifyAccount(dir.path());
      require(verifyAccount.query("balance",{savings}).toInteger()==12550,"Edited account not persisted");
    }
    auto run = [&](const QString &action, bool editing) {
      QTimer::singleShot(0, [&] {
        auto *d = qobject_cast<QDialog *>(QApplication::activeModalWidget());
        try {
          require(d, "No transaction dialog");
          auto *date = qobject_cast<QDateEdit *>(field(d,"Date"));
          require(date->date() == (editing ? QDate(2024,2,29) : QDate::currentDate()), "Incorrect date default or edited date");
          auto *account = qobject_cast<QComboBox *>(field(d,"Account"));
          account->setCurrentIndex(account->findData("cash"));
          auto *type = qobject_cast<QComboBox *>(field(d,"Type"));
          auto *to = field(d,"To account");
          require(to->isHidden(), "Expense shows destination account");
          for (int i=0;i<12;++i) {
            type->setCurrentText("transfer"); require(!to->isHidden(),"Transfer destination hidden");
            type->setCurrentText("income"); require(to->isHidden(),"Income destination visible");
            type->setCurrentText("adjustment");
            require(field(d,"Actual balance (optional)")->isHidden() == editing,"Adjustment field visibility");
            type->setCurrentText("expense");
          }
          auto *category = qobject_cast<QComboBox *>(field(d,"Category"));
          category->showPopup(); category->setCurrentIndex(1); category->hidePopup();
          QKeyEvent enter(QEvent::KeyPress,Qt::Key_Return,Qt::NoModifier);
          QApplication::sendEvent(d,&enter);
          require(d->isVisible(),"Enter unexpectedly submitted the form");
          qobject_cast<QLineEdit *>(field(d,"Amount"))->setText(editing ? "400" : "380");
          qobject_cast<QLineEdit *>(field(d,"Transaction fee"))->setText("2");
          qobject_cast<QLineEdit *>(field(d,"Description"))->setText("Saved description");
          qobject_cast<QLineEdit *>(field(d,"Time (optional)"))->setText("12:30");
          date->setDate(QDate(2024,2,29));
          button(d,"Save transaction")->click();
          require(!d->isVisible(),"Save did not close dialog");
        } catch (const std::exception &ex) { failure=ex.what(); if(d)d->reject(); }
      });
      button(&w,action)->click();
      require(failure.isEmpty(),qPrintable(failure));
    };
    run("+ Add transaction",false);
    require(e.query("balance",{"cash"}).toInteger()==61800,"Saved expense balance incorrect");
    auto *table=w.findChild<QTableWidget *>(); table->selectRow(0);
    run("Edit selected",true);
    require(e.query("balance",{"cash"}).toInteger()==59800,"Edited expense balance incorrect");
    Engine reopened(dir.path());
    require(reopened.query("balance",{"cash"}).toInteger()==59800,"Expense did not persist");
    {
      Window next(&reopened); next.show(); app.processEvents();
      QTimer::singleShot(0, [&] {
        auto *d = qobject_cast<QDialog *>(QApplication::activeModalWidget());
        try {
          require(d, "No restored form");
          require(qobject_cast<QComboBox *>(field(d,"Account"))->currentData()=="cash", "Account selection not retained");
          require(qobject_cast<QComboBox *>(field(d,"Category"))->currentText()=="Food", "Category selection not retained");
          require(qobject_cast<QLineEdit *>(field(d,"Amount"))->text().isEmpty(), "Saved amount reused");
          require(qobject_cast<QLineEdit *>(field(d,"Transaction fee"))->text()=="0", "Saved fee reused");
          require(qobject_cast<QLineEdit *>(field(d,"Description"))->text().isEmpty(), "Saved description reused");
          require(qobject_cast<QLineEdit *>(field(d,"Time (optional)"))->text().isEmpty(), "Saved time reused");
          require(qobject_cast<QDateEdit *>(field(d,"Date"))->date()==QDate::currentDate(), "New form retained previous date");
          qobject_cast<QLineEdit *>(field(d,"Amount"))->setText("12.34");
          qobject_cast<QLineEdit *>(field(d,"Description"))->setText("Unfinished draft");
          qobject_cast<QDateEdit *>(field(d,"Date"))->setDate(QDate(2020,1,1));
          d->reject();
        } catch(const std::exception &ex) { failure=ex.what(); if(d)d->reject(); }
      });
      button(&next,"+ Add transaction")->click();
      require(failure.isEmpty(),qPrintable(failure));
    }
    {
      Engine afterRestart(dir.path());
      Window next(&afterRestart); next.show(); app.processEvents();
      QTimer::singleShot(0, [&] {
        auto *d = qobject_cast<QDialog *>(QApplication::activeModalWidget());
        try {
          require(d, "No draft dialog");
          require(qobject_cast<QDateEdit *>(field(d,"Date"))->date()==QDate::currentDate(), "Draft restored an old date");
          require(qobject_cast<QLineEdit *>(field(d,"Amount"))->text()=="12.34", "Draft amount lost after restart");
          require(qobject_cast<QLineEdit *>(field(d,"Description"))->text()=="Unfinished draft", "Draft description lost after restart");
          d->reject();
        } catch(const std::exception &ex) { failure=ex.what(); if(d)d->reject(); }
      });
      button(&next,"+ Add transaction")->click();
      require(failure.isEmpty(),qPrintable(failure));
      require(afterRestart.query("rows",{"entry"}).toArray().size()==1,"Draft created a transaction");
    }
    std::cout << "PASS: real transaction dialog date, type/dropdown changes, Enter, save, edit and persistence\n";
  } catch(const std::exception &ex) { std::cerr<<ex.what()<<'\n'; return 1; }
}
