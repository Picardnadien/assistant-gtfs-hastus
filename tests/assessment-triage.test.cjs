const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({console,URL,window:{},document:{getElementById:()=>({value:'500'})}});
vm.runInContext(fs.readFileSync('app.js','utf8').split('const decisionList=')[0],ctx);
for(const file of ['report-editor.js','report-existing.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const stop=(id,lat=45)=>({id,description:'Description '+id,lat,lon:lat===null?null:-75});
const source={timingPointIds:['a','d','missing1','missing2'],timingPointSource:'variants',endpointStopIds:['a','d'],
  places:[{id:'A',description:'Active',points:[stop('a'),stop('missing1',null),stop('missing2',null)]},
    {id:'B',description:'Non TP only',points:[stop('b')]},
    {id:'C',description:'Non TP and no link',points:[stop('c')]},
    {id:'D',description:'TP without deadhead',points:[stop('d')]},
    {id:'E',description:'Empty but located garage',lat:45,lon:-75,points:[]}],
  parsed:{deadhead:ctx.parseDeadheadMatrix('linkdt;A;B;0\nlinkdt;E;A;0')},
  groupingCandidates:[{entity_type:'PLACES_PROCHES',place_a_id:'A',place_b_id:'B',distance_m:10}],
  decisions:[{id:'missing1',description:'Description missing1',originalPlaceId:'A',status:'error',lat:null,lon:null}]};
const before=JSON.stringify(source),model=ctx.existingClientReportModel(source),cases=ctx.existingClientReportCases(model,'en');
assert.equal(model.unlocated.length,2,'No duplicate stop from the failed decision');
assert.equal(ctx.existingClientReportModel({...source,decisions:[...source.decisions,{id:':a',originalPlaceId:'A',choice:'A',status:'assigned'}]}).unlocated.length,2,'Decision without duplicated coordinates does not invalidate a located physical stop');
const place=code=>cases.find(c=>c.kind==='place'&&c.code===code);
assert.ok(place('A').secondaryReasons.includes('nonTimingPoints'),'Mixed grouping moved intact');
assert.ok(place('B').secondaryReasons.includes('nonTimingPoints'));
assert.deepEqual(Array.from(place('C').secondaryReasons),['noDeadhead','nonTimingPoints']);
assert.deepEqual(Array.from(place('D').secondaryReasons),['noDeadhead']);
assert.equal(place('E').secondaryReasons.length,0,'Empty garage is not inferred non-TP');
assert.equal(cases.filter(c=>c.kind==='unlocated').length,2);
assert.equal(cases.filter(c=>c.kind==='issue').length,0,'Missing-coordinate decision goes only to dedicated list');
assert.ok(!place('A').html.includes('Stop ID: missing1'),'Unlocated stop is not a geographic validation row');
const withoutMatrix=ctx.existingClientReportModel({...source,parsed:{}});
assert.ok(!ctx.existingClientReportCases(withoutMatrix,'en').some(c=>c.secondaryReasons.includes('noDeadhead')));
const unknown=ctx.existingClientReportModel({...source,timingPointIds:undefined,parsed:{}});
assert.ok(!ctx.existingClientReportCases(unknown,'en').some(c=>c.secondaryReasons.includes('nonTimingPoints')));
const plain=ctx.existingClientReportCases(ctx.existingClientReportModel({...source,groupingCandidates:[]}), 'en');
assert.equal(plain.find(c=>c.code==='A').secondaryReasons.length,0,'Missing stop does not exclude a located TP place');
const tp=ctx.existingReportTimingPointView(model,'en');
assert.deepEqual(Array.from(tp.cases.find(c=>c.code==='B').secondaryReasons),Array.from(place('B').secondaryReasons),'TP view does not change original classification');
const targets=cases.filter(c=>c.kind==='unlocated').map(c=>c.id),review=ctx.assessmentReviewModel(cases);
review.set(targets[0],'all',{note:'Keep my note',csched:'Keep recommendation'});
assert.equal(review.batch([...targets,targets[0],'unknown'],'all',true,'2026-10-20T14:00:00Z'),2);
assert.equal(review.get(targets[0],'all').note,'Keep my note');
assert.equal(review.get(targets[0],'all').csched,'Keep recommendation');
assert.equal(review.get(targets[0],'tp').validated,false);
assert.equal(review.batch(targets,'all',true),0,'Idempotent');
assert.equal(review.batch(targets,'invalid',false),0);
assert.equal(review.batch(targets,'all',false),2);
assert.equal(review.events.length,5);assert.equal(review.events.at(-1).before.validated,true);
assert.equal(ctx.assessmentReviewModel(cases,JSON.parse(JSON.stringify(review.snapshot()))).get(targets[0],'all').note,'Keep my note');
assert.equal(JSON.stringify(source),before);
fs.mkdirSync('tmp',{recursive:true});
for(const language of ['fr','en']){
  const list=ctx.existingClientReportCases(model,language),t=vm.runInContext('EXISTING_REPORT_TEXT.'+language,ctx);
  const maps=Object.fromEntries(list.map(c=>[c.id,ctx.existingReportMap(c.points,[],t)]));
  const csv=ctx.existingReportCsvRows(model,list,t);
  assert.equal(csv[targets[0]][0].record_type,'unlocated_stop');assert.equal(csv[targets[0]][0].review_list,'secondary');
  assert.ok(!csv[place('A').id].some(r=>r.stop_id==='missing1'));
  const html=ctx.existingClientReportHtml(model,list,maps,{language,theme:'clean',logo:'',brand:'',client:'Synthetic-triage',date:'2026-10-20',offline:true});
  fs.writeFileSync(`tmp/assessment-triage-${language}.html`,html);
}
console.log('PASS: separate missing stops, no duplicates, strict triage, unknown vs absent, mixed comparisons, stable TP classification, batch audit/notes/scopes and export metadata.');
