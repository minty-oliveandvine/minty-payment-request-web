import { uploadBillAttachments } from "@/lib/api";

/**
 * Uploads each file to the request on its own (`POST /bills/{id}/attachments`, one file per
 * call), so one refused or failed file does not take the others with it, and returns the names
 * of the files that did not upload ([] when all did). The request already exists by then, so a
 * failure here is told to the person as "saved, but X didn't upload", never as "didn't save".
 */
export async function uploadEachAttachment(billId: string, files: File[]): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    try {
      await uploadBillAttachments(billId, [file]);
    } catch (e) {
      console.error(`Failed to upload attachment ${file.name}:`, e);
      failed.push(file.name);
    }
  }
  return failed;
}

/** "a.pdf", "a.pdf and b.pdf", "a.pdf, b.pdf and c.pdf". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
