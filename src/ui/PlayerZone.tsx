import { useState, type DragEvent } from 'react';
import { getPlayerConditions } from '../engine/conditions.ts';
import {
  canPlayerDraw,
  getDrawCount,
  getEffectiveDieValue,
  getEffectiveParamOwner,
  getEffectiveParamSign,
  getEffectiveRuleOwner,
  type DrawSource,
} from '../engine/gameEngine.ts';
import {
  getDieOptions,
  getRuleActivation,
  summarizeRules,
  type DieOptionId,
  type RuleActivation,
} from '../engine/interaction.ts';
import type { GameState, PlayerId, RuleCard } from '../types/game.ts';
import {
  GameCard,
  viewDie,
  viewParamCard,
  viewRuleCard,
  type CardHighlight,
  type CardSize,
  type CardView,
} from './GameCard.tsx';

export const DRAG_MIME: Record<DrawSource, string> = {
  main: 'application/x-ppm-main',
  dice: 'application/x-ppm-dice',
};

export function readDragSource(e: DragEvent): DrawSource | null {
  if (e.dataTransfer.types.includes(DRAG_MIME.main)) return 'main';
  if (e.dataTransfer.types.includes(DRAG_MIME.dice)) return 'dice';
  return null;
}

export interface ZoneHandlers {
  onZoom: (view: CardView) => void;
  onDraw: (source: DrawSource, playerId: PlayerId) => void;
  onChooseOverclock: (cardId: string) => void;
  onResolveConflict: (keep: 'existing' | 'incoming') => void;
  onSelectDie: (dieId: string | null) => void;
  onDieOption: (dieId: string, optionId: DieOptionId) => void;
  onRuleActivate: (ownerId: PlayerId, card: RuleCard, sacrificeParam?: string) => void;
}

interface PlayerZoneProps {
  game: GameState;
  playerId: PlayerId;
  position: 'top' | 'bottom';
  /** 이 구역을 지금 사람이 조작할 수 있는지 (자신의 턴 & AI 아님) */
  controllable: boolean;
  /** 룰 카드 수동 발동은 조합 상태에 따라 상대 구역의 카드로도 가능 */
  humanActing: boolean;
  selectedDieId: string | null;
  handlers: ZoneHandlers;
}

function fmt(v: number): string {
  return v > 0 ? `+${v}` : `${v}`;
}

// ---------------------------------------------------------------------------
// 상태 디스플레이
// ---------------------------------------------------------------------------

