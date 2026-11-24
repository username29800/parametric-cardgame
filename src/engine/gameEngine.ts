import {
  createDiceDeck,
  createStarterMainDeck,
  shuffle,
  STARTER_PARAMETERS,
} from '../data/cards.ts';
import { clampDifficulty } from './difficulty.ts';
import type {
  DiceCard,
  GameState,
  LogEntry,
  MainCard,
  ParameterCard,
  PlayerId,
  RuleCard,
  RuleId,
} from '../types/game.ts';

function createInitialParameters(): Record<string, number> {
  const params: Record<string, number> = {};
  for (const name of STARTER_PARAMETERS) {
    params[name] = 0;
  }
  return params;
}

export function createInitialGameState(
  mode: 'vs_ai' | 'local_2p' = 'vs_ai',
  rawDifficulty = 3.5
): GameState {
  const difficulty = clampDifficulty(rawDifficulty);
  return {
    mode,
    difficulty,
    turnNumber: 1,
    activePlayer: 'p1',
    phase: 'ready_to_draw',
    players: {
      p1: {
        id: 'p1',
        name: mode === 'vs_ai' ? '플레이어 (나)' : '플레이어 1',
        isAI: false,
        parameters: createInitialParameters(),
        rules: [],
      },
      p2: {
        id: 'p2',
        name: mode === 'vs_ai' ? 'AI 오토마타' : '플레이어 2',
        isAI: mode === 'vs_ai',
        parameters: createInitialParameters(),
        rules: [],
      },
    },
    mainStack: createStarterMainDeck(difficulty),
    mainSecondaryStack: [],
    diceStack: createDiceDeck(difficulty),
    diceSecondaryStack: [],
    combination: null,
    drawnMainCards: [],
    activeMainCard: null,
    drawnDice: [],
    usedDiceIds: [],
    timeBombResolvedThisTurn: false,
    equivalentExchangeUsed: false,
    equivalentExchangeBonus: 0,
    signFlipActiveThisTurn: false,
    conflictingRulePair: null,
    winner: null,
    winReason: null,
    logs: [
      {
        id: 1,
        turn: 1,
        actor: '시스템',
        message: `프로젝트 파라메트릭 대전이 시작되었습니다. (난이도 ${difficulty.toFixed(1)} · 스탠다드 프로토콜 v1.0)`,
        type: 'info',
      },
    ],
    nextLogId: 2,
  };
}

function appendLog(
  state: GameState,
  actor: string,
  message: string,
  type: LogEntry['type'] = 'info'
): GameState {
  const entry: LogEntry = {
    id: state.nextLogId,
    turn: state.turnNumber,
    actor,
    message,
    type,
  };
  return {
    ...state,
    logs: [entry, ...state.logs].slice(0, 60),
    nextLogId: state.nextLogId + 1,
  };
}

export function getOpponent(id: PlayerId): PlayerId {
  return id === 'p1' ? 'p2' : 'p1';
}

export function getEffectiveRuleOwner(state: GameState): PlayerId {
  return state.combination?.ruleOwner ?? state.activePlayer;
}

export function getEffectiveParamOwner(state: GameState): PlayerId {
  return state.combination?.paramOwner ?? state.activePlayer;
}

export function getEffectiveRules(state: GameState): RuleCard[] {
  return state.players[getEffectiveRuleOwner(state)].rules;
}

export function hasEffectiveRule(state: GameState, ruleId: RuleId): boolean {
  return getEffectiveRules(state).some((r) => r.ruleId === ruleId);
}

export function hasPlayerRule(state: GameState, playerId: PlayerId, ruleId: RuleId): boolean {
  return state.players[playerId].rules.some((r) => r.ruleId === ruleId);
}

function drawFromMainStack(state: GameState, count: number): { cards: MainCard[]; state: GameState } {
  let mainStack = [...state.mainStack];
  let mainSecondaryStack = [...state.mainSecondaryStack];
  let nextState = state;
  const cards: MainCard[] = [];

  for (let i = 0; i < count; i++) {
    if (mainStack.length === 0) {
      if (mainSecondaryStack.length === 0) break;
      mainStack = shuffle(mainSecondaryStack);
      mainSecondaryStack = [];
      nextState = appendLog(
        nextState,
        '시스템',
        '메인 스택이 바닥나 세컨더리 스택을 섞어 되돌렸습니다.',
        'info'
      );
    }
    const top = mainStack.shift();
    if (top) cards.push(top);
  }

  return {
    cards,
    state: {
      ...nextState,
      mainStack,
      mainSecondaryStack,
    },
  };
}

