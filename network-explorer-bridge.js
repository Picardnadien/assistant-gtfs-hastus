/* Explorer documents are self-contained except for the map library and OSM tiles. */
function networkExplorerDocument(template,model){
  const json=JSON.stringify(model).replace(/</g,'\\u003c');
  return template.replace('<!--EXPLORER_DATA-->',()=>'<script id="gx-data" type="application/json">'+json+'<\/script>');
}
function networkExplorerReportModel(model,places,assignments){
  const result=JSON.parse(JSON.stringify(model)),codes=new Map(),byKey=new Map();
  for(const p of places){byKey.set(p.key,p.code);codes.set(p.exportId||p.originalCode,p.code);codes.set(p.originalCode,p.code);}
  for(const p of result.places){const change=places.find(x=>(x.exportId||x.originalCode)===p.id||x.originalCode===p.id);if(change){p.id=change.code;p.name=change.description;}p.ref=codes.get(p.ref)||p.ref;}
  for(const stop of result.stops){const key=assignments[stop.id];stop.place=byKey.has(key)?byKey.get(key):(codes.get(stop.place)||stop.place);}
  for(const p of result.places)p.children=result.places.filter(other=>other.ref===p.id).map(other=>other.id);
  return result;
}
async function loadNetworkExplorerTemplate(){
  const files=['network-explorer.html','network-explorer.css','network-explorer-data.js','network-explorer.js'];
  const [html,css,data,runtime]=await Promise.all(files.map(async file=>{const response=await fetch(new URL(file,location.href));if(!response.ok)throw Error('Explorateur indisponible : '+file);return response.text();}));
  return html.replace('<link rel="stylesheet" href="network-explorer.css">',()=>'<style>'+css+'</style>').replace('<script src="network-explorer-data.js"></script>',()=>'<script>'+data.replace(/<\/script/gi,'<\\/script')+'</script>').replace('<script src="network-explorer.js"></script>',()=>'<!--EXPLORER_DATA--><script>'+runtime.replace(/<\/script/gi,'<\\/script')+'</script>');
}
function currentNetworkExplorerModel(gtfs){
  const tables={...state.parsed,...(gtfs||{})};
  const model=NetworkExplorerData.fromGTFS(tables,state.geographicReady&&!state.geographicNeedsRegroup?state.places:[]);
  if(state.geographicReady&&!state.geographicNeedsRegroup){const timing=new Set([...state.timingPointIds].map(id=>state.stopIdRemap.get(id)||id));for(const stop of model.stops)stop.tp=timing.has(stop.id);}
  if(state.parsed.deadhead){model.deadheadLoaded=true;const byId=new Map(state.parsed.deadhead.rows.map(r=>[String(r.place_code).toUpperCase(),r]));for(const p of model.places){const r=byId.get(p.id.toUpperCase());p.dh=[Number(r?.outgoing)||0,Number(r?.incoming)||0];}}
  return model;
}
async function openLoadedNetworkExplorer(event){
  if(!state.parsed.stops)return;event.preventDefault();const tab=window.open('about:blank','_blank');if(!tab){alert(gtfsUi('Autorisez l’ouverture du nouvel onglet.','Allow the new tab to open.'));return;}tab.opener=null;tab.document.body.textContent=gtfsUi('Préparation du réseau…','Preparing network…');
  try{let tables=state.parsed;if(state.geographicReady&&!state.geographicNeedsRegroup&&state.workflow!=='diagnostic'){const out=buildExports();tables={...state.parsed,stops:parseCSV(out.gtfs),times:parseCSV(out.times)};}
    const html=networkExplorerDocument(await loadNetworkExplorerTemplate(),currentNetworkExplorerModel(tables));tab.document.open();tab.document.write(html);tab.document.close();
  }catch(error){tab.document.body.textContent=error.message;}
}
document.querySelector('.network-prototype-link')?.addEventListener('click',openLoadedNetworkExplorer);
