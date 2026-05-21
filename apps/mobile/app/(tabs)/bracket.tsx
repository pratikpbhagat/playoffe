import { View, Text, ScrollView } from 'react-native';
export default function BracketScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#111827' }}>Live Bracket</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 40 }}>Tournament brackets will appear here</Text>
      </ScrollView>
    </View>
  );
}