function StatusDisplay({ game, playerId }: { game: GameState; playerId: PlayerId }) {
  const player = game.players[playerId];
  const conditions = getPlayerConditions(player.rules, player.parameters, player.name);
  const limit = conditions.bankruptcyLimit ?? -12;
  const isActive = game.activePlayer === playerId && game.phase !== 'game_over';
  const combo = game.combination;
  const summary = summarizeRules(player.rules);

  return (
    <section className={`status-display ${isActive ? 'is-active' : ''}`}>
      <header className="status-head">
        <h2>{player.name}</h2>
        <div className="status-tags">
          {isActive && <span className="tag tag-turn">현재 턴</span>}
          {combo && combo.ruleOwner === playerId && <span className="tag tag-combo">적용 중인 규칙 공간</span>}
          {combo && combo.paramOwner === playerId && <span className="tag tag-combo">대상 파라미터 공간</span>}
        </div>
      </header>

      <div className="status-body">
        <div className="status-params">
          {Object.entries(player.parameters).map(([name, val]) => {
            const danger = conditions.bankruptcyLimit !== null && val <= limit + 3;
            const width = Math.min(100, (Math.abs(val) / 15) * 100);
            return (
              <div key={name} className={`param-row ${danger ? 'is-danger' : ''}`}>
                <span className="param-name">{name}</span>
                <div className="param-track">
                  <span className="param-zero" />
                  <span
                    className={`param-fill ${val >= 0 ? 'pos' : 'neg'}`}
                    style={{ width: `${width / 2}%` }}
                  />
                </div>
                <span className={`param-val ${val > 0 ? 'pos' : val < 0 ? 'neg' : ''}`}>{fmt(val)}</span>
              </div>
            );
          })}
        </div>

        <div className="status-side">
          <div className="status-block">
            <h3>승리 조건</h3>
            <ul className="cond-list">
              {conditions.wins.map((w) => (
                <li key={w.id} className={w.met ? 'is-met' : ''}>
                  <span className="cond-label">{w.label}</span>
                  <span className="cond-progress">{w.progress}</span>
                  {w.source !== '모드 카드' && <span className="cond-source">{w.source}</span>}
                </li>
              ))}
            </ul>
            <h3>패배 조건</h3>
            <ul className="cond-list loss">
              {conditions.loss ? (
                <li className={conditions.loss.met ? 'is-met' : ''}>
                  <span className="cond-label">{conditions.loss.label}</span>
                  <span className="cond-progress">{conditions.loss.progress}</span>
                  {conditions.loss.source !== '모드 카드' && (
                    <span className="cond-source">{conditions.loss.source}</span>
                  )}
                </li>
              ) : (
                <li>
                  <span className="cond-label">파산 없음</span>
                  <span className="cond-source">나락의 끝</span>
                </li>
              )}
            </ul>
          </div>
          <div className="status-block">
            <h3>주요 규칙</h3>
            <ul className="rule-summary">
              {summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
              {conditions.notes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 파라미터 카드 덱 (드로우한 파라미터·주사위 카드 임시 보관)
// ---------------------------------------------------------------------------

function DrawSlot({
  label,
  enabled,
  onDraw,
  size,
}: {
  label: string;
  enabled: boolean;
  onDraw: () => void;
  size: CardSize;
}) {
  return (
    <button
      type="button"
      className={`draw-slot gcard-${size} ${enabled ? 'is-ready' : ''}`}
      disabled={!enabled}
      onClick={onDraw}
    >
      <span>{label}</span>
    </button>
  );
}

function ParameterDeck({
  game,
  playerId,
  controllable,
  selectedDieId,
  handlers,
  size,
}: {
  game: GameState;
  playerId: PlayerId;
  controllable: boolean;
  selectedDieId: string | null;
  handlers: ZoneHandlers;
  size: CardSize;
}) {
  const [dropHover, setDropHover] = useState(false);
  const isTurn = game.activePlayer === playerId && game.phase !== 'game_over';
  const canDrawMain = controllable && canPlayerDraw(game, playerId, 'main');
  const canDrawDice = controllable && canPlayerDraw(game, playerId, 'dice');

  const onDragOver = (e: DragEvent) => {
    const source = readDragSource(e);
    if (!source || !controllable || !canPlayerDraw(game, playerId, source)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropHover(true);
  };
  const onDrop = (e: DragEvent) => {
    const source = readDragSource(e);
    setDropHover(false);
    if (!source) return;
    e.preventDefault();
    handlers.onDraw(source, playerId);
  };

  const mainCards = (() => {
    if (!isTurn) return null;
    const phase = game.phase;

    if (phase === 'choose_overclock_card') {
      return game.drawnMainCards.map((c) => (
        <GameCard
          key={c.id}
          size={size}
          view={c.kind === 'parameter' ? viewParamCard(c) : viewRuleCard(c)}
          highlight={controllable ? 'selectable' : null}
          onSelect={controllable ? () => handlers.onChooseOverclock(c.id) : undefined}
          onZoom={() => handlers.onZoom(c.kind === 'parameter' ? viewParamCard(c) : viewRuleCard(c))}
          hint={controllable ? '이 카드 선택' : undefined}
        />
      ));
    }

    if (phase === 'resolve_conflict' && game.conflictingRulePair) {
      return (['existing', 'incoming'] as const).map((side) => {
        const card = game.conflictingRulePair![side];
        const view = viewRuleCard(card);
        return (
          <GameCard
            key={card.id}
            size={size}
            view={{ ...view, eyebrow: side === 'existing' ? '기존 룰 카드' : '새 룰 카드' }}
            highlight={controllable ? 'selectable' : null}
            onSelect={controllable ? () => handlers.onResolveConflict(side) : undefined}
            onZoom={() => handlers.onZoom(view)}
            hint={controllable ? '이 카드 유지' : undefined}
          />
        );
      });
    }

    if (phase === 'ready_to_draw' && game.mainDrawnThisTurn) {
      return game.drawnMainCards.map((c) => {
        const view = c.kind === 'parameter' ? viewParamCard(c) : viewRuleCard(c);
        return (
          <GameCard
            key={c.id}
            size={size}
            view={view}
            onZoom={() => handlers.onZoom(view)}
            hint={c.kind === 'rule' ? '주사위 드로우 후 룰 덱에 배치' : '주사위 드로우 대기'}
          />
        );
      });
    }

    if (game.activeMainCard?.kind === 'parameter') {
      const card = game.activeMainCard;
      const view = viewParamCard(card, getEffectiveParamSign(game, card));
      const owner = getEffectiveParamOwner(game);
      return (
        <GameCard
          key={card.id}
          size={size}
          view={view}
          onZoom={() => handlers.onZoom(view)}
          hint={owner !== playerId ? `대상: ${game.players[owner].name}` : '주사위를 선택해 적용'}
        />
      );
    }
    return null;
  })();

  const unusedIds = new Set(game.drawnDice.filter((d) => !game.usedDiceIds.includes(d.id)).map((d) => d.id));
  const resolving = isTurn && game.phase === 'resolve_action';
  const selectedOptions = selectedDieId ? getDieOptions(game, selectedDieId) : [];

  const dice = isTurn
    ? game.drawnDice.map((die) => {
        const view = viewDie(die, getEffectiveDieValue(game, die.value));
        const used = !unusedIds.has(die.id);
        const selectable = controllable && resolving && !used && getDieOptions(game, die.id).length > 0;
        const highlight: CardHighlight =
          selectedDieId === die.id ? 'selected' : selectable ? 'selectable' : null;
        return (
          <GameCard
            key={die.id}
            size={size}
            view={view}
            dimmed={used}
            highlight={highlight}
            onSelect={selectable ? () => handlers.onSelectDie(selectedDieId === die.id ? null : die.id) : undefined}
            onZoom={() => handlers.onZoom(view)}
            hint={used ? '사용됨' : undefined}
            selectLabel={`주사위 ${view.mark} 선택`}
          />
        );
      })
    : null;

  return (
    <section
      className={`deck param-deck ${dropHover ? 'is-drop-hover' : ''} ${
        canDrawMain || canDrawDice ? 'is-drop-ready' : ''
      }`}
      onDragOver={onDragOver}
      onDragLeave={() => setDropHover(false)}
      onDrop={onDrop}
      aria-label={`${game.players[playerId].name} 파라미터 카드 덱`}
    >
      <div className="deck-label">
        <span>파라미터 카드 덱</span>
        {isTurn && game.phase === 'ready_to_draw' && controllable && (
          <span className="deck-help">스택을 클릭하거나 이곳으로 드래그해 드로우</span>
        )}
      </div>
      <div className="deck-row">
        {!isTurn && <div className="deck-empty">상대 턴 대기 중</div>}
        {isTurn && (
          <>
            <div className="deck-group">
              {mainCards}
              {game.phase === 'ready_to_draw' && !game.mainDrawnThisTurn && (
                <DrawSlot
                  size={size}
                  label={`메인 카드 ${getDrawCount(game, 'main')}장`}
                  enabled={canDrawMain}
                  onDraw={() => handlers.onDraw('main', playerId)}
                />
              )}
            </div>
            <div className="deck-divider" />
            <div className="deck-group">
              {dice}
              {game.phase === 'ready_to_draw' && !game.diceDrawnThisTurn && (
                <DrawSlot
                  size={size}
                  label={`주사위 ${getDrawCount(game, 'dice')}장`}
                  enabled={canDrawDice}
                  onDraw={() => handlers.onDraw('dice', playerId)}
                />
              )}
            </div>
            {selectedDieId && selectedOptions.length > 0 && controllable && (
              <div className="die-actions" role="group" aria-label="주사위 적용 방법">
                <div className="die-actions-title">주사위 적용</div>
                {selectedOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={o.id === 'time_bomb' || o.id === 'debt' ? 'btn-forced' : 'btn-primary'}
                    disabled={!o.enabled}
                    title={o.note}
                    onClick={() => handlers.onDieOption(selectedDieId, o.id)}
                  >
                    {o.label}
                    {o.note && <small>{o.note}</small>}
                  </button>
                ))}
                <button type="button" className="btn-ghost" onClick={() => handlers.onSelectDie(null)}>
                  선택 취소
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 룰 카드 덱
// ---------------------------------------------------------------------------

function highlightFor(a: RuleActivation): CardHighlight {
  if (a.status === 'ready') return 'manual';
  if (a.status === 'forced') return 'forced';
  return null;
}

function RuleDeck({
  game,
  playerId,
  humanActing,
  handlers,
  size,
}: {
  game: GameState;
  playerId: PlayerId;
  humanActing: boolean;
  handlers: ZoneHandlers;
  size: CardSize;
}) {
  const [exchangeFor, setExchangeFor] = useState<string | null>(null);
  const player = game.players[playerId];
  const appliedThisTurn = game.phase !== 'game_over' && getEffectiveRuleOwner(game) === playerId;
  const paramOwner = game.players[getEffectiveParamOwner(game)];

  return (
    <section className={`deck rule-deck ${appliedThisTurn ? 'is-applied' : ''}`} aria-label={`${player.name} 룰 카드 덱`}>
      <div className="deck-label">
        <span>룰 카드 덱 {appliedThisTurn && <em>· 이번 턴 적용 중</em>}</span>
        <span className="legend">
          <i className="lg-manual" /> 수동 발동 가능
          <i className="lg-forced" /> 자동(강제) 발동
        </span>
      </div>
      <div className="deck-row">
        {player.rules.length === 0 && <div className="deck-empty">활성화된 룰 카드가 없습니다</div>}
        {player.rules.map((card) => {
          const activation = getRuleActivation(game, playerId, card);
          const view = viewRuleCard(card);
          const canClick = humanActing && activation.clickable;
          const onSelect = canClick
            ? () => {
                if (card.ruleId === 'equivalent_exchange') {
                  setExchangeFor(exchangeFor === card.id ? null : card.id);
                } else {
                  handlers.onRuleActivate(playerId, card);
                }
              }
            : undefined;
          return (
            <div key={card.id} className="rule-slot">
              <GameCard
                size={size}
                view={view}
                highlight={highlightFor(activation)}
                dimmed={activation.status === 'inactive'}
                onSelect={onSelect}
                onZoom={() => handlers.onZoom({ ...view, details: [...(view.details ?? []), `현재: ${activation.hint}`] })}
                hint={activation.hint}
                selectLabel={`${card.name} 발동`}
              />
              {exchangeFor === card.id && canClick && (
                <div className="exchange-picker" role="group" aria-label="희생할 파라미터 선택">
                  <div className="die-actions-title">희생할 파라미터 (-3)</div>
                  {Object.entries(paramOwner.parameters).map(([name, v]) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        handlers.onRuleActivate(playerId, card, name);
                        setExchangeFor(null);
                      }}
                    >
                      {name} {fmt(v)} → {fmt(v - 3)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 플레이어 구역: 상태 디스플레이 + 파라미터 카드 덱 + 룰 카드 덱
// ---------------------------------------------------------------------------

export function PlayerZone({
  game,
  playerId,
  position,
  controllable,
  humanActing,
  selectedDieId,
  handlers,
}: PlayerZoneProps) {
  const size: CardSize = position === 'top' ? 'sm' : 'md';
  const status = <StatusDisplay game={game} playerId={playerId} />;
  const paramDeck = (
    <ParameterDeck
      game={game}
      playerId={playerId}
      controllable={controllable}
      selectedDieId={selectedDieId}
      handlers={handlers}
      size={size}
    />
  );
  const ruleDeck = (
    <RuleDeck game={game} playerId={playerId} humanActing={humanActing} handlers={handlers} size={size} />
  );

  return (
    <div className={`player-zone zone-${position} ${game.activePlayer === playerId ? 'is-turn' : ''}`}>
      {position === 'top' ? (
        <>
          {ruleDeck}
          <div className="zone-mid">
            {status}
            {paramDeck}
          </div>
        </>
      ) : (
        <>
          <div className="zone-mid">
            {status}
            {paramDeck}
          </div>
          {ruleDeck}
        </>
      )}
    </div>
  );
}
