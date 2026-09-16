"use strict";

const state = { mode: "geographic", geographicClientType: "new", geographicReady: false, geographicNeedsRegroup: false, geographicCache: null, showCombinedConflictMap: false, activeConflictGroupId: null, activeConflictGroupSnapshot: null, reviewedConflictGroups: new Set(), conflictMapViews: new Map(), conflictResolutionFullscreen: false, smartRadiusStats: null, files: {}, parsed: {}, originalEntries: [], mapping: {}, decisions: [], groups: [], routeMaps: [], places: [], gtfsStops: [], workingStops: null, workingParentStations: 0, workingTimetableModels: [], collisions: [], stopIdRemap: new Map(), associationKey: "stop_id", mapDisplay: "combined", mapLabelMode: "stop_code", mapLabelModes: new Map(), mapZooms: new Map(), mapPans: new Map(), combinedRouteStates: new Map(), fullscreenMapId: null, workspace: {id:null,name:"",handle:null,mode:"none",lastSaved:null,dirty:false}, timepointFallback: false, filter: "all" };
const $ = (id) => document.getElementById(id);
const GTFS_FILE_KEYS={"stops.txt":"stops","stop_times.txt":"times","routes.txt":"routes","trips.txt":"trips","shapes.txt":"shapes","calendar.txt":"calendar","calendar_dates.txt":"calendarDates","agency.txt":"agency","frequencies.txt":"frequencies"};
function isGeographicNew(){return state.mode==="geographic"&&state.geographicClientType==="new";}
function isGeographicExisting(){return state.mode==="geographic"&&state.geographicClientType==="existing";}
function requiredKinds(){return isGeographicExisting()?["stops","times","hastus"]:state.mode==="maps"?["stops","times","routes","trips","shapes"]:(state.mode==="timetables"||state.mode==="workingTimetables")?["times","routes","trips"]:["stops","times"];}

const WORKSPACE_DB="hastus-gtfs-workspaces",WORKSPACE_STORE="recent",WORKSPACE_FILE=".hastus-workspace.json";
let workspaceDbPromise=null,quickSaveTimer=0;
function workspaceDb(){
  if(!workspaceDbPromise)workspaceDbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open(WORKSPACE_DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(WORKSPACE_STORE,{keyPath:"id"});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  return workspaceDbPromise;
}
async function workspaceRecords(){const db=await workspaceDb();return new Promise((resolve,reject)=>{const request=db.transaction(WORKSPACE_STORE).objectStore(WORKSPACE_STORE).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);});}
async function saveWorkspaceRecord(record){const db=await workspaceDb();return new Promise((resolve,reject)=>{const request=db.transaction(WORKSPACE_STORE,"readwrite").objectStore(WORKSPACE_STORE).put(record);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);});}
async function deleteWorkspaceRecord(id){const db=await workspaceDb();return new Promise((resolve,reject)=>{const request=db.transaction(WORKSPACE_STORE,"readwrite").objectStore(WORKSPACE_STORE).delete(id);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);});}
function workspaceStatus(kind,title,detail){const box=$("workspace-status");box.className=`workspace-status ${kind||""}`;box.innerHTML=`<span class="save-dot"></span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div>`;}
function workspaceTimestamp(){const d=new Date(),part=n=>String(n).padStart(2,"0");return `${d.getFullYear()}${part(d.getMonth()+1)}${part(d.getDate())}_${part(d.getHours())}${part(d.getMinutes())}${part(d.getSeconds())}`;}
function baseFileName(name){return String(name||"").split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g,"_")||"fichier.txt";}
async function writeWorkspaceFile(directory,name,content){const fileHandle=await directory.getFileHandle(baseFileName(name),{create:true}),writer=await fileHandle.createWritable();await writer.write(content);await writer.close();}
async function workspacePermission(handle,request=false){if(!handle)return false;const options={mode:"readwrite"};if(await handle.queryPermission(options)==="granted")return true;return request&&(await handle.requestPermission(options))==="granted";}
function workspaceSnapshot(){if(state.mode==="geographic"&&state.geographicReady)captureGeographicState();return {version:2,savedAt:new Date().toISOString(),mode:state.mode,geographicClientType:state.geographicClientType,geographicReady:state.geographicReady,geographicCache:state.geographicCache,files:state.files,parsed:state.parsed,originalEntries:state.originalEntries,mapping:state.mapping,decisions:state.decisions,groups:state.groups,routeMaps:state.routeMaps,places:state.places,gtfsStops:state.gtfsStops,workingStops:state.workingStops,workingParentStations:state.workingParentStations,collisions:state.collisions,stopIdRemap:[...state.stopIdRemap],associationKey:state.associationKey,mapDisplay:state.mapDisplay,mapLabelMode:state.mapLabelMode,timepointFallback:state.timepointFallback,settings:{radius:Number($("radius")?.value||300),blankTimepoints:Boolean($("blank-timepoints")?.checked),smartRadius:Boolean($("smart-radius")?.checked),genZTheme:Boolean($("genz-theme")?.checked)}};}
function updateLoadedGtfsUi(){const found=Object.entries(GTFS_FILE_KEYS).filter(([,key])=>state.parsed[key]);$("gtfs-status").textContent=found.length?`GTFS chargé · ${found.length} fichier${found.length>1?'s':''} reconnu${found.length>1?'s':''}`:"Aucun GTFS chargé";$("gtfs-files").innerHTML=found.map(([name])=>`<span class="file-chip ${["calendar_dates.txt","frequencies.txt"].includes(name)?'optional':''}">${name}</span>`).join("");}
function countWorkingParents(stops){return (stops?.rows||[]).filter(row=>normalize(row.parent_station)&&normalize(row.location_type)!=="1").length;}
function refreshWorkingTimetableAccess(){const button=$("working-timetable-mode"),count=state.workingParentStations||0,ready=count>0,schedulesReady=Boolean(state.parsed.routes&&state.parsed.trips&&state.parsed.times);button.disabled=!ready;button.classList.toggle("locked",!ready);button.querySelector(".mode-lock").textContent=ready?"Disponible":"Verrouillé";$("working-timetable-detail").textContent=ready?`${count} stop${count>1?'s':''} avec parent_station${schedulesReady?".":" · routes.txt et trips.txt requis pour les horaires."}`:"Disponible dès qu’un parent_station est enregistré dans working/stops.txt.";}
function restoreWorkspaceSnapshot(snapshot){
  if(!snapshot?.parsed?.stops||!snapshot?.parsed?.times)throw new Error("Cet espace de travail ne contient pas un état GTFS valide.");
  const legacyMode=snapshot.mode,restoredMode=["new","existing"].includes(legacyMode)?"geographic":(legacyMode||"geographic"),clientType=snapshot.geographicClientType||(legacyMode==="existing"?"existing":"new"),ready=snapshot.geographicReady??Boolean(snapshot.geographicCache||(snapshot.decisions||[]).length||(snapshot.groups||[]).length);
  state.files=snapshot.files||{};state.parsed=snapshot.parsed||{};state.originalEntries=snapshot.originalEntries||[];state.geographicClientType=clientType;state.geographicReady=ready;
  state.geographicCache=snapshot.geographicCache||(ready?{clientType,mapping:snapshot.mapping||{},decisions:snapshot.decisions||[],groups:snapshot.groups||[],places:snapshot.places||[],gtfsStops:snapshot.gtfsStops||state.parsed.stops.rows,collisions:snapshot.collisions||[],stopIdRemap:snapshot.stopIdRemap||[],associationKey:snapshot.associationKey||"stop_id",timepointFallback:Boolean(snapshot.timepointFallback)}:null);
  state.mapping=snapshot.mapping||{};state.decisions=snapshot.decisions||[];state.groups=snapshot.groups||[];state.routeMaps=snapshot.routeMaps||[];state.places=snapshot.places||[];state.gtfsStops=snapshot.gtfsStops||state.parsed.stops.rows;state.workingStops=snapshot.workingStops||null;state.workingParentStations=snapshot.workingParentStations||countWorkingParents(state.workingStops);state.collisions=snapshot.collisions||[];state.stopIdRemap=new Map(snapshot.stopIdRemap||[]);state.associationKey=snapshot.associationKey||"stop_id";state.mapDisplay=snapshot.mapDisplay||"combined";state.mapLabelMode=snapshot.mapLabelMode||"stop_code";state.timepointFallback=Boolean(snapshot.timepointFallback);
  $("map-display").value=state.mapDisplay;$("map-label-mode").value=state.mapLabelMode;
  if(snapshot.settings){$("radius").value=snapshot.settings.radius||300;$("radius-output").textContent=`${$("radius").value} m`;$("blank-timepoints").checked=Boolean(snapshot.settings.blankTimepoints);$("smart-radius").checked=Boolean(snapshot.settings.smartRadius);$("genz-theme").checked=Boolean(snapshot.settings.genZTheme);document.body.classList.toggle("genz-theme",$("genz-theme").checked);}
  updateLoadedGtfsUi();refreshWorkingTimetableAccess();state.mode="__restore__";setMode(restoredMode);
  if(restoredMode!=="geographic"&&(state.decisions.length||state.groups.length||state.routeMaps.length)){render();$("results-section").classList.remove("hidden");}
}
async function refreshWorkspaceChoices(){
  try{const all=await workspaceRecords(),records=all.filter(record=>record.type==="directory").sort((a,b)=>String(b.lastOpened).localeCompare(String(a.lastOpened))),browserRecord=all.find(record=>record.id==="browser-latest"),select=$("workspace-choice"),selected=select.value;select.querySelectorAll("option[data-recent],optgroup").forEach(option=>option.remove());if(browserRecord){const option=document.createElement("option");option.value="browser-restore";option.dataset.recent="true";option.textContent="Reprendre la dernière sauvegarde navigateur";select.appendChild(option);}if(records.length){const group=document.createElement("optgroup");group.label="Espaces récents";for(const record of records){const option=document.createElement("option");option.value=`recent:${record.id}`;option.dataset.recent="true";option.textContent=`Reprendre · ${record.name}`;group.appendChild(option);}select.appendChild(group);}if([...select.options].some(option=>option.value===selected))select.value=selected;}catch(error){console.warn("Espaces récents indisponibles",error);}
}
async function copyOriginalGtfsToWorkspace(){
  if(state.workspace.mode!=="directory"||!state.workspace.handle||!state.originalEntries.length)return;
  if(!await workspacePermission(state.workspace.handle,false))return;
  const original=await state.workspace.handle.getDirectoryHandle("original",{create:true}),working=await state.workspace.handle.getDirectoryHandle("working",{create:true});
  for(const entry of state.originalEntries){await writeWorkspaceFile(original,entry.name,entry.text);await writeWorkspaceFile(working,entry.name,entry.text);}
}
async function loadWorkingStopsFromDirectory(handle){try{const working=await handle.getDirectoryHandle("working"),fileHandle=await working.getFileHandle("stops.txt"),file=await fileHandle.getFile();state.workingStops=parseCSV(await file.text());state.workingParentStations=countWorkingParents(state.workingStops);refreshWorkingTimetableAccess();}catch(error){state.workingStops=null;state.workingParentStations=0;refreshWorkingTimetableAccess();}}
async function quickSave(manual=false){
  clearTimeout(quickSaveTimer);quickSaveTimer=0;
  try{
    let preparedFiles=null;
    if(state.parsed.stops&&state.parsed.times&&state.decisions.length&&state.mode==="geographic")try{preparedFiles=buildExports();state.workingStops=parseCSV(preparedFiles.gtfs);state.workingParentStations=countWorkingParents(state.workingStops);refreshWorkingTimetableAccess();}catch(error){console.info("Fichiers GTFS courants non écrits pendant une édition incomplète",error.message);}
    const snapshot=workspaceSnapshot();workspaceStatus("saving","Sauvegarde en cours…",state.workspace.name||"Préparation de l’espace de travail");
    if(state.workspace.mode==="browser"){
      await saveWorkspaceRecord({id:"browser-latest",type:"browser",name:"Dernière sauvegarde navigateur",lastOpened:snapshot.savedAt,snapshot});
    }else if(state.workspace.mode==="directory"){
      if(!await workspacePermission(state.workspace.handle,manual))throw new Error("Autorisation d’écriture requise : cliquez sur « Sauvegarder maintenant ».");
      await writeWorkspaceFile(state.workspace.handle,WORKSPACE_FILE,JSON.stringify(snapshot,null,2));
      const working=await state.workspace.handle.getDirectoryHandle("working",{create:true});
      if(preparedFiles){await writeWorkspaceFile(working,"stops.txt",preparedFiles.gtfs);await writeWorkspaceFile(working,"stop_times.txt",preparedFiles.times);await writeWorkspaceFile(working,"rapport_affectations.csv",preparedFiles.report);await writeWorkspaceFile(working,"places_a_creer.csv",preparedFiles.creations);}
      await saveWorkspaceRecord({id:state.workspace.id,type:"directory",name:state.workspace.name,lastOpened:snapshot.savedAt,handle:state.workspace.handle});
    }else return;
    state.workspace.lastSaved=snapshot.savedAt;state.workspace.dirty=false;$("workspace-save").disabled=false;workspaceStatus("ready","Travail sauvegardé",`${state.workspace.name} · ${new Date(snapshot.savedAt).toLocaleTimeString("fr-CA",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`);await refreshWorkspaceChoices();refreshPamphletOffer();
  }catch(error){workspaceStatus("error","Sauvegarde interrompue",error.message);if(manual)alert(error.message);}
}
function queueQuickSave(){if(state.workspace.mode==="none")return;state.workspace.dirty=true;refreshPamphletOffer();clearTimeout(quickSaveTimer);quickSaveTimer=setTimeout(()=>quickSave(false),650);}
async function createLocalWorkspace(){
  if(typeof window.showDirectoryPicker!=="function")throw new Error("Ce navigateur ne permet pas l’écriture directe dans un dossier. Choisissez la sauvegarde dans le navigateur.");
  const parent=await window.showDirectoryPicker({mode:"readwrite",startIn:"documents"}),name=`GTFS_HASTUS_${workspaceTimestamp()}`,handle=await parent.getDirectoryHandle(name,{create:true}),id=crypto.randomUUID?.()||`workspace-${Date.now()}`;
  state.workspace={id,name,handle,mode:"directory",lastSaved:null,dirty:false};await saveWorkspaceRecord({id,type:"directory",name,lastOpened:new Date().toISOString(),handle});$("workspace-save").disabled=false;workspaceStatus("ready","Espace local créé",`${parent.name}/${name} · les originaux seront copiés au chargement du GTFS`);await refreshWorkspaceChoices();if(state.originalEntries.length){await copyOriginalGtfsToWorkspace();await quickSave(true);}
}
async function openLocalWorkspace(record=null){
  if(typeof window.showDirectoryPicker!=="function"&&!record)throw new Error("Ce navigateur ne permet pas d’ouvrir directement un dossier de travail.");
  const handle=record?.handle||await window.showDirectoryPicker({mode:"readwrite",startIn:"documents"});if(!await workspacePermission(handle,true))throw new Error("Autorisation refusée pour ce dossier.");
  const fileHandle=await handle.getFileHandle(WORKSPACE_FILE),snapshot=JSON.parse(await (await fileHandle.getFile()).text()),id=record?.id||crypto.randomUUID?.()||`workspace-${Date.now()}`;
  state.workspace={id,name:handle.name,handle,mode:"directory",lastSaved:snapshot.savedAt||null,dirty:false};restoreWorkspaceSnapshot(snapshot);await loadWorkingStopsFromDirectory(handle);await saveWorkspaceRecord({id,type:"directory",name:handle.name,lastOpened:new Date().toISOString(),handle});$("workspace-save").disabled=false;workspaceStatus("ready","Espace de travail repris",`${handle.name} · sauvegarde du ${new Date(snapshot.savedAt).toLocaleString("fr-CA")}`);await refreshWorkspaceChoices();
}

function detectDelimiter(text) {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
  const counts = [[",", 0], [";", 0], ["\t", 0]];
  let quoted = false;
  for (const ch of first) {
    if (ch === '"') quoted = !quoted;
    if (!quoted) for (const item of counts) if (ch === item[0]) item[1]++;
  }
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(value); value = ""; }
    else if (ch === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += ch;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  const headers = (rows.shift() || []).map(h => h.trim());
  return { headers, rows: rows.filter(r => r.some(v => v !== "")).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))) };
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
function toCSV(headers, rows) { return [headers.map(csvEscape).join(","), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(","))].join("\r\n") + "\r\n"; }
function normalize(v) { return String(v ?? "").trim(); }
function validCoord(v) { return Number.isFinite(Number(v)) && normalize(v) !== ""; }
function haversine(aLat, aLon, bLat, bLon) {
  const rad = x => x * Math.PI / 180, R = 6371000;
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function cleanCode(text) { return normalize(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
const PLACE_LINKING_WORDS=new Set(["DE","DU","DES","LA","LE","LES","UN","UNE","ET","D","L","OF","THE","A","AN","AND","TO","AT","IN","ON","FOR","FROM","BY"]);
function codeRoot(description) {
  const allWords = cleanCode(description).split(" ").filter(Boolean);
  const words = allWords.filter(word => !PLACE_LINKING_WORDS.has(word));
  const meaningfulWords = words.length ? words : allWords;
  let code = meaningfulWords.length >= 2 ? meaningfulWords.slice(0,2).map(w => w.slice(0,3)).join("") : (meaningfulWords[0] || "PLACE").slice(0,6);
  return code.padEnd(6, "X").slice(0,6);
}
function uniqueCode(description, used) {
  const base = codeRoot(description);
  if (!used.has(base)) { used.add(base); return base; }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const suffix of alphabet) { const c = base.slice(0,5) + suffix; if (!used.has(c)) { used.add(c); return c; } }
  for (let i=0;i<100;i++) { const c=(base.slice(0,4)+String(i).padStart(2,"0")); if(!used.has(c)){used.add(c);return c;} }
  throw new Error("Impossible de générer un code de place unique.");
}
function uniqueStopId(original, usedUpper) {
  const root=`${normalize(original)}_GTFS`;
  let candidate=root, suffix=2;
  while(usedUpper.has(candidate.toUpperCase())) candidate=`${root}_${suffix++}`;
  usedUpper.add(candidate.toUpperCase());
  return candidate;
}
function guess(headers, patterns, required=true) {
  const lower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const p of patterns) { const i = lower.findIndex(h => h === p || h.includes(p)); if (i >= 0) return headers[i]; }
  return required ? headers[0] : "";
}

async function loadFile(kind, input) {
  if (!input.files[0]) return;
  const text = await input.files[0].text();
  state.files[kind] = input.files[0].name;
  state.parsed[kind] = parseCSV(text);
  if(state.mode==="geographic")resetGeographicResults();
  input.closest(".dropzone").classList.add("loaded");
  const required=requiredKinds();
  const count=required.filter(k=>state.files[k]).length, total=required.length;
  $("file-status").textContent = `${count} fichier${count > 1 ? "s" : ""} sur ${total} chargé${count > 1 ? "s" : ""}`;
  if (count === total) setupMapping();
  queueQuickSave();
}

async function unzipEntries(file){
  const buffer=await file.arrayBuffer(),view=new DataView(buffer);let eocd=-1;
  for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
  if(eocd<0)throw new Error("Archive ZIP invalide ou non prise en charge.");
  const count=view.getUint16(eocd+10,true),centralOffset=view.getUint32(eocd+16,true),decoder=new TextDecoder(),entries=[];let pos=centralOffset;
  for(let n=0;n<count;n++){
    if(view.getUint32(pos,true)!==0x02014b50)throw new Error("Répertoire ZIP invalide.");
    const method=view.getUint16(pos+10,true),compressedSize=view.getUint32(pos+20,true),nameLen=view.getUint16(pos+28,true),extraLen=view.getUint16(pos+30,true),commentLen=view.getUint16(pos+32,true),localOffset=view.getUint32(pos+42,true);
    const name=decoder.decode(new Uint8Array(buffer,pos+46,nameLen));pos+=46+nameLen+extraLen+commentLen;if(name.endsWith("/"))continue;
    const localNameLen=view.getUint16(localOffset+26,true),localExtraLen=view.getUint16(localOffset+28,true),start=localOffset+30+localNameLen+localExtraLen,compressed=new Uint8Array(buffer,start,compressedSize);let data;
    if(method===0)data=compressed;else if(method===8&&typeof DecompressionStream!=="undefined"){const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));data=new Uint8Array(await new Response(stream).arrayBuffer());}else throw new Error(`Compression ZIP non prise en charge pour ${name}.`);
    entries.push({name,text:decoder.decode(data)});
  }
  return entries;
}

async function loadCompleteGtfs(input){
  try{
    const selected=[...input.files];if(!selected.length)return;let entries=[];
    if(selected.length===1&&selected[0].name.toLowerCase().endsWith(".zip"))entries=await unzipEntries(selected[0]);
    else entries=await Promise.all(selected.filter(file=>file.name.toLowerCase().endsWith(".txt")).map(async file=>({name:file.webkitRelativePath||file.name,text:await file.text()})));
    state.originalEntries=entries.map(entry=>({name:baseFileName(entry.name),text:entry.text}));state.workingStops=null;state.workingParentStations=0;state.workingTimetableModels=[];resetGeographicResults();refreshWorkingTimetableAccess();
    for(const key of Object.values(GTFS_FILE_KEYS)){delete state.parsed[key];delete state.files[key];}
    for(const entry of entries){const base=entry.name.split(/[\\/]/).pop().toLowerCase(),key=GTFS_FILE_KEYS[base];if(!key)continue;state.parsed[key]=parseCSV(entry.text);state.files[key]=base;}
    const found=Object.entries(GTFS_FILE_KEYS).filter(([,key])=>state.parsed[key]);
    if(!state.parsed.stops||!state.parsed.times)throw new Error("Le GTFS doit contenir au minimum stops.txt et stop_times.txt.");
    $("gtfs-status").textContent=`GTFS chargé · ${found.length} fichier${found.length>1?'s':''} reconnu${found.length>1?'s':''}`;
    $("gtfs-files").innerHTML=found.map(([name])=>`<span class="file-chip ${["calendar_dates.txt","frequencies.txt"].includes(name)?'optional':''}">${name}</span>`).join("");
    input.closest(".dropzone").classList.add("loaded");setMode(state.mode);
    if(state.workspace.mode==="directory")await copyOriginalGtfsToWorkspace();
    if(state.workspace.mode!=="none")await quickSave(false);
  }catch(error){alert(error.message);}
}

