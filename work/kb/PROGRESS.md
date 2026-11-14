# 知识库构建进度账本（唯一进度真源）

> 规则：每完成一个批次立即更新本文件。中断后新会话读 AGENTS.md 末条 + 本文件即可续跑。
> 数据落位：work/kb/{raw,cleaned,tagged,verified,rejected}/ 对应管线五层。

## ⚠️ 当前阻塞（2026-11-13 21:50）

**两个 LLM 通道相继耗尽**：
1. DeepSeek：余额 402（2026-11-12 起），未充值。
2. Gemini 反代（new-provider/gemini-3.8-flash-high）：2026-11-13 晚被服务方以
   「违反服务条款」封禁（HTTP 403，需账号申诉）。工作流 dwfrun-afd37563 在第 16 个
   切片处被停——前 9 个切片 432 条标注已落盘合并（质量抽查 0 编造）。

### 解除阻塞后续跑（任选其一）

- **申诉解封 Gemini 反代账号**后：`ResumeWorkflowRun dwfrun-afd37563`（已完成的
  切片从缓存回放，只跑剩余 44 个切片），然后 s4 → s5 → 重建索引 → QA → push。
- **充值 DeepSeek** 后：`nohup caffeinate -is bash work/kb/roll-pipeline.sh 60 >> work/kb/roll-pipeline.log 2>&1 &`
  （剩 2085 条候选：标注 + 体检一体），然后 s5 → 重建 → QA → push。
- 换其他已授权 LLM API：改 work/kb/lib.mjs 的 chatOnce 端点即可，管线不变。

## 已交付现状（阻塞时点）

- **全库 2800 条**已入库 `src/knowledge/knowledge-base.json`（video ~1330 / book_chapter ~780 / doc ~690）
- 六维分布：D1 1429 / D2 493 / D3 1247 / D4 1001 / D5 484 / D6 275（终检要求各 ≥600，未达标）
- rec-index 90 槽全部有货；三画像 QA 全过；全套件 398 pass / 2 skip；build 过
- Gemini 通道已验证可用：两批 2584 条标注 0 淘汰、质检 0 编造（annotator 字段溯源）
- 全量 404 复检完成：剔除死链 47（视频 9 + 网页 46）；118 条网页域名不可达按口径保留
- 抽检清单 `work/kb/audit-sample.md`（133 条分层抽样）已生成，机器预检通过，人工栏待填

## 来源进度对照（候选 → 入库）

| 来源 | 目标 | 采集候选 | 入库 | 缺口原因 |
|---|---|---|---|---|
| B站视频 | 3500 | 12131 唯一（900 搜索全跑完） | 543 | 标注被 402 阻塞：cleaned 视频 4172，已标注 2636 |
| 书籍章节 | 800 | 861（18 本开源教材） | 746 | 已基本达标（419 条被质量门淘汰多为 quality 3） |
| 官方文档 | 500 | 320（MS Learn 280 + 维基 25 + 厂商 28） | 43 | 大部分未标注 |
| 精选文章 | 200 | 301（掘金） | 0 | 完全未标注 |
| LEARNING_RESOURCES | — | 100 | 已含于 doc 43 | — |

## 漏斗实测（全量累计，2026-11-13）

| 层 | 进入 | 淘汰 | 备注 |
|---|---|---|---|
| raw → cleaned | 12631（12131 B站 + 500 web） | ~7500 | 无关词 5831 / 时长 1451 / 形态 357 / 去重 113 |
| cleaned → tagged | 5133 | 1536 未标注（阻塞） | 已标注 3597（relevant ~92%） |
| tagged → verified | ~3213 | 47 死链 | 118 unverified 域名保留 |
| verified → 入库 | 3207 | 1875 | quality<4 占 85%（种子老视频为主） |
| **入库** | **1332** | — | video 543 / book 746 / doc 43 |

## 后台进程

（无——采集器已完成 892/892 搜索；roller 因 402 已停。重启命令见阻塞段。）

## 批次日志（关键修复存档）

- batch-001 种子批：入库 106（漏斗 19.3%）。
- 扩量期修复：collect 失败不标 done；s4 checkpoint 写读格式统一 + 网页断点 +
  curl 兜底（node fetch 对 github.io 全挂）+ process.exit 防 socket 拖住事件循环；
  s5 改以 checkpoint 为准源；s3 buildPrompt 增书籍分支 + 难度下限钳制。
- 教训：**双开 roller 会并发追加 jsonl**（已清理，重启前必须 `ps` 确认单实例）；
  **Mac 睡眠会杀后台管线**（必须 caffeinate -is）。

## 下一步动作

见顶部「解除阻塞后续跑步骤」。终检清单：六维 ≥600 复核 → 抽检人工栏 →
AGENTS.md 终版漏斗数据 → commit + push（任务书已授权）。
