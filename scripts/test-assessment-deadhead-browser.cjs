// Synthetic browser checks; no client matrix is served or published.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const language of ['fr','en']){
      const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      const html=fs.readFileSync(`tmp/assessment-deadhead-${language}.html`,'utf8');
      await page.route('https://assessment.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
      await page.goto('https://assessment.test/'+language);
      await page.locator('#assessment-review-tutorial').waitFor({state:'visible'});
      for(let i=0;i<7;i++)await page.locator('#review-tutorial-next').click();
      assert.equal(await page.locator('#cases article').count(),5);
      assert.equal(await page.locator('#overview-body tr').count(),4,'One row per place despite overlapping reference and place cases');
      assert.ok(await page.locator('#overview-body tr[data-overview-place="C"] td:last-child [data-case-link]').count()>=2,'All overlapping cases remain reachable');
      assert.equal(await page.locator('#previous,#next').count(),0,'No pagination');
      await page.locator('#deadhead-scope').check();
      assert.equal(await page.locator('#cases article').count(),3,'Three direct places; mixed reference comparison excluded');
      assert.equal(await page.locator('#overview-body tr[data-overview-place="C"]').count(),0);
      await page.locator('#endpoint-scope').check();
      assert.equal(await page.locator('#cases article').count(),1,'Filters combine');
      const body=await page.locator('#cases').textContent();
      assert.ok(body.includes(language==='fr'?'Présente dans la matrice':'Present in matrix'));
      const csvPromise=page.waitForEvent('download');
      await page.locator('#export-assessment-csv').click();
      const csv=await csvPromise;await csv.saveAs(`tmp/assessment-deadhead-${language}.csv`);
      assert.ok(fs.readFileSync(`tmp/assessment-deadhead-${language}.csv`,'utf8').includes('deadhead_outgoing'));
      const popup=page.waitForEvent('popup');await page.locator('#print-assessment').click();
      const print=await popup;await print.locator('#print-cases article').waitFor();
      assert.equal(await print.locator('#print-cases article').count(),1);
      assert.ok((await print.locator('#print-cases article').textContent()).includes(language==='fr'?'Matrice deadhead':'Deadhead matrix'));
      await print.close();
      const savedPromise=page.waitForEvent('download');await page.locator('#download-assessment-copy').click();
      const saved=await savedPromise;const filename=`tmp/assessment-deadhead-${language}-saved.html`;await saved.saveAs(filename);
      const other=await browser.newContext(),reopened=await other.newPage();
      await reopened.route('https://saved.test/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(filename,'utf8')}));
      await reopened.goto('https://saved.test/report');
      assert.equal(await reopened.locator('#deadhead-scope').isChecked(),true);
      assert.equal(await reopened.locator('#cases article').count(),1);
      await page.screenshot({path:`tmp/assessment-deadhead-${language}.png`,fullPage:true});
      assert.deepEqual(errors,[]);await other.close();await context.close();
    }
    // More than the former page size: every heading is present, bodies/maps are lazy.
    const longContext=await browser.newContext(),longPage=await longContext.newPage();
    let longHtml=fs.readFileSync('tmp/assessment-deadhead-fr.html','utf8');
    const pattern=/<script id="assessment-data" type="application\/json">([\s\S]*?)<\/script>/;
    const payload=JSON.parse(longHtml.match(pattern)[1]),base=payload.cases.find(c=>c.code==='001');
    for(let i=0;i<25;i++){
      const id='extra-'+i,code='ZZ'+String(i).padStart(2,'0');
      payload.cases.push({...base,id,code,title:code,titleHtml:code,overviewPlaces:[{code,html:code,anchor:id,tags:base.tags}]});
      payload.maps[id]=payload.maps[base.id];
    }
    longHtml=longHtml.replace(pattern,()=>'<script id="assessment-data" type="application/json">'+JSON.stringify(payload).replace(/</g,'\\u003c')+'</script>');
    await longPage.route('https://long.test/**',r=>r.fulfill({contentType:'text/html',body:longHtml}));
    await longPage.goto('https://long.test/report');
    for(let i=0;i<7;i++)await longPage.locator('#review-tutorial-next').click();
    assert.equal(await longPage.locator('#cases article').count(),30);
    assert.equal(await longPage.locator('#overview-body tr').count(),29);
    assert.equal(await longPage.locator('.case-body[data-loaded]').count(),1);
    await longPage.locator('#overview-body tr[data-overview-place="ZZ24"] [data-case-link]').first().click();
    assert.equal(await longPage.locator('#extra-24 > details').getAttribute('open'),'');
    assert.equal(await longPage.locator('.case-body[data-loaded]').count(),2);
    await longContext.close();
    // Main app: optional import after analysis preserves decisions, can be removed.
    const context=await browser.newContext(),page=await context.newPage(),root=path.resolve(__dirname,'..'),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://app.test/**',r=>{
      const filename=path.resolve(root,'.'+decodeURIComponent(new URL(r.request().url()).pathname));
      if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename))return r.abort();
      return r.fulfill({path:filename});
    });
    await page.goto('https://app.test/index.html');
    await page.waitForFunction(()=>typeof loadDeadheadFile==='function');
    await page.evaluate(()=>{state.geographicClientType='existing';state.geographicReady=true;state.decisions=[{id:'KEEP'}];updateGeographicSourceVisibility();});
    await page.locator('#deadhead-file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from('linkdt;001;B;;10;;\nlinkdt;B;001;;0;;')});
    await page.waitForFunction(()=>state.parsed.deadhead?.pairs===2);
    assert.equal(await page.evaluate(()=>state.decisions[0].id),'KEEP');
    assert.equal(await page.locator('#diagnostic-deadhead-only').isDisabled(),false);
    assert.ok((await page.locator('#deadhead-status').textContent()).includes('synthetic.txt'));
    page.once('dialog',d=>d.accept());
    await page.locator('#deadhead-file').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('not a matrix')});
    await page.waitForFunction(()=>document.getElementById('deadhead-file').value==='');
    assert.equal(await page.evaluate(()=>state.parsed.deadhead.pairs),2,'Failed import keeps previous matrix');
    assert.equal(await page.evaluate(()=>state.files.deadhead),'synthetic.txt');
    await page.locator('#deadhead-remove').click();
    assert.equal(await page.evaluate(()=>Boolean(state.parsed.deadhead)),false);
    assert.equal(await page.locator('#diagnostic-deadhead-only').isDisabled(),true);
    assert.equal(await page.evaluate(()=>state.decisions[0].id),'KEEP');
    assert.deepEqual(errors,[]);await context.close();
    console.log('PASS: main app optional import/removal without losing decisions, FR/EN cards, combined filters, CSV, print and saved HTML.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
