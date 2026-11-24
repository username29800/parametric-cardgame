import {
  activateEquivalentExchange,
  applyDieToParameter,
  applyDieToTimeBomb,
  computeParameterDelta,
  dismissDebtRepayment,
  getEffectiveDieValue,
  getEffectiveRuleOwner,
  hasEffectiveRule,
  toggleSignFlip,
} from './gameEngine.ts';
import { getBankruptcyLimit } from './conditions.ts';
import type { DiceCard, GameState, PlayerId, RuleCard } from '../types/game.ts';

// ---------------------------------------------------------------------------
// 주사위 카드
// ---------------------------------------------------------------------------

export function getUnusedDice(state: GameState): DiceCard[] {
  return state.drawnDice.filter((d) => !state.usedDiceIds.includes(d.id));
}

/** 쌍둥이 시너지가 적용되는 미사용 주사위 쌍. dieId를 주면 그 주사위를 포함한 쌍만 찾는다. */
export function findTwinPair(state: GameState, dieId?: string): [DiceCard, DiceCard] | null {
  if (!hasEffectiveRule(state, 'twin_synergy')) return null;
  const unused = getUnusedDice(state);
  for (let i = 0; i < unused.length; i++) {
    for (let j = i + 1; j < unused.length; j++) {
      if (unused[i].value !== unused[j].value) continue;
      if (dieId && unused[i].id !== dieId && unused[j].id !== dieId) continue;
      return [unused[i], unused[j]];
    }
  }
  return null;
}

export function isTimeBombPending(state: GameState): boolean {
  return (
    hasEffectiveRule(state, 'time_bomb') &&
    !state.timeBombResolvedThisTurn &&
    getUnusedDice(state).length > 0
  );
}

export type DieOptionId = 'param' | 'param_safety' | 'twin' | 'time_bomb' | 'debt';

export interface DieOption {
  id: DieOptionId;
  label: string;
  enabled: boolean;
  note?: string;
}

function fmtDelta(v: number): string {
  return v >= 0 ? `+${v}` : `${v}`;
}

/** 선택한 주사위 카드로 지금 할 수 있는 행동 목록. */
export function getDieOptions(state: GameState, dieId: string): DieOption[] {
  if (state.phase !== 'resolve_action') return [];
  const unused = getUnusedDice(state);
  const die = unused.find((d) => d.id === dieId);
  if (!die) return [];

  const options: DieOption[] = [];
  const value = getEffectiveDieValue(state, die.value);
  const bombPending = isTimeBombPending(state);
  const card = state.activeMainCard?.kind === 'parameter' ? state.activeMainCard : null;

  if (card) {
    const mustFeedBomb = bombPending && unused.length <= 1;
    const note = mustFeedBomb ? '마지막 주사위는 시한폭탄에 할당해야 합니다' : undefined;
    options.push({
      id: 'param',
      label: `[${card.paramName}]에 적용 (${fmtDelta(computeParameterDelta(state, card, value))})`,
      enabled: !mustFeedBomb,
      note,
    });
    if (hasEffectiveRule(state, 'safety_first')) {
      options.push({
        id: 'param_safety',
        label: `[안전제일] 3으로 고정해 적용 (${fmtDelta(computeParameterDelta(state, card, 3))})`,
        enabled: !mustFeedBomb,
        note,
      });
    }
    const pair = findTwinPair(state, die.id);
    if (pair) {
      const total =
        getEffectiveDieValue(state, pair[0].value) + getEffectiveDieValue(state, pair[1].value);
      const leavesBombEmpty = bombPending && unused.length <= 2;
      options.push({
        id: 'twin',
        label: `[쌍둥이 시너지] 더블 합산 적용 (${fmtDelta(computeParameterDelta(state, card, total))})`,
        enabled: !leavesBombEmpty,
        note: leavesBombEmpty ? '시한폭탄에 할당할 주사위가 남지 않습니다' : undefined,
      });
    }
  }

  if (bombPending) {
    const owner = state.players[getEffectiveRuleOwner(state)];
    const bomb = owner.rules.find((r) => r.ruleId === 'time_bomb');
    options.push({
      id: 'time_bomb',
      label: `[시한폭탄]에 할당 (폭탄 수치 ${bomb?.counterValue ?? '?'} → ${Math.max(
        0,
        (bomb?.counterValue ?? 0) - value
      )})`,
      enabled: true,
    });
  }

  if (hasEffectiveRule(state, 'debt_repayment') && value >= 6) {
    options.push({ id: 'debt', label: '[부채 상환] 주사위 6을 지불해 해제', enabled: true });
  }

  return options;
}

