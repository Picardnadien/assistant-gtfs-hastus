const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ctx=vm.createContext({console,URL,window:{},document:{getElementById:()=>({value:'300'})}});
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0],ctx);
vm.runInContext(fs.readFileSync(path.join(root,'report-existing.js'),'utf8'),ctx);
const make=(id,lat=45.4,lon=-75.7)=>({id,description:`Place ${id}`,lat,lon,referenceIds:[],points:[{id:`stop-${id}`,description:`Physical stop ${id}`,lat:lat+.0004,lon:lon+.0003}]});
const source={places:[make('ZZZ'),make('AAA'),make('REF',45.42),make('MISS'),make('JOIN'),make('TARGET'),make('OLD'),...Array.from({length:18},(_,i)=>make(`QUIET${String(i).padStart(2,'0')}`,46+i*.01))],
  mapping:{stopId:'Stop',stopDesc:'Description',placeId:'Place',placeDesc:'Name',referenceId:'Refer.',lat:'Lat',lon:'Lon'},
  parsed:{hastus:{rows:[{Stop:'bad-stop',Description:'Missing coordinates',Place:'BAD',Name:'Unlocated place',Lat:'',Lon:''}]}},
  referenceAnomalies:[{reference_place_id:'REF',place_a_id:'AAA',place_b_id:'ZZZ',anomaly:'PLACES_REFERENCEES_TROP_ELOIGNEES',distance_m:800},{reference_place_id:'ABSENT',place_a_id:'MISS',place_b_id:'',anomaly:'REFERENCE_INTROUVABLE',distance_m:''}],
  groupingCandidates:[{entity_type:'PLACES_PROCHES',place_a_id:'JOIN',place_b_id:'TARGET',distance_m:40},{entity_type:'STOP_SANS_PLACE',place_a_id:'TARGET',stop_id:'new-stop',stop_description:'New stop',distance_m:20}],
  decisions:[{id:'stop-OLD',description:'Reassigned stop',originalPlaceId:'OLD',choice:'TARGET',status:'review',lat:45.4,lon:-75.72},{id:'new-stop',description:'New stop',choice:'__new__',newCode:'NEW',status:'review',lat:45.4,lon:-75.7},{id:'missing-stop',description:'Missing stop',status:'error',error:'Missing from input'},{id:'quiet',originalPlaceId:'QUIET00',choice:'QUIET00',status:'assigned'}],
  unusedPlaceStops:[{place_id:'JOIN',stop_id:'non-tp',stop_description:'Not timed',status:'ABSENT_DES_VERSIONS'}],threshold:700,radius:200};
