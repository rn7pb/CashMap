import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import openSansRegular from '../assets/OpenSans-Regular.ttf?url';
import openSansBold from '../assets/OpenSans-Bold.ttf?url';
import { dateLabel, itemTotal, money, monthLabel, number, projectionText, sum } from './budget';

const ink = [29, 49, 45];
const green = [32, 86, 67];
const muted = [79, 100, 90];
const pale = [234, 243, 231];

async function loadFont(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar a fonte do relatório.');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Não foi possível abrir a fonte do relatório.'));
    reader.readAsDataURL(blob);
  });
}

export async function downloadReport(summary, tips, currentDate, isExample) {
  const [regular, bold] = await Promise.all([loadFont(openSansRegular), loadFont(openSansBold)]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('OpenSans-Regular.ttf', regular);
  doc.addFont('OpenSans-Regular.ttf', 'OpenSans', 'normal');
  doc.addFileToVFS('OpenSans-Bold.ttf', bold);
  doc.addFont('OpenSans-Bold.ttf', 'OpenSans', 'bold');
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 16;
  let y = 39;

  doc.setProperties({
    title: 'CashMap | Relatório financeiro de ' + monthLabel(summary.period),
    subject: 'Orçamento doméstico',
    creator: 'CashMap',
  });

  function table(title, columns, rows, emptyMessage) {
    if (y > height - 43) {
      doc.addPage();
      y = 24;
    }

    doc.setFont('OpenSans', 'bold').setFontSize(12).setTextColor(...ink);
    doc.text(title, margin, y);
    if (rows.length === 0) {
      doc.setFont('OpenSans', 'normal').setFontSize(9).setTextColor(...muted);
      doc.text(emptyMessage, margin, y + 7);
      y += 20;
      return;
    }

    autoTable(doc, {
      startY: y + 5,
      margin: { top: 24, bottom: 19, left: margin, right: margin },
      head: [columns],
      body: rows,
      theme: 'plain',
      styles: { font: 'OpenSans', fontSize: 9, textColor: ink, cellPadding: 2.6, overflow: 'linebreak' },
      headStyles: { fillColor: pale, textColor: green, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 249, 246] },
      rowPageBreak: 'avoid',
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  const sorted = (records) => [...records].sort((a, b) => a.date.localeCompare(b.date));
  const average = summary.average.value === null ? 'Sem histórico' : money(summary.average.value);

  table('Resumo financeiro', ['Indicador', 'Valor'], [
    ['Salário mensal', money(summary.salary)],
    ['Rendas extras', money(summary.incomeTotal - summary.salary)],
    ['Renda total', money(summary.incomeTotal)],
    ['Contas fixas pagas', money(summary.paid)],
    ['Contas fixas pendentes', money(summary.pending)],
    ['Total de despesas fixas', money(summary.fixed)],
    ['Despesas variáveis', money(summary.variableTotal)],
    ['Compras de feira', money(summary.groceryTotal)],
    ['Média móvel da feira', average],
    ['Aportes em metas no mês', money(summary.depositTotal)],
    ['Saldo livre após gastos e aportes', money(summary.free)],
    ['Valor guardado em todas as metas', money(sum(summary.goals, (goal) => goal.saved))],
  ]);
  table('Rendas extras', ['Descrição', 'Data', 'Valor'],
    sorted(summary.income).map((entry) => [entry.title, dateLabel(entry.date), money(entry.amount)]),
    'Sem rendas extras neste mês.');
  table('Despesas fixas', ['Conta', 'Categoria', 'Data', 'Status', 'Valor'],
    sorted(summary.bills).map((bill) => [
      bill.title, bill.category,
      bill.bankImport && !bill.paymentDate ? dateLabel(bill.date) + ' (extrato)'
        : dateLabel(bill.date) + (bill.paymentDate && bill.status === 'paid' ? '\nPago em ' + dateLabel(bill.paymentDate) : ''),
      bill.status === 'paid' ? 'Pago' : bill.date < currentDate ? 'Pendente (vencida)' : 'Pendente',
      money(bill.amount),
    ]), 'Sem despesas fixas neste mês.');
  if (summary.variableBills.length) {
    table('Despesas variáveis', ['Descrição', 'Categoria', 'Data', 'Valor'],
      sorted(summary.variableBills).map((bill) => [bill.title, bill.category, dateLabel(bill.date), money(bill.amount)]));
  }
  table('Compras de feira', ['Compra', 'Data', 'Itens', 'Total'],
    sorted(summary.groceries).map((purchase) => [
      purchase.title, dateLabel(purchase.date), number(purchase.items.length), money(purchase.amount),
    ]), 'Sem compras de feira neste mês.');

  const items = sorted(summary.groceries).flatMap((purchase) => purchase.items.map((item) => [
    purchase.title, item.name, item.category, number(item.quantity), money(item.unit), money(itemTotal(item)),
  ]));
  if (items.length) table('Itens das compras', ['Compra', 'Item', 'Categoria', 'Qtd.', 'Unitário', 'Subtotal'], items);

  table('Aportes em metas neste mês', ['Meta', 'Data', 'Valor'],
    sorted(summary.deposits).map((deposit) => [deposit.title, dateLabel(deposit.date), money(deposit.amount)]),
    'Sem aportes neste mês.');
  table('Metas e projeções', ['Meta', 'Guardado', 'Objetivo', 'Progresso', 'Projeção'],
    summary.goals.map((goal) => [
      goal.name, money(goal.saved), money(goal.target), goal.percentage + '%', projectionText(goal.months),
    ]), 'Sem metas cadastradas.');
  table('Sugestões do assistente', ['Assunto', 'Sugestão'], tips.map((tip) => [tip.title, tip.detail]));

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('OpenSans', 'bold').setTextColor(...green).setFontSize(page === 1 ? 19 : 11);
    doc.text(page === 1 ? 'CashMap | Relatório financeiro' : 'CashMap', margin, page === 1 ? 18 : 13);
    doc.setFont('OpenSans', 'normal').setFontSize(9).setTextColor(...muted);
    if (page === 1) {
      doc.text(monthLabel(summary.period) + (isExample ? '  |  Dados de exemplo' : ''), margin, 25);
      doc.text('Gerado em ' + dateLabel(currentDate), width - margin, 25, { align: 'right' });
    } else {
      doc.text(monthLabel(summary.period) + (isExample ? '  |  Dados de exemplo' : ''), width - margin, 13, { align: 'right' });
    }
    doc.setDrawColor(...pale).line(margin, page === 1 ? 30 : 17, width - margin, page === 1 ? 30 : 17);
    doc.line(margin, height - 15, width - margin, height - 15);
    doc.text('CashMap | Orçamento doméstico', margin, height - 10);
    doc.text(page + ' / ' + pageCount, width - margin, height - 10, { align: 'right' });
  }

  doc.save('CashMap-' + summary.period + '.pdf');
}
