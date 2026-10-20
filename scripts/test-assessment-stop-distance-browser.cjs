// Optional browser checks. Synthetic data only; run the unit fixture generator first.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const language of ['fr','en']){
      const context=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true});
      await context.addInitScript(()=>{
        Element.prototype.requestFullscreen=async()=>{throw Error('Synthetic fallback');};
        window.testFile={html:'',modified:1,writes:0};
        window.showSaveFilePicker=async()=>({
          name:'synthetic.html',getFile:async()=>({size:window.testFile.html.length,lastModified:window.testFile.modified}),
          createWritable:async()=>{let content;return {write:async s=>{content=s;},close:async()=>{window.testFile.html=content;window.testFile.modified++;window.testFile.writes++;},abort:async()=>{}};}
        });
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      const html=fs.readFileSync(`tmp/assessment-stop-distance-${language}.html`,'utf8');
      await page.route('https://assessment.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
      await page.goto('https://assessment.test/'+language);
      await page.locator('#assessment-review-tutorial').waitFor({state:'visible'});
      for(let i=0;i<7;i++)await page.locator('#review-tutorial-next').click();
      await page.locator('#assessment-queue').selectOption('all');
      await page.locator('#type').selectOption('distantStop');
      assert.equal(await page.locator('#cases article').count(),2);
      await page.locator('#endpoint-scope').check();
      assert.equal(await page.locator('#cases article').count(),1);
      const id=await page.locator('[data-review-validate]').first().getAttribute('data-review-validate');
      const card=page.locator('#'+id);
      await card.locator(':scope > details').evaluate(el=>el.open=true);
      async function fillField(selector,value){
        const field=page.locator(selector);
        await field.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
        await field.fill(value);await field.press('Tab');
      }
      await fillField(`[data-review-note="${id}"]`,'Client note');
      await fillField(`[data-review-csched="${id}"]`,'CSched <b>review</b>');
      assert.equal(await page.locator(`[data-review-note="${id}"]`).inputValue(),'Client note');
      await page.locator(`[data-review-validate="${id}"]`).click();
      assert.equal(await page.locator(`[data-review-validate="${id}"]`).getAttribute('aria-pressed'),'true');
      await page.locator('#autosave-assessment').click();
      await page.waitForFunction(()=>window.testFile.writes>=1);
      await page.locator(`[data-review-open="${id}"]`).click();
      await page.locator('#review-layout-choice').selectOption('map');
      assert.equal(await page.locator('#review-csched').inputValue(),'CSched <b>review</b>');
      await fillField('#review-csched','Updated CSched <b>review</b>');
      assert.equal(await page.locator('#review-note').inputValue(),'Client note');
      await page.waitForFunction(()=>window.testFile.writes>=2);
      await page.screenshot({path:`tmp/assessment-stop-distance-${language}-review.png`});
      await page.locator('#review-close').click();
      assert.equal(await page.locator(`[data-review-validate="${id}"]`).getAttribute('aria-pressed'),'false');
      const downloaded=page.waitForEvent('download');
      await page.locator('#export-assessment-csv').click();
      const file=await downloaded,output=path.resolve(`tmp/assessment-stop-distance-${language}.csv`);
      await file.saveAs(output);
      const csv=fs.readFileSync(output,'utf8');
      assert.ok(csv.includes('Updated CSched <b>review</b>'));assert.ok(csv.includes('Client note'));
      assert.ok(csv.includes('stop_place_distance_m'));assert.ok(!csv.includes('Far intermediate stop'));
      const popupPromise=page.waitForEvent('popup');
      await page.locator('#print-assessment').click();
      const preview=await popupPromise;
      await preview.locator('#print-cases article').waitFor();
      assert.equal(await preview.locator('#print-cases article').count(),1);
      assert.ok((await preview.locator('#print-cases article').textContent()).includes('Updated CSched <b>review</b>'));
      assert.equal(await preview.locator('#print-cases article b').filter({hasText:/^review$/}).count(),0,'Recommendation is escaped');
      await preview.close();
      const saved=await page.evaluate(()=>window.testFile.html);
      const other=await browser.newContext({viewport:{width:1366,height:900}}),reopened=await other.newPage();
      reopened.on('pageerror',e=>errors.push(e.message));
      await reopened.route('https://saved.test/**',r=>r.fulfill({contentType:'text/html',body:saved}));
      await reopened.goto('https://saved.test/report');
      assert.equal(await reopened.locator('#endpoint-scope').isChecked(),true);
      assert.equal(await reopened.locator(`[data-review-csched="${id}"]`).inputValue(),'Updated CSched <b>review</b>');
      assert.equal(await reopened.locator(`[data-review-note="${id}"]`).inputValue(),'Client note');
      assert.equal(await reopened.locator(`[data-review-validate="${id}"]`).getAttribute('aria-pressed'),'false');
      assert.deepEqual(errors,[]);
      await other.close();await context.close();
    }
    console.log('PASS: FR/EN distance and endpoint filters, normal/fullscreen independent notes, invalidation, autosave, saved HTML without cache, CSV and print preview.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
