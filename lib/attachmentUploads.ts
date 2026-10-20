import { uploadBillAttachments } from "@/lib/api";

/**
 * Uploads a request's invoice files ONE PER CALL and returns the names of those that did not
 * arrive. The API's multi-file upload is not all-or-nothing, so a batch that fails part-way
 * cannot say which files are stored; one call per file can. Each failure is logged.
 */
export async function uploadEachAttachment(billId: string, files: File[]): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    try {
      await uploadBillAttachments(billId, [file]);
    } catch (err) {
      console.error(`[payment request] ${file.name} did not upload`, err);
      failed.push(file.name);
    }
  }
  return failed;
}

/** "a.pdf", "a.pdf and b.pdf", "a.pdf, b.pdf and c.pdf" - file names inside a sentence. */
export function joinFileNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
