const STORAGE_KEY = 'expense-tracker-v1';
const DEFERRED_KEY = 'expense-tracker-deferred-v1';
const DEFAULT_CATEGORIES = ['Работа', 'Подарок', 'Заказ', 'Еда', 'Транспорт', 'Покупки'];
const COLORS = ['#4DD4F5', '#5B7CFA', '#8C97F7', '#B9A7FF', '#F7A8C9', '#7FE6D0', '#A3C4FF', '#E8EAFF'];

function load(storage, key = STORAGE_KEY) {
  try {
    return JSON.parse(storage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function save(storage, items, key = STORAGE_KEY) {
  storage.setItem(key, JSON.stringify(items));
}

const iso = (d) => d.toISOString().slice(0, 10);

// Диапазон дат [from, to] (YYYY-MM-DD) для периода, который содержит дату anchor
function periodRange(period, anchor) {
  const d = new Date(anchor + 'T00:00:00Z');
  if (period === 'day') return { from: anchor, to: anchor };
  if (period === 'week') {
    const start = new Date(d);
    start.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { from: iso(start), to: iso(end) };
  }
  if (period === 'month') {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
  }
  const y = d.getUTCFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

// kind — какой тип попадает в список и диаграмму; доходы/расходы считаются всегда
function summarize(items, from, to, kind = 'expense') {
  let income = 0;
  let expense = 0;
  const byCategory = new Map();
  const transactions = [];

  for (const t of items) {
    if (t.date < from || t.date > to) continue;
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
    if (t.type !== kind) continue;
    transactions.push(t);
    byCategory.set(t.category, (byCategory.get(t.category) || 0) + t.amount);
  }

  const total = kind === 'income' ? income : expense;
  const top = [...byCategory]
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount, share: amount / total }));

  transactions.sort((a, b) => b.date.localeCompare(a.date));
  return { income, expense, balance: income - expense, total, top, transactions };
}

function addTransaction(items, t) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return [...items, { ...t, id, amount: Number(t.amount) }];
}

function removeTransaction(items, id) {
  return items.filter((t) => t.id !== id);
}

// Добавляет записи, id которых ещё нет (для импорта с другого устройства)
function mergeTransactions(items, incoming) {
  const known = new Set(items.map((t) => t.id));
  return [...items, ...incoming.filter((t) => t && t.id && !known.has(t.id))];
}

// Отложенная покупка → расход на дату date (название становится категорией)
function toExpense(item, date) {
  return { type: 'expense', amount: item.amount, category: item.name, date, note: item.note || '' };
}

// Файл экспорта: { transactions, deferred }; старый формат — просто массив записей
function parseImport(data) {
  if (Array.isArray(data)) return { transactions: data, deferred: [] };
  if (data && typeof data === 'object') {
    return {
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      deferred: Array.isArray(data.deferred) ? data.deferred : [],
    };
  }
  throw new Error('bad import');
}

function allCategories(items) {
  return [...new Set([...DEFAULT_CATEGORIES, ...items.map((t) => t.category)])].sort((a, b) =>
    a.localeCompare(b, 'ru')
  );
}

