# CI/CD Pipeline Documentation

This document outlines the **Continuous Integration (CI)** pipeline used in this project, how it is configured, and the key benefits it provides to development and deployment workflows.

---

# 1. Overview

The project uses **GitHub Actions** to implement an automated CI pipeline.  
The workflow file is located at:

```
.github/workflows/node-ci.yml
```

This pipeline ensures that **every change** pushed to the repository (or submitted via pull request) is:

- Correct
- Secure
- Performant
- Consistent with coding standards

The CI system is designed specifically for a **Node.js + Express + Firebase + Jest (ESM)** environment.

---

# 2. Pipeline Triggers

The workflow runs automatically on:

```yaml
on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]
```

This ensures that **all changes targeting the main production branch** are validated before integration.

---

# 3. Pipeline Structure

The GitHub Actions job is named **`build-and-check`**.  
It runs on `ubuntu-latest` and performs the following tasks:

---

## 3.1 Step-by-Step Pipeline Flow

### 1) Checkout Repository

Uses:

```yaml
uses: actions/checkout@v4
```

This retrieves the repository source code into the build environment.

---

### 2) Setup Node.js Environment

The pipeline uses **Node.js v24**, ensuring compatibility with ESM modules and the testing stack.

```yaml
uses: actions/setup-node@v4
with:
  node-version: "24"
```

---

### 3) Install Dependencies

```bash
npm ci
```

Using `npm ci` guarantees:

- Clean reproducible installs  
- Deterministic builds  
- Faster dependency installation  
- Exact usage of `package-lock.json`  

---

### 4) Run Full CI Check

```bash
npm run ci:check
```

From your `package.json`, this script includes:

```json
"ci:check": "npm test && npm run lint"
```

This means CI runs:

1. **All Jest tests** (unit, integration, performance, middleware, and model tests)  
2. **ESLint static analysis** across backend, frontend, and test files  

If any of these fail, the pipeline fails.

---

# 4. Testing Architecture Validated by CI

The pipeline enforces correctness across:

✔ API route correctness  
✔ Firebase authentication  
✔ Firestore-backed user model behaviors  
✔ Python subprocess integration  
✔ Error handling and logging  
✔ Frontend/backend separation  
✔ Server initialization  
✔ Performance budgets (200–800ms depending on route)  

These tests ensure the application always behaves correctly after code changes.

---

# 5. Linting Architecture Validated by CI

Your ESLint configuration includes:

- Backend Node.js rules  
- Frontend browser rules  
- Jest-specific test environment rules  
- Global ignores for generated or external files  

CI ensures:

- Code consistency  
- No unused variables  
- No accidental globals  
- No regressions in code quality  

This keeps the codebase clean and maintainable.

---

# 6. Benefits of the CI Pipeline

### 1. Prevents Broken Code from Reaching Main
Every pull request must pass:

- All Jest tests  
- Linting checks  

This eliminates merging untested or broken code.

---

### 2. Ensures High Reliability
Critical areas tested automatically:

- Authentication  
- Routes and redirects  
- Server initialization  
- Firestore integration  
- Error logging  
- Python bridge  

This dramatically reduces runtime errors in production.

---

### 3. Enforces Coding Standards
Static analysis ensures:

- Consistent style  
- No unsafe patterns  
- No unused logic  
- No accidental bugs  

---

### 4. Guarantees Performance Budgets
Your CI includes performance tests verifying:

- `/` loads under 300ms  
- `/map` loads under 400ms  
- `/search` loads under 150ms (single)  
- `/search` loads under 800ms (10 concurrent)

This prevents slowdowns over time.

---

### 5. Improves Team Collaboration
Every contributor receives automatic feedback on:

- Whether their code works  
- Whether it breaks any existing functionality  
- Whether it meets project standards  

This reduces code review time and increases developer confidence.

---

### 6. Repeatable, Automated, and Deterministic
All steps use:

- Locked versions of dependencies  
- The same Node.js version  
- The same test runner  
- The same linter rules  

This guarantees consistent behavior across machines and environments.

---

# 7. Summary

Your CI pipeline:

- Validates the entire backend and frontend logic  
- Ensures performance and correctness  
- Maintains code quality  
- Reduces production issues  
- Helps scale your development process  

With this pipeline, every commit is automatically verified, and main stays stable at all times.
