# Interface icons

The 139 interface SVGs in this directory are vendored from [Lucide](https://lucide.dev), version **0.468.0**, under the [ISC license](./LUCIDE-LICENSE). Original upstream icon names are preserved in each SVG’s `lucide-*` class; existing Alexandrie filenames remain stable so saved icon choices continue to work. The Alexandrie brand mark is separate.

Use a 24 × 24 viewBox, `fill="none"`, `stroke="currentColor"`, a **1.75** stroke width, and round line caps and joins for interface icons. Keep these attributes when adding icons. The Vite sprite plugin bundles them locally, so displaying icons requires no external service or runtime dependency.

Semantic color classes should set `color`; never force `fill` on an outline icon or its paths. In Vue, use the shared `Icon` component. Prefer `display="sm"` for compact controls and `:size="36"` for a padded card icon; numeric sizes are interpreted as pixels. Icon-only controls need an accessible label on their button or link.
