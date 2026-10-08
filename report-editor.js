/* These functions are embedded verbatim in the standalone report: no external dependencies. */
function reportEditorEngine(data, edits, serializeOutput = true, withCompleteGtfs = false) {
  const places = data.places.map(original => ({...original, ...(edits.places || []).find(p => p.key === original.key)}));
  const assignments = {...data.assignments, ...edits.assignments};
  const errors = [], key = value => String(value ?? '').trim().toUpperCase();
  const codes = new Set(), sourceIds = new Set(), targets = new Map();
  const maxLength = Number(data.placeCodeMaxLength) === 8 ? 8 : 6;
  const codePattern = new RegExp(`^[A-Za-z0-9]{1,${maxLength}}$`);
  for (const place of places) {
    place.code = String(place.code ?? '').trim();
    place.description = String(place.description ?? '').trim();
    if (!codePattern.test(place.code) || codes.has(key(place.code))) errors.push('invalidCode');
    if (!place.description) errors.push('invalidDescription');
    codes.add(key(place.code));
    if (place.exportId) {
      if (sourceIds.has(place.exportId)) errors.push('ambiguousPlace');
      sourceIds.add(place.exportId);
    }
    targets.set(place.key, place.code === place.originalCode && place.exportId ? place.exportId : place.code);
  }
  if (!data.gtfs) return {errors: [...new Set(errors)], places, assignments};
  const rows = data.gtfs.stops.rows, byId = new Map(rows.map(row => [row.stop_id, row]));
  const targetKeys = new Set();
  for (const place of places) {
    const target = targets.get(place.key), source = byId.get(place.exportId);
    if (place.exportId && (!source || String(source.location_type) !== '1')) errors.push('ambiguousPlace');
    if (targetKeys.has(key(target))) errors.push('invalidCode');
    targetKeys.add(key(target));
    if (rows.some(row => key(row.stop_id) === key(target) && !sourceIds.has(row.stop_id))) errors.push('physicalCollision');
  }
  for (const [id, target] of Object.entries(assignments)) {
    if (target === '__keep__') continue;
    const stop = byId.get(id);
    if (!stop || !targets.has(target) || !['', '0'].includes(String(stop.location_type || ''))) errors.push('invalidAssignment');
  }
  if (errors.length) return {errors: [...new Set(errors)], places, assignments};
  // Rewrite from immutable source IDs, not successively: A -> B / B -> A is safe.
  const renames = new Map(places.filter(p => p.exportId).map(p => [p.exportId, targets.get(p.key)]));
  const externalFileChanges = (data.gtfs.externalStopReferences || []).some(id => renames.has(id) && renames.get(id) !== id);
  if (externalFileChanges && !withCompleteGtfs) errors.push('externalReferences');
  const bySource = new Map(places.filter(p => p.exportId).map(p => [p.exportId, p]));
  const stops = rows.map(row => {
    const next = {...row}, place = bySource.get(row.stop_id);
    if (place) {
      next.stop_id = targets.get(place.key);
      next.stop_name = place.description;
      if (next.stop_code && [place.originalCode, place.exportId].includes(next.stop_code)) next.stop_code = place.code;
    }
    if (renames.has(row.parent_station)) next.parent_station = renames.get(row.parent_station);
    const assigned = assignments[row.stop_id];
    if (assigned && assigned !== '__keep__') next.parent_station = targets.get(assigned);
    return next;
  });
  const headers = [...data.gtfs.stops.headers];
  for (const header of ['parent_station', 'location_type']) if (!headers.includes(header)) headers.push(header);
  for (const place of places.filter(p => !p.exportId)) {
    if (!Object.values(assignments).includes(place.key)) continue;
    const row = Object.fromEntries(headers.map(header => [header, '']));
    Object.assign(row, {stop_id: targets.get(place.key), stop_name: place.description, stop_lat: place.lat, stop_lon: place.lon, location_type: '1'});
    stops.push(row);
  }
  const outputIds = new Set(stops.map(row => row.stop_id));
  const timeIds=data.gtfs.times.stopIds||new Set(data.gtfs.times.rows.map(row=>row.stop_id));
  if (outputIds.size !== stops.length || stops.some(row => row.parent_station && !outputIds.has(row.parent_station)) || [...timeIds].some(id => !outputIds.has(renames.get(id) ?? id))) errors.push('brokenReferences');
  if (!serializeOutput) return {errors: [...new Set(errors)], places, assignments, externalFileChanges};
  if(data.gtfs.times.packedCsv)throw Error('GTFS payload must be expanded before export.');
  const times = data.gtfs.times.rows.map(row => ({...row, stop_id: renames.get(row.stop_id) ?? row.stop_id}));
  const csv = value => {const text = String(value ?? ''); return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;};
  const serialize = (columns, values) => [columns.map(csv).join(','), ...values.map(row => columns.map(column => csv(row[column])).join(','))].join('\r\n') + '\r\n';
  return {errors: [...new Set(errors)], places, assignments, externalFileChanges, stops: serialize(headers, stops), times: serialize(data.gtfs.times.headers, times)};
}

function reportEditorControls(data, edits, history = []) {
  const distance = (a, b) => {
    if (![a?.lat,a?.lon,b?.lat,b?.lon].every(v=>v!==null&&v!==''&&Number.isFinite(Number(v)))) return Infinity;
    const rad=Math.PI/180, h=Math.sin((b.lat-a.lat)*rad/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lon-a.lon)*rad/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  };
  const read = action => action.field==='assignment' ? edits.assignments[action.id]??data.assignments[action.id] : edits.places.find(p=>p.key===action.id)?.[action.field];
  const write = (action,value) => {if(action.field==='assignment')edits.assignments[action.id]=value;else edits.places.find(p=>p.key===action.id)[action.field]=value;};
  const same = (a,b) => a.id===b.id&&a.field===b.field;
  const latest = owner => history.findLastIndex(action=>action.owner===owner);
  const canUndo = owner => {const i=latest(owner);return i>=0&&!history.slice(i+1).some(action=>same(action,history[i]))&&read(history[i])===history[i].after;};
  return {history,distance,
    options(point){return data.places.map(place=>({...place,...edits.places.find(p=>p.key===place.key),distance:distance(point,place)})).sort((a,b)=>a.distance-b.distance||a.code.localeCompare(b.code,data.language,{numeric:true}));},
    set(owner,id,field,after,merge=false){
      const action={owner,id,field,after},before=read(action);if(before===after)return;
      const last=history[history.length-1];
      if(merge&&last&&last.owner===owner&&same(last,action)&&last.after===before){last.after=after;if(last.before===after)history.pop();}
      else history.push({...action,before});
      write(action,after);
    },canUndo,
    undo(owner){if(!canUndo(owner))return false;const [action]=history.splice(latest(owner),1);write(action,action.before);return true;}
  };
}

// One writer at a time. Changes made during a write stay pending until a later write.
// Handles are deliberately session-only: a reopened local report requires consent again.
function reportFileSaver({snapshot,onState=()=>{},onSaved=()=>{},delay=1800,schedule=setTimeout,cancel=clearTimeout}) {
  const state={handle:null,enabled:false,saving:false,revision:0,savedRevision:0,lastSaved:null,error:null};
  let timer=null,flight=null,stamp=null;
  const emit=()=>onState({...state,pending:state.revision!==state.savedRevision});
  const stopTimer=()=>{if(timer!==null)cancel(timer);timer=null;};
  const fingerprint=file=>`${file.lastModified}:${file.size}`;
  const queue=()=>{stopTimer();if(state.enabled&&state.revision!==state.savedRevision)timer=schedule(()=>{timer=null;save();},delay);};
  async function save(force=false){
    stopTimer();if(!state.handle)return false;
    if(flight){const ok=await flight;return ok&&(force||state.revision!==state.savedRevision)?save(force):ok;}
    if(!force&&state.revision===state.savedRevision)return true;
    const handle=state.handle,savedAt=new Date().toISOString();
    state.saving=true;state.error=null;emit();
    flight=(async()=>{let writable;
      try{
        const file=await handle.getFile();
        if(stamp!==null&&fingerprint(file)!==stamp)throw Error('externalChange');
        // Snapshot synchronously, immediately before starting the asynchronous write.
        const content=snapshot(savedAt);
        // Capture revisions after snapshot, so earlier async permission/file checks cannot lose edits.
        const captured=state.revision;
        writable=await handle.createWritable();await writable.write(content);await writable.close();writable=null;
        stamp=fingerprint(await handle.getFile());state.savedRevision=captured;state.lastSaved=savedAt;
        onSaved(savedAt,captured);return true;
      }catch(error){if(writable)try{await writable.abort();}catch{}state.error=error;state.enabled=false;return false;}
      finally{state.saving=false;emit();}
    })();
    const result=await flight;flight=null;if(result)queue();return result;
  }
  return {state,
    changed(){state.revision++;emit();queue();},
    async connect(handle){if(flight)await flight;stopTimer();const file=await handle.getFile();state.handle=handle;stamp=fingerprint(file);state.enabled=true;state.error=null;emit();return save(true);},
    pause(){stopTimer();state.enabled=false;emit();},
    resume(){state.enabled=true;state.error=null;emit();queue();},
    save,
    notify:emit
  };
}

