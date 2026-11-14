(function () {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- anonymous visitor id (no login needed) ---------- */
let uid = store.get("fr_uid", null);
if (!uid) {
  uid = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join(""));
  store.set("fr_uid", uid);
}

/* ---------- API helper ---------- */
async function api(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) { const err = new Error((data && data.error) || "Something went wrong. Try again."); err.status = res.status; throw err; }
  return data;
}

/* ---------- routing ---------- */
const views = ["practice", "people", "founder"];
function route() {
  let v = (location.hash || "").replace("#", "");
  if (!views.includes(v)) v = "practice";
  views.forEach(n => $("view-" + n).classList.toggle("hidden", n !== v));
  document.querySelectorAll("nav.tabs a").forEach(a => a.setAttribute("aria-current", a.dataset.view === v ? "page" : "false"));
  if (v === "founder") founderEnter();
}
window.addEventListener("hashchange", route);

function setStep(step) {
  const order = ["setup", "interview", "report", "human"];
  const i = order.indexOf(step);
  document.querySelectorAll(".rung").forEach(r => {
    const j = order.indexOf(r.dataset.step);
    r.classList.toggle("on", j === i); r.classList.toggle("done", j < i);
  });
  ["setup", "interview", "report"].forEach(n => $(n).classList.toggle("hidden", n !== step && !(step === "human" && n === "report")));
}

/* ---------- setup ---------- */
$("bg").value = store.get("fr_bg", "");
$("bg").addEventListener("input", () => store.set("fr_bg", $("bg").value));
$("role").addEventListener("change", () => $("roleOther").classList.toggle("hidden", $("role").value !== "other"));

function cfg() {
  const role = $("role").value === "other" ? ($("roleOther").value.trim() || "General internship") : $("role").value;
  return {
    role, company: $("company").value.trim(), year: $("year").value,
    format: document.querySelector("input[name=fmt]:checked").value,
    count: +$("count").value, focus: $("focus").value.trim(), bg: $("bg").value.trim()
  };
}

let S = null; // current session
$("startBtn").addEventListener("click", async () => {
  const c = cfg();
  $("startErr").classList.add("hidden");
  $("startBtn").disabled = true; $("startStatus").classList.remove("hidden");
  const history = store.get("fr_history", []);
  try {
    const j = await api("/api/interview", { method: "POST", body: { task: "questions", cfg: c, history: history.slice(-40) } });
    S = { cfg: c, persona: j.persona || "", questions: j.questions, i: 0, answers: [] };
    store.set("fr_history", history.concat(S.questions.map(q => q.q)).slice(-60));
    beginSession();
  } catch (e) {
    $("startErr").textContent = e.message; $("startErr").classList.remove("hidden");
  } finally {
    $("startBtn").disabled = false; $("startStatus").classList.add("hidden");
  }
});

/* ---------- interview ---------- */
let tick = null, phase = null, remaining = 0, total = 0, elapsed = 0, awaitingFollow = false, current = null;
const fmtT = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const words = t => (t.trim().match(/\S+/g) || []).length;

