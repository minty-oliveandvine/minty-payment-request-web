// Runs before every test file, in whichever environment that file asked for.
//
// Almost everything a setup file wants to do here needs a DOM, and one test file does not have
// one: __tests__/middleware.test.ts declares `@vitest-environment node`, because NextRequest
// wants the platform Request. Loading the DOM half unconditionally made that file fail at
// `Element.prototype` before a single case ran, so the DOM work - and the imports that reach
// for `document` as they load - live in ./setup.dom.ts and are pulled in only when there is a
// window to hold them.

export {}; // a module, so the top-level await below is allowed

if (typeof window !== "undefined" && typeof document !== "undefined") {
  await import("./setup.dom");
}
