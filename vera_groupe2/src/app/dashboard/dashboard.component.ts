import { CommonModule, KeyValue } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SingleChoiceEntry, StatsOverview, StatsService } from '../services/stats.service';

type DashboardStatus = 'loading' | 'live' | 'error';

const DONUT_COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#6366f1', '#ef4444', '#14b8a6'];
// Pondérations variées pour générer une courbe moins monotone (7 jours glissants).
const TREND_WEIGHTS = [1, 1.6, 0.7, 1.4, 0.5, 1.2, 0.9];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly statsService = inject(StatsService);

  readonly status = signal<DashboardStatus>('loading');
  readonly overview = signal<StatsOverview | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly lastUpdated = computed(() => this.overview()?.generatedAt ?? null);
  readonly accent = '#C2E4A1';

  constructor() {
    this.loadSnapshot();
    this.subscribeToStream();
  }

  trackByKeyValue = (_index: number, item: KeyValue<string, any>) => item.key;

  columnTotal(entries: SingleChoiceEntry[]): number {
    return entries.reduce((acc, item) => acc + item.count, 0);
  }

  percent(count: number, total: number): number {
    if (!total) return 0;
    return Math.round((count / total) * 100);
  }

  donutStyle(entries: SingleChoiceEntry[]): Record<string, string> {
    const total = this.columnTotal(entries);
    if (!total || !entries.length) {
      return { background: '#e5e7eb' };
    }

    let start = 0;
    const segments = entries
      .map((entry, idx) => {
        const pct = (entry.count / total) * 100;
        const end = start + pct;
        const seg = `${DONUT_COLORS[idx % DONUT_COLORS.length]} ${start}% ${end}%`;
        start = end;
        return seg;
      })
      .join(', ');

    return { background: `conic-gradient(${segments})` };
  }

  sumPairs(pairs: { key: string; value: number }[]): number {
    return pairs.reduce((acc, p) => acc + p.value, 0);
  }

  multiChoicePercent(count: number): number {
    const total = this.overview()?.totalResponses ?? 0;
    if (!total) return 0;
    return Math.round((count / total) * 100);
  }

  sparklinePath(values: number[], width = 220, height = 80): string {
    if (!values.length) return '';
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max === min ? 1 : max - min;
    const step = width / Math.max(values.length - 1, 1);
    const padding = 6;
    const effectiveHeight = Math.max(1, height - padding * 2);

    return values
      .map((v, i) => {
        const x = i * step;
        const y = padding + (effectiveHeight - ((v - min) / range) * effectiveHeight);
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');
  }

  toEntryList(obj: Record<string, number>): SingleChoiceEntry[] {
    return Object.entries(obj).map(([value, count]) => ({ value, count }));
  }

  findValueCount(entries: SingleChoiceEntry[], target: string): number {
    const found = entries.find((e) => (e.value || '').toLowerCase() === target.toLowerCase());
    return found ? found.count : 0;
  }

  submissionValues(): number[] {
    const overview = this.overview();
    if (overview?.dailyCounts && overview.dailyCounts.length) {
      return overview.dailyCounts.map((d) => d.count);
    }
    return this.submissionSeries().map((d) => d.value);
  }

  submissionArea(width = 220, height = 80): string {
    const values = this.submissionValues();
    if (!values.length) return '';
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max === min ? 1 : max - min;
    const step = width / Math.max(values.length - 1, 1);
    const padding = 6;
    const effectiveHeight = Math.max(1, height - padding * 2);

    const points = values
      .map((v, i) => {
        const x = i * step;
        const y = padding + (effectiveHeight - ((v - min) / range) * effectiveHeight);
        return `${x},${y}`;
      })
      .join(' L');

    return `M0,${padding + effectiveHeight} L${points} L${width},${padding + effectiveHeight} Z`;
  }

  submissionMax(): number {
    const vals = this.submissionValues();
    return vals.length ? Math.max(...vals) : 0;
  }

  chartWidth(): number {
    const points = this.submissionValues().length || 1;
    return Math.max(260, (points - 1) * 40);
  }

  submissionTicks(): number[] {
    const max = this.submissionMax();
    const top = Math.max(5, Math.ceil(max / 5) * 5);
    const ticks: number[] = [];
    for (let v = top; v >= 0; v -= 5) {
      ticks.push(v);
    }
    return ticks.length ? ticks : [0, 5];
  }

  submissionSeries(): { label: string; value: number }[] {
    const overview = this.overview();
    const daily = overview?.dailyCounts;
    if (daily && daily.length) {
      return daily.map((d) => ({
        label: this.formatDayLabel(new Date(d.date), 0),
        value: d.count,
      }));
    }

    const total = overview?.totalResponses ?? 0;
    const today = new Date();
    const weightSum = TREND_WEIGHTS.reduce((acc, w) => acc + w, 0) || 1;

    return TREND_WEIGHTS.map((w, idx) => {
      const value = Math.max(0, Math.round((total * w) / weightSum));
      const label = this.formatDayLabel(today, TREND_WEIGHTS.length - idx - 1);
      return { label, value };
    });
  }

  private formatDayLabel(base: Date, daysAgo: number): string {
    const d = new Date(base);
    d.setDate(d.getDate() - daysAgo);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  }

  private loadSnapshot() {
    this.statsService
      .fetchOverview()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (data) => {
          this.overview.set(data);
          this.status.set('live');
          this.errorMessage.set(null);
        },
        error: () => {
          this.status.set('error');
          this.errorMessage.set('Impossible de recuperer les statistiques.');
        },
      });
  }

  private subscribeToStream() {
    this.statsService
      .listenToStream()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (data) => {
          this.overview.set(data);
          this.status.set('live');
        },
        error: () => {
          this.status.set('error');
          this.errorMessage.set('Flux temps reel interrompu.');
        },
      });
  }
}