function drawFromDiceStack(state: GameState, count: number): { dice: DiceCard[]; state: GameState } {
  let diceStack = [...state.diceStack];
  let diceSecondaryStack = [...state.diceSecondaryStack];
  let nextState = state;
  const dice: DiceCard[] = [];

  for (let i = 0; i < count; i++) {
    if (diceStack.length === 0) {
      if (diceSecondaryStack.length === 0) break;
      diceStack = shuffle(diceSecondaryStack);
      diceSecondaryStack = [];
      nextState = appendLog(
        nextState,
        '시스템',
        '주사위 스택이 바닥나 세컨더리 스택을 섞어 되돌렸습니다.',
        'info'
      );
    }
    const top = diceStack.shift();
    if (top) dice.push(top);
  }

  return {
    dice,
    state: {
      ...nextState,
      diceStack,
      diceSecondaryStack,
    },
  };
}

export function getEffectiveDieValue(state: GameState, rawValue: number, forceSafetyThree = false): number {
  if (forceSafetyThree && hasEffectiveRule(state, 'safety_first')) {
    return 3;
  }
  if (hasEffectiveRule(state, 'extremist')) {
    if (rawValue === 1) return 6;
    if (rawValue === 2) return 5;
    if (rawValue === 3 || rawValue === 4) return 1;
  }
  return rawValue;
}

export function drawTurnCards(state: GameState): GameState {
  if (state.phase !== 'ready_to_draw') return state;

  const actor = state.players[state.activePlayer];
  const mainCount = hasEffectiveRule(state, 'overclock') ? 2 : 1;
  const diceCount = hasEffectiveRule(state, 'loaded_hand') ? 3 : 2;

  const mainRes = drawFromMainStack(state, mainCount);
  const diceRes = drawFromDiceStack(mainRes.state, diceCount);

  let next = diceRes.state;
  next = {
    ...next,
    drawnMainCards: mainRes.cards,
    drawnDice: diceRes.dice,
    usedDiceIds: [],
    timeBombResolvedThisTurn: false,
    equivalentExchangeUsed: false,
    equivalentExchangeBonus: 0,
    signFlipActiveThisTurn: false,
  };

  const diceStr = diceRes.dice.map((d) => `[${d.value}]`).join(' ');
  next = appendLog(next, actor.name, `주사위 ${diceCount}장 드로우: ${diceStr}`, 'info');

  if (mainRes.cards.length === 0) {
    return { ...next, phase: 'turn_end_ready' };
  }

  if (mainRes.cards.length > 1) {
    next = appendLog(
      next,
      actor.name,
      `[과부하] 효과로 메인 카드 2장을 뽑았습니다. 1장을 선택하세요.`,
      'rule'
    );
    return {
      ...next,
      phase: 'choose_overclock_card',
    };
  }

  return activateMainCard(next, mainRes.cards[0]);
}

export function chooseOverclockCard(state: GameState, cardId: string): GameState {
  if (state.phase !== 'choose_overclock_card') return state;
  const chosen = state.drawnMainCards.find((c) => c.id === cardId);
  if (!chosen) return state;

  const discarded = state.drawnMainCards.filter((c) => c.id !== cardId);
  const actor = state.players[state.activePlayer];

  let next: GameState = {
    ...state,
    mainSecondaryStack: [...state.mainSecondaryStack, ...discarded],
    drawnMainCards: [chosen],
  };

  next = appendLog(
    next,
    actor.name,
    `[과부하] '${chosen.kind === 'parameter' ? `${chosen.paramName} ${chosen.sign}` : chosen.name}' 선택.`,
    'info'
  );

  return activateMainCard(next, chosen);
}

function activateMainCard(state: GameState, card: MainCard): GameState {
  const actor = state.players[state.activePlayer];

  if (card.kind === 'parameter') {
    const next = appendLog(
      state,
      actor.name,
      `파라미터 카드 [${card.paramName} ${card.sign}] 드로우!`,
      'param'
    );
    return {
      ...next,
      activeMainCard: card,
      phase: 'resolve_action',
    };
  }

  // Rule Card
  return placeRuleCard(state, card);
}