function todayLocal() {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function init() {
  const $ = (id) => document.getElementById(id);
  const el = {
    anchor: $('anchor'),
    export: $('export'),
    import: $('import'),
    fab: $('fab'),
    income: $('income'),
    expense: $('expense'),
    balance: $('balance'),
    total: $('total'),
    donut: $('donut'),
    incomeCats: $('incomeCats'),
    expenseCats: $('expenseCats'),
    form: $('form'),
    type: $('type'),
    amount: $('amount'),
    category: $('category'),
    date: $('date'),
    note: $('note'),
    categories: $('categories'),
    list: $('list'),
    listTitle: $('listTitle'),
    formTitle: $('formTitle'),
    dform: $('dform'),
    dname: $('dname'),
    damount: $('damount'),
    dnote: $('dnote'),
  };

  const fmt = (n) =>
    n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';

  const state = { kind: 'expense', period: 'month', anchor: todayLocal(), view: 'records' };
  let items = load(localStorage);
  let deferredItems = load(localStorage, DEFERRED_KEY);
  el.anchor.value = state.anchor;
  el.date.value = todayLocal();

  function node(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function render() {
    const deferredView = state.view === 'deferred';
    document.querySelectorAll('[data-kind]').forEach((b) =>
      b.classList.toggle('active', !deferredView && b.dataset.kind === state.kind)
    );
    document.querySelectorAll('[data-view]').forEach((b) =>
      b.classList.toggle('active', deferredView)
    );
    el.form.hidden = deferredView;
    el.dform.hidden = !deferredView;
    el.formTitle.textContent = deferredView ? 'Отложенная покупка' : 'Новая запись';
    el.listTitle.textContent = deferredView ? 'Отложенные покупки' : 'Записи';
    document.querySelectorAll('[data-period]').forEach((b) =>
      b.classList.toggle('active', b.dataset.period === state.period)
    );
    document.querySelectorAll('.col').forEach((c) =>
      c.classList.toggle('active', c.dataset.col === state.kind)
    );

    const { from, to } = periodRange(state.period, state.anchor);
    const s = summarize(items, from, to, state.kind);
    const sIncome = summarize(items, from, to, 'income');
    const sExpense = summarize(items, from, to, 'expense');

    el.income.textContent = fmt(sIncome.income);
    el.expense.textContent = fmt(sExpense.expense);
    el.balance.textContent = fmt(s.balance);
    el.total.textContent = fmt(s.total);

    let acc = 0;
    const stops = s.top.map((c, i) => {
      const start = acc;
      acc += c.share * 100;
      return `${COLORS[i % COLORS.length]} ${start}% ${acc}%`;
    });
    el.donut.style.background = stops.length
      ? `conic-gradient(${stops.join(', ')})`
      : 'conic-gradient(#272b35 0 100%)';

    el.categories.replaceChildren(
      ...allCategories(items).map((c) => {
        const o = node('option');
        o.value = c;
        return o;
      })
    );

    const catList = (ul, top) =>
      ul.replaceChildren(
        ...(top.length
          ? top.map((c, i) => {
              const dot = node('span', '', 'dot');
              dot.style.background = COLORS[i % COLORS.length];
              const row = node('li', undefined, 'cat');
              row.append(dot, node('span', c.category, 'name'), node('span', fmt(c.amount), 'amount'));
              return row;
            })
          : [node('li', 'Нет записей', 'muted')])
      );
    catList(el.incomeCats, sIncome.top);
    catList(el.expenseCats, sExpense.top);

    if (deferredView) {
      el.list.replaceChildren(
        ...(deferredItems.length
          ? deferredItems.map((d) => {
              const row = node('li', undefined, 'drow');
              const info = node('div', undefined, 'dinfo');
              info.append(node('span', d.name), node('span', d.note || '', 'muted'));
              const buy = node('button', 'Купил', 'buy');
              buy.dataset.id = d.id;
              const del = node('button', '✕', 'del');
              del.dataset.id = d.id;
              del.title = 'Удалить';
              row.append(info, node('span', fmt(d.amount), 'amt'), buy, del);
              return row;
            })
          : [node('li', 'Отложенных покупок нет', 'muted')])
      );
      return;
    }

    el.list.replaceChildren(
      ...(s.transactions.length
        ? s.transactions.map((t) => {
            const row = node('li');
            const del = node('button', '✕', 'del');
            del.dataset.id = t.id;
            del.title = 'Удалить';
            row.append(
              node('span', t.date.slice(8) + '.' + t.date.slice(5, 7), 'muted'),
              node('span', t.category),
              node('span', t.note || '', 'muted'),
              node('span', (t.type === 'income' ? '+' : '−') + fmt(t.amount), t.type),
              del
            );
            return row;
          })
        : [node('li', 'Записей за период нет', 'muted')])
    );
  }

  function commit(next) {
    items = next;
    save(localStorage, items);
    render();
  }

  function commitDeferred(next) {
    deferredItems = next;
    save(localStorage, deferredItems, DEFERRED_KEY);
    render();
  }

  document.querySelectorAll('[data-kind]').forEach((b) =>
    b.addEventListener('click', () => {
      state.kind = b.dataset.kind;
      state.view = 'records';
      render();
    })
  );
  document.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => {
      state.view = state.view === 'deferred' ? 'records' : 'deferred';
      render();
    })
  );
  document.querySelectorAll('.col').forEach((c) =>
    c.addEventListener('click', () => {
      state.kind = c.dataset.col;
      render();
    })
  );
  document.querySelectorAll('[data-period]').forEach((b) =>
    b.addEventListener('click', () => {
      state.period = b.dataset.period;
      render();
    })
  );
  el.anchor.addEventListener('input', () => {
    if (el.anchor.value) state.anchor = el.anchor.value;
    render();
  });

  const syncFormPicks = () => {
    document.querySelectorAll('[data-type]').forEach((b) =>
      b.classList.toggle('active', b.dataset.type === el.type.value)
    );
    document.querySelectorAll('.pick').forEach((b) =>
      b.classList.toggle('active', b.dataset.cat === el.category.value.trim())
    );
  };
  document.querySelectorAll('[data-type]').forEach((b) =>
    b.addEventListener('click', () => {
      el.type.value = b.dataset.type;
      syncFormPicks();
    })
  );
  document.querySelectorAll('.pick').forEach((b) =>
    b.addEventListener('click', () => {
      el.category.value = b.dataset.cat;
      syncFormPicks();
    })
  );
  el.category.addEventListener('input', syncFormPicks);

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = Number(el.amount.value);
    const category = el.category.value.trim();
    if (!(amount > 0) || !category) return;

    commit(
      addTransaction(items, {
        type: el.type.value,
        amount,
        category,
        date: el.date.value,
        note: el.note.value.trim(),
      })
    );
    el.amount.value = '';
    el.note.value = '';
    el.amount.focus();
  });

  el.dform.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = Number(el.damount.value);
    const name = el.dname.value.trim();
    if (!(amount > 0) || !name) return;

    commitDeferred(addTransaction(deferredItems, { name, amount, note: el.dnote.value.trim() }));
    el.dname.value = '';
    el.damount.value = '';
    el.dnote.value = '';
    el.dname.focus();
  });

  el.fab.addEventListener('click', () => {
    const target = state.view === 'deferred' ? el.dform : el.form;
    target.scrollIntoView({ behavior: 'smooth' });
    (state.view === 'deferred' ? el.dname : el.amount).focus();
  });

  el.list.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (state.view === 'deferred') {
      if (btn.classList.contains('buy')) {
        const item = deferredItems.find((d) => d.id === btn.dataset.id);
        if (!item) return;
        commit(addTransaction(items, toExpense(item, todayLocal())));
        commitDeferred(removeTransaction(deferredItems, btn.dataset.id));
      } else if (btn.classList.contains('del')) {
        commitDeferred(removeTransaction(deferredItems, btn.dataset.id));
      }
      return;
    }
    if (btn.classList.contains('del')) commit(removeTransaction(items, btn.dataset.id));
  });

  el.export.addEventListener('click', () => {
    const data = { transactions: items, deferred: deferredItems };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `expenses-${todayLocal()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  el.import.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { transactions, deferred } = parseImport(JSON.parse(await file.text()));
      const before = items.length + deferredItems.length;
      items = mergeTransactions(items, transactions);
      deferredItems = mergeTransactions(deferredItems, deferred);
      save(localStorage, items);
      save(localStorage, deferredItems, DEFERRED_KEY);
      render();
      alert(`Добавлено записей: ${items.length + deferredItems.length - before}`);
    } catch {
      alert('Не удалось прочитать файл. Нужен JSON, сохранённый этим приложением.');
    }
  });

  // Real-time: обновляем при изменениях из другой вкладки
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) items = load(localStorage);
    else if (e.key === DEFERRED_KEY) deferredItems = load(localStorage, DEFERRED_KEY);
    else return;
    render();
  });

  render();
}

if (typeof document !== 'undefined') {
  init();
} else {
  module.exports = {
    load,
    save,
    periodRange,
    summarize,
    addTransaction,
    removeTransaction,
    mergeTransactions,
    allCategories,
    toExpense,
    parseImport,
  };
}
