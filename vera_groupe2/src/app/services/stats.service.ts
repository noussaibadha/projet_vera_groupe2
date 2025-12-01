import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface SingleChoiceEntry {
  value: string;
  count: number;
}

export interface ScaleStat {
  avg: number | null;
  min: number | null;
  max: number | null;
}

export interface DailyCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface StatsOverview {
  totalResponses: number;
  singleChoice: Record<string, SingleChoiceEntry[]>;
  scales: Record<string, ScaleStat>;
  multiChoice: Record<string, Record<string, number>>;
  dailyCounts?: DailyCount[];
  generatedAt: string;
}

const DEFAULT_API_BASE_URL = 'http://localhost:3000/api';

function resolveApiBaseUrl(): string {
  const env = (import.meta as any).env || {};
  const candidate = env['NG_APP_API_BASE_URL'] ?? env['NG_APP_API_URL'];

  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.replace(/\/$/, '');
  }

  return DEFAULT_API_BASE_URL;
}

@Injectable({
  providedIn: 'root',
})
export class StatsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = resolveApiBaseUrl();

  fetchOverview(): Observable<StatsOverview> {
    return this.http.get<StatsOverview>(`${this.baseUrl}/stats/overview`);
  }

  listenToStream(): Observable<StatsOverview> {
    return new Observable<StatsOverview>((observer) => {
      const source = new EventSource(`${this.baseUrl}/stats/stream`);

      source.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          observer.next(parsed);
        } catch (err) {
          console.error('Impossible de parser les données de stats', err);
        }
      };

      source.onerror = (err) => {
        observer.error(err);
      };

      return () => source.close();
    });
  }
}
