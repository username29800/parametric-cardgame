import assert from 'node:assert/strict';
import {
  applyDieToParameter,
  createInitialGameState,
  drawTurnCards,
  endTurn,
  resolveRuleConflict,
} from '../src/engine/gameEngine.ts';
import { RULE_TEMPLATES } from '../src/data/cards.ts';

function testInitialDeckAndDraw() {
  const state = createInitialGameState('local_2p');
  assert.equal(state.mainStack.length, 40, 'Main stack should start with 40 cards');
  assert.equal(state.diceStack.length, 24, 'Dice stack should start with 24 cards');

  const afterDraw = drawTurnCards(state);
  assert.equal(afterDraw.drawnDice.length, 2, 'Should draw 2 dice cards by default');
  assert.ok(afterDraw.mainStack.length <= 39, 'Main stack should decrease after draw');
  console.log('✓ testInitialDeckAndDraw passed');
}

function testParameterApplicationAndEndTurn() {
  let state = createInitialGameState('local_2p');
  state.mainStack = [
    {
      id: 'p-test',
      kind: 'parameter',
      paramName: '카페인',
      sign: '+',
      flavor: 'test',
    },
    ...state.mainStack,
  ];
  state.diceStack = [
    { id: 'd-1', value: 5 },
    { id: 'd-2', value: 2 },
    ...state.diceStack,
  ];

  state = drawTurnCards(state);
  assert.equal(state.phase, 'resolve_action');

  state = applyDieToParameter(state, ['d-1']);
  assert.equal(state.players.p1.parameters['카페인'], 5);
  assert.equal(state.phase, 'turn_end_ready');

  state = endTurn(state);
  assert.equal(state.activePlayer, 'p2');
  assert.equal(state.players.p1.parameters['카페인'], 5, 'Recorded parameter persists after turn end');
  console.log('✓ testParameterApplicationAndEndTurn passed');
}

function testRuleConflictResolution() {
  let state = createInitialGameState('local_2p');
  const hyperfocus = { ...RULE_TEMPLATES.find((r) => r.ruleId === 'hyperfocus')!, id: 'r1' };
  const equilibrium = { ...RULE_TEMPLATES.find((r) => r.ruleId === 'equilibrium')!, id: 'r2' };

  state.players.p1.rules = [hyperfocus];
  state.mainStack = [equilibrium, ...state.mainStack];

  state = drawTurnCards(state);
  assert.equal(state.phase, 'resolve_conflict', 'Same domain rule should trigger conflict');

  state = resolveRuleConflict(state, 'incoming');
  assert.equal(state.players.p1.rules.length, 1);
  assert.equal(state.players.p1.rules[0].ruleId, 'equilibrium');
  console.log('✓ testRuleConflictResolution passed');
}

function testVictoryAndBankruptcy() {
  let state = createInitialGameState('local_2p');
  state.players.p1.parameters['카페인'] = 15;
  state = endTurn(state);
  assert.equal(state.phase, 'game_over');
  assert.equal(state.winner, 'p1');

  let state2 = createInitialGameState('local_2p');
  state2.players.p1.parameters['월세'] = -12;
  state2 = endTurn(state2);
  assert.equal(state2.phase, 'game_over');
  assert.equal(state2.winner, 'p2', 'P1 bankruptcy should award win to P2');
  console.log('✓ testVictoryAndBankruptcy passed');
}

testInitialDeckAndDraw();
testParameterApplicationAndEndTurn();
testRuleConflictResolution();
testVictoryAndBankruptcy();
console.log('All engine tests passed!');

import { getDifficultyProfile } from '../src/engine/difficulty.ts';

