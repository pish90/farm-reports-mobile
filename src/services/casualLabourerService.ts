import { getDb } from '../db/database';
import { CasualLabourerDto } from '../types';
import apiClient from './apiClient';

interface AddCasualLabourerParams {
  name: string;
  phone: string | null;
  defaultDailyRate: number;
  photoBase64: string | null;
  photoMimeType: string | null;
}

async function getCachedCasualLabourers(farmId: number): Promise<CasualLabourerDto[] | null> {
  const rows = await getDb().getAllAsync<{
    id: number; name: string; phone: string | null;
    default_daily_rate: number; photo_base64: string | null; photo_mime_type: string | null;
  }>(
    'SELECT id, name, phone, default_daily_rate, photo_base64, photo_mime_type FROM casual_labourers_cache WHERE farm_id = ? ORDER BY name',
    [farmId],
  );
  if (rows.length === 0) return null;
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    defaultDailyRate: r.default_daily_rate,
    photoBase64: r.photo_base64,
    photoMimeType: r.photo_mime_type,
  }));
}

async function setCachedCasualLabourers(farmId: number, labourers: CasualLabourerDto[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM casual_labourers_cache WHERE farm_id = ?', [farmId]);
    for (const l of labourers) {
      await db.runAsync(
        `INSERT INTO casual_labourers_cache
           (id, farm_id, name, phone, default_daily_rate, photo_base64, photo_mime_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [l.id, farmId, l.name, l.phone ?? null, l.defaultDailyRate, l.photoBase64 ?? null, l.photoMimeType ?? null],
      );
    }
  });
}

export async function getCasualLabourers(farmId: number): Promise<CasualLabourerDto[]> {
  try {
    const res = await apiClient.get(`/farms/${farmId}/casual-labourers`);
    const labourers: CasualLabourerDto[] = res.data.data;
    await setCachedCasualLabourers(farmId, labourers);
    return labourers;
  } catch {
    // Offline — return cached list, or empty array if no cache yet
    const cached = await getCachedCasualLabourers(farmId);
    return cached ?? [];
  }
}

export async function addCasualLabourer(
  farmId: number,
  params: AddCasualLabourerParams,
): Promise<CasualLabourerDto> {
  const res = await apiClient.post(`/farms/${farmId}/casual-labourers`, {
    name: params.name,
    phone: params.phone || null,
    defaultDailyRate: params.defaultDailyRate,
    photoBase64: params.photoBase64 || null,
    photoMimeType: params.photoMimeType || null,
  });
  return res.data.data as CasualLabourerDto;
}

export async function deactivateCasualLabourer(farmId: number, labourerId: number): Promise<void> {
  await apiClient.delete(`/farms/${farmId}/casual-labourers/${labourerId}`);
}
