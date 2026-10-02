# Assistant d'import GTFS vers HASTUS

Prototype local proposant un contexte unifié de regroupement géographique des
points horaires. Dans ce contexte, l'utilisateur choisit soit un nouveau client
sans données préalables, soit un client existant avec un export HASTUS.

## Démarrage

### macOS

Double-cliquer sur `launch.command`. Si macOS bloque le premier lancement,
faire un clic droit sur le fichier, choisir **Ouvrir**, puis confirmer.

Le Terminal doit rester ouvert pendant l'utilisation. `Ctrl+C` arrête le
serveur. Si une ancienne copie utilise déjà le port 8765, le lanceur choisit
automatiquement le prochain port disponible afin d'ouvrir la bonne version.

### Windows

Double-cliquer sur `launch_windows.bat`. Le lanceur utilise automatiquement
`py`, `python` ou `python3`, puis ouvre l'application sur une adresse locale
comme `http://127.0.0.1:8765/`. La fenêtre de commande doit rester ouverte.

Ne pas ouvrir `index.html` directement : l'adresse commencerait par `file:///`
et les serveurs de tuiles OpenStreetMap pourraient refuser les cartes avec une
erreur HTTP 403, faute de référent web valide. Si Python n'est pas installé, le
lanceur ouvre la page officielle de téléchargement de Python pour Windows.

### Ligne de commande

```bash
python3 serve.py
```

Puis ouvrir <http://127.0.0.1:8765>.

L'application fonctionne entièrement dans le navigateur : les fichiers chargés
ne sont envoyés à aucun serveur.

## Espace de travail et sauvegarde rapide

Avant de charger le GTFS, l'utilisateur peut choisir l'un des modes suivants :

- créer un espace local : après sélection d'un dossier parent, l'application
  crée automatiquement un sous-dossier `GTFS_HASTUS_AAAAMMJJ_HHMMSS` ;
- ouvrir un dossier de travail existant ;
- conserver une sauvegarde uniquement dans le navigateur.

Un espace local contient `original/` avec une copie intacte des fichiers du
GTFS, `working/` avec les fichiers courants et `.hastus-workspace.json` avec
l'état nécessaire à la reprise. Après une affectation ou un renommage,
`working/stops.txt` et `working/stop_times.txt` sont réécrits automatiquement
dès que les données sont valides. Les espaces récemment ouverts apparaissent
dans la liste de reprise.

L'accès direct au dossier repose sur le sélecteur sécurisé du navigateur : le
navigateur demande toujours à l'utilisateur de choisir ou d'autoriser le
dossier. Si cette fonction n'est pas disponible, la sauvegarde dans le
navigateur reste utilisable.

## Navigation et recherche

- une barre fixe permet d'accéder directement au haut et au bas de la page,
  aux sources, aux contextes, à l'analyse, aux conflits, aux places/stops et à
  l'export ; les destinations indisponibles sont désactivées automatiquement ;
- la recherche instantanée accepte un stop, une place, une route, un code ou
  une description et peut être limitée aux stops, places, conflits ou routes ;
- le compteur indique le nombre de résultats visibles, `Effacer` réinitialise
  le filtre, la touche `/` ouvre la recherche et `Échap` la ferme.

## Fichiers attendus

Pour le regroupement géographique, l'écran d'accueil propose maintenant deux
parcours explicites :

- **Utiliser un GTFS** : charger le ZIP ou le dossier GTFS habituel ;
- **Versions de routes + liste de stops HASTUS** : charger uniquement les deux
  exports Excel ou CSV HASTUS. Aucun `stops.txt` ni `stop_times.txt` n'est alors
  requis; les coordonnées viennent de la liste de stops et les timing points de
  la colonne `TP` des versions de routes.

