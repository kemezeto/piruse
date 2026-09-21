# piruse

本机 coding agent。对话、工具调用、会话和模型都跑在本机；浏览器只渲染界面，不接触 kernel 或模型密钥。

Agent 本体是 `packages/kernel`。Web / CLI 是调用方。模型目录和密钥与 [pi](https://github.com/badlogic/pi-mono) 共用 `~/.pi/agent`（`auth.json`、settings、已安装的扩展和技能）。会话写在 `~/.piruse/sessions`。

## Picture

![1](picture/1.jpg)

![2](picture/2.jpg)

![3](picture/3.jpg)

![4](picture/4.jpg)

![5](picture/5.jpg)

![6](picture/6.jpg)

![7](picture/7.jpg)

![8](picture/8.jpg)

![9](picture/9.jpg)

## 要不要装 pi

**不用。** 跑 piruse 不需要安装 [pi](https://github.com/badlogic/pi-mono) CLI，也不依赖 `@earendil-works/pi-coding-agent`。`npm install` 之后直接 `npm run web` / `npm start` 即可。

密钥、settings、已装扩展和技能读的是同一份 `~/.pi/agent`。你以前用过 pi，这些会直接生效；没用过也可以，自己写 `auth.json` 或设环境变量。

只有要装 / 卸扩展和技能时，才需要官方 `pi install` / `pi uninstall`。piruse 不做安装，只发现和启用。

## 要求

- Node.js ≥ 22.19
- 至少一个模型密钥：写在 `~/.pi/agent/auth.json`，或设置对应 provider 的环境变量

```bash
npm install
```

## 启动

本机窗口（默认 `http://127.0.0.1:8787`，只绑回环地址）：

```bash
npm run web
npm run web -- --cwd ~/code/other
npm run web -- --model deepseek/deepseek-v4-flash
```

命令行跑一轮后退出：

```bash
npm start -- "这个目录有哪些文件？"
npm start -- --continue
npm start -- --model deepseek/deepseek-v4-flash "…"
```

常用参数：`--cwd`、`--session`、`--continue` / `-c`、`--provider`、`--model`、`--permission read|review|allow`、`--port`、`--no-open`。

## 能做什么

- 读、搜、改文件：`read` / `grep` / `glob` / `write` / `edit` / `bash`
- 权限：只读、审核、允许。Web 默认审核，危险 bash 仍会拦住
- 多项目、多会话；归档后可在设置里恢复或删除
- 设置里管理模型、扩展、技能。安装 / 卸载扩展和技能仍用官方 `pi install` / `pi uninstall`，piruse 只负责发现和启用
- 已加载的 Pi 扩展可注册工具和 provider。TUI、slash 命令、快捷键在 Web 里不可用
- `pi-subagents` 的前台 `subagent` 由 piruse 自己的 harness 跑子会话，不包一层 Pi TUI

记忆模块（`memory/internal`、`memory/external`）还没接上。跨轮内容靠会话 jsonl；窗口太大时走 compaction。

## 还要改

整体循环已经能跑通，后面不会大动。这几处实现还不行，之后会改：

1. **技能、扩展、工具** 三大模块：现在能发现 / 加载 / 调用，但具体实现有问题，边界、启用方式和跟 kernel 的接法都不干净。
2. **文件布局**：系统架构和目录切分还要再收。职责散、边界糊，之后会重新排。
3. **引入 pi-agent 的方案**：现在对 pi 的依赖切法不够好，之后会换成更干净的接法。

## Analyse 看板：哪些数据接得上

Analyse 和 Coding 是同一套 kernel、同一份 `~/.piruse/sessions` jsonl。看板不另做埋点 SDK，也不读 Cursor / Copilot / 云端账单。浏览器只拿汇总快照（`loadAnalyse`），不直接读账本。

**jsonl 里有、已经接上：**

- 概览：会话数、消息、项目、活跃天、日历 / 小时热力、热门会话、Tool 调用次数
- 用量：input / output / cache token、费用（assistant `usage` 或 usage ledger）
- 活动：按会话起止时间推窗口、并发、费用
- 会话页：当前会话的 `ViewState`（消息和工具回合）
- 数据表：会话账本行
- 质量里能直接数的：中止、失败、工具错误、compaction 次数

**账本里没有、接不上：**

| 界面上的能力 | 为什么接不上 |
| --- | --- |
| 常用 Skills / 技能调用次数 | 技能只写入系统提示，模型用 `read` 打开 SKILL.md；jsonl 没有 skill 调用事件 |
| 质量 A–F、平均分 | 没有 LLM 评分或人工标注；现在的分数是用完成 / 中止 / 失败 / 工具错误推的操作健康度，不是回复质量 |
| 用量 credits / 账户余额 | 没有各 provider 的账单或额度接口 |
| 活动里的 automation | 没有后台自动化会话类型，全部记成 interactive |
| 按 Agent 拆分（Analyse vs Coding 等） | 只有 coding 会话；Analyse 是 UI 开关，不单独写 jsonl |
| Cursor / Copilot / 其他 IDE 用量 | 本机 agent 看不到那些产品的遥测 |
| MCP 工具 | `tools/mcp` 还没接 |
| 记忆读写 | `memory/` 还没接 |

时区按 Asia/Shanghai。归档会话不进看板。

## 结构

浏览器只看到 `packages/protocol`。UI 禁止 import kernel 或 `pi-agent-core`。

```
piruse/
  picture/                          # README 截图
  pisource/                         # 只读：学 API，不当产品目录
  packages/
    protocol/                       # 过线合同（ViewState / commands）
    kernel/                         # Agent 本体
      src/
        create-kernel.ts            # 唯一组装根
        harness.ts                  # 绑定 session、lane、resume
        session/                    # 打开、续写、列表、归档
        tools/builtin/              # 一工具一文件
        models/                     # 目录、鉴权、解析
        extensions/                 # 加载 ~/.pi 里已安装的扩展
        skills/                     # 发现 / 解析 / 注入
        prompt/                     # 系统提示
        context/                    # 本轮模型输入
        compaction/                 # 窗口阈值（切点和摘要仍在 pi）
        profile/                    # 人设（现在只有 coding）
        memory/                     # 预留：internal / external
  apps/
    flags.ts                        # cli / web 共用 argv
    cli/                            # 命令行入口
    web/                            # 本机窗口：host + ui
    gateway/                        # 预留
    desktop/                        # 预留
  skills/                           # SKILL.md 内容，不是 TypeScript
```

**同级（各改各的）：** session · tools · skills · models · prompt · memory · compaction · profile。换 jsonl 只动 session，加工具只动 `tools/builtin`，换默认模型只动 models。

**注入：** models、tools、skills、profile 由 `create-kernel.ts` 交给 harness。

当前有代码：`session/` · `tools/builtin/` · `models/` · `prompt/` · `compaction/` · `profile/` · `extensions/` · protocol。只留位置：`runtime/` · `memory/` · `tools/mcp` · `apps/gateway` · `apps/desktop`。上面这张图是现状，不是终局；布局和 pi-agent 接法都会再改。
