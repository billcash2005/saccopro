/* SaccoPro — real persistent store + credential hashing */
(function () {
  const KEY = "saccopro-app-v2";
  const SESSION_KEY = "saccopro-session-v1";
  let seq = 0;
  const uid = () => "id-" + Date.now().toString(36) + "-" + (++seq) + "-" + Math.random().toString(36).slice(2, 7);

  /* Compact synchronous SHA-256 (geraintluff), UTF-8 safe via encodeURIComponent. */
  function sha256(ascii) {
    function rr(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    const maxWord = Math.pow(2, 32);
    let result = "";
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = sha256.h = sha256.h || [];
    const k = sha256.k = sha256.k || [];
    let primeCounter = k.length;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (let i = 0; i < ascii.length; i++) {
      const j = ascii.charCodeAt(i);
      if (j >> 8) return "";
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const oldHash = hash;
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ (~e & hash[6]))
          + k[i]
          + (w[i] = i < 16 ? w[i] : (w[i - 16]
            + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? "0" : "") + b.toString(16);
      }
    }
    return result;
  }

  const Auth = {
    salt() {
      const a = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(a);
      return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
    },
    hash(pw, salt) { return sha256(unescape(encodeURIComponent(salt + ":" + pw))); },
    credentials(pw) { const salt = Auth.salt(); return { salt, passwordHash: Auth.hash(pw, salt) }; },
    verify(pw, creds) { return !!(creds && creds.passwordHash && Auth.hash(pw, creds.salt) === creds.passwordHash); },
  };
  window.Auth = Auth;

  /* Version 3 = multi-SACCO platform. The developer admin owns the platform
     (adminPassword + every sacco); the member app only ever touches one sacco. */
  function emptySacco() {
    return {
      id: null,
      circle: null,
      members: [],
      transactions: [],
      loans: [],
      meetings: [],
      requests: [],
      proposals: [],
      notifications: [],
      audit: [],
      reconciliation: { cash: 0, mobile: 0, bank: 0, lastDate: null },
    };
  }

  function initialState() {
    return {
      version: 3,
      session: null,          // device-local: { saccoId, memberId, role }
      adminPassword: null,    // developer platform credential { salt, passwordHash }
      saccos: [],
    };
  }

  /* Upgrade a legacy single-circle (v2) state into the platform model.
     The old in-app admin password is intentionally dropped: the developer
     creates a fresh platform password on first sign-in to the admin console. */
  function migrateV2(old) {
    const st = initialState();
    if (old && old.circle) {
      const sacco = emptySacco();
      sacco.id = "SACCO-" + (String(old.circle.id || "").replace(/\D/g, "") || Math.floor(100000 + Math.random() * 900000));
      sacco.circle = old.circle;
      ["members", "transactions", "loans", "meetings", "requests", "proposals", "notifications", "audit"].forEach(k => { if (Array.isArray(old[k])) sacco[k] = old[k]; });
      if (old.reconciliation) sacco.reconciliation = old.reconciliation;
      st.saccos.push(sacco);
      if (old.session && old.session.memberId) st.session = { saccoId: sacco.id, memberId: old.session.memberId, role: old.session.role };
    }
    if (old && old.updatedAt) st.updatedAt = old.updatedAt;
    if (old && old._rev) st._rev = old._rev;
    return st;
  }

  const Store = {
    state: null,
    activeSaccoId: null,      // transient pointer (admin selection); never persisted
    normalize(parsed) {
      if (!parsed || typeof parsed !== "object") return null;
      if (parsed.version === 3 && Array.isArray(parsed.saccos)) return parsed;
      if (parsed.version === 2) return migrateV2(parsed);
      return null;
    },
    /* The session lives in its own key so signing in survives a state refresh
       (cloud pull, WebView reload, app restart) even if the sacco data is re-fetched. */
    readSession() {
      try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
        if (s && s.saccoId && s.memberId) return { saccoId: s.saccoId, memberId: s.memberId, role: s.role || null };
      } catch (e) { /* ignore */ }
      return null;
    },
    writeSession() {
      try {
        const s = this.state && this.state.session;
        if (s && s.saccoId && s.memberId) localStorage.setItem(SESSION_KEY, JSON.stringify({ saccoId: s.saccoId, memberId: s.memberId, role: s.role || null }));
        else localStorage.removeItem(SESSION_KEY);
      } catch (e) { /* ignore */ }
    },
    load() {
      let loaded = null;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) loaded = this.normalize(JSON.parse(raw));
      } catch (e) { /* corrupted storage falls through to a fresh start */ }
      this.state = loaded || initialState();
      const saved = this.readSession();
      if (saved) this.state.session = saved;
      this.saveLocal();
    },
    save() { this.saveLocal(); if (window.Cloud) Cloud.queuePush(); },
    saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* private mode */ } this.writeSession(); },
    reset() { this.state = initialState(); this.state.updatedAt = Date.now(); this.activeSaccoId = null; this.save(); },
    uid,
  };
  window.Store = Store;

  // ---- domain helpers (scoped to the active SACCO) ----
  const H = {
    /* The active sacco: admin selection first, then the member's session. */
    sacco() {
      const st = Store.state;
      if (!st || !Array.isArray(st.saccos)) return null;
      if (Store.activeSaccoId) { const s = st.saccos.find(x => x.id === Store.activeSaccoId); if (s) return s; }
      if (st.session && st.session.saccoId) return st.saccos.find(x => x.id === st.session.saccoId) || null;
      return null;
    },
    saccoById: (id) => Store.state.saccos.find(s => s.id === id) || null,
    member: (id) => { const s = H.sacco(); return s ? s.members.find(m => m.id === id) || null : null; },
    hasCircle: () => !!H.sacco(),
    initials: (name) => String(name || "").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase(),
    fmt: (n) => "UGX " + Math.round(n || 0).toLocaleString("en-US"),
    fmtShort: (n) => n >= 1e6 ? "UGX " + (n / 1e6).toFixed(1) + "M" : "UGX " + Math.round((n || 0) / 1e3) + "K",
    date: (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    dateShort: (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    dateLong: (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
    time: (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase(),
    savingsOf(id) {
      const s = H.sacco(); if (!s) return 0;
      return s.transactions
        .filter(t => t.memberId === id && t.type === "contribution" && (t.status === "paid" || t.status === "partial"))
        .reduce((a, t) => a + t.amount, 0);
    },
    totals() {
      const s = H.sacco();
      if (!s) return { moneyIn: 0, moneyOut: 0, cash: 0, outstanding: 0, pendingVerify: 0, pendingRequests: 0, overdue: 0, expected: 0, thisMonth: 0 };
      const sum = (f) => s.transactions.filter(f).reduce((a, t) => a + t.amount, 0);
      const moneyIn = sum(t => (t.type === "contribution" || t.type === "repayment") && (t.status === "paid" || t.status === "partial"));
      const moneyOut = sum(t => (t.type === "disbursement" || t.type === "expense") && t.status !== "pending");
      const outstanding = s.loans.filter(l => l.status === "active" || l.status === "overdue" || l.status === "approved").reduce((a, l) => a + l.balance, 0);
      const pendingVerify = s.transactions.filter(t => t.status === "pending").length;
      const pendingRequests = s.requests.filter(r => r.status === "pending").length;
      const overdue = s.loans.filter(l => l.status === "overdue").length;
      const expected = s.circle ? s.members.length * s.circle.expectedMonthly : 0;
      const thisMonth = sum(t => t.type === "contribution" && (t.status === "paid" || t.status === "partial") && new Date(t.date).getMonth() === new Date().getMonth());
      return { moneyIn, moneyOut, cash: moneyIn - moneyOut, outstanding, pendingVerify, pendingRequests, overdue, expected, thisMonth };
    },
    methodTotals() {
      const s = H.sacco();
      const by = { Cash: 0, "Mobile money": 0, Bank: 0 };
      if (!s) return by;
      s.transactions.forEach(t => {
        if (t.status !== "paid" && t.status !== "partial" && t.status !== "recorded") return;
        const sign = (t.type === "contribution" || t.type === "repayment") ? 1 : -1;
        if (t.type === "withdrawal") return; // internal move
        by[t.method] = (by[t.method] || 0) + sign * t.amount;
      });
      return by;
    },
    loanOf(id) { const s = H.sacco(); return s ? s.loans.filter(l => l.memberId === id && (l.status === "active" || l.status === "overdue" || l.status === "approved")).reduce((a, l) => a + l.balance, 0) : 0; },
    /* Loans saved before interest existed have no interest/total fields —
       they read as 0 interest and total = principal, so old data is unchanged. */
    loanInterest: (l) => (l && l.interest) || 0,
    loanTotal: (l) => {
      if (!l) return 0;
      if (l.total != null) return l.total;
      return (l.amount || 0) + ((l.interest) || 0);
    },
    recoveryRate() {
      const s = H.sacco(); if (!s) return 100;
      const lent = s.loans.reduce((a, l) => a + H.loanTotal(l), 0);
      const out = s.loans.filter(l => l.status === "active" || l.status === "overdue" || l.status === "approved").reduce((a, l) => a + l.balance, 0);
      return lent ? Math.round(((lent - out) / lent) * 100) : 100;
    },
    attendanceRate() {
      const s = H.sacco(); if (!s) return 0;
      const past = s.meetings.filter(m => m.status === "past");
      if (!past.length) return 0;
      let present = 0, total = 0;
      past.forEach(m => Object.values(m.attendance).forEach(v => { total++; if (v === "present") present++; }));
      return total ? Math.round((present / total) * 100) : 0;
    },
    nextMeeting() { const s = H.sacco(); return s ? s.meetings.find(m => m.status === "upcoming") || null : null; },
    role() { return Store.state.session ? Store.state.session.role : null; },
    user() { return Store.state.session ? H.member(Store.state.session.memberId) : null; },
    isStaff() { return ["secretary", "treasurer", "chairperson"].includes(H.role()); },
    audit(text) {
      const s = H.sacco(); if (!s) return;
      s.audit.unshift({ id: uid(), text, date: new Date().toISOString() });
      Store.save();
    },
    /* `to` optionally targets a notification: a role ("secretary") or member ids.
       Notifications without `to` stay visible to everyone, like before. */
    notify(text, to) {
      const s = H.sacco(); if (!s) return;
      const n = { id: uid(), text, date: new Date().toISOString(), read: false };
      if (to) { const list = Array.isArray(to) ? to.filter(Boolean) : [to]; if (list.length) n.to = list; }
      s.notifications.unshift(n);
      Store.save();
    },
    notices() {
      const s = H.sacco(); if (!s || !Array.isArray(s.notifications)) return [];
      const role = H.role();
      const me = Store.state && Store.state.session ? Store.state.session.memberId : null;
      return s.notifications.filter(n => !n || !n.to || !n.to.length || n.to.includes(role) || (me && n.to.includes(me)));
    },
    savingsSeries(months) {
      const s = H.sacco(); const now = new Date(); const pts = [];
      const id = Store.state.session ? Store.state.session.memberId : null;
      const tx = s ? s.transactions : [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const total = tx.filter(t => t.type === "contribution" && (t.status === "paid" || t.status === "partial") && new Date(t.date) < d && (!id || t.memberId === id)).reduce((a, t) => a + t.amount, 0);
        pts.push({ label: d.toLocaleDateString("en-GB", { month: "short" }), value: total });
      }
      pts.forEach((p, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1); p.label = d.toLocaleDateString("en-GB", { month: "short" }); });
      return pts;
    },
  };
  window.H = H;
})();