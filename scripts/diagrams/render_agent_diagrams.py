#!/usr/bin/env python3
"""生成 Coding Agent 系统设计的 UML 类图 / 时序图（PlantUML）。

用法: python3 scripts/diagrams/render_agent_diagrams.py
产物: public/images/uml/<name>.png + .puml（源文件同目录留档）
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "images" / "uml"
SRC = ROOT / "scripts" / "diagrams" / "puml"
JAR = pathlib.Path("/root/plantuml.jar")

SKIN = """skinparam defaultFontName "WenQuanYi Zen Hei"
skinparam dpi 150
skinparam shadowing false
skinparam roundcorner 8
skinparam classAttributeIconSize 0
skinparam ArrowColor #4a5b7a
skinparam ClassBorderColor #9aa8c0
skinparam ClassBackgroundColor #ffffff
skinparam ClassHeaderBackgroundColor #eef2f9
skinparam SequenceArrowThickness 1.2
skinparam SequenceParticipantBackgroundColor #ffffff
skinparam SequenceParticipantBorderColor #4a5b7a
skinparam SequenceLifeLineBorderColor #9aa8c0
skinparam NoteBackgroundColor #fdf6e3
skinparam NoteBorderColor #d8c9a3
skinparam PackageBorderColor #b9c4d6"""

D = {}

# ---------------------------------------------------------------- 1 编排与规划
D["agent-orchestration-class"] = """@startuml
__SKIN__
title Coding Agent · 模块一：编排与规划层（类图）

package "编排内核" {
  class AgentLoop {
    + run(task: Task): Result
    - act(step: PlanStep): Observation
    - reflect(obs): Decision
    - guard(): StopReason
    - state: LoopState
  }
  enum LoopState {
    PLANNING
    ACTING
    OBSERVING
    REFLECTING
    DONE
    FAILED
    ABORTED
  }
  interface StopCondition {
    + shouldStop(state, budget): bool
  }
  class BudgetGuard
  class NoProgressGuard
  class Trace {
    + append(Event)
    + replay(taskId): [Event]
  }
}

package "规划" {
  interface Planner {
    + plan(goal: String, ctx): TaskGraph
    + replan(graph, obs): TaskGraph
  }
  class LLMPlanner
  class RulePlanner
  class TaskGraph {
    + add(step, deps)
    + ready(): [PlanStep]
    + markDone(id)
    + isDone(): bool
  }
  class PlanStep {
    + id: String
    + intent: String
    + toolHint: String
    + dependsOn: [String]
    + status
  }
}

package "配额" {
  class Task {
    + id: UUID
    + goal: String
    + status: TaskStatus
  }
  class Budget {
    + maxSteps: int
    + maxTokens: int
    + maxWallClock: Duration
    + consumed(): Usage
    + exhausted(): bool
  }
}

AgentLoop ..> Planner : 依赖抽象
AgentLoop ..> TaskGraph
AgentLoop --> LoopState : current
AgentLoop --> StopCondition : 1..*
AgentLoop --> Trace : 1
AgentLoop ..> Task : run(task)
Task "1" -- "1" Budget : 预算
BudgetGuard ..|> StopCondition
NoProgressGuard ..|> StopCondition
Planner <|.. LLMPlanner
Planner <|.. RulePlanner
TaskGraph *-- "1..*" PlanStep : 组成

note bottom of AgentLoop
  图例：实线  <-->  关联（长期持有，标多重性）
  虚线  ..>   依赖（临时使用 / 参数）
  空心菱形 o-- 聚合   实心菱形 *-- 组合
  空心三角虚线 <|..   实现接口
end note
@enduml"""

D["agent-orchestration-seq"] = """@startuml
__SKIN__
title Coding Agent · 模块一：一次任务的执行时序（含无进展熔断）

actor "用户" as U
participant "AgentLoop" as L
participant "Planner" as P
participant "TaskGraph" as G
participant "ModelProvider" as M
participant "Tool 实现" as T
participant "Trace 审计" as R

U -> L : run(goal, budget)
activate L
L -> R : start(taskId, budget)
L -> P : plan(goal, ctx)
P -> M : 结构化计划请求
M --> P : JSON {steps, deps}
P --> L : TaskGraph
L -> G : ready()
G --> L : [step1, step2]

loop 直到 graph.isDone() 或触发熔断
  L -> L : guard() 预算 / 无进展 / 心跳
  alt 预算耗尽或无进展
    L -> R : abort(reason)
    L --> U : FAILED(reason, 现场快照)
  else 正常推进
    L -> M : decide(step, 上下文)
    M --> L : {tool, args}
    L -> T : execute(args)
    T --> L : Observation(结构化)
    L -> G : markDone(step)
    L -> R : append(step, obs)
    opt Observation 表明失败或偏离
      L -> P : replan(graph, obs)
      P --> L : TaskGraph'
    end
  end
end

L -> R : finish(result)
L --> U : Result(artifacts, trace, usage)
deactivate L
@enduml"""

