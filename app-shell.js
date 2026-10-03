/* Appearance and bilingual welcome; analysis data and report language stay independent. */
function initAppShell(){
  const english={
    'Apparence':'Appearance','Classique':'Classic','Épuré compact':'Clean compact','Langue de l’accueil':'Home language',
    'Assistant GTFS → HASTUS':'GTFS → HASTUS Assistant','Votre réseau, plus simplement.':'Your network, simplified.',
    'Rassemblez vos données. Préparez la suite dans HASTUS.':'Bring your data together. Get ready for HASTUS.',
    'Sources':'Sources','Contextes':'Tools','Analyse':'Analysis','Conflits':'Conflicts','Places / stops':'Places / stops','Export':'Export','↑ Haut':'↑ Top','Bas ↓':'Bottom ↓','Rechercher':'Search','Effacer':'Clear',
    'Toutes les données':'All data','Routes':'Routes','Places':'Places','Stops':'Stops',
    'Choisir les données à utiliser':'Let’s start with your data','SOURCE D’ANALYSE':'DATA SOURCE',
    'Le regroupement peut partir d’un GTFS ou directement des exports HASTUS.':'Start with a GTFS feed or your HASTUS exports.',
    'Charger le GTFS complet':'Load the complete GTFS feed','Le GTFS complet alimente ce contexte d’analyse.':'The complete GTFS feed provides the data for this workflow.',
    'PASSERELLE DE DONNÉES':'DATA BRIDGE','Rattacher les points horaires':'Connect timing points','sans multiplier les places.':'without multiplying places.',
    "Analyse locale d'un flux GTFS, rapprochement géographique et export contrôlé.":'Local GTFS analysis, geographic matching and controlled exports.',
    'Utiliser un GTFS':'Use a GTFS feed','Versions de routes + liste de stops HASTUS':'Route versions + HASTUS stop list',
    'ZIP ou dossier extrait. Recommandé pour un nouveau réseau ou les outils GTFS complets.':'ZIP or extracted folder. Use a complete feed for all GTFS tools.',
    'Aucun GTFS requis. Les TP viennent des versions et les coordonnées de la liste de stops.':'No GTFS required. Timing points come from route versions, coordinates from the stop list.',
    'Espace de travail local':'Your workspace','Copie les originaux, conserve les fichiers modifiés et permet de reprendre après la fermeture du navigateur.':'Preserve your original files and resume your work later.',
    'Mode de sauvegarde':'Save mode','Créer un nouvel espace local':'Create a local workspace','Ouvrir un dossier de travail existant':'Open an existing workspace','Sauvegarde dans ce navigateur uniquement':'Save in this browser only',
    'Choisir le dossier parent':'Choose a parent folder','Choisir le dossier de travail':'Choose a workspace folder','Sauvegarder maintenant':'Save now','Retirer des récents':'Remove from recent',
    'Choisir le dossier':'Choose a folder','Activer':'Activate','Reprendre':'Resume','Ouvrir':'Open','Disponible':'Available',
    'Reprendre la dernière sauvegarde navigateur':'Resume the last browser save',
    'Aucun espace local ouvert':'No local workspace open','Par défaut, un sous-dossier GTFS_HASTUS sera créé dans le dossier parent choisi.':'A GTFS_HASTUS subfolder will be created in the selected parent folder.',
    'Fichier GTFS compressé':'Your GTFS ZIP','Sélectionnez le fichier .zip complet':'Choose the complete .zip file','Dossier GTFS extrait':'Extracted GTFS folder','Sélectionnez le dossier contenant les fichiers .txt':'Choose the folder containing the .txt files','Aucun GTFS chargé':'No GTFS loaded',
    'AVANT DE COMMENCER':'YOUR TOOLS','Choisir le contexte d’import':'Choose your workflow',"Choisir le contexte d'import":'Choose your workflow',
    "Le parcours et les contrôles s'adaptent à la situation du client.":'Choose the tools that fit your client’s needs.',
    'Regroupement géographique':'Group nearby stops','Regrouper les points horaires proches, avec ou sans données HASTUS existantes.':'Group nearby timing points, with or without existing HASTUS data.',
    'Cartes des points horaires par route':'Route maps','Tracer les shapes et afficher les points horaires avec leur description.':'View routes and timing points on a map.',
    'Comparaison des horaires':'Compare schedules','Comparer les volumes quotidiens et produire des timetables de variations.':'Compare daily service levels and timetables.',
    'Timetables du dossier working':'Workspace timetables','Disponible dès qu’un parent_station est enregistré dans working/stops.txt.':'Available once places are assigned in working/stops.txt.',
    'Verrouillé':'Locked','Traitement local · originaux conservés':'Processed locally · originals preserved',
    '01 · Sources':'01 · Sources','02 · Analyse':'02 · Analysis','03 · Décisions':'03 · Decisions','04 · Export':'04 · Export',
    'La langue des rapports se choisit dans leurs options.':'Choose report language in the report options.',
    'Sauvegardez et reprenez votre projet à tout moment.':'Save your project and pick up where you left off.'
  };
  const areas=[document.querySelector('.hero'),document.getElementById('navigation-dock'),document.getElementById('feed-section'),document.getElementById('mode-section')].filter(Boolean),originals=new WeakMap();
  let language='fr',theme='classic',observer;
  function translate(){
    observer?.disconnect();
    for(const area of areas){const walker=document.createTreeWalker(area,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(['SCRIPT','STYLE'].includes(node.parentElement?.tagName)||node.parentElement?.closest('[data-no-translate]'))continue;let value=node.nodeValue,prior=originals.get(node);if(!prior||value!==prior.rendered){prior={original:value,rendered:value};originals.set(node,prior);}const key=prior.original.trim();let translated=language==='en'?english[key]:null;if(language==='en'&&!translated&&/^GTFS chargé · \d+ fichiers? reconnu/.test(key))translated='GTFS loaded · '+key.match(/\d+/)[0]+' recognized files';node.nodeValue=translated?prior.original.replace(key,translated):prior.original;prior.rendered=node.nodeValue;}}
    const search=document.getElementById('global-search-input');if(search)search.placeholder=language==='en'?'Stop, place, route, code…':'Stop, place, route, code…';
    document.getElementById('app-theme').setAttribute('aria-label',language==='en'?'Appearance':'Apparence');
    document.getElementById('app-language').setAttribute('aria-label',language==='en'?'Home language':'Langue de l’accueil');
    for(const [selector,fr,en] of [['.steps','Étapes','Steps'],['#navigation-dock','Navigation rapide et recherche','Quick navigation and search'],['#global-search-scope','Filtrer le type de données','Filter data type'],['#global-search-clear','Effacer la recherche','Clear search']])document.querySelector(selector)?.setAttribute('aria-label',language==='en'?en:fr);
    for(const area of areas)observer?.observe(area,{subtree:true,childList:true,characterData:true});
  }
  window.applyAppPreferences=function(nextTheme,nextLanguage,persist=true){
    theme=['classic','genz','clean'].includes(nextTheme)?nextTheme:'classic';language=nextLanguage==='en'?'en':'fr';
    document.body.classList.toggle('genz-theme',theme==='genz');document.body.classList.toggle('clean-theme',theme==='clean');
    document.getElementById('genz-theme').checked=theme==='genz';document.getElementById('app-theme').value=theme;document.getElementById('app-language').value=language;
    for(const area of areas)area.lang=language;
    if(persist){localStorage.setItem('hastus-ui-theme',theme);localStorage.setItem('hastus-ui-language',language);localStorage.setItem('hastus-genz-theme',theme==='genz'?'1':'0');}
    translate();
  };
  observer=new MutationObserver(translate);
  applyAppPreferences(localStorage.getItem('hastus-ui-theme')||(localStorage.getItem('hastus-genz-theme')==='1'?'genz':'clean'),localStorage.getItem('hastus-ui-language')||'fr',false);
  for(const id of ['app-theme','app-language'])document.getElementById(id).addEventListener('change',()=>{applyAppPreferences(document.getElementById('app-theme').value,document.getElementById('app-language').value);queueQuickSave();});
}
