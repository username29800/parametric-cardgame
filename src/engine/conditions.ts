import type { RuleCard, RuleId } from '../types/game.ts';

/**
 * 플레이어의 규칙 상태공간에서 실제로 적용되는 승리·패배 조건.
 * 엔진의 턴 종료 판정과 UI 상태 디스플레이가 같은 계산을 사용한다.
 */
export interface ConditionStatus {
  id: string;
  label: string;
  /** 조건을 정의한 카드 이름 ('모드 카드' 또는 룰 카드 이름) */
  source: string;
  met: boolean;
  progress: string;
  reason: string;
}

export interface PlayerConditions {
  wins: ConditionStatus[];
  /** null이면 파산 패배가 없음 (나락의 끝) */
  loss: ConditionStatus | null;
  bankruptcyLimit: number | null;
  notes: string[];
}

const MOD_CARD = '모드 카드';

function fmt(v: number): string {
  return v > 0 ? `+${v}` : `${v}`;
}

export function getBankruptcyLimit(rules: RuleCard[]): number {
  const has = (id: RuleId) => rules.some((r) => r.ruleId === id);
  return has('glass_cannon') ? -8 : has('iron_will') ? -18 : -12;
}

export function getPlayerConditions(
  rules: RuleCard[],
  params: Record<string, number>,
  playerName: string
): PlayerConditions {
  const has = (id: RuleId) => rules.some((r) => r.ruleId === id);
  const entries = Object.entries(params);
  const values = entries.map(([, v]) => v);
  const sum = values.reduce((a, b) => a + b, 0);
  const maxEntry = entries.reduce((a, b) => (b[1] > a[1] ? b : a), entries[0] ?? ['-', 0]);
  const minEntry = entries.reduce((a, b) => (b[1] < a[1] ? b : a), entries[0] ?? ['-', 0]);
  const ironOffset = has('iron_will') ? 3 : 0;
  const notes: string[] = [];
  if (ironOffset) notes.push('[강철 멘탈] 모든 승리 목표 +3');
  if (has('glass_cannon')) notes.push('[유리대포] + 증가량 +2');

  let loss: ConditionStatus | null = null;
  let bankruptcyLimit: number | null = null;
  if (!has('abyssal_pact')) {
    const limit = getBankruptcyLimit(rules);
    bankruptcyLimit = limit;
    const hit = entries.find(([, v]) => v <= limit);
    loss = {
      id: 'bankruptcy',
      label: `단일 파라미터 ${limit} 이하 → 파산`,
      source: has('glass_cannon') ? '유리대포' : has('iron_will') ? '강철 멘탈' : MOD_CARD,
      met: Boolean(hit),
      progress: `최저 ${minEntry[0]} ${fmt(minEntry[1])}`,
      reason: hit
        ? `${playerName} 파산! '${hit[0]}'이(가) ${hit[1]} (${limit} 이하)에 도달했습니다.`
        : '',
    };
  }

  const wins: ConditionStatus[] = [];

  if (has('abyssal_pact')) {
    const hit = entries.find(([, v]) => v <= -10);
    wins.push({
      id: 'abyss',
      label: '단일 파라미터 -10 이하 → 승리',
      source: '나락의 끝',
      met: Boolean(hit),
      progress: `최저 ${minEntry[0]} ${fmt(minEntry[1])}`,
      reason: hit ? `[나락의 끝] 달성! '${hit[0]}'이(가) ${hit[1]}에 도달했습니다.` : '',
    });
  }

  if (has('hyperfocus')) {
    const target = 12 + ironOffset;
    const hit = entries.find(([, v]) => v >= target);
    wins.push({
      id: 'hyperfocus',
      label: `단일 파라미터 +${target} 이상 (다른 승리 조건 비활성)`,
      source: '초집중',
      met: Boolean(hit),
      progress: `최고 ${maxEntry[0]} ${fmt(maxEntry[1])}`,
      reason: hit ? `[초집중] 승리! '${hit[0]}'이(가) +${hit[1]} (+${target} 이상)에 도달했습니다.` : '',
    });
  } else if (has('equilibrium')) {
    const target = 5 + ironOffset;
    const count = values.filter((v) => v >= target).length;
    wins.push({
      id: 'equilibrium',
      label: `서로 다른 4개 파라미터 +${target} 이상`,
      source: '균형주의자',
      met: count >= 4,
      progress: `${count} / 4종`,
      reason: `[균형주의자] 승리! ${count}개 파라미터가 +${target} 이상에 도달했습니다.`,
    });
  } else {
    if (!has('abyssal_pact')) {
      const target = 15 + ironOffset;
      const hit = entries.find(([, v]) => v >= target);
      wins.push({
        id: 'single',
        label: `단일 파라미터 +${target} 이상`,
        source: MOD_CARD,
        met: Boolean(hit),
        progress: `최고 ${maxEntry[0]} ${fmt(maxEntry[1])}`,
        reason: hit
          ? `단일 파라미터 승리! '${hit[0]}'이(가) +${hit[1]} (+${target} 이상)에 도달했습니다.`
          : '',
      });
    }

    const tripleTarget = 8 + ironOffset;
    const tripleCount = values.filter((v) => v >= tripleTarget).length;
    wins.push({
      id: 'triple',
      label: `서로 다른 3개 파라미터 +${tripleTarget} 이상`,
      source: MOD_CARD,
      met: tripleCount >= 3,
      progress: `${tripleCount} / 3종`,
      reason: `다중 파라미터 승리! ${tripleCount}개 파라미터가 +${tripleTarget} 이상에 도달했습니다.`,
    });

    const sumTarget = 25 + ironOffset;
    wins.push({
      id: 'sum',
      label: `모든 파라미터 총합 +${sumTarget} 이상`,
      source: MOD_CARD,
      met: sum >= sumTarget,
      progress: `총합 ${fmt(sum)}`,
      reason: `총합 승리! 모든 파라미터 총합이 +${sum} (+${sumTarget} 이상)에 도달했습니다.`,
    });
  }

  return { wins, loss, bankruptcyLimit, notes };
}
