import type { DifficultyProfile } from '../types/game.ts';

export function clampDifficulty(raw: number): number {
  const clamped = Math.min(10.0, Math.max(0.1, raw));
  return Math.round(clamped * 10) / 10;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpWeights(
  w1: [number, number, number, number, number, number],
  w2: [number, number, number, number, number, number],
  t: number
): [number, number, number, number, number, number] {
  return [
    lerp(w1[0], w2[0], t),
    lerp(w1[1], w2[1], t),
    lerp(w1[2], w2[2], t),
    lerp(w1[3], w2[3], t),
    lerp(w1[4], w2[4], t),
    lerp(w1[5], w2[5], t),
  ];
}

export function getDifficultyProfile(rawDifficulty: number): DifficultyProfile {
  const d = clampDifficulty(rawDifficulty);

  const wLow: [number, number, number, number, number, number] = [1.3, 1.2, 1.1, 0.9, 0.8, 0.7];
  const wEven: [number, number, number, number, number, number] = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  const wHigh: [number, number, number, number, number, number] = [0.5, 0.6, 0.8, 1.2, 1.4, 1.5];
  const wExtreme: [number, number, number, number, number, number] = [1.3, 0.85, 0.9, 0.9, 0.85, 1.2];

  let paramMinusProb: number;
  let diceWeights: [number, number, number, number, number, number];
  let ruleCount: number;
  let hazardShare: number;
  let phase: 'phase1' | 'phase2';
  let phaseLabel: string;
  let phaseDescription: string;

  if (d <= 5.0) {
    phase = 'phase1';
    phaseLabel = 'Phase I: 변동성 증폭 구간 (0.1 ~ 5.0)';
    phaseDescription =
      '난이도가 오를수록 음수(-) 파라미터 확률과 주사위 고눈(5~6) 확률이 동시에 상승하는 하이리스크·하이리턴 구간입니다.';

    if (d <= 3.5) {
      const t = (d - 0.1) / 3.4;
      paramMinusProb = lerp(0.25, 0.5, t);
      diceWeights = lerpWeights(wLow, wEven, t);
    } else {
      const t = (d - 3.5) / 1.5;
      paramMinusProb = lerp(0.5, 0.65, t);
      diceWeights = lerpWeights(wEven, wHigh, t);
    }

    ruleCount = 12;
    hazardShare = 0.15;
  } else {
    phase = 'phase2';
    phaseLabel = 'Phase II: 규칙 압박 구간 (5.1 ~ 10.0)';
    phaseDescription =
      '파라미터 부호 확률은 표준(3.5)으로 회귀하지만, 시한폭탄·부채 상환 등 불리한 압박형 룰 카드의 출현율이 급증합니다.';

    // Reverts to 3.5 standard (50% : 50%)
    paramMinusProb = 0.5;

    if (d < 8.0) {
      diceWeights = [...wEven];
    } else {
      const tExt = (d - 8.0) / 2.0;
      diceWeights = lerpWeights(wEven, wExtreme, tExt);
    }

    const t2 = (d - 5.0) / 5.0; // (0, 1]
    ruleCount = Math.round(lerp(12, 16, t2));
    hazardShare = Math.min(0.72, 0.23 + 0.47 * Math.pow(t2, 1.3));
  }

  const totalWeight = diceWeights.reduce((acc, w) => acc + w, 0);
  const diceExpectedValue =
    diceWeights.reduce((acc, w, idx) => acc + w * (idx + 1), 0) / totalWeight;
  const diceHighProb = (diceWeights[4] + diceWeights[5]) / totalWeight;

  return {
    difficulty: d,
    phase,
    phaseLabel,
    phaseDescription,
    paramPlusProb: Math.round((1 - paramMinusProb) * 1000) / 1000,
    paramMinusProb: Math.round(paramMinusProb * 1000) / 1000,
    diceWeights,
    diceExpectedValue: Math.round(diceExpectedValue * 100) / 100,
    diceHighProb: Math.round(diceHighProb * 1000) / 1000,
    ruleCount,
    hazardShare: Math.round(hazardShare * 1000) / 1000,
  };
}
