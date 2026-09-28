# eden

A personal digital garden: one desktop and mobile app that assists its owner across the domains of life, built on a small shared substrate so domains stay standalone yet informed by each other.

## Status

Product and design documents only. No application code yet. The app will be built with Svelte 5, Tauri 2 and Tailwind 4 on a scaffold ported from [Crate](https://github.com/maxwellmattryan/crate).

## Start here

- [docs/INDEX.md](docs/INDEX.md): every doc with a one-liner, a status and when to load it.
- [docs/product/vision.md](docs/product/vision.md): what Eden is and is not.
- [docs/product/decisions.md](docs/product/decisions.md): what is settled and what is open.
- [docs/CONVENTIONS.md](docs/CONVENTIONS.md): conventions for editing these docs.

## Repo layout

```
eden/
├── docs/CONVENTIONS.md  conventions, doc header, rules
├── docs/
│   ├── INDEX.md       the map
│   ├── product/       vision, glossary, decisions, roadmap, substrate/, domains/
│   ├── design/        brand, visual language, UX patterns, screens, sample data
│   └── engineering/   written after product and design
└── README.md
```

## Relationship to Crate

Crate is the owner's DJ library application. Eden reuses its scaffold and conventions; DJ features stay in Crate.
