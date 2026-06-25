export interface CrewAICompileResult {
  crewPy: string;
  toolsPy?: string;
  flowPy?: string;
  manifest: Record<string, unknown>;
  vibeContractMd: string;
  diagnostics: string[];
  requirements?: string;
}

export interface CrewAICompileOptions {
  surface?: string;
  progressPath?: string;
  laneName?: string;
}
