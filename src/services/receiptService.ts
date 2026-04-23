import apiClient from './apiClient';

export interface ScannedReceipt {
  day: number | null;
  supplierContractor: string | null;
  receiptNo: string | null;
  cost: number | null;
  description: string | null;
}

export async function scanReceipt(imageUri: string): Promise<ScannedReceipt> {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'receipt.jpg',
  } as any);

  const response = await apiClient.post('/receipts/scan', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });

  return response.data.data as ScannedReceipt;
}
