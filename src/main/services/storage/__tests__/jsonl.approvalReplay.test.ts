// @vitest-environment node
//
// Focused replay assertions for the approval / ask event pipeline.
//
// The renderer-side reducer (`useAgentEventReducer`) consumes live stream
// events; the persisted-history reducer is `eventsToMessages` in
// `src/main/services/storage/jsonl.ts`. This test targets the latter — the
// exported helper — because that is what actually replays historical
// `approval.requested → approval` / `ask.requested → ask.answered` marker
// pairs into stable tool messages on session load.
//
// The existing jsonl.test.ts already covers the base happy path; here we
// pin down two extra invariants that must hold long-term for the refactor:
//
//   1. Message identity is *stable* across replays — a resolved approval
//      keeps its `tool_msg_<approvalId>` id and its idempotence is safe.
//   2. `ask.answered` populates the tool message's `approval.userAnswers`
//      map even when the JSONL uses the `answers` (not `user_answers`)
//      shape emitted by the current productEventMaterializer.

import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@super-client/shared-types/project";

import { eventsToMessages } from "../jsonl";

describe("eventsToMessages · approval replay", () => {
  it("replays approval.requested + approval events into a stable, resolved tool message", () => {
    const events: SessionEvent[] = [
      {
        type: "session_marker",
        ts: 100,
        key: "approval.requested",
        value: {
          approvalId: "approval-alpha",
          toolName: "execute_command",
          input: { command: "ls" },
        },
      },
      {
        type: "approval",
        ts: 101,
        toolCallId: "approval-alpha",
        decision: "allow_once",
        reason: "user",
      },
    ];

    const first = eventsToMessages(events);
    expect(first).toHaveLength(1);
    const msg = first[0];
    expect(msg.id).toBe("tool_msg_approval-alpha");
    expect(msg.role).toBe("tool");
    expect(msg.type).toBe("tool_use");
    expect(msg.toolCall).toMatchObject({
      id: "approval-alpha",
      name: "execute_command",
      input: { command: "ls" },
      status: "success",
      result: { decision: "allow_once", reason: "user" },
      approval: { kind: "permission", decisionReason: "user" },
    });

    // Idempotence: replaying the same events yields the same shape.
    const second = eventsToMessages(events);
    expect(second).toEqual(first);
    expect(second[0].id).toBe(first[0].id);
  });

  it("replays ask.requested + ask.answered markers and lifts answers onto approval.userAnswers", () => {
    const events: SessionEvent[] = [
      {
        type: "session_marker",
        ts: 200,
        key: "ask.requested",
        value: {
          askId: "ask-beta",
          toolName: "scp-agent-builtins__AskUserQuestion",
          input: {
            questions: [
              {
                header: "Approach",
                question: "Which approach?",
                options: [{ label: "Fast", description: "Iterative" }],
              },
            ],
          },
        },
      },
      {
        type: "session_marker",
        ts: 201,
        key: "ask.answered",
        value: {
          askId: "ask-beta",
          decision: "allow_once",
          reason: "user",
          payload: {
            answers: { "Which approach?": "Fast" },
          },
        },
      },
    ];

    const msgs = eventsToMessages(events);
    expect(msgs).toHaveLength(1);
    const only = msgs[0];
    expect(only.id).toBe("tool_msg_ask-beta");
    expect(only.toolCall).toMatchObject({
      id: "ask-beta",
      name: "scp-agent-builtins__AskUserQuestion",
      status: "success",
      approval: {
        kind: "ask-user-question",
        // The userAnswers map is derived from `payload.answers`.
        userAnswers: { "Which approach?": "Fast" },
        decisionReason: "user",
      },
    });
    // The full `payload` is stashed on `result` so consumers can render
    // the original raw shape too.
    expect(only.toolCall?.result).toEqual({
      answers: { "Which approach?": "Fast" },
    });
  });

  it("preserves userAnswers when ask.answered arrives out-of-order before ask.requested (orphan tolerant)", () => {
    // Defensive: if the JSONL was written with only `ask.answered` (e.g.
    // legacy session, importer that lost the request marker), the
    // reducer should still produce a resolved tool message that surfaces
    // the userAnswers instead of throwing or silently dropping.
    const events: SessionEvent[] = [
      {
        type: "session_marker",
        ts: 300,
        key: "ask.answered",
        value: {
          askId: "ask-gamma",
          decision: "allow_once",
          reason: "user",
          payload: {
            answers: { "Which?": "Yes" },
          },
        },
      },
    ];

    const msgs = eventsToMessages(events);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].toolCall).toMatchObject({
      status: "success",
      approval: {
        kind: "ask-user-question",
        userAnswers: { "Which?": "Yes" },
      },
    });
  });
});
