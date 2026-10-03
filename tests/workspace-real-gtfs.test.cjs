// Optional read-only check of a local, extracted GTFS. Generated save stays in
// an isolated OS temp directory, never alongside the client's source files.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const directory=process.argv[2];if(!directory)throw new Error('Pass an extracted GTFS directory');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({TextDecoder,setTimeout,console,document:{},window:{}});
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0],context);
vm.runInContext(fs.readFileSync(path.join(root,'workspace-storage.js'),'utf8'),context);
function digest(snapshot){
  const hashes={};
  for(const [name,table] of Object.entries(snapshot.parsed)){
    const hash=crypto.createHash('sha256');hash.update(JSON.stringify(table.headers));
    for(const row of table.rows)hash.update(JSON.stringify(row)+'\n');
    hashes[name]={rows:table.rows.length,sha:hash.digest('hex')};
  }
  hashes.originals=Array.from(snapshot.originalEntries,entry=>({name:entry.name,sha:crypto.createHash('sha256').update(entry.text).digest('hex')}));
  return hashes;
}
(async()=>{
  const keys=vm.runInContext('GTFS_FILE_KEYS',context),started=Date.now();
  let snapshot={version:9,parsed:{},originalEntries:[],settings:{placeCodeMaxLength:8,placeCodeCase:'lower',placeReportLanguage:'en'}};
  for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.txt'))){
    const text=fs.readFileSync(path.join(directory,name),'utf8');
    snapshot.originalEntries.push({name,text});
    if(keys[name]){snapshot.parsed[keys[name]]=context.parseCSV(text);console.log(name,snapshot.parsed[keys[name]].rows.length,'rows');}
  }
  snapshot.gtfsStops=snapshot.parsed.stops.rows;snapshot.geographicCache={gtfsStops:snapshot.gtfsStops};
  const expected=digest(snapshot),temp=fs.mkdtempSync(path.join(os.tmpdir(),'hastus-workspace-test-'));
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));
  const target=path.join(temp,'state.json');
  try{
    const handle={async getFileHandle(){return {async createWritable(){
      const file=await fs.promises.open(target,'w');return {write:text=>file.write(text),close:()=>file.close(),abort:()=>file.close()};
    }};}};
    await context.saveChunkedWorkspace(handle,'state.json',snapshot);
    snapshot=null;if(global.gc)global.gc();
    const restored=await context.readChunkedWorkspace(await fs.openAsBlob(target));
    assert.deepEqual(digest(restored),expected);
    assert.equal(restored.gtfsStops,restored.geographicCache.gtfsStops);
    assert.equal(restored.settings.placeCodeMaxLength,8);
    console.log(`PASS real GTFS: every row and original file preserved; ${fs.statSync(target).size} saved bytes; ${Date.now()-started} ms`);
  }finally{fs.rmSync(target,{force:true});fs.rmdirSync(temp);}
})().catch(error=>{console.error(error);process.exitCode=1;});
