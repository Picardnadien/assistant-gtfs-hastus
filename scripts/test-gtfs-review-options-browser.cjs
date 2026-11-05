// Synthetic feed and maps only; no client files or live network requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],alerts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{alerts.push(d.message());d.accept();});await page.route('https://**',r=>r.fulfill({contentType:'text/html',body:'<body style="background:#e4eae1">Synthetic map</body>'}));await page.goto('http://127.0.0.1:'+server.address().port);
  const outputs=await page.evaluate(()=>{
    state.parsed={stops:parseCSV('stop_id,stop_name,stop_lat,stop_lon\n12,Main,45,-75\n9876,Main Park,45.00005,-75\nEG450,Arena,45.0015,-75'),times:parseCSV('trip_id,stop_id,stop_sequence,timepoint\nt,12,1,1\nt,9876,2,1\nt,EG450,3,1')};state.files={stops:'stops.txt',times:'stop_times.txt'};setupMapping();document.getElementById('pad-stop-ids').checked=true;document.getElementById('pad-place-codes').checked=false;analyze();const out=buildExports();
    const items=state.decisions.map(d=>({id:d.originalId,description:d.description,lat:d.lat,lon:d.lon}));state.groups=[{id:'a',code:'ARENA',description:'Arena',lat:45,lon:-75,radius:50,items:items.slice(0,2)},{id:'b',code:'MAIN',description:'Main',lat:45.0015,lon:-75,radius:200,items:items.slice(2)}];state.decisions.forEach(d=>{d.groupId=d.originalId==='EG450'?'b':'a';});render();return out;
  });
  assert.match(outputs.gtfs,/0012,Main/);assert.match(outputs.times,/t,0012,1,1/);assert.match(outputs.gtfs,/EG450,Arena/);
  assert.match(await page.locator('#stop-id-padding-detail').textContent(),/maximale : 5.*numérique : 4/);
  assert.equal(await page.locator('[data-conflict-pending] .radius-conflict-item').count(),1);
  assert.equal(await page.locator('[data-conflict-pending] .radius-conflict-choice-row').count(),2);
  assert.equal(await page.locator('[data-conflict-pending] .radius-conflict-map').count(),1);
  await page.locator('[data-conflict-pending] .conflict-reviewed-toggle').click();assert.equal(await page.locator('[data-conflict-pending] .radius-conflict-item').count(),0);
  assert.equal(await page.locator('.validated-conflicts .radius-conflict-item').count(),1);
  const snapshot=await page.evaluate(()=>JSON.parse(JSON.stringify(workspaceSnapshot())));assert.equal(Object.keys(snapshot.geographicCache.conflictApprovals).length,1);assert.equal(snapshot.settings.padStopIds,true);assert.equal(snapshot.settings.padPlaceCodes,false);
  await page.evaluate(s=>restoreWorkspaceSnapshot(s),snapshot);
  assert.equal(await page.locator('[data-conflict-pending] .radius-conflict-item').count(),0);
  await page.locator('.validated-conflicts>summary').click();await page.locator('.validated-conflicts .conflict-reviewed-toggle').click();assert.equal(await page.locator('[data-conflict-pending] .radius-conflict-item').count(),1);
  await page.locator('[data-conflict-pending] .conflict-reviewed-toggle').click();
  await page.evaluate(()=>{state.groups[1].radius=199;render();});assert.equal(await page.locator('[data-conflict-pending] .radius-conflict-item').count(),1);
  await page.selectOption('#app-language','en');assert.match(await page.locator('.conflict-card-head button').first().textContent(),/Validate this case/);
  await page.locator('#radius-conflict-summary').screenshot({path:path.join(root,'tmp/grouped-radius-validation.png')});
  await page.locator('#pad-stop-id-width').fill('2');assert.equal(await page.evaluate(()=>{try{buildExports();return false;}catch{return true;}}),true,'Numbering changes require analysis before export');
  await page.evaluate(()=>analyze());assert.ok(alerts.some(text=>/between 4 and 1000/.test(text)));assert.deepEqual(errors,[]);
  console.log('PASS: grouped conflict card/map, pending/validated movement, undo validation, snapshot restoration, invalidation, bilingual controls, padded stops/times and blocked invalid export.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
