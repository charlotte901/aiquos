import fs from "node:fs";
import { createAtomicJsonFileStore } from "./storage.js";
export function filePersistence(path) {
  return createAtomicJsonFileStore(fs, path);
}
