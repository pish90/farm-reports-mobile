import { Control, Controller, FieldErrors, UseFormWatch } from 'react-hook-form';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { LivestockTypeDto } from '../../services/livestockService';

export type LivestockFormValues = Record<string, string>;

interface Props {
  category: string;
  types: LivestockTypeDto[];
  control: Control<LivestockFormValues>;
  errors: FieldErrors<LivestockFormValues>;
  watch: UseFormWatch<LivestockFormValues>;
  isSubmitted: boolean;
  note: string;
  onNoteChange: (category: string, note: string) => void;
}

function toTitle(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function parseCount(val: string | undefined): number {
  const n = parseInt(val ?? '0', 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

export default function LivestockSection({
  category, types, control, errors, watch, isSubmitted, note, onNoteChange,
}: Props) {
  const values = watch();
  const total = types.reduce((sum, t) => sum + parseCount(values[`count_${t.id}`]), 0);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.headerText}>{toTitle(category)}</Text>
      </View>

      {types.map((t) => {
        const fieldName = `count_${t.id}` as keyof LivestockFormValues;
        const hasError  = !!errors[fieldName];

        return (
          <View key={t.id} style={styles.row}>
            <Text style={styles.typeName}>{t.type}</Text>
            <View style={styles.inputWrap}>
              <Controller
                control={control}
                name={fieldName}
                rules={{
                  validate: (v) => {
                    const raw = (v ?? '').trim();
                    if (raw === '' || raw === '0') return true;
                    const n = Number(raw);
                    if (!Number.isInteger(n) || n < 0) return 'Non-negative whole number required';
                    return true;
                  },
                }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, hasError && styles.inputError, isSubmitted && styles.inputDisabled]}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="number-pad"
                    maxLength={6}
                    selectTextOnFocus
                    placeholder="0"
                    placeholderTextColor="#bbb"
                    editable={!isSubmitted}
                  />
                )}
              />
              {hasError && (
                <Text style={styles.fieldError}>{errors[fieldName]?.message as string}</Text>
              )}
            </View>
          </View>
        );
      })}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{total}</Text>
      </View>

      <View style={styles.noteRow}>
        <Text style={styles.noteLabel}>Comment</Text>
        <TextInput
          style={[styles.noteInput, isSubmitted && styles.noteInputDisabled]}
          value={note}
          onChangeText={(t) => onNoteChange(category, t)}
          placeholder={`Notes for ${toTitle(category)} section (optional)`}
          placeholderTextColor="#bbb"
          multiline
          editable={!isSubmitted}
          maxLength={500}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  header: {
    backgroundColor: '#2d6a4f',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  headerText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  typeName: { flex: 1, fontSize: 15, color: '#333' },
  inputWrap: { alignItems: 'flex-end' },
  input: {
    width: 80,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 8,
    fontSize: 15,
    textAlign: 'center',
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  inputError:    { borderColor: '#e53e3e' },
  inputDisabled: { backgroundColor: '#f5f5f5', borderColor: '#ebebeb', color: '#bbb' },
  fieldError: { color: '#e53e3e', fontSize: 11, marginTop: 2 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f7faf9',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  totalLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: '#2d6a4f' },
  totalValue: { width: 80, fontSize: 15, fontWeight: '700', color: '#2d6a4f', textAlign: 'center' },
  noteRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  noteLabel: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 4 },
  noteInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
    minHeight: 48,
    textAlignVertical: 'top',
  },
  noteInputDisabled: { backgroundColor: '#f5f5f5', borderColor: '#ebebeb', color: '#bbb' },
});
