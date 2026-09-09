/* Fund Funeral shared domain. Runs unchanged in Hermes, QJSEngine and Node. */
(function (root) {
'use strict';
var LIMIT = 9000000000000; // Conservative exact-integer bound, including aggregate balances.
function fail(message) { throw new Error(message); }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function int(n) { if (typeof n !== 'number' || !Number.isSafeInteger(n) || Math.abs(n) > LIMIT) fail('Money exceeds the supported integer range'); return n; }
function add(a,b) { return int(a+b); }
function digits(n) { if (!Number.isInteger(n) || n<0 || n>4) fail('Currency precision must be 0–4'); return n; }
function parse(text, precision) {
  digits(precision); var s=String(text).trim(), m=/^([+-]?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m || (m[3]||'').length>precision) fail('Enter a valid amount with at most '+precision+' decimal places');
  var whole=m[2].replace(/^0+(?=\d)/,'');
  if (whole.length>13) fail('Amount is too large');
  var fraction=(m[3]||''); while(fraction.length<precision) fraction+='0';
  return int(Number(whole+fraction)*(m[1]==='-'?-1:1));
}
function money(n,p) { int(n); digits(p); var s=String(Math.abs(n)); while(s.length<=p)s='0'+s; return (n<0?'-':'')+(p?s.slice(0,-p)+'.'+s.slice(-p):s); }
function today() { var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function uuid() { fail('A native cryptographically random UUID provider is required'); }
function validId(s) { return typeof s==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(s); }
function name(s,label) { if(typeof s!=='string'||!s.trim()||s.length>200)fail('Enter '+label+' (1–200 characters)'); }
function date(s) { if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s)||isNaN(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)fail('Date must be a valid YYYY-MM-DD'); }
function initial(device,vault) { if(!validId(device)||!validId(vault))fail('Invalid identity'); return {format:'fund-funeral',version:1,device:device,vault:vault,events:[],heads:{},clock:{}}; }
function dominates(a,b) { return Object.keys(b).every(function(k){return (a[k]||0)>=b[k];}); }
function rows(s,kind,deleted) { return Object.keys(s.heads).filter(function(k){return k.indexOf(kind+':')===0;}).map(function(k){return s.heads[k].slice().sort(function(a,b){return a.id.localeCompare(b.id);}).slice(-1)[0];}).filter(function(e){return deleted||!e.deleted;}).map(function(e){var d=copy(e.data);d.id=e.entity;return d;}); }
function get(s,kind,id) { return rows(s,kind).find(function(r){return r.id===id;}); }
function validate(s,kind,d,deleted) {
 if(['currency','account','category','entry'].indexOf(kind)<0||!d||!validId(d.id))fail('Invalid record');
 if(deleted) {
  if(kind==='account'&&rows(s,'entry').some(function(e){return e.account===d.id||e.to===d.id;}))fail('An account with history cannot be deleted');
  if(kind==='currency'&&rows(s,'account').some(function(a){return a.currency===d.id;}))fail('A currency with accounts cannot be deleted');
  return;
 }
 if(kind==='currency') { if(!/^[A-Z]{3,8}$/.test(d.code))fail('Currency code must be 3–8 uppercase letters'); name(d.name,'currency name');digits(d.digits); }
 if(kind==='account') { name(d.name,'account name');if(!get(s,'currency',d.currency))fail('Choose a currency');int(d.opening); }
 if(kind==='category')name(d.name,'category');
 if(kind==='entry') {
  if(['income','expense','transfer','adjustment'].indexOf(d.type)<0)fail('Choose a transaction type');
  var a=get(s,'account',d.account);if(!a)fail('Choose an account');
  int(d.amount);int(d.fee);
  if(d.type!=='adjustment'&&d.amount<=0)fail('Amount must be positive');
  if(d.fee<0)fail('Fee cannot be negative');
  if((d.type==='income'||d.type==='adjustment')&&d.fee!==0)fail('Income and adjustments do not have fees');
  add(d.amount,d.fee);date(d.date);
  if(d.time!==null && (typeof d.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time)))fail('Time must be HH:MM or blank');
  if(typeof d.description!=='string'||d.description.length>4000)fail('Description is too long');
  if(typeof d.category!=='string'||d.category.length>200)fail('Category is too long');
  if(d.type==='transfer') { var b=get(s,'account',d.to);if(!b||b.id===a.id||b.currency!==a.currency)fail('Transfers require two different accounts in the same currency'); }
  else if(d.to!==null)fail('Only transfers have a destination account');
 }
}
function index(s,e) { var key=e.kind+':'+e.entity, heads=s.heads[key]||[];
 if(heads.some(function(h){return dominates(h.vector,e.vector);}))return;
 s.heads[key]=heads.filter(function(h){return !dominates(e.vector,h.vector);}).concat([e]);
}
function check(s) {
 ['currency','account','category','entry'].forEach(function(kind){rows(s,kind).forEach(function(r){validate(s,kind,r,false);});});
 rows(s,'account').forEach(function(a){balance(s,a.id);});
 rows(s,'currency').forEach(function(c){var n=0;rows(s,'account').filter(function(a){return a.currency===c.id;}).forEach(function(a){n=add(n,balance(s,a.id));});});
}
function mutate(s,kind,data,deleted,id) {
 var n=copy(s),d=copy(data);validate(n,kind,d,!!deleted);
 var current=get(s,kind,d.id);
 if(current&&kind==='account'&&current.currency!==d.currency)fail('An account currency cannot be changed');
 if(current&&kind==='currency'&&current.digits!==d.digits)fail('Currency precision cannot be changed');
 var vector=copy(n.clock),seq=(vector[n.device]||0)+1;vector[n.device]=seq;
 if(!validId(id))fail('Invalid change ID');
 var e={id:id,origin:n.device,seq:seq,vector:vector,kind:kind,entity:d.id,data:d,deleted:!!deleted,at:new Date().toISOString()};
 n.events.push(e);n.clock=vector;index(n,e);check(n);return n;
}
function merge(s,events) {
 if(!Array.isArray(events)||events.length>100000)fail('Invalid change batch');
 var n=copy(s),known={},pending=[];n.events.forEach(function(e){known[e.id]=JSON.stringify(e);});
 events.forEach(function(e){
  if(!e||!validId(e.id)||!validId(e.origin)||!validId(e.entity)||!Number.isSafeInteger(e.seq)||e.seq<1||!e.vector||Array.isArray(e.vector)||e.vector[e.origin]!==e.seq||typeof e.deleted!=='boolean'||!e.data||e.data.id!==e.entity)fail('Malformed change');
  Object.keys(e.vector).forEach(function(k){if(!validId(k)||!Number.isSafeInteger(e.vector[k])||e.vector[k]<0)fail('Invalid change clock');});
  if(known[e.id]){if(known[e.id]!==JSON.stringify(e))fail('Change ID collision');return;}
  known[e.id]=JSON.stringify(e);pending.push(copy(e));
 });
 while(pending.length){var progress=false;
  pending=pending.filter(function(e){
   if(e.seq<=(n.clock[e.origin]||0))fail('Conflicting origin sequence');
   var deps=copy(e.vector);deps[e.origin]--;
   if(!dominates(n.clock,deps))return true;
   // Validate payloads even if a newer head later hides them.
   validate(n,e.kind,e.data,false);
   var old=get(n,e.kind,e.entity);
   if(old&&e.kind==='account'&&old.currency!==e.data.currency)fail('Account currency changed');
   if(old&&e.kind==='currency'&&old.digits!==e.data.digits)fail('Currency precision changed');
   n.events.push(e);n.clock[e.origin]=e.seq;index(n,e);progress=true;return false;
  });
  if(!progress)fail('Missing causal changes');
 }
 check(n);return n;
}
function changes(s,clock) { if(!clock||typeof clock!=='object')fail('Invalid sync cursor');Object.keys(clock).forEach(function(k){if(!validId(k)||!Number.isSafeInteger(clock[k])||clock[k]<0)fail('Invalid sync cursor');});return s.events.filter(function(e){return e.seq>(clock[e.origin]||0);}); }
function conflicts(s) { return Object.keys(s.heads).filter(function(k){return s.heads[k].length>1;}).map(function(k){return {key:k,versions:copy(s.heads[k])};}); }
function resolve(s,key,eventId,id) { var h=s.heads[key]||[],e=h.find(function(x){return x.id===eventId;});if(!e)fail('Conflict version no longer exists');return mutate(s,e.kind,e.data,e.deleted,id); }
function balance(s,id) { var a=get(s,'account',id);if(!a)fail('Unknown account');var n=a.opening;
 rows(s,'entry').forEach(function(e){if(e.account===id){n=add(n,e.type==='expense'||e.type==='transfer'?-add(e.amount,e.fee):e.amount);}if(e.type==='transfer'&&e.to===id)n=add(n,e.amount);});return n; }
function summary(s,currency,month) { var r={balance:0,income:0,expense:0,fees:0,adjustment:0,net:0};
 rows(s,'account').filter(function(a){return a.currency===currency;}).forEach(function(a){r.balance=add(r.balance,balance(s,a.id));});
 rows(s,'entry').filter(function(e){return get(s,'account',e.account).currency===currency&&e.date.slice(0,7)===month;}).forEach(function(e){if(e.type==='income'||e.type==='expense'||e.type==='adjustment')r[e.type]=add(r[e.type],e.amount);r.fees=add(r.fees,e.fee);});r.net=add(add(r.income,-r.expense),-r.fees);return r; }
function history(s,f) { f=f||{};return rows(s,'entry').filter(function(e){var a=get(s,'account',e.account);return (!f.currency||a.currency===f.currency)&&(!f.account||e.account===f.account||e.to===f.account)&&(!f.type||e.type===f.type)&&(!f.category||e.category===f.category)&&(!f.from||e.date>=f.from)&&(!f.until||e.date<=f.until)&&(f.min===undefined||e.amount>=f.min)&&(f.max===undefined||e.amount<=f.max)&&(!f.text||(e.description+' '+e.category+' '+a.name).toLowerCase().indexOf(f.text.toLowerCase())>=0);}).sort(function(a,b){return (b.date+(b.time||'')).localeCompare(a.date+(a.time||''))||a.id.localeCompare(b.id);}); }
function csvParse(text) { if(typeof text!=='string'||text.length>16*1024*1024)fail('CSV is too large');text=text.replace(/^\uFEFF/,'');var rows=[],row=[],field='',quoted=false,after=false;
 for(var i=0;i<text.length;i++){var c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;after=true;}}else field+=c;}else if(c==='"'){if(field||after)fail('Invalid CSV quote');quoted=true;}else if(c===','){row.push(field);field='';after=false;}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(function(x){return x!=='';}))rows.push(row);row=[];field='';after=false;}else{if(after)fail('Unexpected text after CSV quote');field+=c;}}
 if(quoted)fail('Unclosed CSV quote');if(field||row.length){row.push(field);rows.push(row);}if(!rows.length)fail('CSV is empty');var headers=rows.shift();if(new Set(headers).size!==headers.length)fail('CSV headers must be unique');return {headers:headers,rows:rows}; }
