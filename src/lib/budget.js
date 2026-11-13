export const FIXED_CATEGORIES = [
  'Moradia', 'Energia', 'Água', 'Internet e telefone', 'Transporte', 'Saúde', 'Educação', 'Assinaturas', 'Outros',
];

export const GROCERY_CATEGORIES = [
  'Carnes', 'Hortifrúti', 'Mercearia', 'Laticínios', 'Limpeza', 'Higiene', 'Outros',
];

const currencyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const wholeNumberFormat = new Intl.NumberFormat('pt-BR');
const MAX_AMOUNT = 99_999_999_999;

export const money = (cents) => currencyFormat.format(cents / 100);
export const number = (value) => wholeNumberFormat.format(value);
export const sum = (items, selector = (item) => item.amount) => items.reduce((total, item) => total + selector(item), 0);

export function amountInput(cents) {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

// Os valores são armazenados e somados em centavos inteiros.
export function parseAmount(value, label = 'valor', allowZero = false) {
  const input = String(value ?? '').trim();
  const brazilian = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  const decimalWithDot = /^\d+\.\d{1,2}$/;
  let normalized;

  if (decimalWithDot.test(input)) normalized = input;
  else if (brazilian.test(input)) normalized = input.replaceAll('.', '').replace(',', '.');
  else throw new Error(`Informe um ${label} válido, como 120,50.`);

  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT || (!allowZero && cents === 0)) {
    throw new Error(`Informe um ${label} ${allowZero ? 'entre R$ 0,00 e' : 'maior que zero e de até'} R$ 999.999.999,99.`);
  }

  return cents;
}

export function parseQuantity(value) {
  const text = String(value ?? '').trim();
  const quantity = Number(text.replace(',', '.'));
  if (!/^\d{1,5}(?:[.,]\d{1,3})?$/.test(text) || quantity <= 0) {
    throw new Error('Informe uma quantidade positiva com até três casas decimais.');
  }
  return quantity;
}

export const itemTotal = (item) => Math.round(Math.round(item.quantity * 1000) * item.unit / 1000);

export function purchaseTotal(items) {
  const total = sum(items, itemTotal);
  if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_AMOUNT) {
    throw new Error('O total da compra precisa ficar entre R$ 0,01 e R$ 999.999.999,99.');
  }
  return total;
}

export function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`Preencha o campo ${label}.`);
  return text;
}

export function today(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');
}

export function dateLabel(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function monthLabel(period) {
  const [year, month] = period.split('-').map(Number);
  const text = monthFormat.format(new Date(year, month - 1, 1));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function shiftMonth(period, offset) {
  const [year, month] = period.split('-').map(Number);
  const shifted = new Date(year, month - 1 + offset, 1);
  return today(shifted).slice(0, 7);
}

export function lastDay(period) {
  const [year, month] = period.split('-').map(Number);
  return today(new Date(year, month, 0));
}

export function defaultDate(period) {
  const now = today();
  return now.startsWith(period) ? now : `${period}-01`;
}

export function requiredDate(value, period) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ||
      !value.startsWith(period + '-') || value < period + '-01' || value > lastDay(period)) {
    throw new Error('Informe uma data válida dentro do mês selecionado.');
  }
  return value;
}

export function id() {
  return crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16)).join('-');
}

export function newBudget() {
  return { version: 1, salaries: {}, income: [], bills: [], groceries: [], goals: [] };
}

export function saveRecord(records, record, recordId) {
  if (!recordId) return [...records, { ...record, id: id() }];
  if (!records.some((item) => item.id === recordId)) {
    throw new Error('Este registro foi removido em outra aba.');
  }

  return records.map((item) => item.id === recordId ? { ...item, ...record } : item);
}

export function goalProgress(goal, available) {
  const saved = goal.initial + sum(goal.deposits);
  const remaining = Math.max(0, goal.target - saved);
  return {
    saved,
    remaining,
    percentage: remaining === 0 ? 100 : Math.floor(saved / goal.target * 100),
    months: remaining === 0 ? 0 : available > 0 ? Math.ceil(remaining / available) : null,
  };
}

export function projectionText(months) {
  if (months === 0) return 'Meta concluída';
  if (months === null) return 'Sem saldo livre para projetar';
  return months === 1 ? 'Cerca de 1 mês' : `Cerca de ${number(months)} meses`;
}

