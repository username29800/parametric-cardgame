import { getDifficultyProfile } from '../engine/difficulty.ts';
import type { DiceCard, MainCard, ParameterCard, RuleCard } from '../types/game.ts';

export const STARTER_PARAMETERS = [
  '카페인',
  '자존감',
  '배터리',
  '집중력',
  '적금',
  '월세',
  '흑역사',
] as const;

interface ParamSpec {
  name: string;
  plusFlavor: string;
  minusFlavor: string;
}

const PARAM_SPECS: ParamSpec[] = [
  {
    name: '카페인',
    plusFlavor: '아이스 아메리카노 한 잔의 기적.',
    minusFlavor: '카페인 쇼크 / 금단 현상.',
  },
  {
    name: '자존감',
    plusFlavor: '"오늘 나 좀 괜찮은데?"',
    minusFlavor: '남과 비교하기 시작했다.',
  },
  {
    name: '배터리',
    plusFlavor: '고속 충전 100% 완료!',
    minusFlavor: '1% 남았는데 충전기가 없다.',
  },
  {
    name: '집중력',
    plusFlavor: '몰입의 경지(Flow)에 도달했다.',
    minusFlavor: '알림이 17개 연속으로 울렸다.',
  },
  {
    name: '적금',
    plusFlavor: '만기 해지의 기쁨!',
    minusFlavor: '중도 해지의 유혹에 흔들렸다.',
  },
  {
    name: '월세',
    plusFlavor: '보증금 이자 환급!',
    minusFlavor: '월세 내는 날이 돌아왔다.',
  },
  {
    name: '흑역사',
    plusFlavor: '이불킥을 극적으로 참아냈다.',
    minusFlavor: '새벽 2시 감성 SNS 업로드.',
  },
];

