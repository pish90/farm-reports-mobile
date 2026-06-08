import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
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
import {
  BusinessUnitDto,
  ExpenseCategoryDto,
} from '../../services/lookupService';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHARED_BU_CODE = 'CC-900';

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export interface ApportionmentValue {
  business_unit_id: number;
  business_unit_code: string;
  business_unit_name: string;
  percentage: string;
  amount: string;
}

export interface ExpenseFormValues {
  day: string;
  supplier_contractor: string;
  receipt_no: string;
  cost: string;
  description: string;
  category_id: number | null;
  category_code: string | null;
  category_name: string | null;
  business_unit_id: number | null;
  business_unit_code: string | null;
  business_unit_name: string | null;
  apportionments: ApportionmentValue[];
  receipt_image_uris: string[];
}

const EMPTY: ExpenseFormValues = {
  day: '', supplier_contractor: '', receipt_no: '', cost: '', description: '',
  category_id: null, category_code: null, category_name: null,
  business_unit_id: null, business_unit_code: null, business_unit_name: null,
  apportionments: [],
  receipt_image_uris: [],
};

interface Props {
  visible: boolean;
  year: number;
  month: number;
  initial?: ExpenseFormValues;
  isEditing: boolean;
  categories: ExpenseCategoryDto[];
  businessUnits: BusinessUnitDto[];
  onSave: (values: ExpenseFormValues) => void;
  onCancel: () => void;
}

// ─── Picker row ──────────────────────────────────────────────────────────────

interface PickerRowProps {
  label: string;
  value: string | null;
  onPress: () => void;
  placeholder: string;
  required?: boolean;
}

