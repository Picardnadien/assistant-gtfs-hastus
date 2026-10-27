// Synthetic corrections only. No client files or live map requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const file=req.url.startsWith('/saved')?'hastus-corrections-saved.html':'report-editor-existing-fr-offline.html';res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'tmp',file)));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
  await context.route('https://**',r=>r.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin);await page.locator('#review-tutorial-close').click();
  const source=await page.locator('#assessment-data').textContent(),baseline=JSON.parse(source).hastusBaseline;
  assert.ok(baseline?.places.length);assert.match(await page.locator('.hastus-corrections .hc-table thead').textContent(),/Est une place de référence/);
  const field=(id,key)=>page.locator(`[data-hc-id="${id}"][data-hc-field="${key}"]`);
  // Resolve the deliberately missing reference before exporting this fixture.
  await field('MISS','reference_place_code').selectOption('REF');
  const approval=page.locator('[data-review-validate]').first(),id=await approval.getAttribute('data-review-validate');await approval.click();
  assert.equal(await page.locator(`[data-review-validate="${id}"]`).getAttribute('aria-pressed'),'true');
  await field('AAA','description').fill('Description corrigée');await field('AAA','description').press('Tab');
  assert.equal(await page.locator(`[data-review-validate="${id}"]`).getAttribute('aria-pressed'),'false','Data edits invalidate prior approvals');
  await page.selectOption('[data-hc-kind]','stop');await field('stop-AAA','place_code').selectOption('TARGET');
  assert.equal(await field('stop-AAA','stop_latitude').inputValue(),baseline.stops.find(s=>s.stop_id==='stop-AAA').stop_latitude);
  const downloads={};for(const [selector,key] of [['[data-hc-csv]','csv'],['[data-hc-journal]','journal'],['[data-hc-note]','note']]){
   const pending=page.waitForEvent('download');await page.locator(selector).click();downloads[key]=fs.readFileSync(await(await pending).path(),'utf8');
  }
  assert.match(downloads.csv,/"is_reference_place";"reference_place_code"/);assert.match(downloads.csv,/"stop-AAA";[^\r\n]*;"TARGET";/);
  assert.match(downloads.journal,/"stop";"stop-AAA";"place_code";"AAA";"TARGET"/);assert.match(downloads.note,/Description corrigée/);
  await page.reload();assert.ok(await page.locator('.hastus-corrections').isVisible());await page.selectOption('[data-hc-kind]','stop');assert.equal(await field('stop-AAA','place_code').inputValue(),'TARGET','Browser draft survives reload');
  const pending=page.waitForEvent('download');await page.locator('#download-assessment-copy').click();await(await pending).saveAs(path.join(root,'tmp/hastus-corrections-saved.html'));
  const html=fs.readFileSync(path.join(root,'tmp/hastus-corrections-saved.html'),'utf8');assert.ok(!html.includes('<section data-no-translate="" class="hastus-corrections">'),'Live editor is not serialized');
  await page.evaluate(()=>localStorage.clear());await page.goto(origin+'/saved');await page.locator('#review-tutorial-close').click();
  await page.selectOption('[data-hc-kind]','stop');assert.equal(await field('stop-AAA','place_code').inputValue(),'TARGET','Downloaded report embeds corrections');
  await field('stop-AAA','stop_latitude').fill('999');await field('stop-AAA','stop_latitude').press('Tab');assert.ok(await page.locator('[data-hc-csv]').isDisabled());
  const restored=JSON.parse(await page.locator('#assessment-data').textContent()).hastusBaseline;assert.deepEqual(restored,baseline,'Baseline is immutable through editing and saving');
  assert.deepEqual(errors,[]);console.log('PASS: diagnostic assignment/reference editing, reference-place label, approval invalidation, physical-coordinate preservation, CSV/journal/impact note downloads, browser draft, saved HTML reopening and invalid-coordinate blocking.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
