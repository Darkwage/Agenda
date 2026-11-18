/* ==========================================================================
   Agenda — diagnostic des alertes sonores (« le bip ne sonne pas »)
   Vérifie tout ce qui, côté Android, peut rendre le bip muet, et propose
   d'ouvrir directement le bon réglage. Accessible depuis Filtres (sous
   « Tester le bip ») et depuis l'onglet Admin.
   ========================================================================== */
(function(){
  'use strict';

  var CHANNEL = 'agenda-bip-v4';
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function plugins(){ return (window.Capacitor && window.Capacitor.Plugins) || {}; }

  var ov = null;
  function build(){
    if(ov) return;
    var st = document.createElement('style');
    st.textContent =
      '#alertchk-overlay .modal-card{ max-width:460px; }' +
      '.ac-row{ display:flex; gap:10px; align-items:flex-start; padding:9px 0; border-bottom:1px solid var(--line-soft); font-size:13px; }' +
      '.ac-row:last-child{ border-bottom:none; }' +
      '.ac-ico{ flex:none; width:20px; text-align:center; }' +
      '.ac-row small{ display:block; color:var(--ink-faint); font-size:11.5px; margin-top:2px; }' +
      '.ac-row .btn-ghost{ margin-top:6px; padding:6px 10px; font-size:12px; }' +
      '.ac-summary{ font-size:13.5px; font-weight:600; margin:0 0 10px; }' +
      '.ac-pending{ font-size:12px; color:var(--ink-soft); margin:4px 0 0; padding-left:16px; }';
    document.head.appendChild(st);
    ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'alertchk-overlay';
    ov.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h2>Le bip ne sonne pas ?</h2><button type="button" class="modal-close" data-close aria-label="Fermer">✕</button></div>' +
      '<div id="ac-body"><p class="field-hint">Vérification en cours…</p></div>' +
      '<button type="button" class="btn-primary" id="ac-test" style="margin-top:12px;">Tester le bip (dans 10 s)</button>' +
      '<button type="button" class="btn-ghost" id="ac-recheck" style="width:100%;margin-top:8px;">Revérifier</button></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){
      if(e.target === ov || e.target.closest('[data-close]')){ ov.classList.remove('is-open'); return; }
      var b = e.target.closest('[data-open-settings]');
      if(b){
        var W = plugins().WidgetBridge;
        if(W && W.openSettings) W.openSettings({ what: b.getAttribute('data-open-settings'), channelId: CHANNEL }).catch(function(){});
      }
    });
    $('ac-recheck').addEventListener('click', run);
    $('ac-test').addEventListener('click', function(){ var t = $('notif-test-btn'); if(t) t.click(); });
    // Au retour des réglages Android, on revérifie.
    document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'visible' && ov.classList.contains('is-open')) run(); });
  }

  function row(ok, title, detail, action, actionLabel){
    return '<div class="ac-row"><span class="ac-ico">' + (ok === true ? '✅' : ok === false ? '⚠️' : 'ℹ️') + '</span><span>' + esc(title) +
      (detail ? '<small>' + detail + '</small>' : '') +
      (action ? '<button type="button" class="btn-ghost" data-open-settings="' + action + '">' + esc(actionLabel) + '</button>' : '') +
      '</span></div>';
  }

  function fmt(at){
    try{ return new Date(at).toLocaleString('fr-FR', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); }catch(e){ return ''; }
  }

  function run(){
    var P = plugins(), LN = P.LocalNotifications, W = P.WidgetBridge;
    var body = $('ac-body');
    if(!LN || !W || !W.alertStatus){
      body.innerHTML = '<p class="field-hint">Ce diagnostic fonctionne dans l’appli Android.</p>';
      return;
    }
    body.innerHTML = '<p class="field-hint">Vérification en cours…</p>';
    var enabled = localStorage.getItem('agenda_notif_enabled') === '1';
    Promise.all([
      W.alertStatus({ channelId: CHANNEL }).catch(function(e){ return { error: String(e) }; }),
      LN.getPending().catch(function(){ return { notifications: [] }; })
    ]).then(function(res){
      var s = res[0] || {}, pending = (res[1] && res[1].notifications) || [];
      var problems = 0, html = '';
      function check(ok, t, d, a, al){ if(ok === false) problems++; html += row(ok, t, d, a, al); }

      check(enabled, 'Alertes sonores activées dans Agenda', enabled ? '' : 'Filtres › cochez « Alertes sonores à l’heure de la tâche ».');
      check(s.notificationsEnabled !== false, 'Notifications autorisées pour Agenda',
        s.notificationsEnabled === false ? 'Android bloque toutes les notifications de l’appli.' : '', s.notificationsEnabled === false ? 'notifications' : '', 'Ouvrir les réglages');
      if(s.channelExists === false){
        check(false, 'Canal « Changement de tâche » absent', 'Décochez puis recochez « Alertes sonores » dans Filtres pour le recréer.');
      } else if(s.channelExists){
        var imp = s.channelImportance;
        var silent = imp !== undefined && imp < 3;
        check(!silent, 'Canal « Changement de tâche » avec son',
          silent ? (imp === 0 ? 'Ce canal a été désactivé.' : 'Ce canal a été réglé en « silencieux ».') : '', silent ? 'channel' : '', 'Régler le son du bip');
        check(s.channelSound ? true : false, 'Son du bip associé au canal', s.channelSound ? '' : 'Aucun son n’est associé : choisissez un son dans les réglages du canal.', s.channelSound ? '' : 'channel', 'Régler le son du bip');
      }
      check(s.interruptionFilter === undefined || s.interruptionFilter <= 1, 'Mode « Ne pas déranger » désactivé',
        (s.interruptionFilter > 1) ? 'Le mode Ne pas déranger est actif : il coupe le son et la vibration.' : '');
      var ringer = s.ringerMode;
      check(ringer === undefined || ringer === 2, 'Téléphone en mode sonnerie',
        ringer === 0 ? 'Le téléphone est en silencieux : ni son ni vibration.' : ringer === 1 ? 'Le téléphone est en vibreur : pas de son.' : '');
      if(s.notificationVolume !== undefined){
        check(s.notificationVolume > 0, 'Volume des notifications', s.notificationVolume > 0 ? (s.notificationVolume + ' / ' + s.notificationVolumeMax) : 'Le volume des notifications est à zéro.');
      }
      check(s.exactAlarms !== false, 'Alarmes à l’heure exacte autorisées',
        s.exactAlarms === false ? 'Sans cette autorisation, Android peut retarder ou regrouper les bips.' : '', s.exactAlarms === false ? 'alarms' : '', 'Autoriser');
      var samsung = /samsung/i.test(s.manufacturer || '');
      check(s.batteryUnrestricted === true, 'Agenda non limité par l’économie de batterie',
        s.batteryUnrestricted ? '' : ('Android peut mettre l’appli en veille et retenir les bips.' +
          (samsung ? ' Sur Samsung, vérifiez aussi : Paramètres › Batterie › Limites d’utilisation en arrière-plan › Agenda ne doit pas être dans les applis en veille.' : '')),
        s.batteryUnrestricted ? '' : 'battery', 'Ouvrir les réglages de batterie');

      var tasksPending = pending.filter(function(n){ return n.title && n.title.indexOf('▶') === 0; })
        .sort(function(a, b){ return new Date(a.schedule && a.schedule.at) - new Date(b.schedule && b.schedule.at); });
      var list = tasksPending.slice(0, 3).map(function(n){ return '<li>' + esc(fmt(n.schedule && n.schedule.at)) + ' — ' + esc(n.title.replace(/^▶\s*/, '')) + '</li>'; }).join('');
      check(enabled ? tasksPending.length > 0 : null, tasksPending.length + ' bip(s) programmé(s) pour les 14 prochains jours',
        tasksPending.length ? '<ul class="ac-pending">' + list + '</ul>' : (enabled ? 'Aucun bip programmé : vérifiez que vos tâches ont une heure et que l’alerte n’est pas désactivée sur la tâche.' : ''));

      var summary = problems === 0 ? 'Tout semble en ordre. Si le bip reste muet, lancez un test ci-dessous.' : problems + ' point(s) à corriger :';
      body.innerHTML = '<p class="ac-summary">' + esc(summary) + '</p>' + html;
      if(s.error) body.innerHTML += '<p class="field-hint">Détail technique : ' + esc(s.error) + '</p>';
    });
  }

  function open(){ build(); ov.classList.add('is-open'); run(); }

  function addLink(){
    var test = $('notif-test-btn'); if(!test || $('ac-link')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'ac-link'; b.className = 'btn-ghost';
    b.style.cssText = 'width:100%;';
    b.textContent = 'Le bip ne sonne pas ?';
    var rowEl = document.createElement('div'); rowEl.className = 'toggle-row'; rowEl.appendChild(b);
    test.parentNode.parentNode.insertBefore(rowEl, test.parentNode.nextSibling);
    b.addEventListener('click', function(e){ e.stopPropagation(); try{ if(window.AgendaStats) window.AgendaStats.track('help:alerts'); }catch(err){} open(); });
  }

  window.AgendaAlertCheck = { open: open };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addLink); else addLink();
})();
