const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ctx=vm.createContext({console,window:{},document:{getElementById:()=>({value:'200'})}});
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0],ctx);
for(const file of ['report-existing.js','assignment-diagnostics.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const source={places:[
  {id:'ALPHA',description:'Alpha terminal',lat:45.4,lon:-75.7,referenceIds:['REF'],points:[{id:'001',description:'East platform',lat:45.4001,lon:-75.7},{id:'002',description:'West platform',lat:45.4002,lon:-75.7002}]},
  {id:'BETA',description:'Beta station',lat:45.4006,lon:-75.7004,referenceIds:[],points:[{id:'003',description:'Bay 3',lat:45.4007,lon:-75.7004}]},
  {id:'REF',description:'Remote hub',lat:45.42,lon:-75.7,referenceIds:[],points:[]},
  {id:'MISSING',description:'Place without coordinates',lat:null,lon:null,referenceIds:['ABSENT'],points:[{id:'004',description:'No coordinates',lat:null,lon:null}]}
],referenceAnomalies:[{reference_place_id:'REF',place_a_id:'ALPHA',place_b_id:'REF',anomaly:'PLACES_REFERENCEES_TROP_ELOIGNEES',distance_m:2224},{reference_place_id:'ABSENT',place_a_id:'MISSING',place_b_id:'',anomaly:'REFERENCE_INTROUVABLE',distance_m:''}],groupingCandidates:[{entity_type:'PLACES_PROCHES',place_a_id:'ALPHA',place_b_id:'BETA',distance_m:70}],timingPointIds:['001'],endpointStopIds:['001'],timingPointSource:'variants',parsed:{},mapping:{},decisions:[],unusedPlaceStops:[]};
const before=JSON.stringify(source);
for(const language of ['fr','en']){
  const html=ctx.assignmentDiagnosticsHtml(source,{radius:200,threshold:500,language}),view=vm.runInContext('assignmentDiagnosticView',ctx);
  assert.equal(view.entries.length,3);assert.equal(view.entries[0].kind,'reference');
  assert.ok(html.includes('1724 m.'));assert.ok(html.includes('East platform')&&html.includes('West platform'));
  assert.ok(html.includes('ad-tp tp')&&html.includes('ad-tp non-tp'));assert.ok(html.includes('code-description'));
  assert.ok(!html.includes('<iframe'),'Maps are lazy, not generated for every hidden record');
  assert.ok(html.includes(language==='en'?'Nearby places without a shared reference':'Places proches sans référence commune'));
  const map=ctx.assignmentDiagnosticMapHtml(view.entries[0]);assert.ok(map.includes('reference-relation'));assert.ok(map.includes('OpenStreetMap'));assert.ok(!map.includes('role="button"'),'No dead report-only popup controls');
  const missing=ctx.assignmentDiagnosticMapHtml(view.entries[1]);assert.ok(!missing.includes('<iframe'),'Never invent missing coordinates');
  assert.ok(ctx.assignmentDiagnosticCard(view.entries[1],false).includes('004'),'Unlocated stops remain in details');
  assert.ok(ctx.assignmentDiagnosticMapHtml(view.entries[2]).includes('review-distance-link'),'Suggested reference is distinguished from existing relation');
}
assert.equal(JSON.stringify(source),before,'Diagnostic must not change source associations or review choices');
const dedup=ctx.assignmentDiagnosticModel({...source,groupingCandidates:[...source.groupingCandidates,{...source.groupingCandidates[0],place_a_id:'BETA',place_b_id:'ALPHA'}]});
assert.equal(dedup.entries.filter(e=>e.kind==='grouping').length,1,'Reciprocal candidate pairs are deduplicated');
const many={...source,referenceAnomalies:Array.from({length:105},(_,i)=>({...source.referenceAnomalies[0],distance_m:600+i}))};
const manyHtml=ctx.assignmentDiagnosticsHtml(many,{language:'en'});assert.equal(vm.runInContext('assignmentDiagnosticView.entries.length',ctx),106);assert.equal((manyHtml.match(/class="ad-card"/g)||[]).length,8,'Pagination bounds initial rendering without losing cases');
vm.runInContext("assignmentDiagnosticQuery='West platform'",ctx);assert.ok(ctx.assignmentDiagnosticContent().includes('ALPHA'));
vm.runInContext("assignmentDiagnosticQuery='no-such-stop'",ctx);assert.ok(ctx.assignmentDiagnosticContent().includes('No cases match'));
vm.runInContext("assignmentDiagnosticQuery=''",ctx);
const hostile={...source,places:[{...source.places[0],description:'<img src=x onerror=alert(1)>'}]};assert.ok(!ctx.assignmentDiagnosticsHtml(hostile,{language:'en'}).includes('<img src=x'));
assert.ok(ctx.assignmentDiagnosticsHtml({places:[]},{language:'en'}).includes('does not replace operational validation'));
assert.ok(fs.readFileSync(path.join(root,'index.html'),'utf8').includes('assignment-diagnostics.js'));
assert.ok(fs.readFileSync(path.join(root,'app.js'),'utf8').includes('activateAssignmentDiagnostics();'));
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/assignment-diagnostics-fixture.json'),JSON.stringify(source));
console.log('PASS: assignment diagnosis, source immutability, references, non-shared nearby places, missing coordinates, TP/endpoints, deduplication, pagination, search, FR/EN and escaping.');
