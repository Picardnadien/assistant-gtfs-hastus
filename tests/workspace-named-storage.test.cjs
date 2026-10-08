const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const files=new Map(),removed=[];let fail='';
const folder={
  async getFileHandle(name,{create=false}={}){
    if(!files.has(name)&&!create)throw Object.assign(new Error('Not found'),{name:'NotFoundError'});
    return {getFile:async()=>new Blob([files.get(name)]),createWritable:async()=>{
      let chunks=[];return {write:async value=>{if(fail===name)throw new Error('disk full');chunks.push(value);},close:async()=>files.set(name,chunks.join('')),abort:async()=>{chunks=[];}};
    }};
  },
  async removeEntry(name){removed.push(name);files.delete(name);}
};
const context=vm.createContext({console,TextDecoder,setTimeout});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../workspace-storage.js'),'utf8'),context);
(async()=>{
  const entry='.hastus-workspace.json',first='GTFS_HASTUS_OC_Transpo_20261007_101112.json',second='GTFS_HASTUS_OC_Transpo_20261007_111213.json',snapshot={savedAt:'2026-10-07T14:11:12Z',parsed:{stops:{rows:[{stop_id:'5520'}]}}};
  files.set(entry,JSON.stringify(snapshot));
  assert.equal((await context.readNamedWorkspace(folder,entry)).snapshot.parsed.stops.rows[0].stop_id,'5520');
  await context.saveNamedWorkspace(folder,entry,first,snapshot);
  assert.equal(JSON.parse(files.get(entry)).filename,first);
  assert.equal((await context.readNamedWorkspace(folder,entry)).snapshot.savedAt,snapshot.savedAt);
  fail=second;
  await assert.rejects(context.saveNamedWorkspace(folder,entry,second,snapshot),/disk full/);
  assert.equal(JSON.parse(files.get(entry)).filename,first);assert.ok(files.has(first));
  fail=entry;
  await assert.rejects(context.saveNamedWorkspace(folder,entry,second,snapshot),/disk full/);
  assert.equal(JSON.parse(files.get(entry)).filename,first);assert.ok(files.has(first));
  fail='';await context.saveNamedWorkspace(folder,entry,second,snapshot);
  assert.deepEqual(removed,[first]);assert.ok(files.has(second));
  await context.saveNamedWorkspace(folder,entry,second,snapshot);assert.deepEqual(removed,[first],'Same-second save must not delete itself');
  files.set(entry,JSON.stringify({format:'hastus-workspace-pointer',filename:'../private.json'}));
  await assert.rejects(context.readNamedWorkspace(folder,entry),/Invalid/);
  assert.equal((await context.readChunkedWorkspace(new Blob([files.get(second)]))).parsed.stops.rows[0].stop_id,'5520');
  console.log('PASS: named snapshots, legacy migration, transactional manifest, safe rotation, path validation');
})().catch(error=>{console.error(error);process.exitCode=1;});
