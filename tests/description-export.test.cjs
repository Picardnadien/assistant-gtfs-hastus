const fs=require('node:fs'),assert=require('node:assert/strict');
const check=require('../stop-description-check.js');
const table=[['ID','Key','Value','GTFS','HASTUS','Issue'],['001','stop_code','007','=1+2','A & B','Different']];
assert(check.csv(table).includes('"\'=1+2"'));assert(check.csv(table).includes('"001"'));
const entries=check.xlsxEntries(table),xml=entries.find(e=>e.name.endsWith('sheet1.xml')).text;
assert(xml.includes('t="inlineStr"'));assert(xml.includes('>001<'));assert(xml.includes('>=1+2<'));assert(!xml.includes('<f>'));assert(xml.includes('A &amp; B'));
const tools=new Function(fs.readFileSync('report-package.js','utf8')+';return reportPackageTools();')();
fs.mkdirSync('tmp',{recursive:true});fs.writeFileSync('tmp/description-export-test.xlsx',tools.zip(entries,{allowPaths:true}));
console.log('PASS: XLSX text cells, leading zeros, escaped XML and CSV formula protection.');