export const RULE_TEMPLATES: Omit<RuleCard, 'id'>[] = [
  {
    kind: 'rule',
    ruleId: 'invasion',
    name: '침공',
    englishName: 'Invasion',
    domain: '상태공간',
    sensitivity: '없음',
    tier: 'tactical',
    isInstant: true,
    description:
      '즉발: 이번 턴 동안 자신의 규칙 상태공간 + 상대의 파라미터 상태공간을 조합해 턴을 진행합니다. (방화벽 보유 시 무효)',
  },
  {
    kind: 'rule',
    ruleId: 'inversion',
    name: '역전',
    englishName: 'Inversion',
    domain: '상태공간',
    sensitivity: '없음',
    tier: 'tactical',
    isInstant: true,
    description:
      '즉발: 이번 턴 동안 상대의 규칙 상태공간 + 자신의 파라미터 상태공간을 조합해 턴을 진행합니다.',
  },
  {
    kind: 'rule',
    ruleId: 'puppeteer',
    name: '인형술사',
    englishName: 'Puppeteer',
    domain: '상태공간',
    sensitivity: '없음',
    tier: 'tactical',
    isInstant: true,
    description:
      '즉발: 이번 턴 동안 상대의 규칙 상태공간 + 상대의 파라미터 상태공간을 조합해 턴을 진행합니다.',
  },
  {
    kind: 'rule',
    ruleId: 'firewall',
    name: '방화벽',
    englishName: 'Firewall',
    domain: '상태공간',
    sensitivity: '없음',
    tier: 'beneficial',
    description:
      '유지: 상대의 [상태공간] 조합 카드(침공/인형술사)로부터 자신의 파라미터 상태공간을 보호합니다.',
  },
  {
    kind: 'rule',
    ruleId: 'hyperfocus',
    name: '초집중',
    englishName: 'Hyperfocus',
    domain: '승리조건',
    sensitivity: '없음',
    tier: 'tactical',
    description:
      '승리 조건 변경: 단일 파라미터 +12 이상 달성 시 즉시 승리! (단, 다른 기본 승리 조건은 비활성화됩니다.)',
  },
  {
    kind: 'rule',
    ruleId: 'equilibrium',
    name: '균형주의자',
    englishName: 'Equilibrium',
    domain: '승리조건',
    sensitivity: '없음',
    tier: 'tactical',
    description:
      '승리 조건 변경: 서로 다른 4개의 파라미터가 동시에 +5 이상이 되면 승리합니다.',
  },
  {
    kind: 'rule',
    ruleId: 'abyssal_pact',
    name: '나락의 끝',
    englishName: 'Abyssal Pact',
    domain: '승리조건',
    sensitivity: '없음',
    tier: 'tactical',
    description:
      '승리 조건 변경: 단일 파라미터 -10 이하 도달 시 파산하지 않고 오히려 승리합니다! (+15 승리 조건 비활성화)',
  },
  {
    kind: 'rule',
    ruleId: 'glass_cannon',
    name: '유리대포',
    englishName: 'Glass Cannon',
    domain: '패배조건',
    sensitivity: '없음',
    tier: 'hazard',
    description:
      '파산 기준이 -8 이하로 엄격해지는 대신, 자신의 모든 + 파라미터 증가량에 +2 보너스를 얻습니다.',
  },
  {
    kind: 'rule',
    ruleId: 'iron_will',
    name: '강철 멘탈',
    englishName: 'Iron Will',
    domain: '패배조건',
    sensitivity: '없음',
    tier: 'beneficial',
    description:
      '파산 기준이 -18 이하로 완화됩니다. 단, 모든 승리 목표 수치가 +3 증가합니다.',
  },
  {
    kind: 'rule',
    ruleId: 'scapegoat',
    name: '전가',
    englishName: 'Scapegoat',
    domain: '패배조건',
    sensitivity: '선택',
    tier: 'beneficial',
    description:
      '턴 종료 시 파산 위기(-12 이하)에 처하면 자동으로 발동해 해당 파라미터를 0으로 복구하고 이 카드를 파괴합니다.',
  },
  {
    kind: 'rule',
    ruleId: 'overclock',
    name: '과부하',
    englishName: 'Overclock',
    domain: '드로우',
    sensitivity: '없음',
    tier: 'beneficial',
    description:
      '매 턴 메인 스택에서 카드를 2장 드로우하여 1장을 선택해 적용하고, 나머지 1장은 세컨더리 스택으로 보냅니다.',
  },
  {
    kind: 'rule',
    ruleId: 'loaded_hand',
    name: '주사위 풍년',
    englishName: 'Loaded Hand',
    domain: '드로우',
    sensitivity: '없음',
    tier: 'beneficial',
    description: '매 턴 주사위 카드를 3장 드로우합니다. (이 중 1장을 선택해 적용)',
  },
  {
    kind: 'rule',
    ruleId: 'rule_lock',
    name: '규칙 잠금',
    englishName: 'Rule Lock',
    domain: '드로우',
    sensitivity: '없음',
    tier: 'hazard',
    description:
      '압박 룰: 룰 카드를 배치할 때마다 자신의 가장 낮은 파라미터가 -2 감소합니다.',
  },
  {
    kind: 'rule',
    ruleId: 'twin_synergy',
    name: '쌍둥이 시너지',
    englishName: 'Twin Synergy',
    domain: '주사위',
    sensitivity: '없음',
    tier: 'tactical',
    description:
      '드로우한 주사위 카드 중 같은 숫자가 2장 이상 있으면(더블), 두 눈을 합산하여 적용합니다!',
  },
  {
    kind: 'rule',
    ruleId: 'extremist',
    name: '극단주의',
    englishName: 'Extremist',
    domain: '주사위',
    sensitivity: '없음',
    tier: 'hazard',
    description: '주사위 눈 1은 6으로, 2는 5로 취급합니다. 단, 3과 4는 모두 1로 취급합니다.',
  },
  {
    kind: 'rule',
    ruleId: 'safety_first',
    name: '안전제일',
    englishName: 'Safety First',
    domain: '주사위',
    sensitivity: '없음',
    tier: 'beneficial',
    description: '주사위를 적용할 때 원한다면 눈을 3으로 고정해 적용할 수 있습니다.',
  },
  {
    kind: 'rule',
    ruleId: 'amplifier',
    name: '증폭기',
    englishName: 'Amplifier',
    domain: '연산',
    sensitivity: '없음',
    tier: 'hazard',
    description: '파라미터가 증가(+)할 때 +2를 추가로 얻지만, 감소(-)할 때도 -1을 추가로 잃습니다.',
  },
  {
    kind: 'rule',
    ruleId: 'sign_flip',
    name: '부호 반전',
    englishName: 'Sign Flip',
    domain: '연산',
    sensitivity: '없음',
    tier: 'tactical',
    description: '해결 단계에서 파라미터 카드의 부호(+/-)를 반대로 뒤집어 적용할 수 있습니다.',
  },
  {
    kind: 'rule',
    ruleId: 'equivalent_exchange',
    name: '등가교환',
    englishName: 'Equivalent Exchange',
    domain: '연산',
    sensitivity: '선택',
    tier: 'tactical',
    description:
      '턴당 1회: 자신의 다른 파라미터 1개를 -3 시키면, 이번 주사위 적용 수치에 +3 보너스를 더합니다.',
  },
  {
    kind: 'rule',
    ruleId: 'time_bomb',
    name: '시한폭탄',
    englishName: 'Time Bomb',
    domain: '특수/감응형',
    sensitivity: '필수',
    tier: 'hazard',
    counterValue: 10,
    counterLabel: '폭탄 수치',
    description:
      '특수 파라미터 [폭탄 수치: 10]. 매 턴 주사위 1장을 반드시 이 카드에 할당해 수치를 감소시켜야 합니다. 0이 되면 파괴되며 모든 파라미터가 -3 됩니다.',
  },
  {
    kind: 'rule',
    ruleId: 'rule_eater',
    name: '룰 포식자',
    englishName: 'Rule Eater',
    domain: '특수/감응형',
    sensitivity: '선택',
    tier: 'tactical',
    counterValue: 0,
    counterLabel: '포식 수치',
    description:
      '특수 파라미터 [포식 수치: 0]. 룰 카드가 충돌로 버려질 때마다 +4 증가. 12 이상이 되면 가장 낮은 파라미터를 +8 시키고 파괴됩니다.',
  },
  {
    kind: 'rule',
    ruleId: 'debt_repayment',
    name: '부채 상환',
    englishName: 'Debt Repayment',
    domain: '특수/감응형',
    sensitivity: '선택',
    tier: 'hazard',
    description:
      '압박 룰: 매 턴 종료 시 자신의 가장 높은 파라미터가 -1 감소합니다. 주사위 눈 6을 할당하면 해제됩니다.',
  },
];