# ---------------------------------------------------------------- 2 工具与权限
D["agent-tool-class"] = """@startuml
__SKIN__
title Coding Agent · 模块二：工具层与权限沙箱（类图）

interface Tool {
  + spec(): ToolSpec
  + invoke(args: Map, ctx: ToolContext): ToolResult
}
class ToolSpec {
  + name: String
  + paramsSchema: JSONSchema
  + sideEffect: SideEffect
  + timeout: Duration
  + idempotent: bool
}
enum SideEffect {
  READ
  WRITE
  DANGEROUS
}
class ToolRegistry {
  + register(tool)
  + get(name): Tool
  + visibleTo(principal): [ToolSpec]
}
class PermissionPolicy {
  + check(spec, args, principal): Decision
}
class ApprovalGate {
  + request(action): Approval
  + await(timeout): bool
}
class ToolInvoker {
  + invoke(name, args): ToolResult
}

note right of ToolInvoker
  装饰器链：
  参数校验 → 权限 → 审批
  → 超时 → 幂等重试 → 计量 → 审计
end note

class Sandbox {
  + exec(cmd, limits: CgroupLimits): ExecResult
}
class AuditLog {
  + record(who, tool, args, result, cost)
}
class ToolResult {
  + ok: bool
  + summary: String
  + artifactUri: String
  + truncated: bool
}

ToolRegistry o-- "0..*" Tool : 注册
Tool --> ToolSpec : 1 自描述
ToolSpec --> SideEffect
ToolInvoker --> ToolRegistry : 1
ToolInvoker --> PermissionPolicy : 1
ToolInvoker --> ApprovalGate : 1
ToolInvoker ..> Sandbox : 委托执行
ToolInvoker --> AuditLog : 1
Tool ..> ToolResult : 返回
PermissionPolicy ..> Decision : 返回

note bottom of ToolRegistry
  职责分离：工具只描述「能做什么」与「怎么做」，
  注册表负责发现，ToolInvoker 负责横切
  （校验 / 权限 / 审批 / 超时 / 重试 / 计量 / 审计）。
end note
@enduml"""

D["agent-tool-seq"] = """@startuml
__SKIN__
title Coding Agent · 模块二：一次危险工具调用的审批与执行

participant "AgentLoop" as L
participant "ToolInvoker" as I
participant "PermissionPolicy" as P
participant "ApprovalGate" as A
participant "Sandbox" as S
participant "AuditLog" as LOG
actor "人（可选）" as H

L -> I : invoke("deploy", args)
activate I
I -> I : 校验 args（JSON Schema）

alt 参数不合法
  I --> L : ToolResult(ok=false, schema_error)
else 参数合法
  I -> P : check(spec, args, principal)
  P --> I : Decision
  alt READ 且 路径白名单
    I -> S : exec(read-only)
  else WRITE 且 限 workspace
    I -> S : exec(scoped write)
  else DANGEROUS（deploy / rm / 迁移）
    I -> A : request(action 摘要)
    A -> H : 审批请求（超时 10 min 自动拒绝）
    H --> A : allow
    A --> I : approved
    I -> S : exec(带 cgroup 限制)
  end
  S --> I : ExecResult(stdout, exitCode)
  I -> LOG : record(who, tool, args, result, cost)
  I --> L : ToolResult(ok, summary, artifactUri)
end
deactivate I

note over I, LOG
  全程幂等键 = hash(tool, args, step)
  同一键重复调用直接返回缓存结果
end note
@enduml"""