const fields = [
  ["stopId", "Identifiant du stop", ["stopid","idstop","codearret"]],
  ["stopDesc", "Description du stop", ["stopdescription","stopdesc","descriptionarret","stopname","libelle"]],
  ["lat", "Latitude", ["stoplat","latitude","lat"]],
  ["lon", "Longitude", ["stoplon","longitude","lon","lng"]],
  ["placeId", "Identifiant / code place", ["placeid","codeplace","stationid","parentstation"]],
  ["placeDesc", "Description de la place", ["placedescription","placedesc","stationname","placename","libelleplace"]]
];
function setupMapping() {
  const hasTimepoint=state.parsed.times?.headers.includes("timepoint");
  const usesTimepoints=state.mode!=="timetables"&&state.mode!=="workingTimetables";
  $("blank-setting").classList.toggle("hidden",!hasTimepoint||!usesTimepoints); $("timepoint-fallback").classList.toggle("hidden",hasTimepoint||!usesTimepoints);
  $("radius-setting").classList.toggle("hidden",state.mode==="maps"||state.mode==="timetables"||state.mode==="workingTimetables");
  $("geographic-client-setting").classList.toggle("hidden",state.mode!=="geographic");
  $("smart-radius-setting").classList.toggle("hidden",state.mode!=="geographic");
  $("smart-radius").disabled=state.mode==="geographic"&&!state.parsed.trips;
  $("smart-radius-detail").textContent=state.parsed.trips?"Adapte chaque rayon à la densité des timing points, aux routes et aux voyages du GTFS.":"trips.txt est requis pour activer ce mode.";
  $("geographic-client-type").value=state.geographicClientType;
  $("map-display-setting").classList.toggle("hidden",state.mode!=="maps");
  $("map-labels-setting").classList.toggle("hidden",state.mode!=="maps");
  if(isGeographicExisting()){
    const headers = state.parsed.hastus.headers;
    $("mapping-grid").innerHTML = fields.map(([key,label,patterns]) => {
      const selected = guess(headers, patterns, !key.startsWith("place"));
      return `<label>${label}<select id="map-${key}">${key.startsWith("place") ? '<option value="">— aucune —</option>' : ''}${headers.map(h=>`<option value="${escapeHtml(h)}" ${h===selected?'selected':''}>${escapeHtml(h)}</option>`).join("")}</select></label>`;
    }).join("");
    $("mapping-grid").classList.remove("hidden"); $("association-setting").classList.remove("hidden");
    $("mapping-eyebrow").textContent="CORRESPONDANCE"; $("mapping-title").textContent="Colonnes HASTUS"; $("mapping-subtitle").textContent="Vérifiez les colonnes détectées automatiquement.";
  }else if(isGeographicNew()){
    $("mapping-grid").innerHTML=""; $("mapping-grid").classList.add("hidden"); $("association-setting").classList.add("hidden");
    $("mapping-eyebrow").textContent="REGROUPEMENT"; $("mapping-title").textContent="Paramètres géographiques"; $("mapping-subtitle").textContent="Les points horaires situés dans ce rayon formeront une place commune.";
  }else if(state.mode==="maps"){
    $("mapping-grid").innerHTML=""; $("mapping-grid").classList.add("hidden"); $("association-setting").classList.add("hidden");
    $("mapping-eyebrow").textContent="CARTOGRAPHIE"; $("mapping-title").textContent="Générer les cartes par route"; $("mapping-subtitle").textContent="Les shapes seront tracés et les points horaires identifiés par leur description.";
  }else if(state.mode==="workingTimetables"){
    $("mapping-grid").innerHTML=""; $("mapping-grid").classList.add("hidden"); $("association-setting").classList.add("hidden");
    $("mapping-eyebrow").textContent="DOSSIER WORKING"; $("mapping-title").textContent="Timetables des places assignées"; $("mapping-subtitle").textContent="Les horaires utiliseront les parent_station actuellement enregistrés dans working/stops.txt.";
  }else{
    $("mapping-grid").innerHTML=""; $("mapping-grid").classList.add("hidden"); $("association-setting").classList.add("hidden");
    $("mapping-eyebrow").textContent="CALENDRIER"; $("mapping-title").textContent="Comparer les volumes de service"; $("mapping-subtitle").textContent="calendar.txt et calendar_dates.txt seront combinés pour calculer les variations quotidiennes.";
  }
  $("mapping-section").classList.remove("hidden");
  $("mapping-section").scrollIntoView({behavior:"smooth",block:"start"});
}

function captureGeographicState(){
  if(state.mode!=="geographic"||!state.geographicReady)return;
  state.geographicCache={clientType:state.geographicClientType,needsRegroup:state.geographicNeedsRegroup,showCombinedConflictMap:state.showCombinedConflictMap,activeConflictGroupId:state.activeConflictGroupId,activeConflictGroupSnapshot:state.activeConflictGroupSnapshot,reviewedConflictGroups:[...state.reviewedConflictGroups],smartRadiusStats:state.smartRadiusStats,mapping:state.mapping,decisions:state.decisions,groups:state.groups,places:state.places,gtfsStops:state.gtfsStops,collisions:state.collisions,stopIdRemap:[...state.stopIdRemap],associationKey:state.associationKey,timepointFallback:state.timepointFallback};
}
function restoreGeographicState(){
  const cache=state.geographicCache;if(!cache)return false;
  state.geographicClientType=cache.clientType||"new";state.geographicNeedsRegroup=Boolean(cache.needsRegroup);state.showCombinedConflictMap=Boolean(cache.showCombinedConflictMap);state.activeConflictGroupId=cache.activeConflictGroupId||null;state.activeConflictGroupSnapshot=cache.activeConflictGroupSnapshot||null;state.reviewedConflictGroups=new Set(cache.reviewedConflictGroups||[]);state.smartRadiusStats=cache.smartRadiusStats||null;state.mapping=cache.mapping||{};state.decisions=cache.decisions||[];state.groups=cache.groups||[];state.places=cache.places||[];state.gtfsStops=cache.gtfsStops||state.parsed.stops?.rows||[];state.collisions=cache.collisions||[];state.stopIdRemap=new Map(cache.stopIdRemap||[]);state.associationKey=cache.associationKey||"stop_id";state.timepointFallback=Boolean(cache.timepointFallback);state.geographicReady=true;return true;
}
function resetGeographicResults(){state.geographicReady=false;state.geographicNeedsRegroup=false;state.geographicCache=null;state.showCombinedConflictMap=false;state.activeConflictGroupId=null;state.activeConflictGroupSnapshot=null;state.reviewedConflictGroups=new Set();state.conflictMapViews.clear();state.smartRadiusStats=null;state.mapping={};state.decisions=[];state.groups=[];state.places=[];state.collisions=[];state.stopIdRemap=new Map();}
function updateGeographicSourceVisibility(){const existing=state.mode==="geographic"&&state.geographicClientType==="existing";$("hastus-upload").classList.toggle("hidden",!existing);$("source-section").classList.toggle("hidden",!existing);$("upload-grid").classList.toggle("two",state.mode==="geographic"&&!existing);}
function setMode(mode){
  if(state.mode==="geographic")captureGeographicState();
  state.mode=mode;state.fullscreenMapId=null;document.body.classList.remove("map-fullscreen-open");
  document.querySelectorAll(".mode-card").forEach(card=>{const active=card.dataset.mode===mode;card.classList.toggle("active",active);card.setAttribute("aria-pressed",String(active));});
  updateGeographicSourceVisibility();
  for(const kind of ["routes","trips","shapes"]) $(`${kind}-upload`).classList.add("hidden");
  $("results-section").classList.add("hidden"); $("mapping-section").classList.add("hidden");
  if(mode==="maps"){$("map-display").value="combined";$("map-label-mode").value="stop_code";state.mapDisplay="combined";state.mapLabelMode="stop_code";}
  $("analyze").classList.remove("hidden");$("analyze").innerHTML=mode==="geographic"?'Regrouper les points horaires <span>→</span>':mode==="maps"?'Générer les cartes <span>→</span>':mode==="timetables"?'Comparer les horaires <span>→</span>':'Générer les timetables working <span>→</span>';
  const required=requiredKinds();
  const count=required.filter(k=>state.files[k]).length;
  $("file-status").textContent=`${count} fichier${count>1?"s":""} sur ${required.length} chargé${count>1?"s":""}`;
  if(count===required.length) setupMapping();
  if(mode==="geographic"&&restoreGeographicState()){
    $("geographic-client-type").value=state.geographicClientType;updateGeographicSourceVisibility();
    const restoredRequired=requiredKinds();if(restoredRequired.every(kind=>state.files[kind]))setupMapping();
    render();$("results-section").classList.remove("hidden");$("analyze").classList.toggle("hidden",!state.geographicNeedsRegroup);if(state.geographicNeedsRegroup)$("analyze").innerHTML=`Regrouper avec un rayon de ${$("radius").value} m <span>→</span>`;
  }
  queueQuickSave();
}

function setGeographicClientType(type){
  if(!["new","existing"].includes(type)||type===state.geographicClientType)return;
  state.geographicClientType=type;resetGeographicResults();updateGeographicSourceVisibility();$("results-section").classList.add("hidden");$("analyze").classList.remove("hidden");
  const required=requiredKinds(),count=required.filter(kind=>state.files[kind]).length;$("file-status").textContent=`${count} fichier${count>1?"s":""} sur ${required.length} chargé${count>1?"s":""}`;
  if(count===required.length)setupMapping();else $("mapping-section").classList.add("hidden");queueQuickSave();
}

function buildPlaces(hastus, m) {
  const byId = new Map();
  for (const row of hastus) {
    const id = normalize(row[m.placeId]);
    if (!id || !validCoord(row[m.lat]) || !validCoord(row[m.lon])) continue;
    if (!byId.has(id)) byId.set(id, {id, description: normalize(row[m.placeDesc]) || id, lats:[], lons:[], stopDescriptions:[]});
    const p=byId.get(id); p.lats.push(Number(row[m.lat])); p.lons.push(Number(row[m.lon])); p.stopDescriptions.push(normalize(row[m.stopDesc]));
  }
  return [...byId.values()].map(p=>({...p,lat:p.lats.reduce((a,b)=>a+b,0)/p.lats.length,lon:p.lons.reduce((a,b)=>a+b,0)/p.lons.length,points:p.lats.map((lat,i)=>({lat,lon:p.lons[i]}))}));
}

function stripPlaceDirections(description){return normalize(description).replace(/\b(?:NORTHBOUND|SOUTHBOUND|SOUTHBOUD|WESTBOUND|EASTBOUND)\b/gi," ").replace(/\s+/g," ").trim();}
function commonDescription(items){
  const tokenLists=items.map(item=>cleanCode(stripPlaceDirections(item.description)).split(" ").filter(Boolean));
  const ignored=new Set(["ARRET","QUAI","NORD","SUD","EST","OUEST","ARRIVEE","DEPART","ALLER","RETOUR","NORTHBOUND","SOUTHBOUND","SOUTHBOUD","WESTBOUND","EASTBOUND"]);
  const common=(tokenLists[0]||[]).filter((word,index,all)=>!ignored.has(word)&&all.indexOf(word)===index&&tokenLists.every(words=>words.includes(word)));
  if(common.length) return common.map(w=>w.charAt(0)+w.slice(1).toLowerCase()).join(" ");
  return stripPlaceDirections(items[0]?.description)||"Nouvelle place";
}

function smartPairKey(a,b){return [String(a),String(b)].sort().join("::");}
function buildSmartRadiusContext(items,timingRows,trips,maxRadius){
  if(!items.length)return {adjacentPairs:new Set(),radiusByStop:new Map(),minimum:0,maximum:0,average:0,stops:0};
  const tripById=new Map(trips.rows.map(trip=>[normalize(trip.trip_id),trip])),tripSets=new Map(items.map(item=>[item.id,new Set()])),routeSets=new Map(items.map(item=>[item.id,new Set()])),rowsByTrip=new Map();
  for(const row of timingRows){const stopId=normalize(row.stop_id),tripId=normalize(row.trip_id),trip=tripById.get(tripId);if(tripSets.has(stopId)){tripSets.get(stopId).add(tripId);if(trip)routeSets.get(stopId).add(normalize(trip.route_id));}if(!rowsByTrip.has(tripId))rowsByTrip.set(tripId,[]);rowsByTrip.get(tripId).push(row);}
  const adjacentPairs=new Set();for(const rows of rowsByTrip.values()){rows.sort((a,b)=>(Number(a.stop_sequence)||0)-(Number(b.stop_sequence)||0));for(let index=1;index<rows.length;index++){const before=normalize(rows[index-1].stop_id),after=normalize(rows[index].stop_id);if(before&&after&&before!==after)adjacentPairs.add(smartPairKey(before,after));}}
  const minimum=Math.min(maxRadius,Math.max(20,Math.round(maxRadius*.2))),radii=[];
  for(const item of items){const nearby=items.filter(other=>other.id!==item.id&&haversine(item.lat,item.lon,other.lat,other.lon)<=maxRadius).length,tripsCount=tripSets.get(item.id)?.size||0,routesCount=routeSets.get(item.id)?.size||0,densityFactor=1/(1+.16*Math.max(0,nearby-1)),serviceBoost=1+Math.min(.28,.035*Math.log2(tripsCount+1)+.025*Math.max(0,routesCount-1)),smartRadius=Math.max(minimum,Math.min(maxRadius,Math.round(maxRadius*densityFactor*serviceBoost)));Object.assign(item,{smartRadius,smartDensity:nearby,smartTrips:tripsCount,smartRoutes:routesCount});radii.push(smartRadius);}
  return {adjacentPairs,radiusByStop:new Map(items.map(item=>[item.id,item.smartRadius])),minimum:Math.min(...radii),maximum:Math.max(...radii),average:Math.round(radii.reduce((sum,value)=>sum+value,0)/Math.max(1,radii.length)),stops:items.length};
}
function groupNearbyStops(items,radius,usedCodes,smartContext=null){
  const groups=[];
  for(const item of [...items].sort((a,b)=>a.id.localeCompare(b.id))){
    const eligible=groups.filter(g=>g.items.every(other=>{const distance=haversine(item.lat,item.lon,other.lat,other.lon),limit=smartContext?Math.min(item.smartRadius,other.smartRadius):radius,consecutive=smartContext?.adjacentPairs.has(smartPairKey(item.id,other.id));return distance<=limit&&!(consecutive&&distance>Math.min(45,limit));}));
    eligible.sort((a,b)=>haversine(item.lat,item.lon,a.lat,a.lon)-haversine(item.lat,item.lon,b.lat,b.lon));
    if(eligible.length){
      const g=eligible[0]; g.items.push(item); g.lat=g.items.reduce((s,x)=>s+x.lat,0)/g.items.length; g.lon=g.items.reduce((s,x)=>s+x.lon,0)/g.items.length;
    }else groups.push({items:[item],lat:item.lat,lon:item.lon});
  }
  return groups.map((g,index)=>{const description=commonDescription(g.items),groupRadius=smartContext?Math.min(...g.items.map(item=>item.smartRadius)):radius;return {...g,id:`G${index+1}`,description,code:uniqueCode(description,usedCodes),radius:groupRadius,smart:Boolean(smartContext),smartInitialRadius:smartContext?groupRadius:null};});
}

function isZeroSecondTime(value){return /^\d{1,3}:\d{2}:00(?:\.0+)?$/.test(normalize(value));}
function parseGtfsDate(value){const s=normalize(value);if(!/^\d{8}$/.test(s))return null;return new Date(Date.UTC(Number(s.slice(0,4)),Number(s.slice(4,6))-1,Number(s.slice(6,8))));}
function isoDate(date){return date.toISOString().slice(0,10);}
function secondsOfDay(value){const m=normalize(value).match(/^(\d{1,3}):(\d{2}):(\d{2})$/);return m?Number(m[1])*3600+Number(m[2])*60+Number(m[3]):null;}
const ROUTE_TYPE_NAMES={0:"Tramway",1:"Métro",2:"Train",3:"Autobus",4:"Traversier",5:"Tramway à câble",6:"Téléphérique",7:"Funiculaire",11:"Trolleybus",12:"Monorail"};
function analyzeTimetables(routes,trips,times,stops,calendar,calendarDates,frequencies){
  if(!calendar&&!calendarDates)throw new Error("Le GTFS doit contenir calendar.txt ou calendar_dates.txt pour comparer les horaires.");
  for(const [file,data,columns] of [["routes.txt",routes,["route_id","route_type"]],["trips.txt",trips,["route_id","service_id","trip_id"]]])for(const column of columns)if(!data.headers.includes(column))throw new Error(`${file} : colonne ${column} absente.`);
  if(calendar)for(const column of ["service_id","monday","tuesday","wednesday","thursday","friday","saturday","sunday","start_date","end_date"])if(!calendar.headers.includes(column))throw new Error(`calendar.txt : colonne ${column} absente.`);
  if(calendarDates)for(const column of ["service_id","date","exception_type"])if(!calendarDates.headers.includes(column))throw new Error(`calendar_dates.txt : colonne ${column} absente.`);
  const dates=[];if(calendar)for(const row of calendar.rows)dates.push(parseGtfsDate(row.start_date),parseGtfsDate(row.end_date));if(calendarDates)for(const row of calendarDates.rows)dates.push(parseGtfsDate(row.date));
  const validDates=dates.filter(Boolean);if(!validDates.length)throw new Error("Aucune date valide trouvée dans calendar.txt ou calendar_dates.txt.");
  const start=new Date(Math.min(...validDates.map(d=>d.getTime()))),end=new Date(Math.max(...validDates.map(d=>d.getTime()))),dayNames=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const exceptions=new Map();if(calendarDates)for(const row of calendarDates.rows){const date=parseGtfsDate(row.date);if(!date)continue;const key=isoDate(date);if(!exceptions.has(key))exceptions.set(key,[]);exceptions.get(key).push({serviceId:normalize(row.service_id),type:normalize(row.exception_type)});}
  const routeById=new Map(routes.rows.map(r=>[normalize(r.route_id),r]));
  const frequencyCount=new Map();if(frequencies)for(const row of frequencies.rows){const startSec=secondsOfDay(row.start_time),endSec=secondsOfDay(row.end_time),headway=Number(row.headway_secs);if(startSec!==null&&endSec!==null&&headway>0)frequencyCount.set(normalize(row.trip_id),(frequencyCount.get(normalize(row.trip_id))||0)+Math.max(0,Math.ceil((endSec-startSec)/headway)));}
  const tripsByService=new Map();for(const trip of trips.rows){const serviceId=normalize(trip.service_id);if(!tripsByService.has(serviceId))tripsByService.set(serviceId,[]);tripsByService.get(serviceId).push({...trip,_count:frequencyCount.get(normalize(trip.trip_id))||1});}
  const activeByDate=new Map(),patternDates=new Map(),days=[];
  for(let date=new Date(start);date<=end;date=new Date(date.getTime()+86400000)){
    const key=isoDate(date),active=new Set();
    if(calendar)for(const row of calendar.rows){const from=parseGtfsDate(row.start_date),to=parseGtfsDate(row.end_date);if(from&&to&&date>=from&&date<=to&&normalize(row[dayNames[date.getUTCDay()]])==="1")active.add(normalize(row.service_id));}
    for(const ex of exceptions.get(key)||[]){if(ex.type==="1")active.add(ex.serviceId);else if(ex.type==="2")active.delete(ex.serviceId);}
    const services=[...active].sort(),signature=services.join("|");if(!patternDates.has(signature))patternDates.set(signature,[]);patternDates.get(signature).push(key);activeByDate.set(key,services);
    const counts={};for(const serviceId of services)for(const trip of tripsByService.get(serviceId)||[]){const route=routeById.get(normalize(trip.route_id))||{},type=normalize(route.route_type)||"inconnu";counts[type]=(counts[type]||0)+trip._count;}
    days.push({date:key,weekday:dayNames[date.getUTCDay()],services,counts,total:Object.values(counts).reduce((a,b)=>a+b,0),signature});
  }
  const patterns=[...patternDates.entries()].map(([signature,dates],index)=>({id:`TYPE_${String(index+1).padStart(2,"0")}`,signature,services:signature?signature.split("|"):[],dates}));const patternBySignature=new Map(patterns.map(p=>[p.signature,p]));for(const day of days)day.dayType=patternBySignature.get(day.signature).id;
  const routeTypes=[...new Set(routes.rows.map(r=>normalize(r.route_type)||"inconnu"))].sort((a,b)=>Number(a)-Number(b));
  const stopTimesByTrip=new Map();for(const row of times.rows){const id=normalize(row.trip_id);if(!stopTimesByTrip.has(id))stopTimesByTrip.set(id,[]);stopTimesByTrip.get(id).push(row);}for(const rows of stopTimesByTrip.values())rows.sort((a,b)=>(Number(a.stop_sequence)||0)-(Number(b.stop_sequence)||0));
  const hasTimepoint=times.headers.includes("timepoint"),stopById=new Map(stops.rows.map(r=>[normalize(r.stop_id),r])),timingRowsByTrip=new Map();let maxTimingPoints=0;
  for(const [tripId,rows] of stopTimesByTrip){const timingRows=rows.filter(row=>hasTimepoint?normalize(row.timepoint)==="1":(isZeroSecondTime(row.arrival_time)||isZeroSecondTime(row.departure_time))).map(row=>{const stop=stopById.get(normalize(row.stop_id))||{};return {...row,stop_name:normalize(stop.stop_name)||normalize(row.stop_id),passage_time:normalize(row.arrival_time)||normalize(row.departure_time)};});timingRowsByTrip.set(tripId,timingRows);maxTimingPoints=Math.max(maxTimingPoints,timingRows.length);}
  return {days,patterns,routeTypes,tripsByService,routeById,stopTimesByTrip,timingRowsByTrip,maxTimingPoints,start:isoDate(start),end:isoDate(end)};
}

