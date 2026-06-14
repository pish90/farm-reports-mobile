// Module-level store that survives screen re-mounts within the same JS session.
// SelectCasualsScreen writes here before goBack(); CreateWorkSessionScreen reads
// on focus and clears it so it can't be replayed.
const workSessionDraft: {
  pendingCasuals: Array<{ id: number; name: string; rateOverride?: number }> | null;
} = { pendingCasuals: null };

export default workSessionDraft;
