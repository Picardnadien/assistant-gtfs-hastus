const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fields={'app-language':{value:'fr'}};
const context=vm.createContext({console,document:{getElementById:id=>fields[id]||null}});
vm.runInContext('window=this;',context);
vm.runInContext(fs.readFileSync('working-timetable.js','utf8'),context);
vm.runInContext(fs.readFileSync('app.js','utf8').split('const decisionList=')[0],context);
const rows=[
 ['t1','base','0',['A','B','A'],['08:00:00','08:10:00','08:20:00']],
 ['t2','base','0',['A','C','A'],['08:30:00','08:40:00','08:50:00']],
 ['t3','base','1',['B','A'],['09:00:00','09:10:00']],
 ['t4','wed','0',['A','B'],['10:00:00','10:10:00']],
 ['t5','base','',['A','B'],['25:00:00','25:10:00']],
 ['t6','base','0',['A','B','A'],['08:15:00','08:25:00','08:35:00']]
];
const parsed={routes:{rows:[{route_id:'333',route_short_name:'333',route_long_name:'Synthetic route'}]},trips:{rows:rows.map(([trip_id,service_id,direction_id])=>({trip_id,service_id,direction_id,route_id:'333'}))},times:{headers:['timepoint'],rows:rows.flatMap(([trip_id,s,d,stops,times])=>stops.map((stop_id,i)=>({trip_id,stop_id,stop_sequence:String(i+1),arrival_time:times[i],departure_time:times[i],timepoint:'1'})))}};
context.fixture=parsed;
vm.runInContext('state.parsed=fixture;',context);
const places=new Map(['A','B','C'].map(id=>[id,{code:'PLACE00'+id,description:'Stop '+id}]));
const models=context.pamphletModelsFromPlaceMap(places),pairs=context.pairedPamphletModels(models);
assert.equal(pairs.length,2,'One card per route and service, not per direction');
const base=pairs.find(p=>p.service==='base'),before=JSON.stringify(parsed);
const model=context.pamphletWorkingModel(base,'military');
assert.equal(JSON.stringify(parsed),before);
assert.deepEqual(Array.from(new Set(model.blocks.map(b=>b.direction))).sort(),['0','1','?']);
const loop=model.blocks.find(b=>b.rows.some(r=>r.id==='t1'));
assert.deepEqual(Array.from(loop.stopIds),['A','B','A']);
assert.deepEqual(Array.from(loop.rows[0].times),[28800,29400,30000]);
assert.equal(loop.rows[1].headway,900);
assert.ok(model.blocks.some(b=>b.stopIds.includes('C')),'Shorter variants must not lose their unique timing points');
const html=context.WorkingTimetable.html(model);
assert.ok(html.includes('Service: base'));assert.ok(!html.includes('Date de service:'));
assert.match(html,/id="time-military"[^>]*checked/);assert.ok(html.includes('PLACE00C'));
const section=context.pamphletSection('pamphlet-offer',models);
assert.equal((section.match(/data-pamphlet-index=/g)||[]).length,2);
assert.ok(!section.includes('<iframe'),'Previews must be lazy even with many services');
assert.ok(section.includes('codes de place complets'));assert.ok(!section.includes('six caractères'));
fields['app-language'].value='en';assert.ok(context.pamphletSection('pamphlet-offer',models).includes('Assigned-place timetables'));
// A frequency template starts before the first displayed timing point.
parsed.trips.rows=[{trip_id:'freq',route_id:'333',service_id:'freq',direction_id:'0'}];
parsed.times.rows=[{trip_id:'freq',stop_id:'X',stop_sequence:'1',arrival_time:'06:00:00',departure_time:'06:00:00',timepoint:'0'},{trip_id:'freq',stop_id:'A',stop_sequence:'2',arrival_time:'06:05:00',departure_time:'06:05:00',timepoint:'1'}];
parsed.frequencies={rows:[{trip_id:'freq',start_time:'08:00:00',end_time:'09:00:00',headway_secs:'1800',exact_times:'1'}]};
const freqPair=context.pairedPamphletModels(context.pamphletModelsFromPlaceMap(places))[0];
let f=context.pamphletWorkingModel(freqPair);assert.deepEqual(Array.from(f.blocks[0].rows,r=>r.times[0]),[29100,30900]);
parsed.frequencies.rows[0].exact_times='0';f=context.pamphletWorkingModel(freqPair);assert.equal(f.blocks[0].rows.length,0);assert.equal(f.frequencies.length,1);
console.log('PASS: paired pamphlets, separate services, lazy previews, FR/EN, place codes, loops, variants, headways, missing direction and frequency templates.');
