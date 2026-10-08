"use strict";

// Read-only HASTUS diagnostic. Keep original associations separate from proposals.
function existingClientReportModel(source){
  const clean=value=>String(value??"").trim(),stopKey=value=>clean(value).replace(/^:/,""),byId=new Map();
  const matchKey=value=>stopKey(value).toUpperCase(),timingKnown=source.timingPointIds!=null;
  const timingIds=new Set([...(source.timingPointIds||[])].map(matchKey)),timingAliases=new Map();
  // HASTUS can be joined by stop_code rather than GTFS stop_id. Never use proximity
  // or place membership to infer TP status: a place can contain both types.
  for(const s of source.gtfsStops||source.parsed?.stops?.rows||[]){
    const timed=timingIds.has(matchKey(s.stop_id));
    for(const id of [s.stop_id,...(source.associationKey==='stop_code'?[s.stop_code]:[])])if(clean(id))timingAliases.set(matchKey(id),Boolean(timingAliases.get(matchKey(id)))||timed);
  }
  for(const d of source.decisions||[])if(timingIds.has(matchKey(d.originalId||d.id)))timingAliases.set(matchKey(d.id),true);
  const timing=id=>!timingKnown?null:timingIds.has(matchKey(id))||timingAliases.get(matchKey(id))===true;
  const coordinate=(lat,lon)=>clean(lat)!==""&&clean(lon)!==""&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lon))<=180;
  function place(id,description=""){
    id=clean(id);if(!id)return null;
    if(!byId.has(id))byId.set(id,{id,code:id,description:clean(description)||id,lat:null,lon:null,stops:[],references:[],tags:[],anomalies:[],suggestions:[],decisions:[],unused:[],proposed:false});
    return byId.get(id);
  }
  function addStop(p,stop){
    if(!p)return;const id=stopKey(stop.id),hasCoord=coordinate(stop.lat,stop.lon);
    if(p.stops.some(row=>row.id===id))return;
    p.stops.push({id,description:clean(stop.description),timing:timing(id),lat:hasCoord?Number(stop.lat):null,lon:hasCoord?Number(stop.lon):null});
  }
  function tag(p,value){if(p&&!p.tags.includes(value))p.tags.push(value);}
  for(const item of source.places||[]){
    const p=place(item.id,item.description);if(!p)continue;
    if(coordinate(item.lat,item.lon)){p.lat=Number(item.lat);p.lon=Number(item.lon);}
    p.references=[...new Set([...(item.referenceIds||[]),...clean(item.referenceId).split(';')].map(clean).filter(Boolean))];
    for(const point of item.points||[])addStop(p,point);
  }
  // Retain places/stops omitted by spatial analysis because coordinates are missing.
  const m=source.mapping||{};
  for(const row of source.parsed?.hastus?.rows||[]){
    const p=place(row[m.placeId],row[m.placeDesc]);if(!p)continue;
    addStop(p,{id:row[m.stopId],description:row[m.stopDesc],lat:row[m.lat],lon:row[m.lon]});
    for(const ref of clean(row[m.referenceId]).split(';').map(clean).filter(Boolean))if(!p.references.includes(ref))p.references.push(ref);
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
      status:d.status,error:clean(d.error),isNew:d.choice==="__new__",timing:timing(d.originalId||d.id)};
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
  const referenceIds=new Set([...places.flatMap(p=>p.references),...anomalies.map(a=>clean(a.reference_place_id))].filter(Boolean));
  const referenceChildren=new Map();
  for(const p of places)for(const ref of p.references)if(ref!==p.code){
    if(!referenceChildren.has(ref))referenceChildren.set(ref,new Set());
    referenceChildren.get(ref).add(p.code);
  }
  for(const p of places){
    p.isReference=referenceIds.has(p.code);
    p.attachedCodes=[...(referenceChildren.get(p.code)||[])].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
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
  return {places,anomalies,unresolved,priority,byId,referenceIds,referenceChildren,radius:source.radius??300,threshold:source.threshold??500,timingKnown,timingSource:source.timingPointSource||'gtfs',timingInferred:Boolean(source.timepointFallback)};
}

const EXISTING_REPORT_TEXT={
  fr:{title:"Diagnostic des places et références HASTUS",intro:"Références suspectes en premier, puis places classées par type de validation et par code. Une place peut porter plusieurs alertes ; elle n’est comptée qu’une seule fois.",
    note:"Données sources en consultation seule ; les validations et notes sont consignées séparément : les affectations actuelles et les propositions sont distinctes. Aucune correction n’est appliquée au GTFS ni à HASTUS. « Sans intervention détectée » ne remplace pas une validation métier.",
    categories:{distantReference:"Références trop éloignées",missingReference:"Références introuvables",data:"Données à compléter",grouping:"Regroupements à valider",assignment:"Affectations à valider",creation:"Places à créer",unused:"Stops non TP à vérifier",none:"Sans intervention détectée"},
    all:"Tous les types",review:"Décision requise",search:"Rechercher une place, une référence ou un stop",allCases:"Tout le diagnostic",refs:"Références suspectes",places:"Places",issues:"Stops sans diagnostic complet",summary:"Sommaire cliquable",type:"Type de validation",code:"Code / référence",description:"Description",stops:"Stops actuellement associés",stop:"Stop",current:"Place actuelle",proposed:"Place proposée",newPlace:"Nouvelle place proposée",unchanged:"Affectation actuelle conservée",unassigned:"Sans place",proposal:"Propositions d’affectation (non appliquées)",recommendation:"Recommandation",reference:"Référence",distance:"Distance à vol d’oiseau",threshold:"Seuil d’alerte",radius:"Rayon de proximité",coordinates:"Coordonnées",unavailable:"Coordonnées insuffisantes pour cette carte.",noStops:"Aucun stop actuellement associé dans l’export fourni.",noMatches:"Aucun cas ne correspond aux filtres.",previous:"Précédent",next:"Suivant",page:"Page",cases:"cas",back:"Retour au sommaire",open:"Afficher la fiche",origin:"Données HASTUS chargées · état à la génération",noTP:"Stop non TP dans la source choisie",absent:"Absent des versions de routes",missing:"Non disponible",map:"Carte des places et des stops",legend:"● Centre de place · petits cercles : stops physiques · violet : proposition non appliquée",offline:"Cartes fixes intégrées, consultables hors ligne.",online:"Fonds OpenStreetMap en ligne ; connexion requise. Zoom et déplacement bloqués.",basemapMissing:"Fond OSM non disponible dans ce secteur ; seuls les repères sont affichés.",
    advice:{distantReference:"Vérifier le trajet réel de repositionnement et revoir la référence commune si le regroupement n’est pas justifié.",missingReference:"Vérifier l’identifiant de référence et l’exhaustivité de l’export avant de corriger ou de créer une référence.",data:"Compléter les coordonnées ou les associations manquantes avant de conclure.",grouping:"Évaluer une référence commune. Conserver des places distinctes lorsque l’orientation ou le repositionnement l’exige.",assignment:"Confirmer l’affectation proposée en tenant compte de la position physique et des débuts/fins de voyage.",creation:"Valider le code, la description et les stops de la nouvelle place proposée.",unused:"Vérifier si la place reste nécessaire, notamment pour les extrémités de voyages. Ne pas supprimer automatiquement.",none:"Conserver les associations actuelles sous réserve de la validation métier."}},
  en:{title:"HASTUS place and reference assessment",intro:"Suspect references first, followed by places grouped by validation type and sorted by code. A place may have several alerts but is counted only once.",
    note:"Read-only source data; approvals and notes are logged separately: current assignments and proposals are kept separate. No changes are applied to the GTFS or HASTUS. “No intervention detected” does not replace operational review.",
    categories:{distantReference:"Distant references",missingReference:"Missing references",data:"Incomplete data",grouping:"Groupings to validate",assignment:"Assignments to validate",creation:"Places to create",unused:"Non-timing-point stops to review",none:"No intervention detected"},
    all:"All types",review:"Decision required",search:"Search for a place, reference or stop",allCases:"Full assessment",refs:"Suspect references",places:"Places",issues:"Stops with incomplete assessment",summary:"Clickable overview",type:"Validation type",code:"Code / reference",description:"Description",stops:"Currently assigned stops",stop:"Stop",current:"Current place",proposed:"Proposed place",newPlace:"Proposed new place",unchanged:"Current assignment retained",unassigned:"No place",proposal:"Assignment proposals (not applied)",recommendation:"Recommendation",reference:"Reference",distance:"Straight-line distance",threshold:"Alert threshold",radius:"Proximity radius",coordinates:"Coordinates",unavailable:"Insufficient coordinates for this map.",noStops:"No currently assigned stops in the supplied export.",noMatches:"No cases match these filters.",previous:"Previous",next:"Next",page:"Page",cases:"cases",back:"Back to overview",open:"Open details",origin:"Loaded HASTUS data · snapshot at generation",noTP:"Not a timing point in the selected source",absent:"Absent from route versions",missing:"Not available",map:"Place and stop map",legend:"● Place centre · small circles: physical stops · purple: unapplied proposal",offline:"Embedded fixed maps, available offline.",online:"Online OpenStreetMap backgrounds require Internet. Zoom and pan are disabled.",basemapMissing:"No OSM background available in this area; markers only.",
    advice:{distantReference:"Check the actual repositioning movement and review the shared reference if the grouping is not operationally justified.",missingReference:"Check the reference identifier and export completeness before correcting or creating a reference.",data:"Complete missing coordinates or assignments before drawing conclusions.",grouping:"Consider a common reference. Keep distinct places when orientation or repositioning requires it.",assignment:"Confirm the proposed assignment using the physical stop location and trip start/end requirements.",creation:"Validate the proposed place code, description and associated stops.",unused:"Check whether the place is still required, particularly at trip endpoints. Do not delete automatically.",none:"Retain current assignments, subject to operational validation."}}
};

