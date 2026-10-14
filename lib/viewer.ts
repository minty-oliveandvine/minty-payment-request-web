// Who is looking lives in @minty/shared (Part 3 step 4, 2026-10-12) - it reads the token and
// reaches Flask through this app's host. This file stays so the side-effect import below registers
// that host before the store's first read, and so every call site kept its path.

import "@/components/ui/sidebarHost";

export {
  useViewer,
  primeViewer,
  _setViewerLoaderForTests,
  type Viewer,
} from "@minty/shared/viewer";
