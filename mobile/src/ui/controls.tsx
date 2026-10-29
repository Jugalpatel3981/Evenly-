// Form controls the web gets for free: drop-down lists, switches, chips, a "tap again to confirm" button, a top bar.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, Switch as RNSwitch, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icons';
import { Button, IconButton, Txt } from './kit';
import { F, useTheme } from './theme';

/* ---------- top bar of a full-screen form: ✕  Title  Save ---------- */
export function FormBar({title, onClose, onSave, save = 'Save', busy, closeIcon = 'x', right}: {title: string; onClose: () => void; onSave?: () => void;
  save?: string; busy?: boolean; closeIcon?: IconName; right?: ReactNode}){
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{paddingTop: insets.top, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line}}>
      <View style={{flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 8, maxWidth: 736, width: '100%', alignSelf: 'center'}}>
        <IconButton icon={closeIcon} label={closeIcon === 'x' ? 'Close' : 'Back'} onPress={onClose} size={closeIcon === 'x' ? 22 : 24} />
        <Txt weight="bold" style={{flex: 1, textAlign: 'center', fontSize: 17}} numberOfLines={1}>{title}</Txt>
        {right ?? (onSave ? <Button kind="ghost" title={save} onPress={onSave} busy={busy} small style={{minWidth: 64}} /> : <View style={{width: 42}} />)}
      </View>
    </View>
  );
}

/* ---------- a drop-down: tap to open a list, pick one ---------- */
export type Option = {value: string; label: string; section?: string; icon?: ReactNode};
type SelectProps = {label: string; value: string; options: Option[]; onChange: (v: string) => void; search?: boolean;
  children?: (open: () => void, current?: Option) => ReactNode; style?: StyleProp<ViewStyle>; disabled?: boolean};
