const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {buildPages}=require('../scripts/build-pages.cjs');
const root=path.resolve(__dirname,'..'),destination=fs.mkdtempSync(path.join(os.tmpdir(),'gtfs-pages-test-'));
const {version,files}=buildPages(root,destination);
assert.equal(version,'12.0');
for(const file of ['index.html','tutorial.js','tutorial.css','app.js','report-editor.js','working-timetable.js','assets/csched-logo.svg','assets/scheduling units.oir','.nojekyll'])assert.ok(files.includes(file),file);
for(const file of files)assert.ok(fs.statSync(path.join(destination,file)).isFile());
for(const file of ['.git','tests','tmp','output','README.md','serve.py','demo'])assert.ok(!fs.existsSync(path.join(destination,file)),file+' must not be deployed');
const html=fs.readFileSync(path.join(destination,'index.html'),'utf8');
assert.match(html,/content="12\.0"/);assert.match(html,/The GTFS Missing Link/);
// The workflow creates a fresh workspace, and the package contains no user data.
console.log('PASS: Pages package, version consistency, all browser dependencies and exclusion of local/client files.');
