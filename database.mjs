import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(projectRoot, "data");
const databaseFile = process.env.AI_NOTEBOOK_DB_PATH
  ? path.resolve(process.env.AI_NOTEBOOK_DB_PATH)
  : path.join(dataDirectory, "ai-notebook.sqlite3");

fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

const db = new DatabaseSync(databaseFile);
db.exec(`
  PRAGMA journal_mode = DELETE;
  PRAGMA synchronous = FULL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS practice_records (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    section_title TEXT NOT NULL DEFAULT '',
    group_title TEXT NOT NULL DEFAULT '',
    question TEXT NOT NULL,
    best_score INTEGER NOT NULL CHECK (best_score BETWEEN 1 AND 10),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS practice_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id TEXT NOT NULL REFERENCES practice_records(id) ON DELETE CASCADE,
    answer TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
    analysis TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS practice_attempts_record_id
    ON practice_attempts(record_id, created_at);

  CREATE TABLE IF NOT EXISTS coach_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id TEXT NOT NULL REFERENCES practice_records(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    reply TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS coach_messages_record_id
    ON coach_messages(record_id, created_at);

  CREATE TABLE IF NOT EXISTS proficiency_scores (
    section_id TEXT PRIMARY KEY,
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS study_plans (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT '',
    checklist_json TEXT NOT NULL DEFAULT '[]',
    acceptance TEXT NOT NULL DEFAULT '',
    deadline TEXT,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'paused', 'completed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS study_plans_updated_at
    ON study_plans(updated_at DESC);

  CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const studyPlanColumns = db
  .prepare("PRAGMA table_info(study_plans)")
  .all()
  .map((column) => column.name);
if (!studyPlanColumns.includes("body")) {
  db.exec("ALTER TABLE study_plans ADD COLUMN body TEXT NOT NULL DEFAULT ''");
}

function transaction(operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function clampScore(value) {
  return Math.max(1, Math.min(10, Math.round(Number(value) || 0)));
}

function migrateLegacyHistory() {
  const migrationKey = "practice-history-json-v1";
  const completed = db
    .prepare("SELECT value FROM app_metadata WHERE key = ?")
    .get(migrationKey);
  if (completed) return;

  const legacyFile = path.join(dataDirectory, "practice-history.json");
  let records = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
    if (Array.isArray(parsed)) records = parsed;
  } catch {
    // A missing or malformed legacy file leaves the database empty.
  }

  const findRecord = db.prepare("SELECT id FROM practice_records WHERE id = ?");
  const insertRecord = db.prepare(`
    INSERT INTO practice_records
      (id, section_id, section_title, group_title, question, best_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAttempt = db.prepare(`
    INSERT INTO practice_attempts (record_id, answer, score, analysis, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertCoach = db.prepare(`
    INSERT INTO coach_messages (record_id, question, reply, created_at)
    VALUES (?, ?, ?, ?)
  `);

  transaction(() => {
    for (const record of records) {
      const recordId = String(record?.id || crypto.randomUUID());
      if (findRecord.get(recordId)) continue;

      const attempts = Array.isArray(record?.attempts) ? record.attempts : [];
      const scores = attempts.map((attempt) => Number(attempt?.score) || 0);
      const bestScore = clampScore(
        record?.bestScore || Math.max(0, ...scores) || 1,
      );
      const createdAt = String(record?.createdAt || new Date().toISOString());

      insertRecord.run(
        recordId,
        String(record?.sectionId || ""),
        String(record?.sectionTitle || ""),
        String(record?.groupTitle || ""),
        String(record?.question || ""),
        bestScore,
        createdAt,
      );

      for (const attempt of attempts) {
        insertAttempt.run(
          recordId,
          String(attempt?.answer || ""),
          clampScore(attempt?.score),
          String(attempt?.analysis || ""),
          String(attempt?.at || createdAt),
        );
      }

      const coach = Array.isArray(record?.coach) ? record.coach : [];
      for (const message of coach) {
        insertCoach.run(
          recordId,
          String(message?.q || ""),
          String(message?.reply || ""),
          String(message?.at || createdAt),
        );
      }
    }

    db.prepare("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)").run(
      migrationKey,
      new Date().toISOString(),
    );
  });
}

function practiceHistory() {
  const records = db
    .prepare(`
      SELECT
        id,
        section_id AS sectionId,
        section_title AS sectionTitle,
        group_title AS groupTitle,
        question,
        best_score AS bestScore,
        created_at AS createdAt
      FROM practice_records
      ORDER BY created_at DESC
    `)
    .all();

  const attemptsFor = db.prepare(`
    SELECT answer, score, analysis, created_at AS at
    FROM practice_attempts
    WHERE record_id = ?
    ORDER BY created_at ASC, id ASC
  `);
  const coachFor = db.prepare(`
    SELECT question AS q, reply, created_at AS at
    FROM coach_messages
    WHERE record_id = ?
    ORDER BY created_at ASC, id ASC
  `);

  return records.map((record) => {
    const coach = coachFor.all(record.id);
    return {
      ...record,
      attempts: attemptsFor.all(record.id),
      ...(coach.length ? { coach } : {}),
    };
  });
}

function savePracticeAttempt({
  id,
  sectionId,
  sectionTitle,
  groupTitle,
  question,
  answer,
  score,
  analysis,
}) {
  const recordId = String(id || crypto.randomUUID());
  const normalizedScore = clampScore(score);
  const createdAt = new Date().toISOString();

  return transaction(() => {
    const existing = db
      .prepare("SELECT best_score AS bestScore FROM practice_records WHERE id = ?")
      .get(recordId);

    if (existing) {
      db.prepare(`
        UPDATE practice_records
        SET best_score = MAX(best_score, ?)
        WHERE id = ?
      `).run(normalizedScore, recordId);
    } else {
      db.prepare(`
        INSERT INTO practice_records
          (id, section_id, section_title, group_title, question, best_score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        recordId,
        String(sectionId),
        String(sectionTitle || ""),
        String(groupTitle || ""),
        String(question).slice(0, 4000),
        normalizedScore,
        createdAt,
      );
    }

    db.prepare(`
      INSERT INTO practice_attempts (record_id, answer, score, analysis, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      recordId,
      String(answer).slice(0, 20000),
      normalizedScore,
      String(analysis || "").slice(0, 8000),
      createdAt,
    );

    const bestScore = db
      .prepare("SELECT best_score AS bestScore FROM practice_records WHERE id = ?")
      .get(recordId).bestScore;
    return { id: recordId, bestScore };
  });
}

function appendCoachMessage({ recordId, question, reply }) {
  if (!recordId) return false;
  const result = db
    .prepare(`
      INSERT INTO coach_messages (record_id, question, reply, created_at)
      SELECT id, ?, ?, ? FROM practice_records WHERE id = ?
    `)
    .run(
      String(question).slice(0, 2000),
      String(reply),
      new Date().toISOString(),
      String(recordId),
    );
  return result.changes > 0;
}

function deletePracticeRecord(id) {
  if (!id) return false;
  return db.prepare("DELETE FROM practice_records WHERE id = ?").run(String(id)).changes > 0;
}

function proficiencyScores() {
  const rows = db
    .prepare("SELECT section_id AS sectionId, score FROM proficiency_scores")
    .all();
  return Object.fromEntries(rows.map((row) => [row.sectionId, row.score]));
}

function setProficiencyScore(sectionId, score) {
  if (!sectionId) return;
  if (score === null || score === undefined) {
    db.prepare("DELETE FROM proficiency_scores WHERE section_id = ?").run(String(sectionId));
    return;
  }
  db.prepare(`
    INSERT INTO proficiency_scores (section_id, score, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(section_id) DO UPDATE SET
      score = excluded.score,
      updated_at = excluded.updated_at
  `).run(String(sectionId), clampScore(score), new Date().toISOString());
}

function setProficiencyScores(scores) {
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) return;
  transaction(() => {
    for (const [sectionId, score] of Object.entries(scores)) {
      setProficiencyScore(sectionId, score);
    }
  });
}

function normalizeChecklist(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") {
        return { id: crypto.randomUUID(), text: item.trim(), done: false };
      }
      return {
        id: String(item?.id || crypto.randomUUID()),
        text: String(item?.text || "").trim(),
        done: Boolean(item?.done),
      };
    })
    .filter((item) => item.text);
}

function normalizeStudyPlan(plan) {
  const status = ["active", "paused", "completed"].includes(plan?.status)
    ? plan.status
    : "active";
  return {
    title: String(plan?.title || "").trim(),
    body: String(plan?.body || "").trim(),
    summary: String(plan?.summary || "").trim(),
    goal: String(plan?.goal || "").trim(),
    checklist: normalizeChecklist(plan?.checklist),
    acceptance: String(plan?.acceptance || "").trim(),
    deadline: plan?.deadline ? String(plan.deadline).slice(0, 10) : null,
    status,
  };
}

function mapStudyPlan(row) {
  let checklist = [];
  try {
    checklist = normalizeChecklist(JSON.parse(row.checklistJson));
  } catch {
    checklist = [];
  }
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    summary: row.summary,
    goal: row.goal,
    checklist,
    acceptance: row.acceptance,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function listStudyPlans() {
  return db
    .prepare(`
      SELECT
        id,
        title,
        body,
        summary,
        goal,
        checklist_json AS checklistJson,
        acceptance,
        deadline,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM study_plans
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
        updated_at DESC
    `)
    .all()
    .map(mapStudyPlan);
}

function getStudyPlan(id) {
  if (!id) return null;
  const row = db
    .prepare(`
      SELECT
        id,
        title,
        body,
        summary,
        goal,
        checklist_json AS checklistJson,
        acceptance,
        deadline,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM study_plans
      WHERE id = ?
    `)
    .get(String(id));
  return row ? mapStudyPlan(row) : null;
}

function createStudyPlan(input) {
  const plan = normalizeStudyPlan(input);
  if (!plan.title) throw new Error("计划标题不能为空");
  const id = String(input?.id || `plan-${crypto.randomUUID()}`);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO study_plans
      (id, title, body, summary, goal, checklist_json, acceptance, deadline, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    plan.title,
    plan.body,
    plan.summary,
    plan.goal,
    JSON.stringify(plan.checklist),
    plan.acceptance,
    plan.deadline,
    plan.status,
    now,
    now,
  );
  return getStudyPlan(id);
}

function updateStudyPlan(id, input) {
  const existing = getStudyPlan(id);
  if (!existing) return null;
  const plan = normalizeStudyPlan({
    ...existing,
    ...input,
    checklist: input?.checklist ?? existing.checklist,
  });
  if (!plan.title) throw new Error("计划标题不能为空");
  db.prepare(`
    UPDATE study_plans
    SET title = ?,
        body = ?,
        summary = ?,
        goal = ?,
        checklist_json = ?,
        acceptance = ?,
        deadline = ?,
        status = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    plan.title,
    plan.body,
    plan.summary,
    plan.goal,
    JSON.stringify(plan.checklist),
    plan.acceptance,
    plan.deadline,
    plan.status,
    new Date().toISOString(),
    String(id),
  );
  return getStudyPlan(id);
}

function deleteStudyPlan(id) {
  if (!id) return false;
  return db.prepare("DELETE FROM study_plans WHERE id = ?").run(String(id)).changes > 0;
}

const examplePlanBody =
  "目标\n一周内把西门子医疗一面高频考点全部过到面试练习 9 分以上，覆盖项目讲解、设计模式、设计原则、K8s、并发与 RAG 设计。\n\n计划清单\n1. Day 1-2：完成中英文项目讲稿，并用面试练习验证。\n2. Day 3：复习设计模式与设计原则。\n3. Day 4：复习 K8s、CNN、锁、B+ 树与线程。\n4. Day 5-6：完成 RAG 系统设计与 Harness 专题。\n5. Day 7：完成一轮全流程模拟面试。\n\n验收标准\n每个专题的面试练习至少达到 9 分；英文项目介绍能连续讲完；薄弱项完成一轮追问复盘。";

function seedExampleStudyPlan() {
  const migrationKey = "study-plan-example-v1";
  const alreadySeeded = db
    .prepare("SELECT value FROM app_metadata WHERE key = ?")
    .get(migrationKey);

  if (!alreadySeeded) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO study_plans
        (id, title, body, summary, goal, checklist_json, acceptance, deadline, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "study-plan-week-template",
      "西门子医疗一面冲刺周",
      examplePlanBody,
      "把高频面试考点压缩成一周冲刺，并用面试练习验证真实掌握度。",
      "一周内把西门子医疗一面高频考点全部过到面试练习 9 分以上，覆盖项目讲解、设计模式、设计原则、K8s、并发与 RAG 设计。",
      JSON.stringify([
        { id: crypto.randomUUID(), text: "Day 1-2：完成中英文项目讲稿，并用面试练习验证", done: false },
        { id: crypto.randomUUID(), text: "Day 3：复习设计模式与设计原则", done: false },
        { id: crypto.randomUUID(), text: "Day 4：复习 K8s、CNN、锁、B+ 树与线程", done: false },
        { id: crypto.randomUUID(), text: "Day 5-6：完成 RAG 系统设计与 Harness 专题", done: false },
        { id: crypto.randomUUID(), text: "Day 7：完成一轮全流程模拟面试", done: false },
      ]),
      "每个专题的面试练习至少达到 9 分；英文项目介绍能连续讲完；薄弱项完成一轮追问复盘。",
      null,
      "active",
      now,
      now,
    );
    db.prepare(
      "INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)",
    ).run(migrationKey, now);
  }

  db.prepare(`
    UPDATE study_plans
    SET body = ?
    WHERE id = 'study-plan-week-template' AND body = ''
  `).run(examplePlanBody);
}

migrateLegacyHistory();
seedExampleStudyPlan();

export {
  databaseFile,
  practiceHistory,
  savePracticeAttempt,
  appendCoachMessage,
  deletePracticeRecord,
  proficiencyScores,
  setProficiencyScore,
  setProficiencyScores,
  listStudyPlans,
  getStudyPlan,
  createStudyPlan,
  updateStudyPlan,
  deleteStudyPlan,
};
