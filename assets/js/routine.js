/* =====================================================================
   Aesthetic Protocol — interactive routine (Routine page only).
   Pick a phase (how far into the ramp-up you are) + a day → it shows
   that day's morning and evening steps from the final product set.
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

  // pm[day] = the night's treatment ("retinol" | "sa"); missing = recovery night
  var PHASES = [
    { range: "Weeks 1–2", name: "Settle in", desc: "Get used to the basics — no strong actives at night yet.", pm: {} },
    { range: "Weeks 3–4", name: "Add retinol", desc: "Introduce retinol on two nights a week.", pm: { Mon: "retinol", Thu: "retinol" } },
    { range: "Weeks 5–6", name: "Add exfoliant", desc: "Retinol three nights; start salicylic acid one night.", pm: { Mon: "retinol", Wed: "retinol", Fri: "retinol", Tue: "sa" } },
    { range: "Week 6+", name: "Full routine", desc: "Your established routine.", pm: { Mon: "retinol", Wed: "retinol", Fri: "retinol", Tue: "sa", Thu: "sa" } }
  ];

  var state = { phase: 0, day: (new Date().getDay() + 6) % 7 };  // default: today

  function stepHTML(p, n) {
    return '<li class="rstep' + (p.active ? " rstep--active" : "") + '">'
      + '<span class="rstep__n">' + n + '</span>'
      + '<span class="rstep__body">'
      + '<span class="rstep__role">' + p.role + (p.opt ? ' <em>· optional</em>' : '') + '</span>'
      + '<span class="rstep__prod">' + p.brand + ' ' + p.name + '</span>'
      + (p.note ? '<span class="rstep__note">' + p.note + '</span>' : '')
      + '</span></li>';
  }

  function renderList(el, steps) {
    el.innerHTML = steps.map(function (k, i) { return stepHTML(P[k], i + 1); }).join("");
  }

  function render() {
    var phase = PHASES[state.phase];
    var day = DAYS[state.day];

    // segmented buttons active state
    document.querySelectorAll("[data-phase]").forEach(function (b) {
      b.classList.toggle("is-active", +b.getAttribute("data-phase") === state.phase);
    });
    document.querySelectorAll("[data-day]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-day") === day);
    });

    document.getElementById("routine-context").textContent = phase.range + " · " + phase.name + " — " + fullDay(day);

    // Morning — constant every day
    renderList(document.getElementById("am-steps"), ["cleanse", "vitc", "eye", "moist", "spf"]);

    // Evening — depends on phase + day
    var active = phase.pm[day];
    var pm = ["cleanse"];
    if (active) pm.push(active);
    pm.push("eye", "moist");
    renderList(document.getElementById("pm-steps"), pm);

    var note = document.getElementById("pm-note");
    if (!active) {
      note.hidden = false;
      note.innerHTML = state.phase === 0
        ? 'No night treatment in this phase yet — just cleanse and moisturise while your skin settles.'
        : 'Recovery night — no retinol or acid tonight. Let your skin rest.';
    } else {
      note.hidden = true;
    }
  }

  function fullDay(d) {
    return { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" }[d];
  }

  document.addEventListener("click", function (e) {
    var pb = e.target.closest("[data-phase]");
    if (pb) { state.phase = +pb.getAttribute("data-phase"); render(); return; }
    var db = e.target.closest("[data-day]");
    if (db) { state.day = DAYS.indexOf(db.getAttribute("data-day")); render(); }
  });

  render();
})();
