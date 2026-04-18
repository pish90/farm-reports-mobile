import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export interface ExpenseFormValues {
  day: string;
  supplier_contractor: string;
  ref_no: string;
  cost: string;
}

const EMPTY: ExpenseFormValues = {
  day: '',
  supplier_contractor: '',
  ref_no: '',
  cost: '',
};

interface Props {
  visible: boolean;
  year: number;
  month: number;
  initial?: ExpenseFormValues;
  isEditing: boolean;
  onSave: (values: ExpenseFormValues) => void;
  onCancel: () => void;
}

export default function ExpenseForm({
  visible,
  year,
  month,
  initial,
  isEditing,
  onSave,
  onCancel,
}: Props) {
  const daysInMonth = getDaysInMonth(year, month);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormValues>({ defaultValues: EMPTY });

  useEffect(() => {
    if (visible) reset(initial ?? EMPTY);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kvWrap}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{isEditing ? 'Edit Expense' : 'New Expense'}</Text>
          <Text style={styles.monthLabel}>{MONTHS[month - 1]} {year}</Text>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Day */}
            <Text style={styles.label}>Day *</Text>
            <Controller
              control={control}
              name="day"
              rules={{
                required: 'Required',
                validate: (v) => {
                  const n = parseInt(v, 10);
                  if (isNaN(n) || n < 1 || n > daysInMonth)
                    return `Enter a day between 1 and ${daysInMonth}`;
                  return true;
                },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, !!errors.day && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  placeholder={`1 – ${daysInMonth}`}
                  placeholderTextColor="#bbb"
                  maxLength={2}
                  selectTextOnFocus
                />
              )}
            />
            {errors.day && <Text style={styles.errorText}>{errors.day.message}</Text>}

            {/* Supplier / Contractor */}
            <Text style={styles.label}>Supplier / Contractor *</Text>
            <Controller
              control={control}
              name="supplier_contractor"
              rules={{
                required: 'Required',
                maxLength: { value: 100, message: 'Too long' },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, !!errors.supplier_contractor && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. ABC Supplies Ltd"
                  placeholderTextColor="#bbb"
                  autoCapitalize="words"
                  maxLength={100}
                  returnKeyType="next"
                />
              )}
            />
            {errors.supplier_contractor && (
              <Text style={styles.errorText}>{errors.supplier_contractor.message}</Text>
            )}

            {/* Ref No */}
            <Text style={styles.label}>Ref No *</Text>
            <Controller
              control={control}
              name="ref_no"
              rules={{
                required: 'Required',
                maxLength: { value: 50, message: 'Too long' },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, !!errors.ref_no && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. INV-0042"
                  placeholderTextColor="#bbb"
                  autoCapitalize="characters"
                  maxLength={50}
                  returnKeyType="next"
                />
              )}
            />
            {errors.ref_no && <Text style={styles.errorText}>{errors.ref_no.message}</Text>}

            {/* Cost */}
            <Text style={styles.label}>Cost *</Text>
            <Controller
              control={control}
              name="cost"
              rules={{
                required: 'Required',
                validate: (v) => {
                  const n = parseFloat(v);
                  if (isNaN(n) || n <= 0) return 'Must be greater than 0';
                  return true;
                },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, !!errors.cost && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#bbb"
                  maxLength={10}
                  selectTextOnFocus
                />
              )}
            />
            {errors.cost && <Text style={styles.errorText}>{errors.cost.message}</Text>}

            <View style={{ height: 8 }} />
          </ScrollView>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSubmit(onSave)}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  kvWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e0e0e0',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 4,
  },
  monthLabel: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginTop: 14,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  inputError: { borderColor: '#e53e3e' },
  errorText: { fontSize: 12, color: '#e53e3e', marginTop: 3 },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#666' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#2d6a4f',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
