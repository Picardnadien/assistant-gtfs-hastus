const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false});return nodes.get(id);};
const ctx=vm.createContext({console,window:{},document:{getElementById:get}});vm.runInContext(fs.readFileSync('app.js','utf8').split('const decisionList=')[0],ctx);vm.runInContext('refreshStopIdPaddingSetting=()=>{};',ctx);
ctx.applyExistingClientDefaults();for(const id of ['smart-radius','review-existing-places'])assert.equal(get(id).checked,true);for(const id of ['renumber-stop-ids','pad-stop-ids','prefix-stop-ids','pad-place-codes','use-canada-post-abbreviations'])assert.equal(get(id).checked,false);assert.equal(get('place-code-max-length').value,'8');assert.equal(get('place-code-case').value,'upper');
get('smart-radius').checked=false;get('use-canada-post-abbreviations').checked=true;ctx.applyExistingClientDefaults();assert.equal(get('smart-radius').checked,false);assert.equal(get('use-canada-post-abbreviations').checked,true);
vm.runInContext("state.existingClientDefaultsApplied=false;state.workflow='diagnostic';",ctx);ctx.applyExistingClientDefaults();assert.equal(get('smart-radius').checked,false);
console.log('PASS: existing-client preset, one-time application, manual choices retained and diagnostic excluded.');
