## Agent skills

Engineering skills from [mattpocock/skills](https://github.com/mattpocock/skills) are installed for Cursor in `.agents/skills/` (and globally under `~/.agents/skills/`).

### Issue tracker

Work is tracked as markdown under `.scratch/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: optional root `GLOSSARY.md` and `docs/adr/` when terms or decisions are settled. See `docs/agents/domain.md`.

### Tickets

When you finish a ticket under `docs/tickets/`, commit that ticket's code-relevant files in this repo before you start the next ticket. One ticket, one commit. The message says why that step landed. Leave secrets, `.env`, and chat notes uncommitted.
