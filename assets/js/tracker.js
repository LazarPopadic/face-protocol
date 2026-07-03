/* =====================================================================
   Aesthetic Protocol — progress tracker.
   Reads the per-step daily log (written by routine.js into `fp-log`),
   analyses the last weeks, and speaks through a bank of scenario-based
   messages: honest about what was missed, constructive about fixing it.
   Mounts a small nudge on the routine page and the full Progress page.
   All data stays in localStorage on the device.
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

  var TODAY = isoOf(new Date());
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
    while (keys.length > 35) { delete l[keys.shift()]; }   // keep 5 weeks
    set("fp-log", l);
  }

  /* ---- day status -------------------------------------------------------
     full | partial | missed | none (no data for that date) */
  function dayStatus(iso) {
    var l = log();
    var e = l[iso];
    var hist = get("fp-history", []);
    if (!e) {
      if (hist.indexOf(iso) !== -1) return { s: "full", halves: 2 };
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

    // streaks (full days; fp-history counts too, via dayStatus)
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

    // yesterday
    var yISO = addDays(TODAY, -1);
    var y = dayStatus(yISO);
    a.yesterday = y;
    a.yesterdayISO = yISO;
    a.yMissed = missedRoles(y.e);
    a.yWasRetinolNight = !!(y.e && y.e.act === "retinol");
    a.yRetinolSkipped = a.yWasRetinolNight && !y.pmDone;

    // consecutive missed full days ending yesterday
    var cm = 0, cd = yISO;
    while (true) {
      var st = dayStatus(cd);
      if (st.s === "missed") { cm++; cd = addDays(cd, -1); } else break;
    }
    a.consecMissed = cm;
    a.comeback = y.s === "full" && dayStatus(addDays(TODAY, -2)).s === "missed";

    // week percentages (halves done / halves elapsed), Mon-based
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

    // 14-day patterns
    var amHit = 0, amN = 0, pmHit = 0, pmN = 0, spfSkips7 = 0,
        retDone = 0, retN = 0, otherDone = 0, otherN = 0,
        wkndMiss = 0, wkndN = 0, wkMiss = 0, wkN = 0;
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
      if (k <= 7 && e && e.am.length > 0 && e.am.indexOf(4) === -1) spfSkips7++;
    }
    a.amRate = amN ? amHit / amN : null;
    a.pmRate = pmN ? pmHit / pmN : null;
    a.spfSkips7 = spfSkips7;
    a.retinolRate = retN >= 2 ? retDone / retN : null;
    a.otherNightRate = otherN >= 2 ? otherDone / otherN : null;
    a.weekendWeak = wkndN >= 2 && wkN >= 4 && (wkndMiss / wkndN) > (wkMiss / wkN) + 0.3;

    // 30-day consistency
    var h30 = 0, n30 = 0;
    for (var m = 1; m <= 30; m++) {
      var st3 = dayStatus(addDays(TODAY, -m));
      if (st3.s === "none") continue;
      n30++; if (st3.s === "full") h30++;
    }
    a.consistency30 = n30 >= 14 ? Math.round(h30 / n30 * 100) : null;
    a.trackedDays30 = n30;

    // phase (same maths as routine.js)
    var start = get("fp-start", null);
    a.phase = start ? Math.min(3, Math.floor(Math.max(0, (new Date(TODAY) - new Date(start)) / 86400000) / 14)) : null;

    a.hour = new Date().getHours();
    return a;
  }

  /* ---- message bank ------------------------------------------------------
     Each rule: id, pri(ority), when(a) -> bool, m: variants.
     {d} placeholders are filled per-rule. Honest + encouraging tone. */
  function bank(a) {
    var yDay = DAYNAMES[dow(a.yesterdayISO)];
    var yPMmiss = a.yMissed.pm.join(", ");
    var yAMmiss = a.yMissed.am.join(", ");
    return [
      // --- safety first ---
      { id: "ret-skip-safety", pri: 95, when: function () { return a.yRetinolSkipped; }, m: [
        "You missed last night's retinol. Don't double up tonight — skin doesn't work in arrears. Just do tonight as scheduled.",
        "Retinol night skipped yesterday. The rule: never compensate with a bigger or extra dose — carry on with tonight's plan as normal."
      ]},
      { id: "ret-long-off", pri: 94, when: function () { return a.consecMissed >= 7; }, m: [
        "You've been off the routine a week or more. Restart retinol gently — 2 nights a week for the first week back, then rebuild. Your skin lost its tolerance.",
        "After a week+ away, treat retinol like week one again: low frequency, build back up. Jumping straight to full schedule is how you get the redness back."
      ]},
      // --- consecutive misses ---
      { id: "miss-3plus", pri: 88, when: function () { return a.consecMissed >= 3 && a.consecMissed < 7; }, m: [
        a.consecMissed + " days missed in a row. That's a pattern forming, not bad luck — pick the easiest slot (morning) and just restart there today.",
        a.consecMissed + " straight days off. Don't aim for a perfect day today; aim for *any* checked step. Momentum first, completeness later."
      ]},
      { id: "miss-2", pri: 82, when: function () { return a.consecMissed === 2; }, m: [
        "Two days missed back-to-back. One miss is noise, two is the start of a slide — today's the day that decides which it was.",
        "Yesterday and the day before both slipped. Get today's morning done and this stays a blip."
      ]},
      // --- yesterday ---
      { id: "y-missed-full", pri: 76, when: function () { return a.yesterday.s === "missed" && a.consecMissed === 1; }, m: [
        yDay + " didn't happen — nothing checked. It costs one day, not the habit. Today resets it.",
        "You skipped " + yDay + " entirely. Fine — it happens. What matters is that it doesn't get a sequel today.",
        yDay + " was a zero. Streak's gone, but consistency isn't about never missing — it's about never missing twice."
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
      // --- comeback ---
      { id: "comeback", pri: 66, when: function () { return a.comeback; }, m: [
        "Missed a day, then came straight back with a full " + yDay + ". That bounce-back is the actual skill — most people let one miss become five.",
        "Good recovery: a zero day followed by a complete one. That's exactly how a durable habit behaves."
      ]},
      // --- step patterns ---
      { id: "spf-skips", pri: 62, when: function () { return a.spfSkips7 >= 3; }, m: [
        "Sunscreen got skipped " + a.spfSkips7 + " times this week while the rest of the morning got done. Honest truth: SPF is the single highest-value step you do — skip anything else before it.",
        a.spfSkips7 + " mornings this week ended without SPF. Everything else in the routine builds the house; sunscreen is what stops it burning down."
      ]},
      { id: "ret-nights-weak", pri: 58, when: function () { return a.retinolRate !== null && a.otherNightRate !== null && a.retinolRate < a.otherNightRate - 0.25; }, m: [
        "Pattern spotted: you complete easy evenings but retinol nights keep slipping. Those are the nights doing the heavy lifting — protect them first.",
        "Your retinol nights have a worse completion rate than your rest nights. If it's the extra step that puts you off, lay the tube on your pillow in the morning."
      ]},
      { id: "pm-weak", pri: 54, when: function () { return a.amRate !== null && a.pmRate !== null && a.pmRate < a.amRate - 0.25; }, m: [
        "Two-week pattern: mornings solid, evenings leaky. The PM routine is 3–4 steps and two minutes — do it right after dinner instead of right before bed and it stops losing to tiredness.",
        "You're a morning person, by the data. Evenings trail well behind. Move the evening routine earlier — waiting until you're already sleepy is the whole problem."
      ]},
      { id: "am-weak", pri: 54, when: function () { return a.amRate !== null && a.pmRate !== null && a.amRate < a.pmRate - 0.25; }, m: [
        "Evenings are strong, mornings keep getting dropped. Minimum viable morning: cleanse, vitamin C, SPF — 90 seconds. Do that when time is short.",
        "The data says mornings are your weak half. Put the SPF next to your toothbrush; the routine follows the sunscreen."
      ]},
      { id: "weekend-dip", pri: 52, when: function () { return a.weekendWeak; }, m: [
        "Weekends are where your routine goes to die — noticeably worse than weekdays. Different schedule, same skin. Tie it to something that survives weekends, like your morning coffee.",
        "Weekday you is consistent; weekend you keeps skipping. If Saturday mornings are chaos, at least land the SPF and the evening routine."
      ]},
      // --- weeks ---
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
      // --- streaks ---
      { id: "streak-30", pri: 40, when: function () { return a.streak >= 30; }, m: [
        a.streak + " days unbroken. At this point the routine isn't a habit, it's just who you are in the bathroom. Exceptional.",
        "A full month-plus streak (" + a.streak + " days). This is the timescale where retinol and vitamin C actually show — check your skin against week one."
      ]},
      { id: "streak-14", pri: 40, when: function () { return a.streak >= 14 && a.streak < 30; }, m: [
        a.streak + " straight days. Two weeks is where most people quietly quit — you didn't. The compounding has started.",
        "Streak: " + a.streak + " days. Habit science calls this the consolidation zone; skin science calls it the first visible-results window. Both agree: keep going."
      ]},
      { id: "streak-7", pri: 40, when: function () { return a.streak >= 7 && a.streak < 14; }, m: [
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
      // --- phase-specific ---
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
      // --- 30-day consistency ---
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
      // --- today ---
      { id: "today-done", pri: 22, when: function () { return a.today.s === "full"; }, m: [
        "Today is already fully banked — both routines done. Nothing left to earn; go live your life.",
        "Both halves done today. ✓ Day closed. See you tomorrow morning."
      ]},
      { id: "today-am-done", pri: 20, when: function () { return a.today.amDone && !a.today.pmDone && a.hour >= 15; }, m: [
        "Morning's banked; the evening routine is still open. Two minutes after dinner and today goes in the books as complete.",
        "Half of today is done. The evening half is the one with the actives — don't leave the important half on the table."
      ]},
      // --- onboarding / early days ---
      { id: "onboard-0", pri: 18, when: function () { return a.daysTracked <= 1; }, m: [
        "Tracking starts now. From today, every check-off is remembered — misses, streaks, patterns, all of it. The tracker gets smarter as the days stack up.",
        "Day one of tracking. In a week there'll be patterns here; in a month, a real picture. For now: just check things off as you do them."
      ]},
      { id: "onboard-few", pri: 16, when: function () { return a.daysTracked > 1 && a.daysTracked < 5; }, m: [
        "A few days of data so far — early, but the picture is forming. Pattern-spotting (weak slots, skipped steps) switches on as more days accumulate.",
        "The tracker has " + a.daysTracked + " days on record. Give it a week and it will start telling you things about yourself you didn't notice."
      ]},
      // --- rotating general tips ---
      { id: "tip-rotate", pri: 8, when: function () { return true; }, m: [
        "Tip: sunscreen is a morning commitment, not a one-off — if you're outdoors for long stretches, it needs reapplying.",
        "Tip: retinol and salicylic acid never share a night. The alternating schedule isn't a suggestion, it's the guardrail.",
        "Tip: a pea-sized amount of retinol is the correct dose. More product = more irritation, not more results.",
        "Tip: your skin does its repair work during sleep — the evening routine plus an actual bedtime is the real 'advanced' skincare.",
        "Tip: photos beat mirrors. Same light, same angle, once a month — that's how you'll actually see the change.",
        "Tip: if skin feels tight or stings after cleansing, it's telling you something. Gentler, not harder.",
        "Tip: hydration and salt intake show up under your eyes before anywhere else. The eye cream works better with the basics behind it.",
        "Tip: consistency at 80% for a year beats 100% for a month. Build the floor, not the highlight reel."
      ]}
    ];
  }

  // stable-for-the-day variant selection
  function seedPick(id, len) {
    var s = 0, str = TODAY + id;
    for (var i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) % 997;
    return s % len;
  }

  function pickMessages(a, n) {
    var rules = bank(a).filter(function (r) { try { return r.when(); } catch (e) { return false; } });
    rules.sort(function (x, y) { return y.pri - x.pri; });
    return rules.slice(0, n).map(function (r) {
      return { id: r.id, pri: r.pri, text: r.m[seedPick(r.id, r.m.length)] };
    });
  }

  /* ---- nudge (routine page) --------------------------------------------- */
  function mountNudge() {
    var host = document.querySelector("#routine .rsupp");
    if (!host) return;
    var a = analyze();
    var msgs = pickMessages(a, 1);
    if (!msgs.length) return;
    var div = document.createElement("a");
    div.className = "rnudge";
    div.href = "progress.html";
    div.innerHTML = '<span class="rnudge__txt">' + msgs[0].text + '</span><span class="rnudge__go">Progress →</span>';
    host.after(div);
  }

  /* ---- progress page ------------------------------------------------------ */
  function statusLabel(s) {
    return { full: "Complete", partial: "Partial", missed: "Missed", none: "No data" }[s];
  }

  function renderProgress(root) {
    var a = analyze();

    // insights
    var msgs = pickMessages(a, 3);
    var insights = '<div class="pins">' + msgs.map(function (m, i) {
      return '<div class="pins__item' + (i === 0 ? " pins__item--lead" : "") + '">' + m.text + '</div>';
    }).join("") + '</div>';

    // stat cards
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

    // 4-week calendar (rows old→new, last row = current week)
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

    root.innerHTML = insights + stats
      + '<p class="subhead" style="margin-top:34px">Last four weeks</p>' + calendar
      + '<div class="pday" id="pday" hidden></div>'
      + '<p class="faint" style="font-size:0.78rem;margin-top:22px">Tracked on this device only. Tap any day for its breakdown.</p>';

    // day detail on tap
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

  /* ---- public API + automount ------------------------------------------- */
  window.FPTracker = { writeToday: writeToday, analyze: analyze, pickMessages: pickMessages };

  var progressRoot = document.getElementById("progress-root");
  if (progressRoot) renderProgress(progressRoot);
  if (document.getElementById("routine")) mountNudge();
})();
