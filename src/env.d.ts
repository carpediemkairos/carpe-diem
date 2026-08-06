/// <reference path="../.astro/types.d.ts" />

// JSX intrinsic elements for Astro components (silences "JSX element implicitly
// has type 'any'" noise that the React JSX config produces on plain HTML).
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
