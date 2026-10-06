const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),tools=require('../working-timetable.js');
const root=path.resolve(__dirname,'..');
assert.equal(tools.clock(0,'military'),'00:00');
assert.equal(tools.clock(12*3600,'military'),'12:00');
assert.equal(tools.clock(13*3600+25*60,'military'),'13:25');
assert.equal(tools.clock(25*3600+5,'military'),'01:00:05 +1');
assert.equal(tools.clock(null,'military'),'........');
const isSubsequence=(a,b)=>{let i=0;for(const v of b)if(a[i]===v)i++;return i===a.length;};
for(const [a,b] of [[['a','c'],['a','b','c']],[['a','b','a'],['a','c','a']],[['a','b','c'],['c','b','a']]]){const merged=tools.merge(a,b);assert.ok(isSubsequence(a,merged));assert.ok(isSubsequence(b,merged));}
assert.equal(tools.clock(6*3600+15*60),'615a');assert.equal(tools.clock(13*3600+25*60),'125p');assert.equal(tools.clock(25*3600),'100a +1');assert.equal(tools.clock(48*3600+5),'1200:05a +2');assert.equal(tools.clock(null),'........');
const block=(direction,pattern,stopIds,rows)=>({routeId:'333',route:'333 - Test route',direction,pattern,stopIds,rows});
const model={language:'en',client:'Synthetic client',date:'2026-10-05',workingRouteCode:'333',frequencies:[],workingStops:{A:{code:'LOUMET',name:'Loudoun Metro'},B:{code:'PACGLO',name:'Pacific / Gloucester'},C:{code:'QUAPRK',name:'Quarry Park'}},blocks:[
  block('0',1,['A','C'],Array.from({length:24},(_,i)=>({id:'o'+i,tripNumber:String(356+i*2),block:'333-001',headway:i?900:null,times:[22500+i*900,22980+i*900]}))),
  block('0',2,['A','B','C'],Array.from({length:14},(_,i)=>({id:'v'+i,tripNumber:String(392+i*2),block:'333-002',headway:i?900:null,times:[44100+i*900,44400+i*900,44820+i*900]}))),
  block('1',3,['C','B','A'],Array.from({length:38},(_,i)=>({id:'i'+i,tripNumber:String(308+i*2),block:'333-001',headway:i?900:null,times:[22980+i*900,23400+i*900,23940+i*900]})))
]};
let d=tools.direction(model.blocks.filter(b=>b.direction==='0'));assert.deepEqual(d.stops,['A','B','C']);assert.equal(d.rows.length,38);assert.equal(d.rows[0].times[1],null);assert.equal(d.rows[0].times[2],22980);
const before=JSON.stringify(model),html=tools.html(model);assert.equal(JSON.stringify(model),before);assert.ok(html.includes('letter portrait'));assert.ok(html.includes('Working Timetable Report - Both Directions'));assert.ok(html.includes('LOUMET'));assert.ok(!html.includes('333-002'));assert.ok(!html.includes('class="block"'));assert.ok(!html.includes('vertical-stop'));assert.equal((html.match(/class="working-grid"/g)||[]).length,1);assert.ok(html.includes('........'));assert.ok(html.includes('Page 1 / 1'));
assert.ok(html.includes('id="time-military"'));assert.ok(html.includes('class="military">06:15</span>'));
assert.ok(html.includes('@media print{.print-controls,.time-choice{display:none}'));
// All trips survive row pagination, point pagination, unequal directions and loops.
const big={...model,blocks:[block('0',1,Array.from({length:17},(_,i)=>'S'+i),Array.from({length:65},(_,i)=>({id:'long'+i,headway:i?60:null,times:Array.from({length:17},(_,j)=>3600+i*60+j*10)}))),block('1',2,['Z'],[{id:'return',times:[7200],headway:null}]),block('?',3,['A','B','A'],[{id:'loop',times:[10,20,30],headway:null}])]};
const large=tools.html(big);assert.ok(large.includes('letter landscape'));assert.ok(large.includes('long64'));assert.ok(large.includes('S16'));assert.ok(large.includes('no assigned place'));assert.ok(large.includes('Unspecified direction'));assert.ok(large.includes('loop'));
const repeated=tools.direction([big.blocks[2]]);assert.deepEqual(repeated.rows[0].times,[10,20,30]);
assert.ok(!tools.html({...model,client:'<script>alert(1)</script>'}).includes('<script>'));
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/report-editor-working-reference.html'),html);fs.writeFileSync(path.join(root,'tmp/report-editor-working-wide.html'),large);
console.log('PASS: merged variants, loops, both directions, mirror metadata, AM/PM and extended hours, 38-row compact reference, landscape and row/point pagination, escaping, unchanged inputs.');
