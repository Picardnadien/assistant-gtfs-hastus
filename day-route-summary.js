/* Selected service day: route counts and existing paired timetable PDF renderer. */
(function(root){
  'use strict';
  const clean=v=>String(v??'').trim(),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const seconds=v=>{const m=clean(v).match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);return m?+m[1]*3600 + +m[2]*60 + +m[3]:null;};
  function build(analysis,date){
    const day=analysis.days.find(d=>d.date===date);if(!day)return {date,routes:[],fixed:0,frequency:0,invalid:0};
    const frequencies=new Map();for(const row of analysis.sources?.frequencies?.rows||[]){const id=clean(row.trip_id);if(!frequencies.has(id))frequencies.set(id,[]);frequencies.get(id).push(row);}
    const routes=new Map();
    for(const service of day.services)for(const trip of analysis.tripsByService.get(service)||[]){
      const id=clean(trip.route_id),tripId=clean(trip.trip_id),route=analysis.routeById.get(id);
      if(!routes.has(id))routes.set(id,{id,label:clean(route?.route_short_name)||id,name:clean(route?.route_long_name),fixed:0,directions:{'0':0,'1':0,'?':0},frequency:0,invalid:0,templates:0,withoutTiming:0,canPrint:false});
      const r=routes.get(id),direction=['0','1'].includes(clean(trip.direction_id))?clean(trip.direction_id):'?';
      r.templates++;const timing=analysis.timingRowsByTrip.get(tripId)||[];
      if(!timing.length)r.withoutTiming++;else if(route)r.canPrint=true;
      const windows=frequencies.get(tripId)||[];
      if(!windows.length){r.fixed++;r.directions[direction]++;continue;}
      const first=analysis.stopTimesByTrip.get(tripId)?.[0],base=seconds(first?.departure_time||first?.arrival_time);
      for(const window of windows){
        const start=seconds(window.start_time),end=seconds(window.end_time),headway=Number(window.headway_secs);
        if(start===null||end===null||end<=start||!Number.isSafeInteger(headway)||headway<=0||base===null){r.invalid++;continue;}
        if(clean(window.exact_times)!=='1'){r.frequency++;continue;}
        const count=Math.ceil((end-start)/headway);r.fixed+=count;r.directions[direction]+=count;
      }
    }
    const sorted=[...routes.values()].sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true})||a.id.localeCompare(b.id));
    return {date,routes:sorted,fixed:sorted.reduce((n,r)=>n+r.fixed,0),frequency:sorted.reduce((n,r)=>n+r.frequency,0),invalid:sorted.reduce((n,r)=>n+r.invalid,0)};
  }
  function render(model,language='fr'){
    const en=language==='en',t=(fr,enText)=>en?enText:fr;
    const rows=model.routes.map((r,index)=>`<tr><td><strong>${esc(r.label)}</strong><br><small>${esc(r.id)}</small></td><td>${esc(r.name)||'—'}${r.withoutTiming?`<p class="notice">${r.withoutTiming} ${t('voyage(s) sans timing point : absents du PDF.','trip(s) without timing points: omitted from PDF.')}</p>`:''}</td><td>${r.directions['0']}</td><td>${r.directions['1']}</td><td>${r.directions['?']}</td><td><strong>${r.fixed}</strong></td><td>${r.frequency}${r.invalid?`<br><span class="notice">${r.invalid} ${t('plage(s) invalide(s)','invalid window(s)')}</span>`:''}</td><td><button type="button" class="secondary route-day-pdf" ${r.canPrint?'':'disabled'} onclick="openDayRoutePdf(${index},this)" aria-label="${esc(t('PDF des deux directions — route ','Both-directions PDF — route ')+r.label)}">PDF ↗</button></td></tr>`).join('');
    return `<section id="day-route-summary" class="day-route-summary" data-no-translate><h3>${t('Synthèse par route du ','Route summary for ')}${esc(model.date)}</h3><p><strong>${model.fixed} ${t('voyages à départ fixe','fixed-departure trips')}</strong> · ${model.routes.length} ${t('routes en service','active routes')}</p><p>${t('Le PDF reprend tous les parcours de la route pour cette date : deux directions côte à côte, codes de place horizontaux, numéros de voyage et routes.','The PDF includes all route patterns for this date: both directions side by side, horizontal place codes, trip numbers and routes.')}</p><p class="muted">${t('Les départs fixes définis par frequencies.txt sont développés. Les plages sans départs fixes sont comptées séparément, sans inventer un nombre de voyages. Direction ? = non renseignée.','Fixed departures in frequencies.txt are expanded. Windows without fixed departures are counted separately, without inventing a trip count. Direction ? = unspecified.')}</p>${model.routes.length?`<div class="table-scroll"><table class="volume-table"><thead><tr>${['Route',t('Description','Description'),'Dir. 0','Dir. 1','Dir. ?',t('Voyages fixes','Fixed trips'),t('Plages par fréquence','Headway windows'),'PDF'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="5">Total</th><th>${model.fixed}</th><th>${model.frequency}</th><td></td></tr></tfoot></table></div>`:`<p class="notice">${t('Aucun voyage en service ce jour.','No active trips on this date.')}</p>`}<p id="day-route-pdf-status" role="status"></p></section>`;
  }
  function placeLabels(stops,options={}){
    const labels=new Map(),cache=options.geographicCache,remap=new Map(cache?.stopIdRemap||[]);
    function read(rows){const byId=new Map(rows.map(s=>[clean(s.stop_id),s]));for(const s of rows){
      const parent=clean(s.parent_station),station=byId.get(parent),isPlace=clean(s.location_type)==='1';
      labels.set(clean(s.stop_id),{code:parent?(clean(station?.stop_code)||parent):(isPlace?(clean(s.stop_code)||clean(s.stop_id)):''),name:clean(s.stop_name)+(station?' / '+clean(station.stop_name):'')});
    }}
    read(stops.rows);if(options.workingStops)read(options.workingStops.rows);
    for(const [oldId,newId] of remap)if(labels.has(newId))labels.set(oldId,labels.get(newId));
    // Resolve the cached decisions, not the active context (which is now comparison).
    for(const d of cache?.decisions||[]){if(d.status==='error')continue;let p;
      if(cache.clientType==='new'){const g=cache.groups?.find(g=>g.id===d.groupId);if(g)p={id:g.code,description:g.description};}
      else if(d.choice==='__new__')p={id:d.newCode,description:d.description};
      else p=d.candidates?.find(p=>p.id===d.choice)||cache.places?.find(p=>p.id===d.choice);
      if(!p||!clean(p.id))continue;
      for(const id of [d.originalId,d.id,remap.get(d.originalId||d.id)].filter(Boolean))labels.set(clean(id),{code:clean(p.id),name:clean(p.description)||clean(d.description)});
    }
    return Object.fromEntries(labels);
  }
  function pdf(analysis,date,routeId,language,clientName,options={}){
    const s=analysis.sources;if(!s)throw Error('Relancez la comparaison des horaires. / Run schedule comparison again.');
    const day=analysis.days.find(d=>d.date===date);if(!day)throw Error('Date inconnue / Unknown date');
    const active=new Set(day.services),trips=s.trips.rows.filter(t=>clean(t.route_id)===routeId&&active.has(clean(t.service_id))),ids=new Set(trips.map(t=>clean(t.trip_id)));
    // Build only this route/day; no map, GTFS compression or full-network report is needed.
    const times={headers:s.times.headers,rows:trips.flatMap(t=>analysis.stopTimesByTrip.get(clean(t.trip_id))||[])},stopIds=new Set(times.rows.map(t=>clean(t.stop_id)));
    const stops={headers:s.stops.headers,rows:s.stops.rows.filter(r=>stopIds.has(clean(r.stop_id))||clean(r.location_type)==='1')};
    const tables={'routes.txt':{headers:s.routes.headers,rows:s.routes.rows.filter(r=>clean(r.route_id)===routeId)},'trips.txt':{headers:s.trips.headers,rows:trips}};
    for(const [name,key] of [['calendar.txt','calendar'],['calendar_dates.txt','calendarDates']])if(s[key])tables[name]=s[key];
    if(s.frequencies)tables['frequencies.txt']={headers:s.frequencies.headers,rows:s.frequencies.rows.filter(r=>ids.has(clean(r.trip_id)))};
    const places=stops.rows.filter(r=>clean(r.location_type)==='1').map(r=>({key:r.stop_id,exportId:r.stop_id,code:r.stop_id,description:r.stop_name}));
    const data={language,clientName,gtfs:{stops,times},networkTables:tables,places};
    const tools=reportTimetableExportTools(),model=tools.build(data,{}, {date,route:routeId,direction:'both',timing:true,compact:true});
    const route=tables['routes.txt'].rows[0];
    const byTrip=new Map(trips.map(t=>[clean(t.trip_id),t]));
    for(const block of model.blocks)for(const row of block.rows){const trip=byTrip.get(row.sourceId)||{};row.tripNumber=clean(trip.trip_short_name)||row.id;}
    model.workingRoute=route?.route_long_name||routeId;model.workingRouteCode=route?.route_short_name||routeId;
    model.workingStops=placeLabels(stops,options);
    model.omitted=trips.filter(t=>!(analysis.timingRowsByTrip.get(clean(t.trip_id))||[]).length).length;
    const html=WorkingTimetable.html(model);
    return {html,model};
  }
  root.DayRouteSummary={build,render,pdf,placeLabels};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.DayRouteSummary;
})(typeof globalThis!=='undefined'?globalThis:this);
