export type PlayerId = 'p1' | 'p2';

export type RuleDomain =
  | '상태공간'
  | '승리조건'
  | '패배조건'
  | '드로우'
  | '주사위'
  | '연산'
  | '특수/감응형';

export type DiceSensitivity = '없음' | '필수' | '선택';

export type RuleTier = 'beneficial' | 'tactical' | 'hazard';

export interface ParameterCard {
  id: string;
  kind: 'parameter';
  paramName: string;
  sign: '+' | '-';
  flavor: string;
}

export type RuleId =
  | 'invasion'
  | 'inversion'
  | 'puppeteer'
  | 'firewall'
  | 'hyperfocus'
  | 'equilibrium'
  | 'abyssal_pact'
  | 'glass_cannon'
  | 'iron_will'
  | 'scapegoat'
  | 'overclock'
  | 'loaded_hand'
  | 'twin_synergy'
  | 'extremist'
  | 'safety_first'
  | 'amplifier'
  | 'sign_flip'
  | 'equivalent_exchange'
  | 'time_bomb'
  | 'rule_eater'
  | 'debt_repayment'
  | 'rule_lock';

export interface RuleCard {
  id: string;
  kind: 'rule';
  ruleId: RuleId;
  name: string;
  englishName: string;
  domain: RuleDomain;
  sensitivity: DiceSensitivity;
  tier: RuleTier;
  isInstant?: boolean;
  counterValue?: number;
  counterLabel?: string;
  description: string;
}

export type MainCard = ParameterCard | RuleCard;

export interface DiceCard {
  id: string;
  value: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface DifficultyProfile {
  difficulty: number;
  phase: 'phase1' | 'phase2';
  phaseLabel: string;
  phaseDescription: string;
  paramPlusProb: number;
  paramMinusProb: number;
  diceWeights: [number, number, number, number, number, number];
  diceExpectedValue: number;
  diceHighProb: number;
  ruleCount: number;
  hazardShare: number;
}

export interface StateSpaceCombination {
  ruleOwner: PlayerId;
  paramOwner: PlayerId;
  sourceRuleName: string;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  isAI: boolean;
  parameters: Record<string, number>;
  rules: RuleCard[];
}

export type TurnPhase =
  | 'ready_to_draw'
  | 'choose_overclock_card'
  | 'resolve_conflict'
  | 'resolve_action'
  | 'turn_end_ready'
  | 'game_over';

export interface LogEntry {
  id: number;
  turn: number;
  actor: string;
  message: string;
  type: 'info' | 'rule' | 'param' | 'combo' | 'win' | 'warn';
}

export interface GameState {
  mode: 'vs_ai' | 'local_2p';
  difficulty: number;
  turnNumber: number;
  activePlayer: PlayerId;
  phase: TurnPhase;
  players: Record<PlayerId, PlayerState>;
  mainStack: MainCard[];
  mainSecondaryStack: MainCard[];
  diceStack: DiceCard[];
  diceSecondaryStack: DiceCard[];
  combination: StateSpaceCombination | null;
  drawnMainCards: MainCard[];
  activeMainCard: MainCard | null;
  drawnDice: DiceCard[];
  usedDiceIds: string[];
  timeBombResolvedThisTurn: boolean;
  equivalentExchangeUsed: boolean;
  equivalentExchangeBonus: number;
  signFlipActiveThisTurn: boolean;
  conflictingRulePair: { existing: RuleCard; incoming: RuleCard } | null;
  winner: PlayerId | null;
  winReason: string | null;
  logs: LogEntry[];
  nextLogId: number;
}
