#!/bin/bash
# 滚动管线编排（阶段 3-5）：反复跑 s2(清洗) → s3(标注 400) → s4(体检 400)，
# 直到候选排干或达到轮数上限。全部脚本支持断点续传，安全重入。
# 用法：bash work/kb/roll-pipeline.sh [轮数]   日志：work/kb/roll-pipeline.log
set -u
cd "$(dirname "$0")/../.."
CYCLES="${1:-200}"
echo "[roll] start $(date '+%F %T') cycles=$CYCLES" >> work/kb/roll-pipeline.log
for i in $(seq 1 "$CYCLES"); do
  echo "[roll] cycle $i $(date '+%F %T')" >> work/kb/roll-pipeline.log
  node work/kb/s2-clean.mjs --batch batch-001 >> work/kb/roll-pipeline.log 2>&1 || { echo "[roll] s2 FAILED" >> work/kb/roll-pipeline.log; exit 1; }
  node work/kb/s3-annotate.mjs --batch batch-001 --limit 400 --concurrency 12 >> work/kb/roll-pipeline.log 2>&1 || echo "[roll] s3 round failed (continues)" >> work/kb/roll-pipeline.log
  node work/kb/s4-verify.mjs --batch batch-001 --limit 400 >> work/kb/roll-pipeline.log 2>&1 || echo "[roll] s4 round failed (continues)" >> work/kb/roll-pipeline.log
done
echo "[roll] done $(date '+%F %T')" >> work/kb/roll-pipeline.log
