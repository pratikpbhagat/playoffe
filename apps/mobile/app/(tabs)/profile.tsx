import { View, Text, TouchableOpacity } from 'react-native';
import { useAuthStore } from '@/lib/store/auth';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#111827' }}>My Profile</Text>
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        {user && (
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16 }}>
            <Text style={{ fontSize: 14, color: '#6b7280' }}>Logged in as</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginTop: 4 }}>{user.email}</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={signOut}
          style={{ backgroundColor: '#fee2e2', borderRadius: 10, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#b91c1c', fontWeight: '600' }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
