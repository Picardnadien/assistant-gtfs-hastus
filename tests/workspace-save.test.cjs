const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fields={};let timer=0;
const context=vm.createContext({console,document:{getElementById:id=>fields[id]??={}},window:{},clearTimeout(){},setTimeout(){return ++timer;}});
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0],context);
vm.runInContext(`
  state.workspace={mode:'directory',name:'test',handle:{getDirectoryHandle:async()=>({})}};
  workspaceSnapshot=()=>({savedAt:'2026-10-02T12:00:00Z'});
  workspacePermission=async()=>true;saveWorkspaceRecord=async()=>{};
  refreshWorkspaceChoices=async()=>{};refreshPamphletOffer=()=>{};
  workspaceStatus=()=>{};
`,context);
(async()=>{
  let release,writes=0,active=0,maxActive=0;
  context.saveChunkedWorkspace=async()=>{writes++;active++;maxActive=Math.max(active,maxActive);if(writes===1)await new Promise(resolve=>release=resolve);active--;};
  const first=context.quickSave();await new Promise(resolve=>setImmediate(resolve));
  context.queueQuickSave();const second=context.quickSave();release();await Promise.all([first,second]);
  assert.equal(writes,2);assert.equal(maxActive,1);assert.equal(vm.runInContext('state.workspace.dirty',context),false);
  context.saveChunkedWorkspace=async()=>{throw new Error('disk full');};
  await context.quickSave();assert.equal(vm.runInContext('state.workspace.dirty',context),true);
  context.saveChunkedWorkspace=async()=>{};await context.quickSave();
  assert.equal(vm.runInContext('state.workspace.dirty',context),false);
  console.log('PASS: saves serialized; edits during save trigger a follow-up; failure remains dirty and can be retried');
})().catch(error=>{console.error(error);process.exitCode=1;});