function testDifficultyNonLinearCurves() {
  const p01 = getDifficultyProfile(0.1);
  const p35 = getDifficultyProfile(3.5);
  const p50 = getDifficultyProfile(5.0);
  const p51 = getDifficultyProfile(5.1);
  const p10 = getDifficultyProfile(10.0);

  // Phase I: minus probability and dice expected value both rise from 0.1 to 5.0
  assert.ok(p01.paramMinusProb < p35.paramMinusProb);
  assert.ok(p35.paramMinusProb < p50.paramMinusProb);
  assert.ok(p01.diceExpectedValue < p35.diceExpectedValue);
  assert.ok(p35.diceExpectedValue < p50.diceExpectedValue);

  // Phase II: 5.1 ~ 10.0 reverts paramMinusProb to 3.5 (0.50), while hazardShare increases
  assert.equal(p51.paramMinusProb, p35.paramMinusProb, '5.1 should match 3.5 param ratio');
  assert.equal(p10.paramMinusProb, p35.paramMinusProb, '10.0 should match 3.5 param ratio');
  assert.ok(p51.hazardShare > p50.hazardShare);
  assert.ok(p10.hazardShare > p51.hazardShare);
  assert.ok(p10.ruleCount > p51.ruleCount);

  // Verify deck sizes at extreme difficulties
  const g10 = createInitialGameState('vs_ai', 10.0);
  assert.equal(g10.difficulty, 10.0);
  assert.equal(g10.mainStack.length, 40);
  assert.equal(g10.diceStack.length, 24);
  console.log('✓ testDifficultyNonLinearCurves passed');
}

testDifficultyNonLinearCurves();

import { applyDieToTimeBomb } from '../src/engine/gameEngine.ts';

function testTimeBombExplosionRemovesCard() {
  let state = createInitialGameState('local_2p', 3.5);
  const bomb = {
    ...RULE_TEMPLATES.find((r) => r.ruleId === 'time_bomb')!,
    id: 'tb-1',
    counterValue: 4,
  };
  state.players.p1.rules = [bomb];
  state.phase = 'resolve_action';
  state.drawnDice = [
    { id: 'd-bomb', value: 5 },
    { id: 'd-other', value: 2 },
  ];

  state = applyDieToTimeBomb(state, 'd-bomb');

  assert.equal(
    state.players.p1.rules.some((r) => r.id === 'tb-1'),
    false,
    'Time bomb should be removed from rules when counter reaches 0'
  );
  assert.equal(
    state.mainSecondaryStack.some((c) => c.id === 'tb-1'),
    true,
    'Time bomb should move to mainSecondaryStack after exploding'
  );
  assert.equal(
    state.players.p1.parameters['카페인'],
    -3,
    'All parameters should decrease by 3 on explosion'
  );
  console.log('✓ testTimeBombExplosionRemovesCard passed');
}

testTimeBombExplosionRemovesCard();

import { canPlayerDraw, drawFromStack } from '../src/engine/gameEngine.ts';
import { getPlayerConditions } from '../src/engine/conditions.ts';
import {
  activateManualRule,
  getDieOptions,
  getRuleActivation,
  performDieOption,
} from '../src/engine/interaction.ts';

function testSplitStackDraws() {
  let state = createInitialGameState('local_2p');
  state.mainStack = [
    { id: 'p-split', kind: 'parameter', paramName: '배터리', sign: '+', flavor: 'test' },
    ...state.mainStack,
  ];

  assert.equal(canPlayerDraw(state, 'p2', 'main'), false, 'Only the active player may draw');
  assert.equal(drawFromStack(state, 'main', 'p2'), state, 'Off-turn draw is ignored');

  state = drawFromStack(state, 'main');
  assert.equal(state.phase, 'ready_to_draw', 'Waits for the dice draw');
  assert.equal(state.drawnMainCards[0].id, 'p-split');
  assert.equal(canPlayerDraw(state, 'p1', 'main'), false, 'Main stack draws once per turn');

  state = drawFromStack(state, 'dice');
  assert.equal(state.drawnDice.length, 2);
  assert.equal(state.phase, 'resolve_action', 'Both draws done → resolve the parameter card');

  state = performDieOption(state, state.drawnDice[0].id, 'param');
  state = endTurn(state);
  assert.equal(state.mainDrawnThisTurn, false, 'Draw flags reset at turn end');
  assert.equal(canPlayerDraw(state, 'p2', 'dice'), true);
  console.log('✓ testSplitStackDraws passed');
}

