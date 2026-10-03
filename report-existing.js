"use strict";

// Read-only HASTUS diagnostic. Keep original associations separate from proposals.
function existingClientReportModel(source){
  const clean=value=>String(value??"").trim(),stopKey=value=>clean(value).replace(/^:/,""),byId=new Map();
  const coordinate=(lat,lon)=>clean(lat)!==""&&clean(lon)!==""&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lon))<=180;
  function place(id,description=""){
    id=clean(id);if(!id)return null;
    if(!byId.has(id))byId.set(id,{id,code:id,description:clean(description)||id,lat:null,lon:null,stops:[],references:[],tags:[],anomalies:[],suggestions:[],decisions:[],unused:[],proposed:false});
    return byId.get(id);
  }
  function addStop(p,stop){
    if(!p)return;const id=stopKey(stop.id),hasCoord=coordinate(stop.lat,stop.lon);
    if(p.stops.some(row=>row.id===id))return;
    p.stops.push({id,description:clean(stop.description),lat:hasCoord?Number(stop.lat):null,lon:hasCoord?Number(stop.lon):null});
  }
  function tag(p,value){if(p&&!p.tags.includes(value))p.tags.push(value);}
  for(const item of source.places||[]){
    const p=place(item.id,item.description);if(!p)continue;
    if(coordinate(item.lat,item.lon)){p.lat=Number(item.lat);p.lon=Number(item.lon);}
    p.references=[...new Set(item.referenceIds||clean(item.referenceId).split(';').filter(Boolean))];
    for(const point of item.points||[])addStop(p,point);
  }
  // Retain places/stops omitted by spatial analysis because coordinates are missing.
  const m=source.mapping||{};
  for(const row of source.parsed?.hastus?.rows||[]){
    const p=place(row[m.placeId],row[m.placeDesc]);if(!p)continue;
    addStop(p,{id:row[m.stopId],description:row[m.stopDesc],lat:row[m.lat],lon:row[m.lon]});
    const ref=clean(row[m.referenceId]);if(ref&&!p.references.includes(ref))p.references.push(ref);
  }
  const anomalies=(source.referenceAnomalies||[]).map((row,index)=>({...row,anchor:`reference-${index}`}));
  for(const row of anomalies)for(const id of [row.place_a_id,row.place_b_id,row.reference_place_id]){
    const p=byId.get(clean(id));if(!p)continue;
    p.anomalies.push(row);tag(p,row.anomaly==="REFERENCE_INTROUVABLE"?"missingReference":"distantReference");
  }
  for(const row of source.groupingCandidates||[])for(const id of [row.place_a_id,row.place_b_id]){
    const p=byId.get(clean(id));if(!p)continue;p.suggestions.push(row);tag(p,row.entity_type==="STOP_SANS_PLACE"?"assignment":"grouping");
  }
  const unresolved=[];
  for(const d of source.decisions||[]){
    const original=clean(d.originalPlaceId),target=d.choice==="__new__"?clean(d.newCode):clean(d.choice);
    const entry={id:clean(d.id),originalId:clean(d.originalId||d.id),description:clean(d.description),original,target,
      lat:coordinate(d.lat,d.lon)?Number(d.lat):null,lon:coordinate(d.lat,d.lon)?Number(d.lon):null,
      status:d.status,error:clean(d.error),isNew:d.choice==="__new__"};
    if(d.status==="error"||!target){unresolved.push(entry);tag(byId.get(original),"data");continue;}
    let dest=byId.get(target);
    if(!dest){dest=place(target,d.candidates?.find(p=>p.id===target)?.description||d.description);dest.proposed=entry.isNew;if(!entry.isNew)tag(dest,"data");}
    if(entry.isNew)tag(dest,"creation");
    for(const id of new Set([original,target])){
      const p=byId.get(id);if(!p)continue;p.decisions.push(entry);
      if(d.status==="review"||target!==original)tag(p,"assignment");
    }
  }
  for(const row of source.unusedPlaceStops||[]){const p=place(row.place_id,row.place_description);if(p){p.unused.push({...row});tag(p,"unused");}}
  const priority=["distantReference","missingReference","data","grouping","assignment","creation","unused","none"];
  const places=[...byId.values()];
  for(const p of places){
    if(p.stops.some(stop=>stop.lat===null))tag(p,"data");
    const points=p.stops.filter(stop=>stop.lat!==null);
    if(p.lat===null&&points.length){p.lat=points.reduce((n,s)=>n+s.lat,0)/points.length;p.lon=points.reduce((n,s)=>n+s.lon,0)/points.length;}
    if(p.proposed&&p.lat===null){const d=p.decisions.find(d=>d.target===p.id&&d.lat!==null);if(d){p.lat=d.lat;p.lon=d.lon;}}
    if(p.lat===null)tag(p,"data");
    p.tags.sort((a,b)=>priority.indexOf(a)-priority.indexOf(b));if(!p.tags.length)p.tags.push("none");
    p.primary=p.tags[0];p.stops.sort((a,b)=>a.id.localeCompare(b.id,"fr",{numeric:true}));
  }
  places.sort((a,b)=>priority.indexOf(a.primary)-priority.indexOf(b.primary)||a.code.localeCompare(b.code,"fr",{numeric:true,sensitivity:"base"}));
  places.forEach((p,i)=>p.anchor=`place-${i}`);
  return {places,anomalies,unresolved,priority,byId,radius:source.radius||300,threshold:source.threshold||500};
}

