// Synthetic API only: no real Supabase accounts, passwords or client files.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
(async()=>{
  const allowed=new Set(['portal.html','portal.js','portal-config.js','portal.css','assets/csched-logo.svg']);
  const server=http.createServer((req,res)=>{const file=req.url.slice(1).split('?')[0];if(!allowed.has(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/svg+xml');res.end(fs.readFileSync(path.join(root,file)));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:820,height:1180},hasTouch:true,acceptDownloads:true});
    let role='viewer',fileLists=0;const requests=[];
    await context.route('https://wlkneuryxlpuqzmbimax.supabase.co/**',async route=>{
      const request=route.request(),url=new URL(request.url());requests.push(url.pathname);
      let data=null,status=200;
      if(url.pathname.endsWith('/settings'))data={mailer_autoconfirm:false};
      else if(url.pathname.endsWith('/token'))data={access_token:'synthetic-token',user:{email:'test@example.test'}};
      else if(url.pathname.endsWith('/gtfs_portal_role'))data=role;
      else if(url.pathname.endsWith('/gtfs_portal_members'))data=[{email:'<script>alert(1)</script>@example.test',role:'viewer',enabled:true}];
      else if(url.pathname.includes('/object/list/')){fileLists++;data=[{id:'synthetic',name:'test <img src=x onerror=alert(1)>.txt'}];}
      else if(url.pathname.includes('/gtfs_portal_set_member')){status=role==='admin'?200:403;}
      else if(url.pathname.includes('/object/authenticated/gtfs-private/'))data='synthetic document';
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/portal.html#access_token=must-be-discarded`);
    assert.equal(new URL(page.url()).hash,'');assert.equal(requests.length,0,'No remote data before deliberate login');
    async function login(){await page.locator('#email').fill('test@example.test');await page.locator('#password').fill('synthetic-password');await page.locator('#login-form button').click();}
    await login();await page.locator('#workspace').waitFor({state:'visible'});await page.locator('#files li').waitFor();assert.equal(await page.locator('#admin-panel').isVisible(),false);
    assert.equal(await page.locator('#files img').count(),0,'Filenames are plain text');
    const download=page.waitForEvent('download');await page.locator('#files button').first().click();await download;
    await page.locator('#logout').click();await page.locator('#auth-panel').waitFor({state:'visible'});assert.equal(await page.locator('#files li').count(),0);
    role=null;const previous=fileLists;await login();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Aucun accès'));assert.equal(fileLists,previous,'Unlisted users do not request the library');
    role='admin';await login();await page.locator('#admin-panel').waitFor({state:'visible'});await page.locator('#members li').waitFor();assert.equal(await page.locator('#members script').count(),0);
    await page.locator('#member-email').fill('reader@example.test');await page.locator('#member-form button').click();
    await page.locator('#member-form button').waitFor({state:'visible'});await page.waitForFunction(()=>document.getElementById('member-email').value==='');
    await page.locator('#language').click();assert.equal(await page.locator('html').getAttribute('lang'),'en');
    await page.reload();assert.equal(await page.locator('#workspace').isVisible(),false);assert.equal(await page.locator('#password').inputValue(),'');
    const stored=await page.evaluate(()=>JSON.stringify({...localStorage}));assert.ok(!stored.includes('synthetic-token')&&!stored.includes('synthetic-password'));
    assert.deepEqual(errors,[]);console.log('PASS: portal tablet UI, viewer/admin/unlisted flows, no auto requests, safe filenames, downloads, language and cleared sessions. Synthetic API, NOT live authorization.');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