function beginSession() {
  setStep("interview");
  $("persona").textContent = S.persona ? "Interviewer: " + S.persona : "";
  showQuestion();
}
function renderProgress() {
  $("progress").innerHTML = S.questions.map((_, k) => `<i class="${k < S.i ? "done" : k === S.i ? "now" : ""}"></i>`).join("");
  $("qcount").textContent = `Question ${S.i + 1} of ${S.questions.length}`;
}
function showQuestion() {
  const q = S.questions[S.i];
  current = { q: q.q, type: q.type || "", tests: q.tests || "", answer: "", followup: null, followAnswer: "", seconds: 0 };
  awaitingFollow = false;
  renderProgress();
  $("qtype").textContent = q.type || "Question";
  $("qtext").textContent = q.q;
  $("fuBox").classList.add("hidden");
  $("answer").value = ""; $("partial").textContent = ""; updateWc();
  stopDict();
  if (S.cfg.format === "recorded") startPrep(); else startLive();
}
function clearTick() { if (tick) { clearInterval(tick); tick = null; } }
function startPrep() {
  phase = "prep"; remaining = 30; total = 30;
  $("prepPane").classList.remove("hidden"); $("answerPane").classList.add("hidden");
  $("phase").textContent = "Prep time"; $("barWrap").classList.remove("hidden");
  runCountdown(() => startRecorded());
}
function startRecorded() {
  phase = "answer"; remaining = 90; total = 90;
  $("prepPane").classList.add("hidden"); $("answerPane").classList.remove("hidden");
  $("phase").textContent = "Time left"; $("answer").focus();
  runCountdown(() => submitAnswer(true));
}
function startLive() {
  phase = "live"; elapsed = 0;
  $("prepPane").classList.add("hidden"); $("answerPane").classList.remove("hidden");
  $("phase").textContent = "Elapsed"; $("barWrap").classList.add("hidden");
  $("timer").textContent = "0:00"; $("timer").classList.remove("low");
  clearTick();
  tick = setInterval(() => { elapsed++; $("timer").textContent = fmtT(elapsed); }, 1000);
}
function runCountdown(done) {
  clearTick();
  const draw = () => { $("timer").textContent = fmtT(remaining); $("timer").classList.toggle("low", remaining <= 10); $("bar").style.width = ((total - remaining) / total * 100) + "%"; };
  draw();
  tick = setInterval(() => { remaining--; draw(); if (remaining <= 0) { clearTick(); done(); } }, 1000);
}
$("beginAnswer").addEventListener("click", () => { clearTick(); startRecorded(); });
function updateWc() { $("wc").textContent = words($("answer").value) + " words"; }
$("answer").addEventListener("input", updateWc);

$("submitAns").addEventListener("click", () => submitAnswer(false));
async function submitAnswer(timedOut) {
  stopDict();
  const text = $("answer").value.trim();
  const secs = phase === "answer" ? 90 - remaining : elapsed;
  clearTick();
  if (!awaitingFollow) {
    current.answer = text || (timedOut ? "(no answer recorded before time ran out)" : "(skipped)");
    current.seconds = secs; current.timedOut = !!timedOut;
    if (S.cfg.format === "live" && text) {
      const fu = await getFollowUp(current);
      if (fu) {
        current.followup = fu; awaitingFollow = true;
        $("fuText").textContent = fu; $("fuBox").classList.remove("hidden");
        $("answer").value = ""; updateWc(); startLive(); return;
      }
    }
  } else {
    current.followAnswer = text || "(skipped)";
  }
  S.answers.push(current);
  S.i++;
  if (S.i < S.questions.length) showQuestion(); else finish();
}
async function getFollowUp(cur) {
  $("ansStatus").classList.remove("hidden"); $("submitAns").disabled = true;
  try {
    const j = await api("/api/interview", { method: "POST", body: { task: "followup", cfg: S.cfg, persona: S.persona, q: cur.q, answer: cur.answer } });
    return j.followup;
  } catch (e) { return null; }
  finally { $("ansStatus").classList.add("hidden"); $("submitAns").disabled = false; }
}
$("quitBtn").addEventListener("click", () => {
  clearTick(); stopDict();
  if (S && S.answers.length) finish(); else setStep("setup");
});

/* ---------- voice answers (browser speech recognition) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, wantListening = false;
if (SR) {
  $("micBtn").classList.remove("hidden");
  rec = new SR();
  rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
  rec.onresult = ev => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) {
        const a = $("answer"); const t = r[0].transcript.trim();
        a.value = (a.value && !/\s$/.test(a.value) ? a.value + " " : a.value) + t; updateWc();
      } else interim += r[0].transcript;
    }
    $("partial").textContent = interim;
  };
  rec.onstart = () => setMic(true);
  rec.onend = () => { if (wantListening) { try { rec.start(); } catch (e) { setMic(false); } } else setMic(false); };
  rec.onerror = ev => {
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { wantListening = false; $("micBtn").classList.add("hidden"); }
  };
  $("micBtn").addEventListener("click", () => {
    if (wantListening) { stopDict(); return; }
    wantListening = true;
    try { rec.start(); } catch (e) {}
  });
}
function setMic(on) {
  listening = on;
  $("micBtn").setAttribute("aria-pressed", on ? "true" : "false");
  $("micBtn").querySelector("span").textContent = on ? "Stop" : "Speak answer";
  if (!on) $("partial").textContent = "";
}
function stopDict() { wantListening = false; if (rec && listening) { try { rec.stop(); } catch (e) {} } }

/* ---------- grading ---------- */
async function finish() {
  setStep("report");
  $("gradeStatus").innerHTML = `<span class="spin"></span><span>Scoring your answers. This takes about 20 seconds.</span>`;
  $("gradeStatus").classList.remove("hidden"); $("reportBody").classList.add("hidden");
  try {
    const R = await api("/api/interview", { method: "POST", body: { task: "grade", cfg: S.cfg, answers: S.answers } });
    renderReport(R);
  } catch (e) {
    $("gradeStatus").innerHTML = `<span class="err">${esc(e.message)} </span><button class="btn ghost" id="retryGrade">Try scoring again</button>`;
    $("retryGrade").addEventListener("click", finish);
  }
}

