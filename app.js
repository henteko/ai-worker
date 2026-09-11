/* ═══════════════════════════════════════════════════════
   OMOCHA WORKS — Autonomous Ops Console
   すべてブラウザ内で完結するフェイク自律オペレーションエンジン。
   外部通信は一切行わない。
   ═══════════════════════════════════════════════════════ */

"use strict";

/* ── ユーティリティ ─────────────────────────────── */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmtNum = (n) => n.toLocaleString("ja-JP");
/** 金額表示。桁が増えてもKPIタイルに収まるよう、1,000万以上は M / B で省略する */
const fmtYen = (n) => {
  n = Math.round(n);
  if (n >= 1e9) return "¥" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e7) return "¥" + (n / 1e6).toFixed(1) + "M";
  return "¥" + fmtNum(n);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EASE = "cubic-bezier(0.25, 0.9, 0.3, 1)";

/** 一時停止・再生速度に対応した待機。停止中は時間が進まず、倍速時は速く進む。 */
async function simSleep(ms) {
  let left = ms;
  while (left > 0) {
    await sleep(100);
    if (!state.paused) left -= 100 * state.speed;
  }
}

/** 再生速度を反映した実時間（ms） */
const realMs = (ms) => ms / state.speed;

/** 再生速度に追従する setInterval 相当。次回間隔は毎回その時点の速度で決まる。 */
function simInterval(fn, ms) {
  (function tick() {
    setTimeout(() => { fn(); tick(); }, realMs(ms));
  })();
}

function nowTime() {
  return new Date().toLocaleTimeString("ja-JP", { hour12: false });
}

/* ── マスタデータ ───────────────────────────────── */

const AGENT_DEFS = [
  { id: "hayate", name: "HAYATE", role: "開発・自動化",   color: "#3987e5", initial: "H" },
  { id: "kanna",  name: "KANNA",  role: "品質・レビュー", color: "#d95926", initial: "K" },
  { id: "miya",   name: "MIYA",   role: "データ分析",     color: "#199e70", initial: "M" },
  { id: "bolt",   name: "BOLT",   role: "インフラ監視",   color: "#c98500", initial: "B" },
  { id: "shiori", name: "SHIORI", role: "業務・文書",     color: "#d55181", initial: "S" },
];

const TASK_POOL = [
  ["請求書PDFの自動仕分け", "経理"],
  ["週次KPIレポートの生成", "分析"],
  ["問い合わせ23件への一次回答", "CS"],
  ["LP見出しのA/Bテスト集計", "マーケ"],
  ["在庫マスタの整合性チェック", "業務"],
  ["Slack通知バッチの改修", "開発"],
  ["経費精算56件の承認処理", "経理"],
  ["メルマガ文面のドラフト生成", "マーケ"],
  ["解約リスクスコアの再計算", "分析"],
  ["採用候補者のスクリーニング", "人事"],
  ["APIレスポンスのキャッシュ最適化", "開発"],
  ["競合価格の巡回モニタリング", "マーケ"],
  ["翌月の需要予測モデル更新", "分析"],
  ["契約書レビューの下読み", "法務"],
  ["障害レポートの自動要約", "開発"],
  ["FAQページの内容更新", "CS"],
  ["発注書ドラフト12件の作成", "業務"],
  ["セキュリティパッチの適用確認", "開発"],
  ["月次売上データのクレンジング", "分析"],
  ["社内Wikiの重複ページ統合", "業務"],
  ["広告クリエイティブの効果測定", "マーケ"],
  ["未入金アラートの送付準備", "経理"],
];

const IDLE_STATUSES = [
  "待機中",
  "次のタスクを探索中",
  "ログを監視中",
  "ナレッジベースを学習中",
  "優先度を再計算中",
];

const AMBIENT_FEED = [
  "{a} がテスト {n} 件を実行 — すべて成功",
  "{a} がダッシュボードのキャッシュを更新",
  "{a} が過去ログ {n} 件をインデックス化",
  "{a} がジョブキューを最適化 — 待ち時間 -{m}%",
  "{a} がドキュメント {n} ページを自動整理",
  "{a} が異常値スキャンを完了 — 問題なし",
];

const INCIDENTS = [
  "決済APIのレイテンシが上昇しています",
  "バッチジョブ #4412 が失敗しました",
  "ストレージ使用率が 91% に到達",
  "外部連携APIのレート制限を検知",
];

/* ── 状態 ───────────────────────────────────────── */

const SPEEDS = [0.5, 1, 2, 4];

const state = {
  paused: false,
  speed: 2, // 既定は2倍速
  incident: false,
  taskSeq: 1041,
  tasks: [],
  kpi: { done: 127, hours: 38.4, revenue: 2847000, sla: 99.4 },
  slaBase: 99.4,
  recentDone: 0, // スループット計算用
  uptimeSec: 127 * 86400 + 4 * 3600 + 12 * 60 + 33,
};

const agents = [];

/* ═══════════════════════════════════════════════════
   エージェント名簿・カーソル
   ═══════════════════════════════════════════════════ */

