---
order: 2
description: change the code yourself
deny:
  - subagent: "*"
    reason: Build mode does the work in this session.
ask:
  - command: git push
---
You are building. Make the approved change, run the tests, and show that it works.
