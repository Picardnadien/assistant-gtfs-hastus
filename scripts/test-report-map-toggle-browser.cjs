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
      await context.route('https://www.openstreetmap.org/**',r=>r.fulfill({contentType:'text/html',body:'<body style="background:#e6eada">Synthetic map</body>'}));
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/${lang}-${mode}`);await page.locator('[data-help-close]').click();
      const card=page.locator('[data-report-place]').first(),map=card.locator('[data-review-map-toggle]'),key=await card.getAttribute('data-place-key');
      const code=await card.locator('[data-place-code]').inputValue();await page.locator('#place-search').fill(code);
      await card.locator('details').first().evaluate(node=>node.open=false);
      await map.scrollIntoViewIfNeeded();await page.waitForTimeout(100);
      const before=await page.evaluate(()=>({y:scrollY,details:[...document.querySelectorAll('[data-report-place] details')].map(n=>n.open),count:document.getElementById('result-count').textContent,source:document.getElementById('report-data').textContent}));
      await map.click({position:{x:50,y:50}});
      assert.ok(await page.locator('body').evaluate(e=>e.classList.contains('review-mode')));
      assert.equal(await page.locator('.review-active[data-report-place]').getAttribute('data-place-key'),key);
      assert.equal(await map.getAttribute('aria-pressed'),'true');
      assert.match(await map.getAttribute('aria-label'),lang==='fr'?/vue précédente/:/previous view/);
      if(lang==='en'&&mode==='online')await page.screenshot({path:path.join(root,'tmp/report-map-fullscreen.png')});
      await map.click({position:{x:50,y:50}});await page.waitForTimeout(100);
      assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('review-mode')),false);
      assert.equal(await page.locator('#place-search').inputValue(),code);
      const after=await page.evaluate(()=>({y:scrollY,details:[...document.querySelectorAll('[data-report-place] details')].map(n=>n.open),count:document.getElementById('result-count').textContent,source:document.getElementById('report-data').textContent}));
      assert.ok(Math.abs(after.y-before.y)<4,`Previous scroll restored (${before.y} → ${after.y})`);assert.deepEqual(after.details,before.details);assert.equal(after.count,before.count);assert.equal(after.source,before.source);
      assert.equal(await map.evaluate(e=>e===document.activeElement),true);
      await map.press('Enter');assert.equal(await map.getAttribute('aria-pressed'),'true');await map.press(' ');assert.equal(await map.getAttribute('aria-pressed'),'false');
      await map.click({position:{x:50,y:50}});await page.keyboard.press('Escape');assert.equal(await map.getAttribute('aria-pressed'),'false');
      // Simulate a successful native request and a delayed resolution after exit.
      await page.evaluate(()=>{let element=null;window.nativeExits=0;Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>element});document.documentElement.requestFullscreen=()=>new Promise(resolve=>{window.finishFullscreen=()=>{element=document.documentElement;document.dispatchEvent(new Event('fullscreenchange'));resolve();};if(!window.deferFullscreen)window.finishFullscreen();});document.exitFullscreen=async()=>{window.nativeExits++;element=null;document.dispatchEvent(new Event('fullscreenchange'));};});
      await map.click({position:{x:50,y:50}});await map.click({position:{x:50,y:50}});
      assert.equal(await page.evaluate(()=>document.fullscreenElement),null);assert.equal(await page.evaluate(()=>window.nativeExits),1);
      await page.evaluate(()=>window.deferFullscreen=true);await map.click({position:{x:50,y:50}});await map.click({position:{x:50,y:50}});await page.evaluate(()=>window.finishFullscreen());
      await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>document.fullscreenElement),null);assert.equal(await map.getAttribute('aria-pressed'),'false');
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('PASS: map click/keyboard toggle, same place, scroll/filter/details restoration, denied/native/delayed fullscreen, online/offline and FR/EN.');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