let survey = { useful: null, wtp: null };
function renderReport(R) {
  $("gradeStatus").classList.add("hidden");
  const body = $("reportBody"); body.classList.remove("hidden");
  S.result = R;
  const v = R.verdict || "Close"; const cls = v === "Ready" ? "good" : v === "Not yet" ? "bad" : "warn";
  const ring = cls === "good" ? "var(--good)" : cls === "bad" ? "var(--bad)" : "var(--warn)";
  let html = `<div class="verdict">
      <div class="score" style="border-color:${ring}">${esc(Math.round(R.overall ?? 0))}</div>
      <div class="stack" style="gap:8px">
        <div class="eyebrow">Readiness for ${esc(S.cfg.role)}${S.cfg.company ? " at " + esc(S.cfg.company) : ""}</div>
        <div><span class="pill ${cls}">${esc(v)}</span></div>
        <p>${esc(R.recruiter_read)}</p>
      </div></div>
      <div class="cols">
        <div class="box"><h3>Keep doing</h3><ul>${(R.strengths || []).map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>
        <div class="box"><h3>Fix across every answer</h3><ul>${(R.patterns || []).map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>
      </div>
      <h2>Answer by answer</h2>`;
  html += S.answers.map((a, k) => {
    const g = (R.answers || [])[k] || {};
    const sc = Math.max(0, Math.min(5, +g.score || 0));
    const star = g.star || {};
    const starHtml = ["S", "T", "A", "R"].map(p => {
      const val = String(star[p] || "n/a").toLowerCase();
      return ["strong", "weak", "missing"].includes(val) ? `<span class="${val}">${p} · ${val}</span>` : "";
    }).join("");
    return `<details class="ans"${k === 0 ? " open" : ""}>
        <summary><span><span class="eyebrow">Q${k + 1} · ${esc(a.type)}</span><br>${esc(a.q)}</span>
        <span class="dots" aria-label="${sc} out of 5">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= sc ? "f" : ""}"></i>`).join("")}</span></summary>
        <div class="body">
          ${starHtml ? `<div class="star">${starHtml}</div>` : ""}
          <div class="quote">${esc(a.answer)}${a.followup ? "\n\nFollow-up: " + esc(a.followup) + "\n" + esc(a.followAnswer) : ""}</div>
          <p class="hint">${words(a.answer)} words · ${fmtT(a.seconds)}${a.timedOut ? " · ran out of time" : ""}</p>
          ${g.worked ? `<p><b>Worked:</b> ${esc(g.worked)}</p>` : ""}
          ${g.fix ? `<p><b>Biggest fix:</b> ${esc(g.fix)}</p>` : ""}
          ${g.better_opening ? `<div class="better"><div class="eyebrow">Stronger opening</div><p>${esc(g.better_opening)}</p></div>` : ""}
        </div></details>`;
  }).join("");

  html += `<div class="box survey">
    <h3>Quick pilot question (helps us build this)</h3>
    <div><span class="label">How useful was this session?</span><div class="opts" data-k="useful">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-v="${n}" aria-pressed="false">${n}</button>`).join("")}</div><span class="hint">1 not useful · 5 better than anything I use now</span></div>
    <div><span class="label">Would you pay for a 30-minute live mock with someone in your target field?</span><div class="opts" data-k="wtp">${["Only if free", "Up to $10", "Up to $25", "Over $25"].map(t => `<button type="button" data-v="${t}" aria-pressed="false">${t}</button>`).join("")}</div></div>
    <p class="hint" id="surveyMsg"></p>
  </div>
  <div class="note stack" style="gap:10px">
    <p><b>Want a real person to run this with you?</b> An upperclassman or professional in ${esc(S.cfg.role.toLowerCase())} can give you the reactions and nuance a recorded or AI interview can't.</p>
    <div class="actions"><a class="btn rungbtn" href="#people" id="toPeople">Request a live mock</a></div>
  </div>
  <div class="actions">
    ${R.next_focus ? `<button class="btn" id="drill">Practice again: ${esc(R.next_focus)}</button>` : ""}
    <button class="btn ghost" id="newSession">New session</button>
  </div>`;
  body.innerHTML = html;
  survey = { useful: null, wtp: null };
  S.fbAt = new Date().toISOString();
  body.querySelectorAll(".opts").forEach(g => g.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    g.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    survey[g.dataset.k] = g.dataset.k === "useful" ? +b.dataset.v : b.dataset.v;
    saveSurvey();
  }));
  $("toPeople").addEventListener("click", () => {
    setStep("human");
    $("rField").value = S.cfg.role + (S.cfg.company ? " at " + S.cfg.company : "");
    $("rYear").value = S.cfg.year; if (S.cfg.company) $("rCompanies").value = S.cfg.company;
  });
  $("newSession").addEventListener("click", () => { setStep("setup"); window.scrollTo(0, 0); });
  if ($("drill")) $("drill").addEventListener("click", () => { $("focus").value = R.next_focus; setStep("setup"); $("startBtn").click(); });
}

