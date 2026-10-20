'use strict';

// Read-only companion to assignment decisions, sharing the report's data model.
let assignmentDiagnosticView=null,assignmentDiagnosticFilter='all',assignmentDiagnosticQuery='';
function assignmentDiagnosticModel(source,options={}){
  const model=existingClientReportModel({...source,radius:options.radius??200,threshold:options.threshold??500,stopPlaceThreshold:options.stopPlaceThreshold??500,endpointsOnly:options.endpointsOnly,deadheadOnly:options.deadheadOnly});
  const key=value=>String(value??'').trim().replace(/^:/,'').toUpperCase();
  const endpointIds=new Set([...(source.endpointStopIds||[])].map(key));
  for(const s of source.gtfsStops||[])if(endpointIds.has(key(s.stop_id))&&source.associationKey==='stop_code')endpointIds.add(key(s.stop_code));
  const entries=[],seen=new Set();
  for(const row of model.anomalies)entries.push({kind:'reference',row,category:row.anomaly==='REFERENCE_INTROUVABLE'?'missingReference':'distantReference'});
  for(const p of model.places)if(p.distantStops.length)entries.push({kind:"distantStop",row:{place_a_id:p.id,distance_m:Math.round(Math.max(...p.distantStops.map(s=>s.placeDistance)))},category:"distantStop"});
  for(const row of source.groupingCandidates||[]){
    const pair=row.entity_type==='STOP_SANS_PLACE'?['stop',row.stop_id,row.place_a_id]:['place',...[row.place_a_id,row.place_b_id].sort()];
    const id=JSON.stringify(pair);if(seen.has(id))continue;seen.add(id);
    entries.push({kind:row.entity_type==='STOP_SANS_PLACE'?'assignment':'grouping',row,category:row.entity_type==='STOP_SANS_PLACE'?'assignment':'grouping'});
  }
  for(const [index,entry] of entries.entries()){
    entry.id=index;
    entry.ids=[...new Set([entry.row.place_a_id,entry.row.place_b_id,...(entry.kind==='reference'?[entry.row.reference_place_id]:[])].filter(Boolean))];
    entry.places=entry.ids.map(id=>model.byId.get(id)).filter(Boolean);
    entry.search=[...entry.ids,entry.row.stop_id,entry.row.stop_description,...entry.places.flatMap(p=>[p.description,...p.references,...p.stops.flatMap(s=>[s.id,s.description])])].join(' ');
  }
  return {model,entries,endpointIds,key,language:options.language==='en'?'en':'fr'};
}
function assignmentDiagnosticsHtml(source,options){
  assignmentDiagnosticView=assignmentDiagnosticModel(source,options);
  return '<section id="assignment-diagnostics" class="assignment-diagnostics" data-no-translate>'+assignmentDiagnosticContent()+'</section>';
}
function assignmentDiagnosticContent(){
  const v=assignmentDiagnosticView,{model,entries,language}=v,t=EXISTING_REPORT_TEXT[language],e=escapeHtml,tr=(fr,en)=>language==='en'?en:fr;
  const normal=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const filtered=entries.filter(c=>(!model.endpointsOnly||!model.endpointKnown||c.ids.length>0&&c.ids.every(id=>model.byId.get(id)?.hasEndpoint))&&(!model.deadheadOnly||!model.deadheadKnown||c.ids.length>0&&c.ids.every(id=>model.byId.get(id)?.hasDeadhead))&&(assignmentDiagnosticFilter==='all'||c.kind===assignmentDiagnosticFilter)&&normal(c.search).includes(normal(assignmentDiagnosticQuery)));
  const labels={distantStop:t.categories.distantStop,all:tr('Tous les cas','All cases'),reference:tr('Références éloignées ou suspectes','Distant or suspect references'),grouping:tr('Places proches sans référence commune','Nearby places without a shared reference'),assignment:tr('Stops à rattacher','Stops to attach')};
  return `<h3>${tr('Diagnostic des places et références','Place and reference assessment')}</h3><p>${tr('Références suspectes en premier. Comparaison des affectations actuelles ; aucune modification automatique.','Suspect references first. Current assignments are compared; no automatic changes.')}</p><p>${e(t.radius)} : <b>${model.radius} m</b> · ${e(t.threshold)} : <b>${model.threshold} m</b> · ${e(t.stopThreshold)} : <b>${model.stopPlaceThreshold} m</b> · ${tr('Distances à vol d’oiseau, pas des temps de repositionnement.','Straight-line distances, not repositioning times.')}</p><p class="ad-footnote">${e(model.endpointKnown?(model.endpointsOnly?t.endpointHelp:''):t.endpointUnavailable)}</p><div class="ad-controls"><label>${tr('Afficher','Show')}<select data-ad-filter>${Object.entries(labels).map(([id,label])=>`<option value="${id}"${assignmentDiagnosticFilter===id?' selected':''}>${e(label)} (${id==='all'?entries.length:entries.filter(c=>c.kind===id).length})</option>`).join('')}</select></label><label>${e(t.search)}<input type="search" data-ad-search value="${e(assignmentDiagnosticQuery)}"></label><span role="status">${filtered.length} ${e(t.cases)}</span></div><div class="ad-cases">${filtered.map((entry,i)=>assignmentDiagnosticCard(entry,i===0)).join('')||`<p class="notice">${entries.length?e(t.noMatches):tr('Aucun cas détecté avec les données et seuils actuels. Cela ne remplace pas une validation opérationnelle.','No cases detected with the current data and thresholds. This does not replace operational validation.')}</p>`}</div>`;
}
function assignmentDiagnosticCard(entry,open,contentOnly=false){
  const v=assignmentDiagnosticView,{model,language}=v,t=EXISTING_REPORT_TEXT[language],e=escapeHtml,tr=(fr,en)=>language==='en'?en:fr,{row,places}=entry;
  const badge=id=>existingReportPlaceBadge(model.byId.get(id)||{code:id,description:'',isReference:model.referenceIds.has(id),attachedCodes:[...(model.referenceChildren.get(id)||[])]},t);
  const distance=row.distance_m!==''&&row.distance_m!=null&&Number.isFinite(Number(row.distance_m))?Number(row.distance_m):null;
  const title=entry.ids.map(badge).join(' ↔ ')+(entry.kind==='assignment'?` ← <span class="ad-stop-title">Stop ID: <b>${e(row.stop_id)}</b><small>${e(row.stop_description)}</small></span>`:'');
  const summary=`<summary><span class="ad-category ${entry.kind}">${e(t.categories[entry.category])}</span><span class="ad-identities">${title}</span><strong class="ad-distance">${distance===null?e(t.missing):distance+' m'}</strong></summary>`;
  if(!open)return `<details class="ad-card" data-ad-case="${entry.id}">${summary}<div class="ad-content" data-ad-deferred></div></details>`;
  const count=places.reduce((n,p)=>n+p.stops.length,0),tp=places.reduce((n,p)=>n+p.stops.filter(s=>s.timing===true).length,0);
  const missing=places.reduce((n,p)=>n+p.stops.filter(s=>s.lat===null||s.lon===null).length,0);
  const endpoints=places.reduce((n,p)=>n+p.stops.filter(s=>s.endpoint).length,0);
  const refs=places.map(p=>`<div>${badge(p.code)}<span> ${e(t.referencePlace)} : </span>${p.references.length?p.references.map(badge).join(' '):`<span>${e(t.noReference)}</span>`}</div>`).join('');
  const fact=(label,value)=>`<div><small>${e(label)}</small><strong>${e(value)}</strong></div>`;
  const status=s=>s.timing===true?t.tp:s.timing===false?t.nonTp:t.unknownTp;
  const coords=s=>s.lat===null||s.lon===null?t.missing:s.lat.toFixed(6)+', '+s.lon.toFixed(6);
  const rows=places.flatMap(p=>p.stops.map(s=>`<tr><td>${badge(p.code)}</td><td>${e(s.id)}</td><td>${e(s.description)}</td><td><span class="ad-tp ${s.timing===true?'tp':s.timing===false?'non-tp':'unknown'}">${e(status(s))}</span></td><td>${e(coords(s))}</td><td>${s.placeDistance==null?e(t.missing):Math.round(s.placeDistance)+' m'}${s.distant?' · ⚠':''}</td></tr>`)).join('');
  const advice=t.advice[entry.category]+(entry.kind==='grouping'?' '+tr('Vérifier les côtés de rue, les accès et les manœuvres de retournement avant de regrouper.','Check street sides, access and turning movements before grouping.'):'')+(entry.kind==='reference'&&distance!==null&&distance>model.threshold?' '+tr('Dépassement du seuil : ','Threshold exceeded by: ')+(distance-model.threshold)+' m.':'');
  const content=`<div class="ad-content">${existingReportDeadheadHtml(places,model,t)}<div class="ad-facts">${fact(t.distance,distance===null?t.missing:distance+' m')}${fact(entry.kind==='distantStop'?t.stopThreshold:entry.kind==='reference'?t.threshold:t.radius,(entry.kind==='distantStop'?model.stopPlaceThreshold:entry.kind==='reference'?model.threshold:model.radius)+' m')}${fact(t.stops,count)}${fact(tr('TP / non TP / inconnu','TP / non-TP / unknown'),tp+' / '+places.reduce((n,p)=>n+p.stops.filter(s=>s.timing===false).length,0)+' / '+places.reduce((n,p)=>n+p.stops.filter(s=>s.timing===null).length,0))}${fact(tr('Débuts / fins identifiés','Identified trip endpoints'),endpoints)}</div><p class="ad-advice"><b>${e(t.recommendation)}</b> — ${e(advice)}</p>${endpoints?`<p class="ad-warning">${tr('Débuts ou fins de voyage présents : le repositionnement doit être vérifié.','Trip endpoints present: repositioning needs review.')}</p>`:''}${row.anomaly==='REFERENCE_INTROUVABLE'?`<p class="ad-warning">${e(t.categories.missingReference)} : ${e(row.reference_place_id)}. ${tr('Ne pas inventer une position pour cette référence.','No position is invented for this reference.')}</p>`:''}${missing?`<p class="ad-warning">${missing} ${tr('stop(s) sans coordonnées : conservés dans la liste, absents de la carte.','stop(s) without coordinates: retained in the list, absent from the map.')}</p>`:''}<p class="ad-footnote">${e(t.centreHelp)}</p><div class="ad-refs">${refs}</div><div class="ad-map" data-ad-map="${entry.id}"></div><details class="ad-stop-list"><summary>${e(t.stops)} (${count})</summary><div class="ad-table-wrap"><table><thead><tr><th>${e(t.placeCode)}</th><th>Stop ID</th><th>${e(t.description)}</th><th>${e(t.timing)}</th><th>${e(t.coordinates)}</th><th>${e(t.stopDistance)}</th></tr></thead><tbody>${rows||`<tr><td colspan="6">${e(t.noStops)}</td></tr>`}</tbody></table></div></details><p class="ad-footnote">${tr('Le statut TP dépend de la source d’analyse. Les débuts/fins indiqués sont ceux identifiés dans les données disponibles, pas une preuve d’absence pour les autres stops.','TP status depends on the analysis source. Trip endpoints are those identified in available data; other stops are not proven to be intermediate stops.')}</p></div>`;
  return contentOnly?content:`<details class="ad-card" data-ad-case="${entry.id}" open>${summary}${content}</details>`;
}
function assignmentDiagnosticMapHtml(entry){
  const v=assignmentDiagnosticView,extra=[];
  if(entry.kind==='assignment'){
    const stop=[...v.model.places.flatMap(p=>p.decisions),...v.model.unresolved].find(s=>s.id===entry.row.stop_id||s.originalId===entry.row.stop_id);
    if(stop)extra.push(stop);
  }
  const points=existingReportMapPoints(entry.places,extra,v.model),a=points.find(p=>p.kind==='place'&&p.id===entry.row.place_a_id);
  if(a&&entry.kind==='grouping')a.distanceTargets=[entry.row.place_b_id];
  // Application map is explanatory; report-only popup handlers are not mounted here.
  return existingReportMap(points,null,EXISTING_REPORT_TEXT[v.language]).replace(/ role="button" tabindex="0"/g,'').replace(/ data-map-place="[^"]*"/g,'').replace(/(<g class="place-map-label"[^>]*?) aria-label="[^"]*"/g,'$1');
}
function activateAssignmentDiagnostics(){
  const root=document.getElementById('assignment-diagnostics');if(!root||!assignmentDiagnosticView)return;
  const load=details=>{
    if(!details.open)return;
    const entry=assignmentDiagnosticView.entries[Number(details.dataset.adCase)];if(!entry)return;
    const deferred=details.querySelector('[data-ad-deferred]');if(deferred)deferred.outerHTML=assignmentDiagnosticCard(entry,true,true);
    const host=details.querySelector('[data-ad-map]');if(host&&!host.childNodes.length)host.innerHTML=assignmentDiagnosticMapHtml(entry);
  };
  root.querySelectorAll('[data-ad-case]').forEach(details=>{details.addEventListener('toggle',()=>load(details));load(details);});
  root.querySelector('[data-ad-filter]').onchange=event=>{assignmentDiagnosticFilter=event.target.value;refreshAssignmentDiagnostics();};
  const search=root.querySelector('[data-ad-search]');
  search.oninput=()=>{assignmentDiagnosticQuery=search.value;refreshAssignmentDiagnostics();root.querySelector('[data-ad-search]').focus();};
}
function refreshAssignmentDiagnostics(){
  const root=document.getElementById('assignment-diagnostics');if(!root||!assignmentDiagnosticView)return;
  assignmentDiagnosticView.language=document.documentElement.lang==='en'?'en':'fr';
  root.innerHTML=assignmentDiagnosticContent();activateAssignmentDiagnostics();
}
