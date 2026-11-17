/* ==========================================================================
   Agenda — synchronisation avec les agendas du téléphone
   --------------------------------------------------------------------------
   • Gratuit : les rendez-vous des autres agendas (Google, Samsung, Outlook…)
     s'affichent dans le calendrier, en lecture seule, et les générateurs
     évitent ces créneaux.
   • Premium : les tâches d'Agenda sont aussi recopiées dans un agenda dédié
     « Agenda (appli) » du téléphone. Les modifications faites dans cet agenda
     (horaire, titre) sont reprises dans Agenda. Une tâche supprimée côté
     téléphone cesse d'être synchronisée mais reste dans Agenda.
   Tout se passe sur le téléphone : rien n'est envoyé sur Internet par l'appli.
   ========================================================================== */
(function(){
  'use strict';

  var KEY = 'agenda_calsync_v1';
  var TASKS_KEY = 'agenda_planner_tasks_v1';
  var DAY = 86400000;
  var DONE_PREFIX = '✓ ';

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function localIso(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function utcIso(ms){ var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function parseIso(s){ var p = String(s).split('-'); return { y:+p[0], m:+p[1], d:+p[2] }; }
  function track(k){ try{ if(window.AgendaStats) window.AgendaStats.track(k); }catch(e){} }
  function plugin(){ var P = window.Capacitor && window.Capacitor.Plugins; return P && P.CalendarSync ? P.CalendarSync : null; }
  function isNative(){ return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  function premium(){ return !!(window.Premium && window.Premium.isPremium()); }

  function loadCfg(){
    try{ var c = JSON.parse(localStorage.getItem(KEY) || 'null'); if(c && typeof c === 'object') return c; }catch(e){}
    return {};
  }
  var cfg = loadCfg();
  cfg.selected = cfg.selected || {};   // id d'agenda -> false si décoché (coché par défaut)
  function saveCfg(){ try{ localStorage.setItem(KEY, JSON.stringify(cfg)); }catch(e){} }

  var calendars = [];      // [{id,name,account,color,visible,own}]
  var byDate = {};         // 'AAAA-MM-JJ' -> [pseudo-tâches]
  var byId = {};           // id pseudo-tâche -> {task, ev}
  var status = '';         // message d'état affiché dans les Réglages
  var permission = null;   // true / false / null (inconnu)

  /* ----------------------------------------------------------------------
     LECTURE : rendez-vous du téléphone -> pseudo-tâches (lecture seule)
     ---------------------------------------------------------------------- */
  function calById(id){ for(var i = 0; i < calendars.length; i++) if(calendars[i].id === id) return calendars[i]; return null; }
  function selectedIds(){
    return calendars.filter(function(c){ return !c.own && cfg.selected[c.id] !== false; }).map(function(c){ return c.id; });
  }

  function addTo(ds, t){ (byDate[ds] = byDate[ds] || []).push(t); }

  function index(events){
    byDate = {}; byId = {};
    events.forEach(function(ev){
      var id = 'ext:' + ev.eventId + ':' + ev.begin;
      var t = { id:id, title:ev.title || '(sans titre)', category:'ext:' + ev.calendarId, external:true, done:false,
                time:'', duration:0, date:'', location:ev.location || '' };
      if(ev.allDay){
        t.date = utcIso(ev.begin);
        var last = utcIso(Math.max(ev.begin, ev.end - DAY));
        if(last > t.date) t.endDate = last;
        var d = Date.UTC(parseIso(t.date).y, parseIso(t.date).m - 1, parseIso(t.date).d);
        for(var n = 0; n < 62; n++){
          var ds = utcIso(d + n * DAY);
          if(ds > (t.endDate || t.date)) break;
          addTo(ds, t);
        }
      } else {
        var b = new Date(ev.begin);
        t.date = localIso(b);
        t.time = pad(b.getHours()) + ':' + pad(b.getMinutes());
        var midnight = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1).getTime();
        t.duration = Math.max(15, Math.round((Math.min(ev.end, midnight) - ev.begin) / 60000));
        addTo(t.date, t);
      }
      byId[id] = { task:t, ev:ev };
    });
  }

  function refreshImport(){
    var P = plugin();
    if(!P || !cfg.importOn || permission === false){ byDate = {}; byId = {}; rerender(); return Promise.resolve(); }
    return P.listCalendars().then(function(r){
      calendars = (r && r.calendars) || [];
      var ids = selectedIds();
      if(!ids.length){ index([]); return; }
      var now = Date.now();
      return P.listEvents({ from: now - 62 * DAY, to: now + 400 * DAY, calendarIds: ids }).then(function(res){
        index((res && res.events) || []);
      });
    }).then(function(){ rerender(); renderCard(); }).catch(function(err){
      if(String(err && err.message || err).indexOf('permission') >= 0){ permission = false; renderCard(); }
    });
  }

  function rerender(){ try{ if(window.AgendaApp) window.AgendaApp.render(); }catch(e){} }

  /* Accroches utilisées par index.html */
  window.AgendaHooks = window.AgendaHooks || {};
  window.AgendaHooks.eventsForDate = function(ds){ return cfg.importOn ? (byDate[ds] || []) : []; };
  window.AgendaHooks.category = function(key){
    var c = calById(String(key).slice(4));
    return { key:key, label: c ? c.name : 'Agenda du téléphone', color: c ? c.color : '#6B6F76' };
  };
  // Pour les générateurs : seuls les rendez-vous horaires bloquent un créneau.
  window.AgendaHooks.busyForDate = function(ds){
    var blocks = [];
    if(cfg.importOn){
      (byDate[ds] || []).forEach(function(t){
        if(!t.time) return;
        var p = t.time.split(':'), s = (+p[0]) * 60 + (+p[1]);
        blocks.push([s, s + t.duration]);
      });
    }
    return { blocks:blocks, full:false };
  };
  window.AgendaHooks.openEvent = function(id){ openEventSheet(byId[id]); };

  /* ----------------------------------------------------------------------
     ÉCRITURE (Premium) : tâches -> agenda dédié, et retour des modifications
     ---------------------------------------------------------------------- */
  function taskToEvent(t){
    if(!t || !t.date || t.phoneSyncOff) return null;
    var p = parseIso(t.date), begin, end, allDay = !t.time;
    if(allDay){
      begin = Date.UTC(p.y, p.m - 1, p.d);
      var e = parseIso(t.endDate || t.date);
      end = Date.UTC(e.y, e.m - 1, e.d) + DAY;
    } else {
      var h = t.time.split(':');
      begin = new Date(p.y, p.m - 1, p.d, +h[0], +h[1]).getTime();
      end = begin + Math.max(5, t.duration || 30) * 60000;
    }
    if(isNaN(begin) || isNaN(end)) return null;
    var title = (t.done ? DONE_PREFIX : '') + (t.title || '');
    var cat = null; try{ cat = window.AgendaApp.category(t.category); }catch(e2){}
    return {
      key: t.id, title: title, begin: begin, end: end, allDay: allDay,
      description: (cat && cat.label ? cat.label + ' — ' : '') + 'Tâche de l’appli Agenda',
      version: [begin, end, allDay ? 1 : 0, title].join('|')
    };
  }

  /* Reprend dans Agenda ce que l'utilisateur a changé dans l'agenda du téléphone. */
  function applyPhoneChanges(own){
    var tasks = window.AgendaApp.tasks(), map = {}, changed = 0;
    tasks.forEach(function(t){ map[t.id] = t; });
    own.forEach(function(ev){
      var t = map[ev.key]; if(!t) return;
      if(ev.deleted){ if(!t.phoneSyncOff){ t.phoneSyncOff = true; changed++; } return; }
      var now = [ev.begin, ev.end, ev.allDay ? 1 : 0, ev.title].join('|');
      if(!ev.pushed || now === ev.pushed) return;
      // Titre (et coche « ✓ » pour terminé)
      var title = ev.title || '';
      t.done = title.indexOf(DONE_PREFIX) === 0;
      t.title = t.done ? title.slice(DONE_PREFIX.length) : title;
      if(ev.allDay){
        t.date = utcIso(ev.begin);
        var last = utcIso(Math.max(ev.begin, ev.end - DAY));
        if(last > t.date) t.endDate = last; else delete t.endDate;
        t.time = '';
      } else {
        var b = new Date(ev.begin);
        t.date = localIso(b);
        t.time = pad(b.getHours()) + ':' + pad(b.getMinutes());
        t.duration = Math.max(5, Math.round((ev.end - ev.begin) / 60000));
        delete t.endDate;
      }
      changed++;
    });
    if(changed){ window.AgendaApp.save(); rerender(); }
    return changed;
  }

  var exporting = false, pendingExport = false;
  function runExport(){
    var P = plugin();
    if(!P || !cfg.exportOn || !premium() || !window.AgendaApp) return Promise.resolve();
    if(exporting){ pendingExport = true; return Promise.resolve(); }
    exporting = true;
    return P.ensureOwnCalendar({ color:'#2F5D50' }).then(function(){
      return P.readOwnEvents();
    }).then(function(r){
      var fromPhone = applyPhoneChanges((r && r.events) || []);
      var today = new Date(), min = localIso(new Date(today.getTime() - 31 * DAY)), max = localIso(new Date(today.getTime() + 400 * DAY));
      var events = window.AgendaApp.tasks().filter(function(t){ return t.date >= min && t.date <= max; })
        .map(taskToEvent).filter(Boolean);
      return P.pushEvents({ events: events }).then(function(res){
        cfg.lastSync = Date.now(); saveCfg();
        status = 'Synchronisé : ' + events.length + ' tâche(s) dans « Agenda (appli) »' +
          (fromPhone ? ' · ' + fromPhone + ' modification(s) reprise(s) du téléphone' : '') + '.';
        renderCard();
        return res;
      });
    }).catch(function(err){
      status = 'Échec de la synchronisation : ' + (err && err.message ? err.message : err);
      renderCard();
    }).then(function(){
      exporting = false;
      if(pendingExport){ pendingExport = false; scheduleExport(); }
    });
  }

  var exportTimer = null;
  function scheduleExport(){ clearTimeout(exportTimer); exportTimer = setTimeout(runExport, 2500); }

  // Toute sauvegarde des tâches déclenche une synchronisation (différée).
  try{
    var origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v){
      var r = origSet.apply(this, arguments);
      if(k === TASKS_KEY && cfg.exportOn) scheduleExport();
      return r;
    };
  }catch(e){}

  function syncAll(){
    return refreshImport().then(function(){ return runExport(); });
  }

  /* ----------------------------------------------------------------------
     FICHE D'UN RENDEZ-VOUS EXTERNE
     ---------------------------------------------------------------------- */
  var sheet = null;
  function openEventSheet(item){
    if(!item) return;
    var t = item.task, ev = item.ev, cal = calById(ev.calendarId);
    if(!sheet){
      sheet = document.createElement('div');
      sheet.className = 'modal-overlay';
      sheet.id = 'ext-event-overlay';
      sheet.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true">' +
        '<div class="modal-head"><h2 id="ext-ev-title"></h2><button type="button" class="modal-close" data-close aria-label="Fermer">✕</button></div>' +
        '<div id="ext-ev-body"></div>' +
        '<button type="button" class="btn-primary" id="ext-ev-open" style="margin-top:14px;">Ouvrir dans l’agenda du téléphone</button></div>';
      document.body.appendChild(sheet);
      sheet.addEventListener('click', function(e){
        if(e.target === sheet || e.target.closest('[data-close]')) sheet.classList.remove('is-open');
      });
    }
    $('ext-ev-title').textContent = t.title;
    var when;
    var d = new Date(ev.begin);
    var dayTxt = d.toLocaleDateString('fr-FR', ev.allDay ? { weekday:'long', day:'numeric', month:'long', timeZone:'UTC' } : { weekday:'long', day:'numeric', month:'long' });
    if(ev.allDay) when = dayTxt + (t.endDate ? ' → ' + new Date(ev.end - DAY).toLocaleDateString('fr-FR', { day:'numeric', month:'long', timeZone:'UTC' }) : '') + ' · toute la journée';
    else when = dayTxt + ' · ' + t.time + ' – ' + new Date(ev.end).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    $('ext-ev-body').innerHTML =
      '<p class="ext-ev-line">🕑 ' + esc(when) + '</p>' +
      (ev.location ? '<p class="ext-ev-line">📍 ' + esc(ev.location) + '</p>' : '') +
      '<p class="ext-ev-line"><span class="ext-dot" style="background:' + esc(cal ? cal.color : ev.color) + '"></span>' +
        esc(cal ? cal.name : 'Agenda du téléphone') + (cal && cal.account && cal.account !== cal.name ? ' · ' + esc(cal.account) : '') + '</p>' +
      '<p class="field-hint">Rendez-vous d’un autre agenda : il se modifie dans l’agenda du téléphone.</p>';
    $('ext-ev-open').onclick = function(){
      var P = plugin(); if(P) P.openEvent({ eventId: ev.eventId, begin: ev.begin, end: ev.end }).catch(function(){});
    };
    sheet.classList.add('is-open');
  }

  /* ----------------------------------------------------------------------
     CARTE DES RÉGLAGES
     ---------------------------------------------------------------------- */
  function renderCard(){
    var card = $('calsync-card'); if(!card) return;
    var open = card.getAttribute('data-open') ? ' open' : '';
    var html = '<details class="collapsible" id="calsync-details"' + open + '><summary>Agendas du téléphone <span class="chev">▸</span></summary>';
    if(!isNative() || !plugin()){
      html += '<p class="field-hint" style="margin-top:10px;">Disponible dans l’appli Android : affichez vos rendez-vous Google Agenda, Samsung ou Outlook à côté de vos tâches.</p></details>';
      card.innerHTML = html; return;
    }
    html += '<div class="calsync-body">' +
      '<label class="toggle-row calsync-toggle"><input type="checkbox" data-cs="import"' + (cfg.importOn ? ' checked' : '') + '>' +
        '<span>Afficher les rendez-vous de mes autres agendas<small>Lecture seule. Les générateurs évitent aussi ces créneaux.</small></span></label>';
    if(permission === false){
      html += '<p class="calsync-warn">Accès à l’agenda refusé. Autorisez-le dans Paramètres Android › Applications › Agenda › Autorisations › Agenda.</p>';
    }
    if(cfg.importOn && calendars.length){
      html += '<div class="calsync-list">' + calendars.filter(function(c){ return !c.own; }).map(function(c){
        return '<label class="calsync-cal"><input type="checkbox" data-cal="' + esc(c.id) + '"' + (cfg.selected[c.id] !== false ? ' checked' : '') + '>' +
          '<span class="ext-dot" style="background:' + esc(c.color) + '"></span><span class="calsync-name">' + esc(c.name) +
          (c.account && c.account !== c.name ? '<small>' + esc(c.account) + '</small>' : '') + '</span></label>';
      }).join('') + '</div>';
    }
    html += '<label class="toggle-row calsync-toggle"><input type="checkbox" data-cs="export"' + (cfg.exportOn && premium() ? ' checked' : '') + '>' +
        '<span>Envoyer mes tâches vers l’agenda du téléphone ' + (premium() ? '' : '<b class="premium-badge" style="margin-left:4px;">Premium</b>') +
        '<small>Dans un agenda dédié « Agenda (appli) ». Les changements d’horaire ou de titre faits dans cet agenda reviennent ici.</small></span></label>';
    if(cfg.importOn || cfg.exportOn){
      html += '<button type="button" class="btn-ghost" data-cs="sync" style="width:100%;margin-top:10px;">Synchroniser maintenant</button>';
      var info = status || (cfg.lastSync ? 'Dernière synchronisation : ' + new Date(cfg.lastSync).toLocaleString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '');
      if(info) html += '<p class="field-hint" style="margin:8px 0 0;">' + esc(info) + '</p>';
    }
    html += '</div></details>';
    card.innerHTML = html;
  }

  function ensurePermission(){
    var P = plugin(); if(!P) return Promise.resolve(false);
    return P.requestAccess().then(function(r){ permission = !!(r && r.granted); renderCard(); return permission; })
      .catch(function(){ permission = false; renderCard(); return false; });
  }

  function onCardChange(e){
    var el = e.target;
    if(el.getAttribute('data-cal')){
      cfg.selected[el.getAttribute('data-cal')] = el.checked; saveCfg(); refreshImport(); return;
    }
    var k = el.getAttribute('data-cs');
    if(k === 'import'){
      if(!el.checked){ cfg.importOn = false; saveCfg(); byDate = {}; byId = {}; rerender(); renderCard(); return; }
      ensurePermission().then(function(ok){
        cfg.importOn = ok; saveCfg();
        if(ok){ track('sync:import'); refreshImport(); } else renderCard();
      });
    } else if(k === 'export'){
      if(el.checked && !premium()){
        el.checked = false;
        if(window.Premium) window.Premium.openPaywall('calendar', function(){ enableExport(); });
        return;
      }
      if(el.checked) enableExport();
      else {
        cfg.exportOn = false; saveCfg();
        if(window.confirm('Supprimer aussi l’agenda « Agenda (appli) » du téléphone ? (Vos tâches restent dans Agenda.)')){
          var P = plugin(); if(P) P.deleteOwnCalendar().catch(function(){});
        }
        status = ''; renderCard();
      }
    }
  }

  function enableExport(){
    ensurePermission().then(function(ok){
      if(!ok){ renderCard(); return; }
      cfg.exportOn = true; saveCfg(); track('sync:export');
      status = 'Synchronisation en cours…'; renderCard();
      runExport();
    });
  }

  function build(){
    if($('calsync-card')) return;
    var anchor = $('theme-card') || $('sub-card') || $('gen-section'); if(!anchor) return;
    var sec = document.createElement('section');
    sec.className = 'card';
    sec.id = 'calsync-card';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    sec.addEventListener('change', onCardChange);
    sec.addEventListener('click', function(e){
      if(e.target.closest('[data-cs="sync"]')){ status = 'Synchronisation en cours…'; renderCard(); syncAll().then(function(){ if(!cfg.exportOn){ status = 'Rendez-vous mis à jour.'; renderCard(); } }); }
    });
    sec.addEventListener('toggle', function(e){
      if(e.target.id === 'calsync-details') sec[e.target.open ? 'setAttribute' : 'removeAttribute']('data-open', '1');
    }, true);
    renderCard();
  }

  function init(){
    build();
    if(cfg.importOn || cfg.exportOn){
      var P = plugin();
      if(P) P.requestAccess().then(function(r){ permission = !!(r && r.granted); if(permission) setTimeout(syncAll, 800); else renderCard(); }).catch(function(){});
    }
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible' && permission) syncAll();
    });
    document.addEventListener('agenda:premium', function(){ renderCard(); if(premium() && cfg.exportOn) scheduleExport(); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