let surveyBusy = false, surveyQueued = false;
async function saveSurvey() {
  if (surveyBusy) { surveyQueued = true; return; }
  surveyBusy = true;
  try {
    await api("/api/feedback", { method: "POST", body: { uid, entry: {
      at: S.fbAt, role: S.cfg.role, format: S.cfg.format, year: S.cfg.year,
      overall: S.result ? Math.round(S.result.overall || 0) : null, useful: survey.useful, wtp: survey.wtp
    } } });
    $("surveyMsg").textContent = "Saved. Thank you.";
  } catch (e) { $("surveyMsg").textContent = "Thanks!"; }
  finally { surveyBusy = false; if (surveyQueued) { surveyQueued = false; saveSurvey(); } }
}

/* ---------- real-person requests ---------- */
const STATUS_TEXT = {
  New: "Request received. We're finding someone in your field.",
  Matching: "We're reaching out to people in your field now.",
  Matched: "You're matched. Check your email for the time and link.",
  Done: "Session complete. Hope it helped. You can send another request any time."
};
function showMyRequest(r) {
  if (!r) return;
  $("reqStatus").classList.remove("hidden");
  $("reqStatus").innerHTML = `<b>Your request: ${esc(r.kind)}</b> · ${esc(STATUS_TEXT[r.status] || r.status)}`;
}
api("/api/requests?uid=" + encodeURIComponent(uid)).then(showMyRequest).catch(() => {});

$("reqForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  const err = $("reqErr"); err.classList.add("hidden");
  const data = {
    uid, name: $("rName").value.trim(), email: $("rEmail").value.trim(), year: $("rYear").value, field: $("rField").value.trim(),
    kind: document.querySelector("input[name=rKind]:checked").value, companies: $("rCompanies").value.trim(),
    when: $("rWhen").value.trim(), notes: $("rNotes").value.trim(), firstGen: $("rFirstGen").checked
  };
  if (!data.name || !/^\S+@\S+\.\S+$/.test(data.email) || !data.field) {
    err.textContent = "Add your name, a valid email and your target role so we can match you."; err.classList.remove("hidden"); return;
  }
  $("reqBtn").disabled = true;
  try {
    showMyRequest(await api("/api/requests", { method: "POST", body: data }));
    $("reqForm").reset();
  } catch (e) {
    err.textContent = e.message; err.classList.remove("hidden");
  } finally { $("reqBtn").disabled = false; }
});

