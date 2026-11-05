// Synthetic GTFS only. Exercise the real download and inspect ZIP contents.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
function unzip(bytes){const entries=new Map();let i=0;while(bytes.readUInt32LE(i)===0x04034b50){const size=bytes.readUInt32LE(i+18),n=bytes.readUInt16LE(i+26),extra=bytes.readUInt16LE(i+28),start=i+30+n+extra;entries.set(bytes.subarray(i+30,i+30+n).toString(),bytes.subarray(start,start+size));i=start+size;}return entries;}
(async()=>{
 const server=http.createServer((req,res)=>{const route=decodeURIComponent(req.url.split('?')[0]),file=path.join(root,route==='/'?'index.html':route);if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],alerts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{alerts.push(d.message());d.accept();});await page.route('https://**',r=>r.fulfill({contentType:'text/html',body:'Synthetic map'}));await page.goto('http://127.0.0.1:'+server.address().port);
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
  await page.evaluate(()=>setMode('scheduling'));await page.selectOption('#scu-route-key','route_short_name');await page.evaluate(()=>setMode('reports'));assert.match(await page.evaluate(()=>readyGtfsExportPlan().units.text),/scheduling_unit,42,Route 42,1100,42/);
  await page.evaluate(()=>state.originalEntries=state.originalEntries.filter(e=>e.name!=='trips.txt'));await page.locator('#download-times').click();assert.ok(alerts.some(m=>/Incomplete GTFS: trips.txt/.test(m)));assert.equal(await page.locator('#download-times').isEnabled(),true);assert.deepEqual(errors,[]);
  console.log('PASS: full ready-to-import ZIP, numeric ID dependencies, empty proposed/source places, current GTFS routes, both route keys, exact OIR script, FR/EN and incomplete-feed guard.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
