# Agenda — documentation de reprise

Ce document permet à une autre personne (ou à un éditeur) de reprendre l'application : comprendre le code, la compiler, la publier et transférer les comptes associés.

## 1. Vue d'ensemble

- Application Android construite avec **Capacitor 8** : l'interface est une page web (HTML/CSS/JS sans framework ni outil de build), le reste est du code natif Java.
- **Aucun serveur** : les données des utilisateurs restent sur le téléphone.
- Identifiant de l'appli : `com.arwin.agenda` (définitif une fois publiée sur Google Play).
- Version : champ `version` de `package.json` (repris automatiquement par Gradle) ; à garder égal à `CONFIG.appVersion` dans `www/premium.js`.

## 2. Arborescence

| Chemin | Rôle |
| --- | --- |
| `www/index.html` | Cœur de l'appli : agenda, vues, tâches, générateurs (priorisation, révisions), réglages |
| `www/premium.js` | Abonnement : page d'abonnement, verrouillage, gestion des statuts, aide & contact, nouveautés. **Bloc `CONFIG` en tête de fichier** |
| `www/theme.js`, `www/themes.css` | Thèmes et polices, transmission des couleurs aux widgets |
| `www/calendar-sync.js` | Synchronisation avec les agendas du téléphone |
| `www/analytics.js` | Statistiques anonymes Firebase (avec consentement) |
| `www/admin.js` | Onglet Admin du développeur (7 touchers sur le logo) : statuts de test, statistiques |
| `www/backup.js` | Copie de secours des données dans la sauvegarde Android |
| `www/fonts/` | Polices intégrées (licence SIL OFL) |
| `www/capacitor-plugins/` | Fichiers JS des plugins Capacitor (copiés depuis `node_modules`, pas de bundler) |
| `android/app/src/main/java/com/arwin/agenda/` | Code natif : widgets (Jour, Semaine, Mois, Liste), plugins `WidgetBridge` et `CalendarSync`, `MainActivity` |
| `tools/agenda-stats.gs` | Script Google Apps Script : synthèse des statistiques affichée dans l'onglet Admin |
| `.github/workflows/Build apk.yml` | Compilation automatique (APK de test + `.aab` signé) |

### Points d'extension entre fichiers

- `window.AgendaApp` (exposé par `index.html`) : accès aux tâches, sauvegarde, rafraîchissement.
- `window.AgendaHooks` (rempli par `calendar-sync.js`) : rendez-vous externes affichés et créneaux occupés pour les générateurs.
- `window.Premium` : `isPremium()`, `require(fonction, action)`, `openPaywall()`.
- Événement `agenda:premium` : émis à chaque changement de statut d'abonnement.

## 3. Compiler

Automatique à chaque push sur `main` (GitHub Actions). Artefacts produits :

- `agenda-debug-apk` : APK à installer directement pour tester ;
- `agenda-release-aab` : fichier à importer dans la Play Console.

### Secrets GitHub nécessaires

| Secret | Contenu |
| --- | --- |
| `AGENDA_KEYSTORE_BASE64` | Clé de signature (fichier keystore encodé en base64) |
| `AGENDA_KEYSTORE_PASSWORD`, `AGENDA_KEY_ALIAS`, `AGENDA_KEY_PASSWORD` | Mots de passe et alias de la clé |
| `GOOGLE_SERVICES_JSON` | Contenu de `google-services.json` (Firebase). Facultatif : sans lui, l'appli se compile sans statistiques |

En local : `npm ci`, `npx cap sync android`, puis `./gradlew assembleDebug` ou `bundleRelease` dans `android/` avec les variables d'environnement `AGENDA_KEYSTORE_*`.

> La clé de signature est **indispensable** : sans elle, impossible de publier une mise à jour de l'appli. À conserver en lieu sûr et à transmettre en main propre en cas de cession.

## 4. Passer du mode démo au vrai paiement

Dans `www/premium.js`, bloc `CONFIG` :

1. `demo: false`
2. `revenueCatApiKey: 'goog_…'` (clé publique Android du projet RevenueCat)
3. `entitlementId: 'premium'` (droit défini dans RevenueCat)
4. `supportEmail`, `termsUrl`, `privacyUrl`

Côté Play Console : un abonnement mensuel et un annuel (essai de 14 jours en offre). Côté RevenueCat : le droit `premium` et une offre courante contenant les packages Mensuel et Annuel. Les prix affichés viennent alors du Play Store. En mode réel, l'onglet Admin ne peut plus modifier le statut d'abonnement.

## 5. Comptes et services à transférer

| Service | Usage | Transfert |
| --- | --- | --- |
| GitHub | Code et compilation | Transfert du dépôt (Settings › Transfer) + recréation des secrets |
| Google Play Console | Publication, abonnements | Transfert d'application entre comptes développeur (procédure Google) |
| Firebase | Statistiques | Ajout du nouveau propriétaire au projet, puis retrait de l'ancien |
| Google Apps Script | Synthèse des statistiques | Recréer le script sous le compte du repreneur (`tools/agenda-stats.gs`) |
| RevenueCat | Paiements | Transfert du projet ou invitation du repreneur |

## 6. Points de vigilance

- Les données sont **locales** : aucune migration serveur, mais aucune récupération possible si l'utilisateur perd son téléphone sans sauvegarde Android ni export.
- La synchronisation d'agenda n'écrit que dans l'agenda dédié « Agenda (appli) » ; elle ne modifie jamais les agendas personnels.
- Exigence Google Play : relever `targetSdkVersion` (dans `android/variables.gradle`) chaque année.
- Les widgets ne lisent pas le code web : ils lisent les données et le thème transmis via les préférences natives (`CapacitorStorage`).
