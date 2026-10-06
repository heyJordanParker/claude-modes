---
order: 1
description: plan before you build
deny:
  - write: "**"
    except: ["docs/plans/**", "/tmp/**"]
    reason: Write the plan in docs/plans/, then switch to build.
  - command: git commit
    reason: Commits happen in build or commit mode.
---
You are proposing. Read the code, research the change, and write the plan in docs/plans/.
You change no other file and make no commit. Ask for build mode when the plan is approved.
