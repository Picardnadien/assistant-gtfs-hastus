// Synthetic reports from tests/report-editor.test.cjs; no private data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{const lang=req.url.includes('en')?'en':'fr',online=req.url.includes('online')?'online-':'';res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,`tmp/report-editor-${online}8-${lang}.html`)));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    for(const lang of ['fr','en'])for(const mode of ['offline','online']){
      const context=await browser.newContext({viewport:{width:1366,height:900}});
      await context.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw Error('Fullscreen denied');};});
      let requests=0;await context.route('https://www.openstreetmap.org/**',r=>{requests++;return r.fulfill({contentType:'text/html',body:'<body style="background:#e6eada">Synthetic map</body>'});});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/${lang}-${mode}`);await page.locator('[data-help-close]').click();
      const card=page.locator('[data-report-place]').first(),map=card.locator('[data-review-map-toggle]'),viewer=page.locator('.map-only-viewer'),canvas=viewer.locator('.map-only-canvas');
      const code=await card.locator('[data-place-code]').inputValue();await page.locator('#place-search').fill(code);
      await card.locator('details').first().evaluate(node=>node.open=false);
      await map.scrollIntoViewIfNeeded();await page.waitForTimeout(100);
      const snapshot=()=>page.evaluate(()=>({y:scrollY,details:[...document.querySelectorAll('[data-report-place] details')].map(n=>n.open),count:document.getElementById('result-count').textContent,source:document.getElementById('report-data').textContent}));
      const before=await snapshot();await map.click({position:{x:50,y:50}});
      assert.ok(await viewer.isVisible());assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('review-mode')),false,'Map opens without entering the review sheet');
      assert.equal(await viewer.locator('input:not(.map-context-controls input),select,table,.client-editor,.review-toolbar').count(),0,'Only the map, labels and minimal close control');
      assert.equal(await viewer.locator('.map-stop-label').count(),2);
      assert.match(await viewer.locator('[data-map-stop-id="001"]').textContent(),/001[\s\S]*Stop one/);
      assert.match(await viewer.locator('[data-map-stop-id="002"]').textContent(),/002[\s\S]*Stop two/);
      for(const size of [{width:1366,height:900},{width:820,height:1180},{width:390,height:844}]){
        await page.setViewportSize(size);await page.waitForTimeout(80);
        const bounds=await canvas.boundingBox();assert.equal(bounds.x,0);assert.equal(bounds.y,0);assert.equal(Math.round(bounds.width),size.width);assert.equal(Math.round(bounds.height),size.height);
        assert.ok(await viewer.locator('.map-stop-label').evaluateAll(nodes=>nodes.every(node=>{const r=node.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})),'Labels remain inside viewport');
      }
      await page.setViewportSize({width:1366,height:900});await page.waitForTimeout(80);
      if(lang==='en'&&mode==='online')await page.screenshot({path:path.join(root,'tmp/report-map-only-fullscreen.png')});
      await canvas.click({position:{x:50,y:150}});await page.waitForTimeout(100);
      assert.equal(await viewer.isVisible(),false);assert.equal(await page.locator('#place-search').inputValue(),code);
      const after=await snapshot();assert.ok(Math.abs(after.y-before.y)<4,`Previous scroll restored (${before.y} → ${after.y})`);assert.deepEqual(after.details,before.details);assert.equal(after.count,before.count);assert.equal(after.source,before.source);
      assert.equal(await map.evaluate(e=>e===document.activeElement),true);
      await map.press('Enter');assert.ok(await viewer.isVisible());await canvas.press(' ');assert.equal(await viewer.isVisible(),false);
      await map.click({position:{x:50,y:50}});await page.keyboard.press('Escape');assert.equal(await viewer.isVisible(),false);
      await page.locator('[data-start-review]').click();assert.ok(await page.locator('body').evaluate(e=>e.classList.contains('review-mode')));
      await page.locator('.review-active [data-review-map-toggle]').click({position:{x:50,y:50}});await viewer.locator('.map-only-close').click();
      assert.ok(await page.locator('body').evaluate(e=>e.classList.contains('review-mode')));await page.locator('[data-exit]').click();
      await page.evaluate(()=>{let element=null;window.nativeExits=0;Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>element});document.documentElement.requestFullscreen=()=>new Promise(resolve=>{window.finishFullscreen=()=>{element=document.documentElement;document.dispatchEvent(new Event('fullscreenchange'));resolve();};if(!window.deferFullscreen)window.finishFullscreen();});document.exitFullscreen=async()=>{window.nativeExits++;element=null;document.dispatchEvent(new Event('fullscreenchange'));};});
      await map.click({position:{x:50,y:50}});await canvas.click({position:{x:50,y:150}});
      assert.equal(await page.evaluate(()=>document.fullscreenElement),null);assert.equal(await page.evaluate(()=>window.nativeExits),1);
      await page.evaluate(()=>window.deferFullscreen=true);await map.click({position:{x:50,y:50}});await canvas.click({position:{x:50,y:150}});await page.evaluate(()=>window.finishFullscreen());await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>document.fullscreenElement),null);
      if(mode==='offline')assert.equal(requests,0,'Offline map must not request network tiles');
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('PASS: map-only viewport, stop IDs/descriptions, responsive labels, return to normal/review, keyboard, native fullscreen lifecycle, offline/no network and FR/EN.');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
