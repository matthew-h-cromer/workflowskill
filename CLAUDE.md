# WorkflowSkill RFC

## What This Project Is

This is an RFC proposing **WorkflowSkill**, an extension to the AgentSkill standard that makes skills executable by a lightweight runtime. The core insight: most steps in a repeated workflow are deterministic and don't need an LLM, but today the entire job runs through one. WorkflowSkill lets authors declare a workflow plan once, execute deterministic steps directly, and invoke models only where judgment is actually needed.

The RFC lives in `rfc-workflowskill.md`. That is the only deliverable.

## Goal

Get this proposal adopted into the AgentSkill specification. The audience is the AgentSkill maintainers, the broader agent ecosystem (OpenClaw, Cursor, VS Code, Codex, Gemini CLI, etc.), and engineers building on these platforms. The proposal must be compelling to all of them while remaining simple enough for someone outside the ecosystem to follow.

## How to Help

You are a writing partner. Your job is to help me write a clear, compelling, technically sound RFC. That means:

- **Read the full RFC before suggesting changes.** The document has internal coherence. Understand the arc before editing a paragraph.
- **Preserve what's working.** Don't rewrite sections that are already strong. Build on them.
- **Flag gaps, not just polish.** If a section is missing an argument, say so. If a claim needs evidence, say so. Don't just smooth the prose.
- **Think about the skeptical reader.** Every section should answer "why should I care?" and "why this approach over alternatives?"
- **Keep the cost/reliability framing central.** Those are the two problems. Everything else serves them.

## Key Arguments to Understand

1. **Workflows are the dominant use case** for AgentSkills. ~35-50% of skills on ClawHub involve multi-step orchestration. 9 of the top 10 autonomous agent use cases are workflows.

2. **Full LLM orchestration is wasteful for repeated workflows.** Most steps (fetch, filter, format, route) are deterministic. Only judgment steps (scoring, summarizing, deciding) need a model. Running everything through an LLM wastes tokens and money.

3. **LLM orchestration is unreliable for repeated workflows.** Probabilistic systems improvise. Output format drifts between runs. Steps get skipped. Error handling is ad hoc. Users abandon automations they can't trust.

4. **WorkflowSkill solves both problems at once.** Declare the plan, execute deterministic steps in a runtime, invoke models only where needed, handle errors explicitly. Cost drops ~98% in the email triage example. Every run follows the same path.

5. **Backwards compatibility is non-negotiable.** The extension lives inside SKILL.md as a fenced code block. Systems without a runtime read it as documentation. Nothing breaks. Adoption is incremental.

## Ecosystem Context

### The AgentSkill Standard
- Created by Anthropic, released December 2025. Open standard at agentskills.io.
- Spec repo: github.com/agentskills/agentskills (10.4k stars, 596 forks).
- Adopted by 27+ agent products: Claude Code, OpenAI Codex, GitHub Copilot, Cursor, VS Code, Gemini CLI, Goose, Windsurf, and more.
- Governed under the Agentic AI Foundation (AAIF) at the Linux Foundation, alongside MCP and AGENTS.md.
- A skill is a directory with a SKILL.md file (YAML frontmatter + Markdown body). Optional scripts/, references/, assets/ directories.
- Progressive disclosure model: metadata (~100 tokens) loaded at startup, full instructions loaded on activation, resources loaded on demand.

