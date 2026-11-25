const test = require('node:test');
const assert = require('node:assert/strict');
const {
  summarize,
  addTransaction,
  removeTransaction,
  mergeTransactions,
  periodRange,
  load,
  save,
  toExpense,
  parseImport,
  mergeData,
  gistBody,
  readGist,
} = require('./script.js');

const sample = [
  { id: '1', type: 'expense', amount: 500, category: 'Работа', date: '2026-11-03' },
  { id: '2', type: 'expense', amount: 1200, category: 'Подарок', date: '2026-11-10' },
  { id: '3', type: 'expense', amount: 300, category: 'Работа', date: '2026-11-20' },
  { id: '4', type: 'income', amount: 5000, category: 'Зарплата', date: '2026-11-01' },
  { id: '5', type: 'expense', amount: 999, category: 'Заказ', date: '2026-10-31' },
];
const NOV = ['2026-11-01', '2026-11-30'];

test('summarize считает доходы, расходы и баланс за период', () => {
  const s = summarize(sample, ...NOV);
  assert.equal(s.income, 5000);
  assert.equal(s.expense, 2000);
  assert.equal(s.balance, 3000);
});

test('top расходов отсортирован по сумме с долями', () => {
  const s = summarize(sample, ...NOV);
  assert.deepEqual(
    s.top.map((c) => [c.category, c.amount]),
    [['Подарок', 1200], ['Работа', 800]]
  );
  assert.equal(s.top[0].share, 0.6);
});

test('kind=income даёт топ доходов и список только доходов', () => {
  const s = summarize(sample, ...NOV, 'income');
  assert.equal(s.total, 5000);
  assert.deepEqual(s.top.map((c) => c.category), ['Зарплата']);
  assert.equal(s.transactions.length, 1);
});

test('пустой период даёт нули и пустой топ', () => {
  const s = summarize(sample, '2030-01-01', '2030-01-31');
  assert.deepEqual([s.income, s.expense, s.balance, s.top.length], [0, 0, 0, 0]);
});

test('periodRange: день, неделя (пн–вс), месяц, год', () => {
  assert.deepEqual(periodRange('day', '2026-11-25'), { from: '2026-11-25', to: '2026-11-25' });
  assert.deepEqual(periodRange('week', '2026-11-25'), { from: '2026-11-23', to: '2026-11-29' });
  assert.deepEqual(periodRange('week', '2026-11-01'), { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(periodRange('month', '2026-02-10'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(periodRange('year', '2026-11-25'), { from: '2026-01-01', to: '2026-12-31' });
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

test('mergeTransactions добавляет только новые id', () => {
  const incoming = [sample[0], { id: 'x', type: 'income', amount: 1, category: 'Еда', date: '2026-11-02' }];
  const merged = mergeTransactions(sample, incoming);
  assert.equal(merged.length, sample.length + 1);
  assert.equal(merged.at(-1).id, 'x');
});

test('отложенная покупка: добавление, перевод в расход и удаление не трогают записи', () => {
  const deferred = addTransaction([], { name: 'Наушники', amount: '4990', note: 'после премии' });
  assert.equal(deferred.length, 1);
  assert.equal(deferred[0].amount, 4990);
  assert.ok(deferred[0].id);

  const expense = toExpense(deferred[0], '2026-11-25');
  assert.deepEqual(expense, { type: 'expense', amount: 4990, category: 'Наушники', date: '2026-11-25', note: 'после премии' });

  const records = addTransaction(sample, expense);
  assert.equal(records.length, sample.length + 1);
  assert.equal(summarize(records, '2026-11-01', '2026-11-30').expense, 6990);
  assert.equal(removeTransaction(deferred, deferred[0].id).length, 0);
});

test('parseImport: старый массив и новый объект с отложенным', () => {
  assert.deepEqual(parseImport(sample), { transactions: sample, deferred: [] });
  const d = [{ id: 'd1', name: 'Книга', amount: 800 }];
  assert.deepEqual(parseImport({ transactions: sample, deferred: d }), { transactions: sample, deferred: d });
  assert.deepEqual(parseImport({}), { transactions: [], deferred: [] });
  assert.throws(() => parseImport('нет'));
});

test('load/save с отдельным ключом не смешивает записи и отложенное', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  save(storage, sample);
  save(storage, [{ id: 'd1', name: 'Книга', amount: 800 }], 'expense-tracker-deferred-v1');
  assert.deepEqual(load(storage), sample);
  assert.deepEqual(load(storage, 'expense-tracker-deferred-v1'), [{ id: 'd1', name: 'Книга', amount: 800 }]);
});

test('mergeData объединяет записи и отложенное по id без дублей', () => {
  const local = { transactions: sample, deferred: [{ id: 'd1', name: 'Книга', amount: 800 }] };
  const remote = {
    transactions: [sample[0], { id: 'r1', type: 'income', amount: 100, category: 'Еда', date: '2026-11-02' }],
    deferred: [{ id: 'd2', name: 'Чайник', amount: 150 }],
  };
  const m = mergeData(local, remote);
  assert.equal(m.transactions.length, sample.length + 1);
  assert.equal(m.transactions.at(-1).id, 'r1');
  assert.deepEqual(m.deferred.map((d) => d.id), ['d1', 'd2']);
});

test('gistBody: при создании приватный gist с одним файлом, при обновлении только файлы', () => {
  const data = { transactions: sample, deferred: [] };
  const created = gistBody(data, true);
  assert.equal(created.public, false);
  assert.deepEqual(Object.keys(created.files), ['expense-tracker.json']);
  assert.deepEqual(JSON.parse(created.files['expense-tracker.json'].content), data);
  const updated = gistBody(data);
  assert.equal('public' in updated, false);
  assert.deepEqual(Object.keys(updated), ['files']);
});

test('readGist: данные из ответа Gist, null при отсутствии или битом файле', () => {
  const data = { transactions: sample, deferred: [] };
  const gist = { files: { 'expense-tracker.json': { content: JSON.stringify(data) } } };
  assert.deepEqual(readGist(gist), data);
  assert.equal(readGist({ files: { 'other.txt': { content: '{}' } } }), null);
  assert.equal(readGist({ files: { 'expense-tracker.json': { content: '{broken' } } }), null);
  assert.equal(readGist(null), null);
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