function testStacksRefillAtTurnEnd() {
  let state = createInitialGameState('local_2p');
  state.mainSecondaryStack = [...state.mainStack];
  state.mainStack = [];
  state.phase = 'turn_end_ready';
  state = endTurn(state);
  assert.equal(state.mainStack.length, 40, 'Secondary stack is reshuffled into the main stack');
  assert.equal(state.mainSecondaryStack.length, 0);
  console.log('✓ testStacksRefillAtTurnEnd passed');
}

function testConditionsFollowRules() {
  const base = getPlayerConditions([], { a: 0 }, 'P');
  assert.deepEqual(base.wins.map((w) => w.id), ['single', 'triple', 'sum']);
  assert.equal(base.bankruptcyLimit, -12);

  const iron = { ...RULE_TEMPLATES.find((r) => r.ruleId === 'iron_will')!, id: 'iw' };
  const ironCond = getPlayerConditions([iron], { a: 17 }, 'P');
  assert.equal(ironCond.bankruptcyLimit, -18);
  assert.equal(ironCond.wins[0].met, false, '+17 is below the iron-will target of +18');

  const abyss = { ...RULE_TEMPLATES.find((r) => r.ruleId === 'abyssal_pact')!, id: 'ab' };
  const abyssCond = getPlayerConditions([abyss], { a: -10 }, 'P');
  assert.equal(abyssCond.loss, null, 'Abyssal pact removes bankruptcy');
  assert.equal(abyssCond.wins[0].id, 'abyss');
  assert.equal(abyssCond.wins[0].met, true);
  console.log('✓ testConditionsFollowRules passed');
}

function testRuleActivationAndDieOptions() {
  let state = createInitialGameState('local_2p');
  const flip = { ...RULE_TEMPLATES.find((r) => r.ruleId === 'sign_flip')!, id: 'sf' };
  const bomb = { ...RULE_TEMPLATES.find((r) => r.ruleId === 'time_bomb')!, id: 'tb', counterValue: 10 };
  state.players.p1.rules = [flip, bomb];

  assert.equal(getRuleActivation(state, 'p1', flip).status, 'idle', 'Manual rule idle before resolving');
  assert.equal(getRuleActivation(state, 'p1', bomb).status, 'forced', 'Time bomb is forced this turn');
  assert.equal(getRuleActivation(state, 'p2', flip).kind, 'manual');

  state.mainStack = [
    { id: 'p-flip', kind: 'parameter', paramName: '월세', sign: '-', flavor: 'test' },
    ...state.mainStack,
  ];
  state.diceStack = [{ id: 'd-a', value: 2 }, { id: 'd-b', value: 6 }, ...state.diceStack];
  state = drawFromStack(drawFromStack(state, 'main'), 'dice');
  assert.equal(state.phase, 'resolve_action');
  assert.equal(getRuleActivation(state, 'p1', flip).status, 'ready');

  state = activateManualRule(state, 'p1', 'sf');
  assert.equal(state.signFlipActiveThisTurn, true, 'Clicking a ready manual rule activates it');

  const opts = getDieOptions(state, 'd-b');
  assert.deepEqual(opts.map((o) => o.id), ['param', 'time_bomb']);
  state = performDieOption(state, 'd-b', 'param');
  assert.equal(state.players.p1.parameters['월세'], 6, 'Sign flip turns - into +');

  const last = getDieOptions(state, 'd-a');
  assert.deepEqual(last.map((o) => o.id), ['time_bomb'], 'Only the time bomb remains for the last die');
  state = performDieOption(state, 'd-a', 'time_bomb');
  assert.equal(state.players.p1.rules.find((r) => r.id === 'tb')!.counterValue, 8);
  assert.equal(state.phase, 'turn_end_ready');
  console.log('✓ testRuleActivationAndDieOptions passed');
}

testSplitStackDraws();
testStacksRefillAtTurnEnd();
testConditionsFollowRules();
testRuleActivationAndDieOptions();
