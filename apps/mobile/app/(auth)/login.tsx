import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    const supabase = createSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.replace('/(tabs)');
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 8 }}>Welcome back</Text>
        <Text style={{ fontSize: 15, color: '#6b7280', marginBottom: 32 }}>Log in to Pickleball Platform</Text>

        {error && (
          <View style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <Text style={{ color: '#b91c1c', fontSize: 14 }}>{error}</Text>
          </View>
        )}

        <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Email</Text>
        <TextInput
          value={email} onChangeText={setEmail}
          keyboardType="email-address" autoCapitalize="none"
          placeholder="alex@example.com"
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 16 }}
        />

        <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Password</Text>
        <TextInput
          value={password} onChangeText={setPassword}
          secureTextEntry placeholder="••••••••"
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 24 }}
        />

        <TouchableOpacity
          onPress={handleLogin} disabled={loading}
          style={{ backgroundColor: '#16a34a', borderRadius: 10, padding: 16, alignItems: 'center', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Log in</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