function placeRuleCard(state: GameState, card: RuleCard): GameState {
  const actorId = state.activePlayer;
  const opponentId = getOpponent(actorId);
  const actor = state.players[actorId];

  // Instant State Space Combination cards
  if (card.isInstant && card.domain === '상태공간') {
    let next: GameState = {
      ...state,
      mainSecondaryStack: [...state.mainSecondaryStack, card],
      activeMainCard: null,
    };

    if (
      (card.ruleId === 'invasion' || card.ruleId === 'puppeteer') &&
      hasPlayerRule(state, opponentId, 'firewall')
    ) {
      next = appendLog(
        next,
        actor.name,
        `[${card.name}] 발동 시도했으나 상대의 [방화벽]에 의해 차단되었습니다!`,
        'warn'
      );
      return checkPostRulePhase(next);
    }

    if (card.ruleId === 'invasion') {
      next = {
        ...next,
        combination: {
          ruleOwner: actorId,
          paramOwner: opponentId,
          sourceRuleName: '침공',
        },
      };
      next = appendLog(
        next,
        actor.name,
        `[침공] 발동! 이번 턴 자신의 규칙 상태공간 + 상대의 파라미터 상태공간으로 진행합니다!`,
        'combo'
      );
    } else if (card.ruleId === 'inversion') {
      next = {
        ...next,
        combination: {
          ruleOwner: opponentId,
          paramOwner: actorId,
          sourceRuleName: '역전',
        },
      };
      next = appendLog(
        next,
        actor.name,
        `[역전] 발동! 이번 턴 상대의 규칙 상태공간 + 자신의 파라미터 상태공간으로 진행합니다!`,
        'combo'
      );
    } else if (card.ruleId === 'puppeteer') {
      next = {
        ...next,
        combination: {
          ruleOwner: opponentId,
          paramOwner: opponentId,
          sourceRuleName: '인형술사',
        },
      };
      next = appendLog(
        next,
        actor.name,
        `[인형술사] 발동! 이번 턴 상대의 규칙 상태공간 + 상대의 파라미터 상태공간으로 진행합니다!`,
        'combo'
      );
    }

    // Draw 1 bonus card from Main Stack so the combination immediately matters!
    const bonus = drawFromMainStack(next, 1);
    next = bonus.state;
    if (bonus.cards.length > 0) {
      next = appendLog(
        next,
        actor.name,
        `상태공간 조합 보너스로 메인 스택에서 1장을 추가 드로우합니다.`,
        'combo'
      );
      return activateMainCard(next, bonus.cards[0]);
    }

    return checkPostRulePhase(next);
  }

  // Persistent / Counter Rule Card
  const preparedCard: RuleCard = {
    ...card,
    counterValue:
      card.ruleId === 'time_bomb' ? 10 : card.ruleId === 'rule_eater' ? 0 : card.counterValue,
  };

  const existingSameDomain = actor.rules.find((r) => r.domain === preparedCard.domain);
  if (existingSameDomain) {
    const next = appendLog(
      state,
      actor.name,
      `규칙 충돌! [${existingSameDomain.domain}] 영역의 '${existingSameDomain.name}'와 '${preparedCard.name}' 중 1장만 남겨야 합니다.`,
      'warn'
    );
    return {
      ...next,
      conflictingRulePair: { existing: existingSameDomain, incoming: preparedCard },
      phase: 'resolve_conflict',
    };
  }

  const updatedPlayer = {
    ...actor,
    rules: [...actor.rules, preparedCard],
  };

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [actorId]: updatedPlayer,
    },
    activeMainCard: null,
  };

  next = appendLog(
    next,
    actor.name,
    `룰 카드 [${preparedCard.name}] (${preparedCard.domain}) 배치 완료!`,
    'rule'
  );

  if (hasPlayerRule(next, actorId, 'rule_lock')) {
    const entries = Object.entries(next.players[actorId].parameters).sort((a, b) => a[1] - b[1]);
    const lowest = entries[0][0];
    next = {
      ...next,
      players: {
        ...next.players,
        [actorId]: {
          ...next.players[actorId],
          parameters: {
            ...next.players[actorId].parameters,
            [lowest]: next.players[actorId].parameters[lowest] - 2,
          },
        },
      },
    };
    next = appendLog(
      next,
      actor.name,
      `🔒 [규칙 잠금] 룰 배치 페널티로 '${lowest}'이(가) -2 감소했습니다.`,
      'warn'
    );
  }

  return checkPostRulePhase(next);
}