function buildAgents() {
  const list = $("#agentList");
  const layer = $("#cursorLayer");

  AGENT_DEFS.forEach((def) => {
    const li = document.createElement("li");
    li.className = "agent";
    li.style.color = def.color;
    li.innerHTML = `
      <span class="agent-avatar" style="background:${def.color}">${def.initial}</span>
      <span class="agent-name" style="color:var(--ink)">${def.name}<span class="agent-role">${def.role}</span></span>
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="agent-status">待機中</span>`;
    list.appendChild(li);

    const cur = document.createElement("div");
    cur.className = "ai-cursor";
    cur.innerHTML = `
      <svg class="arrow" width="18" height="18" viewBox="0 0 18 18">
        <path d="M2 1 L16 8.5 L9.5 10 L7 17 Z" fill="${def.color}" stroke="#0f131a" stroke-width="1.2"/>
      </svg>
      <span class="ctag" style="background:${def.color}">${def.name}<span class="cstate"></span></span>`;
    layer.appendChild(cur);

    const agent = {
      def,
      el: li,
      statusEl: $(".agent-status", li),
      cursorEl: cur,
      stateEl: $(".cstate", cur),
      x: rand(40, Math.max(80, innerWidth - 120)),
      y: rand(80, Math.max(120, innerHeight - 160)),
      busy: false,
    };
    cur.style.transform = `translate(${agent.x}px, ${agent.y}px)`;
    agents.push(agent);
  });
}

function setStatus(agent, text, working) {
  agent.statusEl.textContent = text;
  agent.el.classList.toggle("working", !!working);
}

function setCursorState(agent, text) {
  agent.stateEl.textContent = text ? " · " + text : "";
}

function cursorTo(agent, x, y, dur = 1100) {
  agent.x = x;
  agent.y = y;
  agent.cursorEl.style.transitionDuration = realMs(dur) + "ms";
  agent.cursorEl.style.transform = `translate(${x}px, ${y}px)`;
  return simSleep(dur + 60);
}

function clickRipple(x, y, color) {
  const r = document.createElement("div");
  r.className = "click-ripple";
  r.style.left = x + "px";
  r.style.top = y + "px";
  if (color) r.style.borderColor = color;
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 600);
}

/* ═══════════════════════════════════════════════════
   タスク・カード
   ═══════════════════════════════════════════════════ */

const colBody = (col) => $(`[data-body="${col}"]`);

function makeTask(col) {
  const [title, tag] = pick(TASK_POOL);
  const value = randInt(8, 140) * 1000;
  const task = {
    id: state.taskSeq++,
    code: "OW-" + state.taskSeq,
    title, tag, value,
    hours: +(value / 150000 + rand(0.1, 0.6)).toFixed(1),
    col,
    locked: false,
    assignee: null,
    author: null,
    needsReview: false,
    done: false,
    el: null,
  };

  const el = document.createElement("div");
  el.className = "tcard";
  el.innerHTML = `
    <span class="tag">${tag}</span>
    <div class="ttl">${title}</div>
    <div class="prog"><div class="prog-fill"></div></div>
    <div class="typing"><span class="typing-dots"><i></i><i></i><i></i></span><span class="typing-who"></span></div>
    <div class="meta">
      <span class="tid mono">${task.code}</span>
      <span class="tval mono">¥${fmtNum(value)}</span>
      <span class="assignee" hidden></span>
    </div>`;
  task.el = el;
  state.tasks.push(task);
  return task;
}

function spawnTask(col, animate = true) {
  const task = makeTask(col);
  if (animate) task.el.classList.add("spawn");
  colBody(col).prepend(task.el);
  setTimeout(() => task.el.classList.remove("spawn"), 600);
  updateCounts();
  return task;
}

function setAssignee(task, agent) {
  const av = $(".assignee", task.el);
  if (agent) {
    av.hidden = false;
    av.textContent = agent.def.initial;
    av.style.background = agent.def.color;
  } else {
    av.hidden = true;
  }
  task.assignee = agent || null;
}

function updateCounts() {
  const counts = { backlog: 0, doing: 0, review: 0, done: 0 };
  state.tasks.forEach((t) => { if (counts[t.col] != null) counts[t.col]++; });
  Object.entries(counts).forEach(([col, n]) => {
    $(`[data-count="${col}"]`).textContent = n;
  });
}

/** カードをクローン飛行でカラム間移動し、カーソルも同期して動かす */
async function flyCard(task, destCol, agent, dur = 800) {
  const card = task.el;
  const first = card.getBoundingClientRect();

  const clone = card.cloneNode(true);
  clone.classList.add("flying", "lifted");
  clone.style.width = first.width + "px";
  clone.style.left = first.left + "px";
  clone.style.top = first.top + "px";
  document.body.appendChild(clone);
  card.style.visibility = "hidden";

  colBody(destCol).prepend(card);
  task.col = destCol;
  updateCounts();
  const last = card.getBoundingClientRect();

  clone.getBoundingClientRect(); // reflow
  const rd = realMs(dur);
  clone.style.transition = `left ${rd}ms ${EASE}, top ${rd}ms ${EASE}, width ${rd}ms ${EASE}`;
  clone.style.left = last.left + "px";
  clone.style.top = last.top + "px";
  clone.style.width = last.width + "px";

  if (agent) {
    agent.cursorEl.classList.add("grabbing");
    cursorTo(agent, last.left + 34, last.top + 16, dur);
  }

  await simSleep(dur + 60);
  clone.remove();
  card.style.visibility = "";
  if (agent) agent.cursorEl.classList.remove("grabbing");
}

