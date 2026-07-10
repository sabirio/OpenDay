# Branch protection for `main`

GitHub branch protection was not changed by this repository-only task. Configure the following rule in GitHub for `main` after the updated workflow has run at least once:

- Require a pull request before merging.
- Require at least one approval and dismiss stale approvals when new commits are pushed.
- Require status checks to pass and require the branch to be up to date before merging.
- Select the exact required status check **`CI / verify`**.
- Do not allow merging while that check is failing or pending.
- Block force pushes and branch deletion.
- Restrict direct pushes to the maintainers/bots that genuinely require them; otherwise require all changes through pull requests.

The workflow is `.github/workflows/ci.yml`; its workflow name is `CI` and job id is `verify`. If GitHub displays only the job label in the rule picker, select `verify` from the `CI` workflow and confirm the resulting check context shown by GitHub is `CI / verify`.
