import { dateLabel, money, projectionText, sum } from '../lib/budget';
import { Total } from './Accounts';
import { Progress } from './Dashboard';
import { EmptyState, Icon, IconButton, PanelTitle } from './UI';

export default function Goals({ summary, onEdit, onDelete, isExample }) {
  return (
    <>
      <div className="section-totals">
        <Total label="Guardado em todas as metas" value={money(sum(summary.goals, (goal) => goal.saved))} icon="piggy-bank" />
        <Total label="Aportes no mês selecionado" value={money(summary.depositTotal)} icon="coin" tone="goal" />
        <Total label="Saldo livre no mês" value={money(summary.free)} icon="cash-stack" tone="grocery" />
      </div>
      <section className="card cash-card section-panel">
        <PanelTitle title="Metas de economia" description="A projeção de cada meta considera o saldo livre do mês selecionado aplicado integralmente a ela, mês a mês." />
        {summary.goals.length === 0 ? (
          <EmptyState icon="bullseye" title="Seu cofrinho está vazio">Crie uma meta para acompanhar quanto falta e registrar aportes.</EmptyState>
        ) : (
          <div className="goal-grid">
            {summary.goals.map((goal) => (
              <article className="goal-card" key={goal.id}>
                <div className="goal-heading">
                  <div><span className="metric-icon metric-icon-goal"><Icon name="bullseye" /></span><h3>{goal.name}</h3></div>
                  {!isExample && <div className="d-flex">
                    <IconButton icon="pencil" label={'Editar meta ' + goal.name} onClick={() => onEdit('goal', goal)} />
                    <IconButton icon="trash3" label={'Excluir meta ' + goal.name} onClick={() => onDelete('goal', goal)} danger />
                  </div>}
                </div>
                <p className="goal-amount"><strong>{money(goal.saved)}</strong><span> de {money(goal.target)}</span></p>
                <div className="goal-card-progress"><Progress goal={goal} /><span>{goal.percentage}%</span></div>
                <p className="support-line"><Icon name={goal.remaining ? 'clock' : 'check-circle'} />{projectionText(goal.months)}</p>
                {!isExample && <button className="btn btn-outline-cash" type="button" onClick={() => onEdit('deposit', null, false, goal)}>
                  <Icon name="plus-lg" />Registrar aporte<span className="visually-hidden"> em {goal.name}</span>
                </button>}
                {goal.deposits.length > 0 && (
                  <details className="deposit-history">
                    <summary>Histórico de aportes ({goal.deposits.length})</summary>
                    <ul className="list-unstyled">
                      {[...goal.deposits].sort((a, b) => b.date.localeCompare(a.date)).map((deposit) => (
                        <li key={deposit.id}>
                          <span>{dateLabel(deposit.date)}</span><strong>{money(deposit.amount)}</strong>
                          {!isExample && <div className="d-flex">
                            <IconButton icon="pencil" label={'Editar aporte de ' + dateLabel(deposit.date)} onClick={() => onEdit('deposit', deposit, false, goal)} />
                            <IconButton icon="trash3" label={'Excluir aporte de ' + dateLabel(deposit.date)} onClick={() => onDelete('deposit', deposit, goal)} danger />
                          </div>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
