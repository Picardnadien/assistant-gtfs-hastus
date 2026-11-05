const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({TextEncoder});
for(const file of ['report-package.js','report-editor.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const tools=ctx.reportPackageTools(),engine=ctx.reportEditorEngine;
const data={places:[{key:'a',code:'AAA',originalCode:'AAA',description:'First',exportId:'AAA',generated:true},{key:'b',code:'BBB',originalCode:'BBB',description:'Second',exportId:'BBB',generated:true}],assignments:{'1':'a','2':'b'},gtfs:{
 stops:tools.parse('stop_id,stop_name,location_type,parent_station\n1,Stop one,0,AAA\n2,Stop two,0,BBB\nAAA,First,1,\nBBB,Second,1,\n'),
 times:tools.parse('trip_id,stop_id\nt,1\nt,2\n'),externalStopReferences:[]}};
const before=JSON.stringify(data),edits={places:[],assignments:{'1':'b'}};
let result=engine(data,edits);
assert.equal(result.errors.length,0);
assert.ok(!tools.parse(result.stops).rows.some(r=>r.stop_id==='AAA'),'A generated place emptied by the client is excluded');
assert.doesNotMatch(tools.placeImportFiles(result)[0].text,/AAA/);
assert.equal(tools.parse(result.stops).rows.find(r=>r.stop_id==='1').parent_station,'BBB');
assert.equal(JSON.stringify(data),before,'Immutable baseline allows undo and reopening');
result=engine(data,{places:[],assignments:{}});
assert.ok(tools.parse(result.stops).rows.some(r=>r.stop_id==='AAA'),'Undo restores the station');
assert.match(tools.placeImportFiles(result)[0].text,/place;AAA;First/);
const source=JSON.parse(before);source.places[0].generated=false;
assert.ok(tools.parse(engine(source,edits).stops).rows.some(r=>r.stop_id==='AAA'),'Source orphan stations are preserved');
delete source.places[0].generated;
assert.ok(tools.parse(engine(source,edits).stops).rows.some(r=>r.stop_id==='AAA'),'Legacy reports without provenance stay conservative');
const referenced=JSON.parse(before);referenced.gtfs.externalStopReferences=['AAA'];
result=engine(referenced,edits);
assert.ok(tools.parse(result.stops).rows.some(r=>r.stop_id==='AAA'),'Never break an external reference');
assert.match(tools.placeImportFiles(result)[0].text,/place;AAA;First/);
console.log('PASS: empty generated places excluded from GTFS and OIR import, undo, immutable baseline, source and externally referenced stations preserved.');
