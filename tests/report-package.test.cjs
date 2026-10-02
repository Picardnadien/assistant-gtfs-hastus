const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context=vm.createContext({TextEncoder});
vm.runInContext(fs.readFileSync(path.join(root,'report-package.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'report-editor.js'),'utf8'),context);
const tools=context.reportPackageTools(),engine=context.reportEditorEngine;
const original={
  'agency.txt':'agency_id,agency_name,agency_url,agency_timezone\r\na,Client test,https://example.com,America/Toronto\r\n',
  'stops.txt':'stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\r\n001,First stop,47.5,-52.7,0,AAA\r\n002,Second stop,47.6,-52.8,0,BBB\r\nAAA,First place,47.5,-52.7,1,\r\nBBB,Second place,47.6,-52.8,1,\r\n',
  'stop_times.txt':'trip_id,stop_id,arrival_time,departure_time,stop_sequence\r\nt,001,25:00:00,25:00:00,1\r\nt,002,25:10:00,25:10:00,2\r\n',
  'routes.txt':'route_id,agency_id,route_short_name,route_long_name,route_type\r\nr,a,1,Test,3\r\n',
  'trips.txt':'route_id,service_id,trip_id,shape_id\r\nr,s,t,shape\r\n',
  'calendar_dates.txt':'service_id,date,exception_type\r\ns,20261002,1\r\n',
  'shapes.txt':'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\r\nshape,47.5,-52.7,1\r\nshape,47.6,-52.8,2\r\n',
  'transfers.txt':'from_stop_id,to_stop_id,transfer_type,min_transfer_time\r\nAAA,BBB,2,120\r\n',
  'pathways.txt':'pathway_id,from_stop_id,to_stop_id,pathway_mode,is_bidirectional\r\np,001,002,1,1\r\n',
  'translations.txt':'table_name,field_name,language,translation,record_id\r\nstops,stop_name,fr,Premier lieu,AAA\r\n',
  'locations.geojson':'{"type":"FeatureCollection","features":[],"description":"Été"}\n',
  'feed_info.txt':'feed_publisher_name,feed_publisher_url,feed_lang\r\nTest,https://example.com,en\r\n'
};
const data={language:'fr',filename:'Client_test',placeCodeMaxLength:8,
  places:[{key:'a',code:'AAA',originalCode:'AAA',description:'First place',exportId:'AAA'},{key:'b',code:'BBB',originalCode:'BBB',description:'Second place',exportId:'BBB'}],
  points:[{id:'001',description:'First stop'},{id:'002',description:'Second stop'}],assignments:{'001':'a','002':'b'},
  gtfs:{stops:tools.parse(original['stops.txt']),times:tools.parse(original['stop_times.txt']),sourceFileNames:Object.keys(original),
    archiveEntries:Object.entries(original).filter(([name])=>!['stops.txt','stop_times.txt'].includes(name)).map(([name,text])=>({name,text})),externalStopReferences:['AAA','BBB'],sourceStopIdRemap:[]}
};
const edits={places:[{key:'a',code:'Abcdefgh',description:'École, "Nord"'}],assignments:{'001':'b'}};
const immutable=JSON.stringify(data);
assert.equal(tools.availability(data).ready,true);
assert.ok(engine(data,edits).errors.includes('externalReferences'));
const corrected=engine(data,edits,true,true);
assert.equal(corrected.errors.length,0);
const result=tools.files(data,corrected),byName=new Map(result.map(entry=>[entry.name,entry.text]));
assert.equal(result.length,Object.keys(original).length);
assert.equal(tools.parse(byName.get('stops.txt')).rows.find(row=>row.stop_id==='001').parent_station,'BBB');
assert.ok(tools.parse(byName.get('stops.txt')).rows.some(row=>row.stop_id==='Abcdefgh'&&row.stop_name==='École, "Nord"'));
assert.equal(byName.get('stop_times.txt'),original['stop_times.txt']);
assert.equal(tools.parse(byName.get('transfers.txt')).rows[0].from_stop_id,'Abcdefgh');
assert.equal(tools.parse(byName.get('translations.txt')).rows[0].record_id,'Abcdefgh');
for(const name of ['agency.txt','routes.txt','trips.txt','calendar_dates.txt','shapes.txt','pathways.txt','locations.geojson','feed_info.txt'])assert.equal(byName.get(name),original[name]);
assert.equal(JSON.stringify(data),immutable);
const review=tools.changes(data,edits);
assert.equal(review.places.length,1);assert.equal(review.stops.length,1);
assert.equal(review.stops[0].before.code,'AAA');assert.equal(review.stops[0].after.code,'BBB');
const saved={...data,edits,savedAt:'2026-10-02T16:00:00Z'};
assert.equal(JSON.stringify(tools.changes(saved,edits)),JSON.stringify(review));
assert.equal(tools.changes(saved,{places:[],assignments:{}}).places.length,0);
assert.equal(tools.changes(saved,{places:[],assignments:{}}).stops.length,0);
assert.equal(tools.changes(data,{places:edits.places}).stops.length,0);
assert.equal(tools.changes(data,{assignments:{'001':'__keep__'}}).stops.length,0);
for(const lang of ['fr','en']){
  const html=tools.reviewHtml({...data,language:lang},edits,'2026-10-02T16:00:00Z');
  assert.ok(html.includes(lang==='fr'?'Avant — rapport initial':'Before — initial report'));
  assert.ok(html.includes('École, &quot;Nord&quot;'));
  assert.ok(!tools.reviewHtml(data,{places:[{key:'a',description:'<script>alert(1)</script>'}]}).includes('<script>'));
}
const swapped=tools.files(data,engine(data,{places:[{key:'a',code:'BBB'},{key:'b',code:'AAA'}]},true,true));
const transfer=tools.parse(swapped.find(entry=>entry.name==='transfers.txt').text).rows[0];
assert.equal(transfer.from_stop_id,'BBB');assert.equal(transfer.to_stop_id,'AAA');
const renumbered=structuredClone(data);
renumbered.gtfs.sourceStopIdRemap=[['uuid-old','001']];
renumbered.gtfs.archiveEntries.find(entry=>entry.name==='pathways.txt').text=original['pathways.txt'].replace('p,001,002','p,uuid-old,002');
assert.equal(tools.files(renumbered,engine(renumbered,{},true,true)).find(entry=>entry.name==='pathways.txt').text,original['pathways.txt']);
assert.equal(tools.availability({...data,gtfs:null}).ready,false);
assert.equal(tools.availability({...data,gtfs:{...data.gtfs,sourceFileNames:['stops.txt','stop_times.txt']}}).ready,false);
assert.throws(()=>tools.files({...data,gtfs:{...data.gtfs,archiveEntries:[]}},corrected),/incompleteGtfs/);
const broken=structuredClone(data);broken.gtfs.archiveEntries.find(entry=>entry.name==='trips.txt').text=original['trips.txt'].replace('r,s,t','missing,s,t');
assert.throws(()=>tools.files(broken,corrected),/brokenFeedReferences/);
const unknownStop=structuredClone(data);unknownStop.gtfs.archiveEntries.find(entry=>entry.name==='pathways.txt').text=original['pathways.txt'].replace('p,001,002','p,missing,002');
assert.throws(()=>tools.files(unknownStop,corrected),/brokenFeedReferences/);
assert.throws(()=>tools.zip([{name:'../bad.txt',text:'x'}]),/duplicateFiles/);
assert.throws(()=>tools.zip([{name:'a.txt',text:'x'},{name:'A.txt',text:'x'}]),/duplicateFiles/);
const out=path.join(root,'tmp');fs.mkdirSync(out,{recursive:true});
const gtfsZip=tools.zip(result);
const bundle=tools.zip([{name:'GTFS_finalise.zip',bytes:gtfsZip},{name:'rapport_corrige.html',text:'<!doctype html><main>'+tools.reviewHtml(data,edits)+'</main>'},{name:'modifications.json',text:JSON.stringify(review)}]);
fs.writeFileSync(path.join(out,'report-editor-package-test.zip'),bundle);
console.log('PASS: complete ZIP, unchanged optional files, dependent references, ID remapping, code swaps, before/after summary, saved/reverted edits, FR/EN, missing/inconsistent GTFS, filename safety.');
