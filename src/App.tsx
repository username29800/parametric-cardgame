import { useEffect, useState } from 'react';
import {
  chooseOverclockCard,
  createInitialGameState,
  drawFromStack,
  endTurn,
  resolveRuleConflict,
  runAIStep,
} from './engine/gameEngine.ts';
import { activateManualRule, getDieOptions, performDieOption } from './engine/interaction.ts';
import type { GameState, PlayerId } from './types/game.ts';
import type { CardView } from './ui/GameCard.tsx';
import { CardZoomModal, DifficultyModal, ModCardModal } from './ui/Modals.tsx';
import { PlayerZone, type ZoneHandlers } from './ui/PlayerZone.tsx';
import { SharedTable } from './ui/SharedTable.tsx';

export default function App() {
  const [game, setGame] = useState<GameState>(() => createInitialGameState('vs_ai', 3.5));
  const [showDifficultyModal, setShowDifficultyModal] = useState(true);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);
  const [showModModal, setShowModModal] = useState(false);
  const [showLog, setShowLog] = useState(true);
  const [zoomView, setZoomView] = useState<CardView | null>(null);
  const [selectedDie, setSelectedDie] = useState<string | null>(null);

  const activePlayer = game.players[game.activePlayer];
  const isAITurn = activePlayer.isAI && game.phase !== 'game_over';
  /** 지금 화면을 조작하는 사람 플레이어 (AI 턴이거나 게임 종료면 없음) */
  const controller: PlayerId | null = game.phase !== 'game_over' && !activePlayer.isAI ? game.activePlayer : null;
  const selectedDieId = selectedDie && getDieOptions(game, selectedDie).length > 0 ? selectedDie : null;

  useEffect(() => {
    if (!isAITurn || showDifficultyModal) return;
    const timer = setTimeout(() => setGame((prev) => runAIStep(prev)), 700);
    return () => clearTimeout(timer);
  }, [game, isAITurn, showDifficultyModal]);

  const act = (fn: (g: GameState) => GameState) => setGame((g) => fn(g));

  const startNewGame = (mode: 'vs_ai' | 'local_2p', difficulty = game.difficulty) => {
    setShowDifficultyModal(false);
    setHasStartedOnce(true);
    setSelectedDie(null);
    setGame(createInitialGameState(mode, difficulty));
  };

  const handlers: ZoneHandlers = {
    onZoom: setZoomView,
    onDraw: (source, playerId) => act((g) => drawFromStack(g, source, playerId)),
    onChooseOverclock: (cardId) => act((g) => chooseOverclockCard(g, cardId)),
    onResolveConflict: (keep) => act((g) => resolveRuleConflict(g, keep)),
    onSelectDie: setSelectedDie,
    onDieOption: (dieId, optionId) => {
      setSelectedDie(null);
      act((g) => performDieOption(g, dieId, optionId));
    },
    onRuleActivate: (ownerId, card, sacrificeParam) =>
      act((g) => activateManualRule(g, ownerId, card.id, sacrificeParam)),
  };

  const zone = (playerId: PlayerId, position: 'top' | 'bottom') => (
    <PlayerZone
      game={game}
      playerId={playerId}
      position={position}
      controllable={controller === playerId}
      humanActing={controller !== null}
      selectedDieId={selectedDieId}
      handlers={handlers}
    />
  );

  return (
    <div className="table-room">
      <header className="topbar">
        <div className="brand">
          <h1>프로젝트 파라메트릭</h1>
          <span>PROJECT PARAMETRIC</span>
        </div>
        <div className="topbar-controls">
          <span className={`turn-pill ${game.activePlayer}`}>
            턴 {game.turnNumber} · {activePlayer.name}
          </span>
          <span className="pill">{game.mode === 'vs_ai' ? '1인 vs AI' : '로컬 2인'}</span>
          <button type="button" className="btn-ghost" onClick={() => setShowModModal(true)}>
            📜 모드 카드
          </button>
          <button type="button" className="btn-ghost" onClick={() => setShowLog((v) => !v)}>
            {showLog ? '로그 숨기기' : '로그 보기'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setShowDifficultyModal(true)}>
            🎛️ 새 게임
          </button>
        </div>
      </header>

      <div className={`table-layout ${showLog ? 'with-log' : ''}`}>
        <main className="wood-table">
          {zone('p2', 'top')}
          <SharedTable
            game={game}
            controller={controller}
            isAITurn={isAITurn}
            onDraw={(source) => controller && act((g) => drawFromStack(g, source, controller))}
            onEndTurn={() => act(endTurn)}
            onRestart={() => startNewGame(game.mode)}
            onZoom={setZoomView}
          />
          {zone('p1', 'bottom')}
        </main>

        {showLog && (
          <aside className="log-panel" aria-label="전투 로그">
            <h3>전투 및 상태공간 로그</h3>
            <ol className="log-list">
              {game.logs.map((log) => (
                <li key={log.id} className={`log-item ${log.type}`}>
                  <span className="log-meta">
                    T{log.turn} · {log.actor}
                  </span>
                  {log.message}
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

      {zoomView && <CardZoomModal view={zoomView} onClose={() => setZoomView(null)} />}
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
