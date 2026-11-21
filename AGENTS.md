# Repository instructions for agents

## Git and production deployments

1. **`main` deploys to production.** A push or merge that updates `origin/main` triggers automatic deployment. The new revision goes live after the deployment checks pass.
2. **Never push directly to `main`.** Push your feature branch and submit changes through a pull request targeting `main`.
3. **Create a feature branch before editing.** Start new work from the latest `origin/main` on a branch named `feature/<short-kebab-case-name>`, such as `feature/update-incident-filters`. Never use `codex/` or `claude/` as a branch prefix.
4. **Review the full pull request diff before merging.** Compare the latest version of the pull request against current `main`, confirm that every change belongs to the task, and verify that the applicable checks pass. Repeat the review if the pull request changes.

## API contract and cross-repository changes

1. **Read [API.md](API.md) before editing.** Follow its routes, request and response schemas, authentication, and error behavior. Check the owning repository when implementation status is unclear. Use `API.md` as the shared API contract for `backend` and `frontend-web`.
2. **Keep the contract current.** When you add, change, or document an API capability, update `API.md` in the same change. Identify the owning repository and mark the capability `Implemented` or `Not implemented`. Mark it `Implemented` only when the owner has the behavior in its code and you have verified it. Label demo support separately. Keep both copies in sync for approved changes that span both repositories.
3. **Get explicit approval for cross-repository API dependencies.** If the requested task needs a missing or changed API capability in the other repository, tell the user which repository owns it, which routes or behaviors must change, and why the work depends on them. Ask for approval and wait for it before editing files or implementing any part of the task. While waiting, limit work to read-only investigation and a proposed plan.
