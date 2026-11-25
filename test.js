const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, addTransaction, removeTransaction, monthOf, load, save } = require('./script.js');

const sample = [
  { id: '1', type: 'expense', amount: 500, category: 'Работа', date: '2026-11-03' },
  { id: '2', type: 'expense', amount: 1200, category: 'Подарок', date: '2026-11-10' },
  { id: '3', type: 'expense', amount: 300, category: 'Работа', date: '2026-11-20' },
  { id: '4', type: 'income', amount: 5000, category: 'Зарплата', date: '2026-11-01' },
  { id: '5', type: 'expense', amount: 999, category: 'Заказ', date: '2026-10-31' },
];

test('summarize считает доходы, расходы и баланс только за месяц', () => {
  const s = summarize(sample, '2026-11');
  assert.equal(s.income, 5000);
  assert.equal(s.expense, 2000);
  assert.equal(s.balance, 3000);
});

test('top расходов отсортирован по сумме с долями', () => {
  const s = summarize(sample, '2026-11');
  assert.deepEqual(
    s.top.map((c) => [c.category, c.amount]),
    [['Подарок', 1200], ['Работа', 800]]
  );
  assert.equal(s.top[0].share, 0.6);
});

test('пустой месяц даёт нули и пустой топ', () => {
  const s = summarize(sample, '2030-01');
  assert.deepEqual([s.income, s.expense, s.balance, s.top.length], [0, 0, 0, 0]);
});

test('addTransaction приводит сумму к числу и даёт id, не мутируя исходный массив', () => {
  const before = sample.length;
  const next = addTransaction(sample, { type: 'expense', amount: '42.5', category: 'Еда', date: '2026-11-05', note: '' });
  assert.equal(sample.length, before);
  assert.equal(next.length, before + 1);
  assert.equal(next.at(-1).amount, 42.5);
  assert.ok(next.at(-1).id);
});

test('removeTransaction удаляет по id', () => {
  assert.equal(removeTransaction(sample, '1').some((t) => t.id === '1'), false);
});

test('monthOf берёт YYYY-MM', () => {
  assert.equal(monthOf('2026-11-25'), '2026-11');
});

test('load возвращает [] при битых данных, save/load round-trip', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(load(storage), []);
  mem.set('expense-tracker-v1', '{broken');
  assert.deepEqual(load(storage), []);
  save(storage, sample);
  assert.deepEqual(load(storage), sample);
});