// Explicit client approvals are separate from the original diagnostic categories.
function reportReviewModel(data,edits){
  const state=data.clientReview||{approvals:{},tutorialSeen:false};
  state.approvals=state.approvals||{};data.clientReview=state;
  const places=()=>data.places.map(p=>({...p,...edits.places.find(e=>e.key===p.key)}));
  function signatures(){
    const stops=new Map(data.places.map(p=>[p.key,[]]));
    for(const point of data.points||[])stops.get(edits.assignments[point.id]??data.assignments[point.id])?.push(point.id);
    return new Map(places().map(p=>[p.key,JSON.stringify([p.code,p.description,stops.get(p.key).sort()])]));
  }
  function reconcile(){let changed=false;const current=signatures();for(const [key,approval] of Object.entries(state.approvals))if(current.get(key)!==approval.signature){delete state.approvals[key];changed=true;}return changed;}
  function set(key,value){if(!data.places.some(p=>p.key===key))return false;if(value)state.approvals[key]={signature:signatures().get(key),at:new Date().toISOString()};else delete state.approvals[key];return true;}
  function summary(){
    const associated=new Map(data.places.map(p=>[p.key,[]]));
    for(const point of data.points||[])associated.get(edits.assignments[point.id]??data.assignments[point.id])?.push({id:point.id,label:point.label||point.id,description:point.description||''});
    for(const stops of associated.values())stops.sort((a,b)=>String(a.label).localeCompare(String(b.label),data.language||'fr',{numeric:true}));
    return places().map(p=>({key:p.key,code:p.code,description:p.description,validated:Boolean(state.approvals[p.key]),validatedAt:state.approvals[p.key]?.at||null,stops:associated.get(p.key)}));
  }
  return {state,reconcile,set,approved:key=>Boolean(state.approvals[key]),summary};
}

