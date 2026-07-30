# Implement

Dispatch implementation work to pit-implementer.

## Arguments

`$ARGUMENTS`: Issue URL, card URL, task description, or empty.

## Instructions

1. Read `$ARGUMENTS` to determine the task. Fetch issue/card details if URL.

2. Spawn a **pit-implementer** subagent with `isolated: true`:
   - `agent`: pit-implementer
   - `task`: the implementation request

3. Do NOT implement anything yourself. Dispatch only.

4. Report the agent's full output. Include implementation and review results.

## Fallback

- `$ARGUMENTS` empty → ask user
- Spawn fails → report error to user. Do not implement as fallback.
