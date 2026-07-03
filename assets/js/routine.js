/* =====================================================================
   Aesthetic Protocol — interactive routine.
   - Time-aware: morning column primary 05:00–15:00, evening otherwise;
     the other column collapses into a tappable banner.
   - Auto-advances phase from a saved start date (set once, editable).
   - Step check-offs are locked to today; other days are a preview.
   - 7-day dots + streak counter; whole-day banner when AM+PM complete.
   All state lives in localStorage on the device.
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
  var ISO = isoOf(now);
  var TODAY = (now.getDay() + 6) % 7;
  var morningPrimary = now.getHours() >= 5 && now.getHours() < 15;

  function isoOf(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function get(k, fallback) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

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

  /* ---- per-day check persistence (today only) ------------------------- */
  function ckey(sec) { return "fpchk:" + ISO + ":" + state.phase + ":" + DAYS[state.day] + ":" + sec; }
  function loadChecks(sec) { return get(ckey(sec), []); }
  function saveChecks(sec) {
    var done = [];
    cols[sec].list.querySelectorAll(".rstep").forEach(function (s, i) {
      if (s.classList.contains("is-done")) done.push(i);
    });
    set(ckey(sec), done);
  }
  try {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf("fpchk:") === 0 && k.indexOf("fpchk:" + ISO) !== 0) localStorage.removeItem(k);
    });
  } catch (e) {}

  /* ---- history: completed days, dots, streak -------------------------- */
  function history() { return get("fp-history", []); }
  function recordToday(done) {
    var h = history();
    var i = h.indexOf(ISO);
    if (done && i === -1) h.push(ISO);
    if (!done && i !== -1) h.splice(i, 1);
    h.sort();
    if (h.length > 90) h = h.slice(-90);
    set("fp-history", h);
    renderWeek();
  }
  function streak() {
    var h = history();
    var n = 0;
    var d = new Date(ISO);
    if (h.indexOf(ISO) === -1) d.setDate(d.getDate() - 1);   // today pending → count up to yesterday
    while (h.indexOf(isoOf(d)) !== -1) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // context row: context text + week widget (injected, no HTML edits needed)
  var ctx = document.getElementById("routine-context");
  var week = document.createElement("div");
  week.className = "rweek";
  week.innerHTML = '<span class="rweek__dots"></span><span class="rweek__label"></span>';
  ctx.after(week);

  function renderWeek() {
    var h = history();
    var monday = new Date(ISO);
    monday.setDate(monday.getDate() - TODAY);
    var dots = "";
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(monday.getDate() + i);
      var dISO = isoOf(d);
      var cls = "rweek__dot";
      if (h.indexOf(dISO) !== -1) cls += " is-done";
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

  /* ---- day-done banner ------------------------------------------------- */
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
    if (state.day !== TODAY) { dayDone.classList.remove("is-shown"); return; }
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

  /* ---- progress -------------------------------------------------------- */
  function updateProgress(sec, mayCelebrate) {
    var col = cols[sec];
    if (state.day !== TODAY) {
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

  /* ---- collapse / expand ------------------------------------------------ */
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

  /* ---- rendering --------------------------------------------------------- */
  function stepHTML(p, n, done, idx, locked) {
    return '<li class="rstep' + (p.active ? " rstep--active" : "") + (done ? " is-done" : "") + '" style="animation-delay:' + (idx * 45) + 'ms">'
      + '<button type="button" class="rstep__n" aria-pressed="' + done + '" aria-label="Mark step ' + n + ' done"' + (locked ? " disabled" : "") + '>'
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
    var locked = state.day !== TODAY;
    var done = locked ? [] : loadChecks(sec);
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
    var preview = state.day !== TODAY;

    document.querySelectorAll("[data-phase]").forEach(function (b) {
      b.classList.toggle("is-active", +b.getAttribute("data-phase") === state.phase);
    });
    document.querySelectorAll("[data-day]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-day") === day);
    });

    ctx.textContent = phase.range + " · " + phase.name + " — " + fullDay(day) + (preview ? " · preview" : "");

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

    ["am", "pm"].forEach(function (sec) {
      cols[sec].root.classList.toggle("is-preview", preview);
      if (state.open[sec]) cols[sec].body.style.maxHeight = "none";
    });
    if (preview) dayDone.classList.remove("is-shown");
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
})();
