const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),context=vm.createContext({console,TextEncoder,document:{getElementById:()=>null}});
vm.runInContext('window=this;',context);
for(const file of ['report-package.js','report-network.js','report-timetable-export.js','service-import-plan.js','working-timetable.js','day-route-summary.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0],context);
const table=rows=>({headers:[...new Set(rows.flatMap(Object.keys))],rows});
const cal=service_id=>({service_id,start_date:'20261005',end_date:'20261011',monday:'1',tuesday:'1',wednesday:'1',thursday:'1',friday:'1',saturday:'0',sunday:'0'});
const definitions=[['o1','333','base','0','08:00:00'],['o2','333','base','0','08:15:00'],['i1','333','base','1','08:10:00'],['wo','333','wed','0','09:00:00'],['wi','333','wed','1','25:00:00'],['f','12','base','1','08:00:00'],['h','12','base','','08:00:00'],['missing','999','base','','08:00:00']];
const trips=table(definitions.map(([trip_id,route_id,service_id,direction_id])=>({trip_id,route_id,service_id,direction_id})));
const times=table(definitions.flatMap(([trip_id,route,service,direction,time])=>[1,2].map((n)=>({trip_id,stop_id:n===1?'A':'B',stop_sequence:String(n),arrival_time:time,departure_time:time,timepoint:trip_id==='missing'?'0':'1'}))));
const routes=table([{route_id:'333',route_short_name:'333',route_long_name:'Test Route',route_type:'3'},{route_id:'12',route_short_name:'12',route_long_name:'Frequency route',route_type:'3'},{route_id:'999',route_short_name:'999',route_long_name:'<script>alert(1)</script>',route_type:'3'}]);
const stops=table([{stop_id:'A',stop_name:'Main Station',stop_lat:'45',stop_lon:'-75'},{stop_id:'B',stop_name:'West End',stop_lat:'45.01',stop_lon:'-75.01'}]);
const calendar=table([cal('base')]),exceptions=table([{service_id:'base',date:'20261007',exception_type:'2'},{service_id:'wed',date:'20261007',exception_type:'1'}]);
const frequencies=table([{trip_id:'f',start_time:'08:00:00',end_time:'09:00:00',headway_secs:'1800',exact_times:'1'},{trip_id:'h',start_time:'08:00:00',end_time:'09:00:00',headway_secs:'600',exact_times:'0'}]);
context.fixture={routes,trips,times,stops,calendar,exceptions,frequencies};
const a=vm.runInContext('analyzeTimetables(fixture.routes,fixture.trips,fixture.times,fixture.stops,fixture.calendar,fixture.exceptions,fixture.frequencies)',context),api=context.DayRouteSummary;
let day=api.build(a,'2026-10-05');assert.equal(day.fixed,6);assert.equal(day.frequency,1);assert.equal(day.routes.length,3);
assert.equal(day.routes[0].label,'12');assert.equal(day.routes[1].directions['0'],2);assert.equal(day.routes[1].directions['1'],1);assert.equal(day.routes[2].canPrint,false);assert.equal(day.routes[2].withoutTiming,1);
assert.equal(api.build(a,'2026-10-07').fixed,2);assert.equal(api.build(a,'2026-10-07').routes.length,1);assert.equal(api.build(a,'2026-10-11').routes.length,0);
assert.ok(api.render(day,'fr').includes('Synthèse par route'));assert.ok(api.render(day,'en').includes('Route summary'));assert.ok(!api.render(day).includes('<script>'));assert.ok(api.render(day).includes('disabled'));assert.ok(api.render(api.build(a,'2026-10-11')).includes('Aucun voyage'));
const serialized=JSON.stringify(context.fixture);
const placeSource=table([{stop_id:'A',stop_code:'STOP_A',parent_station:'station-uuid',stop_name:'Quay A'},{stop_id:'station-uuid',stop_code:'MAINSTN',stop_name:'Main',location_type:'1'},{stop_id:'B',stop_code:'STOP_B',stop_name:'West'}]);
assert.equal(api.placeLabels(placeSource).A.code,'MAINSTN');
assert.equal(api.placeLabels(placeSource).B.code,'','A stop code must not masquerade as a place code');
const placeOptions={workingStops:table([{stop_id:'100001',parent_station:'WORKSTN'},{stop_id:'WORKSTN',location_type:'1',stop_name:'Working station'}]),geographicCache:{clientType:'new',stopIdRemap:[['A','100001']],groups:[{id:'g',code:'RENAMED',description:'New place'}],decisions:[{id:'100001',originalId:'A',groupId:'g'}]}};
const originalOptions=JSON.stringify(placeOptions);
assert.equal(api.placeLabels(placeSource,placeOptions).A.code,'RENAMED');
assert.equal(api.placeLabels(placeSource,{...placeOptions,geographicCache:{stopIdRemap:[['A','100001']]}}).A.code,'WORKSTN');
assert.equal(api.placeLabels(placeSource,{geographicCache:{clientType:'existing',places:[{id:'EXIST',description:'Existing place'}],decisions:[{id:'B',choice:'EXIST'}]}}).B.code,'EXIST');
assert.equal(JSON.stringify(placeOptions),originalOptions);
const assignedReport=api.pdf(a,'2026-10-05','333','en','Test',placeOptions);
assert.ok(assignedReport.html.includes('>RENAMED</th>'));assert.ok(!assignedReport.html.includes('class="block"'));
for(const language of ['fr','en']){
  const report=api.pdf(a,'2026-10-05','333',language,'Test Client');
  assert.equal(report.model.direction,'both');assert.equal(report.model.compact,true);assert.equal(report.model.timing,true);
  assert.equal(report.model.blocks.length,2);assert.equal(report.model.blocks[0].rows[1].headway,900);
  assert.ok(report.model.blocks.every(b=>b.routeId==='333'));assert.ok(report.html.includes('letter portrait'));assert.ok(report.html.includes('working-grid'));assert.ok(report.html.includes('class="divider"'));assert.ok(report.html.includes('Test Client_333_Timetable_2026-10-05'));
  assert.ok(report.html.includes(language==='en'?'Both Directions':'Deux directions'));
  const wed=api.pdf(a,'2026-10-07','333',language,'Test Client');assert.equal(wed.model.blocks.flatMap(b=>b.rows).length,2);assert.ok(wed.html.includes('100a +1'));assert.ok(!wed.model.blocks.flatMap(b=>b.rows).some(r=>r.id==='o1'));
  fs.mkdirSync(path.join(root,'tmp'),{recursive:true});fs.writeFileSync(path.join(root,`tmp/report-editor-day-route-${language}.html`),report.html);
}
let freq=api.pdf(a,'2026-10-05','12','en','Test');assert.equal(freq.model.blocks.flatMap(b=>b.rows).length,2);assert.equal(freq.model.frequencies.length,1);
assert.equal(JSON.stringify(context.fixture),serialized,'Summary and PDFs must preserve source data');
// Browser fixture with both directions, exceptions and headway-based service.
const files={};for(const [key,name] of Object.entries({routes:'routes.txt',trips:'trips.txt',times:'stop_times.txt',stops:'stops.txt',calendar:'calendar.txt',exceptions:'calendar_dates.txt',frequencies:'frequencies.txt'})){const t=context.fixture[key];files[name]=[t.headers.join(','),...t.rows.map(r=>t.headers.map(h=>'"'+String(r[h]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');}
files['agency.txt']='agency_id,agency_name,agency_url,agency_timezone\r\na,Test Client,https://example.com,America/Toronto\r\n';
fs.writeFileSync(path.join(root,'tmp/report-editor-day-route.zip'),context.reportPackageTools().zip(Object.entries(files).map(([name,text])=>({name,text}))));
console.log('PASS: route totals, both directions, unspecified direction, calendar exception, no service, exact/headway frequencies, missing timing points, FR/EN, safe HTML, route/day-only monochrome working PDF, headways and unchanged input.');
