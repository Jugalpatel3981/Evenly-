// Building blocks shared by every screen.
import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { catOf, typeOf } from '@/lib/categories';
import { initials } from '@/lib/util';

import { Icon, type IconName } from './icons';
import { F, useTheme } from './theme';

/* ---------- text ---------- */
type TxtProps = {children?: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; small?: boolean; weight?: 'body' | 'medium' | 'semi' | 'bold';
  color?: string; numberOfLines?: number; selectable?: boolean};
export function Txt({children, style, muted, small, weight = 'body', color, numberOfLines, selectable}: TxtProps){
  const {c} = useTheme();
  return <Text numberOfLines={numberOfLines} selectable={selectable}
    style={[{fontFamily: F[weight], fontSize: small ? 13 : 15, lineHeight: small ? 18 : 21, color: color || (muted ? c.muted : c.ink)}, style]}>{children}</Text>;
}
export function Title({children, style}: {children: ReactNode; style?: StyleProp<TextStyle>}){
  const {c} = useTheme();
  return <Text accessibilityRole="header" style={[{fontFamily: F.displayBlack, fontSize: 34, lineHeight: 40, color: c.ink, letterSpacing: -0.5}, style]}>{children}</Text>;
}
export function H2({children, style}: {children: ReactNode; style?: StyleProp<TextStyle>}){
  const {c} = useTheme();
  return <Text accessibilityRole="header" style={[{fontFamily: F.display, fontSize: 20, lineHeight: 26, color: c.ink}, style]}>{children}</Text>;
}
// Small capitals heading above a list: "LAST SIX MONTHS".
export function Label({children, style}: {children: ReactNode; style?: StyleProp<TextStyle>}){
  const {c} = useTheme();
  return <Text style={[{fontFamily: F.bold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: c.muted}, style]}>{children}</Text>;
}

/* ---------- page ---------- */
// A scrolling page in one narrow column (max 720 wide on big screens), clear of the notch.
export function Screen({children, bottom = 110, top = true, refresh}: {children: ReactNode; bottom?: number; top?: boolean; refresh?: ReactNode}){
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{flex: 1, backgroundColor: c.bg}} keyboardShouldPersistTaps="handled" refreshControl={refresh as any}
      contentContainerStyle={{paddingTop: top ? insets.top + 8 : 8, paddingBottom: bottom + insets.bottom, paddingHorizontal: 16}}>
      <View style={{width: '100%', maxWidth: 720, alignSelf: 'center', gap: 18}}>{children}</View>
    </ScrollView>
  );
}
export function Center({children}: {children: ReactNode}){
  const {c} = useTheme();
  return <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: 24, gap: 12}}>{children}</View>;
}
export function Loading({text}: {text: string}){
  const {c} = useTheme();
  return <Center><ActivityIndicator color={c.accent} /><Txt muted>{text}</Txt></Center>;
}

/* ---------- buttons ---------- */
type BtnProps = {title: string; onPress?: () => void; icon?: IconName; kind?: 'primary' | 'plain' | 'ghost' | 'danger' | 'cta';
  disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; left?: ReactNode; small?: boolean; accessibilityLabel?: string};
export function Button({title, onPress, icon, kind = 'plain', disabled, busy, style, left, small, accessibilityLabel}: BtnProps){
  const {c} = useTheme();
  const bg = {primary: c.accent, cta: c.cta, plain: c.surface, ghost: 'transparent', danger: c.surface}[kind];
  const fg = {primary: c.accentInk, cta: c.ctaInk, plain: c.ink, ghost: c.accent, danger: c.owe}[kind];
  const border = kind === 'plain' || kind === 'danger' ? c.line : 'transparent';
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityLabel={accessibilityLabel || title}
      style={({pressed}) => [{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: small ? 36 : 46,
        paddingHorizontal: small ? 12 : 18, borderRadius: 12, backgroundColor: bg, borderWidth: 1, borderColor: border,
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1}, style]}>
      {busy ? <ActivityIndicator color={fg} size="small" /> : left || (icon ? <Icon name={icon} size={small ? 15 : 18} color={fg} /> : null)}
      <Txt weight="semi" color={fg} small={small}>{title}</Txt>
    </Pressable>
  );
}
export function IconButton({icon, onPress, label, color, size = 22}: {icon: IconName; onPress?: () => void; label: string; color?: string; size?: number}){
  const {c} = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({pressed}) => ({width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.chip : 'transparent'})}>
      <Icon name={icon} size={size} color={color || c.ink} />
    </Pressable>
  );
}
export function LinkText({title, onPress, small}: {title: string; onPress: () => void; small?: boolean}){
  const {c} = useTheme();
  return <Txt weight="semi" small={small} color={c.accent} style={{textDecorationLine: 'underline'}}><Text onPress={onPress} accessibilityRole="link">{title}</Text></Txt>;
}

