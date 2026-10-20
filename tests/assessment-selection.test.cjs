const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('report-existing.js','utf8'),ctx);
const data={reportId:'original',filename:'Synthetic',cases:[
  {id:'a',html:'<a href="#b" data-case-link="b">Context</a>',mapCodes:['A'],overviewPlaces:[{code:'A'}]},
  {id:'b',html:'EXCLUDED',mapCodes:['B']}
],maps:{a:'mapA',b:'EXCLUDED'},tpMaps:{a:'tpA',b:'EXCLUDED'},csvRows:{a:[{place_code:'A'}],b:[{place_code:'B'}]},
tpView:{cases:[{id:'a',html:'A'},{id:'b',html:'EXCLUDED'}],csvRows:{a:[],b:[{secret:'EXCLUDED'}]}},
mapPlaces:[{code:'A',attachedCodes:['B']},{code:'B',description:'EXCLUDED'}],
presentation:{selected:['a','b'],layers:{a:{tp:false},b:{secret:'EXCLUDED'}},grouped:false,overviewOpen:false}};
const review={events:[{id:'a',after:{note:'keep'}},{id:'b',after:{note:'EXCLUDED'}}]},before=JSON.stringify(data);
const subset=ctx.assessmentSubsetData(data,review,['a']);
assert.equal(subset.cases.length,1);assert.equal(subset.tpView.cases.length,1);
assert.notEqual(subset.reportId,data.reportId);assert.equal(subset.presentation.grouped,false);
assert.equal(subset.presentation.layers.a.tp,false);assert.equal(subset.review.events[0].after.note,'keep');
assert.ok(!JSON.stringify(subset).includes('EXCLUDED'));
assert.ok(!subset.cases[0].html.includes('data-case-link="b"'),'No dead navigation to an excluded case');
assert.equal(subset.mapPlaces[0].attachedCodes.length,0);
assert.equal(JSON.stringify(data),before);
console.log('PASS: selected-only payload, maps, TP scope, CSV, review journal, independent draft identity and source immutability.');
