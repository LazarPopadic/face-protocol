/* =====================================================================
   Aesthetic Protocol — shared behaviour
   No dependencies. Progressive: everything degrades gracefully.
   ===================================================================== */
(function () {
  "use strict";
  // User preference: animations always play, regardless of the device's
  // system "reduce motion" setting.
  var reduce = false;

  /* ---- Header shadow on scroll -------------------------------------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- Image fade-in on load ---------------------------------------- */
  document.querySelectorAll("img.img-fade").forEach(function (img) {
    if (img.complete) img.classList.add("is-loaded");
    else img.addEventListener("load", function () { img.classList.add("is-loaded"); });
  });

  /* ---- Count-up + bar/gauge fill ------------------------------------ */
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var dur = 1100, start = null;
    var decimals = (el.getAttribute("data-decimals") | 0);
    if (reduce) { el.textContent = target.toFixed(decimals); return; }
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      el.textContent = (target * easeOut(p)).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(decimals);
    }
    requestAnimationFrame(step);
  }

  function fillGauge(el) {
    var val = parseFloat(el.getAttribute("data-gauge"));   // 0..100
    var r = el.r.baseVal.value;
    var c = 2 * Math.PI * r;
    el.style.strokeDasharray = c;
    el.style.strokeDashoffset = c;                          // start empty
    void el.getBoundingClientRect();                        // commit empty state (no rAF: works in hidden tabs too)
    el.style.strokeDashoffset = c * (1 - val / 100);        // animate to value via CSS transition
  }

  function activate(el) {
    if (el.__activated) return;                 // run each animation once: only ever counts/fills upward
    el.__activated = true;
    el.querySelectorAll("[data-count]").forEach(countUp);
    el.querySelectorAll("[data-gauge]").forEach(fillGauge);
    el.querySelectorAll("[data-bar]").forEach(function (b) {
      b.style.width = b.getAttribute("data-bar") + "%";
    });
    el.querySelectorAll("[data-third]").forEach(function (t) {
      t.style.width = t.getAttribute("data-third") + "%";
    });
    el.querySelectorAll("[data-marker]").forEach(function (m) {
      m.style.left = m.getAttribute("data-marker") + "%";
    });
  }

  /* ---- Reveal on scroll --------------------------------------------- */
  var revealEls = document.querySelectorAll(".reveal, [data-animate]");
  function show(el) {
    el.classList.add("is-visible");
    if (el.hasAttribute("data-animate")) activate(el);
  }
  if ("IntersectionObserver" in window && revealEls.length) {
    var ioFired = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        ioFired = true;
        show(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
    // Failsafe: some environments (hidden tab, throttled pages) never deliver
    // observer callbacks. If nothing has fired shortly after load, reveal all so
    // content and scores are never stuck invisible or at zero.
    var failsafe = function () { if (!ioFired) revealEls.forEach(show); };
    if (document.readyState === "complete") setTimeout(failsafe, 1200);
    else window.addEventListener("load", function () { setTimeout(failsafe, 1200); });
  } else {
    revealEls.forEach(show);
  }

  /* ---- Before / After comparison slider ----------------------------- */
  document.querySelectorAll(".compare").forEach(function (c) {
    var range = c.querySelector(".compare__range");
    var set = function (v) { c.style.setProperty("--pos", v + "%"); };
    if (range) {
      set(range.value);
      range.addEventListener("input", function () { set(range.value); });
    }
  });

  /* ---- Accordion: smooth height (native <details>) ------------------ */
  document.querySelectorAll("details.acc__item").forEach(function (d) {
    var body = d.querySelector(".acc__body");
    if (!body) return;
    var summary = d.querySelector("summary");
    summary.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (d.open) {
        body.style.maxHeight = body.scrollHeight + "px";
        void body.getBoundingClientRect();              // commit start height
        body.style.maxHeight = "0px";                   // animate closed via CSS transition
        var close = function () { d.open = false; body.removeEventListener("transitionend", close); };
        body.addEventListener("transitionend", close);
      } else {
        d.open = true;
        body.style.maxHeight = "0px";
        void body.getBoundingClientRect();              // commit collapsed height
        body.style.maxHeight = body.scrollHeight + "px"; // drop open via CSS transition
        body.addEventListener("transitionend", function te() {
          body.style.maxHeight = "none"; body.removeEventListener("transitionend", te);
        });
      }
    });
  });

  /* ---- Lightbox ------------------------------------------------------ */
  var lb = document.querySelector(".lightbox");
  if (lb) {
    var lbImg = lb.querySelector("img");
    var open = function (src, alt) {
      lbImg.src = src; lbImg.alt = alt || "";
      lb.classList.add("is-open"); document.body.style.overflow = "hidden";
    };
    var close = function () { lb.classList.remove("is-open"); document.body.style.overflow = ""; };
    document.querySelectorAll("[data-zoom]").forEach(function (el) {
      el.style.cursor = "zoom-in";
      el.addEventListener("click", function () {
        var img = el.tagName === "IMG" ? el : el.querySelector("img");
        if (img) open(img.getAttribute("data-full") || img.currentSrc || img.src, img.alt);
      });
    });
    lb.addEventListener("click", function (e) { if (e.target !== lbImg) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  /* ---- Plan filter chips -------------------------------------------- */
  var filterBar = document.querySelector(".filter-bar");
  if (filterBar) {
    var actions = Array.prototype.slice.call(document.querySelectorAll("[data-cats]"));
    var bands = Array.prototype.slice.call(document.querySelectorAll(".band"));
    filterBar.addEventListener("click", function (e) {
      var btn = e.target.closest(".filter-btn");
      if (!btn) return;
      filterBar.querySelectorAll(".filter-btn").forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      var f = btn.getAttribute("data-filter");
      actions.forEach(function (a) {
        var show = f === "all" || (" " + a.getAttribute("data-cats") + " ").indexOf(" " + f + " ") !== -1;
        a.classList.toggle("is-hidden", !show);
      });
      // hide bands that ended up empty; non-filterable bands (Strengths, Excluded)
      // have no [data-cats] items — show them only under "All".
      bands.forEach(function (band) {
        var total = band.querySelectorAll("[data-cats]").length;
        if (!total) { band.style.display = f === "all" ? "" : "none"; return; }
        var visible = band.querySelectorAll("[data-cats]:not(.is-hidden)").length;
        band.style.display = visible ? "" : "none";
      });
    });
  }

  /* ---- Scroll-spy for in-page feature nav --------------------------- */
  var spyLinks = document.querySelectorAll(".feature-nav a");
  if (spyLinks.length && "IntersectionObserver" in window) {
    var map = {};
    spyLinks.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          spyLinks.forEach(function (a) { a.classList.remove("is-active"); });
          if (map[e.target.id]) map[e.target.id].classList.add("is-active");
        }
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    document.querySelectorAll(".feature[id]").forEach(function (s) { spy.observe(s); });
  }

  /* ---- Deep links from Overview pills: smooth-scroll + highlight ----- */
  function handleHash() {
    var id = location.hash.slice(1);
    if (!id) return;
    var t = document.getElementById(id);
    if (!t) return;
    window.scrollTo(0, 0);                       // cancel the browser's instant anchor jump
    setTimeout(function () {
      t.scrollIntoView({ behavior: "smooth", block: "center" });
      t.classList.remove("flash");
      void t.offsetWidth;                         // allow the highlight to replay
      t.classList.add("flash");
      setTimeout(function () { t.classList.remove("flash"); }, 2200);
    }, 160);
  }
  window.addEventListener("load", handleHash);
  window.addEventListener("hashchange", handleHash);

  /* ---- Footer year --------------------------------------------------- */
  var y = document.querySelector("[data-year]");
  if (y) y.textContent = new Date().getFullYear();
})();
