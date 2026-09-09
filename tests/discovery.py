#!/usr/bin/env python3
"""Independent DNS-SD resolution test. Requires the test-only zeroconf package."""
import json,os,pathlib,subprocess,tempfile,time
from zeroconf import Zeroconf,ServiceBrowser,ServiceListener,IPVersion
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='fund-mdns-') as tmp:
    path=pathlib.Path(tmp);invite=path/'invite.json'
    zc=Zeroconf(ip_version=IPVersion.V4Only)
    found=[]
    class Listener(ServiceListener):
        def add_service(self,z,t,n):
            info=z.get_service_info(t,n,timeout=3000)
            if info:found.append(info)
        def update_service(self,z,t,n):self.add_service(z,t,n)
        def remove_service(self,z,t,n):pass
    browser=ServiceBrowser(zc,'_fundfuneral._tcp.local.',Listener())
    p=subprocess.Popen([os.environ.get('FUND_FUNERAL_BINARY',str(root/'build/fund-funeral')),'--data-dir',str(path/'vault'),'--test-listen',str(invite)],env={**os.environ,'QT_QPA_PLATFORM':'offscreen'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            if found and invite.exists():break
            time.sleep(.1)
        expected=json.loads(invite.read_text())
        assert any(i.port==expected['port'] and i.properties.get(b'device') and i.parsed_addresses() for i in found), 'DNS-SD service was not resolved'
        print('PASS: independent DNS-SD client resolves service, TCP port, device identity and IPv4 address')
    finally:p.terminate();p.wait(timeout=5);browser.cancel();zc.close()