/* ---------- form fields ---------- */
export function Field({label, style, ...props}: TextInputProps & {label: string}){
  const {c} = useTheme();
  return (
    <View style={{gap: 6}}>
      <Txt weight="semi" small muted>{label}</Txt>
      <TextInput placeholderTextColor={c.muted} {...props} accessibilityLabel={label}
        style={[{fontFamily: F.body, fontSize: 16, color: c.ink, backgroundColor: c.field, borderWidth: 1, borderColor: c.line,
          borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === 'web' ? 12 : 10, minHeight: 46}, style]} />
    </View>
  );
}
export function Hint({text, ok}: {text?: string | null; ok?: boolean}){
  const {c} = useTheme();
  if (!text) return null;
  return <Txt small color={ok ? c.owed : c.owe}>{text}</Txt>;
}

/* ---------- cards and lists ---------- */
export function Card({children, style, pad = true}: {children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean}){
  const {c} = useTheme();
  return <View style={[{backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.line, overflow: 'hidden'}, pad && {padding: 18, gap: 12}, style]}>{children}</View>;
}
export function Row({children, onPress, style, accessibilityLabel}: {children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; accessibilityLabel?: string}){
  const {c} = useTheme();
  const base: ViewStyle = {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, minHeight: 60};
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    style={({pressed}) => [base, {borderRadius: 12, backgroundColor: pressed ? c.hover : 'transparent'}, style]}>{children}</Pressable>;
}
export function Divider(){
  const {c} = useTheme();
  return <View style={{height: StyleSheet.hairlineWidth, backgroundColor: c.line}} />;
}
export function Chevron(){
  const {c} = useTheme();
  return <Icon name="chevron-right" size={18} color={c.muted} />;
}
export function Empty({title, text, action}: {title: string; text: string; action?: ReactNode}){
  return <View style={{alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 12}}>
    <H2 style={{textAlign: 'center'}}>{title}</H2>
    <Txt muted style={{textAlign: 'center', maxWidth: 380}}>{text}</Txt>
    {action}
  </View>;
}

/* ---------- pictures ---------- */
export function Avatar({name, url, size = 44}: {name?: string | null; url?: string | null; size?: number}){
  const {c} = useTheme();
  const box: ViewStyle = {width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: c.chip};
  if (url) return <View style={box} accessible={false}><Image source={{uri: url}} style={{width: size, height: size}} contentFit="cover" /></View>;
  return <View style={box} accessible={false}><Txt weight="bold" color={c.accent} style={{fontSize: size * 0.38, lineHeight: size * 0.5}}>{initials(name)}</Txt></View>;
}
export function GroupAvatar({type, cover, size = 52}: {type?: string; cover?: string | null; size?: number}){
  const {c} = useTheme();
  const t = typeOf(type);
  const tint = {trip: c.cat.transport, home: c.cat.home, couple: c.cat.life, other: c.accent}[t[0]] || c.accent;
  const box: ViewStyle = {width: size, height: size, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: tint + '22'};
  if (cover) return <View style={box}><Image source={{uri: cover}} style={{width: size, height: size}} contentFit="cover" /></View>;
  return <View style={box}><Icon name={t[2]} size={size * 0.46} color={tint} /></View>;
}
// A rounded square with a category icon in its colour.
export function CatIcon({cat, icon, color, size = 40}: {cat?: string | null; icon?: IconName; color?: string; size?: number}){
  const {c} = useTheme();
  const k = catOf(cat);
  const tint = color || c.cat[k.color] || c.accent;
  return <View style={{width: size, height: size, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tint + '22'}}>
    <Icon name={icon || k.icon} size={size * 0.5} color={tint} />
  </View>;
}

/* ---------- top bar ---------- */
export function AppBar({left, right}: {left?: ReactNode; right?: ReactNode}){
  return <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44}}>{left || <View />}{right || <View />}</View>;
}

/* ---------- segmented switch ---------- */
export function Seg<T extends string>({options, value, onChange}: {options: [T, string][]; value: T; onChange: (v: T) => void}){
  const {c} = useTheme();
  return (
    <View style={{flexDirection: 'row', backgroundColor: c.chip, borderRadius: 12, padding: 4, gap: 4}} accessibilityRole="tablist">
      {options.map(([k, l]) => (
        <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{selected: value === k}}
          style={{flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9, backgroundColor: value === k ? c.surface : 'transparent'}}>
          <Txt weight="semi" small color={value === k ? c.ink : c.muted}>{l}</Txt>
        </Pressable>
      ))}
    </View>
  );
}
