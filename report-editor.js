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
    refreshReview();
    network?.refresh();
  }
  function refreshReview(force=false, savedAt=data.savedAt) {
    const changes=packageTools.changes(data,edits),show=force||Boolean(data.edits)||dirty||changes.places.length>0||changes.stops.length>0;
    let section=document.getElementById('client-change-summary');
    if(!show&&!section)return;
    if(!section){section=document.createElement('section');section.id='client-change-summary';section.className='overview change-summary';document.querySelector('main').prepend(section);}
    const brand=document.querySelector('#report-top header')?.outerHTML||'';
    section.innerHTML=brand+packageTools.reviewHtml(data,edits,savedAt);
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
    dirty = true; refreshNames(); applyFilter(); validate();
  });
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-stop-assignment]')) return;
    const owner=event.target.closest('[data-report-place]').dataset.placeKey;
    controls.set(owner,event.target.dataset.assignmentId,'assignment',event.target.value);
    dirty = true; refreshAssignments();
  });
  for (const [key, card] of cardByKey) {
    let undo=card.querySelector('[data-place-undo]');
    if(!undo){undo=document.createElement('button');undo.type='button';undo.dataset.placeUndo='';undo.className='place-undo';card.querySelector('[data-place-editor]').append(undo);}
    undo.textContent=message('Annuler la dernière modification','Undo');
    undo.addEventListener('click',()=>{
      if(!controls.undo(key))return;
      for(const [id,node] of cardByKey){node.querySelector('[data-place-code]').value=currentPlace(id).code;node.querySelector('[data-place-description]').value=currentPlace(id).description;}
      dirty=true;activeInput=null;refreshAssignments();
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
    // Persist in the downloaded document, not file:// localStorage (browser-dependent).
    refreshReview(true,savedAt);
    const snapshot = {...data, edits, undoHistory:controls.history, savedAt};
    const clone = document.documentElement.cloneNode(true);
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
  document.getElementById('save-client-report').addEventListener('click', () => {
    const savedAt=new Date().toISOString();
    download(data.filename + (en ? '_edited.html' : '_corrige.html'), editedHtml(savedAt), 'text/html;charset=utf-8');
    data.savedAt=savedAt; dirty = false; validate();
  });
  document.getElementById('download-client-package')?.addEventListener('click', async () => {
    validate();if(corrected.errors.length||!packageAvailability.ready)return;
    const button=document.getElementById('download-client-package'),label=button.textContent;
    button.disabled=true;button.textContent=message('Préparation du ZIP…','Preparing ZIP…');
    try {
      await new Promise(resolve=>setTimeout(resolve,30));
      const savedAt=new Date().toISOString(),gtfsZip=await reportPayloadWorker(data,edits,'zip');
      const summary=packageTools.changes(data,edits);
      const bundle=packageTools.zip([
        {name:data.filename+(en?'_edited.html':'_corrige.html'),text:editedHtml(savedAt)},
        {name:'GTFS_finalise.zip',bytes:gtfsZip},
        {name:en?'changes.json':'modifications.json',text:JSON.stringify({savedAt,...summary},null,2)},
        {name:en?'READ_ME.txt':'LIRE_MOI.txt',text:message('Retour client : ouvrir le rapport HTML pour consulter le compte rendu avant/après en première page. Après revue, utiliser GTFS_finalise.zip pour votre procédure d’import HASTUS. Les horaires et les coordonnées des stops ne sont pas modifiés. Conserver le GTFS d’origine.','Client return: open the HTML report to review the before/after summary on the first page. After review, use GTFS_finalise.zip for your HASTUS import workflow. Schedules and stop coordinates are unchanged. Keep the original GTFS.')}
      ]);
      download(data.filename+(en?'_client_return.zip':'_retour_client.zip'),bundle,'application/zip');
      data.savedAt=savedAt;dirty=false;validate();
    }catch(error){status.textContent=t[error.message]||message('Impossible de créer le ZIP : ','Could not create ZIP: ')+error.message;status.setAttribute('role','alert');}
    finally{button.textContent=label;button.disabled=corrected.errors.length>0||!packageAvailability.ready;}
  });
  window.addEventListener('beforeunload', event => {if (dirty) {event.preventDefault(); event.returnValue = '';}});
  // Ensure a saved filtered document always opens with its complete contents.
  search.value = '';
  document.querySelectorAll('button[data-filter]').forEach(button => {const active = button.dataset.filter === 'all'; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));});
  refreshAssignments();
}
