// Synthetic end-to-end check of the real application, no client files.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://www.openstreetmap.org/**',route=>route.fulfill({contentType:'text/html',body:'<body style="background:#dae4cf">Synthetic map</body>'}));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const fixture=JSON.parse(fs.readFileSync(path.join(root,'tmp/assignment-diagnostics-fixture.json'),'utf8'));
    await page.evaluate(source=>{Object.assign(state,source,{mode:'geographic',workflow:'geographic',geographicClientType:'existing',geographicReady:true,timingPointIds:new Set(source.timingPointIds),endpointStopIds:new Set(source.endpointStopIds)});render();document.getElementById('results-section').classList.remove('hidden');},fixture);
    await page.locator('#assignment-diagnostics').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-ad-case]').count(),3);assert.equal(await page.locator('.ad-map iframe').count(),1,'Only first open case loads its map');
    await page.locator('[data-ad-filter]').selectOption('grouping');assert.equal(await page.locator('[data-ad-case]').count(),1);assert.ok((await page.locator('.ad-card').textContent()).includes('Beta station'));
    await page.locator('.ad-stop-list summary').click();assert.equal(await page.locator('.ad-table-wrap tbody tr').count(),3);
    await page.locator('[data-ad-search]').fill('Bay 3');assert.equal(await page.locator('[data-ad-case]').count(),1);
    await page.locator('[data-ad-search]').fill('absent-result');assert.equal(await page.locator('[data-ad-case]').count(),0);
    await page.locator('[data-ad-search]').fill('');await page.locator('[data-ad-filter]').selectOption('reference');
    await page.locator('[data-ad-case]').nth(1).locator(':scope > summary').click();assert.ok((await page.locator('[data-ad-case]').nth(1).textContent()).includes('004'));assert.equal(await page.locator('[data-ad-case]').nth(1).locator('iframe').count(),0);
    await page.locator('#app-language').selectOption('en');assert.ok((await page.locator('#assignment-diagnostics').textContent()).includes('Distant or suspect references'));
    for(const theme of ['clean','clean-dark','classic','genz']){
      await page.locator('#app-theme').selectOption(theme);await page.locator('#assignment-diagnostics').scrollIntoViewIfNeeded();
      for(const width of [768,1366]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('#assignment-diagnostics').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Diagnostic fits at '+width+' in '+theme);}
      await page.screenshot({path:path.join(root,`tmp/assignment-diagnostics-${theme}.png`)});
      await page.evaluate(()=>window.scrollTo(0,document.getElementById('assignment-diagnostics').getBoundingClientRect().top+scrollY-65));
      await page.screenshot({path:path.join(root,`tmp/assignment-diagnostics-top-${theme}.png`)});
    }
    const unchanged=await page.evaluate(()=>JSON.stringify({places:state.places,referenceAnomalies:state.referenceAnomalies,groupingCandidates:state.groupingCandidates,decisions:state.decisions}));
    assert.equal(unchanged,JSON.stringify({places:fixture.places,referenceAnomalies:fixture.referenceAnomalies,groupingCandidates:fixture.groupingCandidates,decisions:fixture.decisions}));
    assert.deepEqual(errors,[]);console.log('PASS: real application assignment diagnostics, lazy maps, filters/search, missing coordinates, language switching, four themes and source immutability.');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
