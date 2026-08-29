---
name: Git push allowed, but no co-author trailer
description: User lifted the earlier no-push restriction; now pushing is fine but commits must never list Claude as co-author
type: feedback
---

Pushing to GitHub is allowed now (earlier restriction lifted). When committing, never add a "Co-Authored-By: Claude" (or similar) trailer — the user is the sole author on every commit.

**Why:** User explicitly reversed the prior no-push rule, and separately asked that only they be listed as author.
**How to apply:** Push when asked/appropriate. Omit any Co-Authored-By trailer from commit messages in this repo.
