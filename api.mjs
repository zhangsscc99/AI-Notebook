import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(projectRoot, "data");
const historyFile = path.join(dataDirectory, "practice-history.json");

try {
  const envFile = path.join(projectRoot, ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
} catch {
  // .env is optional
}

const apiKey = process.env.DEEPSEEK_API_KEY || "";
const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function readHistory() {
  try {
    const raw = fs.readFileSync(historyFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(records) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const tempFile = `${historyFile}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(records, null, 2)}\n`);
  fs.renameSync(tempFile, historyFile);
}

async function chat(messages, { temperature = 0.7 } = {}) {
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未配置，请设置环境变量后重启服务");
  }
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`DeepSeek API ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("模型未返回 JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function generateQuestion(body, response) {
  const { title = "", groupTitle = "", context = "" } = body;
  if (!title) return sendJson(response, 400, { error: "缺少标题" });

  const question = await chat([
    {
      role: "system",
      content:
        "你是一名资深技术面试官。根据给定的学习笔记内容，出一道面试风格的技术问题。" +
        "要求：只输出问题本身，不要编号、不要解释、不要答案；问题要具体、能深挖，中文提问，长度一到两句话。",
    },
    {
      role: "user",
      content: `主题专栏：${groupTitle}\n笔记标题：${title}\n笔记内容节选：\n${String(context).slice(0, 3000)}`,
    },
  ]);

  sendJson(response, 200, { question });
}

async function scoreAnswer(body, response) {
  const { question = "", answer = "", title = "", context = "" } = body;
  if (!question || !answer) {
    return sendJson(response, 400, { error: "缺少问题或回答" });
  }

  const raw = await chat(
    [
      {
        role: "system",
        content:
          "你是一名资深技术面试官，正在为候选人的口头回答打分。" +
          '严格按 JSON 输出：{"score": <1到10的整数>, "analysis": "<解析>"}。' +
          "评分标准：9-10 准确完整且有深度；7-8 基本正确有小缺漏；5-6 部分正确或泛泛而谈；" +
          "3-4 明显错误或太空；1-2 答非所问。" +
          "analysis 用中文写 2-4 句：先给结论，指出答对的关键点和缺失/错误点，最后补一句参考答案要点。不要输出 JSON 之外的任何内容。",
      },
      {
        role: "user",
        content:
          `所属笔记：${title}\n参考内容节选：\n${String(context).slice(0, 3000)}\n\n` +
          `面试问题：${question}\n\n候选人回答：${answer}`,
      },
    ],
    { temperature: 0.3 },
  );

  const parsed = extractJson(raw);
  const score = Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 0)));
  sendJson(response, 200, {
    score,
    analysis: String(parsed.analysis || "无解析"),
  });
}

async function answerCoach(body, response) {
  const { userQuestion = "", record = {}, recordId } = body;
  if (!userQuestion.trim()) {
    return sendJson(response, 400, { error: "缺少问题" });
  }

  const attempts = Array.isArray(record.attempts) ? record.attempts : [];
  const attemptText = attempts
    .map(
      (a, i) =>
        `第${i + 1}次作答（${a.score}分）：${String(a.answer).slice(0, 1000)}\n解析：${String(a.analysis).slice(0, 800)}`,
    )
    .join("\n\n");

  const reply = (await chat(
    [
      {
        role: "system",
        content:
          "你是面试复习答疑助手。基于用户的面试题和他的历史作答记录（含分数与解析），回答用户的追问。" +
          "要求：中文回答，不超过200字，直接给要点，不要客套话；结合他的薄弱点给可操作的改进建议。",
      },
      {
        role: "user",
        content:
          `面试题：${record.question || "（无）"}\n\n历史作答记录：\n${attemptText || "（暂无）"}\n\n` +
          `用户追问：${String(userQuestion).slice(0, 1000)}`,
      },
    ],
    { temperature: 0.5 },
  )).slice(0, 400);

  if (recordId) {
    const records = readHistory();
    const target = records.find((r) => r.id === recordId);
    if (target) {
      if (!Array.isArray(target.coach)) target.coach = [];
      target.coach.push({
        q: String(userQuestion).slice(0, 2000),
        reply,
        at: new Date().toISOString(),
      });
      writeHistory(records);
    }
  }

  sendJson(response, 200, { reply });
}

function upsertAttempt(body, response) {
  const {
    id,
    sectionId,
    sectionTitle,
    groupTitle,
    question,
    answer,
    score,
    analysis,
  } = body;
  if (!sectionId || !question || !answer || typeof score !== "number") {
    return sendJson(response, 400, { error: "缺少必要字段" });
  }

  const records = readHistory();
  const recordId = id || crypto.randomUUID();
  const attempt = {
    answer: String(answer).slice(0, 20000),
    score: Math.max(1, Math.min(10, Math.round(score))),
    analysis: String(analysis || "").slice(0, 8000),
    at: new Date().toISOString(),
  };

  const existing = records.find((r) => r.id === recordId);
  if (existing) {
    existing.attempts.push(attempt);
    existing.bestScore = Math.max(existing.bestScore, attempt.score);
  } else {
    records.unshift({
      id: recordId,
      sectionId: String(sectionId),
      sectionTitle: String(sectionTitle || ""),
      groupTitle: String(groupTitle || ""),
      question: String(question).slice(0, 4000),
      bestScore: attempt.score,
      createdAt: attempt.at,
      attempts: [attempt],
    });
  }

  writeHistory(records);
  sendJson(response, 200, {
    id: recordId,
    bestScore: existing ? existing.bestScore : attempt.score,
  });
}

export async function handleApiRequest(request, response) {
  const pathname = (request.url || "").split("?")[0];
  try {
    if (request.method === "POST" && pathname === "/api/question") {
      return await generateQuestion(await readBody(request), response);
    }
    if (request.method === "POST" && pathname === "/api/score") {
      return await scoreAnswer(await readBody(request), response);
    }
    if (request.method === "POST" && pathname === "/api/ask") {
      return await answerCoach(await readBody(request), response);
    }
    if (request.method === "GET" && pathname === "/api/history") {
      const records = readHistory();
      return sendJson(response, 200, { records });
    }
    if (request.method === "POST" && pathname === "/api/history") {
      return upsertAttempt(await readBody(request), response);
    }
    if (request.method === "DELETE" && pathname === "/api/history") {
      const { id } = await readBody(request);
      writeHistory(readHistory().filter((r) => r.id !== id));
      return sendJson(response, 200, { ok: true });
    }
    sendJson(response, 404, { error: "Unknown API route" });
  } catch (error) {
    console.error("[api]", error);
    sendJson(response, 502, { error: error.message || "API error" });
  }
}
