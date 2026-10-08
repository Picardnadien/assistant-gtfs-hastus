const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({console});vm.runInContext(fs.readFileSync('report-existing.js','utf8'),ctx);
const cases=[{id:'pair-a'},{id:'pair-b'}],model=ctx.assessmentReviewModel(cases),before=JSON.stringify(cases);
assert.equal(model.get('pair-a','all').validated,false);
model.set('pair-a','all',{validated:true,note:'Reviewed'},'2026-10-07T13:00:00Z');
assert.equal(model.get('pair-a','tp').validated,false,'TP scope is independent');
assert.equal(model.get('pair-b','all').validated,false,'Linked cases are not implicitly validated');
assert.equal(model.set('pair-a','all',{validated:true,note:'Reviewed'}),false,'Repeated state is not logged twice');
model.set('pair-a','all',{validated:false,note:'Recheck turning movement'},'2026-10-07T14:00:00Z');
const saved=model.snapshot(),restored=ctx.assessmentReviewModel(cases,JSON.parse(JSON.stringify(saved)));
assert.equal(restored.events.length,2);assert.equal(restored.events[1].before.validated,true);assert.equal(restored.get('pair-a','all').note,'Recheck turning movement');
saved.events[1].after.note='MUTATED';assert.notEqual(model.get('pair-a','all').note,'MUTATED');
assert.equal(model.set('unknown','all',{validated:true}),false);
assert.equal(model.set('pair-a','invalid',{validated:true}),false);
assert.equal(JSON.stringify(cases),before,'Review never changes source cases');
assert.equal(ctx.assessmentReviewModel(cases,{events:[{id:'other',scope:'all',at:'2026-10-07'}]}).events.length,0);
for(const language of ['fr','en']){
  const markup=ctx.assessmentReviewMarkup(language);
  for(const id of ['assessment-review','review-validate','assessment-log-body','autosave-assessment','assessment-file-status','assessment-review-tutorial','review-tutorial-next','review-layout-choice','assessment-comfort'])assert.ok(markup.includes('id="'+id+'"'));
}
assert.ok(ctx.assessmentReviewStyles().includes('prefers-reduced-motion'));
assert.ok(ctx.assessmentReviewStyles().includes('.review-map-frame'));
assert.ok(ctx.assessmentReviewStyles().includes('#assessment-review.max-map-layout .review-layout'));
assert.ok(ctx.assessmentReviewMarkup('fr').includes('id="review-map-validate"'));
assert.ok(ctx.assessmentReviewMarkup('en').includes('Maximum map'));
for(const language of ['fr','en']){
  const html=ctx.assessmentReviewMarkup(language);
  for(const id of ['assessment-distance-choice','review-distance-choice'])assert.ok(html.includes(`id="${id}"`));
  for(const mode of ['off','small','large'])assert.ok(html.includes(`value="${mode}"`));
}
assert.ok(ctx.assessmentReviewStyles().includes('body[data-review-distances="small"]'));
assert.ok(ctx.assessmentReviewStyles().includes('transform:scale(.72)'));
assert.ok(!ctx.assessmentReviewStyles().includes('#assessment-review.max-map-layout .review-distance,'),'Visibility is independent of layout');
assert.ok(ctx.assessmentReviewStyles().includes('min(50vw,clamp(600px,34vw,820px))'),'Wider details panel with a limit on small screens');
assert.ok(!ctx.assessmentReviewStyles().includes('100dvh - 240px'),'Map sizing must not guess toolbar height');
assert.ok(!ctx.assessmentReviewStyles().includes('42dvh - 80px'),'Small-screen maps must use the real panel size too');
console.log('PASS: review history, before/after, independent case/scope validation, immutable source, bilingual tutorial/autosave/comfort controls');
