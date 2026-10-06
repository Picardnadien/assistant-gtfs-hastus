const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fields = {
  'place-report-language': {value:'fr'}, 'place-report-orientation': {value:'portrait'},
  'place-report-nearby': {checked:true}, 'place-report-margin': {value:'150'}, radius: {value:'202'},
  'place-code-max-length': {value:'6'}, 'place-code-case': {value:'upper'}
};
const context = vm.createContext({window:{}, document:{getElementById:id=>fields[id]||{value:''}}, console, URL});
vm.runInContext(fs.readFileSync(path.join(root, 'report-package.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'report-network.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'report-payload.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'report-network-document.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'report-timetable-export.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'working-timetable.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'report-editor.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8').split('const decisionList=')[0], context);
const engine = context.reportEditorEngine, parse = context.parseCSV;
for (const word of ['Ad','AD','ad','aD']) assert.equal(context.codeRoot(`${word} Main Rd`),'MAIN00');
assert.equal(context.codeRoot('Ad.'),'PLACE0');
assert.equal(context.codeRoot('Adams Rd'),'ADAMS0');
for (const limit of [6,8]) {
  fields['place-code-max-length'].value=String(limit);
  for(const casing of ['upper','lower']) {
    fields['place-code-case'].value=casing;
    const expected=limit===8?'HARBVILL':'HARVIL';
    assert.equal(context.codeRoot('Harbour Village'),casing==='lower'?expected.toLowerCase():expected);
    assert.equal(context.codeRoot('Ad Main Rd'),(casing==='lower'?'main':'MAIN').padEnd(limit,'0'));
    const namedCases=limit===6?{'Bay Harbour':'BAYHAR','Ox Harbour':'OXHARB','Ox Bay North':'OXBAYN','Main':'MAIN00','École Canal':'ECOCAN','before after Ave Dr St Rd Ad':'PLACE0'}:{'Bay Harbour':'BAYHARBO','Ox Harbour':'OXHARBOU','Ox Bay North':'OXBAYNOR','Main':'MAIN0000','École Canal':'ECOLCANA','before after Ave Dr St Rd Ad':'PLACE000'};
    for(const [description,expectedCode] of Object.entries(namedCases))assert.equal(context.codeRoot(description),casing==='lower'?expectedCode.toLowerCase():expectedCode);
    assert.equal(context.sanitizePlaceCode('Abcdefghij').length,limit);
    assert.equal(context.isValidPlaceCode('A'.repeat(limit)),true);
    assert.equal(context.isValidPlaceCode('A'.repeat(limit+1)),false);
    const used=new Set();
    for(let i=0;i<250;i++) {
      const code=context.uniqueCode('Harbour Village',used);
      assert.equal(code.length,limit);
      assert.equal(code,casing==='lower'?code.toLowerCase():code.toUpperCase());
    }
    assert.equal(used.size,250);
    const alternatives=context.alternativePlaceCodes({id:'test',description:'Harbour Village',items:[]});
    assert.ok(alternatives.length>0);
    for(const {code} of alternatives)assert.equal(code.length,limit);
    for(const {code} of context.alternativePlaceCodes({id:'short',description:'Ox Bay',items:[]}))assert.equal(code.length,limit);
    assert.equal(alternatives[0].code,casing==='lower'?expected.toLowerCase():expected);
  }
}
fields['place-code-max-length'].value='6'; fields['place-code-case'].value='upper';
fields['use-canada-post-abbreviations']={checked:true};
for(const limit of [6,8]){
  fields['place-code-max-length'].value=String(limit);
  assert.equal(context.codeRoot('Main Road'),'MAIN'.padEnd(limit,'0'));
  assert.equal(context.codeRoot('Bay Harbour'),limit===6?'BAYHAR':'BAYHARBR');
  assert.equal(context.sanitizePlaceCode('Ab'),'AB'); // manual short codes remain allowed
  assert.equal(context.isValidPlaceCode('AB'),true);
}
fields['use-canada-post-abbreviations'].checked=false;
fields['place-code-max-length'].value='6';
// Restore new/legacy workspaces and ensure reducing the limit never truncates codes.
const settingsFields={};
const settingsContext=vm.createContext({window:{},console,URL,document:{
  getElementById:id=>settingsFields[id]??(settingsFields[id]={value:''}),body:{classList:{toggle(){}}}
}});
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0],settingsContext);
vm.runInContext(`
  updateLoadedGtfsUi=()=>{};refreshWorkingTimetableAccess=()=>{};
  setMode=mode=>{state.mode=mode;};captureGeographicState=()=>{};
`,settingsContext);
const savedWorkspace={mode:'geographic',geographicClientType:'new',parsed:{stops:{headers:['stop_id'],rows:[]},times:{headers:['stop_id'],rows:[]}},
  groups:[{id:'g',code:'HarbVill',description:'Harbour Village',lat:47.5,lon:-52.7,items:[]}],
  decisions:[{groupId:'g',status:'review',candidates:[]}],settings:{placeCodeMaxLength:8,placeCodeCase:'lower'}};
