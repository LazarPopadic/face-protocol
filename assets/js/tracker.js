/* =====================================================================
   Aesthetic Protocol — progress tracker.
   Reads the per-step daily log (`fp-log`, written by routine.js),
   analyses the last weeks and responds three ways:
   1. THE FACTS — sentences generated straight from the data (names the
      exact days missed, what was skipped), no canned bank involved.
   2. INSIGHTS — a ~100-message scenario bank (streaks, misses, patterns,
      phase advice), honest + encouraging, day-seeded variants.
   3. TIPS — a ~90-tip bank rotating every hour, on Progress and Routine.
   The day flips at 03:00 to match the routine. All data stays on-device.
   ===================================================================== */
(function () {
  "use strict";

  /* ---- shared helpers -------------------------------------------------- */
  function isoOf(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(iso, n) { var d = new Date(iso); d.setDate(d.getDate() + n); return isoOf(d); }
  function dow(iso) { return (new Date(iso).getDay() + 6) % 7; }   // 0=Mon
  function get(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? fb : v; } catch (e) { return fb; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function joinNice(arr) {
    if (arr.length <= 1) return arr.join("");
    return arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
  }

  var NOW = new Date();
  var TODAY = isoOf(new Date(NOW.getTime() - 3 * 3600 * 1000));   // day flips at 03:00
  var DAYNAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // keep in sync with routine.js step order
  var AM_ROLES = ["Cleanse", "Vitamin C", "Eye cream", "Moisturise", "Sunscreen"];
  var ACT_LABEL = { retinol: "Retinol", sa: "Salicylic acid" };
  function pmRoles(act) {
    var r = ["Cleanse"];
    if (act) r.push(ACT_LABEL[act] || act);
    r.push("Eye cream", "Moisturise");
    return r;
  }

  /* ---- log I/O ---------------------------------------------------------- */
  function log() { return get("fp-log", {}); }

  function writeToday(entry) {
    var l = log();
    l[TODAY] = entry;
    var keys = Object.keys(l).sort();
    while (keys.length > 35) { delete l[keys.shift()]; }
    set("fp-log", l);
  }

  function dayStatus(iso) {
    var l = log();
    var e = l[iso];
    var hist = get("fp-history", []);
    if (!e) {
      if (hist.indexOf(iso) !== -1) return { s: "full", halves: 2, amDone: true, pmDone: true };
      var first = Object.keys(l).sort()[0];
      if (first && iso >= first && iso < TODAY) return { s: "missed", halves: 0 };
      return { s: "none", halves: 0 };
    }
    var amDone = e.am.length >= e.amT;
    var pmDone = e.pm.length >= e.pmT;
    var any = e.am.length + e.pm.length > 0;
    return {
      s: amDone && pmDone ? "full" : (any ? "partial" : "missed"),
      halves: (amDone ? 1 : 0) + (pmDone ? 1 : 0),
      amDone: amDone, pmDone: pmDone, e: e
    };
  }

  function missedRoles(e) {
    var out = { am: [], pm: [] };
    if (!e) return out;
    for (var i = 0; i < e.amT; i++) if (e.am.indexOf(i) === -1) out.am.push(AM_ROLES[i] || "Step " + (i + 1));
    var pr = pmRoles(e.act);
    for (var j = 0; j < e.pmT; j++) if (e.pm.indexOf(j) === -1) out.pm.push(pr[j] || "Step " + (j + 1));
    return out;
  }

  /* ---- analysis ---------------------------------------------------------- */
  function analyze() {
    var l = log();
    var dates = Object.keys(l).sort();
    var a = { daysTracked: dates.length, today: dayStatus(TODAY) };

    var d = TODAY, streak = 0;
    if (dayStatus(d).s !== "full") d = addDays(d, -1);
    while (dayStatus(d).s === "full") { streak++; d = addDays(d, -1); }
    a.streak = streak;
    var best = 0, run = 0, hist = get("fp-history", []).slice();
    dates.concat(hist).sort().forEach(function (iso, i, arr) {
      if (arr.indexOf(iso) !== i) return;
      run = (dayStatus(iso).s === "full") ? run + 1 : 0;
      if (run > best) best = run;
    });
    a.bestStreak = Math.max(best, streak);

    var yISO = addDays(TODAY, -1);
    var y = dayStatus(yISO);
    a.yesterday = y;
    a.yesterdayISO = yISO;
    a.yMissed = missedRoles(y.e);
    a.yWasRetinolNight = !!(y.e && y.e.act === "retinol");
    a.yRetinolSkipped = a.yWasRetinolNight && !y.pmDone;

    var cm = 0, cd = yISO;
    while (true) {
      var st = dayStatus(cd);
      if (st.s === "missed") { cm++; cd = addDays(cd, -1); } else break;
    }
    a.consecMissed = cm;
    a.comeback = y.s === "full" && dayStatus(addDays(TODAY, -2)).s === "missed";

    function weekPct(offsetWeeks) {
      var monday = addDays(TODAY, -dow(TODAY) - offsetWeeks * 7);
      var done = 0, total = 0;
      for (var i = 0; i < 7; i++) {
        var iso = addDays(monday, i);
        if (iso > TODAY) break;
        var st = dayStatus(iso);
        if (st.s === "none") continue;
        done += st.halves; total += 2;
      }
      return total ? Math.round(done / total * 100) : null;
    }
    a.thisWeekPct = weekPct(0);
    a.lastWeekPct = weekPct(1);
    a.lastWeekPerfect = a.lastWeekPct === 100;

    var amHit = 0, amN = 0, pmHit = 0, pmN = 0, spfSkips7 = 0, spfSkips14 = 0,
        retDone = 0, retN = 0, otherDone = 0, otherN = 0,
        wkndMiss = 0, wkndN = 0, wkMiss = 0, wkN = 0, partial7 = 0;
    for (var k = 1; k <= 14; k++) {
      var iso2 = addDays(TODAY, -k);
      var st2 = dayStatus(iso2);
      if (st2.s === "none") continue;
      var e = st2.e;
      amN++; pmN++;
      if (st2.amDone) amHit++;
      if (st2.pmDone) pmHit++;
      if (e && e.act === "retinol") { retN++; if (st2.pmDone) retDone++; }
      else { otherN++; if (st2.pmDone) otherDone++; }
      var wd = dow(iso2);
      if (wd >= 5) { wkndN++; if (st2.s !== "full") wkndMiss++; }
      else { wkN++; if (st2.s !== "full") wkMiss++; }
      var spfSkip = e && e.am.length > 0 && e.am.indexOf(4) === -1;
      if (spfSkip) { spfSkips14++; if (k <= 7) spfSkips7++; }
      if (k <= 7 && st2.s === "partial") partial7++;
    }
    a.amRate = amN ? amHit / amN : null;
    a.pmRate = pmN ? pmHit / pmN : null;
    a.spfSkips7 = spfSkips7;
    a.spfSkips14 = spfSkips14;
    a.partial7 = partial7;
    a.amDays14 = amN;
    a.retinolRate = retN >= 2 ? retDone / retN : null;
    a.retinolN = retN;
    a.otherNightRate = otherN >= 2 ? otherDone / otherN : null;
    a.weekendWeak = wkndN >= 2 && wkN >= 4 && (wkndMiss / wkndN) > (wkMiss / wkN) + 0.3;

    var h30 = 0, n30 = 0;
    for (var m = 1; m <= 30; m++) {
      var st3 = dayStatus(addDays(TODAY, -m));
      if (st3.s === "none") continue;
      n30++; if (st3.s === "full") h30++;
    }
    a.consistency30 = n30 >= 14 ? Math.round(h30 / n30 * 100) : null;
    a.trackedDays30 = n30;

    var start = get("fp-start", null);
    a.phase = start ? Math.min(3, Math.floor(Math.max(0, (new Date(TODAY) - new Date(start)) / 86400000) / 14)) : null;

    a.hour = NOW.getHours();
    return a;
  }

  /* ---- THE FACTS: generated straight from the data ----------------------- */
  function facts() {
    var out = [];
    var elapsed = dow(TODAY);                 // days of this week before today
    var missedDays = [], partialBits = [], doneDays = [];
    for (var i = 0; i < elapsed; i++) {
      var iso = addDays(TODAY, i - elapsed);
      var st = dayStatus(iso);
      var name = DAYNAMES[dow(iso)];
      if (st.s === "missed") missedDays.push(name);
      else if (st.s === "full") doneDays.push(name);
      else if (st.s === "partial") {
        partialBits.push(name + " (" + (st.amDone ? "morning done, evening missed" : "evening done, morning missed") + ")");
      }
    }
    if (missedDays.length) out.push("Missed this week: " + joinNice(missedDays) + ".");
    if (partialBits.length) out.push("Half-done: " + joinNice(partialBits) + ".");
    if (!missedDays.length && !partialBits.length && elapsed >= 2) out.push("Every day this week has been fully completed so far.");
    if (doneDays.length && (missedDays.length || partialBits.length)) out.push("Fully completed: " + joinNice(doneDays) + ".");

    // yesterday's skipped steps, by name
    var yISO = addDays(TODAY, -1);
    var yst = dayStatus(yISO);
    if (yst.s === "partial" && yst.e) {
      var mr = missedRoles(yst.e);
      var bits = [];
      if (mr.am.length && !yst.amDone) bits.push(mr.am.join(", ") + " (morning)");
      if (mr.pm.length && !yst.pmDone) bits.push(mr.pm.join(", ") + " (evening)");
      if (bits.length) out.push("Yesterday you skipped: " + bits.join(" · ") + ".");
    }

    // today so far
    var t = dayStatus(TODAY);
    if (t.s === "full") out.push("Today: both routines done.");
    else if (t.amDone) out.push("Today: morning done, evening still open.");
    else if (t.pmDone) out.push("Today: evening done, morning was missed.");

    return out;
  }

  /* ---- INSIGHTS: the scenario bank ---------------------------------------- */
  function bank(a) {
    var yDay = DAYNAMES[dow(a.yesterdayISO)];
    var yPMmiss = a.yMissed.pm.join(", ");
    var yAMmiss = a.yMissed.am.join(", ");
    return [
      { id: "ret-skip-safety", pri: 95, when: function () { return a.yRetinolSkipped; }, m: [
        "You missed last night's retinol. Don't double up tonight — skin doesn't work in arrears. Just do tonight as scheduled.",
        "Retinol night skipped yesterday. The rule: never compensate with a bigger or extra dose — carry on with tonight's plan as normal."
      ]},
      { id: "ret-long-off", pri: 94, when: function () { return a.consecMissed >= 7; }, m: [
        "You've been off the routine a week or more. Restart retinol gently — 2 nights a week for the first week back, then rebuild. Your skin lost its tolerance.",
        "After a week+ away, treat retinol like week one again: low frequency, build back up. Jumping straight to full schedule is how you get the redness back."
      ]},
      { id: "miss-3plus", pri: 88, when: function () { return a.consecMissed >= 3 && a.consecMissed < 7; }, m: [
        a.consecMissed + " days missed in a row. That's a pattern forming, not bad luck — pick the easiest slot (morning) and just restart there today.",
        a.consecMissed + " straight days off. Don't aim for a perfect day today; aim for *any* checked step. Momentum first, completeness later."
      ]},
      { id: "miss-2", pri: 82, when: function () { return a.consecMissed === 2; }, m: [
        "Two days missed back-to-back. One miss is noise, two is the start of a slide — today's the day that decides which it was.",
        "Yesterday and the day before both slipped. Get today's morning done and this stays a blip."
      ]},
      { id: "y-missed-full", pri: 76, when: function () { return a.yesterday.s === "missed" && a.consecMissed === 1; }, m: [
        yDay + " didn't happen — nothing checked. It costs one day, not the habit. Today resets it.",
        "You skipped " + yDay + " entirely. Fine — it happens. What matters is that it doesn't get a sequel today.",
        yDay + " was a zero. Streak's gone, but consistency isn't about never missing — it's about never missing twice."
      ]},
      { id: "streak-lost", pri: 74, when: function () { return a.streak === 0 && a.bestStreak >= 5 && a.consecMissed === 1; }, m: [
        "That was a " + a.bestStreak + "-day streak that ended. It proves you can do it — rebuilding is faster than building was.",
        "A " + a.bestStreak + "-day run just broke. Annoying, but the habit that built it didn't disappear overnight. Start streak two today."
      ]},
      { id: "y-pm-missed", pri: 72, when: function () { return a.yesterday.s === "partial" && a.yesterday.amDone && !a.yesterday.pmDone; }, m: [
        "You did " + yDay + " morning but the evening slipped" + (yPMmiss ? " (" + yPMmiss + ")" : "") + ". Evenings are where the actives live — that's the half that changes your skin.",
        yDay + " ended half-done: morning ✓, evening ✗. Try anchoring the PM routine to brushing your teeth — same trigger, every night."
      ]},
      { id: "y-am-missed", pri: 72, when: function () { return a.yesterday.s === "partial" && !a.yesterday.amDone && a.yesterday.pmDone; }, m: [
        yDay + " morning got skipped" + (yAMmiss ? " (" + yAMmiss + ")" : "") + " though you closed the evening — decent save. Mornings matter mostly for one reason: sunscreen.",
        "Evening done, morning missed on " + yDay + ". If mornings are rushed, do cleanse → vitamin C → SPF and skip the rest; that's the 80/20."
      ]},
      { id: "y-partial-both", pri: 70, when: function () { return a.yesterday.s === "partial" && !a.yesterday.amDone && !a.yesterday.pmDone; }, m: [
        yDay + " was half-hearted — bits of both routines, neither finished. Better than zero, but finishing one properly beats grazing both.",
        "Partial credit for " + yDay + ": steps here and there, nothing complete. Pick one half today and finish it clean."
      ]},
      { id: "comeback", pri: 66, when: function () { return a.comeback; }, m: [
        "Missed a day, then came straight back with a full " + yDay + ". That bounce-back is the actual skill — most people let one miss become five.",
        "Good recovery: a zero day followed by a complete one. That's exactly how a durable habit behaves."
      ]},
      { id: "spf-skips", pri: 62, when: function () { return a.spfSkips7 >= 3; }, m: [
        "Sunscreen got skipped " + a.spfSkips7 + " times this week while the rest of the morning got done. Honest truth: SPF is the single highest-value step you do — skip anything else before it.",
        a.spfSkips7 + " mornings this week ended without SPF. Everything else in the routine builds the house; sunscreen is what stops it burning down."
      ]},
      { id: "ret-nights-weak", pri: 58, when: function () { return a.retinolRate !== null && a.otherNightRate !== null && a.retinolRate < a.otherNightRate - 0.25; }, m: [
        "Pattern spotted: you complete easy evenings but retinol nights keep slipping. Those are the nights doing the heavy lifting — protect them first.",
        "Your retinol nights have a worse completion rate than your rest nights. If it's the extra step that puts you off, lay the tube on your pillow in the morning."
      ]},
      { id: "ret-nights-perfect", pri: 56, when: function () { return a.retinolRate === 1 && a.retinolN >= 3; }, m: [
        "Every retinol night in the last two weeks: done. That's the one metric that most predicts visible results — quietly excellent.",
        "Perfect retinol-night record recently. The most important nights are the ones you're not missing. Keep that exact priority."
      ]},
      { id: "spf-perfect", pri: 55, when: function () { return a.spfSkips14 === 0 && a.amDays14 >= 10; }, m: [
        "Two weeks, zero skipped sunscreens on active mornings. That single habit outworks everything else in the cabinet.",
        "SPF record: flawless for two weeks. Dermatologists would frame this."
      ]},
      { id: "pm-weak", pri: 54, when: function () { return a.amRate !== null && a.pmRate !== null && a.pmRate < a.amRate - 0.25; }, m: [
        "Two-week pattern: mornings solid, evenings leaky. The PM routine is 3–4 steps and two minutes — do it right after dinner instead of right before bed and it stops losing to tiredness.",
        "You're a morning person, by the data. Evenings trail well behind. Move the evening routine earlier — waiting until you're already sleepy is the whole problem."
      ]},
      { id: "am-weak", pri: 54, when: function () { return a.amRate !== null && a.pmRate !== null && a.amRate < a.pmRate - 0.25; }, m: [
        "Evenings are strong, mornings keep getting dropped. Minimum viable morning: cleanse, vitamin C, SPF — 90 seconds. Do that when time is short.",
        "The data says mornings are your weak half. Put the SPF next to your toothbrush; the routine follows the sunscreen."
      ]},
      { id: "partial-heavy", pri: 53, when: function () { return a.partial7 >= 3; }, m: [
        a.partial7 + " half-done days this week. Starting isn't your problem — finishing is. The last step you skip is almost always the same one; find it below and fix that slot.",
        "Lots of partial days lately. A 90%-done routine logs the same as a 50% one — close the loop; it's usually under a minute more."
      ]},
      { id: "weekend-dip", pri: 52, when: function () { return a.weekendWeak; }, m: [
        "Weekends are where your routine goes to die — noticeably worse than weekdays. Different schedule, same skin. Tie it to something that survives weekends, like your morning coffee.",
        "Weekday you is consistent; weekend you keeps skipping. If Saturday mornings are chaos, at least land the SPF and the evening routine."
      ]},
      { id: "week-perfect", pri: 48, when: function () { return a.lastWeekPerfect; }, m: [
        "Last week: 100%. Every routine, every day. That's the exact consistency the whole protocol is built on — the results compound from here.",
        "A perfect week behind you. This is what 'the plan works if you work it' looks like in practice."
      ]},
      { id: "week-strong", pri: 46, when: function () { return a.lastWeekPct !== null && a.lastWeekPct >= 85 && !a.lastWeekPerfect; }, m: [
        "Last week landed at " + a.lastWeekPct + "% — strong. The odd missed half-routine at that rate costs you almost nothing.",
        a.lastWeekPct + "% last week. That's the consistency band where skin actually changes over months. Keep that floor."
      ]},
      { id: "week-mid", pri: 44, when: function () { return a.lastWeekPct !== null && a.lastWeekPct >= 60 && a.lastWeekPct < 85; }, m: [
        "Last week: " + a.lastWeekPct + "%. Decent, not compounding. The difference between 70% and 90% is usually one specific weak slot — check the calendar below and find yours.",
        a.lastWeekPct + "% last week — the routine is surviving but not thriving. Look at which half keeps going missing; fix the slot, not the willpower."
      ]},
      { id: "week-rough", pri: 44, when: function () { return a.lastWeekPct !== null && a.lastWeekPct < 60 && a.daysTracked > 7; }, m: [
        "Last week ran at " + a.lastWeekPct + "% — below the line where the actives can do their job. Retinol at one night a week is basically decorative. Rebuild from the morning routine up.",
        a.lastWeekPct + "% last week. No judgement, but be honest with yourself: results need the boring middle weeks done too, not just the motivated ones."
      ]},
      { id: "streak-30", pri: 40, when: function () { return a.streak >= 30; }, m: [
        a.streak + " days unbroken. At this point the routine isn't a habit, it's just who you are in the bathroom. Exceptional.",
        "A full month-plus streak (" + a.streak + " days). This is the timescale where retinol and vitamin C actually show — check your skin against week one."
      ]},
      { id: "streak-14", pri: 40, when: function () { return a.streak >= 14 && a.streak < 30; }, m: [
        a.streak + " straight days. Two weeks is where most people quietly quit — you didn't. The compounding has started.",
        "Streak: " + a.streak + " days. Habit science calls this the consolidation zone; skin science calls it the first visible-results window. Both agree: keep going."
      ]},
      { id: "streak-10", pri: 40, when: function () { return a.streak >= 10 && a.streak < 14; }, m: [
        "Double digits: " + a.streak + " days straight. The routine has stopped being effort and started being furniture. Four more to two full weeks.",
        a.streak + "-day streak — past the ten-day mark, where new habits statistically stop being fragile."
      ]},
      { id: "streak-7", pri: 40, when: function () { return a.streak >= 7 && a.streak < 10; }, m: [
        "A full week, unbroken — " + a.streak + " days. The first week is the hardest one; everything after this is maintenance of momentum.",
        a.streak + "-day streak. One whole week of showing up. Your skin barrier is already better hydrated than it was seven days ago."
      ]},
      { id: "streak-5", pri: 38, when: function () { return a.streak >= 5 && a.streak < 7; }, m: [
        a.streak + " days in a row — the weekend is the usual streak-killer, so plan tonight now, not at 11pm.",
        "Five-ish days straight (" + a.streak + "). You're one weekend away from a full week. Don't hand it away cheap."
      ]},
      { id: "streak-3", pri: 38, when: function () { return a.streak >= 3 && a.streak < 5; }, m: [
        a.streak + "-day streak going. Three days is a coincidence; five is a pattern; seven is a habit. Next milestone: the full week.",
        "Three-plus days unbroken. This is exactly how every long streak in history started."
      ]},
      { id: "streak-2", pri: 36, when: function () { return a.streak === 2; }, m: [
        "Two days back-to-back. Small, real, countable. Make it three tonight.",
        "Streak: 2. The second day is more important than the tenth — it's the one that proves the first wasn't a fluke."
      ]},
      { id: "best-streak-live", pri: 34, when: function () { return a.streak >= 3 && a.streak === a.bestStreak; }, m: [
        "You're currently ON your best-ever streak (" + a.streak + " days). Every day from here is new territory.",
        "Personal record in progress — " + a.streak + " days, your longest yet. Protect it tonight."
      ]},
      { id: "milestone-week", pri: 32, when: function () { return a.daysTracked >= 7 && a.daysTracked <= 9; }, m: [
        "One full week of tracking on the books. The patterns section is now live — the tracker knows your weak slots better than you do.",
        "Seven-plus days tracked. From here the insights stop being generic and start being about *you*."
      ]},
      { id: "milestone-month", pri: 32, when: function () { return a.trackedDays30 >= 28; }, m: [
        "A full month of tracked days. Whatever the percentages say below, the fact that you're still here at day 30 puts you in a small minority.",
        "30 days of data. This is now a real record of a real habit — and the month-two version of you inherits it."
      ]},
      { id: "phase-0", pri: 30, when: function () { return a.phase === 0; }, m: [
        "Weeks 1–2 are deliberately boring: no strong actives at night yet. Boring is the point — you're building the slot in your day, not results yet.",
        "Settle-in phase: if your skin feels unremarkable right now, perfect. The only goal these two weeks is not missing days."
      ]},
      { id: "phase-1", pri: 30, when: function () { return a.phase === 1; }, m: [
        "Retinol phase note: mild dryness, flaking or the odd extra spot in weeks 3–4 is normal adjustment, not failure. Moisturise well and hold the schedule.",
        "You're in the retinol introduction window. If irritation shows up, don't quit — drop to the previous frequency for a few nights, then step back up."
      ]},
      { id: "phase-2", pri: 30, when: function () { return a.phase === 2; }, m: [
        "Weeks 5–6: retinol and salicylic acid are both live now. Keep them on separate nights, exactly as scheduled — the alternation IS the safety mechanism.",
        "Exfoliant phase: if the nose blackheads look worse before better, that's the salicylic acid doing its clearing work. Judge it at week 8, not week 5."
      ]},
      { id: "phase-3", pri: 28, when: function () { return a.phase === 3; }, m: [
        "Full routine, maintenance mode. The wins from here are invisible week-to-week and unmistakable season-to-season. Photos every month beat the mirror every day.",
        "Week 6+: nothing new to add — consistency is the entire strategy now. Boring and effective, like most things that work."
      ]},
      { id: "cons-90", pri: 26, when: function () { return a.consistency30 !== null && a.consistency30 >= 90; }, m: [
        a.consistency30 + "% of tracked days fully completed this month. Elite adherence — most people never see 60%.",
        "Monthly picture: " + a.consistency30 + "% complete days. Whatever you're doing to stay consistent, it's working — don't renovate it."
      ]},
      { id: "cons-70", pri: 24, when: function () { return a.consistency30 !== null && a.consistency30 >= 70 && a.consistency30 < 90; }, m: [
        "This month: " + a.consistency30 + "% full days. Good base. The gap to 90% is almost always one recurring weak slot — the calendar below will show you which.",
        a.consistency30 + "% over 30 days — solidly good. Nudge it up by protecting your one most-missed half-day, nothing else needs to change."
      ]},
      { id: "cons-low", pri: 24, when: function () { return a.consistency30 !== null && a.consistency30 < 70; }, m: [
        "Monthly adherence sits at " + a.consistency30 + "%. Under ~70%, the actives can't build momentum. Shrink the routine before you shrink the ambition — a 3-step day still counts.",
        a.consistency30 + "% this month. Advice: stop aiming for perfect days and start banning zero days. The floor matters more than the ceiling."
      ]},
      { id: "today-done", pri: 22, when: function () { return a.today.s === "full"; }, m: [
        "Today is already fully banked — both routines done. Nothing left to earn; go live your life.",
        "Both halves done today. ✓ Day closed. See you tomorrow morning."
      ]},
      { id: "today-am-done", pri: 20, when: function () { return a.today.amDone && !a.today.pmDone && a.hour >= 15; }, m: [
        "Morning's banked; the evening routine is still open. Two minutes after dinner and today goes in the books as complete.",
        "Half of today is done. The evening half is the one with the actives — don't leave the important half on the table."
      ]},
      { id: "today-pm-only", pri: 20, when: function () { return !a.today.amDone && a.today.pmDone; }, m: [
        "Evening done but this morning never happened. Backwards day — banked half is still a banked half.",
        "You've done tonight's routine without this morning's. It happens; tomorrow, the SPF is the piece that can't be made up later."
      ]},
      { id: "onboard-0", pri: 18, when: function () { return a.daysTracked <= 1; }, m: [
        "Tracking starts now. From today, every check-off is remembered — misses, streaks, patterns, all of it. The tracker gets smarter as the days stack up.",
        "Day one of tracking. In a week there'll be patterns here; in a month, a real picture. For now: just check things off as you do them."
      ]},
      { id: "onboard-few", pri: 16, when: function () { return a.daysTracked > 1 && a.daysTracked < 5; }, m: [
        "A few days of data so far — early, but the picture is forming. Pattern-spotting (weak slots, skipped steps) switches on as more days accumulate.",
        "The tracker has " + a.daysTracked + " days on record. Give it a week and it will start telling you things about yourself you didn't notice."
      ]},
      { id: "all-quiet", pri: 1, when: function () { return true; }, m: [
        "Nothing urgent to flag — the routine is ticking along. Consistency is the whole game, and you're playing it.",
        "All quiet: no misses worth naming, no patterns worth worrying about. That's what good weeks look like from the inside.",
        "No news is good news here — the streaks section and calendar below tell the story."
      ]}
    ];
  }

  /* ---- TIPS: large bank, rotates hourly ----------------------------------- */
  var TIPS = [
    // application technique
    "Apply products thinnest to thickest: serums before creams, SPF always last.",
    "Wait ~60 seconds between serum and moisturiser — less pilling, better absorption.",
    "Apply retinol to fully dry skin; damp skin absorbs more and irritates faster.",
    "The two-finger rule for sunscreen: two full finger-lengths for face and neck.",
    "Don't rub products in aggressively — press and smooth. Your skin isn't a frying pan.",
    "Apply eye cream with your ring finger — it naturally uses the lightest pressure.",
    "Dab eye cream from the outer corner inwards along the orbital bone, never on the lid.",
    "A pea of retinol for the whole face. Two peas isn't twice the results, it's twice the redness.",
    "Cleanse for a full 30–60 seconds — most people quit at ten.",
    "Lukewarm water, always. Hot water strips the barrier and feeds redness.",
    "Pat dry with your towel, don't drag it across your face.",
    "Take every product a little past the jaw onto the upper neck — faces don't end at the chin.",
    "Retinol night order: cleanse, dry fully, retinol, wait a few minutes, moisturise.",
    "If retinol stings on damp skin, wait ten minutes after cleansing before applying.",
    "Sandwich method for sensitive nights: moisturiser, then retinol, then moisturiser again.",
    // beard-specific
    "Short beard rule: products go through the hair to the skin — the beard is a route, not a barrier.",
    "Massage cleanser into the beard like shampoo; oil and dead skin hide at the roots.",
    "UV reaches skin under stubble. SPF the beard zone like everywhere else.",
    "Beard itch is usually the skin underneath being dry — moisturiser worked to the roots fixes it.",
    "After beard trimming, skip acids on that area for a night — freshly trimmed skin is more permeable.",
    // SPF
    "SPF on cloudy days isn't superstition: up to 80% of UV gets through cloud.",
    "UVA passes through windows. Long drives and window desks still count as sun exposure.",
    "Reapply sunscreen every 2 hours in real sun — the morning layer is gone by afternoon.",
    "Missed SPF this morning? Applying it at noon still beats nothing by a mile.",
    "Sunscreen is the cheapest anti-ageing product ever made. Everything else is a multiplier on it.",
    "Snow, water and sand bounce UV back at you — outdoor days need more SPF, not the same.",
    "Your lips burn too — that's what the SPF lip balm is for on long outdoor days.",
    // actives
    "Retinol results timeline: texture ~8 weeks, tone ~12, collagen effects at 6+ months. Patience is the active ingredient.",
    "Salicylic acid is oil-soluble — it's the only common acid that cleans inside the pore.",
    "Vitamin C works best *under* sunscreen: it mops up the UV damage SPF doesn't block.",
    "Purging from retinol lasts 2–6 weeks and happens where you always break out. New spots elsewhere = irritation, not purging.",
    "Never layer retinol and salicylic acid the same night. Alternate — that's the entire schedule's logic.",
    "If your face flakes, don't scrub the flakes off — moisturise them down and ease the retinol frequency.",
    "Blackheads on the nose refill every few weeks — salicylic acid is maintenance, not a one-off cure.",
    "Vitamin C oxidises: dark orange/brown serum has gone off. Store it capped, cool, out of light.",
    "Sensitive day? Skip the active, keep the routine: cleanse and moisturise. The habit survives, the irritation doesn't.",
    "Retinol makes skin more sun-sensitive — which is why it lives at night and SPF lives every morning.",
    "One new product at a time, two weeks apart. Otherwise you'll never know what caused what.",
    "Patch-test new actives behind the ear or inner forearm for 48 hours. Boring, and it works.",
    // lifestyle
    "Skin does its repair shift while you sleep — a consistent bedtime is an actual skincare product.",
    "Change your pillowcase weekly (or twice weekly if oily) — it's a night-long face towel.",
    "Sleeping face-down presses creases into the same spots every night. Back or side beats face-planting.",
    "Dehydration shows under the eyes first. The eye cream can't out-hydrate a dry body.",
    "Big salty meals show up as morning puffiness. The mirror lags dinner by about eight hours.",
    "Alcohol dehydrates and dilates vessels — if you notice next-day redness, that's not random.",
    "Gym sweat sessions: cleanse after, not just before. Sweat plus dried sebum is a pore's favourite meal.",
    "Wash or wipe your phone screen — it presses against your jaw more than anything else you own.",
    "Touching your face all day transfers oil and bacteria — the habit nobody tracks but every dermatologist mentions.",
    "Stress flares skin through cortisol. Sleep, training and daylight are legitimate skincare.",
    "A month of photos beats a year of mirror-checking. Same spot, same light, once a month.",
    "Omega-3 and vitamin D absorb best with a meal containing fat — breakfast with eggs beats an empty stomach.",
    "Keep fish-oil capsules in the freezer if they repeat on you — same benefit, no fishy burps.",
    // products & storage
    "Most opened skincare lasts 6–12 months (the little jar icon on the label says which). Sniff test: if it changed, bin it.",
    "Sunscreen does expire — last summer's bottle protects noticeably worse.",
    "Store actives away from the shower's heat and light; the cabinet beats the windowsill.",
    "Pump bottles and tubes keep formulas stable longer than open jars — less air, less light, fewer fingers.",
    "You need less product than you think: serums are 3–4 drops, moisturiser a blueberry, cleanser a cherry.",
    "Running out of moisturiser is how streaks die. Reorder at one-quarter left, not at empty.",
    // routine strategy
    "The routine works as a chain: cleanser preps, actives treat, moisturiser seals, SPF defends. Skipping links weakens the whole chain.",
    "Too tired for everything? Hierarchy: SPF (morning) and retinol (night) are the last two to cut.",
    "Anchor each routine to an existing habit — after brushing teeth is the classic because it already happens twice a day.",
    "The 2-minute rule: the whole evening routine takes less time than deciding whether to do it.",
    "Travelling? Decant, don't skip. Three minis keep the streak alive anywhere.",
    "Sick or exhausted: cleanse + moisturise still counts as showing up. Zero days are the only real losses.",
    "If a step keeps getting skipped, move the bottle to where the skipping happens. Environment beats willpower.",
    "Do the evening routine right after dinner, not at midnight — tired-you makes worse decisions than fed-you.",
    "Leaving products visible on the counter raises completion more than any motivation trick.",
    "Track the streak, but chase the floor: a year of 80% beats a hot month of 100% followed by quitting.",
    // expectations & skin knowledge
    "Skin cell turnover takes ~28 days when you're young — no product shows its real results in under a month.",
    "Judge the routine in photos at week 8 and week 16, not in the mirror at day 4.",
    "Redness that lasts minutes after an active is normal; redness that lasts hours is a signal to slow down.",
    "'Non-comedogenic' matters for you: oily T-zone + heavy occlusive creams is how congestion starts.",
    "Your T-zone and cheeks are different skin types. It's normal to need mattifying SPF up top and richer cream elsewhere.",
    "Under-eye darkness has three causes — pigment, thin skin, hollows. Creams help the first two; sleep and genetics own the third.",
    "Morning face puffiness is fluid, not fat — it drains within an hour of being upright. Don't judge your face before that.",
    "Weather changes stress skin: colder wind and indoor heating both dry it out. Winter may need a richer moisturiser.",
    "SPF prevents future damage; retinol repairs past damage; vitamin C protects the present. That's the whole system.",
    "The goal was never perfect skin — it's the best version of the skin you have, kept for decades.",
    // grooming adjacent
    "Brow tint fading after ~3 weeks is normal — that's the hair cycle, not a bad kit.",
    "Trim the beard *before* the evening routine, not after — trimming over fresh product wastes it.",
    "A clean towel for the face, a separate one for hands and body. Face towels collect product residue fast.",
    "Sea-salt spray is for hair, not skin — keep it off the forehead line if you're breakout-prone there.",
    "After the barber: that sharp jawline deserves a photo. Fresh-cut week is your best-face week — schedule accordingly."
  ];

  function seedPick(id, len) {
    var s = 0, str = TODAY + id;
    for (var i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) % 997;
    return s % len;
  }
  function currentTip() {
    // rotates hourly, stable within the hour
    return TIPS[seedPick("tip-hour-" + NOW.getHours(), TIPS.length)];
  }

  function pickMessages(a, n) {
    var rules = bank(a).filter(function (r) { try { return r.when(); } catch (e) { return false; } });
    if (rules.length > 1) {   // "all quiet" only when it's genuinely the only thing to say
      rules = rules.filter(function (r) { return r.id !== "all-quiet"; });
    }
    rules.sort(function (x, y) { return y.pri - x.pri; });
    return rules.slice(0, n).map(function (r) {
      return { id: r.id, pri: r.pri, text: r.m[seedPick(r.id, r.m.length)] };
    });
  }

  /* ---- nudge + tip (routine page) ----------------------------------------- */
  function mountNudge() {
    var host = document.querySelector("#routine .rsupp");
    if (!host) return;
    var a = analyze();
    var msgs = pickMessages(a, 1);
    if (msgs.length) {
      var div = document.createElement("a");
      div.className = "rnudge";
      div.href = "progress.html";
      div.innerHTML = '<span class="rnudge__txt">' + msgs[0].text + '</span><span class="rnudge__go">Progress →</span>';
      host.before(div);   // the fresh daily insight leads; the constant supplements line follows
    }
    // hourly tip at the bottom of the routine section
    var section = document.getElementById("routine");
    var tip = document.createElement("p");
    tip.className = "rtip";
    tip.innerHTML = '<span class="rtip__label">Tip</span> ' + currentTip();
    section.appendChild(tip);
  }

  /* ---- progress page --------------------------------------------------------- */
  function statusLabel(s) {
    return { full: "Complete", partial: "Partial", missed: "Missed", none: "No data" }[s];
  }

  function renderProgress(root) {
    var a = analyze();

    var msgs = pickMessages(a, 3);
    var insights = '<div class="pins">' + msgs.map(function (m, i) {
      return '<div class="pins__item' + (i === 0 ? " pins__item--lead" : "") + '">' + m.text + '</div>';
    }).join("") + '</div>';

    var f = facts();
    var factsHtml = f.length
      ? '<p class="subhead" style="margin-top:26px">The facts</p><div class="pfacts">'
        + f.map(function (t) { return '<p class="pfacts__line">' + t + '</p>'; }).join("") + '</div>'
      : "";

    var stats = '<div class="pstats">'
      + card(a.streak, "day streak", a.streak > 0 && a.streak === a.bestStreak ? "personal best" : "")
      + card(a.bestStreak, "best streak", "")
      + card(a.thisWeekPct === null ? "—" : a.thisWeekPct + "%", "this week", "so far")
      + card(a.lastWeekPct === null ? "—" : a.lastWeekPct + "%", "last week", "")
      + '</div>';
    function card(v, l, sub) {
      return '<div class="pstat"><span class="pstat__v">' + v + '</span><span class="pstat__l">' + l + '</span>'
        + (sub ? '<span class="pstat__sub">' + sub + '</span>' : '') + '</div>';
    }

    var calRows = "";
    for (var w = 3; w >= 0; w--) {
      var monday = addDays(TODAY, -dow(TODAY) - w * 7);
      var cells = "";
      var done = 0, total = 0;
      for (var i = 0; i < 7; i++) {
        var iso = addDays(monday, i);
        var cls = "pcal__cell", tip;
        if (iso > TODAY) { cls += " is-future"; tip = "Upcoming"; }
        else {
          var st = dayStatus(iso);
          cls += " is-" + st.s;
          tip = statusLabel(st.s);
          if (st.s !== "none") { done += st.halves; total += 2; }
        }
        if (iso === TODAY) cls += " is-today";
        cells += '<button type="button" class="' + cls + '" data-date="' + iso + '" title="' + iso + ' · ' + tip + '" aria-label="' + iso + ' ' + tip + '"></button>';
      }
      var pct = total ? Math.round(done / total * 100) + "%" : "—";
      calRows += '<div class="pcal__row"><span class="pcal__wk">' + (w === 0 ? "This wk" : w + " wk ago") + '</span>'
        + '<div class="pcal__cells">' + cells + '</div><span class="pcal__pct">' + pct + '</span></div>';
    }
    var calendar = '<div class="pcal">'
      + '<div class="pcal__row pcal__row--head"><span class="pcal__wk"></span><div class="pcal__cells">'
      + ["M", "T", "W", "T", "F", "S", "S"].map(function (d) { return '<span class="pcal__d">' + d + '</span>'; }).join("")
      + '</div><span class="pcal__pct"></span></div>'
      + calRows
      + '<div class="pcal__legend">'
      + '<span><i class="pcal__cell is-full"></i> Complete</span>'
      + '<span><i class="pcal__cell is-partial"></i> Partial</span>'
      + '<span><i class="pcal__cell is-missed"></i> Missed</span>'
      + '<span><i class="pcal__cell is-none"></i> No data</span>'
      + '</div></div>';

    var tipCard = '<div class="ptip"><span class="ptip__label">Tip · changes hourly</span><p class="ptip__txt">' + currentTip() + '</p></div>';

    root.innerHTML = insights + factsHtml + stats
      + '<p class="subhead" style="margin-top:34px">Last four weeks</p>' + calendar
      + '<div class="pday" id="pday" hidden></div>'
      + tipCard
      + '<p class="faint" style="font-size:0.78rem;margin-top:22px">Tracked on this device only. Tap any day for its breakdown. Missed something? Past days of this week can be filled in on the Routine page.</p>';

    root.addEventListener("click", function (e) {
      var cell = e.target.closest(".pcal__cell[data-date]");
      if (!cell) return;
      var iso = cell.getAttribute("data-date");
      var box = document.getElementById("pday");
      var st = dayStatus(iso);
      var pretty = DAYNAMES[dow(iso)] + ", " + new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      var html = '<p class="pday__title">' + pretty + ' — ' + statusLabel(st.s) + '</p>';
      if (iso > TODAY) html += '<p class="pday__line">This day hasn’t happened yet.</p>';
      else if (st.s === "none") html += '<p class="pday__line">No tracking data for this day (before tracking started).</p>';
      else if (!st.e) html += '<p class="pday__line">Completed (recorded before step-level tracking).</p>';
      else {
        var miss = missedRoles(st.e);
        html += '<p class="pday__line"><b>Morning:</b> ' + st.e.am.length + "/" + st.e.amT
          + (miss.am.length ? ' — skipped: ' + miss.am.join(", ") : (st.amDone ? " ✓" : "")) + '</p>';
        html += '<p class="pday__line"><b>Evening' + (st.e.act ? " (" + ACT_LABEL[st.e.act].toLowerCase() + " night)" : "") + ':</b> '
          + st.e.pm.length + "/" + st.e.pmT
          + (miss.pm.length ? ' — skipped: ' + miss.pm.join(", ") : (st.pmDone ? " ✓" : "")) + '</p>';
      }
      box.innerHTML = html;
      box.hidden = false;
      box.classList.remove("flash");
      void box.offsetWidth;
      box.classList.add("flash");
    });
  }

  /* ---- public API + automount ----------------------------------------------- */
  window.FPTracker = { writeToday: writeToday, analyze: analyze, pickMessages: pickMessages, facts: facts, tip: currentTip };

  var progressRoot = document.getElementById("progress-root");
  if (progressRoot) renderProgress(progressRoot);
  if (document.getElementById("routine")) mountNudge();
})();
