# Repository instructions for agents

## Git and production deployments

1. **`main` deploys to production.** A push or merge that updates `origin/main` triggers automatic deployment. The new revision goes live after the deployment checks pass.
2. **Never push directly to `main`.** Push your feature branch and submit changes through a pull request targeting `main`.
3. **Create a feature branch before editing.** Start new work from the latest `origin/main` on a branch named `feature/<short-kebab-case-name>`, such as `feature/update-incident-filters`. Never use `codex/` or `claude/` as a branch prefix.
4. **Review the full pull request diff before merging.** Compare the latest version of the pull request against current `main`, confirm that every change belongs to the task, and verify that the applicable checks pass. Repeat the review if the pull request changes.
