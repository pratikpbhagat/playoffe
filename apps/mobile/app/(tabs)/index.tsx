import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import type { Database } from '@pickleball/db';

type Match = Database['public']['Tables']['matches']['Row'];

export default function LiveScreen() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const supabase = createSupabaseClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'in_progress')
      .order('scheduled_time');
    setMatches(data ?? []);
  }, [supabase]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('live-matches')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, supabase]);

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#111827' }}>Live Scores</Text>
      </View>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16, gap: 12 }}
      >
        {matches.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#6b7280', marginTop: 40 }}>
            No live matches right now
          </Text>
        ) : (
          matches.map((match) => <MatchCard key={match.id} match={match} />)
        )}
      </ScrollView>
    </View>
  );
}

function MatchCard({ match }: { match: Match }) {
  const sets = (match.sets as { score_a: number; score_b: number }[]) ?? [];
  const current = sets[sets.length - 1];

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
      <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
        Court {match.court} · {match.round_name}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
          {match.entry_a_id?.slice(0, 8) ?? 'TBD'}
        </Text>
        <View style={{ alignItems: 'center', paddingHorizontal: 12 }}>
          <Text style={{ fontSize: 32, fontWeight: '900', color: '#111827', fontVariant: ['tabular-nums'] }}>
            {current?.score_a ?? 0}
            <Text style={{ color: '#d1d5db' }}>:</Text>
            {current?.score_b ?? 0}
          </Text>
        </View>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: '#111827', textAlign: 'right' }} numberOfLines={1}>
          {match.entry_b_id?.slice(0, 8) ?? 'TBD'}
        </Text>
      </View>
    </View>
  );
}
