import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { colors, radius } from '../theme';
import { getLang, tr } from '../i18n';
import { logError } from './errorLog';

type State = { error: Error | null; tries: number };

/**
 * Catches render errors anywhere below it and shows a friendly Arabic/English screen instead of a white screen
 * or a crash. Sits outside every provider, so it uses no context and only system fonts.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, tries: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError(error, `render${info.componentStack ? ': ' + info.componentStack.trim().split('\n')[0] : ''}`, true);
  }

  retry = () => this.setState((s) => ({ error: null, tries: s.tries + 1 }));
  restart = () => { Updates.reloadAsync().catch(() => this.retry()); };

  render() {
    if (!this.state.error) return this.props.children;
    const lang = getLang();
    const other = lang === 'ar' ? 'en' : 'ar';
    const rtl = lang === 'ar';
    return (
      <View style={s.wrap} accessibilityRole="alert">
        <View style={s.badge}><Text style={s.bang}>!</Text></View>
        <Text style={[s.title, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>{tr('errTitle', lang)}</Text>
        <Text style={[s.body, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>{tr('errBody', lang)}</Text>
        <Text style={[s.alt, { writingDirection: rtl ? 'ltr' : 'rtl' }]}>{tr('errTitle', other)}</Text>
        {/* After a second failure "try again" is unlikely to help: lead with a full restart. */}
        <Pressable style={s.btn} onPress={this.state.tries > 0 ? this.restart : this.retry} accessibilityRole="button">
          <Text style={s.btnText}>{tr(this.state.tries > 0 ? 'errRestart' : 'errRetry', lang)}</Text>
        </Pressable>
        <Pressable style={s.link} onPress={this.state.tries > 0 ? this.retry : this.restart} accessibilityRole="button" hitSlop={8}>
          <Text style={s.linkText}>{tr(this.state.tries > 0 ? 'errRetry' : 'errRestart', lang)}</Text>
        </Pressable>
      </View>
    );
  }
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  badge: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  bang: { color: '#fff', fontSize: 34, fontWeight: '800' },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 23, color: colors.muted, textAlign: 'center' },
  alt: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  btn: { marginTop: 12, backgroundColor: colors.red, paddingHorizontal: 28, paddingVertical: 14, borderRadius: radius.pill, minWidth: 200, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { padding: 8 },
  linkText: { color: colors.maroon, fontSize: 14, fontWeight: '600' },
});
