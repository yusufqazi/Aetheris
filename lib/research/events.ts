import type { ResearchEvent } from "@/lib/types";

export type ResearchEventInput = ResearchEvent extends infer Event
  ? Event extends ResearchEvent
    ? Omit<Event, "version" | "id" | "sessionId" | "sequence" | "timestamp">
    : never
  : never;

export function createEventFactory(sessionId: string, initialSequence = 0) {
  let sequence = initialSequence;

  return (input: ResearchEventInput): ResearchEvent => {
    sequence += 1;

    return {
      ...input,
      version: 1,
      id: `${sessionId}:${sequence}`,
      sessionId,
      sequence,
      timestamp: new Date().toISOString(),
    } as ResearchEvent;
  };
}

export function encodeResearchEvent(event: ResearchEvent) {
  return `${JSON.stringify(event)}\n`;
}

export async function readResearchEventStream(
  response: Response,
  onEvent: (event: ResearchEvent) => void | Promise<void>,
) {
  if (!response.body) {
    throw new Error("The research stream did not include a response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseResearchEvent(line);
      if (event) {
        await onEvent(event);
      }
    }

    if (done) {
      break;
    }
  }

  const finalEvent = parseResearchEvent(buffer);
  if (finalEvent) {
    await onEvent(finalEvent);
  }
}

function parseResearchEvent(line: string) {
  if (!line.trim()) {
    return null;
  }

  const value = JSON.parse(line) as Partial<ResearchEvent>;
  if (
    value.version !== 1 ||
    typeof value.id !== "string" ||
    typeof value.sessionId !== "string" ||
    typeof value.sequence !== "number" ||
    typeof value.type !== "string"
  ) {
    throw new Error("Aetheris received an invalid research event.");
  }

  return value as ResearchEvent;
}