function analyze() {
  try {
    const gtfs=state.parsed.stops, times=state.parsed.times;
    for (const required of ["stop_id","stop_name","stop_lat","stop_lon"]) if (!gtfs.headers.includes(required)) throw new Error(`stops.txt : colonne ${required} absente.`);
    if (!times.headers.includes("stop_id")) throw new Error("stop_times.txt : colonne stop_id absente.");
    if(state.mode==="workingTimetables"){
      if(!state.workingStops||!state.workingParentStations)throw new Error("working/stops.txt ne contient aucun parent_station assigné.");
      for(const [file,data,columns] of [["routes.txt",state.parsed.routes,["route_id"]],["trips.txt",state.parsed.trips,["trip_id","route_id","service_id"]]])for(const column of columns)if(!data?.headers.includes(column))throw new Error(`${file} : colonne ${column} absente.`);
      state.workingTimetableModels=workingPamphletModels();render();$("results-section").classList.remove("hidden");$("results-section").scrollIntoView({behavior:"smooth",block:"start"});return;
    }
    state.timepointFallback=!times.headers.includes("timepoint");
    if(state.timepointFallback&&!times.headers.includes("arrival_time")&&!times.headers.includes("departure_time")) throw new Error("stop_times.txt : sans colonne timepoint, arrival_time ou departure_time est nécessaire.");
    state.gtfsStops=gtfs.rows;
    state.stopIdRemap=new Map(); state.collisions=[];
    const blank=$("blank-timepoints").checked;
    const timingRows=times.rows.filter(r=>state.timepointFallback?(isZeroSecondTime(r.arrival_time)||isZeroSecondTime(r.departure_time)):(normalize(r.timepoint)==="1" || (blank && normalize(r.timepoint)==="")));
    const timingIds=new Set(timingRows.map(r=>normalize(r.stop_id)));
    const stopById=new Map(gtfs.rows.map(r=>[normalize(r.stop_id),r]));
    const radius=Number($("radius").value);
    const smartEnabled=state.mode==="geographic"&&$("smart-radius").checked;let smartContext=null,smartItemById=new Map();
    if(smartEnabled){if(!state.parsed.trips)throw new Error("Le mode Rayon intelligent nécessite trips.txt.");const smartItems=[...timingIds].map(id=>{const stop=stopById.get(id);return stop&&validCoord(stop.stop_lat)&&validCoord(stop.stop_lon)?{id,description:normalize(stop.stop_name),lat:Number(stop.stop_lat),lon:Number(stop.stop_lon)}:null;}).filter(Boolean);smartContext=buildSmartRadiusContext(smartItems,timingRows,state.parsed.trips,radius);smartItemById=new Map(smartItems.map(item=>[item.id,item]));state.smartRadiusStats={minimum:smartContext.minimum,maximum:smartContext.maximum,average:smartContext.average,stops:smartContext.stops};}else state.smartRadiusStats=null;
    state.decisions=[];

    if(state.mode==="timetables"){
      state.timetableAnalysis=analyzeTimetables(state.parsed.routes,state.parsed.trips,times,state.parsed.stops,state.parsed.calendar,state.parsed.calendarDates,state.parsed.frequencies);
      state.groups=[];state.routeMaps=[];state.places=[];render();$("results-section").classList.remove("hidden");$("results-section").scrollIntoView({behavior:"smooth",block:"start"});queueQuickSave();return;
    }

    if(state.mode==="maps"){
      state.mapDisplay=$("map-display").value;
      state.mapLabelMode=$("map-label-mode").value;state.mapLabelModes=new Map();state.mapZooms=new Map();state.mapPans=new Map();state.combinedRouteStates=new Map();state.fullscreenMapId=null;document.body.classList.remove("map-fullscreen-open");
      const routes=state.parsed.routes, trips=state.parsed.trips, shapes=state.parsed.shapes;
      for(const [file,data,required] of [["routes.txt",routes,["route_id"]],["trips.txt",trips,["trip_id","route_id","shape_id"]],["shapes.txt",shapes,["shape_id","shape_pt_lat","shape_pt_lon","shape_pt_sequence"]]]) for(const column of required) if(!data.headers.includes(column)) throw new Error(`${file} : colonne ${column} absente.`);
      const tripById=new Map(trips.rows.map(r=>[normalize(r.trip_id),r])), routeById=new Map(routes.rows.map(r=>[normalize(r.route_id),r]));
      const shapeById=new Map();
      for(const row of shapes.rows){const id=normalize(row.shape_id);if(!shapeById.has(id))shapeById.set(id,[]);if(validCoord(row.shape_pt_lat)&&validCoord(row.shape_pt_lon))shapeById.get(id).push({lat:Number(row.shape_pt_lat),lon:Number(row.shape_pt_lon),sequence:Number(row.shape_pt_sequence)||0});}
      for(const points of shapeById.values())points.sort((a,b)=>a.sequence-b.sequence);
      const routeShapeIds=new Map();
      for(const trip of trips.rows){const routeId=normalize(trip.route_id),shapeId=normalize(trip.shape_id);if(!routeShapeIds.has(routeId))routeShapeIds.set(routeId,new Set());if(shapeId)routeShapeIds.get(routeId).add(shapeId);}
      const stopsByRoute=new Map(); let missingTrips=0,missingStops=0;
      for(const row of timingRows){const trip=tripById.get(normalize(row.trip_id));if(!trip){missingTrips++;continue;}const routeId=normalize(trip.route_id);if(!stopsByRoute.has(routeId))stopsByRoute.set(routeId,new Set());stopsByRoute.get(routeId).add(normalize(row.stop_id));}
      state.routeMaps=[];
      for(const [routeId,stopIds] of stopsByRoute){
        const route=routeById.get(routeId)||{route_id:routeId}; const mapStops=[];
        for(const stopId of stopIds){const stop=stopById.get(stopId);if(!stop||!validCoord(stop.stop_lat)||!validCoord(stop.stop_lon)){missingStops++;continue;}mapStops.push({id:stopId,code:normalize(stop.stop_code),name:normalize(stop.stop_name)||stopId,lat:Number(stop.stop_lat),lon:Number(stop.stop_lon)});}
        const mapShapes=[...(routeShapeIds.get(routeId)||[])].map(id=>({id,points:shapeById.get(id)||[]})).filter(s=>s.points.length);
        state.routeMaps.push({routeId,route,stops:mapStops,shapes:mapShapes});
      }
      state.routeMaps.sort((a,b)=>(normalize(a.route.route_short_name)||a.routeId).localeCompare(normalize(b.route.route_short_name)||b.routeId,undefined,{numeric:true}));
      state.mapWarnings={missingTrips,missingStops}; state.groups=[]; state.places=[];
      render(); $("results-section").classList.remove("hidden"); $("results-section").scrollIntoView({behavior:"smooth",block:"start"});queueQuickSave(); return;
    }

    if(isGeographicNew()){
      state.mapping={}; state.places=[];
      const items=[];
      for(const id of [...timingIds].sort()){
        const s=stopById.get(id);
        if(!s){state.decisions.push({id,description:"Stop absent de stops.txt",error:"Référence présente dans stop_times.txt mais absente de stops.txt",status:"error"});continue;}
        if(!validCoord(s.stop_lat)||!validCoord(s.stop_lon)){state.decisions.push({id,description:normalize(s.stop_name),error:"Coordonnées absentes ou invalides : regroupement impossible",status:"error"});continue;}
        items.push(smartItemById.get(id)||{id,description:normalize(s.stop_name),lat:Number(s.stop_lat),lon:Number(s.stop_lon)});
      }
      const usedCodes=new Set(gtfs.rows.map(r=>normalize(r.stop_id).toUpperCase()).filter(Boolean));
      state.groups=groupNearbyStops(items,radius,usedCodes,smartContext);
      for(const group of state.groups) for(const item of group.items) state.decisions.push({...item,originalId:item.id,status:"review",source:"new-stop",choice:"__new__",candidates:[],groupId:group.id});
      state.geographicReady=true;state.geographicNeedsRegroup=false;captureGeographicState();render(); $("results-section").classList.remove("hidden"); $("analyze").classList.add("hidden");$("results-section").scrollIntoView({behavior:"smooth",block:"start"});queueQuickSave(); return;
    }

    state.mapping = Object.fromEntries(fields.map(([key])=>[key,$(`map-${key}`).value]));
    const m=state.mapping, hastus=state.parsed.hastus.rows;
    state.associationKey=$("association-key").value;
    if(state.associationKey==="stop_code"&&!gtfs.headers.includes("stop_code")) throw new Error("La clé stop_code est sélectionnée, mais stops.txt ne contient pas cette colonne.");
    if (Object.entries(m).filter(([k])=>!k.startsWith("place")).some(([,v])=>!v)) throw new Error("Toutes les colonnes obligatoires HASTUS doivent être associées.");
    state.places=buildPlaces(hastus,m); state.groups=[];
    const hastusByStop=new Map(hastus.map(r=>[normalize(r[m.stopId]),r]));
    const hastusByStopUpper=new Map(hastus.map(r=>[normalize(r[m.stopId]).toUpperCase(),r]).filter(([id])=>id));
    const usedStopIdsUpper=new Set([...hastus.map(r=>normalize(r[m.stopId])),...gtfs.rows.map(r=>normalize(r.stop_id))].filter(Boolean).map(id=>id.toUpperCase()));
    for(const row of gtfs.rows){
      const oldId=normalize(row.stop_id), hastusRow=hastusByStopUpper.get(oldId.toUpperCase());
      if(!hastusRow) continue;
      const newId=uniqueStopId(oldId,usedStopIdsUpper); state.stopIdRemap.set(oldId,newId);
      state.collisions.push({old_stop_id:oldId,new_stop_id:newId,stop_code:normalize(row.stop_code),stop_name:normalize(row.stop_name),hastus_description:normalize(hastusRow[m.stopDesc])});
    }
    const used=new Set([...state.places.map(p=>p.id),...gtfs.rows.map(r=>normalize(r.stop_id))].filter(Boolean).map(x=>x.toUpperCase()));
    for (const id of [...timingIds].sort()) {
      const s=stopById.get(id);
      if (!s) { state.decisions.push({id,description:"Stop absent de stops.txt",error:"Référence présente dans stop_times.txt mais absente de stops.txt",status:"error"}); continue; }
      const outputId=state.stopIdRemap.get(id)||id;
      const associationValue=state.associationKey==="stop_id"?outputId:normalize(s[state.associationKey]);
      const existing=hastusByStop.get(associationValue); const placeId=existing && m.placeId ? normalize(existing[m.placeId]) : "";
      const lat=Number(s.stop_lat),lon=Number(s.stop_lon), description=normalize(s.stop_name);
      if (placeId) {
        const p=state.places.find(x=>x.id===placeId) || {id:placeId,description:(m.placeDesc?normalize(existing[m.placeDesc]):placeId),lat,lon,stopDescriptions:[normalize(existing[m.stopDesc])]};
        state.decisions.push({id:outputId,originalId:id,description,lat,lon,status:"assigned",source:"existing",choice:placeId,candidates:[{...p,distance:0}]});
      } else {
        const localRadius=smartContext?.radiusByStop.get(id)||radius,candidates=Number.isFinite(lat)&&Number.isFinite(lon) ? state.places.map(p=>({...p,distance:Math.min(...p.points.map(point=>haversine(lat,lon,point.lat,point.lon)))})).filter(p=>p.distance<=localRadius).sort((a,b)=>a.distance-b.distance) : [];
        const newCode=uniqueCode(description,used);
        state.decisions.push({id:outputId,originalId:id,description,lat,lon,smartRadius:localRadius,status:"review",source:existing?"unassigned":"new-stop",choice:candidates.length?candidates[0].id:"__new__",candidates,newCode});
      }
    }
    render();
    state.geographicReady=true;state.geographicNeedsRegroup=false;captureGeographicState();
    $("results-section").classList.remove("hidden");
    $("analyze").classList.add("hidden");
    $("results-section").scrollIntoView({behavior:"smooth",block:"start"});
    queueQuickSave();
  } catch (e) { alert(e.message); }
}

