import { dateLabel, money, projectionText, sum } from '../lib/budget';
import SpendingChart from './SpendingChart';
import { ActionLink, EmptyState, Icon, PanelTitle, Status } from './UI';

function Metric({ label, value, detail, icon, tone, href }) {
  const body = (
    <>
      <span className={'metric-icon metric-icon-' + tone}><Icon name={icon} /></span>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <small className="metric-detail">{detail}</small>
    </>
  );

  return href
    ? <a href={href} className={'card cash-card metric metric-' + tone}>{body}</a>
    : <div className={'card cash-card metric metric-' + tone}>{body}</div>;
}

export function TipList({ tips }) {
  return (
    <ul className="list-unstyled tip-list">
      {tips.map((tip) => (
        <li className={'tip tip-' + tip.tone} key={tip.title}>
          <span className="tip-icon"><Icon name={tip.icon} /></span>
          <div><h3>{tip.title}</h3><p>{tip.detail}</p></div>
        </li>
      ))}
    </ul>
  );
}

export function Progress({ goal }) {
  return (
    <div className="progress goal-progress" role="progressbar" aria-label={'Progresso de ' + goal.name}
      aria-valuenow={goal.percentage} aria-valuemin="0" aria-valuemax="100">
      <div className="progress-bar" style={{ width: goal.percentage + '%' }} />
    </div>
  );
}

function GoalPreview({ goals }) {
  const active = goals.filter((goal) => goal.remaining > 0);

  return (
    <section className="card cash-card">
      <PanelTitle title="Suas metas"><ActionLink href="#metas">Ver metas</ActionLink></PanelTitle>
      {goals.length === 0 ? (
        <EmptyState icon="bullseye" title="Nenhuma meta cadastrada">Crie um objetivo e acompanhe seu progresso.</EmptyState>
      ) : (
        <div className="goal-preview-list">
          {(active.length ? active : goals).slice(0, 2).map((goal) => (
            <article key={goal.id}>
              <div className="goal-preview-heading"><h3>{goal.name}</h3><span>{goal.percentage}%</span></div>
              <Progress goal={goal} />
              <div className="goal-preview-meta"><span>{money(goal.saved)} de {money(goal.target)}</span><span>{projectionText(goal.months)}</span></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Activity({ summary, currentDate }) {
  const entries = [
    ...(summary.salary ? [{ id: 'salary', title: 'Salário mensal', amount: summary.salary, date: summary.period + '-01', type: 'Renda', icon: 'wallet2', tone: 'income' }] : []),
    ...summary.income.map((item) => ({ ...item, type: 'Renda extra', icon: 'wallet2', tone: 'income' })),
    ...summary.bills.map((item) => ({ ...item, type: 'Despesa fixa', icon: 'receipt', tone: 'bill' })),
    ...summary.groceries.map((item) => ({ ...item, type: 'Feira', icon: 'basket2', tone: 'grocery' })),
    ...summary.deposits.map((item) => ({ ...item, type: 'Aporte', icon: 'bullseye', tone: 'goal' })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <section className="card cash-card">
      <PanelTitle title="Lançamentos do mês" />
      {entries.length === 0 ? (
        <EmptyState icon="list-ul" title="Nenhum lançamento neste mês">Use “Novo lançamento” para começar.</EmptyState>
      ) : (
        <div className="table-responsive">
          <table className="table cash-table activity-table">
            <thead><tr><th scope="col">Descrição</th><th scope="col">Data</th><th scope="col">Situação</th><th scope="col" className="text-end">Valor</th></tr></thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <th scope="row">
                    <span className="activity-name">
                      <span className={'activity-icon activity-' + entry.tone}><Icon name={entry.icon} /></span>
                      <span><strong>{entry.title}</strong><small>{entry.type}</small></span>
                    </span>
                  </th>
                  <td>{dateLabel(entry.date)}</td>
                  <td>{entry.status ? <Status status={entry.status} date={entry.date} currentDate={currentDate} /> : '—'}</td>
                  <td className={'text-end amount-cell' + (entry.tone === 'income' ? ' positive-amount' : '')}>
                    {entry.tone === 'income' ? '+' : '−'}{money(entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Dashboard({ summary, tips, currentDate }) {
  const activeGoals = summary.goals.filter((goal) => goal.remaining > 0).length;
  const average = summary.average;
  const averageDetail = average.value === null
    ? 'Aguardando histórico'
    : average.months.length + (average.months.length === 1 ? ' mês de histórico' : ' meses de histórico');

  return (
    <>
      <section className="metric-grid" aria-label="Resumo financeiro">
        <Metric label="Saldo livre" value={money(summary.free)}
          detail={summary.free < 0 ? 'Compromissos acima da renda' : 'Após gastos e aportes'}
          icon="cash-stack" tone="balance" />
        <Metric label="Renda total" value={money(summary.incomeTotal)} detail="Salário e rendas extras"
          icon="wallet2" tone="income" href="#rendas" />
        <Metric label="Despesas fixas" value={money(summary.fixed)} detail={money(summary.pending) + ' pendentes'}
          icon="receipt" tone="bill" href="#despesas" />
        <Metric label="Média da feira" value={average.value === null ? '—' : money(average.value)} detail={averageDetail}
          icon="basket2" tone="grocery" href="#feira" />
        <Metric label="Metas" value={money(sum(summary.goals, (goal) => goal.saved))}
          detail={activeGoals + (activeGoals === 1 ? ' meta em andamento' : ' metas em andamento')}
          icon="bullseye" tone="goal" href="#metas" />
      </section>
      <div className="overview-grid">
        <SpendingChart summary={summary} />
        <section className="card cash-card assistant-preview">
          <PanelTitle title="Dicas de economia">
            <span className="assistant-mark" aria-hidden="true"><Icon name="lightbulb" /></span>
          </PanelTitle>
          <TipList tips={tips.slice(0, 2)} />
          <ActionLink href="#assistente">Abrir assistente</ActionLink>
        </section>
        <Activity summary={summary} currentDate={currentDate} />
        <GoalPreview goals={summary.goals} />
      </div>
    </>
  );
}