const before=JSON.stringify(source),model=ctx.existingClientReportModel(source);
assert.equal(JSON.stringify(source),before,'Model must not mutate source assignments');
assert.equal(model.byId.get('REF').primary,'distantReference','The reference itself is included in suspect places');
assert.equal(model.byId.get('MISS').primary,'missingReference');
assert.equal(model.byId.has('ABSENT'),false,'Missing reference must not become a fictitious existing place');
assert.equal(model.byId.get('BAD').stops[0].lat,null);assert.ok(model.byId.get('BAD').tags.includes('data'));
assert.ok(model.byId.get('JOIN').tags.includes('grouping'));assert.ok(model.byId.get('JOIN').tags.includes('unused'));
assert.equal(model.byId.get('QUIET00').primary,'none');
assert.equal(model.byId.get('NEW').proposed,true);assert.equal(model.byId.get('NEW').stops.length,0);
assert.equal(model.byId.get('OLD').stops[0].id,'stop-OLD');assert.equal(model.byId.get('TARGET').stops.length,1,'Do not apply proposals to current assignments');
assert.equal(model.unresolved.length,1);
assert.deepEqual(Array.from(model.places.filter(p=>p.primary==='distantReference'),p=>p.id),['AAA','REF','ZZZ']);
const unique=new Set(model.places.map(p=>p.id));assert.equal(model.places.length,unique.size);
const points=ctx.existingReportMapPoints([model.byId.get('AAA'),model.byId.get('REF')]);
assert.notEqual(points[0].lat,points[1].lat,'Stops keep physical coordinates instead of place centre');
const geometry=ctx.existingReportMapGeometry(points);
for(const p of points){const world=ctx.osmProject(p.lat,p.lon,geometry.zoom);assert.ok(Math.abs(world.x-geometry.center.x)<geometry.width/2);assert.ok(Math.abs(world.y-geometry.center.y)<geometry.height/2);}
const features=[{tags:{highway:'primary',name:'Main Street'},geometry:[{lat:45.399,lon:-75.701},{lat:45.400,lon:-75.700},{lat:45.401,lon:-75.699}]}];
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
for(const language of ['fr','en']){
  const cases=ctx.existingClientReportCases(model,language),t=vm.runInContext(`EXISTING_REPORT_TEXT.${language}`,ctx);
  assert.equal(cases[0].kind,'reference');assert.equal(cases[1].kind,'reference');assert.equal(cases.filter(c=>c.kind==='place').length,model.places.length);
  for(const offline of [false,true]){
    const maps=Object.fromEntries(cases.map(c=>[c.id,ctx.existingReportMap(c.points,offline?features:null,t)]));
    const html=ctx.existingClientReportHtml(model,cases,maps,{language,theme:'clean',logo:'',brand:'<strong>OC Transpo · test</strong>',client:'OC Transpo · test',date:'2026-10-02',offline});
    assert.ok(html.includes(`lang="${language}"`));assert.ok(!html.includes('stop_times.txt'));assert.ok(!html.includes('report-data'));
    new vm.Script(html.match(/<script>\(([\s\S]*?)<\/script>/)[0].replace(/^<script>/,'').replace(/<\/script>$/,''));
    if(offline){assert.ok(!html.includes('<iframe'));assert.ok(!html.includes('tile.openstreetmap'));assert.ok(html.includes('osm-road major'));}
    else {assert.ok(html.includes('inert tabindex=\\"-1\\"'));assert.ok(html.includes('pointer-events:none'));}
    fs.writeFileSync(path.join(root,`tmp/report-editor-existing-${language}-${offline?'offline':'online'}.html`),html);
  }
}
const hostile={...source,places:[{...make('X'),description:'</script><script>alert(1)</script>'}],referenceAnomalies:[],groupingCandidates:[],decisions:[],unusedPlaceStops:[],parsed:{}};
const hostileModel=ctx.existingClientReportModel(hostile),hostileCases=ctx.existingClientReportCases(hostileModel,'en');
const safe=ctx.existingClientReportHtml(hostileModel,hostileCases,{}, {language:'en',theme:'classic',logo:'',brand:'',client:'<img src=x onerror=alert(1)>',date:'test',offline:true});
assert.ok(!safe.includes('<script>alert(1)'));assert.ok(!safe.includes('<img src=x onerror='));
if(process.argv[2]){
  const raw=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  raw.mapping={stopId:'Stop',stopDesc:'Description',placeId:'Place',placeDesc:'Description1',referenceId:'Refer.',lat:'Loca latitude',lon:'Loca longitude'};
  raw.places=ctx.buildPlaces(raw.parsed.hastus.rows,raw.mapping);
  Object.assign(raw,ctx.analyzePlaceRelationships(raw.places,200,500));
  const m=ctx.existingClientReportModel(raw),c=ctx.existingClientReportCases(m,'fr');
  const originalCodes=new Set(raw.parsed.hastus.rows.map(row=>String(row.Place||'').trim()).filter(Boolean));
  assert.equal(m.places.length,originalCodes.size);assert.equal(c.filter(x=>x.kind==='reference').length,raw.referenceAnomalies.length);
  console.log(`Real HASTUS: ${m.places.length} unique places, ${m.anomalies.length} reference cases; none omitted.`);
}
console.log('PASS: existing-client classifications, overlapping alerts, all places, original vs proposed assignments, physical coordinates, FR/EN, fixed online/offline maps and safe HTML.');

// Application wiring: the report is available immediately after the first existing-client analysis.
const elements=new Map();
ctx.document.body={classList:{toggle(){}}};
ctx.document.getElementById=id=>{
  if(!elements.has(id))elements.set(id,{value:'300',options:[{value:'all'},{value:'assigned'},{value:'review'}],
    classList:{toggle(name,active){this[name]=active;},add(){},remove(){}},closest(){return this;}});
  return elements.get(id);
};
vm.runInContext(`refreshClientBrandStatus=()=>{};activateGroupingCandidateMaps=()=>{};activateDecisionMaps=()=>{};groupErrorSummary=()=>'';radiusConflictSummary=()=>'';pamphletOffer=()=>'';
  state.mode='geographic';state.geographicReady=true;state.geographicClientType='existing';render();`,ctx);
assert.equal(elements.get('download-existing-html').classList.hidden,false);
assert.equal(elements.get('place-report-panel').classList.hidden,false);
vm.runInContext(`state.geographicClientType='new';render();`,ctx);
assert.equal(elements.get('download-existing-html').classList.hidden,true);

(async()=>{
  ctx.setTimeout=setTimeout;ctx.fixture=source;
  vm.runInContext(`Object.assign(state,fixture);state.mode='geographic';state.geographicReady=true;state.geographicClientType='existing';`,ctx);
  ctx.cschedLogoDataUrl=async()=>'';ctx.fetchOfflineOsmFeatures=async()=>features;
  let downloaded;ctx.download=(name,html,type)=>downloaded={name,html,type};
  const button=ctx.document.getElementById('download-existing-html');button.textContent='Diagnostic HASTUS';
  ctx.document.getElementById('place-report-html-map-mode').value='offline';
  await ctx.downloadExistingClientReport();
  assert.equal(downloaded.type,'text/html');assert.ok(downloaded.name.includes('diagnostic_HASTUS'));
  assert.ok(downloaded.html.includes('assessment-data'));assert.equal(button.disabled,false);assert.equal(button.textContent,'Diagnostic HASTUS');
  ctx.fetchOfflineOsmFeatures=async()=>{throw new Error('OSM unavailable');};
  await assert.rejects(ctx.downloadExistingClientReport(),/OSM unavailable/);
  assert.equal(button.disabled,false);assert.equal(button.textContent,'Diagnostic HASTUS');
  console.log('PASS: existing-client report button, HASTUS-only download, error recovery and new-client report unchanged.');
})().catch(error=>{console.error(error);process.exitCode=1;});
