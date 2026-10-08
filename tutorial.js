/* Local, read-only guide: opening it never changes the loaded project. */
const TutorialGuide={
  fr:{title:'Tutoriel',intro:'De vos données à un réseau prêt à valider.',close:'Fermer',previous:'Précédent',next:'Suivant',finish:'Terminer',contents:'Parcours du tutoriel',step:'Étape',of:'sur',
    steps:[
      {title:'Charger et protéger vos données',lead:'Commencez par choisir la langue, puis votre source de données.',items:[
        'GTFS : chargez le ZIP complet ou son dossier extrait. Les cartes et les horaires utilisent notamment les fichiers stops, trips, stop_times, routes et le calendrier.',
        'Sans GTFS : choisissez « Versions de routes + liste de stops HASTUS ». Les versions identifient les timing points ; la liste apporte les coordonnées et les associations aux places.',
        'Choisissez un espace de travail local pour conserver les originaux et reprendre votre projet. Le navigateur vous demandera l’autorisation d’accéder au dossier.'
      ],note:'Lancez l’outil avec launch_windows.bat (Windows) ou launch.command (Mac), plutôt qu’en ouvrant index.html directement.'},
      {title:'Regrouper les arrêts proches',lead:'Contexte 01 · Regroupement géographique, pour un nouveau client.',items:[
        'Vérifiez les colonnes reconnues et la source des timing points. Réglez le rayon avec le curseur ou la saisie manuelle, de 0 à 1 000 m (200 m par défaut).',
        'Choisissez des codes de place de 6 ou 8 caractères et leur casse. La renumérotation des stop_id reste facultative : conservez les identifiants existants si nécessaire.',
        'Lancez le regroupement, puis vérifiez chaque carte, le code, la description et les stops associés. Vous pouvez modifier le rayon individuellement.',
        'Si un stop sort du rayon, utilisez son menu d’affectation. Si aucune autre place ne peut l’inclure, le bouton de création permet de générer une place pour ce stop uniquement.',
        'Annuler / Rétablir concerne le code et la description de chaque place, pas le rayon ni les affectations. Cet historique est limité à la session.'
      ],note:'La proximité géographique ne suffit pas à valider un regroupement : vérifiez le sens de circulation et les manœuvres aux débuts et fins de voyages.'},
      {title:'Analyser un client existant',lead:'Contexte 01 · Utilisez les associations HASTUS déjà en place.',items:[
        'Choisissez le parcours client existant et chargez la liste des stops et places, avec les places de référence si disponibles. Vérifiez la correspondance des colonnes.',
        'Examinez les rattachements suggérés et les références suspectes. Le rayon de proximité et le seuil d’alerte des références ont des rôles différents.',
        'Contrôlez les stops qui possèdent une place sans être utilisés comme timing points dans la source retenue.',
        'Le rapport HTML « Diagnostic HASTUS » classe les places par type de validation et présente les références suspectes. Il est en consultation seule.'
      ],note:'Un stop absent de la liste des timing points n’est pas nécessairement inutilisé. Confirmez son rôle avant de supprimer une association.'},
      {title:'Consulter les cartes et timetables',lead:'Contexte 02 · Explorer le réseau et ses horaires.',items:[
        'Choisissez le workflow 02 Cartes des routes et timetables. Utilisez le GTFS chargé ou working/stops.txt quand des places y sont affectées. Les shapes donnent les tracés ; sans shapes, les stops restent visibles.',
        'Le rapport réseau est séparé de la validation des places. Sélectionnez une date de service, une route et une direction, ou les deux directions.',
        'Ouvrez la section Timetable d’une route pour charger sa grille. Les variantes sont réunies, avec les codes de place, les headways et le choix AM/PM ou Military (24 h).',
        'Les boutons Excel et PDF exportent les horaires selon les filtres choisis. Vérifiez la date et les timing points avant de transmettre le document.'
      ],note:'Une carte de route représente l’ensemble de ses tracés : elle ne varie pas selon la date du calendrier.'},
      {title:'Choisir les journées à importer',lead:'Contexte 03 · Comparaison des horaires.',items:[
        'Analysez les types de service et les journées représentatives proposées à partir du calendrier GTFS et de ses exceptions.',
        'Repérez les différences au sein de la semaine. Par exemple, un mercredi différent du lundi nécessite sa propre journée représentative.',
        'Cliquez sur « Voir cette journée » pour consulter le nombre de voyages par route. Le bouton PDF de chaque route ouvre sa timetable dans les deux directions.',
        'Utilisez les dates proposées pour préparer vos imports dans HASTUS, puis confirmez qu’elles couvrent la période et les exceptions souhaitées.'
      ],note:'Le même nombre de voyages ne garantit pas les mêmes horaires. L’outil compare le service ; il ne lance pas l’import dans HASTUS.'},
      {title:'Préparer la validation client',lead:'Partagez un rapport adapté au travail attendu.',items:[
        'Ouvrez le workflow 05 Rapports et exports après l’analyse géographique. Choisissez la langue, les logos, l’orientation du PDF et le thème du HTML. La langue suit celle de l’interface par défaut.',
        'Le PDF présente les places avec leurs stops et les cartes. Le HTML facilite la navigation et, pour le rapport de validation éditable, les changements de code, description et affectation.',
        'Cartes en ligne : une connexion reste nécessaire. Cartes hors ligne : générez les images pendant que vous êtes connecté, puis vérifiez le rapport avant de l’envoyer.',
        'Dans le rapport éditable, l’enregistrement direct nécessite un navigateur compatible et le choix explicite d’un fichier. Sans cette possibilité, utilisez la copie téléchargée.',
        'Pour le retour client, utilisez l’archive contenant le rapport mis à jour, le GTFS complet et le compte rendu avant/après. Vous pouvez masquer les exports de fichiers individuels à la génération.'
      ],note:'Le diagnostic HASTUS et le rapport réseau sont en consultation seule ; ne les confondez pas avec le rapport de validation éditable.'},
      {title:'Sauvegarder et finaliser',lead:'Gardez une trace de vos décisions avant l’import.',items:[
        'Vérifiez le statut de sauvegarde. Si une sauvegarde est interrompue, corrigez le problème ou téléchargez un export avant de fermer le navigateur.',
        'Corrigez les codes en double, les descriptions manquantes et les autres erreurs signalées avant d’exporter les données finalisées.',
        'Le workflow 04 Scheduling units produit un import à partir de routes.txt, avec route_id par défaut ou route_short_name au choix, ainsi qu’une copie du script OIR.',
        'Attention : l’archive Scheduling units conserve le GTFS source, sans appliquer les corrections de places. Elle ne remplace pas l’export du GTFS finalisé.',
        'Relisez le compte rendu client et contrôlez les fichiers avant de les importer dans HASTUS. L’outil n’écrit jamais directement dans HASTUS.'
      ],note:'Vous pouvez rouvrir ce tutoriel à tout moment : il ne modifie pas votre projet.'}
    ]},
  en:{title:'Tutorial',intro:'From your source data to a network ready for review.',close:'Close',previous:'Previous',next:'Next',finish:'Finish',contents:'Tutorial contents',step:'Step',of:'of',
    steps:[
      {title:'Load and protect your data',lead:'Choose your interface language, then your data source.',items:[
        'GTFS: load the complete ZIP or its extracted folder. Maps and schedules use stops, trips, stop_times, routes and calendar data.',
        'Without GTFS: choose “Route versions + HASTUS stop list”. Route versions identify timing points; the stop list supplies coordinates and place assignments.',
        'Choose a local workspace to preserve originals and resume your project. Your browser will ask for permission to access the folder.'
      ],note:'Start the tool with launch_windows.bat (Windows) or launch.command (Mac), instead of opening index.html directly.'},
      {title:'Group nearby stops',lead:'Context 01 · Geographic grouping for a new client.',items:[
        'Check the mapped columns and timing-point source. Set a radius with the slider or numeric field, from 0 to 1,000 m (200 m by default).',
        'Choose 6- or 8-character place codes and their letter case. Renumbering stop_id values is optional: keep the original IDs when required.',
        'Run grouping, then review each map, place code, description and assigned stops. You can adjust each place’s radius individually.',
        'If a stop falls outside the radius, use its assignment menu. If no other place can include it, create a new place for that stop only.',
        'Undo / Redo applies to each place’s code and description, not its radius or stop assignments. This history lasts for the current session.'
      ],note:'Proximity alone does not justify grouping: check vehicle orientation and manoeuvres at trip starts and ends.'},
      {title:'Review an existing client',lead:'Context 01 · Work with existing HASTUS assignments.',items:[
        'Choose the existing-client workflow and load the stop and place list, including reference places when available. Check the column mapping.',
        'Review suggested assignments and suspicious references. The proximity radius and reference warning threshold serve different purposes.',
        'Check stops that have a place but are not used as timing points in the selected source.',
        'The “HASTUS diagnostic” HTML report groups places by validation type and shows suspicious references. It is read-only.'
      ],note:'A stop missing from the timing-point list is not necessarily unused. Confirm its role before removing an assignment.'},
      {title:'Explore maps and timetables',lead:'Context 02 · Explore the network and its schedules.',items:[
        'Choose workflow 02 Route maps and timetables. Use the loaded GTFS or working/stops.txt once places have been assigned. Shapes provide route geometry; without shapes, stops can still be displayed.',
        'The network report is separate from place validation. Select a service date, route and direction, or both directions.',
        'Open a route’s Timetable section to load its grid. Patterns are combined, with place codes, headways and an AM/PM or Military (24-hour) switch.',
        'Excel and PDF exports follow the selected filters. Check the date and timing points before sharing the document.'
      ],note:'A route map shows all its geometry: it does not change with the calendar date.'},
      {title:'Choose dates to import',lead:'Context 03 · Compare schedules.',items:[
        'Review service types and representative dates suggested from the GTFS calendar and its exceptions.',
        'Look for differences within the week. For example, a Wednesday service that differs from Monday needs its own representative date.',
        'Click “View this day” to see trip counts by route. Each route’s PDF button opens its two-direction timetable.',
        'Use the suggested dates to plan HASTUS imports, then confirm that they cover the intended period and exceptions.'
      ],note:'Equal trip counts do not guarantee identical schedules. The tool compares service; it does not run the HASTUS import.'},
      {title:'Prepare client validation',lead:'Choose a report suited to the review task.',items:[
        'Open workflow 05 Reports and exports after geographic analysis. Choose the language, logos, PDF orientation and HTML theme. Report language follows the interface by default.',
        'PDF presents places, stops and maps. HTML makes navigation easier and, in the editable validation report, allows code, description and assignment changes.',
        'Online maps still need a connection. For offline maps, generate the images while connected and check the report before sharing it.',
        'Direct saving in the editable report requires a compatible browser and explicit file selection. Otherwise, use the downloaded-copy option.',
        'For client feedback, use the archive containing the updated report, complete GTFS and before/after change summary. Individual-file exports can be hidden when generating the report.'
      ],note:'The HASTUS diagnostic and network reports are read-only; they are different from the editable validation report.'},
      {title:'Save and finalize',lead:'Keep a record of your decisions before importing.',items:[
        'Check the save status. If saving is interrupted, resolve the issue or download an export before closing your browser.',
        'Resolve duplicate codes, missing descriptions and other reported errors before exporting finalized data.',
        'Workflow 04 Scheduling units generates an import from routes.txt, using route_id by default or route_short_name, plus a copy of the OIR script.',
        'Important: the Scheduling units archive preserves the source GTFS without applying place corrections. It does not replace the finalized GTFS export.',
        'Review client changes and check the files before importing them into HASTUS. The tool never writes directly to HASTUS.'
      ],note:'You can reopen this tutorial at any time: it does not change your project.'}
    ]}
};
function tutorialMarkup(language,index){
  const copy=TutorialGuide[language]||TutorialGuide.fr,step=copy.steps[index];
  const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  return `<header class="tutorial-heading"><div><small>The GTFS Missing Link</small><h2 id="tutorial-title">${copy.title}</h2><p>${copy.intro}</p></div><button type="button" data-tutorial-close>${copy.close} ×</button></header><div class="tutorial-layout"><nav aria-label="${copy.contents}">${copy.steps.map((item,i)=>`<button type="button" data-tutorial-step="${i}" ${i===index?'aria-current="step"':''}><span>${i+1}</span>${esc(item.title)}</button>`).join('')}</nav><section class="tutorial-content" aria-labelledby="tutorial-step-title"><p class="tutorial-progress">${copy.step} ${index+1} ${copy.of} ${copy.steps.length}</p><h3 id="tutorial-step-title" tabindex="-1">${esc(step.title)}</h3><p class="tutorial-lead">${esc(step.lead)}</p><ol>${step.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ol><aside class="tutorial-note">${esc(step.note)}</aside><footer><button type="button" data-tutorial-prev ${index===0?'disabled':''}>← ${copy.previous}</button><button type="button" data-tutorial-next>${index===copy.steps.length-1?copy.finish:copy.next+' →'}</button></footer></section></div>`;
}
function initTutorial(){
  const trigger=document.getElementById('open-tutorial'),dialog=document.getElementById('tutorial-dialog'),languageSelect=document.getElementById('app-language');
  let index=0;
  const language=()=>languageSelect.value==='en'?'en':'fr';
  function draw(focus=false){dialog.lang=language();dialog.innerHTML=tutorialMarkup(language(),index);if(focus)dialog.querySelector('#tutorial-step-title').focus();}
  function sync(){trigger.textContent=TutorialGuide[language()].title;if(dialog.open)draw();}
  trigger.addEventListener('click',()=>{sync();draw();if(!dialog.open)dialog.showModal();});
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-tutorial-close')){dialog.close();return;}
    if(button.hasAttribute('data-tutorial-step'))index=Number(button.dataset.tutorialStep);
    else if(button.hasAttribute('data-tutorial-prev'))index=Math.max(0,index-1);
    else if(button.hasAttribute('data-tutorial-next')){if(index===TutorialGuide[language()].steps.length-1){dialog.close();return;}index++;}
    else return;
    draw(true);
  });
  dialog.addEventListener('close',()=>trigger.focus());
  languageSelect.addEventListener('change',sync);sync();
}
if(typeof module!=='undefined'&&module.exports)module.exports={TutorialGuide,tutorialMarkup};
