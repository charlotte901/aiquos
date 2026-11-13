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

## 当前阶段：阶段 2（推荐接入）

- [x] 阶段 0：schema.js + 150 子主题词表 + 守卫测试（全套件 394 pass / 2 skip）
- [x] 阶段 1：首批走通全管线（batch-001 入库 106 条，见下）
- [ ] 阶段 2：build-knowledge-index.mjs 预计算表 + report-recommendations 查表 + 三画像 QA
- [ ] 阶段 3：B站扩采（按 19.3% 总通过率反推需 ~18000 候选，目标量 22000 不变）
- [ ] 阶段 4：书籍章节 800
- [ ] 阶段 5：文档 500 + 文章 200
- [ ] 阶段 6：终检交付

## 来源进度对照（候选 → 入库）

| 来源 | 采集候选 | 入库目标 | 已采集候选 | 已入库 | 状态 |
|---|---|---|---|---|---|
| B站视频 | ~22000 | 3500 | 448（300 CSV + 148 试采） | 79 | 阶段 3 扩采 |
| 书籍章节 | ~3200 | 800 | 0 | 0 | 待阶段 4 |
| 官方文档 | ~5000 | 500 | 0 | 0 | 待阶段 5 |
| 精选文章 | ~2000 | 200 | 0 | 0 | 待阶段 5 |
| LEARNING_RESOURCES（并入 doc 类） | 100 | — | 100 | 27 | 阶段 1 完成 |

全库当前 106 条：D1 67 / D2 15 / D3 36 / D4 20 / D5 19 / D6 10。

## 淘汰率实测（batch-001：300 CSV 种子 + 100 资源 + 148 新采，2026-11-12）

| 层 | 进入 | 淘汰 | 淘汰率 | 备注 |
|---|---|---|---|---|
| raw → cleaned | 548 | 58 | 10.6% | 去重 7、形态/时长/无关词 51 |
| cleaned → tagged（不相关） | 490 | 57 | 11.6% | LLM 判 relevant=false |
| tagged → verified（失效） | 433 | 6 | 1.4% | B站失效 6，网页 0 |
| verified → 入库（质量门） | 427 | 321 | 75.2% | quality 3 分 273 + 2 分 29 + URL 非 https 具体页 19 |
| **总通过率** | 548 | — | **19.3%** | 阶段 3 定量：3500 ÷ 0.193 ≈ 18100 候选 |

⚠️ 种子 300 条的 quality 分布偏低（多数 3 分「信息稀薄」）——2021-2023 老视频为主。
新采按 150 子主题精准搜索，预期质量分布更好；阶段 3 首个 500 批实测后校准。

## 批次日志

- batch-000（2026-11-12）：任务启动。基线 385/2 确认（含 schema 测试后 394/2）。
- batch-001（2026-11-12）：五层管线全通。raw 548 → cleaned 490 → tagged 490（relevant 433）
  → verified 427（失效 6）→ 入库 106。s3 修复两 bug：mapLimit 结果过滤（undefined 混入
  jsonl 成空行）、subtopic/dims 脱节自动修正（救回 15/15，~3% 系统性损耗归零）。
  s5 新建：三道门 + url 幂等 + 全库唯一性守卫；id 仅对入库条目分配（连续编号）。

## 阻塞与重试队列

（无）

## 下一步动作

阶段 2：scripts/build-knowledge-index.mjs（6 维 × 3 档 × 落差诊断槽位预计算）→
升级 src/report-recommendations.js 查表（同子主题 ≤2 打散 + 类型混排）→
scripts/qa-knowledge-recs.mjs 三画像对比 → 测试 + build 绿 → AGENTS.md + commit。
