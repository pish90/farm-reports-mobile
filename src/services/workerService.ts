import { getDb, remapAttendanceWorkerIds } from '../db/database';
import apiClient from './apiClient';

export interface WorkerDto {
  id: number;
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  name: string;
  phone?: string;
  jobTitle?: string;
  status?: string;
}

async function getCachedWorkers(farmId: number): Promise<WorkerDto[] | null> {
  try {
    const rows = await getDb().getAllAsync<{
      id: number; name: string;
      employee_id: string | null; first_name: string | null; last_name: string | null;
    }>(
      'SELECT id, name, employee_id, first_name, last_name FROM workers_cache WHERE farm_id = ? ORDER BY name',
      [farmId],
    );
    if (rows.length === 0) return null;
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      employeeId: r.employee_id ?? undefined,
      firstName: r.first_name ?? undefined,
      lastName: r.last_name ?? undefined,
    }));
  } catch {
    // New columns may not exist yet if migrations haven't run — fall back to base columns
    const rows = await getDb().getAllAsync<{ id: number; name: string }>(
      'SELECT id, name FROM workers_cache WHERE farm_id = ? ORDER BY name',
      [farmId],
    );
    return rows.length > 0 ? rows : null;
  }
}

async function setCachedWorkers(farmId: number, workers: WorkerDto[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM workers_cache WHERE farm_id = ?', [farmId]);
    for (const w of workers) {
      await db.runAsync(
        'INSERT INTO workers_cache (id, farm_id, name, employee_id, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)',
        [w.id, farmId, w.name, w.employeeId ?? null, w.firstName ?? null, w.lastName ?? null],
      );
    }
  });
}

export async function getWorkers(farmId: number): Promise<WorkerDto[]> {
  try {
    const res = await apiClient.get(`/farms/${farmId}/workers`);
    const workers: WorkerDto[] = res.data.data;
    setCachedWorkers(farmId, workers).catch(() => {});
    await remapAttendanceWorkerIds(workers); // fix stale IDs left by V29 migration
    return workers;
  } catch {
    const cached = await getCachedWorkers(farmId);
    if (cached) return cached;
    throw new Error('No workers available. Please connect to the internet and try again.');
  }
}

export async function addWorker(farmId: number, firstName: string, lastName?: string): Promise<WorkerDto> {
  const res = await apiClient.post(`/farms/${farmId}/workers`, { firstName, lastName: lastName || null });
  return res.data.data as WorkerDto;
}

export async function deactivateWorker(farmId: number, workerId: number): Promise<void> {
  await apiClient.delete(`/farms/${farmId}/workers/${workerId}`);
}