function pickWeightedIndex(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

export function createStarterMainDeck(difficulty = 3.5): MainCard[] {
  const profile = getDifficultyProfile(difficulty);
  const totalDeckSize = 40;
  const ruleCount = profile.ruleCount;
  const paramCount = totalDeckSize - ruleCount;

  const cards: MainCard[] = [];
  let seq = 1;

  // Build parameter cards evenly across the 7 parameter types, with +/- ratio from profile
  const minusTarget = Math.round(paramCount * profile.paramMinusProb);
  const signs: ('+' | '-')[] = [
    ...Array(minusTarget).fill('-'),
    ...Array(paramCount - minusTarget).fill('+'),
  ];
  const shuffledSigns = shuffle(signs);

  for (let i = 0; i < paramCount; i++) {
    const spec = PARAM_SPECS[i % PARAM_SPECS.length];
    const sign = shuffledSigns[i];
    const card: ParameterCard = {
      id: `param-${seq++}`,
      kind: 'parameter',
      paramName: spec.name,
      sign,
      flavor: sign === '+' ? spec.plusFlavor : spec.minusFlavor,
    };
    cards.push(card);
  }

  // Build rule cards according to hazardShare
  const hazardPool = RULE_TEMPLATES.filter((r) => r.tier === 'hazard');
  const nonHazardPool = RULE_TEMPLATES.filter((r) => r.tier !== 'hazard');

  const hazardCount = Math.round(ruleCount * profile.hazardShare);
  const nonHazardCount = ruleCount - hazardCount;

  const shuffledHazard = shuffle(hazardPool);
  const shuffledNonHazard = shuffle(nonHazardPool);

  for (let i = 0; i < hazardCount; i++) {
    const tpl = shuffledHazard[i % shuffledHazard.length];
    cards.push({ ...tpl, id: `rule-${seq++}` });
  }
  for (let i = 0; i < nonHazardCount; i++) {
    const tpl = shuffledNonHazard[i % shuffledNonHazard.length];
    cards.push({ ...tpl, id: `rule-${seq++}` });
  }

  return shuffle(cards);
}

export function createDiceDeck(difficulty = 3.5): DiceCard[] {
  const profile = getDifficultyProfile(difficulty);
  const dice: DiceCard[] = [];
  const totalDice = 24;
  const values: (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6];

  // Guarantee at least 1 of each face, then sample the remaining 18 by difficulty weights
  let seq = 1;
  for (const v of values) {
    dice.push({ id: `die-${seq++}`, value: v });
  }
  for (let i = values.length; i < totalDice; i++) {
    const idx = pickWeightedIndex(profile.diceWeights);
    dice.push({ id: `die-${seq++}`, value: values[idx] });
  }

  return shuffle(dice);
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
