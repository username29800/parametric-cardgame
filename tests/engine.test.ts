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