- `stops.txt` du GTFS ;
- `stop_times.txt` du GTFS ;
- pour un client existant, un export CSV ou Excel `.xlsx` HASTUS contenant au minimum
  l'identifiant, la description, la latitude et la longitude du stop. Les
  colonnes de place sont facultatives. Pour un classeur Excel, la première
  feuille est lue automatiquement.
- facultativement, un export CSV ou Excel des versions de routes HASTUS. Les
  colonnes `Stop` et `TP` permettent alors de remplacer `stop_times.txt` comme
  source des timing points; `Position`, la route, la variante et la direction
  servent aussi à repérer les débuts et fins de voyages.

Après chargement, l'écran permet d'associer les colonnes de l'export HASTUS aux
champs attendus. Le séparateur CSV (virgule, point-virgule ou tabulation) est
détecté automatiquement.

La clé d'association utilisée par l'import HASTUS peut être réglée sur
`stop_id` ou `stop_code`.

Dans le contexte de regroupement géographique, une option permet de remplacer
uniquement les `stop_id` techniques au format UUID ou `remix_UUID` par une
séquence numérique configurable, limitée à six chiffres. Les identifiants déjà
lisibles sont conservés. Cette option est désactivée par défaut afin de ne
modifier aucun `stop_id`. Le remplacement est appliqué à `stops.txt`, à
`stop_times.txt` et aux `parent_station`, puis ajouté au rapport de
correspondance des identifiants.

Le mode cartographique demande également `routes.txt`, `trips.txt` et
`shapes.txt`. Le fichier `trips.txt` est indispensable pour relier chaque
`trip_id` de `stop_times.txt` à son `route_id` et à son `shape_id`.

Le GTFS complet peut être chargé une seule fois sous forme de ZIP ou de dossier
extrait. Chaque contexte détecte ensuite automatiquement les fichiers utiles.

## Règles appliquées

### Regroupement géographique

Le choix « Nouveau client » et le choix « Client existant dans HASTUS » sont
réunis dans ce même contexte. L'export HASTUS n'apparaît que lorsque l'option
« Client existant » est sélectionnée. Tant que le fichier n'est pas chargé, un
bouton permet de revenir directement à « Nouveau client ». Après avoir cliqué sur « Regrouper les
points horaires », les places et les stops proposés restent affichés et le
bouton de regroupement est masqué. Ce résultat est conservé lorsque
l'utilisateur consulte les cartes ou la comparaison des horaires, puis revient
au regroupement géographique. Il est également inclus dans la sauvegarde rapide
pour permettre sa reprise après la fermeture du navigateur.

Un interrupteur `Rayon intelligent` calcule un rayon propre à chaque timing
point à partir de la densité géographique, du nombre de voyages, des routes de
`trips.txt` et de la succession des stops dans `stop_times.txt`. Le rayon
général reste le plafond et les arrêts consécutifs d'un voyage ne sont pas
fusionnés au-delà de 45 m. Les rayons calculés, leur moyenne et les données de
trafic utilisées restent visibles et chaque rayon peut encore être ajusté.

Lorsqu'un rayon individuel est réduit, un stop situé hors du nouveau périmètre
est signalé comme orphelin si aucune autre place ne peut l'inclure avec son
propre rayon. Un bouton permet alors de créer uniquement la place de ce stop,
avec les mêmes règles de code et de description que le regroupement initial.
La nouvelle fiche est insérée immédiatement sous la place source sans
recalculer les autres regroupements.

### Client existant dans HASTUS

- lorsque `timepoint` est présent, seuls les `stop_id` ayant au moins une ligne
  `timepoint=1` sont traités ;
- lorsque `timepoint` est absent, les lignes dont `arrival_time` ou
  `departure_time` se termine par `:00` sont considérées comme points horaires ;
- les identifiants de stops HASTUS sont comparés à la clé d'association choisie
  (`stop_id` ou `stop_code`) ; le préfixe technique `:` des identifiants HASTUS
  est ignoré pendant la comparaison ;
