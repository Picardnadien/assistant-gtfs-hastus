const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),plan=require('../service-import-plan.js');
const context=vm.createContext({console,ServiceImportPlan:plan,document:{getElementById:()=>null}});
vm.runInContext(fs.readFileSync(path.join(root,'day-route-summary.js'),'utf8'),context);
vm.runInContext('window=this;',context);
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0],context);
const table=rows=>({headers:[...new Set(rows.flatMap(Object.keys))],rows});
const calendar=(service_id,days,start_date='20261005',end_date='20261018')=>Object.fromEntries(Object.entries({service_id,start_date,end_date,...Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map((d,i)=>[d,days.includes(i)?'1':'0']))}));
const trips=[['base','weekday','08:00:00'],['wed','wednesday','08:10:00'],['sat','weekend','09:00:00'],['extra','exception','10:00:00'],['clone','copy','08:00:00']];
function analyze({calendarRows=[calendar('weekday',[0,1,3,4]),calendar('wednesday',[2]),calendar('weekend',[5])],exceptions=[],tripRows=trips,frequencies=[]}={}){
  const data={routes:table([{route_id:'R',route_type:'3',route_short_name:'12',route_long_name:'Main'}]),trips:table(tripRows.map(([id,s])=>({trip_id:id,service_id:s,route_id:'R',direction_id:'0'}))),times:table(tripRows.flatMap(([id,s,t])=>[{trip_id:id,stop_sequence:'1',stop_id:'A',arrival_time:t,departure_time:t,timepoint:'1'},{trip_id:id,stop_sequence:'2',stop_id:'B',arrival_time:'25:00:00',departure_time:'25:00:00',timepoint:'0'}])),stops:table([{stop_id:'A',stop_name:'Alpha'},{stop_id:'B',stop_name:'Beta'}]),calendar:calendarRows?table(calendarRows):null,calendarDates:exceptions.length?table(exceptions):null,frequencies:table(frequencies)};
  context.input=data;return vm.runInContext('analyzeTimetables(input.routes,input.trips,input.times,input.stops,input.calendar,input.calendarDates,input.frequencies)',context);
}
let a=analyze(),p=a.importPlan;
assert.equal(p.importCount,3);assert.equal(p.profiles.length,4);
assert.equal(p.profiles[0].representative.date,'2026-10-05');
let wed=p.profiles.find(p=>p.weekdays.length===1&&p.weekdays[0]==='wednesday');
assert.equal(wed.representative.date,'2026-10-07');assert.equal(wed.added,1);assert.equal(wed.removed,1);assert.deepEqual(wed.changedRoutes,['R']);
assert.equal(p.profiles.find(p=>!p.tripCount).kind,'empty');
assert.equal(a.days.find(d=>d.date==='2026-10-05').total,a.days.find(d=>d.date==='2026-10-07').total,'Equal volumes must not hide different times');
// Calendar exceptions override weekly flags; equivalent renamed trips/services do not add an import.
a=analyze({exceptions:[{service_id:'weekday',date:'20261006',exception_type:'2'},{service_id:'exception',date:'20261006',exception_type:'1'},{service_id:'weekday',date:'20261008',exception_type:'2'},{service_id:'copy',date:'20261008',exception_type:'1'}]});p=a.importPlan;
assert.equal(p.importCount,4);assert.equal(p.dateProfile.get('2026-10-05'),p.dateProfile.get('2026-10-08'));
assert.equal(p.profiles.find(p=>p.representative.date==='2026-10-06').kind,'oneoff');
assert.ok(p.profiles[0].exceptionDates.includes('2026-10-08'));assert.equal(p.profiles[0].representative.date,'2026-10-05');
// Explicit-date-only feeds and IDs containing separators are supported.
a=analyze({calendarRows:null,exceptions:[{service_id:'weekday',date:'20261005',exception_type:'1'},{service_id:'copy',date:'20261007',exception_type:'1'}]});
assert.equal(a.importPlan.importCount,1);assert.equal(a.importPlan.profiles.find(p=>!p.tripCount).dates[0],'2026-10-06');
// Multiplicity matters: two identical trips are not the same schedule as one.
a=analyze({calendarRows:[calendar('weekday',[0]),calendar('copy',[1])],tripRows:[['base','weekday','08:00:00'],['clone','copy','08:00:00'],['clone2','copy','08:00:00']]});assert.equal(a.importPlan.importCount,2);
// Frequency intervals and exact_times are compared, not just template stop times.
a=analyze({calendarRows:[calendar('weekday',[0]),calendar('copy',[1])],frequencies:[{trip_id:'base',start_time:'08:00:00',end_time:'10:00:00',headway_secs:'600',exact_times:'1'},{trip_id:'clone',start_time:'08:00:00',end_time:'10:00:00',headway_secs:'600',exact_times:'0'}]});assert.equal(a.importPlan.importCount,2);assert.ok(a.importPlan.profiles.some(p=>p.frequency));
// All stops (including non-TP), route/direction, missing times and block assignment are conservative distinctions.
a=analyze();const original=a.stopTimesByTrip.get('clone');a.stopTimesByTrip.set('clone',original.map(r=>({...r,...(r.stop_id==='B'?{arrival_time:'25:01:00'}:{})})));
a.days.push({date:'2026-10-19',services:['copy'],weekday:'monday',exceptions:[]});assert.equal(plan.build(a).importCount,4);
a.stopTimesByTrip.delete('clone');assert.ok(plan.build(a).profiles.some(p=>p.missing));
a=analyze({calendarRows:[calendar('weekday',[])]});assert.equal(a.importPlan.importCount,0);
assert.equal(vm.runInContext('parseGtfsDate("20260230")',context),null);
// Both languages, escaping, read-only CSV and app integration.
a=analyze();a.routeById.get('R').route_long_name='<script>alert(1)</script>';
for(const lang of ['fr','en']){const html=plan.render(a.importPlan,a,lang);assert.ok(html.includes('2026-10-07'));assert.ok(html.includes('selectTimetableDate'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));const csv=plan.csv(a.importPlan,lang);assert.ok(csv.includes('2026-10-07'));assert.ok(csv.includes('"0"'));}
assert.ok(plan.render(a.importPlan,a,'en').includes('Suggested dates'));
assert.ok(plan.render(a.importPlan,a,'fr').includes('Dates suggérées'));
context.stateForTest=a;vm.runInContext('state.timetableAnalysis=stateForTest;',context);
assert.ok(vm.runInContext('timetableCard()',context).includes('service-import-plan'));
assert.ok(vm.runInContext('timetableCalendar(stateForTest)',context).includes('★'));
// Synthetic browser fixture: no client data is included.
vm.runInContext(fs.readFileSync(path.join(root,'report-package.js'),'utf8'),context);
context.TextEncoder=TextEncoder;
const data=context.input,files={};
for(const [key,name] of Object.entries({routes:'routes.txt',trips:'trips.txt',times:'stop_times.txt',stops:'stops.txt',calendar:'calendar.txt'})){
  const t=data[key];files[name]=[t.headers.join(','),...t.rows.map(r=>t.headers.map(h=>r[h]??'').join(','))].join('\r\n');
}
files['stops.txt']='stop_id,stop_name,stop_lat,stop_lon\r\nA,Alpha,45,-75\r\nB,Beta,45.001,-75\r\n';
files['agency.txt']='agency_id,agency_name,agency_url,agency_timezone\r\na,Synthetic test,https://example.com,America/Toronto\r\n';
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/report-editor-service-import.zip'),context.reportPackageTools().zip(Object.entries(files).map(([name,text])=>({name,text}))));
console.log('PASS: Wednesday exceptions at equal volumes, representative dates, calendar overrides, equivalent IDs, no-service days, frequency modes, multiplicity, all-stop comparison, missing times, FR/EN, CSV and app integration.');
