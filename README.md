# eden

A personal digital garden: one desktop and mobile app that assists its owner across the domains of life, built on a small shared substrate so domains stay standalone yet informed by each other.

## Status

The docs, the UI kit, and the desktop and mobile scaffolds on Svelte 5, Tauri 2 and Tailwind 4, ported from [Crate](https://github.com/maxwellmattryan/crate): the shell, settings, i18n, the updater and CI/CD run; the domains are mocked in Storybook and not yet built.

## Start here

- [docs/INDEX.md](docs/INDEX.md): every doc with a one-liner, a status and when to load it.
- [docs/product/vision.md](docs/product/vision.md): what Eden is and is not.
- [docs/product/decisions.md](docs/product/decisions.md): what is settled and what is open.
- [docs/CONVENTIONS.md](docs/CONVENTIONS.md): conventions for editing these docs.

## Repo layout

```
eden/
├── apps/
│   ├── desktop/         the desktop frontend (SvelteKit SPA the Tauri shell loads)
│   └── mobile/          the mobile frontend
├── packages/
│   ├── ui-kit/          @eden/ui-kit: tokens, themes, fonts, icons, components, Storybook
│   └── shared/          @eden/shared: Tauri API wrappers, settings, crash store, i18n, types
├── src-tauri/           the one Rust crate (features desktop and mobile), configs, capabilities, icons
├── web/                 the static download page (GitHub Pages)
├── scripts/             version bump, changelog, tag, iOS signing
├── docs/
│   ├── CONVENTIONS.md   conventions, doc header, rules
│   ├── INDEX.md         the map
│   ├── product/         vision, glossary, decisions, roadmap, substrate/, domains/
│   ├── design/          brand, visual language, UX patterns, screens, sample data
│   └── engineering/     the kit, the app scaffold, the release flow
└── README.md
```

## Relationship to Crate

Crate is the owner's DJ library application. Eden reuses its scaffold and conventions; DJ features stay in Crate.
