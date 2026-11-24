import { useEffect, useState, type ReactNode } from 'react';
import { getDifficultyProfile } from '../engine/difficulty.ts';
import { GameCard, type CardView } from './GameCard.tsx';

function Modal({ onClose, children, className = '' }: { onClose?: () => void; children: ReactNode; className?: string }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-panel ${className}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function CardZoomModal({ view, onClose }: { view: CardView; onClose: () => void }) {
  return (
    <Modal onClose={onClose} className="zoom-panel">
      <GameCard view={view} size="lg" />
      <div className="zoom-info">
        <div className="zoom-eyebrow">{view.eyebrow}</div>
        <h2>{view.title}</h2>
        <p className="zoom-desc">{view.description}</p>
        {view.details && (
          <ul>
            {view.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
        <button type="button" className="btn-primary" onClick={onClose} autoFocus>
          닫기
        </button>
      </div>
    </Modal>
  );
}

export function ModCardModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <h2>📜 모드 카드: 스탠다드 프로토콜 v1.0</h2>
        <button type="button" className="btn-ghost" onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="modal-section">
        <h4>1. 상태공간 구조 (핵심 메타규칙)</h4>
        <ul>
          <li>각 플레이어는 <b>기초 파라미터 상태공간</b>과 <b>규칙 상태공간</b>을 가집니다.</li>
          <li>규칙 상태공간은 파라미터 상태공간에 속하며, 룰 카드는 특수한 파라미터로 취급됩니다.</li>
          <li>
            <code>침공</code>, <code>역전</code>, <code>인형술사</code> 카드로 서로 다른 플레이어의 규칙/파라미터
            상태공간을 조합해 턴을 진행할 수 있습니다.
          </li>
        </ul>
      </div>
      <div className="modal-section">
        <h4>2. 턴 진행 및 주사위 선택</h4>
        <ul>
          <li>자신의 턴에 메인 스택에서 1장, 주사위 스택에서 2장을 드로우합니다. 스택을 클릭하거나 드래그하세요.</li>
          <li>파라미터 카드를 뽑으면 주사위 카드 중 <b>유리한 1장을 선택</b>해 부호(+/-)대로 증감합니다.</li>
          <li>같은 영역(Domain)의 룰 카드가 놓이면 충돌이 발생해 1장만 남기고 버립니다.</li>
          <li>턴 종료 시 효력이 끝난 카드는 세컨더리 스택으로 회수되고, 스택이 바닥나면 세컨더리 스택을 섞어 되돌립니다.</li>
        </ul>
      </div>
      <div className="modal-section">
        <h4>3. 기본 승리 및 패배 조건 (턴 종료 시 조합 해제 후 판정)</h4>
        <ul>
          <li>
            <b>승리</b>: 단일 파라미터 <b>+15 이상</b> / 서로 다른 3개 파라미터 <b>+8 이상</b> / 전체 총합{' '}
            <b>+25 이상</b>
          </li>
          <li>
            <b>패배(파산)</b>: 단일 파라미터 <b>-12 이하</b>
          </li>
          <li>룰 카드가 조건을 바꾸면 각 플레이어의 상태 디스플레이에 실제 적용 조건이 표시됩니다.</li>
        </ul>
      </div>
    </Modal>
  );
}

export function DifficultyModal({
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
    <Modal onClose={canCancel ? onCancel : undefined}>
      <div className="modal-head">
        <div>
          <h2>대전 설정 및 난이도</h2>
          <p className="muted">난이도(0.1 ~ 10.0)에 따라 카드와 주사위의 확률 분포가 비선형적으로 변화합니다.</p>
        </div>
        <div className="diff-badge">{profile.difficulty.toFixed(1)}</div>
      </div>

      <div className="chip-row">
        <button type="button" className={mode === 'vs_ai' ? 'chip is-on' : 'chip'} onClick={() => setMode('vs_ai')}>
          🤖 1인 vs AI
        </button>
        <button
          type="button"
          className={mode === 'local_2p' ? 'chip is-on' : 'chip'}
          onClick={() => setMode('local_2p')}
        >
          👥 로컬 2인 대전
        </button>
      </div>

      <input
        type="range"
        className="diff-slider"
        min="0.1"
        max="10.0"
        step="0.1"
        value={difficulty}
        aria-label="난이도"
        onChange={(e) => setDifficulty(parseFloat(e.target.value))}
      />
      <div className="chip-row">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            className={Math.abs(profile.difficulty - p.value) < 0.05 ? 'chip is-on' : 'chip'}
            onClick={() => setDifficulty(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={`phase-banner ${profile.phase}`}>
        <strong>{profile.phaseLabel}</strong>
        <span>{profile.phaseDescription}</span>
      </div>

      <div className="telemetry">
        <div>
          <span>파라미터 부호 (+ : -)</span>
          <strong>
            {Math.round(profile.paramPlusProb * 100)}% : {Math.round(profile.paramMinusProb * 100)}%
          </strong>
          <div className="ratio-bar">
            <i className="pos" style={{ width: `${profile.paramPlusProb * 100}%` }} />
            <i className="neg" style={{ width: `${profile.paramMinusProb * 100}%` }} />
          </div>
        </div>
        <div>
          <span>주사위 평균 / 고눈(5~6)</span>
          <strong>
            {profile.diceExpectedValue.toFixed(2)} · {Math.round(profile.diceHighProb * 100)}%
          </strong>
        </div>
        <div>
          <span>룰 카드 (40장 중)</span>
          <strong>{profile.ruleCount}장</strong>
        </div>
        <div>
          <span>압박형 룰 비율</span>
          <strong className="neg-text">{Math.round(profile.hazardShare * 100)}%</strong>
        </div>
      </div>

      <div className="modal-actions">
        {canCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            취소
          </button>
        )}
        <button type="button" className="btn-primary" onClick={() => onStart(mode, profile.difficulty)}>
          이 난이도로 대전 시작
        </button>
      </div>
    </Modal>
  );
}
