# The GTFS Missing Link

**Version 12.0** — voir les [notes de version](CHANGELOG.md).

Prototype local proposant un contexte unifié de regroupement géographique des
points horaires. Dans ce contexte, l'utilisateur choisit soit un nouveau client
sans données préalables, soit un client existant avec un export HASTUS.

Les cartes de places proposées proposent **Annuler / Rétablir** (Undo / Redo)
pour les modifications manuelles du code et de la description, à la place du
menu des codes et descriptions suggérés. Chaque place dispose de son historique
pendant la session (100 étapes maximum), sans modifier son rayon ni ses stops.
L’historique n’est pas conservé après rechargement ; les noms restent sauvegardés
par le mécanisme de sauvegarde habituel.

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

Les nouvelles sauvegardes locales écrivent et relisent l’état par blocs pour
éviter la limite « Invalid string length » sur les gros GTFS. Le fichier
`.hastus-workspace.json` reste dans le même dossier ; les anciennes sauvegardes
sont toujours lisibles. Utiliser cette version de l’Assistant (ou une version
ultérieure) pour rouvrir le nouveau format. Une écriture interrompue avant sa
validation conserve le précédent fichier d’état. Les fichiers `original/`
ne sont pas modifiés par cette évolution.

Tests de sauvegarde : `node tests/workspace-storage.test.cjs` et
`node tests/workspace-save.test.cjs`. Pour vérifier un GTFS extrait sans modifier
ses fichiers : `node --expose-gc tests/workspace-real-gtfs.test.cjs "CHEMIN_DU_GTFS"`.

L'accès direct au dossier repose sur le sélecteur sécurisé du navigateur : le
navigateur demande toujours à l'utilisateur de choisir ou d'autoriser le
dossier. Si cette fonction n'est pas disponible, la sauvegarde dans le
navigateur reste utilisable.

## Navigation et recherche

Le bouton **Tutoriel**, dans le bandeau supérieur, ouvre un guide local en sept
étapes : sources et sauvegarde, regroupement, client existant, cartes et horaires,
journées à importer, validation client et exports. Sa langue suit l’interface.
Le sommaire et les boutons Précédent / Suivant permettent de naviguer ; Fermer
ou la touche Échap ramènent au projet sans le modifier. Le guide ne nécessite
ni GTFS chargé ni connexion Internet.

L’en-tête utilise le logo CSched des rapports et ne contient plus la barre
numérotée « Sources / Analyse / Décisions / Export ». Le choix français/anglais
s’applique aux commandes d’accueil, aux options d’analyse, d’import et de
rapport. Les libellés des données client ne sont pas traduits et la langue
des rapports suit par défaut celle de l’interface. L’option « Langue de
l’interface » reste automatique ; sélectionner Français ou English dans les
options d’un rapport permet de forcer une langue différente.

Les nouveaux projets démarrent avec un rayon de recherche de **200 m**, des
codes de place de **8 caractères**, une disposition de rapport **paysage** et
des cartes HTML **en ligne**. Les réglages explicites des espaces sauvegardés
restent prioritaires. Les anciennes sauvegardes sans réglage de longueur de
code conservent leur ancienne limite de 6 caractères.

Dans « Apparence », **Épuré sombre** conserve l’organisation du thème compact
avec une palette foncée. Le choix est mémorisé dans le navigateur et dans
l’espace de travail. Il ne modifie pas le thème des rapports exportés ni les
couleurs des fonds cartographiques OSM.

L’application s’appelle **The GTFS Missing Link** dans les deux langues. Les
thèmes épuré clair et sombre partagent une typographie Arial/Helvetica sans
empattement, une hiérarchie de titres et des boutons, champs et cartes aux
mêmes arrondis. Les codes techniques gardent leur présentation dédiée.

## Import des scheduling units

Le panneau **Scheduling units**, situé en bas de page après les résultats et
leurs exports, utilise le GTFS chargé ou un `routes.txt`
séparé. Choisir la clé HASTUS : `route_id` (par défaut) ou `route_short_name`.
Cette clé alimente à la fois `scu_identifier` et `scu_route_ids`, sans supprimer
les zéros initiaux. Une unité de type timetable `1100` est créée par route.
La description est `Route <identifiant>`, ou `route_long_name` si cette option
est choisie (avec repli sur `Route <identifiant>` si le nom est vide).