export function resolveRuleConflict(state: GameState, keep: 'existing' | 'incoming'): GameState {
  if (state.phase !== 'resolve_conflict' || !state.conflictingRulePair) return state;

  const actorId = state.activePlayer;
  const actor = state.players[actorId];
  const { existing, incoming } = state.conflictingRulePair;

  const kept = keep === 'existing' ? existing : incoming;
  const discarded = keep === 'existing' ? incoming : existing;

  let updatedRules = actor.rules.filter((r) => r.id !== existing.id);
  updatedRules.push(kept);

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [actorId]: {
        ...actor,
        rules: updatedRules,
      },
    },
    mainSecondaryStack: [...state.mainSecondaryStack, discarded],
    conflictingRulePair: null,
  };

  next = appendLog(
    next,
    actor.name,
    `규칙 충돌 해결: '${kept.name}' 유지, '${discarded.name}' 버림.`,
    'rule'
  );

  // Trigger Rule Eater if present in actor's rules
  const eaterIdx = updatedRules.findIndex((r) => r.ruleId === 'rule_eater');
  if (eaterIdx !== -1 && kept.id !== updatedRules[eaterIdx].id) {
    const eater = updatedRules[eaterIdx];
    const newVal = (eater.counterValue ?? 0) + 4;
    if (newVal >= 12) {
      // Boost lowest parameter by +8 and destroy rule_eater
      const paramEntries = Object.entries(next.players[actorId].parameters);
      paramEntries.sort((a, b) => a[1] - b[1]);
      const lowestParam = paramEntries[0][0];
      const newParams = {
        ...next.players[actorId].parameters,
        [lowestParam]: next.players[actorId].parameters[lowestParam] + 8,
      };
      const finalRules = updatedRules.filter((r) => r.id !== eater.id);
      next = {
        ...next,
        players: {
          ...next.players,
          [actorId]: {
            ...next.players[actorId],
            parameters: newParams,
            rules: finalRules,
          },
        },
        mainSecondaryStack: [...next.mainSecondaryStack, eater],
      };
      next = appendLog(
        next,
        actor.name,
        `[룰 포식자] 포식 수치 12 달성! '${lowestParam}' +8 증가 후 파괴되었습니다!`,
        'rule'
      );
    } else {
      const updatedEater = { ...eater, counterValue: newVal };
      const finalRules = [...updatedRules];
      finalRules[eaterIdx] = updatedEater;
      next = {
        ...next,
        players: {
          ...next.players,
          [actorId]: {
            ...next.players[actorId],
            rules: finalRules,
          },
        },
      };
      next = appendLog(
        next,
        actor.name,
        `[룰 포식자] 포식 수치 +4 (현재 ${newVal}/12).`,
        'rule'
      );
    }
  }

  return checkPostRulePhase(next);
}

function checkPostRulePhase(state: GameState): GameState {
  const needsTimeBomb =
    hasEffectiveRule(state, 'time_bomb') &&
    !state.timeBombResolvedThisTurn &&
    state.drawnDice.some((d) => !state.usedDiceIds.includes(d.id));

  if (needsTimeBomb || state.activeMainCard?.kind === 'parameter') {
    return { ...state, phase: 'resolve_action' };
  }

  return { ...state, phase: 'turn_end_ready' };
}

export function toggleSignFlip(state: GameState): GameState {
  if (state.phase !== 'resolve_action' || !hasEffectiveRule(state, 'sign_flip')) return state;
  return {
    ...state,
    signFlipActiveThisTurn: !state.signFlipActiveThisTurn,
  };
}

export function activateEquivalentExchange(state: GameState, sacrificeParam: string): GameState {
  if (
    state.phase !== 'resolve_action' ||
    state.equivalentExchangeUsed ||
    !hasEffectiveRule(state, 'equivalent_exchange')
  ) {
    return state;
  }

  const paramOwnerId = getEffectiveParamOwner(state);
  const paramOwner = state.players[paramOwnerId];
  if (!(sacrificeParam in paramOwner.parameters)) return state;

  const nextParams = {
    ...paramOwner.parameters,
    [sacrificeParam]: paramOwner.parameters[sacrificeParam] - 3,
  };

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [paramOwnerId]: {
        ...paramOwner,
        parameters: nextParams,
      },
    },
    equivalentExchangeUsed: true,
    equivalentExchangeBonus: 3,
  };

  next = appendLog(
    next,
    state.players[state.activePlayer].name,
    `[등가교환] '${sacrificeParam}' -3 희생 → 이번 주사위 수치 +3 보너스 획득!`,
    'rule'
  );

  return next;
}