function escapeHtml(s){return String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function routeColor(route,fallback="#006d67"){const value=normalize(route.route_color).replace(/^#/,"");return /^[0-9a-f]{6}$/i.test(value)?`#${value}`:fallback;}
function routeLabel(map){return normalize(map.route.route_short_name)||normalize(map.route.route_long_name)||map.routeId;}
function effectiveMapLabelMode(map){const mode=state.mapLabelModes.get(map.routeId);return mode&&mode!=="inherit"?mode:state.mapLabelMode;}
function routeMapSvg(map){
  const width=1000,height=560,pad=55,color=routeColor(map.route),all=[...map.shapes.flatMap(s=>s.points),...map.stops];
  if(!all.length)return `<svg class="route-map" viewBox="0 0 ${width} ${height}" role="img"><text x="500" y="280" text-anchor="middle" fill="#627477">Aucune coordonnée exploitable</text></svg>`;
  const meanLat=all.reduce((sum,p)=>sum+p.lat,0)/all.length,meanLon=all.reduce((sum,p)=>sum+p.lon,0)/all.length;
  let fitZoom=1;
  for(let candidateZoom=19;candidateZoom>=1;candidateZoom--){const points=all.map(point=>osmProject(point.lat,point.lon,candidateZoom)),spanX=Math.max(...points.map(point=>point.x))-Math.min(...points.map(point=>point.x)),spanY=Math.max(...points.map(point=>point.y))-Math.min(...points.map(point=>point.y));if(spanX<=width-pad*2&&spanY<=height-pad*2){fitZoom=candidateZoom;break;}}
  const zoomOffset=state.mapZooms.get(map.routeId)||0,zoom=Math.max(1,Math.min(19,fitZoom+zoomOffset)),center=osmProject(meanLat,meanLon,zoom),worldPoints=all.map(point=>osmProject(point.lat,point.lon,zoom)),anchor=worldPoints.reduce((best,point)=>((point.x-center.x)**2+(point.y-center.y)**2)<((best.x-center.x)**2+(best.y-center.y)**2)?point:best,worldPoints[0]),requestedPan=state.mapPans.get(map.routeId)||{x:0,y:0},margin=80,anchorBaseX=anchor.x-center.x+width/2,anchorBaseY=anchor.y-center.y+height/2,minPanX=margin-anchorBaseX,maxPanX=width-margin-anchorBaseX,minPanY=margin-anchorBaseY,maxPanY=height-margin-anchorBaseY,pan={x:Math.max(minPanX,Math.min(maxPanX,requestedPan.x)),y:Math.max(minPanY,Math.min(maxPanY,requestedPan.y))},viewCenter={x:center.x-pan.x,y:center.y-pan.y};
  state.mapPans.set(map.routeId,pan);
  const project=point=>{const world=osmProject(point.lat,point.lon,zoom);return{x:world.x-viewCenter.x+width/2,y:world.y-viewCenter.y+height/2};},safeId=map.routeId.replace(/[^a-z0-9_-]/gi,"_"),clipId=`map_clip_${safeId}`,tileCount=2**zoom,firstTileX=Math.floor((viewCenter.x-width/2)/256),lastTileX=Math.floor((viewCenter.x+width/2)/256),firstTileY=Math.floor((viewCenter.y-height/2)/256),lastTileY=Math.floor((viewCenter.y+height/2)/256),tiles=[];
  for(let tileY=firstTileY;tileY<=lastTileY;tileY++)for(let tileX=firstTileX;tileX<=lastTileX;tileX++){if(tileY<0||tileY>=tileCount)continue;const wrappedX=((tileX%tileCount)+tileCount)%tileCount,x=tileX*256-viewCenter.x+width/2,y=tileY*256-viewCenter.y+height/2;tiles.push(`<image href="https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="256" height="256"/>`);}
  const background=`<defs><clipPath id="${clipId}"><rect width="${width}" height="${height}"/></clipPath></defs><g clip-path="url(#${clipId})"><rect width="${width}" height="${height}" fill="#e7ece8"/>${tiles.join("")}</g>`;
  const metersPerPixel=156543.03392*Math.max(.08,Math.cos(meanLat*Math.PI/180))/(2**zoom);
  const maxScaleMeters=metersPerPixel*150,power=Math.pow(10,Math.floor(Math.log10(Math.max(1,maxScaleMeters)))),scaleMeters=[5,2,1].map(n=>n*power).find(n=>n<=maxScaleMeters)||power,scalePixels=scaleMeters/metersPerPixel,scaleLabel=scaleMeters>=1000?`${(scaleMeters/1000).toLocaleString("fr-FR",{maximumFractionDigits:1})} km`:`${Math.round(scaleMeters)} m`;
  const mapFurniture=`<g aria-label="Échelle"><rect x="${pad-12}" y="${height-49}" width="${Math.max(100,scalePixels+24).toFixed(1)}" height="38" rx="4" fill="#fff" opacity=".9"/><line x1="${pad}" y1="${height-24}" x2="${(pad+scalePixels).toFixed(1)}" y2="${height-24}" stroke="#102a2d" stroke-width="4"/><line x1="${pad}" y1="${height-30}" x2="${pad}" y2="${height-18}" stroke="#102a2d" stroke-width="2"/><line x1="${(pad+scalePixels).toFixed(1)}" y1="${height-30}" x2="${(pad+scalePixels).toFixed(1)}" y2="${height-18}" stroke="#102a2d" stroke-width="2"/><text x="${(pad+scalePixels/2).toFixed(1)}" y="${height-34}" text-anchor="middle" fill="#102a2d" font-size="11" font-weight="700">${scaleLabel}</text></g><g transform="translate(${width-58} 31)" aria-label="Nord"><path d="M0 28 L10 0 L20 28 L10 22 Z" fill="#102a2d"/><text x="10" y="42" text-anchor="middle" fill="#102a2d" font-size="11" font-weight="800">N</text></g><rect x="${width-181}" y="${height-22}" width="176" height="18" fill="#fff" opacity=".9"/><text x="${width-10}" y="${height-9}" text-anchor="end" fill="#315b70" font-size="9">© OpenStreetMap contributors</text><rect x="1" y="1" width="${width-2}" height="${height-2}" fill="none" stroke="#b9c4bd" stroke-width="2"/>`;
  const lines=map.shapes.map((shape,index)=>`<polyline points="${shape.points.map(p=>{const q=project(p);return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;}).join(' ')}" fill="none" stroke="${shape.color||color}" stroke-width="${shape.color?4:(index?3:5)}" stroke-linecap="round" stroke-linejoin="round" opacity="${shape.opacity??(shape.color?'.82':(index?'.45':'.85'))}"/>`).join("");
  const labelMode=effectiveMapLabelMode(map),stops=map.stops.map(stop=>{const p=project(stop),stopColor=stop.color||color,label=labelMode==="description"?stop.name:labelMode==="stop_code"?stop.code:labelMode==="stop_id"?stop.id:"",labels=label?`<text class="stop-map-label" x="${(p.x+9).toFixed(1)}" y="${(p.y-9).toFixed(1)}" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round" fill="#102a2d" font-size="13" font-weight="700">${escapeHtml(label)}</text>`:"";return `<g opacity="${stop.opacity??1}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6" fill="#fff" stroke="${stopColor}" stroke-width="3"/>${labels}</g>`;}).join("");
  return `<svg class="route-map interactive-map" data-route-id="${escapeHtml(map.routeId)}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Route ${escapeHtml(routeLabel(map))}"><g class="map-movable">${background}${lines}${stops}</g>${mapFurniture}</svg>`;
}
function mapControls(map){const zoom=state.mapZooms.get(map.routeId)||0,labelMode=state.mapLabelModes.get(map.routeId)||"inherit";return `<div class="map-view-controls"><label>Libellé de cette carte<select aria-label="Libellé de la carte ${escapeHtml(routeLabel(map))}" onchange="setRouteMapLabel('${jsString(map.routeId)}',this.value)"><option value="inherit" ${labelMode==='inherit'?'selected':''}>Réglage général</option><option value="description" ${labelMode==='description'?'selected':''}>Description du stop</option><option value="stop_code" ${labelMode==='stop_code'?'selected':''}>stop_code</option><option value="stop_id" ${labelMode==='stop_id'?'selected':''}>stop_id</option><option value="none" ${labelMode==='none'?'selected':''}>Aucun libellé</option></select></label><div class="map-pan" aria-label="Déplacement limité de la carte"><span>Déplacer</span><button type="button" onclick="panRouteMap('${jsString(map.routeId)}',0,90)" aria-label="Déplacer vers le nord">↑</button><button type="button" onclick="panRouteMap('${jsString(map.routeId)}',90,0)" aria-label="Déplacer vers l'ouest">←</button><button type="button" onclick="panRouteMap('${jsString(map.routeId)}',-90,0)" aria-label="Déplacer vers l'est">→</button><button type="button" onclick="panRouteMap('${jsString(map.routeId)}',0,-90)" aria-label="Déplacer vers le sud">↓</button></div><div class="map-zoom" aria-label="Zoom de la carte"><button type="button" onclick="zoomRouteMap('${jsString(map.routeId)}',-1)" aria-label="Dézoomer">−</button><span>${zoom===0?'Vue ajustée':zoom>0?`Zoom +${zoom}`:`Zoom ${zoom}`}</span><button type="button" onclick="zoomRouteMap('${jsString(map.routeId)}',1)" aria-label="Zoomer">+</button><button type="button" onclick="resetRouteMapZoom('${jsString(map.routeId)}')">Réinitialiser</button></div><small class="map-gesture-hint">Glisser pour déplacer · roulette ou pincement pour zoomer · deux doigts pour parcourir</small></div>`;}
function mapFullscreenButton(routeId){const active=state.fullscreenMapId===routeId;return `<button type="button" class="secondary fullscreen-map-button" onclick="toggleMapFullscreen('${jsString(routeId)}')" aria-pressed="${active}" aria-label="${active?'Quitter le plein écran':'Afficher la carte en plein écran'}">${active?'✕ Quitter':'⛶ Plein écran'}</button>`;}
function routeMapCard(map){
  const short=routeLabel(map),long=normalize(map.route.route_long_name),color=routeColor(map.route);
  const fullscreen=state.fullscreenMapId===map.routeId;
  return `<article class="route-map-card ${fullscreen?'map-fullscreen':''}" data-map-id="${escapeHtml(map.routeId)}"><div class="route-map-head"><div class="route-map-title"><span class="route-chip" style="background:${color}">${escapeHtml(short)}</span><div><h3>${escapeHtml(long||`Route ${short}`)}</h3><small>${map.stops.length} point${map.stops.length!==1?'s':''} horaire${map.stops.length!==1?'s':''} · ${map.shapes.length} tracé${map.shapes.length!==1?'s':''}</small></div></div><div class="map-actions">${mapFullscreenButton(map.routeId)}<button class="secondary" onclick="downloadRouteMap('${jsString(map.routeId)}')">SVG</button><button class="primary" onclick="printRouteMapPdf('${jsString(map.routeId)}')">Exporter PDF</button></div></div><div class="map-card-stage">${mapControls(map)}${routeMapSvg(map)}</div></article>`;
}
function combinedRouteMap(){
  const palette=["#006d67","#d05a3a","#3274a1","#8b62a8","#a57800","#4f7c2f","#c23b75","#55646d"],stopById=new Map(),shapes=[],legend=[];
  state.routeMaps.forEach((map,index)=>{const color=routeColor(map.route,palette[index%palette.length]),visibility=state.combinedRouteStates.get(map.routeId)||"full",opacity=visibility==="half"?.5:1;legend.push({routeId:map.routeId,label:routeLabel(map),name:normalize(map.route.route_long_name),color,visibility});if(visibility==="hidden")return;for(const shape of map.shapes)shapes.push({...shape,color,opacity});for(const stop of map.stops){const existing=stopById.get(stop.id);if(!existing||opacity>(existing.opacity??0))stopById.set(stop.id,{...stop,color,opacity});}});
  return {routeId:"ALL_ROUTES",route:{route_short_name:"RÉSEAU",route_long_name:"Toutes les routes",route_color:"102A2D"},shapes,stops:[...stopById.values()],legend};
}
function combinedRouteMapCard(){
  const map=combinedRouteMap(),stateLabel={full:"ON",half:"50 %",hidden:"OFF"},ariaState={full:"true",half:"mixed",hidden:"false"},routes=map.legend.map(item=>`<div class="route-switch-row route-${item.visibility}" style="--route-color:${item.color}"><strong title="${escapeHtml(item.name||item.routeId)}">${escapeHtml(item.routeId)}</strong><button type="button" class="tri-toggle" role="checkbox" aria-checked="${ariaState[item.visibility]}" aria-label="Route ${escapeHtml(item.routeId)} : ${stateLabel[item.visibility]}. Cliquer pour passer à l'état suivant." onclick="cycleCombinedRoute('${jsString(item.routeId)}')"><span class="toggle-labels" aria-hidden="true"><i>ON</i><i>50 %</i><i>OFF</i></span><span class="toggle-track" aria-hidden="true"><i></i></span></button></div>`).join("");
  const fullscreen=state.fullscreenMapId==="ALL_ROUTES";
  return `<article class="route-map-card combined-map ${fullscreen?'map-fullscreen':''}" data-map-id="ALL_ROUTES"><div class="route-map-head"><div class="route-map-title"><span class="route-chip" style="background:#102a2d">RÉSEAU</span><div><h3>Toutes les routes</h3><small>${state.routeMaps.length} routes · ${map.stops.length} points horaires uniques</small></div></div><div class="map-actions">${mapFullscreenButton("ALL_ROUTES")}<button class="secondary" onclick="downloadCombinedRouteMap()">SVG</button><button class="primary" onclick="printCombinedRouteMapPdf()">Exporter PDF</button></div></div><div class="combined-map-layout"><div class="combined-map-stage">${mapControls(map)}${routeMapSvg(map)}</div><aside class="route-switch-panel" aria-label="Affichage des routes"><div class="route-switch-panel-head"><div><span>ROUTES</span><strong>${state.routeMaps.length}</strong></div><small>Un clic change l’état</small></div><div class="route-bulk-actions"><button type="button" onclick="setAllCombinedRoutes('hidden')">Tout masquer</button><button type="button" onclick="setAllCombinedRoutes('half')">Tout à 50 %</button><button type="button" onclick="setAllCombinedRoutes('full')">Tout afficher</button></div><div class="route-switch-list">${routes}</div></aside></div></article>`;
}
function routeTypeLabel(type){return ROUTE_TYPE_NAMES[type]?`${ROUTE_TYPE_NAMES[type]} (${type})`:`Type ${type}`;}
function dailyCountsCsv(){const a=state.timetableAnalysis,headers=["date","jour","type_jour",...a.routeTypes.map(t=>`route_type_${t}`),"total_voyages"];return toCSV(headers,a.days.map(day=>Object.fromEntries(headers.map(h=>[h,h==="date"?day.date:h==="jour"?day.weekday:h==="type_jour"?day.dayType:h==="total_voyages"?day.total:day.counts[h.replace("route_type_","")]||0]))));}
function hastusPreparationCsv(){
  const a=state.timetableAnalysis,baseHeaders=["schedule_type","valid_from","valid_to","operating_dates","route_type","route_id","route_short_name","route_long_name","service_id","trip_id","direction_id","trip_headsign","block_id","shape_id","frequency_count"],timingHeaders=[];
  for(let i=1;i<=a.maxTimingPoints;i++){const n=String(i).padStart(2,"0");timingHeaders.push(`timing_point_${n}_id`,`timing_point_${n}_description`,`timing_point_${n}_time`);}const headers=[...baseHeaders,...timingHeaders],rows=[];
  for(const pattern of a.patterns)for(const serviceId of pattern.services)for(const trip of a.tripsByService.get(serviceId)||[]){const route=a.routeById.get(normalize(trip.route_id))||{},timing=a.timingRowsByTrip.get(normalize(trip.trip_id))||[];if(!timing.length)continue;const row={schedule_type:pattern.id,valid_from:pattern.dates[0]||"",valid_to:pattern.dates.at(-1)||"",operating_dates:pattern.dates.join("|"),route_type:normalize(route.route_type),route_id:normalize(trip.route_id),route_short_name:normalize(route.route_short_name),route_long_name:normalize(route.route_long_name),service_id:serviceId,trip_id:normalize(trip.trip_id),direction_id:normalize(trip.direction_id),trip_headsign:normalize(trip.trip_headsign),block_id:normalize(trip.block_id),shape_id:normalize(trip.shape_id),frequency_count:trip._count};timing.forEach((point,index)=>{const n=String(index+1).padStart(2,"0");row[`timing_point_${n}_id`]=normalize(point.stop_id);row[`timing_point_${n}_description`]=point.stop_name;row[`timing_point_${n}_time`]=point.passage_time;});rows.push(row);}
  return toCSV(headers,rows);
}
function timetableCalendar(a){
  const months=new Map(),monthNames=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],weekdays=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"],palette=["#006d67","#b36b00","#6f52a2","#3274a1","#8a4b55","#4f7c2f","#9a6c22","#49636b"];
  for(const day of a.days){const key=day.date.slice(0,7);if(!months.has(key))months.set(key,[]);months.get(key).push(day);}
  const patternColor=new Map(a.patterns.map((p,i)=>[p.id,palette[i%palette.length]]));
  const legend=`<div class="calendar-legend">${a.patterns.map((p,i)=>`<span><i style="background:${palette[i%palette.length]}"></i>${p.id} · ${p.services.length} service${p.services.length!==1?'s':''}</span>`).join("")}</div>`;
  const grids=[...months.entries()].map(([key,days])=>{const [year,month]=key.split("-").map(Number),firstOffset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,cells=Array(firstOffset).fill('<div class="calendar-empty"></div>');for(const day of days){const color=patternColor.get(day.dayType),selected=state.selectedTimetableDate===day.date;cells.push(`<button class="calendar-day ${selected?'selected':''}" style="--day-color:${color}" onclick="selectTimetableDate('${day.date}')"><span class="calendar-date">${Number(day.date.slice(-2))}</span><strong>${day.dayType}</strong><small>${day.total} voyage${day.total!==1?'s':''}</small></button>`);}return `<section class="calendar-month"><h4>${monthNames[month-1]} ${year}</h4><div class="calendar-weekdays">${weekdays.map(d=>`<span>${d}</span>`).join("")}</div><div class="calendar-grid">${cells.join("")}</div></section>`;}).join("");
  return `<div class="timetable-calendar">${legend}<div class="calendar-months">${grids}</div></div>`;
}
function timetableCard(){
  const a=state.timetableAnalysis,weekday={monday:"Lun",tuesday:"Mar",wednesday:"Mer",thursday:"Jeu",friday:"Ven",saturday:"Sam",sunday:"Dim"};
  if(!state.selectedTimetableDate||!a.days.some(day=>day.date===state.selectedTimetableDate))state.selectedTimetableDate=a.days[0]?.date;
  const selectedDay=a.days.find(day=>day.date===state.selectedTimetableDate),selectedPattern=a.patterns.find(pattern=>pattern.id===selectedDay?.dayType);
  const head=a.routeTypes.map(type=>`<th>${escapeHtml(routeTypeLabel(type))}</th>`).join(""),rows=a.days.map(day=>`<tr><td>${day.date}</td><td>${weekday[day.weekday]||day.weekday}</td><td><span class="day-type">${day.dayType}</span></td>${a.routeTypes.map(type=>`<td>${day.counts[type]||0}</td>`).join("")}<td><strong>${day.total}</strong></td></tr>`).join("");
  const preview=[];if(selectedPattern)previewLoop:for(const serviceId of selectedPattern.services){for(const trip of a.tripsByService.get(serviceId)||[]){const timing=a.timingRowsByTrip.get(normalize(trip.trip_id))||[];if(!timing.length)continue;const route=a.routeById.get(normalize(trip.route_id))||{};preview.push(`<tr><td>${selectedPattern.id}</td><td>${escapeHtml(normalize(route.route_short_name)||normalize(trip.route_id))}</td><td><code>${escapeHtml(normalize(trip.trip_id))}</code></td><td><div class="timing-passages">${timing.map(point=>`<span><strong>${escapeHtml(point.stop_name)}</strong><small>${escapeHtml(normalize(point.stop_id))}</small><time>${escapeHtml(point.passage_time)}</time></span>`).join("")}</div></td></tr>`);if(preview.length>=100)break previewLoop;}}
  const previewBody=preview.length?preview.join(""):`<tr><td colspan="4" class="empty-schedule">Aucun voyage avec timing point pour cette date.</td></tr>`;
  return `<article class="timetable-card"><div class="route-map-head"><div><h3>Calendrier des variations d'horaires</h3><small>${a.start} → ${a.end}</small></div><div class="map-actions"><button class="secondary" onclick="downloadDailyCounts()">Détail quotidien CSV</button><button class="primary" onclick="downloadHastusPreparation()">Timetable de préparation HASTUS</button></div></div><div class="notice"><strong>Export HASTUS à configurer.</strong> Le timetable contient uniquement les heures de passage aux timing points. Son ordre de colonnes devra être adapté au fichier de contrôle d'interface de votre installation HASTUS.</div>${timetableCalendar(a)}<h3 class="preview-title">Horaire du ${selectedDay?.date||'—'} · ${selectedDay?.dayType||'—'}</h3><div class="table-scroll timetable-preview"><table class="volume-table"><thead><tr><th>Variation</th><th>Route</th><th>Voyage</th><th>Timing points et heures</th></tr></thead><tbody>${previewBody}</tbody></table></div><details class="daily-details"><summary>Afficher le tableau détaillé du nombre de voyages</summary><div class="table-scroll"><table class="volume-table"><thead><tr><th>Date</th><th>Jour</th><th>Variation</th>${head}<th>Total</th></tr></thead><tbody>${rows}</tbody></table></div></details></article>`;
}
function groupValidationIssues(){
  const codeCounts=new Map(),descriptionCounts=new Map(),gtfsStopIds=new Set(state.gtfsStops.map(stop=>normalize(stop.stop_id).toUpperCase()).filter(Boolean));
  for(const group of state.groups){const code=normalize(group.code).toUpperCase(),description=cleanCode(group.description);if(code)codeCounts.set(code,(codeCounts.get(code)||0)+1);if(description)descriptionCounts.set(description,(descriptionCounts.get(description)||0)+1);}
  return state.groups.map(group=>{
    const code=normalize(group.code).toUpperCase(),description=cleanCode(group.description),errors=[];
    if(!normalize(group.description))errors.push("description vide");
    if(!/^[A-Z0-9]{6}$/.test(code))errors.push("le code doit contenir exactement 6 lettres ou chiffres");
    if(code&&(codeCounts.get(code)||0)>1)errors.push("code déjà utilisé par une autre place proposée");
    if(description&&(descriptionCounts.get(description)||0)>1)errors.push("description déjà utilisée par une autre place proposée");
    if(code&&gtfsStopIds.has(code))errors.push("code déjà utilisé comme stop_id dans le GTFS");
    return {group,errors};
  }).filter(item=>item.errors.length);
}
function suggestedGroupDescriptions(){
  const duplicateGroups=groupValidationIssues().filter(item=>item.errors.includes("description déjà utilisée par une autre place proposée")).map(item=>item.group),duplicateIds=new Set(duplicateGroups.map(group=>group.id));
  const used=new Set(state.groups.filter(group=>!duplicateIds.has(group.id)).map(group=>cleanCode(group.description)).filter(Boolean)),suggestions=new Map();
  for(const group of duplicateGroups){
    const current=cleanCode(group.description),candidate=group.items.map(item=>stripPlaceDirections(item.description)).find(description=>{const normalized=cleanCode(description);return normalized&&normalized!==current&&!used.has(normalized);});
    let suggestion=candidate||stripPlaceDirections(group.description)||"Nouvelle place",suffix=1;
    while(used.has(cleanCode(suggestion)))suggestion=`${stripPlaceDirections(group.description)||"Nouvelle place"} ${group.id}${suffix++>1?suffix-1:""}`;
    used.add(cleanCode(suggestion));suggestions.set(group.id,suggestion);
  }
  return suggestions;
}
function alternativePlaceCodes(group){
  const ignored=new Set([...PLACE_LINKING_WORDS,"ARRET","ARRETS","STOP","STOPS","QUAI","QUAIS","STATION","NORTHBOUND","SOUTHBOUND","SOUTHBOUD","WESTBOUND","EASTBOUND","NORD","SUD","EST","OUEST","ARRIVEE","DEPART","ALLER","RETOUR"]),words=[],seenWords=new Set();
  for(const text of [group.description,...group.items.map(item=>item.description)])for(const word of cleanCode(stripPlaceDirections(text)).split(" ").filter(Boolean))if(!ignored.has(word)&&!seenWords.has(word)){seenWords.add(word);words.push(word);}
  const occupied=new Set([...state.groups.filter(other=>other.id!==group.id).map(other=>normalize(other.code).toUpperCase()),...state.gtfsStops.map(stop=>normalize(stop.stop_id).toUpperCase())].filter(Boolean)),alternatives=[],seenCodes=new Set();
  for(let first=0;first<words.length;first++)for(let second=first+1;second<words.length;second++){
    const code=(words[first].slice(0,3).padEnd(3,"X")+words[second].slice(0,3).padEnd(3,"X")).slice(0,6);
    if(!/^[A-Z0-9]{6}$/.test(code)||occupied.has(code)||seenCodes.has(code))continue;
    seenCodes.add(code);alternatives.push({code,source:`${words[first]} + ${words[second]}`});if(alternatives.length===4)return alternatives;
  }
  if(words.length){const compact=words.join("").slice(0,6).padEnd(6,"X");if(!occupied.has(compact)&&!seenCodes.has(compact))alternatives.push({code:compact,source:words.slice(0,2).join(" + ")});}
  return alternatives.slice(0,4);
}
function usedPlaceCodes(excludedGroupIds=new Set()){
  return new Set([...state.groups.filter(group=>!excludedGroupIds.has(group.id)).map(group=>normalize(group.code).toUpperCase()),...state.gtfsStops.map(stop=>normalize(stop.stop_id).toUpperCase())].filter(Boolean));
}
function refreshCodeFromDescription(group,used){group.code=uniqueCode(stripPlaceDirections(group.description),used);}
function groupErrorSummary(){
  const invalid=groupValidationIssues(),suggestions=suggestedGroupDescriptions();
  if(!invalid.length)return `<section id="place-error-summary" class="place-error-summary ok"><span class="error-summary-icon">✓</span><div><strong>Aucune erreur dans les places proposées</strong><small>Les codes et descriptions sont uniques et prêts pour l'export.</small></div></section>`;
  const rows=invalid.map(({group,errors})=>{
    const duplicateDescription=errors.includes("description déjà utilisée par une autre place proposée");
    const duplicateDetails=duplicateDescription?`<div class="duplicate-description-details"><strong>Stops associés à cette place</strong><ul>${group.items.map(item=>`<li><code>${escapeHtml(item.id)}</code><span>${escapeHtml(item.description||"Description absente")}</span><small>${Math.round(haversine(item.lat,item.lon,group.lat,group.lon))} m du centre</small></li>`).join("")}</ul><label>Nouvelle description proposée<div><input data-group-id="${escapeHtml(group.id)}" value="${escapeHtml(suggestions.get(group.id)||"")}" aria-label="Nouvelle description proposée pour ${escapeHtml(group.code)}"><button type="button" class="secondary" onclick="applySuggestedDescription('${jsString(group.id)}',this.previousElementSibling)">Appliquer</button></div></label></div>`:"";
    const alternatives=normalize(group.code).length<6?alternativePlaceCodes(group):[],codeDetails=alternatives.length?`<div class="code-alternative-details"><strong>Codes de place alternatifs à 6 caractères</strong><small>Construits avec les mots significatifs de la place et de ses stops.</small><div>${alternatives.map(alternative=>`<button type="button" onclick="applySuggestedCode('${jsString(group.id)}','${alternative.code}')"><code>${alternative.code}</code><span>${escapeHtml(alternative.source)}</span></button>`).join("")}</div></div>`:"";
    return `<li class="${duplicateDescription?'has-duplicate-description':''}"><span><code>${escapeHtml(group.code||"CODE VIDE")}</code><strong>${escapeHtml(group.description||"Description vide")}</strong></span><small>${errors.map(escapeHtml).join(" · ")}</small>${duplicateDetails}${codeDetails}</li>`;
  }).join("");
  const applyAll=suggestions.size?`<button type="button" class="primary apply-all-descriptions" onclick="applyAllSuggestedDescriptions(this)">Appliquer toutes les descriptions proposées</button>`:"";
  return `<section id="place-error-summary" class="place-error-summary danger"><span class="error-summary-icon">!</span><div><strong>${invalid.length} place${invalid.length>1?'s':''} avec une erreur</strong><small>Corrigez ces éléments avant l'export.</small>${applyAll}<ul>${rows}</ul></div></section>`;
}
function timetableSortValue(value){const parts=normalize(value).split(":").map(Number);return (parts[0]||0)*3600+(parts[1]||0)*60+(parts[2]||0);}
function pamphletTime(value){const parts=normalize(value).split(":");return parts.length>=2?`${parts[0].padStart(2,"0")}:${parts[1].padStart(2,"0")}`:normalize(value)||"—";}
function pamphletModelsFromPlaceMap(placeByStop){
  const routes=state.parsed.routes?.rows||[],trips=state.parsed.trips?.rows||[],times=state.parsed.times?.rows||[];
  if(!routes.length||!trips.length||!times.length)return [];
  const routeById=new Map(routes.map(route=>[normalize(route.route_id),route]));
  const rowsByTrip=new Map();for(const row of times){const tripId=normalize(row.trip_id);if(!rowsByTrip.has(tripId))rowsByTrip.set(tripId,[]);rowsByTrip.get(tripId).push(row);}for(const rows of rowsByTrip.values())rows.sort((a,b)=>(Number(a.stop_sequence)||0)-(Number(b.stop_sequence)||0));
  const hasTimepoint=state.parsed.times.headers.includes("timepoint"),models=new Map();
  for(const trip of trips){
    const routeId=normalize(trip.route_id),tripId=normalize(trip.trip_id),direction=normalize(trip.direction_id)||"0",service=normalize(trip.service_id)||"SERVICE",raw=(rowsByTrip.get(tripId)||[]).filter(row=>hasTimepoint?normalize(row.timepoint)==="1":(isZeroSecondTime(row.arrival_time)||isZeroSecondTime(row.departure_time))),points=[];
    for(const row of raw){const place=placeByStop.get(normalize(row.stop_id));if(!place)continue;const time=normalize(row.arrival_time)||normalize(row.departure_time);if(points.at(-1)?.code===place.code)continue;points.push({...place,time});}
    if(!points.length)continue;
    const key=`${routeId}\u0001${direction}\u0001${service}`,route=routeById.get(routeId)||{route_id:routeId};if(!models.has(key))models.set(key,{key,routeId,direction,service,route,trips:[],points:[]});const model=models.get(key);model.trips.push({tripId,headsign:normalize(trip.trip_headsign),points,firstTime:points[0].time});if(points.length>model.points.length)model.points=points.map(({code,description,lat,lon})=>({code,description,lat,lon}));
  }
  for(const model of models.values())model.trips.sort((a,b)=>timetableSortValue(a.firstTime)-timetableSortValue(b.firstTime));
  return [...models.values()].sort((a,b)=>(normalize(a.route.route_short_name)||a.routeId).localeCompare(normalize(b.route.route_short_name)||b.routeId,undefined,{numeric:true})||a.direction.localeCompare(b.direction)||a.service.localeCompare(b.service));
}
function newClientPamphletModels(){const placeByStop=new Map();for(const group of state.groups)for(const item of group.items)placeByStop.set(normalize(item.id),{code:normalize(group.code).toUpperCase(),description:normalize(group.description),lat:group.lat,lon:group.lon});return pamphletModelsFromPlaceMap(placeByStop);}
function workingPamphletModels(){const stops=state.workingStops?.rows||[],stationById=new Map(stops.filter(row=>normalize(row.location_type)==="1").map(row=>[normalize(row.stop_id),row])),placeByStop=new Map();for(const stop of stops){const parent=normalize(stop.parent_station);if(!parent||normalize(stop.location_type)==="1")continue;const station=stationById.get(parent)||{};placeByStop.set(normalize(stop.stop_id),{code:parent,description:normalize(station.stop_name)||parent,lat:Number(station.stop_lat)||Number(stop.stop_lat),lon:Number(station.stop_lon)||Number(stop.stop_lon)});}return pamphletModelsFromPlaceMap(placeByStop);}
function pamphletDiagram(points){
  const width=620,height=116,count=points.length,left=42,right=width-42,y=54,step=count>1?(right-left)/(count-1):0;
  const line=count>1?`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}"/>`:"",nodes=points.map((point,index)=>{const x=count>1?left+step*index:width/2,labelY=index%2?101:22,stemY=index%2?84:31;return `<g><line x1="${x.toFixed(1)}" y1="${y}" x2="${x.toFixed(1)}" y2="${stemY}"/><circle cx="${x.toFixed(1)}" cy="${y}" r="7"/><text x="${x.toFixed(1)}" y="${labelY}" text-anchor="middle">${escapeHtml(point.code)}</text></g>`;}).join("");
  return `<svg class="pamphlet-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="Schéma de ${points.length} places timing points">${line}${nodes}</svg>`;
}
function pamphletCard(model){
  const routeName=normalize(model.route.route_short_name)||model.routeId,longName=normalize(model.route.route_long_name),headsign=model.trips.find(trip=>trip.headsign)?.headsign||longName||`Direction ${model.direction}`,headers=model.points.map(point=>`<th><code>${escapeHtml(point.code)}</code><small>${escapeHtml(point.description)}</small></th>`).join(""),rows=model.trips.map((trip,index)=>{const byCode=new Map(trip.points.map(point=>[point.code,point.time]));return `<tr><th><span>${String(index+1).padStart(2,"0")}</span><small>${escapeHtml(trip.tripId)}</small></th>${model.points.map(point=>`<td>${pamphletTime(byCode.get(point.code))}</td>`).join("")}</tr>`;}).join("");
  return `<article class="pamphlet-card" data-pamphlet-route="${escapeHtml(model.routeId)}"><header><div class="pamphlet-route-number">${escapeHtml(routeName)}</div><div><p>HORAIRE DE LIGNE</p><h4>${escapeHtml(headsign)}</h4><small>${escapeHtml(longName||model.routeId)} · direction ${escapeHtml(model.direction)} · service ${escapeHtml(model.service)}</small></div></header>${pamphletDiagram(model.points)}<div class="pamphlet-table-scroll"><table><thead><tr><th>Voyage</th>${headers}</tr></thead><tbody>${rows}</tbody></table></div><footer><span>TP · heures de passage planifiées</span><strong>${model.points.length} place${model.points.length!==1?'s':''}</strong></footer></article>`;
}
function pamphletOffer(){
  const ready=isGeographicNew()&&state.groups.length>0&&state.decisions.length>0&&state.workspace.lastSaved&&!state.workspace.dirty&&!groupValidationIssues().length&&!state.decisions.some(decision=>decision.status==="error");
  if(!ready)return `<div id="pamphlet-offer"></div>`;
  if(!state.parsed.routes||!state.parsed.trips)return `<section id="pamphlet-offer" class="pamphlet-offer"><div><p class="eyebrow">APRÈS LA SAUVEGARDE</p><h3>Créer les pamphlets horaires</h3><small>Ajoutez routes.txt et trips.txt au GTFS pour produire les horaires par ligne.</small></div></section>`;
  const models=newClientPamphletModels();if(!models.length)return `<section id="pamphlet-offer" class="pamphlet-offer"><div><p class="eyebrow">APRÈS LA SAUVEGARDE</p><h3>Aucun horaire TP à présenter</h3><small>Aucun voyage ne relie les timing points aux places validées.</small></div></section>`;
  const routeIds=[...new Set(models.map(model=>model.routeId))],options=routeIds.map(routeId=>`<option value="${escapeHtml(routeId)}">Route ${escapeHtml(routeId)}</option>`).join("");
  return `<section id="pamphlet-offer" class="pamphlet-offer"><div class="pamphlet-offer-head"><div><p class="eyebrow">ÉTAPE DE FINITION</p><h3>Horaires voyageurs prêts à prévisualiser</h3><small>Les places sont valides et la sauvegarde est à jour. Les grilles affichent uniquement les passages aux TP avec leur code place à six caractères.</small></div><div><label>Filtrer une route<select onchange="filterPamphlets(this.value)"><option value="all">Toutes les routes</option>${options}</select></label><button type="button" class="primary" onclick="printPamphlets()">Imprimer les pamphlets</button></div></div><details class="pamphlet-details"><summary>Afficher les ${models.length} pamphlet${models.length!==1?'s':''} horaires</summary><div class="pamphlet-grid">${models.map(pamphletCard).join("")}</div></details></section>`;
}
function workingTimetableModule(){const models=state.workingTimetableModels||[],routeIds=[...new Set(models.map(model=>model.routeId))],options=routeIds.map(routeId=>`<option value="${escapeHtml(routeId)}">Route ${escapeHtml(routeId)}</option>`).join("");return `<section id="working-timetable-module" class="pamphlet-offer working-timetable-module"><div class="pamphlet-offer-head"><div><p class="eyebrow">WORKING / STOPS.TXT</p><h3>Timetables des places assignées</h3><small>${state.workingParentStations} stops utilisent un parent_station. Les heures présentées sont uniquement celles des timing points.</small></div><div><label>Filtrer une route<select onchange="filterPamphlets(this.value)"><option value="all">Toutes les routes</option>${options}</select></label><button type="button" class="primary" onclick="printPamphlets()">Imprimer les timetables</button></div></div><div class="pamphlet-grid">${models.length?models.map(pamphletCard).join(""):`<div class="notice">Aucun voyage avec timing point ne correspond aux parent_station de working/stops.txt.</div>`}</div></section>`;}
function refreshPamphletOffer(){const current=$("pamphlet-offer");if(current)current.outerHTML=pamphletOffer();}
function refreshGroupErrorSummary(){const summary=$("place-error-summary");if(summary)summary.outerHTML=groupErrorSummary();}
function smartRadiusNotice(){const stats=state.smartRadiusStats;if(!stats)return "";return `<div class="notice smart-radius-notice"><strong>Rayon intelligent actif.</strong> Les rayons locaux varient de ${stats.minimum} à ${stats.maximum} m (moyenne ${stats.average} m) selon la densité des ${stats.stops} timing points, leur fréquence de passage et les routes issues de trips.txt. Le rayon général reste le plafond.</div>`;}
function render() {
  document.body.classList.toggle("map-fullscreen-open",Boolean(state.fullscreenMapId));
  if(state.mode==="workingTimetables"){
    const models=state.workingTimetableModels||[],routes=new Set(models.map(model=>model.routeId)).size,trips=models.reduce((sum,model)=>sum+model.trips.length,0),places=new Set(models.flatMap(model=>model.points.map(point=>point.code))).size;
    $("summary-grid").innerHTML=[[state.workingParentStations,"stops avec parent_station",""],[places,"places dans les horaires",""],[routes,"routes",""],[models.length,"variantes horaires",""],[trips,"voyages affichés",""]].map(([n,l,c])=>`<div class="metric ${c}"><strong>${n}</strong><span>${l}</span></div>`).join("");
    $("notices").innerHTML=`<div class="notice"><strong>Source : working/stops.txt.</strong> Les codes de place proviennent directement de parent_station et les heures sont limitées aux timing points de stop_times.txt.</div>`;
    $("decision-list").innerHTML=workingTimetableModule();$("results-title").textContent="Timetables du dossier working";$("filters").classList.add("hidden");$("export-bar").classList.add("hidden");return;
  }
  if(state.mode==="timetables"){
    const a=state.timetableAnalysis,totals=a.days.map(d=>d.total),min=Math.min(...totals),max=Math.max(...totals);
    $("summary-grid").innerHTML=[[a.days.length,"jours analysés",""],[a.patterns.length,"variations de calendrier",""],[a.routeTypes.length,"types de route",""],[min,"minimum de voyages",""],[max,"maximum de voyages","warn"]].map(([n,l,c])=>`<div class="metric ${c}"><strong>${n}</strong><span>${l}</span></div>`).join("");
    $("notices").innerHTML=state.parsed.calendarDates?`<div class="notice"><strong>Exceptions appliquées.</strong> Les ajouts et suppressions de calendar_dates.txt sont inclus dans les volumes quotidiens.</div>`:`<div class="notice">Aucun calendar_dates.txt : calcul fondé uniquement sur calendar.txt.</div>`;
    $("decision-list").innerHTML=timetableCard();$("results-title").textContent="Comparaison quotidienne des horaires";$("filters").classList.add("hidden");$("export-bar").classList.add("hidden");return;
  }
  if(state.mode==="maps"){
    const stopCount=state.routeMaps.reduce((sum,map)=>sum+map.stops.length,0),shapeCount=state.routeMaps.reduce((sum,map)=>sum+map.shapes.length,0),warnings=state.mapWarnings||{};
    $("summary-grid").innerHTML=[[state.routeMaps.length,"routes cartographiées",""],[stopCount,"points horaires affichés",""],[shapeCount,"tracés shapes",""],[warnings.missingStops||0,"stops sans coordonnées",warnings.missingStops?"warn":""],[warnings.missingTrips||0,"trip_id sans correspondance",warnings.missingTrips?"warn":""]].map(([n,l,c])=>`<div class="metric ${c}"><strong>${n}</strong><span>${l}</span></div>`).join("");
    const fallback=state.timepointFallback?`<div class="notice"><strong>Points horaires déduits des heures.</strong> La colonne <code>timepoint</code> est absente : les passages à 00 seconde ont été retenus.</div>`:'';
    const missingStopCodes=state.routeMaps.reduce((total,map)=>total+(effectiveMapLabelMode(map)==="stop_code"?map.stops.filter(stop=>!stop.code).length:0),0);
    $("notices").innerHTML=fallback+`<div class="notice"><strong>Cartes OpenStreetMap interactives.</strong> Faites glisser la carte pour la déplacer, utilisez la roulette pour zoomer, ou le pincement et le défilement à deux doigts sur un pavé tactile. La route reste toujours partiellement visible. Le panneau latéral de la carte réseau permet de basculer chaque route entre ON, 50 % et OFF, ou de modifier toutes les routes en une fois. Chaque carte peut aussi être ouverte en plein écran. L'export PDF ouvre la boîte d'impression du navigateur : choisissez « Enregistrer au format PDF ».</div>`+(missingStopCodes?`<div class="notice danger"><strong>${missingStopCodes} point${missingStopCodes>1?'s':''} horaire${missingStopCodes>1?'s':''} sans stop_code.</strong> Ces marqueurs restent visibles mais sans libellé.</div>`:"")+(state.routeMaps.length?'':`<div class="notice danger">Aucune route ne contient de point horaire cartographiable.</div>`);
    const combined=state.mapDisplay==="combined"||state.mapDisplay==="both",individual=state.mapDisplay==="individual"||state.mapDisplay==="both";
    $("decision-list").innerHTML=(combined?combinedRouteMapCard():"")+(individual?state.routeMaps.map(routeMapCard).join(""):""); $("results-title").textContent=state.mapDisplay==="combined"?"Carte complète du réseau":"Cartes des points horaires par route"; $("filters").classList.add("hidden"); $("export-bar").classList.add("hidden"); return;
  }
  $("export-bar").classList.remove("hidden");
  if(isGeographicNew()){
    const valid=state.decisions.filter(d=>d.status!=="error"), errors=state.decisions.filter(d=>d.status==="error"), grouped=state.groups.filter(g=>g.items.length>1).length, singles=state.groups.filter(g=>g.items.length===1).length;
    $("summary-grid").innerHTML=[[valid.length,"points horaires",""],[state.groups.length,"places proposées",""],[grouped,"groupes multi-stops","warn"],[singles,"places avec un stop",""],[state.smartRadiusStats?`${state.smartRadiusStats.average} m`:`${$("radius").value} m`,state.smartRadiusStats?"rayon intelligent moyen":"rayon appliqué",""]].map(([n,l,c])=>`<div class="metric ${c}"><strong>${n}</strong><span>${l}</span></div>`).join("");
    const fallback=state.timepointFallback?`<div class="notice"><strong>Points horaires déduits des heures.</strong> La colonne <code>timepoint</code> est absente : les passages à 00 seconde ont été retenus.</div>`:'';
    $("notices").innerHTML=fallback+smartRadiusNotice()+`<div class="notice"><strong>Regroupement sans données HASTUS.</strong> Deux stops ne sont placés ensemble que si chacun reste dans le rayon choisi de tous les autres stops du groupe.</div>`+groupErrorSummary()+radiusConflictSummary()+errors.map(d=>`<div class="notice danger"><strong>${escapeHtml(d.id)}</strong> — ${escapeHtml(d.error)}</div>`).join("");
    $("decision-list").innerHTML=state.groups.map(groupCard).join("")+pamphletOffer();
    $("results-title").textContent="Places proposées et stops regroupés"; $("filters").classList.add("hidden"); $("download-collisions").classList.add("hidden");
    $("export-title").textContent="Prêt à exporter"; $("export-detail").textContent=`${state.groups.length} place${state.groups.length!==1?'s':''} à créer · ${valid.length} stops rattachés`;
    return;
  }
  const valid=state.decisions.filter(d=>d.status!=="error"), assigned=valid.filter(d=>d.source==="existing").length, review=valid.filter(d=>d.status==="review").length, noCandidate=valid.filter(d=>d.status==="review"&&!d.candidates.length).length;
  $("summary-grid").innerHTML=[
    [state.decisions.length,"points horaires",""],[assigned,"déjà rattachés",""],[review,"à confirmer","warn"],[noCandidate,"sans place proche","warn"],[state.collisions.length,"ID régénérés",state.collisions.length?"danger":""]
  ].map(([n,l,c])=>`<div class="metric ${c}"><strong>${n}</strong><span>${l}</span></div>`).join("");
  const errors=state.decisions.filter(d=>d.status==="error");
  const collisionNotice=state.collisions.length?`<div class="notice danger"><strong>${state.collisions.length} identifiant${state.collisions.length>1?'s':''} GTFS régénéré${state.collisions.length>1?'s':''} automatiquement.</strong><br>Ces identifiants existaient déjà dans HASTUS. Remplacements : ${state.collisions.slice(0,6).map(c=>`<code>${escapeHtml(c.old_stop_id)}</code> → <code>${escapeHtml(c.new_stop_id)}</code>`).join(', ')}${state.collisions.length>6?'…':''}. Les mêmes remplacements seront appliqués à stop_times.txt.</div>`:'';
  const fallbackNotice=state.timepointFallback?`<div class="notice"><strong>Points horaires déduits des heures.</strong> La colonne <code>timepoint</code> est absente : les passages à 00 seconde ont été retenus.</div>`:'';
  $("notices").innerHTML=fallbackNotice+smartRadiusNotice()+collisionNotice+errors.map(d=>`<div class="notice"><strong>${escapeHtml(d.id)}</strong> — ${escapeHtml(d.error)}</div>`).join("");
  const shown=valid.filter(d=>state.filter==="all"||(state.filter==="review"&&d.status==="review")||(state.filter==="assigned"&&d.source==="existing"));
  $("decision-list").innerHTML=shown.map(decisionCard).join("");
  const creates=valid.filter(d=>d.choice==="__new__").length;
  $("export-detail").textContent=`${valid.length} affectations · ${creates} nouvelle${creates!==1?'s':''} place${creates!==1?'s':''} · ${state.collisions.length} ID régénéré${state.collisions.length!==1?'s':''}`;
  $("export-title").textContent="Prêt à exporter";
  $("results-title").textContent="Décisions d'affectation"; $("filters").classList.remove("hidden");
  $("download-collisions").classList.toggle("hidden",state.collisions.length===0);
}
function osmProject(lat,lon,zoom){
  const size=256*(2**zoom),safeLat=Math.max(-85.05112878,Math.min(85.05112878,Number(lat))),sin=Math.sin(safeLat*Math.PI/180);
  return {x:(Number(lon)+180)/360*size,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*size};
}
function stopsConflictingWithGroup(group,radius){
  return state.groups.flatMap(source=>source.id===group.id?[]:source.items.map(item=>({item,source,distance:haversine(group.lat,group.lon,item.lat,item.lon)}))).filter(entry=>entry.distance<=radius).sort((a,b)=>a.distance-b.distance);
}
function allRadiusConflicts(){
  const byStop=new Map();
  for(const target of state.groups){const radius=Number(target.radius??$("radius").value);for(const conflict of stopsConflictingWithGroup(target,radius)){const id=conflict.item.id;if(!byStop.has(id))byStop.set(id,{item:conflict.item,source:conflict.source,targets:[]});byStop.get(id).targets.push({group:target,distance:conflict.distance});}}
  return [...byStop.values()].sort((a,b)=>a.source.description.localeCompare(b.source.description)||a.item.id.localeCompare(b.item.id));
}
const CONFLICT_PLACE_COLORS=["#006d67","#d05a3a","#3274a1","#8b62a8","#a57800","#4f7c2f","#c23b75","#55646d"];
function conflictPlaceColor(group){let hash=0;for(const char of String(group.id))hash=(hash*31+char.charCodeAt(0))>>>0;return CONFLICT_PLACE_COLORS[hash%CONFLICT_PLACE_COLORS.length];}
function colorWithAlpha(hex,alpha){const value=hex.replace("#","");return `rgba(${parseInt(value.slice(0,2),16)},${parseInt(value.slice(2,4),16)},${parseInt(value.slice(4,6),16)},${alpha})`;}
function conflictMapDomId(prefix,value){let hash=0;for(const char of String(value))hash=(hash*33+char.charCodeAt(0))>>>0;return `${prefix}-${hash.toString(36)}`;}
function conflictMapViewBox(mapId,width,height){const view=state.conflictMapViews.get(mapId);return view?`${view.x} ${view.y} ${view.width} ${view.height}`:`0 0 ${width} ${height}`;}
function conflictMapControls(mapId){return `<div class="conflict-map-controls"><span>Glisser pour déplacer · roulette ou pavé tactile pour zoomer</span><div><button type="button" aria-label="Déplacer la carte vers la gauche" onclick="panConflictMap('${mapId}',-1,0)">←</button><button type="button" aria-label="Déplacer la carte vers le haut" onclick="panConflictMap('${mapId}',0,-1)">↑</button><button type="button" aria-label="Déplacer la carte vers le bas" onclick="panConflictMap('${mapId}',0,1)">↓</button><button type="button" aria-label="Déplacer la carte vers la droite" onclick="panConflictMap('${mapId}',1,0)">→</button><button type="button" aria-label="Zoom arrière" onclick="zoomConflictMap('${mapId}',-1)">−</button><button type="button" aria-label="Zoom avant" onclick="zoomConflictMap('${mapId}',1)">+</button><button type="button" class="conflict-map-reset" onclick="resetConflictMap('${mapId}')">Recentrer</button></div></div>`;}
function conflictPlacesMap(conflict){
  const width=720,height=270,pad=34,mapId=conflictMapDomId("conflict-stop-map",conflict.item.id),places=[conflict.source,...conflict.targets.map(target=>target.group)].filter((group,index,all)=>all.findIndex(other=>other.id===group.id)===index),radiusFor=group=>Number(group.radius??$("radius").value),boundsAt=zoom=>{const entries=places.map(group=>{const point=osmProject(group.lat,group.lon,zoom),metersPerPixel=156543.03392*Math.max(.08,Math.cos(Number(group.lat)*Math.PI/180))/(2**zoom),radiusPixels=radiusFor(group)/metersPerPixel;return {group,point,radiusPixels};});return {entries,minX:Math.min(...entries.map(entry=>entry.point.x-entry.radiusPixels)),maxX:Math.max(...entries.map(entry=>entry.point.x+entry.radiusPixels)),minY:Math.min(...entries.map(entry=>entry.point.y-entry.radiusPixels)),maxY:Math.max(...entries.map(entry=>entry.point.y+entry.radiusPixels))};};
  let zoom=1,bounds=boundsAt(zoom);for(let candidate=19;candidate>=1;candidate--){const attempt=boundsAt(candidate);if(attempt.maxX-attempt.minX<=width-pad*2&&attempt.maxY-attempt.minY<=height-pad*2){zoom=candidate;bounds=attempt;break;}}
  const center={x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2},tileCount=2**zoom,firstTileX=Math.floor((center.x-width/2)/256),lastTileX=Math.floor((center.x+width/2)/256),firstTileY=Math.floor((center.y-height/2)/256),lastTileY=Math.floor((center.y+height/2)/256),tiles=[];
  for(let tileY=firstTileY;tileY<=lastTileY;tileY++)for(let tileX=firstTileX;tileX<=lastTileX;tileX++){if(tileY<0||tileY>=tileCount)continue;const wrappedX=((tileX%tileCount)+tileCount)%tileCount,x=tileX*256-center.x+width/2,y=tileY*256-center.y+height/2;tiles.push(`<image href="https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="256" height="256"/>`);}
  const areas=bounds.entries.map(entry=>{const x=entry.point.x-center.x+width/2,y=entry.point.y-center.y+height/2,color=conflictPlaceColor(entry.group),code=escapeHtml(entry.group.code),description=escapeHtml(entry.group.description);return `<g class="conflict-place-area"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${entry.radiusPixels.toFixed(2)}" fill="${color}" fill-opacity=".5" stroke="${color}" stroke-width="3"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="5" fill="#fff" stroke="${color}" stroke-width="3"/><text x="${(x+9).toFixed(2)}" y="${(y-9).toFixed(2)}">${code} · ${description}</text></g>`;}).join("");
  const stopWorld=osmProject(conflict.item.lat,conflict.item.lon,zoom),stopX=stopWorld.x-center.x+width/2,stopY=stopWorld.y-center.y+height/2,stopLabel=escapeHtml(conflict.item.description||conflict.item.id),legend=places.map(group=>`<span><i style="background:${conflictPlaceColor(group)}"></i><b>${escapeHtml(group.code)}</b> · ${escapeHtml(group.description)} · ${radiusFor(group)} m${group.id===conflict.source.id?' · affectation actuelle':''}</span>`).join("");
  return `<div class="radius-conflict-map">${conflictMapControls(mapId)}<svg id="${mapId}" data-conflict-map="${mapId}" data-base-width="${width}" data-base-height="${height}" viewBox="${conflictMapViewBox(mapId,width,height)}" tabindex="0" role="img" aria-label="Places possibles pour le stop ${escapeHtml(conflict.item.id)}"><rect width="${width}" height="${height}" fill="#e7ece8"/>${tiles.join("")}${areas}<g class="conflict-map-stop"><circle cx="${stopX.toFixed(2)}" cy="${stopY.toFixed(2)}" r="7"/><circle cx="${stopX.toFixed(2)}" cy="${stopY.toFixed(2)}" r="2"/><text x="${(stopX+10).toFixed(2)}" y="${(stopY+18).toFixed(2)}">${stopLabel}</text></g><rect x="${width-181}" y="${height-20}" width="177" height="17" fill="#fff" opacity=".9"/><text class="conflict-osm-credit" x="${width-8}" y="${height-8}" text-anchor="end">© OpenStreetMap contributors</text></svg><div class="radius-conflict-map-legend">${legend}</div></div>`;
}
function buildConflictGroups(conflicts){
  const places=new Map(),links=new Map();
  for(const conflict of conflicts){
    const involved=[conflict.source,...conflict.targets.map(target=>target.group)].filter((group,index,all)=>all.findIndex(other=>other.id===group.id)===index);
    for(const group of involved){places.set(group.id,group);if(!links.has(group.id))links.set(group.id,new Set());}
    for(let index=1;index<involved.length;index++){links.get(involved[0].id).add(involved[index].id);links.get(involved[index].id).add(involved[0].id);}
  }
  const components=[],seen=new Set();
  for(const placeId of places.keys()){
    if(seen.has(placeId))continue;
    const pending=[placeId],ids=[];
    while(pending.length){const current=pending.pop();if(seen.has(current))continue;seen.add(current);ids.push(current);for(const neighbour of links.get(current)||[])pending.push(neighbour);}
    const idSet=new Set(ids),componentConflicts=conflicts.filter(conflict=>idSet.has(conflict.source.id)||conflict.targets.some(target=>idSet.has(target.group.id))),uniqueStops=[...new Map(componentConflicts.map(conflict=>[conflict.item.id,conflict.item])).values()];
    components.push({id:`G${components.length+1}`,key:ids.slice().sort().join("::"),places:ids.map(id=>places.get(id)),conflicts:componentConflicts,stops:uniqueStops});
  }
  return components;
}
function activeConflictSnapshotComponent(){
  const snapshot=state.activeConflictGroupSnapshot;if(!snapshot||snapshot.key!==state.activeConflictGroupId)return null;
  const places=snapshot.placeIds.map(id=>state.groups.find(group=>group.id===id)).filter(Boolean),records=snapshot.stopIds.map(stopId=>{const source=state.groups.find(group=>group.items.some(item=>item.id===stopId)),item=source?.items.find(candidate=>candidate.id===stopId);return source&&item?{source,item}:null;}).filter(Boolean);
  if(!places.length||!records.length)return null;
  const conflicts=records.map(({source,item})=>({source,item,targets:places.filter(group=>group.id!==source.id).map(group=>({group,distance:haversine(item.lat,item.lon,group.lat,group.lon)}))}));
  return {id:snapshot.id,key:snapshot.key,places,conflicts,stops:records.map(record=>record.item),snapshot:true};
}
function combinedConflictMap(conflicts){
  const width=1000,height=500,pad=44,liveComponents=buildConflictGroups(conflicts),snapshotComponent=activeConflictSnapshotComponent(),components=(snapshotComponent?[...liveComponents.filter(component=>component.key!==snapshotComponent.key),snapshotComponent]:liveComponents).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})),activeComponent=components.find(component=>component.key===state.activeConflictGroupId)||null,activeIndex=activeComponent?components.findIndex(component=>component.key===activeComponent.key):-1,previousComponent=activeIndex>0?components[activeIndex-1]:null,nextComponent=activeIndex>=0&&activeIndex<components.length-1?components[activeIndex+1]:null,visibleComponents=activeComponent?[activeComponent]:components,visibleConflicts=[...new Map(visibleComponents.flatMap(component=>component.conflicts).map(conflict=>[conflict.item.id,conflict])).values()],places=[...new Map(visibleComponents.flatMap(component=>component.places).map(group=>[group.id,group])).values()],radiusFor=group=>Number(group.radius??$("radius").value),componentByPlace=new Map(components.flatMap(component=>component.places.map(group=>[group.id,component.id]))),conflictByStop=new Map(visibleConflicts.map(conflict=>[conflict.item.id,conflict]));
  const mapId=conflictMapDomId("combined-conflict-map-view",activeComponent?.key||"all");
  const boundsAt=zoom=>{const entries=places.map(group=>{const point=osmProject(group.lat,group.lon,zoom),metersPerPixel=156543.03392*Math.max(.08,Math.cos(Number(group.lat)*Math.PI/180))/(2**zoom);return {group,point,radiusPixels:radiusFor(group)/metersPerPixel};}),stopPoints=visibleConflicts.map(conflict=>osmProject(conflict.item.lat,conflict.item.lon,zoom));return {entries,minX:Math.min(...entries.map(entry=>entry.point.x-entry.radiusPixels),...stopPoints.map(point=>point.x)),maxX:Math.max(...entries.map(entry=>entry.point.x+entry.radiusPixels),...stopPoints.map(point=>point.x)),minY:Math.min(...entries.map(entry=>entry.point.y-entry.radiusPixels),...stopPoints.map(point=>point.y)),maxY:Math.max(...entries.map(entry=>entry.point.y+entry.radiusPixels),...stopPoints.map(point=>point.y))};};
  let zoom=1,bounds=boundsAt(zoom);for(let candidate=19;candidate>=1;candidate--){const attempt=boundsAt(candidate);if(attempt.maxX-attempt.minX<=width-pad*2&&attempt.maxY-attempt.minY<=height-pad*2){zoom=candidate;bounds=attempt;break;}}
  const center={x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2},tileCount=2**zoom,firstTileX=Math.floor((center.x-width/2)/256),lastTileX=Math.floor((center.x+width/2)/256),firstTileY=Math.floor((center.y-height/2)/256),lastTileY=Math.floor((center.y+height/2)/256),tiles=[];
  for(let tileY=firstTileY;tileY<=lastTileY;tileY++)for(let tileX=firstTileX;tileX<=lastTileX;tileX++){if(tileY<0||tileY>=tileCount)continue;const wrappedX=((tileX%tileCount)+tileCount)%tileCount,x=tileX*256-center.x+width/2,y=tileY*256-center.y+height/2;tiles.push(`<image href="https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="256" height="256"/>`);}
  const areas=bounds.entries.map(entry=>{const x=entry.point.x-center.x+width/2,y=entry.point.y-center.y+height/2,color=conflictPlaceColor(entry.group),groupId=componentByPlace.get(entry.group.id);return `<g class="combined-conflict-place"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${entry.radiusPixels.toFixed(2)}" fill="${color}" fill-opacity=".5" stroke="${color}" stroke-width="3"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="5" fill="#fff" stroke="${color}" stroke-width="3"/><text x="${(x+9).toFixed(2)}" y="${(y-9).toFixed(2)}">${groupId} · ${escapeHtml(entry.group.code)} · ${escapeHtml(entry.group.description)} · ${radiusFor(entry.group)} m</text></g>`;}).join("");
  const stops=[...conflictByStop.values()].map(conflict=>{const point=osmProject(conflict.item.lat,conflict.item.lon,zoom),x=point.x-center.x+width/2,y=point.y-center.y+height/2,color=conflictPlaceColor(conflict.source),groupId=componentByPlace.get(conflict.source.id);return `<g class="combined-conflict-stop"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="7" fill="#fff" stroke="${color}" stroke-width="4"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.5" fill="${color}"/><text x="${(x+10).toFixed(2)}" y="${(y+18).toFixed(2)}">${groupId} · ${escapeHtml(conflict.item.id)} · ${escapeHtml(conflict.item.description||conflict.item.id)}</text></g>`;}).join("");
  const groupLegend=components.map((component,index)=>{const reviewed=state.reviewedConflictGroups.has(component.key);return `<article class="combined-conflict-group ${component===activeComponent?'active':''} ${reviewed?'reviewed':''}"><button type="button" class="combined-conflict-group-main" onclick="selectConflictGroup('${jsString(component.key)}')"><span><strong>Groupe de conflit ${index+1}</strong><small>${component.stops.length} stop${component.stops.length>1?'s':''} · ${component.places.length} place${component.places.length>1?'s':''}</small></span><span>${component.places.map(group=>`<i><em style="background:${conflictPlaceColor(group)}"></em><b>${escapeHtml(group.code)}</b> · ${escapeHtml(group.description)} · ${radiusFor(group)} m</i>`).join("")}</span></button><button type="button" class="conflict-reviewed-toggle" aria-pressed="${reviewed}" onclick="toggleConflictGroupReviewed('${jsString(component.key)}')">${reviewed?'✓ Analysé':'Valider'}</button></article>`;}).join("");
  const assignments=activeComponent?`<div class="conflict-group-assignments"><div><strong>Affectation des stops du groupe</strong><small>Chaque changement déplace le stop vers la place choisie et recalcule les conflits.</small></div>${visibleConflicts.map(conflict=>{const possible=[conflict.source,...conflict.targets.map(target=>target.group)].filter((group,index,all)=>all.findIndex(other=>other.id===group.id)===index),options=possible.map(group=>`<option value="${escapeHtml(group.id)}" ${group.id===conflict.source.id?'selected':''}>${escapeHtml(group.code)} · ${escapeHtml(group.description)}</option>`).join("");return `<label style="--assigned-color:${conflictPlaceColor(conflict.source)};--assigned-bg:${colorWithAlpha(conflictPlaceColor(conflict.source),.18)}"><span><code>${escapeHtml(conflict.item.id)}</code><b>${escapeHtml(conflict.item.description||conflict.item.id)}</b></span><select aria-label="Place associée au stop ${escapeHtml(conflict.item.id)} dans le groupe de conflit" onchange="reassignStop('${jsString(conflict.item.id)}',this.value)">${options}</select></label>`;}).join("")}</div>`:'';
  const title=activeComponent?`Détail du ${activeComponent.id.replace('G','groupe de conflit ')}`:'Tous les regroupements en conflit',subtitle=activeComponent?`${activeComponent.stops.length} stop${activeComponent.stops.length>1?'s':''} et ${activeComponent.places.length} place${activeComponent.places.length>1?'s':''}. Modifiez les affectations avec les menus sous la carte.`:`${components.length} groupe${components.length>1?'s':''} de conflit connexe${components.length>1?'s':''}. Cliquez sur un groupe pour ouvrir sa carte et modifier les affectations.`;
  const activeReviewed=activeComponent&&state.reviewedConflictGroups.has(activeComponent.key),fourKNavigation=state.conflictResolutionFullscreen?(activeComponent?`<nav class="conflict-group-4k-nav" aria-label="Navigation entre les groupes de conflit"><button type="button" class="conflict-prev-group" ${previousComponent?`onclick="selectConflictGroup('${jsString(previousComponent.key)}')"`:'disabled'}>← Groupe précédent</button><span><b>${activeIndex+1}</b> / ${components.length}</span><button type="button" class="conflict-next-group" ${nextComponent?`onclick="selectConflictGroup('${jsString(nextComponent.key)}')"`:'disabled'}>Groupe suivant →</button></nav>`:`<nav class="conflict-group-4k-nav start" aria-label="Commencer la navigation des groupes"><span><b>${components.length}</b> groupe${components.length>1?'s':''} à analyser</span><button type="button" class="primary conflict-next-group" onclick="selectConflictGroup('${jsString(components[0].key)}')">Ouvrir le groupe 1 →</button></nav>`):'',activeControls=activeComponent?`<div class="conflict-map-secondary-actions"><button type="button" class="conflict-reviewed-toggle map-validation" aria-pressed="${activeReviewed}" onclick="toggleConflictGroupReviewed('${jsString(activeComponent.key)}')">${activeReviewed?'✓ Analysé':'Valider ce groupe'}</button><button type="button" class="secondary" onclick="selectConflictGroup(null)">Voir tous les groupes</button></div>`:'',activeActions=fourKNavigation||activeControls?`<div class="conflict-map-copy-actions">${fourKNavigation}${activeControls}</div>`:'';
  return `<div id="combined-conflict-map" class="combined-conflict-map ${activeComponent?'group-focused':''}"><div class="combined-conflict-map-copy"><div><strong>${title}</strong><small>${subtitle} Les surfaces colorées représentent les rayons individuels à 50 % d’opacité.</small></div>${activeActions}</div>${conflictMapControls(mapId)}<svg id="${mapId}" data-conflict-map="${mapId}" data-base-width="${width}" data-base-height="${height}" viewBox="${conflictMapViewBox(mapId,width,height)}" tabindex="0" role="img" aria-label="${activeComponent?'Carte du groupe de conflit sélectionné':'Carte consolidée de tous les groupes de conflit'}"><rect width="${width}" height="${height}" fill="#e7ece8"/>${tiles.join("")}${areas}${stops}<rect x="${width-181}" y="${height-20}" width="177" height="17" fill="#fff" opacity=".9"/><text class="conflict-osm-credit" x="${width-8}" y="${height-8}" text-anchor="end">© OpenStreetMap contributors</text></svg>${assignments}<div class="combined-conflict-groups">${groupLegend}</div></div>`;
}
function radiusConflictSummary(){
  const conflicts=allRadiusConflicts(),retainedGroup=state.activeConflictGroupSnapshot?.key===state.activeConflictGroupId?state.activeConflictGroupSnapshot:null;
  if(!conflicts.length&&!retainedGroup)return `<div id="radius-conflict-summary" class="hidden"></div>`;
  const rows=conflicts.map(conflict=>{const {item,source,targets}=conflict,color=conflictPlaceColor(source),possible=[source,...targets.map(target=>target.group)].filter((group,index,all)=>all.findIndex(other=>other.id===group.id)===index),options=possible.map(group=>`<option value="${escapeHtml(group.id)}" ${group.id===source.id?'selected':''}>${escapeHtml(group.code)} · ${escapeHtml(group.description)}${group.id===source.id?' · actuelle':''}</option>`).join("");return `<article class="radius-conflict-item" style="--assigned-color:${color};--assigned-bg:${colorWithAlpha(color,.18)}"><div class="radius-conflict-choice-row"><button type="button" class="radius-conflict-link" onclick="focusAssignedGroup('${jsString(source.id)}')"><span><code>${escapeHtml(item.id)}</code><strong>${escapeHtml(item.description||item.id)}</strong></span><small>Rattaché à <b>${escapeHtml(source.code)} · ${escapeHtml(source.description)}</b> · conflit avec ${targets.map(target=>`${escapeHtml(target.group.code)} (${Math.round(target.distance)} m)`).join(" · ")}</small><i>Afficher sa place →</i></button><label class="radius-conflict-select">Place associée<select aria-label="Place associée au stop ${escapeHtml(item.id)}" onchange="reassignStop('${jsString(item.id)}',this.value)">${options}</select></label></div>${conflictPlacesMap(conflict)}</article>`;}).join("");
  const displayedCount=conflicts.length||retainedGroup?.stopIds.length||0,statusText=conflicts.length?'en conflit de rayon':'dans le groupe analysé · conflit résolu';
  return `<section id="radius-conflict-summary" class="radius-conflict-summary"><div class="radius-conflict-summary-head"><span class="error-summary-icon">!</span><div><strong>${displayedCount} stop${displayedCount>1?'s':''} ${statusText}</strong><small>${conflicts.length?'Chaque stop reste associé à une seule place. Cliquez sur un stop pour afficher sa place actuelle.':'Le groupe initial reste ouvert afin de poursuivre ou annuler les réaffectations.'}</small></div><div class="conflict-summary-actions"><button type="button" class="secondary" onclick="toggleCombinedConflictMap()">${state.showCombinedConflictMap?'Masquer la carte consolidée':'Afficher tous les conflits sur une carte'}</button><button type="button" class="primary conflict-4k-button" onclick="toggleConflictResolutionFullscreen()">${state.conflictResolutionFullscreen?'Quitter le plein écran':'Résolution plein écran 4K'}</button></div></div>${state.showCombinedConflictMap?combinedConflictMap(conflicts):''}<div class="radius-conflict-list">${rows}</div></section>`;
}
function refreshRadiusConflictSummary(){const summary=$("radius-conflict-summary");if(summary)summary.outerHTML=radiusConflictSummary();}
function groupRadiusConflicts(group,radius){
  const conflicts=stopsConflictingWithGroup(group,radius);
  if(!conflicts.length)return `<div class="group-radius-conflicts clear"><strong>Aucun conflit d’affectation dans ce rayon.</strong><small>Chaque stop conserve un seul parent_station.</small></div>`;
  const rows=conflicts.map(({item,source,distance})=>`<div class="radius-conflict-stop"><div><code>${escapeHtml(item.id)}</code><strong>${escapeHtml(item.description||item.id)}</strong><small>${Math.round(distance)} m · actuellement associé à ${escapeHtml(source.code)} · ${escapeHtml(source.description)}</small></div><button type="button" class="secondary" onclick="reassignStop('${jsString(item.id)}','${jsString(group.id)}')">Affecter à cette place</button></div>`).join("");
  return `<div class="group-radius-conflicts danger"><div><strong>${conflicts.length} conflit${conflicts.length>1?'s':''} potentiel${conflicts.length>1?'s':''} dans le rayon</strong><small>Ces stops appartiennent déjà à une autre place. Une réaffectation les déplacera afin de conserver un parent_station unique.</small></div>${rows}</div>`;
}
function miniPlaceMap(group,radius){
  const width=640,height=280,lat=Number(group.lat),lon=Number(group.lon),latitudeCos=Math.max(.08,Math.cos(lat*Math.PI/180));
  const idealZoom=Math.log2(156543.03392*latitudeCos*78/Math.max(1,radius)),zoom=Math.max(14,Math.min(19,Math.round(idealZoom))),scale=2**zoom;
  const center=osmProject(lat,lon,zoom),metersPerPixel=156543.03392*latitudeCos/scale,circleRadius=Math.max(2,radius/metersPerPixel);
  const firstTileX=Math.floor((center.x-width/2)/256),lastTileX=Math.floor((center.x+width/2)/256),firstTileY=Math.floor((center.y-height/2)/256),lastTileY=Math.floor((center.y+height/2)/256),tileCount=2**zoom;
  const tiles=[];
  for(let tileY=firstTileY;tileY<=lastTileY;tileY++)for(let tileX=firstTileX;tileX<=lastTileX;tileX++){
    if(tileY<0||tileY>=tileCount)continue;
    const wrappedX=((tileX%tileCount)+tileCount)%tileCount,x=tileX*256-center.x+width/2,y=tileY*256-center.y+height/2;
    tiles.push(`<image href="https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="256" height="256"/>`);
  }
  const groupStopIds=new Set(group.items.map(item=>item.id)),nearbyStops=state.groups.flatMap(candidate=>candidate.items).filter(item=>!groupStopIds.has(item.id)).map(item=>{
    const point=osmProject(item.lat,item.lon,zoom),x=point.x-center.x+width/2,y=point.y-center.y+height/2,distance=haversine(lat,lon,item.lat,item.lon);
    return {...item,x,y,distance,insideRadius:distance<=radius};
  }).filter(item=>item.x>=-10&&item.x<=width+10&&item.y>=-10&&item.y<=height+10);
  const nearbyInside=nearbyStops.filter(item=>item.insideRadius).length,nearbyOutside=nearbyStops.length-nearbyInside;
  const nearbyPoints=nearbyStops.map((item,index)=>{const label=escapeHtml(item.description||item.id),anchor=item.x>width-190?'end':'start',labelX=item.x>width-190?item.x-9:item.x+9,kind=item.insideRadius?'mini-stop-conflict':'mini-stop-nearby';return `<g class="${kind}"><circle cx="${item.x.toFixed(2)}" cy="${item.y.toFixed(2)}" r="6"/><circle class="mini-stop-nearby-core" cx="${item.x.toFixed(2)}" cy="${item.y.toFixed(2)}" r="2"/><text x="${labelX.toFixed(2)}" y="${(item.y+14+index%2*13).toFixed(2)}" text-anchor="${anchor}">${label}</text></g>`;}).join("");
  const points=group.items.map((item,index)=>{
    const point=osmProject(item.lat,item.lon,zoom),x=point.x-center.x+width/2,y=point.y-center.y+height/2,label=escapeHtml(item.description||item.id),anchor=x>width-190?'end':'start',labelX=x>width-190?x-9:x+9;
    return `<g class="mini-stop"><title>${label}</title><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="6"/><circle class="mini-stop-core" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2"/><text x="${labelX.toFixed(2)}" y="${(y-8-index%2*13).toFixed(2)}" text-anchor="${anchor}">${label}</text></g>`;
  }).join("");
  return `<div class="mini-place-map"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Carte de la place ${escapeHtml(group.description)}, cercle de recherche de ${radius} mètres"><rect width="${width}" height="${height}" fill="#e7ece8"/>${tiles.join("")}<circle class="search-radius" cx="${width/2}" cy="${height/2}" r="${circleRadius.toFixed(2)}"/>${nearbyPoints}<g class="place-centre"><path d="M ${width/2-8} ${height/2} H ${width/2+8} M ${width/2} ${height/2-8} V ${height/2+8}"/><circle cx="${width/2}" cy="${height/2}" r="3"/></g>${points}<g class="map-scale"><rect x="12" y="${height-38}" width="112" height="25" rx="3"/><line x1="22" y1="${height-23}" x2="${(22+100/metersPerPixel).toFixed(2)}" y2="${height-23}"/><text x="22" y="${height-28}">100 m</text></g></svg><div class="mini-map-legend"><span><i class="legend-radius"></i>Rayon ${radius} m</span><span><i class="legend-stop"></i>Stops regroupés</span><span><i class="legend-conflict-stop"></i>Nouveaux stops dans le rayon (${nearbyInside})</span><span><i class="legend-nearby-stop"></i>Timing points hors rayon (${nearbyOutside})</span><span><i class="legend-centre"></i>Centre de la place</span></div><a class="osm-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a></div>`;
}
function groupCard(group){
  const generalRadius=Number($("radius").value),radius=Number(group.radius??generalRadius);
  const stops=group.items.map(item=>{
    const possible=state.groups.map(candidate=>({...candidate,distance:haversine(item.lat,item.lon,candidate.lat,candidate.lon),searchRadius:Number(candidate.radius??generalRadius)})).filter(candidate=>candidate.id===group.id||candidate.distance<=candidate.searchRadius).sort((a,b)=>a.distance-b.distance);
    const options=possible.map(candidate=>`<option value="${candidate.id}" ${candidate.id===group.id?'selected':''}>${escapeHtml(candidate.code)} · ${escapeHtml(candidate.description)} (${Math.round(candidate.distance)} m)</option>`).join("");
    return `<div class="group-stop"><code>${escapeHtml(item.id)}</code><span>${escapeHtml(item.description)}</span><small>${Math.round(haversine(item.lat,item.lon,group.lat,group.lon))} m du centre${item.smartRadius?` · rayon auto ${item.smartRadius} m · ${item.smartTrips} voyage${item.smartTrips>1?'s':''} · ${item.smartRoutes} route${item.smartRoutes>1?'s':''}`:''}</small><label><span class="place-select-title">Place associée <strong>${possible.length} place${possible.length>1?'s':''} possible${possible.length>1?'s':''}</strong></span><select aria-label="Place associée à ${escapeHtml(item.id)}" onchange="reassignStop('${jsString(item.id)}',this.value)">${options}</select></label></div>`;
  }).join("");
  const normalizedDescription=cleanCode(group.description),normalizedCode=normalize(group.code).toUpperCase(),duplicateCode=state.groups.some(other=>other.id!==group.id&&normalize(other.code).toUpperCase()===normalizedCode),duplicateDescription=state.groups.some(other=>other.id!==group.id&&cleanCode(other.description)===normalizedDescription),gtfsCodeCollision=state.gtfsStops.some(stop=>normalize(stop.stop_id).toUpperCase()===normalizedCode),invalidCode=!/^[A-Z0-9]{6}$/.test(normalizedCode),emptyDescription=!normalize(group.description),codeWarning=duplicateCode?'Ce code est déjà proposé.':gtfsCodeCollision?'Ce code est déjà utilisé comme stop_id.':invalidCode?'Le code doit contenir exactement 6 caractères.':'',descriptionWarning=duplicateDescription?'Cette description est déjà proposée.':emptyDescription?'La description est obligatoire.':'',proposals=state.groups.map(other=>`<option value="${other.id}">${escapeHtml(other.code)} · ${escapeHtml(other.description)}${other.id===group.id?' — cette place':''}</option>`).join("");
  return `<article id="group-card-${escapeHtml(group.id)}" class="group-card"><div class="group-head"><div><span class="badge review">Place proposée</span>${group.smart?'<span class="badge smart">Rayon intelligent</span>':''}<h3>${group.items.length} stop${group.items.length>1?'s':''} dans le même groupe</h3></div><span class="distance">rayon local ${radius} m</span></div><div class="group-fields"><label>Description de la place<input class="${descriptionWarning?'invalid':''}" value="${escapeHtml(group.description)}" oninput="renameGroupDescription('${group.id}',this)" onblur="render()"><small class="field-warning">${descriptionWarning}</small></label><label>Code place<input class="code-input ${codeWarning?'invalid':''}" maxlength="6" value="${escapeHtml(group.code)}" oninput="renameGroupCode('${group.id}',this)" onblur="render()"><small class="field-warning">${codeWarning}</small></label><label class="proposal-list">Codes et descriptions proposés<select aria-label="Codes et descriptions de places proposés">${proposals}</select></label></div><label class="group-radius"><span><strong>Rayon individuel de cette place</strong><small>${group.smart?'Calcul intelligent initial':'Rayon général initial'} : ${group.smart?group.smartInitialRadius:generalRadius} m</small></span><output class="group-radius-value">${radius} m</output><input type="range" min="1" max="500" value="${radius}" aria-label="Rayon individuel de ${escapeHtml(group.description)}" oninput="previewGroupRadius('${group.id}',this)" onchange="render()"></label>${miniPlaceMap(group,radius)}${groupRadiusConflicts(group,radius)}<div class="group-stops">${stops}</div></article>`;
}
function decisionCard(d) {
  const badge=d.source==="existing"?'<span class="badge">HASTUS · existant</span>':`<span class="badge review">${d.source==="new-stop"?'Stop à créer':'Place à choisir'}</span>`;
  const choices=d.candidates.map(p=>`<label class="place-choice"><input type="radio" name="choice-${escapeHtml(d.id)}" value="${escapeHtml(p.id)}" ${d.choice===p.id?'checked':''} onchange="choose('${jsString(d.id)}',this.value)"><span><strong>${escapeHtml(p.description)}</strong><small>${escapeHtml(p.id)} · Stops : ${escapeHtml(p.stopDescriptions.filter(Boolean).slice(0,3).join(' · ')||'—')}</small></span><span class="distance">${Math.round(p.distance)} m</span></label>`).join("");
  const newChoice=d.status==="review"?`<label class="place-choice"><input type="radio" name="choice-${escapeHtml(d.id)}" value="__new__" ${d.choice==='__new__'?'checked':''} onchange="choose('${jsString(d.id)}',this.value)"><span><strong>Créer une nouvelle place</strong><small>Code unique proposé à partir de la description</small></span><span class="new-name"><input maxlength="6" value="${escapeHtml(d.newCode)}" aria-label="Code de la nouvelle place" oninput="renamePlace('${jsString(d.id)}',this.value)"></span></label>`:"";
  const idDisplay=d.originalId!==d.id?`${escapeHtml(d.originalId)} → <strong>${escapeHtml(d.id)}</strong>`:escapeHtml(d.id);
  return `<article class="decision" data-status="${d.status}"><div>${badge}${d.smartRadius?'<span class="badge smart">Rayon intelligent</span>':''}<div class="stop-id">${idDisplay}</div><h3>${escapeHtml(d.description)}</h3><div class="coords">${Number.isFinite(d.lat)?d.lat.toFixed(6):'—'}, ${Number.isFinite(d.lon)?d.lon.toFixed(6):'—'}${d.smartRadius?` · recherche ${d.smartRadius} m`:''}</div></div><div class="choice-list">${choices}${newChoice}</div></article>`;
}
function jsString(s){return String(s).replaceAll('\\','\\\\').replaceAll("'","\\'");}
function readConflictMapView(svg){const values=(svg.getAttribute("viewBox")||`0 0 ${svg.dataset.baseWidth} ${svg.dataset.baseHeight}`).split(/\s+/).map(Number);return {x:values[0],y:values[1],width:values[2],height:values[3]};}
function updateConflictMapView(svg,next){const baseWidth=Number(svg.dataset.baseWidth),baseHeight=Number(svg.dataset.baseHeight),width=Math.max(baseWidth/12,Math.min(baseWidth,next.width)),height=width*baseHeight/baseWidth,x=Math.max(0,Math.min(baseWidth-width,next.x)),y=Math.max(0,Math.min(baseHeight-height,next.y)),view={x,y,width,height};svg.setAttribute("viewBox",`${x} ${y} ${width} ${height}`);state.conflictMapViews.set(svg.dataset.conflictMap,view);}
function zoomConflictMapElement(svg,direction,anchorX=.5,anchorY=.5){const current=readConflictMapView(svg),factor=direction>0?.78:1/.78,newWidth=current.width*factor,newHeight=current.height*factor;updateConflictMapView(svg,{x:current.x+current.width*anchorX-newWidth*anchorX,y:current.y+current.height*anchorY-newHeight*anchorY,width:newWidth,height:newHeight});}
window.zoomConflictMap=(mapId,direction)=>{const svg=$(mapId);if(svg)zoomConflictMapElement(svg,direction);};
window.panConflictMap=(mapId,dx,dy)=>{const svg=$(mapId);if(!svg)return;const current=readConflictMapView(svg);updateConflictMapView(svg,{...current,x:current.x+dx*current.width*.14,y:current.y+dy*current.height*.14});};
window.resetConflictMap=mapId=>{const svg=$(mapId);if(!svg)return;state.conflictMapViews.delete(mapId);svg.setAttribute("viewBox",`0 0 ${svg.dataset.baseWidth} ${svg.dataset.baseHeight}`);};
window.choose=(id,value)=>{const d=state.decisions.find(x=>x.id===id);d.choice=value;render();queueQuickSave();};
window.renamePlace=(id,value)=>{const d=state.decisions.find(x=>x.id===id);d.newCode=cleanCode(value).replaceAll(" ","").slice(0,6);queueQuickSave();};
window.renameGroupCode=(id,input)=>{const g=state.groups.find(x=>x.id===id);g.code=cleanCode(input.value).replaceAll(" ","").slice(0,6);input.value=g.code;const duplicate=state.groups.some(other=>other.id!==id&&normalize(other.code).toUpperCase()===g.code.toUpperCase()),collision=state.gtfsStops.some(stop=>normalize(stop.stop_id).toUpperCase()===g.code.toUpperCase()),invalid=!/^[A-Z0-9]{6}$/.test(g.code),message=duplicate?"Ce code est déjà proposé.":collision?"Ce code est déjà utilisé comme stop_id.":invalid?"Le code doit contenir exactement 6 caractères.":"";input.classList.toggle("invalid",Boolean(message));input.setCustomValidity(message);input.nextElementSibling.textContent=message;refreshGroupErrorSummary();queueQuickSave();};
window.renameGroupDescription=(id,input)=>{const g=state.groups.find(x=>x.id===id);g.description=input.value;const duplicate=state.groups.some(other=>other.id!==id&&cleanCode(other.description)===cleanCode(g.description)),message=duplicate?"Cette description est déjà proposée.":!normalize(g.description)?"La description est obligatoire.":"";input.classList.toggle("invalid",Boolean(message));input.setCustomValidity(message);input.nextElementSibling.textContent=message;refreshGroupErrorSummary();queueQuickSave();};
window.applySuggestedDescription=(id,input)=>{const g=state.groups.find(x=>x.id===id);if(!g)return;g.description=stripPlaceDirections(input.value);refreshCodeFromDescription(g,usedPlaceCodes(new Set([id])));render();queueQuickSave();const summary=$("place-error-summary");if(summary)summary.scrollIntoView({behavior:"smooth",block:"nearest"});};
window.applyAllSuggestedDescriptions=button=>{const updates=[];for(const input of button.closest("#place-error-summary").querySelectorAll(".duplicate-description-details input")){const group=state.groups.find(item=>item.id===input.dataset.groupId);if(group){group.description=stripPlaceDirections(input.value);updates.push(group);}}const updatedIds=new Set(updates.map(group=>group.id)),used=usedPlaceCodes(updatedIds);for(const group of updates)refreshCodeFromDescription(group,used);render();queueQuickSave();const summary=$("place-error-summary");if(summary)summary.scrollIntoView({behavior:"smooth",block:"nearest"});};
window.applySuggestedCode=(id,code)=>{const group=state.groups.find(item=>item.id===id);if(!group)return;group.code=code;render();queueQuickSave();const summary=$("place-error-summary");if(summary)summary.scrollIntoView({behavior:"smooth",block:"nearest"});};
window.toggleCombinedConflictMap=()=>{state.showCombinedConflictMap=!state.showCombinedConflictMap;refreshRadiusConflictSummary();captureGeographicState();queueQuickSave();};
window.toggleConflictResolutionFullscreen=async()=>{state.conflictResolutionFullscreen=!state.conflictResolutionFullscreen;if(state.conflictResolutionFullscreen)state.showCombinedConflictMap=true;document.body.classList.toggle("conflict-resolution-fullscreen",state.conflictResolutionFullscreen);refreshRadiusConflictSummary();if(state.conflictResolutionFullscreen){try{await document.documentElement.requestFullscreen?.();}catch(error){console.info("Le plein écran natif n’est pas disponible; utilisation du mode 4K intégré.");}}else if(document.fullscreenElement){try{await document.exitFullscreen();}catch(error){console.info("Sortie du plein écran gérée par le navigateur.");}}};
window.selectConflictGroup=groupId=>{if(groupId){const component=buildConflictGroups(allRadiusConflicts()).find(candidate=>candidate.key===groupId);if(component)state.activeConflictGroupSnapshot={key:component.key,id:component.id,placeIds:component.places.map(group=>group.id),stopIds:component.stops.map(stop=>stop.id)};state.activeConflictGroupId=groupId;}else{state.activeConflictGroupId=null;state.activeConflictGroupSnapshot=null;state.groups=state.groups.filter(group=>group.items.length);}refreshRadiusConflictSummary();captureGeographicState();queueQuickSave();const map=$("combined-conflict-map");if(map)map.scrollIntoView({behavior:"smooth",block:"start"});};
window.toggleConflictGroupReviewed=groupId=>{if(state.reviewedConflictGroups.has(groupId))state.reviewedConflictGroups.delete(groupId);else state.reviewedConflictGroups.add(groupId);refreshRadiusConflictSummary();captureGeographicState();queueQuickSave();};
window.previewGroupRadius=(id,input)=>{const g=state.groups.find(x=>x.id===id);if(!g)return;g.radius=Math.max(1,Math.min(500,Number(input.value)||1));const card=input.closest(".group-card");card.querySelector(".group-radius-value").textContent=`${g.radius} m`;card.querySelector(".distance").textContent=`rayon local ${g.radius} m`;card.querySelector(".mini-place-map").outerHTML=miniPlaceMap(g,g.radius);card.querySelector(".group-radius-conflicts").outerHTML=groupRadiusConflicts(g,g.radius);refreshRadiusConflictSummary();queueQuickSave();};
window.reassignStop=(stopId,targetGroupId)=>{
  const source=state.groups.find(g=>g.items.some(item=>item.id===stopId)), target=state.groups.find(g=>g.id===targetGroupId);
  if(!source||!target||source===target)return;
  const index=source.items.findIndex(item=>item.id===stopId), item=source.items.splice(index,1)[0]; target.items.push(item);
  const recenter=g=>{g.lat=g.items.reduce((sum,x)=>sum+x.lat,0)/g.items.length;g.lon=g.items.reduce((sum,x)=>sum+x.lon,0)/g.items.length;};
  recenter(target); if(source.items.length)recenter(source); else if(!state.activeConflictGroupSnapshot?.placeIds.includes(source.id))state.groups=state.groups.filter(g=>g!==source);
  const decision=state.decisions.find(d=>d.id===stopId); if(decision)decision.groupId=target.id;
  render();queueQuickSave();
};
window.focusAssignedGroup=groupId=>{const card=$(`group-card-${groupId}`);if(!card)return;document.querySelectorAll(".group-card.conflict-focus").forEach(item=>item.classList.remove("conflict-focus"));card.classList.add("conflict-focus");card.scrollIntoView({behavior:"smooth",block:"start"});setTimeout(()=>card.classList.remove("conflict-focus"),2200);};
window.setRouteMapLabel=(routeId,mode)=>{if(mode==="inherit")state.mapLabelModes.delete(routeId);else state.mapLabelModes.set(routeId,mode);render();};
window.panRouteMap=(routeId,dx,dy)=>{const current=state.mapPans.get(routeId)||{x:0,y:0};state.mapPans.set(routeId,{x:current.x+dx,y:current.y+dy});render();};
window.zoomRouteMap=(routeId,delta)=>{const current=state.mapZooms.get(routeId)||0;state.mapZooms.set(routeId,Math.max(-3,Math.min(6,current+delta)));state.mapPans.delete(routeId);render();};
window.resetRouteMapZoom=routeId=>{state.mapZooms.delete(routeId);state.mapPans.delete(routeId);render();};
window.cycleCombinedRoute=routeId=>{const current=state.combinedRouteStates.get(routeId)||"full",next=current==="full"?"half":current==="half"?"hidden":"full";state.combinedRouteStates.set(routeId,next);state.mapPans.delete("ALL_ROUTES");render();};
window.setAllCombinedRoutes=visibility=>{for(const map of state.routeMaps)state.combinedRouteStates.set(map.routeId,visibility);state.mapPans.delete("ALL_ROUTES");render();};
window.toggleMapFullscreen=routeId=>{state.fullscreenMapId=state.fullscreenMapId===routeId?null:routeId;render();};
function standaloneMapSvg(map){return routeMapSvg(map).replace('<svg class="route-map interactive-map"','<svg xmlns="http://www.w3.org/2000/svg" class="route-map"');}
function printMapDocument(map,title,legend=""){
  const popup=window.open("","_blank","width=1200,height=850");if(!popup){alert("La fenêtre d'impression a été bloquée par le navigateur.");return;}
  const svg=standaloneMapSvg(map);
  popup.document.open();popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#102a2d}h1{margin:0 0 5mm;font-size:20px}.route-map{display:block;width:100%;height:auto}.legend{display:flex;flex-wrap:wrap;gap:5mm;margin:0 0 4mm;font-size:10px}.legend span{display:flex;gap:2mm;align-items:center}.legend i{width:14px;height:5px}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(title)}</h1>${legend?`<div class="legend">${legend}</div>`:""}${svg}<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),1200));<\/script></body></html>`);popup.document.close();
}
window.printRouteMapPdf=routeId=>{const map=state.routeMaps.find(item=>item.routeId===routeId);if(map)printMapDocument(map,`Route ${routeLabel(map)} — points horaires`);};
window.printCombinedRouteMapPdf=()=>{const map=combinedRouteMap(),legend=map.legend.map(item=>`<span><i style="background:${item.color}"></i><strong>${escapeHtml(item.label)}</strong>${item.name?` · ${escapeHtml(item.name)}`:""}</span>`).join("");printMapDocument(map,"Toutes les routes — points horaires",legend);};
window.downloadRouteMap=routeId=>{const map=state.routeMaps.find(x=>x.routeId===routeId);if(!map)return;download(`route_${routeLabel(map).replace(/[^a-z0-9_-]+/gi,'_')}.svg`,standaloneMapSvg(map),"image/svg+xml");};
window.downloadCombinedRouteMap=()=>{const map=combinedRouteMap();download("reseau_toutes_routes.svg",standaloneMapSvg(map),"image/svg+xml");};
window.downloadDailyCounts=()=>download("comparaison_voyages_par_jour.csv",dailyCountsCsv());
window.downloadHastusPreparation=()=>download("timetable_preparation_hastus.csv",hastusPreparationCsv());
window.selectTimetableDate=date=>{state.selectedTimetableDate=date;render();};
window.filterPamphlets=routeId=>{document.querySelectorAll(".pamphlet-card").forEach(card=>card.classList.toggle("pamphlet-filtered",routeId!=="all"&&card.dataset.pamphletRoute!==routeId));};
window.printPamphlets=()=>{const section=$("working-timetable-module")||$("pamphlet-offer");if(!section)return;const popup=window.open("","_blank","width=1200,height=850");if(!popup){alert("La fenêtre d’impression a été bloquée par le navigateur.");return;}popup.document.open();popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Pamphlets horaires</title><link rel="stylesheet" href="${new URL("styles.css",location.href).href}"><style>body{background:#fff;padding:12px}.pamphlet-offer-head>div:last-child,.pamphlet-details>summary{display:none}.pamphlet-details{display:block}.pamphlet-grid{display:block}.pamphlet-card{break-after:page;margin:0 0 12mm;box-shadow:none}.pamphlet-card:last-child{break-after:auto}@page{size:landscape;margin:9mm}</style></head><body>${section.outerHTML}<script>document.querySelector("details")?.setAttribute("open","");window.addEventListener("load",()=>setTimeout(()=>window.print(),700));<\/script></body></html>`);popup.document.close();};

function resolvedPlace(d) {
  if(isGeographicNew()) {const g=state.groups.find(x=>x.id===d.groupId);return g?{id:g.code,description:g.description,lat:g.lat,lon:g.lon,isNew:true}:null;}
  if (d.choice==="__new__") return {id:d.newCode,description:d.description,lat:d.lat,lon:d.lon,isNew:true};
  const p=d.candidates.find(x=>x.id===d.choice)||state.places.find(x=>x.id===d.choice);
  return p ? {...p,isNew:false} : null;
}
function buildExports() {
  const headers=[...state.parsed.stops.headers];
  if(!headers.includes("parent_station")) headers.push("parent_station");
  if(!headers.includes("location_type")) headers.push("location_type");
  const rows=state.gtfsStops.map(r=>{const copy={...r},oldId=normalize(copy.stop_id);copy.stop_id=state.stopIdRemap.get(oldId)||oldId;if(state.stopIdRemap.has(normalize(copy.parent_station)))copy.parent_station=state.stopIdRemap.get(normalize(copy.parent_station));return copy;});
  const byId=new Map(rows.map(r=>[normalize(r.stop_id),r]));
  const timeHeaders=[...state.parsed.times.headers];
  const timeRows=state.parsed.times.rows.map(r=>({...r,stop_id:state.stopIdRemap.get(normalize(r.stop_id))||normalize(r.stop_id)}));
  const existingPlaceCodes=new Set(state.places.map(p=>p.id.toUpperCase()));
  const newCodes=(isGeographicNew()?state.groups.map(g=>g.code):state.decisions.filter(d=>d.status!=="error"&&d.choice==="__new__").map(d=>d.newCode)).map(code=>normalize(code).toUpperCase());
  for(const code of newCodes) if(!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`Le code « ${code || "vide"} » doit contenir exactement six lettres ou chiffres.`);
  if(new Set(newCodes).size!==newCodes.length) throw new Error("Deux nouvelles places utilisent le même code.");
  if(isGeographicNew()){
    const descriptions=state.groups.map(group=>cleanCode(group.description));
    if(descriptions.some(description=>!description)) throw new Error("Une place proposée possède une description vide.");
    if(new Set(descriptions).size!==descriptions.length) throw new Error("Deux nouvelles places utilisent la même description.");
    const gtfsStopIds=new Set(state.gtfsStops.map(stop=>normalize(stop.stop_id).toUpperCase()).filter(Boolean));
    for(const code of newCodes)if(gtfsStopIds.has(code))throw new Error(`Le code de place ${code} est déjà utilisé comme stop_id dans le GTFS.`);
  }
  for(const code of newCodes) if(existingPlaceCodes.has(code)) throw new Error(`La place ${code} existe déjà dans HASTUS.`);
  const placeRows=new Map(); const report=[]; const creations=new Map();
  for(const d of state.decisions.filter(x=>x.status!=="error")){
    const p=resolvedPlace(d); if(!p) continue;
    let parentId=p.id;
    const collision=byId.get(parentId);
    if(collision && normalize(collision.location_type)!=="1") {
      const base=`${isGeographicNew()?"GTFS":"HASTUS"}_PLACE_${p.id}`; parentId=base; let suffix=2;
      while(byId.has(parentId)||placeRows.has(parentId)) parentId=`${base}_${suffix++}`;
    }
    const stop=byId.get(d.id); if(stop) stop.parent_station=parentId;
    report.push({original_stop_id:d.originalId,stop_id:d.id,stop_description:d.description,decision:p.isNew?"CREER_PLACE":(d.source==="existing"?"PLACE_EXISTANTE":"PLACE_PROCHE"),place_id:p.id,place_description:p.description,distance_m:p.isNew?"":Math.round(d.candidates.find(x=>x.id===p.id)?.distance??0)});
    if(p.isNew&&!creations.has(p.id)){
      const groupedStops=isGeographicNew()?state.groups.find(g=>g.id===d.groupId)?.items||[]:[d];
      creations.set(p.id,{place_id:p.id,place_description:p.description,stop_ids:groupedStops.map(stop=>stop.id).join(";"),stop_descriptions:groupedStops.map(stop=>normalize(stop.description)).join(";"),stop_lat:p.lat,stop_lon:p.lon});
    }
    if(!byId.has(parentId)&&!placeRows.has(parentId)){
      const nr=Object.fromEntries(headers.map(h=>[h,""])); nr.stop_id=parentId; nr.stop_name=p.description; nr.stop_lat=p.lat; nr.stop_lon=p.lon; nr.location_type="1"; nr.parent_station=""; placeRows.set(parentId,nr);
    }
  }
  rows.push(...placeRows.values());
  return {gtfs:toCSV(headers,rows),times:toCSV(timeHeaders,timeRows),report:toCSV(["original_stop_id","stop_id","stop_description","decision","place_id","place_description","distance_m"],report),creations:toCSV(["place_id","place_description","stop_ids","stop_descriptions","stop_lat","stop_lon"],[...creations.values()])};
}
function download(name,text,type="text/csv"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:`${type};charset=utf-8`}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function exportFile(kind,name){try{download(name,buildExports()[kind]);}catch(e){alert(e.message);}}
function exportCollisions(){download("correspondance_stop_id_hastus_gtfs.csv",toCSV(["old_stop_id","new_stop_id","stop_code","stop_name","hastus_description"],state.collisions));}

const decisionList=$("decision-list");
let activeMapDrag=null,wheelPanFrame=0,wheelPanRequest=null,lastWheelZoomAt=0;
decisionList.addEventListener("pointerdown",event=>{
  const svg=event.target.closest("svg.interactive-map");
  if(!svg||event.button!==0)return;
  const rect=svg.getBoundingClientRect(),current=state.mapPans.get(svg.dataset.routeId)||{x:0,y:0};
  activeMapDrag={svg,layer:svg.querySelector(".map-movable"),routeId:svg.dataset.routeId,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,origin:current,dx:0,dy:0,scaleX:1000/rect.width,scaleY:560/rect.height};
  svg.setPointerCapture?.(event.pointerId);svg.classList.add("dragging");event.preventDefault();
});
decisionList.addEventListener("pointermove",event=>{
  if(!activeMapDrag||event.pointerId!==activeMapDrag.pointerId)return;
  activeMapDrag.dx=(event.clientX-activeMapDrag.startX)*activeMapDrag.scaleX;
  activeMapDrag.dy=(event.clientY-activeMapDrag.startY)*activeMapDrag.scaleY;
  activeMapDrag.layer?.setAttribute("transform",`translate(${activeMapDrag.dx} ${activeMapDrag.dy})`);
  event.preventDefault();
});
function finishMapDrag(event){
  if(!activeMapDrag||event.pointerId!==activeMapDrag.pointerId)return;
  const drag=activeMapDrag;activeMapDrag=null;
  drag.svg.classList.remove("dragging");
  state.mapPans.set(drag.routeId,{x:drag.origin.x+drag.dx,y:drag.origin.y+drag.dy});render();
}
decisionList.addEventListener("pointerup",finishMapDrag);
decisionList.addEventListener("pointercancel",finishMapDrag);
decisionList.addEventListener("wheel",event=>{
  const svg=event.target.closest("svg.interactive-map");if(!svg)return;
  event.preventDefault();
  const absX=Math.abs(event.deltaX),absY=Math.abs(event.deltaY),mouseWheel=event.deltaMode!==0||(absY>=50&&absX<5);
  if(event.ctrlKey||mouseWheel){
    const now=performance.now();if(now-lastWheelZoomAt<110)return;lastWheelZoomAt=now;
    window.zoomRouteMap(svg.dataset.routeId,event.deltaY>0?-1:1);return;
  }
  const rect=svg.getBoundingClientRect(),scaleX=1000/rect.width,scaleY=560/rect.height;
  if(!wheelPanRequest||wheelPanRequest.routeId!==svg.dataset.routeId)wheelPanRequest={routeId:svg.dataset.routeId,x:0,y:0};
  wheelPanRequest.x-=event.deltaX*scaleX;wheelPanRequest.y-=event.deltaY*scaleY;
  if(!wheelPanFrame)wheelPanFrame=requestAnimationFrame(()=>{const request=wheelPanRequest;wheelPanFrame=0;wheelPanRequest=null;if(!request)return;const current=state.mapPans.get(request.routeId)||{x:0,y:0};state.mapPans.set(request.routeId,{x:current.x+request.x,y:current.y+request.y});render();});
},{passive:false});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&state.fullscreenMapId){state.fullscreenMapId=null;render();}});

