// Optional local browser verification with synthetic fixtures, never user data.
// node scripts/test-assessment-review-browser.cjs <path-to-playwright>
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{const lang=req.url.includes('/en')?'en':'fr',mode=req.url.includes('online')?'online':'offline';res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,`tmp/report-editor-existing-${lang}-${mode}.html`)));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});
    await context.addInitScript(()=>{
      // Exercise the viewport fallback without requiring a real presentation screen.
      Element.prototype.requestFullscreen=async()=>{throw new Error('Synthetic fullscreen denied');};
      window.testFile={content:'',modified:1,writes:0,picks:0};
      window.showSaveFilePicker=async()=>{window.testFile.picks++;return {name:'Synthetic_review.html',getFile:async()=>({size:window.testFile.content.length,lastModified:window.testFile.modified}),createWritable:async()=>{let text;return {write:async value=>{text=value;},close:async()=>{window.testFile.content=text;window.testFile.modified++;window.testFile.writes++;},abort:async()=>{}};}};};
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}/fr`);
    await page.locator('#assessment-review-tutorial').waitFor({state:'visible'});
    for(let i=0;i<7;i++)await page.locator('#review-tutorial-next').click();
    assert.equal(await page.locator('#assessment-review-tutorial').isVisible(),false);
    const first=page.locator('[data-review-validate]').first(),id=await first.getAttribute('data-review-validate');
    await first.click();assert.equal(await page.locator(`[data-review-validate="${id}"]`).getAttribute('aria-pressed'),'true');
    await page.locator(`[data-review-open="${id}"]`).click();
    await page.locator('#assessment-review').waitFor({state:'visible'});
    assert.equal(await page.locator('#review-layout-choice').inputValue(),'max','New reports prioritize the maximum map');
    assert.equal(await page.locator('#review-details-panel').isVisible(),false);
    assert.ok(await page.locator('#review-map .review-distance').first().isVisible(),'Distances are visible without the details panel');
    assert.ok((await page.locator('#review-map .review-distance-value').first().textContent()).includes(' m'));
    assert.equal(await page.locator('#review-map-validate').getAttribute('aria-pressed'),'true');
    await page.locator('#review-map-validate').click();
    await page.locator('#review-toggle-details').click();
    assert.equal(await page.locator('#review-details-panel').isVisible(),true);
    assert.equal(await page.locator('#review-map .review-distance').first().isVisible(),false,'Other map layouts remain unchanged');
    await page.locator('.review-decision summary').click();
    await page.locator('#review-note').fill('Vérifier le retournement <script>unsafe</script>');await page.locator('#review-note').press('Tab');
    await page.locator('#review-validate').click();
    await page.locator('#review-comfort').click();await page.locator('#review-layout-choice').selectOption('compare');
    async function assertMapFits(){
      await page.waitForFunction(()=>{
        const stage=document.querySelector('#review-map .map-stage'),frame=document.querySelector('#review-map .review-map-frame');
        if(!stage||!frame)return false;
        const s=stage.getBoundingClientRect(),f=frame.getBoundingClientRect(),ratio=1000/430;
        return s.width>0&&s.height>0&&Math.abs(s.width/s.height-ratio)<.01&&s.top>=f.top-1&&s.left>=f.left-1&&s.right<=f.right+1&&s.bottom<=f.bottom+1&&Math.abs(s.width-Math.min(f.width,f.height*ratio))<2;
      });
      const fits=await page.evaluate(()=>{
        const host=document.getElementById('review-map'),h=host.getBoundingClientRect(),s=host.querySelector('.map-stage').getBoundingClientRect(),n=document.querySelector('.review-bottom').getBoundingClientRect();
        return h.top>=0&&h.bottom<=innerHeight&&s.top>=h.top&&s.bottom<=h.bottom+1&&host.scrollHeight<=host.clientHeight+1&&n.bottom<=innerHeight+1;
      });assert.ok(fits,'Complete map and navigation fit the actual panel without scrolling');
    }
    for(const layout of ['map','compare','max'])for(const [width,height] of [[1366,480],[960,540],[684,384],[390,844],[1920,1080],[3840,2160]]){
      await page.setViewportSize({width,height});await page.locator('#review-layout-choice').selectOption(layout);await assertMapFits();
      if(layout==='max'){
        assert.equal(await page.locator('#review-details-panel').isVisible(),false);
        assert.equal(await page.locator('#review-map-validate').isVisible(),true);
        const host=await page.locator('#review-map').boundingBox();assert.ok(host.width>=width-10,'Maximum map uses almost all the viewport width');
      }else if(width>=1366){
        const panel=await page.locator('.review-layout>aside').boundingBox();assert.ok(panel.width>=599,'Desktop detail panel is wide enough for stop tables');
        const tablesFit=await page.locator('#review-detail .table-wrap').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1));
        assert.ok(tablesFit,'Synthetic stop tables fit without horizontal scrolling on desktop');
      }
    }
    // Dynamic titles and legends must reduce the remaining map space safely.
    await page.setViewportSize({width:1366,height:480});
    await page.locator('#review-title').evaluate(el=>el.textContent+=' · Long description '.repeat(35));
    await page.locator('#review-map .legend').evaluate(el=>el.textContent+=' · Additional legend '.repeat(35));
    await assertMapFits();
    await page.locator('#review-show-all').click();await page.locator('#review-show-all').click();
    for(const [width,height] of [[1366,768],[1920,1080],[3840,2160]]){
      await page.setViewportSize({width,height});
      await assertMapFits();
      const bounds=await page.locator('.review-bottom').boundingBox();assert.ok(bounds.y+bounds.height<=height+1,'Navigation remains inside viewport');
      const map=await page.locator('#review-map .map-stage').boundingBox();assert.ok(map.width>200&&map.height>100);
      await page.screenshot({path:path.join(root,`tmp/assessment-review-${width}.png`)});
    }
    await page.locator('#review-close').click();
    await page.locator('#autosave-assessment').click();
    await page.waitForFunction(()=>window.testFile.writes===1);
    await page.locator(`[data-review-validate="${id}"]`).click();
    await page.waitForFunction(()=>window.testFile.writes===2);
    assert.equal(await page.evaluate(()=>window.testFile.picks),1,'Autosave writes the same file without reopening a picker');
    const savedHtml=await page.evaluate(()=>window.testFile.content);
    assert.ok(savedHtml.includes('Vérifier le retournement'));assert.ok(!savedHtml.includes('<script>unsafe</script>'));
    await page.reload();assert.equal(await page.locator('#assessment-review-tutorial').isVisible(),false);
    assert.ok((await page.locator('#assessment-log-body tr').count())>=4,'Draft replays after reload');
    assert.equal(await page.locator('body').getAttribute('class'),'assessment-comfort');
    await page.locator('#stop-scope').selectOption('tp');
    assert.equal(await page.locator(`[data-review-validate="${id}"]`).getAttribute('aria-pressed'),'false');
    await page.locator(`[data-review-validate="${id}"]`).click();
    await page.locator('#stop-scope').selectOption('all');
    assert.equal(await page.locator(`[data-review-validate="${id}"]`).getAttribute('aria-pressed'),'false','TP approval must not validate all stops');
    await page.locator('#stop-scope').selectOption('tp');
    assert.equal(await page.locator(`[data-review-validate="${id}"]`).getAttribute('aria-pressed'),'true');
    const csvDownload=page.waitForEvent('download');await page.locator('#export-assessment-log').click();
    const csvFile=await csvDownload;await csvFile.saveAs(path.join(root,'tmp/assessment-review-log.csv'));
    assert.ok(fs.readFileSync(path.join(root,'tmp/assessment-review-log.csv'),'utf8').includes('TP uniquement'));
    // Reopen the actual saved HTML in an isolated profile, without its browser cache.
    const other=await browser.newContext({viewport:{width:1366,height:768}}),reopened=await other.newPage();
    reopened.on('pageerror',e=>errors.push(e.message));
    await reopened.route('http://review.test/**',route=>route.fulfill({contentType:'text/html',body:savedHtml}));
    await reopened.goto('http://review.test/saved');assert.ok(await reopened.locator('#assessment-log-body tr').count()>=4);
    assert.equal(await reopened.locator('#assessment-review').isVisible(),false);
    assert.equal(await reopened.locator('#assessment-review-tutorial').isVisible(),false);
    await other.close();
    await page.goto(`http://127.0.0.1:${server.address().port}/en`);await page.locator('#assessment-review-tutorial').waitFor({state:'visible'});
    assert.ok((await page.locator('#review-tutorial-title').textContent()).includes('Welcome'));await page.locator('#review-tutorial-close').click();
    await page.locator('#start-assessment-review').click();await page.locator('#review-show-all').click();
    await page.locator('#review-toggle-details').click();
    const linked=page.locator('#review-detail [data-case-link]').first();
    if(await linked.count()){await linked.click();assert.equal(await page.locator('#review-return').isVisible(),true);await page.locator('#review-return').click();}
    await page.keyboard.press('Escape');assert.equal(await page.locator('#assessment-review').isVisible(),false);
    // No external network needed: check online iframe/overlay sizing with a stub background.
    await page.route('https://www.openstreetmap.org/**',route=>route.fulfill({contentType:'text/html',body:'<body style="background:#dbe2d4">Synthetic OSM background</body>'}));
    await page.goto(`http://127.0.0.1:${server.address().port}/en-online`);await page.locator('#review-tutorial-close').click();
    await page.locator('#start-assessment-review').click();await page.setViewportSize({width:1366,height:480});await assertMapFits();
    const aligned=await page.evaluate(()=>{const stage=document.querySelector('#review-map .map-stage'),a=stage.querySelector('svg').getBoundingClientRect(),b=stage.querySelector('iframe').getBoundingClientRect();return ['x','y','width','height'].every(key=>Math.abs(a[key]-b[key])<1);});
    assert.ok(aligned,'Online background and SVG keep identical dimensions and position');
    assert.deepEqual(errors,[]);console.log('PASS: browser review/autosave/tutorial, responsive map containment in both layouts (mobile, short screen, Full HD, 4K, long titles/legends), online overlay alignment, saved HTML, FR/EN and scope isolation');
  }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
