import type { RiskLane, LaneMode } from "./types-v2";
import {
  Eye,
  FolderEdit,
  Send,
  Rocket,
  DollarSign,
  KeyRound,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

export interface RiskLaneConfig {
  lane: RiskLane;
  label: string;
  description: string;
  severity: number;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: LucideIcon;
  defaultMode: LaneMode;
}

export const RISK_LANES: Record<RiskLane, RiskLaneConfig> = {
  read_only: {
    lane: "read_only",
    label: "Read Only",
    description: "Read files, list directories, query data",
    severity: 1,
    color: "#22c55e",
    bgColor: "rgba(34, 197, 94, 0.1)",
    borderColor: "rgba(34, 197, 94, 0.3)",
    icon: Eye,
    defaultMode: "auto_approve",
  },
  file_modification: {
    lane: "file_modification",
    label: "File Modification",
    description: "Write, edit, delete, or move files",
    severity: 2,
    color: "#3B82F6",
    bgColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "rgba(59, 130, 246, 0.3)",
    icon: FolderEdit,
    defaultMode: "ask",
  },
  external_comms: {
    lane: "external_comms",
    label: "External Comms",
    description: "Send emails, messages, or HTTP requests",
    severity: 3,
    color: "#a855f7",
    bgColor: "rgba(168, 85, 247, 0.1)",
    borderColor: "rgba(168, 85, 247, 0.3)",
    icon: Send,
    defaultMode: "ask",
  },
  deployment: {
    lane: "deployment",
    label: "Deployment",
    description: "Deploy code, run CI/CD, publish packages",
    severity: 4,
    color: "#f59e0b",
    bgColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.3)",
    icon: Rocket,
    defaultMode: "ask",
  },
  financial: {
    lane: "financial",
    label: "Financial",
    description: "Process payments, transfers, or billing changes",
    severity: 5,
    color: "#ef4444",
    bgColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
    icon: DollarSign,
    defaultMode: "auto_deny",
  },
  credential_access: {
    lane: "credential_access",
    label: "Credential Access",
    description: "Access secrets, tokens, API keys, or passwords",
    severity: 5,
    color: "#ef4444",
    bgColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
    icon: KeyRound,
    defaultMode: "auto_deny",
  },
  unknown: {
    lane: "unknown",
    label: "Unknown",
    description: "Unclassified tool or capability",
    severity: 3,
    color: "#666666",
    bgColor: "rgba(102, 102, 102, 0.1)",
    borderColor: "rgba(102, 102, 102, 0.3)",
    icon: HelpCircle,
    defaultMode: "ask",
  },
};

export function getLaneConfig(lane: RiskLane): RiskLaneConfig {
  return RISK_LANES[lane] ?? RISK_LANES.unknown;
}

export function getLaneModeLabel(mode: LaneMode): string {
  switch (mode) {
    case "auto_approve":
      return "Auto-approve";
    case "ask":
      return "Ask";
    case "auto_deny":
      return "Auto-deny";
  }
}
