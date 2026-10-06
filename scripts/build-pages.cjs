// Deliberately package only application resources, never the repository root.
const fs=require('node:fs'),path=require('node:path');
function buildPages(root,destination){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
  if(!/^\d+\.\d+(?:\.\d+)?$/.test(version)||!html.includes(`name="application-version" content="${version}"`))throw new Error('VERSION and index.html must agree');
  const resources=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(match=>match[1].split('?')[0]);
  for(const file of resources)if(!/^[a-z][a-z0-9-]*\.(?:js|css)$/.test(file))throw new Error('Unexpected public resource: '+file);
  const files=[...new Set(['index.html','VERSION',...resources,'assets/csched-logo.svg','assets/scheduling units.oir'])];
  for(const file of files){
    const source=path.join(root,file),target=path.join(destination,file);
    if(!fs.lstatSync(source).isFile())throw new Error('Expected a regular file: '+file);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
  }
  fs.writeFileSync(path.join(destination,'.nojekyll'),'');
  return {version,files:[...files,'.nojekyll']};
}
if(require.main===module){
  const root=path.resolve(__dirname,'..'),result=buildPages(root,path.join(root,'_site'));
  console.log(`GitHub Pages: v${result.version}, ${result.files.length} public files.`);
}
module.exports={buildPages};
