// Synthetic feeds only: check the browser layout and emit PDF proofs for visual QA.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/pdfs');
require('../tests/working-timetable.test.cjs');
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1200,height:1200}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    for(const [fixture,format,name] of [
      ['reference','ampm','working-reference-ampm'],
      ['reference','military','working-reference-24h'],
      ['wide','military','working-wide-24h'],
      ['compact','military','working-compact-24h']
    ]){
      await page.goto(pathToFileURL(path.join(root,'tmp/report-editor-working-'+fixture+'.html')).href);
      await page.locator('label[for="time-'+format+'"]').click();
      const issues=await page.evaluate(()=>[...document.querySelectorAll('.working-page')].flatMap((sheet,index)=>{
        const bounds=sheet.getBoundingClientRect(),issues=[];
        for(const cell of sheet.querySelectorAll('.working-grid th,.working-grid td')){
          const rect=cell.getBoundingClientRect();
          if(rect.right>bounds.right+1||cell.scrollWidth>cell.clientWidth+1)issues.push('Overflow on sheet '+index+': '+cell.textContent);
        }
        return issues;
      }));
      assert.deepEqual(issues,[]);
      assert.ok(await page.locator('.point-code').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).writingMode==='vertical-rl')));
      if(fixture==='compact'){
        assert.deepEqual(await page.locator('.working-grid thead th').evaluateAll(nodes=>nodes.slice(0,3).map(n=>n.className)),['hw','trip','route']);
        assert.equal(await page.locator('.working-grid tbody tr').count(),57);
      }
      const visible=page.locator('.working-grid .'+format).first();
      await visible.waitFor({state:'visible'});
      assert.equal(await page.locator('.working-grid .'+(format==='ampm'?'military':'ampm')).first().isVisible(),false);
      if(fixture==='reference')assert.equal(await page.locator('.working-page').count(),1);
      await page.pdf({path:path.join(out,name+'.pdf'),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
      if(fixture==='reference'&&format==='ampm')await page.locator('.working-page').screenshot({path:path.join(out,name+'.png')});
      console.log(name+': '+await page.locator('.working-page').count()+' planned page(s)');
    }
    // Long codes, trip IDs and after-midnight seconds must also fit in both formats.
    const tools=require('../working-timetable.js'),ids=['A','B','C','D'];
    await page.setContent(tools.html({language:'fr',date:'2026-11-05',client:'Test',workingRouteCode:'333',frequencies:[],
      workingStops:Object.fromEntries(ids.map(id=>[id,{code:'PLACE00'+id,name:'Synthetic place '+id}])),
      blocks:['0','1'].map(direction=>({routeId:'333',route:'333 - Test',direction,stopIds:ids,rows:Array.from({length:38},(_,i)=>({id:'long-trip-identifier-'+i,times:ids.map((_,j)=>90005+i*60+j*120),headway:i?60:null}))}))
    }));
    await page.locator('label[for="time-military"]').click();
    await page.emulateMedia({media:'print'});
    const stress=await page.evaluate(()=>({
      overflows:[...document.querySelectorAll('.working-grid td,.working-grid th')].filter(c=>c.scrollWidth>c.clientWidth+1).map(c=>c.textContent),
      heights:[...document.querySelectorAll('.working-page')].map(p=>p.getBoundingClientRect().height)
    }));
    assert.deepEqual(stress.overflows,[]);
    assert.ok(stress.heights.every(height=>height<1010),'Portrait content must fit within printable Letter height');
    assert.ok(await page.locator('.military').first().textContent().then(s=>s.includes('+1')));
    assert.deepEqual(errors,[]);
    console.log('PASS: reference and wide layouts, both time formats, no clipped timetable cells or browser errors.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