export function groceryAverage(groceries, period, currentDate = today()) {
  const currentMonth = currentDate.slice(0, 7);
  const cutoff = period < currentMonth ? period : currentMonth;
  const totals = new Map();

  for (const purchase of groceries) {
    const month = purchase.date.slice(0, 7);
    if (month < cutoff) totals.set(month, (totals.get(month) ?? 0) + purchase.amount);
  }

  // Usa até três meses encerrados com compras. Meses sem registros ficam fora da previsão.
  const months = [...totals.keys()].sort().reverse().slice(0, 3);
  const value = months.length ? Math.round(sum(months, (month) => totals.get(month)) / months.length) : null;
  return { value, months };
}

export function summarize(budget, period, currentDate = today()) {
  const salary = budget.salaries[period] ?? 0;
  const inMonth = (record) => record.date.slice(0, 7) === period;
  const income = budget.income.filter(inMonth);
  const bills = budget.bills.filter(inMonth);
  const groceries = budget.groceries.filter(inMonth);
  const deposits = budget.goals.flatMap((goal) => goal.deposits.filter(inMonth)
    .map((deposit) => ({ ...deposit, goalId: goal.id, title: goal.name })));
  const incomeTotal = salary + sum(income);
  const paid = sum(bills.filter((bill) => bill.status === 'paid'));
  const fixed = sum(bills);
  const pending = fixed - paid;
  const groceryTotal = sum(groceries);
  const depositTotal = sum(deposits);
  const free = incomeTotal - fixed - groceryTotal - depositTotal;

  return {
    period, salary, income, bills, groceries, deposits, incomeTotal, fixed, paid, pending, groceryTotal, depositTotal, free,
    average: groceryAverage(budget.groceries, period, currentDate),
    goals: budget.goals.map((goal) => ({ ...goal, ...goalProgress(goal, free) })),
  };
}

export function tipsFor(summary, currentDate = today()) {
  const tips = [];

  if (summary.incomeTotal === 0) {
    tips.push({
      tone: 'info', icon: 'wallet2', title: 'Registre sua renda',
      detail: 'Cadastre o salário ou as rendas extras do mês para acompanhar quanto do orçamento as contas comprometem.',
    });
  } else if (summary.fixed > summary.incomeTotal / 2) {
    const share = number(Math.round(summary.fixed / summary.incomeTotal * 100));
    tips.push({
      tone: 'alert', icon: 'exclamation-circle', title: 'Contas fixas acima de 50% da renda',
      detail: `As contas fixas comprometem ${share}% da renda do mês. Revise assinaturas e compare os preços de serviços recorrentes.`,
    });
  }

  if (summary.free < 0) {
    tips.push({
      tone: 'alert', icon: 'graph-down-arrow', title: 'Orçamento acima da renda',
      detail: `Faltam ${money(-summary.free)} para cobrir as contas, a feira e os aportes registrados neste mês. Revise os valores antes de assumir novos gastos.`,
    });
  }

  const overdue = summary.bills.filter((bill) => bill.status === 'pending' && bill.date < currentDate);
  if (overdue.length) {
    tips.push({
      tone: 'alert', icon: 'calendar-exclamation', title: overdue.length === 1 ? '1 conta vencida' : `${overdue.length} contas vencidas`,
      detail: `Você tem ${money(sum(overdue))} em contas vencidas marcadas como pendentes. Confira a situação antes de atualizar o status.`,
    });
  }

  if (summary.average.value === null) {
    tips.push({
      tone: 'info', icon: 'basket2', title: 'Crie um histórico da feira',
      detail: 'Registre as compras por mês. A partir do primeiro mês encerrado com registros, o CashMap calcula a média para as próximas compras.',
    });
  } else if (summary.groceryTotal > summary.average.value) {
    tips.push({
      tone: 'alert', icon: 'basket2', title: 'Feira acima da média recente',
      detail: `As compras passaram ${money(summary.groceryTotal - summary.average.value)} da média histórica. Faça uma lista antes da próxima compra e compare o preço por quilo ou litro.`,
    });
  } else {
    tips.push({
      tone: 'info', icon: 'basket2', title: 'Use a média para planejar a feira',
      detail: `A média recente é de ${money(summary.average.value)}. Use esse valor como referência e anote os itens de maior custo.`,
    });
  }

  if (summary.free > 0 && summary.goals.some((goal) => goal.remaining > 0)) {
    tips.push({
      tone: 'good', icon: 'bullseye', title: 'Há saldo livre para uma meta',
      detail: `Restam ${money(summary.free)} depois dos compromissos registrados. Registre um aporte na meta quando separar parte desse valor.`,
    });
  }

  return tips;
}
