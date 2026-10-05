# Contributing

Bug reports, fixes and ideas are welcome.

## Reporting a problem

Open an issue with the bug report form, and include a screenshot when something is drawn wrong. Report security problems privately instead, as [SECURITY.md](SECURITY.md) describes.

## Working on the code

1. Fork the repository, clone your fork, and install the renderer's packages with `npm ci --ignore-scripts`.
2. Start Claude Code with your clone loaded: `claude --plugin-dir .`. It reloads the hooks module when you save, and the first load writes `tsconfig.json` and the type declarations in `.claude-plugin/types/`.
3. Run the checks before you open a pull request:
   - `claude plugin test`
   - `node --test tests/*.test.mjs`
   - `claude plugin validate --strict .claude-plugin/plugin.json`
   - `npx -p typescript@5 tsc --noEmit`

## Pull requests

- `main` is protected: every change goes in through a pull request, and pull requests are merged by squash.
- Keep a pull request to one change. Add a test that fails without the change, and update the README when users will notice it.
- The maintainer bumps the version in `.claude-plugin/plugin.json` and tags releases.
