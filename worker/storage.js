// 持久化存储的共享底座：原子写 JSON 文件 + 三个 store 的适配器。
//
// 设计约束：worker/index.js 也可能跑在无 node:fs 的运行时（如 Cloudflare
// Workers），因此本模块**不直接 import node:fs**——fs 实现由调用方注入：
//   · vite dev 中间件（Node）注入静态导入的 node:fs；
//   · 生产接线（worker/index.js 的 ensurePersistence）在环境变量
//     AIQUOS_DATA_DIR 存在时动态 import node:fs。未配置目录时保持内存态；
//     账号接口由入口拒绝，配置失败则停止写入。
//
// 原子写：先写 `<file>.tmp-<pid>-<seq>` 再 rename 覆盖。直接 writeFileSync
// 在写一半崩溃/断电会留下截断的 JSON，下一次 loadState 按损坏文件处理，
// 全部账号/数据静默清零；rename 在同一文件系统上是原子的，读方永远只能
// 看到旧全文或新全文。

let tmpSequence = 0;

/** 单个 JSON 文件的原子读写（fs 实现注入）。 */
export function createAtomicJsonFileStore(fs, filePath) {
  const read = (path) => {
    try { return fs.readFileSync(path, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  const write = (path, text) => {
    fs.mkdirSync?.(dirnameOf(path), { recursive: true });
    const tmp = `${path}.tmp-${globalThis.process?.pid ?? 0}-${++tmpSequence}`;
    try { fs.writeFileSync(tmp, text); fs.renameSync(tmp, path); }
    finally { try { fs.unlinkSync(tmp); } catch { /* rename already removed it */ } }
  };
  return {
    load() {
      const raw = read(filePath);
      if (raw === null) return null;
      try { JSON.parse(raw); return raw; }
      catch (error) {
        const backup = read(`${filePath}.bak`);
        if (backup === null) throw error;
        JSON.parse(backup);
        return backup;
      }
    },
    save(text) {
      JSON.parse(text);
      const previous = read(filePath);
      if (previous !== null) {
        let valid = false;
        try { JSON.parse(previous); valid = true; } catch { /* preserve the last good backup */ }
        if (valid) write(`${filePath}.bak`, previous);
      }
      write(filePath, text);
    },
    remove() {
      for (const path of [filePath, `${filePath}.bak`]) {
        try { fs.unlinkSync(path); }
        catch (error) { if (error.code !== "ENOENT" && error.message !== "ENOENT") throw error; }
      }
    },
  };
}

function dirnameOf(filePath) {
  const index = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return index < 0 ? "." : index === 0 ? filePath[0] : filePath.slice(0, index);
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
    // Seed only a new installation; the Node-only bootstrap stays outside CF imports.
    const cohortModuleName = "./initial-" + "cohort.js";
    const { bootstrapInitialCohort } = await import(cohortModuleName);
    fs.mkdirSync(dir, { recursive: true });
    bootstrapInitialCohort(join(dir, "auth-accounts.json"), join(dir, "aiquos-shared-data.json"),
      new URL("./initial-cohort.json", import.meta.url));
    const adapters = filePersistenceAdapters(fs, join, dir);
    // Validate or recover both files before accepting any production request.
    adapters.account.load();
    adapters.shared.load();
    inject(adapters);
    return true;
  } catch (error) {
    throw new Error("无法初始化持久存储，已停止写入", { cause: error });
  }
}