/* ═══════════════════════════════════════════════════
   フィード・トースト
   ═══════════════════════════════════════════════════ */

function feed(html, opts = {}) {
  const list = $("#feedList");
  const li = document.createElement("li");
  li.className = "feed-item" + (opts.kind ? " " + opts.kind : "");
  li.innerHTML = `
    <span class="fdot" style="${opts.color ? "background:" + opts.color : ""}"></span>
    <span><span class="ftext">${html}</span><span class="ftime mono">${nowTime()}</span></span>`;
  list.prepend(li);
  while (list.children.length > 45) list.lastChild.remove();
}

function toast({ kind = "info", icon = "●", title, body, ms = 5200 }) {
  const stack = $("#toastStack");
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = `
    <div class="toast-title"><span class="ticon">${icon}</span>${title}</div>
    ${body ? `<div class="toast-body">${body}</div>` : ""}
    <div class="toast-timer" style="animation-duration:${realMs(ms)}ms"></div>`;
  stack.appendChild(el);
  while (stack.children.length > 4) stack.firstChild.remove();
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 350);
  }, realMs(ms));
}

/* ═══════════════════════════════════════════════════
   KPIタイル
   ═══════════════════════════════════════════════════ */

const KPI_DEFS = [
  { key: "done",    label: "本日の完了タスク",     suffix: "件",  fmt: (v) => fmtNum(Math.round(v)) },
  { key: "hours",   label: "自動化された作業時間", suffix: "h",   fmt: (v) => v.toFixed(1) },
  { key: "revenue", label: "売上インパクト",       suffix: "",    fmt: fmtYen },
  { key: "sla",     label: "SLA遵守率",            suffix: "%",   fmt: (v) => v.toFixed(1) },
];

const kpiEls = {};
const kpiHistory = {};

function buildKpis() {
  const row = $("#kpiRow");
  KPI_DEFS.forEach((def) => {
    const cur = state.kpi[def.key];
    // 履歴を現在値の約90%→100%で滑らかにシード
    kpiHistory[def.key] = Array.from({ length: 24 }, (_, i) => {
      const p = i / 23;
      const base = def.key === "sla" ? cur - 0.4 + p * 0.4 : cur * (0.88 + p * 0.12);
      return base * (def.key === "sla" ? 1 : rand(0.985, 1.015));
    });

    const el = document.createElement("div");
    el.className = "kpi";
    el.innerHTML = `
      <div class="kpi-head"><span>${def.label}</span><span class="kpi-delta up">▲ —</span></div>
      <div class="kpi-value mono"><span class="kpi-num">${def.fmt(cur)}</span><span class="kpi-suffix">${def.suffix}</span></div>
      <svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none">
        <polygon class="spark-fill"></polygon>
        <polyline></polyline>
      </svg>`;
    row.appendChild(el);
    kpiEls[def.key] = {
      def, el,
      num: $(".kpi-num", el),
      delta: $(".kpi-delta", el),
      line: $("polyline", el),
      fill: $(".spark-fill", el),
      shown: cur,
    };
    drawSpark(def.key);
  });
}

function drawSpark(key) {
  const h = kpiHistory[key];
  const min = Math.min(...h), max = Math.max(...h);
  const span = max - min || 1;
  const pts = h.map((v, i) =>
    `${(i / (h.length - 1)) * 100},${26 - ((v - min) / span) * 22}`
  );
  kpiEls[key].line.setAttribute("points", pts.join(" "));
  kpiEls[key].fill.setAttribute("points", `0,28 ${pts.join(" ")} 100,28`);
}

function updateDelta(key) {
  const h = kpiHistory[key];
  const k = kpiEls[key];
  const first = h[0], last = h[h.length - 1];
  let text, up;
  if (key === "sla") {
    const d = last - first;
    up = d >= 0;
    text = `${up ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}pt`;
  } else {
    const d = first ? ((last - first) / first) * 100 : 0;
    up = d >= 0;
    text = `${up ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}%`;
  }
  k.delta.textContent = text;
  // SLAは下がったら赤、それ以外は上がったら緑
  k.delta.className = "kpi-delta " + (up ? "up" : "down");
}

