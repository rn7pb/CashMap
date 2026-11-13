import { dateLabel, itemTotal, money, monthLabel, number } from '../lib/budget';
import { Total } from './Accounts';
import { EmptyState, Icon, IconButton, PanelTitle } from './UI';

export default function Groceries({ summary, onEdit, onDelete, isExample }) {
  const purchases = [...summary.groceries].sort((a, b) => b.date.localeCompare(a.date));
  const { average } = summary;
  return (
    <>
      <div className="section-totals">
        <Total label="Total na feira do mês" value={money(summary.groceryTotal)} icon="basket2" tone="grocery" />
        <Total label="Previsão pela média móvel" value={average.value === null ? '—' : money(average.value)} icon="graph-up" />
        <Total label="Compras registradas" value={number(purchases.length)} icon="receipt-cutoff" tone="goal" />
      </div>
      <section className="card cash-card section-panel">
        <PanelTitle title="Média inteligente" description="Média dos totais de até três meses encerrados com compras, anteriores ao mês selecionado." />
        {average.value === null ? (
          <p className="support-line"><Icon name="info-circle" />Registre uma compra em um mês encerrado para gerar a primeira estimativa.</p>
        ) : (
          <ul className="list-unstyled period-tags" aria-label="Meses usados na estimativa">
            {average.months.map((month) => <li key={month}>{monthLabel(month)}</li>)}
          </ul>
        )}
      </section>
      <section className="card cash-card section-panel">
        <PanelTitle title="Compras registradas" description="Abra cada compra para ver os itens e as categorias.">
          <button className="btn btn-outline-cash" type="button" onClick={() => onEdit('grocery', null, true)}>
            <Icon name="upc-scan" />Escanear nota
          </button>
        </PanelTitle>
        {purchases.length === 0 ? (
          <EmptyState icon="basket2" title="Sem compras neste mês">Registre o valor total ou informe os itens da compra.</EmptyState>
        ) : (
          <div className="accordion purchase-list">
            {purchases.map((purchase) => (
              <details key={purchase.id} className="accordion-item purchase">
                <summary className="purchase-summary">
                  <span className="activity-icon activity-grocery"><Icon name="basket2" /></span>
                  <span className="purchase-label"><strong>{purchase.title}</strong><small>
                    {dateLabel(purchase.date)} · {purchase.items.length === 1 ? '1 item' : number(purchase.items.length) + ' itens'}
                  </small></span>
                  <strong className="amount-cell">{money(purchase.amount)}</strong>
                  <Icon name="chevron-down" className="purchase-chevron" />
                </summary>
                <div className="purchase-content">
                  {purchase.items.length === 0 ? <p className="table-secondary">Compra registrada pelo valor total.</p> : (
                    <div className="table-responsive">
                      <table className="table cash-table records-table">
                        <thead><tr><th scope="col">Item</th><th scope="col">Categoria</th><th scope="col">Qtd.</th><th scope="col" className="text-end">Unitário</th><th scope="col" className="text-end">Subtotal</th></tr></thead>
                        <tbody>
                          {purchase.items.map((item) => (
                            <tr key={item.id}><th scope="row">{item.name}</th><td>{item.category}</td><td>{number(item.quantity)}</td>
                              <td className="text-end amount-cell">{money(item.unit)}</td><td className="text-end amount-cell">{money(itemTotal(item))}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!isExample && <div className="d-flex justify-content-end gap-1">
                    <IconButton icon="pencil" label={'Editar ' + purchase.title} onClick={() => onEdit('grocery', purchase)} />
                    <IconButton icon="trash3" label={'Excluir ' + purchase.title} onClick={() => onDelete('grocery', purchase)} danger />
                  </div>}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