function updateWorkspaceOpenButton(){const value=$("workspace-choice").value;$("workspace-open").textContent=value==="new"?"Choisir le dossier parent":value==="browser"?"Activer":value==="open"?"Choisir le dossier":value==="browser-restore"?"Reprendre":"Ouvrir";$("workspace-forget").disabled=!(value==="browser-restore"||value.startsWith("recent:"));}
$("workspace-choice").addEventListener("change",updateWorkspaceOpenButton);
$("workspace-open").addEventListener("click",async()=>{
  try{
    const choice=$("workspace-choice").value;
    if(choice==="new")await createLocalWorkspace();
    else if(choice==="open")await openLocalWorkspace();
    else if(choice==="browser"){
      state.workspace={id:"browser-latest",name:"Sauvegarde navigateur",handle:null,mode:"browser",lastSaved:null,dirty:false};$("workspace-save").disabled=false;workspaceStatus("ready","Sauvegarde navigateur activée","L’état sera conservé automatiquement dans ce navigateur.");if(state.parsed.stops)await quickSave(true);
    }else if(choice==="browser-restore"){
      const record=(await workspaceRecords()).find(item=>item.id==="browser-latest");if(!record?.snapshot)throw new Error("La sauvegarde navigateur est introuvable.");state.workspace={id:"browser-latest",name:"Sauvegarde navigateur",handle:null,mode:"browser",lastSaved:record.snapshot.savedAt||null,dirty:false};restoreWorkspaceSnapshot(record.snapshot);$("workspace-save").disabled=false;workspaceStatus("ready","Sauvegarde navigateur reprise",`Dernière sauvegarde : ${new Date(record.snapshot.savedAt).toLocaleString("fr-CA")}`);
    }else if(choice.startsWith("recent:")){
      const id=choice.slice(7),record=(await workspaceRecords()).find(item=>item.id===id);if(!record)throw new Error("Cet espace récent est introuvable.");await openLocalWorkspace(record);
    }
  }catch(error){if(error.name!=="AbortError"){workspaceStatus("error","Impossible d’ouvrir l’espace",error.message);alert(error.message);}}
});
$("workspace-save").addEventListener("click",()=>quickSave(true));
$("workspace-forget").addEventListener("click",async()=>{const value=$("workspace-choice").value,id=value==="browser-restore"?"browser-latest":value.startsWith("recent:")?value.slice(7):"";if(!id)return;await deleteWorkspaceRecord(id);if(state.workspace.id===id){state.workspace={id:null,name:"",handle:null,mode:"none",lastSaved:null,dirty:false};$("workspace-save").disabled=true;}$("workspace-choice").value="new";await refreshWorkspaceChoices();updateWorkspaceOpenButton();workspaceStatus("","Entrée retirée des espaces récents","Aucun fichier local n’a été supprimé.");});
$("genz-theme").checked=localStorage.getItem("hastus-genz-theme")==="1";document.body.classList.toggle("genz-theme",$("genz-theme").checked);
if(location.protocol==="file:")$("local-file-warning").classList.remove("hidden");
refreshWorkspaceChoices().then(updateWorkspaceOpenButton);
refreshWorkingTimetableAccess();
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"&&state.workspace.mode!=="none")quickSave(false);});
document.addEventListener("fullscreenchange",()=>{if(!document.fullscreenElement&&state.conflictResolutionFullscreen){state.conflictResolutionFullscreen=false;document.body.classList.remove("conflict-resolution-fullscreen");refreshRadiusConflictSummary();}});
document.addEventListener("wheel",event=>{const svg=event.target.closest?.("svg[data-conflict-map]");if(!svg)return;event.preventDefault();const rect=svg.getBoundingClientRect(),anchorX=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),anchorY=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));zoomConflictMapElement(svg,event.deltaY<0?1:-1,anchorX,anchorY);},{passive:false});
let conflictMapDrag=null;
document.addEventListener("pointerdown",event=>{const svg=event.target.closest?.("svg[data-conflict-map]");if(!svg||event.button!==0)return;conflictMapDrag={svg,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,view:readConflictMapView(svg)};svg.setPointerCapture?.(event.pointerId);svg.classList.add("dragging");});
document.addEventListener("pointermove",event=>{if(!conflictMapDrag||event.pointerId!==conflictMapDrag.pointerId)return;event.preventDefault();const {svg,startX,startY,view}=conflictMapDrag,rect=svg.getBoundingClientRect();updateConflictMapView(svg,{...view,x:view.x-(event.clientX-startX)*view.width/rect.width,y:view.y-(event.clientY-startY)*view.height/rect.height});});
function finishConflictMapDrag(event){if(!conflictMapDrag||event.pointerId!==conflictMapDrag.pointerId)return;conflictMapDrag.svg.classList.remove("dragging");conflictMapDrag=null;}
document.addEventListener("pointerup",finishConflictMapDrag);document.addEventListener("pointercancel",finishConflictMapDrag);
document.addEventListener("keydown",event=>{const svg=event.target.closest?.("svg[data-conflict-map]");if(!svg)return;const actions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(actions[event.key]){event.preventDefault();const [dx,dy]=actions[event.key];window.panConflictMap(svg.id,dx,dy);}else if(event.key==="+"||event.key==="="){event.preventDefault();window.zoomConflictMap(svg.id,1);}else if(event.key==="-"){event.preventDefault();window.zoomConflictMap(svg.id,-1);}else if(event.key==="0"){event.preventDefault();window.resetConflictMap(svg.id);}});