settingsContext.restoreWorkspaceSnapshot(savedWorkspace);
assert.equal(settingsContext.placeCodeMaxLength(),8);
assert.equal(settingsContext.workspaceSnapshot().settings.placeCodeMaxLength,8);
assert.equal(settingsContext.workspaceSnapshot().settings.placeCodeCase,'lower');
settingsFields['place-report-html-theme'].value='classic';
assert.equal(settingsContext.workspaceSnapshot().settings.placeReportHtmlTheme,'classic');
settingsContext.restoreWorkspaceSnapshot({...savedWorkspace,settings:{...savedWorkspace.settings,placeReportHtmlTheme:'clean'}});
assert.equal(settingsFields['place-report-html-theme'].value,'clean');
assert.equal(settingsContext.groupValidationIssues().length,0);
assert.doesNotThrow(()=>settingsContext.buildExports());
settingsContext.restoreWorkspaceSnapshot({...savedWorkspace,settings:{placeCodeCase:'lower'}});
assert.equal(settingsContext.placeCodeMaxLength(),6);
assert.equal(settingsContext.workspaceSnapshot().groups[0].code,'HarbVill');
assert.ok(settingsContext.groupValidationIssues().some(issue=>issue.errors.some(error=>error.includes('1 à 6'))));
assert.throws(()=>settingsContext.buildExports(),/1 à 6/);
settingsFields['place-code-max-length'].value='8';
settingsContext.restoreWorkspaceSnapshot({...savedWorkspace,settings:undefined});
assert.equal(settingsContext.placeCodeMaxLength(),6);
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
// Per-stop geographic ordering and persisted, dependency-safe per-card undo.
const controlEdits={places:data.places.map(p=>({...p})),assignments:{...data.assignments}};
const controls=context.reportEditorControls(data,controlEdits);
assert.deepEqual(Array.from(controls.options({lat:47.566,lon:-52.714}),p=>p.key),['b','a']);
assert.equal(controls.options({lat:47.566,lon:-52.714})[0].distance,0);
assert.ok(controls.options({lat:47.566,lon:-52.714})[1].distance>230);
assert.equal(controls.distance({lat:null,lon:0},data.places[0]),Infinity);
controls.set('a','a','code','Ab');controls.set('a','a','code','Abc',true);
assert.equal(controls.history.length,1);
controls.set('a','001','assignment','b');
controls.set('b','b','description','Other name');
assert.equal(controls.undo('a'),true);
assert.equal(controlEdits.assignments['001'],'a');
assert.equal(controlEdits.places[1].description,'Other name');
assert.equal(controls.undo('a'),true);assert.equal(controlEdits.places[0].code,'AAA');
assert.equal(controls.undo('a'),false);
controls.set('a','001','assignment','b');controls.set('b','001','assignment','a');
assert.equal(controls.canUndo('a'),false); // a newer edit of the same stop wins
assert.equal(controls.undo('b'),true);assert.equal(controls.canUndo('a'),true);
const resumed=context.reportEditorControls(data,JSON.parse(JSON.stringify(controlEdits)),JSON.parse(JSON.stringify(controls.history)));
assert.equal(resumed.undo('a'),true);
assert.equal(controls.undo('a'),true);assert.equal(controls.undo('b'),true);
assert.equal(context.reportPackageTools().changes(data,controlEdits).stops.length,0);
assert.equal(context.reportPackageTools().changes(data,controlEdits).places.length,0);
// A nearby stop absent from every original card remains assignable and traceable.
const candidatePayload=context.placeBrowserEditorData([
  {anchor:'a',code:'AAA',lat:47.564,lon:-52.715,radius:202,items:[],candidates:[{id:'001',description:'Nearby only',lat:47.564,lon:-52.715}]}
],data.gtfs,'portrait','test');
assert.equal(candidatePayload.points.length,1);
assert.equal(candidatePayload.points[0].editable,true);
assert.equal(candidatePayload.assignments['001'],'a');
const unassignedData={...data,assignments:{...data.assignments,'004':'__keep__'},gtfs:{...data.gtfs,stops:{...data.gtfs.stops,rows:[...data.gtfs.stops.rows,{stop_id:'004',stop_name:'Nearby only',stop_lat:'47.565',stop_lon:'-52.715',parent_station:'',location_type:'0'}]}}};
const candidateEdits={places:unassignedData.places.map(p=>({...p})),assignments:{...unassignedData.assignments}};
const candidateControls=context.reportEditorControls(unassignedData,candidateEdits);
candidateControls.set('a','004','assignment','a');
assert.equal(parse(engine(unassignedData,candidateEdits).stops).rows.find(row=>row.stop_id==='004').parent_station,'AAA');
assert.equal(candidateControls.undo('a'),true);
assert.equal(parse(engine(unassignedData,candidateEdits).stops).rows.find(row=>row.stop_id==='004').parent_station,'');
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
for(const limit of [6,8]){
  const configured={...data,placeCodeMaxLength:limit};
  for(const code of ['ABCDEFGH','abcdefgh','AbCdEfGh']){
    const output=engine(configured,{places:[{key:'a',code}]});
    if(limit===6)assert.ok(output.errors.includes('invalidCode'));
    else {assert.equal(output.errors.length,0); assert.ok(parse(output.stops).rows.some(row=>row.stop_id===code));}
  }
  assert.ok(engine(configured,{places:[{key:'a',code:'ABCDEFGHI'}]}).errors.includes('invalidCode'));
}
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
  state.originalEntries=[
    {name:'stops.txt',text:toCSV(fixture.gtfs.stops.headers,state.gtfsStops)},
    {name:'stop_times.txt',text:toCSV(fixture.gtfs.times.headers,fixture.gtfs.times.rows)},
    {name:'agency.txt',text:'agency_name,agency_url,agency_timezone\\nClient test,https://example.com,America/Toronto'},
    {name:'routes.txt',text:'route_id,route_short_name,route_type\\nr1,1,3'},
    {name:'trips.txt',text:'route_id,service_id,trip_id\\nr1,s1,t1'},
    {name:'calendar_dates.txt',text:'service_id,date,exception_type\\ns1,20261002,1'}
  ];
