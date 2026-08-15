/**
 * BirthdayModal
 *
 * Shown when the app detects today's birthdays in the user's family.
 * Features:
 *  - Animated confetti/balloon entrance
 *  - Lists all birthday people for today
 *  - Plays the Happy Birthday melody via expo-audio (streaming from a public CDN)
 *  - Stop button / auto-stops when dismissed
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Animated, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';

const { width } = Dimensions.get('window');

// A freely-licensed Happy Birthday instrumental (public domain melody).
const BIRTHDAY_SONG_URL =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

// ── Floating balloon / star decorations ──────────────────────────────────────
const DECORATIONS = ['🎈', '🎂', '🎁', '⭐', '🎊', '🎉', '🎈', '🌟'];

function FloatingDecor({ emoji, delay, startX }) {
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(y, { toValue: -220, duration: 3200, useNativeDriver: true }),
      ]),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        bottom: 20,
        left: startX,
        fontSize: 24,
        opacity,
        transform: [{ translateY: y }],
      }}
    >
      {emoji}
    </Animated.Text>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function BirthdayModal({ visible, birthdays = [], onClose }) {
  const t = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [songError, setSongError] = useState(false);

  // expo-audio: create a player instance once; source is set lazily on open.
  // Passing null here avoids any native-module call before the modal is shown.
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const playing = status?.playing ?? false;

  // Card entrance animation + auto-play on open
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
      playSong();
    } else {
      scaleAnim.setValue(0.7);
      opacityAnim.setValue(0);
      // Stop playback when modal closes without using the close button.
      try { if (playing) player.pause(); } catch (_) {}
    }
  }, [visible]);

  const playSong = async () => {
    try {
      player.replace({ uri: BIRTHDAY_SONG_URL });
      player.play();
    } catch {
      setSongError(true);
    }
  };

  const togglePlay = () => {
    try {
      if (playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      setSongError(true);
    }
  };

  const handleClose = () => {
    try { player.pause(); } catch (_) {}
    onClose();
  };

  if (!visible || birthdays.length === 0) return null;

  const decorPositions = DECORATIONS.map((e, i) => ({
    emoji: e,
    delay: i * 220,
    startX: (i / DECORATIONS.length) * (width - 60) + 10,
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        {/* Floating decorations */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {decorPositions.map((d, i) => (
            <FloatingDecor key={i} emoji={d.emoji} delay={d.delay} startX={d.startX} />
          ))}
        </View>

        {/* Card */}
        <Animated.View
          style={[styles.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
        >
          {/* Header */}
          <View style={[styles.header, { backgroundColor: t.primary }]}>
            <Text style={styles.cakeEmoji}>🎂</Text>
            <Text style={styles.heading}>Happy Birthday!</Text>
            <Text style={styles.subheading}>
              {birthdays.length === 1
                ? 'Wishing a wonderful birthday to'
                : `${birthdays.length} family members celebrate today!`}
            </Text>
          </View>

          {/* Names list */}
          <ScrollView
            style={styles.nameList}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {birthdays.map((b) => {
              const age = b.date_of_birth
                ? new Date().getFullYear() - new Date(b.date_of_birth).getFullYear()
                : null;
              return (
                <View key={b.id} style={styles.nameRow}>
                  <View style={[styles.nameAvatar, { backgroundColor: t.primaryLight }]}>
                    <Text style={[styles.nameAvatarText, { color: t.primary }]}>
                      {b.first_name?.[0]}{b.last_name?.[0]}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nameText}>{b.first_name} {b.last_name}</Text>
                    {age && <Text style={styles.ageText}>Turning {age} today 🎉</Text>}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Song controls */}
          {!songError && (
            <View style={styles.songRow}>
              <Ionicons name="musical-notes-outline" size={16} color={colors.inkSoft} />
              <Text style={styles.songLabel}>Happy Birthday Song</Text>
              <TouchableOpacity style={styles.playBtn} onPress={togglePlay}>
                <Ionicons
                  name={playing ? 'pause-circle' : 'play-circle'}
                  size={32}
                  color={t.primary}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Close */}
          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: t.primary }]} onPress={handleClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: width - 48,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingBottom: 20,
    maxHeight: '80%',
  },
  header: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 20,
  },
  cakeEmoji: { fontSize: 52, marginBottom: 8 },
  heading: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.white,
    textAlign: 'center',
  },
  subheading: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  nameList: {
    maxHeight: 220,
    marginHorizontal: 18,
    marginTop: 18,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  nameAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  nameAvatarText: { fontFamily: fonts.bodySemi, fontSize: 14 },
  nameText: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink },
  ageText: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 1 },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 18,
    marginTop: 16,
    gap: 8,
    backgroundColor: colors.stone,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  songLabel: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.inkSoft },
  playBtn: { padding: 2 },
  closeBtn: {
    marginHorizontal: 18,
    marginTop: 14,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  closeBtnText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.white },
});