- un identifiant retrouvé dans HASTUS est considéré comme le même stop et reste
  inchangé ; seule l'option explicite de renumérotation des UUID peut modifier
  un `stop_id` ;
- les correspondances entre anciens et nouveaux identifiants peuvent être
  téléchargées dans un rapport dédié ;
- un stop HASTUS déjà rattaché conserve sa place par défaut ;
- l'option `Réévaluer les places déjà affectées` conserve cette place comme
  choix initial et propose les autres centres de places situés dans le rayon
  choisi ; les propositions sont classées selon la similarité des descriptions,
  puis selon la distance ; la sélection finale est tracée comme
  `PLACE_REAFFECTEE` dans le rapport lorsqu'elle diffère de la place d'origine ;
- chaque stop à réévaluer possède par défaut une carte OpenStreetMap montrant le
  stop, le rayon de recherche, la place actuelle, les autres places candidates
  et le choix sélectionné ; les cartes visibles sont chargées progressivement pour éviter
  des centaines de requêtes de tuiles simultanées ;
- l'export des versions de routes peut être choisi comme source des timing
  points; l'outil signale alors les stops encore associés à une place mais qui
  ne sont plus TP, en distinguant ceux absents des versions de routes;
- la colonne de place de référence (`Refer.` ou équivalent) est conservée dans
  les recommandations et les rapports;
- les paires de places situées dans le rayon de recherche mais ne partageant
  aucune référence sont proposées pour une référence commune; les stops sans
  place dont une place voisine existe sont proposés pour rattachement;
- les regroupements suggérés sont présentés sous forme de fiches cartographiques
  OpenStreetMap : les stops et centres de places sont différenciés, la relation
  proposée est tracée, et des filtres par type ou distance ainsi qu'une
  pagination de 20 cas facilitent la validation; seules les cartes visibles
  sont chargées afin de préserver les performances;
- un seuil d'alerte distinct, réglable de 100 à 2 000 m, signale les places
  partageant une référence mais trop éloignées, ainsi que les identifiants de
  référence absents de la liste des places;
- les deux diagnostics sont visibles avec un lien OpenStreetMap et peuvent être
  exportés dans `regroupements_suggeres.csv` et `references_eloignees.csv`;
- un rapport PDF graphique « Références suspectes » produit une page paysage
  par anomalie avec les tuiles OpenStreetMap, les centres de places, tous les
  stops associés, leurs coordonnées et une recommandation de correction;
- dans les rapports PDF par stop, la recommandation indique explicitement si
  la place sélectionnée est la place HASTUS actuelle conservée ou une nouvelle
  affectation proposée;
- un stop inconnu reçoit les places voisines triées par distance dans le rayon
  choisi (1 à 500 mètres) ;
- une nouvelle place reçoit un code de un à six caractères, sans ajout de `X`
  pour compléter les codes courts ;
- un réglage initial applique soit les majuscules, soit les minuscules aux codes
  proposés et aux modifications manuelles ;
- une option facultative applique les abréviations officielles de types de rue
  et de points cardinaux de Postes Canada avant de générer le code ;
