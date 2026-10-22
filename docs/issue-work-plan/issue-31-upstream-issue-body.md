# Proposal: clarify routing descriptions for two related skills

> Local status (2026-10-22): Cancelled at the user's request. Never submitted. Retained as historical draft; do not post an issue or pull request.

## Summary

Could we refine the descriptions for `context-engineering` and `prompt-engineering` so their distinct primary tasks and their boundary are clearer when choosing a skill?

The current descriptions both mention creating commands, skills, and sub-agent prompts. This can make both skills appear relevant to the same general request, even though their main focuses differ: managing information in an agent's context versus designing instructions for an LLM.

## Scope

This proposal is limited to wording for the two skill descriptions. It does not request changes to skill bodies, body restructuring, changes to safety rules, or a 300-character acceptance gate.

The repository baseline reviewed for this proposal is `master` at commit `23e2428e809d77717f8acc9659c374a3a1fcb93e`:

- [`context-engineering` source](https://github.com/NeoLabHQ/context-engineering-kit/blob/23e2428e809d77717f8acc9659c374a3a1fcb93e/plugins/customaize-agent/skills/context-engineering/SKILL.md)
- [`prompt-engineering` source](https://github.com/NeoLabHQ/context-engineering-kit/blob/23e2428e809d77717f8acc9659c374a3a1fcb93e/plugins/customaize-agent/skills/prompt-engineering/SKILL.md)

Both source paths exist at that commit, and their descriptions match the current wording quoted below. The corresponding files under `skills/` and `antigravity/skills/` have the same blobs as these plugin paths.

## Current overlap

- `context-engineering`: “Understand the components, mechanics, and constraints of context in agent systems. Use when writing, editing, or optimizing commands, skills, or sub-agents prompts.”
- `prompt-engineering`: “Use this skill when you writing commands, hooks, skills for Agent, or prompts for sub agents or any other LLM interaction, including optimizing prompts, improving LLM outputs, or designing production prompt templates.”

These descriptions share several broad entry terms. The proposed wording would identify context selection and management as the first skill's focus, and instruction structure and evaluation as the second's focus.

## Suggested description wording

For `context-engineering`:

> Use when designing how an agent selects, retrieves, organizes, compresses, or progressively loads information for a task under a limited context window. Focus on context management, retrieval, and staged access; use prompt-engineering for instruction structure, reusable templates, examples, or output evaluation.

For `prompt-engineering`:

> Use when designing or improving LLM instructions, including system prompts, commands, hooks, skills, subagent prompts, templates, examples, and output evaluation. Focus on instruction structure and behavior; use context-engineering when the main task is selecting, retrieving, organizing, compressing, or progressively loading information into context.

These are candidate descriptions for maintainer review, not claims about an implemented change.

## Static routing examples

The following six examples express the intended distinction for review. They are static examples, not results from a skill loader or runtime evaluation.

1. Preserve useful decisions and source material across a long conversation: `context-engineering`.
2. Design information retrieval or progressive loading: `context-engineering`.
3. Write system-prompt, skill, command, or sub-agent instructions: `prompt-engineering`.
4. Design few-shot examples or output evaluation: `prompt-engineering`.
5. Design retrieval together with the instructions for using retrieved information: use both where each is relevant to a distinct part of the task.
6. A request contains words such as “prompt,” “agent,” or “skill,” but asks for neither context management nor instruction design: neither skill is indicated by those words alone.

## Questions for maintainers

- Do these proposed descriptions capture the intended primary focus of each skill?
- Is the reciprocal cross-reference between the descriptions appropriate for this repository?
- Would you prefer different wording or scope boundaries for requests that involve both instruction design and context management?

For related context, [PR #93](https://github.com/NeoLabHQ/context-engineering-kit/pull/93) is a similar merged change, but it does not cover these two skills.

The six examples above only describe static routing intent. Whether these descriptions change runtime skill selection has not been tested or verified.