const EXISTING_REPORT_TEXT={
  fr:{title:"Diagnostic des places et références HASTUS",intro:"Références suspectes en premier, puis places classées par type de validation et par code. Une place peut porter plusieurs alertes ; elle n’est comptée qu’une seule fois.",
    note:"Rapport de diagnostic en consultation seule : les affectations actuelles et les propositions sont distinctes. Aucune correction n’est appliquée au GTFS ni à HASTUS. « Sans intervention détectée » ne remplace pas une validation métier.",
    categories:{distantReference:"Références trop éloignées",missingReference:"Références introuvables",data:"Données à compléter",grouping:"Regroupements à valider",assignment:"Affectations à valider",creation:"Places à créer",unused:"Stops non TP à vérifier",none:"Sans intervention détectée"},
    all:"Tous les types",review:"Décision requise",search:"Rechercher une place, une référence ou un stop",allCases:"Tout le diagnostic",refs:"Références suspectes",places:"Places",issues:"Stops sans diagnostic complet",summary:"Sommaire cliquable",type:"Type de validation",code:"Code / référence",description:"Description",stops:"Stops actuellement associés",stop:"Stop",current:"Place actuelle",proposed:"Place proposée",newPlace:"Nouvelle place proposée",unchanged:"Affectation actuelle conservée",unassigned:"Sans place",proposal:"Propositions d’affectation (non appliquées)",recommendation:"Recommandation",reference:"Référence",distance:"Distance à vol d’oiseau",threshold:"Seuil d’alerte",radius:"Rayon de proximité",coordinates:"Coordonnées",unavailable:"Coordonnées insuffisantes pour cette carte.",noStops:"Aucun stop actuellement associé dans l’export fourni.",noMatches:"Aucun cas ne correspond aux filtres.",previous:"Précédent",next:"Suivant",page:"Page",cases:"cas",back:"Retour au sommaire",open:"Afficher la fiche",origin:"Données HASTUS chargées · état à la génération",noTP:"Stop non TP dans la source choisie",absent:"Absent des versions de routes",missing:"Non disponible",map:"Carte des places et des stops",legend:"● Centre de place · petits cercles : stops physiques · violet : proposition non appliquée",offline:"Cartes fixes intégrées, consultables hors ligne.",online:"Fonds OpenStreetMap en ligne ; connexion requise. Zoom et déplacement bloqués.",basemapMissing:"Fond OSM non disponible dans ce secteur ; seuls les repères sont affichés.",
    advice:{distantReference:"Vérifier le trajet réel de repositionnement et revoir la référence commune si le regroupement n’est pas justifié.",missingReference:"Vérifier l’identifiant de référence et l’exhaustivité de l’export avant de corriger ou de créer une référence.",data:"Compléter les coordonnées ou les associations manquantes avant de conclure.",grouping:"Évaluer une référence commune. Conserver des places distinctes lorsque l’orientation ou le repositionnement l’exige.",assignment:"Confirmer l’affectation proposée en tenant compte de la position physique et des débuts/fins de voyage.",creation:"Valider le code, la description et les stops de la nouvelle place proposée.",unused:"Vérifier si la place reste nécessaire, notamment pour les extrémités de voyages. Ne pas supprimer automatiquement.",none:"Conserver les associations actuelles sous réserve de la validation métier."}},
  en:{title:"HASTUS place and reference assessment",intro:"Suspect references first, followed by places grouped by validation type and sorted by code. A place may have several alerts but is counted only once.",
    note:"Read-only assessment: current assignments and proposals are kept separate. No changes are applied to the GTFS or HASTUS. “No intervention detected” does not replace operational review.",
    categories:{distantReference:"Distant references",missingReference:"Missing references",data:"Incomplete data",grouping:"Groupings to validate",assignment:"Assignments to validate",creation:"Places to create",unused:"Non-timing-point stops to review",none:"No intervention detected"},
    all:"All types",review:"Decision required",search:"Search for a place, reference or stop",allCases:"Full assessment",refs:"Suspect references",places:"Places",issues:"Stops with incomplete assessment",summary:"Clickable overview",type:"Validation type",code:"Code / reference",description:"Description",stops:"Currently assigned stops",stop:"Stop",current:"Current place",proposed:"Proposed place",newPlace:"Proposed new place",unchanged:"Current assignment retained",unassigned:"No place",proposal:"Assignment proposals (not applied)",recommendation:"Recommendation",reference:"Reference",distance:"Straight-line distance",threshold:"Alert threshold",radius:"Proximity radius",coordinates:"Coordinates",unavailable:"Insufficient coordinates for this map.",noStops:"No currently assigned stops in the supplied export.",noMatches:"No cases match these filters.",previous:"Previous",next:"Next",page:"Page",cases:"cases",back:"Back to overview",open:"Open details",origin:"Loaded HASTUS data · snapshot at generation",noTP:"Not a timing point in the selected source",absent:"Absent from route versions",missing:"Not available",map:"Place and stop map",legend:"● Place centre · small circles: physical stops · purple: unapplied proposal",offline:"Embedded fixed maps, available offline.",online:"Online OpenStreetMap backgrounds require Internet. Zoom and pan are disabled.",basemapMissing:"No OSM background available in this area; markers only.",
    advice:{distantReference:"Check the actual repositioning movement and review the shared reference if the grouping is not operationally justified.",missingReference:"Check the reference identifier and export completeness before correcting or creating a reference.",data:"Complete missing coordinates or assignments before drawing conclusions.",grouping:"Consider a common reference. Keep distinct places when orientation or repositioning requires it.",assignment:"Confirm the proposed assignment using the physical stop location and trip start/end requirements.",creation:"Validate the proposed place code, description and associated stops.",unused:"Check whether the place is still required, particularly at trip endpoints. Do not delete automatically.",none:"Retain current assignments, subject to operational validation."}}
};

