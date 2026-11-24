import { useEffect, useState } from 'react';
import { getDifficultyProfile } from './engine/difficulty.ts';
import {
  activateEquivalentExchange,
  applyDieToParameter,
  applyDieToTimeBomb,
  chooseOverclockCard,
  createInitialGameState,
  dismissDebtRepayment,
  drawTurnCards,
  endTurn,
  getEffectiveDieValue,
  getEffectiveParamOwner,
  getEffectiveRuleOwner,
  hasEffectiveRule,
  resolveRuleConflict,
  runAIStep,
  toggleSignFlip,
} from './engine/gameEngine.ts';
import type { GameState, PlayerId, PlayerState } from './types/game.ts';

function PlayerPanel({
  player,
  isActiveTurn,
  isRuleOwner,
  isParamOwner,
  combinationActive,
}: {
  player: PlayerState;
  isActiveTurn: boolean;
  isRuleOwner: boolean;
  isParamOwner: boolean;
  combinationActive: boolean;
}) {
  const entries = Object.entries(player.parameters);
  const sum = entries.reduce((acc, [, v]) => acc + v, 0);
  const plusEightCount = entries.filter(([, v]) => v >= 8).length;

  return (
    <section className={`player-panel ${isActiveTurn ? 'is-active-turn' : ''}`}>
      <div className="player-header">
        <div className="player-title">
          <span>{player.name}</span>
          {isActiveTurn && <span className="domain-badge">현재 턴</span>}
          {combinationActive && isRuleOwner && (
            <span className="counter-badge">적용 중인 규칙 공간</span>
          )}
          {combinationActive && isParamOwner && (
            <span className="counter-badge">대상 파라미터 공간</span>
          )}
        </div>
        <div className="player-stats">
          <span className="stat-chip">총합: {sum >= 0 ? `+${sum}` : sum} / +25</span>
          <span className="stat-chip">+8 이상: {plusEightCount} / 3종</span>
        </div>
      </div>

      <div className="param-grid">
        {entries.map(([name, val]) => {
          const isDanger = val <= -9;
          const pct = Math.min(100, Math.max(8, (Math.abs(val) / 15) * 100));
          return (
            <div
              key={name}
              className={`param-card-cell ${val > 0 ? 'positive' : val < 0 ? 'negative' : ''} ${
                isDanger ? 'danger-zone' : ''
              }`}
            >
              <div className="param-top">
                <span className="param-name">{name}</span>
                <span className={`param-val ${val > 0 ? 'pos' : val < 0 ? 'neg' : ''}`}>
                  {val > 0 ? `+${val}` : val}
                </span>
              </div>
              <div className="param-bar-bg">
                <div
                  className="param-bar-fill"
                  style={{
                    width: `${val === 0 ? 0 : pct}%`,
                    background: val >= 0 ? 'var(--emerald)' : 'var(--rose)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="rules-strip">
        <div className="rules-strip-label">규칙 상태공간 (특수 파라미터)</div>
        {player.rules.length === 0 ? (
          <div className="empty-rules">활성화된 룰 카드가 없습니다.</div>
        ) : (
          <div className="rules-list">
            {player.rules.map((rule) => (
              <div key={rule.id} className="rule-chip">
                <div className="rule-chip-header">
                  <span>{rule.name}</span>
                  <span className="domain-badge">{rule.domain}</span>
                  {rule.counterValue !== undefined && (
                    <span className="counter-badge">
                      {rule.counterLabel}: {rule.counterValue}
                    </span>
                  )}
                </div>
                <div className="rule-chip-desc">{rule.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ModCardModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>📜 모드 카드: 스탠다드 프로토콜 v1.0</h2>
          <button onClick={onClose}>닫기</button>
        </div>

        <div className="modal-section">
          <h4>1. 상태공간 구조 (핵심 메타규칙)</h4>
          <ul>
            <li>각 플레이어는 <b>기초 파라미터 상태공간</b>과 <b>규칙 상태공간</b>을 가집니다.</li>
            <li>규칙 상태공간은 파라미터 상태공간에 속하며, 룰 카드는 특수한 파라미터로 취급됩니다.</li>
            <li><code>침공</code>, <code>역전</code>, <code>인형술사</code> 카드를 통해 서로 다른 플레이어의 규칙/파라미터 상태공간을 조합해 턴을 진행할 수 있습니다.</li>
          </ul>
        </div>

        <div className="modal-section">
          <h4>2. 턴 진행 및 주사위 선택</h4>
          <ul>
            <li>매 턴 메인 스택에서 1장(파라미터 또는 룰), 주사위 스택에서 2장을 드로우합니다.</li>
            <li>파라미터 카드를 뽑으면 주사위 2장 중 <b>유리한 1장을 선택</b>해 부호(+/-)대로 증감합니다.</li>
            <li>같은 영역(Domain)의 룰 카드가 놓이면 충돌이 발생해 1장만 남기고 버립니다.</li>
          </ul>
        </div>

        <div className="modal-section">
          <h4>3. 기본 승리 및 패배 조건 (턴 종료 시 조합 해제 후 판정)</h4>
          <ul>
            <li><b>승리</b>: 단일 파라미터 <b>+15 이상</b> / 서로 다른 3개 파라미터 <b>+8 이상</b> / 전체 총합 <b>+25 이상</b></li>
            <li><b>패배(파산)</b>: 단일 파라미터 <b>-12 이하</b></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function DifficultyModal({
  initialMode,
  initialDifficulty,
  canCancel,
  onCancel,
  onStart,
}: {
  initialMode: 'vs_ai' | 'local_2p';
  initialDifficulty: number;
  canCancel: boolean;
  onCancel: () => void;
  onStart: (mode: 'vs_ai' | 'local_2p', difficulty: number) => void;
}) {
  const [mode, setMode] = useState<'vs_ai' | 'local_2p'>(initialMode);
  const [difficulty, setDifficulty] = useState<number>(initialDifficulty);
  const profile = getDifficultyProfile(difficulty);

  const presets = [
    { label: '1.0 입문', value: 1.0 },
    { label: '3.5 표준', value: 3.5 },
    { label: '5.0 변동', value: 5.0 },
    { label: '7.5 압박', value: 7.5 },
    { label: '10.0 나락', value: 10.0 },
  ];

  return (
    <div className="modal-backdrop">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="diff-header">
          <div>
            <h2>🎛️ 대전 설정 및 난이도 선택</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
              난이도(0.1 ~ 10.0)에 따라 카드와 주사위의 확률 분포가 비선형적으로 변화합니다.
            </p>
          </div>
          <div className="diff-value-badge">{profile.difficulty.toFixed(1)}</div>
        </div>

        <div className="diff-presets">
          <button
            className={mode === 'vs_ai' ? 'active' : ''}
            onClick={() => setMode('vs_ai')}
          >
            🤖 1인 vs AI
          </button>
          <button
            className={mode === 'local_2p' ? 'active' : ''}
            onClick={() => setMode('local_2p')}
          >
            👥 로컬 2인 대전
          </button>
        </div>

        <div className="diff-slider-wrap">
          <input
            type="range"
            className="diff-slider"
            min="0.1"
            max="10.0"
            step="0.1"
            value={difficulty}
            onChange={(e) => setDifficulty(parseFloat(e.target.value))}
          />
          <div className="diff-presets">
            {presets.map((p) => (
              <button
                key={p.value}
                className={Math.abs(profile.difficulty - p.value) < 0.05 ? 'active' : ''}
                onClick={() => setDifficulty(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`phase-banner ${profile.phase}`}>
          <div style={{ fontWeight: 700, marginBottom: '2px' }}>{profile.phaseLabel}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
            {profile.phaseDescription}
          </div>
        </div>

        <div className="telemetry-grid">
          <div className="telemetry-card">
            <div className="telemetry-label">파라미터 부호 비율 (+ : -)</div>
            <div className="telemetry-val">
              +{Math.round(profile.paramPlusProb * 100)}% : -
              {Math.round(profile.paramMinusProb * 100)}%
            </div>
            <div className="ratio-bar">
              <div
                style={{
                  width: `${profile.paramPlusProb * 100}%`,
                  background: 'var(--emerald)',
                }}
              />
              <div
                style={{
                  width: `${profile.paramMinusProb * 100}%`,
                  background: 'var(--rose)',
                }}
              />
            </div>
          </div>

          <div className="telemetry-card">
            <div className="telemetry-label">주사위 기댓값 / 고눈(5~6) 확률</div>
            <div className="telemetry-val">
              평균 {profile.diceExpectedValue.toFixed(2)} · 고눈{' '}
              {Math.round(profile.diceHighProb * 100)}%
            </div>
          </div>

          <div className="telemetry-card">
            <div className="telemetry-label">룰 카드 비중 (40장 중)</div>
            <div className="telemetry-val">
              {profile.ruleCount}장 ({Math.round((profile.ruleCount / 40) * 100)}%)
            </div>
          </div>

          <div className="telemetry-card">
            <div className="telemetry-label">불리한 압박형 룰 비율</div>
            <div className="telemetry-val" style={{ color: 'var(--rose)' }}>
              {Math.round(profile.hazardShare * 100)}%
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          {canCancel && <button onClick={onCancel}>취소</button>}
          <button className="primary" onClick={() => onStart(mode, profile.difficulty)}>
            🚀 이 난이도로 대전 시작
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => createInitialGameState('vs_ai', 3.5));
  const [showDifficultyModal, setShowDifficultyModal] = useState(true);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);
  const [showModModal, setShowModModal] = useState(false);
  const [showExchangePicker, setShowExchangePicker] = useState(false);

  const activePlayerObj = game.players[game.activePlayer];
  const isAITurn = activePlayerObj.isAI && game.phase !== 'game_over';

  useEffect(() => {
    if (!isAITurn) return;
    const timer = setTimeout(() => {
      setGame((prev) => runAIStep(prev));
    }, 650);
    return () => clearTimeout(timer);
  }, [game, isAITurn]);

  const startNewGame = (mode: 'vs_ai' | 'local_2p', difficulty = game.difficulty) => {
    setShowExchangePicker(false);
    setShowDifficultyModal(false);
    setHasStartedOnce(true);
    setGame(createInitialGameState(mode, difficulty));
  };

  const unusedDice = game.drawnDice.filter((d) => !game.usedDiceIds.includes(d.id));
  const needsTimeBomb =
    hasEffectiveRule(game, 'time_bomb') && !game.timeBombResolvedThisTurn && unusedDice.length > 0;

  // Check twin synergy availability
  const twinPair = (() => {
    if (!hasEffectiveRule(game, 'twin_synergy') || unusedDice.length < 2) return null;
    for (let i = 0; i < unusedDice.length; i++) {
      for (let j = i + 1; j < unusedDice.length; j++) {
        if (unusedDice[i].value === unusedDice[j].value) {
          return [unusedDice[i], unusedDice[j]];
        }
      }
    }
    return null;
  })();

  const effectiveRuleOwner = getEffectiveRuleOwner(game);
  const effectiveParamOwner = getEffectiveParamOwner(game);

  const renderPlayer = (id: PlayerId) => (
    <PlayerPanel
      player={game.players[id]}
      isActiveTurn={game.activePlayer === id && game.phase !== 'game_over'}
      isRuleOwner={effectiveRuleOwner === id}
      isParamOwner={effectiveParamOwner === id}
      combinationActive={Boolean(game.combination)}
    />
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>프로젝트 파라메트릭</h1>
          <span>PROJECT PARAMETRIC</span>
        </div>

        <div className="topbar-controls">
          <div className={`turn-pill ${game.activePlayer === 'p1' ? 'active-p1' : 'active-p2'}`}>
            턴 {game.turnNumber} · {activePlayerObj.name}
          </div>
          <span className="stat-chip">난이도 {game.difficulty.toFixed(1)}</span>
          <button
            onClick={() => startNewGame(game.mode === 'vs_ai' ? 'local_2p' : 'vs_ai', game.difficulty)}
          >
            모드 전환: {game.mode === 'vs_ai' ? '1인 vs AI' : '로컬 2인'}
          </button>
          <button onClick={() => setShowModModal(true)}>📜 모드 카드</button>
          <button onClick={() => setShowDifficultyModal(true)}>🎛️ 새 게임 / 난이도</button>
        </div>
      </header>

      <div className="main-layout">
        <div className="board-column">
          {renderPlayer('p2')}

          <section className="center-arena">
            <div className="stacks-bar">
              <div className="stack-badges">
                <span className="stack-badge">메인 스택: {game.mainStack.length}장</span>
                <span className="stack-badge">메인 세컨더리: {game.mainSecondaryStack.length}장</span>
                <span className="stack-badge">주사위 스택: {game.diceStack.length}장</span>
                <span className="stack-badge">주사위 세컨더리: {game.diceSecondaryStack.length}장</span>
              </div>
            </div>

            {game.combination && (
              <div className="combo-banner">
                <span>
                  ⚡ 상태공간 조합 [{game.combination.sourceRuleName}] 활성: 규칙(
                  {game.players[game.combination.ruleOwner].name}) + 파라미터(
                  {game.players[game.combination.paramOwner].name})
                </span>
              </div>
            )}

            <div className="action-stage">
              {game.phase === 'game_over' && (
                <div className="victory-box">
                  <h2>🏆 {game.players[game.winner!].name} 승리!</h2>
                  <p style={{ color: 'var(--text)', marginBottom: '12px' }}>{game.winReason}</p>
                  <button className="primary" onClick={() => startNewGame(game.mode)}>
                    다시 플레이
                  </button>
                </div>
              )}

              {game.phase !== 'game_over' && isAITurn && (
                <div>
                  <p style={{ color: 'var(--amber)', fontWeight: 700 }}>
                    🤖 AI 오토마타가 턴을 진행 중입니다...
                  </p>
                </div>
              )}

              {!isAITurn && game.phase === 'ready_to_draw' && (
                <>
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                    {activePlayerObj.name}의 턴입니다. 메인 스택과 주사위 스택에서 카드를 드로우하세요.
                  </p>
                  <button className="primary" onClick={() => setGame((g) => drawTurnCards(g))}>
                    🎴 카드 & 주사위 드로우
                  </button>
                </>
              )}

              {!isAITurn && game.phase === 'choose_overclock_card' && (
                <>
                  <p style={{ color: 'var(--cyan)', fontWeight: 700 }}>
                    ⚡ [과부하] 드로우한 2장 중 이번 턴에 적용할 카드 1장을 선택하세요.
                  </p>
                  <div className="card-display-row">
                    {game.drawnMainCards.map((c) => (
                      <div
                        key={c.id}
                        className={`game-card ${
                          c.kind === 'rule'
                            ? 'rule-type'
                            : c.sign === '+'
                            ? 'param-plus'
                            : 'param-minus'
                        }`}
                      >
                        <div className="game-card-type">
                          {c.kind === 'rule' ? `룰 카드 · ${c.domain}` : '파라미터 카드'}
                        </div>
                        <div className="game-card-title">
                          <span>{c.kind === 'rule' ? c.name : c.paramName}</span>
                          {c.kind === 'parameter' && <span>{c.sign}</span>}
                        </div>
                        <div className="game-card-flavor">
                          {c.kind === 'rule' ? c.description : c.flavor}
                        </div>
                        <button
                          className="primary"
                          onClick={() => setGame((g) => chooseOverclockCard(g, c.id))}
                        >
                          이 카드 선택
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!isAITurn && game.phase === 'resolve_conflict' && game.conflictingRulePair && (
                <>
                  <p style={{ color: 'var(--rose)', fontWeight: 700 }}>
                    ⚠️ [{game.conflictingRulePair.existing.domain}] 영역 규칙 충돌! 남길 룰 카드 1장을 선택하세요.
                  </p>
                  <div className="card-display-row">
                    {(['existing', 'incoming'] as const).map((side) => {
                      const card = game.conflictingRulePair![side];
                      return (
                        <div key={card.id} className="game-card rule-type">
                          <div className="game-card-type">
                            {side === 'existing' ? '기존 룰 카드' : '새로 뽑은 룰 카드'} · {card.domain}
                          </div>
                          <div className="game-card-title">{card.name}</div>
                          <div className="game-card-flavor">{card.description}</div>
                          <button
                            className={side === 'incoming' ? 'primary' : ''}
                            onClick={() => setGame((g) => resolveRuleConflict(g, side))}
                          >
                            이 카드 유지
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {!isAITurn && game.phase === 'resolve_action' && (
                <>
                  {game.activeMainCard?.kind === 'parameter' && (
                    <div
                      className={`game-card ${
                        (game.signFlipActiveThisTurn
                          ? game.activeMainCard.sign === '+'
                            ? '-'
                            : '+'
                          : game.activeMainCard.sign) === '+'
                          ? 'param-plus'
                          : 'param-minus'
                      }`}
                    >
                      <div className="game-card-type">파라미터 카드</div>
                      <div className="game-card-title">
                        <span>{game.activeMainCard.paramName}</span>
                        <span>
                          {game.signFlipActiveThisTurn
                            ? game.activeMainCard.sign === '+'
                              ? '- (반전됨)'
                              : '+ (반전됨)'
                            : game.activeMainCard.sign}
                        </span>
                      </div>
                      <div className="game-card-flavor">{game.activeMainCard.flavor}</div>
                    </div>
                  )}

                  {needsTimeBomb && (
                    <div
                      style={{
                        color: 'var(--rose)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                      }}
                    >
                      💣 [시한폭탄] 활성화됨: 주사위 1장을 시한폭탄에 할당해야 합니다!
                    </div>
                  )}

                  <div className="dice-row">
                    {game.drawnDice.map((die) => {
                      const isUsed = game.usedDiceIds.includes(die.id);
                      const effVal = getEffectiveDieValue(game, die.value);
                      return (
                        <button
                          key={die.id}
                          className={`die-btn ${isUsed ? 'used' : ''}`}
                          disabled={
                            isUsed ||
                            (needsTimeBomb &&
                              unusedDice.length <= 1 &&
                              Boolean(game.activeMainCard))
                          }
                          onClick={() => {
                            if (game.activeMainCard?.kind === 'parameter') {
                              setGame((g) => applyDieToParameter(g, [die.id]));
                            } else if (needsTimeBomb) {
                              setGame((g) => applyDieToTimeBomb(g, die.id));
                            }
                          }}
                        >
                          <span>{effVal}</span>
                          <small>
                            {effVal !== die.value ? `원래 ${die.value}` : '주사위'}
                          </small>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rule-actions-bar">
                    {needsTimeBomb && unusedDice.length > 0 && (
                      <button
                        className="danger"
                        onClick={() => setGame((g) => applyDieToTimeBomb(g, unusedDice[0].id))}
                      >
                        💣 첫 번째 미사용 주사위({getEffectiveDieValue(game, unusedDice[0].value)})를 시한폭탄에 할당
                      </button>
                    )}

                    {hasEffectiveRule(game, 'debt_repayment') &&
                      unusedDice.some((d) => getEffectiveDieValue(game, d.value) >= 6) && (
                        <button
                          className="amber"
                          onClick={() => {
                            const sixDie = unusedDice.find(
                              (d) => getEffectiveDieValue(game, d.value) >= 6
                            );
                            if (sixDie) setGame((g) => dismissDebtRepayment(g, sixDie.id));
                          }}
                        >
                          💸 [부채 상환] 주사위 6 지불해 해제
                        </button>
                      )}

                    {twinPair && game.activeMainCard?.kind === 'parameter' && (
                      <button
                        className="amber"
                        onClick={() =>
                          setGame((g) =>
                            applyDieToParameter(g, [twinPair[0].id, twinPair[1].id])
                          )
                        }
                      >
                        ✨ [쌍둥이 시너지] 더블({twinPair[0].value}+{twinPair[1].value}) 합산 적용!
                      </button>
                    )}

                    {hasEffectiveRule(game, 'safety_first') &&
                      unusedDice.length > 0 &&
                      game.activeMainCard?.kind === 'parameter' && (
                        <button
                          onClick={() =>
                            setGame((g) =>
                              applyDieToParameter(g, [unusedDice[0].id], {
                                forceSafetyThree: true,
                              })
                            )
                          }
                        >
                          🛡️ [안전제일] 3으로 고정 적용
                        </button>
                      )}

                    {hasEffectiveRule(game, 'sign_flip') &&
                      game.activeMainCard?.kind === 'parameter' && (
                        <button onClick={() => setGame((g) => toggleSignFlip(g))}>
                          🔄 [부호 반전] {game.signFlipActiveThisTurn ? '해제' : '적용'}
                        </button>
                      )}

                    {hasEffectiveRule(game, 'equivalent_exchange') &&
                      !game.equivalentExchangeUsed &&
                      game.activeMainCard?.kind === 'parameter' && (
                        <button onClick={() => setShowExchangePicker((v) => !v)}>
                          ⚖️ [등가교환] 파라미터 -3 희생 → +3 보너스
                        </button>
                      )}
                  </div>

                  {showExchangePicker && !game.equivalentExchangeUsed && (
                    <div className="rule-actions-bar">
                      {Object.keys(game.players[effectiveParamOwner].parameters).map((pName) => (
                        <button
                          key={pName}
                          onClick={() => {
                            setGame((g) => activateEquivalentExchange(g, pName));
                            setShowExchangePicker(false);
                          }}
                        >
                          {pName} -3
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {!isAITurn && game.phase === 'turn_end_ready' && (
                <>
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                    이번 턴의 행동이 완료되었습니다. 턴을 종료하고 승패를 판정하세요.
                  </p>
                  <button className="primary" onClick={() => setGame((g) => endTurn(g))}>
                    ⏭️ 턴 종료 및 승패 판정
                  </button>
                </>
              )}
            </div>
          </section>

          {renderPlayer('p1')}
        </div>

        <aside className="log-panel">
          <h3>전투 및 상태공간 로그</h3>
          <div className="log-list">
            {game.logs.map((log) => (
              <div key={log.id} className={`log-item ${log.type}`}>
                <div className="log-meta">
                  T{log.turn} · {log.actor}
                </div>
                <div>{log.message}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {showModModal && <ModCardModal onClose={() => setShowModModal(false)} />}
      {showDifficultyModal && (
        <DifficultyModal
          initialMode={game.mode}
          initialDifficulty={game.difficulty}
          canCancel={hasStartedOnce}
          onCancel={() => setShowDifficultyModal(false)}
          onStart={(m, d) => startNewGame(m, d)}
        />
      )}
    </div>
  );
}
