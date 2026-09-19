// Admin API client. All calls go to the same-origin worker endpoints.
export async function fetchBank() {
  const response = await fetch("/api/admin/bank");
  if (!response.ok) throw new Error(`题库读取失败（${response.status}）`);
  return response.json();
}

export async function saveBank(questions) {
  const response = await fetch("/api/admin/bank", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ questions }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? `保存失败（${response.status}）`);
  return payload;
}

export async function resetBankToBundled() {
  const response = await fetch("/api/admin/bank", { method: "DELETE" });
  if (!response.ok) throw new Error(`恢复失败（${response.status}）`);
  return response.json();
}
