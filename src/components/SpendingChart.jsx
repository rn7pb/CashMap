import { useEffect, useMemo, useRef, useState } from 'react';
import { ArcElement, Chart, DoughnutController, Tooltip } from 'chart.js';
import { money, number } from '../lib/budget';
import { EmptyState, PanelTitle } from './UI';

Chart.register(DoughnutController, ArcElement, Tooltip);

const CATEGORIES = [
  { key: 'fixed', label: 'Despesas fixas', color: '#28634f' },
  { key: 'variableTotal', label: 'Despesas variáveis', color: '#7b89b4' },
  { key: 'groceryTotal', label: 'Feira do mês', color: '#a8c77e' },
  { key: 'depositTotal', label: 'Aportes em metas', color: '#eab57a' },
];

export default function SpendingChart({ summary: { fixed, variableTotal, groceryTotal, depositTotal } }) {
  const canvas = useRef(null);
  const [hidden, setHidden] = useState([]);
  const series = useMemo(() => {
    const amounts = { fixed, variableTotal, groceryTotal, depositTotal };
    return CATEGORIES.filter(({ key }) => key !== 'variableTotal' || variableTotal > 0).map((category) => ({ ...category, amount: amounts[category.key] }));
  }, [fixed, variableTotal, groceryTotal, depositTotal]);
  const total = fixed + variableTotal + groceryTotal + depositTotal;
  const active = useMemo(() => series.filter((item) => !hidden.includes(item.key)), [series, hidden]);
  const shown = active.reduce((sum, item) => sum + item.amount, 0);

  useEffect(() => {
    if (!canvas.current) return undefined;

    const hasMultipleSlices = active.filter((item) => item.amount > 0).length > 1;
    const chart = new Chart(canvas.current, {
      type: 'doughnut',
      data: {
        labels: active.map((item) => item.label),
        datasets: [{
          data: active.map((item) => item.amount),
          backgroundColor: active.map((item) => item.color),
          hoverOffset: 5,
          borderColor: '#fff',
          borderWidth: hasMultipleSlices ? 4 : 0,
          borderRadius: hasMultipleSlices ? 7 : 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '76%',
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 430 },
        layout: { padding: 6 },
        plugins: {
          tooltip: {
            displayColors: false,
            backgroundColor: '#172f2c',
            padding: 10,
            callbacks: { label: ({ raw }) => money(raw) },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [active]);

  function percentage(item) {
    return shown && !hidden.includes(item.key) ? number(Math.round(item.amount / shown * 100)) + '%' : '—';
  }

  function toggle(key) {
    setHidden((previous) => previous.includes(key)
      ? previous.filter((item) => item !== key)
      : [...previous, key]);
  }

  return (
    <section className="card cash-card chart-card" aria-label="Distribuição dos gastos">
      <PanelTitle title="Distribuição dos gastos" description="Despesas, feira e aportes do mês." />
      {total === 0 ? (
        <EmptyState icon="pie-chart" title="Sem gastos registrados">Os gastos do mês aparecem aqui depois do primeiro lançamento.</EmptyState>
      ) : (
        <div className="spending-layout">
          <div className="chart-figure">
            {shown > 0 && <canvas ref={canvas} aria-hidden="true" />}
            <div className={'chart-center' + (shown === 0 ? ' chart-center-empty' : '')}>
              <span>{hidden.length ? 'Total exibido' : 'Total comprometido'}</span>
              <strong>{money(shown)}</strong>
            </div>
          </div>
          <div className="chart-legend" aria-label="Exibir categorias no gráfico">
            {series.map((item) => (
              <button className="legend-item" key={item.key} type="button" onClick={() => toggle(item.key)}
                aria-pressed={!hidden.includes(item.key)}>
                <span className="legend-name"><span className="legend-dot" style={{ backgroundColor: item.color }} />{item.label}</span>
                <span className="legend-amount">{money(item.amount)} <small>{percentage(item)}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
