// Run tests/report-editor.test.cjs first to build synthetic reports.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{const lang=req.url.includes('/en')?'en':'fr';res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,`tmp/report-editor-8-${lang}.html`)));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    for(const lang of ['fr','en']){
      const context=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true});
      await context.addInitScript(()=>{window.showSaveFilePicker=undefined;});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await page.goto(`http://127.0.0.1:${server.address().port}/${lang}`);
      await page.locator('[data-help-read]').click();
      await page.locator('[data-help-close]').click();
      const first=page.locator('[data-report-place]').first(),key=await first.getAttribute('data-place-key');
      const code=first.locator('[data-place-code]'),description=first.locator('[data-place-description]'),search=page.locator('#place-search');
      const oldCode=await code.inputValue(),oldDescription=await description.inputValue();
      await search.fill(oldCode);assert.ok(await first.isVisible());
      await code.fill('NEWCODE');assert.ok(await first.isVisible(),'Renaming must not hide the edited card');
      assert.equal(await code.evaluate(e=>document.activeElement===e),true,'Input keeps focus');
      await description.fill('New description');assert.ok(await first.isVisible(),'Consecutive edits remain visible');
      const approvals=page.locator('.review-summary');
      assert.equal(await approvals.getAttribute('open'),null,'Approvals collapsed by default');
      assert.equal(await approvals.locator('table').isVisible(),false);
      await approvals.locator('summary').click();assert.ok(await approvals.locator('table').isVisible());
      await first.locator('[data-place-approve]').click();
      assert.notEqual(await approvals.getAttribute('open'),null,'Explicit expansion survives refresh');
      assert.equal(await approvals.locator('.approval-status span').first().evaluate(e=>getComputedStyle(e).whiteSpace),'nowrap');
      await page.setViewportSize({width:820,height:1180});
      await page.locator('#client-change-summary').screenshot({path:path.join(root,`tmp/report-summary-compact-${lang}.png`)});
      await approvals.locator('summary').click();assert.equal(await approvals.locator('table').isVisible(),false);
      await search.fill('nonexistent');assert.equal(await first.isVisible(),false,'New searches release the retained card');
      await search.fill(oldCode);assert.equal(await first.isVisible(),false,'Old names are not permanent search aliases');
      await search.fill('New description');assert.ok(await first.isVisible());
      await description.fill('École du Nord');assert.ok(await first.isVisible(),'Description-only search survives editing');
      await first.locator('[data-place-undo]').click();assert.ok(await first.isVisible());
      await description.fill('École du Nord');
      await page.locator('button[data-filter="all"]').click();assert.equal(await first.isVisible(),false,'Changing filter releases retained results');
      await search.fill('');assert.ok(await first.isVisible());
      const download=page.waitForEvent('download');await page.locator('#download-client-package').click();
      const downloaded=await download;await downloaded.saveAs(path.join(root,`tmp/report-fixes-${lang}.zip`));
      const zipBytes=await page.evaluate(async()=>{
        const data=JSON.parse(document.getElementById('report-data').textContent);
        const edits={places:[{key:data.places[0].key,code:'NEWCODE',description:'École du Nord'}],assignments:{}};
        return Array.from(await reportPayloadWorker(data,edits,'zip'));
      });
      // Read ZIP STORE records independently of the exporter.
      const bytes=Buffer.from(zipBytes),entries=new Map();let offset=0;
      while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+length).toString(),start=offset+30+length+extra;entries.set(name,bytes.subarray(start,start+size).toString());offset=start+size;}
      assert.match(entries.get('hastus_import/places/places.csv'),/place;NEWCODE;École du Nord/);
      assert.match(entries.get('hastus_import/places/place - GTFS DESC.oir'),/separator ";"/);
      const copy=page.waitForEvent('download');await page.locator('#download-client-report-copy').click();const saved=await copy,savedPath=path.join(root,`tmp/report-fixes-saved-${lang}.html`);await saved.saveAs(savedPath);
      const savedHtml=fs.readFileSync(savedPath,'utf8');assert.match(savedHtml,/<details class="review-summary">/);
      await page.goto('file:///'+savedPath.replaceAll('\\','/'));
      assert.equal(await page.locator('.review-summary').getAttribute('open'),null);
      assert.equal(await page.locator('[data-place-code]').first().inputValue(),'NEWCODE');
      assert.equal(await page.locator('#place-search').inputValue(),'');
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('PASS: retained search while editing, explicit search/filter reset, compact collapsible approvals, persisted edits and nested place import in worker ZIP, FR/EN.');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
