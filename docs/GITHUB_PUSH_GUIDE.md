# GitHub Push Guide: 3PLogistics-Solution

This document outlines the mandatory rules and safety checks for pushing the `3PLogistics-Solution` codebase to GitHub. Following these guidelines ensures a clean, secure, and professional repository launch.

## 🛡️ Pre-Push Safety Checklist

Before every push to a public repository (especially the initial push), complete the following checks:

### 1. Build Verification (MANDATORY)
Ensure the application is in a stable, compile-ready state.
- [ ] **Frontend**: Run `npm run build` in the `frontend/` directory. Resolve all warnings and errors.
- [ ] **Backend**: Run the server locally (`npm start`) and verify the health check at `http://localhost:8899/health`.

### 2. Secret & Privacy Audit
Prevent accidental exposure of sensitive data.
- [ ] **Environment Files**: Verify that `.env` files (both root and subdirectories) are NOT tracked by Git.
- [ ] **Hardcoded Secrets**: Search for API keys, passwords, or JWT secrets in the code.
- [ ] **Docs Review**: Ensure business-sensitive rules in `docs/` are intentional for public visibility.

### 3. Cleanup & Hygiene
Maintain repository professional standards.
- [ ] **Obsolete Files**: Ensure the `archive/` folder and placeholder configuration files have been removed.
- [ ] **Build Artifacts**: Verify that folders like `node_modules/`, `frontend/build/`, and `backend/uploads/` (except `.gitkeep`) are excluded via `.gitignore`.
- [ ] **Node Version**: Ensure `package.json` specifies the supported engine (Node 18.x).

---

## 📜 Commit conventions

To maintain a readable and professional history, use structured commit messages:

- **Format**: `<type>(<scope>): <short summary>`
- **Types**:
    - `feat`: A new feature
    - `fix`: A bug fix
    - `docs`: Documentation changes
    - `refactor`: Code change that neither fixes a bug nor adds a feature
    - `perf`: A code change that improves performance
    - `chore`: Maintenance tasks (dependencies, build configs)

*Example*: `feat(shipment): add unified tracking number utility`

---

## 🏗️ Branching Strategy

For this repository, follow these branching rules:

1. **Main Branch**: Only contains production-ready, audited code.
2. **Feature Branches**: Use descriptive names like `feature/carriers-expansion` or `fix/auth-leak`.
3. **Pull Requests (PRs)**: All changes to `main` should ideally come through a PR with a description of the changes made and confirmation of build passing.

---

## 🤖 AI Agent Rules for Pushing

As per [AI_AGENT_RULES.md](./AI_AGENT_RULES.md), AI agents must:
- Never push code that hasn't been verified with a local build.
- Request user approval before pushing if the changes impact major security modules or the product roadmap.
- Provide a clear summary of what is being pushed and why.

---

## 🏁 Final Step before the First Push

If this is the VERY FIRST push to a new public repository:
1. Initialize the repo locally.
2. Add the remote: `git remote add origin https://github.com/jbloushi/3PLogstics-Solution.git`
3. Add files: `git add .`
4. Commit: `git commit -m "chore: initial push after production audit and cleanup"`
5. Push: `git push -u origin main`

---

## 🚀 Post-Push Deployment

Once your changes are pushed to GitHub, you should deploy them to the staging/production VPS.

1. **SSH to VPS**: `ssh root@your-vps-ip`
2. **Run Deployment Script**: `bash /www/wwwroot/3pl.mawthook.io/deploy.sh`

For detailed deployment troubleshooting and manual steps, refer to [AAPANEL_DEPLOYMENT.md](./AAPANEL_DEPLOYMENT.md).

**The repository is now secure, optimized, and ready.**
