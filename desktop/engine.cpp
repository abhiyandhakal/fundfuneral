#include "engine.h"
static void sqlOk(bool ok, const QSqlQuery &q) {
  if (!ok)
    throw std::runtime_error(q.lastError().text().toStdString());
}
Engine::Engine(const QString &dir, QObject *parent)
    : QObject(parent), directory(dir) {
  QDir().mkpath(dir);
  QFile::setPermissions(dir,
                        QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner);
  db = QSqlDatabase::addDatabase("QSQLITE", uuid());
  db.setDatabaseName(dir + "/vault.sqlite3");
  if (!db.open())
    throw std::runtime_error(db.lastError().text().toStdString());
  QSqlQuery q(db);
  for (const auto &sql :
       {"PRAGMA journal_mode=WAL", "PRAGMA synchronous=FULL",
        "CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT "
        "NOT NULL)",
        "CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY "
        "CHECK(id=1),json TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS changes(id TEXT PRIMARY KEY,origin TEXT "
        "NOT NULL,seq INTEGER NOT NULL,json TEXT NOT NULL,UNIQUE(origin,seq))"})
    sqlOk(q.exec(sql), q);
  QFile file(":/ledger.js");
  if (!file.open(QIODevice::ReadOnly))
    throw std::runtime_error("Missing shared core");
  auto value = js.evaluate(QString::fromUtf8(file.readAll()));
  if (value.isError())
    throw std::runtime_error(value.toString().toStdString());
  QString device = setting("device");
  if (device.isEmpty()) {
    device = uuid();
    setSetting("device", device);
  }
  sqlOk(q.exec("SELECT json FROM state WHERE id=1"), q);
  if (q.next()) {
    auto stored = QJsonDocument::fromJson(q.value(0).toByteArray()).object();
    current = call("initial", {device, stored["vault"]}).toObject();
    current = call("merge", {current, stored["events"]}).toObject();
  } else {
    current = call("initial", {device, uuid()}).toObject();
    save(current);
  }
  QFile::setPermissions(db.databaseName(),
                        QFile::ReadOwner | QFile::WriteOwner);
}
Engine::~Engine() {
  auto name = db.connectionName();
  db.close();
  db = QSqlDatabase();
  QSqlDatabase::removeDatabase(name);
}
QJsonValue Engine::call(const QString &method, const QJsonArray &args) {
  const QString json =
      QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact));
  auto result = js.evaluate("JSON.stringify((function(){var result=Ledger." +
                            method + ".apply(null," + json +
                            ");return result===undefined?null:result;})())");
  if (result.isError())
    throw std::runtime_error(result.toString().toStdString());
  QJsonParseError error;
  auto doc =
      QJsonDocument::fromJson(("[" + result.toString() + "]").toUtf8(), &error);
  if (error.error != QJsonParseError::NoError)
    throw std::runtime_error("Invalid domain result");
  return doc.array()[0];
}
QJsonValue Engine::query(const QString &method, const QJsonArray &args) {
  QJsonArray a{current};
  for (auto v : args)
    a.append(v);
  return call(method, a);
}
void Engine::save(const QJsonObject &next) {
  if (!db.transaction())
    throw std::runtime_error("Cannot start database transaction");
  try {
    QSqlQuery q(db);
    if (!current.isEmpty() && current["vault"] != next["vault"])
      sqlOk(q.exec("DELETE FROM changes"), q);
    q.prepare("INSERT INTO changes(id,origin,seq,json) VALUES(?,?,?,?) ON "
              "CONFLICT(id) DO NOTHING");
    for (auto v : next["events"].toArray()) {
      auto e = v.toObject();
      q.bindValue(0, e["id"].toString());
      q.bindValue(1, e["origin"].toString());
      q.bindValue(2, e["seq"].toInteger());
      q.bindValue(3, QString::fromUtf8(
                         QJsonDocument(e).toJson(QJsonDocument::Compact)));
      sqlOk(q.exec(), q);
    }
    q.prepare("INSERT INTO state(id,json) VALUES(1,?) ON CONFLICT(id) DO "
              "UPDATE SET json=excluded.json");
    q.addBindValue(
        QString::fromUtf8(QJsonDocument(next).toJson(QJsonDocument::Compact)));
    sqlOk(q.exec(), q);
    if (!db.commit())
      throw std::runtime_error("Cannot commit database");
    current = next;
    emit changed();
  } catch (...) {
    db.rollback();
    throw;
  }
}
void Engine::mutate(const QString &kind, QJsonObject data, bool deleted) {
  if (!data.contains("id"))
    data["id"] = uuid();
  save(query("mutate", {kind, data, deleted, uuid()}).toObject());
}
QString Engine::setting(const QString &key, const QString &fallback) {
  QSqlQuery q(db);
  q.prepare("SELECT value FROM settings WHERE key=?");
  q.addBindValue(key);
  sqlOk(q.exec(), q);
  return q.next() ? q.value(0).toString() : fallback;
}
void Engine::setSetting(const QString &key, const QString &value) {
  QSqlQuery q(db);
  q.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO "
            "UPDATE SET value=excluded.value");
  q.addBindValue(key);
  q.addBindValue(value);
  sqlOk(q.exec(), q);
}
