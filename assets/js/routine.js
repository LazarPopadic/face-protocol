/* =====================================================================
   Aesthetic Protocol — interactive routine.
   - Day flips at 03:00, not midnight: a routine done at 00:30 still
     counts for the evening you're finishing.
   - Time-aware: morning column primary 05:00–15:00, evening otherwise.
   - Every step carries an info line: what it does · beard · leave-on.
   - Check-offs: today is live; past days of this week are editable
     (backfill); future days are a locked preview.
   - 7-day dots + streak; whole-day banner; per-step log for the tracker.
   All state lives in localStorage on the device.
   ===================================================================== */
(function () {
  "use strict";
  if (!document.getElementById("routine")) return;

  /* what / beard / time infos assume a short all-round beard (goatee length):
     anything "through the beard" means massage down to the skin beneath. */
  var P = {
    cleanse: { role: "Cleanse", name: "Toleriane Foaming Gel", brand: "La Roche-Posay",
      info: "Removes oil, dirt and old SPF · wash through the beard to the skin · rinse off" },
    vitc:    { role: "Vitamin C", name: "C-Glow", brand: "Geek & Gorgeous",
      info: "Antioxidant — brightens and evens tone · a few drops, work through stubble to the skin · leave on" },
    eye:     { role: "Eye cream", name: "Hyalu B5", brand: "La Roche-Posay", opt: true,
      info: "Hydrates and de-puffs the under-eye · no beard contact — orbital bone only · leave on" },
    moist:   { role: "Moisturise", name: "Toleriane Sensitive", brand: "La Roche-Posay",
      info: "Hydrates and calms redness · massage through the beard down to the skin · leave on" },
    spf:     { role: "Sunscreen", name: "Anthelios UVMune 400 SPF50+", brand: "La Roche-Posay",
      info: "Blocks UV — the single biggest anti-ageing step · yes, over the beard too: skin under stubble still burns · leave on, reapply if long outdoors" },
    retinol: { role: "Retinol", name: "Retinol B3", brand: "La Roche-Posay", active: true,
      info: "Renews skin — texture, pores, collagen · pea-size, through stubble to the skin; avoid eyes and lips · leave on overnight" },
    sa:      { role: "Salicylic acid", name: "Salicylic Acid 2%", brand: "The Ordinary",
      info: "Dissolves blackhead plugs inside the pores · nose / T-zone only — the beard area doesn't need it · leave on" }
  };

  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  var PHASES = [
    { range: "Weeks 1–2", name: "Settle in", pm: {} },
    { range: "Weeks 3–4", name: "Add retinol", pm: { Mon: "retinol", Thu: "retinol" } },
    { range: "Weeks 5–6", name: "Add exfoliant", pm: { Mon: "retinol", Wed: "retinol", Fri: "retinol", Tue: "sa" } },
    { range: "Week 6+", name: "Full routine", pm: { Mon: "retinol", Wed: "retinol", Fri: "retinol", Tue: "sa", Thu: "sa" } }
  ];

  function isoOf(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(iso, n) { var d = new Date(iso); d.setDate(d.getDate() + n); return isoOf(d); }
  function get(k, fallback) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var now = new Date();
  var eff = new Date(now.getTime() - 3 * 3600 * 1000);   // the day flips at 03:00
  var ISO = isoOf(eff);
  var TODAY = (eff.getDay() + 6) % 7;
  var morningPrimary = now.getHours() >= 5 && now.getHours() < 15;

  /* ---- start date & auto phase --------------------------------------- */
  function daysSinceStart() {
    var s = get("fp-start", null);
    if (!s) return null;
    var d = Math.floor((new Date(ISO) - new Date(s)) / 86400000);
    return d < 0 ? null : d;
  }
  function phaseFromStart() {
    var d = daysSinceStart();
    if (d === null) return null;
    return Math.min(3, Math.floor(d / 14));
  }

  var state = {
    phase: phaseFromStart() !== null ? phaseFromStart() : 0,
    day: TODAY,
    open: { am: morningPrimary, pm: !morningPrimary }
  };

  function viewISO() { return addDays(ISO, state.day - TODAY); }
  function mode() { return state.day === TODAY ? "today" : (state.day < TODAY ? "backfill" : "preview"); }

  /* ---- fp-log helpers (shared store with tracker.js) ------------------ */
  function logGet() { return get("fp-log", {}); }
  function logSetDay(iso, entry) {
    var l = logGet();
    l[iso] = entry;
    var keys = Object.keys(l).sort();
    while (keys.length > 35) { delete l[keys.shift()]; }
    set("fp-log", l);
  }
  function entryFor(iso, dayIdx) {
    var e = logGet()[iso];
    if (e) return e;
    var act = PHASES[state.phase].pm[DAYS[dayIdx]] || null;
    return { ph: state.phase, am: [], amT: 5, pm: [], pmT: act ? 4 : 3, act: act };
  }

  /* ---- columns -------------------------------------------------------- */
  var cols = {};
  ["am", "pm"].forEach(function (sec) {
    var root = document.querySelector(".rcol--" + sec);
    cols[sec] = {
      root: root,
      head: root.querySelector(".rcol__head"),
      body: root.querySelector(".rcol__body"),
      list: root.querySelector(".rsteps"),
      when: root.querySelector(".rcol__when")
    };
    cols[sec].when.setAttribute("data-label", cols[sec].when.textContent);
    var prog = document.createElement("span");
    prog.className = "rcol__prog";
    cols[sec].head.insertBefore(prog, cols[sec].when);
    cols[sec].prog = prog;
    cols[sec].head.setAttribute("role", "button");
    cols[sec].head.setAttribute("tabindex", "0");
    cols[sec].head.addEventListener("click", function () { setOpen(sec, !state.open[sec]); });
    cols[sec].head.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(sec, !state.open[sec]); }
    });
    cols[sec].list.addEventListener("click", function (e) {
      var btn = e.target.closest(".rstep__n");
      if (!btn || btn.disabled) return;
      var step = btn.closest(".rstep");
      step.classList.toggle("is-done");
      btn.setAttribute("aria-pressed", step.classList.contains("is-done"));
      saveChecks(sec);
      updateProgress(sec, true);
    });
  });

  /* ---- persistence ------------------------------------------------------
     today  -> fpchk keys (live day) + mirrored into fp-log
     backfill -> written straight into fp-log for that date */
  function ckey(sec) { return "fpchk:" + ISO + ":" + state.phase + ":" + DAYS[TODAY] + ":" + sec; }

  function checkedNow(sec) {
    var done = [];
    cols[sec].list.querySelectorAll(".rstep").forEach(function (s, i) {
      if (s.classList.contains("is-done")) done.push(i);
    });
    return done;
  }

  function saveChecks(sec) {
    var done = checkedNow(sec);
    if (mode() === "today") {
      set(ckey(sec), done);
      logToday();
    } else if (mode() === "backfill") {
      var iso = viewISO();
      var e = entryFor(iso, state.day);
      e[sec] = done;
      logSetDay(iso, e);
      recordDay(iso, e.am.length >= e.amT && e.pm.length >= e.pmT);
      renderWeek();
    }
  }

  function loadChecks(sec) {
    if (mode() === "today") return get(ckey(sec), []);
    if (mode() === "backfill") return entryFor(viewISO(), state.day)[sec] || [];
    return [];
  }

  // per-step daily log for the tracker (always TODAY's real schedule)
  function logToday() {
    var act = PHASES[state.phase].pm[DAYS[TODAY]] || null;
    var kbase = "fpchk:" + ISO + ":" + state.phase + ":" + DAYS[TODAY] + ":";
    logSetDay(ISO, {
      ph: state.phase,
      am: get(kbase + "am", []), amT: 5,
      pm: get(kbase + "pm", []), pmT: act ? 4 : 3,
      act: act
    });
  }
  try {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf("fpchk:") === 0 && k.indexOf("fpchk:" + ISO) !== 0) localStorage.removeItem(k);
    });
  } catch (e) {}

  /* ---- history: completed days, dots, streak -------------------------- */
  function history() { return get("fp-history", []); }
  function recordDay(iso, done) {
    var h = history();
    var i = h.indexOf(iso);
    if (done && i === -1) h.push(iso);
    if (!done && i !== -1) h.splice(i, 1);
    h.sort();
    if (h.length > 90) h = h.slice(-90);
    set("fp-history", h);
  }
  function recordToday(done) { recordDay(ISO, done); renderWeek(); }
  function fullByLog(iso) {
    var e = logGet()[iso];
    return !!(e && e.am.length >= e.amT && e.pm.length >= e.pmT);
  }
  function dayComplete(iso) { return history().indexOf(iso) !== -1 || fullByLog(iso); }
  function streak() {
    var n = 0;
    var d = new Date(ISO);
    if (!dayComplete(ISO)) d.setDate(d.getDate() - 1);
    while (dayComplete(isoOf(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  var ctx = document.getElementById("routine-context");
  var week = document.createElement("div");
  week.className = "rweek";
  week.innerHTML = '<span class="rweek__dots"></span><span class="rweek__label"></span>';
  ctx.after(week);

  function renderWeek() {
    var monday = addDays(ISO, -TODAY);
    var dots = "";
    for (var i = 0; i < 7; i++) {
      var dISO = addDays(monday, i);
      var cls = "rweek__dot";
      if (dayComplete(dISO)) cls += " is-done";
      if (i === TODAY) cls += " is-today";
      if (i > TODAY) cls += " is-future";
      dots += '<span class="' + cls + '" title="' + DAYS[i] + '"></span>';
    }
    week.querySelector(".rweek__dots").innerHTML = dots;
    var n = streak();
    week.querySelector(".rweek__label").textContent = n > 0 ? n + "-day streak" : "This week";
  }

  /* ---- start-date control --------------------------------------------- */
  var phaseControl = document.querySelector(".seg--phase").parentElement;
  var startRow = document.createElement("div");
  startRow.className = "rstart";
  phaseControl.appendChild(startRow);

  function renderStart() {
    var s = get("fp-start", null);
    if (s) {
      var d = daysSinceStart();
      var wk = Math.floor(d / 7) + 1;
      var pretty = new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      startRow.innerHTML = 'Started <b>' + pretty + '</b> · week ' + wk +
        ' — phase set automatically. <button type="button" class="rstart__btn" data-startedit>Change</button>';
    } else {
      startRow.innerHTML = '<button type="button" class="rstart__btn" data-startedit>Set my start date</button>' +
        ' <span class="rstart__hint">so the phase advances automatically</span>';
    }
  }
  startRow.addEventListener("click", function (e) {
    if (e.target.closest("[data-startedit]")) {
      startRow.innerHTML = '<label>Start date <input type="date" max="' + ISO + '" value="' + (get("fp-start", null) || ISO) + '"></label> ' +
        '<button type="button" class="rstart__btn" data-startsave>Save</button>';
      return;
    }
    if (e.target.closest("[data-startsave]")) {
      var v = startRow.querySelector("input").value;
      if (v) {
        set("fp-start", v);
        var p = phaseFromStart();
        if (p !== null) state.phase = p;
      }
      renderStart();
      render();
    }
  });

  /* ---- day-done banner -------------------------------------------------- */
  var dayDone = document.createElement("div");
  dayDone.id = "day-done";
  dayDone.className = "day-done";
  dayDone.setAttribute("role", "status");
  dayDone.innerHTML = '<span class="day-done__spark" aria-hidden="true">✦</span>'
    + '<span>Morning and evening both complete — that’s the whole day done.</span>'
    + '<span class="day-done__spark" aria-hidden="true">✦</span>';
  document.querySelector(".routine-grid").after(dayDone);
  var celebrated = false;

  function checkDayDone(mayCelebrate) {
    if (mode() !== "today") { dayDone.classList.remove("is-shown"); return; }
    var both = cols.am.root.classList.contains("is-complete") &&
               cols.pm.root.classList.contains("is-complete");
    dayDone.classList.toggle("is-shown", both);
    recordToday(both);
    if (both && mayCelebrate && !celebrated) {
      celebrated = true;
      dayDone.classList.remove("celebrate");
      void dayDone.offsetWidth;
      dayDone.classList.add("celebrate");
      ["am", "pm"].forEach(function (s) {
        cols[s].root.classList.remove("just-done");
        void cols[s].root.offsetWidth;
        cols[s].root.classList.add("just-done");
        setTimeout(function () { cols[s].root.classList.remove("just-done"); }, 1500);
      });
    }
    if (!both) celebrated = false;
  }

  /* ---- progress ---------------------------------------------------------- */
  function updateProgress(sec, mayCelebrate) {
    var col = cols[sec];
    if (mode() === "preview") {
      col.prog.textContent = "Preview";
      col.root.classList.remove("is-complete");
      return;
    }
    var total = col.list.querySelectorAll(".rstep").length;
    var done = col.list.querySelectorAll(".rstep.is-done").length;
    col.prog.textContent = done + "/" + total;
    var complete = total > 0 && done === total;
    var was = col.root.classList.contains("is-complete");
    col.root.classList.toggle("is-complete", complete);
    if (complete && !was && mayCelebrate) {
      col.root.classList.remove("just-done");
      void col.root.offsetWidth;
      col.root.classList.add("just-done");
      setTimeout(function () { col.root.classList.remove("just-done"); }, 1500);
    }
    checkDayDone(mayCelebrate);
  }

  /* ---- collapse / expand -------------------------------------------------- */
  function setOpen(sec, yes, instant) {
    var col = cols[sec];
    state.open[sec] = yes;
    col.root.classList.toggle("is-collapsed", !yes);
    col.head.setAttribute("aria-expanded", yes);
    col.when.textContent = yes ? col.when.getAttribute("data-label") : "Tap to open";
    var b = col.body;
    if (instant) {
      b.style.transition = "none";
      b.style.maxHeight = yes ? "none" : "0px";
      void b.offsetWidth;
      b.style.transition = "";
      return;
    }
    if (yes) {
      b.style.maxHeight = "0px";
      void b.offsetWidth;
      b.style.maxHeight = b.scrollHeight + "px";
      b.addEventListener("transitionend", function te(e) {
        if (e.target !== b || e.propertyName !== "max-height") return;
        b.style.maxHeight = "none";
        b.removeEventListener("transitionend", te);
      });
    } else {
      b.style.maxHeight = b.scrollHeight + "px";
      void b.offsetWidth;
      b.style.maxHeight = "0px";
    }
  }

  /* ---- rendering ------------------------------------------------------------ */
  function stepHTML(p, n, done, idx, locked) {
    return '<li class="rstep' + (p.active ? " rstep--active" : "") + (done ? " is-done" : "") + '" style="animation-delay:' + (idx * 45) + 'ms">'
      + '<button type="button" class="rstep__n" aria-pressed="' + done + '" aria-label="Mark step ' + n + ' done"' + (locked ? " disabled" : "") + '>'
      + '<span class="rstep__num">' + n + '</span>'
      + '<svg class="rstep__ck" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '</button>'
      + '<span class="rstep__body">'
      + '<span class="rstep__role">' + p.role + (p.opt ? ' <em>· optional</em>' : '') + '</span>'
      + '<span class="rstep__prod">' + p.brand + ' ' + p.name + '</span>'
      + (p.info ? '<span class="rstep__info">' + p.info + '</span>' : '')
      + '</span></li>';
  }

  function renderList(sec, steps) {
    var locked = mode() === "preview";
    var done = loadChecks(sec);
    cols[sec].list.innerHTML = steps.map(function (k, i) {
      return stepHTML(P[k], i + 1, done.indexOf(i) !== -1, i, locked);
    }).join("");
    updateProgress(sec, false);
  }

  function fullDay(d) {
    return { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" }[d];
  }

  function render() {
    var phase = PHASES[state.phase];
    var day = DAYS[state.day];
    var m = mode();

    document.querySelectorAll("[data-phase]").forEach(function (b) {
      b.classList.toggle("is-active", +b.getAttribute("data-phase") === state.phase);
    });
    document.querySelectorAll("[data-day]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-day") === day);
    });

    ctx.textContent = phase.range + " · " + phase.name + " — " + fullDay(day)
      + (m === "preview" ? " · preview" : (m === "backfill" ? " · editing a past day" : ""));

    // schedule shown: today/future from the phase; backfill from the stored entry
    var act;
    if (m === "backfill") act = entryFor(viewISO(), state.day).act;
    else act = phase.pm[day];

    renderList("am", ["cleanse", "vitc", "eye", "moist", "spf"]);
    var pm = ["cleanse"];
    if (act) pm.push(act);
    pm.push("eye", "moist");
    renderList("pm", pm);

    var note = document.getElementById("pm-note");
    if (!act) {
      note.hidden = false;
      note.innerHTML = state.phase === 0
        ? "No night treatment in this phase yet — just cleanse and moisturise while your skin settles."
        : "Recovery night — no retinol or acid tonight. Let your skin rest.";
    } else {
      note.hidden = true;
    }

    ["am", "pm"].forEach(function (sec) {
      cols[sec].root.classList.toggle("is-preview", m === "preview");
      cols[sec].root.classList.toggle("is-backfill", m === "backfill");
      if (state.open[sec]) cols[sec].body.style.maxHeight = "none";
    });
    if (m !== "today") dayDone.classList.remove("is-shown");
    else checkDayDone(false);
  }

  document.addEventListener("click", function (e) {
    var pb = e.target.closest("[data-phase]");
    if (pb) { state.phase = +pb.getAttribute("data-phase"); render(); return; }
    var db = e.target.closest("[data-day]");
    if (db) { state.day = DAYS.indexOf(db.getAttribute("data-day")); render(); }
  });

  renderStart();
  renderWeek();
  render();
  setOpen("am", state.open.am, true);
  setOpen("pm", state.open.pm, true);
  logToday();   // record today's schedule even before any step is checked
})();
