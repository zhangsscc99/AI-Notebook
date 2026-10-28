import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceIndex = path.join(root, "content-source", "index.html");
const sourceSections = path.join(root, "sections");
const publicSections = path.join(root, "public", "sections");
const dataDirectory = path.join(root, "src", "data");

const groupDescriptions = {
  memoryTocGroup:
    "OpenClaw 的记忆分层、检索链路、写入机制与安全边界。",
  toolllmTocGroup:
    "ToolLLM 的论文结构、训练方法以及工具调用数据清洗。",
  dataJuicerTocGroup:
    "Data-Juicer 的数据处理算子、流水线和工程实现。",
  dataCleaningTechTocGroup:
    "数据清洗技术、badcase 发现与训练数据质量治理。",
  newQuestionsTocGroup:
    "MinT、FastApply 与强化学习训练中的数据、奖励和评测问题。",
  openclawGatewayTocGroup:
    "OpenClaw Gateway 的入口层、通信协议与 Agent 路由。",
  joyAgentTocGroup:
    "京东 JoyAgent-JDGenie 的 ReAct、Plan-Solve 与工作流分层。",
  openDeepResearchTocGroup:
    "Open Deep Research Agent 的搜索、研究循环与 GAIA 表现。",
  vragTocGroup:
    "Alibaba VRAG 的文本与视觉检索、切块、召回和重排。",
  wan22TocGroup:
    "Wan2.2 视频生成的模型结构、latent 与 Prompt-to-Video 管线。",
  hunyuan3dTocGroup:
    "混元 3D 的生成管线、latent denoising、视角一致性与训练数据。",
  hyworld20TocGroup:
    "HY-World 2.0 世界模型的任务定义、组件组合与大模型角色。",
  nvidiaCosmosTocGroup:
    "NVIDIA Cosmos 的世界模型路线、数据管线和工程取舍。",
  jepaWorldModelTocGroup:
    "EB-JEPA 架构、世界模型 representation 与 LLM 的差异。",
  algorithmBasicsTocGroup:
    "Embedding、reranker 与 RAG 系统底层算法的速查笔记。",
  claudeWorkflowTocGroup:
    "Claude Code 从入口、主循环到多 Agent 编排的完整源码路径。",
  claudeToolsTocGroup:
    "Claude Code 工具注册、权限、调度、并发、错误恢复与 token 控制。",
  deepseekHarnessTocGroup:
    "DeepSeek Harness 的插件化架构、运行方式、SDK 与扩展模式。",
  planningTocGroup:
    "OpenClaw 工作流编排及 Agent 系统设计策略。",
  qwenRlTocGroup:
    "千问强化学习训练 pipeline 与数据闭环。",
  hermesAgenticRlTocGroup:
    "Hermes Agent 的 skills、agentic RL、自进化与训练机制。",
  hermesWorkflowTocGroup:
    "Hermes Agent 的线性工作流和 LangGraph 复刻方案。",
  hermesSandboxTocGroup:
    "Hermes Agent 沙箱隔离、编辑流程和威胁模型。",
  openfolioAnalysisTocGroup:
    "Openfolio 分析引擎的实现与面试表达方式。",
};

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function stripSequence(value) {
  return cleanText(value).replace(/^\d+\s*·\s*/, "");
}

function sectionSlug(href) {
  return href.replace(/^#/, "");
}

fs.mkdirSync(publicSections, { recursive: true });
fs.mkdirSync(dataDirectory, { recursive: true });

const $ = load(fs.readFileSync(sourceIndex, "utf8"));
const sectionSources = new Map();
$("section[data-section-src]").each((_, element) => {
  const id = $(element).attr("id");
  const source = $(element).attr("data-section-src");
  if (id && source) sectionSources.set(id, source);
});

const groups = [];
const sections = [];
const searchSections = [];

$("details.toc-group").each((groupIndex, details) => {
  const $details = $(details);
  const links = $details.find(".toc-group-links a");
  if (links.length === 0) return;

  const id = $details.attr("id") || `group-${groupIndex + 1}`;
  const title = cleanText($details.find(".toc-group-title").first().text());
  const groupSections = [];

  links.each((sectionIndex, link) => {
    const $link = $(link);
    const href = $link.attr("href") || "";
    const sectionId = sectionSlug(href);
    const source = sectionSources.get(sectionId);
    if (!sectionId || !source) return;

    const sourcePath = path.join(root, source);
    if (!fs.existsSync(sourcePath)) {
      console.warn(`Missing section source: ${source}`);
      return;
    }

    const raw = fs.readFileSync(sourcePath, "utf8");
    const fragment = load(raw);
    fragment("script").remove();
    fragment("*").each((_, element) => {
      const attributes = element.attribs || {};
      for (const attribute of Object.keys(attributes)) {
        if (attribute.toLowerCase().startsWith("on")) {
          delete attributes[attribute];
        }
      }
    });
    fragment("a[href^='http']").each((_, element) => {
      fragment(element).attr("target", "_blank");
      fragment(element).attr("rel", "noreferrer noopener");
    });
    fragment("img").each((_, element) => {
      fragment(element).attr("loading", "lazy");
      fragment(element).attr("decoding", "async");
    });

    const body = fragment("body");
    const menuTitle = stripSequence($link.text());
    const heading = cleanText(body.find("h2").first().text()) || menuTitle;
    const firstParagraph = cleanText(body.find("p").first().text());
    const headings = body
      .find("h2, h3")
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter(Boolean);
    const plainText = cleanText(body.text());
    body.find(".section-header").remove();
    const contentHtml =
      cleanText(body.html() || "") === "" ? raw : body.html() || raw;
    fs.writeFileSync(
      path.join(publicSections, path.basename(source)),
      contentHtml,
    );
    const excerpt =
      firstParagraph.length > 220
        ? `${firstParagraph.slice(0, 217).trim()}…`
        : firstParagraph || `${title} · ${menuTitle}`;

    const section = {
      id: sectionId,
      title: heading,
      menuTitle,
      groupId: id,
      groupTitle: title,
      order: sectionIndex + 1,
      source: `/sections/${path.basename(source)}`,
      readingMinutes: Math.max(1, Math.ceil(plainText.length / 550)),
    };
    sections.push(section);
    groupSections.push(section);
    searchSections.push({
      ...section,
      excerpt,
      headings,
      searchText: [
        section.title,
        section.menuTitle,
        section.groupTitle,
        excerpt,
        ...headings,
      ].join(" · "),
    });
  });

  groups.push({
    id,
    title,
    description:
      groupDescriptions[id] ||
      groupSections[0]?.excerpt ||
      `${title} 专题研究笔记。`,
    sectionIds: groupSections.map((section) => section.id),
  });
});

const manifest = {
  generatedAt: new Date().toISOString(),
  groups,
  sections,
};

fs.writeFileSync(
  path.join(dataDirectory, "catalog.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(root, "public", "search-index.json"),
  JSON.stringify(searchSections),
);

console.log(
  `Generated ${groups.length} groups, ${sections.length} sections and ${searchSections.length} search records.`,
);
