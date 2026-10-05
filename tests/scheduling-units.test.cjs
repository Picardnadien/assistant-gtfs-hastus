const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fields={};
const field=id=>fields[id]??={value:'',disabled:false};
const context=vm.createContext({console,TextEncoder,Uint8Array,URL,$:field,state:{parsed:{},originalEntries:[]},window:{},location:{href:'http://127.0.0.1:8765/'}});
for(const name of ['report-package.js','scheduling-units.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context);
const tools=context.reportPackageTools(),routes='route_id,route_short_name,route_long_name,route_type\r\nR2,002,École Nord,3\r\nR10,010,South,3\r\n001,001,,3\r\n',table=tools.parse(routes);
context.parseCSV=tools.parse;context.toCSV=(headers,rows)=>[headers.join(','),...rows.map(row=>headers.map(header=>JSON.stringify(row[header]??'')).join(','))].join('\r\n');
let result=context.schedulingUnitsBuild(table);
assert.equal(result.rows.length,3);assert.ok(result.text.includes('scheduling_unit,R2,Route R2,1100,R2\r\n'));
assert.equal(result.text.split('\r\n')[0],'keyword,scu_identifier,scu_description,scu_type,scu_route_ids');
assert.ok(context.schedulingUnitsBuild(table,'route_short_name').text.includes('scheduling_unit,002,Route 002,1100,002'));
assert.ok(context.schedulingUnitsBuild(table,'route_short_name','long').text.includes('scheduling_unit,002,École Nord,1100,002'));
assert.ok(context.schedulingUnitsBuild(table,'route_id','long').text.includes('scheduling_unit,001,Route 001,1100,001'));
for(const input of ['route_id,route_short_name\nr,\n','route_id,route_short_name\nr,1\nr,2\n','route_id,route_short_name\nr,1\ns,1\n'])assert.throws(()=>context.schedulingUnitsBuild(tools.parse(input),'route_short_name'));
assert.throws(()=>context.schedulingUnitsBuild(tools.parse('route_id\n"a,b"\n')));
assert.throws(()=>context.schedulingUnitsBuild(tools.parse('route_id,route_long_name\nr,"North, South"\n'),'route_id','long'));
assert.doesNotThrow(()=>context.schedulingUnitsBuild(tools.parse('route_id,route_long_name\nr,"North, South"\n')));
const oir=fs.readFileSync(path.join(root,'assets/scheduling units.oir')),imports=[{name:'sched_unit_to_import.txt',text:result.text},{name:'scheduling units.oir',bytes:new Uint8Array(oir)}];
const originals=[{name:'routes.txt',text:routes},{name:'stop_times.txt',text:'trip_id,stop_id\r\nt,001\r\n'},{name:'nested/asset.bin',bytes:new Uint8Array([0,1,255])}],before=JSON.stringify(originals);
const archive=context.schedulingUnitsArchive(originals,imports);
assert.equal(JSON.stringify(originals),before);assert.equal(archive.length,5);assert.equal(archive[1].text,originals[1].text);
assert.equal(context.schedulingUnitsArchive([...archive],imports).length,5);
assert.throws(()=>context.schedulingUnitsArchive([{name:'../bad',text:''}],imports));
assert.throws(()=>context.schedulingUnitsArchive([{name:'routes.txt',text:''},{name:'ROUTES.txt',text:''}],imports));
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
fs.writeFileSync(path.join(root,'tmp/report-editor-scheduling-units.zip'),tools.zip(archive,{allowPaths:true}));
fs.writeFileSync(path.join(root,'tmp/report-editor-radius-inputs.zip'),tools.zip([
  {name:'routes.txt',text:routes},
  {name:'stops.txt',text:'stop_id,stop_name,stop_lat,stop_lon\n1,North Main,45,-75\n2,South Main,45.001,-75\n3,West End,45.01,-75\n'},
  {name:'stop_times.txt',text:'trip_id,arrival_time,departure_time,stop_id,stop_sequence,timepoint\nt,08:00:00,08:00:00,1,1,1\nt,08:02:00,08:02:00,2,2,1\nt,08:10:00,08:10:00,3,3,1\n'},
  {name:'trips.txt',text:'route_id,service_id,trip_id\nR2,s,t\n'}
]));
field('scu-source').value='gtfs';field('scu-route-key').value='route_id';field('scu-description').value='route';context.state.parsed.routes=table;context.state.originalEntries=originals;
context.refreshSchedulingUnits();assert.equal(field('scu-download').disabled,false);
field('app-language').value='en';context.refreshSchedulingUnits();assert.match(field('scu-status').textContent,/key route_id/);
field('scu-source').value='file';context.refreshSchedulingUnits();assert.equal(field('scu-download').disabled,true);
field('scu-source').value='gtfs';
const written={},alerts=[];let mismatch=false,existing=false,confirmed=true;
context.confirm=()=>confirmed;context.alert=text=>alerts.push(text);
context.fetch=async()=>({ok:true,arrayBuffer:async()=>Uint8Array.from(oir).buffer});
context.window.showDirectoryPicker=async()=>({name:'GTFS',getFileHandle:async name=>{assert.equal(name,'routes.txt');return {getFile:async()=>({text:async()=>mismatch?'route_id\nother\n':routes})};},getDirectoryHandle:async name=>{assert.equal(name,'hastus_import');return {getFileHandle:async(name,options)=>{if(!options&&!existing)throw Object.assign(new Error('missing'),{name:'NotFoundError'});return {createWritable:async()=>({write:async value=>{written[name]=value;},close:async()=>{},abort:async()=>{}})};}};}});
(async()=>{
  await context.exportSchedulingUnits('folder');assert.deepEqual(Object.keys(written),['sched_unit_to_import.txt','scheduling units.oir']);assert.equal(alerts.length,0);assert.deepEqual(Buffer.from(written['scheduling units.oir']),oir);
  for(const key of Object.keys(written))delete written[key];mismatch=true;await context.exportSchedulingUnits('folder');assert.equal(Object.keys(written).length,0);assert.match(alerts.pop(),/differs/);
  mismatch=false;existing=true;confirmed=false;await context.exportSchedulingUnits('folder');assert.equal(Object.keys(written).length,0);
  let downloaded;context.download=(name,bytes)=>{downloaded={name,bytes};};await context.exportSchedulingUnits('zip');assert.equal(downloaded.name,'GTFS_with_scheduling_units.zip');assert.equal(alerts.length,0);
  context.standalone=table;vm.runInContext('schedulingStandaloneRoutes=standalone',context);field('scu-source').value='file';await context.exportSchedulingUnits('zip');assert.equal(downloaded.name,'routes_and_scheduling_units.zip');assert.equal(alerts.length,0);
  console.log('PASS: route keys, leading zeros, five OIR fields, validation, immutable GTFS, ZIP paths, exact folder filenames and overwrite/mismatch safeguards.');
})().catch(error=>{console.error(error);process.exitCode=1;});
