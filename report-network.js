/* Pure GTFS service-date and route utilities, also embedded in standalone reports. */
function reportNetworkTools() {
  const clean=v=>String(v??'').trim(),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function date(value){const s=clean(value).replaceAll('-','');if(!/^\d{8}$/.test(s))return null;const d=new Date(Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6)));return d.toISOString().slice(0,10).replaceAll('-','')===s?d:null;}
  const seconds=value=>{const m=clean(value).match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);return m?+m[1]*3600 + +m[2]*60 + +m[3]:null;};
  const clock=value=>value===null?'—':[Math.floor(value/3600),Math.floor(value/60)%60,value%60].map(n=>String(n).padStart(2,'0')).join(':');
  // Compare the same first displayed stop, never a different first non-empty time.
  function timetableRows(pattern){
    const trips=[...pattern.trips].sort((a,b)=>(a.times[0]??Infinity)-(b.times[0]??Infinity)||a.id.localeCompare(b.id));
    return trips.map((trip,index)=>{const current=trip.times[0],previous=trips[index-1]?.times[0];return {trip,headway:Number.isFinite(current)&&Number.isFinite(previous)?current-previous:null};});
  }
  const headwayLabel=value=>!Number.isFinite(value)?'—':Math.floor(value/60)+' min'+(value%60?' '+value%60+' s':'');
  const verticalLabelHeight=label=>Math.max(96,Math.min(280,Math.max(...String(label).replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').split('\n').map(line=>line.length))*5.5+12));
  function timetableHtml(pattern,stopLabel,language='fr',compact=true){
    const en=language==='en',tip=en?'Interval from the previous trip at the first displayed stop, within this pattern.':'Intervalle avec le voyage précédent au premier stop affiché, pour ce parcours.';
    const headwayWidth=compact?64:100,tripWidth=compact?110:160,stopWidth=compact?70:180;
    return '<div class="network-table'+(compact?' network-condensed':'')+'"><table class="network-timetable" style="width:'+(headwayWidth+tripWidth+pattern.stops.length*stopWidth)+'px"><colgroup><col style="width:'+headwayWidth+'px"><col style="width:'+tripWidth+'px">'+pattern.stops.map(()=>'<col style="width:'+stopWidth+'px">').join('')+'</colgroup><thead><tr><th scope="col" class="network-headway" title="'+esc(tip)+'">Headway</th><th scope="col" class="network-trip">'+(en?'Trip':'Voyage')+'</th>'+pattern.stops.map(id=>{const label=stopLabel(id);return '<th scope="col"><div class="network-stop-label"'+(compact?' style="height:'+verticalLabelHeight(label)+'px"':'')+' data-network-stop="'+esc(id)+'">'+label+'</div></th>';}).join('')+'</tr></thead><tbody>'+timetableRows(pattern).map(({trip,headway})=>'<tr><td class="network-headway">'+headwayLabel(headway)+'</td><th scope="row" class="network-trip" title="'+esc(trip.headsign)+'">'+esc(trip.id)+'</th>'+pattern.stops.map((id,index)=>'<td>'+clock(trip.times[index]??null)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="network-headway-note">'+esc(tip)+' '+(en?'— = first trip or missing time.':'— = premier voyage ou heure manquante.')+'</p>';
  }
  function create(data){
    const parse=reportPackageTools().parse,files=new Map((data.gtfs?.archiveEntries||[]).map(entry=>[entry.name.toLowerCase(),entry.text]));
    const table=(name)=>data.networkTables?.[name]||(files.has(name)?parse(files.get(name)):{headers:[],rows:[]});
    const routes=table('routes.txt').rows,trips=table('trips.txt').rows,calendar=table('calendar.txt'),exceptions=table('calendar_dates.txt'),shapes=table('shapes.txt').rows,frequency=table('frequencies.txt').rows;
    const stops=new Map((data.gtfs?.stops.rows||[]).map(row=>[row.stop_id,row])),times=data.gtfs?.times||{headers:[],rows:[]},byTrip=new Map(),byShape=new Map(),byFrequency=new Map();
    for(const row of times.rows){if(!byTrip.has(row.trip_id))byTrip.set(row.trip_id,[]);byTrip.get(row.trip_id).push(row);}
    for(const rows of byTrip.values())rows.sort((a,b)=>Number(a.stop_sequence)-Number(b.stop_sequence));
    for(const row of shapes){if(!byShape.has(row.shape_id))byShape.set(row.shape_id,[]);byShape.get(row.shape_id).push(row);}
    for(const rows of byShape.values())rows.sort((a,b)=>Number(a.shape_pt_sequence)-Number(b.shape_pt_sequence));
    for(const row of frequency){if(!byFrequency.has(row.trip_id))byFrequency.set(row.trip_id,[]);byFrequency.get(row.trip_id).push(row);}
    const weekday=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const bounds=calendar.rows.flatMap(row=>[date(row.start_date),date(row.end_date)]).concat(exceptions.rows.map(row=>date(row.date))).filter(Boolean).map(d=>d.toISOString().slice(0,10)).sort();
    const calendarValid=(calendar.headers.length&&['service_id',...weekday,'start_date','end_date'].every(h=>calendar.headers.includes(h)))||(exceptions.headers.length&&['service_id','date','exception_type'].every(h=>exceptions.headers.includes(h)));
    function services(day){const d=date(day),active=new Set();if(!d)return active;const key=day.replaceAll('-','');for(const row of calendar.rows)if(row.start_date<=key&&row.end_date>=key&&row[weekday[d.getUTCDay()]]==='1')active.add(row.service_id);for(const row of exceptions.rows)if(row.date===key){if(row.exception_type==='1')active.add(row.service_id);if(row.exception_type==='2')active.delete(row.service_id);}return active;}
    const hasTP=times.headers.includes('timepoint'),explicitTP=Array.isArray(data.networkTimingPointIds)?new Set(data.networkTimingPointIds):null;
    const isTiming=row=>explicitTP?explicitTP.has(row.stop_id):hasTP?row.timepoint==='1':/\d+:\d{2}:00$/.test(row.arrival_time||row.departure_time||'');
    function schedules(day,routeId='',direction='',onlyTiming=true){
      const active=services(day),patterns=new Map(),frequencies=[];let tripCount=0;
      for(const trip of trips){if(!active.has(trip.service_id)||(routeId&&trip.route_id!==routeId)||(direction!==''&&String(trip.direction_id||'?')!==direction))continue;
        const all=byTrip.get(trip.trip_id)||[],rows=onlyTiming?all.filter(isTiming):all;if(!rows.length)continue;
        const windows=byFrequency.get(trip.trip_id)||[],departures=[];
        if(!windows.length)departures.push({offset:0,id:trip.trip_id});
        const base=seconds(all[0]?.departure_time||all[0]?.arrival_time);
        for(const window of windows){const start=seconds(window.start_time),end=seconds(window.end_time),headway=Number(window.headway_secs);
          if(start===null||end===null||!Number.isSafeInteger(headway)||headway<=0||end<=start||base===null){frequencies.push({trip,window,invalid:true});continue;}
          if(window.exact_times!=='1'){frequencies.push({trip,window,rows,base});continue;}
          for(let startAt=start;startAt<end;startAt+=headway){if(departures.length>=10000)throw Error('frequencyLimit');departures.push({offset:startAt-base,id:trip.trip_id+' @ '+clock(startAt)});}
        }
        const key=JSON.stringify([trip.route_id,trip.direction_id||'?',rows.map(row=>row.stop_id)]);
        for(const departure of departures){if(!patterns.has(key))patterns.set(key,{routeId:trip.route_id,direction:trip.direction_id||'?',stops:rows.map(row=>row.stop_id),trips:[]});patterns.get(key).trips.push({id:departure.id,sourceId:trip.trip_id,headsign:trip.trip_headsign||'',service:trip.service_id,times:rows.map(row=>{const v=seconds(row.departure_time||row.arrival_time);return v===null?null:v+departure.offset;})});tripCount++;}
      }
      for(const p of patterns.values())p.trips.sort((a,b)=>(a.times.find(v=>v!==null)??Infinity)-(b.times.find(v=>v!==null)??Infinity)||a.id.localeCompare(b.id));
      return {patterns:[...patterns.values()],frequencies,tripCount};
    }
    const coord=(lat,lon)=>clean(lat)!==''&&clean(lon)!==''&&Number.isFinite(+lat)&&Number.isFinite(+lon)&&Math.abs(+lat)<=85&&Math.abs(+lon)<=180;
    function routeModels(){return routes.map(route=>{const list=trips.filter(t=>t.route_id===route.route_id),shapeIds=[...new Set(list.map(t=>t.shape_id).filter(Boolean))],ids=new Set(list.flatMap(t=>(byTrip.get(t.trip_id)||[]).map(row=>row.stop_id))),points=[...ids].map(id=>stops.get(id)).filter(row=>row&&coord(row.stop_lat,row.stop_lon)).map(row=>({id:row.stop_id,name:row.stop_name,lat:+row.stop_lat,lon:+row.stop_lon}));
      const lines=shapeIds.map(id=>(byShape.get(id)||[]).filter(row=>coord(row.shape_pt_lat,row.shape_pt_lon)).map(row=>({lat:+row.shape_pt_lat,lon:+row.shape_pt_lon}))).filter(line=>line.length>1);
      return {routeId:route.route_id,label:route.route_short_name||route.route_id,name:route.route_long_name||'',color:/^[a-f0-9]{6}$/i.test(route.route_color||'')?'#'+route.route_color:'#557630',points,lines};}).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));}
    return {routes,trips,stops,services,schedules,routeModels,hasCalendar:Boolean(calendarValid&&bounds.length),start:bounds[0]||'',end:bounds.at(-1)||'',fallbackTiming:!hasTP&&!explicitTP};
  }
  function geometry(model){const pts=[...model.points,...model.lines.flat()];if(!pts.length)return null;const project=(p,z)=>{const scale=256*2**z,sin=Math.sin(p.lat*Math.PI/180);return {x:(p.lon+180)/360*scale,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale};};
    let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;for(const p of pts){const q=project(p,0);minx=Math.min(minx,q.x);maxx=Math.max(maxx,q.x);miny=Math.min(miny,q.y);maxy=Math.max(maxy,q.y);}
    const width=1000,height=480,zoom=Math.max(0,Math.min(18,Math.floor(Math.log2(Math.min((width-100)/Math.max(.0001,maxx-minx),(height-100)/Math.max(.0001,maxy-miny))))));const center={x:(minx+maxx)/2*2**zoom,y:(miny+maxy)/2*2**zoom};
    const unproject=(x,y)=>({lon:x/(256*2**zoom)*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*y/(256*2**zoom))))*180/Math.PI});const nw=unproject(center.x-width/2,center.y-height/2),se=unproject(center.x+width/2,center.y+height/2);
    return {width,height,zoom,center,bounds:{minlat:se.lat,maxlat:nw.lat,minlon:nw.lon,maxlon:se.lon},project:p=>{const q=project(p,zoom);return {x:q.x-center.x+width/2,y:q.y-center.y+height/2};}};
  }
  function mapSvg(model,base='',online=false){const g=geometry(model);if(!g)return '';const lines=model.lines.map(line=>'<polyline points="'+line.map(p=>{const q=g.project(p);return q.x.toFixed(1)+','+q.y.toFixed(1);}).join(' ')+'" fill="none" stroke="'+model.color+'" stroke-width="3" opacity=".75"/>').join('');const points=model.points.map(p=>{const q=g.project(p);return '<circle cx="'+q.x.toFixed(1)+'" cy="'+q.y.toFixed(1)+'" r="3" fill="white" stroke="'+model.color+'"><title>'+esc(p.id+' · '+p.name)+'</title></circle>';}).join('');return '<svg viewBox="0 0 1000 480" role="img" aria-label="'+esc(model.label+' · '+model.name)+'"><rect width="1000" height="480" fill="'+(online?'transparent':'#f4f2ec')+'"/>'+base+lines+points+'</svg>';}
  return {create,date,seconds,clock,geometry,mapSvg,esc,timetableRows,timetableHtml,headwayLabel,verticalLabelHeight};
}

