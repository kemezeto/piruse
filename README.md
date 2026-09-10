# 目录结构

调用栈是包含关系；源码树按改动理由做成同级，最多嵌三层。**Agent 就是 `packages/kernel`**，不再套一层空的 `agent/`。Web / CLI / Gateway / Desktop 是调用方，不进 kernel。

浏览器只看到 `packages/protocol`。UI 禁止 import kernel 或 pi-agent-core。

```
piruse/
  pisource/                         # 只读：学 API，不当产品目录
  packages/
    protocol/                       # 过线合同
      src/
        view.ts                     # 浏览器可见 ViewState
        commands.ts                 # prompt / setModel / openSession…
        index.ts
    kernel/                         # Agent 本体
      src/
        create-kernel.ts            # 唯一组装根
        harness.ts                  # 门面：绑定 session、lane、resume
        index.ts
        loop.ts                     # 占位：现在用 pi 的 loop
        events.ts                   # 占位：事后通知 → UI
        hooks.ts                    # 占位：可拦截扩展点 → 策略
        messages.ts                 # transcript 类型与转换
        view.ts                     # LaneSnapshot → ViewState
        runtime/                    # 预留：lane / drive / restore
        session/                    # 会话仓库（打开、续写、列表）
        compaction/                 # 压窗口阈值与投影（引擎仍在 pi）
        tools/
          builtin/                  # 一工具一文件
          mcp/                      # 预留：MCP → tools
        skills/                     # 预留：发现 / 解析 / 注入（代码）
        models/                     # 目录、鉴权、解析
        prompt/
          system.ts                 # 系统提示拼装
        context/
          assemble.ts               # 本轮模型输入
        profile/                    # 人设：提示词 + 工具组合（现在只有 coding）
        memory/
          internal/                 # 预留：会话内笔记
          external/                 # 预留：用户/外部库
  apps/
    flags.ts                        # cli / web 共用 argv
    cli/                            # 命令行入口
    web/                            # 本机窗口：host + ui
    gateway/                        # 预留：多客户端入口
    desktop/                        # 预留：以后的壳
  skills/                           # SKILL.md 内容，不是 TypeScript
```

## 文件还是目录

| 概念 | 形态 | 位置 |
|---|---|---|
| agent | 不是文件夹 | `packages/kernel` |
| harness | 文件，长大再拆 | `kernel/src/harness.ts` |
| loop | 文件 | `kernel/src/loop.ts` |
| hooks / events | 两个文件，同级 | `hooks.ts` 能拦、能改；`events.ts` 只能看 |
| messages | 文件 | `kernel/src/messages.ts`（UI 气泡走 protocol） |
| system prompt | 文件 | `kernel/src/prompt/system.ts` |
| tools | 目录 | `kernel/src/tools/`，MCP 是子目录不是顶层包 |
| skills | 两个目录 | 代码在 `kernel/src/skills/`，内容在仓库根 `skills/` |
| models | 目录 | `kernel/src/models/`，注入 harness，不是它的子模块 |
| session | 目录 | `kernel/src/session/` |
| compaction | 目录 | 压 transcript 窗口，不是 memory |
| runtime | 预留目录 | 先不从 pi 拷 drive |
| context | 目录 | 本轮模型输入；不要和取消令牌混在一个文件里 |
| profile | 目录 | 人设（coding / 以后的 analyse），注入 tools + prompt |
| memory | 目录 | `internal/` 与 `external/` 同级 |
| web ui | 应用目录 | `apps/web/` |
| gateway / desktop | 预留应用 | `apps/gateway/`、`apps/desktop/` |

## 同级 vs 包含

**同级（各改各的）：** session · tools · skills · models · prompt · memory · compaction · runtime · profile。换 jsonl 只动 session，加工具只动 `tools/builtin`，换默认模型只动 models，换人设只动 `profile/`。

**包含：** harness 使用 session / runtime / hooks / events / compaction；loop 使用 messages + `context/assemble` + model stream。

**注入（不是子目录实现）：** models、tools、memory、skills、profile 由 `create-kernel.ts` 交给 harness。

**子集：** MCP ⊂ tools；internal/external ⊂ memory；cli / web / gateway / desktop ⊂ apps。

## 预留位

只放说明，不写会 `throw` 的假 `index.ts`。

- **现在就有代码：** `session/` · `tools/builtin/` · `models/` · `prompt/` · `compaction/` · `profile/` · protocol
- **只留位置：** `runtime/` · `memory/internal` · `memory/external` · `tools/mcp` · `apps/gateway` · `apps/desktop`
- **不要建：** `loop/` 目录、把所有东西塞进 `harness/`、顶层 `mcp/` 包、空的 `analyse` 人设
