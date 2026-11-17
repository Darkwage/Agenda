/* ==========================================================================
   Agenda — tutoriel animé
   • S'affiche au premier lancement (nouvel utilisateur, aucune tâche).
   • Se rouvre depuis Réglages › Aide & contact › Tutoriel.
   • Animations en CSS, aux couleurs du thème choisi ; version immobile si
     le téléphone demande de réduire les animations.
   ========================================================================== */
(function(){
  'use strict';

  var SEEN_KEY = 'agenda_tutorial_seen';
  var TASKS_KEY = 'agenda_planner_tasks_v1';

  function $(id){ return document.getElementById(id); }
  function track(k){ try{ if(window.AgendaStats) window.AgendaStats.track(k); }catch(e){} }

  /* ----------------------------------------------------------------------
     STYLES
     ---------------------------------------------------------------------- */
  var CSS = [
    '#tuto-overlay .modal-card{ max-width:420px; overflow:hidden; padding-bottom:calc(18px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))); }',
    '.tuto-stage{ position:relative; height:230px; margin:-4px -4px 16px; border-radius:var(--radius-l,18px); background:var(--paper); border:1px solid var(--line-soft); overflow:hidden; }',
    '.tuto-slides{ display:flex; transition:transform .35s cubic-bezier(.2,.7,.2,1); }',
    '.tuto-slide{ flex:0 0 100%; min-width:100%; position:relative; height:230px; }',
    '.tuto-first[hidden]{ display:none; }',
    '.tuto-title{ font-family:var(--font-display); font-weight:600; font-size:21px; line-height:1.2; margin:0 0 8px; text-align:center; }',
    '.tuto-text{ font-size:14px; color:var(--ink-soft); text-align:center; margin:0 4px; min-height:60px; line-height:1.45; }',
    '.tuto-text b{ color:var(--ink); }',
    '.tuto-dots{ display:flex; justify-content:center; gap:6px; margin:14px 0 14px; }',
    '.tuto-dots span{ width:7px; height:7px; border-radius:99px; background:var(--line); transition:all .25s; }',
    '.tuto-dots span.on{ width:20px; background:var(--accent); }',
    '.tuto-nav{ display:flex; gap:10px; align-items:center; }',
    '.tuto-nav .btn-primary{ flex:1; }',
    '.tuto-skip{ background:none; border:none; color:var(--ink-faint); font-size:13px; padding:10px 6px; cursor:pointer; }',
    '.tuto-first{ display:block; width:100%; margin-top:10px; background:none; border:1px solid var(--line); border-radius:var(--radius-m,12px); padding:10px; color:var(--accent-dark); font-weight:600; font-size:13px; cursor:pointer; }',

    /* petits éléments communs aux scènes */
    '.sc{ position:absolute; inset:0; }',
    '.blk{ position:absolute; border-radius:7px; background:var(--accent-soft); border-left:4px solid var(--accent); font-size:10.5px; font-weight:600; color:var(--ink); padding:4px 6px; box-sizing:border-box; white-space:nowrap; overflow:hidden; }',
    '.blk.c2{ background:#FCE7D6; border-left-color:#E0874A; color:#2B2320; }',
    '.blk.c3{ background:#E3E8FB; border-left-color:#4C6EDB; color:#1F2A30; }',
    '.hour{ position:absolute; left:10px; font-size:9px; color:var(--ink-faint); }',
    '.hline{ position:absolute; left:40px; right:14px; height:1px; background:var(--line-soft); }',
    '.finger{ position:absolute; width:30px; height:30px; border-radius:50%; background:rgba(0,0,0,.18); border:2px solid rgba(255,255,255,.9); box-shadow:0 2px 8px rgba(0,0,0,.25); pointer-events:none; }',
    '.cap{ position:absolute; font-size:10.5px; font-weight:600; color:var(--accent-dark); background:var(--surface); border:1px solid var(--line); padding:3px 8px; border-radius:99px; white-space:nowrap; }',

    /* 1. Bienvenue */
    '.s1-logo{ position:absolute; top:26px; left:0; right:0; text-align:center; font-family:var(--font-display); font-style:italic; font-size:40px; font-weight:600; color:var(--ink); animation:s1pop 6s infinite; }',
    '.s1-logo span{ color:var(--accent); }',
    '.s1-col{ position:absolute; left:50%; top:100px; width:200px; margin-left:-100px; height:110px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }',
    '.s1-col .blk{ left:10px; right:10px; height:24px; opacity:0; }',
    '.s1-col .b1{ top:10px; animation:s1drop 6s infinite .3s; }',
    '.s1-col .b2{ top:42px; animation:s1drop 6s infinite .9s; }',
    '.s1-col .b3{ top:74px; animation:s1drop 6s infinite 1.5s; }',
    '@keyframes s1pop{ 0%{transform:scale(.9);opacity:0} 10%{transform:scale(1);opacity:1} 90%{opacity:1} 100%{opacity:0} }',
    '@keyframes s1drop{ 0%{transform:translateY(-40px);opacity:0} 10%{transform:translateY(0);opacity:1} 85%{opacity:1} 95%,100%{opacity:0} }',

    /* 2. Ajouter une tâche */
    '.s2-fab{ position:absolute; right:22px; bottom:22px; width:46px; height:46px; border-radius:50%; background:var(--accent); color:var(--accent-ink); font-size:26px; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px -6px rgba(0,0,0,.4); animation:s2fab 7s infinite; }',
    '.s2-finger{ right:30px; bottom:30px; animation:s2finger 7s infinite; }',
    '.s2-sheet{ position:absolute; left:14px; right:14px; bottom:-140px; height:130px; background:var(--surface); border:1px solid var(--line); border-radius:16px 16px 0 0; box-shadow:0 -8px 24px -12px rgba(0,0,0,.3); padding:12px 14px; box-sizing:border-box; animation:s2sheet 7s infinite; }',
    '.s2-field{ height:26px; border:1px solid var(--line); border-radius:8px; margin-bottom:8px; font-size:11px; padding:5px 8px; box-sizing:border-box; color:var(--ink); overflow:hidden; white-space:nowrap; }',
    '.s2-type{ display:inline-block; overflow:hidden; white-space:nowrap; vertical-align:bottom; animation:s2type 7s infinite steps(14); }',
    '.s2-save{ height:24px; border-radius:8px; background:var(--accent); color:var(--accent-ink); font-size:11px; font-weight:600; text-align:center; line-height:24px; }',
    '.s2-new{ left:46px; right:80px; top:66px; height:34px; opacity:0; animation:s2new 7s infinite; }',
    '@keyframes s2fab{ 0%,12%{transform:scale(1);opacity:1} 16%{transform:scale(.85)} 20%{transform:scale(1);opacity:1} 24%,74%{opacity:0} 80%,100%{opacity:1} }',
    '@keyframes s2finger{ 0%{opacity:0;transform:translate(30px,30px)} 8%{opacity:1;transform:translate(0,0)} 16%{transform:scale(.8)} 22%{opacity:0} 100%{opacity:0} }',
    '@keyframes s2sheet{ 0%,20%{bottom:-140px} 28%,70%{bottom:0} 78%,100%{bottom:-140px} }',
    '@keyframes s2type{ 0%,30%{width:0} 52%,100%{width:14ch} }',
    '@keyframes s2new{ 0%,74%{opacity:0;transform:scale(.6)} 82%,96%{opacity:1;transform:scale(1)} 100%{opacity:0} }',

    /* 3. Gestes */
    '.s3-row{ position:absolute; left:14px; right:14px; height:62px; }',
    '.s3-row .blk{ left:0; width:120px; height:30px; top:4px; }',
    '.s3-row .cap{ right:0; top:8px; }',
    '.s3-r1{ top:12px; } .s3-r2{ top:84px; } .s3-r3{ top:156px; }',
    '.s3-r1 .finger{ left:44px; top:4px; animation:s3tap 4s infinite; }',
    '.s3-r1 .blk{ animation:s3edit 4s infinite; }',
    '.s3-r2 .finger{ left:44px; top:4px; animation:s3dbl 4s infinite; }',
    '.s3-r2 .blk{ animation:s3done 4s infinite; }',
    '.s3-r2 .chk{ opacity:0; animation:s3chk 4s infinite; }',
    '.s3-r3 .blk{ animation:s3move 4s infinite; }',
    '.s3-r3 .finger{ left:44px; top:4px; animation:s3drag 4s infinite; }',
    '@keyframes s3tap{ 0%,20%{opacity:0;transform:scale(1.4)} 30%{opacity:1;transform:scale(1)} 40%{transform:scale(.8)} 50%,100%{opacity:0} }',
    '@keyframes s3edit{ 0%,40%{box-shadow:none} 48%,70%{box-shadow:0 0 0 3px var(--accent-soft), 0 0 0 4px var(--accent)} 80%,100%{box-shadow:none} }',
    '@keyframes s3dbl{ 0%,20%{opacity:0} 25%{opacity:1;transform:scale(1)} 32%{transform:scale(.8)} 38%{transform:scale(1)} 44%{transform:scale(.8)} 52%,100%{opacity:0} }',
    '@keyframes s3done{ 0%,44%{opacity:1;text-decoration:none} 52%,90%{opacity:.55;text-decoration:line-through} 100%{opacity:1} }',
    '@keyframes s3chk{ 0%,44%{opacity:0} 52%,90%{opacity:1} 100%{opacity:0} }',
    '@keyframes s3drag{ 0%,15%{opacity:0;transform:translate(0,0)} 22%{opacity:1;transform:scale(.85)} 40%{transform:translate(0,0) scale(.85)} 70%{transform:translate(78px,0) scale(.85)} 78%,100%{opacity:0;transform:translate(78px,0)} }',
    '@keyframes s3move{ 0%,22%{transform:none;box-shadow:none} 30%,40%{transform:scale(1.05);box-shadow:0 6px 14px -6px rgba(0,0,0,.35)} 70%{transform:translate(78px,0) scale(1.05)} 78%,92%{transform:translate(78px,0);box-shadow:none} 100%{transform:none} }',

    /* 4. Vues */
    '.s4-seg{ position:absolute; top:16px; left:50%; width:210px; margin-left:-105px; height:30px; border:1px solid var(--line); border-radius:99px; background:var(--surface); display:flex; font-size:11.5px; font-weight:600; color:var(--ink-soft); }',
    '.s4-seg span{ flex:1; text-align:center; line-height:30px; position:relative; z-index:1; }',
    '.s4-seg span:nth-child(2){ animation:s4t1 9s infinite; } .s4-seg span:nth-child(3){ animation:s4t2 9s infinite; } .s4-seg span:nth-child(4){ animation:s4t3 9s infinite; }',
    '@keyframes s4t1{ 0%,28%{color:var(--accent-ink)} 33%,95%{color:var(--ink-soft)} 100%{color:var(--accent-ink)} }',
    '@keyframes s4t2{ 0%,30%{color:var(--ink-soft)} 34%,61%{color:var(--accent-ink)} 66%,100%{color:var(--ink-soft)} }',
    '@keyframes s4t3{ 0%,63%{color:var(--ink-soft)} 67%,94%{color:var(--accent-ink)} 98%,100%{color:var(--ink-soft)} }',
    '.s4-pill{ position:absolute; top:2px; left:2px; width:68px; height:24px; border-radius:99px; background:var(--accent); animation:s4pill 9s infinite; }',
    '.s4-v{ position:absolute; left:20px; right:20px; top:60px; bottom:16px; border:1px solid var(--line); border-radius:12px; background:var(--surface); opacity:0; }',
    '.s4-day{ animation:s4a 9s infinite; } .s4-week{ animation:s4b 9s infinite; } .s4-month{ animation:s4c 9s infinite; }',
    '.s4-day .blk{ left:12px; right:12px; }',
    '.s4-week{ display:grid; grid-template-columns:repeat(7,1fr); gap:3px; padding:8px; box-sizing:border-box; }',
    '.s4-week i{ display:block; border-radius:4px; background:var(--paper-deep); }',
    '.s4-week i.f{ background:var(--accent-soft); border-top:3px solid var(--accent); }',
    '.s4-month{ display:grid; grid-template-columns:repeat(7,1fr); grid-auto-rows:1fr; gap:3px; padding:8px; box-sizing:border-box; }',
    '.s4-month i{ display:block; border-radius:3px; background:var(--paper); position:relative; }',
    '.s4-month i.f::after{ content:""; position:absolute; left:3px; right:3px; bottom:3px; height:4px; border-radius:2px; background:var(--accent); }',
    '@keyframes s4pill{ 0%,28%{transform:translateX(0)} 33%,61%{transform:translateX(69px)} 66%,94%{transform:translateX(138px)} 100%{transform:translateX(0)} }',
    '@keyframes s4a{ 0%,28%{opacity:1} 33%,95%{opacity:0} 100%{opacity:1} }',
    '@keyframes s4b{ 0%,30%{opacity:0} 34%,61%{opacity:1} 66%,100%{opacity:0} }',
    '@keyframes s4c{ 0%,63%{opacity:0} 67%,94%{opacity:1} 98%,100%{opacity:0} }',

    /* 5. Générateurs */
    '.s5-list{ position:absolute; left:16px; top:30px; width:110px; z-index:2; }',
    '.s5-list .blk{ position:relative; display:block; height:26px; margin-bottom:10px; }',
    '.s5-arrow{ position:absolute; left:134px; top:92px; font-size:22px; color:var(--accent); animation:s5arrow 6s infinite; }',
    '.s5-cal{ position:absolute; right:16px; top:20px; width:150px; bottom:20px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }',
    '.s5-cal .hline{ left:6px; right:6px; }',
    '.s5-cal .busy{ position:absolute; left:8px; right:8px; height:22px; border-radius:6px; background:repeating-linear-gradient(135deg, var(--paper-deep) 0 5px, transparent 5px 10px); }',
    '.s5-l1{ animation:s5fly1 6s infinite; } .s5-l2{ animation:s5fly2 6s infinite; } .s5-l3{ animation:s5fly3 6s infinite; }',
    '@keyframes s5fly1{ 0%,15%{transform:none;opacity:1} 30%,85%{transform:translate(170px,-8px);opacity:1} 95%,100%{opacity:0;transform:translate(170px,-8px)} }',
    '@keyframes s5fly2{ 0%,25%{transform:none;opacity:1} 40%,85%{transform:translate(170px,42px);opacity:1} 95%,100%{opacity:0;transform:translate(170px,42px)} }',
    '@keyframes s5fly3{ 0%,35%{transform:none;opacity:1} 50%,85%{transform:translate(170px,36px);opacity:1} 95%,100%{opacity:0;transform:translate(170px,36px)} }',
    '@keyframes s5arrow{ 0%,10%{opacity:.2} 20%,50%{opacity:1;transform:translateX(4px)} 60%,100%{opacity:.2;transform:none} }',

    /* 6. Widgets et agendas */
    '.s6-phone{ position:absolute; left:50%; top:14px; width:140px; margin-left:-130px; height:200px; border-radius:20px; border:3px solid var(--ink); background:linear-gradient(160deg, #8EC5FC, #E0C3FC); overflow:hidden; }',
    '.s6-wid{ position:absolute; left:10px; right:10px; top:14px; height:92px; border-radius:14px; background:var(--paper); padding:6px; box-sizing:border-box; animation:s6wid 6s infinite; transform-origin:center top; }',
    '.s6-wid .t{ font-size:8px; font-weight:700; color:var(--accent); letter-spacing:.05em; }',
    '.s6-wid .blk{ position:relative; display:block; height:16px; margin-top:4px; font-size:8px; padding:2px 4px; }',
    '.s6-icons{ position:absolute; left:12px; right:12px; bottom:14px; display:flex; justify-content:space-between; }',
    '.s6-icons i{ width:22px; height:22px; border-radius:7px; background:rgba(255,255,255,.75); }',
    '.s6-cals{ position:absolute; right:22px; top:30px; width:110px; }',
    '.s6-cal{ display:flex; align-items:center; gap:6px; font-size:10.5px; font-weight:600; color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:6px 8px; margin-bottom:8px; opacity:0; animation:s6cal 6s infinite; }',
    '.s6-cal i{ width:9px; height:9px; border-radius:50%; flex:none; }',
    '.s6-cal:nth-child(2){ animation-delay:.4s; } .s6-cal:nth-child(3){ animation-delay:.8s; }',
    '.s6-plus{ font-size:11px; color:var(--ink-soft); text-align:center; opacity:0; animation:s6cal 6s infinite 1.2s; }',
    '@keyframes s6wid{ 0%{transform:scale(.6);opacity:0} 12%,90%{transform:scale(1);opacity:1} 100%{opacity:0} }',
    '@keyframes s6cal{ 0%,15%{opacity:0;transform:translateX(16px)} 25%,88%{opacity:1;transform:none} 100%{opacity:0} }',

    /* 7. Personnaliser */
    '.s7-card{ position:absolute; left:50%; top:22px; width:170px; margin-left:-85px; height:150px; border-radius:16px; border:1px solid rgba(0,0,0,.08); padding:12px; box-sizing:border-box; animation:s7bg 8s infinite; }',
    '.s7-card .ln{ height:9px; width:70%; border-radius:5px; background:rgba(0,0,0,.65); margin-bottom:12px; animation:s7ink 8s infinite; }',
    '.s7-card .ch{ height:22px; border-radius:6px; margin-bottom:8px; animation:s7chip 8s infinite; }',
    '.s7-card .dot{ position:absolute; right:14px; bottom:14px; width:30px; height:30px; border-radius:50%; animation:s7acc 8s infinite; }',
    '.s7-sw{ position:absolute; left:50%; bottom:16px; margin-left:-95px; width:190px; display:flex; justify-content:space-between; }',
    '.s7-sw i{ width:22px; height:22px; border-radius:50%; border:2px solid var(--surface); box-shadow:0 0 0 1px var(--line); }',
    '@keyframes s7bg{ 0%,20%{background:#F5F3EE} 25%,45%{background:#121518} 50%,70%{background:#FFF0F6} 75%,95%{background:#120E2B} 100%{background:#F5F3EE} }',
    '@keyframes s7ink{ 0%,20%{background:#21252C} 25%,45%{background:#E8E6E1} 50%,70%{background:#3A2440} 75%,95%{background:#EEEAFF} 100%{background:#21252C} }',
    '@keyframes s7chip{ 0%,20%{background:#E1ECE7} 25%,45%{background:#1F3A32} 50%,70%{background:#FCE1EF} 75%,95%{background:#2D2660} 100%{background:#E1ECE7} }',
    '@keyframes s7acc{ 0%,20%{background:#2F5D50} 25%,45%{background:#6FB39C} 50%,70%{background:#E2559A} 75%,95%{background:#9B8CFF} 100%{background:#2F5D50} }',

    '@media (prefers-reduced-motion: reduce){ .tuto-stage *{ animation-duration:0s !important; animation-iteration-count:1 !important; animation-delay:0s !important; } .tuto-slides{ transition:none; } }'
  ].join('\n');

  /* ----------------------------------------------------------------------
     DIAPOSITIVES
     ---------------------------------------------------------------------- */
  function hours(list){
    return list.map(function(h){
      return '<span class="hour" style="top:' + (h[1] - 5) + 'px">' + h[0] + '</span><span class="hline" style="top:' + h[1] + 'px"></span>';
    }).join('');
  }

  var SLIDES = [
    {
      title: 'Bienvenue dans Agenda',
      text: 'Notez ce que vous avez à faire : Agenda le range dans votre journée, et peut même <b>trouver le bon moment</b> pour le faire.',
      scene: '<div class="sc"><div class="s1-logo">Ag<span>e</span>nda</div><div class="s1-col">' +
        '<div class="blk b1">Réunion · 9:00</div><div class="blk c2 b2">Sport · 12:30</div><div class="blk c3 b3">Courses · 18:00</div></div></div>'
    },
    {
      title: 'Ajouter une tâche',
      text: 'Touchez le bouton <b>＋</b> en bas à droite, donnez un titre, une date et une heure, puis <b>Enregistrer</b>.',
      scene: '<div class="sc">' + hours([['9h', 40], ['10h', 82], ['11h', 124], ['12h', 166]]) +
        '<div class="blk s2-new">Réviser les maths</div>' +
        '<div class="s2-sheet"><div class="s2-field"><span class="s2-type">Réviser les maths</span></div><div class="s2-field">Mardi · 10:00 · 1 h</div><div class="s2-save">Enregistrer</div></div>' +
        '<div class="s2-fab">＋</div><div class="finger s2-finger"></div></div>'
    },
    {
      title: 'Les gestes à connaître',
      text: 'Ils fonctionnent sur toutes les tâches du calendrier. Un appui long sans bouger sélectionne plusieurs tâches à la fois.',
      scene: '<div class="sc">' +
        '<div class="s3-row s3-r1"><div class="blk">Exposé</div><div class="finger"></div><span class="cap">Toucher : modifier</span></div>' +
        '<div class="s3-row s3-r2"><div class="blk c2">Sport <span class="chk">✓</span></div><div class="finger"></div><span class="cap">Double toucher : terminée</span></div>' +
        '<div class="s3-row s3-r3"><div class="blk c3">Dentiste</div><div class="finger"></div><span class="cap" style="top:38px">Appui long + glisser : déplacer</span></div>' +
        '</div>'
    },
    {
      title: 'Jour, Semaine ou Mois',
      text: 'Changez de vue en haut du calendrier. Les flèches ‹ › font défiler les périodes, <b>Aujourd’hui</b> vous ramène à la date du jour.',
      scene: '<div class="sc"><div class="s4-seg"><div class="s4-pill"></div><span>Jour</span><span>Semaine</span><span>Mois</span></div>' +
        '<div class="s4-v s4-day"><div class="blk" style="top:12px;height:30px">Réunion</div><div class="blk c2" style="top:52px;height:22px">Sport</div><div class="blk c3" style="top:84px;height:40px">Révisions</div></div>' +
        '<div class="s4-v s4-week">' + '<i></i><i class="f"></i><i></i><i class="f"></i><i class="f"></i><i></i><i></i>' + '</div>' +
        '<div class="s4-v s4-month">' + Array.apply(null, Array(28)).map(function(_, i){ return '<i' + ([2, 5, 9, 12, 16, 20, 23, 26].indexOf(i) >= 0 ? ' class="f"' : '') + '></i>'; }).join('') + '</div></div>'
    },
    {
      title: 'Les générateurs',
      text: 'Onglet <b>Générateurs</b> : listez vos tâches (ou vos matières et dates d’examen), Agenda les place tout seul dans vos <b>créneaux libres</b>.',
      scene: '<div class="sc"><div class="s5-list"><div class="blk s5-l1">Rapport</div><div class="blk c2 s5-l2">Maths ch.4</div><div class="blk c3 s5-l3">Anglais</div></div>' +
        '<div class="s5-arrow">➜</div><div class="s5-cal">' +
        '<span class="hline" style="top:46px"></span><span class="hline" style="top:96px"></span><span class="hline" style="top:146px"></span>' +
        '<div class="busy" style="top:56px"></div><div class="busy" style="top:156px"></div></div></div>'
    },
    {
      title: 'Widgets et autres agendas',
      text: 'Sur l’écran d’accueil : <b>appui long › Widgets › Agenda</b>. Vos rendez-vous Google ou Samsung : <b>Réglages › Agendas du téléphone</b>.',
      scene: '<div class="sc"><div class="s6-phone"><div class="s6-wid"><div class="t">AUJOURD’HUI</div><div class="blk">Réunion 9:00</div><div class="blk c2">Sport 12:30</div><div class="blk c3">Courses 18:00</div></div>' +
        '<div class="s6-icons"><i></i><i></i><i></i><i></i></div></div>' +
        '<div class="s6-cals"><div class="s6-cal"><i style="background:#4285F4"></i>Google</div><div class="s6-cal"><i style="background:#1F8A70"></i>Travail</div><div class="s6-cal"><i style="background:#0B8043"></i>Jours fériés</div><div class="s6-plus">→ dans Agenda</div></div></div>'
    },
    {
      title: 'À votre image',
      text: 'Thèmes clairs, sombres ou fantaisie : <b>Réglages › Apparence</b>. Ce tutoriel reste disponible dans <b>Réglages › Aide &amp; contact</b>.',
      scene: '<div class="sc"><div class="s7-card"><div class="ln"></div><div class="ch"></div><div class="ch" style="width:75%"></div><div class="dot"></div></div>' +
        '<div class="s7-sw"><i style="background:#2F5D50"></i><i style="background:#121518"></i><i style="background:#E2559A"></i><i style="background:#9B8CFF"></i><i style="background:#3B5BDB"></i><i style="background:#FF6B4A"></i></div></div>'
    }
  ];

  /* ----------------------------------------------------------------------
     FENÊTRE
     ---------------------------------------------------------------------- */
  var ov = null, idx = 0;

  function build(){
    if(ov) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'tuto-overlay';
    ov.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-label="Tutoriel">' +
        '<div class="tuto-stage"><div class="tuto-slides" id="tuto-slides">' +
          SLIDES.map(function(s, i){ return '<div class="tuto-slide" data-i="' + i + '"></div>'; }).join('') +
        '</div></div>' +
        '<h2 class="tuto-title" id="tuto-title"></h2>' +
        '<p class="tuto-text" id="tuto-text"></p>' +
        '<div class="tuto-dots" id="tuto-dots">' + SLIDES.map(function(){ return '<span></span>'; }).join('') + '</div>' +
        '<div class="tuto-nav"><button type="button" class="tuto-skip" id="tuto-skip">Passer</button>' +
        '<button type="button" class="btn-primary" id="tuto-next">Suivant</button></div>' +
        '<button type="button" class="tuto-first" id="tuto-first" hidden>＋ Créer ma première tâche</button>' +
      '</div>';
    document.body.appendChild(ov);

    $('tuto-next').addEventListener('click', function(){ if(idx < SLIDES.length - 1) go(idx + 1); else close('done'); });
    $('tuto-skip').addEventListener('click', function(){ if(idx > 0 && idx === SLIDES.length - 1) go(idx - 1); else close('skip'); });
    $('tuto-first').addEventListener('click', function(){
      close('done');
      setTimeout(function(){
        var b = $('fab-add'); if(b && b.offsetParent !== null){ b.click(); return; }
        var d = $('open-add-btn'); if(d) d.click();
      }, 250);
    });
    $('tuto-dots').addEventListener('click', function(e){
      var dots = Array.prototype.slice.call(this.children), i = dots.indexOf(e.target);
      if(i >= 0) go(i);
    });

    // Glisser horizontalement pour changer de diapositive
    var stage = ov.querySelector('.tuto-stage'), sx = null, sy = 0;
    stage.addEventListener('pointerdown', function(e){ sx = e.clientX; sy = e.clientY; });
    stage.addEventListener('pointerup', function(e){
      if(sx === null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)){
        if(dx < 0 && idx < SLIDES.length - 1) go(idx + 1);
        if(dx > 0 && idx > 0) go(idx - 1);
      }
    });
  }

  // Une seule scène animée à la fois : on la (re)crée pour relancer son animation.
  function go(i){
    idx = i;
    var slides = ov.querySelectorAll('.tuto-slide');
    Array.prototype.forEach.call(slides, function(el, k){ el.innerHTML = k === i ? SLIDES[k].scene : ''; });
    $('tuto-slides').style.transform = 'translateX(' + (-100 * i) + '%)';
    $('tuto-title').textContent = SLIDES[i].title;
    $('tuto-text').innerHTML = SLIDES[i].text;
    Array.prototype.forEach.call($('tuto-dots').children, function(d, k){ d.classList.toggle('on', k === i); });
    var last = i === SLIDES.length - 1;
    $('tuto-next').textContent = last ? 'C’est parti !' : 'Suivant';
    $('tuto-skip').textContent = last ? 'Retour' : 'Passer';
    $('tuto-first').hidden = !last;
  }

  function open(){
    build();
    go(0);
    ov.classList.add('is-open');
  }

  function close(how){
    try{ localStorage.setItem(SEEN_KEY, String(Date.now())); }catch(e){}
    track(how === 'skip' ? 'tutorial:skip' : 'tutorial:done');
    ov.classList.remove('is-open');
  }

  /* ----------------------------------------------------------------------
     DÉCLENCHEMENT
     ---------------------------------------------------------------------- */
  function hasTasks(){
    try{ var t = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]'); return Array.isArray(t) && t.length > 0; }catch(e){ return false; }
  }

  function addHelpButton(){
    var list = document.querySelector('#help-card .help-list');
    if(!list || list.querySelector('[data-help="tutorial"]')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-ghost';
    b.setAttribute('data-help', 'tutorial');
    b.textContent = '🎓 Tutoriel';
    list.insertBefore(b, list.firstChild);
    b.addEventListener('click', function(e){ e.stopPropagation(); track('help:tutorial'); open(); });
  }

  function init(){
    addHelpButton();
    var seen = null; try{ seen = localStorage.getItem(SEEN_KEY); }catch(e){}
    // Premier lancement : aucune tâche et tutoriel jamais vu.
    if(!seen && !hasTasks()){
      var tries = 0;
      var tryOpen = function(){
        // On attend qu'aucune autre fenêtre ne soit ouverte.
        if(document.querySelector('.modal-overlay.is-open') && tries++ < 40){ setTimeout(tryOpen, 1500); return; }
        open();
      };
      setTimeout(tryOpen, 700);
    } else if(!seen){
      try{ localStorage.setItem(SEEN_KEY, 'existing-user'); }catch(e){}
    }
  }

  window.AgendaTutorial = { open: open };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
