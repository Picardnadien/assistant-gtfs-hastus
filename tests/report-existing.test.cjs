const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ctx=vm.createContext({console,URL,window:{},document:{getElementById:()=>({value:'300'})}});
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0],ctx);
vm.runInContext(fs.readFileSync(path.join(root,'report-editor.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'report-existing.js'),'utf8'),ctx);
const make=(id,lat=45.4,lon=-75.7)=>({id,description:`Place ${id}`,lat,lon,referenceIds:[],points:[{id:`stop-${id}`,description:`Physical stop ${id}`,lat:lat+.0004,lon:lon+.0003}]});
const source={places:[make('ZZZ'),make('AAA'),make('REF',45.42),make('MISS'),make('JOIN'),make('TARGET'),make('OLD'),...Array.from({length:18},(_,i)=>make(`QUIET${String(i).padStart(2,'0')}`,46+i*.01))],
  mapping:{stopId:'Stop',stopDesc:'Description',placeId:'Place',placeDesc:'Name',referenceId:'Refer.',lat:'Lat',lon:'Lon'},
  parsed:{hastus:{rows:[{Stop:'bad-stop',Description:'Missing coordinates',Place:'BAD',Name:'Unlocated place',Lat:'',Lon:''}]}},
  referenceAnomalies:[{reference_place_id:'REF',place_a_id:'AAA',place_b_id:'ZZZ',anomaly:'PLACES_REFERENCEES_TROP_ELOIGNEES',distance_m:800},{reference_place_id:'ABSENT',place_a_id:'MISS',place_b_id:'',anomaly:'REFERENCE_INTROUVABLE',distance_m:''}],
  groupingCandidates:[{entity_type:'PLACES_PROCHES',place_a_id:'JOIN',place_b_id:'TARGET',distance_m:40},{entity_type:'STOP_SANS_PLACE',place_a_id:'TARGET',stop_id:'new-stop',stop_description:'New stop',distance_m:20}],
  decisions:[{id:'stop-OLD',description:'Reassigned stop',originalPlaceId:'OLD',choice:'TARGET',status:'review',lat:45.4,lon:-75.72},{id:'new-stop',description:'New stop',choice:'__new__',newCode:'NEW',status:'review',lat:45.4,lon:-75.7},{id:'missing-stop',description:'Missing stop',status:'error',error:'Missing from input'},{id:'quiet',originalPlaceId:'QUIET00',choice:'QUIET00',status:'assigned'}],
  unusedPlaceStops:[{place_id:'JOIN',stop_id:'non-tp',stop_description:'Not timed',status:'ABSENT_DES_VERSIONS'}],threshold:700,radius:200};
source.timingPointIds=[':STOP-AAA','stop-OLD','new-stop'];source.timingPointSource='variants';
source.places.find(p=>p.id==='AAA').referenceIds=['REF'];
source.places.find(p=>p.id==='ZZZ').referenceIds=['REF'];
source.places.find(p=>p.id==='MISS').referenceIds=['ABSENT'];
source.places.find(p=>p.id==='AAA').points.push({id:'other-AAA',description:'Non TP at the same place',lat:45.401,lon:-75.702});
const before=JSON.stringify(source),model=ctx.existingClientReportModel(source);
assert.equal(model.byId.get('AAA').stops.find(s=>s.id==='stop-AAA').timing,true);
assert.equal(model.byId.get('AAA').stops.find(s=>s.id==='other-AAA').timing,false);
const unknown=ctx.existingClientReportModel({...source,timingPointIds:undefined});assert.equal(unknown.byId.get('AAA').stops[0].timing,null);
const aliased=ctx.existingClientReportModel({...source,associationKey:'stop_code',timingPointIds:['uuid-1'],gtfsStops:[{stop_id:'uuid-1',stop_code:':stop-AAA'}]});
assert.equal(aliased.byId.get('AAA').stops.find(s=>s.id==='stop-AAA').timing,true,'TP join follows selected GTFS stop_code mapping');
const notAliased=ctx.existingClientReportModel({...source,associationKey:'stop_id',timingPointIds:['uuid-1'],gtfsStops:[{stop_id:'uuid-1',stop_code:'stop-AAA'}]});
assert.equal(notAliased.byId.get('AAA').stops.find(s=>s.id==='stop-AAA').timing,false,'do not join unselected code aliases');
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
assert.ok(ctx.existingReportPlaceBadge(model.byId.get('AAA'),vm.runInContext('EXISTING_REPORT_TEXT.fr',ctx)).includes('class="code-stops"'));
assert.equal(points.find(p=>p.id==='stop-AAA').placeId,'AAA');
assert.notEqual(points[0].lat,points[1].lat,'Stops keep physical coordinates instead of place centre');
const geometry=ctx.existingReportMapGeometry(points);
const distanceText=vm.runInContext('EXISTING_REPORT_TEXT.en',ctx);
const distancePoints=[{id:'A',kind:'place',lat:45,lon:-75,references:['B'],distanceTargets:['B']},{id:'B',kind:'place',lat:45.001,lon:-75,references:['A']},{id:'C',kind:'place',lat:45.01,lon:-75}];
const distanceMap=ctx.existingReportMap(distancePoints,[],distanceText);
assert.equal((distanceMap.match(/class="review-distance"/g)||[]).length,1,'Reciprocal links and case targets do not duplicate distances');
assert.ok(distanceMap.includes('111 m')&&distanceMap.includes('Straight-line distance'));
assert.ok(!distanceMap.includes('data-to="C"'),'Unrelated context places do not generate a full distance matrix');
assert.ok(!ctx.existingReportMap([distancePoints[0]],[],distanceText).includes('class="review-distance"'),'Unknown reference coordinates do not create a distance');
assert.ok(ctx.existingReportMap([{...distancePoints[0],references:[],distanceTargets:['B']},{...distancePoints[1],references:[]}],null,distanceText).includes('review-distance-link'),'Suggested grouping also receives a visible measurement');
const tightPoints=[{id:'P',description:'Place',kind:'place',lat:45.4,lon:-75.7},{id:'TP',kind:'stop',timing:true,lat:45.4001,lon:-75.7001},{id:'FAR',kind:'stop',timing:false,lat:45.45,lon:-75.75}];
assert.ok(ctx.existingReportMapGeometry(tightPoints.filter(p=>p.kind==='place'||p.timing)).zoom>ctx.existingReportMapGeometry(tightPoints).zoom,'TP view can frame closer after excluding distant non-TP stops');
assert.equal(ctx.existingReportMapGeometry([tightPoints[0]]).zoom,18,'Single-location view retains street context');
assert.equal(ctx.existingReportMapGeometry(tightPoints.slice(0,2)).zoom,19,'Nearby distinct locations allow a closer zoom');
for(const p of points){const world=ctx.osmProject(p.lat,p.lon,geometry.zoom);assert.ok(Math.abs(world.x-geometry.center.x)<geometry.width/2);assert.ok(Math.abs(world.y-geometry.center.y)<geometry.height/2);}
const features=[{tags:{highway:'primary',name:'Main Street'},geometry:[{lat:45.399,lon:-75.701},{lat:45.400,lon:-75.700},{lat:45.401,lon:-75.699}]}];
// Shared notation handles parent+child roles, multiple refs, self refs and cycles.
const hierarchySource={places:[{...make('ROOT'),referenceIds:['ROOT']},{...make('MID'),referenceIds:['ROOT']},{...make('LEAF'),referenceIds:['MID','ROOT','MID']},make('FREE'),{...make('LOST'),referenceIds:['MISSING']},{...make('A'),referenceIds:['B']},{...make('B'),referenceIds:['A']}]};
const hierarchyBefore=JSON.stringify(hierarchySource),hierarchy=ctx.existingClientReportModel(hierarchySource);
assert.equal(ctx.existingReportPlaceCode(hierarchy.byId.get('ROOT')),'ROOT · Référence — Rattachées : LEAF · MID');
assert.equal(ctx.existingReportPlaceCode(hierarchy.byId.get('MID')),'MID · Référence — Rattachées : LEAF — Référence à vérifier : ROOT');
assert.equal(ctx.existingReportPlaceCode(hierarchy.byId.get('LEAF')),'LEAF | Réf. MID, ROOT');
assert.equal(ctx.existingReportPlaceCode(hierarchy.byId.get('FREE')),'FREE');
const hierarchyText=vm.runInContext('EXISTING_REPORT_TEXT.en',ctx);
const cyclePoints=ctx.existingReportMapPoints([hierarchy.byId.get('A')],[],hierarchy);
assert.equal(cyclePoints.filter(p=>p.kind==='place').length,2,'Cycles have finite one-hop context');
assert.equal((ctx.existingReportMap(cyclePoints,features,hierarchyText).match(/class="reference-relation"/g)||[]).length,1,'Reciprocal relationships do not draw duplicate lines');
const missingPoints=ctx.existingReportMapPoints([hierarchy.byId.get('LOST')],[],hierarchy);
assert.equal(missingPoints.filter(p=>p.kind==='place').length,1,'Missing reference centres are never fabricated');
assert.ok(!ctx.existingReportMap(missingPoints,features,hierarchyText).includes('class="reference-relation"'));
assert.equal(JSON.stringify(hierarchySource),hierarchyBefore);
const longPoint={id:'HUB',kind:'place',isReference:true,lat:45.4,lon:-75.7,description:'Long reference label',attachedCodes:Array.from({length:20},(_,i)=>'PLACE'+i)};
const longMap=ctx.existingReportMap([longPoint],features,hierarchyText);
assert.ok((longMap.match(/class="map-code-detail"/g)||[]).length>1&&longMap.includes('PLACE19'),'Long attached-place lists wrap rather than being truncated');
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
// Screenshot regression: the reference itself can be one member of the pair.
const duplicateReferenceSource={places:[{...make('5520'),description:'Confederation Square',referenceIds:['5523']},{...make('5523'),description:'Elgin / Sparks'}],referenceAnomalies:[
  {reference_place_id:'5523',place_a_id:'5520',place_b_id:'5523',anomaly:'PLACES_REFERENCEES_TROP_ELOIGNEES',distance_m:800},
  {reference_place_id:'5523',place_a_id:'5523',place_b_id:'5520',anomaly:'PLACES_REFERENCEES_TROP_ELOIGNEES',distance_m:800},
  {reference_place_id:'5523',place_a_id:'5523',place_b_id:'5523',anomaly:'PLACES_REFERENCEES_TROP_ELOIGNEES',distance_m:0}
]};
const duplicateReferenceBefore=JSON.stringify(duplicateReferenceSource),duplicateReferenceModel=ctx.existingClientReportModel(duplicateReferenceSource);
for(const language of ['fr','en']){
  const cases=ctx.existingClientReportCases(duplicateReferenceModel,language);
  for(const c of cases.filter(c=>c.kind==='reference')){
    for(const html of [c.titleHtml,c.overviewCodesHtml])assert.equal((html.match(/<b class="code-main">5523<\/b>/g)||[]).length,1,'Main reference badge is not repeated');
    assert.equal((c.titleHtml.match(/Elgin \/ Sparks/g)||[]).length,1,'Reference description remains visible exactly once');
    assert.equal((c.overviewDescriptionsHtml.match(/Elgin \/ Sparks/g)||[]).length,1);
    const heading=c.html.split('</p>')[0];assert.equal((heading.match(/<b class="code-main">5523<\/b>/g)||[]).length,1,'Reference context links are also deduplicated');
  }
  assert.ok(cases[0].titleHtml.includes('<span class="reference-chip">5523</span>'),'Meaningful small reference chip on the attached place remains');
  assert.ok(cases[0].titleHtml.includes('Confederation Square')&&cases[0].titleHtml.includes('↔'));
  const t=vm.runInContext(`EXISTING_REPORT_TEXT.${language}`,ctx),maps=Object.fromEntries(cases.map(c=>[c.id,ctx.existingReportMap(c.points,features,t)]));
  const html=ctx.existingClientReportHtml(duplicateReferenceModel,cases,maps,{language,theme:'clean',logo:'',brand:'Test',client:'Synthetic',date:'2026-10-07',offline:true});
  fs.writeFileSync(path.join(root,`tmp/report-existing-deduplicated-${language}.html`),html);
}
assert.equal(JSON.stringify(duplicateReferenceSource),duplicateReferenceBefore,'Display deduplication leaves source data untouched');
for(const language of ['fr','en']){
  const cases=ctx.existingClientReportCases(model,language),t=vm.runInContext(`EXISTING_REPORT_TEXT.${language}`,ctx);
  const tpView=ctx.existingReportTimingPointView(model,language);
  const tpAaa=tpView.cases.find(c=>c.kind==='place'&&c.code==='AAA');
  assert.ok(tpAaa.html.includes('stop-AAA')&&!tpAaa.html.includes('other-AAA'),'TP view excludes non-TP stops');
  assert.ok(!tpView.cases.some(c=>c.kind==='issue'),'Unknown/non-TP unresolved stops are excluded');
  assert.equal(tpView.cases.filter(c=>c.kind==='reference').length,2,'Reference context is retained');
  assert.ok(!JSON.stringify(tpView.csvRows).includes('other-AAA'),'CSV follows TP scope');
  assert.ok(tpView.cases.find(c=>c.code==='QUIET00').html.includes(t.noTpStops));
  assert.equal(JSON.stringify(source),before,'Viewing scope never mutates source');
  const aaa=cases.find(c=>c.kind==='place'&&c.code==='AAA'),joined=cases.find(c=>c.kind==='place'&&c.code==='JOIN');
  assert.ok(joined.points.find(p=>p.id==='JOIN'&&p.kind==='place').distanceTargets.includes('TARGET'),'Suggested pair is passed to both online and offline map rendering');
  assert.ok(aaa.html.includes(t.referencePlace)&&aaa.html.includes('REF'));
  assert.ok(aaa.html.includes(t.tp)&&aaa.html.includes(t.nonTp));
  assert.ok(joined.title.includes('JOIN')&&joined.title.includes('TARGET')&&joined.title.includes('↔'));
  assert.ok(joined.titleHtml.includes('<b class="code-main">JOIN</b>'));
  assert.ok(joined.titleHtml.includes('<strong class="place-description">Place JOIN</strong>'));
  const reference=cases.find(c=>c.kind==='reference');
  assert.ok(reference.title.startsWith('REF · '+t.referenceRole));
  assert.ok(reference.titleHtml.includes('<span class="code-role">'+t.referenceRole+'</span>'));
  assert.ok(reference.titleHtml.includes(t.attachedPlaces+' : <span class="code-children">AAA · ZZZ</span>'));
  assert.ok(!reference.titleHtml.includes(t.referencePlace),'Reference titles use the compact badge in both languages');
  assert.ok(aaa.html.includes('<span class="place-code reference-code"><span class="code-heading"><b class="code-main">REF</b>'),'Reference links and table cells share the purple badge');
  assert.ok(aaa.titleHtml.includes('<b class="code-main">AAA</b>')&&aaa.titleHtml.includes(t.shortRef+' <span class="reference-chip">REF</span>'),'Attached places include their actual reference in a separate compact chip');
  assert.ok(cases.find(c=>c.kind==='place'&&c.code==='REF').titleHtml.includes('class="place-code reference-code"'),'Reference identity stays purple on its own card');
  assert.ok(cases.find(c=>c.kind==='reference'&&c.code==='ABSENT').html.includes('<b class="code-main">ABSENT</b>'),'Missing references are also styled, without inventing a map position');
  assert.ok(joined.overviewCodesHtml.includes('JOIN')&&joined.overviewCodesHtml.includes('TARGET'));
  assert.ok(!joined.overviewCodesHtml.includes('Place JOIN'),'Codes column excludes descriptions');
  assert.ok(joined.overviewDescriptionsHtml.includes('Place JOIN')&&joined.overviewDescriptionsHtml.includes('Place TARGET'));
  assert.ok(!joined.overviewDescriptionsHtml.includes('class="place-code"'),'Descriptions column excludes code badges');
  for(const c of cases){
    assert.ok(!/<div|<br/.test(c.overviewCodesHtml+c.overviewDescriptionsHtml),'Overview entries contain no forced line breaks');
  }
  assert.ok(joined.overviewDescriptionsHtml.includes(' ↔ '),'Inline descriptions follow code order');
  assert.ok(!cases.some(c=>/Place Code|Code place/.test(c.title+c.titleHtml+c.html)));
  assert.ok(aaa.html.includes('Stop ID:'));
  const rows=ctx.existingReportCsvRows(model,cases,t),csv=ctx.existingReportCsv(Object.values(rows).flat()),parsedCsv=ctx.parseCSV(csv);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(parsedCsv.headers.includes('reference_place_codes'));
  assert.ok(rows[aaa.id].some(row=>row.stop_id==='stop-AAA'&&row.tp_status===t.tp&&row.reference_place_codes==='REF'));
  assert.ok(rows[joined.id].some(row=>row.related_place_code==='TARGET'&&row.record_type==='grouping_proposal'));
  const escapedCsv=ctx.existingReportCsv([{place_code:'0012',stop_description:'=HYPERLINK("x")\nquoted, text',latitude:-75.7}]);
  const roundtrip=ctx.parseCSV(escapedCsv).rows[0];assert.equal(roundtrip.place_code,'0012');assert.equal(roundtrip.stop_description,"'=HYPERLINK(\"x\")\nquoted, text");assert.equal(roundtrip.latitude,'-75.7');
  assert.equal(cases[0].kind,'reference');assert.equal(cases[1].kind,'reference');assert.equal(cases.filter(c=>c.kind==='place').length,model.places.length);
  for(const offline of [false,true]){
    const maps=Object.fromEntries(cases.map(c=>[c.id,ctx.existingReportMap(c.points,offline?features:null,t)]));
    const tpMaps=Object.fromEntries(cases.map(c=>[c.id,ctx.existingReportMap(c.points.filter(p=>p.kind==='place'||p.timing===true),offline?features:null,t)]));
    const html=ctx.existingClientReportHtml(model,cases,maps,{language,tpMaps,theme:'clean',logo:'',brand:'<strong>OC Transpo · test</strong>',client:'OC Transpo · test',date:'2026-10-02',offline});
    assert.ok(html.includes(`lang="${language}"`));assert.ok(!html.includes('stop_times.txt'));assert.ok(!html.includes('report-data'));
    assert.ok(html.includes('id="export-assessment-csv"')&&html.includes('id="print-assessment"')&&html.includes('id="assessment-guide"'),'toolbar and guide must exist in actual markup, not only runtime source');
    assert.ok(html.includes('.marker.non-tp circle{fill:#c46b12}'));
    assert.ok(maps[aaa.id].includes('stop tp')&&maps[aaa.id].includes('stop non-tp'));
    assert.ok(maps[aaa.id].includes('Stops : other-AAA · stop-AAA'),'Place labels list actual attached physical stops compactly');
    assert.ok(!tpMaps[aaa.id].includes('other-AAA'),'TP label excludes non-TP stops');
    assert.ok(!/Place Code:|Code place:/.test(maps[aaa.id]));
    assert.ok(maps[reference.id].includes('class="reference-label"')&&maps[reference.id].includes(t.attachedPlaces+' : AAA · ZZZ'),'Reference map labels use the same purple palette and compact second line');
    assert.ok(maps[aaa.id].includes('class="map-reference-chip"'),'Map matches the nested reference-chip design');
    assert.ok(html.includes('.code-heading{display:flex;')&&html.includes('.marker.place rect.map-reference-chip{'),'Compact styles are present in standalone reports and print');
    assert.ok(maps[reference.id].includes('data-reference="REF" data-place="AAA"'));
    assert.ok(maps[reference.id].includes('data-reference="REF" data-place="ZZZ"'));
    assert.equal((maps[reference.id].match(/class="reference-relation"/g)||[]).length,2,'Only actual reference relationships are drawn');
    assert.ok(!maps[joined.id].includes('class="reference-relation"'),'Suggested grouping is not an existing reference assignment');
    assert.ok(maps[aaa.id].includes('data-reference="REF" data-place="AAA"'),'Individual place maps include their reference centre');
    assert.ok(tpMaps[aaa.id].includes('data-reference="REF" data-place="AAA"'),'TP filter preserves place-reference connections');
    assert.ok(maps[aaa.id].includes('class="place-label"'),'Ordinary places also have readable badges');
    for(const match of maps[reference.id].matchAll(/class="(?:place|reference)-label" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)){
      const [,x,y,w,h]=match.map(Number);assert.ok(x>=8&&x+w<=992&&y>=8&&y+h<=402,'Badges stay inside the map');
    }
    assert.ok(html.includes('<th>'+t.code+'</th><th>'+t.description+'</th>'),'Overview has separate translated columns');
    assert.ok(html.includes('id="stop-scope"')&&html.includes(t.tpOnly),'FR/EN stop-scope control is embedded');
    new vm.Script(html.match(/<script>\(([\s\S]*?)<\/script>/)[0].replace(/^<script>/,'').replace(/<\/script>$/,''));
    if(offline){assert.ok(!html.includes('<iframe'));assert.ok(!html.includes('tile.openstreetmap'));assert.ok(html.includes('osm-road major'));}
    else {assert.ok(html.includes('inert tabindex=\\"-1\\"'));assert.ok(html.includes('pointer-events:none'));}
    fs.writeFileSync(path.join(root,`tmp/report-editor-existing-${language}-${offline?'offline':'online'}.html`),html);
  }
}
const hostile={...source,places:[{...make('X'),description:'</script><script>alert(1)</script>'}],referenceAnomalies:[],groupingCandidates:[],decisions:[],unusedPlaceStops:[],parsed:{}};
const hostileModel=ctx.existingClientReportModel(hostile),hostileCases=ctx.existingClientReportCases(hostileModel,'en');
assert.ok(!hostileCases[0].titleHtml.includes('<script>'),'Formatted descriptions remain HTML-escaped');
const duplicateModel=ctx.existingClientReportModel({places:[{...make('PICO'),description:'PICO'}]});
const duplicate=ctx.existingClientReportCases(duplicateModel,'en')[0];
assert.equal(duplicate.titleHtml,'<span class="place-code"><span class="code-heading"><b class="code-main">PICO</b></span><span class="code-stops" title="Stops : stop-PICO">Stops : stop-PICO</span></span> <strong class="place-description">PICO</strong>','Identical code and description still have distinct visual roles');
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

// Print preparation must include every filtered case, including later UI pages.
async function testPrint(){
  const cases=ctx.existingClientReportCases(model,'en'),t=vm.runInContext('EXISTING_REPORT_TEXT.en',ctx),nodes=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,{value:['kind','type','stop-scope'].includes(id)?'all':'',innerHTML:'',textContent:'',hidden:false,addEventListener(event,handler){this[event]=handler;},querySelectorAll:()=>[],querySelector:()=>null,showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
  const maps=Object.fromEntries(cases.map(c=>[c.id,ctx.existingReportMap(c.points,features,t)]));
  const tpMaps=Object.fromEntries(cases.map(c=>[c.id,ctx.existingReportMap(c.points.filter(p=>p.kind==='place'||p.timing===true),features,t)]));
  get('assessment-data').textContent=JSON.stringify({cases:cases.map(({points,...c})=>c),maps,tpMaps,text:t,csvRows:ctx.existingReportCsvRows(model,cases,t),tpView:ctx.existingReportTimingPointView(model,'en'),filename:'Synthetic'});
  const printed=[],preview={closed:false,document:{open(){},write(html){this.html=html;},close(){},createElement:()=>({}),getElementById:id=>id==='print-cases'?{append:node=>printed.push(node)}:{}},print(){}};
  const printCtx=vm.createContext({console,setTimeout,window:{open:()=>preview,addEventListener(){}},location:{hash:''},document:{getElementById:get,documentElement:{lang:'en'},querySelectorAll:()=>[],querySelector:()=>({outerHTML:'<header>CSched test</header>'}),addEventListener(){}}});
  vm.runInContext(fs.readFileSync(path.join(root,'report-existing.js'),'utf8'),printCtx);
  printCtx.existingClientReportRuntime(printCtx.existingReportCsv);
  assert.ok(get('page-status').textContent.includes('Page 1 / 3'));
  get('open-assessment-guide').onclick();assert.equal(get('assessment-guide').open,true);
  await get('print-assessment').onclick();assert.equal(printed.length,cases.length,'print includes all pages');
  assert.ok(preview.document.html.includes('Save as PDF'));assert.ok(printed.some(node=>node.innerHTML.includes('QUIET17')));
  assert.ok(printed.some(node=>node.innerHTML.includes('<strong class="place-description">Place JOIN</strong>')),'Print retains description emphasis');
  assert.ok(get('overview-body').innerHTML.includes('class="place-code"'),'Overview uses formatted identities');
  assert.equal(get('print-assessment').disabled,false);
  get('stop-scope').value='tp';get('stop-scope').change();
  assert.ok(get('cases').innerHTML.includes('stop-AAA')&&!get('cases').innerHTML.includes('other-AAA'));
  printed.length=0;await get('print-assessment').onclick();
  assert.equal(printed.length,cases.length-1,'Filtered print omits unresolved non-TP case');
  assert.ok(!printed.some(node=>node.innerHTML.includes('other-AAA')),'Filtered print removes non-TP map markers as well as table rows');
  assert.ok(printed.some(node=>node.innerHTML.includes('Attached places : AAA · ZZZ')),'Compact place/reference map labels are preserved');
  assert.ok(printed.some(node=>node.innerHTML.includes(tpMaps[cases[0].id])),'Print uses the reframed TP map');
  get('stop-scope').value='all';get('stop-scope').change();
  assert.ok(get('cases').innerHTML.includes('other-AAA'),'All-stops option restores original content');
  console.log('PASS: live guide and print preview of all 30 filtered records, not only the first page.');
}
testPrint().catch(error=>{console.error(error);process.exitCode=1;});

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