["stops","times","hastus","routes","trips","shapes"].forEach(kind=>$(kind==="times"?"times-file":`${kind}-file`).addEventListener("change",e=>loadFile(kind,e.target)));
$("gtfs-zip").addEventListener("change",e=>loadCompleteGtfs(e.target));
$("gtfs-folder").addEventListener("change",e=>loadCompleteGtfs(e.target));
document.querySelectorAll(".mode-card").forEach(card=>card.addEventListener("click",()=>setMode(card.dataset.mode)));
$("geographic-client-type").addEventListener("change",event=>setGeographicClientType(event.target.value));
$("back-to-new-client").addEventListener("click",()=>setGeographicClientType("new"));
$("radius").addEventListener("input",event=>{
  $("radius-output").textContent=`${event.target.value} m`;
  if(state.mode==="geographic"&&state.geographicReady){state.geographicNeedsRegroup=true;$("analyze").innerHTML=`Regrouper avec un rayon de ${event.target.value} m <span>→</span>`;$("analyze").classList.remove("hidden");captureGeographicState();queueQuickSave();}
});
$("smart-radius").addEventListener("change",event=>{if(event.target.checked&&!state.parsed.trips){event.target.checked=false;alert("trips.txt est requis pour activer le rayon intelligent.");return;}if(state.mode==="geographic"&&state.geographicReady){state.geographicNeedsRegroup=true;$("analyze").innerHTML=`Recalculer avec le rayon ${event.target.checked?'intelligent':'manuel'} <span>→</span>`;$("analyze").classList.remove("hidden");captureGeographicState();}queueQuickSave();});
$("genz-theme").addEventListener("change",event=>{document.body.classList.toggle("genz-theme",event.target.checked);localStorage.setItem("hastus-genz-theme",event.target.checked?"1":"0");queueQuickSave();});
$("map-label-mode").addEventListener("change",e=>{state.mapLabelMode=e.target.value;if(state.mode==="maps"&&state.routeMaps.length)render();});
$("analyze").addEventListener("click",analyze);
document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.filter=b.dataset.filter;render();}));
$("download-gtfs").addEventListener("click",()=>exportFile("gtfs","stops_enrichi.txt"));
$("download-times").addEventListener("click",()=>exportFile("times","stop_times_enrichi.txt"));
$("download-report").addEventListener("click",()=>exportFile("report","rapport_affectations.csv"));
$("download-places").addEventListener("click",()=>exportFile("creations","places_a_creer.csv"));
$("download-collisions").addEventListener("click",exportCollisions);

