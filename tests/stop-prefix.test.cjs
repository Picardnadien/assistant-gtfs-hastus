const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const fields={'app-language':{value:'fr'},'pad-place-codes':{checked:false},'use-canada-post-abbreviations':{checked:true},'place-code-max-length':{value:'8'}};
const context=vm.createContext({window:{},document:{getElementById:id=>fields[id]||{value:''}}});
vm.runInContext(fs.readFileSync('app.js','utf8').split('const decisionList=')[0],context);
const rows=['12','1234','EG450','A12','SOURCE'].map(stop_id=>({stop_id,stop_name:'Stop '+stop_id})),original=JSON.stringify(rows);
const padded=context.stopIdPaddingPlan(rows),prefixed=context.stopIdPrefixPlan(rows,padded.remap,'A');
assert.equal(prefixed.remap.get('12'),'A0012');assert.equal(prefixed.remap.get('EG450'),'AEG450');assert.equal(prefixed.remap.get('A12'),'AA12');assert.equal(prefixed.remap.get('SOURCE'),'ASOURCE');
assert.equal(context.stopIdPrefixPlan(rows,new Map(),'x').remap.get('12'),'x12');assert.equal(JSON.stringify(rows),original);
assert.equal(padded.remap.get('12'),'0012','Prefix does not mutate previous mapping');
for(const prefix of ['', 'AB','1','é',' A','/'])assert.throws(()=>context.stopIdPrefixPlan(rows,new Map(),prefix),/une seule lettre/);
assert.throws(()=>context.stopIdPrefixPlan(rows,new Map([['12','1234']]),'A'),/même identifiant/);
const technical=[{stop_id:'uuid',stop_name:'Technical'},{stop_id:'12',stop_name:'Numeric'}];
const technicalPadding=context.stopIdPaddingPlan(technical,new Map([['uuid','100001']]));
const combined=context.stopIdPrefixPlan(technical,technicalPadding.remap,'B');assert.equal(combined.remap.get('uuid'),'B100001');assert.equal(combined.remap.get('12'),'B000012');
const items=(...names)=>names.map((description,i)=>({id:String(i),description,lat:45,lon:-75}));
for(const av of ['AV','Av','av','Av.']){
 assert.equal(context.codeRoot('Victoria '+av),'VICTORIA');
 assert.equal(context.commonDescription(items('VICTORIA '+av+' + QUEEN ST','PARK ST + VICTORIA '+av)),'Victoria');
 assert.notEqual(context.commonDescription(items('MAIN '+av,'RIVER '+av)).toUpperCase(),'AV');
 assert.equal(context.commonDescription(items(av,av)),'Nouvelle place');
}
assert.equal(context.commonDescription(items('Av','Queen Street')),'Queen Street');
assert.equal(context.commonDescription(items('MAIN ROAD','RIVER ROAD')),'MAIN ROAD','A shared road type alone is not a place name');
assert.equal(context.codeRoot('Avondale Ave'),'AVONDALE','Exclude whole words only');
assert.equal(context.commonDescription(items('St Clair Station','St. Clair Station')),'St Clair Station');
// Existing source stations keep their identity after prefixing: no duplicate place.
vm.runInContext(`
 state.geographicClientType='existing';state.parsed.stops=parseCSV('stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\\n12,Stop,45,-75,0,SOURCE\\nSOURCE,Source station,45,-75,1,\\n');
 state.gtfsStops=state.parsed.stops.rows;state.parsed.times=parseCSV('trip_id,stop_id\\nt,12');
 state.places=[{id:'SOURCE',description:'Source station',lat:45,lon:-75}];
 state.decisions=[{id:'12',originalId:'12',description:'Stop',source:'existing',originalPlaceId:'SOURCE',status:'assigned',choice:'SOURCE',candidates:state.places}];
 state.stopIdRemap=stopIdPrefixPlan(state.gtfsStops,new Map(),'A').remap;
`,context);
const output=context.buildExports(),outStops=context.parseCSV(output.gtfs).rows;
assert.equal(outStops.length,2);assert.equal(outStops.find(row=>row.stop_id==='A12').parent_station,'ASOURCE');assert.equal(outStops.find(row=>row.stop_id==='ASOURCE').location_type,'1');
assert.equal(context.parseCSV(output.creations).rows.length,0);
const report=context.placeBrowserEditorData([{anchor:'source',code:'SOURCE',description:'Source station',lat:45,lon:-75,radius:200,items:[],candidates:[]}],{stops:context.parseCSV(output.gtfs),times:context.parseCSV(output.times)},'portrait','Test');
assert.equal(report.places[0].exportId,'ASOURCE');assert.equal(report.places[0].generated,false);
console.log('PASS: prefix composition, mixed IDs, case, invalid prefixes/collisions, immutable input, Av exclusion, meaningful fallback and Saint preservation.');