- les mots de liaison français et anglais (`de`, `du`, `la`, `the`, `of`,
  `and`, `after`, `before`, etc.) ainsi que les abréviations routières `Ave`,
  `Dr`, `Rd` et `St`
  sont ignorés, y compris
  dans la recherche d'une description commune à plusieurs stops : `Marché du
  Canal` produit `MARCAN` et deux noms dont le seul mot commun est `Rd` ne
  créent plus une place nommée `Rd` ;
- en cas de doublon, le dernier caractère est remplacé par `A`, `B`, etc. ;
- le `parent_station` exporté contient l'identifiant de la place, conformément
  à GTFS, et une ligne `location_type=1` est créée si nécessaire.

### Nouveau client — partir de zéro

- aucun fichier HASTUS n'est demandé ;
- tous les stops utilisés comme points horaires sont regroupés selon le rayon
  choisi, entre 1 et 500 mètres ;
- tous les stops d'un groupe doivent être situés dans le rayon de chacun des
  autres stops du groupe, ce qui évite les regroupements en chaîne trop larges ;
- une seule place est créée par groupe, notamment pour réunir le stop d'arrivée
  d'un trajet aller et le stop de départ du trajet retour ;
- la description et le code de chaque place proposée restent modifiables avant
  l'export ;
- une liste déroulante rappelle tous les codes et descriptions proposés ; les
  doublons sont signalés dans les champs et bloqués à l'export ;
- un récapitulatif en tête des résultats liste les places comportant une
  description vide ou en double, un code invalide, dupliqué ou déjà utilisé
  comme `stop_id` dans le GTFS ;
- pour chaque description dupliquée, ce récapitulatif détaille les stops
  associés et fournit une nouvelle description suggérée, modifiable puis
  applicable directement ;
- les mentions directionnelles `NORTHBOUND`, `SOUTHBOUND`/`SOUTHBOUD`,
  `WESTBOUND` et `EASTBOUND` sont retirées des descriptions de places générées ;
- un bouton permet d'appliquer en une fois toutes les descriptions suggérées
  visibles dans le récapitulatif des erreurs ;
- après l'application individuelle ou globale d'une nouvelle description, le
  code HASTUS, limité à six caractères, est régénéré à partir de cette
  description en garantissant son unicité ;
- lorsqu'un code est invalide ou déjà utilisé, plusieurs codes alternatifs sont
  proposés à partir des mots significatifs de la place et de ses stops ; un
  clic applique le code retenu ;
- chaque place proposée affiche une mini-carte OpenStreetMap avec ses stops,
  son centre calculé et le cercle correspondant au rayon de recherche ;
- seuls les autres stops définis comme timing points et visibles à l'extérieur
  du rayon sont affichés en bleu afin de repérer les points proches oubliés ;
  leur description est inscrite directement sur la carte ;
- un curseur propre à chaque place permet d'ajuster ce rayon entre 1 et 500 m
  sans modifier celui des autres places ; le rayon général reste utilisé pour
  le regroupement initial ;
- après un premier regroupement, toute modification du rayon général fait
  réapparaître le bouton de regroupement ; le résultat actuel reste visible
  jusqu'au lancement volontaire du nouveau calcul ;
- lorsqu'un rayon individuel est agrandi, les timing points d'autres places qui
  entrent dans ce rayon apparaissent en rose et sont signalés comme conflits
  potentiels ; l'utilisateur peut les réaffecter à la place courante ;
- une liste consolidée des stops en conflit apparaît en tête des résultats ; un
  clic sur un stop fait défiler la page jusqu'à sa place d'affectation actuelle
  et la met temporairement en évidence ;
- chaque conflit possède une carte OpenStreetMap montrant les places possibles
  et leurs rayons avec un remplissage coloré à 50 % ; la ligne reprend la
  couleur de la place d'affectation et se recolore après une réaffectation ;
- un bouton permet aussi d'afficher tous les stops en conflit, toutes les
  places possibles et leurs différents rayons sur une seule carte ; les cas
  reliés par une place commune sont organisés en groupes de conflit connexes ;
- chaque groupe de conflit peut être sélectionné pour recentrer la carte sur
  ses rayons et ses stops ; des listes déroulantes sous la carte permettent
  alors de modifier directement la place de chaque stop du groupe ;
- après une réaffectation, le groupe initial reste ouvert avec les mêmes stops
  et places afin de poursuivre l'analyse ou de revenir au choix précédent,
  même lorsque le conflit courant vient d'être résolu ;
- les cartes de conflits se déplacent par glisser-déposer et se zooment avec
  la roulette ou le pavé tactile ; des boutons de zoom, de déplacement et de
  recentrage sont également disponibles, et la vue est conservée pendant les
  réaffectations du groupe ;
- le mode `Résolution plein écran 4K` transforme la page en poste de travail
  dédié : grande carte à gauche, groupes, menus d'affectation et validation à
  droite ; toutes les décisions sont conservées en quittant le plein écran ;
- dans ce mode, les boutons `Groupe précédent` et `Groupe suivant` ainsi qu'un
  compteur permettent d'enchaîner les groupes sans revenir à la vue globale ;
  le premier et le dernier arrêtent naturellement la navigation ;
- un petit bouton `Valider` marque individuellement un groupe comme analysé ;
  il est disponible sur la tuile du groupe et directement à côté de sa carte ;
  un second clic annule cet état, qui est conservé par la sauvegarde rapide ;
- une liste déroulante propre à chaque stop en conflit permet de choisir
  directement une autre place possible ; la sélection déplace le stop et
  recalcule immédiatement tous les conflits ;
- une réaffectation retire toujours le stop de son ancien groupe avant de
  l'ajouter au nouveau, afin qu'il conserve un seul `parent_station` ;
- chaque stop dispose d'une liste des autres places proposées dont le centre se
  trouve dans le rayon choisi ; il peut être réaffecté en cas de chevauchement,
  avec recalcul immédiat des groupes et de leurs coordonnées.
- dès que toutes les places sont valides et que la sauvegarde rapide est à
  jour, une section propose des pamphlets horaires par route, direction et
  `service_id` ;
- ces horaires affichent uniquement les heures de passage aux timing points,
  avec les codes place à six caractères, un schéma monochrome sommaire, un
  filtre par route et une mise en page imprimable.

### Cartes des points horaires par route

- à l'ouverture du contexte Cartes, l'affichage par défaut est la carte unique
  de toutes les routes avec les libellés `stop_code` ;
- les passages définis comme points horaires sont reliés à leur route par
  `trips.txt` ;
- tous les shapes utilisés par une route sont superposés sur un fond
  OpenStreetMap ;
- chaque point horaire peut afficher au choix sa description (`stop_name`), son
  `stop_code`, son `stop_id`, ou aucun libellé pour alléger la carte ;
- le choix général peut être remplacé indépendamment sur chaque route ;
- chaque carte se déplace directement par glisser-déplacer et se zoome à la
  roulette ou par pincement sur un pavé tactile Apple ; le défilement à deux
  doigts parcourt la carte et les boutons restent disponibles ;
- le déplacement est limité pour qu'une partie de la route reste toujours
  visible ;
- les cartes peuvent être exportées en SVG ou imprimées/enregistrées en PDF ;
- la couleur GTFS `route_color` est utilisée lorsqu'elle est disponible ;
- un fond OpenStreetMap, une flèche du nord et une échelle métrique sont
  intégrés à la carte ;
- chaque carte de route peut être téléchargée au format SVG.
- l'utilisateur peut choisir des cartes séparées, une carte unique de toutes les
  routes avec légende, ou les deux affichages.
- dans la carte unique, chaque route possède un sélecteur à trois états pour
  l'afficher en trait plein, à 50 % de transparence ou la masquer ; la liste
  latérale affiche le `route_id` et propose aussi les actions Tout masquer,
  Tout à 50 % et Tout afficher ;
- chaque carte peut être ouverte en plein écran et refermée avec son bouton ou
  la touche Échap.

### Comparaison des horaires

- `calendar.txt` définit les services hebdomadaires et leurs périodes ;
- `calendar_dates.txt`, lorsqu'il est présent, ajoute ou supprime les services
  exceptionnels ;
- le nombre de voyages est calculé pour chaque date et chaque `route_type` ;
- les variations sont affichées dans un calendrier mensuel interactif ; le
  choix d'une date affiche le timetable applicable à cette journée ;
- les services par fréquence utilisent `frequencies.txt` lorsqu'il est présent ;
- un CSV quotidien détaillé et un timetable de préparation HASTUS sont générés ;
- le timetable ne contient que les identifiants, descriptions et heures de
  passage des stops définis comme timing points. Les arrêts intermédiaires sont
  exclus.

Le format d'interface HASTUS exact dépend du fichier de contrôle configuré chez
le client. Le timetable généré contient les champs nécessaires à son adaptation,
mais ne prétend pas être directement importable sans cette définition.

### Timetables du dossier working

Ce contexte devient disponible sur la page principale dès que `working/stops.txt`
contient au moins un `parent_station`. Il utilise directement ces codes de place
et n'affiche que les heures de passage aux timing points. `routes.txt`,
`trips.txt` et `stop_times.txt` doivent être présents dans le GTFS chargé pour
produire les grilles par route.

### Thème simplifié Gen Z

Un interrupteur permanent dans l'en-tête active une interface plus visuelle,
avec des commandes plus grandes, des cartes arrondies et une hiérarchie plus
directe, sans supprimer aucune fonction. Le choix est conservé localement et
dans les sauvegardes de travail.

## Résultats

- `stops_enrichi.txt` : fichier GTFS modifié ;
- `stop_times_enrichi.txt` : horaires utilisant les nouveaux identifiants ;
- `correspondance_stop_id_hastus_gtfs.csv` : traçabilité des identifiants
  régénérés ;
- `rapport_affectations.csv` : décision et distance par point horaire ;
- `rapport_stops_par_place.csv` : vue inverse regroupant tous les stops par
  place, avec compte des timing points et place de référence ;
- `stops_avec_place_sans_timing_point.csv` : stops toujours associés à une
  place, mais non utilisés comme timing points ;
- `places_a_creer.csv` : nouvelles places à créer dans HASTUS, avec les
  identifiants et les descriptions de tous les stops regroupés par place.

Le bouton **Rapport client PDF** ouvre une version imprimable avec l'identité
CSched et OC Transpo. Chaque stop commence sur une nouvelle page afin de
faciliter la validation et l'annotation par le client. Chaque page comprend sa
carte OpenStreetMap. Un sélecteur permet de produire séparément le rapport de
tous les stops, celui des stops ne nécessitant aucune intervention ou celui des
stops à évaluer.

Dans le module de regroupement géographique, le bloc **Rapport de validation**
produit également un document centré sur les places :

- une place par page, en disposition portrait ou paysage ;
- un sélecteur de langue permet de produire le même rapport complet en
  français ou en anglais; le choix est conservé dans la sauvegarde de travail ;
- le logo CSched et l'identité du client détectée dans `agency.txt` ;
- la possibilité de remplacer cette identité par un logo local PNG, JPEG ou
  WebP, sans envoyer l'image sur Internet ;
- le code, le nom, le centre et le rayon de chaque place ;
- une première page de synthèse qui affiche d'abord les places nécessitant une
  décision, puis celles sans décision, avec le code et la description de la
  place ainsi que le `stop_id` et la description complète de chaque stop
  associé; les textes longs reviennent automatiquement à la ligne ;
- le tableau des places sans décision reste sur la première page seulement si
  les deux tableaux y tiennent; sinon il commence automatiquement sur la page
  suivante, avec une typographie de synthèse agrandie ;
- les fiches détaillées des places nécessitant une décision avant les autres,
  avec un classement alphabétique par code à l'intérieur de chaque catégorie ;
- tous les stops associés avec leur description, leur distance et leurs
  coordonnées ;
- les stops d'autres places situés dans le rayon et, facultativement, ceux qui
  se trouvent jusqu'à 100, 150, 250 ou 500 mètres au-delà du rayon, avec le
  code et le nom de leur place actuelle dans le tableau détaillé ;
- une carte OpenStreetMap affichant directement les `stop_id`.

Le rapport s'ouvre dans la fenêtre d'impression du navigateur. Choisissez
**Enregistrer au format PDF** pour créer le fichier final. Le nom proposé pour
la sauvegarde contient le nom du client lu dans `agency.txt`.

Le même panneau permet aussi de télécharger un rapport HTML interactif en
français ou en anglais. Ce fichier s'ouvre directement dans un navigateur sans
relancer l'Assistant. Il contient une table des matières cliquable, une
recherche par place, code ou stop, des filtres selon le besoin de décision et
un lien de retour au sommaire sur chaque fiche. Les styles et le logo CSched
sont intégrés au fichier. Par défaut, l'Assistant télécharge à la génération
les seules données vectorielles OpenStreetMap nécessaires, dessine des cartes
fixes avec les stops, les rayons et les détails, puis les intègre au fichier :
le rapport peut ensuite être consulté sans connexion Internet. L'attribution
OpenStreetMap et la licence ODbL restent visibles. Une option permet de conserver
à la place les cartes interactives en ligne. Lancez l'outil avec
`launch_windows.bat` : le serveur local relaie les requêtes de données OSM et
essaie automatiquement un second fournisseur si le premier est indisponible.

### Corrections du client dans le rapport HTML

Régénérez le rapport après une mise à jour de l'Assistant : les anciens fichiers
HTML ne changent pas automatiquement. Les filtres « Toutes », « Décision requise »
et « Sans décision » agissent sur le sommaire, les liens et les fiches. Les
catégories restent celles du diagnostic initial, et ne constituent pas une
validation automatique après modification.

Dans chaque fiche, le client peut modifier le code (1 à 6 lettres ou chiffres,
casse conservée) et la description de la place. La liste « Place attribuée » de
chaque stop permet de choisir une autre place du rapport. Les listes de stops,
compteurs, distances et repères cartographiques sont actualisés, sans déplacer
les coordonnées physiques des arrêts. Le fond de carte et son cadrage restent
fixes : un message signale les arrêts réaffectés en dehors du cadrage.

- **Enregistrer le rapport HTML corrigé** télécharge une copie autonome contenant
  les choix du client. Utiliser ce bouton avant de fermer le rapport et transmettre
  cette copie au chargé de projet. Il n'y a pas d'écrasement automatique du HTML
  original, ni de dépendance à la sauvegarde locale du navigateur.
- **Télécharger stops.txt** produit les places renommées et les nouvelles
  associations `parent_station`. Les identifiants des stops physiques sont conservés.
- **Télécharger stop_times.txt** conserve les horaires, séquences et colonnes du
  GTFS enrichi à la génération du rapport. Une réaffectation de place ne remplace
  pas les stops physiques des voyages par des places.

Remplacer ces deux fichiers dans une **copie** de l'archive GTFS d'origine, en
conservant tous les autres fichiers. Les exports portent les noms standard GTFS
`stops.txt` et `stop_times.txt` (avec les « s » et le tiret bas). En cas de doublon,
de code invalide, de collision ou de référence incohérente, les exports sont
bloqués avec un message. Le renommage d'une place référencée par un autre fichier
GTFS chargé (par exemple `transfers.txt` ou `pathways.txt`) est également bloqué :
ces autres fichiers nécessiteraient une adaptation coordonnée. Un rapport issu
uniquement des données HASTUS reste modifiable et sauvegardable, mais ne peut pas
inventer les fichiers GTFS absents.

Les fonctions de l'éditeur sont dans `report-editor.js` et sont intégrées au HTML
exporté : aucun script externe n'est nécessaire chez le client. Tests :
`node tests/report-editor.test.cjs`. Test optionnel sur Metrobus : ajouter le chemin
de `googleFall2026November.zip` en argument (Python requis ; variable `PYTHON`
possible pour indiquer son exécutable).

Le prototype ne modifie jamais les fichiers sources.
#   a s s i s t a n t - g t f s - h a s t u s - w i n d o w s  
 
