import type { KeyboardEvent, ReactNode } from 'react';
import type { DiceCard, ParameterCard, RuleCard, RuleDomain } from '../types/game.ts';

export type CardTone = 'param-plus' | 'param-minus' | 'rule' | 'dice';
export type CardHighlight = 'manual' | 'forced' | 'selectable' | 'selected' | null;
export type CardSize = 'sm' | 'md' | 'lg';

/** 카드 한 장을 그리기 위한 표시 정보: 배경 영역(mark) · 제목 영역 · 설명 영역 */
export interface CardView {
  key: string;
  tone: CardTone;
  domain?: RuleDomain;
  eyebrow: string;
  title: string;
  mark: string;
  dieValue?: number;
  description: string;
  badge?: string;
  details?: string[];
}

const DOMAIN_MARK: Record<RuleDomain, string> = {
  상태공간: '⇄',
  승리조건: '★',
  패배조건: '☠',
  드로우: '⇣',
  주사위: '⚄',
  연산: '±',
  '특수/감응형': '✦',
};

const DOMAIN_CLASS: Record<RuleDomain, string> = {
  상태공간: 'd-space',
  승리조건: 'd-win',
  패배조건: 'd-loss',
  드로우: 'd-draw',
  주사위: 'd-dice',
  연산: 'd-calc',
  '특수/감응형': 'd-special',
};

export function viewParamCard(card: ParameterCard, effectiveSign: '+' | '-' = card.sign): CardView {
  const flipped = effectiveSign !== card.sign;
  return {
    key: card.id,
    tone: effectiveSign === '+' ? 'param-plus' : 'param-minus',
    eyebrow: '파라미터 카드',
    title: `${card.paramName} ${effectiveSign}${flipped ? ' (반전)' : ''}`,
    mark: effectiveSign === '+' ? '+' : '−',
    description: card.flavor,
    details: [
      `파라미터: ${card.paramName}`,
      `부호: ${card.sign}${flipped ? ` → ${effectiveSign} (부호 반전 적용)` : ''}`,
      '주사위 카드 1장을 골라 그 눈만큼 부호에 따라 증감합니다.',
    ],
  };
}

export function viewRuleCard(card: RuleCard): CardView {
  return {
    key: card.id,
    tone: 'rule',
    domain: card.domain,
    eyebrow: `룰 카드 · ${card.domain}`,
    title: card.name,
    mark: DOMAIN_MARK[card.domain],
    description: card.description,
    badge: card.counterValue !== undefined ? `${card.counterLabel} ${card.counterValue}` : undefined,
    details: [
      `${card.name} (${card.englishName})`,
      `영역: ${card.domain}`,
      `주사위 감응성: ${card.sensitivity}`,
      card.isInstant ? '즉발 카드 (사용 후 세컨더리 스택으로)' : '유지 카드',
    ],
  };
}

export function viewDie(die: DiceCard, effectiveValue: number): CardView {
  const transformed = effectiveValue !== die.value;
  return {
    key: die.id,
    tone: 'dice',
    eyebrow: '주사위 카드',
    title: `주사위 ${effectiveValue}`,
    mark: String(effectiveValue),
    dieValue: effectiveValue,
    description: transformed
      ? `원래 눈 ${die.value} → 룰 카드 효과로 ${effectiveValue}로 취급`
      : `눈 ${die.value}. 파라미터 카드나 감응형 룰 카드에 적용합니다.`,
    details: [`원래 눈: ${die.value}`, `적용 눈: ${effectiveValue}`],
  };
}

const PIP_LAYOUT: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DiePips({ value }: { value: number }) {
  const pips = PIP_LAYOUT[value] ?? [];
  return (
    <div className="die-face">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={pips.includes(i) ? 'pip on' : 'pip'} />
      ))}
    </div>
  );
}

interface GameCardProps {
  view: CardView;
  size?: CardSize;
  highlight?: CardHighlight;
  dimmed?: boolean;
  onSelect?: () => void;
  onZoom?: () => void;
  hint?: ReactNode;
  selectLabel?: string;
}

export function GameCard({
  view,
  size = 'md',
  highlight = null,
  dimmed = false,
  onSelect,
  onZoom,
  hint,
  selectLabel,
}: GameCardProps) {
  const classes = [
    'gcard',
    `gcard-${size}`,
    `tone-${view.tone}`,
    view.domain ? DOMAIN_CLASS[view.domain] : '',
    highlight ? `hl-${highlight}` : '',
    dimmed ? 'is-dimmed' : '',
    onSelect ? 'is-selectable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onSelect) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div className="gcard-wrap">
      <div
        className={classes}
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        aria-label={onSelect ? selectLabel ?? `${view.title} 선택` : undefined}
        onClick={onSelect}
        onKeyDown={handleKey}
      >
        <div className="gcard-bg" aria-hidden="true">
          {view.tone === 'dice' && view.dieValue ? (
            <DiePips value={view.dieValue} />
          ) : (
            <span className="gcard-mark">{view.mark}</span>
          )}
        </div>
        <div className="gcard-title">
          <span className="gcard-eyebrow">{view.eyebrow}</span>
          <strong>{view.title}</strong>
          {view.badge && <span className="gcard-badge">{view.badge}</span>}
        </div>
        <button
          type="button"
          className="gcard-desc"
          title="설명을 클릭하면 카드를 확대합니다"
          onClick={(e) => {
            e.stopPropagation();
            onZoom?.();
          }}
          tabIndex={onZoom ? 0 : -1}
        >
          {view.description}
        </button>
      </div>
      {hint && <div className={`gcard-hint ${highlight ? `hint-${highlight}` : ''}`}>{hint}</div>}
    </div>
  );
}

/** 뒤집힌 카드 (스택용) */
export function CardBack({ kind, size = 'md' }: { kind: 'main' | 'dice'; size?: CardSize }) {
  return (
    <div className={`gcard gcard-${size} card-back back-${kind}`} aria-hidden="true">
      <div className="back-emblem">{kind === 'main' ? 'P' : '⚄'}</div>
    </div>
  );
}
