# TICKET-001: Project foundation

**Status:** ready-for-agent

**Commit:** Finish this ticket, then commit its code-relevant files before the next ticket. One ticket, one commit. See `AGENTS.md`.

| | |
| --- | --- |
| Ticket ID | TICKET-001 |
| Title | TypeScript CAP app and advisor module shell |
| Priority | High. MVP. Evening 1. |
| Estimated effort | 3 hours |
| Dependencies | None |

## User story

As a reviewer cloning this repo, I want one command to start the empty workbench, so later tickets have a place to land.

## Context

The application is not written yet. The architecture is [solution-overview.md](../architecture/solution-overview.md) and [ADR 0005](../adr/0005-advisor-module-in-the-cap-app.md). This ticket creates the runnable skeleton and no business behavior. The app is Node.js and TypeScript.

## Scope

- CAP Node.js project with TypeScript handlers and `@cap-js/sqlite`.
- Package scripts: `cds watch`, `cds deploy` against a file database `db.sqlite` at the repo root (gitignored).
- Advisor module in `advisor/`, TypeScript, same package as the CAP app. Export `investigate`. The stub throws a not-implemented error. Ticket 005 fills it in.
- `investigate` accepts `caseId`, `objective`, `input` (`SupplierInvoice`, `FiscalYear`), and a `tools` object. It does not accept an invoice document. The module does not import `@sap/cds` or the invoice model.
- `.env.example` with `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `PORT`. No secrets.
- `docker-compose.yml` with one service, `app`, and a volume for `db.sqlite`.
- Root `.gitignore` for `node_modules`, `dist`, `db.sqlite`, `.env`.
- A health route on the CAP app, `GET /health`, returning `{ "status": "ok", "mode": "simulated-s4" }`.

## Out of scope

CDS entities, seed data, events, UI, the real tool-calling loop.

## Implementation requirements

- Node 20 or newer. CAP current stable. TypeScript for the CAP handlers, the advisor module, and the later UI.
- The CAP `package.json` name is `sap-ai-invoice-analyzer`.
- Compose runs that one app.
- Pin the dependency versions chosen on the day of implementation.
- The simulated Event Mesh topic is not built in this ticket. Leave the broker out. The inbox arrives in ticket 004.
- README setup commands are updated only if they would be wrong after this ticket. The walkthrough README is ticket 009.

## SAP documentation

None. Local CAP SQLite guide: https://cap.cloud.sap/docs/guides/databases/sqlite

## Expected artifacts

`package.json`, `tsconfig.json`, `db/` placeholder, `srv/` placeholder, `app/` placeholder for the later UI, `advisor/`, `docker-compose.yml`, `.env.example`, `.gitignore`. The advisor lives in the same `package.json`.

## Acceptance criteria

- [ ] `npm install` and `npx cds watch` start the CAP app and `GET /health` returns `mode` `simulated-s4`.
- [ ] Importing `investigate` from `advisor/` and calling it throws the not-implemented error.
- [ ] `advisor/` does not import `@sap/cds`.
- [ ] `docker compose up --build` brings up the app, and `GET` on the health URL succeeds without an SAP credential.
- [ ] `.env` is gitignored. `.env.example` contains empty `LLM_API_KEY`.

## Test cases

- Request `/health`.
- `docker compose config` shows one service.
- Confirm `db.sqlite` is ignored by `git status` after a local deploy.

## Demo value

Shows the repo runs locally, in one Node.js process, with the advisor module already separated from the invoice handlers.

## Risks

CAP major versions move. Pin the versions chosen on the day of implementation in `package.json`.
