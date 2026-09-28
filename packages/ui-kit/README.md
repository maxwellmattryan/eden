# @eden/ui-kit

The Eden design system as a Svelte 5 component library: tokens, themes, fonts, icons and components shared by the desktop
and mobile apps. Storybook is the acceptance surface (`yarn storybook` from the repository root).

Conventions, the token pipeline and the per-component contracts are documented in `docs/engineering/ui-kit.md` and
`docs/engineering/ui-kit-components.md`. Generated files (`src/lib/styles/*`, `src/lib/tokens/tokens.ts`,
`src/lib/icons/icons.ts`) are never hand-edited: change `src/lib/tokens/tokens.json` or `icon-list.json` and run
`yarn tokens` / `yarn icons`.