function bumpKpi(key, newVal) {
  const k = kpiEls[key];
  state.kpi[key] = newVal;
  const from = k.shown, to = newVal;
  const t0 = performance.now(), dur = 700;
  function frame(t) {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    k.num.textContent = k.def.fmt(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(frame);
    else k.shown = to;
  }
  requestAnimationFrame(frame);
  k.el.classList.remove("flash");
  void k.el.offsetWidth;
  k.el.classList.add("flash");
}

/** 6秒ごとに履歴スナップショット */
function kpiSnapshotLoop() {
  simInterval(() => {
    if (state.paused) return;
    // SLAはベースへゆっくり回帰
    if (!state.incident && state.kpi.sla < state.slaBase) {
      state.kpi.sla = Math.min(state.slaBase, state.kpi.sla + 0.15);
      kpiEls.sla.num.textContent = KPI_DEFS[3].fmt(state.kpi.sla);
      kpiEls.sla.shown = state.kpi.sla;
    }
    KPI_DEFS.forEach((d) => {
      const h = kpiHistory[d.key];
      h.push(state.kpi[d.key]);
      if (h.length > 24) h.shift();
      drawSpark(d.key);
      updateDelta(d.key);
    });
  }, 6000);
}

/* ═══════════════════════════════════════════════════
   スループットチャート
   ═══════════════════════════════════════════════════ */

const chart = { data: [], max: 48, phase: rand(0, Math.PI * 2) };

function chartValue() {
  chart.phase += 0.25;
  let v = 42 + Math.sin(chart.phase) * 5 + rand(-3, 3) + state.recentDone * 2.5;
  if (state.incident) v -= rand(8, 14);
  state.recentDone = Math.max(0, state.recentDone - 1);
  return Math.max(8, v);
}

function initChart() {
  const now = Date.now();
  for (let i = 0; i < chart.max; i++) {
    chart.data.push({ t: now - (chart.max - i) * 3500, v: chartValue() });
  }
  renderChart();

  simInterval(() => {
    if (state.paused) return;
    chart.data.push({ t: Date.now(), v: chartValue() });
    if (chart.data.length > chart.max) chart.data.shift();
    renderChart();
  }, 3500);

  const wrap = $("#chartWrap");
  wrap.addEventListener("mousemove", onChartHover);
  wrap.addEventListener("mouseleave", () => {
    $("#chartTip").hidden = true;
    const ch = $("#chartCross");
    if (ch) ch.setAttribute("opacity", "0");
  });
  addEventListener("resize", renderChart);
}

function chartGeom() {
  const wrap = $("#chartWrap");
  const w = wrap.clientWidth - 12, h = wrap.clientHeight - 6;
  const vals = chart.data.map((d) => d.v);
  const min = Math.min(...vals) - 4, max = Math.max(...vals) + 4;
  const x = (i) => (i / (chart.max - 1)) * (w - 34) + 2;
  const y = (v) => 8 + (1 - (v - min) / (max - min)) * (h - 30);
  return { w, h, min, max, x, y };
}

function renderChart() {
  const svg = $("#chartSvg");
  if (!chart.data.length) return;
  const { w, h, min, max, x, y } = chartGeom();
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const pts = chart.data.map((d, i) => `${x(i)},${y(d.v)}`);
  const last = chart.data[chart.data.length - 1];

  // Yグリッド3本
  let grid = "";
  for (let g = 0; g < 3; g++) {
    const gv = min + ((max - min) * (g + 1)) / 4;
    const gy = y(gv);
    grid += `<line x1="2" y1="${gy}" x2="${w - 32}" y2="${gy}" stroke="rgba(255,255,255,0.06)"/>
             <text x="${w - 26}" y="${gy + 3}" fill="#68738a" font-size="9" font-family="ui-monospace,monospace">${Math.round(gv)}</text>`;
  }

  // X時刻ラベル
  let xlabels = "";
  [0, 16, 32, chart.max - 1].forEach((i) => {
    if (!chart.data[i]) return;
    const tm = new Date(chart.data[i].t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
    xlabels += `<text x="${x(i)}" y="${h - 2}" fill="#68738a" font-size="9" text-anchor="middle" font-family="ui-monospace,monospace">${tm}</text>`;
  });

  svg.innerHTML = `
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3987e5" stop-opacity="0.28"/>
        <stop offset="1" stop-color="#3987e5" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${grid}${xlabels}
    <polygon fill="url(#areaGrad)" points="${x(0)},${h - 14} ${pts.join(" ")} ${x(chart.max - 1)},${h - 14}"/>
    <polyline fill="none" stroke="#3987e5" stroke-width="2" stroke-linejoin="round" points="${pts.join(" ")}"/>
    <line id="chartCross" x1="0" y1="8" x2="0" y2="${h - 16}" stroke="rgba(255,255,255,0.25)" opacity="0"/>
    <circle id="chartHoverDot" r="4" fill="#3987e5" stroke="#0f131a" stroke-width="1.5" opacity="0"/>
    <circle cx="${x(chart.max - 1)}" cy="${y(last.v)}" r="3.5" fill="#3987e5" stroke="#0f131a" stroke-width="1.5"/>`;

  $("#chartNow").textContent = last.v.toFixed(1);
}

function onChartHover(e) {
  if (!chart.data.length) return;
  const wrap = $("#chartWrap");
  const rect = wrap.getBoundingClientRect();
  const { x, y } = chartGeom();
  const relX = e.clientX - rect.left;
  let best = 0, bestDist = Infinity;
  chart.data.forEach((d, i) => {
    const dist = Math.abs(x(i) - relX);
    if (dist < bestDist) { bestDist = dist; best = i; }
  });
  const d = chart.data[best];
  const cx = x(best), cy = y(d.v);

  const cross = $("#chartCross");
  const dot = $("#chartHoverDot");
  if (cross) { cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("opacity", "1"); }
  if (dot) { dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); dot.setAttribute("opacity", "1"); }

  const tip = $("#chartTip");
  tip.hidden = false;
  const tm = new Date(d.t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  tip.innerHTML = `${tm} — <b>${d.v.toFixed(1)}</b> タスク/時`;
  tip.style.left = Math.min(Math.max(cx, 60), rect.width - 60) + "px";
  tip.style.top = cy + "px";
}

/* ═══════════════════════════════════════════════════
   エージェント行動ループ
   ═══════════════════════════════════════════════════ */

function findWorkTask() {
  return state.tasks.find((t) => !t.locked && !t.done &&
    (t.col === "backlog" || (t.col === "doing" && !t.assignee)));
}

function findReviewTask(agent) {
  return state.tasks.find((t) => !t.locked && !t.done && t.col === "review" &&
    t.needsReview && t.author !== agent);
}

async function moveToCard(agent, task, dur = 1000) {
  const r = task.el.getBoundingClientRect();
  await cursorTo(agent, r.left + rand(24, 60), r.top + rand(10, 24), dur);
}

async function doWork(agent, task) {
  agent.busy = true;
  task.locked = true;

  setStatus(agent, "タスクへ移動中…", false);
  await moveToCard(agent, task);
  const r0 = task.el.getBoundingClientRect();
  clickRipple(r0.left + 40, r0.top + 18, agent.def.color);
  await simSleep(250);

  if (task.col === "backlog") {
    setCursorState(agent, "ドラッグ中");
    await flyCard(task, "doing", agent);
    setCursorState(agent, "");
  }
  setAssignee(task, agent);
  task.el.classList.add("working");
  setStatus(agent, `作業中 — ${task.title}`, true);
  setCursorState(agent, "作業中");
  feed(`<b>${agent.def.name}</b> が「${task.title}」に着手`, { color: agent.def.color });

  // 進捗バー
  const fill = $(".prog-fill", task.el);
  fill.style.background = agent.def.color;
  const dur = rand(9000, 20000);
  let elapsed = 0, wiggleAt = 2600;
  while (elapsed < dur) {
    await simSleep(300);
    elapsed += 300;
    fill.style.width = Math.min(100, (elapsed / dur) * 100) + "%";
    if (elapsed > wiggleAt) {
      wiggleAt += rand(2200, 3600);
      const r = task.el.getBoundingClientRect();
      cursorTo(agent, r.left + rand(16, r.width - 40), r.top + rand(6, r.height - 10), 700);
    }
  }

  // レビューへ
  task.el.classList.remove("working");
  fill.style.width = "0%";
  setStatus(agent, "レビューへ提出中…", true);
  setCursorState(agent, "ドラッグ中");
  await flyCard(task, "review", agent);
  setCursorState(agent, "");
  task.author = agent;
  task.needsReview = true;
  task.locked = false;
  feed(`<b>${agent.def.name}</b> が「${task.title}」をレビューへ提出`, { color: agent.def.color });

  setStatus(agent, pick(IDLE_STATUSES), false);
  agent.busy = false;
}

async function doReview(agent, task) {
  agent.busy = true;
  task.locked = true;

  setStatus(agent, "レビューへ移動中…", false);
  await moveToCard(agent, task);
  const r = task.el.getBoundingClientRect();
  clickRipple(r.left + 40, r.top + 18, agent.def.color);

  task.el.classList.add("reviewing");
  $(".typing-who", task.el).textContent = `${agent.def.name} がレビュー中`;
  $(".typing", task.el).style.color = agent.def.color;
  setStatus(agent, `レビュー中 — ${task.title}`, true);
  setCursorState(agent, "レビュー中");
  feed(`<b>${agent.def.name}</b> が「${task.title}」のレビューを開始`, { color: agent.def.color });

  await simSleep(rand(4500, 9000));
  task.el.classList.remove("reviewing");
  setCursorState(agent, "");

  if (Math.random() < 0.85) {
    // 承認 → 完了
    setCursorState(agent, "承認");
    await flyCard(task, "done", agent);
    setCursorState(agent, "");
    completeTask(task, agent);
  } else {
    // 差し戻し
    feed(`<b>${agent.def.name}</b> が「${task.title}」に修正を依頼 — 差し戻し`, { kind: "warn", color: agent.def.color });
    if (Math.random() < 0.6) {
      managerSay("おっと、差し戻しですか。品質第一、いいことです。", { mood: "worried" });
    }
    await flyCard(task, "doing", agent);
    setAssignee(task, null);
    task.needsReview = false;
    task.locked = false;
  }

  setStatus(agent, pick(IDLE_STATUSES), false);
  agent.busy = false;
}

function completeTask(task, reviewer) {
  task.done = true;
  task.needsReview = false;
  task.el.classList.add("completed");
  updateCounts();

  const author = task.author ? task.author.def.name : "AI";
  feed(`<b>${reviewer.def.name}</b> が承認 — 「${task.title}」完了`, { color: reviewer.def.color });
  toast({
    kind: "success", icon: "✓",
    title: "タスク完了",
    body: `「${task.title}」<br>担当: <b>${author}</b> ／ 売上インパクト <b>+¥${fmtNum(task.value)}</b>`,
  });

  bumpKpi("done", state.kpi.done + 1);
  bumpKpi("hours", +(state.kpi.hours + task.hours).toFixed(1));
  bumpKpi("revenue", state.kpi.revenue + task.value);
  state.recentDone += 2;

  if (Math.random() < 0.4) {
    managerSay(pick(MGR_PRAISE)(task, reviewer), { mood: "happy" });
  }

  // マイルストーン
  const n = Math.round(state.kpi.done);
  if (n % 25 === 0) {
    setTimeout(() => {
      toast({ kind: "info", icon: "✦", title: "マイルストーン達成", body: `本日の完了タスクが <b>${n}件</b> を突破しました` });
      feed(`本日の完了タスクが <b>${n}件</b> を突破`, {});
      managerSay(`本日${n}件目！ケーキでも注文しましょうか。`, { mood: "happy", ms: 6000 });
    }, realMs(1200));
  }

  // 完了カードは時間差で退場、完了列は最大6枚
  const doneTasks = state.tasks.filter((t) => t.col === "done");
  doneTasks.slice(6).forEach((t) => removeTask(t, 0));
  removeTask(task, rand(14000, 20000));

  refillBacklog();
}

function removeTask(task, delay) {
  setTimeout(() => {
    task.el.classList.add("removing");
    setTimeout(() => {
      task.el.remove();
      const i = state.tasks.indexOf(task);
      if (i >= 0) state.tasks.splice(i, 1);
      updateCounts();
    }, 550);
  }, realMs(delay));
}

function refillBacklog() {
  const backlog = state.tasks.filter((t) => t.col === "backlog").length;
  if (backlog < 3) {
    setTimeout(() => {
      if (state.paused) return;
      if (state.tasks.filter((t) => t.col === "backlog").length >= 5) return;
      const t = spawnTask("backlog");
      feed(`新規タスク「${t.title}」がバックログに追加`, {});
    }, realMs(rand(2000, 6000)));
  }
}

/** バックログが枯れないよう定期補充 */
function backlogWatchLoop() {
  simInterval(() => {
    if (state.paused) return;
    refillBacklog();
  }, 9000);
}

async function doIdle(agent) {
  agent.busy = true;
  setStatus(agent, pick(IDLE_STATUSES), false);
  // ボード周辺をふらっと移動
  const main = $(".main").getBoundingClientRect();
  await cursorTo(
    agent,
    rand(main.left + 40, main.right - 120),
    rand(main.top + 60, main.bottom - 80),
    rand(1200, 2000)
  );
  await simSleep(rand(1000, 3000));
  agent.busy = false;
}

async function agentLoop(agent) {
  await simSleep(rand(600, 4500)); // 開始をずらす
  while (true) {
    if (state.paused || agent.busy) { await simSleep(400); continue; }

    const reviewTask = findReviewTask(agent);
    const workTask = findWorkTask();

    if (reviewTask && (Math.random() < 0.5 || !workTask)) {
      await doReview(agent, reviewTask);
    } else if (workTask) {
      await doWork(agent, workTask);
    } else {
      await doIdle(agent);
    }
    await simSleep(rand(1200, 4000));
  }
}

/* ═══════════════════════════════════════════════════
   インシデント
   ═══════════════════════════════════════════════════ */

async function incidentLoop() {
  await simSleep(rand(30000, 50000));
  while (true) {
    await runIncident();
    await simSleep(rand(60000, 110000));
  }
}

async function runIncident() {
  const msg = pick(INCIDENTS);
  const responder = agents.find((a) => !a.busy) || agents[3];
  responder.busy = true;
  state.incident = true;

  const banner = $("#alertBanner");
  banner.hidden = false;
  banner.classList.remove("resolved", "leaving");
  $("#alertIcon").textContent = "⚠";
  $("#alertText").textContent = msg;
  $("#alertAgent").textContent = `${responder.def.name} が対応中…`;

  feed(`<b>ALERT</b> ${msg}`, { kind: "warn", color: "var(--crit)" });
  toast({ kind: "warn", icon: "⚠", title: "インシデント検知", body: msg });
  setStatus(responder, "🚨 インシデント対応中", true);
  setCursorState(responder, "緊急対応");
  managerSay(`うわっ、${msg}！？ …${responder.def.name}くん、頼みました！`, { mood: "worried", ms: 6500 });

  // カーソルがアラートへ急行
  const br = banner.getBoundingClientRect();
  await cursorTo(responder, br.left + br.width / 2, br.top + br.height + 8, 450);
  clickRipple(responder.x, responder.y, "#d03b3b");

  // SLAが下がる
  bumpKpi("sla", +(state.kpi.sla - rand(0.5, 1.3)).toFixed(1));

  await simSleep(rand(9000, 15000));

  // 復旧
  banner.classList.add("resolved");
  $("#alertIcon").textContent = "✓";
  $("#alertText").textContent = "復旧しました — " + msg;
  $("#alertAgent").textContent = `対応: ${responder.def.name}`;
  feed(`<b>${responder.def.name}</b> がインシデントを解決 — 正常稼働に復帰`, { color: responder.def.color });
  toast({ kind: "success", icon: "✓", title: "インシデント解決", body: `対応: <b>${responder.def.name}</b> ／ 影響は自動的に緩和されました` });
  managerSay(`ふう…${responder.def.name}くん、お見事でした。肝が冷えました…`, { mood: "happy" });

  await simSleep(2500);
  banner.classList.add("leaving");
  await simSleep(450);
  banner.hidden = true;
  state.incident = false;

  setStatus(responder, pick(IDLE_STATUSES), false);
  setCursorState(responder, "");
  responder.busy = false;
}

/* ═══════════════════════════════════════════════════
   アンビエント演出（時計・同期・ゲージ・小ネタフィード）
   ═══════════════════════════════════════════════════ */

function clockLoop() {
  const clock = $("#clock");
  const uptime = $("#uptime");
  setInterval(() => {
    clock.textContent = nowTime();
    if (!state.paused) state.uptimeSec += state.speed;
    const s = Math.floor(state.uptimeSec);
    const d = Math.floor(s / 86400);
    const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    uptime.textContent = `${d}日 ${hh}:${mm}:${ss}`;
  }, 1000);
}

function syncLoop() {
  const text = $("#syncText");
  simInterval(() => {
    if (state.paused) return;
    text.textContent = "同期中…";
    setTimeout(() => { text.textContent = "同期済み"; }, realMs(1300));
  }, 8000);
}

const GAUGES = [
  { label: "CPU",        base: 42, jitter: 18 },
  { label: "メモリ",     base: 61, jitter: 8 },
  { label: "APIクォータ", base: 37, jitter: 12 },
];

function buildGauges() {
  const panel = $("#sysPanel");
  GAUGES.forEach((g) => {
    const row = document.createElement("div");
    row.className = "gauge-row";
    row.innerHTML = `
      <div class="gauge-label"><span>${g.label}</span><span class="gauge-val mono">—</span></div>
      <div class="gauge-track"><div class="gauge-fill"></div></div>`;
    panel.appendChild(row);
    g.valEl = $(".gauge-val", row);
    g.fillEl = $(".gauge-fill", row);
  });

  simInterval(() => {
    if (state.paused) return;
    GAUGES.forEach((g) => {
      let v = g.base + rand(-g.jitter, g.jitter);
      if (state.incident && g.label === "CPU") v = rand(86, 96);
      v = Math.max(3, Math.min(98, v));
      g.valEl.textContent = Math.round(v) + "%";
      g.fillEl.style.width = v + "%";
      g.fillEl.classList.toggle("hot", v > 85);
    });
  }, 2200);
  // 初回
  GAUGES.forEach((g) => {
    g.valEl.textContent = Math.round(g.base) + "%";
    g.fillEl.style.width = g.base + "%";
  });
}

function ambientFeedLoop() {
  simInterval(() => {
    if (state.paused || Math.random() < 0.4) return;
    const a = pick(agents);
    const line = pick(AMBIENT_FEED)
      .replace("{a}", `<b>${a.def.name}</b>`)
      .replace("{n}", randInt(12, 240))
      .replace("{m}", randInt(4, 23));
    feed(line, { color: a.def.color });
  }, 14000);
}

/* ═══════════════════════════════════════════════════
   マネージャーマスコット「KACHO」
   ═══════════════════════════════════════════════════ */

const MGR = { el: null, bubble: null, text: null, queue: [], talking: false, clicks: 0 };

const MGR_OPINIONS = [
  () => `本日 ${fmtNum(Math.round(state.kpi.done))}件完了。良いペースですね。`,
  () => `売上インパクト ¥${fmtNum(Math.round(state.kpi.revenue))}。役員会で自慢しておきます。`,
  () => `SLA ${state.kpi.sla.toFixed(1)}%。この調子でお願いします。`,
  () => `自動化された作業時間、もう ${state.kpi.hours.toFixed(1)}h ですか。人間なら過労です。`,
  () => `${pick(agents).def.name}くん、今日も冴えてますね。`,
  () => `スループット ${chart.data.length ? chart.data[chart.data.length - 1].v.toFixed(0) : "—"} タスク/時。悪くない数字です。`,
  () => `私の仕事は…見守ることです。`,
  () => `「進捗どうですか」と聞かなくていい職場、最高ですね。`,
  () => `人間のみなさんは、休んでいて大丈夫ですよ。`,
  () => `全員よく働く…私が育てました（設定です）。`,
];

const MGR_PRAISE = [
  (t, r) => `「${t.title}」完了、承認済みです。`,
  (t, r) => `+¥${fmtNum(t.value)}、確かに記録しました。`,
  (t, r) => `${r.def.name}くんのレビュー、丁寧で助かります。`,
  (t, r) => `この調子なら今期の目標、前倒しできますね。`,
];

function managerSay(text, opts = {}) {
  if (MGR.queue.length >= 2) MGR.queue.shift();
  MGR.queue.push({ text, mood: opts.mood || "normal", ms: opts.ms || 4800 });
  processMgrQueue();
}

async function processMgrQueue() {
  if (MGR.talking) return;
  MGR.talking = true;
  while (MGR.queue.length) {
    const { text, mood, ms } = MGR.queue.shift();
    MGR.el.dataset.mood = mood;
    MGR.el.classList.remove("talking");
    void MGR.el.offsetWidth;
    MGR.el.classList.add("talking");

    MGR.bubble.hidden = false;
    MGR.bubble.classList.remove("pop", "leaving");
    void MGR.bubble.offsetWidth;
    MGR.bubble.classList.add("pop");

    MGR.text.textContent = "";
    for (const ch of text) {
      MGR.text.textContent += ch;
      await sleep(realMs(26));
    }
    await sleep(realMs(ms));
  }
  MGR.bubble.classList.add("leaving");
  await sleep(260);
  MGR.bubble.hidden = true;
  MGR.bubble.classList.remove("leaving");
  MGR.el.dataset.mood = "normal";
  MGR.el.classList.remove("talking");
  MGR.talking = false;
}

function setupManager() {
  MGR.el = $("#manager");
  MGR.bubble = $("#mgrBubble");
  MGR.text = $("#mgrText");

  $("#mgrChar").addEventListener("click", () => {
    MGR.clicks++;
    if (MGR.clicks >= 5 && MGR.clicks % 5 === 0) {
      managerSay("……そんなにクリックしても、給料は上がりませんよ？", { mood: "worried" });
    } else {
      managerSay(pick(MGR_OPINIONS)(), { mood: Math.random() < 0.6 ? "happy" : "normal" });
    }
  });

  // 定期的にKPIを見て所感を述べる
  simInterval(() => {
    if (state.paused || MGR.talking || Math.random() < 0.45) return;
    managerSay(pick(MGR_OPINIONS)(), { mood: Math.random() < 0.5 ? "happy" : "normal" });
  }, 26000);

  setTimeout(() => {
    managerSay("マネージャーのKACHOです。チームは全自動で回しています。私は見てるだけです。", { mood: "happy", ms: 6000 });
  }, 4500);
}

/* ═══════════════════════════════════════════════════
   再生速度
   ═══════════════════════════════════════════════════ */

const SPEED_COMMENTS = {
  0.5: "ゆっくり見守るのも、いいものです。",
  1:   "等速ですか。じっくり眺める日ですね。",
  2:   "標準速度に戻しました。",
  4:   "4倍速…私の目が追いつきません。",
};

function setSpeed(speed) {
  if (!SPEEDS.includes(speed) || speed === state.speed) return;
  state.speed = speed;
  document.documentElement.style.setProperty("--speed", speed);
  $$("#speedCtl button").forEach((b) => {
    b.setAttribute("aria-pressed", Number(b.dataset.speed) === speed);
  });
  managerSay(SPEED_COMMENTS[speed], { mood: speed >= 2 ? "worried" : "normal", ms: 3500 });
}

function setupSpeed() {
  $("#speedCtl").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-speed]");
    if (btn) setSpeed(Number(btn.dataset.speed));
  });
}