function existingReportMapPoints(places,extra=[]){
  const result=[];
  for(const p of places){
    if(p.lat!==null&&p.lon!==null)result.push({id:p.code,description:p.description,lat:p.lat,lon:p.lon,kind:"place"});
    for(const s of p.stops)if(s.lat!==null&&s.lon!==null)result.push({...s,kind:"stop"});
  }
  for(const s of extra)if(s.lat!==null&&s.lon!==null)result.push({...s,kind:"proposal"});
  return result;
}
function existingReportMapGeometry(points){
  if(!points.length)return null;const width=1000,height=430,pad=65;
  let zoom=1,bounds;
  for(let z=18;z>=1;z--){
    const projected=points.map(p=>osmProject(p.lat,p.lon,z));
    const b=projected.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
    zoom=z;bounds=b;if(b.maxX-b.minX<=width-pad*2&&b.maxY-b.minY<=height-pad*2)break;
  }
  const center={x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2},nw=osmUnproject(center.x-width/2,center.y-height/2,zoom),se=osmUnproject(center.x+width/2,center.y+height/2,zoom);
  return {width,height,zoom,center,bounds:{minlat:se.lat,maxlat:nw.lat,minlon:nw.lon,maxlon:se.lon}};
}
function existingReportMap(points,features,t){
  const g=existingReportMapGeometry(points);if(!g)return `<p class="notice">${escapeHtml(t.unavailable)}</p>`;
  const {width,height,zoom,center,bounds}=g,offline=Array.isArray(features),project=p=>{const w=osmProject(p.lat,p.lon,zoom);return {x:w.x-center.x+width/2,y:w.y-center.y+height/2};};
  let background="",missing=false;
  if(offline){
    const visible=features.filter(f=>!f.bounds||(f.bounds.maxlat>=bounds.minlat&&f.bounds.minlat<=bounds.maxlat&&f.bounds.maxlon>=bounds.minlon&&f.bounds.minlon<=bounds.maxlon));
    const paths=visible.map(f=>({f,style:offlineOsmFeatureStyle(f.tags)})).filter(x=>x.style).sort((a,b)=>a.style.priority-b.style.priority).map(({f})=>offlineOsmPath(f,g)).filter(Boolean);
    const labels=[],names=new Set();
    for(const f of visible){
      if(!f.tags?.highway||!f.tags?.name||!f.geometry?.length||names.has(f.tags.name)||labels.length>=14)continue;
      const point=project(f.geometry[Math.floor(f.geometry.length/2)]);
      if(point.x<50||point.x>width-50||point.y<30||point.y>height-30)continue;
      names.add(f.tags.name);labels.push(`<text class="credit" x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}" text-anchor="middle">${escapeHtml(f.tags.name)}</text>`);
    }
    missing=!paths.length;background=`<rect width="${width}" height="${height}" fill="#f4f2ec"/>${paths.join('')}${labels.join('')}`;
  }else{
    const bbox=[bounds.minlon,bounds.minlat,bounds.maxlon,bounds.maxlat].join(',');
    background=`<iframe inert tabindex="-1" aria-hidden="true" loading="lazy" referrerpolicy="origin" title="OpenStreetMap" src="https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&amp;layer=mapnik"></iframe>`;
  }
  const centres=points.filter(p=>p.kind==='place'),relations=centres.slice(1).map(p=>{const a=project(centres[0]),b=project(p);return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="#9a6741" stroke-width="2" stroke-dasharray="7 6"/>`;}).join('');
  const markers=relations+points.map((p,i)=>{const {x,y}=project(p),place=p.kind==="place",left=x>width-200;return `<g class="marker ${p.kind}"><title>${escapeHtml(p.id+' · '+p.description)}</title><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${place?10:5}"/><text x="${(x+(left?-14:14)).toFixed(2)}" y="${(y+(place?-14:14+(i%2)*12)).toFixed(2)}" text-anchor="${left?'end':'start'}">${escapeHtml(p.id)}</text></g>`;}).join('');
  return `<div class="map-stage">${offline?'':background}<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t.map)}">${offline?background:''}${markers}<text x="990" y="419" text-anchor="end" class="credit">© OpenStreetMap contributors · ODbL</text></svg></div><p class="legend">${escapeHtml(t.legend)}</p>${missing?`<p class="notice">${escapeHtml(t.basemapMissing)}</p>`:''}`;
}

function existingClientReportCases(model,language){
  const t=EXISTING_REPORT_TEXT[language],e=escapeHtml,cases=[];
  const coords=p=>p.lat===null?t.missing:`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
  const link=p=>`<a href="#${p.anchor}" data-case-link="${p.anchor}">${e(p.code)} · ${e(p.description)}</a>`;
  const table=(headers,rows)=>`<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const stopTable=places=>table([t.current,t.stop,t.description,t.coordinates],places.flatMap(p=>p.stops.map(s=>`<tr><td>${e(p.code)}</td><td>${e(s.id)}</td><td>${e(s.description)}</td><td>${e(coords(s))}</td></tr>`)));
  for(const row of model.anomalies){
    const places=[...new Set([row.place_a_id,row.place_b_id,row.reference_place_id])].map(id=>model.byId.get(id)).filter(Boolean),category=row.anomaly==="REFERENCE_INTROUVABLE"?"missingReference":"distantReference";
    const html=`<p><b>${e(t.reference)} : ${e(row.reference_place_id)}</b></p><p>${places.map(link).join(' ↔ ')}</p><p>${e(t.distance)} : ${row.distance_m===""||row.distance_m==null?e(t.missing):e(row.distance_m)+' m'} · ${e(t.threshold)} : ${model.threshold} m</p><p class="notice">${e(t.advice[category])}</p><h3>${e(t.stops)}</h3>${stopTable(places)}`;
    cases.push({id:row.anchor,kind:"reference",code:row.reference_place_id,title:`${t.reference} ${row.reference_place_id} · ${[row.place_a_id,row.place_b_id].filter(Boolean).join(' ↔ ')}`,tags:[category],html,points:existingReportMapPoints(places),search:[row.reference_place_id,...places.flatMap(p=>[p.code,p.description,...p.stops.flatMap(s=>[s.id,s.description])])].join(' ')});
  }
  for(const p of model.places){
    const extra=p.decisions.filter(d=>d.target===p.id&&d.original!==p.id),alerts=p.tags.map(tag=>`<p class="notice"><b>${e(t.categories[tag])}</b> — ${e(t.advice[tag])}</p>`).join('');
    const anomalyLinks=p.anomalies.map(a=>`<li><a href="#${a.anchor}" data-case-link="${a.anchor}">${e(t.reference)} ${e(a.reference_place_id)} · ${e(a.place_a_id)} / ${e(a.place_b_id||'—')}</a></li>`).join('');
    const suggestions=p.suggestions.map(s=>{const other=model.byId.get(s.place_a_id===p.id?s.place_b_id:s.place_a_id);return `<li>${e(s.entity_type==="STOP_SANS_PLACE"?s.stop_id+' · '+s.stop_description:t.categories.grouping)} ${other?link(other):''} · ${e(s.distance_m)} m</li>`;}).join('');
    const decisions=p.decisions.map(d=>`<tr><td>${e(d.id)}</td><td>${e(d.description)}</td><td>${e(d.original||t.unassigned)}</td><td>${e(d.target)}${d.target===d.original?' · '+e(t.unchanged):d.isNew?' · '+e(t.newPlace):''}</td></tr>`);
    const unused=p.unused.map(s=>`<tr><td>${e(s.stop_id)}</td><td>${e(s.stop_description)}</td><td>${e(s.status==="ABSENT_DES_VERSIONS"?t.absent:t.noTP)}</td></tr>`);
    const html=`<p>${e(t.reference)} : ${e(p.references.join('; ')||'—')} ${p.proposed?' · '+e(t.newPlace):''}</p>${alerts}${anomalyLinks?`<h3>${e(t.refs)}</h3><ul>${anomalyLinks}</ul>`:''}${suggestions?`<h3>${e(t.categories.grouping)}</h3><ul>${suggestions}</ul>`:''}<h3>${e(t.stops)} (${p.stops.length})</h3>${p.stops.length?stopTable([p]):`<p>${e(t.noStops)}</p>`}${decisions.length?`<h3>${e(t.proposal)}</h3>${table([t.stop,t.description,t.current,t.proposed],decisions)}`:''}${unused.length?`<h3>${e(t.categories.unused)}</h3>${table([t.stop,t.description,t.type],unused)}`:''}`;
    const neighbors=[...new Set(p.suggestions.filter(s=>s.entity_type==='PLACES_PROCHES').flatMap(s=>[s.place_a_id,s.place_b_id]))].filter(id=>id!==p.id).map(id=>model.byId.get(id)).filter(Boolean);
    cases.push({id:p.anchor,kind:"place",code:p.code,title:p.code+' · '+p.description,tags:p.tags,html,points:existingReportMapPoints([p,...neighbors],extra),search:[p.code,p.description,...p.references,...p.stops.flatMap(s=>[s.id,s.description]),...p.decisions.flatMap(d=>[d.id,d.description]),...p.unused.flatMap(s=>[s.stop_id,s.stop_description])].join(' ')});
  }
  for(const [i,d] of model.unresolved.entries())cases.push({id:`issue-${i}`,kind:"issue",code:d.id,title:d.id+' · '+d.description,tags:["data"],html:`<p class="notice">${e(t.advice.data)}</p><p>${e(t.current)} : ${e(d.original||t.unassigned)}</p>`,points:existingReportMapPoints([], [d]),search:d.id+' '+d.description});
  return cases;
}

function existingClientReportRuntime(){
  const data=JSON.parse(document.getElementById('assessment-data').textContent),t=data.text,size=12;
  const kind=document.getElementById('kind'),type=document.getElementById('type'),search=document.getElementById('search'),list=document.getElementById('cases'),summary=document.getElementById('overview-body');
  let page=0,filtered=[];
  const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function loadMap(details){const host=details.querySelector('.map-host');if(details.open&&host&&!host.childNodes.length)host.innerHTML=data.maps[details.dataset.caseId]||'';}
  function render(){
    const query=normalize(search.value);filtered=data.cases.filter(c=>(kind.value==='all'||kind.value===c.kind)&&(type.value==='all'||(type.value==='review'?!c.tags.includes('none'):c.tags.includes(type.value)))&&normalize(c.search).includes(query));
    page=Math.max(0,Math.min(page,Math.ceil(filtered.length/size)-1));const visible=filtered.slice(page*size,(page+1)*size);
    summary.innerHTML=visible.map(c=>`<tr><td><a href="#${c.id}" data-case-link="${c.id}">${esc(c.title)}</a></td><td>${c.tags.map(tag=>esc(t.categories[tag])).join(' · ')}</td></tr>`).join('');
    list.innerHTML=visible.map(c=>`<article id="${c.id}"><details data-case-id="${c.id}"><summary><span class="badge">${esc(t.categories[c.tags[0]])}</span><h2>${esc(c.title)}</h2></summary><div class="case-body"><div class="map-host"></div>${c.html}<a href="#overview">↑ ${esc(t.back)}</a></div></details></article>`).join('');
    list.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',()=>loadMap(d)));
    const first=list.querySelector('details');if(first){first.open=true;loadMap(first);}
    document.getElementById('page-status').textContent=`${filtered.length} ${t.cases} · ${t.page} ${page+1} / ${Math.max(1,Math.ceil(filtered.length/size))}`;
    document.getElementById('empty').hidden=filtered.length>0;document.getElementById('previous').disabled=page===0;document.getElementById('next').disabled=(page+1)*size>=filtered.length;
  }
  function navigate(id){
    if(!data.cases.some(c=>c.id===id))return;
    let index=filtered.findIndex(c=>c.id===id);
    if(index<0){kind.value='all';type.value='all';search.value='';render();index=filtered.findIndex(c=>c.id===id);}
    page=Math.floor(index/size);render();const article=document.getElementById(id),details=article.querySelector('details');details.open=true;loadMap(details);article.scrollIntoView({block:'start'});
  }
  for(const control of [kind,type])control.addEventListener('change',()=>{page=0;render();});
  search.addEventListener('input',()=>{page=0;render();});
  document.getElementById('previous').addEventListener('click',()=>{page--;render();document.getElementById('overview').scrollIntoView();});
  document.getElementById('next').addEventListener('click',()=>{page++;render();document.getElementById('overview').scrollIntoView();});
  document.addEventListener('click',event=>{const a=event.target.closest('[data-case-link]');if(!a)return;event.preventDefault();const id=a.dataset.caseLink;history.replaceState(null,'','#'+id);navigate(id);});
  window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
  render();if(location.hash)navigate(location.hash.slice(1));
}

function existingClientReportHtml(model,cases,maps,options){
  const {language,theme,logo,brand,date,offline}=options,t=EXISTING_REPORT_TEXT[language],e=escapeHtml;
  const noAction=model.places.filter(p=>p.primary==='none').length;
  const data={text:t,cases:cases.map(({points,...c})=>c),maps};
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(options.client)} · ${e(t.title)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f5ef;color:#23322a;font:15px/1.55 Arial,sans-serif;--accent:${theme==='classic'?'#006d67':'#54742e'};--tint:#edf3e7}header,main{max-width:1240px;margin:auto;padding:24px}header{display:flex;align-items:center;gap:24px;border-bottom:3px solid var(--accent)}header img{max-width:150px;max-height:52px}.client-brand{margin-left:auto;display:flex;align-items:center;gap:14px}.client-brand small{display:block}h1{font-size:29px;line-height:1.2}h2{font-size:20px;display:inline;margin:0 0 0 12px}h3{font-size:16px;margin-top:24px}a{color:var(--accent);overflow-wrap:anywhere}p{overflow-wrap:anywhere}.intro{max-width:920px}.notice{background:var(--tint);border-left:3px solid var(--accent);padding:12px}.metrics{display:flex;gap:12px;flex-wrap:wrap}.metrics div{flex:1;min-width:150px;background:white;padding:16px;border:1px solid #d8dfd0}.metrics strong{display:block;font-size:25px;color:var(--accent)}.filters{display:flex;gap:12px;flex-wrap:wrap;padding:20px 0}label{display:grid;gap:5px}input,select,button{font:inherit;padding:10px;border:1px solid #b5c3a9;background:white;color:inherit;border-radius:14px 0}input{min-width:280px}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}.pager{display:flex;align-items:center;gap:16px;padding:14px 0}#page-status{flex:1}article{background:white;border:1px solid #d8dfd0;margin:18px 0;scroll-margin-top:20px}summary{cursor:pointer;padding:20px}.case-body{padding:0 20px 24px}.badge{display:inline-block;padding:4px 9px;background:var(--tint);font-size:12px;font-weight:bold}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;background:white}th,td{padding:10px;border:1px solid #d8dfd0;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:var(--tint)}.map-stage{position:relative;aspect-ratio:1000/430;overflow:hidden;background:#e9ede4}.map-stage iframe,.map-stage svg{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none;user-select:none}.map-stage svg{z-index:1}.marker circle{fill:#176a8a;stroke:white;stroke-width:2}.marker.place circle{fill:var(--accent);stroke:#fff;stroke-width:3}.marker.proposal circle{fill:#994583}.marker text{font:12px Arial;paint-order:stroke;stroke:white;stroke-width:4px;fill:#20312d}.marker.place text{font-weight:bold}.credit{font:12px Arial;paint-order:stroke;stroke:white;stroke-width:4px}.legend{font-size:12px;color:#596657}.osm-land{fill:#dfe9d7;stroke:#cad9c0}.osm-water{fill:#cde6ef;stroke:#8cbfd0;stroke-width:2}.osm-building{fill:#ddd9d1;stroke:#c0bbb2}.osm-rail{fill:none;stroke:#8e8178;stroke-width:3;stroke-dasharray:7 5}.osm-road{fill:none;stroke-linecap:round;stroke-linejoin:round}.osm-road.major{stroke:#f2b879;stroke-width:9}.osm-road.minor{stroke:white;stroke-width:6}.osm-road.path{stroke:white;stroke-width:3}footer{padding:24px;text-align:center;color:#65715f}[hidden]{display:none!important}@media(max-width:600px){header,main{padding:14px}.filters>*{width:100%}h2{display:block;margin:8px 0}header{flex-wrap:wrap}}
  </style></head><body><header>${logo?`<img src="${e(logo)}" alt="CSched">`:'<strong>CSched</strong>'}${brand}<small>${e(date)}</small></header><main><h1>${e(t.title)}</h1><p class="intro">${e(t.intro)}</p><p class="notice">${e(t.note)}</p><p>${e(t.origin)} · ${e(t.radius)} : ${model.radius} m · ${e(t.threshold)} : ${model.threshold} m</p><p>${e(offline?t.offline:t.online)}</p><div class="metrics"><div>${e(t.refs)}<strong>${model.anomalies.length}</strong></div><div>${e(t.places)}<strong>${model.places.length}</strong></div><div>${e(t.review)}<strong>${model.places.length-noAction}</strong></div><div>${e(t.categories.none)}<strong>${noAction}</strong></div></div><div class="filters"><label>${e(t.allCases)}<select id="kind"><option value="all">${e(t.allCases)}</option><option value="reference">${e(t.refs)}</option><option value="place">${e(t.places)}</option><option value="issue">${e(t.issues)} (${model.unresolved.length})</option></select></label><label>${e(t.type)}<select id="type"><option value="all">${e(t.all)}</option><option value="review">${e(t.review)}</option>${model.priority.map(key=>`<option value="${key}">${e(t.categories[key])}</option>`).join('')}</select></label><label>${e(t.search)}<input id="search" type="search"></label></div><section id="overview"><h3>${e(t.summary)}</h3><div class="table-wrap"><table><thead><tr><th>${e(t.code)} · ${e(t.description)}</th><th>${e(t.type)}</th></tr></thead><tbody id="overview-body"></tbody></table></div></section><div class="pager"><span id="page-status" role="status" aria-live="polite"></span><button id="previous">${e(t.previous)}</button><button id="next">${e(t.next)}</button></div><p id="empty" hidden>${e(t.noMatches)}</p><div id="cases"></div><noscript>${e(language==='en'?'Enable JavaScript to browse this report.':'Activez JavaScript pour consulter ce rapport.')}</noscript></main><footer>CSched · ${e(options.client)} · HASTUS</footer><script id="assessment-data" type="application/json">${inlineJson(data)}</script><script>(${existingClientReportRuntime.toString()})();<\/script></body></html>`;
}

async function downloadExistingClientReport(){
  if(!isGeographicExisting()||!state.geographicReady)return;
  const button=$("download-existing-html"),originalLabel=button.textContent,language=placeReportLanguage();button.disabled=true;
  try{
    button.textContent=language==='en'?'Preparing assessment…':'Préparation du diagnostic…';
    await new Promise(resolve=>setTimeout(resolve,20));
    const model=existingClientReportModel({...state,radius:Number($("radius").value),threshold:Number($("reference-distance").value)}),cases=existingClientReportCases(model,language);
    if(!cases.length)throw new Error(language==='en'?'No assessment results to export.':'Aucun résultat de diagnostic à exporter.');
    const coverage=cases.filter(c=>c.points.length).map(c=>{
      const g=existingReportMapGeometry(c.points),center=osmUnproject(g.center.x,g.center.y,g.zoom);
      return {...center,radius:Math.max(...c.points.map(p=>haversine(center.lat,center.lon,p.lat,p.lon)))+200};
    });
    const offline=placeReportHtmlMapMode()==='offline';
    button.textContent=language==='en'?'Preparing maps…':'Préparation des cartes…';
    const [logo,features]=await Promise.all([cschedLogoDataUrl(),offline&&coverage.length?fetchOfflineOsmFeatures(coverage):Promise.resolve(offline?[]:null)]);
    const maps={};
    for(let i=0;i<cases.length;i++){
      maps[cases[i].id]=existingReportMap(cases[i].points,features,EXISTING_REPORT_TEXT[language]);
      if(i%12===0){button.textContent=`${language==='en'?'Creating report':'Création du rapport'} ${i+1}/${cases.length}`;await new Promise(resolve=>setTimeout(resolve,0));}
    }
    const agency=agencyClientIdentity(),client=normalize(agency.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_')||'Client';
    const html=existingClientReportHtml(model,cases,maps,{language,theme:placeReportHtmlTheme(),logo,brand:clientBrandMarkup(),client:agency.name,offline,date:new Date().toLocaleDateString(language==='en'?'en-CA':'fr-CA')});
    download(`${client}_${language==='en'?'HASTUS_assessment':'diagnostic_HASTUS'}_${new Date().toISOString().slice(0,10)}.html`,html,'text/html');
  }finally{button.disabled=false;button.textContent=originalLabel;}
}