export function performDieOption(state: GameState, dieId: string, optionId: DieOptionId): GameState {
  const option = getDieOptions(state, dieId).find((o) => o.id === optionId);
  if (!option || !option.enabled) return state;

  switch (optionId) {
    case 'param':
      return applyDieToParameter(state, [dieId]);
    case 'param_safety':
      return applyDieToParameter(state, [dieId], { forceSafetyThree: true });
    case 'twin': {
      const pair = findTwinPair(state, dieId);
      return pair ? applyDieToParameter(state, [pair[0].id, pair[1].id]) : state;
    }
    case 'time_bomb':
      return applyDieToTimeBomb(state, dieId);
    case 'debt':
      return dismissDebtRepayment(state, dieId);
  }
}

// ---------------------------------------------------------------------------
// 룰 카드 발동 분류
// ---------------------------------------------------------------------------

/** manual: 플레이어가 직접 발동 / auto: 조건이 맞으면 자동·강제 발동 / passive: 상시 조건 변경 */
export type RuleTriggerKind = 'manual' | 'auto' | 'passive';

/**
 * ready: 이번 턴 지금 수동 발동 가능 (강조: 수동 색)
 * forced: 이번 턴 자동(강제)으로 발동·적용 중 (강조: 강제 색)
 * armed: 자동 발동 대기 (트리거 조건 미충족)
 * idle: 수동 카드지만 지금은 사용할 수 없음
 * passive: 상시 적용되는 조건 카드
 * inactive: 이번 턴에 적용되는 규칙 공간이 아님
 */
export type RuleActivationStatus = 'ready' | 'forced' | 'armed' | 'idle' | 'passive' | 'inactive';

export interface RuleActivation {
  kind: RuleTriggerKind;
  status: RuleActivationStatus;
  hint: string;
  /** 카드를 클릭해 바로 발동할 수 있는지 (등가교환은 파라미터 선택이 추가로 필요) */
  clickable: boolean;
}

function isParamResolving(state: GameState): boolean {
  return state.phase === 'resolve_action' && state.activeMainCard?.kind === 'parameter';
}

export function getRuleActivation(
  state: GameState,
  ownerId: PlayerId,
  card: RuleCard
): RuleActivation {
  const gameOver = state.phase === 'game_over';
  const isEffective = !gameOver && getEffectiveRuleOwner(state) === ownerId;
  const isOwnersTurn = !gameOver && state.activePlayer === ownerId;
  const resolving = isParamResolving(state);
  const unused = getUnusedDice(state);

  const manual = (ready: boolean, readyHint: string, idleHint: string): RuleActivation => ({
    kind: 'manual',
    status: !isEffective ? 'inactive' : ready ? 'ready' : 'idle',
    hint: isEffective && ready ? readyHint : idleHint,
    clickable: isEffective && ready,
  });
  const auto = (status: RuleActivationStatus, hint: string): RuleActivation => ({
    kind: 'auto',
    status,
    hint,
    clickable: false,
  });
  const passive = (hint: string): RuleActivation => ({
    kind: 'passive',
    status: gameOver ? 'inactive' : 'passive',
    hint,
    clickable: false,
  });

  switch (card.ruleId) {
    case 'sign_flip':
      return manual(
        resolving,
        state.signFlipActiveThisTurn ? '부호 반전 적용 중 · 클릭해 해제' : '클릭해 이번 파라미터 카드의 부호를 반전',
        '파라미터 카드를 해결할 때 발동 가능'
      );
    case 'equivalent_exchange':
      return manual(
        resolving && !state.equivalentExchangeUsed && unused.length > 0,
        '클릭 후 희생할 파라미터를 골라 +3 보너스',
        state.equivalentExchangeUsed ? '이번 턴 이미 사용함' : '파라미터 카드를 해결할 때 발동 가능'
      );
    case 'safety_first':
      return manual(
        resolving && unused.length > 0,
        '주사위를 선택해 [3 고정 적용]을 고르세요',
        '파라미터 카드를 해결할 때 발동 가능'
      );
    case 'twin_synergy':
      return manual(
        resolving && findTwinPair(state) !== null,
        '더블 발견! 클릭해 두 눈을 합산 적용',
        '같은 눈의 주사위 2장이 나오면 발동 가능'
      );
    case 'debt_repayment': {
      const canPay =
        isEffective &&
        state.phase === 'resolve_action' &&
        unused.some((d) => getEffectiveDieValue(state, d.value) >= 6);
      if (canPay) {
        return { kind: 'manual', status: 'ready', hint: '클릭해 주사위 6을 지불하고 해제', clickable: true };
      }
      return isOwnersTurn
        ? auto('forced', '턴 종료 시 가장 높은 파라미터 -1')
        : auto('armed', '소유자의 턴 종료 시 -1 페널티');
    }
    case 'time_bomb': {
      const pending = isEffective && !state.timeBombResolvedThisTurn;
      return pending
        ? auto('forced', `이번 턴 주사위 1장을 반드시 할당 (폭탄 수치 ${card.counterValue ?? 10})`)
        : auto(isEffective ? 'armed' : 'inactive', `폭탄 수치 ${card.counterValue ?? 10}`);
    }
    case 'overclock':
      return isEffective
        ? auto('forced', '메인 스택에서 2장 드로우 후 1장 선택')
        : auto('inactive', '적용 턴에 메인 카드 2장 드로우');
    case 'loaded_hand':
      return isEffective
        ? auto('forced', '주사위 카드 3장 드로우')
        : auto('inactive', '적용 턴에 주사위 3장 드로우');
    case 'extremist':
      return isEffective
        ? auto('forced', '주사위 1→6, 2→5, 3·4→1로 변환')
        : auto('inactive', '적용 턴에 주사위 눈 변환');
    case 'amplifier':
      return isEffective
        ? auto('forced', '증가 시 +2 추가, 감소 시 -1 추가')
        : auto('inactive', '적용 턴에 증감량 증폭');
    case 'glass_cannon':
      return isEffective
        ? auto('forced', '+ 증가량 +2 보너스 · 파산 기준 -8')
        : auto('armed', '파산 기준 -8');
    case 'scapegoat': {
      const limit = getBankruptcyLimit(state.players[ownerId].rules);
      const endangered = Object.values(state.players[ownerId].parameters).some((v) => v <= limit);
      if (gameOver) return auto('inactive', '파산 위기 시 자동 발동');
      return endangered
        ? auto('forced', `파산 위기! 턴 종료 시 자동 발동해 0으로 복구`)
        : auto('armed', `파라미터가 ${limit} 이하가 되면 자동 발동`);
    }
    case 'rule_lock':
      return auto(gameOver ? 'inactive' : 'armed', '룰 카드 배치 시 가장 낮은 파라미터 -2');
    case 'rule_eater':
      return auto(gameOver ? 'inactive' : 'armed', `룰 충돌로 버려질 때 +4 (포식 수치 ${card.counterValue ?? 0}/12)`);
    case 'firewall':
      return passive('상대의 침공·인형술사 차단');
    case 'hyperfocus':
    case 'equilibrium':
    case 'abyssal_pact':
    case 'iron_will':
      return passive('승패 조건 변경 · 상시 적용');
    case 'invasion':
    case 'inversion':
    case 'puppeteer':
      return auto('inactive', '즉발 카드');
  }
}

