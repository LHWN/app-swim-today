# Repository Guidelines

## Project Structure & Module Organization

This repository is currently a minimal scaffold with no application source, tests, or assets checked in. Keep future work organized by purpose:

- `src/` for application code and reusable modules.
- `tests/` for automated tests that exercise `src/`.
- `assets/` or `public/` for static files such as images, icons, and fixtures.
- `docs/` for design notes, API references, or contributor-facing documentation.

Prefer small modules with clear ownership. Keep generated files, dependency folders, and local caches out of version control.

## Build, Test, and Development Commands

No package manager, build script, or test runner is configured yet. When adding tooling, document exact commands here and keep them stable. Recommended names:

- `npm install` or the project-specific equivalent to install dependencies.
- `npm run dev` to start a local development server.
- `npm test` to run the full test suite.
- `npm run build` to produce a production build.
- `npm run lint` to run static checks.

If the repository uses a different stack, replace these examples with that ecosystem's canonical commands.

## Coding Style & Naming Conventions

Use consistent formatting within each language and commit formatter configuration with the codebase, such as Prettier, ESLint, Black, or rustfmt. Prefer 2-space indentation for JavaScript, TypeScript, JSON, YAML, and Markdown unless tooling requires otherwise.

Use descriptive names: `camelCase` for variables and functions, `PascalCase` for classes and components, and `kebab-case` for file and directory names where the framework allows it.

## Testing Guidelines

Add tests with user-facing behavior or shared logic. Name tests after the behavior verified, for example `date-utils.test.ts` or `test_date_utils.py`. Keep reusable fixtures under `tests/fixtures/`.

Before opening a pull request, run the full test command and any lint or type-check command configured for the project.

## Commit & Pull Request Guidelines

There is no Git history available in this checkout, so no existing commit convention can be inferred. Use concise, imperative commit subjects such as `Add swim schedule parser` or `Fix empty-state rendering`.

Pull requests should include a short description, relevant issue links, test results, and screenshots or recordings for visible UI changes. Call out configuration changes, migrations, or follow-up work explicitly.

## Security & Configuration Tips

Do not commit secrets, local environment files, or production credentials. Provide safe examples such as `.env.example` and document required variables in `docs/` or the README when configuration is introduced.
