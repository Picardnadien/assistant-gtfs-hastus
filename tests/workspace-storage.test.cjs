const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let largestRecord=0;
const context=vm.createContext({TextDecoder,setTimeout,JSON:{parse:JSON.parse,stringify(value){
  const text=JSON.stringify(value);largestRecord=Math.max(largestRecord,text.length);
  assert.ok(text.length<220000,'Only bounded records may be stringified');return text;
}}});
vm.runInContext(fs.readFileSync(path.join(root,'workspace-storage.js'),'utf8'),context);
function directory(failAt=Infinity){
  let saved=new Blob(['previous good save']),writes=0,aborted=false;
  return {get saved(){return saved;},get aborted(){return aborted;},async getFileHandle(){return {
    async createWritable(){const chunks=[];return {
      async write(text){if(++writes===failAt)throw new Error('disk full');chunks.push(text);},
      async close(){saved=new Blob(chunks);},async abort(){aborted=true;}
    };}
  };}};
}
async function roundtrip(snapshot){
  const dir=directory();await context.saveChunkedWorkspace(dir,'state.json',snapshot);
  const loaded=await context.readChunkedWorkspace(dir.saved);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded)),JSON.parse(JSON.stringify(snapshot)));
  return {loaded,file:dir.saved};
}
(async()=>{
  const rows=Array.from({length:35000},(_,i)=>({stop_id:String(i),stop_name:'École / Main\n"Street" 🚍',lat:45.42,empty:'',flag:false}));
  const snapshot={version:9,parsed:{stops:{headers:['stop_id','stop_name'],rows}},originalEntries:[{name:'stops.txt',text:'é🚍\r\n\u0000'.repeat(80000)}],
    geographicCache:{gtfsStops:rows},gtfsStops:rows,settings:{language:'en',maxLength:8},misc:[null,{},[],0,false],groups:[{code:'TEST',items:[rows[0]]}]};
  const {loaded,file}=await roundtrip(snapshot);
  assert.equal(loaded.gtfsStops,loaded.parsed.stops.rows,'Repeated tables use shared references');
  assert.equal(loaded.geographicCache.gtfsStops,loaded.gtfsStops);
  const valid=JSON.parse(await file.text());assert.equal(valid.format,'hastus-workspace-chunks');
  for(const failAt of [1,2,4]){
    const dir=directory(failAt);await assert.rejects(context.saveChunkedWorkspace(dir,'state.json',snapshot),/disk full/);
    assert.equal(await dir.saved.text(),'previous good save');assert.equal(dir.aborted,true);
  }
  await assert.rejects(context.readChunkedWorkspace(file.slice(0,file.size-5)),/incomplète|JSON/);
  const legacy={version:9,parsed:{stops:{rows:[]},times:{rows:[]}},settings:{language:'fr'}};
  assert.deepEqual(JSON.parse(JSON.stringify(await context.readChunkedWorkspace(new Blob([JSON.stringify(legacy,null,2)])))),legacy);
  const dangerous=JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
  await roundtrip(dangerous);assert.equal({}.polluted,undefined);
  console.log(`Workspace: roundtrip, bounded records (${largestRecord} chars max), shared tables, legacy, truncation and atomic abort OK`);
  if(process.argv[2]){
    const started=Date.now(),snapshot=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    const {file}=await roundtrip(snapshot);
    console.log(`Real workspace: ${file.size} bytes, ${Date.now()-started} ms, complete roundtrip OK`);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