- **Enregistrer dans un dossier GTFS…** : choisir le dossier contenant le
  `routes.txt` correspondant. Les deux fichiers sont écrits dans `hastus_import/`.
  Une confirmation est demandée si ces fichiers existent déjà.
- **Télécharger le ZIP avec les imports** : copie les fichiers GTFS sources et
  ajoute `hastus_import/sched_unit_to_import.txt` et
  `hastus_import/scheduling units.oir`. Cette copie ne reprend pas les corrections
  de places. Avec un `routes.txt` séparé, l’archive contient seulement ce tableau
  et les imports ; ce n’est pas un GTFS complet.

Le script fourni est conservé dans `assets/scheduling units.oir`. L’en-tête du
fichier généré comprend les cinq colonnes attendues, dont `scu_route_ids`, absente
de l’en-tête de l’exemple fourni. Les identifiants vides ou dupliqués bloquent
l’export. Les virgules, guillemets et sauts de ligne dans les champs exportés
sont refusés, car le script ne définit pas de convention d’échappement.
Le format est testé localement ; l’exécution dans HASTUS reste à valider.

Tests : `node tests/scheduling-units.test.cjs` et `node tests/radius-controls.test.cjs`.

## Accès rapide

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
- un seuil d'alerte distinct, réglable de 0 à 1 000 m, signale les places
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
  choisi (0 à 1 000 mètres) ;
- une nouvelle place reçoit un code de exactement 6 ou 8 caractères selon le
  réglage « Longueur des codes générés » (8 par défaut). La génération commence
  par trois ou quatre lettres de chacun des deux premiers mots significatifs,
  puis utilise leurs lettres restantes et les mots suivants si nécessaire.
  Si le nom reste trop court, des zéros complètent le code, jamais des `X` :
  `Bay Harbour` produit `BAYHAR` ou `BAYHARBO`, `Main Rd` produit `MAIN00` ou
  `MAIN0000`. Les codes déjà saisis ne changent pas automatiquement et les
  modifications manuelles peuvent rester plus courtes ;
- un réglage initial applique soit les majuscules, soit les minuscules aux codes
  proposés et aux modifications manuelles ;
- une option facultative applique les abréviations officielles de types de rue
  et de points cardinaux de Postes Canada avant de générer le code ;
