const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const fields={'network-language':{value:'fr'},'network-theme':{value:'clean'}};
const ctx=vm.createContext({console,URL,TextEncoder,window:{},document:{getElementById:id=>fields[id]}});
for(const name of ['report-package.js','report-payload.js','report-editor.js','report-network.js','report-timetable-export.js','report-network-document.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0],ctx);
const fixture=fs.readFileSync(path.join(root,'tmp/report-editor-both.html'),'utf8');
ctx.fixture=JSON.parse(fixture.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
vm.runInContext(`
 state.parsed={stops:fixture.gtfs.stops,times:fixture.gtfs.times};
 for(const entry of fixture.gtfs.archiveEntries||[])if(GTFS_FILE_KEYS[entry.name])state.parsed[GTFS_FILE_KEYS[entry.name]]=parseCSV(entry.text);
 state.groups=[];state.decisions=[];state.originalEntries=[];state.gtfsStops=[];
`,ctx);
const before=vm.runInContext('JSON.stringify(state.parsed)',ctx);
for(const lang of ['fr','en']){
 fields['network-language'].value=lang;
 const data=ctx.standaloneNetworkData();
 assert.equal(data.reportKind,'network');assert.equal(data.language,lang);
 assert.equal(ctx.reportNetworkTools().create(data).hasCalendar,true);
 assert.equal(ctx.reportNetworkTools().create(data).routeModels().length,2);
 assert.equal(vm.runInContext('JSON.stringify(state.parsed)',ctx),before);
 data.networkMaps=ctx.reportRouteMapPayload(data,[],lang);
 data.networkView={date:'2026-10-04',route:'r1'}; // defaults must select both directions + condensed
 const html=ctx.reportNetworkDocumentHtml(data);
 assert.ok(!html.includes('place-search'));assert.ok(!html.includes('download-client-package'));
 assert.ok(!html.includes('placeReportEditorRuntime'));
 new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
 fs.writeFileSync(path.join(root,'tmp/report-editor-independent-'+lang+'.html'),html);
}
vm.runInContext('delete state.parsed.shapes;delete state.parsed.calendar;delete state.parsed.calendarDates',ctx);
assert.equal(ctx.reportNetworkTools().create(ctx.standaloneNetworkData()).hasCalendar,false);
vm.runInContext('delete state.parsed.trips',ctx);
assert.throws(()=>ctx.standaloneNetworkData(),/GTFS/);
console.log('PASS: independent network module without place analysis, read-only data, FR/EN documents, optional shapes/calendar and required-input errors.');
