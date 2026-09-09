#pragma once
#include <QtNetwork>
// Minimal DNS-SD responder for one temporary TCP service (RFC 6762/6763).
// TLS authenticates peers; discovery only supplies candidate network addresses.
class Discovery : public QObject {
public:
  explicit Discovery(QObject *parent = nullptr);
  bool start(const QString &device, quint16 port);
  void stop();

private:
  QUdpSocket socket;
  QTimer announce;
  QList<QNetworkInterface> interfaces;
  QString instance, host, deviceId;
  quint16 servicePort = 0;
  QByteArray packet(quint32 ttl) const;
  void send(quint32 ttl = 120);
};
