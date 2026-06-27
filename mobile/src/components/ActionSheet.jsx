import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { C, R, S } from '../theme'

export default function ActionSheet({ visible, title, options = [], onClose }) {
  if (!visible) return null

  const mainOptions = options.filter(o => o.type !== 'cancel')

  return (
    <View style={s.root}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={s.sheet}>
        {title ? (
          <View style={s.header}>
            <Text style={s.headerText} numberOfLines={2}>{title}</Text>
          </View>
        ) : null}

        {mainOptions.map((opt, i) => (
          <TouchableOpacity
            key={i}
            style={[s.option, i > 0 && s.optionBorder]}
            onPress={() => { onClose(); setTimeout(() => opt.onPress?.(), 50) }}
            activeOpacity={0.65}
          >
            <Text style={[s.optLabel, opt.type === 'destructive' && s.destructive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.65}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root:     { ...StyleSheet.absoluteFillObject, zIndex: 998, elevation: 18 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },

  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.elevated,
    borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl,
    paddingBottom: 32,
    overflow: 'hidden',
  },

  header: {
    paddingHorizontal: S.lg, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
    alignItems: 'center',
  },
  headerText: { color: C.textSub, fontSize: 12, textAlign: 'center', lineHeight: 18 },

  option:       { paddingHorizontal: S.lg, paddingVertical: 18 },
  optionBorder: { borderTopWidth: 1, borderTopColor: C.border },
  optLabel:     { color: C.white, fontSize: 16, fontWeight: '500' },
  destructive:  { color: C.red },

  cancelBtn: {
    marginHorizontal: S.md, marginTop: 10,
    backgroundColor: C.surface,
    borderRadius: R.xl,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  cancelText: { color: C.white, fontSize: 16, fontWeight: '700' },
})