export function applyDieToTimeBomb(state: GameState, dieId: string): GameState {
  if (state.phase !== 'resolve_action' || state.timeBombResolvedThisTurn) return state;
  const die = state.drawnDice.find((d) => d.id === dieId && !state.usedDiceIds.includes(d.id));
  if (!die) return state;

  const ruleOwnerId = getEffectiveRuleOwner(state);
  const ruleOwner = state.players[ruleOwnerId];
  const bomb = ruleOwner.rules.find((r) => r.ruleId === 'time_bomb');
  if (!bomb) return state;

  const dieVal = getEffectiveDieValue(state, die.value);
  const newCounter = Math.max(0, (bomb.counterValue ?? 10) - dieVal);

  let next: GameState = {
    ...state,
    usedDiceIds: [...state.usedDiceIds, die.id],
    timeBombResolvedThisTurn: true,
  };

  if (newCounter === 0) {
    // Bomb explodes on effective param owner!
    const paramOwnerId = getEffectiveParamOwner(state);
    const paramOwner = next.players[paramOwnerId];
    const blastedParams: Record<string, number> = {};
    for (const [k, v] of Object.entries(paramOwner.parameters)) {
      blastedParams[k] = v - 3;
    }
    next = {
      ...next,
      players: {
        ...next.players,
        [ruleOwnerId]: {
          ...next.players[ruleOwnerId],
          rules: next.players[ruleOwnerId].rules.filter((r) => r.id !== bomb.id),
        },
        [paramOwnerId]: {
          ...next.players[paramOwnerId],
          parameters: blastedParams,
        },
      },
      mainSecondaryStack: [...next.mainSecondaryStack, bomb],
    };
    next = appendLog(
      next,
      state.players[state.activePlayer].name,
      `💥 [시한폭탄] 주사위 [${dieVal}] 적용으로 폭탄 수치 0 도달! 폭발하여 모든 파라미터가 -3 되었습니다!`,
      'warn'
    );
  } else {
    next = {
      ...next,
      players: {
        ...next.players,
        [ruleOwnerId]: {
          ...ruleOwner,
          rules: ruleOwner.rules.map((r) =>
            r.id === bomb.id ? { ...r, counterValue: newCounter } : r
          ),
        },
      },
    };
    next = appendLog(
      next,
      state.players[state.activePlayer].name,
      `💣 [시한폭탄] 주사위 [${dieVal}] 할당 → 남은 폭탄 수치: ${newCounter}`,
      'rule'
    );
  }

  // If no parameter card left to resolve, turn is ready to end
  if (!next.activeMainCard || next.activeMainCard.kind !== 'parameter') {
    return { ...next, phase: 'turn_end_ready' };
  }

  return next;
}

export function dismissDebtRepayment(state: GameState, dieId: string): GameState {
  if (state.phase !== 'resolve_action') return state;
  const die = state.drawnDice.find((d) => d.id === dieId && !state.usedDiceIds.includes(d.id));
  if (!die || getEffectiveDieValue(state, die.value) < 6) return state;

  const ruleOwnerId = getEffectiveRuleOwner(state);
  const ruleOwner = state.players[ruleOwnerId];
  const debtCard = ruleOwner.rules.find((r) => r.ruleId === 'debt_repayment');
  if (!debtCard) return state;

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [ruleOwnerId]: {
        ...ruleOwner,
        rules: ruleOwner.rules.filter((r) => r.id !== debtCard.id),
      },
    },
    usedDiceIds: [...state.usedDiceIds, die.id],
    mainSecondaryStack: [...state.mainSecondaryStack, debtCard],
  };

  next = appendLog(
    next,
    state.players[state.activePlayer].name,
    `💸 [부채 상환] 주사위 [6]을 지불하여 부채 상환 규칙을 해제했습니다!`,
    'rule'
  );

  if (!next.activeMainCard || next.activeMainCard.kind !== 'parameter') {
    return { ...next, phase: 'turn_end_ready' };
  }
  return next;
}

