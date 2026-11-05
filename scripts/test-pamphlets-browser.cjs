const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(req.url.split('?')[0])==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.fulfill({body:''}));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
   const trips=[],times=[];
   for(const route of ['333','42'])for(const service of ['WEEK','WED'])for(const direction of ['0','1'])for(let i=0;i<38;i++){
    const trip_id=[route,service,direction,i].join('-');trips.push({trip_id,trip_short_name:String(300+i),route_id:route,service_id:service,direction_id:direction});
    for(let j=0;j<3;j++){const value=21600+i*900+j*300,time=Math.floor(value/3600)+':'+String(Math.floor(value/60)%60).padStart(2,'0')+':00';times.push({trip_id,stop_id:(direction==='0'?['A','B','C']:['C','B','A'])[j],stop_sequence:String(j+1),arrival_time:time,departure_time:time,timepoint:'1'});}
   }
   state.parsed={routes:{rows:[{route_id:'333',route_short_name:'333',route_long_name:'Centre - Riverside'},{route_id:'42',route_short_name:'42',route_long_name:'West Station'}]},trips:{rows:trips},times:{headers:['timepoint'],rows:times},agency:{rows:[{agency_name:'Synthetic agency'}]}};
   state.groups=['A','B','C'].map((id,i)=>({id,code:['CENTRE','RIVERSTN','WESTSTN'][i],description:['Centre','Riverside Station','West Station'][i],items:[{id}],lat:45,lon:-75}));
   document.body.className='clean-theme clean-dark-theme';
   document.querySelector('main').innerHTML='<div style="max-width:1300px;margin:auto">'+pamphletSection('pamphlet-offer',newClientPamphletModels())+'</div>';
   document.querySelectorAll('.hero,.navigation-dock,body>footer').forEach(n=>n.style.display='none');
  });
  assert.equal(await page.locator('.pamphlet-card').count(),4);assert.equal(await page.locator('.pamphlet-working-frame').count(),0);
  const contrast=await page.evaluate(()=>{
   const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number),lum=rgb=>rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
   return ['.pamphlet-offer h3','.pamphlet-offer-head small','.pamphlet-details>summary'].map(selector=>{const n=document.querySelector(selector);let bg=n;while(getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;const a=lum(rgb(getComputedStyle(n).color)),b=lum(rgb(getComputedStyle(bg).backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
  });
  assert.ok(contrast.every(n=>n>=4.5),'Text contrast must meet 4.5:1: '+contrast);
  await page.locator('.pamphlet-details>summary').click();
  await page.locator('#pamphlet-offer').screenshot({path:path.join(root,'tmp/pamphlets-dark.png')});
  await page.locator('.pamphlet-card[data-pamphlet-route="333"]>summary').first().click();
  const frame=page.frameLocator('.pamphlet-working-frame');await frame.locator('.working-grid').waitFor();assert.equal(await page.locator('.pamphlet-working-frame').count(),1);
  assert.equal(await frame.locator('.working-page').count(),1);assert.ok((await frame.locator('.working-header').textContent()).includes('Service: WED'));
  await page.selectOption('[data-pamphlet-time]','military');await frame.locator('#time-military').waitFor({state:'attached'});assert.equal(await frame.locator('#time-military').isChecked(),true);
  const popupPromise=page.waitForEvent('popup');await page.locator('.pamphlet-card[open] .pamphlet-preview-actions button').click();const popup=await popupPromise;await popup.waitForLoadState();
  assert.equal(await popup.locator('.working-page').count(),1);assert.equal(await popup.locator('#time-military').isChecked(),true);
  fs.mkdirSync(path.join(root,'tmp/pdfs'),{recursive:true});await popup.pdf({path:path.join(root,'tmp/pdfs/pamphlet-rte333.pdf'),preferCSSPageSize:true,printBackground:true});await popup.close();
  await page.selectOption('[data-pamphlet-filter]','42');assert.equal(await page.locator('.pamphlet-card:not(.pamphlet-filtered)').count(),2);await page.waitForFunction(()=>!document.querySelector('.pamphlet-working-frame'));
  const allPromise=page.waitForEvent('popup');await page.locator('.pamphlet-controls button').click();const all=await allPromise;await all.waitForLoadState();assert.equal(await all.locator('.working-header').count(),4);assert.ok((await all.locator('body').textContent()).includes('Service: WED'));assert.ok(!(await all.locator('.route-title').allTextContents()).some(t=>t.includes('333')));await all.close();
  await page.evaluate(()=>document.body.classList.remove('clean-dark-theme'));await page.locator('#pamphlet-offer').screenshot({path:path.join(root,'tmp/pamphlets-light.png')});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>{$('app-language').value='en';refreshPamphletOffer=()=>{};document.querySelector('#pamphlet-offer').outerHTML=pamphletSection('pamphlet-offer',newClientPamphletModels());});assert.equal(await page.locator('.pamphlet-offer h3').textContent(),'Assigned-place timetables');
  assert.deepEqual(errors,[]);console.log('PASS: dark contrast, light/mobile layouts, lazy paired previews, time switch, service labels, route-filtered print and FR/EN.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
