/* ==========================================================================
   Agenda — personnalisation de l'apparence (thèmes, police des titres)
   Chargé dans <head> pour appliquer le thème avant l'affichage (pas de flash).
   Gratuit : Crème, Nuit, Automatique. Premium : les autres thèmes + polices.
   ========================================================================== */
(function(){
  'use strict';

  var KEY = 'agenda_theme_v1';
  var DEFAULT = { theme:'creme', font:'serif' };

  // p = fond, s = surface, a = accent, i = texte, k = accent doux (aperçus)
  var THEMES = [
    { id:'creme',      name:'Crème',      mode:'light', free:true,  p:'#F5F3EE', s:'#FFFFFF', a:'#2F5D50', i:'#21252C', k:'#E1ECE7', color:'#2F5D50' },
    { id:'nuit',       name:'Nuit',       mode:'dark',  free:true,  p:'#121518', s:'#1A1E22', a:'#6FB39C', i:'#E8E6E1', k:'#1F3A32', color:'#121518' },
    { id:'auto',       name:'Automatique', mode:'auto', free:true },
    { id:'lavande',    name:'Lavande',    mode:'light', p:'#F4F2F8', s:'#FFFFFF', a:'#6A4C9C', i:'#25222E', k:'#ECE5F6', color:'#6A4C9C' },
    { id:'ocean',      name:'Océan',      mode:'light', p:'#F1F5F7', s:'#FFFFFF', a:'#1F6F8B', i:'#1F2A30', k:'#DDEEF4', color:'#1F6F8B' },
    { id:'terracotta', name:'Terracotta', mode:'light', p:'#F7F1EC', s:'#FFFDFB', a:'#B5532F', i:'#2B2320', k:'#F5E2D8', color:'#B5532F' },
    { id:'rose',       name:'Rose poudré', mode:'light', p:'#F8F1F2', s:'#FFFFFF', a:'#A8466A', i:'#2C2226', k:'#F4E0E8', color:'#A8466A' },
    { id:'minimal',    name:'Minimal',    mode:'light', p:'#F6F6F6', s:'#FFFFFF', a:'#1A1A1A', i:'#1A1A1A', k:'#E6E6E6', color:'#1A1A1A' },
    { id:'ardoise',    name:'Ardoise',    mode:'dark',  p:'#111723', s:'#182030', a:'#7AA2F7', i:'#E6E9EF', k:'#1E2C4A', color:'#111723' },
    { id:'minuit',     name:'Minuit doré', mode:'dark', p:'#141210', s:'#1C1915', a:'#D4A64A', i:'#EDE6D9', k:'#3A2F1A', color:'#141210' }
  ];
  var FONTS = [
    { id:'serif', name:'Élégante', sample:'Aa', css:"'Fraunces', Georgia, serif", free:true },
    { id:'sans',  name:'Moderne',  sample:'Aa', css:"'Inter', sans-serif" },
    { id:'mono',  name:'Technique', sample:'Aa', css:"'IBM Plex Mono', monospace" }
  ];
  function byId(list, id){ for(var i = 0; i < list.length; i++) if(list[i].id === id) return list[i]; return null; }

  function load(){
    try{ var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if(s && s.theme) return { theme:s.theme, font:s.font || 'serif' }; }catch(e){}
    return { theme:DEFAULT.theme, font:DEFAULT.font };
  }
  var prefs = load();
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(prefs)); }catch(e){} }

  // Statut Premium : via premium.js s'il est chargé, sinon lu directement (chargement initial).
  function premium(){
    if(window.Premium && window.Premium.isPremium) return window.Premium.isPremium();
    try{
      var s = JSON.parse(localStorage.getItem('agenda_premium_v1') || 'null');
      if(!s) return false;
      if(s.status === 'trial' || s.status === 'active') return true;
      if(s.status === 'cancelled') return !s.expiresAt || s.expiresAt > Date.now();
    }catch(e){}
    return false;
  }

  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  /* Thème réellement affiché (un thème Premium redevient « Crème » si l'abonnement s'arrête). */
  function effective(){
    var t = byId(THEMES, prefs.theme) || THEMES[0];
    if(!t.free && !premium()) t = THEMES[0];
    if(t.id === 'auto') t = (darkQuery && darkQuery.matches) ? byId(THEMES, 'nuit') : THEMES[0];
    var f = byId(FONTS, prefs.font) || FONTS[0];
    if(!f.free && !premium()) f = FONTS[0];
    return { theme:t, font:f };
  }

  function apply(){
    var e = effective(), root = document.documentElement;
    if(e.theme.id === 'creme') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', e.theme.id);
    root.setAttribute('data-mode', e.theme.mode);
    if(e.font.id === 'serif') root.removeAttribute('data-font'); else root.setAttribute('data-font', e.font.id);
    var meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', e.theme.color);
  }
  apply();
  if(darkQuery){
    var onChange = function(){ if(prefs.theme === 'auto') apply(); };
    if(darkQuery.addEventListener) darkQuery.addEventListener('change', onChange); else if(darkQuery.addListener) darkQuery.addListener(onChange);
  }

  /* ----------------------------------------------------------------------
     CARTE « APPARENCE » dans les Réglages
     ---------------------------------------------------------------------- */
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function preview(t){
    if(t.id === 'auto'){
      return '<div class="theme-prev is-split"><div class="tp-bar" style="background:#2F5D50"></div>' +
        '<div class="tp-row"><span class="tp-chip" style="background:#E1ECE7"></span><span class="tp-chip" style="background:#1F3A32"></span></div></div>';
    }
    return '<div class="theme-prev" style="background:' + t.p + '">' +
      '<div class="tp-bar" style="background:' + t.i + ';opacity:.85"></div>' +
      '<div class="tp-row"><span class="tp-chip" style="background:' + t.k + ';border-left:3px solid ' + t.a + '"></span>' +
      '<span class="tp-dot" style="background:' + t.a + '"></span></div></div>';
  }

  function render(){
    var card = document.getElementById('theme-card'); if(!card) return;
    var isPrem = premium();
    var cur = prefs.theme;
    var curFont = prefs.font;
    // Si le choix enregistré est verrouillé, on montre ce qui est réellement affiché.
    var e = effective();
    if(!(byId(THEMES, cur) || {}).free && !isPrem) cur = e.theme.id === 'nuit' && prefs.theme === 'auto' ? 'auto' : 'creme';
    if(!(byId(FONTS, curFont) || {}).free && !isPrem) curFont = 'serif';

    card.innerHTML =
      '<details class="collapsible" id="theme-details"' + (card.getAttribute('data-open') ? ' open' : '') + '>' +
      '<summary>Apparence <span class="chev">▸</span></summary>' +
      '<div class="theme-sub">Thème</div>' +
      '<div class="theme-grid">' + THEMES.map(function(t){
        return '<button type="button" class="theme-tile' + (t.id === cur ? ' is-current' : '') + '" data-theme-id="' + t.id + '" aria-label="Thème ' + esc(t.name) + '">' +
          preview(t) + (t.free ? '' : '<span class="theme-lock">🔒</span>') +
          '<span class="theme-name">' + esc(t.name) + '</span></button>';
      }).join('') + '</div>' +
      '<p class="field-hint" style="margin:8px 0 0;">« Automatique » suit le mode clair ou sombre du téléphone.</p>' +
      '<div class="theme-sub">Police des titres</div>' +
      '<div class="font-choices">' + FONTS.map(function(f){
        return '<button type="button" class="font-choice' + (f.id === curFont ? ' is-current' : '') + '" data-font-id="' + f.id + '">' +
          (f.free ? '' : '<span class="theme-lock">🔒</span>') +
          '<b style="font-family:' + f.css + '">' + f.sample + '</b><span>' + esc(f.name) + '</span></button>';
      }).join('') + '</div>' +
      '</details>';
  }

  function choose(kind, id){
    var item = kind === 'theme' ? byId(THEMES, id) : byId(FONTS, id);
    if(!item) return;
    var doIt = function(){
      prefs[kind] = id; save(); apply(); render();
      try{ if(window.AgendaStats) window.AgendaStats.track(kind === 'theme' ? 'set:theme' : 'set:font'); }catch(e){}
    };
    if(item.free || premium()) doIt();
    else if(window.Premium) window.Premium.openPaywall('themes', doIt);
  }

  function build(){
    var anchor = document.getElementById('gen-section'); if(!anchor || document.getElementById('theme-card')) return;
    var sec = document.createElement('section');
    sec.className = 'card';
    sec.id = 'theme-card';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    sec.addEventListener('click', function(e){
      var t = e.target.closest('[data-theme-id]');
      if(t){ sec.setAttribute('data-open', '1'); choose('theme', t.getAttribute('data-theme-id')); return; }
      var f = e.target.closest('[data-font-id]');
      if(f){ sec.setAttribute('data-open', '1'); choose('font', f.getAttribute('data-font-id')); }
    });
    sec.addEventListener('toggle', function(e){
      if(e.target.id === 'theme-details') sec[e.target.open ? 'setAttribute' : 'removeAttribute']('data-open', '1');
    }, true);
    render();
  }

  // Changement d'abonnement (essai, expiration…) : on réapplique.
  document.addEventListener('agenda:premium', function(){ apply(); render(); });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();

  window.AgendaTheme = { apply:apply, themes:THEMES, current:function(){ return effective(); } };
})();
