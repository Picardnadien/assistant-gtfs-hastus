/* These functions are embedded verbatim in the standalone report: no external dependencies. */
function reportEditorEngine(data, edits, serializeOutput = true) {
  const places = data.places.map(original => ({...original, ...(edits.places || []).find(p => p.key === original.key)}));
  const assignments = {...data.assignments, ...edits.assignments};
  const errors = [], key = value => String(value ?? '').trim().toUpperCase();
  const codes = new Set(), sourceIds = new Set(), targets = new Map();
  for (const place of places) {
    place.code = String(place.code ?? '').trim();
    place.description = String(place.description ?? '').trim();
    if (!/^[A-Za-z0-9]{1,6}$/.test(place.code) || codes.has(key(place.code))) errors.push('invalidCode');
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
  if ((data.gtfs.externalStopReferences || []).some(id => renames.has(id) && renames.get(id) !== id)) errors.push('externalReferences');
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
  if (outputIds.size !== stops.length || stops.some(row => row.parent_station && !outputIds.has(row.parent_station)) || data.gtfs.times.rows.some(row => !outputIds.has(renames.get(row.stop_id) ?? row.stop_id))) errors.push('brokenReferences');
  if (!serializeOutput) return {errors: [...new Set(errors)], places, assignments};
  const times = data.gtfs.times.rows.map(row => ({...row, stop_id: renames.get(row.stop_id) ?? row.stop_id}));
  const csv = value => {const text = String(value ?? ''); return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;};
  const serialize = (columns, values) => [columns.map(csv).join(','), ...values.map(row => columns.map(column => csv(row[column])).join(','))].join('\r\n') + '\r\n';
  return {errors: [...new Set(errors)], places, assignments, stops: serialize(headers, stops), times: serialize(data.gtfs.times.headers, times)};
}

function placeReportEditorRuntime() {
  'use strict';
  const dataNode = document.getElementById('report-data'), data = JSON.parse(dataNode.textContent);
  const en = data.language === 'en', t = data.editor;
  const message = (fr, english) => en ? english : fr;
  Object.assign(t, {
    ambiguousPlace: message('Correspondance de place ambiguë : export bloqué.', 'Ambiguous place mapping: export blocked.'),
    invalidAssignment: message('Affectation impossible : stop absent ou type incompatible.', 'Invalid assignment: missing stop or incompatible type.'),
    brokenReferences: message('Références GTFS incohérentes : export bloqué.', 'Inconsistent GTFS references: export blocked.'),
    externalReferences: message('Cette place est référencée dans un autre fichier GTFS (transfers, pathways…). Son code doit être conservé, ou ces autres fichiers doivent aussi être adaptés hors de ce rapport.', 'This place is referenced in another GTFS file (transfers, pathways…). Keep its code, or update those other files outside this report as well.')
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
  const distance = (a, b) => {
    const rad = Math.PI / 180, dlat = (b.lat - a.lat) * rad, dlon = (b.lon - a.lon) * rad;
    const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  };
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
    corrected = reportEditorEngine(data, edits, false);
    status.textContent = corrected.errors.length ? corrected.errors.map(error => t[error] || error).join(' ') : (data.gtfs ? t.ready : t.unavailable) + (dirty ? message(' · Enregistrez le rapport pour conserver vos choix.', ' · Save the report to keep your changes.') : '');
    status.setAttribute('role', corrected.errors.length ? 'alert' : 'status');
    for (const id of ['download-client-stops', 'download-client-times']) {
      const button = document.getElementById(id);
      if (button) button.disabled = corrected.errors.length > 0 || !data.gtfs;
    }
    for (const [key, card] of cardByKey) {
      const place = currentPlace(key), input = card.querySelector('[data-place-code]');
      const invalid = !/^[A-Za-z0-9]{1,6}$/.test(place.code) || edits.places.some(p => p.key !== key && norm(p.code) === norm(place.code));
      input.classList.toggle('invalid', invalid);
      input.setAttribute('aria-invalid', String(invalid));
      card.querySelector('[data-place-description]').setAttribute('aria-invalid', String(!place.description.trim()));
    }
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
    for (const select of document.querySelectorAll('[data-stop-assignment]')) for (const option of select.options) {
      if (placeByKey.has(option.value)) {const p = currentPlace(option.value); option.textContent = p.code + ' · ' + p.description;}
    }
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
    for (const row of [...document.querySelectorAll('[data-stop-row]')]) {
      const id = row.dataset.stopId, target = assigned(id), place = placeByKey.get(target), select = row.querySelector('[data-stop-assignment]');
      select.value = target || '__keep__';
      const card = cardByKey.get(target) || cardByKey.get(row.dataset.originalPlace);
      if (card) card.querySelector('[data-associated-body]').append(row);
      const changed = target !== data.assignments[id];
      row.querySelector('.assignment-change').hidden = !changed;
      const point = points.find(p => p.id === id);
      if (place && point) row.cells[3].textContent = Math.round(distance(place, point)) + ' m';
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
        body.append(row);
      });
      if (!nearby.length) {const row=document.createElement('tr'), cell=document.createElement('td'); cell.colSpan=6; cell.textContent=message('Aucun stop à considérer dans cette zone.', 'No other stops to consider in this area.'); row.append(cell); body.append(row);}
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
  document.addEventListener('input', event => {
    if (!event.target.matches('[data-place-code],[data-place-description]')) return;
    const key = event.target.closest('[data-report-place]').dataset.placeKey, edit = edits.places.find(p => p.key === key);
    edit[event.target.matches('[data-place-code]') ? 'code' : 'description'] = event.target.value;
    dirty = true; refreshNames(); applyFilter(); validate();
  });
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-stop-assignment]')) return;
    edits.assignments[event.target.closest('[data-stop-row]').dataset.stopId] = event.target.value;
    dirty = true; refreshAssignments();
  });
  for (const [key, card] of cardByKey) {
    const p = currentPlace(key);
    card.querySelector('[data-place-code]').value = p.code;
    card.querySelector('[data-place-description]').value = p.description;
  }
  document.getElementById('download-client-stops')?.addEventListener('click', () => {validate(); if (!corrected.errors.length) download('stops.txt', reportEditorEngine(data, edits).stops, 'text/csv;charset=utf-8');});
  document.getElementById('download-client-times')?.addEventListener('click', () => {validate(); if (!corrected.errors.length) download('stop_times.txt', reportEditorEngine(data, edits).times, 'text/csv;charset=utf-8');});
  document.getElementById('save-client-report').addEventListener('click', () => {
    // Persist in the downloaded document, not file:// localStorage (browser-dependent).
    const snapshot = {...data, edits};
    const clone = document.documentElement.cloneNode(true);
    clone.querySelector('#report-data').textContent = JSON.stringify(snapshot).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    download(data.filename + (en ? '_edited.html' : '_corrige.html'), '<!doctype html>\n' + clone.outerHTML, 'text/html;charset=utf-8');
    dirty = false; validate();
  });
  window.addEventListener('beforeunload', event => {if (dirty) {event.preventDefault(); event.returnValue = '';}});
  // Ensure a saved filtered document always opens with its complete contents.
  search.value = '';
  document.querySelectorAll('button[data-filter]').forEach(button => {const active = button.dataset.filter === 'all'; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));});
  refreshAssignments();
}
