# Notes de version

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
