// Public demonstration: authored fictional data only. Never read client inputs here.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function buildDemo(root){
  const ctx=vm.createContext({console,URL,window:{},document:{getElementById:()=>({value:'200'})}});
  vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('const decisionList=')[0],ctx);
  for(const file of ['report-editor.js','report-existing.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
  // Deliberately fictional Montreal positions, not transformed OC Transpo locations.
  const defs=[['DEMOHUB','Carrefour exemple / Example hub',45.501,-73.57],['DEMOEST','Pavillon Est / East pavilion',45.5015,-73.569],['DEMOLOIN','Secteur éloigné / Distant sector',45.51,-73.58],['DEMOPARC','Parc exemple / Example park',45.506,-73.563],['DEMOJARD','Jardin exemple / Example garden',45.5066,-73.5635],['DEMOCALM','Place autonome / Independent place',45.518,-73.555]];
  const places=defs.map(([id,description,lat,lon],i)=>({id,description,lat,lon,referenceIds:i===1||i===2?['DEMOHUB']:[],points:Array.from({length:3},(_,j)=>({id:`D${i+1}0${j+1}`,description:`Arrêt fictif / Fictional stop ${i+1}.${j+1}`,lat:lat+j*.00015,lon:lon+j*.0002}))}));
  const source={places,timingPointIds:places.flatMap(p=>p.points.slice(0,2).map(s=>s.id)),timingPointSource:'variants',referenceAnomalies:[{reference_place_id:'DEMOHUB',place_a_id:'DEMOLOIN',place_b_id:'DEMOHUB',anomaly:'PLACES_REFERENCEES_TROP_ELOIGNEES',distance_m:1265}],groupingCandidates:[{entity_type:'PLACES_PROCHES',place_a_id:'DEMOPARC',place_b_id:'DEMOJARD',distance_m:77}],threshold:500,radius:200};
  const model=ctx.existingClientReportModel(source),output={};
  const logo='data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,'assets/csched-logo.svg')).toString('base64');
  for(const language of ['fr','en']){
    const cases=ctx.existingClientReportCases(model,language),t=vm.runInContext(`EXISTING_REPORT_TEXT.${language}`,ctx);
    const maps=Object.fromEntries(cases.map(c=>[c.id,ctx.existingReportMap(c.points,null,t)]));
    const tpMaps=Object.fromEntries(cases.map(c=>[c.id,ctx.existingReportMap(c.points.filter(p=>p.kind==='place'||p.timing===true),null,t)]));
    let html=ctx.existingClientReportHtml(model,cases,maps,{language,tpMaps,theme:'clean',logo,brand:'CSched',client:language==='fr'?'Démonstration fictive — données non opérationnelles':'Fictional demonstration — not operational data',date:'2026-10-07',offline:false});
    // Stable identity preserves browser draft when revisiting this demonstration.
    html=html.replace(/"reportId":"[^"]+"/,'"reportId":"public-fictional-v13-'+language+'"');
    output[`demo/review-${language}.html`]=html;
  }
  return output;
}
module.exports={buildDemo};
