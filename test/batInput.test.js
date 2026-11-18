import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BatInput } from '../src/bat/batInput.js';

const pad = ({ a = false, b = false, stick = false, x = 0, y = 0 } = {}) => ({
  buttons: [{ pressed: false, value: 0 }, { pressed: false, value: 0 }, null, { pressed: stick }, { pressed: a }, { pressed: b }],
  axes: [0, 0, x, y],
});

test('A/X runs and B/Y goes back on either controller', () => {
  const got = [];
  const input = new BatInput({ onAction: (a, info) => got.push(`${a}@${info.controller}`) });
  input.update({ left: pad(), right: pad({ a: true }) }, { timeMs: 0 });
  input.update({ left: pad(), right: pad({ a: true }) }, { timeMs: 16 }); // held: no repeat
  input.update({ left: pad({ b: true }), right: pad() }, { timeMs: 400 });
  assert.deepEqual(got, ['run@right', 'back@left']);
});

test('dive only while running and never mid-swing', () => {
  const got = [];
  const input = new BatInput({ onAction: (a) => got.push(a) });
  input.update({ left: pad({ stick: true }) }, { timeMs: 0, running: false });
  input.update({ left: pad() }, { timeMs: 20, running: true });
  input.update({ left: pad({ x: 0.95 }) }, { timeMs: 40, running: true, batAngularSpeed: 15 });
  input.update({ left: pad() }, { timeMs: 60, running: true });
  input.update({ left: pad({ y: -1 }) }, { timeMs: 600, running: true });
  assert.deepEqual(got, ['dive']);
});
