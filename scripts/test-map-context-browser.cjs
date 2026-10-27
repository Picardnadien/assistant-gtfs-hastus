// Synthetic acceptance tests: no client data and no network map downloads.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const relative=decodeURIComponent(req.url.split('?')[0]).replace(/^\//,'')||'index.html',file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8');res.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('https://**',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#e2e8dd">Synthetic OSM</body>'}));
  await context.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw Error('Synthetic fallback');};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>(errors.push(e.message),console.error('PAGE:',e.message)));page.on('dialog',d=>d.accept());const base='http://127.0.0.1:'+server.address().port;
  console.log('App checks');await page.goto(base);await page.locator('#app-theme').check({force:true});assert.ok(await page.locator('body').evaluate(n=>n.classList.contains('clean-dark-theme')));await page.reload();assert.ok(await page.locator('#app-theme').isChecked());await page.locator('#app-theme').uncheck({force:true});
  await page.selectOption('#journey-client','existing');assert.ok(await page.locator('#hastus-upload').isVisible());assert.equal(await page.locator('[data-source=hastus]').isVisible(),false);
  await page.evaluate(()=>{
    state.parsed={stops:parseCSV('stop_id,stop_name,stop_lat,stop_lon\nold,Old stop,45,-75\nnear,Nearby TP,45.0001,-75\nfar,Remote TP,46,-75\nmissing,No coordinates,,\n'),times:parseCSV('trip_id,stop_id,stop_sequence,timepoint\nt,old,1,1\nt,near,2,1\nt,far,3,1\nt,missing,4,1'),hastus:parseCSV('Stop,Description,Place,PlaceDescription,Latitude,Longitude\nold,Old stop,KEEP,Existing place,45,-75'),routes:parseCSV('route_id,route_short_name\nr,10'),trips:parseCSV('trip_id,route_id\nt,r')};
    state.files={stops:'stops.txt',times:'stop_times.txt',hastus:'synthetic.csv'};setupMapping();
    for(const [key,value] of Object.entries({stopId:'Stop',stopDesc:'Description',placeId:'Place',placeDesc:'PlaceDescription',lat:'Latitude',lon:'Longitude',referenceId:''}))document.getElementById('map-'+key).value=value;
    document.getElementById('association-key').value='stop_id';analyze();
  });
  const decisions=await page.evaluate(()=>state.decisions);assert.equal(decisions.find(d=>d.id==='old').choice,'KEEP');assert.equal(decisions.find(d=>d.id==='near').choice,'KEEP');assert.equal(decisions.find(d=>d.id==='far').choice,'__new__');assert.equal(decisions.find(d=>d.id==='missing').status,'error');
  await page.locator('[data-mode=diagnostic]').click();assert.equal(await page.locator('#export-bar').isVisible(),false);assert.equal(await page.locator('#decision-list .decision-card').count(),0);assert.ok(await page.locator('.hastus-corrections').isVisible());assert.ok(await page.locator('#download-existing-html').isVisible());assert.ok(await page.evaluate(()=>{try{buildExports();return false;}catch{return true;}}));
  const name=()=>page.locator('[data-hc-id="KEEP"][data-hc-field="description"]');await name().fill('Reviewed description');await name().press('Tab');
  await page.selectOption('#app-language','en');assert.match(await page.locator('.hastus-corrections .hc-table thead').textContent(),/Is a reference place/);assert.equal(await name().inputValue(),'Reviewed description');
  await page.locator('[data-mode=geographic]').click();assert.equal((await page.evaluate(()=>state.decisions)).find(d=>d.id==='old').choice,'KEEP');
  await page.locator('[data-mode=diagnostic]').click();assert.equal(await name().inputValue(),'Reviewed description','Corrections survive switching journeys');
  await page.screenshot({path:path.join(root,'tmp/journeys-diagnostic.png'),fullPage:false});
  for(const mode of ['online','offline']){console.log('Report',mode);await page.evaluate(()=>localStorage.clear());
    await page.goto(base+'/tmp/report-editor-'+(mode==='online'?'online-':'')+'8-en.html');await page.locator('[data-help-close]').click();
    const card=page.locator('[data-report-place]').first(),svg=card.locator('.place-map svg').first();await svg.scrollIntoViewIfNeeded();await page.waitForTimeout(150);
    const attrs=await svg.getAttribute('viewBox');assert.ok(await svg.getAttribute('data-map-geometry'));
    const checkbox=card.locator('.map-context-controls input').first();await checkbox.check();assert.equal(await svg.getAttribute('viewBox'),attrs);
    const hit=svg.locator('[data-stop-info="001"]');await hit.dispatchEvent('click');assert.match(await page.locator('.map-context-popup').textContent(),/Latitude:[\s\S]*Longitude:[\s\S]*Timing point:/);await page.locator('.map-context-popup button').click();
    await svg.click({position:{x:50,y:50}});const viewer=page.locator('.map-only-viewer');assert.ok(await viewer.isVisible());
    for(const size of [{width:1440,height:1000},{width:820,height:1180},{width:390,height:844}]){
      await page.setViewportSize(size);await page.waitForTimeout(150);
      const error=await page.evaluate(()=>{const svg=document.querySelector('.map-only-background'),g=JSON.parse(svg.dataset.mapGeometry),p=JSON.parse(document.getElementById('report-data').textContent).points.find(p=>p.id==='001'),world=mapTools().project(p,g.zoom),q=new DOMPoint(world.x-g.center.x+g.width/2,world.y-g.center.y+g.height/2).matrixTransform(svg.getScreenCTM()),dot=document.querySelector('[data-map-point-id="001"]').getBoundingClientRect();return Math.hypot(q.x-dot.x-dot.width/2,q.y-dot.y-dot.height/2);});assert.ok(error<1,'The point and map use the same transform at every size: '+error);
      if(mode==='online'){assert.equal(await viewer.locator('.osm-fixed-background iframe').count(),1);const match=await viewer.locator('.osm-fixed-background').evaluate(n=>{const r=n.getBoundingClientRect(),f=n.querySelector('iframe').getBoundingClientRect();return Math.abs(r.width-f.width)<1&&Math.abs(r.height-f.height)<1;});assert.ok(match,'OSM pixels scale with the SVG, not independently');}
    }
    await viewer.locator('.map-context-controls input').uncheck();await viewer.locator('[data-stop-info="001"]').dispatchEvent('click');assert.ok(await page.locator('.map-context-popup').isVisible());await page.locator('.map-context-popup button').click();await viewer.locator('.map-only-close').click();assert.equal(await svg.getAttribute('viewBox'),attrs);
    await page.setViewportSize({width:1440,height:1000});
  }
  const neighbor=await context.newPage();await neighbor.setContent('<svg viewBox="0 0 1000 430"></svg>');await neighbor.addScriptTag({path:path.join(root,'map-tools.js')});
  await neighbor.evaluate(()=>{const t=mapTools(),svg=document.querySelector('svg');svg.dataset.mapGeometry=JSON.stringify({width:1000,height:430,zoom:16,center:t.project({lat:45,lon:-75},16)});t.mount(()=>[{id:'NEIGHBOR',description:'Nearby',lat:45,lon:-75,timing:false,routes:['10']}]);});
  assert.equal(await neighbor.locator('[data-stop-info]').count(),0);await neighbor.locator('.map-context-controls input').check();assert.equal(await neighbor.locator('[data-stop-info="NEIGHBOR"]').count(),1);assert.equal(await neighbor.locator('svg').getAttribute('viewBox'),'0 0 1000 430');await neighbor.close();
  assert.deepEqual(errors,[]);console.log('PASS: theme switch/restoration, two journeys, existing-place reuse, missing coordinates, bilingual corrections retained across journeys, surrounding-stop toggle, popup, shared OSM/marker transform across desktop/tablet/mobile and fullscreen return.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
