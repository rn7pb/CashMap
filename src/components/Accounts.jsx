import { useState } from 'react';
import { dateLabel, money } from '../lib/budget';
import { EmptyState, Icon, IconButton, PanelTitle, Status } from './UI';

export function Total({ label, value, icon, tone = 'income' }) {
  return (
    <div className="card cash-card section-total">
      <span className={'metric-icon metric-icon-' + tone}><Icon name={icon} /></span>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  );
}

function RecordActions({ name, edit, remove }) {
  return (
    <>
      <IconButton icon="pencil" label={'Editar ' + name} onClick={edit} />
      <IconButton icon="trash3" label={'Excluir ' + name} danger onClick={remove} />
    </>
  );
}

export function Income({ summary, onEdit, onDelete, isExample }) {
  const extras = [...summary.income].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="section-totals">
        <Total label="Salário do mês" value={money(summary.salary)} icon="briefcase" />
        <Total label="Rendas extras" value={money(summary.incomeTotal - summary.salary)} icon="plus-circle" tone="grocery" />
        <Total label="Renda total" value={money(summary.incomeTotal)} icon="wallet2" tone="goal" />
      </div>
      <section className="card cash-card section-panel">
        <PanelTitle title="Salário mensal" description="Cadastre o salário líquido do mês selecionado." />
        <div className="salary-row">
          <div><span>Valor cadastrado</span><strong>{money(summary.salary)}</strong></div>
          <button className="btn btn-outline-cash" type="button" onClick={() => onEdit('salary')}>
            <Icon name="pencil" />{summary.salary && !isExample ? 'Editar salário' : 'Cadastrar salário'}
          </button>
        </div>
      </section>
      <section className="card cash-card section-panel">
        <PanelTitle title="Rendas extras" description="Registre trabalhos, comissões e outras entradas.">
          <button className="btn btn-outline-cash" type="button" onClick={() => onEdit('income')}><Icon name="plus-lg" />Adicionar renda</button>
        </PanelTitle>
        {extras.length === 0 ? <EmptyState icon="wallet2" title="Sem rendas extras neste mês" /> : (
          <div className="table-responsive">
            <table className="table cash-table records-table">
              <thead><tr><th scope="col">Descrição</th><th scope="col">Data</th><th scope="col" className="text-end">Valor</th>{!isExample && <th scope="col" className="text-end">Ações</th>}</tr></thead>
              <tbody>
                {extras.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">{entry.title}</th>
                    <td>{dateLabel(entry.date)}</td>
                    <td className="text-end amount-cell positive-amount">{money(entry.amount)}</td>
                    {!isExample && <td className="text-end actions-cell"><RecordActions name={entry.title}
                      edit={() => onEdit('income', entry)} remove={() => onDelete('income', entry)} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function Bills({ summary, onEdit, onDelete, onToggle, currentDate, isExample, view, onViewChange }) {
  const [filter, setFilter] = useState('all');
  const variable = view === 'variable';
  const kind = variable ? 'variable' : 'bill';
  const bills = (variable ? summary.variableBills : summary.bills.filter((bill) => filter === 'all' || bill.status === filter))
    .slice().sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Tipo de despesa">
        <button type="button" className={'btn ' + (variable ? 'btn-outline-cash' : 'btn-cash')}
          aria-pressed={!variable} onClick={() => onViewChange('fixed')}>Fixas</button>
        <button type="button" className={'btn ' + (variable ? 'btn-cash' : 'btn-outline-cash')}
          aria-pressed={variable} onClick={() => onViewChange('variable')}>Variáveis</button>
      </div>
      <div className="section-totals">
        {variable ? (
          <Total label="Despesas variáveis do mês" value={money(summary.variableTotal)} icon="bag" tone="bill" />
        ) : (
          <>
            <Total label="Total de contas fixas" value={money(summary.fixed)} icon="receipt" tone="bill" />
            <Total label="Contas pagas" value={money(summary.paid)} icon="check-circle" />
            <Total label="Contas pendentes" value={money(summary.pending)} icon="clock" tone="goal" />
          </>
        )}
      </div>
      <section className="card cash-card section-panel">
        <PanelTitle title={variable ? 'Despesas variáveis do mês' : 'Contas fixas do mês'}
          description={variable ? 'Veja os gastos avulsos do período.' : 'Acompanhe vencimentos e marque os pagamentos.'}>
          {!variable && (
            <select className="form-select filter-select" value={filter} aria-label="Filtrar despesas por status"
              onChange={(event) => setFilter(event.target.value)}>
              <option value="all">Todas as contas</option><option value="paid">Pagas</option><option value="pending">Pendentes</option>
            </select>
          )}
        </PanelTitle>
        {bills.length === 0 ? (
          <EmptyState icon="receipt" title={variable ? 'Sem despesas variáveis neste mês'
            : filter === 'all' ? 'Sem contas cadastradas neste mês' : 'Nenhuma conta com esse status'} />
        ) : (
          <div className="table-responsive">
            <table className="table cash-table bills-table">
              <thead>
                <tr>
                  <th scope="col">{variable ? 'Despesa' : 'Conta'}</th>
                  <th scope="col">Data</th>
                  {!variable && <th scope="col">Status</th>}
                  <th scope="col" className="text-end">Valor</th>
                  {!isExample && <th scope="col" className="text-end">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id}>
                    <th scope="row"><strong>{bill.title}</strong><small className="d-block table-secondary">{bill.category}</small></th>
                    <td>
                      {dateLabel(bill.date)}
                      {!variable && <small className="d-block table-secondary">
                        {bill.bankImport && !bill.paymentDate ? 'Data do extrato' : 'Vencimento'}
                      </small>}
                      {bill.paymentDate && bill.status === 'paid' && (
                        <small className="d-block table-secondary">Pago em {dateLabel(bill.paymentDate)}</small>
                      )}
                    </td>
                    {!variable && <td><Status status={bill.status} date={bill.date} currentDate={currentDate} /></td>}
                    <td className="text-end amount-cell">{money(bill.amount)}</td>
                    {!isExample && (
                      <td className="text-end actions-cell">
                        {!variable && (
                          <IconButton icon={bill.status === 'paid' ? 'arrow-counterclockwise' : 'check2-circle'}
                            label={(bill.status === 'paid' ? 'Marcar como pendente: ' : 'Marcar como paga: ') + bill.title}
                            onClick={() => onToggle(bill)} />
                        )}
                        <RecordActions name={bill.title} edit={() => onEdit(kind, bill)} remove={() => onDelete(kind, bill)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
