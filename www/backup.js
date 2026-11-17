/* ==========================================================================
   Agenda — copie de secours des données
   --------------------------------------------------------------------------
   Les données de l'appli vivent dans le stockage de la WebView. Pour qu'elles
   suivent l'utilisateur lors d'un changement de téléphone (sauvegarde Android
   de son compte Google), on en garde une copie dans les préférences natives
   (SharedPreferences « CapacitorStorage »), qui font partie de la sauvegarde.
   Au premier lancement sur un téléphone restauré, la copie est réinjectée.
   ========================================================================== */
(function(){
  'use strict';
  var BACKUP_KEY = 'agenda_backup_v1';
  var MAIN_KEY = 'agenda_planner_tasks_v1';
  var SKIP = { agenda_stats_v1:1, agenda_admin_enabled:1, agenda_backup_restored:1 };

  function prefs(){ var P = window.Capacitor && window.Capacitor.Plugins; return P && P.Preferences; }
  function native(){ return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  if(!native()) return;

  function snapshot(){
    var data = {};
    for(var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if(k && k.indexOf('agenda_') === 0 && !SKIP[k]) data[k] = localStorage.getItem(k);
    }
    return JSON.stringify({ savedAt: Date.now(), data: data });
  }

  var timer = null, origSet = Storage.prototype.setItem;
  function schedule(){
    clearTimeout(timer);
    timer = setTimeout(function(){
      var P = prefs(); if(!P) return;
      P.set({ key: BACKUP_KEY, value: snapshot() }).catch(function(){});
    }, 2000);
  }
  try{
    Storage.prototype.setItem = function(k){
      var r = origSet.apply(this, arguments);
      if(this === window.localStorage && typeof k === 'string' && k.indexOf('agenda_') === 0 && !SKIP[k]) schedule();
      return r;
    };
  }catch(e){}

  // Restauration : stockage de la WebView vide mais copie de secours présente.
  try{
    var hasData = !!localStorage.getItem(MAIN_KEY);
    var P = prefs();
    if(!hasData && P && !sessionStorage.getItem('agenda_backup_checked')){
      sessionStorage.setItem('agenda_backup_checked', '1');
      P.get({ key: BACKUP_KEY }).then(function(r){
        if(!r || !r.value) return;
        var b = JSON.parse(r.value);
        if(!b || !b.data || !b.data[MAIN_KEY]) return;
        Object.keys(b.data).forEach(function(k){ origSet.call(localStorage, k, b.data[k]); });
        origSet.call(localStorage, 'agenda_backup_restored', String(b.savedAt || Date.now()));
        location.reload();
      }).catch(function(){});
    } else if(hasData){
      schedule(); // garde la copie à jour dès l'ouverture
    }
  }catch(e){}
})();
