#!/usr/bin/env python3
"""UI smoke flow on the isolated emulator. Never targets a physical device."""
import pathlib,subprocess,xml.etree.ElementTree as ET,re,time,shlex
root=pathlib.Path(__file__).resolve().parents[1];adb=['adb','-s','emulator-5554']
def shell(*args):return subprocess.check_output(adb+['shell',*args],text=True)
def snapshot():
 shell('uiautomator','dump','/sdcard/fund-ui.xml')
 return ET.fromstring(shell('cat','/sdcard/fund-ui.xml'))
def node(label):
 nodes=list(snapshot().iter('node'))
 for n in nodes:
  if n.get('content-desc')==label:return n
 for n in nodes:
  if n.get('text','').casefold()==label.casefold():return n
 return None
def tap(label,scroll=False):
 for _ in range(5 if scroll else 1):
  n=node(label)
  if n is not None:
   x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
   shell('input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(.2);return
  if scroll:shell('input','swipe','540','1200','540','450','350')
 raise RuntimeError('Missing UI control: '+label)
def text(label,value):
 tap(label,True);shell('input','text',shlex.quote(value))
shell('pm','clear','com.fundfuneral');shell('am','start','-W','-n','com.fundfuneral/.MainActivity')
tap('Start new · Add currency');tap('Save',True)
tap('+ Add',True);text('Account name','QA_Cash');text('Opening balance','1000');tap('Save',True)
tap('+ Add',True);text('Amount','12.25');text('Transaction fee','0.25');text('Category','Coffee');tap('Save',True)
assert node('Coffee') is not None,'Saved expense missing'
assert node('987.50') is not None,'Balance with fee is wrong'
subprocess.run(adb+['exec-out','screencap','-p'],stdout=open(root/'docs/screenshots/android.png','wb'),check=True)
shell('am','force-stop','com.fundfuneral');shell('am','start','-W','-n','com.fundfuneral/.MainActivity');assert node('Coffee') is not None,'Expense did not survive restart'
tap('Edit Coffee 12.25',True);tap('Delete transaction',True);tap('Delete');assert node('1000.00') is not None,'Deletion did not restore balance'
print('PASS: release APK currency/account/expense forms, fee balance, restart persistence and deletion through real Android UI')
