// Shared type definitions for the pigeon content script modules

export interface LineLocation {
  line: number;
  side: "old" | "new";
}

export interface PullRequest {
  owner: string;
  repo: string;
  number: string;
}

export interface SelectionContext {
  file: string;
  startLine: number | null;
  endLine: number | null;
  side: string | null;
  code: string;
  pullRequest: PullRequest | null;
  url: string;
}

export interface SelectionResult {
  context: SelectionContext;
  startElement: Element;
}

export interface DebugStrategy {
  strategy: number | string;
  found: string | null;
  [key: string]: unknown;
}

export interface ListSessionsResponse {
  ok: boolean;
  sessions?: string[];
  error?: string;
}

export interface SendResponse {
  ok: boolean;
  error?: string;
}
