// Modules the Vite plugin (vite-plugin.ts) makes up as it builds a site.

declare module 'virtual:popfold-cases' {
  /** The modelled cases this build carries, by name: in a build only those the site's homes use, in dev both. */
  const cases: Partial<Record<'round' | 'crisp', string>>;
  export default cases;
}
