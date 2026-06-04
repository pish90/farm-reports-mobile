import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface State { error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={s.container}>
        <Text style={s.title}>Startup Error</Text>
        <Text style={s.subtitle}>Please screenshot this and send to support.</Text>
        <ScrollView style={s.scroll}>
          <Text style={s.message}>{error.message}</Text>
          <Text style={s.stack}>{error.stack}</Text>
        </ScrollView>
        <TouchableOpacity style={s.btn} onPress={() => this.setState({ error: null })}>
          <Text style={s.btnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a', padding: 20, paddingTop: 60 },
  title:    { color: '#ff6b6b', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#aaa', fontSize: 13, marginBottom: 16 },
  scroll:   { flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 12, marginBottom: 16 },
  message:  { color: '#ff6b6b', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  stack:    { color: '#ccc', fontSize: 11, fontFamily: 'monospace' },
  btn:      { backgroundColor: '#333', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  btnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
});
