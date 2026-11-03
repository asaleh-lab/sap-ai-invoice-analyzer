# TICKET-011: Follow-up chat beside the narrative

**Status:** ready-for-agent

**Commit:** Finish this ticket, then commit its code-relevant files before the next ticket. One ticket, one commit. See `AGENTS.md`.

| | |
| --- | --- |
| Ticket ID | TICKET-011 |
| Title | Ask the advisor more questions from the narrative |
| Priority | Next demo slice after the first investigation. |
| Estimated effort | 6 hours |
| Dependencies | TICKET-005, TICKET-006, TICKET-007 |

## User story

As a reviewer, I want a button next to the narrative so I can ask more questions about this invoice. The advisor should call the same read tools and can recommend an action, without posting anything.

## Context

The first investigation already stores one narrative and one recommended action. This ticket adds a conversation on that same case. It does not replace the first pass. The person still approves any release, subsequent credit, supplier draft, or dismissal through the existing actions.

## Scope

- A button beside the narrative on the investigation object page. It opens a chat for that investigation only.
- The reviewer types a question. The advisor answers in the same chat. The thread stays on the case and is still there after a refresh.
- The advisor may call the same read tools as the first investigation: supplier invoice, purchase order, goods receipts, variance, business partner, and invoice history. It does not post, release a block, or send a draft.
- A reply may name a recommended action. If it does, the stored `recommendedAction` on the case updates only when that action is one the existing policy gate allows for the stored variance. The narrative from the first pass stays. The chat is additional.
- An empty `invoiceAdvisor.apiKey` does not call a model. The button stays visible. The reply says a model key is required and does not invent an answer.
- The first investigation, the list, and the approve buttons keep their current behavior.

## Out of scope

A second advisor, new write tools, editing a posted invoice, sending the supplier draft, and chat across more than one investigation.

## Acceptance criteria

- [ ] On an `awaiting_review` case, a control sits with the narrative and opens a chat for that case.
- [ ] A question is stored and the answer is stored. Reloading the object page shows both.
- [ ] With a model key, the advisor can call a read tool while answering. Amounts in the answer come from a tool result.
- [ ] A recommended action that the policy gate rejects does not replace the stored action.
- [ ] A recommended action that the policy gate allows updates `recommendedAction`. The approve buttons follow that value. Nothing is posted by the chat.
- [ ] With an empty `apiKey`, a question returns the fixed "model key is required" reply and does not call the network.
- [ ] The first stored narrative is still the narrative field.

## Test cases

- One test with no live model: post a question, assert the thread is stored and the recommended action is unchanged when the reply names an action the gate rejects.
- One test with the scripted or stubbed advisor: an allowed action in the reply updates `recommendedAction` and does not create a supplier invoice, release, or draft.
- If a browser is available, open a case, use the button, send a question, reload, and confirm the thread is still there.
