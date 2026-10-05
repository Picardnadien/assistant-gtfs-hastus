"use strict";
function schedulingUnitsText(fr,en){return $("app-language")?.value==="en"?en:fr;}
function schedulingUnitsBuild(table,key="route_id",descriptionMode="route"){
  if(!["route_id","route_short_name"].includes(key))throw new Error("Invalid route key");
  if(!table?.headers?.includes("route_id")||!table.headers.includes(key)||!table.rows.length)throw new Error(schedulingUnitsText("Chargez un routes.txt contenant la colonne choisie et au moins une route.","Load a routes.txt with the selected column and at least one route."));
  const seenRoutes=new Set(),seenUnits=new Set(),rows=[];
  for(const [index,row] of table.rows.entries()){
    const route=String(row.route_id??"").trim(),id=String(row[key]??"").trim();
    if(!route||!id)throw new Error(schedulingUnitsText(`Ligne ${index+2} : identifiant de route manquant.`,`Row ${index+2}: missing route identifier.`));
    if(seenRoutes.has(route)||seenUnits.has(id.toUpperCase()))throw new Error(schedulingUnitsText(`Identifiant dupliqué : ${id}. Choisissez une clé unique pour éviter de fusionner des routes.`,`Duplicate identifier: ${id}. Choose a unique key to avoid merging routes.`));
    // The supplied OIR declares only a comma separator, no escaping convention.
    // Reject ambiguous fields instead of assuming support for quoted CSV values.
    const description=descriptionMode==="long"?(String(row.route_long_name??"").trim()||`Route ${id}`):`Route ${id}`;
    if([id,description].some(value=>/[,"\r\n\x00]/.test(value)))throw new Error(schedulingUnitsText(`Route ${id} : virgule, guillemet ou saut de ligne incompatible avec le modèle OIR. Utilisez « Route + identifiant » ou corrigez la source.`,`Route ${id}: comma, quote or line break is not supported by this OIR template. Use “Route + identifier” or correct the source.`));
    seenRoutes.add(route);seenUnits.add(id.toUpperCase());rows.push({id,description,route:id});
  }
  rows.sort((a,b)=>a.id.localeCompare(b.id,"en",{numeric:true}));
  const text="keyword,scu_identifier,scu_description,scu_type,scu_route_ids\r\n"+rows.map(row=>`scheduling_unit,${row.id},${row.description},1100,${row.route}`).join("\r\n")+"\r\n";
  return {rows,text,key};
}
function schedulingUnitsTable(){return $("scu-source").value==='file'?schedulingStandaloneRoutes:state.parsed.routes;}
function schedulingUnitsSelection(){return schedulingUnitsBuild(schedulingUnitsTable(),$("scu-route-key").value,$("scu-description").value);}
function refreshSchedulingUnits(){
  const status=$("scu-status");if(!status)return;
  try{const result=schedulingUnitsSelection();status.textContent=schedulingUnitsText(`${result.rows.length} scheduling units · clé ${result.key}`,`${result.rows.length} scheduling units · key ${result.key}`);$("scu-preview").textContent=result.text.split('\r\n').slice(0,7).join('\n');$("scu-save").disabled=schedulingExportInProgress;$("scu-download").disabled=schedulingExportInProgress;}
  catch(error){status.textContent=error.message;$("scu-preview").textContent="";$("scu-save").disabled=true;$("scu-download").disabled=true;}
}
async function schedulingUnitsFiles(result=schedulingUnitsSelection()){
  const response=await fetch(new URL("assets/scheduling%20units.oir",location.href));
  if(!response.ok)throw new Error(schedulingUnitsText("Le script d’import OIR est introuvable.","The OIR import script is unavailable."));
  const bytes=new Uint8Array(await response.arrayBuffer());
  return [{name:"sched_unit_to_import.txt",text:result.text},{name:"scheduling units.oir",bytes}];
}
function schedulingUnitsArchive(originals,imports){
  const reserved=new Set(imports.map(f=>f.name.toLowerCase())),names=new Set(),entries=[];
  for(const entry of originals){
    const name=String(entry.name).replaceAll('\\','/');
    if(!name||name.startsWith('/')||name.split('/').some(p=>p==='..'||p==='.'||!p)||/[\x00-\x1f:]/.test(name))throw new Error('Invalid GTFS file path');
    if(name.toLowerCase().startsWith('hastus_import/')&&reserved.has(name.split('/').pop().toLowerCase()))continue;
    // Older workspace imports flattened subfolders. Do not copy obsolete import
    // files beside GTFS tables when adding a new, explicitly generated version.
    if(!name.includes('/')&&reserved.has(name.toLowerCase()))continue;
    if(names.has(name.toLowerCase()))throw new Error('Duplicate GTFS file name');
    names.add(name.toLowerCase());entries.push({...entry,name});
  }
  for(const file of imports)entries.push({...file,name:`hastus_import/${file.name}`});
  return entries;
}
async function exportSchedulingUnits(destination){
  if(schedulingExportInProgress)return;
  schedulingExportInProgress=true;$("scu-save").disabled=true;$("scu-download").disabled=true;
  try{
    // Capture the chosen dataset and settings before the picker/fetch awaits.
    const table=schedulingUnitsTable(),key=$("scu-route-key").value,mode=$("scu-description").value;
    const result=schedulingUnitsBuild(table,key,mode),full=$("scu-source").value==='gtfs'&&state.originalEntries.length;
    const originals=full?[...state.originalEntries]:[{name:'routes.txt',text:toCSV(table.headers,table.rows)}];
    let directory=null;
    if(destination==='folder'){
      if(typeof window.showDirectoryPicker!=="function")throw new Error(schedulingUnitsText("Ce navigateur ne permet pas l’écriture dans un dossier. Téléchargez le ZIP.","This browser cannot write to a folder. Download the ZIP instead."));
      // Picker must be called before asynchronous work to retain user activation.
      directory=await window.showDirectoryPicker({mode:'readwrite'});
    }
    const files=await schedulingUnitsFiles(result);
    if(directory){
      // Verify the destination is the selected GTFS, not a similarly named project.
      const handle=await directory.getFileHandle('routes.txt');
      const destinationTable=parseCSV(await (await handle.getFile()).text());
      if(schedulingUnitsBuild(destinationTable,key,mode).text!==files[0].text)throw new Error(schedulingUnitsText("Le routes.txt de ce dossier diffère des routes chargées. Sélectionnez le bon dossier GTFS.","This folder's routes.txt differs from the loaded routes. Select the matching GTFS folder."));
      const folder=await directory.getDirectoryHandle('hastus_import',{create:true});
      let exists=false;for(const file of files)try{await folder.getFileHandle(file.name);exists=true;}catch(error){if(error.name!=='NotFoundError')throw error;}
      if(exists&&!confirm(schedulingUnitsText("Remplacer les deux fichiers scheduling units dans hastus_import ?","Replace the two scheduling unit files in hastus_import?")))return;
      for(const file of files){
        const handle=await folder.getFileHandle(file.name,{create:true}),writer=await handle.createWritable();
        try{await writer.write(file.bytes||file.text);await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}
      }
      $("scu-status").textContent=schedulingUnitsText(`Fichiers enregistrés dans ${directory.name}/hastus_import.`,`Files saved in ${directory.name}/hastus_import.`);
    }else{
      const bytes=reportPackageTools().zip(schedulingUnitsArchive(originals,files),{allowPaths:true});
      download(full?'GTFS_with_scheduling_units.zip':'routes_and_scheduling_units.zip',bytes,'application/zip');
      $("scu-status").textContent=schedulingUnitsText("ZIP créé : données sources conservées, fichiers d’import dans hastus_import/.","ZIP created: source data preserved, import files in hastus_import/.");
    }
  }catch(error){if(error.name!=='AbortError'){$("scu-status").textContent=error.message;alert(error.message);}}
  finally{schedulingExportInProgress=false;let valid=true;try{schedulingUnitsSelection();}catch{valid=false;}$("scu-save").disabled=!valid;$("scu-download").disabled=!valid;}
}
function initSchedulingUnits(){
  $("scu-routes-file").addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      const text=await file.text(),table=parseCSV(text);schedulingUnitsBuild(table);
      // A standalone route file is separate from the working GTFS to prevent a
      // route-only upload from invalidating trips or the full GTFS export.
      schedulingStandaloneRoutes=table;$("scu-source").value='file';refreshSchedulingUnits();
    }catch(error){alert(error.message);}
  });
  for(const id of ['scu-route-key','scu-description','scu-source'])$(id).addEventListener('change',refreshSchedulingUnits);
  $("scu-save").addEventListener('click',()=>exportSchedulingUnits('folder'));
  $("scu-download").addEventListener('click',()=>exportSchedulingUnits('zip'));
  refreshSchedulingUnits();
}
let schedulingStandaloneRoutes=null;
let schedulingExportInProgress=false;
