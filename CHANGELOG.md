# Notes de version

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
