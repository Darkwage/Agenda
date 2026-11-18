/* ==========================================================================
   Agenda — Premium (MODE DÉMO), abonnement, aide & contact, nouveautés
   --------------------------------------------------------------------------
   Ce module est volontairement autonome : il s'ajoute à index.html sans
   toucher au code existant. Il intercepte les boutons des générateurs,
   injecte la carte « Mon abonnement » et la carte « Aide & contact » dans
   l'onglet Réglages, et gère la page d'abonnement.

   MODE DÉMO : aucun paiement réel. Les achats sont simulés et l'état est
   stocké localement. Le jour où le paiement sera branché (Google Play
   Billing via RevenueCat), il suffira de remplacer les fonctions de la
   section « FOURNISSEUR » ; le reste de l'appli continue d'appeler
   Premium.isPremium() / Premium.require().
   ========================================================================== */
(function(){
  'use strict';

  /* ----------------------------------------------------------------------
     CONFIGURATION — à adapter
     ---------------------------------------------------------------------- */
  var CONFIG = {
    demo: true,                          // true = achats simulés ; false = vrai paiement Google Play (RevenueCat)
    revenueCatApiKey: '',                // clé « Public SDK key » Android de RevenueCat (commence par goog_)
    entitlementId: 'premium',            // identifiant du droit « Premium » défini dans RevenueCat
    playPackage: 'com.arwin.agenda',
    appVersion: '1.4.0',                 // à aligner sur versionName (android/app/build.gradle)
    supportEmail: 'agendadmin@gmail.com',                    // ex. 'agenda.appli@exemple.fr' — adresse dédiée, pas la boîte perso
    trialDays: 14,
    termsUrl: '',                        // CGU (à rédiger avant la commercialisation)
    privacyUrl: '',                      // politique de confidentialité
    plans: {
      monthly: { id:'monthly', label:'Mensuel', price:'2,99 €', per:'/ mois', sub:'Sans engagement', months:1 },
      annual:  { id:'annual',  label:'Annuel',  price:'24,99 €', per:'/ an', sub:'soit 2,08 € / mois', months:12, tag:'−30 %' }
    }
  };

  /* Nouveautés affichées après une mise à jour (la plus récente en premier). */
  var CHANGELOG = [
    { version:'1.4.0', date:'novembre 2026', items:[
      'Nouveau tutoriel animé pour prendre l\u2019appli en main, à retrouver dans Réglages › Aide & contact'
    ]},
    { version:'1.3.0', date:'novembre 2026', items:[
      'Agendas du téléphone : vos rendez-vous Google, Samsung ou Outlook s\u2019affichent dans Agenda (Réglages › Agendas du téléphone)',
      'Les générateurs évitent automatiquement ces rendez-vous',
      'Premium : vos tâches sont aussi envoyées dans l\u2019agenda du téléphone, et les modifications faites là-bas reviennent ici'
    ]},
    { version:'1.2.0', date:'novembre 2026', items:[
      'Nouvelle rubrique « Apparence » dans les Réglages : thème Nuit, mode automatique et 7 thèmes Premium',
      'Choix de la police des titres (Premium)',
      'Les widgets suivent désormais le thème choisi',
      'Nouveaux thèmes Fantaisie : Bonbon, Pixel et Galaxie (gratuits), Coucher de soleil, Nuages, Pop et Néon'
    ]},
    { version:'1.1.0', date:'novembre 2026', items:[
      'Nouvel abonnement Premium (version de démonstration, aucun paiement réel)',
      'Carte « Mon abonnement » dans les Réglages',
      'Widgets Semaine, Mois et Liste inclus dans Premium (le widget Jour reste gratuit)',
      'Aide & contact : questions fréquentes et signalement de problème'
    ]}
  ];

  /* Fonctionnalités Premium : utilisées pour le message contextuel du paywall. */
  var FEATURES = {
    planner:  { icon:'⚡', title:'Priorisation automatique', pitch:'Débloquez la priorisation automatique : vos tâches placées seules dans vos créneaux libres.' },
    revision: { icon:'📚', title:'Programme de révisions',  pitch:'Débloquez le programme de révisions : un planning par matière, calé sur vos examens.' },
    calendar: { icon:'🔄', title:'Synchronisation avec l\u2019agenda du téléphone', pitch:'Débloquez la synchronisation dans les deux sens : vos tâches apparaissent aussi dans l\u2019agenda du téléphone.' },
    themes:   { icon:'🎨', title:'Thèmes et polices', pitch:'Débloquez tous les thèmes (Néon, Pop, Coucher de soleil, Lavande, Ardoise…) et les polices.' },
    widgets:  { icon:'📱', title:'Tous les widgets',         pitch:'Débloquez les widgets Semaine, Mois et Liste sur votre écran d’accueil.' }
  };

  var STATE_KEY = 'agenda_premium_v1';
  var SEEN_VERSION_KEY = 'agenda_seen_version';
  var DAY = 24 * 3600 * 1000;

  function $(id){ return document.getElementById(id); }
  function track(key){ try{ if(window.AgendaStats) window.AgendaStats.track(key); }catch(e){} }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function fmtDate(ts){
    try{ return new Date(ts).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }); }
    catch(e){ return new Date(ts).toDateString(); }
  }

  /* ----------------------------------------------------------------------
     ÉTAT DE L'ABONNEMENT
     status : 'free' | 'trial' | 'active' | 'cancelled' | 'expired'
       - trial     : essai en cours (se transforme en abonnement à la fin si non résilié)
       - active    : abonnement payé, renouvellement automatique
       - cancelled : résilié, reste Premium jusqu'à expiresAt
       - expired   : fin des droits → retour à la version gratuite
     ---------------------------------------------------------------------- */
  function defaultState(){ return { status:'free', plan:null, startedAt:null, expiresAt:null, trialUsed:false }; }

  function loadState(){
    try{
      var s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      if(s && typeof s === 'object' && s.status) return s;
    }catch(e){}
    return defaultState();
  }
  var state = loadState();
  var lastWidgetVal = null;

  function saveState(){
    try{ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }catch(e){}
    // Copie pour les widgets Android (lue côté Java via SharedPreferences « CapacitorStorage »).
    try{
      var P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
      var val = isPremium() ? '1' : '0';
      if(P && val !== lastWidgetVal){
        lastWidgetVal = val;
        // Puis on redessine les widgets (verrouillés ou non) sans attendre Android.
        P.set({ key:'agenda_premium', value: val }).then(function(){
          var W = window.Capacitor.Plugins.WidgetBridge;
          if(W) W.refresh().catch(function(){});
        });
      }
    }catch(e){}
  }

  /* Fait avancer l'état dans le temps (fin d'essai, renouvellement, expiration). */
  function refreshState(){
    var now = Date.now(), changed = false;
    if(state.expiresAt && now >= state.expiresAt){
      if(state.status === 'trial' || state.status === 'active'){
        // Démo : le renouvellement « réussit » toujours.
        var months = (CONFIG.plans[state.plan] || CONFIG.plans.monthly).months;
        var d = new Date(state.expiresAt);
        while(d.getTime() <= now){ d.setMonth(d.getMonth() + months); }
        state.status = 'active'; state.expiresAt = d.getTime(); changed = true;
      } else if(state.status === 'cancelled'){
        state.status = 'expired'; changed = true;
      }
    }
    if(changed) saveState();
  }

  function isPremium(){
    refreshState();
    return state.status === 'trial' || state.status === 'active' || state.status === 'cancelled';
  }

  /* ----------------------------------------------------------------------
     FOURNISSEUR — à remplacer par RevenueCat / Google Play Billing
     ---------------------------------------------------------------------- */
  var Provider = {
    // Renvoie les offres avec leurs prix (en réel : prix localisés fournis par le Play Store).
    getOfferings: function(){ return Promise.resolve(CONFIG.plans); },

    // Lance l'achat. withTrial = démarrer par l'essai gratuit.
    purchase: function(planId, withTrial){
      return new Promise(function(resolve){
        setTimeout(function(){
          var now = Date.now();
          var plan = CONFIG.plans[planId];
          state.plan = planId;
          state.startedAt = now;
          if(withTrial && !state.trialUsed){
            state.status = 'trial';
            state.trialUsed = true;
            state.expiresAt = now + CONFIG.trialDays * DAY;
          } else {
            var d = new Date(now); d.setMonth(d.getMonth() + plan.months);
            state.status = 'active';
            state.expiresAt = d.getTime();
          }
          saveState();
          resolve(state);
        }, 900);
      });
    },

    // Restaure un achat existant (changement de téléphone, réinstallation).
    restore: function(){
      return new Promise(function(resolve){ setTimeout(function(){ resolve(isPremium()); }, 700); });
    },

    // En réel : ouvre la page des abonnements du Play Store
    // https://play.google.com/store/account/subscriptions?package=com.arwin.agenda
    manage: function(){ openManageSheet(); }
  };

  /* ----------------------------------------------------------------------
     FOURNISSEUR RÉEL — Google Play Billing via RevenueCat
     Actif quand CONFIG.demo = false et qu'une clé RevenueCat est renseignée.
     Pré-requis dans RevenueCat : un droit (entitlement) « premium » et une
     offre (offering) courante avec les packages Mensuel et Annuel.
     ---------------------------------------------------------------------- */
  var rcPackages = {}, rcReady = null;
  function RC(){
    var C = window.Capacitor; if(!C) return null;
    if(!(C.Plugins && C.Plugins.Purchases) && C.registerPlugin){ try{ C.registerPlugin('Purchases', {}); }catch(e){} }
    return C.Plugins && C.Plugins.Purchases ? C.Plugins.Purchases : null;
  }
  function rcInit(){
    if(rcReady) return rcReady;
    var P = RC();
    if(!P || !CONFIG.revenueCatApiKey) return Promise.reject(new Error('Paiement indisponible'));
    rcReady = P.configure({ apiKey: CONFIG.revenueCatApiKey }).catch(function(e){ rcReady = null; throw e; });
    return rcReady;
  }
  /* Traduit les droits RevenueCat en état d'abonnement de l'appli. */
  function applyCustomerInfo(info){
    var ent = info && info.entitlements && info.entitlements.active && info.entitlements.active[CONFIG.entitlementId];
    if(ent && ent.isActive !== false){
      var pid = String(ent.productIdentifier || '').toLowerCase();
      state.plan = /year|annu|annual|12/.test(pid) ? 'annual' : 'monthly';
      state.expiresAt = ent.expirationDateMillis || (ent.expirationDate ? Date.parse(ent.expirationDate) : null);
      state.startedAt = state.startedAt || Date.now();
      state.trialUsed = true;
      state.status = ent.periodType === 'TRIAL' ? 'trial' : (ent.willRenew === false ? 'cancelled' : 'active');
    } else if(state.status !== 'free'){
      state.status = 'expired';
    }
    saveState();
    return state;
  }
  var RealProvider = {
    getOfferings: function(){
      return rcInit().then(function(){ return RC().getOfferings(); }).then(function(o){
        var pk = (o && o.current && o.current.availablePackages) || [];
        rcPackages = {};
        pk.forEach(function(p){
          if(p.packageType === 'MONTHLY') rcPackages.monthly = p;
          if(p.packageType === 'ANNUAL') rcPackages.annual = p;
        });
        ['monthly', 'annual'].forEach(function(k){
          var p = rcPackages[k]; if(!p || !p.product) return;
          CONFIG.plans[k].price = p.product.priceString || CONFIG.plans[k].price;
          var opt = p.product.defaultOption;
          CONFIG.plans[k].hasTrial = !!(opt && opt.freePhase);
        });
        return CONFIG.plans;
      }).catch(function(){ return CONFIG.plans; });
    },
    purchase: function(planId){
      return rcInit().then(function(){
        var pkg = rcPackages[planId];
        if(!pkg) throw new Error('Offre introuvable');
        return RC().purchasePackage({ aPackage: pkg });
      }).then(function(res){ return applyCustomerInfo(res && res.customerInfo); });
    },
    restore: function(){
      return rcInit().then(function(){ return RC().restorePurchases(); })
        .then(function(res){ applyCustomerInfo(res && res.customerInfo); return isPremium(); });
    },
    refresh: function(){
      return rcInit().then(function(){ return RC().getCustomerInfo(); })
        .then(function(res){ applyCustomerInfo(res && res.customerInfo); applyUi(); }).catch(function(){});
    },
    manage: function(){
      var a = document.createElement('a');
      a.href = 'https://play.google.com/store/account/subscriptions?package=' + encodeURIComponent(CONFIG.playPackage);
      a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    }
  };
  if(!CONFIG.demo) Provider = RealProvider;

  /* ----------------------------------------------------------------------
     PETITS OUTILS D'INTERFACE
     ---------------------------------------------------------------------- */
  var toastTimer = null;
  function toast(msg){
    var t = $('toast'), txt = $('toast-text'), undo = $('toast-undo');
    if(!t || !txt){ return; }
    txt.textContent = msg;
    if(undo) undo.style.display = 'none';
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.remove('is-on'); if(undo) undo.style.display = ''; }, 2600);
  }

  function makeOverlay(id, title, bodyHtml){
    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = id;
    ov.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="' + id + '-title">' +
        '<div class="modal-head"><h2 id="' + id + '-title">' + esc(title) + '</h2>' +
        '<button type="button" class="modal-close" data-close aria-label="Fermer">✕</button></div>' +
        '<div class="pw-body">' + bodyHtml + '</div>' +
      '</div>';
    ov.addEventListener('click', function(e){
      if(e.target === ov || e.target.closest('[data-close]')) closeOv(ov);
    });
    document.body.appendChild(ov);
    return ov;
  }
  function openOv(ov){ ov.classList.add('is-open'); }
  function closeOv(ov){ ov.classList.remove('is-open'); }

  function demoBanner(){
    return CONFIG.demo ? '<div class="pw-demo">🧪 Mode démo — aucun paiement réel n’est effectué.</div>' : '';
  }

  /* ----------------------------------------------------------------------
     PAGE D'ABONNEMENT (PAYWALL)
     ---------------------------------------------------------------------- */
  var paywall = null, selectedPlan = 'annual', pendingAction = null;

  function buildPaywall(){
    var feats = [
      ['⚡', 'Priorisation automatique', 'Vos tâches placées seules, les plus urgentes d’abord'],
      ['📚', 'Programme de révisions', 'Un planning par matière jusqu’à vos examens'],
      ['🧩', 'Grosses tâches découpées en sessions', 'Saisies une fois, réparties automatiquement'],
      ['🔄', 'Synchronisation dans les deux sens', 'Vos tâches aussi dans l\u2019agenda du téléphone'],
      ['🎨', 'Thèmes et polices', '14 thèmes, des classiques aux plus fantaisistes'],
      ['📱', 'Tous les widgets', 'Jour, Semaine, Mois et Liste sur l’écran d’accueil'],
      ['💚', 'Soutenir un développeur indépendant', 'Et les prochaines mises à jour']
    ];
    var html = demoBanner() +
      '<div class="pw-hero"><div class="pw-mark">✦</div>' +
        '<h3>Agenda Premium</h3><p>Dites ce que vous avez à faire, l’appli trouve quand le faire.</p></div>' +
      '<div class="pw-context" id="pw-context"></div>' +
      '<ul class="pw-features">' + feats.map(function(f){
        return '<li><span class="pw-ico">' + f[0] + '</span><span>' + esc(f[1]) + '<small>' + esc(f[2]) + '</small></span></li>';
      }).join('') + '</ul>' +
      '<div class="pw-plans" id="pw-plans"></div>' +
      '<button type="button" class="btn-primary pw-cta" id="pw-cta"></button>' +
      '<button type="button" class="pw-secondary" id="pw-nottrial"></button>' +
      '<div class="pw-legal" id="pw-legal"></div>';
    paywall = makeOverlay('paywall-overlay', 'Passer à Premium', html);

    $('pw-plans').addEventListener('click', function(e){
      var b = e.target.closest('.pw-plan'); if(!b) return;
      selectedPlan = b.getAttribute('data-plan');
      renderPaywall();
    });
    $('pw-cta').addEventListener('click', function(){ doPurchase(!state.trialUsed); });
    $('pw-nottrial').addEventListener('click', function(){
      var withTrialShown = CONFIG.demo ? !state.trialUsed : !!(CONFIG.plans[selectedPlan] || {}).hasTrial;
      if(withTrialShown) doPurchase(false); else doRestore();
    });
    $('pw-legal').addEventListener('click', function(e){
      if(e.target.id === 'pw-restore') doRestore();
    });
  }

  function renderPaywall(){
    Provider.getOfferings().then(function(plans){
      $('pw-plans').innerHTML = ['monthly', 'annual'].map(function(k){
        var p = plans[k];
        return '<button type="button" class="pw-plan' + (k === selectedPlan ? ' is-selected' : '') + '" data-plan="' + k + '">' +
          (p.tag ? '<span class="pw-plan-tag">' + esc(p.tag) + '</span>' : '') +
          '<div class="pw-plan-name">' + esc(p.label) + '</div>' +
          '<div class="pw-plan-price">' + esc(p.price) + '</div>' +
          '<div class="pw-plan-sub">' + esc(p.per) + ' · ' + esc(p.sub) + '</div></button>';
      }).join('');
      var p = plans[selectedPlan];
      var showTrial = CONFIG.demo ? !state.trialUsed : !!p.hasTrial;
      var cta = $('pw-cta'), alt = $('pw-nottrial');
      cta.disabled = false;
      if(showTrial){
        cta.textContent = 'Essayer gratuitement ' + CONFIG.trialDays + ' jours';
        alt.textContent = 'S’abonner sans essai';
      } else {
        cta.textContent = 'S’abonner — ' + p.price + ' ' + p.per;
        alt.textContent = 'Restaurer mes achats';
      }
      var legal = showTrial
        ? 'Gratuit pendant ' + CONFIG.trialDays + ' jours, puis ' + p.price + ' ' + p.per + '. '
        : '';
      legal += 'Renouvellement automatique, résiliable à tout moment depuis Google Play. ';
      legal += '<button type="button" id="pw-restore">Restaurer mes achats</button>';
      var links = [];
      if(CONFIG.termsUrl) links.push('<a href="' + esc(CONFIG.termsUrl) + '" target="_blank" rel="noopener">Conditions d’utilisation</a>');
      if(CONFIG.privacyUrl) links.push('<a href="' + esc(CONFIG.privacyUrl) + '" target="_blank" rel="noopener">Confidentialité</a>');
      if(links.length) legal += ' · ' + links.join(' · ');
      $('pw-legal').innerHTML = legal;
    });
  }

  function openPaywall(featureKey, onUnlock){
    if(!paywall) buildPaywall();
    pendingAction = onUnlock || null;
    track('pw:open');
    var f = featureKey && FEATURES[featureKey];
    $('pw-context').textContent = f ? f.pitch : '';
    renderPaywall();
    openOv(paywall);
  }

  function doPurchase(withTrial){
    var cta = $('pw-cta');
    cta.disabled = true; cta.textContent = 'Traitement…';
    Provider.purchase(selectedPlan, withTrial).then(function(){
      track(state.status === 'trial' ? 'pw:trial' : 'pw:purchase');
      closeOv(paywall);
      applyUi();
      toast(state.status === 'trial'
        ? 'Essai Premium activé jusqu’au ' + fmtDate(state.expiresAt)
        : 'Bienvenue dans Agenda Premium !');
      var act = pendingAction; pendingAction = null;
      if(act) setTimeout(act, 250);
    }, function(err){
      renderPaywall();
      var cancelled = err && (err.userCancelled || /cancel/i.test(String(err.message || err.code || '')));
      if(!cancelled) toast('Le paiement n’a pas abouti.');
    });
  }

  function doRestore(){
    track('pw:restore');
    Provider.restore().then(function(ok){
      if(ok){ closeOv(paywall); applyUi(); toast('Abonnement restauré.'); }
      else toast('Aucun abonnement trouvé pour ce compte Google.');
    });
  }

  /* ----------------------------------------------------------------------
     VERROUILLAGE DES FONCTIONNALITÉS
     ---------------------------------------------------------------------- */
  function require(featureKey, action){
    if(isPremium()){ if(action) action(); return true; }
    openPaywall(featureKey, action);
    return false;
  }

  // Boutons protégés : on intercepte le clic en phase de capture, avant le
  // gestionnaire d'origine. Une fois Premium débloqué, on relance le clic.
  var GATED = { 'planner-open-btn':'planner', 'open-rev-btn':'revision' };
  window.addEventListener('click', function(e){
    var btn = e.target && e.target.closest && e.target.closest('button');
    if(!btn || !GATED[btn.id] || isPremium()) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    openPaywall(GATED[btn.id], function(){ btn.click(); });
  }, true);

  function addBadges(){
    Object.keys(GATED).forEach(function(id){
      var btn = $(id); if(!btn) return;
      var card = btn.closest('.gen-card'); if(!card) return;
      var head = card.querySelector('.gen-head');
      if(head && !head.querySelector('.premium-badge')){
        var b = document.createElement('span');
        b.className = 'premium-badge';
        b.textContent = 'Premium';
        head.appendChild(b);
      }
    });
  }

  /* ----------------------------------------------------------------------
     CARTE « MON ABONNEMENT » (Réglages)
     ---------------------------------------------------------------------- */
  function buildSubCard(){
    var anchor = $('gen-section'); if(!anchor) return;
    var sec = document.createElement('section');
    sec.className = 'card sub-card';
    sec.id = 'sub-card';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    sec.addEventListener('click', function(e){
      var a = e.target.closest('[data-sub]'); if(!a) return;
      var act = a.getAttribute('data-sub');
      if(act === 'discover') openPaywall(null);
      else if(act === 'manage'){ track('sub:manage'); Provider.manage(); }
      else if(act === 'restore') doRestore();
    });
  }

  function renderSubCard(){
    var sec = $('sub-card'); if(!sec) return;
    var prem = isPremium();
    var pill, line, actions;
    var planLabel = state.plan && CONFIG.plans[state.plan] ? CONFIG.plans[state.plan].label.toLowerCase() : '';
    if(state.status === 'trial'){
      pill = '<span class="sub-pill on">Essai Premium</span>';
      line = 'Essai gratuit jusqu’au ' + fmtDate(state.expiresAt) + ', puis abonnement ' + planLabel + '.';
    } else if(state.status === 'active'){
      pill = '<span class="sub-pill on">Premium</span>';
      line = 'Abonnement ' + planLabel + ' · renouvellement le ' + fmtDate(state.expiresAt) + '.';
    } else if(state.status === 'cancelled'){
      pill = '<span class="sub-pill warn">Premium · résilié</span>';
      line = 'Vous gardez Premium jusqu’au ' + fmtDate(state.expiresAt) + '. Vos données restent intactes ensuite.';
    } else if(state.status === 'expired'){
      pill = '<span class="sub-pill">Version gratuite</span>';
      line = 'Votre abonnement a pris fin. Vos tâches et vos lots déjà planifiés sont conservés.';
    } else {
      pill = '<span class="sub-pill">Version gratuite</span>';
      line = 'Calendrier, liste, catégories, anniversaires et widget Jour sont inclus.';
    }
    actions = prem
      ? '<button type="button" class="btn-ghost" data-sub="manage">Gérer l’abonnement</button>'
      : '<button type="button" class="btn-primary" data-sub="discover">Découvrir Premium</button>' +
        '<button type="button" class="btn-ghost" data-sub="restore">Restaurer mes achats</button>';
    var demo = '';
    sec.innerHTML =
      '<h2 class="section-title">Mon abonnement</h2>' +
      '<div class="sub-status">' + pill + '</div>' +
      '<div class="sub-line">' + esc(line) + '</div>' +
      '<div class="sub-actions">' + actions + '</div>' + demo;
  }

  // Gestion (démo) : en réel, Google Play gère résiliation et changement d'offre.
  var manageSheet = null;
  function openManageSheet(){
    if(!manageSheet){
      manageSheet = makeOverlay('sub-manage-overlay', 'Gérer l’abonnement',
        demoBanner() +
        '<p class="sub-line" id="sub-manage-text" style="margin:0 0 14px;"></p>' +
        '<div class="pw-sheet-actions" id="sub-manage-actions"></div>');
      $('sub-manage-actions').addEventListener('click', function(e){
        var b = e.target.closest('[data-m]'); if(!b) return;
        var m = b.getAttribute('data-m');
        if(m === 'cancel'){ state.status = 'cancelled'; toast('Abonnement résilié. Premium reste actif jusqu’à la fin de la période.'); }
        else if(m === 'resume'){ state.status = 'active'; toast('Abonnement réactivé.'); }
        else if(m === 'switch'){ state.plan = state.plan === 'annual' ? 'monthly' : 'annual'; toast('Offre modifiée au prochain renouvellement.'); }
        saveState(); closeOv(manageSheet); applyUi();
      });
    }
    var other = state.plan === 'annual' ? CONFIG.plans.monthly : CONFIG.plans.annual;
    $('sub-manage-text').textContent = CONFIG.demo
      ? 'Dans la version publiée, ce bouton ouvrira la page des abonnements de Google Play.'
      : '';
    var html = '';
    if(state.status === 'cancelled'){
      html += '<button type="button" class="btn-ghost" data-m="resume">Réactiver l’abonnement</button>';
    } else {
      html += '<button type="button" class="btn-ghost" data-m="switch">Passer à l’offre ' + esc(other.label.toLowerCase()) + ' (' + esc(other.price + ' ' + other.per) + ')</button>';
      html += '<button type="button" class="btn-ghost danger" data-m="cancel">Résilier</button>';
    }
    $('sub-manage-actions').innerHTML = html;
    openOv(manageSheet);
  }

  /* ----------------------------------------------------------------------
     AIDE & CONTACT
     ---------------------------------------------------------------------- */
  var FAQ = [
    ['Comment résilier mon abonnement ?', 'Ouvrez Google Play › votre profil › Paiements et abonnements › Abonnements › Agenda. Vous gardez Premium jusqu’à la fin de la période payée.'],
    ['Que deviennent mes données si j’arrête Premium ?', 'Rien n’est supprimé : vos tâches, vos programmes et vos lots déjà planifiés restent affichés. Seule la création de nouveaux plannings automatiques est réservée à Premium.'],
    ['J’ai changé de téléphone, comment retrouver Premium ?', 'Connectez-vous avec le même compte Google, puis Réglages › Mon abonnement › Restaurer mes achats. Pour vos tâches, utilisez Sauvegarde › Exporter puis Importer.'],
    ['Mes données sont-elles envoyées quelque part ?', 'Vos tâches, rendez-vous et anniversaires restent sur votre téléphone : ils ne sont jamais envoyés par l\u2019appli. La lecture de vos autres agendas et l\u2019envoi vers l\u2019agenda « Agenda (appli) » se font aussi sur le téléphone. Si vous l\u2019acceptez, seules des statistiques anonymes d\u2019utilisation (quelles fonctionnalités servent) sont partagées via Google Analytics pour Firebase.'],
    ['Mes rendez-vous Google n\u2019apparaissent pas', 'Réglages › Agendas du téléphone : activez « Afficher les rendez-vous… » et cochez les agendas voulus. Vérifiez aussi que l\u2019agenda est bien synchronisé sur le téléphone (appli Google Agenda).'],
    ['Le widget ne se met pas à jour', 'Ouvrez l’appli une fois : le widget se resynchronise. Si le problème persiste, retirez-le et ajoutez-le à nouveau.']
  ];

  function deviceInfo(){
    var ua = navigator.userAgent || '';
    var m = ua.match(/Android\s([\d.]+);\s([^;)]+)/);
    return m ? ('Android ' + m[1] + ' · ' + m[2].replace(/\sBuild.*$/, '')) : ua.slice(0, 120);
  }

  function reportProblem(){
    if(!CONFIG.supportEmail){
      toast('Adresse de contact à configurer (CONFIG.supportEmail).');
      return;
    }
    var body = '\n\n\n— Merci de décrire le problème ci-dessus —\n' +
      'Version : ' + CONFIG.appVersion + (CONFIG.demo ? ' (démo)' : '') + '\n' +
      'Appareil : ' + deviceInfo() + '\n' +
      'Abonnement : ' + state.status + '\n' +
      'Date : ' + new Date().toLocaleString('fr-FR');
    var href = 'mailto:' + CONFIG.supportEmail +
      '?subject=' + encodeURIComponent('Agenda ' + CONFIG.appVersion + ' — signalement') +
      '&body=' + encodeURIComponent(body);
    var a = document.createElement('a'); a.href = href; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  }

  var faqOv = null;
  function openFaq(){
    if(!faqOv){
      faqOv = makeOverlay('faq-overlay', 'Questions fréquentes',
        '<div class="faq">' + FAQ.map(function(q){
          return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>';
        }).join('') + '</div>' +
        '<button type="button" class="btn-ghost" id="faq-contact" style="width:100%;margin-top:14px;">✉️ Je n’ai pas trouvé ma réponse</button>');
      $('faq-contact').addEventListener('click', reportProblem);
    }
    openOv(faqOv);
  }

  var newsOv = null;
  function openNews(){
    if(!newsOv){
      newsOv = makeOverlay('news-overlay', 'Nouveautés',
        CHANGELOG.map(function(v){
          return '<div class="news-version">Version ' + esc(v.version) + '<span>' + esc(v.date) + '</span></div>' +
            '<ul class="news-list">' + v.items.map(function(i){ return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
        }).join('') +
        '<button type="button" class="btn-primary" data-close style="margin-top:14px;">C’est noté</button>');
    }
    openOv(newsOv);
  }

  function buildHelpCard(){
    var sub = $('sub-card'); if(!sub) return;
    var sec = document.createElement('section');
    sec.className = 'card';
    sec.id = 'help-card';
    sec.innerHTML =
      '<details class="collapsible"><summary>Aide & contact <span class="chev">▸</span></summary>' +
      '<div class="help-list" style="margin-top:10px;">' +
        '<button type="button" class="btn-ghost" data-help="faq">❓ Questions fréquentes</button>' +
        '<button type="button" class="btn-ghost" data-help="report">✉️ Signaler un problème</button>' +
        '<button type="button" class="btn-ghost" data-help="news">✨ Nouveautés</button>' +
      '</div>' +
      '<div class="app-version">Agenda ' + esc(CONFIG.appVersion) + (CONFIG.demo ? ' · démo' : '') + '</div>' +
      '</details>';
    // Placée tout en bas des Réglages, après « Sauvegarde ».
    var panel = $('panel-left');
    panel.appendChild(sec);
    sec.addEventListener('click', function(e){
      var b = e.target.closest('[data-help]'); if(!b) return;
      var h = b.getAttribute('data-help');
      track('help:' + h);
      if(h === 'faq') openFaq(); else if(h === 'report') reportProblem(); else if(h === 'news') openNews();
    });
  }

  function maybeShowNews(){
    try{
      var seen = localStorage.getItem(SEEN_VERSION_KEY);
      localStorage.setItem(SEEN_VERSION_KEY, CONFIG.appVersion);
      // Première installation : on n'affiche rien. Mise à jour : on montre les nouveautés.
      var tasks = JSON.parse(localStorage.getItem('agenda_planner_tasks_v1') || '[]');
      var hasData = Array.isArray(tasks) && tasks.length > 0;
      if(seen !== CONFIG.appVersion && (seen || hasData)) setTimeout(openNews, 800);
    }catch(e){}
  }

  /* ----------------------------------------------------------------------
     INITIALISATION
     ---------------------------------------------------------------------- */
  function applyUi(){
    document.body.classList.toggle('is-premium', isPremium());
    renderSubCard();
    try{ document.dispatchEvent(new CustomEvent('agenda:premium')); }catch(e){}
  }

  /* Un widget verrouillé a été touché : MainActivity a posé la clé
     « agenda_open_paywall » ; on ouvre la page d'abonnement. */
  function checkWidgetPaywallRequest(){
    try{
      var P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
      if(!P) return;
      P.get({ key:'agenda_open_paywall' }).then(function(r){
        if(!r || !r.value) return;
        P.remove({ key:'agenda_open_paywall' });
        track('widget:locked-tap');
        if(!isPremium()) openPaywall(FEATURES[r.value] ? r.value : 'widgets');
      }).catch(function(){});
    }catch(e){}
  }

  function init(){
    refreshState();
    saveState();
    addBadges();
    buildSubCard();
    buildHelpCard();
    applyUi();
    maybeShowNews();
    checkWidgetPaywallRequest();
    if(!CONFIG.demo && Provider.refresh) Provider.refresh();
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible'){
        refreshState(); saveState(); applyUi(); checkWidgetPaywallRequest();
        if(!CONFIG.demo && Provider.refresh) Provider.refresh();
      }
    });
  }

  // API publique, pour le reste de l'appli.
  window.Premium = {
    isPremium: isPremium,
    require: require,
    openPaywall: openPaywall,
    state: function(){ return JSON.parse(JSON.stringify(state)); },
    config: CONFIG,
    openNews: function(){ openNews(); },
    // Réservé à l'onglet Admin, et seulement en mode démo : en production,
    // le statut ne doit venir que de Google Play.
    _admin: !CONFIG.demo ? null : {
      setState: function(next){
        state = Object.assign(defaultState(), state, next);
        refreshState(); lastWidgetVal = null; saveState(); applyUi();
      },
      reset: function(){ state = defaultState(); lastWidgetVal = null; saveState(); applyUi(); }
    }
  };

  function safe(){ try{ init(); }catch(err){ if(window.__showJsError) window.__showJsError('premium : ' + (err && err.message ? err.message : err)); } }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safe); else safe();
})();
