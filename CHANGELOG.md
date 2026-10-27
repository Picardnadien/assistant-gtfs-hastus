# Notes de version

## 14.0 — 2026-10-27

- Thème Épuré avec interrupteur clair/foncé ; parcours Préparation GTFS et Diagnostic du réseau, outils complémentaires repliables.
- Conservation du mapping HASTUS et priorité aux places existantes dans le rayon ; contrôle des coordonnées manquantes.
- Repère cartographique commun en fenêtre/plein écran, stops voisins facultatifs et infobulles détaillées.
- Corrections HASTUS séparées des sources : rattachements, références, descriptions et coordonnées. CSV proposé (format d'import à confirmer), journal avant/après et note d'impact HTML.
- Coordonnées calculées signalées ; références incohérentes et coordonnées invalides bloquent l'export. Les cartes restent le diagnostic source avant correction.
- Libellé « Est une place de référence », corrections conservées dans le projet et le rapport HTML ; toute correction dans le rapport remet les validations en attente.
- Accueil bilingue : notes v14, accès à la v13.12 archivée et lien externe vers ATP Data Cleanup.
- Régénérer les rapports HTML existants pour bénéficier de ces changements. Le CSV de corrections est un format proposé, à confirmer avant import HASTUS ; aucun script OIR de réaffectation n'est fourni.

## 13.12 — 2026-10-20

- Diagnostic HTML : deux listes, validations principales et liste secondaire. Stops sans coordonnées dans des fiches dédiées, sans position inventée ni validation géographique.
- Correctif du tri secondaire : uniquement les stops sans localisation et les fiches dont le seul motif est « Stops non TP à vérifier » / « Non-timing-point stops to review ». Les regroupements, références et autres alertes restent dans la liste principale. L'absence de lien deadhead ou de coordonnées de place ne suffit plus à mettre un cas à part ; les filtres dédiés restent disponibles.
- Validation par lot des cas visibles similaires (même type de fiche, mêmes motifs et catégories), avec confirmation, retour en attente et journal individuel. Les notes et préconisations CSched sont conservées. Aucune correction GTFS/HASTUS n'est appliquée.
- Listes intégrées à la recherche, la revue plein écran, l'autosauvegarde, la sélection client et aux exports CSV/PDF. Les sources restent intactes ; régénérer les anciens rapports.
- Retrait des thèmes Classique et Gen Z de la version courante. Les anciennes préférences migrent vers Épuré compact ; Épuré sombre reste disponible.
- Accueil : ajout de la v13.02 aux versions antérieures, isolée des sauvegardes navigateur de la version courante.

## 13.02 — 2026-10-20

- Sommaire HTML repliable, choix regroupé/non regroupé et filtres compacts sur une rangée.
- Sélection indépendante des fiches à proposer au client et export HTML réellement limité à ces fiches et leur contexte, avec journal limité et brouillon distinct.
- Cases d’affichage par couche et par place sur chaque carte ; réglages conservés dans le navigateur, les copies HTML, la revue plein écran et l’impression, sans modifier les données ni les validations.

- Filtres deadhead et début/fin devenus stricts : toutes les places d’un cas doivent satisfaire chaque filtre actif. Les rapprochements mixtes sont exclus, notamment les places sans lien HLP.
- Sommaire HTML regroupé par place, motifs de validation cliquables, tri par code et suppression de la pagination. Chargement différé du contenu des fiches et des cartes ; notes et validations restent distinctes par cas.

- Import facultatif de la matrice deadhead/HLP HASTUS (`linkdt`) à côté des stops et versions de routes. Liens directs entrants/sortants sur les fiches, filtre dédié combinable avec début/fin, CSV/PDF et sauvegarde de l’index. Distinction entre matrice absente et absence de lien dans l’export ; aucun héritage implicite par référence. Import et retrait sans effacer les décisions.

- Diagnostic des places et références : nouvelle alerte « Stops éloignés de leur place », distances affichées dans les fiches et sur les étiquettes des stops concernés. Seuil indépendant de 0 à 1 000 m, réglable par curseur ou saisie dans l’application (500 m par défaut), conservé dans les sauvegardes.
- Filtre début/fin de voyage dans l’application et le rapport HTML. Identification par la séquence complète des voyages GTFS ou par les extrémités des versions de routes HASTUS ; toutes les places du cas doivent satisfaire chaque filtre actif.
- Champ « Préconisation CSched » distinct de la note de décision, en mode normal et en revue plein écran. Conservé dans le brouillon, la sauvegarde HTML, le journal et les exports CSV/PDF. Modifier la préconisation remet la fiche à valider.
- Fonctionnalités bilingues FR/EN. Régénérer les rapports pour en bénéficier. Les distances sont à vol d’oiseau vers le centre de place utilisé par l’analyse, éventuellement calculé à partir des stops, et non des distances routières.
- Accueil public : présentation générique de la démonstration et de la revue privée, sans mention de client.

## 13.01 — 2026-10-15

- Carte des fiches HTML : clic pour afficher uniquement la carte sur tout l’écran, cadrée autour des stops avec identifiants et descriptions lisibles. Second clic pour revenir à la vue précédente. Recherche, défilement et tableaux ouverts/fermés conservés ; mode revue séparé. Accessible au clavier, cartes en ligne et hors ligne, FR/EN.
- Rapport HTML : une fiche trouvée par recherche reste visible pendant son renommage, jusqu’au changement de recherche ou de filtre.
- Compte rendu : validations complètes repliées par défaut, commande Afficher/Masquer, liste compacte et statut sur une ligne, en français et en anglais.
- Liste des validations : codes et descriptions cliquables vers la fiche de place ; chaque stop ouvre sa place actuellement affectée, même après réaffectation ou recherche.
- Statut interactif : bouton ambre « À valider » / vert « Validée », synchronisé avec la fiche et le mode revue. Le retour en attente demande confirmation. Les choix sont conservés dans le rapport sauvegardé.
- ZIP GTFS finalisé : sous-dossier `hastus_import/places` avec `places.csv` (codes/descriptions finaux) et copie du script `place - GTFS DESC.oir`. Contrôle des caractères incompatibles avec le modèle d’import. Import dans HASTUS à confirmer.
- Régénérer les rapports HTML existants pour utiliser ces corrections.

### Correctif v13.0 — distances en revue

- Réglage commun « Distances : Masquées / Petites / Grandes » dans le mode normal et les trois dispositions de revue, mémorisé dans le navigateur et le HTML sauvegardé.

- Mode « Maximum map » : distances à vol d’oiseau visibles entre les centres des places liées ou proposées au rapprochement, avec codes et mètres dans des pastilles contrastées. Disponible en français/anglais, cartes en ligne/hors ligne et filtre TP. Les rapports existants doivent être régénérés.

## 13.0 — 2026-10-07

- **Accueil en ligne avec choix de version** : v13 recommandée et accès aux v12, v11 et v10. Les archives utilisent des espaces navigateur distincts ; travailler sur une copie des dossiers avec une ancienne version.
- **Scénarios de revue** : démonstration publique fictive bilingue et ouverture d’un rapport HTML privé depuis l’appareil, sans téléversement. Les rapports OC Transpo non anonymisés restent exclusivement locaux.
- **Workflows simplifiés** : regroupement géographique, cartes et timetables unifiées, comparaison des horaires, scheduling units, rapports et exports.
- **Diagnostic HTML HASTUS** : références et places clairement identifiées, liens en pointillés sur les cartes, distinctions TP/non TP, filtre TP, sommaire compact et titres sans doublons.
- **Étiquettes de places** : Stop IDs rattachés affichés en compact, avec « +N » pour les longues listes et détail complet conservé dans les fiches.
- **Revue plein écran** : carte maximale, panneau de détails repliable, dispositions Carte et Comparaison, adaptation aux dimensions réelles de l’écran et navigation discrète. Valider reste aussi possible en mode normal.
- **Suivi des décisions** : validations et notes horodatées, annulation, compte rendu avant/après, journal CSV et reprise dans le HTML enregistré. Les validations du diagnostic ne modifient pas les affectations GTFS/HASTUS.
- **Auto save et accompagnement** : brouillon navigateur, écriture dans un même fichier après autorisation, tutoriel guidé bilingue, thème Confort visuel et commandes adaptées au tactile.
- **Rapport HTML de validation des places** : revue client, validations par place, consultation des alternatives et compte rendu enrichi avec les stops et descriptions.
- **Sauvegardes de l’application** : reprise automatique de la dernière sauvegarde, nom de l’agence et date/heure dans le fichier d’état ; compatibilité avec les anciennes sauvegardes.

### Mise à jour et iPad

Sauvegarder le travail avant la mise à jour. Régénérer les rapports HTML pour
obtenir les nouveaux contrôles ; les anciens rapports ne changent pas seuls.
Sur iPad, ouvrir le rapport dans un navigateur capable d’exécuter son JavaScript,
pas uniquement dans un aperçu de pièce jointe. L’écriture directe dépend du
navigateur ; télécharger une copie HTML pour transmettre ou conserver la revue.
Le brouillon navigateur seul ne constitue pas une sauvegarde durable.
Les essais couvrent des résolutions tablette simulées ; une vérification sur
l’iPad réel reste nécessaire. Aucun GTFS ni rapport client n’est publié.

## 12.0 — 2026-10-06

- Nouveau nom : **The GTFS Missing Link**, conservé en français et en anglais.
- Harmonisation des typographies, boutons, champs et cartes des thèmes **Épuré compact** et **Épuré sombre**.
- **Tutoriel bilingue** accessible depuis le bandeau supérieur : sept étapes, sommaire cliquable, navigation Précédent / Suivant et fermeture sans modifier le projet.
- **Annuler / Rétablir par place** pour les changements de code et de description, en remplacement du menu des suggestions. Une saisie complète constitue une étape ; les rayons et affectations ne sont pas modifiés. Historique limité à la session.
- **Cartes et timetables** : même présentation que le module 03, à l’écran et en PDF, avec deux directions côte à côte, variantes regroupées, codes de place, headways et choix AM/PM ou 24 h. Chargement des grilles à l’ouverture de chaque route et conservation des filtres et exports Excel.
- **Rapport HTML client** : logo CSched dans le menu latéral et enregistrement direct dans un fichier choisi, avec sauvegarde automatique facultative, pause/reprise, suivi des changements et protection en cas de modification externe du fichier. Le téléchargement d’une copie reste disponible.
- Tests supplémentaires pour l’historique des noms, le tutoriel bilingue, les timetables partagées et les scénarios d’enregistrement des rapports.

### Mise à jour et validation

Sauvegarder le travail avant la mise à jour, puis recharger avec **Ctrl + F5**.
Régénérer les rapports HTML pour bénéficier des nouvelles fonctions ; les rapports
déjà envoyés ne sont pas modifiés automatiquement. L’enregistrement direct exige
un navigateur compatible et l’autorisation explicite d’écrire le fichier ; cette
autorisation doit être redonnée après réouverture. Les écritures sont couvertes
par des tests automatisés, mais restent à confirmer avec le sélecteur natif sur
le poste client. Les données GTFS, rapports clients et sorties locales ne sont
pas publiés dans cette version.

## 11.0 — 2026-10-06

- **Comparaison des horaires** : identification des horaires distincts du réseau, détection des variations récurrentes ou ponctuelles et proposition de dates représentatives à importer dans HASTUS. Les exceptions de calendrier sont prises en compte ; un plan d’import CSV est disponible.
- **Voir cette journée** : synthèse des voyages par route et par direction, avec distinction entre départs fixes et services par intervalle.
- **Timetable PDF par route et par jour** : présentation de travail compacte, deux directions côte à côte, variantes regroupées, headways et pagination des grandes grilles, en français ou en anglais.
- En-têtes utilisant les **codes de place affectés**, y compris les modifications du regroupement et les données working. Les arrêts sans place sont signalés dans la légende ; la colonne bloc est retirée.
- Sélecteur **AM/PM / Military (24 h)** dans l’aperçu imprimable, heures du lendemain identifiées et style épuré avec lignes alternées.
- Corrections du placement des jours dans le calendrier, de la validation des dates GTFS et de l’affichage sombre des résultats horaires.
- Tests supplémentaires sur les calendriers, les exceptions, les affectations de places, les variantes, les fréquences et les formats horaires.

### Mise à jour et validation

Sauvegarder le travail, mettre à jour l’application puis la recharger. Régénérer
les aperçus et rapports concernés pour utiliser les nouvelles fonctions.
Les dates proposées restent à valider avant import dans HASTUS. Deux voyages
alignés dans les directions opposées ne constituent pas un enchaînement véhicule
garanti. Les GTFS et rapports clients locaux ne sont pas inclus dans cette version.

## 10.0 — 2026-10-05

- Nouveau thème **Épuré sombre**, logo CSched dans l’en-tête et commandes français/anglais améliorées.
- Réglages initiaux : rayon de **200 m**, codes de place de **8 caractères**, rapports **paysage**, cartes HTML **en ligne** et langue suivant celle de l’interface. Les choix explicites des sauvegardes restent prioritaires.
- Module **Scheduling units** en bas de page : génération depuis `routes.txt`, clé `route_id` par défaut ou `route_short_name`, export avec le script OIR dans `hastus_import/`.
- Champs de saisie des rayons de **0 à 1 000 m**, synchronisés avec les curseurs.
- Nommage des places : conservation de `St` lorsqu’il désigne Saint et reconnaissance des stations/gares, terminus, hubs et pôles d’échanges. Suffixes dédiés, dont **STN**, dans les limites de 6 ou 8 caractères.
- Champs et présentations élargis pour les codes de huit caractères.
- Tests de non-régression pour les préférences, le nommage, les rayons, les imports, les rapports et les sauvegardes.

### Mise à jour

Sauvegarder le travail avant de remplacer les fichiers et de relancer l’application.
Régénérer les rapports HTML pour bénéficier des changements ; les fichiers déjà
envoyés aux clients ne sont pas modifiés automatiquement.

### Points de vigilance

Le nommage des lieux reste une heuristique à valider. Le format scheduling units
est testé localement ; son exécution dans HASTUS reste à confirmer. Certains
libellés historiques des écrans d’analyse restent en français.
