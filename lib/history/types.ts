import type {
  CouncilOpinion,
  MagiCouncilResult,
  MagiDeliberationResult,
  MagiId,
  MagiMode,
  MagiResult,
} from "@/types/magi";
import type { ProviderKind } from "@/lib/config/types";

export type HistorySource = "web" | "api";

export type HistoryStatus = "complete" | "incomplete" | "error";

/** Provider + model id only — never API keys. */
export type UnitModelRef = {
  provider: ProviderKind | string;
  model: string;
};

export type HistoryModels = Record<MagiId, UnitModelRef>;

export type HistoryInsertInput = {
  topic: string;
  mode: MagiMode;
  source: HistorySource;
  mock: boolean;
  status: HistoryStatus;
  durationMs: number;
  models: HistoryModels;
  /** Verdict unit results OR council opinions (sanitized). */
  units: Record<MagiId, MagiResult | CouncilOpinion> | null;
  /** Final verdict fields OR council synthesis (sanitized). */
  outcome: Record<string, unknown> | null;
  /** Top-level / aggregated errors (no secrets). */
  errors: string[] | null;
  createdAt?: string;
  id?: string;
};

export type HistoryListItem = {
  id: string;
  createdAt: string;
  topic: string;
  mode: MagiMode;
  source: HistorySource;
  mock: boolean;
  status: HistoryStatus;
  durationMs: number;
  /** Short summary for list rows (verdict or recommendation snippet). */
  summary: string;
};

export type HistoryRecord = HistoryListItem & {
  models: HistoryModels;
  units: Record<MagiId, MagiResult | CouncilOpinion> | null;
  outcome: Record<string, unknown> | null;
  errors: string[] | null;
};

export type HistoryListQuery = {
  q?: string;
  mode?: MagiMode | "all";
  source?: HistorySource | "all";
  limit?: number;
  offset?: number;
};

export type HistoryListResult = {
  items: HistoryListItem[];
  total: number;
};

/** Shape used when building a record from a successful engine result. */
export type EngineSnapshot =
  | ({ mode: "verdict" } & MagiDeliberationResult)
  | ({ mode: "council" } & MagiCouncilResult);
