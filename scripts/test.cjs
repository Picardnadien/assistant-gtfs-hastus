const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
// These integration tests produce synthetic HTML fixtures consumed by later tests.
// Explicit order makes a fresh CI checkout behave like a local checkout.
const fixtures=['report-editor.test.cjs','report-network.test.cjs','report-timetable-export.test.cjs','report-network-document.test.cjs'];
const remaining=fs.readdirSync(path.join(root,'tests')).filter(file=>file.endsWith('.test.cjs')&&file!=='workspace-real-gtfs.test.cjs'&&!fixtures.includes(file)).sort();
for(const file of [...fixtures,...remaining])cp.execFileSync(process.execPath,[path.join(root,'tests',file)],{cwd:root,stdio:'inherit'});
console.log(`All ${fixtures.length+remaining.length} test suites passed.`);
