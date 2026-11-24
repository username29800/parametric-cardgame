import type { DragEvent, ReactNode } from 'react';
import { canPlayerDraw, type DrawSource } from '../engine/gameEngine.ts';
import { isTimeBombPending } from '../engine/interaction.ts';
import type { DiceCard, GameState, MainCard, PlayerId } from '../types/game.ts';
import { CardBack, GameCard, viewDie, viewParamCard, viewRuleCard, type CardView } from './GameCard.tsx';
import { DRAG_MIME } from './PlayerZone.tsx';

interface DrawStackProps {
  kind: DrawSource;
  label: string;
  count: number;
  enabled: boolean;
  onDraw: () => void;
}

function DrawStack({ kind, label, count, enabled, onDraw }: DrawStackProps) {
  const layers = Math.min(5, Math.ceil(count / 6));
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME[kind], kind);
    e.dataTransfer.setData('text/plain', kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="stack-slot">
      <button
        type="button"
        className={`stack-pile ${enabled ? 'is-drawable' : ''}`}
        disabled={!enabled}
        draggable={enabled}
        onDragStart={onDragStart}
        onClick={onDraw}
        aria-label={`${label}에서 드로우 (${count}장 남음)`}
        title={enabled ? '클릭하거나 내 파라미터 덱으로 드래그해 드로우' : '지금은 드로우할 수 없습니다'}
      >
        {count === 0 ? (
          <div className="gcard gcard-md stack-empty">비어 있음</div>
        ) : (
          <div className="pile" style={{ ['--layers' as string]: layers }}>
            {Array.from({ length: layers }, (_, i) => (
              <div key={i} className="pile-layer" style={{ ['--i' as string]: i }}>
                <CardBack kind={kind} />
              </div>
            ))}
          </div>
        )}
      </button>
      <div className="stack-caption">
        <strong>{label}</strong>
        <span>{count}장</span>
      </div>
    </div>
  );
}

function SecondaryStack({
  label,
  cards,
  view,
  onZoom,
}: {
  label: string;
  cards: (MainCard | DiceCard)[];
  view: (card: MainCard | DiceCard) => CardView;
  onZoom: (v: CardView) => void;
}) {
  const top = cards[cards.length - 1];
  return (
    <div className="stack-slot secondary">
      <div className="secondary-pile">
        {top ? (
          <GameCard view={view(top)} size="md" onZoom={() => onZoom(view(top))} />
        ) : (
          <div className="gcard gcard-md stack-empty">비어 있음</div>
        )}
      </div>
      <div className="stack-caption">
        <strong>{label}</strong>
        <span>{cards.length}장</span>
      </div>
    </div>
  );
}

function viewAny(card: MainCard | DiceCard): CardView {
  if ('value' in card) return viewDie(card, card.value);
  return card.kind === 'parameter' ? viewParamCard(card) : viewRuleCard(card);
}

interface SharedTableProps {
  game: GameState;
  controller: PlayerId | null;
  isAITurn: boolean;
  onDraw: (source: DrawSource) => void;
  onEndTurn: () => void;
  onRestart: () => void;
  onZoom: (v: CardView) => void;
}

export function SharedTable({ game, controller, isAITurn, onDraw, onEndTurn, onRestart, onZoom }: SharedTableProps) {
  const canMain = controller !== null && canPlayerDraw(game, controller, 'main');
  const canDice = controller !== null && canPlayerDraw(game, controller, 'dice');
  const active = game.players[game.activePlayer];

  let prompt: ReactNode;
  if (game.phase === 'game_over') {
    prompt = (
      <div className="victory">
        <div className="victory-title">🏆 {game.players[game.winner!].name} 승리!</div>
        <p>{game.winReason}</p>
        <button type="button" className="btn-primary" onClick={onRestart}>
          다시 플레이
        </button>
      </div>
    );
  } else if (isAITurn) {
    prompt = <p className="prompt ai">🤖 {active.name}가 턴을 진행하고 있습니다…</p>;
  } else {
    const text: Record<GameState['phase'], string> = {
      ready_to_draw: '메인 스택과 주사위 스택에서 카드를 드로우하세요.',
      choose_overclock_card: '[과부하] 파라미터 카드 덱에서 적용할 카드 1장을 고르세요.',
      resolve_conflict: '같은 영역의 룰 카드가 충돌했습니다. 남길 카드 1장을 고르세요.',
      resolve_action: isTimeBombPending(game)
        ? '주사위 카드를 선택해 적용하세요. [시한폭탄]에도 1장을 할당해야 합니다.'
        : '주사위 카드를 선택해 파라미터 카드에 적용하세요.',
      turn_end_ready: '행동이 끝났습니다. 턴을 종료하면 효력이 끝난 카드가 세컨더리 스택으로 회수됩니다.',
      game_over: '',
    };
    prompt = (
      <>
        <p className="prompt">
          <strong>{active.name}</strong> · {text[game.phase]}
        </p>
        {game.phase === 'turn_end_ready' && (
          <button type="button" className="btn-primary" onClick={onEndTurn}>
            턴 종료 및 승패 판정
          </button>
        )}
      </>
    );
  }

  return (
    <section className="shared-table" aria-label="공용 카드 스택">
      <div className="stack-group">
        <DrawStack
          kind="main"
          label="메인 스택"
          count={game.mainStack.length}
          enabled={canMain}
          onDraw={() => onDraw('main')}
        />
        <SecondaryStack label="메인 세컨더리" cards={game.mainSecondaryStack} view={viewAny} onZoom={onZoom} />
      </div>

      <div className="table-center">
        <div className="turn-marker">
          턴 {game.turnNumber} · 난이도 {game.difficulty.toFixed(1)}
        </div>
        {game.combination && (
          <div className="combo-banner">
            ⇄ [{game.combination.sourceRuleName}] 상태공간 조합: 규칙(
            {game.players[game.combination.ruleOwner].name}) + 파라미터(
            {game.players[game.combination.paramOwner].name})
          </div>
        )}
        {prompt}
      </div>

      <div className="stack-group">
        <SecondaryStack label="주사위 세컨더리" cards={game.diceSecondaryStack} view={viewAny} onZoom={onZoom} />
        <DrawStack
          kind="dice"
          label="주사위 스택"
          count={game.diceStack.length}
          enabled={canDice}
          onDraw={() => onDraw('dice')}
        />
      </div>
    </section>
  );
}
