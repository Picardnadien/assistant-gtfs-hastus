const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const fields={'place-code-max-length':{value:'8'},'place-code-case':{value:'upper'},'pad-place-codes':{checked:false},'radius':{value:'200'},'app-language':{value:'fr'}};
const c=vm.createContext({console,window:{},document:{getElementById:id=>fields[id]||{value:''}}}),src=fs.readFileSync('app.js','utf8');
vm.runInContext(src.split('const decisionList=')[0],c);
const rows=['12','9876','EG450','AB1234567'].map(stop_id=>({stop_id,stop_name:'Stop '+stop_id})),before=JSON.stringify(rows);
let plan=c.stopIdPaddingPlan(rows);assert.equal(plan.width,4);assert.equal(plan.remap.get('12'),'0012');assert.equal(plan.remap.has('EG450'),false);assert.equal(plan.remap.has('AB1234567'),false);assert.equal(JSON.stringify(rows),before);
assert.equal(c.stopIdPaddingPlan(rows,new Map(),'6').remap.get('12'),'000012');
for(const width of ['3','2.5','1001','x'])assert.throws(()=>c.stopIdPaddingPlan(rows,new Map(),width));
assert.throws(()=>c.stopIdPaddingPlan([{stop_id:'12'},{stop_id:'0012'}]),/même identifiant/);
plan=c.stopIdPaddingPlan([{stop_id:'uuid'},{stop_id:'1'}],new Map([['uuid','100001']]));assert.equal(plan.remap.get('uuid'),'100001');assert.equal(plan.remap.get('1'),'000001');
for(const length of ['6','8'])for(const casing of ['upper','lower']){
 fields['place-code-max-length'].value=length;fields['place-code-case'].value=casing;
 assert.equal(c.codeRoot('Main St'),casing==='upper'?'MAIN':'main');
 assert.ok(c.codeRoot('Bay Station').endsWith(casing==='upper'?'STN':'stn'));
 const used=new Set();for(let i=0;i<60;i++){const code=c.uniqueCode('Main St',used);assert.ok(code.length<=Number(length));}assert.equal(used.size,60);
 fields['pad-place-codes'].checked=true;assert.equal(c.codeRoot('Main St').length,Number(length));fields['pad-place-codes'].checked=false;
}
vm.runInContext(`state.groups=[{id:'a',code:'ARENA',description:'Arena',lat:45,lon:-75,radius:200,items:[{id:'1',description:'First stop',lat:45,lon:-75},{id:'2',description:'Second stop',lat:45.0001,lon:-75}]},{id:'b',code:'MAIN',description:'Main',lat:45.001,lon:-75,radius:200,items:[]}];`,c);
const groups=c.buildConflictGroups(c.allRadiusConflicts());assert.equal(groups.length,1);assert.equal(groups[0].stops.length,2);
let html=c.radiusConflictSummary();assert.equal((html.match(/class="radius-conflict-item /g)||[]).length,1);assert.equal((html.match(/class="radius-conflict-map"/g)||[]).length,1);assert.equal((html.match(/class="conflict-map-stop"/g)||[]).length,2);
c.signature=c.conflictReviewSignature(groups[0]);c.key=groups[0].key;
vm.runInContext('state.conflictApprovals={[key]:{signature,at:"test"}}',c);html=c.radiusConflictSummary();assert.match(html,/0 cas à valider/);assert.match(html,/Validés \(1\)/);
vm.runInContext('state.groups[1].radius=199',c);html=c.radiusConflictSummary();assert.match(html,/1 cas à valider/);assert.doesNotMatch(html,/Validés \(1\)/);
assert.equal(vm.runInContext('state.groups[0].items.length',c),2,'Validation never reassigns stops');
vm.runInContext(`state.groups=[];state.decisions=[];state.geographicNeedsRegroup=false;state.gtfsStops=[{stop_id:'12',stop_name:'Physical',parent_station:'9876',location_type:'0'},{stop_id:'9876',stop_name:'Station',parent_station:'',location_type:'1'}];state.parsed.stops={headers:['stop_id','stop_name','parent_station','location_type'],rows:state.gtfsStops};state.parsed.times={headers:['trip_id','stop_id'],rows:[{trip_id:'t',stop_id:'12'}]};state.stopIdRemap=stopIdPaddingPlan(state.gtfsStops,new Map(),'5').remap;`,c);
const exported=c.buildExports();assert.match(exported.gtfs,/00012,Physical,09876,0/);assert.match(exported.gtfs,/09876,Station,,1/);assert.match(exported.times,/t,00012/);
console.log('PASS: numeric-only padding, widths, collision rejection, composed remaps, optional place zero padding, facilities/case/uniqueness, grouped conflict maps and approval invalidation.');