function PickerRow({ label, value, onPress, placeholder, required }: PickerRowProps) {
  return (
    <View>
      <Text style={styles.label}>{label}{required ? ' *' : ''}</Text>
      <TouchableOpacity style={styles.pickerButton} onPress={() => { Keyboard.dismiss(); onPress(); }} activeOpacity={0.7}>
        <Text style={value ? styles.pickerValue : styles.pickerPlaceholder}>
          {value ?? placeholder}
        </Text>
        <Text style={styles.pickerChevron}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Inline picker overlay (renders inside the parent Modal) ─────────────────

interface DropdownProps<T> {
  title: string;
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  onSelect: (item: T) => void;
  onClose: () => void;
}

function Dropdown<T>({ title, items, getKey, getLabel, onSelect, onClose }: DropdownProps<T>) {
  return (
    <>
      <Pressable style={styles.dropdownBackdrop} onPress={onClose} />
      <View style={styles.dropdownSheet}>
        <View style={styles.handle} />
        <Text style={styles.dropdownTitle}>{title}</Text>
        <ScrollView keyboardShouldPersistTaps="handled">
          {items.map((item) => (
            <TouchableOpacity
              key={getKey(item)}
              style={styles.dropdownItem}
              onPress={() => { onSelect(item); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownItemText}>{getLabel(item)}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </>
  );
}

// ─── Main form ───────────────────────────────────────────────────────────────

export default function ExpenseForm({ visible, year, month, initial, isEditing, categories, businessUnits, onSave, onCancel }: Props) {
  const daysInMonth = getDaysInMonth(year, month);
  const scrollRef = useRef<ScrollView>(null);

  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showBuPicker,  setShowBuPicker]  = useState(false);
  const [showApportBuPicker, setShowApportBuPicker] = useState<number | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const { control, handleSubmit, reset, setValue, formState: { errors } } =
    useForm<ExpenseFormValues>({ defaultValues: EMPTY });

  const watchedCost = useWatch({ control, name: 'cost' });
  const watchedBuId = useWatch({ control, name: 'business_unit_id' });
  const watchedCategoryId   = useWatch({ control, name: 'category_id' });
  const watchedCategoryCode = useWatch({ control, name: 'category_code' });
  const watchedCategoryName = useWatch({ control, name: 'category_name' });
  const watchedBuCode = useWatch({ control, name: 'business_unit_code' });
  const watchedBuName = useWatch({ control, name: 'business_unit_name' });
  const watchedApportionments = useWatch({ control, name: 'apportionments' });
  const watchedReceiptUris = useWatch({ control, name: 'receipt_image_uris' });

  const isShared = useMemo(() => {
    return watchedBuId != null &&
      businessUnits.find((b) => b.id === watchedBuId)?.code === SHARED_BU_CODE;
  }, [watchedBuId, businessUnits]);

  const nonSharedUnits = useMemo(
    () => businessUnits.filter((b) => b.code !== SHARED_BU_CODE),
    [businessUnits],
  );

  // Auto-calculate amounts when percentages change
  useEffect(() => {
    if (!isShared) return;
    const total = parseFloat(watchedCost) || 0;
    const apports = watchedApportionments ?? [];
    const updated = apports.map((ap) => {
      const pct = parseFloat(ap.percentage) || 0;
      return { ...ap, amount: total > 0 ? ((pct / 100) * total).toFixed(2) : '' };
    });
    if (JSON.stringify(updated) !== JSON.stringify(apports)) {
      setValue('apportionments', updated);
    }
  }, [watchedCost, watchedApportionments?.map((a) => a.percentage).join(','), isShared]);

  useEffect(() => {
    if (visible) {
      reset(initial ?? EMPTY);
    } else {
      setShowCatPicker(false);
      setShowBuPicker(false);
      setShowApportBuPicker(null);
    }
  }, [visible]);

  const addApportionmentRow = () => {
    setValue('apportionments', [
      ...(watchedApportionments ?? []),
      { business_unit_id: 0, business_unit_code: '', business_unit_name: '', percentage: '', amount: '' },
    ]);
  };

  const removeApportionmentRow = (idx: number) => {
    const updated = (watchedApportionments ?? []).filter((_, i) => i !== idx);
    setValue('apportionments', updated);
  };

  const totalApportionedPct = (watchedApportionments ?? []).reduce(
    (s, ap) => s + (parseFloat(ap.percentage) || 0), 0,
  );
  const pctWarning = isShared && (watchedApportionments ?? []).length > 0 &&
    Math.abs(totalApportionedPct - 100) > 0.01;

  async function pickReceipt(source: 'camera' | 'gallery') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const label = source === 'camera' ? 'camera' : 'photo library';
      Alert.alert(
        'Permission Required',
        `Allow Farm Reports to access your ${label} in Settings.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, mediaTypes: 'images' });
    if (!result.canceled && result.assets[0]) {
      const srcUri = result.assets[0].uri;
      let savedUri = srcUri;
      try {
        const receiptsDir = FileSystem.documentDirectory + 'receipts/';
        await FileSystem.makeDirectoryAsync(receiptsDir, { intermediates: true });
        const destUri = receiptsDir + `receipt_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: srcUri, to: destUri });
        savedUri = destUri;
      } catch {
        // copy failed — fall back to the picker URI which still works for this session
      }
      setValue('receipt_image_uris', [...(watchedReceiptUris ?? []), savedUri]);
    }
  }

  function removeReceiptAt(idx: number) {
    setValue('receipt_image_uris', (watchedReceiptUris ?? []).filter((_, i) => i !== idx));
  }

  const anyPickerOpen = showCatPicker || showBuPicker || showApportBuPicker !== null;

  function handleRequestClose() {
    if (previewUri) { setPreviewUri(null); return; }
    if (showApportBuPicker !== null) { setShowApportBuPicker(null); return; }
    if (showBuPicker) { setShowBuPicker(false); return; }
    if (showCatPicker) { setShowCatPicker(false); return; }
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleRequestClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onCancel}
        pointerEvents={anyPickerOpen ? 'none' : 'auto'}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kvWrap}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{isEditing ? 'Edit Expense' : 'New Expense'}</Text>
          <Text style={styles.monthLabel}>{MONTHS[month - 1]} {year}</Text>

          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
          >
            {/* Day */}
            <Text style={styles.label}>Day *</Text>
            <Controller
              control={control} name="day"
              rules={{ required: 'Required', validate: (v) => {
                const n = parseInt(v, 10);
                return (!isNaN(n) && n >= 1 && n <= daysInMonth) || `Enter 1 – ${daysInMonth}`;
              }}}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, !!errors.day && styles.inputError]}
                  value={value} onChangeText={onChange} onBlur={onBlur}
                  keyboardType="number-pad" placeholder={`1 – ${daysInMonth}`}
                  placeholderTextColor="#bbb" maxLength={2} selectTextOnFocus
                />
              )}
            />
            {errors.day && <Text style={styles.errorText}>{errors.day.message}</Text>}

            {/* Supplier */}
            <Text style={styles.label}>Supplier / Vendor</Text>
            <Controller
              control={control} name="supplier_contractor"
              rules={{ maxLength: { value: 255, message: 'Too long' } }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, !!errors.supplier_contractor && styles.inputError]}
                  value={value} onChangeText={onChange} onBlur={onBlur}
                  placeholder="e.g. Acme Limited" placeholderTextColor="#bbb"
                  autoCapitalize="words" maxLength={255} returnKeyType="next"
                />
              )}
            />

            {/* Receipt No */}
            <Text style={styles.label}>Receipt No.</Text>
            <Controller
              control={control} name="receipt_no"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={styles.input} value={value} onChangeText={onChange} onBlur={onBlur}
                  placeholder="e.g. 145" placeholderTextColor="#bbb" maxLength={100} returnKeyType="next"
                />
              )}
            />

            {/* Description */}
            <Text style={styles.label}>Description</Text>
            <Controller
              control={control} name="description"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={value} onChangeText={onChange} onBlur={onBlur}
                  placeholder="e.g. Assorted nails, cement bags" placeholderTextColor="#bbb"
                  multiline maxLength={500}
                />
              )}
            />

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            <TouchableOpacity style={styles.pickerButton} onPress={() => { Keyboard.dismiss(); setShowCatPicker(true); }} activeOpacity={0.7}>
              <Text style={watchedCategoryId != null && watchedCategoryCode ? styles.pickerValue : styles.pickerPlaceholder}>
                {watchedCategoryId != null && watchedCategoryCode
                  ? `${watchedCategoryCode} – ${watchedCategoryName}`
                  : 'Select category'}
              </Text>
              <Text style={styles.pickerChevron}>›</Text>
            </TouchableOpacity>

            {/* Business Unit */}
            <PickerRow
              label="Business Unit"
              value={watchedBuId != null && watchedBuName ? `${watchedBuCode} – ${watchedBuName}` : null}
              onPress={() => { Keyboard.dismiss(); setShowBuPicker(true); }}
              placeholder="Select business unit"
            />

            {/* Amount */}
            <Text style={styles.label}>Amount (Ksh) *</Text>
            <Controller
              control={control} name="cost"
              rules={{ required: 'Required', validate: (v) => {
                const n = parseFloat(v);
                return (!isNaN(n) && n > 0) || 'Must be greater than 0';
              }}}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, !!errors.cost && styles.inputError]}
                  value={value} onChangeText={onChange} onBlur={onBlur}
                  keyboardType="decimal-pad" placeholder="0.00"
                  placeholderTextColor="#bbb" maxLength={12} selectTextOnFocus
                />
              )}
            />
            {errors.cost && <Text style={styles.errorText}>{errors.cost.message}</Text>}

            {/* CC-900 Apportionment */}
            {isShared && (
              <View style={styles.apportionBox}>
                <View style={styles.apportionHeader}>
                  <Text style={styles.apportionTitle}>Cost Apportionment</Text>
                  {watchedCost ? (
                    <Text style={styles.apportionTotalAmt}>
                      Total: Ksh {parseFloat(watchedCost).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </Text>
                  ) : null}
                </View>
                {(watchedApportionments ?? []).map((ap, idx) => (
                  <View key={idx} style={styles.apportionRow}>
                    <TouchableOpacity
                      style={styles.apportionBuBtn}
                      onPress={() => { Keyboard.dismiss(); setShowApportBuPicker(idx); }}
                      activeOpacity={0.7}
                    >
                      <Text style={ap.business_unit_name ? styles.pickerValue : styles.pickerPlaceholder}>
                        {ap.business_unit_name || 'Select unit'}
                      </Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.apportionPctInput}
                      value={ap.percentage}
                      onChangeText={(v) => {
                        const updated = [...(watchedApportionments ?? [])];
                        updated[idx] = { ...updated[idx], percentage: v };
                        setValue('apportionments', updated);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="%"
                      placeholderTextColor="#bbb"
                      maxLength={6}
                    />
                    <Text style={styles.apportionAmount}>
                      {ap.amount ? `${parseFloat(ap.amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}` : '—'}
                    </Text>
                    <TouchableOpacity onPress={() => removeApportionmentRow(idx)} hitSlop={8}>
                      <Text style={styles.apportionRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <View style={styles.apportionFooter}>
                  <TouchableOpacity style={styles.addApportionBtn} onPress={addApportionmentRow}>
                    <Text style={styles.addApportionText}>+ Add unit</Text>
                  </TouchableOpacity>
                  <Text style={[styles.pctTotal, pctWarning && styles.pctWarning]}>
                    {totalApportionedPct.toFixed(1)}% {pctWarning ? '⚠ must equal 100%' : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Receipt Photos */}
            <Text style={styles.label}>
              Receipt Photos{(watchedReceiptUris ?? []).length > 0 ? ` (${watchedReceiptUris.length})` : ''}
            </Text>
            {(watchedReceiptUris ?? []).length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={styles.thumbRow}>
                  {watchedReceiptUris.map((uri, idx) => (
                    <View key={idx} style={styles.receiptPreview}>
                      <TouchableOpacity onPress={() => setPreviewUri(uri)} activeOpacity={0.85}>
                        <Image source={{ uri }} style={styles.receiptThumb} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.receiptRemoveBtn}
                        onPress={() => removeReceiptAt(idx)}
                        hitSlop={8}
                      >
                        <Feather name="x" size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
            <View style={styles.receiptBtnRow}>
              <TouchableOpacity style={styles.receiptBtn} onPress={() => pickReceipt('camera')} activeOpacity={0.7}>
                <Feather name="camera" size={16} color="#2d6a4f" />
                <Text style={styles.receiptBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.receiptBtn} onPress={() => pickReceipt('gallery')} activeOpacity={0.7}>
                <Feather name="image" size={16} color="#2d6a4f" />
                <Text style={styles.receiptBtnText}>Gallery</Text>
              </TouchableOpacity>
            </View>

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

      {/* iOS: pickers inside same Modal (avoids sibling-Modal touch bug on iOS)
          Android: pickers in own Modals (avoids touch-bleed and z-order issues) */}
      {Platform.OS === 'ios' ? (
        <>
          {showCatPicker && (
            <Dropdown
              title="Select Category"
              items={categories}
              getKey={(c) => String(c.id)}
              getLabel={(c) => `${c.accountCode} – ${c.accountName}`}
              onSelect={(c) => { setValue('category_id', c.id); setValue('category_code', c.accountCode); setValue('category_name', c.accountName); }}
              onClose={() => setShowCatPicker(false)}
            />
          )}
          {showBuPicker && (
            <Dropdown
              title="Select Business Unit"
              items={businessUnits}
              getKey={(b) => String(b.id)}
              getLabel={(b) => `${b.code} – ${b.name}`}
              onSelect={(b) => { setValue('business_unit_id', b.id); setValue('business_unit_code', b.code); setValue('business_unit_name', b.name); if (b.code !== SHARED_BU_CODE) setValue('apportionments', []); }}
              onClose={() => setShowBuPicker(false)}
            />
          )}
          {showApportBuPicker !== null && (
            <Dropdown
              title="Select Business Unit"
              items={nonSharedUnits}
              getKey={(b) => String(b.id)}
              getLabel={(b) => `${b.code} – ${b.name}`}
              onSelect={(b) => { const updated = [...(watchedApportionments ?? [])]; updated[showApportBuPicker!] = { ...updated[showApportBuPicker!], business_unit_id: b.id, business_unit_code: b.code, business_unit_name: b.name }; setValue('apportionments', updated); }}
              onClose={() => setShowApportBuPicker(null)}
            />
          )}
        </>
      ) : (
        <>
          <Modal visible={showCatPicker} transparent animationType="slide" onRequestClose={() => setShowCatPicker(false)}>
            <Dropdown
              title="Select Category"
              items={categories}
              getKey={(c) => String(c.id)}
              getLabel={(c) => `${c.accountCode} – ${c.accountName}`}
              onSelect={(c) => { setValue('category_id', c.id); setValue('category_code', c.accountCode); setValue('category_name', c.accountName); }}
              onClose={() => setShowCatPicker(false)}
            />
          </Modal>
          <Modal visible={showBuPicker} transparent animationType="slide" onRequestClose={() => setShowBuPicker(false)}>
            <Dropdown
              title="Select Business Unit"
              items={businessUnits}
              getKey={(b) => String(b.id)}
              getLabel={(b) => `${b.code} – ${b.name}`}
              onSelect={(b) => { setValue('business_unit_id', b.id); setValue('business_unit_code', b.code); setValue('business_unit_name', b.name); if (b.code !== SHARED_BU_CODE) setValue('apportionments', []); }}
              onClose={() => setShowBuPicker(false)}
            />
          </Modal>
          <Modal visible={showApportBuPicker !== null} transparent animationType="slide" onRequestClose={() => setShowApportBuPicker(null)}>
            {showApportBuPicker !== null && (
              <Dropdown
                title="Select Business Unit"
                items={nonSharedUnits}
                getKey={(b) => String(b.id)}
                getLabel={(b) => `${b.code} – ${b.name}`}
                onSelect={(b) => { const updated = [...(watchedApportionments ?? [])]; updated[showApportBuPicker!] = { ...updated[showApportBuPicker!], business_unit_id: b.id, business_unit_code: b.code, business_unit_name: b.name }; setValue('apportionments', updated); }}
                onClose={() => setShowApportBuPicker(null)}
              />
            )}
          </Modal>
        </>
      )}

      {/* Full-screen receipt preview */}
      {previewUri && (
        <>
          <Pressable style={styles.previewBackdrop} onPress={() => setPreviewUri(null)} />
          <View style={styles.previewContainer} pointerEvents="box-none">
            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
            <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewUri(null)}>
              <Feather name="x" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  kvWrap:   { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '92%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0',
    alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  title:      { fontSize: 18, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 4 },
  monthLabel: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 16 },
  label:      { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 14, marginBottom: 5 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    color: '#1a1a1a', backgroundColor: '#fafafa',
  },
  inputError: { borderColor: '#e53e3e' },
  errorText:  { fontSize: 12, color: '#e53e3e', marginTop: 3 },

  pickerButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fafafa',
  },
  pickerValue:       { fontSize: 15, color: '#1a1a1a', flex: 1 },
  pickerPlaceholder: { fontSize: 15, color: '#bbb', flex: 1 },
  pickerChevron:     { fontSize: 20, color: '#aaa', marginLeft: 8 },

  apportionBox: {
    marginTop: 14, borderWidth: 1, borderColor: '#d0e8db', borderRadius: 8,
    backgroundColor: '#f7faf9', overflow: 'hidden',
  },
  apportionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
  },
  apportionTitle: {
    fontSize: 13, fontWeight: '600', color: '#2d6a4f',
  },
  apportionTotalAmt: {
    fontSize: 12, fontWeight: '600', color: '#2d6a4f',
  },
  apportionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#c8e6c9',
  },
  apportionBuBtn: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 7, backgroundColor: '#fff',
  },
  apportionPctInput: {
    width: 52, borderWidth: 1, borderColor: '#ddd', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 7, fontSize: 14, textAlign: 'center',
    backgroundColor: '#fff', color: '#1a1a1a',
  },
  apportionAmount: { width: 70, fontSize: 13, color: '#555', textAlign: 'right', fontVariant: ['tabular-nums'] },
  apportionRemove: { fontSize: 16, color: '#e53e3e', paddingHorizontal: 4 },
  apportionFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#c8e6c9',
  },
  addApportionBtn:  { },
  addApportionText: { fontSize: 13, fontWeight: '600', color: '#2d6a4f' },
  pctTotal:   { fontSize: 13, color: '#555' },
  pctWarning: { color: '#e53e3e', fontWeight: '600' },

  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 50,
    elevation: 10,
  },
  dropdownSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '70%', paddingHorizontal: 0, paddingBottom: 16,
    zIndex: 100,
    elevation: 20,
  },
  dropdownTitle: {
    fontSize: 16, fontWeight: '700', color: '#1a1a1a',
    textAlign: 'center', paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  dropdownItem: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0',
  },
  dropdownItemText: { fontSize: 15, color: '#1a1a1a' },

  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#666' },
  saveBtn: {
    flex: 1, backgroundColor: '#2d6a4f', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  receiptBtnRow: { flexDirection: 'row', gap: 10 },
  receiptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: '#d0e8db', borderRadius: 8, borderStyle: 'dashed',
    paddingVertical: 12, backgroundColor: '#f7faf9',
  },
  receiptBtnText: { fontSize: 14, fontWeight: '600', color: '#2d6a4f' },
  thumbRow:       { flexDirection: 'row', gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  receiptPreview: { position: 'relative' },
  receiptThumb:   { width: 80, height: 80, borderRadius: 8, backgroundColor: '#eee' },
  receiptRemoveBtn: {
    position: 'absolute', top: -6, right: -6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#e53e3e', alignItems: 'center', justifyContent: 'center',
  },

  previewBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.92)' },
  previewContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '80%' },
  previewCloseBtn: {
    position: 'absolute', top: 48, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
});
