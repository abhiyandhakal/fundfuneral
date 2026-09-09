#!/usr/bin/env python3
"""Exercise the actual Qt TLS listener using an independent TLS client."""
import hashlib,json,os,pathlib,ssl,subprocess,tempfile,time,uuid
root=pathlib.Path(__file__).resolve().parents[1]
def check(value,message):
    if not value: raise AssertionError(message)
with tempfile.TemporaryDirectory(prefix='fund-sync-') as tmp:
    tmp=pathlib.Path(tmp);key=tmp/'client.key';cert=tmp/'client.pem'
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=Test phone'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT);context.check_hostname=False;context.verify_mode=ssl.CERT_NONE;context.load_cert_chain(cert,key)
    context.minimum_version=context.maximum_version=ssl.TLSVersion.TLSv1_2
    device=str(uuid.uuid4())
    def start(paired=False,vault_path=None):
        invite=tmp/'invite.json';invite.unlink(missing_ok=True)
        p=subprocess.Popen([str(root/'build/fund-funeral'),'--data-dir',str(vault_path or tmp/'vault'),'--test-listen',str(invite)]+(['--paired-only'] if paired else []),env={**os.environ,'QT_QPA_PLATFORM':'offscreen'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(100):
            if invite.exists():return p,json.loads(invite.read_text())
            if p.poll() is not None:raise RuntimeError('Listener exited')
            time.sleep(.05)
        p.terminate();raise RuntimeError('Listener startup timeout')
    def exchange(i,request,ctx=context):
        import socket
        with socket.create_connection(('127.0.0.1',i['port']),timeout=5) as raw:
            with ctx.wrap_socket(raw,server_hostname='Fund Funeral') as s:
                check(hashlib.sha256(s.getpeercert(binary_form=True)).hexdigest()==i['pin'],'Wrong certificate')
                s.sendall(json.dumps(request).encode()+b'\n');return json.loads(s.makefile('rb').readline())
    p,i=start()
    try:
        request={'action':'pair','secret':'wrong','device':device,'name':'Test phone','vault':i['vault'],'clock':{}}
        check('error' in exchange(i,request),'Unauthorized pairing accepted')
        request['secret']=i['secret'];response=exchange(i,request);check('error' not in response,'Pairing failed: '+str(response));check(response['events']==[],'Expected empty vault')
    finally:p.terminate();p.wait(timeout=5)
    p,i=start(True)
    try:
        event={'id':str(uuid.uuid4()),'origin':device,'seq':1,'vector':{device:1},'kind':'currency','entity':'npr','data':{'id':'npr','code':'NPR','name':'Nepalese rupee','digits':2},'deleted':False,'at':'2026-09-09T00:00:00Z'}
        request={'action':'sync','device':device,'vault':i['vault'],'clock':{device:1},'events':[event]}
        response=exchange(i,request);check('error' not in response,'Sync failed: '+str(response));check(response['clock'][device]==1,'Change not committed')
    finally:p.terminate();p.wait(timeout=5)
    p,i=start(True)
    try:
        response=exchange(i,request);check('error' not in response,'Retry failed');check(response['events']==[],'Retry not idempotent')
    finally:p.terminate();p.wait(timeout=5)
    p,i=start(True)
    try:
        request['device']=str(uuid.uuid4());check('error' in exchange(i,request),'Mismatched device accepted')
    finally:p.terminate();p.wait(timeout=5)
    p,i=start(vault_path=tmp/'empty-desktop')
    try:
        phone_vault=str(uuid.uuid4())
        request={'action':'pair','secret':i['secret'],'device':device,'name':'Phone with records','vault':phone_vault,'clock':{device:1},'events':[event]}
        response=exchange(i,request);check('error' not in response,'Phone-first pairing failed: '+str(response));check(response['vault']==phone_vault,'Desktop did not adopt phone vault');check(response['clock'][device]==1,'Phone records missing')
    finally:p.terminate();p.wait(timeout=5)
print('PASS: real mutual TLS pairing, unauthorized rejection, delta commit, restart/retry, device identity binding')
