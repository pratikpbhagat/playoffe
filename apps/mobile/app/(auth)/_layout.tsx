import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '@/lib/store/auth';

export default function AuthLayout() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  if (loading) return null;
  if (user) return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
