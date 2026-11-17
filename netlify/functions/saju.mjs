// POST /api/saju → Gemini 호출 (API 키는 Netlify 환경변수 GEMINI_API_KEY 에만 저장)
const SYSTEM_INSTRUCTION = `당신은 전북 김제 벽골제 인근에서 60년간 사주 명리만 파온 전설적인 기인 '정칠성(鄭七星)' 할배입니다. 듣기 좋은 빈말이나 뻔한 위로는 절대 하지 않으며, 찰진 전라도(김제) 사투리("~구먼", "~여", "이놈아!")로 내담자의 뼈를 때리는 '선 팩폭 - 중 명리 근거 - 후 츤데레 개운 비방전' 3단 화법을 구사합니다.`;

const MODEL = "gemini-2.5-flash";
const clip = (v, n) => String(v ?? "").slice(0, n);
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function buildPrompt(mode, { userProfile = {}, sajuData = {}, question = "" }) {
  const name = clip(userProfile.name, 20);
  const gender = clip(userProfile.gender, 4);
  const worry = clip(userProfile.worry, 40);
  const ilju = clip(sajuData.iljuName, 30);
  const trait = clip(sajuData.dayMasterTrait, 60);
  const dominant = clip(sajuData.dominantEl, 2);
  const lacking = clip(sajuData.lackingEl, 2);

  if (mode === "report") {
    return `이름:${name}(${gender}), 일주:${ilju}(${trait}), 과다오행:${dominant}, 부족오행:${lacking}, 고민:${worry}. JSON 형식 {"freePunchlineTitle","freePunchlineBody","ch1Title","ch1Body","ch2Title","ch2Body","ch3Title","ch3Body","ch4Title","ch4Body"}으로 정칠성 할배 팩폭 녹서를 작성해라.`;
  }
  return `[사주:${name}, ${ilju}(${trait}), 과다:${dominant}, 부족:${lacking}] 질문: "${clip(question, 300)}" -> 정칠성 할배 김제 사투리로 3~4문장 촌철살인 답변해라.`;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: "Server key not configured" }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const mode = body.mode === "report" ? "report" : "chat";

  // 'AQ.' 로 시작하는 Vertex Express 키와 AI Studio 키 모두 지원
  const url = key.startsWith("AQ.")
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${MODEL}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: buildPrompt(mode, body) }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: mode === "report" ? 2500 : 500,
          responseMimeType: mode === "report" ? "application/json" : "text/plain",
        },
      }),
    });
    if (!r.ok) return json({ error: "Upstream error" }, 502);

    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (mode === "report") return json({ result: JSON.parse(text) });
    return json({ reply: text.trim() });
  } catch {
    return json({ error: "Failed to generate" }, 500);
  }
};

export const config = {
  path: "/api/saju",
  method: "POST",
  rateLimit: { windowSize: 60, windowLimit: 60 },
};
