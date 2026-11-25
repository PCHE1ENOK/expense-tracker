const STORAGE_KEY = 'expense-tracker-v1';
const DEFAULT_CATEGORIES = ['Работа', 'Подарок', 'Заказ', 'Еда', 'Транспорт', 'Покупки'];

function load(storage) {
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function save(storage, items) {
  storage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function monthOf(date) {
  return date.slice(0, 7);
}

function summarize(items, month) {
  const inMonth = items.filter((t) => monthOf(t.date) === month);
  let income = 0;
  let expense = 0;
  const byCategory = new Map();

  for (const t of inMonth) {
    if (t.type === 'income') {
      income += t.amount;
    } else {
      expense += t.amount;
      byCategory.set(t.category, (byCategory.get(t.category) || 0) + t.amount);
    }
  }

  const top = [...byCategory]
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount, share: amount / expense }));

  const transactions = inMonth.sort((a, b) => b.date.localeCompare(a.date));
  return { income, expense, balance: income - expense, top, transactions };
}

function addTransaction(items, t) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return [...items, { ...t, id, amount: Number(t.amount) }];
}

function removeTransaction(items, id) {
  return items.filter((t) => t.id !== id);
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
    month: $('month'),
    income: $('income'),
    expense: $('expense'),
    balance: $('balance'),
    form: $('form'),
    type: $('type'),
    amount: $('amount'),
    category: $('category'),
    date: $('date'),
    note: $('note'),
    categories: $('categories'),
    top: $('top'),
    list: $('list'),
  };

  const fmt = (n) =>
    n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';

  let items = load(localStorage);
  el.month.value = monthOf(todayLocal());
  el.date.value = todayLocal();

  function li(...children) {
    const node = document.createElement('li');
    node.append(...children);
    return node;
  }

  function span(text, cls) {
    const node = document.createElement('span');
    node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }

  function render() {
    const s = summarize(items, el.month.value);
    el.income.textContent = fmt(s.income);
    el.expense.textContent = fmt(s.expense);
    el.balance.textContent = fmt(s.balance);

    el.categories.replaceChildren(
      ...allCategories(items).map((c) => {
        const o = document.createElement('option');
        o.value = c;
        return o;
      })
    );

    el.top.replaceChildren(
      ...(s.top.length
        ? s.top.map((c) => {
            const bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.width = (c.share * 100).toFixed(1) + '%';
            return li(
              span(c.category),
              span(`${fmt(c.amount)} · ${(c.share * 100).toFixed(0)}%`, 'muted'),
              bar
            );
          })
        : [li(span('Расходов за месяц пока нет', 'muted'))])
    );

    el.list.replaceChildren(
      ...(s.transactions.length
        ? s.transactions.map((t) => {
            const row = li(
              span(t.date.slice(8) + '.' + t.date.slice(5, 7), 'muted'),
              span(t.category),
              span(t.note || '', 'muted'),
              span((t.type === 'income' ? '+' : '−') + fmt(t.amount), t.type)
            );
            const del = document.createElement('button');
            del.textContent = '✕';
            del.className = 'del';
            del.dataset.id = t.id;
            del.title = 'Удалить';
            row.append(del);
            return row;
          })
        : [li(span('Записей за месяц нет', 'muted'))])
    );
  }

  function commit(next) {
    items = next;
    save(localStorage, items);
    render();
  }

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

  el.list.addEventListener('click', (e) => {
    const id = e.target.dataset?.id;
    if (id && e.target.classList.contains('del')) commit(removeTransaction(items, id));
  });

  el.month.addEventListener('input', render);

  // Real-time: обновляем при изменениях из другой вкладки
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      items = load(localStorage);
      render();
    }
  });

  render();
}

if (typeof document !== 'undefined') {
  init();
} else {
  module.exports = { load, save, monthOf, summarize, addTransaction, removeTransaction, allCategories };
}
