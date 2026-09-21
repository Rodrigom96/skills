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

## 1. Understand the request

Identify the problem, expected outcome, scope, constraints, assumptions, and any missing information.

## 2. Clarify when needed

Use `ask_user` when missing information could meaningfully change the plan.

Ask when:
- Scope or expected behavior is unclear.
- There are multiple valid implementation approaches.
- Compatibility or breaking changes need a decision.
- An important constraint cannot be determined from the codebase.

Do not ask when:
- The answer can be inferred from the request or codebase.
- Existing project patterns already provide the answer.
- The missing detail has little impact on the plan.

Ask about intent, not implementation, when the codebase can determine the implementation.

## 3. Understand the current implementation

Read the relevant code, trace the execution flow, locate affected files, and understand existing patterns before proposing changes.

## 4. Find the simplest solution

Apply the Simplicity Ladder to prefer reuse, existing patterns, standard library, platform features, and the smallest maintainable implementation.

## 5. Plan the changes

Define the files to modify, create, or remove, and describe each change explicitly enough that implementation can follow the plan without rediscovering the design.

For every change, state:
- **What** will be added, changed, or removed.
- **Where** it will be implemented (file, module, component, endpoint, table, etc.).
- **How** it will work and how it fits into the existing execution flow or patterns.
- **Why** the change is needed.
- Any relevant **interfaces, data flow, dependencies, state changes, validation, or error handling**.

## 6. Evaluate impact

Identify risks, edge cases, breaking changes, performance, security, migration concerns, and how the solution will be validated.

## 7. Write the plan

Save the plan as a markdown file in `.plans/` using the standard template and keep it updated if implementation changes.