`, context);
const out=path.join(root,'tmp'); fs.mkdirSync(out,{recursive:true});
for(const limit of [6,8])for(const lang of ['fr','en']){
  fields['place-report-html-theme']={value:lang==='fr'?'classic':'clean'};
  fields['place-report-hide-file-exports']={checked:lang==='fr'};
  fields['place-code-max-length'].value=String(limit);
  fields['place-report-language'].value=lang;
  const logoUrl='data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,'assets/csched-logo.svg')).toString('base64');
  const html=context.placeBrowserReportHtmlWithMaps(logoUrl,[]);
  assert.ok(html.includes(`<div class="sidebar-brand"><img class="csched-logo" src="${logoUrl}" alt="CSched"></div>`));
  assert.ok(!html.includes('<div class="search-box"><strong>CSched</strong>'));
  assert.ok(html.includes('id="place-code-layout"'));
  assert.ok(html.includes('.place-code{min-width:190px;flex-shrink:0}'));
  const payload=JSON.parse(html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(payload.language,lang); assert.equal(payload.places.length,3);
  assert.equal(payload.placeCodeMaxLength,limit);
  assert.equal(payload.hideFileExports,lang==='fr');
  assert.equal(payload.reportTheme,lang==='fr'?'classic':'clean');
  assert.ok(html.includes('<body class="'+payload.reportTheme+'-report">'));
  assert.ok(html.includes('function reportTimetableExportTools'));
  assert.equal(payload.networkMaps,undefined);
  assert.ok(!html.includes('href="#network-report"'));
  const withRoad=context.reportRouteMapPayload(payload,[{tags:{highway:'residential',name:'Test & Road'},geometry:[{lat:47.564,lon:-52.715},{lat:47.565,lon:-52.7145}]}],lang);
  assert.match(withRoad[0].html,/class="osm-road minor"/);
  assert.match(withRoad[0].html,/Test &amp; Road/);
  assert.ok(html.includes('function mountReportNetwork'));
  assert.ok(html.includes('data-report-module="network"'));
  assert.ok(html.includes('data-report-module="places"'));
  assert.equal(html.includes('id="download-client-stops"'),lang!=='fr');
  assert.equal(html.includes('id="download-client-times"'),lang!=='fr');
  assert.ok(html.includes('id="download-client-package"'));
  assert.equal(context.reportPackageTools().availability(payload).ready,true);
  assert.equal(context.reportPackageTools().files(payload,engine(payload,{})).length,6);
  assert.match(payload.editor.invalidCode,new RegExp('1 (?:à|to) '+limit));
  assert.ok(html.includes(`data-place-code maxlength="${limit}"`));
  assert.equal(engine(payload,{}).errors.length,0);
  assert.ok(html.includes('id="save-client-report"'));
  assert.ok(!html.replace(/<script\b[\s\S]*?<\/script>/g,'').includes('<iframe')); assert.ok(!html.includes('tile.openstreetmap.org/'));
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1); new vm.Script(scripts[0][1]);
  fs.writeFileSync(path.join(out,`report-editor-${limit}-${lang}.html`),html);
  if(limit===8&&lang==='en'){
    const extended=JSON.parse(JSON.stringify(payload));
    extended.points.push({id:'004',label:'004',description:'Nearby only',lat:47.565,lon:-52.715,parent:'',originalPlace:'',editable:true});
    extended.assignments['004']='__keep__';
    extended.gtfs.stops.rows.push({stop_id:'004',stop_name:'Nearby only',stop_lat:'47.565',stop_lon:'-52.715',parent_station:'',location_type:'0'});
    fs.writeFileSync(path.join(out,'report-editor-candidate-only.html'),html.replace(/(<script id="report-data" type="application\/json">)[\s\S]*?(<\/script>)/,(_,start,end)=>start+context.inlineJson(extended)+end));
  }
  const online=context.placeBrowserReportHtmlWithMaps('');
  const onlinePayload=JSON.parse(online.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(onlinePayload.networkMaps,undefined);
  const routeMaps=context.reportRouteMapPayload(onlinePayload,null,lang);
  assert.match(routeMaps[0].html,/<iframe[^>]*\binert\b/);
  assert.match(routeMaps[0].html,/network-map-canvas/);
  const frames=[...online.replace(/<script\b[\s\S]*?<\/script>/g,'').matchAll(/<iframe\b[^>]*>/g)].map(match=>match[0]);
  assert.equal(frames.length,3);
  for(const frame of frames){
    assert.match(frame,/\binert\b/);
    assert.match(frame,/tabindex="-1"/);
    assert.match(frame,/aria-hidden="true"/);
    assert.match(frame,/https:\/\/www\.openstreetmap\.org\/export\/embed\.html/);
  }
  assert.match(online,/\.browser-osm-frame\{[^}]*pointer-events:none/);
  assert.ok(online.includes(lang==='en'?'zooming and panning are disabled':'zoom et déplacement désactivés'));
  assert.ok(online.includes('class="browser-map-overlay"'));
  fs.writeFileSync(path.join(out,`report-editor-online-${limit}-${lang}.html`),online);
}
fields['place-code-max-length'].value='6';
vm.runInContext('state.parsed.times=null',context);
const diagnostic=context.placeBrowserReportHtmlWithMaps('',[]);
assert.ok(diagnostic.includes('id="save-client-report"'));
assert.ok(!diagnostic.includes('id="download-client-stops"'));
fs.writeFileSync(path.join(out,'report-editor-no-gtfs.html'),diagnostic);
console.log('PASS: 6/8-character codes, upper/lower case, workspace restoration, renames, swaps, reassignments, CSV round-trip, schedule preservation, collisions, invalid edits, FR/EN standalone templates, locked online maps, no-GTFS mode.');
// Optional integration test: node tests/report-editor.test.cjs path/to/feed.zip
if (process.argv[2]) {
  const {execFileSync}=require('node:child_process');
  const raw=JSON.parse(execFileSync(process.env.PYTHON||'python',['-c',
    'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode("utf-8-sig") for n in z.namelist() if n.endswith((".txt",".geojson"))}))',
    path.resolve(process.argv[2])],{encoding:'utf8',maxBuffer:128*1024*1024}));
  context.realStops=parse(raw['stops.txt']); context.realTimes=parse(raw['stop_times.txt']);
  context.realEntries=Object.entries(raw).map(([name,text])=>({name,text}));
  vm.runInContext(`
    state.parsed.stops=realStops; state.parsed.times=realTimes; state.gtfsStops=realStops.rows; state.originalEntries=realEntries;
    state.geographicClientType='new'; state.places=[];
    state.groups=[['FREPAR',['1850','5025']],['MILITA',['1390','1830']]].map(([code,ids],i)=>{
      const items=ids.map(id=>{const row=realStops.rows.find(r=>r.stop_id===id); if(!row)throw new Error('Expected Metrobus stop '+id); return {id,description:row.stop_name,lat:Number(row.stop_lat),lon:Number(row.stop_lon)};});
      return {id:'G'+i,code,description:code==='FREPAR'?'Freshwater Parade':'Military',lat:items[0].lat,lon:items[0].lon,radius:202,items};
    });
    state.decisions=state.groups.flatMap(g=>g.items.map(item=>({...item,originalId:item.id,groupId:g.id,status:'review',candidates:[]})));
  `,context);
  const html=context.placeBrowserReportHtmlWithMaps('',[]);
  const payload=JSON.parse(html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const network=context.reportNetworkTools().create(payload),routeMaps=network.routeModels();
  assert.ok(network.hasCalendar);assert.ok(network.schedules(network.start,'','',false).tripCount>0);
  assert.equal(payload.networkMaps,undefined);
  assert.ok(routeMaps.some(route=>route.lines.length>0));
  console.log('PASS Metrobus network: '+routeMaps.length+' route maps; calendar '+network.start+' to '+network.end);
  const a=payload.places.find(p=>p.code==='FREPAR'), b=payload.places.find(p=>p.code==='MILITA');
  const corrected=engine(payload,{places:[{key:a.key,code:'Parade',description:'Parade / Harvey'}],assignments:{1850:b.key}});
  assert.equal(corrected.errors.length,0);
  const after=parse(corrected.stops).rows;
  assert.equal(after.find(r=>r.stop_id==='1850').parent_station,'MILITA');
  assert.equal(after.find(r=>r.stop_id==='5025').parent_station,'Parade');
  assert.equal(after.length,context.realStops.rows.length+2);
  assert.equal(JSON.stringify(parse(corrected.times).rows),JSON.stringify(context.realTimes.rows));
  for(const row of context.realStops.rows){const updated=after.find(r=>r.stop_id===row.stop_id); for(const field of context.realStops.headers) if(field!=='parent_station')assert.equal(updated[field],row[field]);}
  const packageTools=context.reportPackageTools();
  assert.equal(packageTools.availability(payload).ready,true);
  const completeFiles=packageTools.files(payload,corrected);
  assert.equal(completeFiles.length,Object.keys(raw).length);
  for(const entry of completeFiles)if(!['stops.txt','stop_times.txt'].includes(entry.name))assert.equal(entry.text,raw[entry.name]);
  console.log('PASS Metrobus: '+context.realStops.rows.length+' stops / '+context.realTimes.rows.length+' stop times; 1850 reassigned, 5025 retained, no schedule data changed.');
}
