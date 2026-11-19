/* SaccoPro — Supabase relational sync (offline-first, real tables).
   Every SACCO, member account, transaction, verification, loan, meeting,
   request, proposal, notification and audit entry lives in its own table.
   The UI keeps a single in-memory state; this layer hydrates that state
   from the tables and writes every change back to them.

   Safety model (why a remote refresh can never eat a fresh sign-up):
   - Every local change is written to localStorage synchronously first, then
     queued for upload. hydrate() always flushes that queue BEFORE pulling, so
     the server is never asked to overwrite data it has not received yet.
   - Pulls are merged, not swapped: an entity the server has never confirmed
     (a brand-new SACCO or member) is always kept, and a locally edited entity
     wins over its older server copy until the upload lands.
   - Deletes are only mirrored once this device has completed a full hydrate,
     so a client that boots with a partial state can never prune the table. */
(function () {
  const URL = "https://kkefibqvrsoysjktjlal.supabase.co";
  const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrZWZpYnF2cnNveXNqa3RqbGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMDYxODQsImV4cCI6MjEwOTg4MjE4NH0.kiKytC9UHhV1ur0MthjllXS6tY99kIvbZaZajAocts4";
  const CONFIG_ROW = "main";
  const CHILD_TABLES = ["members", "transactions", "verifications", "loans", "meetings", "join_requests", "proposals", "notifications", "audit_log"];
  const ALL_TABLES = ["app_config", "saccos"].concat(CHILD_TABLES);
  const TABLE_KEY = { members: "members", transactions: "transactions", verifications: "verifications", loans: "loans", meetings: "meetings", join_requests: "requests", proposals: "proposals", notifications: "notifications", audit_log: "audit" };

  const SETUP_SQL = `-- SaccoPro: run once in Supabase SQL Editor (creates all content tables)
create table if not exists public.app_config (id text primary key, admin_password jsonb, updated_at timestamptz not null default now());
create table if not exists public.saccos (id text primary key, name text not null, category text, country text, district text, description text, expected_monthly bigint not null default 0, join_code text, circle_id text, created_at timestamptz not null default now(), reconciliation jsonb not null default '{}'::jsonb, data jsonb);
create table if not exists public.members (id text primary key, sacco_id text not null references public.saccos(id) on delete cascade, name text not null, username text, phone text, role text not null default 'member', color integer not null default 0, verified boolean not null default false, joined_at timestamptz not null default now(), salt text, password_hash text, data jsonb);
create table if not exists public.transactions (id text primary key, sacco_id text not null references public.saccos(id) on delete cascade, member_id text, type text not null, amount bigint not null default 0, method text, status text not null default 'pending', note text, recorded_by text, verified_by text, verified_at timestamptz, date timestamptz not null default now(), data jsonb);
create table if not exists public.verifications (id text primary key, sacco_id text not null references public.saccos(id) on delete cascade, member_id text, transaction_id text, status text, verified_by text, note text, created_at timestamptz not null default now(), data jsonb);
create table if not exists public.loans (id text primary key, sacco_id text not null references public.saccos(id) on delete cascade, member_id text, purpose text, amount bigint not null default 0, balance bigint not null default 0, status text not null default 'pending', due timestamptz, applied_at timestamptz, data jsonb);
create table if not exists public.meetings (id text primary key, sacco_id text not null references public.saccos(id) on delete cascade, title text, date timestamptz, venue text, status text, agenda jsonb not null default '[]'::jsonb, attendance jsonb not null default '{}'::jsonb, decisions jsonb not null default '[]'::jsonb, data jsonb);
create table if not exists public.join_requests (id text primary key, sacco_id text not null references public.saccos(id) on delete cascade, name text, username text, phone text, status text not null default 'pending', date timestamptz not null default now(), salt text, password_hash text, data jsonb);
create table if not exists public.proposals (id text primary key, sacco_id text not null references public.saccos(id) on delete cascade, member_id text, title text, status text, date timestamptz not null default now(), data jsonb);
create table if not exists public.notifications (id text primary key, sacco_id text not null references public.saccos(id) on delete cascade, text text, read boolean not null default false, date timestamptz not null default now(), data jsonb);
create table if not exists public.audit_log (id text primary key, sacco_id text not null references public.saccos(id) on delete cascade, text text, date timestamptz not null default now(), data jsonb);
do $$ declare t text; begin
  foreach t in array array['app_config','saccos','members','transactions','verifications','loans','meetings','join_requests','proposals','notifications','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "saccopro read" on public.%I', t);
    execute format('drop policy if exists "saccopro insert" on public.%I', t);
    execute format('drop policy if exists "saccopro update" on public.%I', t);
    execute format('drop policy if exists "saccopro delete" on public.%I', t);
    execute format('create policy "saccopro read" on public.%I for select to anon using (true)', t);
    execute format('create policy "saccopro insert" on public.%I for insert to anon with check (true)', t);
    execute format('create policy "saccopro update" on public.%I for update to anon using (true) with check (true)', t);
    execute format('create policy "saccopro delete" on public.%I for delete to anon using (true)', t);
    begin execute format('alter publication supabase_realtime add table public.%I', t); exception when duplicate_object then null; end;
  end loop;
end $$;`;

  let client = null, channel = null;
  let status = "connecting", detail = "", lastSync = null;
  let pushTimer = null, hydrateTimer = null, keepAlive = null;
  let lastPersist = 0, started = false;
  let pushPromise = null, pushQueued = false;
  let hydratedOnce = false;
  /* Last state the server confirmed: { table: { id: json } }. Persisted so a
     device that was offline or closed during a deletion can never resurrect
     the deleted account on its next sync. */
  const SYNC_KEY = "saccopro-sync-v1";
  function loadSnapshot() {
    try { const raw = localStorage.getItem(SYNC_KEY); const s = raw && JSON.parse(raw); if (s && typeof s === "object") return s; } catch (e) { /* ignore */ }
    return null;
  }
  function saveSnapshot(snap) { try { localStorage.setItem(SYNC_KEY, JSON.stringify(snap)); } catch (e) { /* quota */ } }
  let lastPushed = loadSnapshot();
  let role = "app";                // "app" (member) or "admin" (developer console owns app_config)
  const listeners = new Set();

  function emit(reason) { listeners.forEach((fn) => { try { fn(status, reason); } catch (e) { /* view gone */ } }); }
  function setStatus(s, d) { status = s; detail = d || ""; emit(); }

  /* ---------- state -> table rows ---------- */
  function stateToRows(state) {
    const saccos = state && Array.isArray(state.saccos) ? state.saccos : [];
    const now = new Date().toISOString();
    const rows = { app_config: [{ id: CONFIG_ROW, admin_password: (state && state.adminPassword) || null, updated_at: now }], saccos: [] };
    CHILD_TABLES.forEach((t) => { rows[t] = []; });
    saccos.forEach((sc) => {
      if (!sc || !sc.id) return;
      const c = sc.circle || {};
      rows.saccos.push({
        id: sc.id, name: c.name || "Untitled", category: c.category || null, country: c.country || null,
        district: c.district || null, description: c.description || null, expected_monthly: c.expectedMonthly || 0,
        join_code: c.joinCode || null, circle_id: c.id || null, created_at: c.created || now,
        reconciliation: sc.reconciliation || {}, data: { circle: sc.circle || null, reconciliation: sc.reconciliation || {} },
      });
      const put = (table, arr, cols) => {
        (Array.isArray(arr) ? arr : []).forEach((e) => {
          if (!e || !e.id) return;
          rows[table].push(Object.assign({ id: e.id, sacco_id: sc.id, data: e }, cols ? cols(e) : {}));
        });
      };
      put("members", sc.members, (m) => ({ name: m.name || "", username: m.username || null, phone: m.phone || null, role: m.role || "member", color: m.color || 0, verified: !!m.verified, joined_at: m.joined || now, salt: m.salt || null, password_hash: m.passwordHash || null }));
      put("transactions", sc.transactions, (t) => ({ member_id: t.memberId || null, type: t.type || "contribution", amount: t.amount || 0, method: t.method || null, status: t.status || "pending", note: t.note || null, recorded_by: t.recordedBy || null, verified_by: t.verifiedBy || null, verified_at: t.verifiedAt || null, date: t.date || now }));
      put("verifications", sc.verifications, (v) => ({ member_id: v.memberId || null, transaction_id: v.transactionId || null, status: v.status || null, verified_by: v.verifiedBy || null, note: v.note || null, created_at: v.date || v.createdAt || now }));
      put("loans", sc.loans, (l) => ({ member_id: l.memberId || null, purpose: l.purpose || null, amount: l.amount || 0, balance: l.balance || 0, status: l.status || "pending", due: l.due || null, applied_at: l.applied || null }));
      put("meetings", sc.meetings, (m) => ({ title: m.title || null, date: m.date || null, venue: m.venue || null, status: m.status || null, agenda: m.agenda || [], attendance: m.attendance || {}, decisions: m.decisions || [] }));
      put("join_requests", sc.requests, (r) => ({ name: r.name || null, username: r.username || null, phone: r.phone || null, status: r.status || "pending", date: r.date || now, salt: r.salt || null, password_hash: r.passwordHash || null }));
      put("proposals", sc.proposals, (p) => ({ member_id: p.memberId || null, title: p.title || p.text || null, status: p.status || null, date: p.date || now }));
      put("notifications", sc.notifications, (n) => ({ text: n.text || null, read: !!n.read, date: n.date || now }));
      put("audit_log", sc.audit, (a) => ({ text: a.text || null, date: a.date || now }));
    });
    return rows;
  }

  /* ---------- table rows -> state ---------- */
  function rowsToState(tables, session, withAdmin) {
    const st = { version: 3, session: session || null, adminPassword: null, saccos: [] };
    const cfg = withAdmin === false ? null : (tables.app_config || []).find((r) => r.id === CONFIG_ROW);
    st.adminPassword = cfg ? cfg.admin_password || null : null;
    const byId = {};
    (tables.saccos || []).forEach((row) => {
      const d = row.data || {};
      const sc = {
        id: row.id, circle: d.circle || null,
        reconciliation: d.reconciliation || row.reconciliation || { cash: 0, mobile: 0, bank: 0, lastDate: null },
        members: [], transactions: [], loans: [], meetings: [], requests: [], proposals: [], notifications: [], audit: [], verifications: [],
      };
      if (!sc.circle) sc.circle = { id: row.circle_id, name: row.name, joinCode: row.join_code, category: row.category, country: row.country, district: row.district, description: row.description, expectedMonthly: row.expected_monthly, created: row.created_at };
      byId[row.id] = sc; st.saccos.push(sc);
    });
    const put = (table, key) => (tables[table] || []).forEach((row) => {
      const sc = byId[row.sacco_id]; if (!sc) return;
      const e = row.data ? Object.assign({}, row.data) : Object.assign({}, row);
      if (!e.id) e.id = row.id;
      sc[key].push(e);
    });
    put("members", "members"); put("transactions", "transactions"); put("loans", "loans"); put("meetings", "meetings");
    put("join_requests", "requests"); put("proposals", "proposals"); put("notifications", "notifications"); put("audit_log", "audit"); put("verifications", "verifications");
    st.saccos.forEach((sc) => {
      sc.audit.sort((a, b) => new Date(b.date) - new Date(a.date));
      sc.notifications.sort((a, b) => new Date(b.date) - new Date(a.date));
    });
    return st;
  }

  /* ---------- merge: never lose data the server has not confirmed ---------- */
  function localPayload(table, e) {
    if (table === "saccos") return { circle: (e && e.circle) || null, reconciliation: (e && e.reconciliation) || {} };
    return e;
  }
  function rowPayload(table, row) {
    if (table === "app_config") return { admin_password: row.admin_password === undefined ? null : row.admin_password };
    if (table === "saccos") return { circle: (row.data && row.data.circle) || null, reconciliation: (row.data && row.data.reconciliation) || row.reconciliation || {} };
    return row.data === undefined ? null : row.data;
  }
  function snapshotOf(rows) {
    const snap = {};
    Object.keys(rows).forEach((t) => {
      snap[t] = {};
      (rows[t] || []).forEach((r) => { if (r && r.id) snap[t][r.id] = JSON.stringify(rowPayload(t, r)); });
    });
    return snap;
  }
  const confirmed = (table, id) => !!(lastPushed && lastPushed[table] && lastPushed[table][id] !== undefined);
  function isDirty(table, id, entity) {
    if (!confirmed(table, id)) return false;
    return lastPushed[table][id] !== JSON.stringify(localPayload(table, entity));
  }

  function mergeChildren(table, localArr, remoteArr) {
    const local = Array.isArray(localArr) ? localArr : [];
    const remote = Array.isArray(remoteArr) ? remoteArr : [];
    const lById = {}, rById = {};
    local.forEach((e) => { if (e && e.id) lById[e.id] = e; });
    remote.forEach((e) => { if (e && e.id) rById[e.id] = e; });
    const ids = Object.keys(lById);
    Object.keys(rById).forEach((id) => { if (!lById[id]) ids.push(id); });
    const out = [];
    ids.forEach((id) => {
      const le = lById[id], re = rById[id];
      if (le && re) { out.push(isDirty(table, id, le) ? le : re); return; }
      if (le) { if (!confirmed(table, id)) out.push(le); return; } // pending create, or cleared on another device
      if (!confirmed(table, id)) out.push(re);                       // new from another device (or locally deleted → stays deleted)
    });
    return out;
  }

  function mergeState(local, remote) {
    const lSaccos = local && Array.isArray(local.saccos) ? local.saccos : [];
    const rSaccos = remote && Array.isArray(remote.saccos) ? remote.saccos : [];
    const lById = {}, rById = {};
    lSaccos.forEach((s) => { if (s && s.id) lById[s.id] = s; });
    rSaccos.forEach((s) => { if (s && s.id) rById[s.id] = s; });
    const ids = Object.keys(lById);
    Object.keys(rById).forEach((id) => { if (!lById[id]) ids.push(id); });
    let adminPassword = remote.adminPassword;
    if (!adminPassword && role === "admin" && local && local.adminPassword) adminPassword = local.adminPassword;
    const out = { version: 3, session: (local && local.session) || null, adminPassword, saccos: [] };
    ids.forEach((id) => {
      const L = lById[id], R = rById[id];
      if (L && !R) { if (!confirmed("saccos", id)) out.saccos.push(L); return; }
      if (!L && R) { out.saccos.push(R); return; }
      const localWins = isDirty("saccos", id, L);
      const merged = {
        id,
        circle: localWins ? L.circle : R.circle,
        reconciliation: localWins ? L.reconciliation : R.reconciliation,
        members: [], transactions: [], verifications: [], loans: [], meetings: [],
        requests: [], proposals: [], notifications: [], audit: [],
      };
      CHILD_TABLES.forEach((t) => { const k = TABLE_KEY[t]; merged[k] = mergeChildren(t, L[k], R[k]); });
      out.saccos.push(merged);
    });
    return out;
  }

  /* ---------- read / write ---------- */
  async function hydrate() {
    await flushPush();            // upload pending local changes before pulling, so a fresh sign-up is never overwritten
    const tables = role === "admin" ? ALL_TABLES : ALL_TABLES.filter((t) => t !== "app_config");
    const results = await Promise.all(tables.map((n) => client.from(n).select("*")));
    const data = {};
    for (let i = 0; i < tables.length; i++) {
      if (results[i].error) throw results[i].error;
      data[tables[i]] = results[i].data || [];
    }
    if (role !== "admin") data.app_config = [];
    const remote = rowsToState(data, Store.state ? Store.state.session : null, role === "admin");
    Store.state = mergeState(Store.state, remote);
    if (Store.state.session && !Store.state.saccos.some((s) => s.id === Store.state.session.saccoId)) Store.state.session = null;
    lastPushed = snapshotOf(data);
    saveSnapshot(lastPushed);
    hydratedOnce = true;
    Store.saveLocal();
    lastSync = new Date();
    emit("remote");
  }

  async function upsert(table, rows) {
    if (!rows.length) return;
    const { error } = await client.from(table).upsert(rows);
    if (error) throw error;
  }
  async function prune(table, rows) {
    const { data, error } = await client.from(table).select("id");
    if (error) throw error;
    const keep = new Set(rows.map((r) => r.id));
    const stale = (data || []).filter((r) => !keep.has(r.id)).map((r) => r.id);
    if (!stale.length) return;
    const { error: delErr } = await client.from(table).delete().in("id", stale);
    if (delErr) throw delErr;
  }

  async function persist() {
    if (!client || status === "needs-setup" || status === "unavailable") return;
    if (pushPromise) { pushQueued = true; return pushPromise; }
    clearTimeout(pushTimer); pushTimer = null;
    const rows = stateToRows(Store.state);
    lastPersist = Date.now();
    const run = (async () => {
      try {
        if (role === "admin") await upsert("app_config", rows.app_config);
        await upsert("saccos", rows.saccos);
        for (const t of CHILD_TABLES) await upsert(t, rows[t]);
        if (hydratedOnce) {
          for (const t of CHILD_TABLES) await prune(t, rows[t]);
          await prune("saccos", rows.saccos);
        }
        lastPushed = snapshotOf(rows);
        saveSnapshot(lastPushed);
        lastSync = new Date();
        if (status !== "connected") setStatus("connected"); else emit();
      } catch (e) { handleErr(e); }
      finally {
        pushPromise = null;
        if (pushQueued) { pushQueued = false; queuePush(); }
      }
    })();
    pushPromise = run;
    return run;
  }

  function flushPush() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; return persist(); }
    if (pushPromise) return pushPromise;
    return Promise.resolve();
  }

  function handleErr(e) {
    const msg = String((e && e.message) || e);
    const code = e && e.code;
    if (code === "PGRST205" || /schema cache|does not exist|relation .* does not exist|could not find the table/i.test(msg)) setStatus("needs-setup", msg);
    else if (!navigator.onLine || /fetch|network|Failed to fetch/i.test(msg)) setStatus("offline", msg);
    else setStatus("error", msg);
  }

  function queuePush() {
    if (!client || status === "needs-setup" || status === "unavailable") return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = null; persist(); }, 700);
  }

  async function check() {
    if (!client) return;
    if (status !== "connected") setStatus("connecting");
    try {
      await hydrate();
      if (status !== "connected") setStatus("connected"); else emit();
      subscribe();
    } catch (e) { handleErr(e); }
  }

  function scheduleHydrate() {
    clearTimeout(hydrateTimer);
    hydrateTimer = setTimeout(() => { hydrate().catch((e) => handleErr(e)); }, 400);
  }
  function onRealtime() {
    if (Date.now() - lastPersist < 2500) return; // ignore our own echo
    scheduleHydrate();
  }

  function subscribe() {
    if (channel || !client) return;
    try {
      let ch = client.channel("saccopro-sync");
      ALL_TABLES.forEach((t) => { ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t }, onRealtime); });
      channel = ch.subscribe();
    } catch (e) { /* realtime optional; keep-alive pull still syncs */ }
  }

  function start() {
    if (started) return;
    started = true;
    if (!window.supabase) { setStatus("unavailable", "Supabase SDK not loaded"); return; }
    if (!navigator.onLine) setStatus("offline");
    try {
      client = window.supabase.createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 5 } } });
    } catch (e) { setStatus("unavailable", String(e)); return; }
    check();
    keepAlive = setInterval(() => {
      if (status === "connected") hydrate().catch(() => setStatus("offline"));
      else check();
    }, 30000);
  }

  function setRole(r) { role = r === "admin" ? "admin" : "app"; }

  window.addEventListener("online", () => { if (client) check(); });
  window.addEventListener("offline", () => setStatus("offline"));
  window.addEventListener("pagehide", () => { if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; persist(); } });
  document.addEventListener("visibilitychange", () => {
    if (!client) return;
    if (document.hidden) {
      if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; persist(); } // flush before Android can freeze the WebView
      return;
    }
    if (status === "connected") hydrate().catch(() => setStatus("offline"));
  });

  window.Cloud = {
    start, check, pushNow: persist, queuePush, flush: flushPush, setRole, SETUP_SQL, projectUrl: URL,
    onChange(fn) { listeners.add(fn); },
    get status() { return status; },
    get detail() { return detail; },
    get lastSync() { return lastSync; },
    get hydrated() { return hydratedOnce; },
    _mapping: { stateToRows, rowsToState, ALL_TABLES, CHILD_TABLES, mergeState },
  };
})();
