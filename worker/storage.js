// 持久化存储的共享底座：原子写 JSON 文件 + 三个 store 的适配器。
//
// 设计约束：worker/index.js 也可能跑在无 node:fs 的运行时（如 Cloudflare
// Workers），因此本模块**不直接 import node:fs**——fs 实现由调用方注入：
//   · vite dev 中间件（Node）注入静态导入的 node:fs；
//   · 生产接线（worker/index.js 的 ensurePersistence）在环境变量
//     AIQUOS_DATA_DIR 存在时动态 import node:fs，失败（非 Node 运行时）
//     静默保持内存态——与打包产物「纯 Node 模块」的部署形态一致。
//
// 原子写：先写 `<file>.tmp-<pid>-<seq>` 再 rename 覆盖。直接 writeFileSync
// 在写一半崩溃/断电会留下截断的 JSON，下一次 loadState 按损坏文件处理，
// 全部账号/数据静默清零；rename 在同一文件系统上是原子的，读方永远只能
// 看到旧全文或新全文。

let tmpSequence = 0;

/** 单个 JSON 文件的原子读写（fs 实现注入）。 */
export function createAtomicJsonFileStore(fs, filePath) {
  return {
    load() {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return null; // 不存在或不可读：由上层按「无存档」处理。
      }
    },
    save(text) {
      fs.mkdirSync?.(dirnameOf(filePath), { recursive: true });
      tmpSequence += 1;
      const tmp = `${filePath}.tmp-${process.pid ?? 0}-${tmpSequence}`;
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, filePath);
    },
    remove() {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // 本来就没有：删除即完成。
      }
    },
  };
}

function dirnameOf(filePath) {
  const index = filePath.lastIndexOf("/");
  if (index <= 0) return index === 0 ? "/" : ".";
  // Windows 路径（打包产物也跑 Node/win）：反斜杠同样处理。
  const winIndex = filePath.lastIndexOf("\\");
  return filePath.slice(0, Math.max(index, winIndex) > 0 ? Math.max(index, winIndex) : index);
}

/**
 * 三个 store 的文件持久化适配器（dev 中间件与 AIQUOS_DATA_DIR 生产接线
 * 共用同一套）。文件名与 dev 模式一致，目录由调用方指定。
 */
export function filePersistenceAdapters(fs, join, dir) {
  const accountFile = createAtomicJsonFileStore(fs, join(dir, "auth-accounts.json"));
  const sharedFile = createAtomicJsonFileStore(fs, join(dir, "aiquos-shared-data.json"));
  const bankFile = (edition) => createAtomicJsonFileStore(fs, join(dir, `bank-overrides${edition === "A" ? "-full" : ""}.json`));
  return {
    account: { load: () => accountFile.load(), save: (raw) => accountFile.save(raw) },
    shared: { load: () => sharedFile.load(), save: (raw) => sharedFile.save(raw) },
    bank: {
      load: (edition) => bankFile(edition).load(),
      save: (raw, edition) => bankFile(edition).save(raw),
      clear: (edition) => bankFile(edition).remove(),
    },
  };
}

/**
 * 生产接线：AIQUOS_DATA_DIR 指向可写目录时，把三个 store 从内存态切到
 * 文件持久化。dynamic import 用拼串的模块名，避免打包器把它当静态依赖
 * （无 node:fs 的运行式部署不受影响）。
 */
export async function ensureFilePersistence(env, inject) {
  const dir = env?.AIQUOS_DATA_DIR;
  if (!dir || typeof dir !== "string") return false;
  try {
    const fsModuleName = "node:" + "fs";
    const pathModuleName = "node:" + "path";
    const fsModule = await import(fsModuleName);
    const pathModule = await import(pathModuleName);
    // node:fs 的 default 是带全部函数的 CJS 对象；node:path 的 default 同理，
    // join 要取它的方法而不是对象本身（`path.default(...)` 不是函数）。
    const fs = fsModule.default ?? fsModule;
    const path = pathModule.default ?? pathModule;
    const join = pathModule.join ?? path.join.bind(path);
    const adapters = filePersistenceAdapters(fs, join, dir);
    inject(adapters);
    return true;
  } catch {
    // 无 node:fs / 目录不可写：保持各 store 的模块内存态（per-isolate），
    // 与未配置该变量的行为一致。
    return false;
  }
}
