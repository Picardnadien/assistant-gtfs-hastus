// Run tests/assessment-deadhead.test.cjs first. Synthetic records only.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const lang of ['fr','en']){
      const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await page.route('https://presentation.test/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(`tmp/assessment-deadhead-${lang}.html`,'utf8')}));
      await page.goto('https://presentation.test/report');
      for(let i=0;i<7;i++)await page.locator('#review-tutorial-next').click();
      await page.locator('#assessment-queue').selectOption('all');
      assert.equal(await page.locator('#export-client-selection').isDisabled(),true);
      await page.locator('#overview > summary').click();
      assert.equal(await page.locator('#overview-body').isVisible(),false);
      await page.locator('#overview > summary').click();
      await page.locator('#overview-grouped').uncheck();
      assert.equal(await page.locator('#overview-body tr').count(),5);
      await page.locator('#overview-grouped').check();
      assert.equal(await page.locator('#overview-body tr').count(),4);
      for(const width of [1100,1366,1920]){
        await page.setViewportSize({width,height:900});
        const rects=await page.locator('.filters>label').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().toJSON()));
        assert.ok(Math.max(...rects.map(r=>r.bottom))-Math.min(...rects.map(r=>r.bottom))<2,'Filters align on one row');
        assert.ok(await page.locator('.filters').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      }
      await page.setViewportSize({width:1366,height:900});
      await page.locator('#endpoint-scope').check();
      const id=await page.locator('[data-client-select]').first().getAttribute('data-client-select');
      await page.locator(`[data-client-select="${id}"]`).check();
      await page.locator(`#${id} .map-layer-options summary`).click();
      await page.locator(`[data-layer-case="${id}"][data-map-layer="tp"]`).uncheck();
      assert.equal(await page.locator(`#${id} .marker.tp`).first().isVisible(),false);
      assert.equal(await page.locator(`#${id} [data-review-validate]`).getAttribute('aria-pressed'),'false','Presentation does not approve the case');
      await page.locator(`[data-layer-case="${id}"][data-map-layer="place:001"]`).uncheck();
      assert.equal(await page.locator(`#${id} .marker.place`).first().isVisible(),false);
      await page.locator('#overview-grouped').uncheck();
      await page.locator('#overview > summary').click();
      await page.screenshot({path:`tmp/assessment-presentation-${lang}.png`,fullPage:true});
      const copy=page.waitForEvent('download');await page.locator('#download-assessment-copy').click();
      const full=await copy;await full.saveAs(`tmp/assessment-presentation-${lang}-full.html`);
      const exported=page.waitForEvent('download');await page.locator('#export-client-selection').click();
      const selected=await exported;await selected.saveAs(`tmp/assessment-presentation-${lang}-client.html`);
      const client=fs.readFileSync(`tmp/assessment-presentation-${lang}-client.html`,'utf8'),payload=JSON.parse(client.match(/<script id="assessment-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
      assert.equal(payload.cases.length,1);assert.equal(payload.cases[0].id,id);
      assert.equal(Object.keys(payload.maps).length,1);assert.equal(Object.keys(payload.csvRows).length,1);
      assert.ok(!client.includes('Reference with links'),'Unselected record text is not embedded');
      assert.ok(!client.includes('Destination'),'Unselected place is absent');
      const other=await browser.newContext(),reopened=await other.newPage();
      reopened.on('pageerror',e=>errors.push(e.message));
      await reopened.route('https://client.test/**',r=>r.fulfill({contentType:'text/html',body:client}));
      await reopened.goto('https://client.test/report');
      assert.equal(await reopened.locator('#cases article').count(),1);
      assert.equal(await reopened.locator('#overview-grouped').isChecked(),false);
      assert.equal(await reopened.locator('#overview').getAttribute('open'),null);
      assert.equal(await reopened.locator('.marker.tp').first().isVisible(),false);
      assert.equal(await reopened.locator('[data-client-select]').isChecked(),true);
      await other.close();
      await page.reload();
      assert.equal(await page.locator('#overview-grouped').isChecked(),false,'Browser draft retains presentation');
      assert.equal(await page.locator('#overview').getAttribute('open'),null);
      await page.locator('#endpoint-scope').check();
      assert.equal(await page.locator(`[data-client-select="${id}"]`).isChecked(),true);
      assert.equal(await page.locator(`#${id} .marker.tp`).first().isVisible(),false);
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('PASS: FR/EN single-row filters, collapsible/grouped overview, independent case selection/layers, subset-only HTML, saved presentation and reload.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
