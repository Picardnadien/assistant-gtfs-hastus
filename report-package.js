/* Embedded in each HTML report. No library, server or network is needed to export. */
function reportPackageTools() {
  const text = value => String(value ?? '');
  const escape = value => text(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function availability(data) {
    const gtfs = data.gtfs;
    if (!gtfs?.sourceFileNames?.length || !Array.isArray(gtfs.archiveEntries)) return {ready:false, missing:['GTFS source']};
    const names = new Set(gtfs.sourceFileNames.map(name => name.toLowerCase()));
    const missing = ['agency.txt','routes.txt','trips.txt','stops.txt','stop_times.txt'].filter(name => !names.has(name));
    if (!names.has('calendar.txt') && !names.has('calendar_dates.txt')) missing.push('calendar.txt / calendar_dates.txt');
    if (names.size !== gtfs.sourceFileNames.length) missing.push('duplicate filenames');
    return {ready:missing.length===0, missing};
  }
  function parse(source) {
    const input=text(source).replace(/^\uFEFF/,''), first=input.split(/\r?\n/,1)[0];
    const delimiter=first.includes(',')?',':first.includes('\t')?'\t':';';
    const matrix=[]; let row=[],value='',quoted=false;
    for(let i=0;i<input.length;i++){
      const c=input[i];
      if(c==='"'){if(quoted&&input[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
      else if(!quoted&&c===delimiter){row.push(value);value='';}
      else if(!quoted&&(c==='\n'||c==='\r')){row.push(value);if(row.some(cell=>cell!==''))matrix.push(row);row=[];value='';if(c==='\r'&&input[i+1]==='\n')i++;}
      else value+=c;
    }
    if(quoted)throw new Error('Invalid CSV: unclosed quote');
    if(value||row.length){row.push(value);matrix.push(row);}
    const headers=matrix.shift()||[];
    return {headers,rows:matrix.map(values=>Object.fromEntries(headers.map((header,i)=>[header,values[i]??''])))};
  }
  function csv(headers,rows){
    const cell=value=>/[",\r\n]/.test(text(value))?'"'+text(value).replace(/"/g,'""')+'"':text(value);
    return [headers.map(cell).join(','),...rows.map(row=>headers.map(header=>cell(row[header])).join(','))].join('\r\n')+'\r\n';
  }
  function files(data,result) {
    if(!availability(data).ready)throw new Error('incompleteGtfs');
    if(result.errors.length)throw new Error(result.errors.join(', '));
    const baseline = new Map(data.gtfs.sourceStopIdRemap||[]);
    const renamed = new Map(result.places.filter(place=>place.exportId).map(place=>[place.exportId,place.code===place.originalCode?place.exportId:place.code]));
    const mapId = value => {const id=baseline.get(value)??value;return renamed.get(id)??id;};
    const output=[{name:'stops.txt',text:result.stops},{name:'stop_times.txt',text:result.times}];
    for(const source of data.gtfs.archiveEntries){
      const name=source.name.toLowerCase();
      if(['stops.txt','stop_times.txt'].includes(name))continue;
      let content=source.text;
      // Copy untouched tables verbatim. Rewrite only relational stop identifiers.
      if(name.endsWith('.txt') && (/\b(?:from_|to_)?stop_id\b/.test(content.split('\n',1)[0])||name==='translations.txt')){
        const table=parse(content),columns=table.headers.filter(header=>['stop_id','from_stop_id','to_stop_id'].includes(header));
        let changed=false;
        const rows=table.rows.map(row=>{
          const copy={...row};
          for(const column of columns){const mapped=mapId(row[column]);if(mapped!==row[column]){copy[column]=mapped;changed=true;}}
          if(name==='translations.txt'&&row.table_name==='stops'&&row.record_id){const mapped=mapId(row.record_id);if(mapped!==row.record_id){copy.record_id=mapped;changed=true;}}
          return copy;
        });
        if(changed)content=csv(table.headers,rows);
      }
      output.push({name,text:content});
    }
    const byName=new Map(output.map(entry=>[entry.name,entry.text]));
    if(byName.size!==output.length)throw new Error('duplicateFiles');
    const required=['agency.txt','routes.txt','trips.txt','stops.txt','stop_times.txt'];
    if(required.some(name=>!byName.has(name))||(!byName.has('calendar.txt')&&!byName.has('calendar_dates.txt')))throw new Error('incompleteGtfs');
    // Check the primary references before labelling the package ready for review/import.
    const stopIds=new Set(parse(result.stops).rows.map(row=>row.stop_id));
    const trips=parse(byName.get('trips.txt')).rows,tripIds=new Set(trips.map(row=>row.trip_id));
    const routeIds=new Set(parse(byName.get('routes.txt')).rows.map(row=>row.route_id));
    const services=new Set(['calendar.txt','calendar_dates.txt'].flatMap(name=>byName.has(name)?parse(byName.get(name)).rows.map(row=>row.service_id):[]));
    if(trips.some(row=>!routeIds.has(row.route_id)||!services.has(row.service_id))||parse(result.times).rows.some(row=>!tripIds.has(row.trip_id)))throw new Error('brokenFeedReferences');
    for(const entry of output){
      if(!entry.name.endsWith('.txt')||!(/\b(?:from_|to_)?stop_id\b/.test(entry.text.split('\n',1)[0])||entry.name==='translations.txt'))continue;
      const table=parse(entry.text),columns=table.headers.filter(header=>['stop_id','from_stop_id','to_stop_id'].includes(header));
      if(table.rows.some(row=>columns.some(column=>row[column]&&!stopIds.has(row[column]))||(entry.name==='translations.txt'&&row.table_name==='stops'&&row.record_id&&!stopIds.has(row.record_id))))throw new Error('brokenFeedReferences');
    }
    return output;
  }
  function changes(data,edits){
    const originals=new Map(data.places.map(place=>[place.key,place]));
    const current=new Map(data.places.map(place=>{const edit=(edits.places||[]).find(item=>item.key===place.key)||{};return [place.key,{...place,code:text(edit.code??place.code).trim(),description:text(edit.description??place.description).trim()}];}));
    const places=[];
    for(const before of data.places){const after=current.get(before.key);if(before.code!==after.code||before.description!==after.description)places.push({key:before.key,before:{code:before.code,description:before.description},after:{code:after.code,description:after.description}});}
    const rows=new Map((data.gtfs?.stops.rows||[]).map(row=>[row.stop_id,row]));
    const points=new Map((data.points||[]).map(point=>[point.id,point]));
    const resolve=(id,assignment,version)=>{
      if(originals.has(assignment))return {identity:assignment,code:version.get(assignment).code,description:version.get(assignment).description};
      const parent=rows.get(id)?.parent_station||points.get(id)?.parent||'';
      const place=data.places.find(item=>item.exportId&&item.exportId===parent);
      return place?{identity:place.key,code:version.get(place.key).code,description:version.get(place.key).description}:{identity:'external:'+parent,code:parent,description:''};
    };
    const stops=[];
    for(const [id,original] of Object.entries(data.assignments)){
      const before=resolve(id,original,originals),after=resolve(id,edits.assignments?.[id]??original,current);
      if(before.identity!==after.identity)stops.push({id,description:points.get(id)?.description||rows.get(id)?.stop_name||'',before,after});
    }
    places.sort((a,b)=>a.before.code.localeCompare(b.before.code,data.language||'fr',{numeric:true}));
    stops.sort((a,b)=>a.id.localeCompare(b.id,data.language||'fr',{numeric:true}));
    return {places,stops};
  }
  function reviewHtml(data,edits,savedAt){
    const en=data.language==='en',t=(fr,english)=>en?english:fr,review=changes(data,edits);
    const placeLabel=place=>`<strong>${escape(place.code||t('Sans place','No place'))}</strong><br>${escape(place.description)}`;
    const placeRows=review.places.map(place=>`<tr><td><a href="#${escape(place.key)}">${escape(place.before.code)} → ${escape(place.after.code)}</a></td><td>${placeLabel(place.before)}</td><td>${placeLabel(place.after)}</td></tr>`).join('');
    const stopRows=review.stops.map(stop=>`<tr><td><strong>${escape(stop.id)}</strong><br>${escape(stop.description)}</td><td>${placeLabel(stop.before)}</td><td>${placeLabel(stop.after)}</td></tr>`).join('');
    const table=(heading,rows)=>`<h3>${heading}</h3>${rows?`<div class="table-scroll"><table><thead><tr><th>${t('Élément','Item')}</th><th>${t('Avant — rapport initial','Before — initial report')}</th><th>${t('Après — choix du client','After — client choices')}</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<p>${t('Aucun changement.','No changes.')}</p>`}`;
    return `<h2>${t('Compte rendu des modifications du client','Client change summary')}</h2><p>${t('Comparaison avec le rapport initial envoyé au client. Les modifications annulées ne sont pas comptées.','Compared with the original report sent to the client. Reverted edits are not counted.')}</p>${savedAt?`<p>${t('Rapport enregistré le','Report saved on')} ${escape(new Date(savedAt).toLocaleString(en?'en-CA':'fr-CA'))}</p>`:''}<div class="overview-facts"><div><small>${t('Places renommées ou décrites différemment','Places with code or description changes')}</small><b>${review.places.length}</b></div><div><small>${t('Stops réaffectés','Reassigned stops')}</small><b>${review.stops.length}</b></div></div>${table(t('Codes et descriptions des places','Place codes and descriptions'),placeRows)}${table(t('Affectations des stops','Stop assignments'),stopRows)}<p>${t('Le renommage d’une place n’est pas compté comme une réaffectation de ses stops. Les horaires et les coordonnées physiques restent inchangés.','Renaming a place does not count as reassigning its stops. Schedules and physical coordinates are unchanged.')}</p><a class="back-link" href="#report-top">${t('Consulter le sommaire des places','Open place contents')} →</a>`;
  }
  function zip(entries,{allowPaths=false}={}){
    // ZIP STORE: interoperable with Windows Explorer, no runtime dependency.
    const encoder=new TextEncoder(),chunks=[],central=[],seen=new Set();let offset=0;
    if(entries.length>65535)throw new Error('zipTooLarge');
    const crcTable=new Uint32Array(256);
    for(let i=0;i<256;i++){let n=i;for(let bit=0;bit<8;bit++)n=n&1?0xedb88320^(n>>>1):n>>>1;crcTable[i]=n>>>0;}
    const crc=bytes=>{let n=0xffffffff;for(const byte of bytes)n=crcTable[(n^byte)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
    for(const entry of entries){
      const invalidPath=allowPaths?/[\\:\x00-\x1f]/.test(entry.name)||entry.name.split('/').some(part=>!part||part==='.'||part==='..'):/[\\/]/.test(entry.name)||entry.name==='.'||entry.name==='..';
      if(!entry.name||invalidPath||seen.has(entry.name.toLowerCase()))throw new Error('duplicateFiles');
      seen.add(entry.name.toLowerCase());const name=encoder.encode(entry.name),bytes=entry.bytes||encoder.encode(entry.text),checksum=crc(bytes);
      if(name.length>65535||bytes.length>=0xffffffff||offset+bytes.length+name.length+30>=0xffffffff)throw new Error('zipTooLarge');
      const header=new Uint8Array(30+name.length),view=new DataView(header.buffer);
      view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(12,33,true);
      view.setUint32(14,checksum,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,name.length,true);header.set(name,30);
      chunks.push(header,bytes);
      const directory=new Uint8Array(46+name.length),dv=new DataView(directory.buffer);
      dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint16(8,0x800,true);dv.setUint16(14,33,true);
      dv.setUint32(16,checksum,true);dv.setUint32(20,bytes.length,true);dv.setUint32(24,bytes.length,true);dv.setUint16(28,name.length,true);dv.setUint32(42,offset,true);directory.set(name,46);
      central.push(directory);offset+=header.length+bytes.length;
    }
    const centralSize=central.reduce((sum,chunk)=>sum+chunk.length,0);
    if(offset+centralSize+22>=0xffffffff)throw new Error('zipTooLarge');
    const end=new Uint8Array(22),ev=new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
    const result=new Uint8Array(offset+centralSize+22);let at=0;
    for(const chunk of [...chunks,...central,end]){result.set(chunk,at);at+=chunk.length;}
    return result;
  }
  return {availability,files,changes,reviewHtml,zip,parse};
}
