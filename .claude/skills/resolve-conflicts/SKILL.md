---
name: resolve-conflicts
description: Resolve git merge/rebase conflicts in this repo semantically instead of blindly. Use when a merge, rebase, or PR update leaves conflict markers in the working tree.
---

# Resolve conflicts

This project is maintained by automated agents: subAgents branch off `reviewAgents` and an Agent Master validates each branch (test-merge + tests) and opens a Pull Request back into `reviewAgents` — a human approves and merges every PR manually (see `CLAUDE.md`, section "Collaboration workflow"). When resolving a conflict here, commit the resolution onto the feature branch itself (never onto `reviewAgents`), since that branch is what goes into the PR. Conflicts here are not just generic text conflicts — a mapping file (`cypress/utils/mapeamento*.js`), the command/step that reads it, and any shared logic it relies on (`cypress/support/commands/**`, `cypress/support/shared/**`) must stay semantically consistent, and shared config (`cypress.config.js`, `package.json`) must not silently drop one side's changes.

## Workflow

1. **Find conflicts.** Run `git status` to list files with conflict markers (`UU`, `AA`, etc.), and `git diff` to see the marker sections (`<<<<<<<`, `=======`, `>>>>>>>`).
2. **Understand both sides before touching anything.** For each conflicted file, check the log of both branches (`git log <branch> -- <file>`) to understand *why* each side changed it — don't resolve by guessing from the diff alone.
3. **Resolve related files together.** If a mapping file conflicts, check whether the command/step or helper it depends on also changed — resolve both in the same pass so they still match after the merge.
4. **Config files** (`cypress.config.js`, `package.json`, `package-lock.json`, `.env.example`): merge additively unless the two sides are genuinely incompatible (e.g. both changed the same script to different commands). Never silently drop a plugin/setting/env var one side added.
5. **package-lock.json**: prefer regenerating it (`npm install`) over manually resolving, once `package.json` conflicts are settled.
6. **After resolving**: remove all conflict markers, stage the files, and run the affected scenario(s) locally if possible (`npx cypress run --env tags=<tag>`).
7. **Never resolve by discarding one side wholesale** (`git checkout --ours`/`--theirs`) without first checking what's actually being lost — flag it to the user if a whole-side discard seems like the only sane option.
8. Summarize what was merged and why for each conflicted file before finishing.
