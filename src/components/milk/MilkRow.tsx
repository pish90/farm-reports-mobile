import React from 'react';
import { Controller, useFormState } from 'react-hook-form';
import { StyleSheet, Text, TextInput, View } from 'react-native';

export type MilkFormValues = Record<string, string>;

interface Props {
  day: number;
  month: number;
  year: number;
  control: React.ComponentProps<typeof Controller>['control'];
  isSubmitted: boolean;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDayName(year: number, month: number, day: number): string {
  return DAY_NAMES[new Date(year, month - 1, day).getDay()];
}

function isWeekend(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month - 1, day).getDay();
  return dow === 0 || dow === 6;
}

function isFutureDate(year: number, month: number, day: number): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(year, month - 1, day) > today;
}

const MilkRow = React.memo(function MilkRow({ day, month, year, control, isSubmitted }: Props) {
  const fieldName = `day_${day}` as keyof MilkFormValues;
  const { errors } = useFormState({ control, name: fieldName });
  const weekend  = isWeekend(year, month, day);
  const future   = isFutureDate(year, month, day);
  const disabled = future || isSubmitted;
  const hasError = !!errors[fieldName];

  return (
    <View style={[styles.row, weekend && styles.rowWeekend]}>
      <Text style={[styles.dayNum, future && styles.futureText]}>
        {String(day).padStart(2, ' ')}
      </Text>
      <Text style={[styles.dayName, future && styles.futureText]}>
        {getDayName(year, month, day)}
      </Text>

      <View style={styles.inputWrap}>
        <Controller
          control={control}
          name={fieldName}
          rules={{
            validate: (v) => {
              if (!v || v.trim() === '') return true;
              const n = parseFloat(v);
              if (isNaN(n) || n < 0) return 'Must be ≥ 0';
              return true;
            },
          }}
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              style={[
                styles.input,
                disabled && styles.inputFuture,
                hasError && styles.inputError,
              ]}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={disabled ? '#ccc' : '#bbb'}
              editable={!disabled}
              maxLength={8}
              selectTextOnFocus
            />
          )}
        />
      </View>

      {hasError && (
        <Text style={styles.errorDot}>!</Text>
      )}
    </View>
  );
});

export default MilkRow;

const ROW_HEIGHT = 52;

export { ROW_HEIGHT };

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
  },
  rowWeekend: {
    backgroundColor: '#f5fbf8',
  },
  dayNum: {
    width: 30,
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    fontVariant: ['tabular-nums'],
  },
  dayName: {
    width: 40,
    fontSize: 13,
    color: '#888',
    marginLeft: 4,
  },
  futureText: {
    color: '#ccc',
  },
  inputWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  input: {
    width: 100,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 15,
    textAlign: 'right',
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
    fontVariant: ['tabular-nums'],
  },
  inputFuture: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ebebeb',
    color: '#ccc',
  },
  inputError: {
    borderColor: '#e53e3e',
  },
  errorDot: {
    width: 18,
    color: '#e53e3e',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 15,
  },
});
