const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({console,URL,window:{},document:{getElementById:()=>({value:'500'})}});
vm.runInContext(fs.readFileSync('app.js','utf8').split('const decisionList=')[0],ctx);
vm.runInContext(fs.readFileSync('report-editor.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('report-existing.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('assignment-diagnostics.js','utf8'),ctx);
const source={
  places:[
    {id:'A',description:'Endpoint place',lat:45,lon:-75,points:[{id:'aNear',description:'Near stop',lat:45,lon:-75},{id:'aFar',description:'Far endpoint',lat:45.006,lon:-75}]},
    {id:'B',description:'Intermediate place',lat:45,lon:-75.02,points:[{id:'b',description:'Far intermediate stop',lat:45.006,lon:-75.02}]},
    {id:'C',description:'Unknown coordinates',points:[{id:'c',description:'Missing',lat:'',lon:''}]}
  ],
  gtfsStops:[{stop_id:'uuidA',stop_code:'aFar'},{stop_id:'uuidB',stop_code:'b'}],
  parsed:{times:{rows:[{trip_id:'trip',stop_id:'uuidB',stop_sequence:'2'},{trip_id:'trip',stop_id:'uuidA',stop_sequence:'3'},{trip_id:'trip',stop_id:'uuidA',stop_sequence:'1'}]}},
  timingPointSource:'gtfs',timingPointIds:['uuidA'],associationKey:'stop_code',stopPlaceThreshold:500
};
const before=JSON.stringify(source),model=ctx.existingClientReportModel(source);
assert.equal(model.stopPlaceThreshold,500);
assert.equal(model.byId.get('A').distantStops.length,1);
assert.ok(model.byId.get('A').distantStops[0].placeDistance>667&&model.byId.get('A').distantStops[0].placeDistance<668);
assert.equal(model.byId.get('A').hasEndpoint,true,'Full unordered GTFS sequences and selected stop_code aliases');
assert.equal(model.byId.get('B').hasEndpoint,false,'Intermediate stop is not an endpoint');
assert.equal(model.byId.get('C').stops[0].placeDistance,null,'Missing coordinates never become zero');
assert.ok(model.byId.get('C').tags.includes('data'));
assert.equal(ctx.existingClientReportModel({...source,stopPlaceThreshold:0}).byId.get('A').stops.find(s=>s.id==='aNear').distant,false,'Strict threshold: co-located stop is not distant at 0');
assert.equal(ctx.existingClientReportModel({...source,stopPlaceThreshold:1000}).byId.get('A').distantStops.length,0);
const exact=model.byId.get('A').distantStops[0].placeDistance;
assert.equal(ctx.existingClientReportModel({...source,stopPlaceThreshold:exact}).byId.get('A').distantStops.length,0,'Equality is not an alert');
const variants=ctx.existingClientReportModel({...source,timingPointSource:'variants',endpointStopIds:[':B']});
assert.equal(variants.byId.get('B').hasEndpoint,true);assert.equal(variants.byId.get('A').hasEndpoint,false,'Variants, not unrelated GTFS trips');
assert.equal(ctx.existingClientReportModel({...source,parsed:{},endpointStopIds:[]}).endpointKnown,false);
assert.equal(JSON.stringify(source),before,'No source modification');
assert.ok(ctx.assignmentDiagnosticModel(source,{stopPlaceThreshold:500}).entries.some(e=>e.kind==='distantStop'));
const review=ctx.assessmentReviewModel([{id:'A'}]);
review.set('A','all',{note:'Client note',csched:'CSched advice',validated:true});
review.set('A','all',{csched:'Revised advice',validated:false});
assert.equal(review.get('A','all').note,'Client note');
assert.equal(review.events.at(-1).before.csched,'CSched advice');
assert.equal(ctx.assessmentReviewModel([{id:'A'}],JSON.parse(JSON.stringify(review.snapshot()))).get('A','all').csched,'Revised advice');
assert.equal(ctx.assessmentReviewModel([{id:'A'}],{events:[{id:'A',scope:'all',at:'2026-10-10',after:{note:'Legacy'}}]}).get('A','all').csched,'','Old reports migrate with empty recommendation');
for(const language of ['fr','en']){
  const t=vm.runInContext('EXISTING_REPORT_TEXT.'+language,ctx),cases=ctx.existingClientReportCases(model,language);
  assert.equal(cases.find(c=>c.code==='A').hasEndpoint,true);assert.equal(cases.find(c=>c.code==='B').hasEndpoint,false);
  assert.ok(cases.find(c=>c.code==='A').html.includes(t.categories.distantStop));
  const timed=ctx.existingReportTimingPointView(model,language);
  assert.ok(!timed.cases.find(c=>c.code==='B').html.includes('Far intermediate stop'),'TP view excludes distant non-TP rows too');
  const rows=ctx.existingReportCsvRows(model,cases,t);
  assert.equal(rows[cases.find(c=>c.code==='A').id].find(r=>r.stop_id==='aFar').distant_from_place,1);
  assert.ok(ctx.existingReportCsv([{csched_recommendation:'=unsafe'}]).includes("'=unsafe"));
  const maps=Object.fromEntries(cases.map(c=>[c.id,ctx.existingReportMap(c.points,[],t)]));
  const html=ctx.existingClientReportHtml(model,cases,maps,{language,theme:'clean',logo:'',brand:'',date:'2026-10-20',offline:true,client:'Synthetic'});
  assert.ok(html.includes('id="endpoint-scope"'));assert.ok(html.includes('id="review-csched"'));
  fs.mkdirSync('tmp',{recursive:true});fs.writeFileSync(path.join('tmp','assessment-stop-distance-'+language+'.html'),html);
}
console.log('PASS: distant stops, thresholds 0/1000/equality, unknown coordinates, GTFS sequence and variants endpoints, aliasing, TP view, CSV, recommendation history/legacy and FR/EN standalone fixtures.');
