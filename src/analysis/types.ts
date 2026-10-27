export type ConfidenceTier = "labeled" | "heuristic-only";

export interface StarterIssueSignals {
  hasStarterLabel: boolean;
  isUnassigned: boolean;
  updatedRecently: boolean;
  hasSubstantialBody: boolean;
  commentCount: number;
}

export interface CandidateStarterIssue {
  number: number;
  title: string;
  url: string;
  body: string | null;
  labels: string[];
  signals: StarterIssueSignals;
  reasons: string[];
  confidence: ConfidenceTier;
  score: number;
}

export interface AnalysisOptions {
  now?: Date;
  recencyDays?: number;
  minBodyChars?: number;
}
