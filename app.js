/* Shared behavior for every Ride Board page. Each block runs only if its elements exist on the current page. */
(function () {
  "use strict";

  var KEY = "rideboard.v1";
  var THEME_KEY = "rideboard.theme";
  var JOINED_KEY = "rideboard.joined";
  var DESTS = ["RDU airport", "Southpoint mall", "Raleigh", "Durham", "Charlotte", "Other"];
  var AREAS = [
    "Student Union",
    "Franklin Street (downtown)",
    "Lenoir Dining Hall",
    "Ram's Head Recreation Center",
    "Kenan Stadium lot",
    "Ehringhaus or Hinton James residence halls",
    "Morrison residence hall",
    "Carmichael residence hall",
    "Off campus (say where in the note)"
  ];
  var UNC = /^[^\s@]+@unc\.edu$/i;
  var state = { filter: "All", trips: [], joined: [] };

  function $(sel) { return document.querySelector(sel); }
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      if (k === "text") n.textContent = props[k];
      else if (k === "class") n.className = props[k];
      else n.setAttribute(k, props[k]);
    });
    [].concat(kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function money(x) { return x % 1 ? "$" + x.toFixed(2) : "$" + x.toFixed(0); }
  function ymd(d) {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }
  function daysFromNow(n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function tripTime(t) {
    var p = t.date.split("-").map(Number), q = t.time.split(":").map(Number);
    return new Date(p[0], p[1] - 1, p[2], q[0], q[1]).getTime();
  }
  function fmtTime(t) {
    var q = t.split(":").map(Number), h = q[0];
    return ((h + 11) % 12 + 1) + ":" + String(q[1]).padStart(2, "0") + " " + (h >= 12 ? "PM" : "AM");
  }
  function fmtDate(s) {
    var p = s.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  function setError(id, msg) {
    var p = document.getElementById("err-" + id);
    var input = document.getElementById(id);
    if (p) { p.textContent = msg || ""; p.hidden = !msg; }
    if (input) { if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }
  }

  // Storage. Every read and write is wrapped, so blocked storage only means nothing persists.
  function examples() {
    return [
      { id: "ex1", to: "RDU airport", from: "Student Union", date: daysFromNow(2), time: "06:15", spots: 3, joined: 1, fare: 40, note: "Early flight. Small bags only.", meet: "Front steps, Lenoir Hall", example: true },
      { id: "ex2", to: "Southpoint mall", from: "Ram's Head Recreation Center", date: daysFromNow(1), time: "14:00", spots: 4, joined: 2, fare: 24, note: "Grocery run, room for bags.", meet: "Bus stop on South Road", example: true },
      { id: "ex3", to: "Raleigh", from: "Franklin Street (downtown)", date: daysFromNow(3), time: "18:30", spots: 2, joined: 0, fare: 30, note: "Concert downtown. Back by 11.", meet: "Corner of Franklin Street and Columbia Street", example: true }
    ];
  }
  function loadTrips() {
    try {
      var raw = window.localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) { return null; }
  }
  function loadJoined() {
    try {
      var raw = window.localStorage.getItem(JOINED_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }
  function saveJoined() {
    try { window.localStorage.setItem(JOINED_KEY, JSON.stringify(state.joined)); } catch (e) { /* keep working in memory */ }
  }
  function saveTrips() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state.trips)); } catch (e) { /* keep working in memory */ }
  }

  // Theme. The choice is remembered across pages.
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function storedTheme() {
    try {
      var t = window.localStorage.getItem(THEME_KEY);
      return t === "light" || t === "dark" ? t : null;
    } catch (e) { return null; }
  }
  function isDark() {
    var t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : !!(mq && mq.matches);
  }
  function paintTheme() {
    var b = $("#theme");
    if (b) b.setAttribute("aria-pressed", String(isDark()));
  }
  var initialTheme = storedTheme();
  if (initialTheme) document.documentElement.setAttribute("data-theme", initialTheme);

  var themeButton = $("#theme");
  if (themeButton) {
    themeButton.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { window.localStorage.setItem(THEME_KEY, next); } catch (e) { /* not remembered */ }
      paintTheme();
    });
  }
  if (mq && mq.addEventListener) mq.addEventListener("change", paintTheme);

  // Trip rows, shared by the home preview and the board
  function upcoming() {
    var cutoff = Date.now() - 60 * 60 * 1000;
    return state.trips
      .filter(function (t) { return tripTime(t) >= cutoff; })
      .sort(function (a, b) { return tripTime(a) - tripTime(b); });
  }
  function meetLine(t) {
    if (state.joined.indexOf(t.id) !== -1) {
      return el("p", { class: "meet", text: "Meet at: " + (t.meet || "the spot is set by the poster") });
    }
    return el("p", { class: "meet muted", text: "Exact spot shared after you request a ride." });
  }
  function tripRow(t, withJoin) {
    var open = t.spots - 1 - t.joined;
    var kids = [
      el("div", { class: "when" }, [
        el("span", { class: "time", text: fmtTime(t.time) }),
        el("span", { class: "date", text: fmtDate(t.date) })
      ]),
      el("div", { style: "min-width:0" }, [
        el("p", { class: "dest" }, [
          el("span", { text: t.to }),
          t.example ? el("span", { class: "tag", text: "Example" }) : null
        ]),
        el("p", { class: "from", text: "From " + t.from }),
        t.note ? el("p", { class: "note", text: t.note }) : null,
        meetLine(t)
      ])
    ];
    var side = [
      el("p", { class: "split", text: money(t.fare / t.spots) + " each" }),
      el("p", { class: "sub", text: "Split " + t.spots + " ways. Solo about " + money(t.fare) }),
      el("p", { class: "spots", text: open > 0 ? open + (open === 1 ? " spot" : " spots") + " open" : "Full" })
    ];
    if (state.joined.indexOf(t.id) !== -1) {
      side.push(el("span", { class: "tag", text: "Requested" }));
    } else if (withJoin && open > 0) {
      var btn = el("button", { type: "button", class: "btn small", text: "Ride along" });
      btn.addEventListener("click", function () { openJoin(t); });
      side.push(btn);
    }
    kids.push(el("div", { class: "side" }, side));
    return el("li", { class: "trip" }, kids);
  }

  // Home: fare splitter and next trips preview
  function renderCalc() {
    var fare = Number($("#fare").value), riders = Number($("#riders").value);
    $("#fare-out").textContent = money(fare);
    $("#calc-out").replaceChildren(
      document.createTextNode(money(fare / riders)),
      el("small", { text: "each, if " + riders + " people split a " + money(fare) + " ride" })
    );
  }
  function renderPreview() {
    var list = $("#preview-list");
    list.replaceChildren();
    var items = upcoming().slice(0, 3);
    if (!items.length) {
      list.appendChild(el("li", { class: "empty", text: "No trips posted yet. Post the first one." }));
      return;
    }
    items.forEach(function (t) { list.appendChild(tripRow(t, false)); });
  }

  // Trips board
  function renderChips() {
    var box = $("#chips");
    box.replaceChildren();
    ["All"].concat(DESTS).forEach(function (d) {
      var b = el("button", { type: "button", class: "chip", "aria-pressed": String(state.filter === d), text: d });
      b.addEventListener("click", function () { state.filter = d; renderChips(); renderBoard(); });
      box.appendChild(b);
    });
  }
  function renderBoard() {
    var list = $("#trip-list");
    list.replaceChildren();
    var items = upcoming().filter(function (t) { return state.filter === "All" || t.to === state.filter; });
    $("#board-count").textContent = items.length + (items.length === 1 ? " trip" : " trips");
    if (!items.length) {
      list.appendChild(el("li", { class: "empty", text: "No trips match this filter yet. Post one, and students heading the same way can find you." }));
    }
    items.forEach(function (t) { list.appendChild(tripRow(t, true)); });
    $("#clear-examples").hidden = !state.trips.some(function (t) { return t.example; });
  }
  var joining = null;
  function openJoin(t) {
    joining = t;
    $("#join-trip").textContent = t.to + ", " + fmtDate(t.date) + " at " + fmtTime(t.time) + ". From " + t.from + ".";
    $("#join-status").textContent = "";
    $("#join-name").value = "";
    $("#join-email").value = "";
    setError("join-name", ""); setError("join-email", "");
    $("#join").showModal();
    $("#join-name").focus();
  }

  // Post form
  function populateSelects() {
    var to = $("#to"), from = $("#from");
    to.appendChild(el("option", { value: "", text: "Choose a destination" }));
    DESTS.forEach(function (d) { to.appendChild(el("option", { value: d, text: d })); });
    from.appendChild(el("option", { value: "", text: "Choose a pickup area" }));
    AREAS.forEach(function (a) { from.appendChild(el("option", { value: a, text: a })); });
    $("#date").min = daysFromNow(0);
  }

  function bindPage() {
    if ($("#fare")) {
      renderCalc();
      $("#fare").addEventListener("input", renderCalc);
      $("#riders").addEventListener("change", renderCalc);
    }
    if ($("#preview-list")) renderPreview();

    if ($("#trip-list")) {
      renderChips();
      renderBoard();
      $("#clear-examples").addEventListener("click", function () {
        state.trips = state.trips.filter(function (t) { return !t.example; });
        saveTrips(); renderBoard();
      });
      $("#join-cancel").addEventListener("click", function () { $("#join").close(); });
      $("#join-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var name = $("#join-name").value.trim(), email = $("#join-email").value.trim();
        setError("join-name", name ? "" : "Add a first name.");
        setError("join-email", UNC.test(email) ? "" : "Use an address that ends in unc.edu.");
        if (!name || !UNC.test(email)) {
          var first = document.querySelector('#join-form [aria-invalid="true"]');
          if (first) first.focus();
          return;
        }
        var t = state.trips.find(function (x) { return x.id === joining.id; });
        if (t && t.spots - 1 - t.joined > 0 && state.joined.indexOf(t.id) === -1) {
          t.joined += 1;
          state.joined.push(t.id);
          saveTrips(); saveJoined();
        }
        $("#join").close();
        renderBoard();
        $("#board-status").textContent = "Request saved on this device. Meet at: " + (t && t.meet ? t.meet : "the spot is set by the poster") + ". Emails are not sent in this prototype yet.";
        $("#board-title").focus();
      });
    }

    if ($("#post-form")) {
      populateSelects();
      $("#post-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var v = {
          to: $("#to").value, from: $("#from").value, date: $("#date").value, time: $("#time").value,
          spots: Number(document.querySelector('input[name="spots"]:checked').value),
          fare: Number($("#fare-post").value), name: $("#name").value.trim(), email: $("#email").value.trim(),
          note: $("#note").value.trim(), meet: $("#meet").value.trim()
        };
        var ok = true;
        function check(id, bad, msg) { setError(id, bad ? msg : ""); if (bad) ok = false; }
        check("to", !v.to, "Choose where you're going.");
        check("from", !v.from, "Choose a pickup area.");
        check("date", !v.date || v.date < daysFromNow(0), "Pick today or a later date.");
        check("time", !v.time, "Pick the time you need to leave by.");
        if (v.time && v.date === daysFromNow(0) && tripTime({ date: v.date, time: v.time }) < Date.now()) {
          setError("time", "That time has already passed today. Pick a later time or a later date.");
          ok = false;
        }
        check("fare-post", !(v.fare >= 1 && v.fare <= 500), "Enter a fare between $1 and $500.");
        check("meet", !v.meet, "Describe the exact pickup spot, for example the front steps of a building.");
        check("name", !v.name, "Add a first name so people know who to ride with.");
        check("email", !UNC.test(v.email), "Use an address that ends in unc.edu.");
        var status = $("#post-status");
        if (!ok) {
          status.textContent = "Fix the highlighted fields to post.";
          var first = document.querySelector('#post-form [aria-invalid="true"]');
          if (first) first.focus();
          return;
        }
        state.trips.push({
          id: "t" + Date.now().toString(36), to: v.to, from: v.from, date: v.date, time: v.time,
          spots: v.spots, joined: 0, fare: v.fare, note: v.note, meet: v.meet, example: false
        });
        saveTrips();
        e.target.reset();
        $("#date").min = daysFromNow(0);
        status.replaceChildren(
          document.createTextNode("Trip posted. "),
          el("a", { href: "trips.html", text: "See it on the board" })
        );
        status.focus && status.setAttribute("tabindex", "-1");
        status.focus();
      });
    }
  }

  // Boot
  var saved = loadTrips();
  state.trips = saved ? saved : examples();
  if (!saved) saveTrips();
  state.joined = loadJoined();
  paintTheme();
  bindPage();
})();
