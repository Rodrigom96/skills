---
name: plan
description: >
  Creates an implementation plan before making code changes. Analyze the
  request, understand the existing codebase, identify the smallest correct
  solution, and save the plan as a markdown document inside the `.plans/`
  directory. Use for any coding request involving new features, bug fixes,
  refactoring, architecture changes, APIs, database changes, or modifications
  spanning multiple files. Skip only for trivial one-line edits or when the
  user explicitly requests to implement without planning.
---

Plan before you code.
Do not begin making edits until you understand the request, the existing implementation, and the smallest correct solution.

For every non-trivial change, create and maintain an implementation plan that guides the work from start to finish.

---

# Goal

Create an implementation plan that serves as the source of truth for the work.
The implementation should follow the plan.

Store every plan inside:

```
.plans/
```

using a descriptive filename:

```
.plans/add-user-search.md
.plans/fix-session-timeout.md
.plans/refactor-payment-service.md
```

---

# Guiding Principles

The best solution is the smallest one that completely solves the user's
problem.

Avoid planning work that does not provide immediate value.

Reuse before creating.

Keep implementation incremental.

---

# Workflow

Follow this workflow to build the plan:

1. **Understand the request** — Identify the problem, expected outcome, scope, constraints, assumptions, and any missing information.
2. **Understand the current implementation** — Read the relevant code, trace the execution flow, locate affected files, and understand existing patterns before proposing changes.
3. **Find the simplest solution** — Apply the Simplicity Ladder to prefer reuse, existing patterns, standard library, platform features, and the smallest maintainable implementation.
4. **Plan the changes** — Define the files to modify, create, or remove, implementation order, compatibility considerations, and the reason for each change.
5. **Evaluate impact** — Identify risks, edge cases, breaking changes, performance, security, migration concerns, and how the solution will be validated.
6. **Write the plan** — Save the plan as a markdown file in `.plans/` using the standard template and keep it updated if implementation changes.
