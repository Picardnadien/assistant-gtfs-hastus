// Deliberately package only application resources, never the repository root.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const ARCHIVES=['12.0','11.0','10.0'];
function buildPages(root,destination){
  const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
  if(!/^\d+\.\d+(?:\.\d+)?$/.test(version))throw new Error('Invalid VERSION');
  const files=[];
  const write=(file,content)=>{const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);files.push(file);};
  function bundle(release,read,prefix='',entry='index.html'){
  let html=read('index.html').toString('utf8');
  if(!html.includes(`name="application-version" content="${release}"`))throw new Error('Version and HTML must agree: '+release);
  const resources=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(match=>match[1].split('?')[0]);
  for(const file of resources)if(!/^[a-z][a-z0-9-]*\.(?:js|css)$/.test(file))throw new Error('Unexpected public resource: '+file);
  for(const file of new Set([...resources,'assets/csched-logo.svg','assets/scheduling units.oir'])){
    let content=read(file);
    if(prefix&&file==='app.js'){
      content=content.toString('utf8');
      if(!content.includes('WORKSPACE_DB="hastus-gtfs-workspaces"'))throw new Error('Unknown archive storage namespace');
      content=content.replace('WORKSPACE_DB="hastus-gtfs-workspaces"',`WORKSPACE_DB="hastus-gtfs-workspaces-archive-v${release}"`);
    }
    write(prefix+file,content);
  }
  html=html.replace(/<body([^>]*)>/,`<body$1><nav style="padding:8px 16px;font:14px system-ui;background:#edf2e8;color:#24372b"><a style="color:inherit" href="${prefix?'../../':''}index.html">← Versions</a> · v${release}${prefix?' · Archive — utiliser une copie des sauvegardes / use a copy of your workspaces':''}</nav>`);
  write(prefix+entry,html);write(prefix+'VERSION',release+'\n');
  }
  bundle(version,file=>fs.readFileSync(path.join(root,file)),'','app.html');
  for(const release of ARCHIVES)bundle(release,file=>cp.execFileSync('git',['show',`v${release}:${file}`],{cwd:root,maxBuffer:30*1024*1024}),`versions/v${release}/`);
  write('index.html',fs.readFileSync(path.join(root,'version-menu.html'),'utf8').replaceAll('__CURRENT_VERSION__',version));
  for(const file of ['portal.html','portal.css','portal-config.js','portal.js'])write(file,fs.readFileSync(path.join(root,file)));
  const {buildDemo}=require('./build-review-demo.cjs');
  for(const [file,html] of Object.entries(buildDemo(root)))write(file,html);
  write('.nojekyll','');
  return {version,files,archives:ARCHIVES};
}
if(require.main===module){
  const root=path.resolve(__dirname,'..'),result=buildPages(root,path.join(root,'_site'));
  console.log(`GitHub Pages: v${result.version}, ${result.files.length} public files.`);
}
module.exports={buildPages};
