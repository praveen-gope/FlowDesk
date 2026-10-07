# Git Setup

The project includes:

- `.gitignore`: excludes private credentials, SQLite databases, captured data, virtual environments, caches, dependencies, logs, and scratch files.
- `.gitattributes`: normalizes source-file line endings and keeps Windows launch scripts compatible.
- `.editorconfig`: establishes editor indentation and whitespace settings.
- `backend/.env.example`: documents environment settings without real secrets.

Commit application source, migration files, requirements, HTML/CSS/JavaScript, launchers, and documentation. Keep actual credentials and customer data out of Git.

The environment example is a reference, not an automatically loaded configuration file. Set values in your terminal or hosting environment as described in the backend documentation.

If you have not initialized a repository:

```powershell
cd "C:\Users\prave\FlowDesk"
git init
git status --short
```

Review the status before staging:

```powershell
git add .
git diff --cached --stat
git commit -m "Add FlowDesk CRM"
```

Ignore rules do not remove files that were already tracked. Inspect existing tracking first:

```powershell
git ls-files backend/db.sqlite3 backend/.dev-secret backend/LOCAL-ACCOUNTS.md
```

If a private file is already tracked, remove only that exact file from the index with `git rm --cached -- <path>` and commit the removal. This keeps the local file. Removing it in a new commit does not erase it from earlier Git history; rotate secrets that were published.

The project is licensed under the MIT License; commit the root LICENSE file with the source. No remote repository is assumed.
