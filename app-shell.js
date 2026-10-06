/* Appearance and bilingual controls; source data is preserved and reports can override the interface language. */
function initAppShell(){
  const english={
    'Apparence':'Appearance','Classique':'Classic','Épuré compact':'Clean compact','Épuré sombre':'Clean dark','Langue de l’accueil':'Home language',
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
  Object.assign(english,typeof APP_ENGLISH==='undefined'?{}:APP_ENGLISH);
  const areas=[document.querySelector('.hero'),document.getElementById('navigation-dock'),document.querySelector('main'),document.querySelector('footer')].filter(Boolean),originals=new WeakMap(),attributes=new WeakMap();
  const staticSelects=new Set([...document.querySelectorAll('select')].filter(el=>!el.closest('#mapping-grid,#decision-list')).map(el=>el.id));
  const decisionControls='.group-radius,.group-fields,.group-head,.orphan-stop-action,.place-select-title,button,.badge';
  function isData(element){
    if(!element||element.closest('script,style,svg,code,pre,textarea,[data-no-translate],td,#mapping-grid option'))return true;
    if(element.closest('#decision-list')&&!element.closest(decisionControls))return true;
    if(element.closest('option')&&!staticSelects.has(element.closest('select')?.id))return true;
    return false;
  }
  let language='fr',theme='classic',observer;
  function translate(roots=areas){
    observer?.disconnect();
    for(const area of roots){const walker=document.createTreeWalker(area,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(isData(node.parentElement))continue;let value=node.nodeValue,prior=originals.get(node);if(!prior||value!==prior.rendered){prior={original:value,rendered:value};originals.set(node,prior);}const key=prior.original.trim();let translated=language==='en'?(english[key]||(typeof appDynamicEnglish==='function'?appDynamicEnglish(key):null)):null;if(language==='en'&&!translated&&/^GTFS chargé · \d+ fichiers? reconnu/.test(key))translated='GTFS loaded · '+key.match(/\d+/)[0]+' recognized files';if(language==='en'&&!translated){if(/^\d+ fichiers? sur \d+ chargés?$/.test(key))translated=key.replace(/(\d+) fichiers? sur (\d+) chargés?/,'$1 of $2 files loaded');else if(/^Regrouper avec un rayon de \d+ m$/.test(key))translated=key.replace('Regrouper avec un rayon de','Regroup with a radius of');else if(/^(Calcul intelligent initial|Rayon général initial) : \d+ m$/.test(key))translated=key.replace('Calcul intelligent initial','Initial smart radius').replace('Rayon général initial','Initial general radius');}const next=translated?prior.original.replace(key,translated):prior.original;if(node.nodeValue!==next)node.nodeValue=next;prior.rendered=node.nodeValue;}
      for(const element of area.querySelectorAll('[title],[placeholder],[aria-label]')){if(isData(element))continue;const saved=attributes.get(element)||{};for(const attr of ['title','placeholder','aria-label']){const value=element.getAttribute(attr);if(value===null)continue;let prior=saved[attr];if(!prior||value!==prior.rendered)prior={original:value};const next=language==='en'?(english[prior.original]||prior.original):prior.original;if(value!==next)element.setAttribute(attr,next);prior.rendered=next;saved[attr]=prior;}attributes.set(element,saved);}
    }
    const search=document.getElementById('global-search-input');if(search)search.placeholder=language==='en'?'Stop, place, route, code…':'Stop, place, route, code…';
    document.getElementById('app-theme').setAttribute('aria-label',language==='en'?'Appearance':'Apparence');
    document.getElementById('app-language').setAttribute('aria-label',language==='en'?'Interface language':'Langue de l’interface');
    for(const [selector,fr,en] of [['.steps','Étapes','Steps'],['#navigation-dock','Navigation rapide et recherche','Quick navigation and search'],['#global-search-scope','Filtrer le type de données','Filter data type'],['#global-search-clear','Effacer la recherche','Clear search']])document.querySelector(selector)?.setAttribute('aria-label',language==='en'?en:fr);
    for(const area of areas)observer?.observe(area,{subtree:true,childList:true,characterData:true});
  }
  window.applyAppPreferences=function(nextTheme,nextLanguage,persist=true){
    theme=['classic','genz','clean','clean-dark'].includes(nextTheme)?nextTheme:'classic';language=nextLanguage==='en'?'en':'fr';
    document.body.classList.toggle('genz-theme',theme==='genz');document.body.classList.toggle('clean-theme',theme==='clean'||theme==='clean-dark');document.body.classList.toggle('clean-dark-theme',theme==='clean-dark');
    document.getElementById('genz-theme').checked=theme==='genz';document.getElementById('app-theme').value=theme;document.getElementById('app-language').value=language;
    document.documentElement.lang=language;
    for(const area of areas)area.lang=language;
    if(persist){localStorage.setItem('hastus-ui-theme',theme);localStorage.setItem('hastus-ui-language',language);localStorage.setItem('hastus-genz-theme',theme==='genz'?'1':'0');}
    if(typeof refreshSchedulingUnits==='function')refreshSchedulingUnits();
    if(typeof refreshServiceImportPlan==='function')refreshServiceImportPlan();
    translate();
  };
  // Translate only changed controls, not every map and table on every keystroke.
  observer=new MutationObserver(records=>{
    const roots=new Set();
    for(const record of records){const element=record.target.nodeType===3?record.target.parentElement:record.target;if(!isData(element))roots.add(element);else if(element?.closest('#decision-list'))for(const node of record.addedNodes||[])if(node.nodeType===1){if(node.matches(decisionControls))roots.add(node);for(const control of node.querySelectorAll(decisionControls))roots.add(control);}}
    if(roots.size)translate([...roots].filter(element=>![...roots].some(other=>other!==element&&other.contains(element))));
  });
  applyAppPreferences(localStorage.getItem('hastus-ui-theme')||(localStorage.getItem('hastus-genz-theme')==='1'?'genz':'clean'),localStorage.getItem('hastus-ui-language')||'fr',false);
  for(const id of ['app-theme','app-language'])document.getElementById(id).addEventListener('change',()=>{applyAppPreferences(document.getElementById('app-theme').value,document.getElementById('app-language').value);queueQuickSave();});
}
