# 知识库构建进度账本（唯一进度真源）

> 规则：每完成一个批次立即更新本文件。中断后新会话读 AGENTS.md 末条 + 本文件即可续跑。
> 数据落位：work/kb/{raw,cleaned,tagged,verified,rejected}/ 对应管线五层。
> 最终交付物（入 git）：src/knowledge/schema.js、src/knowledge/knowledge-base.json、
> src/knowledge/rec-index.json（预计算表）、scripts/build-knowledge-index.mjs、
> scripts/qa-knowledge-recs.mjs、tests/knowledge-*.test.mjs、work/kb/*.mjs（管线脚本，
> 通过 .gitignore 白名单入库）。

## 总目标

入库 5000 条精选学习对象（B站视频 3500 / 书籍章节 800 / 官方文档 500 / 精选文章 200），
六维各 ≥600；觉醒报告个性化推荐改为查知识库预计算表。

## 当前阶段：阶段 3-5 滚动扩量（三路采集 + 滚动五层管线）

- [x] 阶段 0：schema.js + 150 子主题词表 + 守卫测试（394/2 → 现 398/2）
- [x] 阶段 1：首批五层管线入库 106 条（漏斗 19.3%）
- [x] 阶段 2：90 槽位预计算表 + report-recommendations/report-learning-plan 查表 + 三画像 QA
  （commit d052045）
- [ ] 阶段 3：B站扩采（采集器后台跑 892 次搜索；滚动管线消化）
- [ ] 阶段 4：书籍章节（编目完成 861 条，待标注体检入库）
- [ ] 阶段 5：文档/文章（采集完成 601+ 条，待标注体检入库）
- [ ] 阶段 6：终检（≥5000、六维≥600、404 复检、抽检 10%）+ push

## 后台进程（中断后先查再重启，避免双跑）

| 进程 | 状态 | 断点 |
|---|---|---|
| collect-bili.mjs（bili-001 全量 892 搜索） | 运行中（~10%/892，约 2h） | raw/bili-001-done.json |
| roll-pipeline.sh（s2→s3 400→s4 400 循环） | 运行中 | tagged/annotations.jsonl + verified/checkpoint-*.jsonl |
| books-crawl3 | 已完成（+436） | books.jsonl 按 url 去重 |

⚠️ 只允许一个 roller 实例（此前双开导致并发追加风险，已清理）。
重启命令：`nohup bash work/kb/roll-pipeline.sh 500 >> work/kb/roll-pipeline.log 2>&1 &`

## 来源进度对照（候选 → 入库）

| 来源 | 目标 | 已采集候选 | 已入库 | 状态 |
|---|---|---|---|---|
| B站视频 | 3500 | 1486+（采集持续） | 106 | 采集/滚动管线 |
| 书籍章节 | 800 | 861（18 本开源教材） | 0 | 已编目待管线 |
| 官方文档 | 500 | 320（MS Learn 280 + 维基 25 + 厂商 28） | 0 | 已采集待管线 |
| 精选文章 | 200 | 301（掘金，LLM 粗筛在 s3） | 0 | 已采集待管线 |

## 淘汰率实测（batch-001 种子批，2026-11-12）

| 层 | 进入 | 淘汰 | 淘汰率 | 备注 |
|---|---|---|---|---|
| raw → cleaned | 548 | 58 | 10.6% | 去重 7、形态/时长/无关词 51 |
| cleaned → tagged（不相关） | 490 | 57 | 11.6% | LLM 判 relevant=false |
| tagged → verified（失效） | 433 | 6 | 1.4% | B站失效 6，网页 0 |
| verified → 入库（质量门） | 427 | 321 | 75.2% | quality 3 分 273 + 2 分 29 + URL 非 https 具体页 19 |
| **总通过率（种子）** | 548 | — | **19.3%** | 新采/书籍/文档预计显著更高（精准搜索+权威源） |

## 批次日志

- batch-000：任务启动，基线确认。
- batch-001：种子批五层全通，入库 106。s3 修 2 bug（mapLimit 空行、subtopic 自动归位）。
- batch-001 扩量（进行中）：
  - 采集器：150 子主题 × 3 词 × 2 页 = 900 搜索（断点续传，失败不标 done 待重试）。
  - 书籍：books-crawl{,2,3}.mjs → 18 本开源教材 861 章（d2l 140 / self-llm 283 /
    AI-System 81 / thorough-pytorch 70 / promptingguide 128 / llm-cookbook 36 /
    easy-rl 32 / pumpkin 20 等）。GitHub node fetch 不稳 → 全部走 curl；
    GitHub API 匿名限额 60/h → 限额窗口错峰跑。
  - 文档/文章：docs-crawl.mjs（MS Learn catalog API zh 280 + 维基 API + 厂商清单 28）
    + wiki-crawl.mjs（+19）+ 掘金搜索 301。维基仅 +19：部分分类被反爬限流，D6 配额
    靠 MS Learn Responsible-AI 模块 + 掘金伦理文 + B站 D6 子主题补。
  - s4 修 2 bug：checkpoint 写读格式不一致（writeJson 数组 vs readJsonl 行）导致
    续跑全崩——新版统一 JSONL + 兼容读旧数组；网页体检加 url 断点（滚动管线必需）。
  - 滚动管线 roll-pipeline.sh：每轮 s2 → s3 --limit 400 → s4 --limit 400，
    断点安全重入。当前 annotations 1675 / checkpoint-videos 733。

## 阻塞与重试队列

- 维基百科部分分类请求被限流（HTTP 反爬页），阶段 6 复采补 D6。
- prompt-engineering-for-developers / dive-into-cv-python / handy-multi-agents
  三个仓库 tree API 失败（限额/网络），阶段 6 重试补爬。

## 下一步动作

1. 等采集器跑完 892 搜索 + roller 消化完全部 cleaned（annotations ≈ cleaned 总数，
   checkpoint-videos ≈ relevant 视频数）。
2. node work/kb/s5-ingest.mjs --batch batch-001 入库 + 重建 rec-index + 跑
   scripts/qa-knowledge-recs.mjs + 全量测试。
3. 阶段 6 终检：404 全量复检、10% 分层抽检（audit-sample.md）、六维配额不足回补、
   AGENTS.md 终版记录、git commit + push。
