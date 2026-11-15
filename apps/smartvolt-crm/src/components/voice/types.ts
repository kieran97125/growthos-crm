export type ItemState = {
  busy: boolean;
  pending: Record<string, unknown> | null;
  error: string;
  notice: string;
  editing: boolean;
  draft: string;
  reason: string;
  revision: number;
  transcriptId: string;
  correction: Record<string, unknown> | null;
};
