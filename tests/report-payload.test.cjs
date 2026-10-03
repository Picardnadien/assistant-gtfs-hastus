const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ctx=vm.createContext({Blob,Response,ReadableStream,CompressionStream,DecompressionStream,TextEncoder,setTimeout,btoa,atob});
for(const file of ['report-payload.js','report-package.js','report-editor.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
async function main(){
 const template=fs.readFileSync(path.join(root,'tmp/report-editor-8-en.html'),'utf8'),data=JSON.parse(template.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 const packed=await ctx.reportPayloadTools().pack(data),expanded=await ctx.reportPayloadTools().expand(packed);
 assert.equal(JSON.stringify(expanded.gtfs.times),JSON.stringify(data.gtfs.times));
 assert.equal(JSON.stringify(expanded.gtfs.archiveEntries),JSON.stringify(data.gtfs.archiveEntries));
 assert.equal(packed.gtfs.times.rows.length,0);assert.ok(packed.gtfs.times.packedCsv);
 assert.equal(ctx.reportPackageTools().availability(packed).ready,true);
 const edits={places:[{key:data.places[0].key,code:'EDIT',description:'Edited name'}],assignments:{}};
 assert.deepEqual(Array.from(ctx.reportEditorEngine(packed,edits,false,true).errors),[]);
 assert.throws(()=>ctx.reportEditorEngine(packed,edits),/expanded/);
 assert.equal(ctx.reportEditorEngine(expanded,edits,true,true).times,ctx.reportEditorEngine(data,edits,true,true).times);
 const broken=JSON.parse(JSON.stringify(packed));broken.gtfs.times.stopIds.push('missing');
 assert.ok(ctx.reportEditorEngine(broken,{},false,true).errors.includes('brokenReferences'));
 const html=template.replace(/(<script id="report-data" type="application\/json">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(packed).replaceAll('<','\\u003c')+b);
 fs.writeFileSync(path.join(root,'tmp/report-editor-compressed.html'),html);
 const large={...data,gtfs:{...data.gtfs,times:{headers:data.gtfs.times.headers,rows:Array.from({length:100000},(_,i)=>({...data.gtfs.times.rows[i%data.gtfs.times.rows.length]}))}}};
 const start=Date.now(),small=await ctx.reportPayloadTools().pack(large),rawBytes=JSON.stringify(large).length,packedBytes=JSON.stringify(small).length;
 assert.ok(packedBytes<rawBytes/10);assert.equal((await ctx.reportPayloadTools().expand(small)).gtfs.times.rows.length,100000);
 console.log('PASS: lossless CSV/GTFS compression, deferred validation/export, 100000 rows; '+rawBytes+' -> '+packedBytes+' bytes in '+(Date.now()-start)+' ms.');
 if(process.argv[2]){
   const snapshot=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
   const gtfs={stops:snapshot.parsed.stops,times:snapshot.parsed.times,archiveEntries:snapshot.originalEntries.filter(entry=>!/^(stops|stop_times)\.txt$/i.test(entry.name))};
   assert.ok(gtfs.stops&&gtfs.times);
   const realStart=Date.now(),real=await ctx.reportPayloadTools().pack({gtfs}),round=await ctx.reportPayloadTools().expand(real);
   assert.equal(JSON.stringify(round.gtfs.times),JSON.stringify(gtfs.times));
   assert.equal(JSON.stringify(round.gtfs.archiveEntries),JSON.stringify(gtfs.archiveEntries));
   console.log('PASS real workspace: '+gtfs.times.rows.length+' stop_times; '+JSON.stringify({gtfs}).length+' -> '+JSON.stringify(real).length+' bytes; '+(Date.now()-realStart)+' ms; all times and source files unchanged.');
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
