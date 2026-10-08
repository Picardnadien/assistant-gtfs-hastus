const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {buildPages}=require('../scripts/build-pages.cjs');
const root=path.resolve(__dirname,'..'),destination=fs.mkdtempSync(path.join(os.tmpdir(),'gtfs-pages-test-'));
const {version,files}=buildPages(root,destination);
assert.equal(version,'13.0');
for(const file of ['index.html','tutorial.js','tutorial.css','app.js','report-editor.js','working-timetable.js','assets/csched-logo.svg','assets/scheduling units.oir','.nojekyll'])assert.ok(files.includes(file),file);
for(const file of files)assert.ok(fs.statSync(path.join(destination,file)).isFile());
for(const file of ['.git','tests','tmp','output','README.md','serve.py','supabase'])assert.ok(!fs.existsSync(path.join(destination,file)),file+' must not be deployed');
for(const file of ['portal.html','portal.css','portal.js','portal-config.js'])assert.ok(files.includes(file));
const html=fs.readFileSync(path.join(destination,'index.html'),'utf8');
assert.match(html,/v13\.0/);assert.match(html,/The GTFS Missing Link/);assert.match(html,/href="app.html"/);
assert.match(fs.readFileSync(path.join(destination,'app.html'),'utf8'),/content="13\.0"/);
for(const release of ['12.0','11.0','10.0']){
  const prefix=`versions/v${release}/`;
  assert.ok(html.includes(prefix));
  const archived=fs.readFileSync(path.join(destination,prefix+'index.html'),'utf8');
  assert.ok(archived.includes(`content="${release}"`));
  assert.ok(fs.readFileSync(path.join(destination,prefix+'app.js'),'utf8').includes(`WORKSPACE_DB="hastus-gtfs-workspaces-archive-v${release}"`));
  for(const m of archived.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g))assert.ok(files.includes(prefix+m[1].split('?')[0]));
}
for(const language of ['fr','en']){
  const demo=fs.readFileSync(path.join(destination,`demo/review-${language}.html`),'utf8');
  assert.ok(demo.includes('DEMOHUB')&&demo.includes('public-fictional-v13-'+language));
  assert.ok(!demo.includes('Confederation Square')&&!demo.includes('09282026'));
}
// The workflow creates a fresh workspace, and the package contains no user data.
console.log('PASS: Pages package, version consistency, all browser dependencies and exclusion of local/client files.');
