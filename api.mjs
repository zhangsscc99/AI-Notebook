import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  appendCoachMessage,
  deletePracticeRecord,
  practiceHistory,
  proficiencyScores,
  savePracticeAttempt,
  setProficiencyScore,
  setProficiencyScores,
} from "./database.mjs";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

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
    appendCoachMessage({
      recordId,
      question: String(userQuestion).slice(0, 2000),
      reply,
    });
  }

  sendJson(response, 200, { reply });
}

function runCodex(prompt, request, response) {
  request.socket.setTimeout(0);
  response.socket.setTimeout(0);

  const codexBin = process.env.CODEX_BIN || "codex";
  const child = spawn(
    codexBin,
    ["exec", "-s", "danger-full-access", "--skip-git-repo-check", prompt],
    { cwd: projectRoot, env: process.env },
  );

  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => child.kill("SIGTERM"), 15 * 60 * 1000);
  child.stdout.on("data", (d) => {
    stdout += d;
    if (stdout.length > 800_000) stdout = stdout.slice(-800_000);
  });
  child.stderr.on("data", (d) => {
    stderr += d;
    if (stderr.length > 100_000) stderr = stderr.slice(-100_000);
  });

  return new Promise((resolve) => {
    child.on("error", (err) => {
      stderr += String(err);
      resolve({ code: -1, stdout, stderr });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function codexDraft(body, request, response) {
  const { question = "" } = body;
  if (!question.trim()) {
    return sendJson(response, 400, { error: "缺少问题" });
  }

  const prompt = [
    `你在代码库 ${projectRoot} 工作。这是一个面试笔记网站：sections/*.html 是内容片段，` +
      `content-source/index.html 里用 details.toc-group 声明目录分组（每个分组有 id 和中文标题），` +
      `用 lazy-section 注册章节。\n\n` +
      `用户的问题：${question}\n\n` +
      `任务：\n` +
      `1. 你有 full access，先在本机搜索并阅读与用户问题相关的源码（用户可能在问题里给出路径；` +
      `没有时优先在本项目和常见源码目录中查找）。\n` +
      `2. 决定这个问答应该放在哪个目录分组：优先放进最合适的已有分组（给出它的 groupId），` +
      `实在没有合适的才新建分组（给出新的 groupTitle 和一句中文 groupDescription）。\n` +
      `3. 撰写问答内容为一个 HTML 片段，严格模仿现有 sections/*.html 的风格：` +
      `从 <div class="section-header"><div class="index">XX</div><h2>标题</h2></div> 开始，` +
      `正文使用 p、callout、grid-2/mini-card、flow/flow-step[data-step]、pre/code 等现有类名，` +
      `不要写 <html>/<body> 标签，不要引入 script 或外部资源。\n` +
      `4. 【重要】不要创建、修改或运行任何文件。只把结果作为 JSON 输出，包裹在 ` +
      `<<<JSON>>> 与 <<<END>>> 之间，格式：` +
      `<<<JSON>>>{"slug":"kebab-case-唯一标识","title":"章节标题","menuTitle":"目录菜单短标题",` +
      `"groupId":"已有分组id或null","groupTitle":"新分组标题或null","groupDescription":"新分组描述或null",` +
      `"summary":"你读了哪些源码、为什么放这个分组（1-2句）","html":"<完整HTML片段>"}<<<END>>>\n` +
      `slug 必须是全小写字母数字连字符，且不能与 sections/ 下现有文件重名。`,
  ].join("");

  const { code, stdout, stderr } = await runCodex(prompt, request, response);
  if (code !== 0) {
    return sendJson(response, 502, {
      error: `codex 退出码 ${code}`,
      output: (stderr || stdout).slice(-2000),
    });
  }

  const match = stdout.match(/<<<JSON>>>([\s\S]*?)<<<END>>>/);
  if (!match) {
    return sendJson(response, 502, {
      error: "codex 未返回结构化提案",
      output: stdout.slice(-2000),
    });
  }

  let proposal;
  try {
    proposal = JSON.parse(match[1]);
  } catch {
    return sendJson(response, 502, {
      error: "提案 JSON 解析失败",
      output: match[1].slice(-1000),
    });
  }

  const slug = String(proposal.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!slug || fs.existsSync(path.join(projectRoot, "sections", `${slug}.html`))) {
    proposal.slug = `${slug || "codex-note"}-${Date.now().toString(36)}`;
  } else {
    proposal.slug = slug;
  }
  sendJson(response, 200, { proposal });
}

async function codexCommit(body, response) {
  const {
    slug = "",
    title = "",
    menuTitle = "",
    html = "",
    groupId = "",
    groupTitle = "",
    groupDescription = "",
  } = body || {};

  const cleanSlug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!cleanSlug || !html || !menuTitle) {
    return sendJson(response, 400, { error: "缺少 slug/html/menuTitle" });
  }

  const sectionFile = path.join(projectRoot, "sections", `${cleanSlug}.html`);
  if (fs.existsSync(sectionFile)) {
    return sendJson(response, 409, { error: "同名章节已存在" });
  }

  const indexFile = path.join(projectRoot, "content-source", "index.html");
  let indexHtml = fs.readFileSync(indexFile, "utf8");

  let targetGroupId = String(groupId || "");
  const groupExists = targetGroupId && indexHtml.includes(`id="${targetGroupId}"`);

  if (groupExists) {
    const groupRe = new RegExp(
      `(<details class="toc-group" id="${targetGroupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?<div class="toc-group-links">)([\\s\\S]*?)(</div>\\s*</details>)`,
    );
    const gm = indexHtml.match(groupRe);
    if (!gm) return sendJson(response, 500, { error: "找不到分组链接区" });
    const nextNum = String((gm[2].match(/<a href="#/g) || []).length + 1).padStart(2, "0");
    const link = `\n            <a href="#${cleanSlug}">${nextNum} · ${menuTitle}</a>`;
    indexHtml = indexHtml.replace(groupRe, `$1$2${link}$3`);
  } else {
    targetGroupId = `codex-group-${Date.now().toString(36)}`;
    const newGroup = [
      `        <details class="toc-group" id="${targetGroupId}" open>`,
      `          <summary>`,
      `            <span class="toc-group-title">${groupTitle || "Codex 源码问答"}</span>`,
      `            <span class="toc-count">1 section</span>`,
      `          </summary>`,
      `          <div class="toc-group-links">`,
      `            <a href="#${cleanSlug}">01 · ${menuTitle}</a>`,
      `          </div>`,
      `        </details>`,
      `      </nav>`,
    ].join("\n");
    if (!indexHtml.includes("      </nav>")) {
      return sendJson(response, 500, { error: "找不到 </nav>" });
    }
    indexHtml = indexHtml.replace("      </nav>", newGroup);

    const genFile = path.join(projectRoot, "scripts", "generate-content.mjs");
    let gen = fs.readFileSync(genFile, "utf8");
    const desc = groupDescription || `${groupTitle || "Codex 源码问答"} 相关问答。`;
    gen = gen.replace(/\n\};/, `\n  ${targetGroupId}:\n    "${desc.replace(/"/g, '\\"')}",\n};`);
    fs.writeFileSync(genFile, gen);
  }

  const placeholder = `\n        <section class="section reveal lazy-section" id="${cleanSlug}" data-section-src="sections/${cleanSlug}.html"><div class="lazy-placeholder" role="status">正在加载章节…</div></section>\n\n      </main>`;
  if (!indexHtml.includes("      </main>")) {
    return sendJson(response, 500, { error: "找不到 </main>" });
  }
  indexHtml = indexHtml.replace("      </main>", placeholder);

  fs.writeFileSync(sectionFile, String(html));
  fs.writeFileSync(indexFile, indexHtml);

  await new Promise((resolve) => {
    const gen = spawn("node", ["scripts/generate-content.mjs"], { cwd: projectRoot });
    gen.on("close", resolve);
    gen.on("error", resolve);
  });

  sendJson(response, 200, { ok: true, slug: cleanSlug, groupId: targetGroupId });
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

  const saved = savePracticeAttempt({
    id,
    sectionId,
    sectionTitle,
    groupTitle,
    question,
    answer,
    score,
    analysis,
  });
  sendJson(response, 200, saved);
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
    if (request.method === "POST" && pathname === "/api/codex-draft") {
      return await codexDraft(await readBody(request), request, response);
    }
    if (request.method === "POST" && pathname === "/api/codex-commit") {
      return await codexCommit(await readBody(request), response);
    }
    if (request.method === "POST" && pathname === "/api/ask") {
      return await answerCoach(await readBody(request), response);
    }
    if (request.method === "GET" && pathname === "/api/history") {
      const records = practiceHistory();
      return sendJson(response, 200, { records });
    }
    if (request.method === "POST" && pathname === "/api/history") {
      return upsertAttempt(await readBody(request), response);
    }
    if (request.method === "DELETE" && pathname === "/api/history") {
      const { id } = await readBody(request);
      deletePracticeRecord(id);
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === "GET" && pathname === "/api/proficiency") {
      return sendJson(response, 200, { scores: proficiencyScores() });
    }
    if (request.method === "PUT" && pathname === "/api/proficiency") {
      const body = await readBody(request);
      if (body.scores && typeof body.scores === "object") {
        setProficiencyScores(body.scores);
      } else if (body.sectionId) {
        setProficiencyScore(body.sectionId, body.score);
      } else {
        return sendJson(response, 400, { error: "缺少评分数据" });
      }
      return sendJson(response, 200, { ok: true, scores: proficiencyScores() });
    }
    if (request.method === "DELETE" && pathname === "/api/proficiency") {
      const { sectionId } = await readBody(request);
      if (!sectionId) return sendJson(response, 400, { error: "缺少 sectionId" });
      setProficiencyScore(sectionId, null);
      return sendJson(response, 200, { ok: true });
    }
    sendJson(response, 404, { error: "Unknown API route" });
  } catch (error) {
    console.error("[api]", error);
    sendJson(response, 502, { error: error.message || "API error" });
  }
}
