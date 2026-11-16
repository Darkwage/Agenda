/**
 * Agenda — synthèse des statistiques Google Analytics (Firebase) pour l'onglet Admin.
 *
 * INSTALLATION (une seule fois) :
 * 1. script.google.com › Nouveau projet › collez ce fichier à la place du contenu.
 * 2. À gauche « Services » (+) › « Google Analytics Data API » › Ajouter.
 * 3. ⚙ Paramètres du projet › Propriétés du script › ajoutez :
 *      PROPERTY_ID = l'identifiant numérique de la propriété Google Analytics
 *                    (Google Analytics › Admin › Paramètres de la propriété)
 *      TOKEN       = un code secret de votre choix (ex. 20 caractères au hasard)
 * 4. Déployer › Nouveau déploiement › type « Application Web »
 *      Exécuter en tant que : Moi    —    Qui a accès : Tout le monde
 *    Autorisez l'accès demandé, puis copiez l'URL (…/exec).
 * 5. Dans l'appli : onglet Admin › « Tous les utilisateurs » › collez l'URL et le code.
 */
function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token || !e || !e.parameter || e.parameter.token !== token) {
    return json({ error: 'Accès refusé' });
  }
  var property = 'properties/' + props.getProperty('PROPERTY_ID');
  var days = Math.min(90, Math.max(1, parseInt(e.parameter.days, 10) || 30));
  var range = [{ startDate: days + 'daysAgo', endDate: 'today' }];
  try {
    var out = { generatedAt: new Date().toISOString(), days: days };

    out.activeUsers = {
      d7: metric(property, [{ startDate: '7daysAgo', endDate: 'today' }], 'activeUsers'),
      d30: metric(property, [{ startDate: '30daysAgo', endDate: 'today' }], 'activeUsers')
    };

    var ev = AnalyticsData.Properties.runReport({
      dateRanges: range,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      limit: 200
    }, property);
    out.events = (ev.rows || []).map(function (r) {
      return { name: r.dimensionValues[0].value, count: +r.metricValues[0].value, users: +r.metricValues[1].value };
    });

    // Répartition gratuit / essai / Premium : nécessite la dimension personnalisée
    // « plan » (portée Utilisateur) déclarée dans Google Analytics. Facultatif.
    try {
      var pl = AnalyticsData.Properties.runReport({
        dateRanges: range,
        dimensions: [{ name: 'customUser:plan' }],
        metrics: [{ name: 'activeUsers' }]
      }, property);
      out.plans = (pl.rows || []).map(function (r) {
        return { plan: r.dimensionValues[0].value, users: +r.metricValues[0].value };
      });
    } catch (err) { out.plans = null; }

    return json(out);
  } catch (err) {
    return json({ error: String(err && err.message || err) });
  }
}

function metric(property, range, name) {
  var r = AnalyticsData.Properties.runReport({ dateRanges: range, metrics: [{ name: name }] }, property);
  return r.rows && r.rows.length ? +r.rows[0].metricValues[0].value : 0;
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
