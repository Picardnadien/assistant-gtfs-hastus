const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fields={};
function field(id){return fields[id]??={value:'',events:{},addEventListener(name,callback){this.events[name]=callback;},dispatchEvent(event){this.events[event.type]?.(event);},setCustomValidity(message){this.error=message;},reportValidity(){this.reported=true;}};}
const context=vm.createContext({console,document:{getElementById:field},window:{},Event:class{constructor(type){this.type=type;}}});
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');vm.runInContext(source.split('const decisionList=')[0],context);
for(const n of [0,1,300,1000])assert.equal(context.distanceValue(n),n);
assert.equal(context.distanceValue(null),200);assert.equal(context.distanceValue(''),200);assert.equal(context.distanceValue(1200),1000);
for(const id of ['radius','reference-distance']){
  field(id).value='300';field(id).addEventListener('input',()=>context.syncDistanceControls());context.bindDistanceNumber(id);
  const number=field(id+'-number');
  for(const n of ['0','1000']){number.value=n;number.events.input();assert.equal(field(id).value,n);assert.equal(number.error,'');}
  for(const n of ['','-1','1001','2.5']){number.value=n;number.events.input();assert.equal(field(id).value,'1000');assert.ok(number.error);number.events.change();assert.equal(number.value,'1000');}
  field(id).value='0';field(id).dispatchEvent({type:'input'});assert.equal(number.value,'0');
}
field('app-language').value='en';const invalid=field('radius-number');invalid.value='1001';context.validDistanceInput(invalid);assert.match(invalid.error,/metres/);
const points=[{id:'1',description:'First',lat:45,lon:-75},{id:'2',description:'Second',lat:45,lon:-75},{id:'3',description:'Third',lat:45.005,lon:-75}];
assert.equal(context.groupNearbyStops(points,0,new Set()).length,2);assert.equal(context.groupNearbyStops(points,1000,new Set()).length,1);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.ok(!html.includes('class="steps"'));assert.ok(html.includes('class="brand-logo"'));
context.document.body={classList:{toggle(){}}};
vm.runInContext(`updateLoadedGtfsUi=()=>{};refreshWorkingTimetableAccess=()=>{};setMode=()=>{};state.parsed={stops:{headers:['stop_id'],rows:[]},times:{headers:['trip_id'],rows:[]}};`,context);
for(const radius of [0,1000]){
  field('radius').value=String(radius);field('reference-distance').value=String(radius);
  const snapshot=context.workspaceSnapshot();assert.equal(snapshot.settings.radius,radius);assert.equal(snapshot.settings.referenceDistance,radius);
  field('radius').value='123';context.restoreWorkspaceSnapshot(snapshot);
  assert.equal(Number(field('radius-number').value),radius);assert.equal(Number(field('reference-distance-number').value),radius);
}
for(const id of ['radius','radius-number','reference-distance','reference-distance-number'])assert.match(html,new RegExp('id="'+id+'"[^>]*min="0"[^>]*max="1000"'));
assert.ok(source.includes('onchange="commitGroupRadius('));
console.log('PASS: 0–1000 bounds, bidirectional slider/number sync, invalid input recovery, zero-distance clustering, compact logo header.');
