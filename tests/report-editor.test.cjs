const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fields = {
  'place-report-language': {value:'fr'}, 'place-report-orientation': {value:'portrait'},
  'place-report-nearby': {checked:true}, 'place-report-margin': {value:'150'}, radius: {value:'202'}
};
const context = vm.createContext({window:{}, document:{getElementById:id=>fields[id]||{value:''}}, console, URL});
vm.runInContext(fs.readFileSync(path.join(root, 'report-editor.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8').split('const decisionList=')[0], context);
const engine = context.reportEditorEngine, parse = context.parseCSV;
const data = {
  places:[{key:'a',originalCode:'AAA',code:'AAA',description:'First',exportId:'AAA',lat:47.564,lon:-52.715}, {key:'b',originalCode:'BBB',code:'BBB',description:'Second',exportId:'BBB',lat:47.566,lon:-52.714}],
  assignments:{'001':'a','002':'b'},
  gtfs:{stops:{headers:['stop_id','stop_name','stop_lat','stop_lon','location_type','parent_station','wheelchair_boarding'],rows:[
    {stop_id:'001',stop_name:'Stop one',stop_lat:'47.564',stop_lon:'-52.715',location_type:'0',parent_station:'AAA',wheelchair_boarding:'1'},
    {stop_id:'002',stop_name:'Stop two',stop_lat:'47.566',stop_lon:'-52.714',location_type:'',parent_station:'BBB',wheelchair_boarding:'2'},
    {stop_id:'AAA',stop_name:'First',location_type:'1',parent_station:''},
    {stop_id:'BBB',stop_name:'Second',location_type:'1',parent_station:''},
    {stop_id:'gate',stop_name:'Gate',location_type:'2',parent_station:'AAA'}
  ]},times:{headers:['trip_id','stop_id','arrival_time','departure_time','stop_sequence','timepoint','custom'],rows:[
    {trip_id:'t1',stop_id:'001',arrival_time:'25:01:00',departure_time:'25:02:00',stop_sequence:'1',timepoint:'1',custom:'A,"B"\nC'},
    {trip_id:'t1',stop_id:'002',arrival_time:'25:05:00',departure_time:'25:05:00',stop_sequence:'2',timepoint:'0',custom:'x'}
  ]}}
};
const snapshot=JSON.stringify(data);
let result=engine(data,{places:[{key:'a',code:'aB',description:'École, "Nord"\nEntrée'}],assignments:{'001':'b'}});
assert.equal(result.errors.length,0);
let rows=parse(result.stops).rows;
assert.equal(rows.find(r=>r.stop_id==='001').parent_station,'BBB');
assert.equal(rows.find(r=>r.stop_id==='aB').stop_name,'École, "Nord"\nEntrée');
assert.equal(rows.find(r=>r.stop_id==='gate').parent_station,'aB');
assert.equal(rows.find(r=>r.stop_id==='001').wheelchair_boarding,'1');
assert.equal(JSON.stringify(parse(result.times).rows),JSON.stringify(data.gtfs.times.rows));
assert.equal(JSON.stringify(data),snapshot);
result=engine(data,{places:[{key:'a',code:'BBB'},{key:'b',code:'AAA'}]});
assert.equal(result.errors.length,0);
rows=parse(result.stops).rows;
assert.equal(rows.find(r=>r.stop_id==='001').parent_station,'BBB');
assert.equal(rows.find(r=>r.stop_id==='002').parent_station,'AAA');
assert.equal(rows.find(r=>r.stop_id==='BBB').stop_name,'First');
for(const code of ['', '1234567', 'A-B', 'é', 'bbb']) assert.ok(engine(data,{places:[{key:'a',code}]}).errors.includes('invalidCode'),code);
assert.ok(engine(data,{places:[{key:'a',code:'001'}]}).errors.includes('physicalCollision'));
assert.ok(engine(data,{places:[{key:'a',description:' '}]}).errors.includes('invalidDescription'));
assert.ok(engine(data,{assignments:{'001':'missing'}}).errors.includes('invalidAssignment'));
assert.ok(engine(data,{assignments:{gate:'b'}}).errors.includes('invalidAssignment'));
assert.equal(parse(engine(data,{places:[{key:'a',code:'aaa'}]}).stops).rows.find(r=>r.stop_id==='001').parent_station,'aaa');
assert.equal(engine({...data,gtfs:null},{}).errors.length,0);
assert.ok(engine({...data,gtfs:{...data.gtfs,externalStopReferences:['AAA']}},{places:[{key:'a',code:'NEW'}]}).errors.includes('externalReferences'));
assert.equal(engine({...data,gtfs:{...data.gtfs,externalStopReferences:['AAA']}},{places:[{key:'a',description:'New name'}]}).errors.length,0);
// Exercise the real HTML generator with both languages and a no-GTFS report.
context.fixture=data;
vm.runInContext(`
  state.parsed.stops=fixture.gtfs.stops; state.parsed.times=fixture.gtfs.times;
  state.gtfsStops=fixture.gtfs.stops.rows; state.geographicClientType='existing';
  state.parsed.agency={headers:['agency_name'],rows:[{agency_name:'Client test'}]};
  state.places=fixture.places.map((p,index)=>({id:p.code,description:p.description,lat:p.lat,lon:p.lon,points:[{id:index?'002':'001',description:index?'Stop two':'Stop one',lat:p.lat,lon:p.lon}]}));
  state.places.push({id:'CCC',description:'Remote',lat:47.6,lon:-52.8,points:[{id:'003',description:'Stop three',lat:47.6,lon:-52.8}]});
  state.gtfsStops.push({stop_id:'003',stop_name:'Stop three',stop_lat:'47.6',stop_lon:'-52.8',location_type:'0',parent_station:'CCC'});
  state.gtfsStops.push({stop_id:'CCC',stop_name:'Remote',stop_lat:'47.6',stop_lon:'-52.8',location_type:'1',parent_station:''});
`, context);
const out=path.join(root,'tmp'); fs.mkdirSync(out,{recursive:true});
for(const lang of ['fr','en']){
  fields['place-report-language'].value=lang;
  const html=context.placeBrowserReportHtmlWithMaps('',[]);
  const payload=JSON.parse(html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(payload.language,lang); assert.equal(payload.places.length,3);
  assert.equal(engine(payload,{}).errors.length,0);
  assert.ok(html.includes('id="save-client-report"'));
  assert.ok(!html.includes('<iframe')); assert.ok(!html.includes('tile.openstreetmap.org/'));
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1); new vm.Script(scripts[0][1]);
  fs.writeFileSync(path.join(out,`report-editor-${lang}.html`),html);
}
vm.runInContext('state.parsed.times=null',context);
const diagnostic=context.placeBrowserReportHtmlWithMaps('',[]);
assert.ok(diagnostic.includes('id="save-client-report"'));
assert.ok(!diagnostic.includes('id="download-client-stops"'));
fs.writeFileSync(path.join(out,'report-editor-no-gtfs.html'),diagnostic);
console.log('PASS: renames, swaps, reassignments, CSV round-trip, schedule preservation, collisions, invalid edits, FR/EN standalone templates, no-GTFS mode.');
// Optional integration test: node tests/report-editor.test.cjs path/to/feed.zip
if (process.argv[2]) {
  const {execFileSync}=require('node:child_process');
  const raw=JSON.parse(execFileSync(process.env.PYTHON||'python',['-c',
    'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode("utf-8-sig") for n in z.namelist() if n in ("stops.txt","stop_times.txt")}))',
    path.resolve(process.argv[2])],{encoding:'utf8',maxBuffer:128*1024*1024}));
  context.realStops=parse(raw['stops.txt']); context.realTimes=parse(raw['stop_times.txt']);
  vm.runInContext(`
    state.parsed.stops=realStops; state.parsed.times=realTimes; state.gtfsStops=realStops.rows;
    state.geographicClientType='new'; state.places=[];
    state.groups=[['FREPAR',['1850','5025']],['MILITA',['1390','1830']]].map(([code,ids],i)=>{
      const items=ids.map(id=>{const row=realStops.rows.find(r=>r.stop_id===id); if(!row)throw new Error('Expected Metrobus stop '+id); return {id,description:row.stop_name,lat:Number(row.stop_lat),lon:Number(row.stop_lon)};});
      return {id:'G'+i,code,description:code==='FREPAR'?'Freshwater Parade':'Military',lat:items[0].lat,lon:items[0].lon,radius:202,items};
    });
    state.decisions=state.groups.flatMap(g=>g.items.map(item=>({...item,originalId:item.id,groupId:g.id,status:'review',candidates:[]})));
  `,context);
  const html=context.placeBrowserReportHtmlWithMaps('',[]);
  const payload=JSON.parse(html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const a=payload.places.find(p=>p.code==='FREPAR'), b=payload.places.find(p=>p.code==='MILITA');
  const corrected=engine(payload,{places:[{key:a.key,code:'Parade',description:'Parade / Harvey'}],assignments:{1850:b.key}});
  assert.equal(corrected.errors.length,0);
  const after=parse(corrected.stops).rows;
  assert.equal(after.find(r=>r.stop_id==='1850').parent_station,'MILITA');
  assert.equal(after.find(r=>r.stop_id==='5025').parent_station,'Parade');
  assert.equal(after.length,context.realStops.rows.length+2);
  assert.equal(JSON.stringify(parse(corrected.times).rows),JSON.stringify(context.realTimes.rows));
  for(const row of context.realStops.rows){const updated=after.find(r=>r.stop_id===row.stop_id); for(const field of context.realStops.headers) if(field!=='parent_station')assert.equal(updated[field],row[field]);}
  console.log('PASS Metrobus: '+context.realStops.rows.length+' stops / '+context.realTimes.rows.length+' stop times; 1850 reassigned, 5025 retained, no schedule data changed.');
}
