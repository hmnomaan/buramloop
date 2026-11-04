# Git Issues Log

This file stores concise notes for each Git‑related issue, pull request, or commit discussion that does **not** belong to the main context or daily logs.  It is kept separate from `CONTEXT_HISTORY.md` to keep the historical narrative focused on project milestones while still preserving a searchable record of version‑control decisions.

---

## 2026‑11‑04 – Remove `.vscode` folder from history
- **Issue**: Sensitive local VS Code configuration (`.vscode/`) was accidentally committed and needed to be purged.
- **Actions**:
  - Added `.vscode/` to `.gitignore`.
  - Ran `git rm -r --cached .vscode` and committed.
  - Used **BFG Repo‑Cleaner** to delete the folder from all past commits and performed a forced push.
- **Result**: No `.vscode` files appear in any branch or tag; the repository history is clean.
- **Verification**: Executed a grep across the entire commit graph – no matches.

---

*Add new entries here for each future Git‑related discussion or cleanup.*