const SEARCH_UNIT_SELECTOR=".group-card,.decision,.radius-conflict-item,.combined-conflict-group,.route-map-card,.pamphlet-card,.timetable-card";
function normalizedSearchText(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();}
function globalSearchUnits(scope){const selectors={all:SEARCH_UNIT_SELECTOR,stops:".group-card,.decision,.radius-conflict-item",places:".group-card,.decision,.combined-conflict-group",conflicts:".radius-conflict-item,.combined-conflict-group",routes:".route-map-card,.pamphlet-card,.timetable-card"};return [...new Set(document.querySelectorAll(selectors[scope]||SEARCH_UNIT_SELECTOR))];}
function globalSearchContent(unit,scope){if(unit.classList.contains("group-card")){const selectors=scope==="stops"?[".group-stop"]:scope==="places"?[".group-head",".group-fields>label:not(.proposal-list)"]:[".group-head",".group-fields>label:not(.proposal-list)",".group-stop"],nodes=selectors.flatMap(selector=>[...unit.querySelectorAll(selector)]);return nodes.map(node=>`${node.textContent} ${[...node.querySelectorAll("input,select")].map(field=>field.value).join(" ")}`).join(" ");}return `${unit.textContent} ${[...unit.querySelectorAll("input,select")].map(field=>field.value).join(" ")}`;}
function applyGlobalSearch(){const input=$("global-search-input"),scope=$("global-search-scope").value,query=normalizedSearchText(input.value.trim());document.querySelectorAll(SEARCH_UNIT_SELECTOR).forEach(item=>item.classList.remove("nav-search-hidden","nav-search-match"));if(!query){$("global-search-count").textContent="";return;}const units=globalSearchUnits(scope);let matches=0;for(const unit of units){const match=normalizedSearchText(globalSearchContent(unit,scope)).includes(query);unit.classList.toggle("nav-search-hidden",!match);unit.classList.toggle("nav-search-match",match);if(match)matches++;}$("global-search-count").textContent=`${matches} résultat${matches>1?'s':''}`;}
function navigationTarget(name){if(name==="top")return document.body;if(name==="bottom")return document.querySelector("footer");return $(name);}
function refreshNavigationDock(){for(const button of document.querySelectorAll("[data-nav-target]")){const name=button.dataset.navTarget,target=navigationTarget(name),available=Boolean(target)&&(name==="top"||name==="bottom"||!target.closest(".hidden"));button.disabled=!available;}}
window.navigateToSection=name=>{const target=navigationTarget(name);if(!target||target.closest(".hidden"))return;if(name==="top")window.scrollTo({top:0,behavior:"smooth"});else if(name==="bottom")window.scrollTo({top:document.documentElement.scrollHeight,behavior:"smooth"});else{target.scrollIntoView({behavior:"smooth",block:"start"});target.classList.add("nav-target-flash");setTimeout(()=>target.classList.remove("nav-target-flash"),1200);}};
document.querySelectorAll("[data-nav-target]").forEach(button=>button.addEventListener("click",()=>window.navigateToSection(button.dataset.navTarget)));
$("global-search-input").addEventListener("input",applyGlobalSearch);$("global-search-scope").addEventListener("change",applyGlobalSearch);$("global-search-clear").addEventListener("click",()=>{$("global-search-input").value="";applyGlobalSearch();$("global-search-input").focus();});
document.addEventListener("keydown",event=>{const editing=/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);if(event.key==="/"&&!editing){event.preventDefault();$("global-search-input").focus();}else if(event.key==="Escape"&&document.activeElement===$("global-search-input")){$("global-search-input").value="";applyGlobalSearch();$("global-search-input").blur();}});
let navigationRefreshQueued=false;new MutationObserver(()=>{if(navigationRefreshQueued)return;navigationRefreshQueued=true;requestAnimationFrame(()=>{navigationRefreshQueued=false;refreshNavigationDock();if($("global-search-input").value)applyGlobalSearch();});}).observe(document.querySelector("main"),{childList:true,subtree:true});
refreshNavigationDock();