function csvCell(v) { var s=String(v===null?'':v);if(/^[=+@\t\r]/.test(s)||/^-[^0-9]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'; }
function csvExport(s,f) { var headers=['id','type','date','time','currency','account','to_account','category','amount','fee','description'];return headers.join(',')+'\r\n'+history(s,f).map(function(e){var a=get(s,'account',e.account),c=get(s,'currency',a.currency);return [e.id,e.type,e.date,e.time,c.code,a.name,e.to?get(s,'account',e.to).name:'',e.category,money(e.amount,c.digits),money(e.fee,c.digits),e.description].map(csvCell).join(',');}).join('\r\n')+'\r\n'; }
function preview(s,text,mapping,account,newId) {
 var parsed=csvParse(text),a=get(s,'account',account);if(!a)fail('Choose an import account');var c=get(s,'currency',a.currency),seen={};
 function fingerprint(e){return [e.type,e.account,e.to,e.date,e.amount,e.fee,e.description.trim().toLowerCase()].join('|');}
 rows(s,'entry').forEach(function(e){seen[fingerprint(e)]=true;});
 return parsed.rows.map(function(row,i){var result={line:i+2,duplicate:false,error:null,entry:null};try{
  if(row.length!==parsed.headers.length)fail('Wrong number of columns');
  function val(k){var col=mapping[k];return col===undefined||col===''?'':String(row[parsed.headers.indexOf(col)]||'').trim();}
  var type=val('type')||'expense',amount=val('amount');if(mapping.debit||mapping.credit){var debit=val('debit'),credit=val('credit');var dv=debit?parse(debit,c.digits):0,cv=credit?parse(credit,c.digits):0;if(dv<0||cv<0||(dv!==0&&cv!==0)||(!dv&&!cv))fail('Expected exactly one positive debit or credit');type=dv?'expense':'income';amount=dv?debit:credit;}
  var dest=null;if(type==='transfer'){var matches=rows(s,'account').filter(function(x){return x.currency===a.currency&&x.name===val('to_account');});if(matches.length!==1)fail('Transfer destination must match one account');dest=matches[0].id;}
  var e={id:newId(),type:type,account:account,to:dest,amount:parse(amount,c.digits),fee:parse(val('fee')||'0',c.digits),date:val('date'),time:val('time')||null,description:val('description'),category:val('category')};
  validate(s,'entry',e,false);result.duplicate=!!seen[fingerprint(e)];seen[fingerprint(e)]=true;result.entry=e;
 }catch(err){result.error=err.message;}return result;});
}
function importRows(s,previewRows,includeDuplicates,newId) { var n=s;previewRows.forEach(function(r){if(r.error)fail('Fix invalid rows before importing');if(!r.duplicate||includeDuplicates)n=mutate(n,'entry',r.entry,false,newId());});return n; }
function backup(s) { return JSON.stringify({format:s.format,version:s.version,vault:s.vault,events:s.events},null,2); }
function restore(text,device,newVault) { var b=JSON.parse(text);if(b.format!=='fund-funeral'||b.version!==1||!validId(b.vault))fail('Unsupported backup format');return merge(initial(device,newVault),b.events); }
var api={LIMIT:LIMIT,parse:parse,money:money,today:today,initial:initial,rows:rows,get:get,mutate:mutate,merge:merge,changes:changes,conflicts:conflicts,resolve:resolve,balance:balance,summary:summary,history:history,csvParse:csvParse,csvExport:csvExport,preview:preview,previewIds:function(s,t,m,a,ids){return preview(s,t,m,a,function(){return ids.shift();});},importRows:importRows,importRowsIds:function(s,r,d,ids){return importRows(s,r,d,function(){return ids.shift();});},backup:backup,restore:restore};
if(typeof module!=='undefined')module.exports=api;else root.Ledger=api;
})(this);
