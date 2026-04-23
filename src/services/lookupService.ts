import { getDb } from '../db/database';
import apiClient from './apiClient';

export interface ExpenseCategoryDto {
  id: number;
  accountCode: string;
  accountName: string;
}

export interface BusinessUnitDto {
  id: number;
  code: string;
  name: string;
}

async function getCachedCategories(): Promise<ExpenseCategoryDto[] | null> {
  const rows = await getDb().getAllAsync<{ id: number; account_code: string; account_name: string }>(
    'SELECT id, account_code, account_name FROM expense_categories_cache ORDER BY account_code',
  );
  return rows.length > 0 ? rows.map((r) => ({ id: r.id, accountCode: r.account_code, accountName: r.account_name })) : null;
}

async function setCachedCategories(items: ExpenseCategoryDto[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM expense_categories_cache');
    for (const c of items) {
      await db.runAsync(
        'INSERT INTO expense_categories_cache (id, account_code, account_name) VALUES (?, ?, ?)',
        [c.id, c.accountCode, c.accountName],
      );
    }
  });
}

async function getCachedBusinessUnits(): Promise<BusinessUnitDto[] | null> {
  const rows = await getDb().getAllAsync<{ id: number; code: string; name: string }>(
    'SELECT id, code, name FROM business_units_cache ORDER BY code',
  );
  return rows.length > 0 ? rows : null;
}

async function setCachedBusinessUnits(items: BusinessUnitDto[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM business_units_cache');
    for (const b of items) {
      await db.runAsync(
        'INSERT INTO business_units_cache (id, code, name) VALUES (?, ?, ?)',
        [b.id, b.code, b.name],
      );
    }
  });
}

export async function getExpenseCategories(): Promise<ExpenseCategoryDto[]> {
  try {
    const res = await apiClient.get('/lookup/expense-categories');
    const items: ExpenseCategoryDto[] = res.data.data;
    await setCachedCategories(items);
    return items;
  } catch {
    const cached = await getCachedCategories();
    if (cached) return cached;
    throw new Error('Cannot load expense categories. Please connect to the internet.');
  }
}

export async function getBusinessUnits(): Promise<BusinessUnitDto[]> {
  try {
    const res = await apiClient.get('/lookup/business-units');
    const items: BusinessUnitDto[] = res.data.data;
    await setCachedBusinessUnits(items);
    return items;
  } catch {
    const cached = await getCachedBusinessUnits();
    if (cached) return cached;
    throw new Error('Cannot load business units. Please connect to the internet.');
  }
}
