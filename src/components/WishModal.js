/**
 * WishModal
 *
 * Shown when the birthday person taps a WISH notification in their
 * Notifications screen. Displays the sender's name, their personal message,
 * and plays the song they chose.
 *
 * Props:
 *   visible   boolean
 *   wish      notification row with metadata { sender_name, wish_message, song_url }
 *   onClose   () => void
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

// Reuse the same floating decorations style as BirthdayModal.
const DECORATIONS = ['🎈', '🎁', '💌', '⭐', '🎊', '🎉', '💝', '🌟'];

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

export default function WishModal({ visible, wish, onClose }) {
  const t = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [songError, setSongError] = useState(false);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const playing = status?.playing ?? false;

  const meta = wish?.metadata ?? {};
  const senderName = meta.sender_name ?? wish?.title ?? 'A parish member';
  const senderUnit = meta.sender_unit ?? null;
  const wishMessage = meta.wish_message ?? wish?.message ?? '';
  const songUrl = meta.song_url ?? null;

  useEffect(() => {
    if (visible) {
      setSongError(false);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();

      if (songUrl) {
        try {
          player.replace({ uri: songUrl });
          player.play();
        } catch {
          setSongError(true);
        }
      }
    } else {
      scaleAnim.setValue(0.7);
      opacityAnim.setValue(0);
      try { if (playing) player.pause(); } catch (_) {}
    }
  }, [visible]);

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

  if (!visible || !wish) return null;

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
            <Text style={styles.envelopeEmoji}>💌</Text>
            <Text style={styles.heading}>You got a birthday wish!</Text>
            <Text style={styles.subheading}>from</Text>
            <Text style={styles.senderName}>{senderName}</Text>
            {!!senderUnit && (
              <Text style={styles.senderUnit}>{senderUnit}</Text>
            )}
          </View>

          {/* Message */}
          <ScrollView
            style={styles.messageWrap}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.quoteBubble}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={18}
                color={t.secondary}
                style={{ marginBottom: 8 }}
              />
              <Text style={styles.messageText}>{wishMessage}</Text>
            </View>
          </ScrollView>

          {/* Song controls */}
          {songUrl && !songError && (
            <View style={styles.songRow}>
              <Ionicons name="musical-notes-outline" size={16} color={colors.inkSoft} />
              <Text style={styles.songLabel}>Playing their chosen song</Text>
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
            <Text style={styles.closeBtnText}>Thank you! 🙏</Text>
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
  envelopeEmoji: { fontSize: 48, marginBottom: 8 },
  heading: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.white,
    textAlign: 'center',
  },
  subheading: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
  },
  senderName: {
    fontFamily: fonts.bodySemi,
    fontSize: 18,
    color: colors.white,
    marginTop: 4,
    textAlign: 'center',
  },
  senderUnit: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 3,
    textAlign: 'center',
  },
  messageWrap: {
    maxHeight: 180,
    marginHorizontal: 18,
    marginTop: 18,
  },
  quoteBubble: {
    backgroundColor: colors.stone,
    borderRadius: radius.sm,
    padding: 14,
    alignItems: 'center',
  },
  messageText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 21,
    textAlign: 'center',
  },
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
  songLabel: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.inkSoft,
  },
  playBtn: { padding: 2 },
  closeBtn: {
    marginHorizontal: 18,
    marginTop: 14,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  closeBtnText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.white,
  },
});