- les mots de liaison français et anglais (`de`, `du`, `la`, `the`, `of`,
  `and`, `after`, `before`, etc.) ainsi que les abréviations routières `Ave`,
  `Dr`, `Rd`, `St` et `Ad`
  sont ignorés (sauf `St` en préfixe de nom, pour Saint), y compris
  dans la recherche d'une description commune à plusieurs stops : `Marché du
  Canal` produit `MARCAN` et deux noms dont le seul mot commun est `Rd` ne
  créent plus une place nommée `Rd` ;
- en cas de doublon, le dernier caractère est remplacé par `A`, `B`, etc.
  Pour un lieu reconnu ci-dessous, la distinction est insérée avant le suffixe ;
- le `parent_station` exporté contient l'identifiant de la place, conformément
  à GTFS, et une ligne `location_type=1` est créée si nécessaire.

#### Saint et types de lieux

`St`, `St.` et `St-` sont conservés comme Saint au début d’un nom, après un
séparateur d’intersection (`/`, `&`, `@`) ou après un repère tel que `at`,
`before` ou `after`. Un `St` final continue à être ignoré comme Street.
Le préfixe Saint reste attaché au mot suivant pour construire le code.
Exemple : `St Clair Station` reste `St Clair Station` et produit `STCSTN`
en six caractères, `STCLASTN` en huit caractères, ou leurs minuscules.

Les mots de type de lieu sont reconnus avant l’application éventuelle du
catalogue Postes Canada. Conventions des **nouveaux codes générés** :

| Libellés reconnus (français et anglais) | Suffixe |
| --- | --- |
| Station, Stn, gare, gare routière, train/bus/railway/metro station | STN |
| Terminal, terminus, bus terminal | TER |
| Hub, pôle, pôle d’échanges ou de correspondance | HUB |
| Exchange, interchange, échange, échangeur | ECH |
| Transit centre/center, centre de transit ou de correspondance | CTR |

Le type reste dans la description même si un seul stop du groupe le mentionne.
Si plusieurs types sont détectés, la description les conserve et le suffixe
suit l’ordre de priorité du tableau. Les trois caractères du suffixe sont
réservés dans la limite de 6/8 caractères, y compris pour les variantes de code
et les doublons (lettre ou numéro avant le suffixe). La même règle s’applique
à une nouvelle place créée pour un stop orphelin.

Cette reconnaissance est une heuristique textuelle, pas une classification
géographique : `Station Road`, `Terminal Avenue`, `rue de la Gare` et les
stations de police, de pompiers ou de service ne déclenchent pas ces suffixes.
Les cas ambigus restent à valider. Aucun code existant ou nom modifié à la main
n’est recalculé automatiquement ; la saisie manuelle reste libre.

Tests : `node tests/place-naming.test.cjs`.

### Nouveau client — partir de zéro

- aucun fichier HASTUS n'est demandé ;
- tous les stops utilisés comme points horaires sont regroupés selon le rayon
  choisi, entre 0 et 1 000 mètres ;
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
  code HASTUS, limité à 6 ou 8 caractères selon le réglage, est régénéré à partir de cette
  description en garantissant son unicité ;
- lorsqu'un code est invalide ou déjà utilisé, plusieurs codes alternatifs sont
  proposés à partir des mots significatifs de la place et de ses stops ; un
  clic applique le code retenu ;
- chaque place proposée affiche une mini-carte OpenStreetMap avec ses stops,
  son centre calculé et le cercle correspondant au rayon de recherche ;
- seuls les autres stops définis comme timing points et visibles à l'extérieur
  du rayon sont affichés en bleu afin de repérer les points proches oubliés ;
  leur description est inscrite directement sur la carte ;
- un curseur et un champ numérique propres à chaque place permettent d'ajuster ce rayon entre 0 et 1 000 m
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
  avec les codes place (6 ou 8 caractères maximum), un schéma monochrome sommaire, un
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

Le contexte 03 propose désormais un **plan de dates à importer dans HASTUS** :
une date représentative par horaire distinct du réseau, avec les jours de la
semaine concernés, toutes les dates de circulation et les services actifs à
la date suggérée. Par exemple, si le mercredi comporte d’autres heures que
le lundi/mardi/jeudi/vendredi, une date de mercredi est proposée en plus de
la date du service courant, même si le nombre de voyages est identique.

Les ajouts et suppressions de `calendar_dates.txt` sont appliqués avant la
comparaison. Les services sans `calendar.txt` sont également pris en charge.
Les jours sans voyage sont signalés mais ne proposent pas d’import.
L’horaire le plus fréquent sert de référence ; les autres profils indiquent
les routes différentes et les définitions de voyages ajoutées/retirées.
Un voyage modifié compte comme une suppression et un ajout, pas comme un
départ supplémentaire. Les variations ponctuelles et récurrentes sont séparées.

La comparaison porte sur toutes les routes, tous les arrêts (pas seulement
les TP), leurs heures, l’ordre de passage, les attributs des voyages et les
plages de fréquence. Les identifiants de voyage/service seuls sont ignorés,
mais les blocs et shapes distincts sont conservés par prudence. Les autres
tables GTFS (transferts, tarifs, etc.) ne sont pas comparées. Les services par
intervalle sans départs fixes et les heures manquantes demandent une revue.

La date suggérée privilégie un jour sans exception explicite, puis le jour
de semaine le plus fréquent du profil et sa première occurrence. Le bouton
**Voir cette journée** ouvre son aperçu ; l’étoile du calendrier repère les
dates proposées. Le **plan d’import CSV** conserve toutes les dates exactes :
la première et la dernière date ne constituent pas une période continue de
circulation. La section et le CSV suivent la langue de l’interface.

Il s’agit d’une aide à la décision sur l’ensemble de la période du GTFS, pas
d’un import automatique. Dans HASTUS, choisir les dates proposées puis vérifier
l’affectation des horaires au calendrier selon les règles de l’installation.
Aucun GTFS ni horaire source n’est modifié.

Après un clic sur **Voir cette journée** (ou sur une date du calendrier), une
**synthèse par route** affiche les voyages à départ fixe, leur répartition par
direction 0/1/non renseignée et les plages de service par fréquence sans départs
fixes. Les départs `exact_times=1` sont développés ; les services par intervalle
restent séparés. Seules les routes actives ce jour figurent dans le tableau.

Le petit bouton **PDF** sur chaque ligne ouvre un aperçu imprimable de cette
route et de cette date, dans un style **horaire de travail épuré**, inspiré
du modèle de la route 333 : deux directions côte à côte, séparation centrale,
codes des places à l’horizontale et colonnes voyage/route aux
extrémités. Les variantes compatibles partagent une grille de points ordonnée ;
les points non desservis apparaissent en pointillés. Les boucles conservent les
passages répétés. HW reste calculé au premier point de chaque parcours.
Cliquer ensuite sur **Imprimer / Enregistrer en PDF**.
Le format Letter est portrait pour les petites grilles et paysage pour les
routes avec davantage de points ; les grandes grilles sont paginées. Les codes
proviennent des affectations courantes du regroupement, puis de working/stops.txt
si disponible, puis du GTFS chargé (code de la station parente, sinon parent_station).
Un stop sans place affiche « — » : son stop_id reste dans la légende, jamais
présenté comme un code de place. La légende donne les descriptions complètes.
Le sélecteur **AM/PM / Military (24 h)** dans l’aperçu commute entre 615a/125p
et 06:15/13:25, y compris les plages de fréquence. Le PDF conserve le mode choisi ;
un suffixe +1 signale le lendemain sans changer le jour de service GTFS.
Le numéro de voyage affiché utilise trip_short_name s’il existe, sinon trip_id ;
la colonne bloc n’est pas affichée. Les métadonnées HASTUS absentes (booking, scénario,
crew schedule) ne sont pas inventées. Le tri est indépendant par direction :
des voyages placés sur une même ligne ne constituent pas un enchaînement garanti.
Les longues grilles sont réparties sur plusieurs pages sans supprimer de voyages.
La direction non renseignée reste séparée et les plages par fréquence ont leur
propre tableau. Les voyages sans timing point sont signalés comme absents du PDF ;
le bouton est désactivé si aucun voyage de la route n’en possède. La synthèse et
l’aperçu PDF suivent la langue de l’interface, sans charger de cartes réseau.

Tests : `node tests/service-import-plan.test.cjs` et
`node tests/day-route-summary.test.cjs`.

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

### Apparence et langue de l'accueil

Le menu permanent **Apparence** propose quatre styles : **Classique**, **Gen Z**,
**Épuré compact** et **Épuré sombre**. Le style épuré réduit l'en-tête, utilise une palette olive/lime
et des boutons à coins arrondis en diagonale, avec les sources et l'espace de
travail côte à côte lorsque la largeur le permet. Les fonctions sont conservées.

Le sélecteur **Langue de l'accueil** traduit l'en-tête, la navigation, les choix
de sources et de contexte en français ou en anglais. Les écrans d'analyse
existants ne sont pas entièrement traduits. La langue des rapports suit celle de
l’interface par défaut, avec un choix explicite FR/EN possible. L'apparence et la langue sont conservées localement et
dans les sauvegardes de travail ; les anciennes sauvegardes restent compatibles.

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
sont intégrés au fichier. En mode hors ligne, l'Assistant télécharge à la génération
les seules données vectorielles OpenStreetMap nécessaires, dessine des cartes
fixes avec les stops, les rayons et les détails, puis les intègre au fichier :
le rapport peut ensuite être consulté sans connexion Internet. L'attribution
OpenStreetMap et la licence ODbL restent visibles. Par défaut, les cartes sont
chargées en ligne, avec un cadrage fixe : le zoom et le
déplacement sont désactivés à la souris, au toucher et au clavier pour conserver
l'alignement du fond OSM avec les stops et les rayons. La navigation du rapport
et les corrections de places restent disponibles. Lancez l'outil avec
`launch_windows.bat` : le serveur local relaie les requêtes de données OSM et
essaie automatiquement un second fournisseur si le premier est indisponible.

### Rapport HTML — diagnostic des clients existants

Après l’analyse d’un client existant (GTFS + export HASTUS, ou versions de routes
+ liste de stops HASTUS), le panneau **Rapport de validation** propose aussi
**Rapport HTML · Diagnostic HASTUS**. Ce rapport autonome en consultation seule
reprend les options FR/EN, de thème et de cartes fixes en ligne ou hors ligne.
Il ne remplace pas le rapport modifiable de validation des places.

Les références trop éloignées ou introuvables apparaissent en premier, avec
les places concernées, les stops physiques, la distance, le seuil et une
recommandation. Toutes les places sont ensuite classées par priorité : références
suspectes, données incomplètes, regroupements, affectations, créations, stops non TP
à vérifier et absence d’intervention détectée. Une place n’est comptée qu’une
fois, mais conserve tous ses types d’alerte et apparaît dans chaque filtre pertinent.
Les codes sont triés dans chaque catégorie. Les places sans coordonnées sont
conservées avec un avertissement plutôt qu’exclues du rapport.

Les affectations HASTUS actuelles et les propositions de l’Assistant sont
présentées séparément : aucune modification n’est appliquée par ce diagnostic.
Le sommaire cliquable, la recherche et les filtres facilitent la revue ; les
fiches sont paginées par 12 et les cartes chargées à l’ouverture des fiches.
Les horaires GTFS ne sont pas dupliqués dans ce rapport. Les cas sans alerte ne
constituent pas une validation automatique des choix opérationnels du client.

Test : `node tests/report-existing.test.cjs`.

### Module indépendant : cartes des routes et timetables

Le panneau **Cartes des routes et timetables**, sous le choix du contexte,
ouvre un module autonome en pleine largeur ou télécharge son propre rapport HTML.
Il utilise le GTFS chargé, sans nécessiter d’analyse géographique ni de génération
de places. Ses options de langue (FR/EN), thème et cartes sont indépendantes.
Le rapport HTML client propose également deux sections via des boutons en haut :
**Places à valider** et **Routes et timetables**. Les listes, compteurs et filtres
de validation concernent uniquement les places. Le réseau est chargé seulement
à l’ouverture de sa section ; la première route est sélectionnée pour éviter
d’afficher d’un coup tous les horaires d’un grand réseau. Le filtre permet ensuite
de choisir une autre route ou toutes les routes.
Les rapports HTML déjà téléchargés doivent être régénérés pour cette séparation.

Pour les gros GTFS, les horaires et fichiers annexes sont intégrés en CSV gzip,
sans perte, au lieu de millions d’objets JSON. Ils sont décompressés seulement
pour consulter le réseau ou exporter. Les exports GTFS sont préparés dans un
worker, hors du traitement de l’interface ; aucune connexion n’est nécessaire.
Les menus d’affectation chargent leurs alternatives triées par distance à leur
ouverture, et les fiches hors écran ne sont pas peintes immédiatement.
Utiliser une version récente de Chrome ou Edge permettant les flux gzip et les
workers locaux. La génération des fonds OSM nécessite toujours Internet.

Le module réseau comprend :

- filtre par **date de service**, route et direction, boutons veille/lendemain ;
- timetables utilisant le **même moteur que le module 03**, à l’écran et dans
  l’export PDF : grille condensée, deux directions côte à côte, codes de place
  horizontaux, headways et sélecteur AM/PM / Military (24 h), sans colonne bloc.
  Les variantes partagent la grille ordonnée ; une direction non renseignée
  reste distincte. En vue toutes routes, ouvrir la section Timetable d’une
  route pour la charger. Chaque route reste indépendante dans le PDF global ;
- prise en compte de `calendar.txt` et des ajouts/suppressions de
  `calendar_dates.txt`, y compris un GTFS avec uniquement ce dernier fichier ;
- grilles regroupant les variantes d’une direction, avec un voyage par ligne
  et un timing point par colonne ; codes de place en en-tête et descriptions
  complètes dans la légende ;
- colonne **Headway** à gauche : intervalle avec le voyage précédent au premier
  stop affiché du même parcours, en minutes et secondes si nécessaire. Le
  premier voyage ou une heure manquante affiche `—`. Le calcul respecte les
  filtres et les heures GTFS au-delà de 24 h ;
- affichage des seuls timing points par défaut, avec une case pour afficher
  tous les stops. Les TP viennent de la source choisie dans l'Assistant ;
  sans indicateur `timepoint`, l'estimation par secondes `:00` est signalée ;
- conservation des heures après minuit, par exemple `25:02:00`, dans leur jour
  de service GTFS, sans les déplacer au lendemain ;
- départs fixes de `frequencies.txt` développés lorsque `exact_times=1` ; sinon
  affichage des plages et intervalles sans inventer des départs à heure fixe ;
- une carte fixe par route avec tous ses shapes et les coordonnées physiques
  de ses stops. Cette carte représente toute la route et ne change pas avec la
  date. Sans `shapes.txt`, seuls les stops sont affichés.

En mode hors ligne, les fonds OSM des routes sont préparés à la génération,
comme ceux des places. La génération nécessite Internet et peut prendre plus
de temps pour un grand réseau. Les cartes SVG et les données horaires sont
ensuite intégrées au HTML sans scripts externes ; les filtres fonctionnent
hors ligne. En mode connecté, les fonds OSM restent fixes et non manipulables.

Les noms et associations proviennent du GTFS chargé, y compris les places déjà
présentes dans ce fichier. Pour consulter des corrections retournées par le client,
chargez son GTFS finalisé dans l’Assistant. Le module est en consultation seule :
il ne modifie ni les places ni le GTFS. **Enregistrer le rapport HTML** conserve
la date et les filtres sélectionnés dans une nouvelle copie du rapport réseau.
Sans calendrier exploitable, les horaires par date sont indisponibles et un
message l'indique ; les cartes restent accessibles. Les seuls exports de
versions de routes HASTUS ne fournissent pas les horaires datés d'un GTFS.

Les boutons **Exporter Excel** et **Exporter PDF** utilisent la date, la route,
la direction et le choix « points horaires seulement » du rapport. Ils reprennent
les noms de places et affectations du GTFS chargé, sans changer les heures.

- **Excel** télécharge un vrai fichier `.xlsx`, utilisable hors ligne, avec une
  feuille par parcours/direction et une feuille pour les plages de fréquence.
  Les identifiants restent du texte, les heures des valeurs Excel au format
  `[h]:mm:ss` (donc sans retour à zéro après 24 h), les headways des minutes
  numériques. Les en-têtes et deux premières colonnes sont figés.
- **PDF** ouvre un aperçu épuré dans le rapport. Cliquer sur
  **Imprimer / Enregistrer en PDF**, puis choisir **Enregistrer au format PDF**
  dans le navigateur. La mise en page Lettre reprend celle du module 03 :
  deux directions côte à côte, codes de place horizontaux et grille compacte.
  Le format portrait ou paysage s’adapte au nombre de points ; un export de
  plusieurs routes utilise le paysage. Les voyages sont répartis sur autant de
  pages que nécessaire, en conservant chaque route séparée. Les directions non
  renseignées restent distinctes. Le sélecteur AM/PM / Military (24 h) règle les
  heures dans l’aperçu et à l’impression ; le suffixe `+1` indique le lendemain.
  Le headway reste calculé au premier point du parcours complet.
- Les services à fréquence sans départs fixes restent une liste de plages et
  d'intervalles dans les exports, sans inventer d'horaires précis.

Dans les options de génération, **Thème du rapport HTML** propose **Épuré compact**
(blanc, olive et lime, boutons à coins diagonaux) ou **Classique**. Ce choix est
indépendant du thème de l'application et de la langue. Il est conservé dans la
sauvegarde de travail, le HTML corrigé et le ZIP de retour. Les exports de timetables
utilisent toujours le style épuré. Les anciens rapports doivent être régénérés.

### Corrections du client dans le rapport HTML

Régénérez le rapport après une mise à jour de l'Assistant : les anciens fichiers
HTML ne changent pas automatiquement. Les filtres « Toutes », « Décision requise »
et « Sans décision » agissent sur le sommaire, les liens et les fiches. Les
catégories restent celles du diagnostic initial, et ne constituent pas une
validation automatique après modification.

La longueur maximale choisie est conservée dans la sauvegarde de travail et dans
le rapport HTML exporté. Les sauvegardes anciennes utilisent 6 caractères par
défaut. Changer ce réglage ne renomme ni ne tronque les places existantes : après
un retour de 8 à 6, les codes trop longs sont signalés et doivent être corrigés
avant l'export. Le réglage de casse reste indépendant.

Les champs de code et la vue de regroupement sont élargis pour afficher huit
caractères sans les couper, dans les trois thèmes. Les cartouches et la navigation
des nouveaux rapports HTML disposent également de plus de largeur. Les codes
et leur casse ne sont pas modifiés ; régénérer les anciens rapports pour profiter
de cette présentation.

Dans chaque fiche, le client peut modifier le code (1 à 6 ou 1 à 8 lettres ou
chiffres selon le choix initial, casse conservée) et la description de la place. La liste « Place attribuée » de
chaque stop permet de choisir une autre place du rapport. Les listes de stops,
compteurs, distances et repères cartographiques sont actualisés, sans déplacer
les coordonnées physiques des arrêts. Le fond de carte et son cadrage restent
fixes : un message signale les arrêts réaffectés en dehors du cadrage.

Les menus « Place attribuée / Assigned place » proposent les places par distance
croissante, avec la distance à vol d'oiseau du stop au centre de la place en mètres.
Ces menus sont aussi disponibles dans le tableau des stops hors périmètre.
Le bouton « Annuler la dernière modification / Undo » de chaque fiche annule une
modification à la fois (code, description ou affectation effectuée depuis cette
fiche), sans réinitialiser les autres places. Une saisie continue dans un champ
compte comme une modification. Si le même stop a ensuite été modifié ailleurs,
il faut annuler cette dernière affectation d'abord. L'historique d'annulation est
conservé dans le HTML corrigé, y compris celui contenu dans le ZIP de retour.

Dans les options de génération, **Simplifier le retour client** est coché par
défaut : les téléchargements séparés de `stops.txt` et `stop_times.txt` sont
masqués. Décocher cette option pour les rendre disponibles. Ce choix est conservé
dans la sauvegarde de travail et le rapport exporté.

- **Télécharger le ZIP de retour client** regroupe le rapport HTML corrigé,
  `GTFS_finalise.zip` (le GTFS complet mis à jour), un journal des modifications
  JSON et un fichier d'instructions. Le client transmet cette archive au chargé
  de projet, qui révise les changements avant d'utiliser le GTFS dans sa procédure
  d'import HASTUS. Aucun fichier source n'est écrasé.
- **Activer la sauvegarde automatique** : dans un navigateur compatible (notamment
  Chrome/Edge), choisir un fichier HTML de travail et autoriser son écriture.
  Les modifications sont ensuite enregistrées dans ce même fichier après environ
  deux secondes d’inactivité, sans téléchargement de copies successives. Garder
  le rapport initial séparément. L’indicateur confirme l’écriture, signale les
  changements en attente ou une erreur ; **Suspendre / Reprendre** contrôle l’autosave.
- **Enregistrer maintenant** force l’écriture dans le fichier choisi. Sans fichier
  connecté, ce bouton ouvre le sélecteur et active la sauvegarde. Après fermeture
  ou rechargement, ouvrir la copie de travail puis la sélectionner à nouveau pour
  réautoriser l’écriture : aucun accès au disque n’est activé silencieusement.
- **Télécharger une copie HTML** reste disponible, y compris lorsque l’écriture
  directe est indisponible. Il n’y a pas de dépendance au stockage du navigateur.
  Un téléchargement n’actualise pas le fichier de travail connecté.

Les écritures sont sérialisées ; les changements effectués pendant une sauvegarde
restent en attente jusqu’à leur propre enregistrement. Une erreur suspend l’autosave
et conserve l’alerte avant fermeture. Si le fichier a changé ailleurs, l’écriture
est bloquée : télécharger une copie et comparer les versions avant de poursuivre.
Ne pas travailler sur le même fichier depuis plusieurs onglets. Les brouillons
HTML conservent aussi les saisies invalides pour éviter leur perte ; les contrôles
de validité continuent à bloquer les exports GTFS, indépendamment de la sauvegarde.
Le ZIP final reste une action explicite, non régénérée à chaque modification.
Régénérer les anciens rapports pour bénéficier de cette fonctionnalité.

Test : `node tests/report-autosave.test.cjs`.

- **Télécharger stops.txt** produit les places renommées et les nouvelles
  associations `parent_station`. Les identifiants des stops physiques sont conservés.
- **Télécharger stop_times.txt** conserve les horaires, séquences et colonnes du
  GTFS enrichi à la génération du rapport. Une réaffectation de place ne remplace
  pas les stops physiques des voyages par des places.

Le rapport corrigé commence par un compte rendu avant/après : codes et
descriptions des places modifiés, puis stops réaffectés avec leur ancienne et
leur nouvelle place. La comparaison reste basée sur le rapport initial après
plusieurs sauvegardes. Les modifications annulées ne sont pas comptées et un
renommage seul n'est pas présenté comme une réaffectation des stops.

Le ZIP nécessite le GTFS complet chargé à la génération (ZIP ou dossier),
notamment `agency.txt`, `routes.txt`, `trips.txt`, `stops.txt`, `stop_times.txt`
et `calendar.txt` ou `calendar_dates.txt`. Les fichiers GTFS TXT et GeoJSON sont
embarqués dans le rapport et conservés dans le GTFS finalisé. Les références aux
identifiants de stops/places sont adaptées dans les tables annexes concernées,
par exemple `transfers.txt`, `pathways.txt` et `translations.txt`. Les fichiers
non concernés sont recopiés sans modification. Le rapport peut donc être plus
volumineux. La préparation du ZIP ne nécessite ni Internet ni bibliothèque externe.

En cas de doublon, de code invalide, de collision ou de référence incohérente,
l'export est bloqué avec un message. Les exports séparés restent bloqués si un
renommage nécessite aussi de modifier une table annexe : utiliser alors le ZIP.
Pour les exports séparés, remplacer les deux fichiers dans une **copie** du GTFS
d'origine. Un rapport sans GTFS complet reste modifiable et sauvegardable en
HTML, mais l'export ZIP est indisponible. Ces contrôles ne remplacent pas une
validation GTFS complète ni la revue du format d'import HASTUS du client.

Les fonctions de l'éditeur et de préparation de l'archive sont dans
`report-editor.js` et `report-package.js`, intégrées au HTML exporté : aucun
script externe n'est nécessaire chez le client. Tests :
`node tests/report-editor.test.cjs`, `node tests/report-network.test.cjs`,
`node tests/report-timetable-export.test.cjs`,
`node tests/report-package.test.cjs`, puis
`python tests/verify-report-package.py` (vérification indépendante des ZIP).
Test optionnel sur Metrobus : ajouter le chemin
de `googleFall2026November.zip` en argument (Python requis ; variable `PYTHON`
possible pour indiquer son exécutable).

Les exports de timetables sont embarqués depuis `report-timetable-export.js`.
`python tests/verify-timetable-xlsx.py` vérifie indépendamment les fichiers XLSX
de test avec `openpyxl` (lecture seule), leurs valeurs, styles et relations XML.

Le prototype ne modifie jamais les fichiers sources.
#   a s s i s t a n t - g t f s - h a s t u s - w i n d o w s  
 
