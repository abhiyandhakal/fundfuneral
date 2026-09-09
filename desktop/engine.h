#pragma once
#include <QtCore>
#include <QtQml>
#include <QtSql>
#include <stdexcept>
class Engine : public QObject {
 Q_OBJECT
public:
 explicit Engine(const QString &directory, QObject *parent=nullptr);
 ~Engine();
 QJsonObject state() const { return current; }
 QJsonValue call(const QString &method,const QJsonArray &arguments={});
 QJsonValue query(const QString &method,const QJsonArray &arguments={});
 void save(const QJsonObject &next);
 void mutate(const QString &kind,QJsonObject data,bool deleted=false);
 QString setting(const QString &key,const QString &fallback={});
 void setSetting(const QString &key,const QString &value);
 static QString uuid() {return QUuid::createUuid().toString(QUuid::WithoutBraces);}
 QString directory;
signals:
 void changed();
private:
 QJSEngine js; QSqlDatabase db; QJsonObject current;
};
