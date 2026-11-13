# 知识库构建进度账本（唯一进度真源）

> 规则：每完成一个批次立即更新本文件。中断后新会话读 AGENTS.md 末条 + 本文件即可续跑。
> 数据落位：work/kb/{raw,cleaned,tagged,verified,rejected}/ 对应管线五层。

## ⚠️ 当前阻塞（2026-11-13 09:10）

**DeepSeek 账户余额耗尽（HTTP 402 Insufficient Balance）**，LLM 标注层（s3）全量失败。
已实测：`.env.local` 的 ARK_API_KEY 指向 api.vllmproxy.com，仅生图模型无文本通道；
本机无 ollama/lmstudio 等本地 LLM。**已重试：单条调用两次确认 402（非限流）。**

### 解除阻塞后续跑步骤（按序执行）

1. 充值/更换 `.env.local` 的 DEEPSEEK_API_KEY 后：
   `nohup caffeinate -is bash work/kb/roll-pipeline.sh 30 >> work/kb/roll-pipeline.log 2>&1 &`
   （剩余待标注 ~1536 条：约 4 个周期跑完；s4 已全部跟上，无积压）
2. `node work/kb/s5-ingest.mjs --batch batch-001`（增量入库）
3. `node scripts/build-knowledge-index.mjs && node scripts/qa-knowledge-recs.mjs`
4. 六维配额复核（≥600/维），不足则 `collect-bili.mjs` 按缺的维度补采
   （`--dims D5,D6`），再走 2-3。
5. 阶段 6 终检清单（见「下一步动作」）+ AGENTS.md 终版 + push。

## 已交付现状（阻塞时点）

- **全库 1332 条**已入库 `src/knowledge/knowledge-base.json`（video 543 / book_chapter 746 / doc 43）
- 六维分布：D1 599 / D2 243 / D3 595 / D4 760 / D5 99 / D6 24（终检要求各 ≥600，未达标）
- rec-index 90 槽全部有货；三画像 QA 全过；全套件 398 pass / 2 skip；build 过
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
