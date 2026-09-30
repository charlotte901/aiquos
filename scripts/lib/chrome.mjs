/**
 * 跨平台浏览器可执行文件解析 —— QA / 实验脚本共用。
 *
 * 这些脚本通过 Chrome DevTools 协议驱动真实浏览器（headless）。历史上
 * 全部硬编码 macOS 路径 `/Applications/Google Chrome.app/...`，在
 * Windows / Linux 上直接 ENOENT。解析顺序：
 *   1. 环境变量 AIQUOS_CHROME（显式覆盖，存在性校验）；
 *   2. 平台默认候选：win32 用 Program Files/LOCALAPPDATA（Chrome 优先，
 *      Edge 兜底 —— Edge 同为 Chromium，CDP 参数完全一致）；
 *      darwin 保持原路径；linux 查常见发行版路径；
 *   3. 全部未命中时抛错并列出已检查的路径（比 spawn 的裸 ENOENT 可诊断）。
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

export function chromeBin() {
  const override = process.env.AIQUOS_CHROME;
  if (override) {
    if (existsSync(override)) return override;
    throw new Error(`AIQUOS_CHROME 指向的浏览器不存在: ${override}`);
  }

  const candidates = [];
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles ?? "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    candidates.push(
      join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
      join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
      join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
      join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/usr/bin/microsoft-edge",
    );
  }

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error(
    [
      "未找到可用的 Chromium 系浏览器，已检查：",
      ...candidates.map((path) => `  - ${path}`),
      "可设置环境变量 AIQUOS_CHROME 指向 chrome.exe / msedge.exe / chromium 路径。",
    ].join("\n"),
  );
}

/**
 * 清理 headless Chrome 的临时 user-data-dir。
 *
 * Windows 上 Chrome 退出后仍会短暂持有目录内文件锁：紧随 kill 的
 * rmSync(recursive) 抛 EPERM（macOS 无此问题）。rmSync 的 maxRetries/
 * retryDelay 恰好针对 Windows 的 EPERM/EBUSY；重试后仍失败也不视为
 * 错误——temp 目录由系统清理，QA 结果已经落盘。
 */
export function rmProfile(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  } catch {
    // 见上：锁未释放时交给系统清理。
  }
}
