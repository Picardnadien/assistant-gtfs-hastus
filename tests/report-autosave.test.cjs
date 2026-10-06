const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({setTimeout,clearTimeout,Date});vm.runInContext(fs.readFileSync('report-editor.js','utf8'),ctx);
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
  let content='original',modified=1,value='v1',writes=0,active=0,maxActive=0,fail=false,gate=null,aborted=0;
  let timer=null,saved=[],states=[];
  const handle={name:'working.html',async getFile(){return {size:content.length,lastModified:modified};},async createWritable(){
    active++;maxActive=Math.max(active,maxActive);let next;
    return {async write(text){writes++;if(gate)await gate.promise;if(fail)throw Error('disk full');next=text;},async close(){content=next;modified++;active--;},async abort(){aborted++;active--;}};
  }};
  const saver=ctx.reportFileSaver({snapshot:()=>value,onSaved:(at,revision)=>saved.push(revision),onState:s=>states.push(s),schedule:fn=>{timer=fn;return 1;},cancel:()=>{timer=null;}});
  return {saver,handle,states,saved,edit(v){value=v;saver.changed();},external(){content='external';modified++;},setFail(v){fail=v;},setGate(v){gate=v;},tick(){const fn=timer;timer=null;return fn?.();},get content(){return content;},get writes(){return writes;},get maxActive(){return maxActive;},get aborted(){return aborted;},get timer(){return timer;}};
}
(async()=>{
  let f=fixture();f.edit('a');assert.equal(f.writes,0);assert.equal(f.timer,null,'No writes before consent');
  assert.equal(await f.saver.connect(f.handle),true);assert.equal(f.content,'a');assert.equal(f.saved[0],1);
  f.edit('b');f.edit('c');assert.ok(f.timer);f.tick();await f.saver.save();assert.equal(f.content,'c');assert.equal(f.writes,2);
  const gate=defer();f.setGate(gate);f.edit('d');const writing=f.saver.save();await new Promise(r=>setImmediate(r));f.edit('e');gate.resolve();await writing;
  assert.equal(f.content,'d');assert.ok(f.saver.state.revision>f.saver.state.savedRevision,'An in-flight edit remains pending');
  f.setGate(null);await f.saver.save();assert.equal(f.content,'e');assert.equal(f.maxActive,1);
  f.saver.pause();f.edit('paused');assert.equal(f.timer,null);await f.saver.save(true);assert.equal(f.content,'paused');assert.equal(f.saver.state.enabled,false);
  f.saver.resume();f.edit('error');f.setFail(true);assert.equal(await f.saver.save(),false);assert.equal(f.content,'paused');assert.equal(f.aborted,1);assert.equal(f.saver.state.enabled,false);assert.ok(f.saver.state.revision>f.saver.state.savedRevision);
  f.setFail(false);assert.equal(await f.saver.save(true),true);assert.equal(f.content,'error');
  f.external();f.edit('do not overwrite');assert.equal(await f.saver.save(),false);assert.equal(f.content,'external');assert.equal(f.saver.state.error.message,'externalChange');
  f=fixture();f.edit('latest');const fileGate=defer(),originalGet=f.handle.getFile;let calls=0;
  f.handle.getFile=async()=>{calls++;if(calls===2)await fileGate.promise;return originalGet();};
  const connect=f.saver.connect(f.handle);await new Promise(r=>setImmediate(r));f.edit('while opening');fileGate.resolve();await connect;
  assert.equal(f.content,'while opening');assert.equal(f.saver.state.savedRevision,f.saver.state.revision);
  const source=fs.readFileSync('report-editor.js','utf8');
  assert.ok(source.includes("clone.querySelector('#client-autosave-controls')?.remove()"));
  assert.ok(source.includes('exportEdits=JSON.parse(JSON.stringify(edits))'));
  assert.ok(source.includes("reportPayloadWorker(data,exportEdits,'zip')"));
  assert.ok(source.includes("fileSaver.state.revision===revision"));
  console.log('PASS: explicit consent, debounce, serialized writes, concurrent edits, pause/resume, failed-write abort/retry, external change protection, pending revisions and ZIP snapshots.');
})().catch(e=>{console.error(e);process.exitCode=1;});
