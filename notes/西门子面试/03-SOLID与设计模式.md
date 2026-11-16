# Q3｜SOLID 五原则 + 设计模式（笔试第一题的答法）

> 对应：笔试 SOLID 设计题 + 设计模式题 + UML。**答题模板：原则 → 一句话定义 → 反面例子 → 我项目里的真实落地 → 取舍**。

## 1. SOLID 五原则

### S — 单一职责（SRP）
- **定义**：一个类/模块只有一个变化的理由。
- **反例**：一个 `UserService` 既管注册登录、又管发邮件、又管生成报表。
- **我的落地**：AI-Notebook 里「内容管线」和「页面渲染」彻底分开——`npm run content` 只负责把源文件生成结构化数据和搜索元数据，React 只负责渲染。加内容不用碰组件，改版式不影响内容。
- **追问·"多细才算单一？"**：不是"一个类一个方法"，而是**按变化的原因切分**——同一个需求变更会同时改到的，就该在一起。

### O — 开闭（OCP）
- **定义**：对扩展开放，对修改关闭。
- **反例**：`if (type === 'openai') ... else if (type === 'anthropic') ...` 每加一个供应商就要改核心代码。
- **我的落地**：Agent 的工具是**注册式**的——工具声明 schema（name / 参数 / 副作用等级 / 超时）后由注册表统一挂载，加工具不改编排循环；模型层同理，加供应商只加一个 adapter。
- **追问·"怎么做到不改代码就扩展？"**：靠声明式配置 + 注册表 + 统一契约（接口/抽象类）。扩展点必须是稳定的抽象。

### L — 里氏替换（LSP）
- **定义**：子类型必须能替换父类型而不破坏调用方。
- **反例**：`ReadOnlyRepo extends Repo` 但 `save()` 抛 `UnsupportedOperationException`。
- **我的落地**：模型 Provider 抽象——主模型和备用模型必须满足同一个 `chat(messages, tools)` 契约（相同的返回结构、相同的错误语义），所以降级链可以在运行时无感切换。
- **追问·"违反 LSP 最常见的场景？"**：用继承做"复用代码"而不是"表达 is-a"；子类收窄前置条件/放宽后置条件。

### I — 接口隔离（ISP）
- **定义**：不该强迫调用方依赖它不用的方法。
- **反例**：一个巨大的 `ToolService` 接口，只读工具也被迫实现 `delete()`。
- **我的落地**：工具按副作用分成只读 / 可写 / 危险三档，每档独立的接口与权限校验；只读类工具根本拿不到写接口。
- **追问·"和 SRP 的区别？"**：SRP 面向**实现方**（一个类职责单一），ISP 面向**调用方**（不要让调用方看到它不需要的东西）。

### D — 依赖倒置（DIP）
- **定义**：高层策略不依赖低层实现，两者都依赖抽象。
- **反例**：编排循环里直接 `new OpenAIClient()`。
- **我的落地**：编排层只依赖 `ModelProvider` / `Tool` / `MemoryStore` 三个抽象；具体实现（OpenAI、devin CLI、SQLite、向量库）由组合根注入，测试时可以塞 mock。
- **追问·"依赖注入的代价？"**：多一层间接、调试链路变长；小项目过度抽象会变负担——**抽象要跟着变化点走**。

## 2. 设计模式（只讲用得上的 6 个）

| 模式 | 用在哪 | 一句话 |
|---|---|---|
| **策略 Strategy** | 模型降级链、不同打分算法 | 把可替换的算法族封装成对象，运行时可切换 |
| **模板方法 Template Method** | Agent Loop 骨架 | 父类定流程（Plan→Act→Observe），子类填步骤 |
| **观察者 Observer** | 通知、事件流、日志订阅 | 状态变化时广播，发布者不关心谁在听 |
| **工厂 Factory** | 工具注册、Provider 创建 | 把"创建哪种实现"集中到一处 |
| **装饰器 Decorator** | 工具调用的重试/超时/日志/计费 | 在不改原实现的前提下叠加横切能力 |
| **责任链 Chain** | 请求前置校验（鉴权→限流→参数校验） | 一串处理器依次处理，任一可短路 |

**面试可以主动补一句**：模式不是目标，**变化点**才是目标——我会先找"哪里会变"，再选模式，而不是先想套哪个模式。

## 3. UML（笔试要画的两张图）

### 类图（Agent 核心三件套）

```
        ┌─────────────┐        uses        ┌──────────────┐
        │  AgentLoop  │───────────────────▶│ ModelProvider│«interface»
        └──────┬──────┘                    └──────────────┘
               │ uses                              ▲
               ▼                                   │ implements
        ┌─────────────┐                    ┌──────┴───────┐
        │  Tool «if»  │◀── implements ─────│ OpenAIClient │
        └──────┬──────┘                    └──────────────┘
               ▲
     ┌─────────┴─────────┐
┌──────────┐      ┌──────────────┐
│ReadTool  │      │DangerousTool │
└──────────┘      └──────────────┘

AgentLoop ──▶ MemoryStore «if» ──▶ {SessionMem, EpisodicMem, SemanticMem}
```

关键关系：**编排依赖抽象（虚线依赖）、实现类实现接口（虚线空心三角）、组合优于继承**。

### 时序图（一次工具调用）

```
User → AgentLoop: 任务
AgentLoop → ModelProvider: chat(messages, tools)
ModelProvider → AgentLoop: {intent, tool, args}
AgentLoop → Validator: 校验 args（schema + 白名单）
Validator → AgentLoop: ok
AgentLoop → ToolRegistry: get(tool)
ToolRegistry → AgentLoop: Tool
AgentLoop → Tool: execute(args) [policy: timeout/retry/meter]
Tool → AgentLoop: result(结构化 + 摘要)
AgentLoop → MemoryStore: append(observation)
AgentLoop → ModelProvider: chat(更新后的上下文)
ModelProvider → AgentLoop: 最终答复
AgentLoop → User: 结果
```
注意画出**校验在服务端**、**装饰器包住 execute（超时/重试/计费）**、**结果进记忆但长输出只存引用**。

## 4. 高频追问速答

**Q：SOLID 里最容易违反的是哪个？**
A：SRP 和 DIP。SRP 因为"顺手加个方法"最省事；DIP 因为直接 `new` 具体类最直观。我的做法是把**变化频率不同的东西**分层，变化快的（模型、工具）放抽象后面。

**Q：什么时候不该用设计模式？**
A：只有一个实现且短期不会变的时候。模式的价值在"应对变化"，没有变化点就是纯增复杂度。我会在代码注释里写明"这里预留扩展点，因为 X 会变"。

**Q：组合 vs 继承怎么选？**
A：默认组合。继承只在**真的是 is-a 且需要多态替换**时用（比如不同 Provider 实现同一接口）。组合更容易测试和替换。

**Q：怎么保证设计能落地不被推翻？**
A：先用最小可用的骨架跑通关键路径（垂直切片），再横向抽象；抽象层出现第二次重复时再提取，不提前设计。
