# Skill loader.

Discover SKILL.md from official Pi user-level directories and inject name/description into the system prompt.

Sources (no project `.pi/` until piruse has trust):

- `~/.pi/agent/skills`
- `~/.agents/skills`
- `skills` paths in `~/.pi/agent/settings.json`
- installed user packages under `~/.pi/agent/npm` and `~/.pi/agent/git`

The model loads full skill text with the existing `read` tool. Relative paths resolve against the skill directory.