function mountReportNetwork(data,getEdits){
  const tools=reportNetworkTools(),net=tools.create(data),en=data.language==='en',t=(fr,eng)=>en?eng:fr,e=tools.esc;
  let section=document.getElementById('network-report');if(!section){section=document.createElement('section');section.id='network-report';section.className='overview network-report';document.getElementById('report-top').after(section);}
  if(!net.routes.length||!net.trips.length){section.innerHTML='<h2>'+t('Routes et horaires','Routes and timetables')+'</h2><p>'+t('Chargez un GTFS avec routes.txt, trips.txt et stop_times.txt pour inclure les cartes et horaires.','Load a GTFS with routes.txt, trips.txt and stop_times.txt to include maps and timetables.')+'</p>';return {refresh(){},snapshot(){return {};}};}
  const routeModels=net.routeModels(),view={date:net.start,route:data.lazyNetwork?(net.routes[0]?.route_id||''):'',direction:'both',timing:true,compact:true,...data.networkView};
  if(!tools.date(view.date))view.date=net.start;
  const options=routeModels.map(r=>'<option value="'+e(r.routeId)+'">'+e(r.label+' · '+r.name)+'</option>').join('');
  section.innerHTML='<h2>'+t('Routes et horaires','Routes and timetables')+'</h2><div class="network-controls"><label>'+t('Date de service','Service date')+'<input data-network-date type="date" min="'+net.start+'" max="'+net.end+'"></label><button data-day="-1" type="button">← '+t('Veille','Previous day')+'</button><button data-day="1" type="button">'+t('Lendemain','Next day')+' →</button><label>'+t('Route','Route')+'<select data-network-route><option value="">'+t('Toutes les routes','All routes')+'</option>'+options+'</select></label><label>'+t('Direction','Direction')+'<select data-network-direction><option value="">'+t('Toutes','All')+'</option><option value="0">0</option><option value="1">1</option><option value="?">'+t('Non renseignée','Unspecified')+'</option></select></label><label><input data-network-timing type="checkbox"> '+t('Points horaires seulement','Timing points only')+'</label></div><p>'+t('Jour de service GTFS, exceptions incluses. Les heures supérieures à 24:00 appartiennent toujours au jour sélectionné.','GTFS service day, including exceptions. Times after 24:00 still belong to the selected service day.')+'</p><p data-network-status role="status"></p><div data-network-content></div>';
  const dateInput=section.querySelector('[data-network-date]'),routeInput=section.querySelector('[data-network-route]'),direction=section.querySelector('[data-network-direction]'),timing=section.querySelector('[data-network-timing]'),content=section.querySelector('[data-network-content]');
  direction.insertAdjacentHTML('afterbegin','<option value="both">'+t('Les deux directions','Both directions')+'</option>');
  section.querySelector('.network-controls').insertAdjacentHTML('beforeend','<label><input data-network-compact type="checkbox"> '+t('Vue condensée · tous les parcours','Condensed view · all patterns')+'</label>');
  const compact=section.querySelector('[data-network-compact]');compact.checked=view.compact!==false;
  section.querySelector('.network-controls').insertAdjacentHTML('beforeend','<button type="button" data-export-xlsx>'+t('Exporter Excel','Export Excel')+'</button><button type="button" data-export-pdf>'+t('Exporter PDF','Export PDF')+'</button>');
  const exportButtons=[...section.querySelectorAll('[data-export-xlsx],[data-export-pdf]')];
  function exportModel(){return reportTimetableExportTools().build(data,getEdits(),view);}
  section.querySelector('[data-export-xlsx]').addEventListener('click',()=>{try{const bytes=reportTimetableExportTools().xlsx(exportModel()),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download=(data.filename||'CSched').replace(/[^A-Za-z0-9_-]/g,'_')+'_timetables_'+view.date+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}catch(error){alert(t('Export impossible : ','Export failed: ')+error.message);}});
  section.querySelector('[data-export-pdf]').addEventListener('click',()=>{try{const html=reportTimetableExportTools().printHtml(exportModel()),dialog=document.createElement('dialog');dialog.setAttribute('aria-label',t('Aperçu PDF des horaires','Timetable PDF preview'));dialog.style.cssText='position:fixed;inset:12px;width:calc(100vw - 24px);height:calc(100vh - 24px);max-width:none;max-height:none;margin:0;padding:12px;border:1px solid #557630;background:white;z-index:10000';dialog.innerHTML='<button type="button" style="padding:8px 18px;margin-bottom:8px;border:0;border-radius:14px 0;background:#557630;color:white">'+t('Fermer l’aperçu','Close preview')+'</button><iframe title="'+t('Horaires à imprimer','Printable timetables')+'" style="width:100%;height:calc(100% - 48px);border:0"></iframe>';dialog.querySelector('iframe').srcdoc=html;dialog.querySelector('button').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{dialog.remove();section.querySelector('[data-export-pdf]').focus();});document.body.append(dialog);dialog.showModal();}catch(error){alert(t('Export impossible : ','Export failed: ')+error.message);}});
  // Keep the online OSM viewport at the same projection size as its SVG overlay.
  // Resize the complete canvas, not the iframe alone, when the report gets narrower.
  function sizeMap(node){const canvas=node.querySelector('.network-map-canvas');if(canvas)canvas.style.transform='scale('+node.clientWidth/1000+')';}
  const mapSizer=typeof ResizeObserver==='function'?new ResizeObserver(entries=>entries.forEach(entry=>sizeMap(entry.target))):null;
  if(!mapSizer)window.addEventListener('resize',()=>content.querySelectorAll('.network-map').forEach(sizeMap));
  dateInput.value=view.date;routeInput.value=view.route;direction.value=view.direction;timing.checked=view.timing;
  routeInput.setAttribute('aria-label',t('Route','Route'));direction.setAttribute('aria-label',t('Direction','Direction'));
  if(!net.hasCalendar){dateInput.disabled=true;section.querySelectorAll('[data-day]').forEach(b=>b.disabled=true);}
  function stopLabel(id){const row=net.stops.get(id)||{},edits=getEdits(),key=edits.assignments?.[id]??data.assignments[id],original=data.places.find(p=>p.key===key)||data.places.find(p=>p.exportId===row.parent_station),place=original?{...original,...edits.places.find(p=>p.key===original.key)}:null;return '<strong>'+e(id)+'</strong> · '+e(row.stop_name||'')+(place?(data.reportKind==='network'?'<br>'+e(place.code+' · '+place.description):'<br><a href="#'+e(place.key)+'">'+e(place.code+' · '+place.description)+'</a>'):row.parent_station?'<br>'+e(row.parent_station):'');}
  function render(){
    const collapsed=new Set([...content.querySelectorAll('details[data-route-map]:not([open])')].map(node=>node.dataset.routeMap));
    mapSizer?.disconnect();
    view.date=dateInput.value;view.route=routeInput.value;view.direction=direction.value;view.timing=timing.checked;view.compact=compact.checked;
    exportButtons.forEach(button=>button.disabled=true);
    let schedule={patterns:[],frequencies:[],tripCount:0};try{if(net.hasCalendar)schedule=net.schedules(view.date,view.route,view.direction==='both'?'':view.direction,view.timing);}catch(error){content.replaceChildren();section.querySelector('[data-network-status]').textContent=error.message==='frequencyLimit'?t('Trop de départs par fréquence pour ce rapport.','Too many frequency departures for this report.'):t('Impossible de calculer les horaires : vérifiez les données GTFS.','Unable to calculate timetables: check the GTFS data.');return;}
    exportButtons.forEach(button=>button.disabled=!schedule.tripCount&&!schedule.frequencies.length);
    section.querySelector('[data-network-status]').textContent=!net.hasCalendar?t('Calendrier absent ou invalide : horaires par date indisponibles. Les cartes restent accessibles.','Missing or invalid calendar: date-specific timetables unavailable. Maps are still available.'):!tools.date(view.date)?t('Choisissez une date valide.','Choose a valid date.'):schedule.tripCount+' '+t('départs à heure fixe','scheduled departures')+' · '+schedule.frequencies.length+' '+t('plages de fréquence','frequency windows')+(net.fallbackTiming&&view.timing?t(' · TP estimés à partir des secondes :00',' · Timing points inferred from :00 seconds'):'');
    content.innerHTML=routeModels.filter(r=>!view.route||r.routeId===view.route).map(route=>{
      const patterns=schedule.patterns.filter(p=>p.routeId===route.routeId).sort((a,b)=>a.direction.localeCompare(b.direction)),freq=schedule.frequencies.filter(f=>f.trip.route_id===route.routeId),map=(data.networkMaps||[]).find(m=>m.routeId===route.routeId);
      const patternHtml=(p,index)=>'<h4>'+t('Direction','Direction')+' '+e(p.direction)+' · '+t('Parcours','Pattern')+' '+(index+1)+'</h4>'+tools.timetableHtml(p,stopLabel,data.language,view.compact);
      let tables=view.direction==='both'?'<div class="network-both-scroll"><div class="network-both-directions">'+['0','1',...(patterns.some(p=>p.direction==='?')?['?']:[])].map(dir=>'<section class="network-direction"><h4>'+t('Direction','Direction')+' '+e(dir)+'</h4>'+(patterns.filter(p=>p.direction===dir).map((p)=>patternHtml(p,patterns.indexOf(p))).join('')||'<p>'+t('Aucun départ fixe dans cette direction.','No scheduled departures in this direction.')+'</p>')+'</section>').join('')+'</div></div>':patterns.map(patternHtml).join('');
      if(freq.length)tables+='<h4>'+t('Services à fréquence — pas de départs fixes','Frequency-based service — no fixed departures')+'</h4>'+freq.map(f=>'<p>Direction '+e(f.trip.direction_id||'?')+' · '+e(f.trip.trip_id)+' · '+(f.invalid?t('Fréquence invalide','Invalid frequency'):e(f.window.start_time)+' – '+e(f.window.end_time)+' · '+t('toutes les','every')+' '+Number(f.window.headway_secs)/60+' min')+'</p>').join('');
      return '<article class="network-route"><h3>'+e(route.label+' · '+route.name)+'</h3><details data-route-map="'+e(route.routeId)+'"'+(collapsed.has(route.routeId)?'':' open')+'><summary>'+t('Carte de la route','Route map')+'</summary>'+(map?.html||tools.mapSvg(route)||'<p>'+t('Coordonnées absentes.','No coordinates available.')+'</p>')+'<p>'+t('Carte fixe de tous les tracés de cette route, indépendante de la date sélectionnée.','Fixed map of all patterns for this route, independent of the selected date.')+(route.lines.length?'':t(' Aucun shape : seuls les stops sont affichés.',' No shapes: only stops are shown.'))+'</p></details>'+(!patterns.length&&!freq.length?'<p>'+t('Aucun horaire correspondant à ces filtres.','No timetables match these filters.')+'</p>':tables)+'</article>';
    }).join('');
    if(view.compact)content.querySelectorAll('.network-both-directions').forEach(pair=>{
      const labels=[...pair.querySelectorAll('.network-stop-label')],height=Math.max(96,...labels.map(label=>tools.verticalLabelHeight(label.innerHTML)));
      labels.forEach(label=>label.style.height=height+'px');
    });
    content.querySelectorAll('.network-map').forEach(node=>{sizeMap(node);mapSizer?.observe(node);});
    content.querySelectorAll('details[data-route-map]').forEach(node=>node.addEventListener('toggle',()=>node.querySelectorAll('.network-map').forEach(sizeMap)));
  }
  for(const input of [dateInput,routeInput,direction,timing,compact])input.addEventListener('change',render);
  section.querySelectorAll('[data-day]').forEach(button=>button.addEventListener('click',()=>{const d=tools.date(dateInput.value);if(!d)return;d.setUTCDate(d.getUTCDate()+Number(button.dataset.day));const next=d.toISOString().slice(0,10);if(next<net.start||next>net.end)return;dateInput.value=next;render();}));
  // Renaming a place must not rebuild every timetable or reload the OSM frames.
  render();return {refresh(){content.querySelectorAll('[data-network-stop]').forEach(cell=>{cell.innerHTML=stopLabel(cell.dataset.networkStop);if(cell.closest('.network-condensed'))cell.style.height=tools.verticalLabelHeight(cell.innerHTML)+'px';});},snapshot:()=>({...view})};
}
