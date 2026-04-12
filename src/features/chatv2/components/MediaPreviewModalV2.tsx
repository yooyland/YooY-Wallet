import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Linking,
  Share,
  Alert,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatMessageV2 } from '../core/messageSchema';
import { getChatMediaLocalUriV2, getChatMediaOriginalNameV2, getChatMediaRemoteUrlV2 } from '../core/messageSchema';
import { inferPreviewContentKind } from '../core/mediaPreviewKind';
import { openAttachmentInExternalApp } from '../core/openAttachmentExternal';
import { getDisplayFileName, getLinkUrlSafe, resolveAttachmentRemoteUrl, resolveMessageShareText } from '../core/attachmentAccess';
import { parseFirestoreMs } from '../core/firestoreMs';
import { parseYoutubeVideoId } from '../services/linkPreviewService';
import { ChatMediaPreviewSlideBodyV2 } from './ChatMediaPreviewSlideBodyV2';

type Props = {
  visible: boolean;
  msg: ChatMessageV2 | null;
  /** 미리보기 순서(대화 순). 없으면 [msg]만 사용 */
  previewChain?: ChatMessageV2[];
  previewIndex?: number;
  onPreviewIndexChange?: (idx: number) => void;
  allowImageDownload?: boolean;
  allowExternalShare?: boolean;
  onBlocked?: (reason: string) => void;
  onClose: () => void;
  onForward?: (msg: ChatMessageV2) => void | Promise<void>;
  onArchive?: (msg: ChatMessageV2) => void | Promise<void>;
};

function formatPreviewTime(m: ChatMessageV2 | null): string {
  if (!m) return '';
  const ms = parseFirestoreMs(m.createdAt) || parseFirestoreMs(m.updatedAt) || 0;
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true,
    });
  } catch {
    return '';
  }
}

function PreviewFooter({
  insetsBottom,
  primaryLabel,
  onPrimary,
  onCopy,
  onForward,
  onArchive,
  onClose,
  copyDisabled,
}: {
  insetsBottom: number;
  primaryLabel: string;
  onPrimary: () => void;
  onCopy: () => void;
  onForward: () => void;
  onArchive: () => void;
  onClose: () => void;
  copyDisabled?: boolean;
}) {
  const btn = (label: string, onPress: () => void, disabled?: boolean) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{ flex: 1, alignItems: 'center', paddingVertical: 10, opacity: disabled ? 0.4 : 1 }}
    >
      <Text style={{ color: '#EEE', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: Math.max(10, insetsBottom),
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#2A2A2A',
        backgroundColor: '#0A0A0A',
      }}
    >
      {btn(primaryLabel, onPrimary)}
      {btn('복사', onCopy, copyDisabled)}
      {btn('전달', onForward)}
      {btn('보관', onArchive)}
      {btn('닫기', onClose)}
    </View>
  );
}

