const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {TutorialGuide,tutorialMarkup}=require('../tutorial.js');
for(const lang of ['fr','en']){
  assert.equal(TutorialGuide[lang].steps.length,7);
  for(let i=0;i<7;i++){
    const html=tutorialMarkup(lang,i);
    assert.equal((html.match(/data-tutorial-step=/g)||[]).length,7);
    assert.equal((html.match(/aria-current="step"/g)||[]).length,1);
    assert.match(html,/id="tutorial-step-title" tabindex="-1"/);
    assert.equal(/data-tutorial-prev disabled/.test(html),i===0);
    assert.ok(html.includes(i===6?TutorialGuide[lang].finish:TutorialGuide[lang].next));
    assert.ok(!html.includes('undefined'));
  }
}
const elements={};
for(const id of ['open-tutorial','tutorial-dialog','app-language'])elements[id]={value:'fr',events:{},addEventListener(name,fn){this.events[name]=fn;},focus(){this.focused=true;}};
const dialog=elements['tutorial-dialog'],trigger=elements['open-tutorial'],language=elements['app-language'];
dialog.querySelector=()=>({focus(){dialog.headingFocused=true;}});
dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.events.close();};
const context=vm.createContext({document:{getElementById:id=>elements[id]}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../tutorial.js'),'utf8'),context);context.initTutorial();
assert.equal(trigger.textContent,'Tutoriel');trigger.events.click();assert.equal(dialog.open,true);
function click(attr,value){dialog.events.click({target:{closest:()=>({hasAttribute:key=>key===attr,dataset:{tutorialStep:value}})}});}
click('data-tutorial-next');assert.ok(dialog.innerHTML.includes('Étape 2 sur 7'));assert.ok(dialog.headingFocused);
click('data-tutorial-step','4');assert.ok(dialog.innerHTML.includes('Étape 5 sur 7'));
click('data-tutorial-prev');assert.ok(dialog.innerHTML.includes('Étape 4 sur 7'));
language.value='en';language.events.change();assert.equal(trigger.textContent,'Tutorial');assert.equal(dialog.lang,'en');assert.ok(dialog.innerHTML.includes('Step 4 of 7'));
click('data-tutorial-close');assert.equal(dialog.open,false);assert.ok(trigger.focused);
trigger.events.click();click('data-tutorial-step','6');click('data-tutorial-next');assert.equal(dialog.open,false);
const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert.match(index,/<button id="open-tutorial"[^>]+aria-haspopup="dialog"/);
assert.match(index,/<dialog id="tutorial-dialog" aria-labelledby="tutorial-title"/);
assert.ok(index.indexOf('initAppShell();')<index.indexOf('initTutorial();'));
console.log('PASS: bilingual tutorial, seven chapters, navigation, close/focus return, language switch and header integration without project mutations.');