/* ═══════════════════════════════════════════════════
   一時停止
   ═══════════════════════════════════════════════════ */

function setupPause() {
  const btn = $("#pauseBtn");
  btn.addEventListener("click", () => {
    state.paused = !state.paused;
    document.body.classList.toggle("paused", state.paused);
    btn.setAttribute("aria-pressed", state.paused);
    $("#pauseIcon").textContent = state.paused ? "▶" : "❚❚";
    $("#pauseLabel").textContent = state.paused ? "再開" : "一時停止";
    $("#syncText").textContent = state.paused ? "停止中" : "同期済み";
    agents.forEach((a) => {
      if (state.paused) setCursorState(a, "停止中");
      else setCursorState(a, "");
    });
    if (state.paused) {
      managerSay("休憩ですね。私も一旦お茶にします。", { mood: "normal", ms: 6000 });
    } else {
      managerSay("さあ、再開しましょう！", { mood: "happy", ms: 3500 });
    }
  });
}

/* ═══════════════════════════════════════════════════
   初期化
   ═══════════════════════════════════════════════════ */

function seedBoard() {
  for (let i = 0; i < 5; i++) spawnTask("backlog", false);
  spawnTask("doing", false);
  const rv = spawnTask("review", false);
  rv.needsReview = true;
  rv.author = null;
  for (let i = 0; i < 2; i++) {
    const t = spawnTask("done", false);
    t.done = true;
    t.el.classList.add("completed");
  }
  updateCounts();
}

function seedFeed() {
  feed("<b>SHIORI</b> が「日次バックアップの完了確認」を完了", { color: "#d55181" });
  feed("<b>MIYA</b> が朝会レポートを自動生成 — 経営層へ配信済み", { color: "#199e70" });
  feed("<b>BOLT</b> が夜間バッチ 14 件の正常終了を確認", { color: "#c98500" });
  feed("自律モード <b>LEVEL 3</b> で稼働中 — 人間の承認は不要です", {});
}

function init() {
  buildAgents();
  buildKpis();
  buildGauges();
  seedBoard();
  seedFeed();
  initChart();
  clockLoop();
  syncLoop();
  kpiSnapshotLoop();
  ambientFeedLoop();
  backlogWatchLoop();
  setupPause();
  setupSpeed();
  setupManager();

  agents.forEach((a) => agentLoop(a));
  incidentLoop();

  setTimeout(() => {
    toast({
      kind: "info", icon: "◆",
      title: "自律オペレーション稼働中",
      body: "5体のAIエージェントがタスクを自動処理しています。<b>あなたは見ているだけでOKです。</b>",
      ms: 7000,
    });
  }, 1500);
}

init();
