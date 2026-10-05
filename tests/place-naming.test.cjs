const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fields={'place-code-max-length':{value:'6'},'place-code-case':{value:'upper'},'use-canada-post-abbreviations':{checked:false}};
const context=vm.createContext({console,window:{},document:{getElementById:id=>fields[id]||{value:''}}});
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0],context);
const items=(...descriptions)=>descriptions.map((description,i)=>({id:String(i),description,lat:45,lon:-75}));
assert.equal(context.commonDescription(items('St Clair Station northbound','St. Clair Station southbound')),'St Clair Station');
assert.equal(context.commonDescription(items('St Clair','St Clair Station')),'St Clair Station');
assert.equal(context.commonDescription(items('Nearby Rd','St Clair Station')),'St Clair Station');
assert.equal(context.commonDescription(items('Union Station Bay 1','Union Station Bay 2')),'Union Station');
assert.equal(context.commonDescription(items('Union Station Platform A')),'Union Station');
assert.equal(context.commonDescription(items('Bay Station')),'Bay Station');
assert.equal(context.commonDescription(items('Main St','Main St')),'Main');
assert.equal(context.commonDescription(items('St Clair / Yonge St','St Clair / Yonge St')),'St Clair Yonge');
assert.equal(context.commonDescription(items('Saint Clair Station','Saint Clair Station')),'Saint Clair Station');
for(const [description,suffix] of [['Union Station','STN'],['Union Stn','STN'],['Gare du Palais','STN'],['Ottawa Train Station','STN'],['Central Bus Station','STN'],['Central Gare routière','STN'],['Central Terminal','TER'],['Central Terminus','TER'],['Central Bus Terminal','TER'],['Downtown Hub','HUB'],['Pôle d’échanges Central','HUB'],['Central Exchange','ECH'],['Central Interchange','ECH'],['Échangeur Central','ECH'],['Central Transit Centre','CTR'],['Central Transit Center','CTR'],['Centre de correspondance Central','CTR']]){
  for(const size of [6,8])for(const casing of ['upper','lower'])for(const postal of [false,true]){
    fields['place-code-max-length'].value=String(size);fields['place-code-case'].value=casing;fields['use-canada-post-abbreviations'].checked=postal;
    const expected=casing==='lower'?suffix.toLowerCase():suffix,used=new Set();
    for(let n=0;n<130;n++){const code=context.uniqueCode(description,used);assert.equal(code.length,size);assert.ok(code.endsWith(expected),code);assert.equal(code,casing==='lower'?code.toLowerCase():code.toUpperCase());}
    assert.equal(used.size,130);
    const common=context.commonDescription(items('Central',description));assert.ok(context.placeFacilityDetails(common).types.length,common);
    const alternatives=context.alternativePlaceCodes({id:'new',description,items:items(description)});
    assert.ok(alternatives.length>0);for(const alternative of alternatives){assert.equal(alternative.code.length,size);assert.ok(alternative.code.endsWith(expected),alternative.code);}
  }
}
fields['place-code-case'].value='upper';fields['place-code-max-length'].value='6';fields['use-canada-post-abbreviations'].checked=false;
assert.equal(context.codeRoot('St Clair Station'),'STCSTN');assert.equal(context.codeRoot('Saint Clair Station'),'STCSTN');
fields['place-code-max-length'].value='8';assert.equal(context.codeRoot('St. Clair Station'),'STCLASTN');
fields['place-code-case'].value='lower';assert.equal(context.codeRoot('St Clair Station'),'stclastn');
for(const name of ['Station Road','Station Rd','Terminal Avenue','Exchange St','Rue de la Gare','Police Station','Fire Station','Gas Station','Station-service','Stationnement Central','Stationary Shop'])assert.equal(context.placeFacilityDetails(name).types.length,0,name);
assert.equal(context.placeFacilityDetails('Union Station Road / Central Station').types[0].suffix,'STN');
assert.equal(context.placeFacilityDetails('Central Station Terminal').types.length,2);
assert.ok(context.commonDescription(items('Central Station','Central Terminal')).includes('Station Terminal'));
assert.ok(context.codeRoot('Central Terminal Station').endsWith('stn'));
fields['place-code-case'].value='upper';fields['place-code-max-length'].value='6';
for(const word of ['Rd','After','Before','Ave','Dr','Ad'])assert.equal(context.codeRoot(`Main ${word}`),'MAIN00');
assert.equal(context.codeRoot('St Rd'),'PLACE0');assert.equal(context.codeRoot('1st Ave'),'1ST000');assert.equal(context.codeRoot('Main St'),'MAIN00');
assert.equal(context.codeRoot('Main / St Clair'),'MAISTC');
const generated=context.groupNearbyStops(items('St Clair Station','St Clair'),300,new Set());
assert.equal(generated[0].description,'St Clair Station');assert.equal(generated[0].code,'STCSTN');
// The same generator is used when creating a single place for an orphan stop.
const orphan=context.groupNearbyStops(items('Central Terminus'),0,new Set());assert.ok(orphan[0].code.endsWith('TER'));
const manual={id:'existing',code:'KeepMe',description:'Custom name',items:items('St Clair Station')},before=JSON.stringify(manual);
context.alternativePlaceCodes(manual);assert.equal(JSON.stringify(manual),before);
assert.equal(context.sanitizePlaceCode('myId'),'MYID'); // No mandatory suffix on manual edits.
console.log('PASS: Saint versus Street, facility names retained across stops, FR/EN types, 6/8 characters, case, postal mode, collisions, alternatives, orphan generation, false positives and manual preservation.');
