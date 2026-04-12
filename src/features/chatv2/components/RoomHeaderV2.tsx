import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import type { ChatRoomV2 } from '../core/roomSchema';

export function RoomHeaderV2(props: {
  room: ChatRoomV2;
  onBack: () => void;
  onOpenSettings: () => void;
  /** 사람 아이콘: 참석자 목록 (없으면 onOpenProfile) */
  onOpenParticipants?: () => void;
  onOpenProfile?: () => void;
  avatarUrl?: string;
}) {
  const { room, onBack, onOpenSettings, onOpenParticipants, onOpenProfile, avatarUrl } = props;
  const memberCount = useMemo(() => {
    try {
      const n = Array.isArray(room.participantIds) ? room.participantIds.length : 0;
      return n > 0 ? n : undefined;
    } catch {
      return undefined;
    }
  }, [room.participantIds]);

  /** 제목 아래: 방 설명(없으면 타입·인원 보조줄). TTL 남은 시간은 본문 배너에서만 표시 */
  const subtitleLine = useMemo(() => {
    const desc = String((room as any)?.description || '').trim();
    if (desc) return desc;
    if (String(room.type) === 'dm') return '';
    return `${String(room.type).toUpperCase()}${memberCount ? ` · ${memberCount}명` : ''}`;
  }, [room, memberCount]);

  return (
    <View
      style={{
        height: 56,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: '#1E1E1E',
        backgroundColor: '#0C0C0C',
      }}
    >
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 17 }}>←</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, paddingHorizontal: 8 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A2A2A', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: 36, height: 36 }} />
          ) : (
            <Text style={{ color: '#D4AF37', fontWeight: '900' }}>{String(room.title || room.id || 'C').charAt(0)}</Text>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
          <Text style={{ color: '#EEE', fontWeight: '900', fontSize: 14.5 }} numberOfLines={1}>
            {room.title || room.id}
          </Text>
          {subtitleLine ? (
            <Text style={{ color: '#9A9A9A', fontSize: 11, fontWeight: '600' }} numberOfLines={2}>
              {subtitleLine}
            </Text>
          ) : (
            <Text style={{ color: '#777', fontSize: 11 }} numberOfLines={1}>
              {String(room.type).toUpperCase()}
              {memberCount ? ` · ${memberCount}명` : ''}
            </Text>
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          onPress={() => {
            try {
              if (onOpenParticipants) onOpenParticipants();
              else onOpenProfile?.();
            } catch {}
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#B8B8B8', fontWeight: '900', fontSize: 14 }}>👤</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOpenSettings}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 14 }}>⚙</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

