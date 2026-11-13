import { newBudget, shiftMonth, today } from './budget';

export function exampleBudget(now = today()) {
  const period = now.slice(0, 7);
  const bill = (id, title, category, amount, day, status) => ({
    id, title, category, amount, date: period + '-' + day, status,
  });
  const item = (id, name, category, quantity, unit) => ({ id, name, category, quantity, unit });

  return {
    ...newBudget(),
    salaries: { [period]: 460000 },
    income: [{ id: 'example-income', title: 'Trabalho freelancer', amount: 75000, date: period + '-10' }],
    bills: [
      bill('example-rent', 'Aluguel', 'Moradia', 180000, '05', 'paid'),
      bill('example-water', 'Conta de água', 'Água', 9840, '08', 'paid'),
      bill('example-energy', 'Energia elétrica', 'Energia', 21560, '09', 'pending'),
      bill('example-net', 'Internet residencial', 'Internet e telefone', 11990, '12', 'paid'),
      bill('example-health', 'Plano de saúde', 'Saúde', 32990, '18', 'pending'),
      bill('example-transport', 'Transporte mensal', 'Transporte', 28020, '22', 'pending'),
    ],
    groceries: [
      { id: 'example-market-1', title: 'Compra da semana', amount: 45860, date: period + '-03', items: [
        item('item-1', 'Carnes variadas', 'Carnes', 1, 18990),
        item('item-2', 'Frutas e verduras', 'Hortifrúti', 1, 9850),
        item('item-3', 'Arroz, feijão e massas', 'Mercearia', 1, 10230),
        item('item-4', 'Produtos de limpeza', 'Limpeza', 1, 6790),
      ] },
      { id: 'example-market-2', title: 'Supermercado', amount: 28765, date: period + '-11', items: [
        item('item-5', 'Laticínios e ovos', 'Laticínios', 1, 9435),
        item('item-6', 'Produtos de mercearia', 'Mercearia', 1, 13990),
        item('item-7', 'Hortifrúti', 'Hortifrúti', 1, 5340),
      ] },
      ...[89920, 101950, 84470].map((amount, index) => ({
        id: 'example-past-' + index, title: 'Feira do mês', amount, date: shiftMonth(period, -index - 1) + '-10', items: [],
      })),
    ],
    goals: [
      { id: 'example-reserve', name: 'Reserva de emergência', target: 600000, initial: 90000,
        deposits: [{ id: 'example-deposit', amount: 25000, date: period + '-13' }] },
      { id: 'example-course', name: 'Curso profissional', target: 240000, initial: 40000, deposits: [] },
    ],
  };
}