export function applyDieToParameter(
  state: GameState,
  dieIds: string[],
  options?: { forceSafetyThree?: boolean }
): GameState {
  if (state.phase !== 'resolve_action') return state;
  if (!state.activeMainCard || state.activeMainCard.kind !== 'parameter') return state;

  // Enforce Time Bomb first if active and unused dice remain
  const unusedDice = state.drawnDice.filter((d) => !state.usedDiceIds.includes(d.id));
  if (
    hasEffectiveRule(state, 'time_bomb') &&
    !state.timeBombResolvedThisTurn &&
    unusedDice.length <= 1
  ) {
    // Must use last die on time_bomb
    return state;
  }

  const selectedDice = dieIds
    .map((id) => unusedDice.find((d) => d.id === id))
    .filter((d): d is DiceCard => Boolean(d));

  if (selectedDice.length === 0) return state;

  // Validate Twin Synergy if 2 dice selected
  let baseValue = 0;
  if (selectedDice.length === 2) {
    if (
      !hasEffectiveRule(state, 'twin_synergy') ||
      selectedDice[0].value !== selectedDice[1].value
    ) {
      return state;
    }
    baseValue =
      getEffectiveDieValue(state, selectedDice[0].value) +
      getEffectiveDieValue(state, selectedDice[1].value);
  } else {
    baseValue = getEffectiveDieValue(
      state,
      selectedDice[0].value,
      Boolean(options?.forceSafetyThree)
    );
  }

  const card: ParameterCard = state.activeMainCard;
  let effectiveSign: '+' | '-' = card.sign;
  if (state.signFlipActiveThisTurn && hasEffectiveRule(state, 'sign_flip')) {
    effectiveSign = card.sign === '+' ? '-' : '+';
  }

  let magnitude = baseValue + state.equivalentExchangeBonus;
  if (effectiveSign === '+') {
    if (hasEffectiveRule(state, 'glass_cannon')) magnitude += 2;
    if (hasEffectiveRule(state, 'amplifier')) magnitude += 2;
  } else {
    if (hasEffectiveRule(state, 'amplifier')) magnitude += 1;
  }

  const delta = effectiveSign === '+' ? magnitude : -magnitude;
  const paramOwnerId = getEffectiveParamOwner(state);
  const paramOwner = state.players[paramOwnerId];
  const prevVal = paramOwner.parameters[card.paramName] ?? 0;
  const newVal = prevVal + delta;

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [paramOwnerId]: {
        ...paramOwner,
        parameters: {
          ...paramOwner.parameters,
          [card.paramName]: newVal,
        },
      },
    },
    usedDiceIds: [...state.usedDiceIds, ...selectedDice.map((d) => d.id)],
    mainSecondaryStack: [...state.mainSecondaryStack, card],
    activeMainCard: null,
  };

  const signPrefix = delta >= 0 ? `+${delta}` : `${delta}`;
  const targetLabel =
    paramOwnerId === state.activePlayer
      ? paramOwner.name
      : `${paramOwner.name} (조합 대상)`;

  next = appendLog(
    next,
    state.players[state.activePlayer].name,
    `${targetLabel}의 [${card.paramName}] ${signPrefix} (${prevVal} → ${newVal})`,
    'param'
  );

  // If time bomb still needs resolution and a die remains, stay in resolve_action
  const remainingDice = next.drawnDice.filter((d) => !next.usedDiceIds.includes(d.id));
  if (
    hasEffectiveRule(next, 'time_bomb') &&
    !next.timeBombResolvedThisTurn &&
    remainingDice.length > 0
  ) {
    return { ...next, phase: 'resolve_action' };
  }

  return { ...next, phase: 'turn_end_ready' };
}

function evaluatePlayerEndState(
  state: GameState,
  playerId: PlayerId
): { result: 'win' | 'loss' | 'none'; reason: string | null; updatedState: GameState } {
  let next = state;
  const player = next.players[playerId];
  const rules = player.rules;
  const hasRule = (id: RuleId) => rules.some((r) => r.ruleId === id);

  const ironOffset = hasRule('iron_will') ? 3 : 0;
  const bankruptcyLimit = hasRule('glass_cannon') ? -8 : hasRule('iron_will') ? -18 : -12;

  // Check Scapegoat before bankruptcy
  if (!hasRule('abyssal_pact') && hasRule('scapegoat')) {
    const endangered = Object.entries(player.parameters).find(([, v]) => v <= bankruptcyLimit);
    if (endangered) {
      const [paramName] = endangered;
      const scapegoatCard = rules.find((r) => r.ruleId === 'scapegoat')!;
      next = {
        ...next,
        players: {
          ...next.players,
          [playerId]: {
            ...player,
            parameters: {
              ...player.parameters,
              [paramName]: 0,
            },
            rules: rules.filter((r) => r.id !== scapegoatCard.id),
          },
        },
        mainSecondaryStack: [...next.mainSecondaryStack, scapegoatCard],
      };
      next = appendLog(
        next,
        player.name,
        `🛡️ [전가] 발동! '${paramName}' 파산 위기를 0으로 초기화하고 카드가 파괴되었습니다.`,
        'rule'
      );
    }
  }

  const currentParams = next.players[playerId].parameters;
  const values = Object.values(currentParams);
  const sum = values.reduce((a, b) => a + b, 0);

  // Check Abyssal Pact win
  if (hasRule('abyssal_pact')) {
    const abyssHit = Object.entries(currentParams).find(([, v]) => v <= -10);
    if (abyssHit) {
      return {
        result: 'win',
        reason: `[나락의 끝] 달성! '${abyssHit[0]}'이(가) ${abyssHit[1]}에 도달했습니다.`,
        updatedState: next,
      };
    }
  } else {
    // Check Bankruptcy Loss
    const bankruptHit = Object.entries(currentParams).find(([, v]) => v <= bankruptcyLimit);
    if (bankruptHit) {
      return {
        result: 'loss',
        reason: `${player.name} 파산! '${bankruptHit[0]}'이(가) ${bankruptHit[1]} (${bankruptcyLimit} 이하)에 도달했습니다.`,
        updatedState: next,
      };
    }
  }

  // Check Win Conditions
  if (hasRule('hyperfocus')) {
    const target = 12 + ironOffset;
    const hit = Object.entries(currentParams).find(([, v]) => v >= target);
    if (hit) {
      return {
        result: 'win',
        reason: `[초집중] 승리! '${hit[0]}'이(가) +${hit[1]} (+${target} 이상)에 도달했습니다.`,
        updatedState: next,
      };
    }
    return { result: 'none', reason: null, updatedState: next };
  }

  if (hasRule('equilibrium')) {
    const target = 5 + ironOffset;
    const count = values.filter((v) => v >= target).length;
    if (count >= 4) {
      return {
        result: 'win',
        reason: `[균형주의자] 승리! ${count}개 파라미터가 +${target} 이상에 도달했습니다.`,
        updatedState: next,
      };
    }
    return { result: 'none', reason: null, updatedState: next };
  }

  // Standard Win Conditions
  const singleTarget = 15 + ironOffset;
  const singleHit = Object.entries(currentParams).find(([, v]) => v >= singleTarget);
  if (singleHit && !hasRule('abyssal_pact')) {
    return {
      result: 'win',
      reason: `단일 파라미터 승리! '${singleHit[0]}'이(가) +${singleHit[1]} (+${singleTarget} 이상)에 도달했습니다.`,
      updatedState: next,
    };
  }

  const tripleTarget = 8 + ironOffset;
  const tripleCount = values.filter((v) => v >= tripleTarget).length;
  if (tripleCount >= 3) {
    return {
      result: 'win',
      reason: `다중 파라미터 승리! ${tripleCount}개 파라미터가 +${tripleTarget} 이상에 도달했습니다.`,
      updatedState: next,
    };
  }

  const sumTarget = 25 + ironOffset;
  if (sum >= sumTarget) {
    return {
      result: 'win',
      reason: `총합 승리! 모든 파라미터 총합이 +${sum} (+${sumTarget} 이상)에 도달했습니다.`,
      updatedState: next,
    };
  }

  return { result: 'none', reason: null, updatedState: next };
}

