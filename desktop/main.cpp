#include "window.h"
#include <iostream>
int main(int argc, char **argv) {
  QApplication app(argc, argv);
  app.setApplicationName("Fund Funeral");
  app.setDesktopFileName("fund-funeral");
  app.setOrganizationName("FundFuneral");
  app.setApplicationVersion("1.0.1");
  try {
    if (app.arguments().contains("--self-test")) {
      QTemporaryDir dir;
      QString device;
      {
        Engine e(dir.path());
        device = e.state()["device"].toString();
        {
          Window empty(&e);
          empty.show();
          app.processEvents();
          if (!empty.isVisible())
            throw std::runtime_error("Empty first launch failed");
        }
        e.mutate("currency", {{"id", "npr"},
                              {"code", "NPR"},
                              {"name", "Nepalese rupee"},
                              {"digits", 2}});
        e.mutate("account", {{"id", "cash"},
                             {"name", "Cash"},
                             {"currency", "npr"},
                             {"opening", 10000}});
        e.mutate("entry", {{"id", "test"},
                           {"account", "cash"},
                           {"to", QJsonValue::Null},
                           {"type", "expense"},
                           {"amount", 750},
                           {"fee", 5},
                           {"category", "Food"},
                           {"description", "Native persistence test"},
                           {"date", "2026-09-09"},
                           {"time", QJsonValue::Null}});
        if (e.query("balance", {"cash"}).toInteger() != 9245)
          throw std::runtime_error("Balance failed");
        Window w(&e);
        w.show();
        app.processEvents();
        if (!w.isVisible())
          throw std::runtime_error("Window failed");
      }
      Engine reopened(dir.path());
      if (reopened.state()["device"] != device ||
          reopened.query("balance", {"cash"}).toInteger() != 9245)
        throw std::runtime_error("Persistence failed");
      std::cout
          << "PASS: QJSEngine money, SQLite persistence, identity, Qt window\n";
      return 0;
    }
    QString directory =
        QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    auto args = app.arguments();
    int at = args.indexOf("--data-dir");
    if (at >= 0 && args.size() > at + 1)
      directory = args[at + 1];
    Engine engine(directory);
    at = args.indexOf("--test-listen");
    if (at >= 0 && args.size() > at + 1) {
      SyncServer server(&engine);
      auto invite = server.start(!args.contains("--paired-only"));
      QSaveFile file(args[at + 1]);
      if (!file.open(QIODevice::WriteOnly))
        throw std::runtime_error("Cannot write test invitation");
      file.write(invite.toUtf8());
      if (!file.commit())
        throw std::runtime_error("Cannot commit test invitation");
      QFile::setPermissions(args[at + 1], QFile::ReadOwner | QFile::WriteOwner);
      QTimer::singleShot(60000, &app, &QApplication::quit);
      return app.exec();
    }
    Window window(&engine);
    window.show();
    at = args.indexOf("--screenshot");
    if (at >= 0 && args.size() > at + 1) {
      QString path = args[at + 1];
      QTimer::singleShot(800, &app, [&window, path, &app] {
        window.grab().save(path);
        app.quit();
      });
    }
    return app.exec();
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