export function MediaPreviewModalV2({
  visible,
  msg,
  previewChain,
  previewIndex = 0,
  onPreviewIndexChange,
  allowImageDownload = true,
  allowExternalShare = true,
  onBlocked,
  onClose,
  onForward,
  onArchive,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const listRef = useRef<FlatList<ChatMessageV2>>(null);

  const chain = useMemo(() => {
    if (previewChain && previewChain.length > 0) return previewChain;
    return msg ? [msg] : [];
  }, [previewChain, msg]);

  const safeIdx = Math.max(0, Math.min(Math.max(0, chain.length - 1), previewIndex));
  const activeMsg = chain.length ? chain[safeIdx] : null;

  const activeIsYoutubeWatch = useMemo(() => {
    if (!activeMsg || activeMsg.type !== 'url') return false;
    const u = String(getLinkUrlSafe(activeMsg) || activeMsg.text || '').trim();
    return !!parseYoutubeVideoId(u);
  }, [activeMsg]);

  useEffect(() => {
    if (!visible || chain.length <= 1) return;
    try {
      listRef.current?.scrollToIndex({ index: safeIdx, animated: false });
    } catch {
      try {
        listRef.current?.scrollToOffset({ offset: winW * safeIdx, animated: false });
      } catch {}
    }
  }, [visible, chain.length, safeIdx, winW]);

  const goPrev = () => {
    const n = Math.max(0, safeIdx - 1);
    onPreviewIndexChange?.(n);
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: n, animated: true });
      } catch {}
    });
  };

  const goNext = () => {
    const n = Math.min(chain.length - 1, safeIdx + 1);
    onPreviewIndexChange?.(n);
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: n, animated: true });
      } catch {}
    });
  };

  const urlFromMsg = activeMsg ? resolveAttachmentRemoteUrl(activeMsg) || getChatMediaRemoteUrlV2(activeMsg) : '';
  const localPick = activeMsg ? getChatMediaLocalUriV2(activeMsg) : '';
  const displayUrl = urlFromMsg || localPick || '';
  const displayName = activeMsg ? getChatMediaOriginalNameV2(activeMsg) || getDisplayFileName(activeMsg) : '';
  const kind = String(activeMsg?.type || '');
  const linkUrl =
    activeMsg?.type === 'url' ? String(getLinkUrlSafe(activeMsg) || activeMsg?.text || '').trim() : '';

  const coords =
    activeMsg?.type === 'location'
      ? (() => {
          const loc = activeMsg.location as Record<string, unknown> | undefined;
          if (!loc) return null;
          const lat = Number((loc as any).lat ?? (loc as any).latitude);
          const lng = Number((loc as any).lng ?? (loc as any).longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return { lat, lng };
        })()
      : null;

  const locAddress = (() => {
    if (!activeMsg || activeMsg.type !== 'location') return '';
    const loc = activeMsg.location as Record<string, unknown> | undefined;
    const road = String((loc as any)?.roadAddress || '').trim();
    return road || String((loc as any)?.address || activeMsg.text || '').trim();
  })();

  const mapsOpenUrl = coords ? `https://maps.google.com/?q=${encodeURIComponent(`${coords.lat},${coords.lng}`)}` : '';

  const copyPayload = useCallback((): string => {
    if (!activeMsg) return '';
    if (activeMsg.type === 'location' && coords) {
      return `${coords.lat},${coords.lng}${locAddress ? `\n${locAddress}` : ''}`;
    }
    return resolveMessageShareText(activeMsg) || displayUrl || String(activeMsg.text || '');
  }, [activeMsg, coords, locAddress, displayUrl]);

  const handleCopy = useCallback(async () => {
    const t = copyPayload().trim();
    if (!t) {
      Alert.alert('복사', '복사할 내용이 없습니다.');
      return;
    }
    try {
      await Clipboard.setStringAsync(t);
      Alert.alert('복사', '클립보드에 복사했습니다.');
    } catch {
      Alert.alert('복사', '복사에 실패했습니다.');
    }
  }, [copyPayload]);

  const handleForward = useCallback(async () => {
    if (!activeMsg) return;
    try {
      if (onForward) {
        await onForward(activeMsg);
        return;
      }
      if (!allowExternalShare) {
        onBlocked?.('external_share_blocked');
        return;
      }
      const text = resolveMessageShareText(activeMsg) || `[${kind}]`;
      await Share.share({ message: text });
    } catch {}
  }, [activeMsg, onForward, allowExternalShare, onBlocked, kind]);

  const handleArchive = useCallback(async () => {
    if (!activeMsg) return;
    try {
      if (onArchive) {
        await onArchive(activeMsg);
        return;
      }
      Alert.alert('보관', '보관 기능은 준비 중입니다.');
    } catch {}
  }, [activeMsg, onArchive]);

  const openExternal = useCallback(() => {
    void (async () => {
      try {
        if (!allowExternalShare) {
          onBlocked?.('external_share_blocked');
          return;
        }
        const raw =
          activeMsg.type === 'url'
            ? String(linkUrl || displayUrl || '').trim()
            : String(displayUrl || '').trim();
        if (!raw || !activeMsg) return;
        const pc = inferPreviewContentKind(activeMsg, displayName, raw);
        const isPdf =
          pc === 'pdf' ||
          /application\/pdf/i.test(String(activeMsg.mimeType || '')) ||
          /\.pdf(\?|#|$)/i.test(raw) ||
          /\.pdf$/i.test(displayName);
        if (activeMsg.type === 'file' || isPdf) {
          const mt = isPdf ? 'application/pdf' : String(activeMsg.mimeType || '*/*').trim() || '*/*';
          await openAttachmentInExternalApp({
            uri: raw,
            mimeType: mt,
            fileName: displayName || 'file',
            chooserTitle: '앱으로 열기',
          });
          return;
        }
        await Linking.openURL(raw);
      } catch {}
    })();
  }, [allowExternalShare, displayUrl, displayName, activeMsg, linkUrl, onBlocked]);

  const saveImageToLibraryModal = useCallback(async () => {
    if (!allowImageDownload) {
      onBlocked?.('image_download_blocked');
      return;
    }
    const uri = displayUrl;
    if (!uri) return;
    try {
      const MediaLibrary = await import('expo-media-library');
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('저장', '사진 저장 권한이 필요합니다.');
        return;
      }
      if (/^https?:\/\//i.test(uri)) {
        const FS = require('expo-file-system/legacy');
        const ext = (displayName || 'image').match(/\.[a-z0-9]+$/i)?.[0] || '.jpg';
        const dest = `${FS.cacheDirectory}yy_preview_${Date.now()}${ext}`;
        const dl = await FS.downloadAsync(uri, dest);
        await MediaLibrary.saveToLibraryAsync(dl.uri);
      } else {
        await MediaLibrary.saveToLibraryAsync(uri);
      }
      Alert.alert('저장', '앨범에 저장했습니다.');
    } catch (e: any) {
      Alert.alert('저장', String(e?.message || e || '저장 실패'));
    }
  }, [allowImageDownload, displayUrl, displayName, onBlocked]);

  const headerTitle = useMemo(() => {
    if (!activeMsg) return '미리보기';
    if (activeMsg.type === 'qr') return 'QR 코드';
    if (activeMsg.type === 'location') return locAddress.trim() ? locAddress : '위치';
    if (activeMsg.type === 'url') {
      const t = String(activeMsg.link?.title || '').trim();
      if (t) return t;
      try {
        const u = new URL(linkUrl || String(activeMsg.text || ''));
        return u.hostname.replace(/^www\./i, '') || '링크';
      } catch {
        return '링크';
      }
    }
    if (activeMsg.type === 'image' || activeMsg.type === 'video' || activeMsg.type === 'file' || activeMsg.type === 'audio') {
      const name = getChatMediaOriginalNameV2(activeMsg) || getDisplayFileName(activeMsg);
      return name || String(activeMsg.type).toUpperCase();
    }
    return displayName || String(activeMsg.type).toUpperCase();
  }, [activeMsg, displayName, locAddress, linkUrl]);

  const timeLine = formatPreviewTime(activeMsg);

  const previewContentKind = useMemo(() => {
    if (!activeMsg) return '';
    if (activeMsg.type === 'image') return 'image';
    if (activeMsg.type === 'video') return 'video';
    if (activeMsg.type === 'audio') return 'audio';
    if (activeMsg.type === 'file') {
      const dn = getChatMediaOriginalNameV2(activeMsg) || getDisplayFileName(activeMsg);
      return inferPreviewContentKind(activeMsg, dn, displayUrl);
    }
    return '';
  }, [activeMsg, displayUrl]);

  const runPrimaryAction = useCallback(() => {
    if (!activeMsg) return;
    if (activeMsg.type === 'location') {
      Linking.openURL(mapsOpenUrl).catch(() => {});
      return;
    }
    if (previewContentKind === 'image' && allowImageDownload) {
      void saveImageToLibraryModal();
      return;
    }
    openExternal();
  }, [activeMsg, mapsOpenUrl, allowImageDownload, saveImageToLibraryModal, openExternal, previewContentKind]);

  const primaryLabel =
    activeMsg?.type === 'location'
      ? '지도 열기'
      : activeMsg?.type === 'url'
        ? '브라우저'
        : previewContentKind === 'image'
          ? allowImageDownload
            ? '저장'
            : '열기'
          : '열기';

  const footerCopyDisabled = !copyPayload().trim();
  const showNav = chain.length > 1;
  const navLabel = showNav ? `${safeIdx + 1} / ${chain.length}` : '';

  const renderSlide = useCallback(
    ({ item, index }: { item: ChatMessageV2; index: number }) => {
      const itemLink = item.type === 'url' ? String(getLinkUrlSafe(item) || item.text || '').trim() : '';
      const itemYt = item.type === 'url' && !!parseYoutubeVideoId(itemLink);
      return (
        <View style={{ width: winW }}>
          <ChatMediaPreviewSlideBodyV2
            msg={item}
            isActive={index === safeIdx}
            winW={winW}
            winH={winH}
            insetsTop={insets.top}
            insetsBottom={insets.bottom}
            modalChromeOffsetTop={itemYt ? 0 : 56}
            allowImageDownload={allowImageDownload}
            allowExternalShare={allowExternalShare}
            onBlocked={onBlocked}
            onClose={onClose}
          />
        </View>
      );
    },
    [winW, winH, insets.top, insets.bottom, allowImageDownload, allowExternalShare, onBlocked, onClose, safeIdx]
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={Platform.OS === 'android'}
      statusBarTranslucent={Platform.OS === 'android'}
      presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : undefined}
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flex: 1, paddingTop: insets.top }}>
            {!activeIsYoutubeWatch ? (
              <View
                style={{
                  minHeight: 52,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ color: '#EEE', fontWeight: '800', fontSize: 15 }} numberOfLines={1}>
                    {headerTitle}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 8 }}>
                    {timeLine ? (
                      <Text style={{ color: '#AAA', fontSize: 12 }} numberOfLines={1}>
                        {timeLine}
                      </Text>
                    ) : null}
                    {navLabel ? (
                      <Text style={{ color: '#FFD700', fontSize: 12, fontWeight: '800' }}>{navLabel}</Text>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
                  <Text style={{ color: '#FFF', fontWeight: '300', fontSize: 28, lineHeight: 30 }}>×</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{
                  position: 'absolute',
                  right: 14,
                  top: 8,
                  zIndex: 100,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 22,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                }}
              >
                <Text style={{ color: '#FFF', fontWeight: '300', fontSize: 28, lineHeight: 30 }}>×</Text>
              </TouchableOpacity>
            )}

            <View style={{ flex: 1, position: 'relative' }}>
              {chain.length > 0 ? (
                <FlatList
                  ref={listRef}
                  data={chain}
                  horizontal
                  pagingEnabled
                  keyboardShouldPersistTaps="handled"
                  keyExtractor={(m) => m.id}
                  renderItem={renderSlide}
                  initialScrollIndex={safeIdx}
                  getItemLayout={(_, i) => ({ length: winW, offset: winW * i, index: i })}
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const x = e.nativeEvent.contentOffset.x;
                    const i = Math.round(x / Math.max(1, winW));
                    const clamped = Math.max(0, Math.min(chain.length - 1, i));
                    if (clamped !== safeIdx) onPreviewIndexChange?.(clamped);
                  }}
                  onScrollToIndexFailed={(info) => {
                    setTimeout(() => {
                      try {
                        listRef.current?.scrollToOffset({
                          offset: (info.averageItemLength || winW) * info.index,
                          animated: false,
                        });
                      } catch {}
                    }, 80);
                  }}
                  extraData={safeIdx}
                />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#777' }}>미리보기 없음</Text>
                </View>
              )}

              {showNav ? (
                <>
                  <TouchableOpacity
                    onPress={goPrev}
                    disabled={safeIdx <= 0}
                    style={{
                      position: 'absolute',
                      left: 8,
                      top: '42%',
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: 'rgba(0,0,0,0.45)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: safeIdx <= 0 ? 0.25 : 1,
                    }}
                  >
                    <Text style={{ color: '#FFF', fontSize: 38, fontWeight: '800', lineHeight: 40 }}>{'<'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={goNext}
                    disabled={safeIdx >= chain.length - 1}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '42%',
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: 'rgba(0,0,0,0.45)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: safeIdx >= chain.length - 1 ? 0.25 : 1,
                    }}
                  >
                    <Text style={{ color: '#FFF', fontSize: 38, fontWeight: '800', lineHeight: 40 }}>{'>'}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>

            <PreviewFooter
              insetsBottom={insets.bottom}
              primaryLabel={primaryLabel}
              onPrimary={runPrimaryAction}
              onCopy={handleCopy}
              onForward={handleForward}
              onArchive={handleArchive}
              onClose={onClose}
              copyDisabled={footerCopyDisabled}
            />
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
