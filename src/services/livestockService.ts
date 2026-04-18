import { getDb } from '../db/database';
import apiClient from './apiClient';

export interface LivestockTypeDto {
  id: number;
  category: string;
  type: string;
}

export type GroupedLivestockTypes = Record<string, LivestockTypeDto[]>;

// Fixed display order matching the backend enum
export const CATEGORY_ORDER = ['CATTLE', 'PIGS', 'SHEEP'] as const;

async function getCachedTypes(farmId: number): Promise<GroupedLivestockTypes | null> {
  const db = getDb();
  const rows = await db.getAllAsync<{ id: number; category: string; type_name: string }>(
    'SELECT id, category, type_name FROM livestock_types_cache WHERE farm_id = ? ORDER BY category, type_name',
    [farmId],
  );
  if (rows.length === 0) return null;

  const grouped: GroupedLivestockTypes = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push({ id: row.id, category: row.category, type: row.type_name });
  }
  return grouped;
}

async function setCachedTypes(farmId: number, grouped: GroupedLivestockTypes): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM livestock_types_cache WHERE farm_id = ?', [farmId]);
    for (const [category, types] of Object.entries(grouped)) {
      for (const t of types) {
        await db.runAsync(
          'INSERT INTO livestock_types_cache (id, farm_id, category, type_name) VALUES (?, ?, ?, ?)',
          [t.id, farmId, category, t.type],
        );
      }
    }
  });
}

export async function getLivestockTypes(farmId: number): Promise<GroupedLivestockTypes> {
  try {
    const res = await apiClient.get(`/farms/${farmId}/livestock-types`);
    const grouped: GroupedLivestockTypes = res.data.data;
    await setCachedTypes(farmId, grouped);
    return grouped;
  } catch {
    // Offline — fall back to cache
    const cached = await getCachedTypes(farmId);
    if (cached) return cached;
    throw new Error('No livestock types available. Please connect to the internet and try again.');
  }
}
