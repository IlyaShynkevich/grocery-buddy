---
description: Verify build and tests pass before reporting a task as done
---

Run these steps in order and report clearly:

1. Run `npm run build` and show the result
2. Run `npm run test:e2e` and show the full result, including pass/fail counts
3. If the pre-existing known flake (`trip-delete.spec.ts` — "deleting the trip currently pinned as active starts a fresh empty draft") is the only failure, note that it's the known pre-existing issue and treat this as a pass
4. If any other test fails, or the build fails, do NOT say the work is ready — investigate and fix first, then re-run this verification
5. Once build passes and tests pass (accounting for the known flake), give me:
   - The branch name to use
   - The commit message (title + body, matching this project's convention of a title line + blank line + description)
   - A brief summary of what changed and why

Do not skip straight to reporting "done" without actually running both commands and showing the output.