/**
 * YouthJournalArchive.js — the youth's saved (PERMANENT) journal entries.
 *
 * Reads from the on-device archive (AsyncStorage) via journalArchive.js, so the
 * youth can revisit entries they chose to keep — even offline. Re-reads on every
 * focus so a freshly sealed entry appears when navigating back here.
 *
 * PDPA: only PERMANENT entries are ever stored/shown. The Temporary journal is
 * volatile and never reaches this list.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MotiView } from 'moti';
import { loadArchive } from '../../api/journalArchive';
import { pastel, youthRadius as rad } from './youthTheme';

function formatDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function YouthJournalArchive({ navigation }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null); // entry id whose full body is shown

  const refresh = useCallback(() => {
    let active = true;
    setLoading(true);
    loadArchive()
      .then((list) => {
        if (active) setEntries(list);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Re-read on focus so newly sealed entries show up.
  useFocusEffect(refresh);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation?.goBack()} hitSlop={12}>
            <Text style={styles.back}>‹ Shelf</Text>
          </Pressable>
          <Text style={styles.title}>Journal Archive</Text>
          <Text style={styles.subtitle}>Your sealed entries, kept on this device 🔒</Text>
        </View>

        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {loading && (
            <View style={styles.stateBox}>
              <ActivityIndicator color={pastel.mintDeep} />
              <Text style={styles.stateText}>Opening your archive…</Text>
            </View>
          )}

          {!loading && entries.length === 0 && (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>
                No sealed entries yet.{'\n'}Write a Permanent journal to keep it here.
              </Text>
            </View>
          )}

          {!loading &&
            entries.map((e, i) => {
              const open = expanded === e.id;
              return (
                <MotiView
                  key={e.id}
                  from={{ opacity: 0, translateY: 8 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: 'timing', duration: 320, delay: i * 60 }}
                >
                  <Pressable
                    style={styles.card}
                    onPress={() => setExpanded(open ? null : e.id)}
                  >
                    <View style={styles.cardHead}>
                      <Text style={styles.ref}>{e.id}</Text>
                      <Text style={styles.date}>{formatDate(e.committedAt)}</Text>
                    </View>
                    <Text style={styles.body}>
                      {open ? e.body ?? e.preview : e.preview}
                      {!open && (e.body?.length ?? 0) > (e.preview?.length ?? 0) ? '…' : ''}
                    </Text>
                    {(e.body?.length ?? 0) > (e.preview?.length ?? 0) && (
                      <Text style={styles.toggle}>{open ? 'Show less' : 'Read more'}</Text>
                    )}
                  </Pressable>
                </MotiView>
              );
            })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#241B2E' },
  safe: { flex: 1 },
  header: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 6 },
  back: { color: pastel.amber, fontWeight: '800', fontSize: 15 },
  title: { color: pastel.white, fontWeight: '900', fontSize: 28, marginTop: 6 },
  subtitle: { color: pastel.mint, fontWeight: '700', fontSize: 13, marginTop: 4 },

  list: { padding: 18, paddingBottom: 120 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: rad.md,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  ref: { color: pastel.glow, fontWeight: '900', fontSize: 12.5 },
  date: { color: pastel.sub, fontWeight: '700', fontSize: 12 },
  body: { color: pastel.white, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  toggle: { color: pastel.mint, fontWeight: '800', fontSize: 12.5, marginTop: 10 },

  stateBox: { alignItems: 'center', paddingVertical: 60, gap: 14 },
  stateText: { color: pastel.sub, fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
});
