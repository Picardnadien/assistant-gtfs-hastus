/* Browser adaptation of build_rte333wk.py: Letter, Helvetica, 8.25 pt times,
   12 pt rows and a central rule. Feed data replaces the script's fixed route/client. */
function workingTimetableTools(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Shortest common supersequence preserves each pattern's order and repeated stops (loops).
  function merge(a,b){
    const dp=Array.from({length:a.length+1},()=>new Uint32Array(b.length+1));
    for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
    let i=0,j=0;const result=[];
    while(i<a.length&&j<b.length){if(a[i]===b[j]){result.push(a[i++]);j++;}else if(dp[i+1][j]>=dp[i][j+1])result.push(a[i++]);else result.push(b[j++]);}
    return result.concat(a.slice(i),b.slice(j));
  }
  function direction(blocks){
    let stops=[];for(const block of [...blocks].sort((a,b)=>b.stopIds.length-a.stopIds.length))stops=merge(stops,block.stopIds);
    const rows=[];
    for(const block of blocks){
      let next=0;const positions=block.stopIds.map(id=>{while(next<stops.length&&stops[next]!==id)next++;return next++;});
      for(const row of block.rows){const times=Array(stops.length).fill(null);positions.forEach((pos,index)=>times[pos]=row.times[index]??null);rows.push({...row,times,pattern:block.pattern,departure:row.times.find(Number.isFinite)??Infinity});}
    }
    rows.sort((a,b)=>a.departure-b.departure||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
    return {stops,rows};
  }
  function clock(value,format='ampm'){
    if(!Number.isFinite(value))return '........';
    const hours=Math.floor(value/3600),minutes=Math.floor(value/60)%60,seconds=value%60,day=Math.floor(hours/24),h=hours%24;
    if(format==='military')return `${String(h).padStart(2,'0')}:${String(minutes).padStart(2,'0')}${seconds?':'+String(seconds).padStart(2,'0'):''}${day?' +'+day:''}`;
    return `${h%12||12}${String(minutes).padStart(2,'0')}${seconds?':'+String(seconds).padStart(2,'0'):''}${h<12?'a':'p'}${day?' +'+day:''}`;
  }
  const headway=value=>Number.isFinite(value)?`${Math.floor(value/60)}${value%60?':'+String(value%60).padStart(2,'0'):''}`:'-';
  const timeMarkup=value=>Number.isFinite(value)?`<span class="ampm">${clock(value)}</span><span class="military">${clock(value,'military')}</span>`:'........';
  const timeSeconds=value=>{const m=String(value||'').match(/^(\d+):([0-5]\d):([0-5]\d)$/);return m?+m[1]*3600 + +m[2]*60 + +m[3]:null;};
  function html(model){
    const en=model.language==='en',t=(fr,eng)=>en?eng:fr,info=model.workingStops||{},left=direction(model.blocks.filter(b=>b.direction==='0')),right=direction(model.blocks.filter(b=>b.direction==='1'));
    const otherDirections=[...new Set(model.blocks.map(b=>b.direction).filter(d=>!['0','1'].includes(d)))];
    const groups=[{left,right,label:left.rows.length&&right.rows.length?'Directions 0 / 1':left.rows.length?'Direction 0':'Direction 1'},...otherDirections.map(d=>({left:direction(model.blocks.filter(b=>b.direction===d)),right:{stops:[],rows:[]},label:t('Direction non renseignée','Unspecified direction')+' ('+d+')'}))];
    const maxPoints=Math.max(0,...groups.flatMap(g=>[g.left.stops.length,g.right.stops.length]));
    const paired=groups.some(g=>g.left.rows.length&&g.right.rows.length);
    const landscape=Boolean(model.workingLandscape||(paired?maxPoints>4:maxPoints>10));
    const pointIds=groups.flatMap(g=>[...g.left.stops,...g.right.stops]);
    const widestCode=pointIds.reduce((n,id)=>Math.max(n,String(info[id]?.code||'—').length),1);
    const widestTime=model.blocks.reduce((n,b)=>b.rows.reduce((m,row)=>row.times.reduce((v,time)=>Number.isFinite(time)?Math.max(v,clock(time,'military').length,clock(time).length):v,m),n),5);
    const maxRows=Math.max(0,...groups.flatMap(g=>[g.left.rows.length,g.right.rows.length]));
    const dense=maxPoints>4||maxRows>(landscape?27:38),font=dense?7.5:8.25;
    const pageWidth=landscape?757:575,sideWidth=paired?(pageWidth-8)/2:pageWidth;
    const timeWidth=Math.max(25,widestTime*font*.6+3);
    const vertical=true;
    const pointWidth=timeWidth;
    // A single direction gets the whole printable width. Narrow headers let
    // both directions keep all their timing points together whenever they fit.
    const columns=Math.max(1,Math.floor((sideWidth-82)/pointWidth));
    const headerHeight=Math.max(54,widestCode*4.8+10);
    const metaLines=Math.max(Math.ceil(String(model.workingRouteCode||'').length/5),model.blocks.reduce((n,b)=>b.rows.reduce((m,r)=>Math.max(m,Math.ceil(String(r.tripNumber||r.id).length/7)),n),1));
    const rowHeight=dense?10:12,rowLine=dense?8.5:10;
    const capacity=Math.max(1,Math.floor(((landscape?575:757)-104-headerHeight)/Math.max(rowHeight,metaLines*rowLine+2)));
    const pageRows=dense?capacity:Math.min(landscape?27:38,capacity);
    const pages=[],route=model.blocks[0]?.route||model.workingRoute||'',code=model.workingRouteCode||'';
    const stopCode=id=>info[id]?.code||'—';
    function sideHead(stops,isRight){
      const meta=[`<th class="hw">HW</th>`,`<th class="trip">${t('Voyage','Trip')}<br>${t('N°','Number')}</th>`,`<th class="route">Route</th>`];
      const points=stops.map(id=>`<th class="point" title="${esc(info[id]?.name||id)}"><span class="point-code">${esc(stopCode(id))}</span></th>`);
      return (isRight?[...points,...meta.slice(1),meta[0]]:[...meta,...points]).join('');
    }
    function sideCells(row,stops,offset,isRight){
      const cells=row?[`<td class="hw">${headway(row.headway)}</td>`,`<td class="trip">${esc(row.tripNumber||row.id)}</td>`,`<td class="route">${esc(code)}</td>`]:['<td></td>','<td></td>','<td></td>'];
      const points=stops.map((_,i)=>`<td class="time">${row?timeMarkup(row.times[offset+i]):''}</td>`);
      return (isRight?[...points,...cells.slice(1),cells[0]]:[...cells,...points]).join('');
    }
    for(const group of groups){
      const l=group.left,r=group.right;if(!l.rows.length&&!r.rows.length)continue;
      for(let start=0;start<Math.max(l.rows.length,r.rows.length);start+=pageRows)for(let point=0;point<Math.max(l.stops.length,r.stops.length);point+=columns){
        const ls=l.stops.slice(point,point+columns),rs=r.stops.slice(point,point+columns),length=Math.min(pageRows,Math.max(l.rows.length,r.rows.length)-start);
        const hasLeft=ls.length>0&&l.rows.length>0,hasRight=rs.length>0&&r.rows.length>0;
        const table=`<table class="working-grid" style="--grid-font:${font}pt;--row-height:${rowHeight}pt;--row-line:${rowLine}pt;--head-height:${headerHeight}pt" data-vertical="${vertical}"><thead><tr>${hasLeft?sideHead(ls,false):''}${hasLeft&&hasRight?'<th class="divider"></th>':''}${hasRight?sideHead(rs,hasLeft):''}</tr></thead><tbody>${Array.from({length},(_,i)=>`<tr>${hasLeft?sideCells(l.rows[start+i],ls,point,false):''}${hasLeft&&hasRight?'<td class="divider"></td>':''}${hasRight?sideCells(r.rows[start+i],rs,point,hasLeft):''}</tr>`).join('')}</tbody></table>`;
        pages.push({label:group.label+' · '+t('Voyages','Trips')+` ${start+1}-${start+length}`+(maxPoints>columns?' · '+t('Points','Points')+` ${point+1}-${Math.min(point+columns,maxPoints)}`:''),content:table,tableHeight:headerHeight+length*Math.max(rowHeight,metaLines*rowLine+2)});
      }
    }
    const unique=[...new Set(groups.flatMap(g=>[...g.left.stops,...g.right.stops]))];
    // A separate key preserves full names without making timetable column headers illegible.
    for(let start=0;start<unique.length;start+=24)pages.push({label:t('Légende des points horaires','Timing point key'),content:`<table class="key-table"><thead><tr><th>${t('Code de place','Place code')}</th><th>Stop ID</th><th>${t('Description complète','Full description')}</th></tr></thead><tbody>${unique.slice(start,start+24).map(id=>`<tr><td>${esc(stopCode(id))}</td><td>${esc(id)}</td><td>${esc(info[id]?.name||id)}</td></tr>`).join('')}</tbody></table>`});
    for(let start=0;start<model.frequencies.length;start+=24)pages.push({label:t('Services par fréquence sans départs fixes','Headway-based services without fixed departures'),content:`<table class="key-table"><thead><tr><th>Route</th><th>Direction</th><th>${t('Voyage','Trip')}</th><th>${t('Début','Start')}</th><th>${t('Fin','End')}</th><th>HW</th></tr></thead><tbody>${model.frequencies.slice(start,start+24).map(f=>`<tr>${[f.route,f.direction,f.trip].map(v=>`<td>${esc(v)}</td>`).join('')}<td>${timeMarkup(timeSeconds(f.start))}</td><td>${timeMarkup(timeSeconds(f.end))}</td><td>${esc(f.invalid?t('Invalide','Invalid'):headway(f.headway))}</td></tr>`).join('')}</tbody></table>`});
    if(!pages.length)pages.push({label:t('Aucun horaire','No timetable'),content:'<p>'+t('Aucun voyage avec timing point pour cette date.','No trips with timing points on this date.')+'</p>'});
    const keyIndex=pages.findIndex(p=>p.label===t('Légende des points horaires','Timing point key'));
    if(unique.length<=3&&unique.every(id=>String(info[id]?.name||id).length<=80)&&keyIndex>0&&pages[keyIndex-1].tableHeight+(unique.length+1)*20+24<=(landscape?575:757)-130){const key=pages.splice(keyIndex,1)[0];pages[keyIndex-1].content+='<h4>'+esc(key.label)+'</h4>'+key.content;}
    const title=[model.client||'CSched',code,'Timetable',model.service||model.date].join('_');
    return `<!doctype html><html lang="${en?'en':'fr'}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page{size:letter ${landscape?'landscape':'portrait'};margin:6mm}
      *{box-sizing:border-box}body{margin:0;color:#111;background:#edf0ed;font:8.25pt/1.2 Helvetica,Arial,sans-serif}
      .working-page{width:${landscape?'267':'203'}mm;min-height:${landscape?'203':'267'}mm;margin:16px auto;background:#fff;display:flex;flex-direction:column;break-after:page;box-shadow:0 3px 20px #20303512}.working-page:last-child{break-after:auto}
      .working-header{display:grid;grid-template-columns:1fr 2fr 1fr;gap:8pt;align-items:start;padding:6pt 0 8pt;border-bottom:.55pt solid #111;font-size:8.5pt;overflow-wrap:anywhere}.working-header strong{text-align:center;font-size:10pt}.working-header span:last-child{text-align:right}
      .route-title{font-size:8.5pt;line-height:1.4;margin:8pt 0 10pt}.working-grid{width:100%;border-collapse:collapse;table-layout:fixed;font-size:var(--grid-font,8.25pt)}.working-grid th{height:var(--head-height,28pt);padding:2pt 1pt 5pt;text-align:center;vertical-align:bottom;font-size:var(--grid-font,8.25pt);font-weight:400;overflow-wrap:anywhere}.working-grid td{height:var(--row-height,12pt);padding:0 1pt;text-align:center;vertical-align:middle;line-height:var(--row-line,10pt);overflow-wrap:anywhere}
      .working-grid[data-vertical="true"] .point-code{display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;line-height:1.1}.working-grid .point-code{font-weight:600}
      .working-grid .hw{width:18pt;font-size:7pt}.working-grid .trip{width:36pt}.working-grid .route{width:28pt}.working-grid .time{font-variant-numeric:tabular-nums;white-space:nowrap}.working-grid .divider{width:8pt;padding:0;border-left:.35pt solid #111}.working-grid tr,.key-table tr{break-inside:avoid}thead{display:table-header-group}
      .working-footer{margin-top:auto;display:flex;justify-content:space-between;gap:8pt;border-top:.55pt solid #111;padding-top:6pt;font-size:7.5pt}.working-note{font-size:7pt;line-height:1.35;margin:8pt 0}.working-page h4{font-size:8pt;margin:10pt 0 4pt}.key-table{border-collapse:collapse;width:100%;font-size:8pt}.key-table th,.key-table td{text-align:left;border-bottom:.35pt solid #ddd;padding:4pt;overflow-wrap:anywhere}.key-table th:first-child,.key-table th:nth-child(2){width:18%}
      .print-controls{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:16px;max-width:1100px;margin:auto;font:13px Arial,sans-serif}.print-controls button{padding:10px 20px;border:1px solid #526460;background:#fff;border-radius:8px;color:#243237;cursor:pointer}.print-controls p{flex-basis:100%;margin:0}.time-switch{display:flex;align-items:center;gap:8px;margin-left:auto}.time-switch label{cursor:pointer;padding:9px 15px;border:1px solid #bcc9c5;border-radius:6px;background:#fff}.time-choice{position:absolute;width:1px;height:1px;opacity:0}
      #time-ampm:checked~.print-controls label[for=time-ampm],#time-military:checked~.print-controls label[for=time-military]{background:#344e47;color:#fff;border-color:#344e47}
      #time-ampm:focus-visible~.print-controls label[for=time-ampm],#time-military:focus-visible~.print-controls label[for=time-military]{outline:3px solid #608da3;outline-offset:2px}
      .military{display:none}#time-military:checked~.working-page .ampm{display:none}#time-military:checked~.working-page .military{display:inline}
      @media print{.print-controls,.time-choice{display:none}body{background:#fff}.working-page{margin:0;width:100%;box-shadow:none}.working-header,.route-title{break-after:avoid}}
      </style></head><body><input class="time-choice" type="radio" name="time-format" id="time-ampm" aria-label="AM/PM" ${model.timeFormat!=='military'?'checked':''}><input class="time-choice" type="radio" name="time-format" id="time-military" aria-label="Military (24 h)" ${model.timeFormat==='military'?'checked':''}><div class="print-controls"><button onclick="window.print()">${t('Imprimer / Enregistrer en PDF','Print / Save as PDF')}</button><div class="time-switch" role="group" aria-label="${t('Format des heures','Time format')}"><span>${t('Heures','Times')}</span><label for="time-ampm">AM/PM</label><label for="time-military">Military (24 h)</label></div><p>${model.service?t('Un service GTFS. Les dates d’application dépendent du calendrier. Désactivez les en-têtes et pieds de page du navigateur.','One GTFS service. Operating dates depend on the calendar. Turn off browser headers and footers.'):t('Les données proviennent de la route et de la date sélectionnées. Désactivez les en-têtes et pieds de page du navigateur.','Data comes from the selected route and service date. Turn off browser headers and footers.')}</p></div>${pages.map((page,index)=>`<section class="working-page" data-layout="rte333wk"><header class="working-header"><span>${esc(model.client||'CSched')}</span><strong>${paired?t('Horaire de travail - Deux directions','Working Timetable Report - Both Directions'):t('Horaire de travail','Working Timetable Report')}</strong><span>${model.service?'Service':t('Date de service','Service date')}: ${esc(model.service||model.date)}</span></header><p class="route-title"><strong>${esc(route)}</strong><br>${esc(page.label)}</p>${page.content}<p class="working-note">${t('Tri chronologique indépendant par direction ; une même ligne ne confirme pas un enchaînement. HW = minutes entre voyages du même parcours au premier timing point. Pointillés = point non desservi ou heure manquante. +1 = lendemain, toujours dans le même jour de service. Codes de place en en-tête ; — = aucune place affectée (voir la légende).','Each direction is sorted independently; a shared row does not imply a vehicle connection. HW = minutes between trips of the same pattern at its first timing point. Dots = unserved point or missing time. +1 = next day within the same service day. Headers show place codes; — = no assigned place (see key).')}${model.omitted?'<br>'+model.omitted+' '+t('voyage(s) sans timing point non affiché(s).','trip(s) without timing points not shown.'):''}${model.fallbackTiming?'<br>'+t('Timing points déduits des secondes :00.','Timing points inferred from :00 seconds.'):''}</p><footer class="working-footer"><span>CSched - ${t('Préparation GTFS / HASTUS','GTFS / HASTUS preparation')}</span><span>${index===pages.length-1?t('- FIN -','- END -'):''}</span><span>Page ${index+1} / ${pages.length}</span></footer></section>`).join('')}</body></html>`;
  }
  // Each route keeps its own grids; never merge points or trips across routes.
  function report(model){
    const ids=[...new Set([...model.blocks.map(b=>b.routeId),...model.frequencies.map(f=>f.routeId)])].filter(id=>id!==undefined);
    if(!ids.length)return html(model);
    const docs=ids.map(id=>html({...model,workingLandscape:ids.length>1,workingRouteCode:model.routeCodes?.[id]||model.workingRouteCode||id,workingRoute:model.routeNames?.[id]||id,blocks:model.blocks.filter(b=>b.routeId===id),frequencies:model.frequencies.filter(f=>f.routeId===id)}));
    if(docs.length===1)return docs[0];
    const pages=docs.map(doc=>doc.slice(doc.indexOf('<section class="working-page" data-layout="rte333wk">'),doc.lastIndexOf('</body>'))).join('');
    return docs[0].slice(0,docs[0].indexOf('<section class="working-page" data-layout="rte333wk">'))+pages+'</body></html>';
  }
  return {html,report,merge,direction,clock};
}
var WorkingTimetable=workingTimetableTools();
if(typeof module!=='undefined'&&module.exports)module.exports=WorkingTimetable;
