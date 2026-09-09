#include "discovery.h"
namespace {
void u16(QByteArray &b, quint16 n) {
  b.append(char(n >> 8));
  b.append(char(n));
}
void u32(QByteArray &b, quint32 n) {
  u16(b, quint16(n >> 16));
  u16(b, quint16(n));
}
QByteArray name(const QString &text) {
  QByteArray b;
  for (auto label : text.toUtf8().split('.')) {
    if (label.isEmpty())
      continue;
    if (label.size() > 63)
      return {};
    b.append(char(label.size()));
    b.append(label);
  }
  b.append('\0');
  return b;
}
void record(QByteArray &b, const QString &owner, quint16 type, quint16 cls,
            quint32 ttl, const QByteArray &data) {
  b += name(owner);
  u16(b, type);
  u16(b, cls);
  u32(b, ttl);
  u16(b, quint16(data.size()));
  b += data;
}
// Question names may use backward compression pointers. Bound both offsets and
// hops.
QString decodeName(const QByteArray &b, int &offset) {
  QStringList labels;
  int pos = offset, jumps = 0;
  bool jumped = false;
  while (pos < b.size() && ++jumps < 128) {
    quint8 length = quint8(b[pos++]);
    if (length == 0) {
      if (!jumped)
        offset = pos;
      return labels.join('.').toLower();
    }
    if ((length & 0xc0) == 0xc0) {
      if (pos >= b.size())
        return {};
      int target = ((length & 0x3f) << 8) | quint8(b[pos++]);
      if (target >= pos - 2)
        return {};
      if (!jumped)
        offset = pos;
      jumped = true;
      pos = target;
      continue;
    }
    if (length > 63 || pos + length > b.size())
      return {};
    labels.append(QString::fromUtf8(b.mid(pos, length)));
    pos += length;
  }
  return {};
}
const QString service = "_fundfuneral._tcp.local";
} // namespace
Discovery::Discovery(QObject *parent) : QObject(parent) {
  announce.setInterval(30000);
  connect(&announce, &QTimer::timeout, this, [this] { send(); });
  connect(&socket, &QUdpSocket::readyRead, this, [this] {
    while (socket.hasPendingDatagrams()) {
      auto datagram = socket.receiveDatagram(9000);
      const auto b = datagram.data();
      if (b.size() < 12 || (quint8(b[2]) & 0x80))
        continue;
      int count = (quint8(b[4]) << 8) | quint8(b[5]), offset = 12;
      if (count > 64)
        continue;
      for (int i = 0; i < count; i++) {
        auto query = decodeName(b, offset);
        if (query.isEmpty() || offset + 4 > b.size())
          break;
        offset += 4;
        if (query == service || query == host.toLower() ||
            query == instance.toLower()) {
          send();
          break;
        }
      }
    }
  });
}
bool Discovery::start(const QString &device, quint16 port) {
  stop();
  deviceId = device;
  servicePort = port;
  host = "fund-funeral-" + device.left(12) + ".local";
  instance = "Fund Funeral " + device.left(8) + "." + service;
  if (!socket.bind(QHostAddress::AnyIPv4, 5353,
                   QUdpSocket::ShareAddress | QUdpSocket::ReuseAddressHint))
    return false;
  socket.setSocketOption(QAbstractSocket::MulticastTtlOption, 255);
  for (const auto &iface : QNetworkInterface::allInterfaces()) {
    auto flags = iface.flags();
    if (!(flags & QNetworkInterface::IsUp) ||
        !(flags & QNetworkInterface::IsRunning) ||
        !(flags & QNetworkInterface::CanMulticast) ||
        (flags & QNetworkInterface::IsLoopBack))
      continue;
    auto n = iface.name();
    if (n.startsWith("docker") || n.startsWith("veth") || n.startsWith("br-") ||
        n.startsWith("virbr"))
      continue;
    bool hasV4 = false;
    for (const auto &a : iface.addressEntries())
      if (a.ip().protocol() == QAbstractSocket::IPv4Protocol)
        hasV4 = true;
    if (hasV4 && socket.joinMulticastGroup(QHostAddress("224.0.0.251"), iface))
      interfaces.append(iface);
  }
  if (interfaces.isEmpty()) {
    socket.close();
    return false;
  }
  send();
  announce.start();
  return true;
}
QByteArray Discovery::packet(quint32 ttl) const {
  QList<QHostAddress> addresses;
  for (const auto &iface : interfaces)
    for (const auto &a : iface.addressEntries())
      if (a.ip().protocol() == QAbstractSocket::IPv4Protocol &&
          !addresses.contains(a.ip()))
        addresses.append(a.ip());
  QByteArray b;
  u16(b, 0);
  u16(b, 0x8400);
  u16(b, 0);
  u16(b, quint16(3 + addresses.size()));
  u16(b, 0);
  u16(b, 0);
  record(b, service, 12, 1, ttl, name(instance));
  QByteArray srv;
  u16(srv, 0);
  u16(srv, 0);
  u16(srv, servicePort);
  srv += name(host);
  record(b, instance, 33, 0x8001, ttl, srv);
  auto txt = ("device=" + deviceId).toUtf8();
  QByteArray payload;
  payload.append(char(txt.size()));
  payload += txt;
  record(b, instance, 16, 0x8001, ttl, payload);
  for (const auto &a : addresses) {
    QByteArray ip;
    u32(ip, a.toIPv4Address());
    record(b, host, 1, 0x8001, ttl, ip);
  }
  return b;
}
void Discovery::send(quint32 ttl) {
  if (!servicePort)
    return;
  auto b = packet(ttl);
  for (const auto &iface : interfaces) {
    socket.setMulticastInterface(iface);
    socket.writeDatagram(b, QHostAddress("224.0.0.251"), 5353);
  }
}
void Discovery::stop() {
  announce.stop();
  if (socket.state() == QAbstractSocket::BoundState)
    send(0);
  socket.close();
  interfaces.clear();
  servicePort = 0;
}