# ---------------------------------------------------------------- 3 上下文与记忆
D["agent-context-class"] = """@startuml
__SKIN__
title Coding Agent · 模块三：上下文与记忆（类图）

class ContextManager {
  + build(task, step): Prompt
  + usage(): TokenUsage
  - assemble(system, recent, retrieved)
}
class TokenCounter {
  + count(text): int
}
class Compressor {
  + compress(messages): Summary
  + keepRecent(n): [Message]
}
class MessageBuffer {
  + append(m)
  + window(n): [Message]
}
interface MemoryStore {
  + write(fact: Fact)
  + search(query, k): [Ref]
}
class SessionMemory {
  + ttl: Duration
}
class EpisodicMemory {
  + sqlite: "FTS5 + 向量"
  + summarize(session)
}
class SemanticMemory {
  + upsert(fact)
  + evict(lru)
}
class Retriever {
  + hybrid(query, k): [Ref]
}
class Embedder {
  + embed(text): Vector
}
class Ref {
  + uri: String
  + snippet: String
  + score: float
}
class Fact {
  + key: String
  + value: String
  + ttl: Duration
}

ContextManager --> TokenCounter : 1
ContextManager --> Compressor : 1
ContextManager --> MessageBuffer : 1
ContextManager --> Retriever : 1
Retriever ..> MemoryStore : 并行查询
Retriever --> Embedder : 1
MemoryStore <|.. SessionMemory
MemoryStore <|.. EpisodicMemory
MemoryStore <|.. SemanticMemory
Retriever ..> Ref : 返回 0..*
MemoryStore ..> Fact : 存 0..*

note bottom of ContextManager
  上下文成本 = 摘要 + 最近 N 轮原文 + 检索片段。
  原则：宁可多一次检索，也不要把窗口塞满——
  塞满换来的不是信息，是更差的注意力。
end note
@enduml"""

D["agent-context-seq"] = """@startuml
__SKIN__
title Coding Agent · 模块三：上下文超阈值时的压缩与检索

participant "AgentLoop" as L
participant "ContextManager" as C
participant "TokenCounter" as T
participant "Compressor" as Z
participant "Retriever" as R
participant "MemoryStore" as MS
participant "ModelProvider" as M

L -> C : build(task, step)
activate C
C -> T : count(system + 历史 + 工具结果)
T --> C : 92k / 100k（超 80% 阈值）
C -> C : 触发压缩策略
C -> Z : compress(早期消息)
Z --> C : Summary(要点 + 决策 + 未完成项)
C -> C : 保留最近 N 轮原文 + 摘要
C -> R : hybrid(当前 step 目标, k=8)
R -> MS : search(FTS5) 与 向量检索
MS --> R : 候选 Ref
R --> C : 融合排序 Top-8（去重）
C --> L : Prompt(摘要 + 近期 + 引用片段)
deactivate C

L -> M : chat(prompt, tools)
M --> L : 决策

note over Z
  压缩不是"截断"：
  1) 早期消息 → 摘要
  2) 工具大输出 → 只留 artifactUri + 结论
  3) 失败尝试 → 保留原因，避免重复踩坑
end note
@enduml"""

# ---------------------------------------------------------------- 4 模型路由
D["agent-router-class"] = """@startuml
__SKIN__
title Coding Agent · 模块四：模型路由、限流与降级（类图）

interface ModelProvider {
  + chat(req: ChatRequest): ChatResponse
  + health(): Health
  + cost(usage): Money
}
class PrimaryProvider
class BackupProvider
class LocalProvider
class RuleFallback

class ModelRouter {
  + route(req): Provider
  + profile: RoutingProfile
}
class RateLimiter {
  + acquire(n): bool
  + bucket: 令牌桶
}
class CircuitBreaker {
  + allow(): bool
  + onSuccess()
  + onFailure()
  + state: State
}
enum State {
  CLOSED
  OPEN
  HALF_OPEN
}
class FallbackChain {
  + next(): Provider
  + exhausted(): bool
}
class ResponseCache {
  + get(key): ChatResponse
  + put(key, resp)
}
class TokenBudget {
  + charge(usage)
  + remaining(): int
}
class ChatRequest {
  + messages
  + tools
  + timeout
}
class ChatResponse {
  + content
  + usage
  + model
}

ModelRouter ..> ModelProvider : 选择实现
ModelRouter --> RateLimiter : 1
ModelRouter --> CircuitBreaker : 1
ModelRouter --> FallbackChain : 1
ModelRouter --> ResponseCache : 1
ModelProvider <|.. PrimaryProvider
ModelProvider <|.. BackupProvider
ModelProvider <|.. LocalProvider
FallbackChain o-- "0..*" ModelProvider : 候选链
RuleFallback ..|> ModelProvider
CircuitBreaker --> State : current
ModelRouter --> TokenBudget : 1
ModelRouter ..> ChatRequest : 入参

note bottom of ModelRouter
  顺序不可乱：限流 → 熔断 → 调用 → 重试 → 降级。
  重试只在「幂等 且 非 4xx」时发生；
  4xx 立即失败，5xx / 超时才降级。
end note
@enduml"""