export function endTurn(state: GameState): GameState {
  if (state.phase === 'game_over') return state;

  // Return any remaining activeMainCard and all drawnDice to secondary stacks
  const leftoverMain = state.activeMainCard ? [state.activeMainCard] : [];
  let next: GameState = {
    ...state,
    mainSecondaryStack: [...state.mainSecondaryStack, ...leftoverMain],
    diceSecondaryStack: [...state.diceSecondaryStack, ...state.drawnDice],
    drawnMainCards: [],
    activeMainCard: null,
    drawnDice: [],
    usedDiceIds: [],
    combination: null,
    timeBombResolvedThisTurn: false,
    equivalentExchangeUsed: false,
    equivalentExchangeBonus: 0,
    signFlipActiveThisTurn: false,
  };

  if (state.combination) {
    next = appendLog(next, '시스템', '턴 종료: 상태공간 조합이 해제되어 원래 상태로 복귀합니다.', 'combo');
  }

  // Evaluate active player first, then opponent
  const activeId = state.activePlayer;
  const oppId = getOpponent(activeId);

  if (hasPlayerRule(next, activeId, 'debt_repayment')) {
    const entries = Object.entries(next.players[activeId].parameters).sort((a, b) => b[1] - a[1]);
    const highest = entries[0][0];
    next = {
      ...next,
      players: {
        ...next.players,
        [activeId]: {
          ...next.players[activeId],
          parameters: {
            ...next.players[activeId].parameters,
            [highest]: next.players[activeId].parameters[highest] - 1,
          },
        },
      },
    };
    next = appendLog(
      next,
      next.players[activeId].name,
      `💸 [부채 상환] 턴 종료 페널티로 '${highest}'이(가) -1 감소했습니다.`,
      'warn'
    );
  }

  const activeEval = evaluatePlayerEndState(next, activeId);
  next = activeEval.updatedState;
  if (activeEval.result === 'win') {
    next = appendLog(next, next.players[activeId].name, `🏆 ${activeEval.reason}`, 'win');
    return { ...next, phase: 'game_over', winner: activeId, winReason: activeEval.reason };
  }
  if (activeEval.result === 'loss') {
    next = appendLog(next, next.players[activeId].name, `💀 ${activeEval.reason}`, 'win');
    return { ...next, phase: 'game_over', winner: oppId, winReason: activeEval.reason };
  }

  const oppEval = evaluatePlayerEndState(next, oppId);
  next = oppEval.updatedState;
  if (oppEval.result === 'win') {
    next = appendLog(next, next.players[oppId].name, `🏆 ${oppEval.reason}`, 'win');
    return { ...next, phase: 'game_over', winner: oppId, winReason: oppEval.reason };
  }
  if (oppEval.result === 'loss') {
    next = appendLog(next, next.players[oppId].name, `💀 ${oppEval.reason}`, 'win');
    return { ...next, phase: 'game_over', winner: activeId, winReason: oppEval.reason };
  }

  return {
    ...next,
    activePlayer: oppId,
    turnNumber: oppId === 'p1' ? next.turnNumber + 1 : next.turnNumber,
    phase: 'ready_to_draw',
  };
}

