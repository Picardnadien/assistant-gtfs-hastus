const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context=vm.createContext({console});
for(const file of ['report-package.js','report-payload.js','report-editor.js','report-network.js','report-timetable-export.js','report-network-document.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const tools=context.reportNetworkTools(),parse=context.reportPackageTools().parse;
const data={places:[],assignments:{},gtfs:{
  stops:parse('stop_id,stop_name,stop_lat,stop_lon\n001,First,47.56,-52.71\n002,Second,47.57,-52.70\n003,Third,47.58,-52.72'),
  times:parse('trip_id,stop_id,stop_sequence,arrival_time,departure_time,timepoint\nregular,001,1,25:01:00,25:02:00,1\nregular,002,2,25:05:00,25:05:00,0\nregular,003,3,25:08:00,25:08:00,1\nextra,003,1,12:00:00,12:00:00,1\nextra,001,2,12:15:00,12:15:00,1\nexact,001,1,08:00:00,08:00:00,1\nexact,002,2,08:05:00,08:05:00,1\nheadway,001,1,07:00:00,07:00:00,1\nheadway,002,2,07:06:00,07:06:00,1\nloop,001,1,09:00:00,09:00:00,1\nloop,002,2,09:10:00,09:10:00,1\nloop,001,3,09:20:00,09:20:00,1'),
  archiveEntries:[
    {name:'routes.txt',text:'route_id,route_short_name,route_long_name,route_color\nr1,10,Harbour,557630\nr2,2,Loop,invalid'},
    {name:'trips.txt',text:'route_id,trip_id,service_id,direction_id,shape_id\nr1,regular,weekly,0,line1\nr1,extra,special,1,line1\nr1,exact,freq,0,line1\nr1,headway,freq,0,line1\nr2,loop,weekly,,line1'},
    {name:'calendar.txt',text:'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekly,1,1,1,1,1,0,0,20261001,20261005'},
    {name:'calendar_dates.txt',text:'service_id,date,exception_type\nweekly,20261002,2\nspecial,20261002,1\nweekly,20261003,1\nfreq,20261004,1'},
    {name:'frequencies.txt',text:'trip_id,start_time,end_time,headway_secs,exact_times\nexact,10:00:00,11:00:00,1800,1\nheadway,12:00:00,13:00:00,600,0'},
    {name:'shapes.txt',text:'shape_id,shape_pt_sequence,shape_pt_lat,shape_pt_lon\nline1,2,47.58,-52.72\nline1,1,47.56,-52.71'}
  ]}};
const net=tools.create(data),sorted=set=>[...set].sort();
assert.equal(net.hasCalendar,true);assert.equal(net.start,'2026-10-01');assert.equal(net.end,'2026-10-05');
assert.deepEqual(sorted(net.services('2026-10-01')),['weekly']);
assert.deepEqual(sorted(net.services('2026-10-02')),['special']);
assert.deepEqual(sorted(net.services('2026-10-03')),['weekly']);
assert.deepEqual(sorted(net.services('2026-10-04')),['freq']);
assert.deepEqual(sorted(net.services('2026-10-05')),['weekly']);
assert.equal(net.services('2026-10-06').size,0);
assert.equal(net.services('2026-02-30').size,0);
assert.equal(tools.date('2026-02-29'),null);assert.ok(tools.date('2024-02-29'));
assert.equal(tools.date('not a date'),null);
assert.equal(tools.clock(tools.seconds('25:02:00')),'25:02:00');
assert.equal(tools.seconds('08:70:00'),null);assert.equal(tools.seconds(''),null);
const regular=net.schedules('2026-10-01','r1','0',true);
assert.equal(regular.tripCount,1);assert.deepEqual([...regular.patterns[0].stops],['001','003']);
assert.equal(regular.patterns[0].trips[0].times[0],90120);
assert.equal(net.schedules('2026-10-01','r1','1').tripCount,0);
assert.equal(net.schedules('2026-10-01','r1','0',false).patterns[0].stops.length,3);
assert.deepEqual([...net.schedules('2026-10-01','r2','?').patterns[0].stops],['001','002','001']);
const frequency=net.schedules('2026-10-04');
assert.equal(frequency.tripCount,2);assert.equal(frequency.frequencies.length,1);
assert.deepEqual([...frequency.patterns[0].trips[0].times],[36000,36300]);
assert.deepEqual([...frequency.patterns[0].trips[1].times],[37800,38100]);
assert.equal(frequency.frequencies[0].window.headway_secs,'600');
assert.deepEqual([...tools.timetableRows(frequency.patterns[0])].map(r=>r.headway),[null,1800]);
const headwayPattern={stops:['001','002','001'],trips:[
  {id:'late',headsign:'Harbour',times:[90000,90100,90200]},
  {id:'early',headsign:'Harbour',times:[85500,85600,85700]},
  {id:'missing',headsign:'Harbour',times:[null,86000,86100]},
  {id:'same',headsign:'Harbour',times:[90000,90200,90300]},
  {id:'seconds',headsign:'Harbour',times:[90130,90200,90400]}
]};
const immutable=JSON.stringify(headwayPattern),headwayRows=tools.timetableRows(headwayPattern);
assert.deepEqual([...headwayRows].map(r=>r.trip.id),['early','late','same','seconds','missing']);
assert.deepEqual([...headwayRows].map(r=>r.headway),[null,4500,0,130,null]);
assert.equal(JSON.stringify(headwayPattern),immutable);
assert.equal(tools.headwayLabel(130),'2 min 10 s');assert.equal(tools.headwayLabel(0),'0 min');
assert.equal(tools.headwayLabel(null),'—');assert.equal(tools.headwayLabel(4500),'75 min');
for(const language of ['fr','en']){
  const html=tools.timetableHtml(headwayPattern,id=>tools.esc(id),language);
  assert.match(html,/network-condensed/);assert.match(html,/width:384px/);
  assert.ok(!tools.timetableHtml(headwayPattern,id=>id,language,false).includes('network-condensed'));
  const header=html.match(/<thead>([\s\S]*?)<\/thead>/)[1],body=html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  assert.ok(header.indexOf('Headway')<header.indexOf(language==='en'?'Trip':'Voyage'));
  assert.equal((header.match(/data-network-stop=/g)||[]).length,3); // repeated stop preserved
  assert.equal((body.match(/<tr>/g)||[]).length,5); // one horizontal row per trip
  assert.ok(!header.includes('early'));assert.ok(body.includes('25:00:00'));
  assert.match(body,/<td class="network-headway">75 min<\/td><th scope="row"/);
}
assert.equal(net.schedules('2026-10-02','r1').patterns[0].trips[0].id,'extra');
const exceptionOnly=structuredClone(data);exceptionOnly.gtfs.archiveEntries=exceptionOnly.gtfs.archiveEntries.filter(f=>f.name!=='calendar.txt');
assert.equal(tools.create(exceptionOnly).hasCalendar,true);
assert.equal(tools.create(exceptionOnly).services('2026-10-01').size,0);
assert.equal(tools.create(exceptionOnly).services('2026-10-03').has('weekly'),true);
assert.equal(tools.create({}).hasCalendar,false);
const explicit=tools.create({...data,networkTimingPointIds:['002']});
assert.deepEqual([...explicit.schedules('2026-10-01','r1').patterns[0].stops],['002']);
const inferred=structuredClone(data);inferred.gtfs.times.headers=inferred.gtfs.times.headers.filter(h=>h!=='timepoint');
assert.equal(tools.create(inferred).fallbackTiming,true);
assert.equal(tools.create(inferred).schedules('2026-10-01','r1').patterns[0].stops.length,3);
const routes=net.routeModels();assert.deepEqual([...routes].map(r=>r.label),['2','10']);
assert.equal(routes[0].color,'#557630');assert.equal(routes[1].lines.length,1);assert.equal(routes[1].points.length,3);
assert.equal(routes[1].lines[0][0].lat,47.56);
const g=tools.geometry(routes[1]);assert.ok(g.bounds.minlat<47.56&&g.bounds.maxlat>47.58);
for(const p of routes[1].points){const q=g.project(p);assert.ok(q.x>=0&&q.x<=1000&&q.y>=0&&q.y<=480);}
assert.equal(tools.geometry({points:[],lines:[]}),null);
assert.match(tools.mapSvg(routes[1]),/<polyline/);assert.match(tools.mapSvg(routes[1]),/001 · First/);
const badFrequency=structuredClone(data);badFrequency.gtfs.archiveEntries.find(f=>f.name==='frequencies.txt').text+='\nextra,12:00:00,13:00:00,Infinity,1';
assert.equal(tools.create(badFrequency).schedules('2026-10-02').frequencies[0].invalid,true);
// A standalone UI fixture, reusing the real report template generated by editor tests.
const templatePath=path.join(root,'tmp','report-editor-8-en.html');
if(fs.existsSync(templatePath)){
  const template=fs.readFileSync(templatePath,'utf8');
  const payload=JSON.parse(template.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  payload.gtfs.times=data.gtfs.times;
  payload.gtfs.archiveEntries=payload.gtfs.archiveEntries.filter(f=>!data.gtfs.archiveEntries.some(n=>n.name===f.name)).concat(data.gtfs.archiveEntries);
  payload.networkMaps=routes.map(route=>({routeId:route.routeId,html:'<div class="network-map">'+tools.mapSvg(route)+'</div><p>Synthetic test map · GTFS geometry only</p>'}));
  payload.networkView={date:'2026-10-01',route:'r1',direction:'',timing:true};
  const html=context.reportNetworkDocumentHtml(payload);
  assert.ok(!html.includes('id="place-search"'));
  assert.ok(!html.includes('data-report-place'));
  assert.match(html,/reportKind/);assert.match(html,/network-both-directions/);
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  fs.writeFileSync(path.join(root,'tmp','report-editor-network.html'),html);
}
console.log('PASS: service dates, exceptions, date bounds, after midnight, timing points, direction, loops, exact/headway frequencies, shapes and standalone network fixture.');
