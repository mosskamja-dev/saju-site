// GET  /api/stats  → 실제 집계 조회
// POST /api/stats  → { event, reaction_type? } 1건 기록
import { getStore } from "@netlify/blobs";

// 항목별로 카운터를 따로 저장해서 서로 다른 이벤트끼리는 충돌하지 않게 한다.
const COUNTERS = ["saju", "share", "chat", "bone", "goosebumps", "awake"];
const EVENT_TO_COUNTER = {
  saju_submit: "saju",
  viral_share_unlock: "share",
  halbae_chat_ask: "chat",
};
const REACTIONS = ["bone", "goosebumps", "awake"];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// etag 조건부 쓰기로 +1. 동시에 쓰는 사람이 있으면 잠깐 쉬었다가 재시도한다.
async function increment(store, name) {
  for (let i = 0; i < 30; i++) {
    const cur = await store.getWithMetadata(name, { type: "json" });
    const next = (Number(cur?.data) || 0) + 1;
    const res = await store.setJSON(name, next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return next;
    await sleep(Math.random() * 15 * (i + 1));
  }
  throw new Error("busy");
}

async function readAll(store) {
  const values = await Promise.all(COUNTERS.map((c) => store.get(c, { type: "json" })));
  const n = Object.fromEntries(COUNTERS.map((c, i) => [c, Number(values[i]) || 0]));
  return {
    saju: n.saju,
    share: n.share,
    chat: n.chat,
    votes: { bone: n.bone, goosebumps: n.goosebumps, awake: n.awake },
    vote_total: n.bone + n.goosebumps + n.awake,
  };
}

export default async (req) => {
  const store = getStore({ name: "halbae-stats", consistency: "strong" });

  if (req.method === "GET") return json(await readAll(store));

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const ev = body?.event;
    let counter = EVENT_TO_COUNTER[ev];
    if (!counter && ev === "reaction_vote" && REACTIONS.includes(body.reaction_type)) {
      counter = body.reaction_type;
    }
    if (!counter) return json({ error: "unknown event" }, 400);
    try {
      await increment(store, counter);
    } catch {
      return json({ error: "busy" }, 503);
    }
    return json({ ok: true });
  }

  return json({ error: "Method Not Allowed" }, 405);
};

export const config = {
  path: "/api/stats",
  rateLimit: { windowSize: 60, windowLimit: 120 },
};
