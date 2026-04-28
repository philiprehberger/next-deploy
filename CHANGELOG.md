# Changelog

## 0.2.0

- Add `rollback` subcommand: `next-deploy rollback` switches `current` to the previous release and restarts PM2
- Add `--keep N` CLI flag to override `releasesToKeep` at runtime
- Export programmatic `rollback(config)`

## 0.1.9

- Fix README GitHub URLs to use correct repo name (ts-next-deploy)

## 0.1.8

- Standardize README to 3-badge format with emoji Support section
- Update CI actions to v5 for Node.js 24 compatibility
- Add GitHub issue templates, dependabot config, and PR template

## 0.1.7

- Fix CI and License badge URLs in README

## 0.1.6

- Fix test import path (dist/index.mjs → dist/index.js)

## 0.1.5

- Add Development section to README
- Fix CI badge to reference publish.yml

## 0.1.2

- Update repository URLs to new ts-prefixed GitHub repo

## 0.1.1

- Add author, homepage, bugs, engines fields to package.json
- Add test suite
- Add GitHub Actions publish workflow

## 0.1.0

- Initial release
