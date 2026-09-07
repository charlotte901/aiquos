import { ForumBoard } from "./ForumBoard";
import { CaseArchive } from "./CaseArchive";

export function LibraryHub({ variant, onDetailChange }) {
  if (variant === "cases") return <CaseArchive onDetailChange={onDetailChange} />;
  if (variant === "forum") return <ForumBoard onDetailChange={onDetailChange} />;
  return null;
}