/* ---------- founder view ---------- */
let pw = null; try { pw = sessionStorage.getItem("fr_pw"); } catch (e) {}
let REQ = [], FB = [];
function founderEnter() { if (pw) loadDash(); }
$("loginForm").addEventListener("submit", ev => {
  ev.preventDefault();
  pw = $("pw").value; loadDash();
});
$("refreshBtn").addEventListener("click", loadDash);
async function loadDash() {
  $("loginErr").classList.add("hidden");
  try {
    const d = await api("/api/admin", { headers: { "x-founder-password": pw } });
    try { sessionStorage.setItem("fr_pw", pw); } catch (e) {}
    REQ = d.requests || []; FB = d.feedback || [];
    $("loginForm").classList.add("hidden"); $("dash").classList.remove("hidden");
    $("lastLoad").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    drawFounder();
  } catch (e) {
    if (e.status === 401) { pw = null; try { sessionStorage.removeItem("fr_pw"); } catch (x) {} $("loginForm").classList.remove("hidden"); $("dash").classList.add("hidden"); }
    $("loginErr").textContent = e.message; $("loginErr").classList.remove("hidden");
  }
}
function drawFounder() {
  const rated = FB.filter(f => f.useful);
  const avg = rated.length ? (rated.reduce((a, f) => a + f.useful, 0) / rated.length).toFixed(1) : "–";
  const wtpN = FB.filter(f => f.wtp).length;
  const payers = FB.filter(f => f.wtp && f.wtp !== "Only if free").length;
  const counts = FB.reduce((m, f) => m.set(f.who, (m.get(f.who) || 0) + 1), new Map());
  const repeat = [...counts.values()].filter(n => n > 1).length;
  $("tiles").innerHTML = [
    [FB.length, "rated sessions"], [counts.size, "students"], [repeat, "came back for a 2nd session"],
    [avg, "avg usefulness (of 5)"], [wtpN ? Math.round(payers / wtpN * 100) + "%" : "–", "would pay for a real person"], [REQ.length, "real-person requests"]
  ].map(([b, s]) => `<div class="tile"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("");

  const reqs = REQ.slice().sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  $("reqRows").innerHTML = reqs.length ? reqs.map(r => `<tr>
    <td><b>${esc(r.name)}</b><br><span class="hint">${esc(r.email)} · ${esc(r.year)}${r.firstGen ? " · first-gen" : ""}</span></td>
    <td>${esc(r.kind)}</td><td>${esc(r.field)}${r.companies ? `<br><span class="hint">${esc(r.companies)}</span>` : ""}</td>
    <td>${esc(r.when)}</td><td>${esc(r.notes)}</td>
    <td><select data-id="${esc(r.uid)}" aria-label="Status for ${esc(r.name)}">${["New", "Matching", "Matched", "Done"].map(s => `<option${s === r.status ? " selected" : ""}>${s}</option>`).join("")}</select></td></tr>`).join("")
    : `<tr><td colspan="6" class="hint">No requests yet. Share the link with a few students to start.</td></tr>`;
  $("reqRows").querySelectorAll("select").forEach(sel => sel.addEventListener("change", async () => {
    sel.disabled = true;
    try { await api("/api/admin", { method: "PATCH", headers: { "x-founder-password": pw }, body: { uid: sel.dataset.id, status: sel.value } }); }
    catch (e) { $("loginErr").textContent = e.message; $("loginErr").classList.remove("hidden"); }
    sel.disabled = false;
  }));
  const fbs = FB.slice().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  $("fbRows").innerHTML = fbs.length ? fbs.map(f => `<tr><td>${esc(new Date(f.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</td><td>${esc(f.role)}<br><span class="hint">${esc(f.year)}</span></td><td>${f.format === "recorded" ? "Recorded" : "Live"}</td><td>${f.overall ?? "–"}</td><td>${f.useful ?? "–"}</td><td>${esc(f.wtp || "–")}</td></tr>`).join("")
    : `<tr><td colspan="6" class="hint">No ratings yet.</td></tr>`;
}

setStep("setup");
route();
})();