function mountReportReview({data,edits,cards,currentPlace,assigned,points,controls,markChanged,applyFilter,revealPlace,hasErrors}){
  const model=reportReviewModel(data,edits),en=data.language==='en',t=(fr,english)=>en?english:fr;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let active=false,key=null,trail=[],all=false,ownsFullscreen=false,scrollBefore=0;
  const runtime=node=>{node.dataset.reviewRuntime='';return node;};
  const style=runtime(document.createElement('style'));
  style.textContent=`.review-launch{padding:14px 0;display:grid;gap:8px}.review-launch button{padding:10px;border:1px solid #bdcbb0;border-radius:18px 0;background:#eef3e7;color:#303b35;font:600 13px Arial}.review-launch small{color:inherit}.review-toolbar{display:none}.review-mode{overflow:hidden!important}.review-mode .sidebar,.review-mode .report-modules{display:none!important}.review-mode .report-shell{display:block!important}.review-mode .main{position:fixed;inset:var(--review-toolbar-height,100px) 0 0;overflow:auto;padding:20px 3vw!important;background:#f5f6f3}.review-mode .main>:not(.review-active){display:none!important}.review-mode .main>.review-active{display:block!important;content-visibility:visible;max-width:1600px;margin:0 auto}.review-mode .back-link{display:none}.review-toolbar{position:fixed;top:0;left:0;right:0;z-index:1000;background:#fff;color:#303b35;border-bottom:1px solid #bdcbb0;padding:10px 20px;gap:8px;align-items:center;flex-wrap:wrap;font:13px/1.4 Arial}.review-mode .review-toolbar{display:flex}.review-toolbar button,.review-toolbar select,.review-dialog button,.review-dialog select,.review-stop-link{padding:8px 11px;border:1px solid #bdcbb0;border-radius:16px 0;background:#fff;color:#303b35;font:inherit;cursor:pointer}.review-toolbar button:disabled{opacity:.4;cursor:default}.review-toolbar label{display:flex;align-items:center;gap:6px}.review-toolbar select{width:auto;margin:0;max-width:180px}.review-toolbar strong{margin-right:auto}.review-progress{color:#637167}.review-stop-link{display:block;margin-top:5px;font-size:11px}.review-mode .place-map svg{max-height:55vh}.review-dialog{width:min(680px,calc(100vw - 32px));max-height:85vh;overflow:auto;border:1px solid #bdcbb0;border-radius:12px;padding:24px;color:#303b35;background:#fff;font:15px/1.55 Arial}.review-dialog::backdrop{background:#0008}.review-dialog h2{font:600 24px Arial;margin-top:0}.review-dialog select{width:100%;border-radius:5px}.review-dialog footer{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:20px}.review-summary{margin:18px 0}.review-summary td,.review-summary th{overflow-wrap:anywhere}.review-complete{text-align:center;padding:80px 20px!important}.review-toolbar :focus-visible,.review-dialog :focus-visible{outline:3px solid #557630;outline-offset:3px}@media(max-width:700px){.review-toolbar{padding:8px;font-size:12px}.review-mode .main{padding:12px!important}.review-mode .detail-grid{display:block}.review-mode .place-card{padding:14px}}@media print{.review-toolbar,.review-launch,.review-stop-link,.review-dialog{display:none!important}.review-mode{overflow:visible!important}.review-mode .main{position:static!important;overflow:visible}.review-mode .main>[data-report-place]{display:block!important}}`;
  document.head.append(style);
  // The taller client menu must scroll as a whole, without covering export buttons.
  style.textContent+='.sidebar .search-box{position:static}';
  style.textContent+=`.review-mode .main>.review-active[data-report-place]{display:grid!important;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:12px 20px;padding:20px}.review-mode .review-active>header,.review-mode .review-active>h3{display:none}.review-mode .review-active>.title-row{grid-column:1/-1;margin:0}.review-mode .review-active>.title-row h2{margin:5px 0;font-size:24px}.review-mode .review-active .place-code{padding:10px 16px}.review-mode .review-active>.client-editor{grid-column:1/-1;margin:0;padding:10px 14px}.review-mode .client-editor h3{display:none}.review-mode .client-editor .place-undo{padding:5px 10px;margin-top:6px}.review-mode .review-active>.facts{grid-column:1/-1;margin:0}.review-mode .facts>div{padding:8px 12px}.review-mode .review-active>.place-map{grid-column:1;grid-row:4;align-self:start}.review-mode .review-active>.detail-grid{grid-column:2;grid-row:4;display:block;margin:0;min-width:0}.review-mode .review-active>.map-note{grid-column:1/-1;margin:0}.review-mode .detail-grid details{margin-bottom:12px}.review-mode .detail-grid td{overflow-wrap:anywhere}.review-mode .detail-grid .assignment-select{min-width:140px}.review-mode .review-active>.place-map svg{width:100%;height:auto;max-height:55vh}.review-mode .review-active>.place-map .map-legend{flex-wrap:wrap}@media(max-width:1100px){.review-mode .main>.review-active[data-report-place]{display:block!important}.review-mode .review-active>.place-map{margin-top:12px}.review-mode .review-active>.detail-grid{margin-top:12px}}`;
  style.textContent+=`
    .summary-stop-list{margin:0;padding-left:16px}.summary-stop-list li{margin:3px 0;white-space:normal;overflow-wrap:anywhere}.review-summary td{vertical-align:top}
    .place-review-actions{display:inline-flex;gap:8px;margin:8px 0 0 12px;vertical-align:middle}
    .place-review-actions button{padding:7px 12px;border:1px solid #557630;border-radius:18px 0;background:#557630;color:white;font:600 12px/1.4 Arial;cursor:pointer}
    .place-review-actions button[aria-pressed=true]{background:#edf4e6;color:#354c22}
    .place-review-actions button:disabled{opacity:.5;cursor:default}
    .place-review-actions button:focus-visible{outline:3px solid #557630;outline-offset:3px}
    @media screen{
      body:not(.review-mode) [data-report-place]{padding:12px;max-width:none;scroll-margin-top:var(--report-anchor-offset,70px)}
      body:not(.review-mode) [data-report-place]>header{display:none}
      body:not(.review-mode) [data-report-place]>.title-row{margin:0 0 10px;gap:10px}
      body:not(.review-mode) [data-report-place] .title-row .eyebrow{display:none}
      body:not(.review-mode) [data-report-place] .title-row h2{font-size:clamp(18px,1.6vw,24px);margin:4px 0;overflow-wrap:anywhere}
      body:not(.review-mode) [data-report-place] .place-code{min-width:0;padding:8px 12px;font-size:clamp(18px,1.8vw,26px)}
      body:not(.review-mode) [data-report-place]>.client-editor{margin:0 0 8px;padding:8px;font-size:12px;line-height:1.3}
      body:not(.review-mode) [data-report-place]>.client-editor h3{display:none}
      body:not(.review-mode) [data-report-place] .client-editor input{padding:6px 8px}
      body:not(.review-mode) [data-report-place] .place-undo{margin-top:8px;padding:6px 10px}
      body:not(.review-mode) [data-report-place]>.facts{margin:0 0 10px;gap:6px}
      body:not(.review-mode) [data-report-place]>.facts>div{padding:6px 8px}
      body:not(.review-mode) [data-report-place]>h3{margin:8px 0;font-size:13px}
      body:not(.review-mode) [data-report-place]>.detail-grid{margin:0;gap:10px;min-width:0}
      body:not(.review-mode) [data-report-place] .map-legend{flex-wrap:wrap;gap:6px;padding:6px}
      body:not(.review-mode) [data-report-place] .table-scroll{max-height:clamp(180px,35dvh,460px)}
      body:not(.review-mode) [data-report-place] .detail-grid td,body:not(.review-mode) [data-report-place] .detail-grid th{padding:5px;font-size:11px;overflow-wrap:anywhere}
      body:not(.review-mode) [data-report-place] .assignment-select{min-width:125px;max-width:100%;padding:5px;font-size:11px}
      body:not(.review-mode) [data-report-place] .review-stop-link{padding:4px 7px;font-size:11px}
      body:not(.review-mode) [data-report-place]>.place-map svg{height:auto;max-height:clamp(230px,calc(100dvh - 350px),540px)}
      body:not(.review-mode) [data-report-place]>.back-link{margin-top:10px}
    }
    @media screen and (min-width:1000px){
      body:not(.review-mode) .report-shell{grid-template-columns:clamp(220px,19vw,280px) minmax(0,1fr)}
      body:not(.review-mode) .sidebar{padding:16px 12px}
      body:not(.review-mode) .main{padding:16px;min-width:0}
      body:not(.review-mode) [data-report-place]{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:0 12px}
      body:not(.review-mode) [data-report-place]>.title-row,body:not(.review-mode) [data-report-place]>.client-editor,body:not(.review-mode) [data-report-place]>.facts,body:not(.review-mode) [data-report-place]>.map-note,body:not(.review-mode) [data-report-place]>.back-link{grid-column:1/-1}
      body:not(.review-mode) [data-report-place]>h3{display:none}
      body:not(.review-mode) [data-report-place]>.place-map{grid-column:1;grid-row:4;align-self:start;min-width:0}
      body:not(.review-mode) [data-report-place]>.detail-grid{grid-column:2;grid-row:4;display:block}
      body:not(.review-mode) [data-report-place]>.detail-grid details+details{margin-top:8px}
      body:not(.review-mode) [data-report-place] .client-editor-grid{grid-template-columns:minmax(135px,.5fr) minmax(200px,1.5fr)}
      body:not(.review-mode) [data-report-place]>.client-editor{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center}
      body:not(.review-mode) [data-report-place] .client-editor-grid{grid-column:1;grid-row:1/3;grid-template-columns:125px minmax(0,1fr)}
      body:not(.review-mode) [data-report-place] .place-review-actions{grid-column:2;grid-row:1;display:flex;flex-wrap:wrap;max-width:250px;margin:0;gap:4px}
      body:not(.review-mode) [data-report-place] .place-undo{grid-column:2;grid-row:2;margin:0;padding:4px 8px;font-size:11px}
      body:not(.review-mode) [data-report-place] .place-review-actions button{padding:5px 10px;font-size:11px}
      body:not(.review-mode) [data-report-place] .facts>div{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;padding:5px 8px}
      body:not(.review-mode) [data-report-place] .table-scroll{max-height:var(--place-table-height,35dvh)}
      body:not(.review-mode) [data-report-place]>.place-map svg{max-height:var(--place-map-height,40dvh)}
      body:not(.review-mode) [data-report-place] .browser-map-stage{width:min(100%,var(--place-map-width,100%));margin:0 auto}
      body:not(.review-mode) [data-report-place] .browser-map-stage svg{max-height:none}
    }
    .review-mode .place-review-actions{display:none}
    @media screen and (max-height:850px){
      .review-mode .main{padding:10px 16px!important}
      .review-mode .main>.review-active[data-report-place]{padding:12px;gap:8px 12px;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr)}
      .review-mode .review-active>.title-row h2{font-size:20px;margin:2px 0}
      .review-mode .review-active .place-code{padding:6px 12px;min-width:0}
      .review-mode .review-active>.client-editor{padding:6px 10px}
      .review-mode .client-editor input{padding:5px 8px}
      .review-mode .facts>div{padding:5px 8px}
      .review-mode .review-active>.place-map svg{max-height:clamp(200px,calc(100dvh - 320px),440px)}
      .review-mode .detail-grid .table-scroll{max-height:30dvh}
      .review-mode .detail-grid td,.review-mode .detail-grid th{font-size:11px;padding:5px}
      .review-mode .assignment-select,.review-mode .review-stop-link{font-size:11px;padding:5px}
      .review-mode .map-legend{padding:5px;gap:6px}
    }
    @media print{.place-review-actions{display:none!important}}
  `;
  const panel=runtime(document.createElement('div'));panel.className='review-launch';
  panel.innerHTML=`<button type="button" data-start-review>${t('Revue plein écran','Full-screen review')}</button><small data-review-count></small><button type="button" data-review-help>${t('Petit guide client','Client quick guide')}</button>`;
  document.querySelector('.sidebar .search-box').after(panel);
  // Keep the action on each ordinary card; these controls are recreated on reopen.
  const approvalButtons=new Map();
  for(const [id,card] of cards){
    const actions=runtime(document.createElement('div'));actions.className='place-review-actions';
    const button=document.createElement('button');button.type='button';button.dataset.placeApprove=id;button.onclick=()=>approve(id,!model.approved(id));actions.append(button);approvalButtons.set(id,button);
    card.querySelector('.client-editor').append(actions);
  }
  const bar=runtime(document.createElement('nav'));bar.className='review-toolbar';bar.setAttribute('aria-label',t('Navigation de la revue','Review navigation'));
  bar.innerHTML=`<button type="button" data-exit>${t('Quitter','Exit')}</button><button type="button" data-return hidden>↩</button><strong data-review-name></strong><span class="review-progress" role="status" data-progress></span><select data-review-scope aria-label="${t('Places affichées','Places shown')}"><option value="pending">${t('À traiter','To review')}</option><option value="all">${t('Toutes','All')}</option></select><button type="button" data-prev aria-label="${t('Place précédente','Previous place')}">←</button><button type="button" data-next aria-label="${t('Place suivante','Next place')}">→</button><label><input type="checkbox" data-approved>${t('Choix validé','Validated')}</label><button type="button" data-other>${t('Autre place…','Other place…')}</button><button type="button" data-review-help aria-label="${t('Aide à la revue','Review help')}">?</button>`;
  document.body.append(bar);
  const complete=runtime(document.createElement('section'));complete.className='place-card review-complete';complete.innerHTML=`<h2>${t('Toutes les places sont validées','All places validated')}</h2><p>${t('Enregistrez le rapport ou exportez le ZIP pour conserver et transmettre vos validations.','Save the report or export the ZIP to preserve and share your approvals.')}</p><p>${t('Choisissez « Toutes » pour revoir une place ou retirer sa validation.','Select “All” to revisit a place or remove its approval.')}</p>`;
  complete.hidden=true;
  document.querySelector('main').append(complete);
  const picker=runtime(document.createElement('dialog'));picker.className='review-dialog';picker.setAttribute('aria-labelledby','review-picker-title');document.body.append(picker);
  const help=runtime(document.createElement('dialog'));help.className='review-dialog';help.setAttribute('aria-labelledby','review-help-title');document.body.append(help);
  const order=()=>[...cards.keys()].sort((a,b)=>Number(cards.get(b).dataset.kind==='decision')-Number(cards.get(a).dataset.kind==='decision')||currentPlace(a).code.localeCompare(currentPlace(b).code,data.language,{numeric:true}));
  const queue=()=>order().filter(id=>all||!model.approved(id));
  // Measure only visible cards. Their headers/legends can wrap at different zoom
  // levels; share the remaining actual viewport height between the open tables.
  const visibleCards=new Set();let fitFrame=0;
  function fitNormalCards(){
    fitFrame=0;if(active)return;
    const top=(document.querySelector('.report-modules')?.getBoundingClientRect().height||0)+12;
    document.body.style.setProperty('--report-anchor-offset',top+'px');
    for(const card of visibleCards){
      if(card.hidden||window.innerWidth<1000)continue;
      const css=getComputedStyle(card),size=node=>{const s=getComputedStyle(node);return s.display==='none'?0:node.getBoundingClientRect().height+(parseFloat(s.marginTop)||0)+(parseFloat(s.marginBottom)||0);};
      const overhead=[...card.children].filter(node=>!node.matches('.place-map,.detail-grid')).reduce((total,node)=>total+size(node),0)+(parseFloat(css.paddingTop)||0)+(parseFloat(css.paddingBottom)||0)+2;
      const available=Math.max(160,window.innerHeight-top-18-overhead);
      const legend=card.querySelector('.map-legend'),details=[...card.querySelectorAll('.detail-grid>details')];
      const open=details.filter(node=>node.open).length;
      const summaries=details.reduce((total,node)=>total+size(node.querySelector('summary'))+10,0);
      const tableHeight=Math.max(60,Math.floor((available-summaries)/Math.max(1,open)));
      card.style.setProperty('--place-table-height',tableHeight+'px');
      const mapHeight=Math.max(120,available-(legend?size(legend):0)-2);
      card.style.setProperty('--place-map-height',mapHeight+'px');
      const viewBox=card.querySelector('.place-map svg')?.viewBox.baseVal;
      if(viewBox?.height)card.style.setProperty('--place-map-width',mapHeight*viewBox.width/viewBox.height+'px');
    }
  }
  function fit(){
    if(active)document.body.style.setProperty('--review-toolbar-height',bar.getBoundingClientRect().height+'px');
    else if(!fitFrame)fitFrame=requestAnimationFrame(fitNormalCards);
  }
  const cardResize=typeof ResizeObserver==='function'?new ResizeObserver(fit):null;
  if(typeof IntersectionObserver==='function'){
    const visibility=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){visibleCards.add(entry.target);cardResize?.observe(entry.target);}else{visibleCards.delete(entry.target);cardResize?.unobserve(entry.target);}}fit();},{rootMargin:'150px'});
    for(const card of cards.values())visibility.observe(card);
  }else for(const card of cards.values())visibleCards.add(card);
  for(const card of cards.values())card.querySelectorAll('details').forEach(node=>node.addEventListener('toggle',fit));
  function draw(){
    const pending=order().filter(id=>!model.approved(id));panel.querySelector('[data-review-count]').textContent=`${pending.length} ${t('à traiter','to review')} · ${cards.size-pending.length}/${cards.size} ${t('validées','validated')}`;
    for(const [id,card] of cards){
      card.classList.toggle('review-active',active&&id===key);
      const button=approvalButtons.get(id),approved=model.approved(id);
      button.textContent=approved?t('✓ Validée · Annuler la validation','✓ Validated · Remove approval'):t('Valider cette place','Validate this place');
      button.setAttribute('aria-pressed',String(approved));button.disabled=!approved&&hasErrors();
      button.title=button.disabled?t('Corrigez les erreurs du rapport avant de valider.','Resolve report errors before approving.'):'';
    }
    complete.classList.toggle('review-active',active&&!key);
    complete.hidden=!(active&&!key);
    if(!active){fit();return;}
    const place=key?currentPlace(key):null;
    bar.querySelector('[data-review-name]').textContent=place?place.code+' · '+place.description:t('Revue terminée','Review complete');
    bar.querySelector('[data-progress]').textContent=`${pending.length} ${t('à traiter','to review')} / ${cards.size}`;
    const approved=bar.querySelector('[data-approved]');approved.checked=key?model.approved(key):false;approved.disabled=!key||(!approved.checked&&hasErrors());
    approved.title=hasErrors()?t('Corrigez les erreurs du rapport avant de valider.','Resolve report errors before approving.') : '';
    const back=bar.querySelector('[data-return]');back.hidden=!trail.length;back.textContent='↩ '+t('Retour à ','Back to ')+(trail.length?currentPlace(trail[0]).code:'');
    for(const name of ['prev','next'])bar.querySelector(`[data-${name}]`).disabled=queue().length<2;
    bar.querySelector('[data-other]').disabled=!key;fit();
  }
  function show(id,visiting=false){
    if(id&&!cards.has(id))return;
    if(visiting&&key&&id!==key)trail.push(key);else if(!visiting)trail=[];
    key=id;
    const card=cards.get(key);card?.querySelectorAll('details').forEach(node=>node.open=true);
    draw();document.querySelector('main').scrollTop=0;
  }
  function start(id){
    if(!active){scrollBefore=window.scrollY;active=true;document.body.classList.remove('show-network');document.body.classList.add('review-mode');document.querySelectorAll('[data-report-module]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.reportModule==='places')));}
    show(id||queue()[0]||null);
    if(!document.fullscreenElement&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().then(()=>{ownsFullscreen=true;fit();}).catch(()=>{});
  }
  function exit(){
    active=false;trail=[];document.body.classList.remove('review-mode');document.body.style.removeProperty('--review-toolbar-height');draw();applyFilter();
    if(ownsFullscreen&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});ownsFullscreen=false;
    window.scrollTo(0,scrollBefore);panel.querySelector('[data-start-review]').focus();
  }
  function advance(offset){const ids=queue();if(!ids.length){show(null);return;}const index=ids.indexOf(key);show(ids[(Math.max(0,index)+offset+ids.length)%ids.length]);}
  function chooseOther(point){
    if(!key)return;const from=key;
    const options=controls.options(point||currentPlace(key)).filter(place=>cards.has(place.key)&&place.key!==key);
    const counts=new Map();for(const p of points){const id=assigned(p.id);counts.set(id,(counts.get(id)||0)+1);}
    picker.innerHTML=`<h2 id="review-picker-title">${t('Consulter une autre place','Inspect another place')}</h2><p>${point?esc(point.label||point.id)+' · '+esc(point.description):esc(currentPlace(key).code)}</p><p>${t('Distance à vol d’oiseau. Consulter une place ne change pas l’affectation du stop.','Straight-line distance. Inspecting a place does not change the stop assignment.')}</p><select aria-label="${t('Place à consulter','Place to inspect')}">${options.map(p=>`<option value="${esc(p.key)}">${esc(p.code)} · ${esc(p.description)} — ${Number.isFinite(p.distance)?Math.round(p.distance)+' m':t('distance inconnue','unknown distance')} · ${counts.get(p.key)||0} stops</option>`).join('')}</select><footer><button type="button" data-cancel>${t('Annuler','Cancel')}</button><button type="button" data-view ${options.length?'':'disabled'}>${t('Voir tous ses stops','View all its stops')}</button></footer>`;
    picker.querySelector('[data-cancel]').onclick=()=>picker.close();
    picker.querySelector('[data-view]').onclick=()=>{
      const id=picker.querySelector('select').value;picker.close();
      if(active){show(id,true);return;}
      // Comparing from the ordinary report stays in the ordinary report.
      document.querySelectorAll('[data-normal-review-return]').forEach(node=>node.remove());
      const back=runtime(document.createElement('button'));back.type='button';back.dataset.normalReviewReturn='';
      back.textContent='↩ '+t('Retour à ','Back to ')+currentPlace(from).code;
      back.onclick=()=>{back.remove();revealPlace(from);};
      cards.get(id).querySelector('.place-review-actions').append(back);revealPlace(id);
    };picker.showModal();
  }
  function refresh(){
    const invalidated=model.reconcile();if(invalidated)markChanged();
    for(const [id,card] of cards)for(const select of card.querySelectorAll('[data-stop-assignment]')){
      if(select.parentElement.querySelector('[data-review-stop]'))continue;
      const button=runtime(document.createElement('button'));button.type='button';button.className='review-stop-link';button.dataset.reviewStop=select.dataset.assignmentId||select.closest('[data-stop-row]')?.dataset.stopId;
      button.textContent=t('Voir une autre place…','Inspect another place…');
      button.onclick=()=>{if(!active)key=button.closest('[data-report-place]').dataset.placeKey;chooseOther(points.find(p=>p.id===button.dataset.reviewStop));};select.after(button);
    }
    draw();
  }
  panel.querySelector('[data-start-review]').onclick=()=>start();
  bar.querySelector('[data-exit]').onclick=exit;
  bar.querySelector('[data-return]').onclick=()=>show(trail[0]);
  bar.querySelector('[data-prev]').onclick=()=>advance(-1);bar.querySelector('[data-next]').onclick=()=>advance(1);
  bar.querySelector('[data-other]').onclick=()=>chooseOther();
  bar.querySelector('[data-review-scope]').onchange=event=>{all=event.target.value==='all';show(queue()[0]||null);};
  // Both entry points share the same approval, invalidation and save lifecycle.
  function approve(id,value){
    if(!id||(value&&hasErrors())){draw();return;}
    const position=queue().indexOf(id);model.set(id,value);markChanged();
    if(active&&id===key&&!all&&value){const next=queue();if(trail.length)show(trail[0]);else show(next[Math.min(Math.max(0,position),next.length-1)]||null);}else draw();
  }
  bar.querySelector('[data-approved]').onchange=event=>approve(key,event.target.checked);
  window.addEventListener('resize',fit);
  document.addEventListener('fullscreenchange',()=>{if(ownsFullscreen&&!document.fullscreenElement)exit();fit();});
  document.addEventListener('keydown',event=>{
    if(!active||document.querySelector('dialog[open]')||event.target.closest('input,select,textarea,button,[contenteditable=true]'))return;
    if(event.key==='ArrowRight'){event.preventDefault();advance(1);}else if(event.key==='ArrowLeft'){event.preventDefault();advance(-1);}else if(event.key==='Escape')exit();
  });
  // Remember the introduction per report when storage is available, and in saved HTML.
  let hash=2166136261;for(const c of data.filename+JSON.stringify(data.places.map(p=>[p.key,p.code])))hash=Math.imul(hash^c.charCodeAt(0),16777619);
  const storageKey='gtfs-review-guide-'+(hash>>>0);let seen=Boolean(model.state.tutorialSeen);
  try{seen=seen||localStorage.getItem(storageKey)==='1';}catch{}
  if(seen)model.state.tutorialSeen=true;
  function remember(){model.state.tutorialSeen=true;try{localStorage.setItem(storageKey,'1');}catch{}}
  function guide(offer=false){
    help.innerHTML=`<h2 id="review-help-title">${t('Bienvenue dans votre rapport','Welcome to your report')}</h2><p>${offer?t('Un petit guide pour préparer votre revue des places ?','Would you like a quick guide before reviewing places?'):t('Valider une place à la fois','Review one place at a time')}</p>${offer?'':`<ol><li>${t('Validez directement sur une fiche ou ouvrez « Revue plein écran » depuis le menu de gauche. Les places nécessitant une décision passent en premier.','Validate directly on a place card, or open “Full-screen review” from the left menu. Places requiring a decision come first.')}</li><li>${t('Contrôlez la carte, le code, la description et la liste des stops. Les champs restent modifiables.','Check the map, code, description and stop list. Fields remain editable.')}</li><li>${t('« Voir une autre place » permet de comparer les candidats par distance, sans réaffecter le stop. Revenez à la place de départ avec ↩. Utilisez « Place associée » pour changer réellement une affectation.','“Inspect another place” compares candidates by distance without reassigning a stop. Return to the original place with ↩. Use “Assigned place” to change an actual assignment.')}</li><li>${t('Cochez « Choix validé » pour retirer la place des éléments à traiter. « Toutes » permet de revoir les validations et de les décocher. Modifier le nom ou les stops d’une place validée annule sa validation.','Check “Validated” to remove a place from the review queue. Use “All” to revisit and uncheck approvals. Editing an approved place’s name or stops clears its approval.')}</li><li>${t('Les flèches font défiler les places. Quitter revient au rapport. Enregistrez le HTML ou le ZIP : la coche seule ne sauvegarde pas un fichier. La sauvegarde automatique nécessite son activation préalable.','Use the arrows to navigate; Exit returns to the report. Save the HTML or ZIP: checking a box alone does not save a file. Autosave must be enabled first.')}</li></ol>`}<footer><button type="button" data-help-close>${offer?t('Plus tard','Later'):t('Compris','Got it')}</button>${offer?`<button type="button" data-help-read>${t('Consulter le guide','Read the guide')}</button>`:''}</footer>`;
    help.querySelector('[data-help-close]').onclick=()=>{remember();help.close();};
    const read=help.querySelector('[data-help-read]');if(read)read.onclick=()=>{remember();guide(false);};
    if(!help.open)help.showModal();
  }
  help.addEventListener('cancel',remember);
  panel.querySelector('[data-review-help]').onclick=()=>guide();bar.querySelector('[data-review-help]').onclick=()=>guide();
  function summary(){return model.summary();}
  function summaryHtml(){
    const rows=summary();
    const stopsHtml=stops=>stops.length?`<ul class="summary-stop-list">${stops.map(stop=>`<li><strong>${esc(stop.label)}${stop.label!==stop.id?' ('+esc(stop.id)+')':''}</strong> — ${esc(stop.description||t('Description non disponible','Description unavailable'))}</li>`).join('')}</ul>`:t('Aucun stop associé','No associated stops');
    return `<section class="review-summary"><h3>${t('Validation des places','Place approvals')}</h3><p>${rows.filter(row=>row.validated).length} / ${rows.length} ${t('places validées','places approved')}</p><p>${t('Stops associés selon les choix actuels du client.','Associated stops reflect the client’s current choices.')}</p><div class="table-scroll"><table><thead><tr><th>${t('Code','Code')}</th><th>${t('Description','Description')}</th><th>${t('Stops associés · ID et description','Associated stops · ID and description')}</th><th>${t('Revue','Review')}</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.code)}</td><td>${esc(row.description)}</td><td>${stopsHtml(row.stops)}</td><td>${row.validated?t('Validée','Approved'):t('À traiter','Pending')}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function cleanClone(clone){clone.querySelectorAll('[data-review-runtime]').forEach(node=>node.remove());clone.querySelector('body').classList.remove('review-mode');clone.querySelector('body').style.removeProperty('--review-toolbar-height');clone.querySelector('body').style.removeProperty('--report-anchor-offset');clone.querySelectorAll('[data-report-place]').forEach(node=>{node.style.removeProperty('--place-table-height');node.style.removeProperty('--place-map-height');node.style.removeProperty('--place-map-width');});clone.querySelectorAll('.review-active').forEach(node=>node.classList.remove('review-active'));}
  refresh();if(!seen)guide(true);
  return {refresh,summary,summaryHtml,cleanClone};
}

function placeReportEditorRuntime() {
  'use strict';
  const dataNode = document.getElementById('report-data'), data = JSON.parse(dataNode.textContent);
  const en = data.language === 'en', t = data.editor;
  const maxLength = Number(data.placeCodeMaxLength) === 8 ? 8 : 6;
  const codePattern = new RegExp(`^[A-Za-z0-9]{1,${maxLength}}$`);
  const message = (fr, english) => en ? english : fr;
  const packageTools = reportPackageTools(), packageAvailability = packageTools.availability(data);
  Object.assign(t, {
    ambiguousPlace: message('Correspondance de place ambiguë : export bloqué.', 'Ambiguous place mapping: export blocked.'),
    invalidAssignment: message('Affectation impossible : stop absent ou type incompatible.', 'Invalid assignment: missing stop or incompatible type.'),
    brokenReferences: message('Références GTFS incohérentes : export bloqué.', 'Inconsistent GTFS references: export blocked.'),
    externalReferences: message('Cette place est référencée dans un autre fichier GTFS. Utilisez le paquet ZIP complet pour adapter aussi ces références.', 'This place is referenced in another GTFS file. Use the complete ZIP package to update those references as well.'),
    incompleteGtfs: message('GTFS complet indisponible : rechargez le GTFS complet dans l’Assistant puis régénérez le rapport.', 'Complete GTFS unavailable: load the complete GTFS in the Assistant and regenerate the report.'),
    duplicateFiles: message('Noms de fichiers en double ou invalides : archive non créée.', 'Duplicate or invalid filenames: archive not created.'),
    brokenFeedReferences: message('Références incohérentes entre les fichiers du GTFS : archive non créée.', 'Inconsistent references between GTFS files: archive not created.'),
    zipTooLarge: message('Archive trop volumineuse pour ce format ZIP (4 Go maximum).', 'Archive too large for this ZIP format (4 GB maximum).')
  });
  const edits = data.edits || {places: data.places.map(({key, code, description}) => ({key, code, description})), assignments: {...data.assignments}};
  const placeByKey = new Map(data.places.map(p => [p.key, p]));
  const cardByKey = new Map([...document.querySelectorAll('[data-report-place]')].map(card => [card.dataset.placeKey, card]));
  const search = document.getElementById('place-search'), count = document.getElementById('result-count');
  const status = document.getElementById('client-edit-status');
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  let filter = 'all', dirty = false, corrected;
  let fileSaver,reviewer;
  const markChanged=()=>{dirty=true;fileSaver.changed();};
  const currentPlace = key => ({...placeByKey.get(key), ...edits.places.find(p => p.key === key)});
  const assigned = id => edits.assignments[id] ?? data.assignments[id];
  const points = data.points || [];
  const controls = reportEditorControls(data,edits,data.undoHistory||[]);
  // Place validation is intentionally independent of the routes/timetables module.
  const network=null;
  let networkFrame=null,networkRevision='';
  document.querySelectorAll('[data-report-module]').forEach(button=>button.addEventListener('click',()=>{
    const isNetwork=button.dataset.reportModule==='network';document.body.classList.toggle('show-network',isNetwork);
    document.querySelectorAll('[data-report-module]').forEach(node=>node.setAttribute('aria-pressed',String(node===button)));
    if(!isNetwork)return;
    let section=document.getElementById('report-network-section');if(!section){section=document.createElement('section');section.id='report-network-section';document.querySelector('main').append(section);}
    const revision=JSON.stringify(edits);
    if(networkFrame&&revision===networkRevision)return;
    networkRevision=revision;networkFrame=document.createElement('iframe');networkFrame.title=message('Routes et timetables','Routes and timetables');
    networkFrame.srcdoc=reportNetworkDocumentHtml({...data,places:data.places.map(p=>currentPlace(p.key)),assignments:{...data.assignments,...edits.assignments},lazyNetwork:true});
    section.replaceChildren(networkFrame);
  }));
  window.addEventListener('message',event=>{if(event.source===networkFrame?.contentWindow&&event.data?.type==='csched-network-view')data.networkView=event.data.view;});
  // Report labels may be HASTUS stop codes; export IDs must remain exact GTFS IDs.
  for (const row of document.querySelectorAll('[data-stop-row]')) {
    const point = points.find(p => p.label === row.dataset.stopId || p.id === row.dataset.stopId);
    if (!point) continue;
    row.dataset.stopId = point.id;
    const select = row.querySelector('[data-stop-assignment]');
    if (data.assignments[point.id] === '__keep__' && !select.querySelector('option[value="__keep__"]')) {
      const option = document.createElement('option'); option.value = '__keep__';
      option.textContent = message('Conserver : ', 'Keep: ') + (point.parent || message('sans place', 'no place'));
      select.prepend(option);
    }
    select.disabled = !point.editable;
    if (!point.editable) select.title = message('Stop absent du GTFS ou type incompatible.', 'Stop missing from GTFS or incompatible type.');
  }
  for (const row of document.querySelectorAll('[data-candidate-stop]')) {
    const point = points.find(p => p.label === row.dataset.candidateStop || p.id === row.dataset.candidateStop);
    if (point) {row.dataset.candidateStop = point.id; row.querySelector('[data-candidate-place]').dataset.candidatePlace = point.id;}
  }
  const distance = controls.distance;
  function fillAssignment(select,id,full=false) {
    const point=points.find(p=>p.id===id);if(!point)return;
    select.dataset.assignmentId=id;
    select.replaceChildren();
    if(data.assignments[id]==='__keep__'){
      const option=document.createElement('option');option.value='__keep__';
      option.textContent=message('Conserver : ','Keep: ')+(point.parent||message('sans place','no place'));select.append(option);
    }
    const selected=currentPlace(assigned(id));
    const choices=full?controls.options(point):selected.key?[{...selected,distance:distance(point,selected)}]:[];
    for(const place of choices){
      const option=document.createElement('option');option.value=place.key;
      option.textContent=place.code+' · '+place.description+' — '+(Number.isFinite(place.distance)?Math.round(place.distance).toLocaleString(en?'en-CA':'fr-CA')+' m':message('distance inconnue','unknown distance'));
      select.append(option);
    }
    select.value=assigned(id)||'__keep__';select.disabled=!point.editable;
    select.title=point.editable?message('Distance à vol d’oiseau du stop au centre de la place.','Straight-line distance from the stop to the place centre.'):message('Stop absent du GTFS ou type incompatible.','Stop missing from GTFS or incompatible type.');
  }
  function applyFilter() {
    let shown = 0;
    for (const [key, card] of cardByKey) {
      const place = currentPlace(key), names = points.filter(p => assigned(p.id) === key).map(p => p.id + ' ' + p.description).join(' ');
      const visible = (filter === 'all' || card.dataset.kind === filter) && norm(place.code + ' ' + place.description + ' ' + names).includes(norm(search.value.trim()));
      card.hidden = !visible;
      if (visible) shown++;
      for (const item of document.querySelectorAll('[data-report-filter-item]')) if (item.dataset.placeKey === key) item.hidden = !visible;
    }
    for (const group of document.querySelectorAll('.nav-group')) group.hidden = ![...group.querySelectorAll('[data-report-filter-item]')].some(item => !item.hidden);
    count.textContent = shown + ' ' + data.shown;
    document.getElementById('empty-results').classList.toggle('visible', shown === 0);
  }
  function validate() {
    corrected = reportEditorEngine(data, edits, false, packageAvailability.ready);
    status.textContent = corrected.errors.length ? corrected.errors.map(error => t[error] || error).join(' ') : (data.gtfs ? t.ready : t.unavailable) + (dirty ? message(' · Enregistrez le rapport pour conserver vos choix.', ' · Save the report to keep your changes.') : '');
    status.setAttribute('role', corrected.errors.length ? 'alert' : 'status');
    for (const id of ['download-client-stops', 'download-client-times']) {
      const button = document.getElementById(id);
      if (button) {button.disabled = corrected.errors.length > 0 || !data.gtfs || corrected.externalFileChanges;button.title=corrected.externalFileChanges?t.externalReferences:'';}
    }
    const zipButton = document.getElementById('download-client-package');
    if (zipButton) zipButton.disabled = corrected.errors.length > 0 || !packageAvailability.ready;
    const packageStatus = document.getElementById('client-package-status');
    if (packageStatus) packageStatus.textContent = packageAvailability.ready ? message('Le ZIP contient le rapport corrigé, son compte rendu et le GTFS complet.', 'The ZIP includes the edited report, change summary and complete GTFS.') : t.incompleteGtfs + ' ' + packageAvailability.missing.join(', ');
    for (const [key, card] of cardByKey) {
      const place = currentPlace(key), input = card.querySelector('[data-place-code]');
      const invalid = !codePattern.test(place.code) || edits.places.some(p => p.key !== key && norm(p.code) === norm(place.code));
      input.classList.toggle('invalid', invalid);
      input.setAttribute('aria-invalid', String(invalid));
      card.querySelector('[data-place-description]').setAttribute('aria-invalid', String(!place.description.trim()));
      const undo=card.querySelector('[data-place-undo]');
      if(undo){undo.disabled=!controls.canUndo(key);undo.title=message('Annuler la dernière modification faite depuis cette fiche. Si ce stop a été modifié ensuite ailleurs, annuler d’abord cette modification.','Undo the last edit made from this card. If this stop was edited elsewhere afterwards, undo that edit first.');}
    }
    reviewer?.refresh();
    refreshReview();
    network?.refresh();
  }
  function refreshReview(force=false, savedAt=data.savedAt) {
    const changes=packageTools.changes(data,edits),show=force||Boolean(data.edits)||dirty||changes.places.length>0||changes.stops.length>0||Object.keys(data.clientReview?.approvals||{}).length>0;
    let section=document.getElementById('client-change-summary');
    if(!show&&!section)return;
    if(!section){section=document.createElement('section');section.id='client-change-summary';section.className='overview change-summary';document.querySelector('main').prepend(section);}
    const brand=document.querySelector('#report-top header')?.outerHTML||'';
    section.innerHTML=brand+packageTools.reviewHtml(data,edits,savedAt)+(reviewer?.summaryHtml()||'');
    const link=document.getElementById('client-review-link');if(link)link.hidden=false;
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], {type})), link = document.createElement('a');
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function refreshNames() {
    for (const node of document.querySelectorAll('[data-place-key]')) {
      const place = currentPlace(node.dataset.placeKey);
      node.querySelectorAll('[data-place-code-display]').forEach(el => el.textContent = place.code);
      node.querySelectorAll('[data-place-description-display]').forEach(el => el.textContent = place.description);
      node.querySelector('.place-map svg')?.setAttribute('aria-label', message('Carte OpenStreetMap de la place ', 'OpenStreetMap map of place ') + place.description);
    }
    for (const select of document.querySelectorAll('[data-stop-assignment]')) fillAssignment(select,select.dataset.assignmentId||select.closest('[data-stop-row]')?.dataset.stopId);
    for (const node of document.querySelectorAll('[data-candidate-place]')) {
      const target = assigned(node.dataset.candidatePlace);
      if (placeByKey.has(target)) {const p = currentPlace(target); node.textContent = p.code + ' · ' + p.description;}
    }
    // Keep the contents alphabetical within each original diagnostic category.
    const order = (a,b) => Number(b.dataset.kind === 'decision') - Number(a.dataset.kind === 'decision') || currentPlace(a.dataset.placeKey).code.localeCompare(currentPlace(b.dataset.placeKey).code, data.language, {numeric:true,sensitivity:'base'});
    for (const group of document.querySelectorAll('.nav-group,.summary-links')) [...group.querySelectorAll('[data-report-filter-item]')].sort(order).forEach(link => group.append(link));
  }
  function updateMaps() {
    const ns = 'http://www.w3.org/2000/svg';
    const el = (tag, attributes, text) => {const node = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text != null) node.textContent = text; return node;};
    for (const [key, card] of cardByKey) {
      const place = placeByKey.get(key), geometry = place.geometry, svg = card.querySelector('.place-map svg');
      if (!geometry || !svg) continue;
      svg.querySelectorAll('.report-stop').forEach(node => node.remove());
      const group = el('g', {class: 'report-stop client-markers'});
      let outside = 0;
      const numbers = new Map([...card.querySelectorAll('[data-stop-row]')].map(row => [row.dataset.stopId, row.cells[0].textContent]));
      for (const point of points) {
        const own = assigned(point.id) === key, d = distance(place, point);
        if (!own && d > geometry.displayRadius) continue;
        const scale = 256 * 2 ** geometry.zoom, sin = Math.sin(Number(point.lat) * Math.PI / 180);
        const x = (Number(point.lon) + 180) / 360 * scale - geometry.center.x + geometry.width / 2;
        const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale - geometry.center.y + geometry.height / 2;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 12 || y < 12 || x > geometry.width - 12 || y > geometry.height - 12) {if (own) outside++; continue;}
        const marker = el('g', {class: 'report-stop ' + (own ? 'associated' : d <= place.radius ? 'inside' : 'outside')});
        marker.append(el('circle', {cx: x, cy: y, r: 8}));
        if (own) marker.append(el('text', {class: 'marker-number', x, y: y + 3}, numbers.get(point.id)));
        marker.append(el('text', {class: 'stop-id-label', x: x > geometry.width - 200 ? x - 12 : x + 12, y: y - 10, 'text-anchor': x > geometry.width - 200 ? 'end' : 'start'}, point.label || point.id));
        group.append(marker);
      }
      svg.append(group);
      let note = card.querySelector('[data-map-warning]');
      if (!note) {note = document.createElement('p'); note.dataset.mapWarning = ''; note.className = 'map-note'; card.querySelector('.place-map').after(note);}
      note.hidden = outside === 0;
      note.textContent = outside + message(' stop(s) associé(s) hors du cadrage fixe de cette carte. Voir les coordonnées dans le tableau.', ' associated stop(s) outside this fixed map extent. See coordinates in the table.');
    }
  }
  function refreshAssignments() {
    // Candidates not shown in an associated table yet need their own movable row.
    const existing=new Set([...document.querySelectorAll('[data-stop-row]')].map(row=>row.dataset.stopId));
    for(const point of points){
      const card=cardByKey.get(assigned(point.id));if(!card||existing.has(point.id))continue;
      const row=document.createElement('tr');row.dataset.stopRow='';row.dataset.stopId=point.id;row.dataset.originalPlace=point.originalPlace||'';
      for(const value of ['',point.label||point.id,point.description,'',Number(point.lat).toFixed(6)+', '+Number(point.lon).toFixed(6)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
      const cell=document.createElement('td'),select=document.createElement('select'),note=document.createElement('small');
      select.className='assignment-select';select.dataset.stopAssignment='';select.setAttribute('aria-label',t.assignment+' '+(point.label||point.id));
      note.className='assignment-change';note.textContent=t.changed;cell.append(select,note);row.append(cell);card.querySelector('[data-associated-body]').append(row);
    }
    for (const row of [...document.querySelectorAll('[data-stop-row]')]) {
      const id = row.dataset.stopId, target = assigned(id), place = placeByKey.get(target), select = row.querySelector('[data-stop-assignment]');
      select.value = target || '__keep__';
      const card = cardByKey.get(target) || cardByKey.get(row.dataset.originalPlace);
      if(!card){row.remove();continue;}
      if (card) card.querySelector('[data-associated-body]').append(row);
      const changed = target !== data.assignments[id];
      row.querySelector('.assignment-change').hidden = !changed;
      const point = points.find(p => p.id === id);
      if (point) row.cells[3].textContent = Math.round(distance(place||placeByKey.get(row.dataset.originalPlace), point)) + ' m';
    }
    for (const [key, card] of cardByKey) {
      const rows = [...card.querySelectorAll('[data-stop-row]')];
      rows.forEach((row, index) => row.cells[0].textContent = index + 1);
      card.querySelector('.facts b').textContent = rows.length;
      card.querySelector('details summary b').textContent = rows.length;
      for (const item of document.querySelectorAll('[data-report-filter-item]')) if (item.dataset.placeKey === key) item.querySelector('small').textContent = rows.length + message(' stops associés', ' associated stops');
    }
    // Rebuild nearby lists too: a moved stop may become a candidate at its old place.
    for (const [key, card] of cardByKey) {
      const place = placeByKey.get(key), details = card.querySelectorAll('details')[1], body = details.querySelector('tbody');
      const nearby = points.map(point => ({...point, distance: distance(place, point)})).filter(point => assigned(point.id) !== key && point.distance <= place.geometry.displayRadius).sort((a,b) => a.distance-b.distance);
      body.replaceChildren();
      nearby.forEach((point, index) => {
        const row = document.createElement('tr'); row.dataset.candidateStop = point.id;
        row.className = point.distance <= place.radius ? 'inside' : 'outside';
        const owner = assigned(point.id), label = placeByKey.has(owner) ? currentPlace(owner).code + ' · ' + currentPlace(owner).description : point.parent || message('Sans place', 'No place');
        const values = [String.fromCharCode(65+index%26)+(index>=26?Math.floor(index/26):''), point.label||point.id, point.description, label, Math.round(point.distance)+' m', point.distance <= place.radius ? message('Dans le rayon — rattachement à évaluer', 'Within radius — review assignment') : message('Hors rayon de ', 'Outside radius by ')+Math.round(point.distance-place.radius)+' m'];
        values.forEach((value, i) => {const cell=document.createElement('td'); cell.textContent=value; if(i===3)cell.dataset.candidatePlace=point.id; row.append(cell);});
        const cell=document.createElement('td'),select=document.createElement('select');
        select.className='assignment-select';select.dataset.stopAssignment='';select.dataset.assignmentId=point.id;
        select.setAttribute('aria-label',t.assignment+' '+(point.label||point.id));cell.append(select);row.append(cell);
        body.append(row);
      });
      if (!nearby.length) {const row=document.createElement('tr'), cell=document.createElement('td'); cell.colSpan=7; cell.textContent=message('Aucun stop à considérer dans cette zone.', 'No other stops to consider in this area.'); row.append(cell); body.append(row);}
      details.querySelector('summary b').textContent=nearby.length;
      card.querySelectorAll('.facts b')[1].textContent=nearby.length;
    }
    refreshNames(); updateMaps(); applyFilter(); validate();
  }
  document.querySelectorAll('button[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    document.querySelectorAll('button[data-filter]').forEach(other => {const active = other === button; other.classList.toggle('active', active); other.setAttribute('aria-pressed', String(active));});
    applyFilter();
    document.getElementById('report-top').scrollIntoView({block: 'start'});
  }));
  search.addEventListener('input', applyFilter);
  let activeInput=null;
  document.addEventListener('focusout',()=>{activeInput=null;});
  document.addEventListener('focusin',event=>{if(event.target.matches('[data-stop-assignment]'))fillAssignment(event.target,event.target.dataset.assignmentId,true);});
  document.addEventListener('focusout',event=>{if(event.target.matches('[data-stop-assignment]'))fillAssignment(event.target,event.target.dataset.assignmentId);});
  document.addEventListener('input', event => {
    if (!event.target.matches('[data-place-code],[data-place-description]')) return;
    const key = event.target.closest('[data-report-place]').dataset.placeKey;
    controls.set(key,key,event.target.matches('[data-place-code]')?'code':'description',event.target.value,activeInput===event.target);
    activeInput=event.target;
    markChanged(); refreshNames(); applyFilter(); validate();
  });
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-stop-assignment]')) return;
    const owner=event.target.closest('[data-report-place]').dataset.placeKey;
    controls.set(owner,event.target.dataset.assignmentId,'assignment',event.target.value);
    markChanged(); refreshAssignments();
  });
  for (const [key, card] of cardByKey) {
    let undo=card.querySelector('[data-place-undo]');
    if(!undo){undo=document.createElement('button');undo.type='button';undo.dataset.placeUndo='';undo.className='place-undo';card.querySelector('[data-place-editor]').append(undo);}
    undo.textContent=message('Annuler la dernière modification','Undo');
    undo.addEventListener('click',()=>{
      if(!controls.undo(key))return;
      for(const [id,node] of cardByKey){node.querySelector('[data-place-code]').value=currentPlace(id).code;node.querySelector('[data-place-description]').value=currentPlace(id).description;}
      markChanged();activeInput=null;refreshAssignments();
    });
    const head=card.querySelectorAll('details')[1].querySelector('thead tr');
    if(head.cells.length===6){const cell=document.createElement('th');cell.textContent=t.assignment;head.append(cell);}
    const p = currentPlace(key);
    card.querySelector('[data-place-code]').value = p.code;
    card.querySelector('[data-place-description]').value = p.description;
  }
  for(const [id,kind,name] of [['download-client-stops','stops','stops.txt'],['download-client-times','times','stop_times.txt']])document.getElementById(id)?.addEventListener('click',async()=>{
    validate();if(corrected.errors.length)return;const button=document.getElementById(id);button.disabled=true;
    try{download(name,await reportPayloadWorker(data,edits,kind),'text/csv;charset=utf-8');}catch(error){status.textContent=error.message;}finally{validate();}
  });
  function editedHtml(savedAt) {
    // Persist in the HTML itself, not file:// localStorage (browser-dependent).
    refreshReview(true);
    const snapshot = {...data, edits, undoHistory:controls.history, savedAt};
    const clone = document.documentElement.cloneNode(true);
    clone.querySelector('#client-change-summary').innerHTML=(document.querySelector('#report-top header')?.outerHTML||'')+packageTools.reviewHtml(data,edits,savedAt)+(reviewer?.summaryHtml()||'');
    reviewer?.cleanClone(clone);
    // Never serialize an active permission or a misleading "saved" indicator.
    clone.querySelector('#client-autosave-controls')?.remove();
    const saveButton=clone.querySelector('#save-client-report');
    saveButton.disabled=false;saveButton.textContent=message('Enregistrer le rapport HTML corrigé','Save edited HTML report');
    clone.classList.remove('show-network');clone.querySelector('body').classList.remove('show-network');clone.querySelector('#report-network-section')?.remove();
    clone.querySelectorAll('[data-report-module]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.reportModule==='places')));
    // Persist only the selected option. Alternatives are populated when a menu is opened.
    clone.querySelectorAll('[data-stop-assignment]').forEach(select=>{const id=select.dataset.assignmentId||select.closest('[data-stop-row]')?.dataset.stopId,target=assigned(id)||'__keep__';select.querySelectorAll('option').forEach(option=>{if(option.value!==target)option.remove();else option.setAttribute('selected','');});});
    const packageButton=clone.querySelector('#download-client-package');
    if(packageButton){packageButton.textContent=message('Télécharger le ZIP de retour client','Download client-return ZIP');packageButton.disabled=corrected.errors.length>0||!packageAvailability.ready;}
    clone.querySelector('#report-data').textContent = JSON.stringify(snapshot).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    clone.querySelectorAll('[data-report-place],[data-report-filter-item],.nav-group').forEach(node=>node.hidden=false);
    return '<!doctype html>\n' + clone.outerHTML;
  }
  const saveButton=document.getElementById('save-client-report');
  document.getElementById('client-autosave-controls')?.remove();
  const autoPanel=document.createElement('div');autoPanel.id='client-autosave-controls';
  const autoButton=document.createElement('button'),copyButton=document.createElement('button'),saveStatus=document.createElement('p'),saveHelp=document.createElement('p');
  autoButton.type=copyButton.type='button';autoButton.id='toggle-client-autosave';copyButton.id='download-client-report-copy';saveStatus.id='client-save-status';saveStatus.setAttribute('role','status');saveStatus.setAttribute('aria-live','polite');
  copyButton.textContent=message('Télécharger une copie HTML','Download an HTML copy');
  const supported=typeof window.showSaveFilePicker==='function'&&window.isSecureContext!==false;
  saveHelp.textContent=supported?message('Choisissez une copie de travail HTML. Après activation, les modifications remplacent ce même fichier. À chaque réouverture, choisissez-le à nouveau pour autoriser l’écriture. Le ZIP final reste un export séparé.','Choose a working HTML copy. Once enabled, edits replace that same file. Each time you reopen it, select it again to authorize writing. The final ZIP is a separate export.'):message('Écriture directe indisponible ici. Ouvrez le rapport dans Chrome ou Edge si possible, ou téléchargez une copie pour conserver vos choix.','Direct file saving is unavailable here. Open the report in Chrome or Edge if possible, or download a copy to keep your changes.');
  autoPanel.append(autoButton,copyButton,saveStatus,saveHelp);saveButton.before(autoPanel);
  let choosing=false;
  fileSaver=reportFileSaver({snapshot:editedHtml,onSaved(savedAt,revision){data.savedAt=savedAt;dirty=fileSaver.state.revision!==revision;validate();},onState(s){
    autoButton.disabled=!supported||s.saving||choosing;saveButton.disabled=s.saving||choosing;
    autoButton.textContent=s.enabled?message('Suspendre la sauvegarde automatique','Pause autosave'):s.handle&&!s.error?message('Reprendre la sauvegarde automatique','Resume autosave'):message('Activer la sauvegarde automatique…','Enable autosave…');
    autoButton.setAttribute('aria-pressed',String(s.enabled));
    saveButton.textContent=supported?message('Enregistrer maintenant','Save now'):message('Télécharger le rapport HTML corrigé','Download edited HTML report');
    const target=s.handle?' · '+s.handle.name:'';
    saveStatus.textContent=choosing?message('Choisissez votre fichier de travail…','Choose your working file…'):s.error?(s.error.message==='externalChange'?message('Fichier modifié ailleurs : sauvegarde suspendue pour ne pas écraser ces changements. Téléchargez une copie, puis comparez les versions.','File changed elsewhere: saving paused to avoid overwriting those changes. Download a copy, then compare versions.'):message('Échec de sauvegarde : ','Save failed: ')+s.error.message)+target:s.saving?message('Enregistrement…','Saving…')+target:s.pending?(s.enabled?message('Modifications en attente de sauvegarde…','Changes waiting to be saved…'):message('Modifications non enregistrées.','Unsaved changes.'))+target:s.lastSaved?message('Enregistré à ','Saved at ')+new Date(s.lastSaved).toLocaleTimeString(en?'en-CA':'fr-CA')+target+(s.enabled?'':message(' · automatique suspendu',' · autosave paused')):message('Sauvegarde automatique inactive.','Autosave is off.');
  }});
  async function chooseFile(){
    if(choosing)return;choosing=true;fileSaver.notify();let failure='';
    try{
      // Open the picker immediately inside the user's click (required user activation).
      const handle=await window.showSaveFilePicker({suggestedName:data.filename+(en?'_edited.html':'_corrige.html'),types:[{description:'HTML',accept:{'text/html':['.html']}}]});
      await fileSaver.connect(handle);
    }catch(error){failure=error.name==='AbortError'?message('Sélection annulée. Aucun fichier enregistré.','Selection cancelled. No file saved.'):message('Sauvegarde indisponible : ','Saving unavailable: ')+error.message;}
    finally{choosing=false;fileSaver.notify();if(failure)saveStatus.textContent=failure;}
  }
  autoButton.addEventListener('click',()=>{if(fileSaver.state.enabled)fileSaver.pause();else if(fileSaver.state.handle&&!fileSaver.state.error)fileSaver.resume();else chooseFile();});
  function downloadCopy(){
    try{
    const savedAt=new Date().toISOString();
    download(data.filename + (en ? '_edited.html' : '_corrige.html'), editedHtml(savedAt), 'text/html;charset=utf-8');
    // A downloaded copy is not a successful write to the connected working file.
    if(!fileSaver.state.handle){data.savedAt=savedAt;dirty=false;}validate();
    saveStatus.textContent=message('Copie HTML téléchargée ; le fichier de travail n’a pas été remplacé.','HTML copy downloaded; the working file was not replaced.');
    }catch(error){saveStatus.textContent=message('Impossible de préparer la copie HTML : ','Could not prepare the HTML copy: ')+error.message;saveStatus.setAttribute('role','alert');}
  }
  copyButton.addEventListener('click',downloadCopy);
  saveButton.addEventListener('click',()=>{if(!supported)downloadCopy();else if(!fileSaver.state.handle)chooseFile();else fileSaver.save(true);});
  fileSaver.notify();
  document.getElementById('download-client-package')?.addEventListener('click', async () => {
    validate();if(corrected.errors.length||!packageAvailability.ready)return;
    const button=document.getElementById('download-client-package'),label=button.textContent;
    button.disabled=true;button.textContent=message('Préparation du ZIP…','Preparing ZIP…');
    try {
      const revision=fileSaver.state.revision,exportEdits=JSON.parse(JSON.stringify(edits)),savedAt=new Date().toISOString(),html=editedHtml(savedAt),placeApprovals=reviewer?.summary()||[];
      await new Promise(resolve=>setTimeout(resolve,30));
      const gtfsZip=await reportPayloadWorker(data,exportEdits,'zip');
      const summary=packageTools.changes(data,exportEdits);
      const bundle=packageTools.zip([
        {name:data.filename+(en?'_edited.html':'_corrige.html'),text:html},
        {name:'GTFS_finalise.zip',bytes:gtfsZip},
        {name:en?'changes.json':'modifications.json',text:JSON.stringify({savedAt,...summary,placeApprovals},null,2)},
        {name:en?'READ_ME.txt':'LIRE_MOI.txt',text:message('Retour client : ouvrir le rapport HTML pour consulter le compte rendu avant/après en première page. Après revue, utiliser GTFS_finalise.zip pour votre procédure d’import HASTUS. Les horaires et les coordonnées des stops ne sont pas modifiés. Conserver le GTFS d’origine.','Client return: open the HTML report to review the before/after summary on the first page. After review, use GTFS_finalise.zip for your HASTUS import workflow. Schedules and stop coordinates are unchanged. Keep the original GTFS.')}
      ]);
      download(data.filename+(en?'_client_return.zip':'_retour_client.zip'),bundle,'application/zip');
      if(!fileSaver.state.handle&&fileSaver.state.revision===revision){data.savedAt=savedAt;dirty=false;}validate();
    }catch(error){status.textContent=t[error.message]||message('Impossible de créer le ZIP : ','Could not create ZIP: ')+error.message;status.setAttribute('role','alert');}
    finally{button.textContent=label;button.disabled=corrected.errors.length>0||!packageAvailability.ready;}
  });
  window.addEventListener('beforeunload', event => {if (dirty) {event.preventDefault(); event.returnValue = '';}});
  // Ensure a saved filtered document always opens with its complete contents.
  search.value = '';
  document.querySelectorAll('button[data-filter]').forEach(button => {const active = button.dataset.filter === 'all'; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));});
  refreshAssignments();
  function revealPlace(key){
    filter='all';search.value='';
    document.querySelectorAll('button[data-filter]').forEach(button=>{const selected=button.dataset.filter==='all';button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
    applyFilter();cardByKey.get(key)?.scrollIntoView({block:'start',behavior:'instant'});
  }
  reviewer=mountReportReview({data,edits,cards:cardByKey,currentPlace,assigned,points,controls,markChanged:()=>{markChanged();refreshReview();},applyFilter,revealPlace,hasErrors:()=>Boolean(corrected?.errors.length)});
  refreshReview();
}
