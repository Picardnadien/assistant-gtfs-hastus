/* Read-only HASTUS import-date recommendations. No GTFS IDs are rewritten. */
(function(root){
  'use strict';
  const text=value=>String(value??'').trim();
  const canonical=(row,omit)=>JSON.stringify(Object.keys(row).filter(key=>!omit.has(key)&&text(row[key])!=='').sort().map(key=>[key,text(row[key])]));
  const weekdays=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const labels={fr:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],en:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function build(analysis,frequencies){
    const frequencyRows=new Map();
    for(const row of frequencies?.rows||[]){const id=text(row.trip_id);if(!frequencyRows.has(id))frequencyRows.set(id,[]);frequencyRows.get(id).push(row);}
    const identities=new Map(),metadata=new Map(),serviceTokens=new Map();
    const omitTrip=new Set(['trip_id','service_id','_count']),omitStop=new Set(['trip_id','stop_sequence']),omitFrequency=new Set(['trip_id']);
    for(const [service,trips] of analysis.tripsByService){
      const tokens=[];
      for(const trip of trips){
        const id=text(trip.trip_id),rows=analysis.stopTimesByTrip.get(id)||[],freq=frequencyRows.get(id)||[];
        // Exact strings are interned, not hashed: equal counts or hash collisions never merge different schedules.
        // Missing stop times retain trip identity to avoid claiming unverified equivalence.
        const key=JSON.stringify([canonical(trip,omitTrip),rows.map(row=>canonical(row,omitStop)),freq.map(row=>canonical(row,omitFrequency)).sort(),rows.length?'':id]);
        if(!identities.has(key)){const token=identities.size;identities.set(key,token);metadata.set(token,{route:text(trip.route_id),missing:!rows.length,frequency:freq.some(row=>text(row.exact_times)!=='1')});}
        const token=identities.get(key);tokens.push(token);
      }
      serviceTokens.set(service,tokens);
    }
    const byServices=new Map(),bySignature=new Map(),profiles=[];
    for(const day of analysis.days){
      const serviceKey=JSON.stringify([...day.services].sort());let profile=byServices.get(serviceKey);
      if(!profile){
        const tokens=day.services.flatMap(id=>serviceTokens.get(id)||[]).sort((a,b)=>a-b),signature=JSON.stringify(tokens);
        profile=bySignature.get(signature);
        if(!profile){
          const counts=new Map();for(const token of tokens)counts.set(token,(counts.get(token)||0)+1);
          profile={id:`IMPORT_${String(profiles.length+1).padStart(2,'0')}`,days:[],dates:[],counts,tripCount:tokens.length,routeIds:[...new Set(tokens.map(token=>metadata.get(token).route))].sort(),missing:tokens.some(token=>metadata.get(token).missing),frequency:tokens.some(token=>metadata.get(token).frequency)};
          profiles.push(profile);bySignature.set(signature,profile);
        }
        byServices.set(serviceKey,profile);
      }
      profile.days.push(day);profile.dates.push(day.date);
    }
    const baseline=profiles.filter(p=>p.tripCount).sort((a,b)=>b.days.length-a.days.length||a.dates[0].localeCompare(b.dates[0]))[0];
    for(const p of profiles){
      const ordinary=p.days.filter(day=>!day.exceptions?.length),candidates=ordinary.length?ordinary:p.days;
      const weekdayCounts=new Map();for(const day of candidates)weekdayCounts.set(day.weekday,(weekdayCounts.get(day.weekday)||0)+1);
      p.representative=[...candidates].sort((a,b)=>weekdayCounts.get(b.weekday)-weekdayCounts.get(a.weekday)||weekdays.indexOf(a.weekday)-weekdays.indexOf(b.weekday)||a.date.localeCompare(b.date))[0];
      p.weekdays=weekdays.filter(day=>p.days.some(d=>d.weekday===day));
      p.exceptionDates=p.days.filter(day=>day.exceptions?.length).map(day=>day.date);
      p.kind=!p.tripCount?'empty':p===baseline?'baseline':p.days.length===1?'oneoff':'recurring';
      p.added=0;p.removed=0;const changed=new Set();
      if(baseline&&p!==baseline)for(const token of new Set([...p.counts.keys(),...baseline.counts.keys()])){
        const delta=(p.counts.get(token)||0)-(baseline.counts.get(token)||0);
        if(delta){changed.add(metadata.get(token).route);if(delta>0)p.added+=delta;else p.removed-=delta;}
      }
      p.changedRoutes=[...changed].sort();
    }
    profiles.sort((a,b)=>(a.kind==='baseline'?-1:b.kind==='baseline'?1:0)||(a.kind==='empty'?1:b.kind==='empty'?-1:0)||a.dates[0].localeCompare(b.dates[0]));
    return {profiles,baselineId:baseline?.id,importCount:profiles.filter(p=>p.tripCount).length,dateProfile:new Map(profiles.flatMap(p=>p.dates.map(date=>[date,p.id])))};
  }
  function copy(lang){return lang==='en'?{
    title:'Suggested dates to import into HASTUS',intro:'One representative date per distinct network schedule. Select these calendar dates in HASTUS, then apply each schedule only to its listed operating dates.',
    scope:'Comparison covers all routes and all stops, times, directions, trip attributes and frequency windows. Different service_id / trip_id values alone do not create another import. Other GTFS tables (e.g. transfers) are not compared.',
    types:'distinct schedules to import',profile:'Service profile',date:'Suggested date',coverage:'Operating dates',difference:'Difference from the most frequent schedule',action:'Review',view:'View this date',export:'Download import plan (CSV)',
    baseline:'Most frequent schedule',recurring:'Recurring variation',oneoff:'Single-date variation',empty:'No service — do not import',days:'days',routes:'routes',trips:'GTFS trips / frequency templates',detail:'Show all dates and service IDs',explicit:'Dates listed in calendar_dates.txt',
    same:'Comparison baseline',changed:'Routes to review',delta:'Added / removed trip definitions',caution:'These are suggestions, not automatic HASTUS imports. A changed trip counts as one removed and one added definition; this is not a count of extra vehicle departures. Review local HASTUS import rules and calendar assignments.',
    frequency:'Headway-based service: exact departure times are not guaranteed.',missing:'Missing stop times: review this profile before importing.',none:'No active trips',source:'Calendar services on the suggested date'
  }:{
    title:'Dates suggérées pour les imports HASTUS',intro:'Une date représentative par horaire distinct du réseau. Sélectionnez ces jours calendaires dans HASTUS, puis appliquez chaque horaire uniquement aux dates de circulation listées.',
    scope:'Comparaison de toutes les routes et de tous les arrêts, heures, directions, attributs des voyages et plages de fréquence. Des service_id / trip_id différents ne déclenchent pas à eux seuls un import supplémentaire. Les autres tables GTFS (ex. transfers) ne sont pas comparées.',
    types:'horaires distincts à importer',profile:'Profil de service',date:'Date suggérée',coverage:'Dates de circulation',difference:'Écart avec l’horaire le plus fréquent',action:'Vérification',view:'Voir cette journée',export:'Télécharger le plan d’import (CSV)',
    baseline:'Horaire le plus fréquent',recurring:'Variation récurrente',oneoff:'Variation ponctuelle',empty:'Sans service — ne pas importer',days:'jours',routes:'routes',trips:'voyages GTFS / modèles de fréquence',detail:'Voir toutes les dates et les services',explicit:'Dates présentes dans calendar_dates.txt',
    same:'Référence de comparaison',changed:'Routes à vérifier',delta:'Définitions de voyages ajoutées / retirées',caution:'Suggestions uniquement : aucun import automatique dans HASTUS. Un voyage modifié compte comme une définition retirée et une ajoutée ; il ne s’agit pas d’un nombre de départs supplémentaires. Validez les règles d’import HASTUS et les affectations calendaires.',
    frequency:'Service par intervalle : les heures exactes de départ ne sont pas garanties.',missing:'Heures de passage manquantes : vérifier ce profil avant import.',none:'Aucun voyage actif',source:'Services calendaires à la date suggérée'
  };}
  function render(plan,analysis,lang='fr'){
    const c=copy(lang),dayLabel=day=>labels[lang==='en'?'en':'fr'][weekdays.indexOf(day)]||day;
    const routeLabel=id=>{const r=analysis.routeById.get(id);return r?`${text(r.route_short_name)||id}${text(r.route_long_name)?' · '+text(r.route_long_name):''} [${id}]`:id;};
    const rows=plan.profiles.map(p=>`<tr><td><strong>${esc(p.id)}</strong><br>${c[p.kind]}<br><small>${p.tripCount} ${c.trips} · ${p.routeIds.length} ${c.routes}</small>${p.frequency?`<p class="notice">${c.frequency}</p>`:''}${p.missing?`<p class="notice">${c.missing}</p>`:''}</td><td><strong>${p.representative.date}</strong><br>${dayLabel(p.representative.weekday)}${!p.tripCount?`<br>${c.none}`:''}</td><td>${p.days.length} ${c.days} · ${p.weekdays.map(dayLabel).join(', ')}<br>${p.dates[0]} → ${p.dates.at(-1)}<details><summary>${c.detail}</summary><p>${p.dates.join(', ')}</p><p>${c.source}: ${p.representative.services.map(esc).join(', ')||'—'}</p><p>${c.explicit}: ${p.exceptionDates.join(', ')||'—'}</p></details></td><td>${p.kind==='baseline'?c.same:`${c.delta}: +${p.added} / −${p.removed}<details><summary>${c.changed} (${p.changedRoutes.length})</summary>${p.changedRoutes.map(id=>`<div>${esc(routeLabel(id))}</div>`).join('')}</details>`}</td><td><button type="button" class="secondary" onclick="selectTimetableDate('${p.representative.date}')">${c.view}</button></td></tr>`).join('');
    return `<section id="service-import-plan" class="service-import-plan" data-no-translate><h3>${c.title}</h3><p><strong>${plan.importCount} ${c.types}</strong> · ${analysis.start} → ${analysis.end}</p><p>${c.intro}</p><p class="muted">${c.scope}</p><button type="button" class="secondary" onclick="downloadServiceImportPlan()">${c.export}</button><div class="table-scroll"><table class="volume-table"><thead><tr>${[c.profile,c.date,c.coverage,c.difference,c.action].map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><p class="notice">${c.caution}</p></section>`;
  }
  function csv(plan,lang='fr'){
    const c=copy(lang),rows=[[c.profile,c.date,c.coverage,c.source,c.explicit,c.changed,c.delta,'Import']];
    for(const p of plan.profiles)rows.push([`${p.id} · ${c[p.kind]}`,p.representative.date,p.dates.join(' | '),p.representative.services.join(' | '),p.exceptionDates.join(' | '),p.changedRoutes.join(' | '),`+${p.added} / -${p.removed}`,p.tripCount?'1':'0']);
    // Spreadsheet formula protection applies to descriptive/client-originated fields.
    return rows.map(row=>row.map(value=>'"'+(/^[=+@\-\t\r]/.test(String(value))?"'":'')+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  }
  root.ServiceImportPlan={build,render,csv};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ServiceImportPlan;
})(typeof globalThis!=='undefined'?globalThis:this);
