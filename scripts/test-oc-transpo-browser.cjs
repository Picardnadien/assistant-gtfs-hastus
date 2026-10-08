// Local acceptance test. Inputs and generated reports never belong in Git.
// node scripts/test-oc-transpo-browser.cjs <playwright-module> <stops.xlsx> <variants.xlsx>
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright'),root=path.resolve(__dirname,'..');
const inputs=process.argv.slice(3);if(inputs.length!==2)throw new Error('Provide stops.xlsx and variants.xlsx paths');
const hashes=inputs.map(file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
(async()=>{
  let browser;const reports={};
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(reports[req.url]||'<input type="file" id="inputs" multiple>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true,deviceScaleFactor:2,acceptDownloads:true});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin);
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0]});
    for(const file of ['report-editor.js','report-existing.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
    await page.locator('#inputs').setInputFiles(inputs);
    const result=await page.evaluate(async logo=>{
      const [hastus,variants]=await Promise.all([...document.getElementById('inputs').files].map(parseXlsxFirstSheet));
      const mapping={stopId:'Stop',stopDesc:'Description',placeId:'Place',placeDesc:'Description1',referenceId:'Refer.',lat:'Loca latitude',lon:'Loca longitude'};
      for(const column of Object.values(mapping))if(!hastus.headers.includes(column))throw new Error('Missing mapped column: '+column+'; headers: '+hastus.headers.join(', '));
      const places=buildPlaces(hastus.rows,mapping),timing=timingPointsFromVariants(variants,[]);
      const source={places,mapping,parsed:{hastus,variants},timingPointIds:[...timing.timing],timingPointSource:'variants',...analyzePlaceRelationships(places,200,500),threshold:500,radius:200};
      const model=existingClientReportModel(source),output={};
      for(const language of ['fr','en']){
        const cases=existingClientReportCases(model,language),t=EXISTING_REPORT_TEXT[language];
        const maps=Object.fromEntries(cases.map(c=>[c.id,existingReportMap(c.points,null,t)]));
        const tpMaps=Object.fromEntries(cases.map(c=>[c.id,existingReportMap(c.points.filter(p=>p.kind==='place'||p.timing===true),null,t)]));
        output[language]=existingClientReportHtml(model,cases,maps,{language,tpMaps,theme:'clean',logo,brand:'CSched',client:'OC Transpo',date:'2026-10-07',offline:false});
      }
      const modelStops=model.places.flatMap(p=>p.stops);
      return {output,counts:{inputStops:hastus.rows.length,variantRows:variants.rows.length,places:model.places.length,placeStops:modelStops.length,timingStops:modelStops.filter(s=>s.timing===true).length,nonTimingStops:modelStops.filter(s=>s.timing===false).length,referenceAnomalies:source.referenceAnomalies.length,groupings:source.groupingCandidates.length},placeIds:model.places.map(p=>p.id)};
    },'data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,'assets/csched-logo.svg')).toString('base64'));
    assert.ok(result.counts.places>100);assert.equal(new Set(result.placeIds).size,result.placeIds.length);
    fs.mkdirSync(path.join(root,'output/oc-transpo-review'),{recursive:true});
    for(const language of ['fr','en']){
      reports['/'+language]=result.output[language];
      fs.writeFileSync(path.join(root,`output/oc-transpo-review/OC_Transpo_review_${language}.html`),result.output[language]);
    }
    // Avoid external map requests during automated checks; test overlay geometry separately.
    await page.route('https://www.openstreetmap.org/**',route=>route.fulfill({contentType:'text/html',body:'<body style="background:#e8ece2">Map background stub</body>'}));
    await page.goto(origin+'/fr');await page.locator('#review-tutorial-close').click();
    await page.locator('#start-assessment-review').click();
    for(const size of [{width:1180,height:820},{width:820,height:1180}]){
      await page.setViewportSize(size);
      await page.waitForFunction(()=>{const map=document.querySelector('#review-map .map-stage').getBoundingClientRect();return map.width>100&&map.height>50&&map.bottom<=innerHeight+1&&map.right<=innerWidth+1;});
      const box=await page.locator('#review-map-validate').boundingBox();assert.ok(box.height>=44&&box.width>=44);
      await page.screenshot({path:path.join(root,`output/oc-transpo-review/ipad-${size.width}.png`)});
    }
    await page.locator('#review-show-all').click();
    await page.locator('#review-map-validate').click();
    assert.equal(await page.locator('#review-map-validate').getAttribute('aria-pressed'),'true');
    await page.locator('#review-toggle-details').click();
    const link=page.locator('#review-detail [data-case-link]').first();if(await link.count()){await link.click();await page.locator('#review-return').click();}
    await page.locator('#review-close').click();
    assert.ok(await page.locator('#assessment-log-body tr').count()>0);
    await page.reload();assert.equal(await page.locator('#assessment-review-tutorial').isVisible(),false);
    assert.ok(await page.locator('#assessment-log-body tr').count()>0);
    await page.locator('#stop-scope').selectOption('tp');await page.locator('#stop-scope').selectOption('all');
    const download=page.waitForEvent('download');await page.locator('#export-assessment-log').click();
    await (await download).saveAs(path.join(root,'output/oc-transpo-review/review-changes.csv'));
    await page.goto(origin+'/en');await page.locator('#review-tutorial-close').click();await page.locator('#start-assessment-review').click();
    assert.ok(await page.locator('#review-map-validate').isVisible());
    assert.deepEqual(errors,[]);
    for(let i=0;i<inputs.length;i++)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(inputs[i])).digest('hex'),hashes[i]);
    fs.writeFileSync(path.join(root,'output/oc-transpo-review/acceptance.json'),JSON.stringify({counts:result.counts,passed:true,browser:'Headless Edge, touch viewport simulation; not physical iPad Safari',maps:'Network stub; overlay geometry checked',originalsUnchanged:true},null,2));
    console.log('PASS: OC Transpo local acceptance, originals unchanged, FR/EN, tablet layouts, approvals, draft reload and CSV. '+JSON.stringify(result.counts));
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