### Key Active Proposals on the AgentSkill Spec
These are relevant context. Our proposal should be aware of them but not depend on them:
- **Standard skill folder location** (#15): `.agents/skills/` as universal path. 16+ agents adopted. Claude Code pending.
- **Capabilities field for security** (#170): Declaring shell/filesystem/network/browser access. Motivated by Snyk's ToxicSkills research (13.4% of skills have critical security issues).
- **Dynamic context injection** (#124): Inline command substitution (`!command`) in SKILL.md.
- **Path-based recursive discovery** (#115): `.agents/skills/` anywhere in project tree.
- **Skill dependencies with version validation** (#110): Testing spec and dependency management.
- **Cloudflare discovery RFC**: `.well-known/skills/` URI for web-based skill discovery.

### OpenClaw (Primary Motivating Platform)
- Open-source self-hosted AI agent. 196k+ stars. TypeScript/Node.
- Created by Peter Steinberger (now at OpenAI). Transitioning to independent foundation.
- Hub-and-spoke architecture: Gateway connects to WhatsApp, Telegram, Slack, Discord, etc.
- Skill registry: ClawHub (clawhub.ai), 10,700+ skills.
- Fully implements AgentSkill standard with progressive disclosure.
- **Known limitations directly relevant to our RFC:**
  - Long reasoning chains exceed time/context limits with poor error messages.
  - Hallucinated success: reports task completion when nothing happened.
  - Expensive model usage on routine work burns API quotas ($47/week reported by one user).
  - Users abandon cron automations after unpredictable behavior.
  - Security incidents (ClawHavoc malicious skills campaign, CVE-2026-25253).

### The Layered Agent Architecture
The ecosystem is converging on complementary layers:
```
Layer 4: Agent-to-Agent (A2A, Google)     -- agents collaborate
Layer 3: Skills (AgentSkill)              -- reusable procedures and knowledge
Layer 2: Tool Connectivity (MCP)          -- standardized tool access
Layer 1: Function Calling (provider APIs) -- model-level tool invocation
Layer 0: Project Guidance (AGENTS.md)     -- repo-level conventions
```

WorkflowSkill operates at Layer 3. It makes skills executable rather than just instructional. It depends on Layer 2 (tools are invoked via MCP or equivalent) but does not modify it.

### What the Ecosystem Is Missing (Our Opportunity)
The gap between atomic tool definitions (MCP) and free-form instructions (skills) has no standard solution for:
- Execution contracts (expected outcomes, success criteria)
- State management across multi-step execution
- Error recovery patterns
- Parameterized invocation (typed inputs/outputs vs. description matching)
- Skill composition (one skill invoking another)
- Versioning and testing

WorkflowSkill addresses all of these.

## Competitive/Alternative Approaches
Be aware of these so the RFC can address "why not just use X?":
- **LangGraph**: Graph-based workflow orchestration. Powerful but framework-specific, Python-only, not a standard.
- **CrewAI**: Role-based agent teams. More about multi-agent coordination than workflow definition.
- **Temporal/Prefect/Airflow**: Production workflow engines. Too heavy for agent skills. Different abstraction level.
- **Haystack**: Python pipeline framework (24.2k stars). Validates the core thesis: separates deterministic and LLM steps, achieves lowest token usage among comparable frameworks. But framework-not-standard, Python-only, code-first. Evidence for WorkflowSkill, not competition against it.
- **flowmind**: Community-built OpenClaw meta-skill for chaining skills. Proves demand. WorkflowSkill is the standardized answer.

---

# Style Guide

## Voice

This RFC should read like it was written by a person who builds things, not a committee. Direct. Confident without being arrogant. The tone of someone explaining a good idea to a peer over coffee, not presenting to a board.

**Do:**
- Use "you" and "I" and "we" naturally
- State things directly: "This is expensive" not "This may present cost challenges"
- Use concrete examples over abstract principles
- Let the logic carry the argument. Don't oversell.

**Don't:**
- Sound like a press release or marketing copy
- Use buzzwords ("leverage", "synergy", "paradigm shift", "unlock")
- Hedge excessively ("it could potentially perhaps help to...")
- Be unnecessarily formal ("herein", "aforementioned", "the authors propose")

## Formatting Rules

- **No em dashes.** Use periods, commas, colons, or parentheses instead. Rewrite the sentence if needed.
- **No semicolons** unless connecting two tightly related independent clauses. Prefer two sentences.
- **Short paragraphs.** 1-4 sentences. White space is your friend.
- **Use tables** for comparisons and structured data. They're easier to scan than prose.
- **Use code blocks** for anything that looks like code, YAML, or structured syntax.
- **Headers are signposts.** A reader skimming the headers should understand the proposal's structure and argument.

## Sentence-Level

- **Active voice.** "The runtime executes the step" not "The step is executed by the runtime."
- **Concrete subjects.** "The agent reads the skill" not "It is the case that the skill gets read."
- **Short sentences for impact.** Long sentences for explanation. Vary the rhythm.
- **Cut filler words.** "very", "really", "basically", "simply", "just" (when it means "merely"), "quite", "rather".
- **No weasel words.** "Some users report" -> "Users report." "It is generally considered" -> cut the sentence or cite a source.
- **Numbers are concrete.** Use them. "$4.50/month" is more compelling than "significant cost."

## Technical Writing

- **Define terms on first use.** The Context section exists for this. Don't assume the reader knows AgentSkill, MCP, or OpenClaw.
- **Show, then tell.** Lead with the example or the data, then explain what it means.
- **One idea per paragraph.** If you're making two points, use two paragraphs.
- **Anticipate objections.** If a skeptical reader would ask "but what about X?", address it inline or in a dedicated section.
- **YAML examples should be realistic.** Use the email triage workflow or another concrete use case. Don't use `foo`/`bar`.

## Document Structure Principles

- **The executive summary should be self-contained.** Someone who reads only the exec summary should understand the problem, the solution, and why it matters.
- **Problem before solution.** Always. The reader needs to feel the problem before they'll care about the fix.
- **Each section should earn its place.** If a section doesn't advance the argument or provide necessary technical detail, cut it.
- **End with momentum.** The document should leave the reader feeling that this is the obvious next step, not a radical departure.

## Words and Phrases to Avoid

| Instead of | Use |
|-----------|-----|
| leverage | use |
| utilize | use |
| facilitate | enable, allow, help |
| paradigm | model, approach, pattern |
| ecosystem (when overused) | community, platform, standard (be specific) |
| going forward | (cut it) |
| in order to | to |
| at the end of the day | (cut it) |
| it's worth noting that | (just state the thing) |
| as mentioned above/below | (give the specific section name or just state it) |
| robust | reliable, tested, solid |
| scalable | (be specific about what scales and how) |
| seamless | smooth, invisible, automatic |
| best practices | conventions, recommendations, patterns |
