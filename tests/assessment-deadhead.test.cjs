const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fields={},field=id=>fields[id]??={value:'',checked:false,classList:{toggle(){}},addEventListener(){},setCustomValidity(){}};
const ctx=vm.createContext({console,URL,window:{},document:{getElementById:field,body:{classList:{toggle(){}}}}});
vm.runInContext(fs.readFileSync('app.js','utf8').split('const decisionList=')[0],ctx);
for(const name of ['report-editor.js','report-existing.js','assignment-diagnostics.js','workspace-storage.js'])vm.runInContext(fs.readFileSync(name,'utf8'),ctx);
const matrix=ctx.parseDeadheadMatrix('\uFEFFlinkdt;001;B;;10;2;;\r\nlinkdt;001;B;;20;2;;\r\nlinkdt;b;001;;0;;\r\nlinkdt;B;B;;0;;\r\nlinkdt;REF;GARAGE;;1;;\r\n');
assert.equal(matrix.records,5);assert.equal(matrix.pairs,4);
assert.equal(matrix.rows.find(r=>r.place_code==='001').outgoing,1);
assert.equal(matrix.rows.find(r=>r.place_code==='B').incoming,2);
assert.throws(()=>ctx.parseDeadheadMatrix('linkdt;A;;;;'),/invalid/);
assert.throws(()=>ctx.parseDeadheadMatrix('stop;A;B'),/invalid/);
assert.throws(()=>ctx.parseDeadheadMatrix(''),/empty/);
const source={
  parsed:{deadhead:matrix},endpointStopIds:['s1'],timingPointIds:['s1'],timingPointSource:'variants',
  places:[{id:'001',description:'Origin',points:[{id:'s1',lat:45,lon:-75}]},{id:'B',description:'Destination',points:[{id:'s2',lat:45,lon:-75.01}]},{id:'C',description:'No direct links',referenceId:'REF',points:[{id:'s3',lat:45,lon:-75.02}]},{id:'REF',description:'Reference with links',points:[]}],
  groupingCandidates:[],referenceAnomalies:[{place_a_id:'C',place_b_id:'REF',reference_place_id:'REF',anomaly:'REFERENCE_ELOIGNEE',distance_m:700}]
};
const before=JSON.stringify(source),model=ctx.existingClientReportModel(source);
assert.equal(model.deadheadKnown,true);assert.equal(model.byId.get('001').deadhead.incoming,1);
assert.equal(model.byId.get('C').hasDeadhead,false,'Reference links never count as a direct link');
assert.equal(ctx.existingClientReportModel({...source,parsed:{}}).deadheadKnown,false);
assert.equal(JSON.stringify(source),before);
for(const lang of ['fr','en']){
  const t=vm.runInContext(`EXISTING_REPORT_TEXT.${lang}`,ctx),cases=ctx.existingClientReportCases(model,lang);
  assert.equal(cases.find(c=>c.code==='001').hasDeadhead,true);
  assert.equal(cases.find(c=>c.kind==='place'&&c.code==='C').hasDeadhead,false);
  assert.equal(cases.find(c=>c.kind==='reference').hasDeadhead,true);
  assert.equal(cases.find(c=>c.kind==='reference').allHaveDeadhead,false,'Any is not all: mixed comparison must be excluded');
  assert.equal(cases.find(c=>c.code==='001').allHaveDeadhead,true);
  assert.equal(cases.find(c=>c.code==='001').allHaveEndpoint,true);
  assert.ok(cases.every(c=>c.html.includes(t.deadheadTitle)));
  const rows=ctx.existingReportCsvRows(model,cases,t);
  assert.equal(rows[cases.find(c=>c.code==='001').id][0].deadhead_outgoing,1);
  const maps=Object.fromEntries(cases.map(c=>[c.id,ctx.existingReportMap(c.points,[],t)]));
  const html=ctx.existingClientReportHtml(model,cases,maps,{language:lang,theme:'clean',logo:'',brand:'',date:'2026-10-20',offline:true,client:'Synthetic-deadhead'});
  assert.ok(html.includes('id="deadhead-scope"'));
  fs.mkdirSync('tmp',{recursive:true});fs.writeFileSync(`tmp/assessment-deadhead-${lang}.html`,html);
}
vm.runInContext('state.parsed={stops:{headers:[],rows:[]},times:{headers:[],rows:[]}};state.mode="geographic";state.geographicReady=true;state.decisions=[{id:"KEEP"}];refreshStopPlaceDiagnostic=()=>{};refreshDeadheadUi=()=>{};',ctx);
ctx.matrix=matrix;vm.runInContext('state.parsed.deadhead=matrix;state.files.deadhead="synthetic.txt";',ctx);
field('diagnostic-deadhead-only').checked=true;
const snapshot=ctx.workspaceSnapshot();
assert.equal(snapshot.settings.diagnosticDeadheadOnly,true);
assert.equal(snapshot.parsed.deadhead.pairs,4);
assert.ok([...ctx.workspaceStorageRecords(snapshot)].length>0);
vm.runInContext('updateLoadedGtfsUi=()=>{};refreshWorkingTimetableAccess=()=>{};setMode=()=>{};',ctx);
ctx.restoreWorkspaceSnapshot(snapshot);
assert.equal(field('diagnostic-deadhead-only').checked,true);
assert.equal(vm.runInContext('state.parsed.deadhead.rows.length',ctx),4);
console.log('PASS: directed matrix import, duplicates, zero time, leading zeros, no reference inheritance, absent/unknown, case metadata, FR/EN, CSV and workspace restoration.');

// Regression of the reported 7060 / PTOC / PT example, and endpoint equivalent.
const noisy={places:[
  {id:'7060',points:[{id:'end',lat:45,lon:-75}]},
  {id:'PTOC',points:[{id:'mid',lat:45,lon:-75.001}]},
  {id:'PT',points:[{id:'mid2',lat:45,lon:-75.002}]}
],parsed:{deadhead:ctx.parseDeadheadMatrix('linkdt;7060;OTHER;;0;;')},endpointStopIds:['end'],timingPointSource:'variants',
groupingCandidates:[
  {entity_type:'PLACES_PROCHES',place_a_id:'7060',place_b_id:'PTOC',distance_m:80},
  {entity_type:'PLACES_PROCHES',place_a_id:'PTOC',place_b_id:'PT',distance_m:80}
]};
const noisyModel=ctx.existingClientReportModel(noisy),noisyCases=ctx.existingClientReportCases(noisyModel,'fr');
assert.ok(noisyCases.every(c=>!c.allHaveDeadhead&&!c.allHaveEndpoint),'No mixed grouping is suggested with either strict filter');
const view=ctx.assignmentDiagnosticModel(noisy,{deadheadOnly:true,endpointsOnly:true});
assert.ok(view.entries.every(c=>!c.ids.every(id=>view.model.byId.get(id)?.hasDeadhead)));
console.log('PASS: 7060/PTOC/PT mixed groupings excluded for both strict filters.');
