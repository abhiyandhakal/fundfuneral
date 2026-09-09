#pragma once
#include "discovery.h"
#include "engine.h"
#include <QtNetwork>
class SyncServer : public QTcpServer {
  Q_OBJECT
public:
  explicit SyncServer(Engine *engine);
  QString start(bool pairing);
  void stop();
  QString fingerprint() const;
signals:
  void status(const QString &message);

protected:
  void incomingConnection(qintptr descriptor) override;

private:
  Engine *engine;
  QSslCertificate certificate;
  QSslKey key;
  QString secret;
  QTimer expiry;
  Discovery discovery;
  QSet<QSslSocket *> sockets;
  void process(QSslSocket *socket, const QJsonObject &request,
               const QString &pin);
};
