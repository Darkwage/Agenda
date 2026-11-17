/* ==========================================================================
   Agenda — onglet Admin (réservé au développeur) + statistiques d'usage
   --------------------------------------------------------------------------
   • Accès : touchez 7 fois le logo « Agenda » en haut de l'écran.
     L'onglet « Admin » apparaît alors dans la barre d'onglets, sur cet
     appareil uniquement. Il se masque depuis l'onglet lui-même.
   • Statut : bascule libre entre gratuit, essai, Premium, résilié, expiré.
     Ne fonctionne qu'en mode démo (Premium.config.demo = true).
   • Statistiques : compteurs d'utilisation enregistrés SUR CET APPAREIL
     uniquement. Rien n'est envoyé nulle part.
   ========================================================================== */
(function(){
  'use strict';

  var ADMIN_KEY = 'agenda_admin_enabled';
  var STATS_KEY = 'agenda_stats_v1';
  var ADMIN_CODE = '';          // facultatif : code demandé à l'activation (ex. '4821'). Vide = pas de code.
  var TAPS_TO_UNLOCK = 7;
  var DAY = 24 * 3600 * 1000;

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function todayIso(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fmtDate(ts){ try{ return new Date(ts).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' }); }catch(e){ return ''; } }
  function fmtAgo(ts){
    if(!ts) return 'jamais';
    var d = Math.floor((Date.now() - ts) / DAY);
    if(d <= 0) return 'aujourd’hui';
    if(d === 1) return 'hier';
    return 'il y a ' + d + ' j';
  }
  function readJson(key, fallback){ try{ var v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }catch(e){ return fallback; } }

  /* ----------------------------------------------------------------------
     CATALOGUE DES FONCTIONNALITÉS SUIVIES
     ---------------------------------------------------------------------- */
  var CATALOG = [
    ['Navigation', [
      ['nav:calendar', 'Onglet Calendrier'], ['nav:list', 'Onglet Liste'],
      ['nav:generators', 'Onglet Générateurs'], ['nav:left', 'Onglet Réglages']
    ]],
    ['Calendrier', [
      ['view:day', 'Vue Jour'], ['view:week', 'Vue Semaine'], ['view:month', 'Vue Mois'],
      ['cal:browse', 'Navigation ‹ ›'], ['cal:today', 'Bouton Aujourd’hui'], ['cal:filters', 'Filtres']
    ]],
    ['Tâches', [
      ['task:new', 'Nouvelle tâche'], ['task:saved', 'Tâche enregistrée']
    ]],
    ['Générateurs', [
      ['gen:planner', 'Priorisation automatique'], ['gen:revision', 'Programme de révisions']
    ]],
    ['Réglages', [
      ['set:categories', 'Catégories'], ['set:groups', 'Groupes'], ['set:birthdays', 'Anniversaires'],
      ['set:backup', 'Sauvegarde'], ['set:export', 'Export'], ['set:import', 'Import'],
      ['set:notif-test', 'Test du bip'], ['set:theme', 'Changement de thème'], ['set:font', 'Changement de police'], ['sync:import', 'Affichage des agendas du téléphone'], ['sync:export', 'Envoi vers l\u2019agenda du téléphone']
    ]],
    ['Abonnement', [
      ['pw:open', 'Page d’abonnement affichée'], ['pw:trial', 'Essai démarré'], ['pw:purchase', 'Abonnement souscrit'],
      ['pw:restore', 'Restauration d’achat'], ['sub:manage', 'Gérer l’abonnement'], ['widget:locked-tap', 'Widget verrouillé touché']
    ]],
    ['Aide', [
      ['help:tutorial', 'Tutoriel (rouvert)'], ['tutorial:done', 'Tutoriel terminé'], ['tutorial:skip', 'Tutoriel passé'], ['help:faq', 'Questions fréquentes'], ['help:report', 'Signaler un problème'], ['help:news', 'Nouveautés']
    ]]
  ];
  var LABELS = {};
  CATALOG.forEach(function(g){ g[1].forEach(function(f){ LABELS[f[0]] = f[1]; }); });

  /* Clics → clé de fonctionnalité. */
  var CLICK_MAP = [
    ['nav.view-tabs button[data-panel="calendar"]', 'nav:calendar'],
    ['nav.view-tabs button[data-panel="list"]', 'nav:list'],
    ['nav.view-tabs button[data-panel="generators"]', 'nav:generators'],
    ['nav.view-tabs button[data-panel="left"]', 'nav:left'],
    ['#view-switch [data-view="day"]', 'view:day'],
    ['#view-switch [data-view="week"]', 'view:week'],
    ['#view-switch [data-view="month"]', 'view:month'],
    ['#prev-btn', 'cal:browse'], ['#next-btn', 'cal:browse'],
    ['#today-btn', 'cal:today'], ['#filters-toggle', 'cal:filters'],
    ['#open-add-btn', 'task:new'], ['#fab-add', 'task:new'],
    ['#submit-btn', 'task:saved'],
    ['#planner-open-btn', 'gen:planner'], ['#open-rev-btn', 'gen:revision'],
    ['#cat-details > summary', 'set:categories'], ['#group-details > summary', 'set:groups'],
    ['#bday-details > summary', 'set:birthdays'], ['#backup-details > summary', 'set:backup'],
    ['#export-btn', 'set:export'], ['#import-btn', 'set:import'], ['#notif-test-btn', 'set:notif-test']
  ];

  /* ----------------------------------------------------------------------
     STATISTIQUES (locales)
     ---------------------------------------------------------------------- */
  function loadStats(){
    var s = readJson(STATS_KEY, null);
    if(!s || typeof s !== 'object') s = {};
    s.since = s.since || Date.now();
    s.counts = s.counts || {};
    s.last = s.last || {};
    s.days = s.days || {};
    s.sessions = s.sessions || 0;
    return s;
  }
  var stats = loadStats();
  var saveTimer = null;
  function saveStats(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){ try{ localStorage.setItem(STATS_KEY, JSON.stringify(stats)); }catch(e){} }, 300);
  }

  function track(key){
    if(!key) return;
    stats.counts[key] = (stats.counts[key] || 0) + 1;
    stats.last[key] = Date.now();
    var d = todayIso();
    stats.days[d] = (stats.days[d] || 0) + 1;
    var keys = Object.keys(stats.days);
    if(keys.length > 400){ keys.sort().slice(0, keys.length - 400).forEach(function(k){ delete stats.days[k]; }); }
    saveStats();
    try{ if(window.AgendaAnalytics) window.AgendaAnalytics.log(key); }catch(e){}
    if(adminVisible()) renderStats();
  }

  function trackSession(){
    stats.sessions++;
    var d = todayIso();
    stats.days[d] = stats.days[d] || 0;
    saveStats();
  }

  window.AgendaStats = { track: track };

  document.addEventListener('click', function(e){
    var t = e.target;
    if(!t || !t.closest) return;
    if(t.closest('#panel-admin')) return; // les clics de l'admin ne comptent pas
    for(var i = 0; i < CLICK_MAP.length; i++){
      if(t.closest(CLICK_MAP[i][0])){ track(CLICK_MAP[i][1]); return; }
    }
  }, true);

  /* Contenu réellement créé : souvent plus parlant que les clics. */
  function contentSnapshot(){
    var tasks = readJson('agenda_planner_tasks_v1', []);
    if(!Array.isArray(tasks)) tasks = [];
    var archived = readJson('agenda_archived_tasks_v1', []);
    var batches = readJson('agenda_planner_batches_v1', {});
    var bdays = readJson('agenda_birthdays_v1', []);
    var cats = readJson('agenda_categories_v1', []);
    var groups = readJson('agenda_groups_v1', []);
    var series = {}, plans = {};
    var n = { active:0, done:0, recurring:0, reminder:0, planner:0, revision:0 };
    tasks.forEach(function(t){
      if(!t || typeof t !== 'object') return;
      if(t.done) n.done++; else n.active++;
      if(t.recurrenceId){ n.recurring++; series[t.recurrenceId] = 1; }
      if(t.reminder) n.reminder++;
      if(t.source === 'planner') n.planner++;
      if(t.revision){ n.revision++; if(t.planId) plans[t.planId] = 1; }
    });
    return [
      ['Tâches en cours', n.active],
      ['Tâches terminées', n.done],
      ['Tâches archivées', Array.isArray(archived) ? archived.length : 0],
      ['Séries récurrentes', Object.keys(series).length],
      ['Rappels (sans créneau)', n.reminder],
      ['Lots de priorisation', batches && typeof batches === 'object' ? Object.keys(batches).length : 0],
      ['Sessions créées par la priorisation', n.planner],
      ['Programmes de révisions', Object.keys(plans).length],
      ['Séances de révision', n.revision],
      ['Anniversaires', Array.isArray(bdays) ? bdays.length : 0],
      ['Catégories', Array.isArray(cats) ? cats.length : (cats && typeof cats === 'object' ? Object.keys(cats).length : 0)],
      ['Groupes', Array.isArray(groups) ? groups.length : (groups && typeof groups === 'object' ? Object.keys(groups).length : 0)]
    ];
  }

  /* ----------------------------------------------------------------------
     ACCÈS : 7 touchers sur le logo
     ---------------------------------------------------------------------- */
  function adminEnabled(){ return localStorage.getItem(ADMIN_KEY) === '1'; }

  var taps = 0, tapTimer = null;
  function onBrandTap(){
    if(adminEnabled()){ return; }
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function(){ taps = 0; }, 1500);
    if(taps >= TAPS_TO_UNLOCK){
      taps = 0;
      if(ADMIN_CODE){
        var code = window.prompt('Code administrateur');
        if(code !== ADMIN_CODE) return;
      }
      try{ localStorage.setItem(ADMIN_KEY, '1'); }catch(e){}
      installTab();
      showAdmin();
    }
  }

  /* ----------------------------------------------------------------------
     ONGLET ADMIN
     ---------------------------------------------------------------------- */
  var tabBtn = null, panel = null;

  function adminVisible(){ return panel && panel.classList.contains('is-on'); }

  function installTab(){
    // Bouton rond en haut à droite de l'en-tête (hors de la barre d'onglets).
    var header = document.querySelector('.app-header');
    if(header && !tabBtn){
      tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.className = 'admin-btn';
      tabBtn.textContent = '\u2699\ufe0e';
      tabBtn.setAttribute('aria-label', 'Admin');
      tabBtn.title = 'Admin';
      header.appendChild(tabBtn);
      tabBtn.addEventListener('click', function(){ if(adminVisible()) closeToCalendar(); else showAdmin(); });
      // Quand un onglet est choisi, on referme l'Admin.
      var nav = document.querySelector('nav.view-tabs.mobile-only');
      if(nav) nav.addEventListener('click', function(e){
        if(e.target.closest('button[data-panel]')) hideAdmin();
      });
    }
    if(!panel) buildPanel();
  }

  function removeTab(){
    hideAdmin();
    if(tabBtn){ tabBtn.remove(); tabBtn = null; }
    try{ localStorage.removeItem(ADMIN_KEY); }catch(e){}
    var cal = document.querySelector('nav.view-tabs button[data-panel="calendar"]');
    if(cal) cal.click();
  }

  function showAdmin(){
    if(!panel) buildPanel();
    ['panel-calendar', 'panel-list', 'panel-left'].forEach(function(id){
      var el = $(id); if(el) el.classList.add('hide-mobile');
    });
    var left = $('panel-left'); if(left) left.classList.remove('mobile-gen');
    document.querySelectorAll('nav.view-tabs.mobile-only button').forEach(function(b){ b.classList.remove('active'); });
    if(tabBtn) tabBtn.classList.add('active');
    panel.classList.add('is-on');
    document.body.classList.add('admin-open');
    renderAll();
    window.scrollTo(0, 0);
  }

  function closeToCalendar(){
    hideAdmin();
    var cal = document.querySelector('nav.view-tabs button[data-panel="calendar"]');
    if(cal) cal.click();
  }

  function hideAdmin(){
    if(panel) panel.classList.remove('is-on');
    document.body.classList.remove('admin-open');
    if(tabBtn) tabBtn.classList.remove('active');
  }

  var STATUS_BUTTONS = [
    ['free', 'Gratuit'],
    ['trial', 'Essai (14 j)'],
    ['monthly', 'Premium mensuel'],
    ['annual', 'Premium annuel'],
    ['cancelled', 'Résilié (expire dans 1 min)'],
    ['expired', 'Expiré']
  ];

  function buildPanel(){
    panel = document.createElement('section');
    panel.id = 'panel-admin';
    panel.className = 'admin-panel';
    panel.innerHTML =
      '<div class="admin-head"><h2 class="section-title">Admin</h2>' +
      '<button type="button" class="modal-close admin-close" data-a="close" aria-label="Fermer">✕</button></div>' +
      '<p class="field-hint admin-intro">Visible uniquement sur cet appareil. Les actions faites ici ne sont pas comptées dans les statistiques.</p>' +

      '<section class="card">' +
        '<h3 class="admin-h3">Statut d’abonnement</h3>' +
        '<div id="admin-status" class="admin-status"></div>' +
        '<div class="admin-grid" id="admin-status-btns">' +
          STATUS_BUTTONS.map(function(b){ return '<button type="button" class="btn-ghost" data-s="' + b[0] + '">' + esc(b[1]) + '</button>'; }).join('') +
        '</div>' +
        '<div class="admin-grid admin-grid-2">' +
          '<button type="button" class="btn-ghost" data-a="reset-trial">Réinitialiser l’essai</button>' +
          '<button type="button" class="btn-ghost" data-a="paywall">Voir la page d’abonnement</button>' +
          '<button type="button" class="btn-ghost" data-a="news">Voir les nouveautés</button>' +
          '<button type="button" class="btn-ghost" data-a="reset-all">Tout remettre à zéro</button>' +
        '</div>' +
      '</section>' +

      '<section class="card">' +
        '<h3 class="admin-h3">Statistiques d’utilisation</h3>' +
        '<div id="admin-kpis" class="admin-kpis"></div>' +
        '<div id="admin-top"></div>' +
        '<div id="admin-unused"></div>' +
        '<details class="admin-details"><summary>Détail par rubrique</summary><div id="admin-groups"></div></details>' +
        '<div class="admin-grid admin-grid-2" style="margin-top:12px;">' +
          '<button type="button" class="btn-ghost" data-a="copy">Copier les données</button>' +
          '<button type="button" class="btn-ghost" data-a="reset-stats">Remettre à zéro</button>' +
        '</div>' +
      '</section>' +

      '<section class="card">' +
        '<h3 class="admin-h3">Statistiques de tous les utilisateurs</h3>' +
        '<div id="admin-global" class="sub-line"></div>' +
        '<div id="admin-remote"></div>' +
        '<details class="admin-details" id="admin-remote-cfg"><summary>Connexion au script de synthèse</summary>' +
          '<input type="url" id="admin-remote-url" class="admin-input" placeholder="URL du script (…/exec)">' +
          '<input type="password" id="admin-remote-token" class="admin-input" placeholder="Code secret (TOKEN)">' +
          '<button type="button" class="btn-ghost" data-a="remote-save" style="width:100%;">Enregistrer</button>' +
        '</details>' +
        '<div class="admin-grid admin-grid-2">' +
          '<button type="button" class="btn-primary" data-a="remote-load" style="grid-column:1 / -1;">Actualiser la synthèse</button>' +
          '<button type="button" class="btn-ghost" data-a="firebase">Ouvrir Firebase Analytics</button>' +
          '<button type="button" class="btn-ghost" data-a="consent-reset">Redemander le consentement</button>' +
        '</div>' +
      '</section>' +

      '<section class="card">' +
        '<h3 class="admin-h3">Contenu créé dans l’appli</h3>' +
        '<div id="admin-content"></div>' +
      '</section>' +

      '<button type="button" class="btn-ghost admin-hide" data-a="hide-tab">Masquer l’onglet Admin</button>';

    var layout = document.querySelector('.layout');
    (layout ? layout.parentNode : document.body).insertBefore(panel, layout ? layout.nextSibling : null);

    panel.addEventListener('click', function(e){
      var s = e.target.closest('[data-s]');
      if(s){ setStatus(s.getAttribute('data-s')); return; }
      var a = e.target.closest('[data-a]'); if(!a) return;
      var act = a.getAttribute('data-a');
      var P = window.Premium;
      if(act === 'close'){ closeToCalendar(); }
      else if(act === 'reset-trial'){ if(P && P._admin){ P._admin.setState({ trialUsed:false }); renderStatus(); } }
      else if(act === 'paywall'){ if(P) P.openPaywall(null); }
      else if(act === 'news'){ if(P && P.openNews) P.openNews(); }
      else if(act === 'reset-all'){
        if(P && P._admin && window.confirm('Remettre l’abonnement à l’état « première installation » ?')){ P._admin.reset(); renderStatus(); }
      }
      else if(act === 'reset-stats'){
        if(window.confirm('Effacer toutes les statistiques ?')){
          stats = { since:Date.now(), counts:{}, last:{}, days:{}, sessions:0 };
          try{ localStorage.setItem(STATS_KEY, JSON.stringify(stats)); }catch(e2){}
          renderStats();
        }
      }
      else if(act === 'copy'){ copyStats(); }
      else if(act === 'remote-save'){
        try{
          localStorage.setItem(REMOTE_KEY, JSON.stringify({ url: $('admin-remote-url').value.trim(), token: $('admin-remote-token').value.trim() }));
        }catch(e2){}
        $('admin-remote-cfg').open = false;
        loadRemote();
      }
      else if(act === 'remote-load'){ loadRemote(); }
      else if(act === 'firebase'){
        var l = document.createElement('a'); l.href = 'https://console.firebase.google.com/'; l.target = '_blank'; l.rel = 'noopener';
        document.body.appendChild(l); l.click(); l.remove();
      }
      else if(act === 'consent-reset'){ if(window.AgendaAnalytics) window.AgendaAnalytics.resetConsent(); setTimeout(renderGlobal, 300); }
      else if(act === 'hide-tab'){
        if(window.confirm('Masquer l’onglet Admin ? (7 touchers sur le logo pour le retrouver)')) removeTab();
      }
    });
  }

  function setStatus(kind){
    var P = window.Premium;
    if(!P || !P._admin){ alert('Disponible uniquement en mode démo.'); return; }
    var now = Date.now();
    var addMonths = function(m){ var d = new Date(now); d.setMonth(d.getMonth() + m); return d.getTime(); };
    var map = {
      free:      { status:'free', plan:null, startedAt:null, expiresAt:null },
      trial:     { status:'trial', plan:'annual', startedAt:now, expiresAt:now + 14 * DAY, trialUsed:true },
      monthly:   { status:'active', plan:'monthly', startedAt:now, expiresAt:addMonths(1), trialUsed:true },
      annual:    { status:'active', plan:'annual', startedAt:now, expiresAt:addMonths(12), trialUsed:true },
      cancelled: { status:'cancelled', plan:(P.state().plan || 'monthly'), startedAt:(P.state().startedAt || now), expiresAt:now + 60 * 1000, trialUsed:true },
      expired:   { status:'expired', expiresAt:now - 1, trialUsed:true }
    };
    P._admin.setState(map[kind]);
    renderStatus();
    if(kind === 'cancelled'){
      setTimeout(function(){ if(window.Premium){ window.Premium.isPremium(); } renderStatus(); }, 61 * 1000);
    }
  }

  /* ----------------------------------------------------------------------
     AFFICHAGE
     ---------------------------------------------------------------------- */
  var STATUS_LABEL = { free:'Gratuit', trial:'Essai Premium', active:'Premium', cancelled:'Premium · résilié', expired:'Expiré' };

  function renderStatus(){
    var el = $('admin-status'); if(!el || !window.Premium) return;
    var P = window.Premium, s = P.state(), prem = P.isPremium();
    s = P.state();
    var html = '<span class="sub-pill' + (prem ? ' on' : '') + '">' + esc(STATUS_LABEL[s.status] || s.status) + '</span>';
    var bits = [];
    if(s.plan) bits.push('offre ' + (s.plan === 'annual' ? 'annuelle' : 'mensuelle'));
    if(s.expiresAt) bits.push((s.expiresAt > Date.now() ? 'fin le ' : 'terminé le ') + new Date(s.expiresAt).toLocaleString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }));
    bits.push(s.trialUsed ? 'essai déjà utilisé' : 'essai disponible');
    html += '<span class="admin-status-txt">' + esc(bits.join(' · ')) + '</span>';
    if(!P._admin) html += '<div class="field-hint">Mode démo désactivé : le statut vient de Google Play.</div>';
    el.innerHTML = html;
    var cur = s.status === 'active' ? s.plan : s.status;
    document.querySelectorAll('#admin-status-btns [data-s]').forEach(function(b){
      b.classList.toggle('is-current', b.getAttribute('data-s') === cur);
    });
  }

  function bar(label, value, max, sub){
    var pct = max > 0 ? Math.max(2, Math.round(value / max * 100)) : 0;
    return '<div class="admin-bar"><div class="admin-bar-top"><span>' + esc(label) + '</span><b>' + value + '</b></div>' +
      '<div class="admin-bar-track"><div class="admin-bar-fill" style="width:' + pct + '%"></div></div>' +
      (sub ? '<div class="admin-bar-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function renderStats(){
    if(!$('admin-kpis')) return;
    var days = Object.keys(stats.days);
    var activeDays = days.length;
    var last7 = 0, now = Date.now();
    days.forEach(function(d){ if(now - new Date(d + 'T12:00:00').getTime() <= 7 * DAY) last7++; });
    var total = 0; Object.keys(stats.counts).forEach(function(k){ total += stats.counts[k]; });

    $('admin-kpis').innerHTML =
      kpi(stats.sessions, 'ouvertures') + kpi(activeDays, 'jours d’usage') + kpi(last7 + '/7', 'jours actifs (7 j)') + kpi(total, 'actions') +
      '<div class="admin-since">Depuis le ' + esc(fmtDate(stats.since)) + '</div>';

    var all = Object.keys(LABELS).map(function(k){ return { k:k, n:stats.counts[k] || 0, last:stats.last[k] || 0 }; });
    var used = all.filter(function(f){ return f.n > 0; }).sort(function(a, b){ return b.n - a.n; });
    var max = used.length ? used[0].n : 0;

    $('admin-top').innerHTML = '<h4 class="admin-h4">Les plus utilisées</h4>' + (used.length
      ? used.slice(0, 8).map(function(f){ return bar(LABELS[f.k], f.n, max, 'dernier usage : ' + fmtAgo(f.last)); }).join('')
      : '<p class="field-hint">Pas encore de données : utilisez l’appli normalement, les compteurs se rempliront.</p>');

    var unused = all.filter(function(f){ return f.n === 0 && f.k.indexOf('pw:') !== 0 && f.k.indexOf('sub:') !== 0 && f.k.indexOf('widget:') !== 0; });
    var stale = used.filter(function(f){ return now - f.last > 14 * DAY; });
    var html = '<h4 class="admin-h4">Mises de côté</h4>';
    if(!unused.length && !stale.length) html += '<p class="field-hint">Toutes les fonctionnalités ont servi récemment.</p>';
    if(unused.length) html += '<div class="admin-chips">' + unused.map(function(f){ return '<span class="admin-chip">' + esc(LABELS[f.k]) + '</span>'; }).join('') + '</div><p class="field-hint">Jamais utilisées depuis le début du suivi.</p>';
    if(stale.length) html += '<div class="admin-chips">' + stale.map(function(f){ return '<span class="admin-chip warn">' + esc(LABELS[f.k]) + ' · ' + esc(fmtAgo(f.last)) + '</span>'; }).join('') + '</div><p class="field-hint">Pas utilisées depuis plus de 14 jours.</p>';
    $('admin-unused').innerHTML = html;

    $('admin-groups').innerHTML = CATALOG.map(function(g){
      var rows = g[1].map(function(f){
        var n = stats.counts[f[0]] || 0;
        return '<tr><td>' + esc(f[1]) + '</td><td class="num">' + n + '</td><td class="num muted">' + esc(fmtAgo(stats.last[f[0]])) + '</td></tr>';
      }).join('');
      return '<div class="admin-h4">' + esc(g[0]) + '</div><table class="admin-table">' + rows + '</table>';
    }).join('');
  }

  function kpi(v, l){ return '<div class="admin-kpi"><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>'; }

  function renderContent(){
    var el = $('admin-content'); if(!el) return;
    el.innerHTML = '<table class="admin-table">' + contentSnapshot().map(function(r){
      return '<tr><td>' + esc(r[0]) + '</td><td class="num">' + r[1] + '</td></tr>';
    }).join('') + '</table>';
  }

  function renderGlobal(){
    var el = $('admin-global'); if(!el) return;
    var st = window.AgendaAnalytics ? window.AgendaAnalytics.status() : { ready:false };
    var txt;
    if(!st.ready) txt = 'Firebase n’est pas encore configuré dans cette version : ajoutez le secret GOOGLE_SERVICES_JSON sur GitHub puis recompilez. Les statistiques ci-dessus restent locales.';
    else if(st.consent === 'granted') txt = 'Firebase actif sur ce téléphone (consentement donné). Les chiffres de tous les utilisateurs ayant accepté sont dans la console Firebase › Analytics › Events (délai d’affichage : jusqu’à 24 h).';
    else if(st.consent === 'denied') txt = 'Firebase configuré, mais statistiques refusées sur ce téléphone.';
    else txt = 'Firebase configuré : consentement pas encore demandé sur ce téléphone.';
    el.textContent = txt;
  }

  /* ---------- synthèse de tous les utilisateurs (script Apps Script) ---------- */
  var REMOTE_KEY = 'agenda_admin_remote';
  function remoteCfg(){ return readJson(REMOTE_KEY, {}) || {}; }
  // 'nav_calendar' -> libellé « Onglet Calendrier »
  var EVENT_LABELS = {};
  Object.keys(LABELS).forEach(function(k){ EVENT_LABELS[k.toLowerCase().replace(/[^a-z0-9_]+/g, '_')] = LABELS[k]; });
  EVENT_LABELS.agenda_open = 'Ouverture de l\u2019appli';

  function loadRemote(){
    var el = $('admin-remote'); if(!el) return;
    var cfg = remoteCfg();
    if($('admin-remote-url')){ $('admin-remote-url').value = cfg.url || ''; $('admin-remote-token').value = cfg.token || ''; }
    if(!cfg.url || !cfg.token){
      el.innerHTML = '<p class="field-hint">Renseignez l\u2019URL du script et le code secret ci-dessous pour afficher la synthèse.</p>';
      if($('admin-remote-cfg')) $('admin-remote-cfg').open = true;
      return;
    }
    el.innerHTML = '<p class="field-hint">Chargement…</p>';
    fetch(cfg.url + (cfg.url.indexOf('?') < 0 ? '?' : '&') + 'days=30&token=' + encodeURIComponent(cfg.token))
      .then(function(r){ return r.json(); })
      .then(function(d){ renderRemote(d); })
      .catch(function(){ el.innerHTML = '<p class="field-hint">Impossible de joindre le script (connexion, URL ou déploiement à vérifier).</p>'; });
  }

  function renderRemote(d){
    var el = $('admin-remote'); if(!el) return;
    if(!d || d.error){ el.innerHTML = '<p class="field-hint">Erreur : ' + esc(d && d.error || 'réponse vide') + '</p>'; return; }
    var events = (d.events || []).filter(function(e){ return EVENT_LABELS[e.name]; });
    var byName = {}; events.forEach(function(e){ byName[e.name] = e; });
    var html = '<div class="admin-kpis">' +
      kpi(d.activeUsers ? d.activeUsers.d7 : 0, 'utilisateurs actifs (7 j)') +
      kpi(d.activeUsers ? d.activeUsers.d30 : 0, 'utilisateurs actifs (30 j)') +
      kpi(byName.pw_trial ? byName.pw_trial.users : 0, 'essais démarrés') +
      kpi(byName.pw_purchase ? byName.pw_purchase.users : 0, 'abonnements') +
      '<div class="admin-since">' + esc(d.days) + ' derniers jours · mis à jour le ' + esc(new Date(d.generatedAt).toLocaleString('fr-FR')) + '</div></div>';

    var feats = events.filter(function(e){ return !/^(pw_|sub_|widget_|agenda_open)/.test(e.name); })
      .sort(function(a, b){ return b.users - a.users; });
    var max = feats.length ? feats[0].users : 0;
    html += '<h4 class="admin-h4">Fonctionnalités (nombre d\u2019utilisateurs)</h4>' + (feats.length
      ? feats.slice(0, 10).map(function(e){ return bar(EVENT_LABELS[e.name], e.users, max, e.count + ' utilisations'); }).join('')
      : '<p class="field-hint">Pas encore de données (délai Google : jusqu\u2019à 24 h).</p>');

    var seen = {}; feats.forEach(function(e){ seen[e.name] = 1; });
    var unused = Object.keys(EVENT_LABELS).filter(function(n){ return !seen[n] && !/^(pw_|sub_|widget_|agenda_open)/.test(n); });
    if(unused.length) html += '<h4 class="admin-h4">Utilisées par personne</h4><div class="admin-chips">' +
      unused.map(function(n){ return '<span class="admin-chip">' + esc(EVENT_LABELS[n]) + '</span>'; }).join('') + '</div>';

    var o = byName.pw_open ? byName.pw_open.users : 0, t = byName.pw_trial ? byName.pw_trial.users : 0, p = byName.pw_purchase ? byName.pw_purchase.users : 0;
    html += '<h4 class="admin-h4">Parcours d\u2019abonnement</h4>' +
      bar('Ont vu la page d\u2019abonnement', o, Math.max(o, 1)) +
      bar('Ont démarré l\u2019essai', t, Math.max(o, 1), o ? Math.round(t / o * 100) + ' % des visiteurs' : '') +
      bar('Se sont abonnés', p, Math.max(o, 1), o ? Math.round(p / o * 100) + ' % des visiteurs' : '');

    if(d.plans && d.plans.length){
      var pm = Math.max.apply(null, d.plans.map(function(x){ return x.users; }));
      html += '<h4 class="admin-h4">Utilisateurs par statut</h4>' + d.plans.map(function(x){ return bar(x.plan, x.users, pm); }).join('');
    }
    el.innerHTML = html;
  }

  function renderAll(){ renderStatus(); renderStats(); renderGlobal(); renderContent(); loadRemote(); }

  function copyStats(){
    var data = {
      exportedAt: new Date().toISOString(),
      app: window.Premium ? window.Premium.config.appVersion : '',
      stats: stats,
      content: contentSnapshot()
    };
    var txt = JSON.stringify(data, null, 2);
    var done = function(){ alert('Statistiques copiées dans le presse-papiers.'); };
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done, fallback); }
      else fallback();
    }catch(e){ fallback(); }
    function fallback(){
      var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta);
      ta.select(); try{ document.execCommand('copy'); done(); }catch(e){} ta.remove();
    }
  }

  /* ----------------------------------------------------------------------
     INITIALISATION
     ---------------------------------------------------------------------- */
  function init(){
    trackSession();
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible'){ trackSession(); if(adminVisible()) renderAll(); }
    });
    var brand = document.querySelector('.brand-mark');
    if(brand) brand.addEventListener('click', onBrandTap);
    if(adminEnabled()) installTab();
  }

  function safe(){ try{ init(); }catch(err){ if(window.__showJsError) window.__showJsError('admin : ' + (err && err.message ? err.message : err)); } }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safe); else safe();
})();
