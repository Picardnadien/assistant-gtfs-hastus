// Build first. Tests never copy private reports into _site.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..'),site=path.join(root,'_site');
(async()=>{
  const server=http.createServer((req,res)=>{let name=decodeURIComponent(req.url.split('?')[0]);if(name.endsWith('/'))name+='index.html';const file=path.resolve(site,'.'+name);if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/plain');res.end(fs.readFileSync(file));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:820,height:1180},hasTouch:true,isMobile:true,deviceScaleFactor:2,acceptDownloads:true});
    // Safari-style fallback: downloading HTML rather than writing to a chosen file.
    await context.addInitScript(()=>{window.showSaveFilePicker=undefined;Element.prototype.requestFullscreen=async()=>{throw Error('Fullscreen unavailable');};});
    await context.route('https://www.openstreetmap.org/**',route=>route.fulfill({contentType:'text/html',body:'<body>Test map</body>'}));
    const page=await context.newPage(),errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
    const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin);
    if(await page.locator('html').getAttribute('lang')!=='fr')await page.locator('#language').click();
    assert.equal(await page.locator('#private-open').isVisible(),false);
    for(const size of [{width:820,height:1180},{width:1180,height:820}]){await page.setViewportSize(size);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await page.locator('#language').click();assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.locator('#demo').getAttribute('href'),'demo/review-en.html');
    await page.locator('#demo').click();await page.locator('#review-tutorial-close').click();await page.locator('#start-assessment-review').click();await page.locator('#review-show-all').click();await page.locator('#review-map-validate').click();await page.locator('#review-close').click();
    const download=page.waitForEvent('download');await page.locator('#download-assessment-copy').click();const exported=path.join(root,'tmp/demo-ipad-reviewed.html');await(await download).saveAs(exported);
    assert.ok(fs.readFileSync(exported,'utf8').includes('"validated":true'));
    await page.goto(origin);await page.locator('#private-file').setInputFiles(exported);
    const opened=context.waitForEvent('page');await page.locator('#private-open').click();const report=await opened;await report.waitForLoadState('domcontentloaded');
    assert.ok((await report.locator('#assessment-log-body tr').count())>0,'Downloaded review survives private-file reopening');await report.close();
    // Optional full OC Transpo private report is read locally, never served by the website.
    const privateFile=path.join(root,'output/oc-transpo-review/OC_Transpo_review_fr.html');
    if(fs.existsSync(privateFile)){
      await page.locator('#private-file').setInputFiles(privateFile);const next=context.waitForEvent('page');await page.locator('#private-open').click();const privatePage=await next;await privatePage.waitForLoadState('domcontentloaded');
      await privatePage.locator('#review-tutorial-close').click();await privatePage.locator('#start-assessment-review').click();assert.ok(await privatePage.locator('#review-map-validate').isVisible());await privatePage.close();
    }
    for(const url of ['/app.html','/versions/v12.0/','/versions/v11.0/','/versions/v10.0/']){await page.goto(origin+url);assert.ok(await page.locator('meta[name="application-version"]').count());}
    assert.deepEqual(errors,[]);console.log('PASS: bilingual launcher, tablet viewports, demo, download fallback, private local HTML reopening, all four application versions.');
  }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