D["agent-router-seq"] = """@startuml
__SKIN__
title Coding Agent · 模块四：主模型失败后的降级链（429 / 超时 / 熔断）

participant "AgentLoop" as L
participant "ModelRouter" as R
participant "RateLimiter" as RL
participant "CircuitBreaker" as CB
participant "主模型" as P1
participant "备用模型" as P2
participant "规则兜底" as P3

L -> R : chat(req)
activate R
R -> RL : acquire(1)
alt 令牌不足
  RL --> R : false
  R --> L : 429（本地快速失败，带 Retry-After）
else 令牌充足
  R -> CB : allow()
  alt 熔断器 OPEN
    CB --> R : false（跳过主模型）
  else CLOSED / HALF_OPEN
    R -> P1 : chat(req, timeout=60s)
    alt 200
      P1 --> R : 响应
      R -> CB : onSuccess()
    else 429 / 5xx / 超时
      P1 --> R : error
      R -> CB : onFailure()（连续 N 次 → OPEN）
      R -> P2 : chat(req)（退避 + 抖动后一次重试）
      alt 200
        P2 --> R : 响应（记录降级指标）
      else 仍失败
        P2 --> R : error
        R -> P3 : rule_fallback(req)（模板 / 上次成功结果）
        P3 --> R : 兜底结果（标记 degraded=true）
      end
    end
  end
  R --> L : ChatResponse(degraded, model, usage)
end
deactivate R
@enduml"""

# ---------------------------------------------------------------- 5 验证与部署
D["agent-verify-class"] = """@startuml
__SKIN__
title Coding Agent · 模块五：验证与部署闭环（类图）

class WorktreeManager {
  + create(taskId): Path
  + merge(branch): MergeResult
  + cleanup(taskId)
}
class Verifier {
  + verify(fid: String): Report
}
class StaticCheck {
  + run(path): [Issue]
}
class TestRunner {
  + unit(): TestResult
  + e2e(repeat): TestResult
}
class DeployGate {
  + release(artifact): Release
  + health(): bool
}
class AtomicRelease {
  + newDir()
  + switch()
}
class RollbackManager {
  + rollback(release)
}
class ArtifactStore {
  + put(path): Uri
}
class ReportBuilder {
  + render(runs): Markdown
}
class Release {
  + version: String
  + path: Path
  + healthy: bool
}
class Report {
  + assertions: [Assertion]
  + passed: bool
  + level: Level
}
enum Level {
  DATA
  API
  E2E
}

WorktreeManager ..> Verifier : 产出待验分支
Verifier --> StaticCheck : 1
Verifier --> TestRunner : 1
Verifier ..> Report : 生成
Report --> Level : 断言等级
DeployGate --> AtomicRelease : 1
DeployGate --> Release : 1
DeployGate --> RollbackManager : 1
Verifier --> ArtifactStore : 1
ReportBuilder ..> Report : 渲染

note bottom of DeployGate
  门禁不变式：未通过验证的产物不得进入 Release；
  健康检查失败必须回到上一个 Release。
  data 级断言不足以判定完成，只有 api / e2e 级可以。
end note
@enduml"""

D["agent-verify-seq"] = """@startuml
__SKIN__
title Coding Agent · 模块五：一条任务从改码到上线（失败自动回滚）

participant "调度器" as O
participant "WorktreeManager" as W
participant "Agent（改码）" as A
participant "Verifier" as V
participant "TestRunner" as TR
participant "DeployGate" as D
participant "Rollback" as RB

O -> W : create(taskId)
W --> O : /worktrees/<taskId>（独立分支）
O -> A : 在 worktree 内实现（devin / 本地模型）
A --> O : 变更（未提交）

O -> V : verify(fid)
activate V
V -> V : 断言分级检查（data 级不算完成）
V -> TR : unit + e2e(--repeat=3)
TR --> V : 结果

alt 任一断言失败
  V --> O : Report(passed=false, 具体断言)
  O -> W : 丢弃该分支（不合并）
  note right of O : 只有 devin 真失败才回退到备用模型重做
else 全部通过
  V --> O : Report(passed=true)
  O -> W : merge(branch) 到 main
  O -> D : release()
  D -> D : 原子发布（新目录 + 软链切换）
  D -> D : health check 公网 + 关键路由
  alt 健康检查通过
    D --> O : Release(healthy=true)
  else 健康检查失败
    D -> RB : rollback(previous)
    RB --> O : 已回滚到上一版本
  end
end
deactivate V
@enduml"""


def main() -> int:
    SRC.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, body in D.items():
        text = body.replace("__SKIN__", SKIN)
        (SRC / f"{name}.puml").write_text(text, encoding="utf-8")
    cmd = [
        "java", "-Djava.awt.headless=true", "-jar", str(JAR),
        "-tpng", "-charset", "UTF-8", "-nometadata",
        "-o", str(OUT), *[str(SRC / f"{n}.puml") for n in D],
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout, res.stderr, file=sys.stderr)
        return res.returncode
    for name in D:
        p = OUT / f"{name}.png"
        print(f"{name}.png  {p.stat().st_size // 1024} KB" if p.exists() else f"MISSING {name}.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
