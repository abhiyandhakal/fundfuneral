#include "sync.h"
SyncServer::SyncServer(Engine *e):QTcpServer(e),engine(e){
 auto certPath=e->directory+"/identity.pem", keyPath=e->directory+"/identity.key";
 if(!QFile::exists(certPath)||!QFile::exists(keyPath)){
  QProcess p;p.start("openssl",{"req","-x509","-newkey","rsa:2048","-nodes","-keyout",keyPath,"-out",certPath,"-days","3650","-subj","/CN=Fund Funeral device"});
  if(!p.waitForFinished(30000)||p.exitCode()!=0)throw std::runtime_error("Cannot generate device identity; install openssl");
  QFile::setPermissions(keyPath,QFile::ReadOwner|QFile::WriteOwner);
 }
 QFile cf(certPath),kf(keyPath);cf.open(QIODevice::ReadOnly);kf.open(QIODevice::ReadOnly);certificate=QSslCertificate(cf.readAll());key=QSslKey(kf.readAll(),QSsl::Rsa);
 if(certificate.isNull()||key.isNull())throw std::runtime_error("Invalid device identity");
 expiry.setSingleShot(true);connect(&expiry,&QTimer::timeout,this,&SyncServer::stop);
}
QString SyncServer::fingerprint() const{return QString::fromLatin1(certificate.digest(QCryptographicHash::Sha256).toHex());}
QString SyncServer::start(bool pairing){
 stop();if(!listen(QHostAddress::AnyIPv4,0))throw std::runtime_error(errorString().toStdString());
 secret=pairing?Engine::uuid()+Engine::uuid():QString();expiry.start(5*60*1000);
 QString name=QSysInfo::machineHostName()+" · Fund Funeral";
 advertiser.start("avahi-publish-service",{name,"_fundfuneral._tcp",QString::number(serverPort()),"device="+engine->state()["device"].toString()});
 QString host;for(auto address:QNetworkInterface::allAddresses())if(address.protocol()==QAbstractSocket::IPv4Protocol&&!address.isLoopback()){host=address.toString();break;}
 QJsonObject invite{{"format","fund-funeral-pair"},{"version",1},{"host",host},{"port",serverPort()},{"pin",fingerprint()},{"secret",secret},{"vault",engine->state()["vault"]},{"name",name}};
 emit status(pairing?"Ready to pair for 5 minutes. Enter the invitation on your phone.":"Ready for your phone to sync for 5 minutes.");
 return QString::fromUtf8(QJsonDocument(invite).toJson(QJsonDocument::Compact));
}
void SyncServer::stop(){close();secret.clear();expiry.stop();advertiser.terminate();for(auto *s:std::as_const(sockets))s->disconnectFromHost();emit status("Sync listener stopped");}
void SyncServer::incomingConnection(qintptr descriptor){
 auto *s=new QSslSocket(this);sockets.insert(s);s->setSocketDescriptor(descriptor);s->setLocalCertificate(certificate);s->setPrivateKey(key);s->setProtocol(QSsl::TlsV1_2OrLater);s->setPeerVerifyMode(QSslSocket::QueryPeer);
 // A self-signed peer is accepted only after its exact certificate is pinned below.
 connect(s,&QSslSocket::sslErrors,s,[s](const QList<QSslError>&errors){QList<QSslError> allowed;for(const auto &e:errors)if(e.error()==QSslError::SelfSignedCertificate||e.error()==QSslError::SelfSignedCertificateInChain||e.error()==QSslError::HostNameMismatch)allowed.append(e);s->ignoreSslErrors(allowed);});
 connect(s,&QSslSocket::disconnected,this,[this,s]{sockets.remove(s);s->deleteLater();});
 QTimer::singleShot(30000,s,[s]{s->disconnectFromHost();});
 connect(s,&QSslSocket::readyRead,this,[this,s]{
  QByteArray b=s->property("buffer").toByteArray()+s->readAll();if(b.size()>16*1024*1024){s->abort();return;}
  int line=b.indexOf('\n');if(line<0){s->setProperty("buffer",b);return;}
  if(s->property("handled").toBool()){s->abort();return;}s->setProperty("handled",true);
  QJsonParseError err;auto doc=QJsonDocument::fromJson(b.left(line),&err);if(err.error!=QJsonParseError::NoError||!doc.isObject()){s->abort();return;}
  QString pin=QString::fromLatin1(s->peerCertificate().digest(QCryptographicHash::Sha256).toHex());
  try{if(s->peerCertificate().isNull())throw std::runtime_error("Device certificate required");process(s,doc.object(),pin);}catch(const std::exception &e){s->write(QJsonDocument(QJsonObject{{"error",QString::fromUtf8(e.what())}}).toJson(QJsonDocument::Compact)+'\n');s->disconnectFromHost();emit status("Sync failed: "+QString::fromUtf8(e.what()));}
 });s->startServerEncryption();
}
void SyncServer::process(QSslSocket *s,const QJsonObject &r,const QString &pin){
 auto peers=QJsonDocument::fromJson(engine->setting("peers","{}").toUtf8()).object();
 bool pairing=r["action"]=="pair";
 if(pairing){if(secret.isEmpty()||r["secret"].toString()!=secret)throw std::runtime_error("Pairing invitation expired or invalid");}
 else if(!peers.contains(pin)||peers[pin].toObject()["device"]!=r["device"])throw std::runtime_error("This device is not paired");
 if(r["vault"]!=engine->state()["vault"])throw std::runtime_error("Wrong vault; pair again");
 if(pairing){
  QString device=r["device"].toString();if(QUuid(device).isNull())throw std::runtime_error("Invalid device identity");
  peers[pin]=QJsonObject{{"name",r["name"].toString().left(100)},{"device",device}};engine->setSetting("peers",QString::fromUtf8(QJsonDocument(peers).toJson(QJsonDocument::Compact)));secret.clear();
 }else{engine->save(engine->query("merge",{r["events"]}).toObject());}
 auto outgoing=engine->query("changes",{r["clock"].toObject()});
 QJsonObject response{{"vault",engine->state()["vault"]},{"events",outgoing},{"clock",engine->state()["clock"]},{"device",engine->state()["device"]}};
 auto bytes=QJsonDocument(response).toJson(QJsonDocument::Compact)+'\n';if(bytes.size()>16*1024*1024)throw std::runtime_error("Sync batch exceeds 16 MiB; use backup transfer");
 s->write(bytes);s->disconnectFromHost();engine->setSetting("lastSync",QDateTime::currentDateTime().toString(Qt::ISODate));
 emit status(pairing?"Phone paired. Your records have been sent.":"Sync complete. Both devices have exchanged changes.");
 QTimer::singleShot(1000,this,&SyncServer::stop);
}
