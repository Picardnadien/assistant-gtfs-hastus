const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'place-code-layout.css'),'utf8');
assert.ok(css.includes('180px'));assert.ok(css.includes('flex:0 0 164px'));assert.ok(css.includes('max-width:700px'));
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(index.indexOf('place-code-layout.css')>index.indexOf('clean-theme.css'));
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
for(const theme of ['classic','clean','genz']){
  const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test codes place · ${theme}</title><link rel="stylesheet" href="../styles.css"><link rel="stylesheet" href="../clean-theme.css"><link rel="stylesheet" href="../place-code-layout.css"></head><body class="${theme}-theme"><main><section class="panel"><h2>Codes place · 8 caractères</h2><article class="group-card"><div class="group-fields"><label>Description de la place<input value="Wellington / Westmount"></label><label>Code place<input class="code-input" maxlength="8" value="WELLWEST"></label><label class="proposal-list">Places proposées<select><option>WELLWEST · Wellington / Westmount</option></select></label></div></article><div class="decision"><h3>Créer une place</h3><div class="new-name"><input aria-label="Nouveau code" maxlength="8" value="wwwwwwww"><span>Minuscules conservées</span></div></div><p><span id="code-measure" style="display:inline-block;font:16px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.06em">WWWWWWWW</span></p></section></main></body></html>`;
  fs.writeFileSync(path.join(root,`tmp/report-editor-code-layout-${theme}.html`),html);
}
console.log('PASS: wider eight-character code fields, non-shrinking inline inputs, responsive layout and three theme fixtures.');
