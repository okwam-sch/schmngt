/* ------------------------------------------------------------------ *
 * Central CSV helpers — the one place every module builds and downloads
 * spreadsheet files. All output is formula-injection safe and UTF-8 BOM
 * prefixed so Excel opens it correctly.
 * ------------------------------------------------------------------ */

/** Quote one cell and neutralize formula-like text before spreadsheet opening. */
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Rows of cells -> CSV text (BOM + CRLF). */
export function toCsv(rows: unknown[][]) {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** Records -> CSV text, headers from the first record's keys. */
export function recordsToCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  return toCsv([headers, ...rows.map((r) => headers.map((h) => r[h]))]);
}

/** Download rows of cells as a CSV file. */
export function downloadCsv(filename: string, rows: unknown[][]) {
  downloadText(filename, toCsv(rows));
}

/** Download records as a CSV file. */
export function downloadRecordsCsv(filename: string, rows: Record<string, unknown>[]) {
  downloadText(filename, recordsToCsv(rows));
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delayed revoke: revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