Object.assign(EXISTING_REPORT_TEXT.fr,{
  shortRef:'Réf.',referenceRole:'Référence',attachedPlaces:'Rattachées',referenceReview:'Référence à vérifier',
  stopScope:'Stops à afficher',allStops:'Tous les stops',tpOnly:'Timing points uniquement',noTpStops:'Aucun stop confirmé TP actuellement associé à cette place.',tpScope:'Filtre TP actif : seuls les stops confirmés TP sont affichés et exportés. Les places, références, catégories et compteurs du diagnostic initial sont conservés ; l’analyse géographique n’est pas recalculée.',
  placeCode:'Place',stopId:'Stop ID',referencePlace:'Place de référence',noReference:'Non renseignée',timing:'Statut TP',tp:'TP',nonTp:'Non TP',unknownTp:'TP inconnu',timingSource:'Source du statut TP',variants:'Versions de routes HASTUS',gtfs:'GTFS',inferred:'TP déduits des heures de passage selon les réglages de l’analyse',unknownSource:'Statut TP indisponible dans cette analyse',
  legend:'■ Centre de place · ● Bleu : TP · ● Orange : non TP · ● Gris : statut TP inconnu · contour violet : proposition non appliquée · pointillés : rattachements existants à une référence',
  guide:'Petit guide',csv:'Exporter CSV',print:'Imprimer / PDF',exportScope:'Les exports couvrent tous les résultats des filtres, pas seulement la page affichée.',printWait:'Préparation de toutes les fiches filtrées…',printReady:'Aperçu prêt. Dans la fenêtre d’impression, choisir « Enregistrer au format PDF ». Vérifier le chargement des cartes en ligne avant de confirmer.',printFailed:'Impossible de préparer l’impression.',close:'Fermer',
  guideTitle:'Lire le diagnostic HASTUS',guideSteps:['Filtrer par type de cas ou rechercher une place, une référence ou un stop. Le sommaire permet d’ouvrir chaque fiche.','Chaque fiche distingue le code dans une étiquette et la description en gras, puis indique sa place de référence et les stops actuellement associés. Les propositions restent séparées et ne modifient pas les données.','TP signifie point horaire dans la source d’analyse choisie. Bleu : TP ; orange : non TP ; gris : inconnu. Un stop peut être TP sur certains voyages seulement.','Les carrés représentent les centres de place ; les cercles représentent les coordonnées physiques des stops. Le contour violet indique une proposition.','Exporter CSV couvre tous les résultats filtrés. Imprimer / PDF ouvre toutes les fiches filtrées dans un aperçu distinct : choisir ensuite Enregistrer au format PDF. Les cartes en ligne demandent une connexion ; les cartes fixes restent disponibles hors ligne.']
});
Object.assign(EXISTING_REPORT_TEXT.en,{
  shortRef:'Ref.',referenceRole:'Reference',attachedPlaces:'Attached places',referenceReview:'Reference to review',
  stopScope:'Stops to display',allStops:'All stops',tpOnly:'Timing points only',noTpStops:'No confirmed timing-point stop is currently assigned to this place.',tpScope:'TP filter active: only confirmed timing-point stops are displayed and exported. Places, references, categories and totals from the original assessment are retained; the spatial analysis is not recalculated.',
  placeCode:'Place',stopId:'Stop ID',referencePlace:'Reference place',noReference:'Not provided',timing:'TP status',tp:'TP',nonTp:'Non-TP',unknownTp:'Unknown TP',timingSource:'TP status source',variants:'HASTUS route versions',gtfs:'GTFS',inferred:'TPs inferred from passing times using the analysis settings',unknownSource:'TP status unavailable in this assessment',
  legend:'■ Place centre · ● Blue: TP · ● Orange: non-TP · ● Grey: unknown TP status · purple outline: unapplied proposal · dotted lines: existing reference assignments',
  guide:'Quick guide',csv:'Export CSV',print:'Print / PDF',exportScope:'Exports include all filtered results, not just the displayed page.',printWait:'Preparing all filtered records…',printReady:'Preview ready. Choose “Save as PDF” in the print dialog. Check that online maps have loaded before confirming.',printFailed:'Could not prepare printing.',close:'Close',
  guideTitle:'Reading the HASTUS assessment',guideSteps:['Filter by case type or search for a place, reference or stop. Open a record from the overview.','Each record distinguishes the code in a badge and the description in bold, then identifies the reference place and currently assigned stops. Proposals remain separate and do not change the data.','TP means timing point in the selected analysis source. Blue: TP; orange: non-TP; grey: unknown. A stop can be a timing point on only some trips.','Squares are place centres; circles use physical stop coordinates. A purple outline marks an unapplied proposal.','Export CSV includes all filtered results. Print / PDF opens all filtered records in a separate preview: then choose Save as PDF. Online maps require a connection; embedded fixed maps remain available offline.']
});