/**
 * 룰 카드를 클릭해 수동 발동한다.
 * equivalent_exchange는 희생할 파라미터 이름(sacrificeParam)이 필요하다.
 */
export function activateManualRule(
  state: GameState,
  ownerId: PlayerId,
  ruleCardId: string,
  sacrificeParam?: string
): GameState {
  const card = state.players[ownerId].rules.find((r) => r.id === ruleCardId);
  if (!card) return state;
  const activation = getRuleActivation(state, ownerId, card);
  if (!activation.clickable) return state;

  switch (card.ruleId) {
    case 'sign_flip':
      return toggleSignFlip(state);
    case 'equivalent_exchange':
      return sacrificeParam ? activateEquivalentExchange(state, sacrificeParam) : state;
    case 'twin_synergy': {
      const pair = findTwinPair(state);
      return pair ? applyDieToParameter(state, [pair[0].id, pair[1].id]) : state;
    }
    case 'debt_repayment': {
      const six = getUnusedDice(state).find((d) => getEffectiveDieValue(state, d.value) >= 6);
      return six ? dismissDebtRepayment(state, six.id) : state;
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// 상태 디스플레이용 규칙 요약
// ---------------------------------------------------------------------------

export function summarizeRules(rules: RuleCard[]): string[] {
  const has = (id: RuleCard['ruleId']) => rules.some((r) => r.ruleId === id);
  const lines: string[] = [];
  lines.push(`드로우: 메인 ${has('overclock') ? 2 : 1}장 · 주사위 ${has('loaded_hand') ? 3 : 2}장`);
  if (has('extremist')) lines.push('주사위: 1→6 · 2→5 · 3/4→1');
  if (has('safety_first')) lines.push('주사위: 3 고정 선택 가능');
  if (has('twin_synergy')) lines.push('주사위: 더블 합산');
  if (has('amplifier')) lines.push('연산: 증가 +2 / 감소 -1 추가');
  if (has('glass_cannon')) lines.push('연산: + 증가량 +2');
  if (has('sign_flip')) lines.push('연산: 부호 반전 가능');
  if (has('equivalent_exchange')) lines.push('연산: 등가교환 (-3 → +3)');
  if (has('firewall')) lines.push('방어: 침공·인형술사 차단');
  if (has('scapegoat')) lines.push('방어: 파산 시 1회 복구');
  const bomb = rules.find((r) => r.ruleId === 'time_bomb');
  if (bomb) lines.push(`압박: 시한폭탄 ${bomb.counterValue ?? 10}`);
  if (has('debt_repayment')) lines.push('압박: 턴 종료 시 최고 파라미터 -1');
  if (has('rule_lock')) lines.push('압박: 룰 배치 시 최저 파라미터 -2');
  return lines;
}
