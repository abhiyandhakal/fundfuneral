#!/usr/bin/env python3
"""Run test-owned Android storage/TLS checks against a temporary desktop vault."""
import json,os,pathlib,shlex,subprocess,tempfile,time,sys
root=pathlib.Path(__file__).resolve().parents[1]
serial=sys.argv[1] if len(sys.argv)>1 else '001481558003740'
adb=['adb','-s',serial]
subprocess.run(adb+['install','-r',str(root/'dist/fund-funeral-1.0.0-android.apk')],check=True)
subprocess.run(adb+['install','-r',str(root/'mobile/android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk')],check=True)
with tempfile.TemporaryDirectory(prefix='fund-android-native-') as tmp:
    path=pathlib.Path(tmp);invite=path/'invitation.json'
    proc=subprocess.Popen([str(root/'build/fund-funeral'),'--data-dir',str(path/'vault'),'--test-listen',str(invite)],env={**os.environ,'QT_QPA_PLATFORM':'offscreen'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            if invite.exists():break
            time.sleep(.05)
        i=json.loads(invite.read_text())
        if serial.startswith('emulator-'):i['host']='10.0.2.2'
        result=subprocess.run(adb+['shell','am','instrument','-w','-e','invitation',shlex.quote(json.dumps(i,separators=(',',':'))),'com.fundfuneral.test/androidx.test.runner.AndroidJUnitRunner'],text=True,capture_output=True,timeout=60)
        print(result.stdout)
        if 'OK (1 test)' not in result.stdout:raise RuntimeError('Android native integration test failed: '+result.stderr)
    finally:proc.terminate();proc.wait(timeout=5)
print('PASS: signed APK native SQLite persistence and Android Keystore mutual TLS on '+serial)