function existingReportPlaceLabelParts(p){
  const code=p.code??p.id,refs=[...new Set(p.references||[])].filter(id=>id!==code).sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
  const attached=p.attachedCodes||[],isReference=Boolean(p.isReference||attached.length);
  return {code,refs,attached,isReference};
}
function existingReportPlaceCode(p,t=EXISTING_REPORT_TEXT.fr){
  const {code,refs,attached,isReference}=existingReportPlaceLabelParts(p);
  return code+(isReference?' · '+t.referenceRole:refs.length?' | '+t.shortRef+' '+refs.join(', '):'')+(attached.length?' — '+t.attachedPlaces+' : '+attached.join(' · '):'')+(isReference&&refs.length?' — '+t.referenceReview+' : '+refs.join(', '):'');
}
function existingReportPlaceBadge(p,t){
  const {code,refs,attached,isReference}=existingReportPlaceLabelParts(p),e=escapeHtml;
  const relation=!isReference&&refs.length?`<span class="code-relation">${e(t.shortRef)} <span class="reference-chip">${e(refs.join(', '))}</span></span>`:'';
  const children=attached.length?`<span class="code-detail">${e(t.attachedPlaces)} : <span class="code-children">${e(attached.join(' · '))}</span></span>`:'';
  // Preserve unexpected source chains, but do not present them as a normal role.
  const review=isReference&&refs.length?`<span class="code-detail code-review">${e(t.referenceReview)} : ${e(refs.join(', '))}</span>`:'';
  const stopIds=[...new Set((p.stops||[]).map(s=>String(s.id)))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
  const stops=stopIds.length?`<span class="code-stops" title="${e('Stops : '+stopIds.join(' · '))}">Stops : ${e(stopIds.slice(0,6).join(' · '))}${stopIds.length>6?' · +'+(stopIds.length-6):''}</span>`:'';
  return `<span class="place-code${isReference?' reference-code':''}"><span class="code-heading"><b class="code-main">${e(code)}</b>${isReference?`<span class="code-role">${e(t.referenceRole)}</span>`:relation}</span>${children}${review}${stops}</span>`;
}

function existingReportMapPoints(places,extra=[],model=null){
  const result=[];
  const seen=new Set();
  const addCentre=p=>{
    if(!p||seen.has(p.code)||p.lat===null||p.lon===null)return;seen.add(p.code);
    result.push({id:p.code,description:p.description,lat:p.lat,lon:p.lon,kind:"place",isReference:Boolean(p.isReference),references:p.references,attachedCodes:p.attachedCodes});
  };
  for(const p of places){
    addCentre(p);
    for(const s of p.stops)if(s.lat!==null&&s.lon!==null)result.push({...s,kind:"stop",placeId:p.code});
  }
  // Show directly related centres, without adding unrelated stops or inventing
  // positions for absent references. Do not recursively traverse cycles.
  if(model)for(const p of places)for(const id of [...p.references,...p.attachedCodes])addCentre(model.byId.get(id));
  for(const s of extra)if(s.lat!==null&&s.lon!==null)result.push({...s,kind:"proposal"});
  return result;
}
function existingReportMapGeometry(points){
  if(!points.length)return null;const width=1000,height=430,pad=52;
  // A closer view for small groups, with space retained for labels and context.
  const distinct=points.some(p=>p.lat!==points[0].lat||p.lon!==points[0].lon),maxZoom=distinct?19:18;
  let zoom=1,bounds;
  for(let z=maxZoom;z>=1;z--){
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
  const centres=points.filter(p=>p.kind==='place'),centreById=new Map(centres.map(p=>[p.id,p])),edges=new Set();
  const relations=centres.flatMap(p=>(p.references||[]).map(id=>{
    const ref=centreById.get(id),key=JSON.stringify([p.id,id].sort());
    if(!ref||id===p.id||edges.has(key))return '';edges.add(key);
    const a=project(ref),b=project(p);
    return `<line class="reference-relation" data-reference="${escapeHtml(id)}" data-place="${escapeHtml(p.id)}" x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="#80629f" stroke-width="2" stroke-dasharray="3 5"/>`;
  })).join('');
  const labelBoxes=[];
  const markers=relations+[...points.filter(p=>p.kind!=='place'),...centres].map((p,i)=>{
    const {x,y}=project(p),place=p.kind==="place",left=x>width-250,status=p.timing===true?'tp':p.timing===false?'non-tp':'unknown-tp';
    const label=place?existingReportPlaceCode(p,t):t.stopId+': '+p.id+' · '+(p.timing===true?t.tp:p.timing===false?t.nonTp:t.unknownTp);
    const shape=place?`<rect x="${(x-8).toFixed(2)}" y="${(y-8).toFixed(2)}" width="16" height="16"/>`:`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="6"/>`;
    let tx=x+(left?-14:14),ty=y+(place?-14:14+(i%2)*12),anchor=left?'end':'start',badge='',labelText='';
    if(place){
      const parts=existingReportPlaceLabelParts(p),refText=parts.refs.join(', '),inlineRef=!parts.isReference&&refText.length>0&&refText.length<=30;
      const detailTexts=[];
      if(parts.attached.length)detailTexts.push(t.attachedPlaces+' : '+parts.attached.join(' · '));
      if(parts.isReference&&parts.refs.length)detailTexts.push(t.referenceReview+' : '+refText);
      if(!parts.isReference&&refText&&!inlineRef)detailTexts.push(t.shortRef+' '+refText);
      const stopIds=[...new Set(points.filter(s=>s.kind==='stop'&&s.placeId===p.id).map(s=>s.id))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
      if(stopIds.length)detailTexts.push('Stops : '+stopIds.slice(0,6).join(' · ')+(stopIds.length>6?' · +'+(stopIds.length-6):''));
      const lines=detailTexts.flatMap(s=>s.match(/.{1,48}(?:\s|$)|.{1,48}/g).map(s=>s.trim()));
      const codeWidth=String(parts.code).length*8.5,roleWidth=parts.isReference?t.referenceRole.length*7+16:inlineRef?t.shortRef.length*7+refText.length*8+38:0;
      const labelWidth=Math.max(codeWidth+roleWidth,...lines.map(s=>s.length*7))+20,labelHeight=30+lines.length*17;
      const candidates=[-34,14,-64,44,-94,74].flatMap(dy=>[left?x-labelWidth-14:x+14,left?x+14:x-labelWidth-14].map(bx=>({x:Math.max(8,Math.min(width-labelWidth-8,bx)),y:Math.max(8,Math.min(height-labelHeight-28,y+dy)),w:labelWidth,h:labelHeight})));
      const overlaps=b=>labelBoxes.reduce((n,a)=>n+(b.x<a.x+a.w+4&&b.x+b.w+4>a.x&&b.y<a.y+a.h+4&&b.y+b.h+4>a.y?1:0),0);
      const box=candidates.reduce((best,b)=>overlaps(b)<overlaps(best)?b:best,candidates[0]);labelBoxes.push(box);
      tx=box.x+10;ty=box.y+20;anchor='start';
      badge=`<line class="label-leader" x1="${x.toFixed(2)}" y1="${y.toFixed(2)}" x2="${Math.max(box.x,Math.min(box.x+box.w,x)).toFixed(2)}" y2="${Math.max(box.y,Math.min(box.y+box.h,y)).toFixed(2)}" stroke="#63705e" stroke-width="1"/><rect class="${p.isReference?'reference-label':'place-label'}" x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w}" height="${box.h}" rx="4"/>`;
      labelText=`<text class="map-code-main" x="${tx.toFixed(2)}" y="${ty.toFixed(2)}">${escapeHtml(parts.code)}</text>`;
      const sx=tx+codeWidth+12;
      if(parts.isReference)labelText+=`<text class="map-code-role" x="${sx.toFixed(2)}" y="${ty.toFixed(2)}">${escapeHtml(t.referenceRole)}</text>`;
      else if(inlineRef){
        const chipX=sx+t.shortRef.length*7+6,chipWidth=refText.length*8+10;
        labelText+=`<line x1="${(sx-6).toFixed(2)}" x2="${(sx-6).toFixed(2)}" y1="${(ty-13).toFixed(2)}" y2="${(ty+3).toFixed(2)}" stroke="#aab6a4"/><text class="map-code-role" x="${sx.toFixed(2)}" y="${ty.toFixed(2)}">${escapeHtml(t.shortRef)}</text><rect class="map-reference-chip" x="${chipX.toFixed(2)}" y="${(ty-15).toFixed(2)}" width="${chipWidth}" height="20" rx="3"/><text class="map-reference-code" x="${(chipX+5).toFixed(2)}" y="${ty.toFixed(2)}">${escapeHtml(refText)}</text>`;
      }
      labelText+=lines.map((s,i)=>`<text class="map-code-detail" x="${tx.toFixed(2)}" y="${(ty+17*(i+1)).toFixed(2)}">${escapeHtml(s)}</text>`).join('');
    }
    return `<g class="marker ${p.kind} ${place?(p.isReference?'reference-marker':''):status}"><title>${escapeHtml(label+' · '+p.description)}</title>${shape}${badge}${place?labelText:`<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" text-anchor="${anchor}">${escapeHtml(label)}</text>`}</g>`;
  }).join('');
  return `<div class="map-stage">${offline?'':background}<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t.map)}">${offline?background:''}${markers}<text x="990" y="419" text-anchor="end" class="credit">© OpenStreetMap contributors · ODbL</text></svg></div><p class="legend">${escapeHtml(t.legend)}</p>${missing?`<p class="notice">${escapeHtml(t.basemapMissing)}</p>`:''}`;
}

function existingClientReportCases(model,language){
  const t=EXISTING_REPORT_TEXT[language],e=escapeHtml,cases=[];
  const coords=p=>p.lat===null?t.missing:`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
  const placeInfo=id=>model.byId.get(id)||{code:id,isReference:model.referenceIds.has(id),attachedCodes:[...(model.referenceChildren.get(id)||[])].sort((a,b)=>a.localeCompare(b,language,{numeric:true}))};
  const placeLabel=id=>id?existingReportPlaceBadge(placeInfo(id),t):e(t.unassigned);
  const identity=p=>`${placeLabel(p.code)}${p.description?` <strong class="place-description">${e(p.description)}</strong>`:''}`;
  const link=p=>`<a href="#${p.anchor}" data-case-link="${p.anchor}">${identity(p)}</a>`;
  const titlePlace=p=>existingReportPlaceCode(p,t)+(p.description?' · '+p.description:'');
  const referenceMembers=row=>{
    const pair=[...new Set([row.place_a_id,row.place_b_id].filter(Boolean))];
    return {pair,reference:pair.includes(row.reference_place_id)?'':row.reference_place_id};
  };
  const referenceHeading=(row,format)=>{
    const {pair,reference}=referenceMembers(row);
    return (reference?format(reference)+(pair.length?' · ':''):'')+pair.map(format).join(' ↔ ');
  };
  const timingLabel=s=>s.timing===true?t.tp:s.timing===false?t.nonTp:t.unknownTp;
  const references=p=>p.references.length?p.references.map(id=>model.byId.has(id)?link(model.byId.get(id)):placeLabel(id)).join('; '):e(t.noReference);
  const table=(headers,rows)=>`<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const stopTable=places=>table([t.placeCode,t.referencePlace,t.stopId,t.description,t.timing,t.coordinates],places.flatMap(p=>p.stops.map(s=>`<tr><td>${placeLabel(p.code)}</td><td>${references(p)}</td><td>${e(t.stopId)}: ${e(s.id)}</td><td>${e(s.description)}</td><td>${e(timingLabel(s))}</td><td>${e(coords(s))}</td></tr>`)));
  for(const row of model.anomalies){
    const places=[...new Set([row.place_a_id,row.place_b_id,row.reference_place_id])].map(id=>model.byId.get(id)).filter(Boolean),category=row.anomaly==="REFERENCE_INTROUVABLE"?"missingReference":"distantReference";
    const html=`<p>${referenceHeading(row,id=>model.byId.has(id)?link(model.byId.get(id)):placeLabel(id))}</p><p>${e(t.distance)} : ${row.distance_m===""||row.distance_m==null?e(t.missing):e(row.distance_m)+' m'} · ${e(t.threshold)} : ${model.threshold} m</p><p class="notice">${e(t.advice[category])}</p><h3>${e(t.stops)}</h3>${stopTable(places)}`;
    const title=referenceHeading(row,id=>titlePlace(placeInfo(id)));
    const titleHtml=referenceHeading(row,id=>identity(placeInfo(id)));
    cases.push({id:row.anchor,kind:"reference",code:row.reference_place_id,title,titleHtml,tags:[category],html,points:existingReportMapPoints(places,[],model),search:[row.reference_place_id,...places.flatMap(p=>[p.code,p.description,...p.stops.flatMap(s=>[s.id,s.description])])].join(' ')});
  }
  for(const p of model.places){
    const extra=p.decisions.filter(d=>d.target===p.id&&d.original!==p.id),alerts=p.tags.map(tag=>`<p class="notice"><b>${e(t.categories[tag])}</b> — ${e(t.advice[tag])}</p>`).join('');
    const anomalyLinks=p.anomalies.map(a=>`<li><a href="#${a.anchor}" data-case-link="${a.anchor}">${referenceHeading(a,placeLabel)}</a></li>`).join('');
    const suggestions=p.suggestions.map(s=>{const other=model.byId.get(s.place_a_id===p.id?s.place_b_id:s.place_a_id);return `<li>${e(s.entity_type==="STOP_SANS_PLACE"?t.stopId+': '+s.stop_id+' · '+s.stop_description:t.categories.grouping)} ${other?link(other):''} · ${e(s.distance_m)} m</li>`;}).join('');
    const decisions=p.decisions.map(d=>`<tr><td>${e(t.stopId)}: ${e(d.id)}</td><td>${e(d.description)}</td><td>${e(timingLabel(d))}</td><td>${placeLabel(d.original)}</td><td>${placeLabel(d.target)}${d.target===d.original?' · '+e(t.unchanged):d.isNew?' · '+e(t.newPlace):''}</td></tr>`);
    const unused=p.unused.map(s=>`<tr><td>${e(t.stopId)}: ${e(s.stop_id)}</td><td>${e(s.stop_description)}</td><td>${e(s.status==="ABSENT_DES_VERSIONS"?t.absent:t.noTP)}</td></tr>`);
    const html=`<p class="reference-field"><b>${e(t.referencePlace)} :</b> ${references(p)} ${p.proposed?' · '+e(t.newPlace):''}</p>${alerts}${anomalyLinks?`<h3>${e(t.refs)}</h3><ul>${anomalyLinks}</ul>`:''}${suggestions?`<h3>${e(t.categories.grouping)}</h3><ul>${suggestions}</ul>`:''}<h3>${e(t.stops)} (${p.stops.length})</h3>${p.stops.length?stopTable([p]):`<p>${e(t.noStops)}</p>`}${decisions.length?`<h3>${e(t.proposal)}</h3>${table([t.stopId,t.description,t.timing,t.current,t.proposed],decisions)}`:''}${unused.length?`<h3>${e(t.categories.unused)}</h3>${table([t.stopId,t.description,t.type],unused)}`:''}`;
    const neighbors=[...new Set(p.suggestions.filter(s=>s.entity_type==='PLACES_PROCHES').flatMap(s=>[s.place_a_id,s.place_b_id]))].filter(id=>id!==p.id).map(id=>model.byId.get(id)).filter(Boolean);
    neighbors.sort((a,b)=>a.code.localeCompare(b.code,language,{numeric:true}));
    const title=neighbors.length?t.categories.grouping+' — '+titlePlace(p)+' ↔ '+neighbors.map(titlePlace).join(' / '):titlePlace(p);
    const titleHtml=neighbors.length?e(t.categories.grouping)+' — '+identity(p)+' ↔ '+neighbors.map(identity).join(' / '):identity(p);
    cases.push({id:p.anchor,kind:"place",code:p.code,title,titleHtml,tags:p.tags,html,points:existingReportMapPoints([p,...neighbors],extra,model),search:[p.code,p.description,...neighbors.flatMap(n=>[n.code,n.description]),...p.references,...p.stops.flatMap(s=>[s.id,s.description]),...p.decisions.flatMap(d=>[d.id,d.description]),...p.unused.flatMap(s=>[s.stop_id,s.stop_description])].join(' ')});
  }
  for(const [i,d] of model.unresolved.entries())cases.push({id:`issue-${i}`,kind:"issue",code:d.id,title:t.stopId+': '+d.id+' · '+d.description,tags:["data"],html:`<p class="notice">${e(t.advice.data)}</p><p>${e(t.current)} : ${placeLabel(d.original)}</p><p>${e(t.timing)} : ${e(timingLabel(d))}</p>`,points:existingReportMapPoints([], [d]),search:d.id+' '+d.description});
  // One horizontal entry per validation, with matching code/description order.
  for(const c of cases){
    if(c.kind==='issue'){
      const d=model.unresolved[Number(c.id.replace('issue-',''))];
      c.overviewCodesHtml=e(t.stopId)+': '+e(d.id);c.overviewDescriptionsHtml=e(d.description)||'—';continue;
    }
    let ids,reference='';
    if(c.kind==='reference'){
      const a=model.anomalies.find(a=>a.anchor===c.id),members=referenceMembers(a);
      reference=members.reference;ids=members.pair;
    }else{
      const p=model.byId.get(c.code);
      const others=[...new Set(p.suggestions.filter(s=>s.entity_type==='PLACES_PROCHES').flatMap(s=>[s.place_a_id,s.place_b_id]))].filter(id=>id!==p.id&&model.byId.has(id)).sort((a,b)=>a.localeCompare(b,language,{numeric:true}));
      ids=[p.code,...others];
    }
    c.overviewCodesHtml=(reference?placeLabel(reference)+' · ':'')+ids.map(placeLabel).join(' ↔ ');
    c.overviewDescriptionsHtml=(reference?(e(model.byId.get(reference)?.description)||'—')+' · ':'')+ids.map(id=>`<strong class="place-description">${e(model.byId.get(id)?.description)||'—'}</strong>`).join(' ↔ ');
  }
  return cases;
}

function existingReportCsvRows(model,cases,t){
  const status=s=>s.timing===true?t.tp:s.timing===false?t.nonTp:t.unknownTp;
  const source=model.timingKnown?(model.timingSource==='variants'?t.variants:t.gtfs)+(model.timingInferred?' · '+t.inferred:''):t.unknownSource;
  return Object.fromEntries(cases.map(c=>{
    const base={case_id:c.id,case_type:c.kind,validation_types:c.tags.map(tag=>t.categories[tag]).join('; '),record_type:'',place_code:'',place_description:'',reference_place_codes:'',related_place_code:'',stop_id:'',stop_description:'',tp_status:'',tp_source:source,proposed_place_code:'',distance_m:'',latitude:'',longitude:''};
    const forPlace=p=>({...base,place_code:p.code,place_description:p.description,reference_place_codes:p.references.join('; ')});
    const forStop=s=>({stop_id:s.id,stop_description:s.description,tp_status:status(s),latitude:s.lat??'',longitude:s.lon??''});
    const current=p=>p.stops.length?p.stops.map(s=>({...forPlace(p),record_type:'current_assignment',...forStop(s)})):[{...forPlace(p),record_type:'place'}];
    let rows=[];
    if(c.kind==='place'){
      const p=model.places.find(p=>p.anchor===c.id);rows=current(p);
      rows.push(...p.suggestions.map(s=>({...forPlace(p),record_type:'grouping_proposal',related_place_code:(s.place_a_id===p.id?s.place_b_id:s.place_a_id)||'',stop_id:s.stop_id||'',stop_description:s.stop_description||'',distance_m:s.distance_m??''})));
      rows.push(...p.decisions.filter(d=>d.target===p.id&&d.target!==d.original).map(d=>({...forPlace(p),record_type:'proposal_not_applied',...forStop(d),place_code:d.original,place_description:model.byId.get(d.original)?.description||'',reference_place_codes:model.byId.get(d.original)?.references.join('; ')||'',proposed_place_code:d.target})));
    }else if(c.kind==='reference'){
      const a=model.anomalies.find(a=>a.anchor===c.id);
      rows=[...new Set([a.place_a_id,a.place_b_id,a.reference_place_id])].map(id=>model.byId.get(id)).filter(Boolean).flatMap(current).map(row=>({...row,distance_m:a.distance_m??''}));
      rows.unshift({...base,record_type:'reference_anomaly',place_code:a.place_a_id,related_place_code:a.place_b_id||'',reference_place_codes:a.reference_place_id,proposed_place_code:'',distance_m:a.distance_m??''});
    }else{const d=model.unresolved[Number(c.id.replace('issue-',''))];rows=[{...base,record_type:'unresolved',...forStop(d),place_code:d.original}];}
    return [c.id,rows];
  }));
}

function existingReportCsv(rows){
  const headers=['case_id','case_type','validation_types','record_type','place_code','place_description','reference_place_codes','related_place_code','stop_id','stop_description','tp_status','tp_source','proposed_place_code','distance_m','latitude','longitude'];
  // Quote every field, preserve line breaks, and neutralize spreadsheet formulas.
  const cell=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text)&&!(typeof value==='number'))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
  return '\uFEFF'+[headers,...rows.map(row=>headers.map(key=>row[key]??''))].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}

// A report viewing filter, not a new spatial analysis. Keep place/reference
// context and stable anchors, while excluding stops not confirmed as TP.
function existingReportTimingPointView(model,language){
  const key=id=>String(id??'').trim().replace(/^:/,'').toUpperCase();
  const timed=new Set([...model.places.flatMap(p=>[...p.stops,...p.decisions]),...model.unresolved].filter(s=>s.timing===true).map(s=>key(s.id)));
  const places=model.places.map(p=>({...p,stops:p.stops.filter(s=>s.timing===true),decisions:p.decisions.filter(s=>s.timing===true),unused:[],suggestions:p.suggestions.filter(s=>!s.stop_id||timed.has(key(s.stop_id)))}));
  const scoped={...model,places,byId:new Map(places.map(p=>[p.id,p]))};
  const cases=existingClientReportCases(scoped,language).filter(c=>c.kind!=='issue'||model.unresolved[Number(c.id.replace('issue-',''))].timing===true);
  const t=EXISTING_REPORT_TEXT[language];
  for(const c of cases)c.html=`<p class="notice">${escapeHtml(t.tpScope)}</p>`+c.html.replace(escapeHtml(t.noStops),escapeHtml(t.noTpStops));
  return {cases:cases.map(({points,...c})=>c),csvRows:existingReportCsvRows(scoped,cases,t)};
}

// Review decisions are deliberately separate from source assignments/proposals.
function assessmentReviewModel(cases,saved={}){
  const known=new Set(cases.map(c=>c.id)),events=[];
  const clean=value=>({validated:value?.validated===true,note:String(value?.note||'').slice(0,2000)});
  for(const event of Array.isArray(saved.events)?saved.events:[])if(event&&known.has(event.id)&&['all','tp'].includes(event.scope)&&Number.isFinite(Date.parse(event.at)))events.push({id:event.id,scope:event.scope,at:event.at,before:clean(event.before),after:clean(event.after)});
  const values=new Map();for(const event of events)values.set(event.id+'|'+event.scope,event.after);
  const get=(id,scope)=>({...values.get(id+'|'+scope)||{validated:false,note:''}});
  function set(id,scope,value,at=new Date().toISOString()){
    if(!known.has(id)||!['all','tp'].includes(scope))return false;
    const before=get(id,scope),after=clean(value);if(JSON.stringify(before)===JSON.stringify(after))return false;
    events.push({id,scope,at,before,after});values.set(id+'|'+scope,after);return true;
  }
  return {get,set,events,snapshot:()=>({version:1,events:events.map(event=>({...event,before:{...event.before},after:{...event.after}}))})};
}

function mountAssessmentReview(data,api,modelFactory,saverFactory){
  const dialog=document.getElementById('assessment-review');if(!dialog?.dataset?.review)return null;
  const en=document.documentElement.lang==='en',tr=(fr,english)=>en?english:fr,e=api.esc;
  const byId=new Map(data.cases.map(c=>[c.id,c])),storageKey='hastus-assessment-review:'+data.reportId;
  let saved=data.review||{},cacheAvailable=true,dirty=false,active=null,showAll=false,trail=[],returnFocus=null,ownsFullscreen=false,fileSaver=null;
  try{const cached=JSON.parse(localStorage.getItem(storageKey)||'null');if(cached?.events?.length&&(cached.events.at(-1)?.at||'')>(saved.events?.at(-1)?.at||''))saved=cached;}catch{cacheAvailable=false;}
  const model=modelFactory(data.cases,saved),scope=()=>api.tpOnly()?'tp':'all',get=id=>model.get(id,scope());
  dirty=JSON.stringify(model.snapshot().events)!==JSON.stringify(data.review?.events||[]);
  const statusText=value=>value.validated?tr('Validé','Validated'):tr('À valider','Pending');
  const scopeText=value=>value==='tp'?tr('TP uniquement','Timing points only'):tr('Tous les stops','All stops');
  const stamp=at=>new Date(at).toLocaleString(en?'en-CA':'fr-CA');
  const download=(filename,content,type)=>{const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);};
  function persist(){
    dirty=true;data.review=model.snapshot();
    try{localStorage.setItem(storageKey,JSON.stringify(data.review));cacheAvailable=true;}catch{cacheAvailable=false;}
    fileSaver?.changed();journal();
  }
  function journal(){
    const events=model.events;
    document.getElementById('assessment-review-status').textContent=tr('Journal : ','Log: ')+events.length+tr(' événement(s). ',' event(s). ')+(cacheAvailable?tr('Brouillon conservé dans ce navigateur. ','Draft kept in this browser. '):tr('Brouillon navigateur indisponible. ','Browser draft unavailable. '))+tr('Enregistrez le HTML pour transmettre les validations.','Save the HTML to share validations.');
    document.getElementById('assessment-log-body').innerHTML=events.slice().reverse().map(event=>`<tr><td>${e(stamp(event.at))}</td><td><a href="#${e(event.id)}" data-case-link="${e(event.id)}">${e(byId.get(event.id).title)}</a><small>${e(scopeText(event.scope))}</small></td><td>${e(statusText(event.before))}${event.before.note?'<p>'+e(event.before.note)+'</p>':''}</td><td>${e(statusText(event.after))}${event.after.note?'<p>'+e(event.after.note)+'</p>':''}</td></tr>`).join('')||`<tr><td colspan="4">${tr('Aucune validation enregistrée.','No review decisions recorded.')}</td></tr>`;
  }
  function controls(c){const value=get(c.id);return `<div class="assessment-case-tools"><button type="button" data-review-validate="${e(c.id)}" aria-pressed="${value.validated}">${value.validated?'✓ '+tr('Validé · annuler','Validated · undo'):tr('Valider','Validate')}</button><button type="button" data-review-open="${e(c.id)}">⛶ ${tr('Revue plein écran','Full-screen review')}</button><span>${e(scopeText(scope()))}</span><details class="assessment-note"><summary>${tr('Note de décision','Decision note')}</summary><textarea data-review-note="${e(c.id)}" maxlength="2000" aria-label="${tr('Note de décision','Decision note')}">${e(value.note)}</textarea></details></div>`;}
  const eligible=()=>api.filtered().filter(c=>!c.tags.includes('none'));
  const queue=()=>eligible().filter(c=>showAll||!get(c.id).validated);
  let mapResizeObserver=null,mapFitFrame=0;
  function fitReviewMap(){
    mapFitFrame=0;if(!dialog.open)return;
    const frame=document.querySelector('#review-map .review-map-frame'),stage=frame?.querySelector('.map-stage');if(!stage)return;
    const viewBox=stage.querySelector('svg')?.viewBox?.baseVal,ratio=viewBox?.width>0&&viewBox?.height>0?viewBox.width/viewBox.height:1000/430;
    // Measure the actual remaining area, not a guessed fraction of the screen.
    // Keep the complete SVG and online background at the same aspect ratio.
    const available=frame.getBoundingClientRect(),width=Math.max(0,Math.min(available.width,available.height*ratio));
    stage.style.width=width+'px';stage.style.height=width/ratio+'px';
  }
  function scheduleMapFit(){if(mapFitFrame)cancelAnimationFrame(mapFitFrame);mapFitFrame=requestAnimationFrame(fitReviewMap);}
  function prepareReviewMap(){
    mapResizeObserver?.disconnect();
    const host=document.getElementById('review-map'),stage=host.querySelector('.map-stage');if(!stage)return;
    const frame=document.createElement('div'),notes=document.createElement('div');frame.className='review-map-frame';notes.className='review-map-notes';
    frame.append(stage);while(host.firstChild)notes.append(host.firstChild);host.append(frame,notes);
    if(typeof ResizeObserver==='function'){mapResizeObserver=new ResizeObserver(scheduleMapFit);mapResizeObserver.observe(frame);}
    scheduleMapFit();
  }
  window.addEventListener('resize',scheduleMapFit);window.visualViewport?.addEventListener('resize',scheduleMapFit);
  function draw(){
    if(!dialog.open)return;
    const c=api.view().cases.find(c=>c.id===active),items=queue();
    document.getElementById('review-progress').textContent=`${eligible().filter(c=>get(c.id).validated).length} / ${eligible().length} ${tr('validés','validated')} · ${scopeText(scope())}`;
    document.getElementById('review-show-all').textContent=showAll?tr('À traiter','Pending'):tr('Tous les cas','All cases');
    document.getElementById('review-show-all').setAttribute('aria-pressed',String(showAll));
    document.getElementById('review-title').innerHTML=c?(c.titleHtml||e(c.title)):tr('Revue terminée pour cette sélection','Review complete for this selection');
    document.getElementById('review-map').innerHTML=c?api.map(c.id):`<p class="review-complete">✓ ${tr('Tous les cas de cette sélection ont été traités.','All cases in this selection have been reviewed.')}</p>`;
    document.getElementById('review-detail').innerHTML=c?c.html:'';
    const note=document.getElementById('review-note'),validate=document.getElementById('review-validate');
    note.value=c?get(c.id).note:'';note.disabled=!c;validate.disabled=!c;validate.textContent=c&&get(c.id).validated?'✓ '+tr('Validé · annuler','Validated · undo'):tr('Valider','Validate');validate.setAttribute('aria-pressed',String(Boolean(c&&get(c.id).validated)));
    const mapValidate=document.getElementById('review-map-validate');mapValidate.disabled=validate.disabled;mapValidate.textContent=validate.textContent;mapValidate.setAttribute('aria-pressed',validate.getAttribute('aria-pressed'));
    document.getElementById('review-prev').disabled=!items.length||items.findIndex(item=>item.id===active)<=0;
    document.getElementById('review-next').disabled=!items.length||items.findIndex(item=>item.id===active)>=items.length-1;
    document.getElementById('review-return').hidden=!trail.length;
    prepareReviewMap();
  }
  function change(id,value){if(model.set(id,scope(),value)){persist();api.render();}}
  function validate(id,advance=false){
    const items=queue(),index=items.findIndex(c=>c.id===id),old=get(id);
    change(id,{...old,validated:!old.validated});
    if(advance&&!old.validated&&!showAll){active=items[index+1]?.id||queue()[0]?.id||null;trail=[];}
    draw();
  }
  function note(id,text){const old=get(id);if(old.note!==text)change(id,{validated:false,note:text});}
  function step(delta){const items=queue(),i=items.findIndex(c=>c.id===active);active=items[Math.max(0,Math.min(items.length-1,i+delta))]?.id||null;trail=[];draw();}
  function close(){
    mapResizeObserver?.disconnect();if(mapFitFrame)cancelAnimationFrame(mapFitFrame);mapFitFrame=0;
    if(dialog.open)dialog.close();
    if(ownsFullscreen&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});ownsFullscreen=false;
    (returnFocus?.isConnected?returnFocus:document.getElementById('start-assessment-review')).focus();
  }
  function open(id){
    returnFocus=document.activeElement;showAll=Boolean(id&&get(id).validated);active=id||queue()[0]?.id||null;trail=[];
    dialog.showModal();draw();document.getElementById('review-close').focus();
    if(!document.fullscreenElement&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().then(()=>{if(dialog.open)ownsFullscreen=true;else document.exitFullscreen().catch(()=>{});}).catch(()=>{});
  }
  document.getElementById('start-assessment-review').onclick=()=>open();
  document.getElementById('review-close').onclick=close;
  document.getElementById('review-prev').onclick=()=>step(-1);document.getElementById('review-next').onclick=()=>step(1);
  document.getElementById('review-validate').onclick=()=>{if(active)validate(active,true);};
  document.getElementById('review-map-validate').onclick=()=>{if(active)validate(active,true);};
  document.getElementById('review-note').onchange=event=>{if(active){note(active,event.target.value);draw();}};
  document.getElementById('review-show-all').onclick=()=>{showAll=!showAll;active=queue()[0]?.id||null;trail=[];draw();};
  document.getElementById('review-return').onclick=()=>{active=trail.pop()||active;draw();};
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{if(event.target.matches('input,textarea,select')||event.ctrlKey||event.altKey||event.metaKey)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();step(event.key==='ArrowLeft'?-1:1);}});
  document.addEventListener('fullscreenchange',()=>{if(ownsFullscreen&&!document.fullscreenElement)close();});
  document.addEventListener('click',event=>{
    const validateButton=event.target.closest('[data-review-validate]'),openButton=event.target.closest('[data-review-open]');
    if(validateButton){validate(validateButton.dataset.reviewValidate);return;}
    if(openButton)open(openButton.dataset.reviewOpen);
  });
  document.addEventListener('change',event=>{const id=event.target.dataset?.reviewNote;if(id){note(id,event.target.value);draw();}});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  function htmlSnapshot(savedAt=new Date().toISOString()){
    const clone=document.documentElement.cloneNode(true),payload={...data,review:model.snapshot(),reviewSavedAt:savedAt};
    clone.querySelector('#assessment-data').textContent=JSON.stringify(payload).replace(/</g,'\\u003c');
    clone.querySelectorAll('dialog').forEach(node=>node.removeAttribute('open'));
    clone.querySelector('#assessment-change-log').setAttribute('open','');
    for(const id of ['review-map','review-detail','cases','overview-body'])clone.querySelector('#'+id).innerHTML='';
    clone.querySelector('#review-note').textContent='';
    for(const id of ['assessment-file-status','review-save-state'])clone.querySelector('#'+id).textContent='';
    return '<!doctype html>\n'+clone.outerHTML;
  }
  function downloadCopy(){
    try{download(data.filename+tr('_revue.html','_review.html'),htmlSnapshot(),'text/html;charset=utf-8');if(!fileSaver?.state.handle)dirty=false;}
    catch(error){document.getElementById('assessment-file-status').textContent=tr('Échec : ','Failed: ')+error.message;}
  }
  const autoButton=document.getElementById('autosave-assessment'),saveButton=document.getElementById('save-assessment-review'),saveStatus=document.getElementById('assessment-file-status'),supported=typeof window.showSaveFilePicker==='function'&&window.isSecureContext!==false&&Boolean(saverFactory);
  let choosing=false;
  if(saverFactory)fileSaver=saverFactory({snapshot:htmlSnapshot,onSaved(at,revision){data.reviewSavedAt=at;dirty=fileSaver.state.revision!==revision;},onState(s){
    autoButton.disabled=!supported||s.saving||choosing;saveButton.disabled=s.saving||choosing;
    autoButton.textContent=s.enabled?tr('Suspendre l’auto save','Pause autosave'):s.handle&&!s.error?tr('Reprendre l’auto save','Resume autosave'):tr('Activer l’auto save…','Enable autosave…');
    autoButton.setAttribute('aria-pressed',String(s.enabled));
    const label=s.error?(s.error.message==='externalChange'?tr('Fichier modifié ailleurs : sauvegarde suspendue. Téléchargez une copie pour comparer.','File changed elsewhere: saving paused. Download a copy to compare.'):tr('Échec de sauvegarde : ','Save failed: ')+s.error.message):s.saving?tr('Enregistrement…','Saving…'):s.pending?tr('Modifications en attente','Pending changes'):s.lastSaved?tr('Enregistré : ','Saved: ')+stamp(s.lastSaved):tr('Auto save fichier non activé','File autosave is off');
    saveStatus.textContent=label+(s.handle?' · '+s.handle.name:'');document.getElementById('review-save-state').textContent=label;
  }});
  async function chooseFile(){
    if(choosing)return;choosing=true;fileSaver.notify();
    try{const handle=await window.showSaveFilePicker({suggestedName:data.filename+tr('_revue.html','_review.html'),types:[{description:'HTML',accept:{'text/html':['.html']}}]});await fileSaver.connect(handle);}
    catch(error){saveStatus.textContent=error.name==='AbortError'?tr('Sélection annulée.','Selection cancelled.'):tr('Sauvegarde impossible : ','Unable to save: ')+error.message;}
    finally{choosing=false;autoButton.disabled=!supported;saveButton.disabled=false;}
  }
  autoButton.onclick=()=>{if(!supported)return;if(fileSaver.state.enabled)fileSaver.pause();else if(fileSaver.state.handle&&!fileSaver.state.error)fileSaver.resume();else chooseFile();};
  saveButton.onclick=()=>{if(!supported)downloadCopy();else if(!fileSaver.state.handle)chooseFile();else fileSaver.save(true);};
  document.getElementById('review-save').onclick=()=>saveButton.click();
  document.getElementById('download-assessment-copy').onclick=downloadCopy;
  autoButton.disabled=!supported;
  document.getElementById('assessment-save-help').textContent=supported?tr('Choisissez une copie HTML de travail : l’auto save remplace ensuite ce même fichier. À chaque réouverture, sélectionnez-le à nouveau pour autoriser l’écriture. Le brouillon navigateur est distinct ; téléchargez une copie pour transmettre votre travail.','Choose a working HTML copy: autosave then replaces that same file. Each time you reopen it, select it again to authorize writing. The browser draft is separate; download a copy to share your work.'):tr('Écriture directe indisponible : le brouillon est conservé dans ce navigateur si le stockage est autorisé. Téléchargez le HTML pour conserver ou transmettre votre travail.','Direct writing unavailable: a draft is kept in this browser if storage is allowed. Download the HTML to keep or share your work.');
  fileSaver?.notify();
  const tutorial=document.getElementById('assessment-review-tutorial'),seenKey=storageKey+':tutorial';let tutorialStep=0;
  let preferences=data.reviewPreferences||{};
  try{preferences=JSON.parse(localStorage.getItem(storageKey+':preferences')||'null')||preferences;}catch{}
  function applyPreferences(save=false){
    const comfort=preferences.comfort===true;
    const layout=['map','compare'].includes(preferences.layout)?preferences.layout:'max';
    document.body.classList.toggle('assessment-comfort',comfort);dialog.classList.toggle('comparison-layout',layout==='compare');dialog.classList.toggle('max-map-layout',layout==='max');
    document.getElementById('review-details-panel').hidden=layout==='max';
    document.getElementById('review-map-validate').hidden=layout!=='max';
    const detailsToggle=document.getElementById('review-toggle-details');detailsToggle.textContent=layout==='max'?tr('Afficher les détails','Show details'):tr('Agrandir la carte','Maximize map');detailsToggle.setAttribute('aria-expanded',String(layout!=='max'));
    for(const id of ['assessment-comfort','review-comfort'])document.getElementById(id).setAttribute('aria-pressed',String(comfort));
    document.getElementById('review-layout-choice').value=layout;
    data.reviewPreferences=preferences;
    scheduleMapFit();
    if(save){try{localStorage.setItem(storageKey+':preferences',JSON.stringify(preferences));}catch{}dirty=true;fileSaver?.changed();}
  }
  for(const id of ['assessment-comfort','review-comfort'])document.getElementById(id).onclick=()=>{preferences={...preferences,comfort:!preferences.comfort};applyPreferences(true);};
  document.getElementById('review-layout-choice').onchange=event=>{const layout=['max','map','compare'].includes(event.target.value)?event.target.value:'max';preferences={...preferences,layout,...(layout!=='max'?{detailsLayout:layout}:{})};applyPreferences(true);};
  document.getElementById('review-toggle-details').onclick=()=>{const layout=dialog.classList.contains('max-map-layout')?(preferences.detailsLayout==='compare'?'compare':'map'):'max';preferences={...preferences,...(layout==='max'?{detailsLayout:preferences.layout}:{}) ,layout};applyPreferences(true);};
  applyPreferences();
  const steps=[
    [tr('Bienvenue dans votre revue','Welcome to your review'),tr('Ce rapport aide à examiner les groupements et références. Les données restent sur votre ordinateur. Les validations et notes sont enregistrées séparément : aucune affectation GTFS ou HASTUS n’est changée automatiquement.','This report helps review groupings and references. Data stays on your computer. Approvals and notes are recorded separately: no GTFS or HASTUS assignment is changed automatically.')],
    [tr('1 · Choisir les cas à examiner','1 · Choose cases to review'),tr('Filtrez par type, recherchez un code ou cliquez sur le sommaire. « TP uniquement » limite les stops visibles. Une validation faite avec ce filtre ne valide pas le cas pour tous les stops.','Filter by type, search for a code or click the overview. “Timing points only” limits visible stops. A validation in this scope does not validate the case for all stops.')],
    [tr('2 · Lire la carte en grand','2 · Read the larger map'),tr('Ouvrez « Revue plein écran ». Carte maximale occupe toute la largeur. « Afficher les détails » ouvre les stops, références et recommandations à droite. Bleu : TP ; orange : non TP ; gris : statut inconnu. Les places de référence sont violettes. Les fonds en ligne nécessitent Internet.','Open “Full-screen review”. Maximum map uses the full width. “Show details” opens stops, references and recommendations on the right. Blue: timing point; orange: non-timing point; grey: unknown status. Reference places are purple. Online backgrounds require Internet.')],
    [tr('3 · Naviguer et valider','3 · Navigate and validate'),tr('Les flèches changent de cas. Cliquez sur une place liée pour la consulter, puis sur ↩ Retour. « Valider » fonctionne aussi en mode normal et retire le cas de la file plein écran. « Tous les cas » permet de revenir sur une validation et de l’annuler. Échap ferme la revue.','Arrows change the case. Click a linked place to inspect it, then ↩ Return. “Validate” also works in normal view and removes the case from the fullscreen queue. “All cases” lets you revisit and undo a validation. Escape closes review.')],
    [tr('4 · Adapter votre espace','4 · Adapt your workspace'),tr('Carte maximale replie les détails ; Carte les garde visibles. Comparaison élargit les listes de stops. Confort visuel réduit la saturation des couleurs, évite les animations et conserve des commandes stables. Vous pouvez le désactiver à tout moment.','Maximum map collapses details; Map keeps them visible. Comparison widens the stop lists. Visual comfort reduces colour saturation, avoids animation and keeps controls stable. You can turn it off at any time.')],
    [tr('5 · Documenter la décision','5 · Document the decision'),tr('Ajoutez une note si nécessaire. Modifier la note remet le cas à valider. Le compte rendu affiche la date, le périmètre et l’avant/après de chaque validation, annulation ou note. Chaque fiche liée reste à valider indépendamment.','Add a note if needed. Editing the note returns the case to pending. The log shows the date, scope and before/after for each approval, reversal or note. Related records must be validated independently.')],
    [tr('6 · Sauvegarder et transmettre','6 · Save and share'),tr('Le brouillon est sauvegardé automatiquement dans ce navigateur, si autorisé. Pour mettre à jour un même fichier, activez l’auto save et choisissez une copie HTML de travail. Sinon, téléchargez une copie. Avant de fermer, vérifiez le statut de sauvegarde. Envoyez le HTML enregistré et, si utile, le journal CSV.','A draft is automatically saved in this browser, if allowed. To update the same file, enable autosave and choose a working HTML copy. Otherwise, download a copy. Before closing, check the save status. Send the saved HTML and, if useful, the CSV log.')]
  ];
  function showTutorial(){document.getElementById('review-tutorial-title').textContent=steps[tutorialStep][0];document.getElementById('review-tutorial-text').textContent=steps[tutorialStep][1];document.getElementById('review-tutorial-progress').textContent=(tutorialStep+1)+' / '+steps.length;document.getElementById('review-tutorial-prev').disabled=tutorialStep===0;document.getElementById('review-tutorial-next').textContent=tutorialStep===steps.length-1?tr('Commencer','Start'):tr('Suivant →','Next →');}
  function closeTutorial(){tutorial.close();data.reviewTutorialSeen=true;try{localStorage.setItem(seenKey,'1');}catch{}document.getElementById('open-review-tutorial').focus();}
  document.getElementById('open-review-tutorial').onclick=()=>{tutorialStep=0;showTutorial();tutorial.showModal();};
  document.getElementById('review-tutorial-prev').onclick=()=>{tutorialStep=Math.max(0,tutorialStep-1);showTutorial();};
  document.getElementById('review-tutorial-next').onclick=()=>{if(tutorialStep===steps.length-1)closeTutorial();else{tutorialStep++;showTutorial();}};
  document.getElementById('review-tutorial-close').onclick=closeTutorial;
  tutorial.addEventListener('cancel',event=>{event.preventDefault();closeTutorial();});
  let seen=Boolean(data.reviewTutorialSeen);try{seen=seen||localStorage.getItem(seenKey)==='1';}catch{}
  if(!seen)setTimeout(()=>{showTutorial();tutorial.showModal();},0);
  document.getElementById('export-assessment-log').onclick=()=>{
    const cell=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,match=>"'"+match).replace(/"/g,'""')+'"';
    const rows=[[tr('Date et heure','Date and time'),tr('Cas','Case'),tr('Périmètre','Scope'),tr('Avant','Before'),tr('Après','After'),tr('Note avant','Previous note'),tr('Note après','New note')],...model.events.map(event=>[event.at,byId.get(event.id).title,scopeText(event.scope),statusText(event.before),statusText(event.after),event.before.note,event.after.note])];
    download(data.filename+tr('_journal.csv','_review_log.csv'),'\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  };
  journal();
  return {controls,badge:id=>get(id).validated?' · ✓ '+tr('Validé','Validated'):'',navigate(id){if(!dialog.open)return false;if(!byId.has(id))return true;trail.push(active);active=id;draw();return true;},print:()=>{const log=document.getElementById('assessment-change-log').cloneNode(true);log.open=true;return log.outerHTML;},refresh:draw};
}

function existingClientReportRuntime(csvFile,reviewMount,reviewModel,saverFactory){
  const data=JSON.parse(document.getElementById('assessment-data').textContent),t=data.text,size=12;
  const kind=document.getElementById('kind'),type=document.getElementById('type'),search=document.getElementById('search'),list=document.getElementById('cases'),summary=document.getElementById('overview-body');
  const stopScope=document.getElementById('stop-scope');
  let page=0,filtered=[],review=null;
  const tpOnly=()=>stopScope.value==='tp'&&Boolean(data.tpView);
  const currentView=()=>tpOnly()?data.tpView:data;
  // New reports provide a tighter, separately framed TP view. The fallback
  // supports report builders without a second map while retaining all places.
  const mapHtml=(id,only=tpOnly())=>only?(data.tpMaps?.[id]??(data.maps[id]||'').replace(/<g class="marker (?:stop|proposal) (?:non-tp|unknown-tp)">[\s\S]*?<\/g>/g,'')):(data.maps[id]||'');
  const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function loadMap(details){const host=details.querySelector('.map-host');if(details.open&&host&&!host.childNodes.length)host.innerHTML=mapHtml(details.dataset.caseId);}
  function render(){
    const opened=new Set([...list.querySelectorAll('details[open]')].map(d=>d.dataset.caseId));
    const query=normalize(search.value);filtered=currentView().cases.filter(c=>(kind.value==='all'||kind.value===c.kind)&&(type.value==='all'||(type.value==='review'?!c.tags.includes('none'):c.tags.includes(type.value)))&&normalize(c.search).includes(query));
    page=Math.max(0,Math.min(page,Math.ceil(filtered.length/size)-1));const visible=filtered.slice(page*size,(page+1)*size);
    summary.innerHTML=visible.map(c=>`<tr><td><a href="#${c.id}" data-case-link="${c.id}">${c.overviewCodesHtml||esc(c.code)}</a></td><td class="overview-description"><a href="#${c.id}" data-case-link="${c.id}">${c.overviewDescriptionsHtml||esc(c.title)}</a></td><td>${c.tags.map(tag=>esc(t.categories[tag])).join(' · ')}${esc(review?.badge(c.id)||'')}</td></tr>`).join('');
    list.innerHTML=visible.map(c=>`<article id="${c.id}"><details data-case-id="${c.id}"><summary><span class="badge">${esc(t.categories[c.tags[0]])}${esc(review?.badge(c.id)||'')}</span><h2>${c.titleHtml||esc(c.title)}</h2></summary><div class="case-body">${review?.controls(c)||''}<div class="map-host"></div>${c.html}<a href="#overview">↑ ${esc(t.back)}</a></div></details></article>`).join('');
    list.querySelectorAll('details[data-case-id]').forEach(d=>{d.addEventListener('toggle',()=>loadMap(d));if(opened.has(d.dataset.caseId)){d.open=true;loadMap(d);}});
    const first=list.querySelector('details');if(first){first.open=true;loadMap(first);}
    document.getElementById('page-status').textContent=`${filtered.length} ${t.cases} · ${t.page} ${page+1} / ${Math.max(1,Math.ceil(filtered.length/size))}`;
    document.getElementById('empty').hidden=filtered.length>0;document.getElementById('previous').disabled=page===0;document.getElementById('next').disabled=(page+1)*size>=filtered.length;
  }
  function navigate(id){
    if(!currentView().cases.some(c=>c.id===id))return;
    let index=filtered.findIndex(c=>c.id===id);
    if(index<0){kind.value='all';type.value='all';search.value='';render();index=filtered.findIndex(c=>c.id===id);}
    page=Math.floor(index/size);render();const article=document.getElementById(id),details=article.querySelector('details');details.open=true;loadMap(details);article.scrollIntoView({block:'start'});
  }
  for(const control of [kind,type,stopScope])control.addEventListener('change',()=>{page=0;render();});
  search.addEventListener('input',()=>{page=0;render();});
  document.getElementById('previous').addEventListener('click',()=>{page--;render();document.getElementById('overview').scrollIntoView();});
  document.getElementById('next').addEventListener('click',()=>{page++;render();document.getElementById('overview').scrollIntoView();});
  document.addEventListener('click',event=>{const a=event.target.closest('[data-case-link]');if(!a)return;event.preventDefault();const id=a.dataset.caseLink;if(review?.navigate(id))return;history.replaceState(null,'','#'+id);navigate(id);});
  window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
  const guide=document.getElementById('assessment-guide');
  document.getElementById('open-assessment-guide').onclick=()=>guide.showModal();
  document.getElementById('close-assessment-guide').onclick=()=>guide.close();
  document.getElementById('export-assessment-csv').onclick=()=>{
    const csv=csvFile(filtered.flatMap(c=>currentView().csvRows[c.id]||[])),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=data.filename+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  document.getElementById('print-assessment').onclick=async()=>{
    const button=document.getElementById('print-assessment'),status=document.getElementById('export-status'),selected=[...filtered],only=tpOnly();
    const preview=window.open('','_blank');if(!preview){status.textContent=t.printFailed+' '+(document.documentElement.lang==='fr'?'Autorisez les fenêtres supplémentaires.':'Allow pop-up windows.');return;}
    button.disabled=true;status.textContent=t.printWait;
    try{
      const css=[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n');
      preview.document.open();preview.document.write('<!doctype html><html lang="'+document.documentElement.lang+'"><head><meta charset="utf-8"><title>'+esc(data.filename)+'</title><style>'+css+'\n'+
        '@page{size:A4 landscape;margin:12mm}body{background:white}.print-tools{position:sticky;top:0;padding:14px;background:#edf3e7;z-index:5}.print-tools p{margin:5px 0}article{break-before:page}.case-body{padding:10px}.map-stage{max-width:850px;margin:auto}h2{display:block;margin:10px 0}thead{display:table-header-group}tr{break-inside:avoid}summary{list-style:none}.table-wrap{overflow:visible}@media print{.print-tools{display:none}header,main{max-width:none;padding:0}article{border:0;margin:0}.map-stage{max-width:200mm;break-inside:avoid}a{color:inherit;text-decoration:none}th,td{font-size:10px;padding:5px}.notice{padding:6px}h3{break-after:avoid}.case-body>a{display:none}}'+
        '</style></head><body><div class="print-tools"><button id="print-now">'+esc(t.print)+'</button><p>'+esc(t.printReady)+'</p><p>'+selected.length+' '+esc(t.cases)+'</p></div>'+document.querySelector('body>header').outerHTML+'<main><h1>'+esc(t.title)+'</h1><p>'+esc(t.note)+'</p><div id="print-cases"></div></main></body></html>');preview.document.close();
      preview.document.getElementById('print-now').onclick=()=>preview.print();
      const target=preview.document.getElementById('print-cases');
      if(review){const log=preview.document.createElement('section');log.innerHTML=review.print();target.append(log);}
      for(let i=0;i<selected.length;i++){
        if(preview.closed)break;const c=selected[i],article=preview.document.createElement('article');
        article.innerHTML='<h2>'+(c.titleHtml||esc(c.title))+'</h2><p>'+c.tags.map(tag=>esc(t.categories[tag])).join(' · ')+'</p><div class="case-body">'+mapHtml(c.id,only).replace(/loading="lazy"/g,'loading="eager"')+c.html+'</div>';target.append(article);
        if(i%10===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
      status.textContent=t.printReady;
    }catch(error){status.textContent=t.printFailed+' '+error.message;}finally{button.disabled=false;}
  };
  review=reviewMount?.(data,{esc,render,tpOnly,map:mapHtml,view:currentView,filtered:()=>filtered},reviewModel,saverFactory);
  render();if(location.hash)navigate(location.hash.slice(1));
}

function assessmentReviewMarkup(language){
  const en=language==='en',tr=(fr,english)=>en?english:fr;
  const tutorial=`<dialog id="assessment-review-tutorial" aria-labelledby="review-tutorial-title"><small id="review-tutorial-progress"></small><h2 id="review-tutorial-title"></h2><p id="review-tutorial-text"></p><div class="tutorial-actions"><button type="button" id="review-tutorial-close">${tr('Fermer le tutoriel','Close tutorial')}</button><button type="button" id="review-tutorial-prev">${tr('← Précédent','← Previous')}</button><button type="button" id="review-tutorial-next">${tr('Suivant →','Next →')}</button></div></dialog>`;
  return `<section class="assessment-review-tools"><div class="report-tools"><button id="start-assessment-review" type="button">⛶ ${tr('Revue plein écran','Full-screen review')}</button><button id="open-review-tutorial" type="button">${tr('Tutoriel guidé','Guided tutorial')}</button><button id="assessment-comfort" type="button">${tr('Confort visuel','Visual comfort')}</button><button id="autosave-assessment" type="button">${tr('Activer l’auto save…','Enable autosave…')}</button><button id="save-assessment-review" type="button">${tr('Enregistrer le HTML avec la revue','Save HTML with review')}</button><button id="download-assessment-copy" type="button">${tr('Télécharger une copie HTML','Download HTML copy')}</button><button id="export-assessment-log" type="button">${tr('Exporter le journal CSV','Export review log CSV')}</button></div><p id="assessment-file-status" role="status"></p><small id="assessment-save-help"></small><p id="assessment-review-status" role="status"></p><details id="assessment-change-log"><summary>${tr('Compte rendu des validations et modifications','Review and change log')}</summary><p>${tr('Ce journal suit les décisions de revue et les notes, pas des corrections appliquées aux données. Valider un cas ne valide pas automatiquement les autres fiches liées.','This log tracks review decisions and notes, not applied data corrections. Validating a case does not automatically validate related records.')}</p><div class="table-wrap"><table><thead><tr><th>${tr('Date et heure','Date and time')}</th><th>${tr('Groupement / cas','Grouping / case')}</th><th>${tr('Avant','Before')}</th><th>${tr('Après','After')}</th></tr></thead><tbody id="assessment-log-body"></tbody></table></div></details></section>
  <dialog id="assessment-review" data-review="true" aria-labelledby="review-title"><div class="review-top"><h2 id="review-title"></h2><button type="button" id="review-close" title="${tr('Quitter la revue (Échap)','Exit review (Escape)')}" aria-label="${tr('Quitter la revue','Exit review')}">✕</button></div><div class="review-layout"><div id="review-map"></div><aside id="review-details-panel"><div class="review-decision"><button type="button" id="review-validate">${tr('Valider','Validate')}</button><details><summary>${tr('Note de décision','Decision note')}</summary><textarea id="review-note" maxlength="2000" aria-label="${tr('Note de décision','Decision note')}"></textarea><small>${tr('Modifier une note remet le cas à valider.','Editing a note returns the case to pending.')}</small></details></div><div id="review-detail"></div></aside></div><nav class="review-bottom" aria-label="${tr('Navigation de revue','Review navigation')}"><button type="button" id="review-return" hidden>↩ ${tr('Retour','Return')}</button><button type="button" id="review-prev" title="${tr('Cas précédent (←)','Previous case (←)')}" aria-label="${tr('Cas précédent','Previous case')}">←</button><span id="review-progress" role="status"></span><button type="button" id="review-next" title="${tr('Cas suivant (→)','Next case (→)')}" aria-label="${tr('Cas suivant','Next case')}">→</button><button type="button" id="review-map-validate" hidden>${tr('Valider','Validate')}</button><button type="button" id="review-toggle-details" aria-controls="review-details-panel">${tr('Afficher les détails','Show details')}</button><button type="button" id="review-save" title="${tr('Enregistrer maintenant','Save now')}" aria-label="${tr('Enregistrer maintenant','Save now')}">↓</button><small id="review-save-state" role="status"></small><label class="review-layout-label">${tr('Disposition','Layout')}<select id="review-layout-choice"><option value="max">${tr('Carte maximale','Maximum map')}</option><option value="map">${tr('Carte','Map')}</option><option value="compare">${tr('Comparaison','Comparison')}</option></select></label><button id="review-comfort" type="button">${tr('Confort visuel','Visual comfort')}</button><button type="button" id="review-show-all">${tr('Tous les cas','All cases')}</button></nav></dialog>${tutorial}`;
}

function assessmentReviewStyles(){return `
#assessment-review.max-map-layout .review-layout{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:0;padding:4px}#assessment-review.max-map-layout .review-top{padding:6px 12px}#assessment-review.max-map-layout .review-top h2{max-height:14vh}#assessment-review.max-map-layout .review-bottom{padding:5px 10px;gap:7px}#assessment-review.max-map-layout #review-map{border-radius:0}#review-map-validate{background:var(--accent);color:white}#review-map-validate[aria-pressed=true]{background:#e6eedc;color:#35551d}.assessment-comfort #review-map-validate{background:#536359;color:white}
.tutorial-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}#assessment-review-tutorial{width:min(620px,92vw);border-radius:18px 0;background:#f7f8f4;color:#23322a}#assessment-review-tutorial h2{margin:16px 0;font-size:24px}#review-tutorial-text{line-height:1.75;min-height:160px}#assessment-save-help{display:block;max-width:900px;line-height:1.6}.review-layout-label{display:flex;align-items:center;gap:6px;font-size:11px}.review-layout-label select{padding:5px;font-size:12px}#review-save-state{max-width:180px;font-size:10px;line-height:1.3}#assessment-review.comparison-layout .review-layout{grid-template-columns:minmax(0,1fr) min(54vw,max(600px,50vw))}.assessment-comfort{--accent:#536359!important;--tint:#e9eae3!important;background:#efeee8;color:#2c342e}.assessment-comfort *{scroll-behavior:auto!important}.assessment-comfort *{animation:none!important;transition:none!important;box-shadow:none!important}.assessment-comfort article,.assessment-comfort table,.assessment-comfort .metrics div,.assessment-comfort dialog,.assessment-comfort #assessment-review,.assessment-comfort .review-top,.assessment-comfort .review-bottom,.assessment-comfort .review-layout>aside,.assessment-comfort .review-decision{background:#f5f4ef!important;color:#2c342e!important}.assessment-comfort .report-tools button,.assessment-comfort #review-validate{background:#536359;color:#fff}.assessment-comfort .place-code.reference-code,.assessment-comfort .reference-chip{background:#e7e3e9;color:#514957;border-color:#afa6b3}.assessment-comfort .map-stage iframe{filter:saturate(.35)}.assessment-comfort .osm-land{fill:#e1e4da}.assessment-comfort .osm-road.major{stroke:#c6bfa5}.assessment-comfort .osm-water{fill:#dce6e8}.assessment-comfort .marker.tp circle{fill:#496b78}.assessment-comfort .marker.non-tp circle{fill:#906941}.assessment-comfort .marker.reference-marker rect.reference-label{fill:#e7e3e9}.assessment-comfort .marker.reference-marker text{fill:#514957}.assessment-comfort #review-map{background:#e5e5dd}.assessment-comfort button[aria-pressed=true]{outline:2px solid #536359;outline-offset:1px}@media(prefers-reduced-motion:reduce){html,body,*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}@media(max-width:1100px){#review-save-state{display:none}.review-bottom{flex-wrap:wrap}.review-layout-label{font-size:10px}}@media(max-width:850px){#assessment-review.comparison-layout .review-layout{grid-template-columns:1fr}}@media(pointer:coarse){#assessment-review button,#assessment-review select,.report-tools button,.report-tools select,[data-review-validate],[data-review-open],.tutorial-actions button{min-height:44px;min-width:44px}#assessment-review select,#assessment-review textarea{font-size:16px}.review-bottom{gap:8px;padding-bottom:max(6px,env(safe-area-inset-bottom))}#assessment-review .review-top{padding-top:max(6px,env(safe-area-inset-top))}}.code-stops{display:block;font-size:10px;font-weight:400;line-height:1.2;opacity:.85;white-space:normal}#overview-body .code-stops{display:inline;margin-left:6px}
.assessment-case-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 0 12px}.assessment-case-tools button{padding:6px 12px;font-size:13px}.assessment-case-tools>span{font-size:11px;color:#65715f}.assessment-case-tools button[aria-pressed=true],#review-validate[aria-pressed=true]{background:#e6eedc;color:#35551d;border-color:#7e9a61}.assessment-note summary{padding:5px;font-size:12px}.assessment-note textarea,#review-note{width:100%;min-height:70px;max-height:160px;font:inherit;padding:8px;border:1px solid #bbc7b2;resize:vertical}.assessment-review-tools{margin:18px 0}#assessment-review-status{font-size:12px;color:#596657}#assessment-change-log{background:white;border:1px solid #d8dfd0;margin-top:12px}#assessment-change-log>summary{padding:10px 14px}#assessment-change-log>p{padding:0 14px;font-size:12px}#assessment-log-body small{display:block;color:#65715f}#assessment-log-body p{margin:4px 0;white-space:pre-wrap}#assessment-log-body td{font-size:13px}
#assessment-review{inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#f3f5ef;color:#23322a;overflow:hidden}#assessment-review[open]{display:grid;grid-template-rows:auto minmax(0,1fr) auto}#assessment-review::backdrop{background:#142018dd}.review-top{display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid #d8dfd0;background:#fff}.review-top h2{flex:1;display:block;margin:0;font-size:clamp(16px,1vw,25px);line-height:1.4;max-height:18vh;overflow:auto}.review-top .place-code{padding:3px 6px}.review-layout{display:grid;grid-template-columns:minmax(0,1fr) min(50vw,clamp(600px,34vw,820px));min-height:0;gap:12px;padding:12px}.review-layout>aside{min-width:0;min-height:0;overflow:auto;padding:12px;background:white;border:1px solid #d8dfd0;border-radius:14px 0}.review-layout h3{margin:14px 0 6px}.review-layout p{font-size:13px;margin:8px 0}.review-layout th,.review-layout td{padding:6px;font-size:12px}.review-layout .table-wrap table{min-width:550px}.review-layout .notice,.review-layout .reference-field{padding:8px}.review-decision{position:sticky;top:-12px;z-index:3;background:white;padding:8px 0;border-bottom:1px solid #d8dfd0}.review-decision>button{width:100%;background:#54742e;color:white}.review-decision summary{padding:6px 0;font-size:12px}.review-decision small{font-size:11px;color:#65715f}#review-map{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;min-height:0;overflow:hidden;border-radius:14px 0;background:#e8ece2}#review-map .review-map-frame{flex:1;display:flex;align-items:center;justify-content:center;width:100%;min-width:0;min-height:0;overflow:hidden}#review-map .map-stage{flex:none;width:0;height:0;aspect-ratio:auto;max-width:100%;max-height:100%}#review-map .review-map-notes{flex:none;width:100%;max-height:35%;overflow:auto}#review-map .review-map-notes:empty{display:none}#review-map .legend{padding:0 12px;margin:8px 0;font-size:11px}#review-map .review-map-notes>.notice{margin:4px 12px}.review-bottom{display:flex;justify-content:center;align-items:center;gap:10px;padding:8px 18px;background:white;border-top:1px solid #d8dfd0}.review-bottom button,.review-top button{padding:6px 12px;background:transparent;font-size:13px}.review-bottom span{font-size:12px;min-width:150px;text-align:center}#assessment-review button:focus-visible,.assessment-case-tools button:focus-visible{outline:3px solid #9470b8;outline-offset:2px}.review-complete{padding:30px;font-size:20px!important}
@media(max-width:850px){.review-layout{grid-template-columns:1fr;grid-template-rows:minmax(0,45%) minmax(0,1fr);padding:6px;gap:6px}.review-top{padding:8px}.review-bottom{gap:5px;padding:6px}.review-bottom span{min-width:0}.review-bottom button{padding:6px}.review-layout>aside{padding:8px}}
@media print{#assessment-review,.assessment-review-tools>.report-tools,#assessment-review-status,.assessment-case-tools{display:none!important}#assessment-change-log{display:block;break-after:page}#assessment-change-log::details-content{display:block}#assessment-change-log .table-wrap{overflow:visible}}
`;}

function existingClientReportHtml(model,cases,maps,options){
  const {language,theme,logo,brand,date,offline}=options,t=EXISTING_REPORT_TEXT[language],e=escapeHtml;
  const compactStyles=`#overview table{width:max-content;min-width:100%;table-layout:auto}#overview th,#overview td{padding:5px 9px;white-space:nowrap;vertical-align:middle;overflow-wrap:normal;font-size:13px}#overview td:first-child,#overview td:last-child{width:auto;min-width:0}#overview .place-code{display:inline-flex;flex-direction:row;align-items:center;gap:7px;padding:2px 6px;white-space:nowrap;max-width:none}#overview .code-heading{display:inline-flex;flex-wrap:nowrap;gap:7px}#overview .code-main{font-size:13px}#overview .code-role,#overview .code-relation,#overview .code-detail{font-size:11px}#overview .code-detail{display:inline;overflow-wrap:normal;border-left:1px solid #b8a2d2;padding-left:7px}#overview .reference-chip{padding:0 4px}#overview .code-relation{padding-left:7px}#overview a{white-space:nowrap}.place-code{display:inline-flex;flex-direction:column;gap:4px;padding:5px 8px;vertical-align:middle;text-align:left;font-size:13px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.code-heading{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px}.code-main{font-family:ui-monospace,Consolas,monospace;font-size:14px;font-weight:600}.code-role,.code-relation,.code-detail{font:12px/1.4 Arial,sans-serif}.code-role{color:#513479}.code-relation{display:inline-flex;align-items:center;gap:5px;border-left:1px solid #aab6a4;padding-left:10px}.reference-chip{background:#e9e2f4;color:#513479;border:1px solid #b8a2d2;border-radius:3px;padding:1px 5px;font-family:ui-monospace,Consolas,monospace}.code-detail{display:block;overflow-wrap:anywhere}.code-children{font-family:ui-monospace,Consolas,monospace}.code-review{color:#854719}.marker.place .map-code-main{font-size:14px;font-weight:600}.marker.place .map-code-role{font:12px Arial}.marker.place .map-code-detail{font:12px Arial}.marker.place rect.map-reference-chip{fill:#e9e2f4;stroke:#b8a2d2;stroke-width:1}.marker.place text.map-reference-code{fill:#513479;font-size:13px;font-weight:500}`;
  const noAction=model.places.filter(p=>p.primary==='none').length;
  const data={reportId:globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2),text:t,cases:cases.map(({points,...c})=>c),maps,tpMaps:options.tpMaps||{},tpView:model.timingKnown?existingReportTimingPointView(model,language):null,csvRows:existingReportCsvRows(model,cases,t),filename:String(options.client||'Client').replace(/[^A-Za-z0-9_-]+/g,'_')+'_HASTUS_assessment'};
  const source=model.timingKnown?(model.timingSource==='variants'?t.variants:t.gtfs)+(model.timingInferred?' · '+t.inferred:''):t.unknownSource;
  const toolbar=`<div class="report-tools"><button id="open-assessment-guide" type="button">${e(t.guide)}</button><button id="export-assessment-csv" type="button">${e(t.csv)}</button><button id="print-assessment" type="button">${e(t.print)}</button></div><p>${e(t.exportScope)}</p><p id="export-status" role="status"></p><p class="notice">${e(t.timingSource)} : ${e(source)}</p>`;
  const guide=`<dialog id="assessment-guide" aria-labelledby="assessment-guide-title"><h2 id="assessment-guide-title">${e(t.guideTitle)}</h2><ol>${t.guideSteps.map(step=>`<li>${e(step)}</li>`).join('')}</ol><button id="close-assessment-guide" type="button">${e(t.close)}</button></dialog>`;
  const extraStyles=`.place-code{display:inline-block;font-family:ui-monospace,Consolas,monospace;font-size:.86em;font-weight:500;line-height:1.35;padding:2px 7px;border:1px solid #aab6a4;border-radius:4px;background:var(--tint);color:var(--ink);vertical-align:baseline;white-space:normal;overflow-wrap:anywhere;max-width:100%}.place-code.reference-code{background:#e9e2f4;color:#513479;border-color:#b8a2d2;print-color-adjust:exact;-webkit-print-color-adjust:exact}.marker.place rect.place-label{fill:#edf3e7;stroke:#aab6a4;stroke-width:1}.marker.place text{fill:#23322a;stroke:none;font-family:ui-monospace,Consolas,monospace;font-size:13px;font-weight:600}.marker.place rect.reference-label{fill:#e9e2f4;stroke:#b8a2d2;stroke-width:1}.marker.reference-marker text{fill:#513479;stroke:none;font-family:ui-monospace,Consolas,monospace;font-weight:500}.overview-line{min-height:30px;padding:3px 0}#overview td:first-child{width:26%;min-width:160px}#overview td:last-child{width:26%}.overview-description a{color:inherit;text-decoration:none}.overview-description a:hover{text-decoration:underline}.place-description{font-family:inherit;font-weight:700;overflow-wrap:anywhere}h2:has(.place-code){font-weight:400}a:has(.place-code){text-decoration:none}a:hover .place-description{text-decoration:underline}.report-tools{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.report-tools button{background:var(--accent);color:white}dialog{max-width:min(680px,92vw);max-height:85vh;overflow:auto;border:1px solid #b5c3a9;padding:24px}dialog::backdrop{background:#0008}dialog li{margin:10px 0}dialog h2{display:block;margin:0}.reference-field{padding:12px;background:var(--tint)}.marker.place rect{fill:var(--accent);stroke:white;stroke-width:3}.marker.tp circle{fill:#176a8a}.marker.non-tp circle{fill:#c46b12}.marker.unknown-tp circle{fill:#737b80}.marker.proposal circle{stroke:#994583;stroke-width:3;stroke-dasharray:3 2}h2{overflow-wrap:anywhere}@media print{.report-tools,.filters,.pager,#overview,dialog,#export-status,article .case-body>a{display:none!important}.case-body{display:block}article{break-before:page}.map-stage{break-inside:avoid}.table-wrap{overflow:visible}thead{display:table-header-group}}`;
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(options.client)} · ${e(t.title)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f5ef;color:#23322a;font:15px/1.55 Arial,sans-serif;--accent:${theme==='classic'?'#006d67':'#54742e'};--tint:#edf3e7}header,main{max-width:1240px;margin:auto;padding:24px}header{display:flex;align-items:center;gap:24px;border-bottom:3px solid var(--accent)}header img{max-width:150px;max-height:52px}.client-brand{margin-left:auto;display:flex;align-items:center;gap:14px}.client-brand small{display:block}h1{font-size:29px;line-height:1.2}h2{font-size:20px;display:inline;margin:0 0 0 12px}h3{font-size:16px;margin-top:24px}a{color:var(--accent);overflow-wrap:anywhere}p{overflow-wrap:anywhere}.intro{max-width:920px}.notice{background:var(--tint);border-left:3px solid var(--accent);padding:12px}.metrics{display:flex;gap:12px;flex-wrap:wrap}.metrics div{flex:1;min-width:150px;background:white;padding:16px;border:1px solid #d8dfd0}.metrics strong{display:block;font-size:25px;color:var(--accent)}.filters{display:flex;gap:12px;flex-wrap:wrap;padding:20px 0}label{display:grid;gap:5px}input,select,button{font:inherit;padding:10px;border:1px solid #b5c3a9;background:white;color:inherit;border-radius:14px 0}input{min-width:280px}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}.pager{display:flex;align-items:center;gap:16px;padding:14px 0}#page-status{flex:1}article{background:white;border:1px solid #d8dfd0;margin:18px 0;scroll-margin-top:20px}summary{cursor:pointer;padding:20px}.case-body{padding:0 20px 24px}.badge{display:inline-block;padding:4px 9px;background:var(--tint);font-size:12px;font-weight:bold}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;background:white}th,td{padding:10px;border:1px solid #d8dfd0;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:var(--tint)}.map-stage{position:relative;aspect-ratio:1000/430;overflow:hidden;background:#e9ede4}.map-stage iframe,.map-stage svg{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none;user-select:none}.map-stage svg{z-index:1}.marker circle{fill:#176a8a;stroke:white;stroke-width:2}.marker.place circle{fill:var(--accent);stroke:#fff;stroke-width:3}.marker.proposal circle{fill:#994583}.marker text{font:12px Arial;paint-order:stroke;stroke:white;stroke-width:4px;fill:#20312d}.marker.place text{font-weight:bold}.credit{font:12px Arial;paint-order:stroke;stroke:white;stroke-width:4px}.legend{font-size:12px;color:#596657}.osm-land{fill:#dfe9d7;stroke:#cad9c0}.osm-water{fill:#cde6ef;stroke:#8cbfd0;stroke-width:2}.osm-building{fill:#ddd9d1;stroke:#c0bbb2}.osm-rail{fill:none;stroke:#8e8178;stroke-width:3;stroke-dasharray:7 5}.osm-road{fill:none;stroke-linecap:round;stroke-linejoin:round}.osm-road.major{stroke:#f2b879;stroke-width:9}.osm-road.minor{stroke:white;stroke-width:6}.osm-road.path{stroke:white;stroke-width:3}footer{padding:24px;text-align:center;color:#65715f}[hidden]{display:none!important}@media(max-width:600px){header,main{padding:14px}.filters>*{width:100%}h2{display:block;margin:8px 0}header{flex-wrap:wrap}}
  ${extraStyles}${compactStyles}${assessmentReviewStyles()}</style></head><body><header>${logo?`<img src="${e(logo)}" alt="CSched">`:'<strong>CSched</strong>'}${brand}<small>${e(date)}</small></header><main><h1>${e(t.title)}</h1><p class="intro">${e(t.intro)}</p><p class="notice">${e(t.note)}</p><p>${e(t.origin)} · ${e(t.radius)} : ${model.radius} m · ${e(t.threshold)} : ${model.threshold} m</p><p>${e(offline?t.offline:t.online)}</p><div class="metrics"><div>${e(t.refs)}<strong>${model.anomalies.length}</strong></div><div>${e(t.places)}<strong>${model.places.length}</strong></div><div>${e(t.review)}<strong>${model.places.length-noAction}</strong></div><div>${e(t.categories.none)}<strong>${noAction}</strong></div></div>${toolbar}${assessmentReviewMarkup(language)}<div class="filters"><label>${e(t.stopScope)}<select id="stop-scope"${model.timingKnown?'':' disabled'} title="${e(model.timingKnown?t.tpScope:t.unknownSource)}"><option value="all">${e(t.allStops)}</option><option value="tp">${e(t.tpOnly)}</option></select></label><label>${e(t.allCases)}<select id="kind"><option value="all">${e(t.allCases)}</option><option value="reference">${e(t.refs)}</option><option value="place">${e(t.places)}</option><option value="issue">${e(t.issues)} (${model.unresolved.length})</option></select></label><label>${e(t.type)}<select id="type"><option value="all">${e(t.all)}</option><option value="review">${e(t.review)}</option>${model.priority.map(key=>`<option value="${key}">${e(t.categories[key])}</option>`).join('')}</select></label><label>${e(t.search)}<input id="search" type="search"></label></div><section id="overview"><h3>${e(t.summary)}</h3><div class="table-wrap"><table><thead><tr><th>${e(t.code)}</th><th>${e(t.description)}</th><th>${e(t.type)}</th></tr></thead><tbody id="overview-body"></tbody></table></div></section><div class="pager"><span id="page-status" role="status" aria-live="polite"></span><button id="previous">${e(t.previous)}</button><button id="next">${e(t.next)}</button></div><p id="empty" hidden>${e(t.noMatches)}</p><div id="cases"></div><noscript>${e(language==='en'?'Enable JavaScript to browse this report.':'Activez JavaScript pour consulter ce rapport.')}</noscript></main><footer>CSched · ${e(options.client)} · HASTUS</footer>${guide}<script id="assessment-data" type="application/json">${inlineJson(data)}</script><script>(${existingClientReportRuntime.toString()})(${existingReportCsv.toString()},${mountAssessmentReview.toString()},${assessmentReviewModel.toString()},${typeof reportFileSaver==='function'?reportFileSaver.toString():'null'});<\/script></body></html>`;
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
    const maps={},tpMaps={};
    for(let i=0;i<cases.length;i++){
      maps[cases[i].id]=existingReportMap(cases[i].points,features,EXISTING_REPORT_TEXT[language]);
      const timedPoints=cases[i].points.filter(p=>p.kind==='place'||p.timing===true);
      if(model.timingKnown&&timedPoints.length!==cases[i].points.length)tpMaps[cases[i].id]=existingReportMap(timedPoints,features,EXISTING_REPORT_TEXT[language]);
      if(i%12===0){button.textContent=`${language==='en'?'Creating report':'Création du rapport'} ${i+1}/${cases.length}`;await new Promise(resolve=>setTimeout(resolve,0));}
    }
    const agency=agencyClientIdentity(),client=normalize(agency.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_')||'Client';
    const html=existingClientReportHtml(model,cases,maps,{language,tpMaps,theme:placeReportHtmlTheme(),logo,brand:clientBrandMarkup(),client:agency.name,offline,date:new Date().toLocaleDateString(language==='en'?'en-CA':'fr-CA')});
    download(`${client}_${language==='en'?'HASTUS_assessment':'diagnostic_HASTUS'}_${new Date().toISOString().slice(0,10)}.html`,html,'text/html');
  }finally{button.disabled=false;button.textContent=originalLabel;}
}