export function Select({label, value, options, onChange, search, children, style, disabled}: SelectProps){
  const {c} = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  const show = () => { if (!disabled) setOpen(true); };
  return (
    <>
      {children ? children(show, current) : (
        <View style={[{gap: 6}, style]}>
          <Txt weight="semi" small muted>{label}</Txt>
          <Pressable onPress={show} accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label || ''}`} disabled={disabled}
            style={{flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.field, borderWidth: 1, borderColor: c.line, borderRadius: 12,
              paddingHorizontal: 14, minHeight: 46, opacity: disabled ? 0.6 : 1}}>
            {current?.icon}
            <Txt style={{flex: 1, fontSize: 16}} numberOfLines={1}>{current?.label || ''}</Txt>
            <Icon name="chevron-right" size={16} color={c.muted} />
          </Pressable>
        </View>
      )}
      {open && <OptionList title={label} options={options} value={value} search={search} onClose={() => setOpen(false)} onPick={v => { setOpen(false); onChange(v); }} />}
    </>
  );
}
function OptionList({title, options, value, search, onClose, onPick}: {title: string; options: Option[]; value: string; search?: boolean;
  onClose: () => void; onPick: (v: string) => void}){
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hit = t ? options.filter(o => o.label.toLowerCase().includes(t) || o.value.toLowerCase().includes(t)) : options;
    // Section headings as their own rows.
    const out: (Option & {head?: boolean})[] = []; let last: string | undefined;
    for (const o of hit) { if (o.section && o.section !== last) { out.push({value: '§' + o.section, label: o.section, head: true}); last = o.section; } out.push(o); }
    return out;
  }, [q, options]);
  const ref = useRef<FlatList>(null);
  const start = Math.max(0, list.findIndex(o => o.value === value));
  useEffect(() => { if (!q && start > 4) setTimeout(() => ref.current?.scrollToIndex({index: start, viewPosition: 0.3, animated: false}), 50); }, [q, start]);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{flex: 1, backgroundColor: '#0008'}} onPress={onClose} accessibilityLabel="Close" />
      <View style={{position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80%', backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        paddingBottom: insets.bottom + 8, maxWidth: 640, width: '100%', alignSelf: 'center'}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4}}>
          <Txt weight="bold" style={{flex: 1, fontSize: 18}}>{title}</Txt>
          <IconButton icon="x" label="Close" onPress={onClose} />
        </View>
        {search && <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={c.muted} autoFocus accessibilityLabel="Search"
          style={{marginHorizontal: 16, marginBottom: 8, fontFamily: F.body, fontSize: 16, color: c.ink, backgroundColor: c.field, borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 44}} />}
        <FlatList ref={ref} data={list} keyExtractor={o => o.value} keyboardShouldPersistTaps="handled" initialNumToRender={40}
          onScrollToIndexFailed={() => {}}
          renderItem={({item: o}) => (o as any).head
            ? <Txt small weight="bold" muted style={{paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 1}}>{o.label}</Txt>
            : <Pressable onPress={() => onPick(o.value)} accessibilityRole="button" accessibilityState={{selected: o.value === value}}
                style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? c.hover : 'transparent'})}>
                {o.icon}
                <Txt style={{flex: 1}} weight={o.value === value ? 'semi' : 'body'}>{o.label}</Txt>
                {o.value === value && <Icon name="check" size={18} color={c.accent} />}
              </Pressable>} />
      </View>
    </Modal>
  );
}

/* ---------- a labelled on/off switch ---------- */
export function SwitchRow({value, onChange, title, sub, disabled}: {value: boolean; onChange: (v: boolean) => void; title: string; sub?: string; disabled?: boolean}){
  const {c} = useTheme();
  return (
    <Pressable onPress={() => !disabled && onChange(!value)} accessibilityRole="switch" accessibilityState={{checked: value, disabled}} accessibilityLabel={title}
      style={{flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.5 : 1}}>
      <View style={{flex: 1}}>
        <Txt weight={sub ? 'semi' : 'body'} small={!sub}>{title}</Txt>
        {sub && <Txt small muted>{sub}</Txt>}
      </View>
      {/* The whole row is the switch for screen readers; the toggle itself is just its picture. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden pointerEvents="none">
        <RNSwitch value={value} disabled={disabled} trackColor={{true: c.accent, false: c.line}} thumbColor="#fff" />
      </View>
    </Pressable>
  );
}

/* ---------- pill-shaped chips under a page heading ---------- */
export function Chip({title, onPress, primary, on, icon}: {title: string; onPress: () => void; primary?: boolean; on?: boolean; icon?: IconName}){
  const {c} = useTheme();
  const bg = primary ? c.cta : on ? c.accent : c.surface, fg = primary ? c.ctaInk : on ? c.accentInk : c.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{selected: !!on}}
      style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 38, borderRadius: 19,
        backgroundColor: bg, borderWidth: 1, borderColor: primary || on ? bg : c.line, opacity: pressed ? 0.75 : 1})}>
      {icon && <Icon name={icon} size={14} color={fg} />}
      <Txt weight="semi" small color={fg}>{title}</Txt>
    </Pressable>
  );
}

/* ---------- destructive button that asks for a second tap ---------- */
export function ConfirmButton({title, armed = 'Tap again to confirm', onConfirm, icon = 'trash', kind = 'danger', small, disabled, style}: {title: string; armed?: string;
  onConfirm: () => void; icon?: IconName; kind?: 'danger' | 'plain'; small?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>}){
  const [on, setOn] = useState(false);
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), 3500); return () => clearTimeout(t); }, [on]);
  return <Button kind={kind} small={small} icon={on ? undefined : icon} title={on ? armed : title} disabled={disabled} style={style}
    onPress={() => { if (on) { setOn(false); onConfirm(); } else setOn(true); }} />;
}
// The same for an icon in a top bar.
export function ConfirmIcon({icon, label, onConfirm}: {icon: IconName; label: string; onConfirm: () => void}){
  const {c} = useTheme();
  const [on, setOn] = useState(false);
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), 3500); return () => clearTimeout(t); }, [on]);
  if (on) return <Button kind="ghost" small title="Tap again" style={{minHeight: 40}} onPress={() => { setOn(false); onConfirm(); }} />;
  return <IconButton icon={icon} label={label} color={c.ink} size={20} onPress={() => setOn(true)} />;
}

/* ---------- a toolbar button at the bottom of a form ---------- */
export function Tool({icon, label, onPress, iconOnly, accessibilityLabel}: {icon: IconName; label?: string; onPress?: () => void; iconOnly?: boolean; accessibilityLabel?: string}){
  const {c} = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label}
      style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: iconOnly ? 10 : 8, minHeight: 44, borderRadius: 10, backgroundColor: pressed ? c.hover : 'transparent'})}>
      <Icon name={icon} size={iconOnly ? 20 : 18} color={c.accent} />
      {!!label && <Txt weight="semi" color={c.accent}>{label}</Txt>}
    </Pressable>
  );
}