/**
 * Performs one tactical AI step for the current phase.
 * Returns the updated state so the UI can animate AI turns step-by-step.
 */
export function runAIStep(state: GameState): GameState {
  if (state.phase === 'game_over') return state;
  const aiId = state.activePlayer;
  if (!state.players[aiId].isAI) return state;

  switch (state.phase) {
    case 'ready_to_draw':
      return drawTurnCards(state);

    case 'choose_overclock_card': {
      // Prefer '+' parameter cards or non-time_bomb rule cards
      const sorted = [...state.drawnMainCards].sort((a, b) => {
        const score = (c: MainCard) =>
          c.kind === 'parameter' ? (c.sign === '+' ? 3 : 0) : c.ruleId === 'time_bomb' ? -2 : 2;
        return score(b) - score(a);
      });
      return chooseOverclockCard(state, sorted[0].id);
    }

    case 'resolve_conflict': {
      const pair = state.conflictingRulePair!;
      const keepIncoming = pair.incoming.ruleId !== 'time_bomb';
      return resolveRuleConflict(state, keepIncoming ? 'incoming' : 'existing');
    }

    case 'resolve_action': {
      const unusedDice = state.drawnDice.filter((d) => !state.usedDiceIds.includes(d.id));
      if (hasEffectiveRule(state, 'time_bomb') && !state.timeBombResolvedThisTurn && unusedDice.length > 0) {
        const sortedAsc = [...unusedDice].sort(
          (a, b) => getEffectiveDieValue(state, a.value) - getEffectiveDieValue(state, b.value)
        );
        return applyDieToTimeBomb(state, sortedAsc[0].id);
      }

      if (
        state.difficulty >= 7.1 &&
        hasEffectiveRule(state, 'debt_repayment') &&
        unusedDice.some((d) => getEffectiveDieValue(state, d.value) >= 6)
      ) {
        const sixDie = unusedDice.find((d) => getEffectiveDieValue(state, d.value) >= 6)!;
        return dismissDebtRepayment(state, sixDie.id);
      }

      if (state.activeMainCard?.kind === 'parameter' && unusedDice.length > 0) {
        const card = state.activeMainCard;
        const paramOwner = getEffectiveParamOwner(state);
        const targetingSelf = paramOwner === aiId;

        if (
          state.difficulty >= 7.1 &&
          hasEffectiveRule(state, 'sign_flip') &&
          !state.signFlipActiveThisTurn &&
          ((targetingSelf && card.sign === '-') || (!targetingSelf && card.sign === '+'))
        ) {
          return toggleSignFlip(state);
        }

        const effectiveSign =
          state.signFlipActiveThisTurn && hasEffectiveRule(state, 'sign_flip')
            ? card.sign === '+'
              ? '-'
              : '+'
            : card.sign;
        const wantHigh =
          (targetingSelf && effectiveSign === '+') || (!targetingSelf && effectiveSign === '-');

        // Check Twin Synergy double
        if (hasEffectiveRule(state, 'twin_synergy') && wantHigh) {
          for (let i = 0; i < unusedDice.length; i++) {
            for (let j = i + 1; j < unusedDice.length; j++) {
              if (unusedDice[i].value === unusedDice[j].value) {
                return applyDieToParameter(state, [unusedDice[i].id, unusedDice[j].id]);
              }
            }
          }
        }

        const sorted = [...unusedDice].sort(
          (a, b) => getEffectiveDieValue(state, a.value) - getEffectiveDieValue(state, b.value)
        );
        // Low difficulty AI occasionally picks suboptimal die
        if (state.difficulty <= 2.5 && sorted.length > 1 && Math.random() < 0.3) {
          const suboptimal = wantHigh ? sorted[0] : sorted[sorted.length - 1];
          return applyDieToParameter(state, [suboptimal.id]);
        }
        const chosenDie = wantHigh ? sorted[sorted.length - 1] : sorted[0];
        return applyDieToParameter(state, [chosenDie.id]);
      }

      return endTurn(state);
    }

    case 'turn_end_ready':
      return endTurn(state);

    default:
      return state;
  }
}
