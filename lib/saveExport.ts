/**
 * Save a file Minty MADE on request - an export the person asked to download (the bills CSV,
 * 2026-11-13) - to the browser's downloads: an object URL on a temporary `<a download>`.
 *
 * Never for an uploaded file: those always open in the full-screen viewer and never download
 * themselves (`AttachmentFullScreenViewer.tsx`; owner, 2026-10-09). This module is the one place
 * excused from `__tests__/no_new_tab_file_links.test.ts`'s "no download" lock for that reason.
 */
export function saveExport(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // after the click has started the download
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
