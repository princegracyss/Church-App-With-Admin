/**
 * SendWishModal
 *
 * Allows a parish member to send a birthday wish to another member.
 * The sender picks a song from a curated list, optionally edits the
 * message, then taps "Send Wish". This creates a WISH notification
 * targeted to the birthday person's member ID so it appears in their
 * Notifications screen and opens a WishModal with the chosen song.
 *
 * Props:
 *   visible          boolean
 *   birthdayMemberId string  (UUID of the birthday person)
 *   birthdayName     string  (display name, e.g. "Mary Joseph")
 *   senderName       string  (display name of the person sending)
 *   onClose          () => void
 *   onSent           () => void  (optional, called after successful send)
 */
import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors, fonts, radius } from '../theme/theme';
import api from '../services/api';
import { useTheme } from '../context/ParishContext';

const { width } = Dimensions.get('window');

// Curated list of public-domain / freely-licensed instrumentals.
// Each entry has a label shown in the picker and a URI for playback.
export const WISH_SONGS = [
  {
    id: 'classic',
    label: '🎹 Classic Happy Birthday',
    uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    id: 'joyful',
    label: '🎺 Joyful Celebration',
    uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    id: 'gospel',
    label: '🎸 Gospel Praise',
    uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    id: 'peaceful',
    label: '🎵 Peaceful Blessing',
    uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  },
  {
    id: 'none',
    label: '🔕 No song — text only',
    uri: null,
  },
];

export default function SendWishModal({
  visible,
  birthdayMemberId,
  birthdayName = 'them',
  senderName = '',
  onClose,
  onSent,
}) {
  const t = useTheme();
  const [selectedSong, setSelectedSong] = useState(WISH_SONGS[0]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const isPlaying = status?.playing ?? false;

  // Reset state when modal opens.
  useEffect(() => {
    if (visible) {
      setSelectedSong(WISH_SONGS[0]);
      setMessage('');
      setError(null);
      setSending(false);
      setPreviewPlaying(false);
      try { player.pause(); } catch (_) {}
    } else {
      try { if (isPlaying) player.pause(); } catch (_) {}
      setPreviewPlaying(false);
    }
  }, [visible]);

  // Auto-stop preview when song selection changes.
  useEffect(() => {
    if (previewPlaying) {
      try { player.pause(); } catch (_) {}
      setPreviewPlaying(false);
    }
  }, [selectedSong]);

  const togglePreview = () => {
    if (!selectedSong.uri) return;
    try {
      if (isPlaying) {
        player.pause();
        setPreviewPlaying(false);
      } else {
        player.replace({ uri: selectedSong.uri });
        player.play();
        setPreviewPlaying(true);
      }
    } catch (_) {}
  };

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try { player.pause(); } catch (_) {}
    try {
      const wishMessage =
        message.trim() ||
        `Wishing you a very happy birthday, ${birthdayName.split(' ')[0]}! 🎂`;
      await api.sendBirthdayWish(birthdayMemberId, {
        message: wishMessage,
        songUrl: selectedSong.uri,
        senderName,
      });
      onSent?.();
      onClose();
    } catch (e) {
      setError(e.message ?? 'Failed to send wish. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.heading}>Send Birthday Wish 🎁</Text>
              <Text style={styles.subheading}>To {birthdayName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeIcon} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Song picker */}
            <Text style={styles.sectionLabel}>Choose a song</Text>
            {WISH_SONGS.map((song) => {
              const selected = selectedSong.id === song.id;
              return (
                <TouchableOpacity
                  key={song.id}
                  style={[
                    styles.songRow,
                    selected && { borderColor: t.primary, backgroundColor: t.primaryLight },
                  ]}
                  onPress={() => setSelectedSong(song)}
                  activeOpacity={0.75}
                >
                  <View style={[
                    styles.radio,
                    selected && { borderColor: t.primary },
                  ]}>
                    {selected && <View style={[styles.radioDot, { backgroundColor: t.primary }]} />}
                  </View>
                  <Text style={[
                    styles.songLabel,
                    selected && { fontFamily: fonts.bodyMedium, color: t.primary },
                  ]}>
                    {song.label}
                  </Text>
                  {selected && song.uri && (
                    <TouchableOpacity
                      onPress={togglePreview}
                      style={styles.previewBtn}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={isPlaying ? 'pause-circle-outline' : 'play-circle-outline'}
                        size={22}
                        color={t.primary}
                      />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Message field */}
            <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Personal message (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder={`Wishing you a very happy birthday, ${birthdayName.split(' ')[0]}! 🎂`}
              placeholderTextColor={colors.inkSoft}
              multiline
              numberOfLines={3}
              value={message}
              onChangeText={setMessage}
              maxLength={280}
            />
            <Text style={styles.charCount}>{message.length}/280</Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Send button */}
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: t.primary }, sending && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending}
              activeOpacity={0.8}
            >
              {sending
                ? <ActivityIndicator size="small" color={colors.white} />
                : <>
                    <Ionicons name="paper-plane-outline" size={16} color={colors.white} />
                    <Text style={styles.sendBtnText}>Send Wish</Text>
                  </>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  heading: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.ink,
  },
  subheading: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 2,
  },
  closeIcon: {
    marginTop: 2,
  },
  body: {
    padding: 20,
    paddingTop: 16,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: colors.ink,
    marginBottom: 10,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 7,
    backgroundColor: colors.white,
  },
  songRowSelected: {
    borderColor: colors.divider,
    backgroundColor: colors.stone,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  radioSelected: {
    borderColor: colors.divider,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.inkSoft,
  },
  songLabel: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.ink,
  },
  songLabelSelected: {
    fontFamily: fonts.bodyMedium,
    color: colors.ink,
  },
  previewBtn: {
    padding: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.ink,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: colors.cream,
  },
  charCount: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 4,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.danger,
    marginBottom: 10,
    textAlign: 'center',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.sm,
    paddingVertical: 14,
    marginTop: 14,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.white,
  },
});
