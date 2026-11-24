/* SaccoPro — app router, views, actions */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ic = (name, cls) => `<svg class="ic ${cls || ""}"><use href="#i-${name}"/></svg>`;
  /* S() = the SACCO this device is signed into. Pre-login views get a safe empty shape. */
  const EMPTY_SACCO = { id: null, circle: null, members: [], transactions: [], loans: [], meetings: [], requests: [], proposals: [], notifications: [], audit: [], reconciliation: { cash: 0, mobile: 0, bank: 0, lastDate: null } };
  const S = () => H.sacco() || EMPTY_SACCO;
  const UI = { finFilter: "all", finSearch: "", finSort: "new", memSearch: "", chartRange: 3, loginRole: "member", loanFilter: "all", joinCode: "", joinFound: false, joinSacco: null };

  /* ---------- small view helpers ---------- */
  const avatar = (m, size) => `<span class="avatar ${size || ""} av-${m.color % 6}">${esc(H.initials(m.name))}</span>`;
  const PILL = { paid: ["green", "Paid"], pending: ["amber", "Pending"], partial: ["amber", "Partial"], recorded: ["blue", "Recorded"], overdue: ["red", "Overdue"], queried: ["amber", "Queried"], active: ["green", "Active"], cleared: ["grey", "Cleared"], rejected: ["red", "Rejected"], approved: ["green", "Approved"], upcoming: ["green", "Upcoming"], past: ["grey", "Past"], passed: ["green", "Passed"], waived: ["grey", "Waived"], noted: ["blue", "Noted"], open: ["green", "Open"], closed: ["grey", "Closed"] };
  const pill = (s, extra) => { const p = PILL[s] || ["grey", s]; return `<span class="pill ${p[0]}">${esc(extra || p[1])}</span>`; };
  const rolePill = (r) => `<span class="role-pill">${esc(r[0].toUpperCase() + r.slice(1))}</span>`;
  const money = (n, cls, size) => `<div class="money ${size || ""} ${cls || "white-t"}">${H.fmt(n)}</div>`;
  const label = (t) => `<div class="label">${esc(t)}</div>`;
  const section = (t, right) => `<div class="section-label"><span>${esc(t)}</span>${right || ""}</div>`;
  const backHdr = (title, sub, back) => `<div class="hdr"><div class="hdr-left"><button class="back-btn" data-action="go" data-go="${back || "home"}" aria-label="Back">${ic("back")}</button><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div></div></div>`;
  const bellBtn = () => { const un = H.notices().filter(n => !n.read).length; return `<button class="icon-btn" data-action="go" data-go="notifications" aria-label="Notifications">${ic("bell")}${un ? '<span class="dot"></span>' : ""}</button>`; };
  const mainHdr = (title, sub, extra) => `<div class="hdr"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}${extra || ""}</div><div class="hdr-right">${bellBtn()}${avatar(H.user() || S().members[0])}</div></div>`;
  const cloudStatusLine = () => {
    if (!window.Cloud) return "Local mode";
    const s = Cloud.status;
    if (s === "connected") return '<span class="green-t">●</span> Cloud synced · Supabase';
    if (s === "connecting") return "Connecting to cloud…";
    if (s === "needs-setup") return '<span class="amber-t">●</span> Cloud setup pending — see admin console';
    if (s === "offline") return '<span class="amber-t">●</span> Offline — saved on this device';
    return "Local mode";
  };

  const TX_META = {
    contribution: { icon: "down", cls: "g", name: "Contribution" },
    repayment: { icon: "up", cls: "g", name: "Loan repayment" },
    disbursement: { icon: "doc", cls: "b", name: "Loan disbursement" },
    expense: { icon: "wallet", cls: "n", name: "Expense" },
    withdrawal: { icon: "swap", cls: "b", name: "Withdrawal" },
  };
  function txRow(t, clickable) {
    const meta = TX_META[t.type]; const m = t.memberId ? H.member(t.memberId) : null;
    const amtCls = t.status === "overdue" ? "red-t" : t.status === "partial" || t.status === "pending" || t.status === "queried" ? "amber-t" : (t.type === "disbursement" || t.type === "withdrawal") ? "blue-t" : t.type === "expense" ? "white-t" : "green-t";
    const icoCls = t.status === "overdue" ? "r" : t.status === "pending" || t.status === "partial" || t.status === "queried" ? "a" : meta.cls;
    const tag = clickable ? "button" : "div";
    return `<${tag} class="row" ${clickable ? `data-action="tx-detail" data-id="${t.id}"` : ""}>
      <span class="ico ${icoCls}">${ic(meta.icon)}</span>
      <span class="body"><span class="t1">${esc(t.note && t.type === "expense" ? "Expense — " + t.note : meta.name)}</span><div class="t2">${m ? esc(m.name) + " · " : ""}${H.date(t.date)}</div></span>
      <span class="right"><div class="amt ${amtCls}">${H.fmt(t.amount)}</div>${pill(t.status)}</span>
    </${tag}>`;
  }
  function loanRow(l) {
    const m = H.member(l.memberId);
    const amtCls = l.status === "overdue" ? "red-t" : l.status === "pending" || l.status === "approved" ? "amber-t" : l.status === "cleared" || l.status === "rejected" ? "grey-t" : "white-t";
    const extra = l.status === "overdue" ? `Overdue ${Math.max(1, Math.round((Date.now() - new Date(l.due)) / 86400000))} days` : null;
    const int = H.loanInterest(l);
    const state = l.due && l.status !== "cleared" ? " · due " + H.dateShort(l.due) : l.status === "cleared" ? " · repaid in full" : l.status === "approved" ? " · awaiting secretary" : " · awaiting vote";
    return `<button class="row" data-action="loan-detail" data-id="${l.id}">
      ${avatar(m, "sm")}
      <span class="body"><span class="t1">${esc(m.name)}</span><div class="t2">${esc(l.purpose)}${int ? " · " + H.fmt(int) + " interest" : ""}${state}</div></span>
      <span class="right"><div class="amt ${amtCls}">${H.fmt(l.status === "cleared" ? H.loanTotal(l) : l.balance)}</div>${pill(l.status, extra)}</span>
      ${ic("back", "chev")}
    </button>`;
  }
  function chartSVG(pts) {
    const W = 340, Hh = 130, pad = 26;
    const max = Math.max(...pts.map(p => p.value), 1);
    const x = i => pad + i * ((W - pad - 10) / Math.max(pts.length - 1, 1));
    const y = v => Hh - 22 - (v / max) * (Hh - 40);
    const line = pts.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
    const area = `${pad},${Hh - 22} ${line} ${x(pts.length - 1)},${Hh - 22}`;
    const grid = [0.25, 0.5, 0.75, 1].map(f => `<line x1="${pad}" x2="${W - 8}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`).join("");
    return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Savings growth chart">
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c55e" stop-opacity=".35"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/></linearGradient></defs>
      ${grid}<polygon points="${area}" fill="url(#cg)"/>
      <polyline points="${line}" fill="none" stroke="#34d399" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="3.4" fill="#0a1322" stroke="#34d399" stroke-width="2"/>`).join("")}
      ${pts.map((p, i) => `<text x="${x(i)}" y="${Hh - 6}" text-anchor="middle" font-size="9.5" fill="#8b98ab">${esc(p.label)}</text>`).join("")}
    </svg>`;
  }

  /* ---------- tab bar ---------- */
  function tabbar(active) {
    const staff = H.isStaff();
    const tabs = staff
      ? [["home", "home", "Home"], ["members", "members", "Members"], ["finance", "finance", "Finance"], ["meetings", "meetings", "Meetings"], ["more", "more", "More"]]
      : [["home", "home", "Home"], ["finance", "finance", "Finance"], ["meetings", "meetings", "Meetings"], ["more", "more", "More"]];
    return `<nav class="tabbar">${tabs.map(([route, icon, name]) =>
      `<button class="tab ${active === route ? "on" : ""}" data-action="go" data-go="${route}">${ic(icon)}<span>${name}</span></button>`).join("")}</nav>`;
  }

  /* ---------- AUTH VIEWS ---------- */
  const V = {};
  V.welcome = () => {
    return `<div class="welcome">
      <div class="brand-glow"></div>
      <img class="brand-logo" src="assets/saccopro-logo-web.png" alt="SaccoPro — SACCO Management System. Save, Grow, Prosper.">
      <div class="tagline">Start your own savings circle, or join one with a code.</div>
      <button class="btn primary" data-action="go" data-go="create">Create a SACCO &#8594;</button>
      <button class="btn outline" data-action="go" data-go="join">Join with a code</button>
      <button class="btn outline" data-action="go" data-go="login">Log in</button>
      <div class="welcome-foot">Save · Grow · Prosper<br><a href="#/privacy">Privacy</a> · <a href="#/privacy">Terms</a></div>
    </div>`;
  };

  V.create = () => `<div class="page no-tabs">
    ${backHdr("Create a SACCO", "Set up your circle and your secretary account", "welcome")}
    <form data-form="create-sacco" style="display:flex;flex-direction:column;gap:14px">
      <div class="section-label"><span>Your circle</span></div>
      <div class="field">${label("Circle name")}<input class="input" name="name" placeholder="e.g. Bright Future Savings Group" required minlength="3"></div>
      <div class="field">${label("Category")}<select class="input" name="category"><option>Savings Group</option><option>Welfare Circle</option><option>Investment Club</option><option>Cooperative</option></select></div>
      <div class="field">${label("District")}<input class="input" name="district" placeholder="Kampala" required></div>
      <div class="field">${label("Country")}<select class="input" name="country"><option>Uganda</option><option>Kenya</option><option>Tanzania</option><option>Rwanda</option><option>Nigeria</option><option>Ghana</option></select></div>
      <div class="field">${label("Monthly contribution (UGX)")}<input class="input" name="expected" inputmode="numeric" placeholder="50,000" required></div>
      <div class="field">${label("Description (optional)")}<textarea class="input" name="description" placeholder="What this circle saves and grows for."></textarea></div>
      <div class="divider"></div>
      <div class="section-label"><span>Your secretary account</span></div>
      <div class="hint" style="margin:0 0 2px">You run the books as secretary. Members join with the code we generate, and you approve them.</div>
      <div class="field">${label("Full name")}<input class="input" name="secName" placeholder="e.g. Grace Nakato" required minlength="3" autocomplete="name"></div>
      <div class="field">${label("Username")}<input class="input" name="secUsername" placeholder="e.g. grace.nakato" required minlength="3" autocomplete="username"><div class="hint">Letters, numbers, dots, dashes. You can log in with this or your phone.</div></div>
      <div class="field">${label("Phone number")}<div class="phone-input"><span class="cc">+256</span><input name="secPhone" placeholder="700 000 000" inputmode="tel" required autocomplete="tel"></div></div>
      <div class="field">${label("Password")}<div class="input-wrap"><input class="input" name="secPw" type="password" placeholder="At least 8 characters" required minlength="8" autocomplete="new-password"><button type="button" class="eye" data-action="toggle-pw">${ic("eye")}</button></div></div>
      <div class="field">${label("Confirm password")}<div class="input-wrap"><input class="input" name="secPw2" type="password" placeholder="Repeat password" required minlength="8" autocomplete="new-password"><button type="button" class="eye" data-action="toggle-pw">${ic("eye")}</button></div></div>
      <div class="form-error" id="form-error" hidden></div>
      <button class="btn primary" type="submit">Create SACCO &amp; continue</button>
    </form>
  </div>`;

  V.login = () => {
    const staff = UI.loginRole === "staff";
    const hasSaccos = Store.state.saccos.length > 0;
    return `<div class="page no-tabs">
      ${backHdr("Log in", "Access your Circle account", "welcome")}
      ${!hasSaccos ? `<div class="banner amber"><span class="warn-ico">${ic("warn")}</span><span class="grow">No circles exist yet. <a href="#/create">Create your own SACCO</a> to get started, or join one with a code.</span></div>` : ""}
      <div class="seg"><button data-action="login-role" data-role="member" class="${!staff ? "on" : ""}">As Member</button><button data-action="login-role" data-role="staff" class="${staff ? "on" : ""}">As Staff</button></div>
      <form data-form="login" style="display:flex;flex-direction:column;gap:14px">
        <div class="field">${label("Phone or username")}<input class="input" name="login" placeholder="700 000 000 or grace.nakato" required autocomplete="username"></div>
        <div class="field">${label("Password")}<div class="input-wrap"><input class="input" name="password" type="password" placeholder="Your password" required autocomplete="current-password"><button type="button" class="eye" data-action="toggle-pw">${ic("eye")}</button></div></div>
        ${staff ? `<div class="field">${label("Circle ID")}<input class="input" name="circleId" placeholder="CIRC-000000" required style="letter-spacing:2px"><div class="hint">Your secretary shares this with the leadership team.</div></div>` : ""}
        <div class="form-error" id="form-error" hidden></div>
        <button class="btn primary" type="submit">Log in as ${staff ? "Staff" : "Member"}</button>
      </form>
      <div class="hint center">Staff (secretary, treasurer, chairperson) log in with the Circle ID.</div>
      <div class="divider"></div>
      <div class="hint center">New here? <a href="#/create">Create a SACCO</a> or <a href="#/join">join with a code</a>.</div>
    </div>`;
  };

  V.join = () => `<div class="page no-tabs">
    ${backHdr("Join a Circle", "Enter the joining code shared by your secretary", Store.state.session ? "circles" : "welcome")}
    <form data-form="join-search" style="display:flex;gap:9px">
      <input class="input" name="code" placeholder="JOIN-00000" value="${esc(UI.joinCode || "")}" required style="flex:1;letter-spacing:1px">
      <button class="btn primary sm" style="width:auto;padding:12px 18px" type="submit">Search</button>
    </form>
    <div id="join-result">${UI.joinFound ? joinResult() : `<div class="hint center">Ask your secretary for the circle's joining code.</div>`}</div>
  </div>`;
  function joinResult() {
    const sacco = UI.joinSacco;
    if (!sacco || !sacco.circle) return `<div class="hint center">Ask your secretary for the circle's joining code.</div>`;
    const c = sacco.circle;
    const sec = sacco.members.find(m => m.role === "secretary");
    return `<div class="glass" style="display:flex;flex-direction:column;gap:10px">
      <span class="avatar av-3" style="width:44px;height:44px;font-size:14px">${esc(H.initials(c.name))}</span>
      <div style="font-size:18px;font-weight:800;line-height:1.3">${esc(c.name)}</div>
      <div class="hint" style="margin:0">${sacco.members.length} member${sacco.members.length === 1 ? "" : "s"}${sec ? " · Secretary: " + esc(sec.name) : ""}</div>
      <div class="divider"></div>
      <form data-form="join-request" style="display:flex;flex-direction:column;gap:12px">
        <div class="field">${label("Your full name")}<input class="input" name="name" placeholder="e.g. Janet B." required minlength="3" autocomplete="name"></div>
        <div class="field">${label("Username")}<input class="input" name="username" placeholder="e.g. janet.b" required minlength="3" autocomplete="username"></div>
        <div class="field">${label("Phone number")}<div class="phone-input"><span class="cc">+256</span><input name="phone" placeholder="701 234 567" inputmode="tel" required autocomplete="tel"></div></div>
        <div class="field">${label("Choose a password")}<div class="input-wrap"><input class="input" name="password" type="password" placeholder="At least 8 characters" required minlength="8" autocomplete="new-password"><button type="button" class="eye" data-action="toggle-pw">${ic("eye")}</button></div></div>
        <div class="field">${label("Confirm password")}<div class="input-wrap"><input class="input" name="confirm" type="password" placeholder="Repeat password" required minlength="8" autocomplete="new-password"><button type="button" class="eye" data-action="toggle-pw">${ic("eye")}</button></div></div>
        <div class="form-error" id="form-error" hidden></div>
        <button class="btn primary" type="submit">Request to join</button>
        <div class="hint center">Your secretary reviews the request. Once approved, log in with this phone and password.</div>
      </form>
    </div>`;
  }

  V.privacy = () => `<div class="page no-tabs">
    ${backHdr("Privacy & Terms", "", Store.state.session ? "more" : "welcome")}
    <div class="card"><div class="t1" style="font-weight:700;margin-bottom:6px">Your data belongs to your circle</div><div class="hint">SaccoPro stores member records, contributions and loan history so your group can keep clear, shared books. Secretaries record; treasurers verify; chairpersons approve. Every change is kept in the audit history.</div></div>
    <div class="card"><div class="t1" style="font-weight:700;margin-bottom:6px">How your data is stored</div><div class="hint">Records are saved on this device and synced to a private cloud database so every member of your circle sees the same books. Each circle is kept separate from the others. Passwords are stored only as salted hashes — never as plain text. The SaccoPro platform is administered separately by its developer, Nx Base.</div></div>
    <div class="card"><div class="t1" style="font-weight:700;margin-bottom:6px">What we never do</div><div class="hint">We never share your phone number outside your circle, never move money on your behalf, and never show the Circle ID to ordinary members.</div></div>
  </div>`;

  /* ---------- MAIN VIEWS ---------- */
  V.circles = () => {
    const s = S(); const u = H.user(); const t = H.totals();
    const req = t.pendingRequests;
    return `<div class="page">
      <div class="glass" style="display:flex;align-items:center;gap:14px">
        <div style="flex:1"><div class="hint" style="margin:0">Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},</div><div style="font-size:24px;font-weight:800;margin-top:2px">${esc(u.name.split(" ")[0])}</div></div>
        ${avatar(u, "lg")}
      </div>
      ${section("Your circles")}
      <div class="circle-card">
        <div class="circle-top">
          <span class="circle-ico green">${ic("leaf")}</span>
          <div style="flex:1"><div class="circle-name">${esc(s.circle.name)}</div>
          <div class="circle-meta">${s.members.length} members · ${rolePill(H.role())}</div>
          ${H.isStaff() ? `<div style="margin-top:7px"><span class="code-chip">${esc(s.circle.id)}</span></div>` : ""}</div>
        </div>
        ${H.role() === "secretary" && req ? `<button class="banner amber" style="margin-top:12px" data-action="go" data-go="requests"><span class="warn-ico">${ic("members")}</span><span class="grow">${req} membership request${req > 1 ? "s" : ""} waiting</span><span class="link">&#8594;</span></button>` : ""}
        <button class="btn outline sm" style="margin-top:12px" data-action="go" data-go="home">Open circle</button>
      </div>
      <button class="btn ghost" data-action="go" data-go="join">Join another Circle</button>
    </div>${tabbar("")}`;
  };

  V.home = () => {
    const r = H.role();
    return (r === "member" ? homeMember() : r === "secretary" ? homeSecretary() : r === "treasurer" ? homeTreasurer() : homeChair()) + tabbar("home");
  };

  function homeMember() {
    const s = S(); const u = H.user(); const t = H.totals();
    const savings = H.savingsOf(u.id); const loan = H.loanOf(u.id);
    const mt = H.nextMeeting();
    const recent = s.transactions.filter(x => x.memberId === u.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    const pts = H.savingsSeries(UI.chartRange);
    const growth = pts.length > 1 && pts[0].value ? Math.round(((pts[pts.length - 1].value - pts[0].value) / pts[0].value) * 100) : 0;
    return `<div class="page">
      ${mainHdr(s.circle.name, "Welcome, " + u.name.split(" ")[0])}
      <div class="glass green">${label("My total savings")}${money(savings, "white-t", "big")}<div class="delta">${savings ? `&#9650; ${growth}% over ${UI.chartRange} months` : "Make your first contribution to start growing"}</div></div>
      <div class="grid2">
        <div class="card">${label("Expected")}${money(s.circle.expectedMonthly, "white-t", "md")}</div>
        <button class="card" style="text-align:left" data-action="go" data-go="loans">${label("Outstanding loan")}${money(loan, loan ? "red-t" : "green-t", "md")}<div class="hint">View loans &#8594;</div></button>
      </div>
      <div class="btn-row"><button class="btn primary" data-action="go" data-go="contribute">${ic("coins")} Contribute</button><button class="btn outline" data-action="go" data-go="passbook">${ic("book")} My passbook</button></div>
      <div class="card chart-card">
        <div class="chart-head"><span class="chart-title">Savings growth</span><span class="chart-range">${[3, 6, 12].map(n => `<button data-action="chart-range" data-n="${n}" class="${UI.chartRange === n ? "on" : ""}">${n === 12 ? "1Y" : n + "M"}</button>`).join("")}</span></div>
        <div class="chart">${chartSVG(pts)}</div>
      </div>
      ${section("Upcoming")}
      <div class="grid2">
        <button class="card" style="text-align:left" ${mt ? `data-action="go" data-go="meeting/${mt.id}"` : ""}>
          <div style="display:flex;gap:9px;align-items:center">${ic("meetings")}<div><div style="font-size:12.5px;font-weight:700">Next meeting</div><div class="hint" style="margin-top:2px">${mt ? H.dateLong(mt.date) : "Not scheduled"}</div></div></div>
        </button>
        <div class="card"><div style="display:flex;gap:9px;align-items:center">${ic("clock")}<div><div style="font-size:12.5px;font-weight:700">Contribution deadline</div><div class="hint" style="margin-top:2px">Friday, before the meeting</div></div></div></div>
      </div>
      ${section("Recent activity", `<button class="see-all" data-action="go" data-go="passbook">See all &#8594;</button>`)}
      <div class="list">${recent.map(x => txRow(x, true)).join("") || '<div class="empty">No activity yet — make your first contribution.</div>'}</div>
    </div>`;
  }

  function homeSecretary() {
    const s = S(); const t = H.totals();
    const recent = [...s.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    const toPlan = s.loans.filter(l => l.status === "approved");
    return `<div class="page">
      <div class="hdr"><div><h1>${esc(s.circle.name)}</h1><div class="sub">${s.members.length} active members</div><div style="margin-top:6px"><span class="code-chip">${esc(s.circle.id)}</span></div></div><div class="hdr-right">${bellBtn()}${avatar(H.user())}</div></div>
      ${toPlan.length ? `<button class="banner amber" data-action="loan-detail" data-id="${toPlan[0].id}"><span class="warn-ico">${ic("coins")}</span><span class="grow">${toPlan.length} approved loan${toPlan.length === 1 ? "" : "s"} waiting for a repayment plan</span><span class="link">Set up &#8594;</span></button>` : ""}
      ${t.pendingRequests || t.pendingVerify ? `<button class="banner amber" data-action="go" data-go="${t.pendingRequests ? "requests" : "queue"}"><span class="warn-ico">${ic("warn")}</span><span class="grow">${t.pendingRequests} membership request${t.pendingRequests === 1 ? "" : "s"} · ${t.pendingVerify} contribution${t.pendingVerify === 1 ? "" : "s"} pending verification</span><span class="link">Review &#8594;</span></button>` : ""}
      ${section("Financial overview")}
      <div class="grid2">
        <div class="card">${label("Total savings")}${money(t.moneyIn, "white-t", "md")}<div class="delta">&#9650; this month ${H.fmtShort(t.thisMonth)}</div></div>
        <div class="card">${label("Expected / month")}${money(t.expected, "white-t", "md")}</div>
        <div class="card">${label("Outstanding loans")}${money(t.outstanding, "red-t", "md")}</div>
        <div class="card">${label("Available cash")}${money(t.cash, "white-t", "md")}<div class="hint">Excludes money lent out</div></div>
      </div>
      ${section("Quick actions")}
      <div class="tiles">
        <button class="tile horiz" data-action="go" data-go="record/contribution">${ic("coins")} Record contribution</button>
        <button class="tile horiz" data-action="go" data-go="register-member">${ic("user-plus")} Register member</button>
        <button class="tile horiz" data-action="go" data-go="record/repayment">${ic("wallet")} Record repayment</button>
        <button class="tile horiz" data-action="loan-record">${ic("coins")} Record a loan given out</button>
        <button class="tile horiz" data-action="go" data-go="meeting-new">${ic("meetings")} Create meeting</button>
      </div>
      ${section("Needs attention")}
      <div class="grid3">
        <button class="attn amber" data-action="go" data-go="requests"><div class="n">${ic("members", "")} ${t.pendingRequests}</div><div class="t">membership requests</div></button>
        <button class="attn amber" data-action="go" data-go="queue"><div class="n">${ic("coins")} ${t.pendingVerify}</div><div class="t">contributions to verify</div></button>
        <button class="attn red" data-action="go" data-go="loans"><div class="n">${ic("warn")} ${t.overdue}</div><div class="t">loan${t.overdue === 1 ? "" : "s"} overdue</div></button>
      </div>
      ${section("Recent activity", `<button class="see-all" data-action="go" data-go="finance">See all &#8594;</button>`)}
      <div class="list">${recent.map(x => txRow(x, true)).join("")}</div>
    </div>`;
  }

  function homeTreasurer() {
    const s = S(); const t = H.totals(); const by = H.methodTotals();
    const maxM = Math.max(by.Cash, by["Mobile money"], by.Bank, 1);
    return `<div class="page">
      <div class="hdr"><div><h1>${esc(s.circle.name)}</h1><div style="margin-top:6px">${rolePill("treasurer")}</div></div><div class="hdr-right">${bellBtn()}${avatar(H.user())}</div></div>
      <div class="grid2">
        <div class="card">${label("Money received")}${money(t.moneyIn, "green-t", "md")}</div>
        <div class="card">${label("Money paid out")}${money(t.moneyOut, "blue-t", "md")}</div>
        <div class="card">${label("Available cash")}${money(t.cash, "green-t", "md")}</div>
        <div class="card">${label("Outstanding loans")}${money(t.outstanding, "red-t", "md")}</div>
      </div>
      <div class="glass green">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <span class="ico g" style="width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center">${ic("doc")}</span>
          <div style="flex:1">${label("Verification queue")}<div class="money white-t">${t.pendingVerify} waiting</div><div class="hint">Recorded by the secretary, waiting for your confirmation.</div></div>
        </div>
        <button class="btn tint sm" style="margin-top:12px" data-action="go" data-go="queue">Open queue &#8594;</button>
      </div>
      ${section("Reconciliation")}
      <div class="card">
        ${[["Cash", "wallet"], ["Mobile money", "finance"], ["Bank", "home"]].map(([k, icon]) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0"><span style="color:var(--muted)">${ic(icon)}</span><div style="flex:1"><div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600"><span>${k}</span><span>${H.fmt(Math.max(0, by[k]))}</span></div><div class="progress" style="margin-top:5px"><i style="width:${Math.max(2, Math.round((Math.max(0, by[k]) / maxM) * 100))}%"></i></div></div></div>`).join("")}
        <button class="btn outline sm" style="margin-top:10px" data-action="go" data-go="reconcile">Reconcile &#8594;</button>
      </div>
      ${section("My tools")}
      <div class="tiles three">
        <button class="tile" data-action="go" data-go="record/expense">${ic("wallet")} Record expense</button>
        <button class="tile" data-action="go" data-go="record/withdrawal">${ic("swap")} Record withdrawal</button>
        <button class="tile" data-action="go" data-go="finance">${ic("doc")} View receipts</button>
        <button class="tile" data-action="go" data-go="finance">${ic("book")} Financial ledger</button>
        <button class="tile" data-action="go" data-go="reports">${ic("chart")} Reports</button>
        <button class="tile" data-action="go" data-go="audit">${ic("history")} Audit history</button>
      </div>
    </div>`;
  }

  function homeChair() {
    const s = S(); const t = H.totals();
    const pendingLoans = s.loans.filter(l => l.status === "pending");
    const approvedLoans = s.loans.filter(l => l.status === "approved");
    const openProps = s.proposals.filter(p => p.status === "open");
    const paid = s.transactions.filter(t => t.type === "contribution" && (t.status === "paid" || t.status === "partial"));
    const nowTotal = paid.reduce((a, t) => a + t.amount, 0);
    const prevTotal = paid.filter(t => new Date(t.date).getTime() < Date.now() - 30 * 86400000).reduce((a, t) => a + t.amount, 0);
    const growthPct = prevTotal ? Math.round(((nowTotal - prevTotal) / prevTotal) * 100) : (nowTotal ? 100 : 0);
    const health = [
      ["Members", s.members.length, s.members.length >= 10 ? ["green", "Healthy"] : ["amber", "Watch"]],
      ["Savings growth", growthPct + "%", growthPct >= 0 ? ["green", "Healthy"] : ["amber", "Watch"]],
      ["Loan recovery", H.recoveryRate() + "%", H.recoveryRate() >= 80 ? ["green", "Healthy"] : ["amber", "Watch"]],
      ["Meeting attendance", H.attendanceRate() + "%", H.attendanceRate() >= 75 ? ["green", "Healthy"] : ["red", "Low"]],
    ];
    return `<div class="page">
      <div class="hdr"><div><h1>${esc(s.circle.name)}</h1><div style="margin-top:6px">${rolePill("chairperson")}</div></div><div class="hdr-right">${bellBtn()}${avatar(H.user())}</div></div>
      ${section("Circle health")}
      <div class="grid4">${health.map(([k, v, st]) => `<div class="card" style="padding:10px 9px"><div class="label" style="font-size:8.5px">${esc(k)}</div><div class="money white-t" style="font-size:19px">${v}</div><div style="margin-top:6px"><span class="pill ${st[0]}">${st[1]}</span></div></div>`).join("")}</div>
      ${section("Pending approvals")}
      <div class="list">
        ${pendingLoans.map(l => { const m = H.member(l.memberId); return `<div class="row"><span class="ico a">${ic("coins")}</span><span class="body"><span class="t1">Loan application</span><div class="t2">By ${esc(m.name)} — ${esc(l.purpose)}</div><div class="amt white-t" style="margin-top:3px">${H.fmt(l.amount)}</div></span><button class="btn tint sm" style="width:auto" data-action="loan-detail" data-id="${l.id}">Review</button></div>`; }).join("")}
        ${approvedLoans.map(l => { const m = H.member(l.memberId); return `<div class="row"><span class="ico g">${ic("check")}</span><span class="body"><span class="t1">Approved — with the secretary</span><div class="t2">${esc(m.name)} — ${esc(l.purpose)}</div><div class="amt white-t" style="margin-top:3px">${H.fmt(l.amount)}</div></span><button class="btn tint sm" style="width:auto" data-action="loan-detail" data-id="${l.id}">View</button></div>`; }).join("")}
        ${openProps.map(p => `<div class="row"><span class="ico b">${ic("gavel")}</span><span class="body"><span class="t1">Vote in progress</span><div class="t2">${esc(p.title)}</div><div class="t2">${p.yes.length} yes · ${p.no.length} no · closes ${H.dateShort(p.closes)}</div></span><button class="btn tint sm" style="width:auto" data-action="go" data-go="proposals">Open</button></div>`).join("")}
        ${!pendingLoans.length && !approvedLoans.length && !openProps.length ? '<div class="empty">Nothing waiting for approval. The circle is running cleanly.</div>' : ""}
      </div>
      ${section("Governance")}
      <div class="list">
        <button class="row" data-action="go" data-go="proposals"><span class="ico n">${ic("gavel")}</span><span class="body"><span class="t1">Voting &amp; proposals</span></span>${ic("back", "chev")}</button>
        <button class="row" data-action="go" data-go="constitution"><span class="ico n">${ic("book")}</span><span class="body"><span class="t1">Circle constitution</span></span>${ic("back", "chev")}</button>
        <button class="row" data-action="go" data-go="decisions"><span class="ico n">${ic("gavel")}</span><span class="body"><span class="t1">Meeting decisions</span></span>${ic("back", "chev")}</button>
      </div>
      ${section("Reports")}
      <div class="list">${reportRows()}</div>
    </div>`;
  }

  /* ---------- finance ---------- */
  V.finance = () => {
    const s = S(); const t = H.totals();
    let tx = [...s.transactions];
    if (UI.finFilter === "contributions") tx = tx.filter(x => x.type === "contribution");
    if (UI.finFilter === "loans") tx = tx.filter(x => x.type === "disbursement" || x.type === "repayment");
    if (UI.finFilter === "expenses") tx = tx.filter(x => x.type === "expense" || x.type === "withdrawal");
    if (UI.finSearch) { const q = UI.finSearch.toLowerCase(); tx = tx.filter(x => (x.memberId && H.member(x.memberId).name.toLowerCase().includes(q)) || (x.note || "").toLowerCase().includes(q) || TX_META[x.type].name.toLowerCase().includes(q)); }
    tx.sort((a, b) => UI.finSort === "old" ? a.date.localeCompare(b.date) : UI.finSort === "high" ? b.amount - a.amount : UI.finSort === "low" ? a.amount - b.amount : b.date.localeCompare(a.date));
    return `<div class="page">
      ${mainHdr("Finance", s.circle.name)}
      <div class="grid3">
        <div class="card" style="padding:11px 12px">${label("Money in")}<div class="money green-t" style="font-size:15px">${H.fmtShort(t.moneyIn)}</div></div>
        <div class="card" style="padding:11px 12px">${label("Money out")}<div class="money blue-t" style="font-size:15px">${H.fmtShort(t.moneyOut)}</div></div>
        <div class="card" style="padding:11px 12px">${label("Balance")}<div class="money white-t" style="font-size:15px">${H.fmtShort(t.cash)}</div></div>
      </div>
      <div class="chips">${[["all", "All"], ["contributions", "Contributions"], ["loans", "Loans"], ["expenses", "Expenses"]].map(([k, n]) => `<button class="chip ${UI.finFilter === k ? "on" : ""}" data-action="fin-filter" data-k="${k}">${n}</button>`).join("")}</div>
      <div style="display:flex;gap:9px">
        <div class="search-wrap" style="flex:1">${ic("search")}<input class="input" id="fin-search" placeholder="Search transactions" value="${esc(UI.finSearch)}" data-input="fin-search"></div>
        <select class="input" style="width:118px" data-change="fin-sort" aria-label="Sort transactions">
          <option value="new" ${UI.finSort === "new" ? "selected" : ""}>Newest</option>
          <option value="old" ${UI.finSort === "old" ? "selected" : ""}>Oldest</option>
          <option value="high" ${UI.finSort === "high" ? "selected" : ""}>Amount ↓</option>
          <option value="low" ${UI.finSort === "low" ? "selected" : ""}>Amount ↑</option>
        </select>
      </div>
      <div class="list">${tx.slice(0, 40).map(x => txRow(x, true)).join("") || '<div class="empty">No transactions match your filters.</div>'}</div>
      ${tx.length > 40 ? `<div class="hint center">Showing 40 of ${tx.length} — download the ledger for everything.</div>` : ""}
      <button class="btn tint sm" data-action="download" data-report="ledger">${ic("download")} Download ledger (CSV)</button>
    </div>${tabbar("finance")}`;
  };

  V.passbook = () => {
    const u = H.user(); const s = S();
    const savings = H.savingsOf(u.id); const loan = H.loanOf(u.id);
    const entries = s.transactions.filter(x => x.memberId === u.id && x.type === "contribution").sort((a, b) => b.date.localeCompare(a.date));
    return `<div class="page">
      ${backHdr("My passbook", u.name, "home")}
      <div class="glass green">${label("My total savings")}${money(savings, "white-t", "big")}<div class="delta">&#9650; growing together since ${H.date(u.joined)}</div></div>
      <div class="grid2">
        <div class="card">${label("Expected monthly")}${money(s.circle.expectedMonthly, "white-t", "md")}</div>
        <button class="card" style="text-align:left" data-action="go" data-go="loans">${label("My loan balance")}${money(loan, loan ? "red-t" : "green-t", "md")}<div class="hint">View loans &#8594;</div></button>
      </div>
      ${section("Savings entries")}
      <div class="list">${entries.map(x => txRow(x, true)).join("") || '<div class="empty">No contributions yet.</div>'}</div>
      <button class="btn outline sm" data-action="download" data-report="passbook">${ic("download")} Download statement</button>
    </div>${tabbar("home")}`;
  };

  V.contribute = () => {
    const s = S(); const u = H.user();
    const recent = s.transactions.filter(x => x.memberId === u.id && x.type === "contribution").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
    return `<div class="page">
      ${backHdr("Contribute", new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" }), "home")}
      <div class="glass">${label("Expected this month")}${money(s.circle.expectedMonthly, "white-t", "big")}<div class="hint">Deadline: Friday, before the meeting</div></div>
      <form data-form="contribute" style="display:flex;flex-direction:column;gap:14px">
        <div class="field">${label("Amount (UGX)")}<input class="input" name="amount" inputmode="numeric" value="${s.circle.expectedMonthly.toLocaleString("en-US")}" required style="font-size:18px;font-weight:700"></div>
        <div class="field">${label("Method")}<input type="hidden" name="method" value="Mobile money"><div class="seg" data-seg="method">${["Cash", "Mobile money", "Bank"].map(m => `<button type="button" data-action="seg-pick" data-val="${m}" class="${m === "Mobile money" ? "on" : ""}">${m}</button>`).join("")}</div></div>
        <div class="field">${label("Note (optional)")}<input class="input" name="note" placeholder="e.g. Sent via MTN MoMo"></div>
        <div class="form-error" id="form-error" hidden></div>
        ${section("My recent contributions")}
        <div class="list">${recent.map(x => txRow(x, false)).join("") || '<div class="empty">No contributions yet.</div>'}</div>
        <div class="spacer"></div>
        <button class="btn primary" type="submit">Confirm contribution</button>
        <div class="hint center">Your secretary will verify this payment.<br>It shows as ${pill("pending")} until verified.</div>
      </form>
    </div>${tabbar("home")}`;
  };

  /* ---------- loans ---------- */
  V.loans = () => {
    const s = S(); const t = H.totals();
    let loans = [...s.loans];
    if (UI.loanFilter !== "all") loans = loans.filter(l => l.status === UI.loanFilter);
    loans.sort((a, b) => { const rank = (l) => l.status === "pending" ? 0 : l.status === "approved" ? 1 : 2; return rank(a) - rank(b) || b.applied.localeCompare(a.applied); });
    const rate = H.recoveryRate();
    return `<div class="page">
      ${mainHdr("Loans", s.circle.name)}
      <div class="grid2">
        <div class="card">${label("Outstanding")}${money(t.outstanding, "red-t", "md")}</div>
        <div class="card">${label("Recovery rate")}<div class="money green-t" style="font-size:17px">${rate}%</div><div class="progress ${rate >= 80 ? "" : "amber"}"><i style="width:${rate}%"></i></div></div>
      </div>
      <div class="chips">${[["all", "All"], ["pending", "Pending"], ["approved", "Approved"], ["active", "Active"], ["overdue", "Overdue"], ["cleared", "Cleared"]].map(([k, n]) => `<button class="chip ${UI.loanFilter === k ? "on" : ""}" data-action="loan-filter" data-k="${k}">${n}</button>`).join("")}</div>
      ${section("Loan book")}
      <div class="list">${loans.map(loanRow).join("") || '<div class="empty">No loans in this view.</div>'}</div>
      ${H.role() === "secretary" ? `<button class="btn tint" data-action="loan-record">${ic("coins")} Record a loan given out</button>` : ""}
      <button class="btn primary" data-action="go" data-go="loan-new">${ic("plus")} New loan application</button>
    </div>${tabbar(H.isStaff() ? "finance" : "home")}`;
  };

  V["loan-new"] = () => {
    const s = S(); const u = H.user();
    const savings = H.savingsOf(u.id);
    const maxLoan = savings * 3;
    return `<div class="page">
      ${backHdr("Loan application", "Reviewed at the next meeting", "loans")}
      <div class="glass">${label("Your borrowing limit")}${money(maxLoan, "white-t", "big")}<div class="hint">Up to 3× your savings of ${H.fmt(savings)}. The circle votes on every loan.</div></div>
      <form data-form="loan-apply" style="display:flex;flex-direction:column;gap:14px">
        <div class="field">${label("Amount (UGX)")}<input class="input" name="amount" inputmode="numeric" placeholder="e.g. 200,000" required style="font-size:18px;font-weight:700"></div>
        <div class="field">${label("Purpose")}<input class="input" name="purpose" placeholder="e.g. School fees, business stock" required minlength="3"></div>
        <div class="field">${label("Preferred repay date")}<input class="input" name="due" type="date" required min="${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}" value="${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}"></div>
        <div class="form-error" id="form-error" hidden></div>
        <button class="btn primary" type="submit">Submit application</button>
        <div class="hint center">Applications are ${pill("pending")} until the chairperson approves. The secretary then confirms the repayment date and any interest.</div>
      </form>
    </div>${tabbar(H.isStaff() ? "finance" : "home")}`;
  };

  /* ---------- members ---------- */
  V.members = () => {
    const s = S(); const t = H.totals();
    let ms = [...s.members];
    if (UI.memSearch) { const q = UI.memSearch.toLowerCase(); ms = ms.filter(m => m.name.toLowerCase().includes(q) || m.role.includes(q)); }
    const order = { chairperson: 0, secretary: 1, treasurer: 2, member: 3 };
    ms.sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
    return `<div class="page">
      ${mainHdr("Members", s.members.length + " active members")}
      ${H.role() === "secretary" && t.pendingRequests ? `<button class="banner amber" data-action="go" data-go="requests"><span class="warn-ico">${ic("warn")}</span><span class="grow">${t.pendingRequests} membership requests waiting</span><span class="link">Review &#8594;</span></button>` : ""}
      <div class="search-wrap">${ic("search")}<input class="input" id="mem-search" placeholder="Search members" value="${esc(UI.memSearch)}" data-input="mem-search"></div>
      <div class="list">${ms.map(m => `<button class="row" data-action="go" data-go="member/${m.id}">
        ${avatar(m, "sm")}
        <span class="body"><span class="t1">${esc(m.name)}</span><div style="margin-top:4px">${m.role === "member" ? pill("grey", "Member") : rolePill(m.role)}</div></span>
        <span class="right"><div class="amt white-t">${H.fmt(H.savingsOf(m.id))}</div><div class="t2">Joined ${H.dateShort(m.joined)}</div></span>
        ${ic("back", "chev")}
      </button>`).join("") || '<div class="empty">No members match your search.</div>'}</div>
      ${H.role() === "secretary" ? `<button class="btn tint sm" data-action="copy" data-copy="${esc(s.circle.joinCode)}">${ic("copy")} Invite member — copy joining code</button>` : ""}
    </div>${tabbar("members")}`;
  };

  V.requests = () => {
    const reqs = S().requests.filter(r => r.status === "pending");
    return `<div class="page">
      ${backHdr("Membership requests", reqs.length + " waiting for review", "members")}
      <div class="list">${reqs.map(r => `<div class="row" style="align-items:flex-start">
        <span class="avatar sm av-${(r.name.length + 2) % 6}">${esc(H.initials(r.name))}</span>
        <span class="body"><span class="t1">${esc(r.name)}</span><div class="t2">+256 ${esc(r.phone)} · applied ${H.dateShort(r.date)}</div>
          <div class="btn-row" style="margin-top:9px"><button class="btn primary sm" data-action="request-approve" data-id="${r.id}">Approve</button><button class="btn danger sm" data-action="request-reject" data-id="${r.id}">Decline</button></div>
        </span>
      </div>`).join("") || '<div class="empty">No pending requests. New applications appear here when people use your joining code.</div>'}</div>
      <div class="hint center">Approving adds the person to the member register immediately.</div>
    </div>${tabbar("members")}`;
  };

  function memberView(id) {
    const m = H.member(id); if (!m) return V.members();
    const s = S(); const savings = H.savingsOf(m.id); const loan = H.loanOf(m.id);
    const tx = s.transactions.filter(x => x.memberId === m.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    return `<div class="page">
      ${backHdr(m.name, "Member since " + H.date(m.joined), "members")}
      <div class="glass" style="display:flex;gap:14px;align-items:center">
        ${avatar(m, "lg")}
        <div style="flex:1"><div style="font-size:17px;font-weight:800">${esc(m.name)}</div><div class="hint" style="margin-top:3px">+256 ${esc(m.phone)}</div><div style="margin-top:7px">${m.role === "member" ? pill("grey", "Member") : rolePill(m.role)}</div></div>
      </div>
      <div class="grid2">
        <div class="card">${label("Total savings")}${money(savings, "green-t", "md")}</div>
        <div class="card">${label("Loan balance")}${money(loan, loan ? "red-t" : "green-t", "md")}</div>
      </div>
      ${H.role() === "secretary" && m.role !== "secretary" ? `<div class="field">${label("Role (secretary only)")}<select class="input" data-change="member-role" data-id="${m.id}">
        ${["member", "treasurer", "chairperson"].map(r => `<option value="${r}" ${m.role === r ? "selected" : ""}>${r[0].toUpperCase() + r.slice(1)}</option>`).join("")}
      </select></div>` : ""}
      ${H.isStaff() ? `<div class="btn-row"><button class="btn primary sm" data-action="go" data-go="record/contribution" data-member="${m.id}">${ic("coins")} Record contribution</button><button class="btn outline sm" data-action="go" data-go="record/repayment" data-member="${m.id}">${ic("wallet")} Repayment</button></div>` : ""}
      ${section("Recent activity")}
      <div class="list">${tx.map(x => txRow(x, true)).join("") || '<div class="empty">No activity yet.</div>'}</div>
    </div>${tabbar("members")}`;
  }

  /* ---------- meetings ---------- */
  V.meetings = () => {
    const s = S(); const next = H.nextMeeting();
    const past = s.meetings.filter(m => m.status === "past").sort((a, b) => b.date.localeCompare(a.date));
    const rate = H.attendanceRate();
    return `<div class="page">
      ${mainHdr("Meetings", s.circle.name)}
      ${next ? `<div class="glass">
        ${label("Next meeting")}
        <div class="money white-t" style="font-size:22px">${H.dateLong(next.date)}</div>
        <div class="hint" style="font-size:12.5px">${H.time(next.date)} · ${esc(next.venue)}</div>
        <div style="margin-top:9px">${pill("upcoming")}</div>
        <div class="hint" style="margin-top:9px">Agenda: ${esc(next.agenda.slice(0, 3).join(", ").toLowerCase())}.</div>
      </div>
      <button class="btn primary sm" data-action="go" data-go="meeting/${next.id}">View agenda &amp; details</button>` : `<div class="card"><div class="empty" style="padding:12px">No meeting scheduled yet.</div></div>`}
      ${section("Past meetings")}
      <div class="list">${past.map(m => {
        const vals = Object.values(m.attendance); const pr = vals.length ? Math.round(vals.filter(v => v === "present").length / vals.length * 100) : 0;
        return `<button class="row" data-action="go" data-go="meeting/${m.id}"><span class="ico n">${ic("meetings")}</span><span class="body"><span class="t1">${esc(m.title)}</span><div class="t2">${H.date(m.date)} · ${m.decisions.length} decision${m.decisions.length === 1 ? "" : "s"} recorded</div></span><span class="right"><div class="amt ${pr >= 75 ? "green-t" : "amber-t"}">${pr}%</div><div class="t2">attendance</div></span>${ic("back", "chev")}</button>`;
      }).join("")}</div>
      <div class="card">${label("Attendance this year")}<div class="money ${rate >= 75 ? "green-t" : "amber-t"}" style="font-size:18px">${rate}% average</div><div class="progress ${rate >= 75 ? "" : "amber"}"><i style="width:${rate}%"></i></div></div>
      ${H.role() === "secretary" || H.role() === "chairperson" ? `<button class="btn tint sm" data-action="go" data-go="meeting-new">${ic("plus")} Schedule meeting</button>` : ""}
    </div>${tabbar("meetings")}`;
  };

  function meetingView(id) {
    const m = S().meetings.find(x => x.id === id); if (!m) return V.meetings();
    const s = S(); const canMark = H.isStaff() && m.status === "upcoming";
    const vals = Object.values(m.attendance);
    const count = (v) => vals.filter(x => x === v).length;
    const quorum = Math.ceil(s.members.length * 2 / 3);
    return `<div class="page">
      <div class="hdr"><div class="hdr-left"><button class="back-btn" data-action="go" data-go="meetings">${ic("back")}</button><div><h1>${esc(m.title)}</h1><div class="sub">${H.dateShort(m.date)} · ${H.time(m.date)} · ${esc(m.venue)}</div></div></div>${pill(m.status)}</div>
      ${section("Agenda")}
      <div class="list">${m.agenda.map((a, i) => `<div class="row"><span class="ico n" style="font-weight:800;font-size:13px">${i + 1}</span><span class="body"><span class="t1">${esc(a)}</span></span></div>`).join("")}</div>
      ${m.status === "past" ? `${section("Attendance")}
      <div class="grid3">
        <div class="card" style="text-align:center"><div class="money green-t" style="font-size:20px">${count("present")}</div>${label("Present")}</div>
        <div class="card" style="text-align:center"><div class="money amber-t" style="font-size:20px">${count("apology")}</div>${label("Apology")}</div>
        <div class="card" style="text-align:center"><div class="money red-t" style="font-size:20px">${count("absent")}</div>${label("Absent")}</div>
      </div>` : ""}
      ${canMark ? `${section("Mark attendance", `<span class="hint" style="margin:0">${count("present")} / ${quorum} quorum</span>`)}
      <div class="list">${s.members.map(mb => `<div class="row">${avatar(mb, "sm")}<span class="body"><span class="t1">${esc(mb.name)}</span></span>
        <span style="display:flex;gap:5px;flex:none;width:172px">${["present", "apology", "absent"].map(v => `<button class="att-btn ${v} ${m.attendance[mb.id] === v ? "on" : ""}" data-action="attendance" data-meeting="${m.id}" data-member="${mb.id}" data-val="${v}">${v === "present" ? "Here" : v === "apology" ? "Sorry" : "Away"}</button>`).join("")}</span>
      </div>`).join("")}</div>` : ""}
      ${m.decisions.length ? `${section("Decisions")}
      <div class="list">${m.decisions.map(d => `<div class="row"><span class="ico ${d.result === "passed" ? "g" : "n"}">${ic("check")}</span><span class="body"><span class="t1">${esc(d.text)}</span><div class="t2">${esc(d.detail)}</div></span>${pill(d.result)}</div>`).join("")}</div>` : ""}
      <div class="hint center">Quorum: ${quorum} of ${s.members.length} members (two-thirds) required.</div>
      ${H.isStaff() ? `<button class="btn outline sm" data-action="decision-sheet" data-id="${m.id}">${ic("gavel")} Record a decision</button>` : ""}
    </div>${tabbar("meetings")}`;
  }

  V["meeting-new"] = () => `<div class="page">
    ${backHdr("Schedule meeting", "Members are notified immediately", "meetings")}
    <form data-form="meeting-new" style="display:flex;flex-direction:column;gap:14px">
      <div class="field">${label("Title")}<input class="input" name="title" placeholder="December meeting" required></div>
      <div class="grid2">
        <div class="field">${label("Date")}<input class="input" name="date" type="date" required min="${new Date().toISOString().slice(0, 10)}" value="${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}"></div>
        <div class="field">${label("Time")}<input class="input" name="time" type="time" required value="14:00"></div>
      </div>
      <div class="field">${label("Venue")}<input class="input" name="venue" placeholder="Community Hall, Kampala" required></div>
      <div class="field">${label("Agenda (one item per line)")}<textarea class="input" name="agenda" placeholder="Review minutes&#10;Contributions&#10;Loan votes" required></textarea></div>
      <div class="form-error" id="form-error" hidden></div>
      <button class="btn primary" type="submit">Schedule meeting</button>
    </form>
  </div>${tabbar("meetings")}`;

  /* ---------- verification queue ---------- */
  V.queue = () => {
    const s = S();
    const q = s.transactions.filter(t => t.status === "pending" || t.status === "queried").sort((a, b) => a.date.localeCompare(b.date));
    const canVerify = H.role() === "treasurer" || H.role() === "secretary";
    return `<div class="page">
      ${backHdr("Verification queue", "Recorded by the secretary", H.role() === "treasurer" ? "home" : "finance")}
      <div class="glass green">${label("Waiting for confirmation")}<div class="money big white-t">${q.length} waiting</div><div class="hint">Verify against cash, mobile money and bank receipts.</div></div>
      <div class="list">${q.map(t => { const m = t.memberId ? H.member(t.memberId) : null; const meta = TX_META[t.type];
        return `<div class="row" style="align-items:flex-start">
          <span class="ico ${t.status === "queried" ? "a" : meta.cls}">${ic(meta.icon)}</span>
          <span class="body"><span class="t1">${esc(meta.name)}${m ? " — " + esc(m.name) : ""}</span>
            <div class="t2">${H.dateShort(t.date)} · ${esc(t.method)}${t.note ? " · " + esc(t.note) : ""}</div>
            <div class="amt ${t.status === "queried" ? "amber-t" : "green-t"}" style="margin-top:4px">${H.fmt(t.amount)}</div>
            ${t.status === "queried" ? `<div style="margin-top:5px">${pill("queried", "Queried — check receipt")}</div>` : ""}
            ${canVerify ? `<div class="btn-row" style="margin-top:9px"><button class="btn primary sm" data-action="verify-tx" data-id="${t.id}">Verify</button>${t.status !== "queried" ? `<button class="btn amberline sm" data-action="query-tx" data-id="${t.id}">Query</button>` : ""}</div>` : `<div class="hint">Only the treasurer can verify.</div>`}
          </span>
        </div>`; }).join("") || '<div class="empty">Queue is clear — every recorded payment has been verified.</div>'}</div>
    </div>${tabbar("finance")}`;
  };

  /* ---------- record forms ---------- */
  function recordView(type) {
    const s = S();
    const cfg = {
      contribution: { title: "Record contribution", sub: "Goes to the treasurer for verification", member: true, note: "e.g. Received at meeting" },
      repayment: { title: "Record repayment", sub: "Reduces the member's loan after verification", member: true, note: "e.g. Cash, slip #0452" },
      expense: { title: "Record expense", sub: "Money paid out by the circle", member: false, note: "" },
      withdrawal: { title: "Record withdrawal", sub: "Move between bank, mobile money and cash", member: false, note: "" },
    }[type];
    if (!cfg) return V.finance();
    const pre = UI.recordMember || "";
    const withLoans = s.members.filter(m => H.loanOf(m.id) > 0);
    return `<div class="page">
      ${backHdr(cfg.title, cfg.sub, "home")}
      <form data-form="record" data-type="${type}" style="display:flex;flex-direction:column;gap:14px">
        ${cfg.member ? `<div class="field">${label("Member")}<select class="input" name="memberId" required>
          <option value="">Choose member…</option>
          ${(type === "repayment" ? withLoans : s.members).map(m => `<option value="${m.id}" ${pre === m.id ? "selected" : ""}>${esc(m.name)}${type === "repayment" ? " — owes " + H.fmt(H.loanOf(m.id)) : ""}</option>`).join("")}
        </select></div>` : ""}
        ${type === "expense" ? `<div class="field">${label("What was it for?")}<input class="input" name="purpose" placeholder="e.g. Hall hire, stationery" required></div>` : ""}
        ${type === "withdrawal" ? `<div class="field">${label("Reason")}<input class="input" name="purpose" placeholder="e.g. Bank to cash for meeting day" required></div>` : ""}
        <div class="field">${label("Amount (UGX)")}<input class="input" name="amount" inputmode="numeric" placeholder="50,000" required style="font-size:18px;font-weight:700"></div>
        <div class="field">${label("Method")}<input type="hidden" name="method" value="Cash"><div class="seg" data-seg="method">${["Cash", "Mobile money", "Bank"].map((m, i) => `<button type="button" data-action="seg-pick" data-val="${m}" class="${i === 0 ? "on" : ""}">${m}</button>`).join("")}</div></div>
        <div class="field">${label("Note (optional)")}<input class="input" name="note" placeholder="${esc(cfg.note)}"></div>
        <div class="form-error" id="form-error" hidden></div>
        <button class="btn primary" type="submit">Record ${type}</button>
        <div class="hint center">${type === "contribution" || type === "repayment" ? `Saved as ${pill("pending")} until the treasurer verifies it.` : `Saved as ${pill(type === "expense" ? "paid" : "recorded")} and added to the audit history.`}</div>
      </form>
    </div>${tabbar(type === "contribution" || type === "repayment" ? "home" : "finance")}`;
  }

  V["register-member"] = () => `<div class="page">
    ${backHdr("Register member", "Adds directly to the register with a login", "members")}
    <form data-form="register-member" style="display:flex;flex-direction:column;gap:14px">
      <div class="field">${label("Full name")}<input class="input" name="name" placeholder="e.g. Janet B." required minlength="3"></div>
      <div class="field">${label("Username (optional)")}<input class="input" name="username" placeholder="e.g. janet.b"></div>
      <div class="field">${label("Phone number")}<div class="phone-input"><span class="cc">+256</span><input name="phone" placeholder="701 234 567" inputmode="tel" required></div></div>
      <div class="field">${label("Set their password")}<div class="input-wrap"><input class="input" name="password" type="password" placeholder="At least 8 characters" required minlength="8" autocomplete="new-password"><button type="button" class="eye" data-action="toggle-pw">${ic("eye")}</button></div><div class="hint">Share this with the member so they can log in.</div></div>
      <div class="field">${label("Confirm password")}<div class="input-wrap"><input class="input" name="confirm" type="password" placeholder="Repeat password" required minlength="8" autocomplete="new-password"><button type="button" class="eye" data-action="toggle-pw">${ic("eye")}</button></div></div>
      <div class="form-error" id="form-error" hidden></div>
      <button class="btn primary" type="submit">Register member</button>
      <div class="hint center">Or share the joining code <strong>${esc(S().circle.joinCode)}</strong> and approve requests from the Members tab.</div>
    </form>
  </div>${tabbar("members")}`;

  /* ---------- reconcile ---------- */
  V.reconcile = () => {
    const by = H.methodTotals(); const r = S().reconciliation;
    return `<div class="page">
      ${backHdr("Reconcile", "Compare system totals with what you counted", "home")}
      <div class="hint" style="margin-top:-4px">${r.lastDate ? "Last reconciled " + H.date(r.lastDate) : "Never reconciled — count the money and record it below."}</div>
      <form data-form="reconcile" style="display:flex;flex-direction:column;gap:14px">
        ${[["cash", "Cash", "Cash box"], ["mobile", "Mobile money", "MoMo balance"], ["bank", "Bank", "Bank account"]].map(([k, name, sub]) => `<div class="card">
          <div class="kv" style="padding:0 0 8px"><span class="k">${name} — system</span><span class="v green-t">${H.fmt(Math.max(0, by[name]))}</span></div>
          <div class="field">${label("Counted " + sub)}<input class="input" name="${k}" inputmode="numeric" value="${(r[k] || Math.max(0, by[name])).toLocaleString("en-US")}" required></div>
        </div>`).join("")}
        <button class="btn primary" type="submit">Save reconciliation</button>
        <div class="hint center">Differences are flagged to the secretary and kept in the audit history.</div>
      </form>
    </div>${tabbar("finance")}`;
  };

  /* ---------- reports ---------- */
  function reportRows() {
    const mo = new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    return [["savings", "Savings report", `CSV · ${mo} · all members`, "g"],
      ["loans", "Loan report", `CSV · ${mo} · principal, interest & balances`, "b"],
      ["members", "Members report", `CSV · ${mo} · roles & status`, "n"],
      ["attendance", "Meeting attendance", `CSV · ${mo} · per member`, "a"],
      ["ledger", "Full financial ledger", `CSV · every transaction`, "n"]]
      .map(([k, n, sub, c]) => `<div class="row"><span class="ico ${c}">${ic("download")}</span><span class="body"><span class="t1">${n}</span><div class="t2">${sub}</div></span><button class="see-all" data-action="download" data-report="${k}">Download</button></div>`).join("");
  }
  V.reports = () => {
    const t = H.totals();
    const interest = S().loans.reduce((a, l) => a + H.loanInterest(l), 0);
    return `<div class="page">
      ${mainHdr("Reports", S().circle.name)}
      <div class="glass">${label("This month's summary")}
        <div class="grid2" style="margin-top:8px">
          <div>${label("Total savings")}${money(t.moneyIn, "green-t", "md")}</div>
          <div>${label("Loan recovery")}<div class="money white-t" style="font-size:17px">${H.recoveryRate()}%</div></div>
        </div>
        <div class="kv" style="margin-top:10px;padding-bottom:0"><span class="k">Loan interest charged</span><span class="v">${H.fmt(interest)}</span></div>
      </div>
      ${section("Available reports")}
      <div class="list">${reportRows()}</div>
      <button class="btn outline sm" data-action="share-summary">${ic("copy")} Copy summary for members</button>
      <div class="hint center">Reports are read-only and stamped with the circle ID and generation date.</div>
    </div>${tabbar(H.isStaff() ? "more" : "home")}`;
  };

  /* ---------- governance ---------- */
  V.proposals = () => {
    const s = S(); const u = H.user();
    return `<div class="page">
      ${backHdr("Voting & proposals", "One member, one vote", "home")}
      ${s.proposals.map(p => {
        const total = p.yes.length + p.no.length; const yesPct = total ? Math.round(p.yes.length / total * 100) : 0;
        const voted = p.yes.includes(u.id) ? "yes" : p.no.includes(u.id) ? "no" : null;
        return `<div class="card">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div style="font-size:13.5px;font-weight:700;line-height:1.4;flex:1">${esc(p.title)}</div>${pill(p.status)}</div>
          <div class="vote-bar"><span class="yes" style="width:${yesPct}%"></span><span class="no" style="width:${100 - yesPct}%"></span></div>
          <div class="kv" style="padding-bottom:0"><span class="hint" style="margin:0"><span class="green-t">${p.yes.length} yes</span> · <span class="red-t">${p.no.length} no</span> of ${s.members.length} members</span><span class="hint" style="margin:0">${p.status === "open" ? "closes " + H.dateShort(p.closes) : "closed " + H.dateShort(p.closes)}</span></div>
          ${p.status === "open" ? `<div class="btn-row" style="margin-top:10px">
            <button class="btn ${voted === "yes" ? "primary" : "tint"} sm" data-action="vote" data-id="${p.id}" data-val="yes">${voted === "yes" ? "✓ Voted yes" : "Vote yes"}</button>
            <button class="btn ${voted === "no" ? "danger" : "outline"} sm" data-action="vote" data-id="${p.id}" data-val="no">${voted === "no" ? "✓ Voted no" : "Vote no"}</button>
          </div>${H.role() === "chairperson" ? `<button class="btn ghost" style="padding:8px" data-action="close-proposal" data-id="${p.id}">Close vote &amp; record result</button>` : ""}` : `<div class="hint">Result: ${p.yes.length > p.no.length ? "passed" : "not passed"} (${p.yes.length} / ${total}).</div>`}
        </div>`;
      }).join("")}
      ${H.role() === "chairperson" ? `<button class="btn primary" data-action="proposal-sheet">${ic("plus")} New proposal</button>` : ""}
    </div>${tabbar("home")}`;
  };

  V.constitution = () => `<div class="page">
    ${backHdr("Circle constitution", S().circle.name, "home")}
    ${[["1 · Membership", "Open to adults introduced by a member. Joining requires the circle code and secretary approval. Every member saves the agreed monthly amount."],
      ["2 · Contributions", `Each member contributes ${H.fmt(S().circle.expectedMonthly)} monthly, due before the meeting. Partial payments are recorded honestly as PARTIAL; waivers need a circle vote.`],
      ["3 · Loans", "Members may borrow up to 3× their savings. Loans are voted on at a meeting and approved by the chairperson. The secretary then sets the repayment date and any interest — interest is optional and is calculated by the system. Overdue loans are flagged to everyone."],
      ["4 · Roles", "The secretary records and sets each approved loan's repayment plan. The treasurer verifies every payment against receipts. The chairperson approves loans and closes votes. Elections are held every two years."],
      ["5 · Meetings", "Monthly, with a quorum of two-thirds. Attendance and every decision are recorded. Minutes are shared before the next meeting."],
      ["6 · Records", "Every change is kept in the audit history. No record is silently deleted — corrections are proposed, voted, and logged."]]
      .map(([t, b]) => `<div class="card"><div style="font-weight:700;font-size:13.5px;margin-bottom:6px">${esc(t)}</div><div class="hint" style="margin:0">${esc(b)}</div></div>`).join("")}
  </div>${tabbar("home")}`;

  V.decisions = () => {
    const all = S().meetings.filter(m => m.decisions.length).sort((a, b) => b.date.localeCompare(a.date));
    return `<div class="page">
      ${backHdr("Meeting decisions", "Every vote, on the record", "home")}
      ${all.map(m => `${section(m.title + " · " + H.dateShort(m.date))}
      <div class="list">${m.decisions.map(d => `<div class="row"><span class="ico ${d.result === "passed" ? "g" : "n"}">${ic("check")}</span><span class="body"><span class="t1">${esc(d.text)}</span><div class="t2">${esc(d.detail)}</div></span>${pill(d.result)}</div>`).join("")}</div>`).join("") || '<div class="empty">No decisions recorded yet.</div>'}
    </div>${tabbar("home")}`;
  };

  V.audit = () => `<div class="page">
    ${backHdr("Audit history", "Every change · who & when", "home")}
    <div class="list">${S().audit.slice(0, 60).map(a => `<div class="row"><span class="ico n">${ic("history")}</span><span class="body"><span class="t1" style="font-weight:600;font-size:12.5px">${esc(a.text)}</span><div class="t2">${H.date(a.date)} · ${H.time(a.date)}</div></span></div>`).join("")}</div>
    <button class="btn tint sm" data-action="download" data-report="audit">${ic("download")} Download audit log</button>
  </div>${tabbar(H.isStaff() ? "more" : "home")}`;

  /* ---------- notifications & more ---------- */
  V.notifications = () => {
    const ns = H.notices();
    return `<div class="page">
      ${backHdr("Notifications", ns.filter(n => !n.read).length + " unread", "home")}
      ${ns.some(n => !n.read) ? `<button class="btn tint sm" data-action="read-all">Mark all as read</button>` : ""}
      <div class="list">${ns.map(n => `<div class="row ${n.read ? "" : "notif-unread"}"><span class="ico ${n.read ? "n" : "g"}">${ic("bell")}</span><span class="body"><span class="t1" style="font-weight:600;font-size:12.5px;line-height:1.4">${esc(n.text)}</span><div class="t2">${H.date(n.date)}</div></span></div>`).join("") || '<div class="empty">No notifications yet.</div>'}</div>
    </div>${tabbar("")}`;
  };

  V.more = () => {
    const s = S(); const u = H.user();
    return `<div class="page">
      ${mainHdr("More", "")}
      <div class="glass" style="display:flex;gap:13px;align-items:center">
        ${avatar(u, "lg")}
        <div style="flex:1"><div style="font-size:16px;font-weight:800">${esc(u.name)}</div><div class="hint" style="margin-top:2px">+256 ${esc(u.phone)}</div><div style="margin-top:6px">${rolePill(u.role)}</div></div>
      </div>
      ${section("Circle")}
      <div class="list">
        <button class="row" data-action="circle-settings"><span class="ico n">${ic("finance")}</span><span class="body"><span class="t1">Circle settings</span><div class="t2">Name, category, contribution rules</div></span>${ic("back", "chev")}</button>
        <button class="row" data-action="copy" data-copy="${esc(s.circle.joinCode)}"><span class="ico n">${ic("copy")}</span><span class="body"><span class="t1">Joining code</span><div class="t2">${esc(s.circle.joinCode)} · tap to copy</div></span>${ic("back", "chev")}</button>
        <button class="row" data-action="go" data-go="constitution"><span class="ico n">${ic("book")}</span><span class="body"><span class="t1">Circle constitution</span><div class="t2">Rules &amp; governance</div></span>${ic("back", "chev")}</button>
        <button class="row" data-action="go" data-go="circles"><span class="ico n">${ic("swap")}</span><span class="body"><span class="t1">My circle</span><div class="t2">${esc(s.circle.name)} · ${esc(u.role[0].toUpperCase() + u.role.slice(1))}</div></span>${ic("back", "chev")}</button>
      </div>
      ${section("App")}
      <div class="list">
        <button class="row" data-action="go" data-go="loans"><span class="ico n">${ic("coins")}</span><span class="body"><span class="t1">Loans</span><div class="t2">Loan book &amp; applications</div></span>${ic("back", "chev")}</button>
        <button class="row" data-action="go" data-go="notifications"><span class="ico n">${ic("bell")}</span><span class="body"><span class="t1">Notifications</span></span>${ic("back", "chev")}</button>
        <button class="row" data-action="go" data-go="reports"><span class="ico n">${ic("chart")}</span><span class="body"><span class="t1">Reports</span></span>${ic("back", "chev")}</button>
        <button class="row" data-action="go" data-go="audit"><span class="ico n">${ic("history")}</span><span class="body"><span class="t1">Audit history</span></span>${ic("back", "chev")}</button>
        <button class="row" data-action="go" data-go="privacy"><span class="ico n">${ic("shield")}</span><span class="body"><span class="t1">Privacy &amp; terms</span></span>${ic("back", "chev")}</button>
      </div>
      ${section("Account")}
      <div class="hint" style="margin-top:-6px">You're logged in as ${esc(u.name)} (${esc(u.role)}). Each role sees only its own tools.</div>
      <div class="spacer"></div>
      <button class="btn danger sm" data-action="logout">Log out</button>
      <div class="hint center">SaccoPro v3.0.0 · Save · Grow · Prosper</div>
      <div class="hint center" style="margin-top:2px">${cloudStatusLine()}</div>
    </div>${tabbar("more")}`;
  };

  /* ---------- sheets ---------- */
  function openSheet(html) {
    $("#sheet-root").innerHTML = `<div class="sheet-scrim" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  }
  function closeSheet() { $("#sheet-root").innerHTML = ""; }

  function txSheet(id) {
    const t = S().transactions.find(x => x.id === id); if (!t) return;
    const m = t.memberId ? H.member(t.memberId) : null; const meta = TX_META[t.type];
    const rec = t.recordedBy ? H.member(t.recordedBy) : null;
    openSheet(`<h3>${esc(meta.name)}</h3>
      <div class="glass">${label("Amount")}${money(t.amount, t.status === "overdue" ? "red-t" : "white-t", "big")}<div style="margin-top:8px">${pill(t.status)}</div></div>
      <div>
        ${m ? `<div class="kv"><span class="k">Member</span><span class="v">${esc(m.name)}</span></div>` : ""}
        <div class="kv"><span class="k">Method</span><span class="v">${esc(t.method)}</span></div>
        <div class="kv"><span class="k">Date</span><span class="v">${H.date(t.date)}</span></div>
        ${rec ? `<div class="kv"><span class="k">Recorded by</span><span class="v">${esc(rec.name)}</span></div>` : ""}
        ${t.note ? `<div class="kv"><span class="k">Note</span><span class="v" style="font-weight:600;text-align:right;max-width:60%">${esc(t.note)}</span></div>` : ""}
      </div>
      ${t.status === "pending" && H.role() === "treasurer" ? `<button class="btn primary" data-action="verify-tx" data-id="${t.id}">Verify payment</button>` : ""}
      ${t.status === "pending" && H.role() === "secretary" ? `<button class="btn danger" data-action="delete-tx" data-id="${t.id}">Delete record</button>` : ""}
      <button class="btn outline sm" data-action="close-sheet">Close</button>`);
  }

  function loanSheet(id) {
    const l = S().loans.find(x => x.id === id); if (!l) return;
    const m = H.member(l.memberId);
    const canApprove = H.role() === "chairperson" && l.status === "pending";
    const canPlan = H.role() === "secretary" && l.status === "approved";
    const int = H.loanInterest(l);
    const total = H.loanTotal(l);
    const dueVal = l.due ? new Date(l.due).toISOString().slice(0, 10) : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    openSheet(`<h3>Loan — ${esc(m.name)}</h3>
      <div class="glass">${label(l.status === "cleared" ? "Amount (repaid)" : "Balance")}${money(l.status === "cleared" ? total : l.balance, l.status === "overdue" ? "red-t" : "white-t", "big")}<div style="margin-top:8px">${pill(l.status)}</div></div>
      <div>
        <div class="kv"><span class="k">Purpose</span><span class="v">${esc(l.purpose)}</span></div>
        <div class="kv"><span class="k">Principal</span><span class="v">${H.fmt(l.amount)}</span></div>
        <div class="kv"><span class="k">Interest${l.interestRate != null ? " (" + l.interestRate + "%)" : ""}</span><span class="v">${int ? H.fmt(int) : '<span class="grey-t">None</span>'}</span></div>
        ${int ? `<div class="kv"><span class="k">Total repayable</span><span class="v white-t">${H.fmt(total)}</span></div>` : ""}
        <div class="kv"><span class="k">Applied</span><span class="v">${H.date(l.applied)}</span></div>
        ${l.due ? `<div class="kv"><span class="k">Due</span><span class="v ${l.status === "overdue" ? "red-t" : ""}">${H.date(l.due)}</span></div>` : ""}
        <div class="kv"><span class="k">Member savings</span><span class="v">${H.fmt(H.savingsOf(m.id))}</span></div>
      </div>
      ${canApprove ? `<div class="hint">The circle votes at the meeting; as chairperson you record the outcome. The secretary then sets the repayment date and any interest.</div>
      <div class="btn-row"><button class="btn primary" data-action="loan-approve" data-id="${l.id}">Approve</button><button class="btn danger" data-action="loan-reject" data-id="${l.id}">Reject</button></div>` : ""}
      ${canPlan ? `<form data-form="loan-finalize" data-id="${l.id}" style="display:flex;flex-direction:column;gap:12px;margin-top:4px">
        <div class="hint" style="margin:0">Approved by the chairperson. Set when it must be repaid and any interest — the interest amount is worked out for you.</div>
        <div class="field">${label("Repay by")}<input class="input" name="due" type="date" required value="${dueVal}"></div>
        <div class="field">${label("Interest (%) — leave blank or 0 for none")}<input class="input" name="rate" inputmode="decimal" placeholder="e.g. 10" value="${l.interestRate != null ? l.interestRate : ""}"></div>
        <div class="form-error" id="form-error" hidden></div>
        <button class="btn primary" type="submit">Confirm repayment plan</button>
      </form>` : ""}
      ${l.status === "approved" && !canPlan ? `<div class="hint center">Approved by the chairperson — waiting for the secretary to set the repayment date and interest.</div>` : ""}
      ${l.status === "active" || l.status === "overdue" || l.status === "approved" ? `<button class="btn tint" data-action="go" data-go="record/repayment" data-member="${m.id}">${ic("wallet")} Record repayment</button>` : ""}
      ${l.status === "pending" && !canApprove ? `<div class="hint center">Waiting for the chairperson after the circle vote.</div>` : ""}
      <button class="btn outline sm" data-action="close-sheet">Close</button>`);
  }

  /* ---------- toast ---------- */
  function toast(msg, opts) {
    opts = opts || {};
    const el = document.createElement("div");
    el.className = "toast " + (opts.type || "success");
    el.innerHTML = `<span class="t-ico">${ic(opts.type === "error" ? "x" : opts.type === "warn" ? "warn" : "check")}</span><span class="grow">${esc(msg)}</span>${opts.undo ? '<button class="undo">Undo</button>' : ""}`;
    $("#toast-root").appendChild(el);
    let done = false;
    const dismiss = () => { if (done) return; done = true; el.classList.add("out"); setTimeout(() => el.remove(), 260); };
    if (opts.undo) $(".undo", el).addEventListener("click", () => { opts.undo(); dismiss(); render(); });
    setTimeout(dismiss, opts.undo ? 6000 : 3200);
  }

  /* ---------- router ---------- */
  const AUTH_ROUTES = ["welcome", "login", "join", "create", "privacy"];
  function route() { return (location.hash.replace(/^#\/?/, "") || "welcome").split("?")[0]; }
  function go(r) { location.hash = "#/" + r; }
  /* A repaint must never throw away what the user has typed — a cloud pull
     can land at any moment, including mid sign-up. */
  const fieldKey = (el) => el.name + (/^(checkbox|radio)$/.test(el.type) ? ":" + el.value : "");
  function captureFields() {
    const map = {};
    document.querySelectorAll("#app input[name], #app select[name], #app textarea[name]").forEach((el) => { map[fieldKey(el)] = el.type === "checkbox" || el.type === "radio" ? el.checked : el.value; });
    return map;
  }
  function restoreFields(map) {
    document.querySelectorAll("#app input[name], #app select[name], #app textarea[name]").forEach((el) => {
      const k = fieldKey(el);
      if (!(k in map) || el.type === "file") return;
      if (el.type === "checkbox" || el.type === "radio") el.checked = map[k];
      else el.value = map[k];
    });
  }
  let lastSig = null;
  const stateSig = () => { try { return JSON.stringify(Store.state) + "|" + (window.Cloud ? Cloud.status : ""); } catch (e) { return null; } };
  function render() {
    const from = route();
    const y = window.scrollY;
    const fields = captureFields();
    let r = route();
    let logged = !!Store.state.session;
    // the signed-in SACCO may have been removed by the developer admin
    if (logged && !Store.state.saccos.some(s => s.id === Store.state.session.saccoId)) {
      Store.state.session = null; Store.activeSaccoId = null; Store.save(); logged = false;
    }
    Store.activeSaccoId = logged ? Store.state.session.saccoId : null;
    if (!logged && !AUTH_ROUTES.includes(r)) r = "welcome";
    if (logged && ["welcome", "login"].includes(r)) r = "home";
    let html;
    if (r.startsWith("member/")) html = memberView(r.slice(7));
    else if (r.startsWith("meeting/")) html = meetingView(r.slice(8));
    else if (r.startsWith("record/")) html = recordView(r.slice(7));
    else html = (V[r] || V.welcome)();
    $("#app").innerHTML = html;
    if (route() !== from) closeSheet();
    if (route() === from) { restoreFields(fields); if (y) window.scrollTo(0, y); }
    else window.scrollTo(0, 0);
    lastSig = stateSig();
  }

  /* ---------- csv reports ---------- */
  function csvDownload(name, rows) {
    const csv = rows.map(r => r.map(c => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const stamp = `${S().circle.id} · generated ${H.date(new Date().toISOString())}`;
    const blob = new Blob([stamp + "\r\n\r\n" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function downloadReport(kind) {
    const s = S();
    if (kind === "savings" || kind === "passbook") {
      const ms = kind === "passbook" ? [H.user()] : s.members;
      const rows = [["Member", "Total savings (UGX)", "Loan balance (UGX)"]];
      ms.forEach(m => rows.push([m.name, H.savingsOf(m.id), H.loanOf(m.id)]));
      csvDownload(`circle-${kind}-report.csv`, rows);
    } else if (kind === "loans") {
      const rows = [["Member", "Purpose", "Principal (UGX)", "Interest rate (%)", "Interest (UGX)", "Total (UGX)", "Balance (UGX)", "Status", "Due"]];
      s.loans.forEach(l => rows.push([H.member(l.memberId).name, l.purpose, l.amount, l.interestRate != null ? l.interestRate : 0, H.loanInterest(l), H.loanTotal(l), l.balance, l.status, l.due ? H.date(l.due) : ""]));
      const sum = (f) => s.loans.reduce((a, l) => a + f(l), 0);
      rows.push(["TOTAL", "", sum(l => l.amount), "", sum(l => H.loanInterest(l)), sum(l => H.loanTotal(l)), sum(l => l.balance), "", ""]);
      csvDownload("circle-loan-report.csv", rows);
    } else if (kind === "members") {
      const rows = [["Name", "Phone", "Role", "Joined", "Savings (UGX)"]];
      s.members.forEach(m => rows.push([m.name, "+256" + m.phone, m.role, H.date(m.joined), H.savingsOf(m.id)]));
      csvDownload("circle-members-report.csv", rows);
    } else if (kind === "attendance") {
      const past = s.meetings.filter(m => m.status === "past");
      const rows = [["Member", ...past.map(m => m.title)]];
      s.members.forEach(m => rows.push([m.name, ...past.map(mt => mt.attendance[m.id] || "—")]));
      csvDownload("circle-attendance-report.csv", rows);
    } else if (kind === "audit") {
      csvDownload("circle-audit-log.csv", [["Date", "Event"], ...s.audit.map(a => [H.date(a.date) + " " + H.time(a.date), a.text])]);
    } else {
      const rows = [["Date", "Type", "Member", "Amount (UGX)", "Method", "Status", "Note"]];
      [...s.transactions].sort((a, b) => b.date.localeCompare(a.date)).forEach(t => rows.push([H.date(t.date), TX_META[t.type].name, t.memberId ? H.member(t.memberId).name : "Circle", t.amount, t.method, t.status, t.note || ""]));
      csvDownload("circle-financial-ledger.csv", rows);
    }
    toast("Report downloaded");
  }

  /* ---------- actions ---------- */
  const num = (v) => Number(String(v || "").replace(/[^\d]/g, "")) || 0;
  function formError(msg) {
    const el = $("#form-error");
    if (el) { el.textContent = msg; el.hidden = false; el.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  }

  const actions = {
    go: (el) => { UI.recordMember = el.dataset.member || null; closeSheet(); go(el.dataset.go); },
    "close-sheet": () => closeSheet(),
    "toggle-pw": (el) => { const inp = $("input", el.parentElement); inp.type = inp.type === "password" ? "text" : "password"; },
    "login-role": (el) => { UI.loginRole = el.dataset.role; render(); },
    "seg-pick": (el) => {
      const seg = el.closest(".seg"); $$("button", seg).forEach(b => b.classList.toggle("on", b === el));
      const hidden = seg.parentElement.querySelector('input[type="hidden"]'); if (hidden) hidden.value = el.dataset.val;
    },
    "chart-range": (el) => { UI.chartRange = Number(el.dataset.n); render(); },
    "fin-filter": (el) => { UI.finFilter = el.dataset.k; render(); },
    "loan-filter": (el) => { UI.loanFilter = el.dataset.k; render(); },
    "tx-detail": (el) => txSheet(el.dataset.id),
    "loan-detail": (el) => loanSheet(el.dataset.id),
    "loan-record": () => {
      if (H.role() !== "secretary") return;
      const s = S();
      const today = new Date().toISOString().slice(0, 10);
      const later = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      openSheet(`<h3>Record a loan given out</h3>
        <div class="hint">Use this when the circle has already agreed a loan and the money has been handed out. It is added to the loan book straight away.</div>
        <form data-form="loan-record" style="display:flex;flex-direction:column;gap:12px">
          <div class="field">${label("Taken by")}<select class="input" name="memberId" required>${s.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></div>
          <div class="field">${label("Amount given (UGX)")}<input class="input" name="amount" inputmode="numeric" placeholder="e.g. 200,000" required style="font-size:18px;font-weight:700"></div>
          <div class="field">${label("Purpose")}<input class="input" name="purpose" placeholder="e.g. School fees, business stock" required minlength="3"></div>
          <div class="field">${label("Date given")}<input class="input" name="taken" type="date" required max="${today}" value="${today}"></div>
          <div class="field">${label("How it was paid out")}<select class="input" name="method"><option>Cash</option><option>Mobile money</option><option>Bank</option></select></div>
          <div class="field">${label("Repay by")}<input class="input" name="due" type="date" required value="${later}"></div>
          <div class="field">${label("Interest (%) — leave blank or 0 for none")}<input class="input" name="rate" inputmode="decimal" placeholder="e.g. 10"></div>
          <div class="hint" style="margin:0">The interest amount and total repayable are worked out from the rate and shown on the loan.</div>
          <div class="form-error" id="form-error" hidden></div>
          <button class="btn primary" type="submit">Save loan</button>
        </form>`);
    },
    copy: (el) => {
      const text = el.dataset.copy;
      const done = () => toast("Copied: " + text);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      else fallbackCopy(text, done);
    },
    logout: () => { Store.state.session = null; Store.activeSaccoId = null; Store.save(); UI.joinFound = false; UI.joinCode = ""; UI.joinSacco = null; go("welcome"); },
    "circle-settings": () => {
      const c = S(); const canEdit = H.role() === "secretary";
      openSheet(`<h3>Circle settings</h3>
        ${canEdit ? `<form data-form="circle-settings" style="display:flex;flex-direction:column;gap:12px">
          <div class="field">${label("Circle name")}<input class="input" name="name" value="${esc(c.circle.name)}" required></div>
          <div class="field">${label("Monthly contribution (UGX)")}<input class="input" name="expected" inputmode="numeric" value="${c.circle.expectedMonthly.toLocaleString("en-US")}" required></div>
          <div class="kv"><span class="k">Circle ID</span><span class="v code-chip">${esc(c.circle.id)}</span></div>
          <button class="btn primary" type="submit">Save settings</button>
        </form>` : `<div class="kv"><span class="k">Name</span><span class="v">${esc(c.circle.name)}</span></div>
        <div class="kv"><span class="k">Category</span><span class="v">${esc(c.circle.category)}</span></div>
        <div class="kv"><span class="k">Monthly contribution</span><span class="v">${H.fmt(c.circle.expectedMonthly)}</span></div>
        <div class="hint">Only the secretary can edit circle settings.</div>`}
        <button class="btn outline sm" data-action="close-sheet">Close</button>`);
    },
    "verify-tx": (el) => {
      const t = S().transactions.find(x => x.id === el.dataset.id); if (!t) return;
      const verifier = H.user();
      const when = new Date().toISOString();
      t.status = "paid"; t.verifiedBy = verifier ? verifier.id : null; t.verifiedAt = when;
      if (!Array.isArray(S().verifications)) S().verifications = [];
      S().verifications.unshift({ id: Store.uid(), transactionId: t.id, memberId: t.memberId || null, status: "paid", verifiedBy: verifier ? verifier.id : null, note: TX_META[t.type].name + " " + H.fmt(t.amount), date: when });
      if (t.type === "repayment" && t.memberId) {
        const loan = S().loans.find(l => l.memberId === t.memberId && (l.status === "active" || l.status === "overdue" || l.status === "approved"));
        if (loan) { loan.balance = Math.max(0, loan.balance - t.amount); if (loan.balance === 0) { loan.status = "cleared"; } else if (loan.status === "overdue" && new Date(loan.due) > new Date()) loan.status = "active"; }
      }
      Store.save();
      const m = t.memberId ? H.member(t.memberId) : null;
      H.audit(`${H.user().name} verified ${TX_META[t.type].name.toLowerCase()}${m ? " — " + m.name : ""}, ${H.fmt(t.amount)}`);
      H.notify(`Verified: ${TX_META[t.type].name} ${H.fmt(t.amount)}${m ? " — " + m.name : ""}.`);
      closeSheet(); toast("Verified — " + H.fmt(t.amount)); render();
    },
    "query-tx": (el) => {
      const t = S().transactions.find(x => x.id === el.dataset.id); if (!t) return;
      t.status = "queried"; Store.save();
      H.audit(`${H.user().name} queried ${TX_META[t.type].name.toLowerCase()} ${H.fmt(t.amount)} — receipt check needed`);
      toast("Queried — secretary will re-check the receipt", { type: "warn" }); render();
    },
    "delete-tx": (el) => {
      const s = S(); const idx = s.transactions.findIndex(x => x.id === el.dataset.id); if (idx < 0) return;
      const [removed] = s.transactions.splice(idx, 1); Store.save();
      H.audit(`${H.user().name} deleted pending ${TX_META[removed.type].name.toLowerCase()} ${H.fmt(removed.amount)}`);
      closeSheet();
      toast("Record deleted", { type: "warn", undo: () => { S().transactions.splice(idx, 0, removed); Store.save(); H.audit("Deletion undone — record restored"); } });
      render();
    },
    "request-approve": (el) => {
      const s = S(); const r = s.requests.find(x => x.id === el.dataset.id); if (!r) return;
      if (s.members.some(m => m.phone === r.phone)) { r.status = "approved"; Store.save(); toast(r.name + " already has a member account", { type: "warn" }); render(); return; }
      r.status = "approved";
      s.members.push({ id: Store.uid(), name: r.name, username: r.username || null, phone: r.phone, role: "member", joined: new Date().toISOString(), color: s.members.length % 6, verified: true, salt: r.salt || null, passwordHash: r.passwordHash || null });
      Store.save(); H.audit(`${H.user().name} approved membership — ${r.name}`); H.notify(`${r.name} joined the circle.`);
      toast(r.name + " is now a member"); render();
    },
    "request-reject": (el) => {
      const s = S(); const r = s.requests.find(x => x.id === el.dataset.id); if (!r) return;
      r.status = "rejected"; Store.save();
      H.audit(`${H.user().name} declined membership — ${r.name}`);
      toast("Request declined", { type: "warn", undo: () => { r.status = "pending"; Store.save(); } });
      render();
    },
    "loan-approve": (el) => {
      const s = S(); const l = s.loans.find(x => x.id === el.dataset.id); if (!l) return;
      l.status = "approved"; l.approvedAt = new Date().toISOString(); l.approvedBy = H.user().id;
      s.transactions.push({ id: Store.uid(), type: "disbursement", memberId: l.memberId, amount: l.amount, method: "Mobile money", date: new Date().toISOString(), status: "recorded", note: l.purpose + " loan", recordedBy: H.user().id });
      Store.save();
      const m = H.member(l.memberId);
      H.audit(`${H.user().name} approved loan — ${m.name}, ${H.fmt(l.amount)}`);
      H.notify(`Loan approved: ${m.name} — ${H.fmt(l.amount)}. Secretary: set the repayment date and any interest, then confirm the plan.`, ["secretary"]);
      H.notify(`Your loan of ${H.fmt(l.amount)} was approved — the secretary will confirm the repayment plan.`, [l.memberId]);
      closeSheet(); toast("Loan approved — secretary notified to set the repayment plan"); render();
    },
    "loan-reject": (el) => {
      const l = S().loans.find(x => x.id === el.dataset.id); if (!l) return;
      const prev = { status: l.status, due: l.due };
      l.status = "rejected"; Store.save();
      H.audit(`${H.user().name} rejected loan — ${H.member(l.memberId).name}, ${H.fmt(l.amount)}`);
      closeSheet();
      toast("Loan rejected", { type: "warn", undo: () => { Object.assign(l, prev); Store.save(); } });
      render();
    },
    attendance: (el) => {
      const m = S().meetings.find(x => x.id === el.dataset.meeting); if (!m) return;
      m.attendance[el.dataset.member] = el.dataset.val; Store.save();
      const y = window.scrollY; render(); window.scrollTo(0, y);
    },
    "decision-sheet": (el) => {
      openSheet(`<h3>Record a decision</h3>
        <form data-form="decision" data-id="${el.dataset.id}" style="display:flex;flex-direction:column;gap:12px">
          <div class="field">${label("Decision")}<input class="input" name="text" placeholder="e.g. Loan approved — Sarah A., UGX 300,000" required></div>
          <div class="field">${label("Result")}<select class="input" name="result"><option value="passed">Passed</option><option value="waived">Waived</option><option value="noted">Noted</option></select></div>
          <div class="field">${label("Detail")}<input class="input" name="detail" placeholder="e.g. Passed 9 / 11 votes"></div>
          <button class="btn primary" type="submit">Save decision</button>
        </form>`);
    },
    vote: (el) => {
      const p = S().proposals.find(x => x.id === el.dataset.id); if (!p || p.status !== "open") return;
      const uid = H.user().id; const val = el.dataset.val;
      p.yes = p.yes.filter(x => x !== uid); p.no = p.no.filter(x => x !== uid);
      (val === "yes" ? p.yes : p.no).push(uid);
      Store.save(); H.audit(`${H.user().name} voted ${val} on: ${p.title}`);
      toast("Vote recorded — " + val.toUpperCase()); render();
    },
    "close-proposal": (el) => {
      const p = S().proposals.find(x => x.id === el.dataset.id); if (!p) return;
      p.status = "closed"; p.closes = new Date().toISOString(); Store.save();
      const passed = p.yes.length > p.no.length;
      const mt = S().meetings.find(m => m.status === "upcoming") || S().meetings[0];
      mt.decisions.push({ id: Store.uid(), text: p.title, result: passed ? "passed" : "noted", detail: `${passed ? "Passed" : "Not passed"} ${p.yes.length} / ${p.yes.length + p.no.length} votes` });
      Store.save(); H.audit(`${H.user().name} closed vote: ${p.title} — ${passed ? "passed" : "not passed"}`);
      toast("Vote closed — " + (passed ? "passed" : "not passed")); render();
    },
    "proposal-sheet": () => {
      openSheet(`<h3>New proposal</h3>
        <form data-form="proposal" style="display:flex;flex-direction:column;gap:12px">
          <div class="field">${label("What should the circle decide?")}<input class="input" name="title" placeholder="e.g. Approve December hall budget" required minlength="6"></div>
          <div class="field">${label("Voting days")}<input class="input" name="days" inputmode="numeric" value="7" required></div>
          <button class="btn primary" type="submit">Open vote</button>
        </form>`);
    },
    "read-all": () => { H.notices().forEach(n => n.read = true); Store.save(); render(); },
    download: (el) => downloadReport(el.dataset.report),
    "share-summary": () => {
      const t = H.totals(); const s = S();
      const text = `${s.circle.name} — ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}\nTotal savings: ${H.fmt(t.moneyIn)}\nAvailable cash: ${H.fmt(t.cash)}\nOutstanding loans: ${H.fmt(t.outstanding)}\nLoan recovery: ${H.recoveryRate()}%\nMembers: ${s.members.length}`;
      const done = () => toast("Summary copied — paste it to your group chat");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      else fallbackCopy(text, done);
    },
  };
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { toast("Copy not available on this device", { type: "error" }); }
    ta.remove();
  }

  /* ---------- forms ---------- */
  const forms = {
    login: (f) => {
      const st = Store.state;
      if (!st.saccos.length) return formError("No circles exist yet. Create your own SACCO from the welcome screen, or join one with a code.");
      const raw = f.login.value.trim();
      const login = raw.replace(/^\+256/, "").replace(/\s/g, "");
      const uname = raw.toLowerCase();
      const match = (m) => m.phone === login || (m.username && m.username.toLowerCase() === uname);
      const pw = f.password.value;
      const staff = UI.loginRole === "staff";
      const isStaffRole = (r) => ["secretary", "treasurer", "chairperson"].includes(r);
      if (staff) {
        const cid = (f.circleId.value || "").trim().toUpperCase();
        const sacco = st.saccos.find(s => s.circle && s.circle.id.toUpperCase() === cid);
        if (!sacco) return formError("No circle found with that Circle ID. Ask your secretary.");
        const member = sacco.members.find(match);
        if (!member) return formError("No account found for that phone or username in this circle.");
        if (!Auth.verify(pw, member)) return formError("Wrong password. Try again or ask your secretary to reset it.");
        if (!isStaffRole(member.role)) return formError("This account isn't a staff account. Use the Member tab.");
        st.session = { saccoId: sacco.id, memberId: member.id, role: member.role };
        Store.activeSaccoId = sacco.id; Store.save();
        toast("Welcome back, " + member.name.split(" ")[0]); go("home");
        return;
      }
      let found = null;
      for (const sacco of st.saccos) {
        const member = sacco.members.find(match);
        if (member && Auth.verify(pw, member)) { found = { sacco, member }; break; }
      }
      if (!found) {
        const any = st.saccos.some(s => s.members.some(match));
        return formError(any ? "Wrong password. Try again or ask your secretary to reset it." : "No account found for that phone or username.");
      }
      const { sacco, member } = found;
      if (isStaffRole(member.role)) return formError("Staff log in with the 'As Staff' tab and the Circle ID.");
      st.session = { saccoId: sacco.id, memberId: member.id, role: member.role };
      Store.activeSaccoId = sacco.id; Store.save();
      toast("Welcome back, " + member.name.split(" ")[0]); go("home");
    },
    "create-sacco": (f) => {
      try {
        const st = Store.state;
        const name = f.name.value.trim();
        const username = f.secUsername.value.trim().toLowerCase();
        const phoneRaw = f.secPhone.value.replace(/\s/g, "");
        const pw = f.secPw.value;
        if (name.length < 3) return formError("Give your circle a name.");
        if (!/^[a-z0-9._-]{3,}$/.test(username)) return formError("Username must be at least 3 letters, numbers, dots or dashes (no spaces).");
        if (!/^\d{9,12}$/.test(phoneRaw)) return formError("Enter a valid phone number (9 to 12 digits).");
        if (pw.length < 8) return formError("Password must be at least 8 characters.");
        if (pw !== f.secPw2.value) return formError("Passwords don't match.");
        if (st.saccos.some(s => s.members.some(m => m.phone === phoneRaw))) return formError("A member with this phone already exists. Log in instead.");
        if (st.saccos.some(s => s.members.some(m => m.username && m.username.toLowerCase() === username))) return formError("That username is taken. Choose another.");
        const id = "SACCO-" + Math.floor(100000 + Math.random() * 900000);
        const circId = "CIRC-" + Math.floor(100000 + Math.random() * 900000);
        const joinCode = "JOIN-" + Math.floor(10000 + Math.random() * 89999);
        const creds = Auth.credentials(pw);
        const secName = f.secName.value.trim();
        const sec = { id: Store.uid(), name: secName, username, phone: phoneRaw, role: "secretary", joined: new Date().toISOString(), color: 0, verified: true, salt: creds.salt, passwordHash: creds.passwordHash };
        const sacco = {
          id,
          circle: { id: circId, name, joinCode, category: f.category.value, country: f.country.value, district: f.district.value.trim(), description: f.description.value.trim(), expectedMonthly: num(f.expected.value) || 50000, created: new Date().toISOString() },
          members: [sec], transactions: [], loans: [], meetings: [], requests: [], proposals: [], notifications: [], verifications: [],
          audit: [{ id: Store.uid(), text: `${secName} founded ${name} (${circId})`, date: new Date().toISOString() }],
          reconciliation: { cash: 0, mobile: 0, bank: 0, lastDate: null },
        };
        st.saccos.push(sacco);
        st.session = { saccoId: id, memberId: sec.id, role: "secretary" };
        Store.activeSaccoId = id;
        Store.save();
        H.notify(`Welcome to ${name}. Share joining code ${joinCode} with your members.`);
        toast(name + " created — joining code " + joinCode);
        go("home");
      } catch (e) {
        console.error("create-sacco failed", e);
        formError("Could not create the SACCO. Please check all fields and try again.");
      }
    },
    "join-search": (f) => {
      UI.joinCode = f.code.value.trim().toUpperCase();
      UI.joinSacco = Store.state.saccos.find(s => s.circle && s.circle.joinCode.toUpperCase() === UI.joinCode) || null;
      UI.joinFound = !!UI.joinSacco;
      render();
      if (!UI.joinFound) toast("No circle found for that code", { type: "error" });
    },
    "join-request": (f) => {
      try {
        const sacco = UI.joinSacco;
        if (!sacco || !sacco.circle) return formError("Search for a circle with its joining code first.");
        const name = f.name.value.trim(), phone = f.phone.value.replace(/\s/g, ""), pw = f.password.value;
        const username = f.username.value.trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,}$/.test(username)) return formError("Username must be at least 3 letters, numbers, dots or dashes (no spaces).");
        if (!/^\d{9,12}$/.test(phone)) return formError("Enter a valid phone number (9 to 12 digits).");
        if (pw.length < 8) return formError("Password must be at least 8 characters.");
        if (pw !== f.confirm.value) return formError("Passwords don't match.");
        if (sacco.members.some(m => m.phone === phone)) return formError("A member with this phone already exists. Log in instead.");
        if (sacco.members.some(m => m.username && m.username.toLowerCase() === username)) return formError("That username is taken in this circle. Choose another.");
        if (sacco.requests.some(r => r.phone === phone && r.status === "pending")) return formError("A request for this phone is already awaiting review.");
        const creds = Auth.credentials(pw);
        sacco.requests.push({ id: Store.uid(), name, username, phone, date: new Date().toISOString(), status: "pending", salt: creds.salt, passwordHash: creds.passwordHash });
        sacco.audit.unshift({ id: Store.uid(), text: `${name} requested to join via ${sacco.circle.joinCode}`, date: new Date().toISOString() });
        Store.save();
        UI.joinFound = false; UI.joinCode = ""; UI.joinSacco = null;
        toast("Request sent — the secretary will review it"); go("login");
      } catch (e) {
        console.error("join-request failed", e);
        formError("Could not send the join request. Please check all fields and try again.");
      }
    },
    contribute: (f) => {
      const amount = num(f.amount.value);
      if (amount < 1000) return formError("Enter an amount of at least UGX 1,000.");
      const s = S(); const u = H.user();
      s.transactions.push({ id: Store.uid(), type: "contribution", memberId: u.id, amount, method: f.method.value, date: new Date().toISOString(), status: "pending", note: f.note.value.trim(), recordedBy: u.id });
      Store.save();
      H.audit(`${u.name} submitted contribution ${H.fmt(amount)} (${f.method.value})`);
      H.notify(`Your contribution of ${H.fmt(amount)} is pending verification.`);
      toast("Contribution submitted — pending verification"); go("passbook");
    },
    "loan-finalize": (f, form) => {
      const l = S().loans.find(x => x.id === form.dataset.id); if (!l) return;
      const due = f.due.value ? new Date(f.due.value + "T12:00:00") : null;
      if (!due || isNaN(due)) return formError("Pick the repayment date.");
      const rate = Number(String(f.rate.value || "0").replace(/[^\d.]/g, "")) || 0;
      if (rate < 0 || rate > 100) return formError("Enter an interest rate between 0 and 100%.");
      const interest = Math.round(l.amount * rate / 100);
      const repaid = Math.max(0, l.amount - l.balance);
      l.due = due.toISOString();
      l.interestRate = rate;
      l.interest = interest;
      l.total = l.amount + interest;
      l.balance = Math.max(0, l.total - repaid);
      l.status = l.balance === 0 ? "cleared" : "active";
      l.plannedAt = new Date().toISOString(); l.plannedBy = H.user().id;
      Store.save();
      const m = H.member(l.memberId);
      H.audit(`${H.user().name} set loan terms — ${m.name}, due ${H.date(l.due)}, ${interest ? "interest " + rate + "% (" + H.fmt(interest) + ")" : "no interest"}`);
      H.notify(`Repayment plan set: ${m.name} — ${H.fmt(l.balance)} by ${H.date(l.due)}${interest ? ", includes " + H.fmt(interest) + " interest" : ""}.`, [l.memberId]);
      closeSheet(); toast("Repayment plan saved"); render();
    },
    "loan-record": (f) => {
      if (H.role() !== "secretary") return;
      const s = S();
      const amount = num(f.amount.value);
      if (amount < 1000) return formError("Enter an amount of at least UGX 1,000.");
      const m = H.member(f.memberId.value); if (!m) return formError("Choose the member who took the loan.");
      const purpose = f.purpose.value.trim(); if (purpose.length < 3) return formError("Add a short purpose.");
      const taken = f.taken.value ? new Date(f.taken.value + "T12:00:00") : new Date();
      if (isNaN(taken)) return formError("Pick the date the money was given.");
      const due = f.due.value ? new Date(f.due.value + "T12:00:00") : null;
      if (!due || isNaN(due)) return formError("Pick the repayment date.");
      if (due < taken) return formError("Repayment date must be after the date given.");
      const rate = Number(String(f.rate.value || "0").replace(/[^\d.]/g, "")) || 0;
      if (rate < 0 || rate > 100) return formError("Enter an interest rate between 0 and 100%.");
      const interest = Math.round(amount * rate / 100);
      const total = amount + interest;
      s.loans.push({ id: Store.uid(), memberId: m.id, purpose, amount, balance: total, due: due.toISOString(), status: "active", applied: taken.toISOString(), interestRate: rate, interest, total, approvedAt: taken.toISOString(), approvedBy: H.user().id, plannedAt: new Date().toISOString(), plannedBy: H.user().id, recordedBy: H.user().id });
      s.transactions.push({ id: Store.uid(), type: "disbursement", memberId: m.id, amount, method: f.method.value, date: taken.toISOString(), status: "recorded", note: purpose + " loan", recordedBy: H.user().id });
      Store.save();
      H.audit(`${H.user().name} recorded a loan — ${m.name}, ${H.fmt(amount)}${interest ? ", interest " + rate + "% (" + H.fmt(interest) + ")" : ", no interest"}, due ${H.date(due.toISOString())}`);
      H.notify(`Loan recorded for ${m.name}: ${H.fmt(amount)} given on ${H.date(taken.toISOString())} — repay ${H.fmt(total)} by ${H.date(due.toISOString())}${interest ? ", includes " + H.fmt(interest) + " interest" : ""}.`, [m.id]);
      closeSheet(); toast("Loan recorded in the loan book"); render();
    },
    "loan-apply": (f) => {
      const s = S(); const u = H.user();
      const amount = num(f.amount.value);
      const max = H.savingsOf(u.id) * 3;
      if (amount < 10000) return formError("Minimum loan is UGX 10,000.");
      if (amount > max) return formError(`Above your limit of ${H.fmt(max)} (3× savings).`);
      if (s.loans.some(l => l.memberId === u.id && (l.status === "pending" || l.status === "approved"))) return formError("You already have a loan awaiting a decision.");
      s.loans.push({ id: Store.uid(), memberId: u.id, purpose: f.purpose.value.trim(), amount, balance: amount, due: new Date(f.due.value).toISOString(), status: "pending", applied: new Date().toISOString() });
      Store.save();
      H.audit(`${u.name} applied for a loan — ${H.fmt(amount)}, ${f.purpose.value.trim()}`);
      H.notify(`Loan application received: ${H.fmt(amount)} — goes to the next meeting vote.`, ["chairperson"]);
      toast("Application submitted — the circle votes next meeting"); go("loans");
    },
    record: (f, form) => {
      const s = S(); const type = form.dataset.type;
      const amount = num(f.amount.value);
      if (amount < 500) return formError("Enter a valid amount.");
      const memberId = f.memberId ? f.memberId.value : null;
      if (f.memberId && !memberId) return formError("Choose a member.");
      if (type === "repayment" && amount > H.loanOf(memberId)) return formError("More than the member owes (" + H.fmt(H.loanOf(memberId)) + ").");
      const purpose = f.purpose ? f.purpose.value.trim() : "";
      const status = type === "contribution" || type === "repayment" ? "pending" : type === "expense" ? "paid" : "recorded";
      s.transactions.push({ id: Store.uid(), type, memberId, amount, method: f.method.value, date: new Date().toISOString(), status, note: purpose || f.note.value.trim(), recordedBy: H.user().id });
      Store.save();
      const m = memberId ? H.member(memberId) : null;
      H.audit(`${H.user().name} recorded ${type}${m ? " — " + m.name : ""}, ${H.fmt(amount)}`);
      if (status === "pending") H.notify(`${H.fmt(amount)} ${type} recorded — waiting for treasurer verification.`);
      toast(type[0].toUpperCase() + type.slice(1) + " recorded" + (status === "pending" ? " — pending verification" : ""));
      go(type === "expense" || type === "withdrawal" ? "finance" : "home");
    },
    "register-member": (f) => {
      try {
        const s = S(); const phone = f.phone.value.replace(/\s/g, "");
        if (!/^\d{9,12}$/.test(phone)) return formError("Enter a valid phone number (9 to 12 digits).");
        if (s.members.some(m => m.phone === phone)) return formError("A member with this phone already exists.");
        const username = f.username.value.trim().toLowerCase();
        if (username && !/^[a-z0-9._-]{3,}$/.test(username)) return formError("Username must be at least 3 letters, numbers, dots or dashes (no spaces).");
        if (username && s.members.some(m => m.username && m.username.toLowerCase() === username)) return formError("That username is taken in this circle.");
        const pw = f.password.value;
        if (pw.length < 8) return formError("Password must be at least 8 characters.");
        if (pw !== f.confirm.value) return formError("Passwords don't match.");
        const name = f.name.value.trim();
        const creds = Auth.credentials(pw);
        s.members.push({ id: Store.uid(), name, username: username || null, phone, role: "member", joined: new Date().toISOString(), color: s.members.length % 6, verified: true, salt: creds.salt, passwordHash: creds.passwordHash });
        Store.save(); H.audit(`${H.user().name} registered member — ${name}`); H.notify(`${name} was added to the member register.`);
        toast(name + " registered — they can now log in"); go("members");
      } catch (e) {
        console.error("register-member failed", e);
        formError("Could not register the member. Please check all fields and try again.");
      }
    },
    "meeting-new": (f) => {
      const s = S();
      const dt = new Date(f.date.value + "T" + (f.time.value || "14:00"));
      if (dt < new Date()) return formError("Pick a future date and time.");
      const title = f.title.value.trim();
      s.meetings.forEach(m => { if (m.status === "upcoming") m.status = "past"; });
      const mt = { id: Store.uid(), title, date: dt.toISOString(), venue: f.venue.value.trim(), status: "upcoming", agenda: f.agenda.value.split("\n").map(x => x.trim()).filter(Boolean), attendance: {}, decisions: [] };
      s.meetings.unshift(mt); Store.save();
      H.audit(`${H.user().name} scheduled ${title} — ${H.date(mt.date)}`);
      H.notify(`Meeting scheduled: ${title}, ${H.dateLong(mt.date)} at ${H.time(mt.date)}.`);
      toast("Meeting scheduled — members notified"); go("meeting/" + mt.id);
    },
    decision: (f, form) => {
      const m = S().meetings.find(x => x.id === form.dataset.id); if (!m) return;
      m.decisions.push({ id: Store.uid(), text: f.text.value.trim(), result: f.result.value, detail: f.detail.value.trim() || "Recorded by " + H.user().name });
      Store.save(); H.audit(`${H.user().name} recorded decision at ${m.title}: ${f.text.value.trim()}`);
      closeSheet(); toast("Decision recorded"); render();
    },
    proposal: (f) => {
      const days = Math.max(1, num(f.days.value) || 7);
      S().proposals.unshift({ id: Store.uid(), title: f.title.value.trim(), opened: new Date().toISOString(), status: "open", yes: [], no: [], closes: new Date(Date.now() + days * 86400000).toISOString() });
      Store.save(); H.audit(`${H.user().name} opened proposal: ${f.title.value.trim()}`);
      H.notify("New vote open: " + f.title.value.trim());
      closeSheet(); toast("Vote opened — members can vote now"); render();
    },
    reconcile: (f) => {
      const by = H.methodTotals();
      const counted = { cash: num(f.cash.value), mobile: num(f.mobile.value), bank: num(f.bank.value) };
      const diffs = [["Cash", counted.cash - Math.max(0, by.Cash)], ["Mobile money", counted.mobile - Math.max(0, by["Mobile money"])], ["Bank", counted.bank - Math.max(0, by.Bank)]].filter(([, d]) => d !== 0);
      S().reconciliation = { ...counted, lastDate: new Date().toISOString() }; Store.save();
      H.audit(`${H.user().name} reconciled accounts${diffs.length ? " — differences: " + diffs.map(([k, d]) => `${k} ${d > 0 ? "+" : ""}${H.fmt(d)}`).join(", ") : " — all balances match"}`);
      if (diffs.length) { H.notify("Reconciliation flagged differences: " + diffs.map(([k, d]) => `${k} ${d > 0 ? "+" : ""}${H.fmt(d)}`).join(", ")); toast("Saved — differences flagged to the secretary", { type: "warn" }); }
      else toast("Reconciled — all balances match");
      go("home");
    },
    "circle-settings": (f) => {
      const s = S();
      s.circle.name = f.name.value.trim();
      s.circle.expectedMonthly = num(f.expected.value) || s.circle.expectedMonthly;
      Store.save(); H.audit(`${H.user().name} updated circle settings`);
      closeSheet(); toast("Settings saved"); render();
    },
  };

  /* ---------- global event wiring ---------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-form]");
    if (!f) return;
    e.preventDefault();
    const err = $("#form-error"); if (err) { err.hidden = true; err.textContent = ""; }
    const fn = forms[f.dataset.form];
    if (fn) fn(f.elements, f);
  });
  let searchTimer = null;
  document.addEventListener("input", (e) => {
    const kind = e.target.dataset.input;
    if (!kind) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const id = e.target.id; const pos = e.target.selectionStart;
      if (kind === "fin-search") UI.finSearch = e.target.value;
      if (kind === "mem-search") UI.memSearch = e.target.value;
      render();
      const inp = document.getElementById(id);
      if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (err) { /* non-text input */ } }
    }, 220);
  });
  document.addEventListener("change", (e) => {
    const kind = e.target.dataset.change;
    if (kind === "fin-sort") { UI.finSort = e.target.value; render(); }
    if (kind === "member-role") {
      const m = H.member(e.target.dataset.id); if (!m) return;
      const old = m.role;
      // keep exactly one treasurer / chairperson: demote the previous holder
      S().members.forEach(x => { if (x.id !== m.id && x.role === e.target.value && (e.target.value === "treasurer" || e.target.value === "chairperson")) x.role = "member"; });
      m.role = e.target.value; Store.save();
      H.audit(`${H.user().name} changed ${m.name}'s role: ${old} → ${m.role}`);
      toast(m.name + " is now " + m.role); render();
    }
  });
  window.addEventListener("hashchange", render);
  Store.load();
  if (window.Cloud) {
    const typing = () => {
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
      return route() !== "privacy" && AUTH_ROUTES.includes(route());
    };
    let remoteTimer = null;
    Cloud.onChange((s, reason) => {
      /* A background sync only repaints when the visible state or cloud status
         actually changed — otherwise the screen would flicker every 30s. */
      if (reason === "remote") {
        if (stateSig() === lastSig) return;
        clearTimeout(remoteTimer);
        remoteTimer = setTimeout(() => {
          if (typing() || stateSig() === lastSig) return;
          render();
        }, 200);
        return;
      }
      if (route() === "more" && stateSig() !== lastSig) render();
    });
    Cloud.start();
  }
  if (!location.hash) location.hash = S().session ? "#/home" : "#/welcome";
  render();
})();