---
id: <kebab-case-id, same as the file name>
kind: recipe
title: <What it makes safe> for Scriptable apps (<the bug, in a few words>)
version: 1.0.0
updated: <YYYY-MM-DD>
author: Gediminas Siutilas
reference: <App> <version> (https://github.com/gadominas/<App>/blob/main/<App>.js)
applies_to: <every app | every app with …>
---

# <Title>

## What this recipe is

A **recipe** is a coding rule set that every app follows while it is being built, rebuilt or refactored. It adds no feature the user sees; it fixes a class of bug once, the same way everywhere.

## The bug it prevents

**Symptom:** <what the user sees, and when; the words a user would use to report it>.

Seen in <App> (fixed in <version>).

**Causes:**

| Cause | What goes wrong |
| --- | --- |
| <cause> | <mechanism> |

## The rules

1. **<Rule in bold.>** <One or two sentences.>

## Per-app values

| Value | Example (<App>) | Notes |
| --- | --- | --- |
| `<name>` | <value> | <how to choose it> |

## Step 1: <first piece>

<Why, then the code from the reference app, names kept.>

```javascript
// …
```

## Testing checklist

On the phone:

- [ ] <reproduce the original symptom's conditions and check it no longer happens>

Statically, before releasing:

- [ ] <grep or check that proves the rules hold>

## Pitfalls

- **<Pitfall.>** <What happened and how to avoid it.>

## Prompt for a coding agent

```markdown
Follow https://github.com/gadominas/app-blueprints/blob/main/AGENTS.md.
Apply the <id> recipe (recipes/<id>.md) to [App] (https://github.com/gadominas/[App]).
```

## Version history

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | <YYYY-MM-DD> | First version, from <App> <version> |
