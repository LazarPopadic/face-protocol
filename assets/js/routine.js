/* =====================================================================
   Aesthetic Protocol — interactive routine.
   - Shows the routine for the time of day (morning 05:00–15:00, evening
     otherwise); the other column collapses into a tappable banner.
   - Step circles are tappable check-offs with a completion state,
     remembered per day (localStorage, resets naturally each date).
   ===================================================================== */
(function () {
  "use strict";
  if (!document.getElementById("routine")) return;

  var P = {
    cleanse: { role: "Cleanse", name: "Toleriane Foaming Gel", brand: "La Roche-Posay" },
    vitc:    { role: "Vitamin C", name: "C-Glow", brand: "Geek & Gorgeous" },
    eye:     { role: "Eye cream", name: "Hyalu B5", brand: "La Roche-Posay", opt: true },
    moist:   { role: "Moisturise", name: "Toleriane Sensitive", brand: "La Roche-Posay" },
    spf:     { role: "Sunscreen", name: "Anthelios UVMune 400 SPF50+", brand: "La Roche-Posay" },
    retinol: { role: "Retinol", name: "Retinol B3", brand: "La Roche-Posay", active: true, note: "pea-size · avoid the eye area" },
    sa:      { role: "Salicylic acid", name: "Salicylic Acid 2%", brand: "The Ordinary", active: true, note: "nose / T-zone only" }
  };

  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  var PHASES = [
    { range: "Weeks 1–2", name: "Settle in", pm: {} },
    { range: "Weeks 3–4", name: "Add retinol", pm: { Mon: "retinol", Thu: "retinol" } },
    { range: "Weeks 5–6", name: "Add exfoliant", pm: { Mon: "retinol", Wed: "retinol", Fri: "retinol", Tue: "sa" } },
    { range: "Week 6+", name: "Full routine", pm: { Mon: "retinol", Wed: "retinol", Fri: "retinol", Tue: "sa", Thu: "sa" } }
  ];

  var now = new Date();
  var ISO = now.toISOString().slice(0, 10);
  var morningPrimary = now.getHours() >= 5 && now.getHours() < 15;

  var state = {
    phase: 0,
    day: (now.getDay() + 6) % 7,
    open: { am: morningPrimary, pm: !morningPrimary }
  };

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
    // progress chip
    var prog = document.createElement("span");
    prog.className = "rcol__prog";
    cols[sec].head.insertBefore(prog, cols[sec].when);
    cols[sec].prog = prog;
    // header is a toggle
    cols[sec].head.setAttribute("role", "button");
    cols[sec].head.setAttribute("tabindex", "0");
    cols[sec].head.addEventListener("click", function () { setOpen(sec, !state.open[sec]); });
    cols[sec].head.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(sec, !state.open[sec]); }
    });
    // step check-off (delegated)
    cols[sec].list.addEventListener("click", function (e) {
      var btn = e.target.closest(".rstep__n");
      if (!btn) return;
      var step = btn.closest(".rstep");
      step.classList.toggle("is-done");
      btn.setAttribute("aria-pressed", step.classList.contains("is-done"));
      saveChecks(sec);
      updateProgress(sec, true);
    });
  });

  /* ---- persistence (per date + phase + day + column) ---------------- */
  function ckey(sec) { return "fpchk:" + ISO + ":" + state.phase + ":" + DAYS[state.day] + ":" + sec; }
  function loadChecks(sec) {
    try { return JSON.parse(localStorage.getItem(ckey(sec))) || []; } catch (e) { return []; }
  }
  function saveChecks(sec) {
    var done = [];
    cols[sec].list.querySelectorAll(".rstep").forEach(function (s, i) {
      if (s.classList.contains("is-done")) done.push(i);
    });
    try { localStorage.setItem(ckey(sec), JSON.stringify(done)); } catch (e) {}
  }
  // drop check keys from previous days so storage never accumulates
  try {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf("fpchk:") === 0 && k.indexOf("fpchk:" + ISO) !== 0) localStorage.removeItem(k);
    });
  } catch (e) {}

  /* ---- rendering ------------------------------------------------------ */
  function stepHTML(p, n, done, idx) {
    return '<li class="rstep' + (p.active ? " rstep--active" : "") + (done ? " is-done" : "") + '" style="animation-delay:' + (idx * 45) + 'ms">'
      + '<button type="button" class="rstep__n" aria-pressed="' + done + '" aria-label="Mark step ' + n + ' done">'
      + '<span class="rstep__num">' + n + '</span>'
      + '<svg class="rstep__ck" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '</button>'
      + '<span class="rstep__body">'
      + '<span class="rstep__role">' + p.role + (p.opt ? ' <em>· optional</em>' : '') + '</span>'
      + '<span class="rstep__prod">' + p.brand + ' ' + p.name + '</span>'
      + (p.note ? '<span class="rstep__note">' + p.note + '</span>' : '')
      + '</span></li>';
  }

  function renderList(sec, steps) {
    var done = loadChecks(sec);
    cols[sec].list.innerHTML = steps.map(function (k, i) {
      return stepHTML(P[k], i + 1, done.indexOf(i) !== -1, i);
    }).join("");
    updateProgress(sec, false);
  }

  // "whole day done" banner, injected so both sites get it without HTML edits
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
    var both = cols.am.root.classList.contains("is-complete") &&
               cols.pm.root.classList.contains("is-complete");
    dayDone.classList.toggle("is-shown", both);
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

  function updateProgress(sec, mayCelebrate) {
    var col = cols[sec];
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

  /* ---- collapse / expand --------------------------------------------- */
  function setOpen(sec, yes, instant) {
    var col = cols[sec];
    state.open[sec] = yes;
    col.root.classList.toggle("is-collapsed", !yes);
    col.head.setAttribute("aria-expanded", yes);
    col.when.textContent = yes ? col.when.getAttribute("data-label") : "Tap to open";
    var b = col.body;
    if (instant) { b.style.maxHeight = yes ? "none" : "0px"; return; }
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

  function fullDay(d) {
    return { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" }[d];
  }

  function render() {
    var phase = PHASES[state.phase];
    var day = DAYS[state.day];

    document.querySelectorAll("[data-phase]").forEach(function (b) {
      b.classList.toggle("is-active", +b.getAttribute("data-phase") === state.phase);
    });
    document.querySelectorAll("[data-day]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-day") === day);
    });

    document.getElementById("routine-context").textContent =
      phase.range + " · " + phase.name + " — " + fullDay(day);

    renderList("am", ["cleanse", "vitc", "eye", "moist", "spf"]);

    var active = phase.pm[day];
    var pm = ["cleanse"];
    if (active) pm.push(active);
    pm.push("eye", "moist");
    renderList("pm", pm);

    var note = document.getElementById("pm-note");
    if (!active) {
      note.hidden = false;
      note.innerHTML = state.phase === 0
        ? "No night treatment in this phase yet — just cleanse and moisturise while your skin settles."
        : "Recovery night — no retinol or acid tonight. Let your skin rest.";
    } else {
      note.hidden = true;
    }

    // keep open columns sized to their new content
    ["am", "pm"].forEach(function (sec) {
      if (state.open[sec]) cols[sec].body.style.maxHeight = "none";
    });
  }

  document.addEventListener("click", function (e) {
    var pb = e.target.closest("[data-phase]");
    if (pb) { state.phase = +pb.getAttribute("data-phase"); render(); return; }
    var db = e.target.closest("[data-day]");
    if (db) { state.day = DAYS.indexOf(db.getAttribute("data-day")); render(); }
  });

  render();
  setOpen("am", state.open.am, true);
  setOpen("pm", state.open.pm, true);
})();
