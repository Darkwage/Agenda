/* ==========================================================================
   Agenda — statistiques d'usage anonymes (Google Analytics pour Firebase)
   --------------------------------------------------------------------------
   • Actif seulement si l'APK a été compilé avec google-services.json
     (MainActivity écrit « agenda_analytics_ready » = "1").
   • Rien n'est envoyé sans l'accord de l'utilisateur : la collecte est
     coupée par défaut dans AndroidManifest.xml et activée ici après « Accepter ».
   • Seuls partent : le nom de la fonctionnalité utilisée et le statut
     gratuit / Premium. Jamais le contenu des tâches, ni identifiant publicitaire.
   ========================================================================== */
(function(){
  'use strict';

  var CONSENT_KEY = 'agenda_analytics_consent'; // 'granted' | 'denied'
  var ready = false, enabled = false, queue = [];

  function FA(){
    var P = window.Capacitor && window.Capacitor.Plugins;
    return P && P.FirebaseAnalytics ? P.FirebaseAnalytics : null;
  }
  function Prefs(){
    var P = window.Capacitor && window.Capacitor.Plugins;
    return P && P.Preferences ? P.Preferences : null;
  }
  function consent(){ try{ return localStorage.getItem(CONSENT_KEY); }catch(e){ return null; } }
  function setConsentValue(v){ try{ localStorage.setItem(CONSENT_KEY, v); }catch(e){} }

  /* 'nav:calendar' -> 'nav_calendar' (règles Firebase : lettres, chiffres, _ ; 40 caractères max). */
  function eventName(key){
    var n = String(key).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if(!/^[a-z]/.test(n)) n = 'e_' + n;
    return n.slice(0, 40);
  }
  function plan(){
    try{
      if(!window.Premium) return 'inconnu';
      var s = window.Premium.state();
      if(s.status === 'trial') return 'essai';
      return window.Premium.isPremium() ? 'premium' : 'gratuit';
    }catch(e){ return 'inconnu'; }
  }

  function send(key){
    var fa = FA(); if(!fa) return;
    fa.logEvent({ name: eventName(key), params: { plan: plan() } }).catch(function(){});
  }

  function log(key){
    if(!ready || consent() === 'denied') return;
    if(!enabled){ if(queue.length < 50) queue.push(key); return; }
    send(key);
    if(String(key).indexOf('pw:') === 0) updatePlan();
  }

  function updatePlan(){
    var fa = FA(); if(!fa || !enabled) return;
    fa.setUserProperty({ key:'plan', value: plan() }).catch(function(){});
  }

  function enable(){
    var fa = FA(); if(!fa) return;
    fa.setConsent({ type:'ANALYTICS_STORAGE', status:'GRANTED' }).catch(function(){});
    fa.setEnabled({ enabled:true }).then(function(){
      enabled = true;
      updatePlan();
      send('agenda_open');
      queue.splice(0).forEach(send);
    }).catch(function(){});
  }

  function disable(){
    enabled = false; queue = [];
    var fa = FA(); if(!fa) return;
    fa.setEnabled({ enabled:false }).catch(function(){});
    fa.setConsent({ type:'ANALYTICS_STORAGE', status:'DENIED' }).catch(function(){});
    fa.resetAnalyticsData().catch(function(){});
  }

  function choose(granted){
    setConsentValue(granted ? 'granted' : 'denied');
    if(granted) enable(); else disable();
    renderToggle();
  }

  /* ----------------------------------------------------------------------
     DEMANDE DE CONSENTEMENT (une seule fois)
     ---------------------------------------------------------------------- */
  var consentOv = null;
  function askConsent(){
    // On attend qu'aucune autre fenêtre ne soit ouverte (ex. « Nouveautés »).
    if(document.querySelector('.modal-overlay.is-open')){ setTimeout(askConsent, 2000); return; }
    if(!consentOv){
      consentOv = document.createElement('div');
      consentOv.className = 'modal-overlay';
      consentOv.id = 'consent-overlay';
      consentOv.innerHTML =
        '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="consent-title">' +
          '<div class="modal-head"><h2 id="consent-title">Aider à améliorer Agenda ?</h2></div>' +
          '<p class="consent-text">Acceptez-vous de partager des <b>statistiques d’utilisation anonymes</b> ? ' +
          'Elles indiquent seulement quelles fonctionnalités sont utilisées (ex. « vue Semaine », « Priorisation automatique »), ' +
          'pour savoir quoi améliorer en priorité.</p>' +
          '<ul class="consent-list">' +
            '<li>✓ Jamais le contenu de vos tâches, rendez-vous ou anniversaires</li>' +
            '<li>✓ Aucun identifiant publicitaire, aucune publicité</li>' +
            '<li>✓ Modifiable à tout moment : Réglages › Aide &amp; contact</li>' +
          '</ul>' +
          '<p class="consent-small">Service utilisé : Google Analytics pour Firebase.</p>' +
          '<button type="button" class="btn-primary" data-c="yes">Accepter</button>' +
          '<button type="button" class="pw-secondary" data-c="no" style="margin-top:6px;">Refuser</button>' +
        '</div>';
      document.body.appendChild(consentOv);
      consentOv.addEventListener('click', function(e){
        var b = e.target.closest('[data-c]'); if(!b) return;
        consentOv.classList.remove('is-open');
        choose(b.getAttribute('data-c') === 'yes');
      });
    }
    consentOv.classList.add('is-open');
  }

  /* ----------------------------------------------------------------------
     RÉGLAGE dans « Aide & contact »
     ---------------------------------------------------------------------- */
  function renderToggle(){
    var card = document.getElementById('help-card'); if(!card) return;
    var row = document.getElementById('analytics-toggle-row');
    if(!ready){ if(row) row.remove(); return; }
    if(!row){
      row = document.createElement('div');
      row.id = 'analytics-toggle-row';
      row.className = 'toggle-row analytics-toggle';
      row.innerHTML = '<input type="checkbox" id="analytics-toggle"><label for="analytics-toggle">📊 Partager des statistiques d’utilisation anonymes</label>';
      var list = card.querySelector('.help-list');
      (list ? list.parentNode : card).insertBefore(row, list ? list.nextSibling : null);
      row.querySelector('input').addEventListener('change', function(e){ choose(e.target.checked); });
    }
    row.querySelector('input').checked = consent() === 'granted';
  }

  /* ----------------------------------------------------------------------
     INITIALISATION
     ---------------------------------------------------------------------- */
  function init(){
    var prefs = Prefs();
    if(!prefs || !FA()) return; // navigateur ou APK sans le plugin : rien à faire
    prefs.get({ key:'agenda_analytics_ready' }).then(function(r){
      ready = !!(r && r.value === '1');
      if(!ready) return;
      renderToggle();
      var c = consent();
      if(c === 'granted') enable();
      else if(!c) setTimeout(askConsent, 2500);
    }).catch(function(){});
  }

  window.AgendaAnalytics = {
    log: log,
    status: function(){ return { ready: ready, consent: consent(), enabled: enabled }; },
    resetConsent: function(){ try{ localStorage.removeItem(CONSENT_KEY); }catch(e){} disable(); renderToggle(); if(ready) askConsent(); }
  };

  function safe(){ try{ init(); }catch(err){ if(window.__showJsError) window.__showJsError('statistiques : ' + (err && err.message ? err.message : err)); } }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safe); else safe();
})();
