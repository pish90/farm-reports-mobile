import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import DatePickerModal from './DatePickerModal';

interface Props {
  value: string; // YYYY-MM-DD or ''
  onChange: (date: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  accentColor?: string;
  allowFuture?: boolean;
}

export default function DateField({ value, onChange, placeholder = 'Select date', style, accentColor = '#2d6a4f', allowFuture = true }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity style={[styles.field, style]} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[styles.text, !value && styles.placeholder]}>{value || placeholder}</Text>
        <Feather name="calendar" size={16} color={accentColor} />
      </TouchableOpacity>
      <DatePickerModal
        visible={open}
        value={value}
        onSelect={onChange}
        onClose={() => setOpen(false)}
        accentColor={accentColor}
        allowFuture={allowFuture}
      />
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#fafafa', marginBottom: 14,
  },
  text:        { fontSize: 15, color: '#1a1a1a' },
  placeholder: { color: '#bbb' },
});
