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
      const palette=await page.locator('#assignment-diagnostics').evaluate(root=>{
        const ordinary=root.querySelector('.place-code:not(.reference-code)'),ref=root.querySelector('.reference-code');
        const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
        const luminance=value=>rgb(value).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
        const contrast=(fg,bg)=>{const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
        const checks=[ordinary,ref,...root.querySelectorAll('.reference-chip,.ad-category,.ad-tp')].map(el=>{const style=getComputedStyle(el);return contrast(style.color,style.backgroundColor);});
        for(const badge of [ordinary,ref])for(const child of badge.querySelectorAll('.code-description,.code-stops'))checks.push(contrast(getComputedStyle(child).color,getComputedStyle(badge).backgroundColor));
        for(const [text,rect] of [['.marker.place:not(.reference-marker) .map-code-main','.place-label'],['.reference-marker .map-code-main','.reference-label'],['.review-distance-value','.review-distance rect']]){
          const label=root.querySelector(text),bg=root.querySelector(rect);if(label&&bg)checks.push(contrast(getComputedStyle(label).fill,getComputedStyle(bg).fill));
        }
        return {background:getComputedStyle(ordinary).backgroundColor,reference:getComputedStyle(ref).backgroundColor,checks};
      });
      assert.ok(palette.checks.every(value=>value>=4.5),'Badge text has at least 4.5:1 contrast in '+theme);
      assert.equal(palette.background,theme==='clean-dark'?'rgb(41, 57, 47)':'rgb(237, 243, 231)','Switching themes restores the correct badge palette');
      assert.notEqual(palette.background,palette.reference,'References retain their distinct colour');
      for(const width of [768,1366]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('#assignment-diagnostics').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Diagnostic fits at '+width+' in '+theme);}
      await page.screenshot({path:path.join(root,`tmp/assignment-diagnostics-${theme}.png`)});
      await page.evaluate(()=>window.scrollTo(0,document.getElementById('assignment-diagnostics').getBoundingClientRect().top+scrollY-65));
      await page.screenshot({path:path.join(root,`tmp/assignment-diagnostics-top-${theme}.png`)});
    }
    const unchanged=await page.evaluate(()=>JSON.stringify({places:state.places,referenceAnomalies:state.referenceAnomalies,groupingCandidates:state.groupingCandidates,decisions:state.decisions}));
    assert.equal(unchanged,JSON.stringify({places:fixture.places,referenceAnomalies:fixture.referenceAnomalies,groupingCandidates:fixture.groupingCandidates,decisions:fixture.decisions}));
    await page.evaluate(source=>{
      const many={...source,referenceAnomalies:Array.from({length:105},(_,i)=>({...source.referenceAnomalies[0],distance_m:600+i}))};
      assignmentDiagnosticFilter='all';assignmentDiagnosticQuery='';
      document.getElementById('assignment-diagnostics').outerHTML=assignmentDiagnosticsHtml(many,{language:'en'});activateAssignmentDiagnostics();
    },fixture);
    assert.equal(await page.locator('[data-ad-case]').count(),106,'All 106 cases are on the same page');
    assert.equal(await page.locator('[data-ad-page]').count(),0);
    assert.equal(await page.locator('.ad-map iframe').count(),1);
    await page.locator('[data-ad-case]').last().locator(':scope > summary').click();
    await page.locator('[data-ad-case]').last().locator('.ad-map iframe').waitFor();
    assert.equal(await page.locator('.ad-stop-list').count(),2,'Opening the last case creates only its own details');
    await page.locator('[data-ad-case]').last().locator('.ad-stop-list summary').click();
    assert.equal(await page.locator('[data-ad-case]').last().locator('tbody tr').count(),3);
    await page.locator('[data-ad-filter]').selectOption('grouping');assert.equal(await page.locator('[data-ad-case]').count(),1);
    await page.locator('[data-ad-filter]').selectOption('all');assert.equal(await page.locator('[data-ad-case]').count(),106);
    assert.deepEqual(errors,[]);console.log('PASS: real application assignment diagnostics, all cases on one page, lazy details/maps, filters/search, missing coordinates, language switching, four themes and source immutability.');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
