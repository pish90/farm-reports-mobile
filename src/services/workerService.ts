import { getDb } from '../db/database';
import apiClient from './apiClient';

export interface WorkerDto {
  id: number;
  name: string;
}

async function getCachedWorkers(farmId: number): Promise<WorkerDto[] | null> {
  const rows = await getDb().getAllAsync<{ id: number; name: string }>(
    'SELECT id, name FROM workers_cache WHERE farm_id = ? ORDER BY name',
    [farmId],
  );
  return rows.length > 0 ? rows : null;
}

async function setCachedWorkers(farmId: number, workers: WorkerDto[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM workers_cache WHERE farm_id = ?', [farmId]);
    for (const w of workers) {
      await db.runAsync(
        'INSERT INTO workers_cache (id, farm_id, name) VALUES (?, ?, ?)',
        [w.id, farmId, w.name],
      );
    }
  });
}

export async function getWorkers(farmId: number): Promise<WorkerDto[]> {
  try {
    const res = await apiClient.get(`/farms/${farmId}/workers`);
    const workers: WorkerDto[] = res.data.data;
    await setCachedWorkers(farmId, workers);
    return workers;
  } catch {
    const cached = await getCachedWorkers(farmId);
    if (cached) return cached;
    throw new Error('No workers available. Please connect to the internet and try again.');
  }
}

export async function addWorker(farmId: number, name: string): Promise<WorkerDto> {
  const res = await apiClient.post(`/farms/${farmId}/workers`, { name });
  return res.data.data as WorkerDto;
}

export async function deactivateWorker(farmId: number, workerId: number): Promise<void> {
  await apiClient.delete(`/farms/${farmId}/workers/${workerId}`);
}
