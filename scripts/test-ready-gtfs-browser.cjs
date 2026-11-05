// Synthetic GTFS only. Exercise the real download and inspect ZIP contents.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
function unzip(bytes){const entries=new Map();let i=0;while(bytes.readUInt32LE(i)===0x04034b50){const size=bytes.readUInt32LE(i+18),n=bytes.readUInt16LE(i+26),extra=bytes.readUInt16LE(i+28),start=i+30+n+extra;entries.set(bytes.subarray(i+30,i+30+n).toString(),bytes.subarray(start,start+size));i=start+size;}return entries;}
(async()=>{
 const server=http.createServer((req,res)=>{const route=decodeURIComponent(req.url.split('?')[0]),file=path.join(root,route==='/'?'index.html':route);if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],alerts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{alerts.push(d.message());d.accept();});await page.route('https://**',r=>r.fulfill({contentType:'text/html',body:'Synthetic map'}));await page.goto('http://127.0.0.1:'+server.address().port);
  assert.equal(await page.locator('#pad-place-codes').isChecked(),false);assert.equal(await page.locator('#use-canada-post-abbreviations').isChecked(),true);
  await page.evaluate(()=>{
   const files={
    'agency.txt':'agency_id,agency_name,agency_url,agency_timezone\na,Demo Agency,https://example.com,America/Toronto\n',
    'stops.txt':'stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\n12,Main,45,-75,0,\n9876,Main Park,45.00005,-75,0,\nEG450,Arena,45.0015,-75,0,\nSOURCE,Original empty station,45,-75,1,\n',
    'stop_times.txt':'trip_id,stop_id,stop_sequence,timepoint,arrival_time,departure_time\nt,12,1,1,08:00:00,08:00:00\nt,9876,2,1,08:02:00,08:02:00\nt,EG450,3,1,08:04:00,08:04:00\n',
    'routes.txt':'route_id,route_short_name,route_long_name,route_type\nr,42,Main route,3\n',
    'trips.txt':'route_id,service_id,trip_id\nr,s,t\n',
    'calendar_dates.txt':'service_id,date,exception_type\ns,20261105,1\n',
    'transfers.txt':'from_stop_id,to_stop_id,transfer_type\n12,9876,0\n',
    'feed_info.txt':'feed_publisher_name,feed_publisher_url,feed_lang\nDemo,https://example.com,en\n'};
   state.originalEntries=Object.entries(files).map(([name,text])=>({name,text}));state.parsed={};state.files={};for(const [name,text]of Object.entries(files)){const key=GTFS_FILE_KEYS[name];if(key){state.parsed[key]=parseCSV(text);state.files[key]=name;}}
   setupMapping();$('pad-stop-ids').checked=true;$('pad-place-codes').checked=false;analyze();
   // A retained empty group must not create a station or block export, even without a code.
   state.groups.push({id:'empty',code:'',description:'',items:[],lat:45,lon:-75,radius:200});
   schedulingStandaloneRoutes=parseCSV('route_id,route_short_name\nwrong,99');$('scu-source').value='file';
  });
  assert.match(await page.locator('#download-times').textContent(),/GTFS prêt à importer/);
  await page.selectOption('#app-language','en');assert.match(await page.locator('#download-times').textContent(),/GTFS ready to import/);
  await page.locator('#go-to-reports').click();assert.deepEqual(alerts,[]);await page.evaluate(()=>readyGtfsExportPlan());const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-times').click()]);
  assert.equal(download.suggestedFilename(),'Demo_Agency_GTFS_ready_to_import.zip');
  const entries=unzip(fs.readFileSync(await download.path())),get=name=>entries.get(name)?.toString();
  assert.equal(entries.size,12);for(const name of ['stops.txt','stop_times.txt','routes.txt','trips.txt','agency.txt','calendar_dates.txt','transfers.txt','feed_info.txt','hastus_import/sched_unit_to_import.txt','hastus_import/scheduling units.oir','hastus_import/places/places.csv','hastus_import/places/place - GTFS DESC.oir'])assert.ok(entries.has(name),name);
  assert.match(get('stops.txt'),/0012,Main/);assert.match(get('stop_times.txt'),/t,0012,1/);assert.match(get('transfers.txt'),/0012,9876,0/);assert.match(get('stops.txt'),/SOURCE,Original empty station/);
  assert.doesNotMatch(get('hastus_import/places/places.csv'),/SOURCE|place;;/);assert.match(get('hastus_import/sched_unit_to_import.txt'),/scheduling_unit,r,Route r,1100,r/);assert.doesNotMatch(get('hastus_import/sched_unit_to_import.txt'),/wrong/);
  assert.deepEqual(entries.get('hastus_import/scheduling units.oir'),fs.readFileSync(path.join(root,'assets/scheduling units.oir')));
  await page.evaluate(()=>setMode('geographic'));
  await page.locator('#prefix-stop-ids').check();await page.locator('#stop-id-prefix').fill('A');
  assert.equal(await page.evaluate(()=>{try{buildExports();return false;}catch{return true;}}),true,'Changing the prefix requires fresh analysis');
  await page.evaluate(()=>analyze());
  const before=await page.evaluate(()=>buildExports());await page.evaluate(()=>analyze());assert.deepEqual(await page.evaluate(()=>buildExports()),before,'Repeated analysis must not double-prefix IDs');
  const snap=await page.evaluate(()=>JSON.parse(JSON.stringify(workspaceSnapshot())));assert.equal(snap.settings.prefixStopIds,true);assert.equal(snap.settings.stopIdPrefix,'A');
  await page.evaluate(s=>restoreWorkspaceSnapshot(s),snap);assert.equal(await page.locator('#prefix-stop-ids').isChecked(),true);assert.equal(await page.locator('#stop-id-prefix').inputValue(),'A');
  await page.locator('#go-to-reports').click();const [prefixDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#download-times').click()]);const prefixFiles=unzip(fs.readFileSync(await prefixDownload.path()));
  assert.match(prefixFiles.get('stops.txt').toString(),/A0012,Main/);assert.match(prefixFiles.get('stops.txt').toString(),/AEG450,Arena/);assert.match(prefixFiles.get('stops.txt').toString(),/ASOURCE,Original empty station/);
  assert.match(prefixFiles.get('stop_times.txt').toString(),/t,A0012,1/);assert.match(prefixFiles.get('transfers.txt').toString(),/A0012,A9876,0/);
  assert.equal(await page.evaluate(()=>state.parsed.stops.rows[0].stop_id),'12','Source GTFS unchanged');
  await page.evaluate(()=>setMode('geographic'));await page.locator('#prefix-stop-ids').uncheck();await page.evaluate(()=>analyze());
  const unprefixed=await page.evaluate(()=>buildExports());assert.match(unprefixed.gtfs,/0012,Main/);assert.doesNotMatch(unprefixed.gtfs,/A0012/);
  const headings=await page.locator('#geographic-client-setting>span,#timing-source-setting>span,#radius-setting>label:first-child').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));assert.equal(headings.length,3);assert.ok(Math.max(...headings)-Math.min(...headings)<=2,'Grouping, timing source and radius headings align');
  assert.equal(await page.locator('#stop-management-title').textContent(),'Stop management');
  for(const dark of [false,true]){if(await page.locator('#app-theme').isChecked()!==dark)await page.locator('.theme-switch').click();await page.locator('#stop-id-renumber-setting').screenshot({path:path.join(root,`tmp/stop-management-${dark?'dark':'light'}.png`)});}
  await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#stop-id-renumber-setting').evaluate(n=>n.scrollWidth<=n.clientWidth),'Stop management fits mobile width');await page.setViewportSize({width:1440,height:1000});
  await page.locator('#go-to-reports').click();
  await page.evaluate(()=>setMode('scheduling'));await page.selectOption('#scu-route-key','route_short_name');await page.evaluate(()=>setMode('reports'));assert.match(await page.evaluate(()=>readyGtfsExportPlan().units.text),/scheduling_unit,42,Route 42,1100,42/);
  await page.evaluate(()=>state.originalEntries=state.originalEntries.filter(e=>e.name!=='trips.txt'));await page.locator('#download-times').click();assert.ok(alerts.some(m=>/Incomplete GTFS: trips.txt/.test(m)));assert.equal(await page.locator('#download-times').isEnabled(),true);assert.deepEqual(errors,[]);
  console.log('PASS: full ready-to-import ZIP, numeric ID dependencies, empty proposed/source places, current GTFS routes, both route keys, exact OIR script, FR/EN and incomplete-feed guard.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
