import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Audio, Video, ResizeMode } from 'expo-av';
import { Image as EImage } from 'expo-image';
import { WebView } from 'react-native-webview';
import QRCode from 'react-native-qrcode-svg';
import type { ChatMessageV2 } from '../core/messageSchema';
import { getChatMediaLocalUriV2, getChatMediaOriginalNameV2, getChatMediaRemoteUrlV2 } from '../core/messageSchema';
import { getDisplayFileName, getLinkUrlSafe, resolveAttachmentRemoteUrl } from '../core/attachmentAccess';
import { parseYoutubeVideoId } from '../services/linkPreviewService';
import { inferPreviewContentKind } from '../core/mediaPreviewKind';
import { shouldLoadRequestInChatWebView, WEBVIEW_MOBILE_USER_AGENT } from '../core/inAppWebViewNavigation';
import {
  buildGoogleStaticMapImageUrlForPreview,
  buildOpenStreetMapEmbedPageUrl,
} from '../services/locationService';
import { openAttachmentInExternalApp } from '../core/openAttachmentExternal';
import { ZoomableImagePreviewV2, type ZoomableImagePreviewV2Ref } from './ZoomableImagePreviewV2';

function getLocationCoords(msg: ChatMessageV2 | null): { lat: number; lng: number } | null {
  if (!msg || msg.type !== 'location') return null;
  const loc = msg.location as Record<string, unknown> | undefined;
  if (!loc) return null;
  const lat = Number((loc as any).lat ?? (loc as any).latitude);
  const lng = Number((loc as any).lng ?? (loc as any).longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function AudioPreviewContent({ url, isActive }: { url: string; isActive: boolean }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [label, setLabel] = useState('재생');
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: false },
          (st) => {
            if (!st.isLoaded) return;
            if (st.didJustFinish) setLabel('다시 듣기');
          }
        );
        if (cancelled) {
          await sound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = sound;
      } catch (e: any) {
        setErr(String(e?.message || e || 'audio_load_failed'));
      }
    })();
    return () => {
      cancelled = true;
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (isActive) return;
    const s = soundRef.current;
    if (!s) return;
    s.pauseAsync().catch(() => {});
    setLabel('재생');
  }, [isActive]);

  const toggle = async () => {
    const s = soundRef.current;
    if (!s) return;
    try {
      const st = await s.getStatusAsync();
      if (!st.isLoaded) return;
      if (st.isPlaying) {
        await s.pauseAsync();
        setLabel('재생');
      } else {
        if (st.positionMillis && st.durationMillis && st.positionMillis >= st.durationMillis - 80) {
          await s.setPositionAsync(0);
        }
        await s.playAsync();
        setLabel('일시정지');
      }
    } catch {}
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
      <Text style={{ color: '#FFD700', fontWeight: '900', marginBottom: 16 }}>음성 메시지</Text>
      {err ? (
        <Text style={{ color: '#FF6B6B', textAlign: 'center' }}>{err}</Text>
      ) : (
        <TouchableOpacity
          onPress={toggle}
          style={{ paddingHorizontal: 28, paddingVertical: 16, borderRadius: 999, backgroundColor: '#FFD700' }}
        >
          <Text style={{ color: '#0C0C0C', fontWeight: '900', fontSize: 16 }}>{label}</Text>
        </TouchableOpacity>
      )}
      <Text style={{ color: '#666', marginTop: 20, fontSize: 12, textAlign: 'center' }} numberOfLines={2}>
        문제가 있으면 아래에서 외부 앱으로 열 수 있습니다.
      </Text>
    </View>
  );
}

/** 임베드(오류 152/153) 회피: 미리보기는 m.youtube.com 시청 페이지로 바로 연다(앱 내 “YouTube에서 보기”와 동일 경로). */
function sanitizeYoutubeVideoId(id: string): string | null {
  const s = String(id || '').trim();
  if (!/^[a-zA-Z0-9_-]{6,32}$/.test(s)) return null;
  return s;
}

const YT_M_WATCH_TRIM_JS = `(function(){try{var h=function(){try{var q=document.querySelectorAll('ytm-app-bar-renderer,ytm-mobile-topbar-renderer,ytm-pivot-bar-renderer,#header-bar');for(var i=0;i<q.length;i++){q[i].style.setProperty('display','none','important');}}catch(e){}};h();}catch(e){}})();true;`;

function YoutubeMWatchPreview(props: { videoId: string; winW: number; height: number }) {
  const { videoId, winW, height } = props;
  const safeId = sanitizeYoutubeVideoId(videoId);
  const uri = useMemo(
    () => (safeId ? `https://m.youtube.com/watch?v=${encodeURIComponent(safeId)}` : ''),
    [safeId],
  );
  const wvRef = useRef<WebView>(null);
  const runTrim = useCallback(() => {
    try {
      wvRef.current?.injectJavaScript(YT_M_WATCH_TRIM_JS);
    } catch {}
  }, []);

  useEffect(() => {
    if (!uri) return;
    const t = [400, 1200, 2500].map((ms) => setTimeout(runTrim, ms));
    return () => t.forEach(clearTimeout);
  }, [uri, runTrim]);

  if (!safeId) {
    return (
      <View style={{ width: winW, height, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text style={{ color: '#888', textAlign: 'center' }}>YouTube 동영상 ID를 인식할 수 없습니다.</Text>
      </View>
    );
  }
  return (
    <View style={{ width: winW, height, backgroundColor: '#000' }}>
      <WebView
        ref={wvRef}
        originWhitelist={['*']}
        source={{ uri }}
        style={{ width: winW, height, backgroundColor: '#000' }}
        userAgent={WEBVIEW_MOBILE_USER_AGENT}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        {...(Platform.OS === 'android'
          ? {
              androidLayerType: 'hardware' as const,
              thirdPartyCookiesEnabled: true,
              mixedContentMode: 'compatibility' as const,
            }
          : {})}
        onLoadEnd={runTrim}
        onNavigationStateChange={() => {
          setTimeout(runTrim, 150);
          setTimeout(runTrim, 800);
        }}
        onShouldStartLoadWithRequest={(req) => shouldLoadRequestInChatWebView(req.url)}
      />
    </View>
  );
}

function ChatLocationPreviewMap(props: {
  coords: { lat: number; lng: number };
  winW: number;
  height: number;
  locAddress: string;
  mapsOpenUrl: string;
}) {
  const { coords, winW, height, locAddress, mapsOpenUrl } = props;
  const mapPxW = Math.min(1024, Math.max(320, Math.floor(winW * 2)));
  const mapPxH = Math.min(1024, Math.max(320, Math.floor(height * 2)));
  const googleStaticUri = useMemo(
    () => buildGoogleStaticMapImageUrlForPreview(coords.lat, coords.lng, mapPxW, mapPxH),
    [coords.lat, coords.lng, mapPxW, mapPxH],
  );
  const osmEmbedUri = useMemo(() => buildOpenStreetMapEmbedPageUrl(coords.lat, coords.lng), [coords.lat, coords.lng]);
  const [staticImageFailed, setStaticImageFailed] = useState(false);

  useEffect(() => {
    setStaticImageFailed(false);
  }, [coords.lat, coords.lng, googleStaticUri]);

  const useOsmWebView = !googleStaticUri || staticImageFailed;

  return (
    <View style={{ width: winW, height, backgroundColor: '#111' }}>
      {useOsmWebView ? (
        <WebView
          originWhitelist={['*']}
          source={{ uri: osmEmbedUri }}
          style={{ width: winW, height, backgroundColor: '#111' }}
          javaScriptEnabled
          domStorageEnabled
          nestedScrollEnabled
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          {...(Platform.OS === 'android'
            ? {
                androidLayerType: 'hardware' as const,
                thirdPartyCookiesEnabled: true,
                mixedContentMode: 'compatibility' as const,
              }
            : {})}
          onShouldStartLoadWithRequest={(req) => shouldLoadRequestInChatWebView(req.url)}
        />
      ) : (
        <EImage
          source={{ uri: googleStaticUri }}
          style={{ width: winW, height }}
          contentFit="cover"
          recyclingKey={googleStaticUri}
          onError={() => setStaticImageFailed(true)}
        />
      )}
      <Text
        style={{
          position: 'absolute',
          bottom: 6,
          alignSelf: 'center',
          color: 'rgba(255,255,255,0.55)',
          fontSize: 9,
        }}
        pointerEvents="none"
      >
        {useOsmWebView ? '© OpenStreetMap contributors' : '© Google'}
      </Text>
      <View
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          right: 56,
          maxWidth: '88%',
          backgroundColor: '#FFF',
          borderRadius: 12,
          padding: 12,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 6,
          elevation: 4,
        }}
      >
        <Text style={{ color: '#111', fontWeight: '800', fontSize: 14 }}>
          {coords.lat}, {coords.lng}
        </Text>
        {locAddress ? (
          <Text style={{ color: '#333', marginTop: 8, fontSize: 13, lineHeight: 18 }}>{locAddress}</Text>
        ) : null}
        <TouchableOpacity onPress={() => Linking.openURL(mapsOpenUrl)} style={{ marginTop: 10 }}>
          <Text style={{ color: '#1a73e8', fontWeight: '700', fontSize: 14 }}>큰 지도 보기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export type ChatMediaPreviewSlideBodyV2Props = {
  msg: ChatMessageV2;
  isActive: boolean;
  winW: number;
  winH: number;
  insetsTop: number;
  insetsBottom: number;
  /** 미리보기 모달 상단 제목줄이 숨겨진 경우 0 (유튜브 몰입) */
  modalChromeOffsetTop?: number;
  allowImageDownload: boolean;
  allowExternalShare: boolean;
  onBlocked?: (reason: string) => void;
  onClose: () => void;
};

export function ChatMediaPreviewSlideBodyV2({
  msg,
  isActive,
  winW,
  winH,
  insetsTop,
  insetsBottom,
  modalChromeOffsetTop = 56,
  allowImageDownload,
  allowExternalShare,
  onBlocked,
  onClose,
}: ChatMediaPreviewSlideBodyV2Props) {
  const localUri = getChatMediaLocalUriV2(msg);
  const urlFromMsg = resolveAttachmentRemoteUrl(msg) || getChatMediaRemoteUrlV2(msg);
  const displayUrl = urlFromMsg || localUri;
  const displayName = getChatMediaOriginalNameV2(msg) || getDisplayFileName(msg);
  const kind = String(msg?.type || '');
  const linkUrl = msg?.type === 'url' ? String(getLinkUrlSafe(msg) || msg?.text || '').trim() : '';
  const previewContentKind = useMemo(() => {
    if (msg.type === 'image') return 'image';
    if (msg.type === 'video') return 'video';
    if (msg.type === 'audio') return 'audio';
    if (msg.type === 'file') return inferPreviewContentKind(msg, displayName, displayUrl);
    return '';
  }, [msg, displayName, displayUrl]);
  const coords = getLocationCoords(msg);
  const locAddress = (() => {
    if (msg.type !== 'location') return '';
    const loc = msg.location as Record<string, unknown> | undefined;
    const road = String((loc as any)?.roadAddress || '').trim();
    return road || String((loc as any)?.address || msg.text || '').trim();
  })();

  const mediaKinds = ['image', 'video', 'file', 'audio'];
  const canOpenMedia =
    mediaKinds.includes(kind) &&
    displayUrl.length > 0 &&
    (msg.status === 'ready' ||
      msg.status === 'sent' ||
      msg.status === 'sending' ||
      msg.status === 'failed' ||
      msg.status === 'uploaded');

  const canOpenLocation = kind === 'location' && coords != null;

  const contentPaneHeight = useMemo(() => {
    const topBar = typeof modalChromeOffsetTop === 'number' ? modalChromeOffsetTop : 56;
    const footerH = 52;
    const imgTools = previewContentKind === 'image' && canOpenMedia ? 46 : 0;
    return Math.max(340, winH - insetsTop - topBar - footerH - insetsBottom - imgTools);
  }, [winH, insetsTop, insetsBottom, previewContentKind, canOpenMedia, modalChromeOffsetTop]);

  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState<string>('');
  const [retry, setRetry] = useState(0);
  const [pdfInlineFailed, setPdfInlineFailed] = useState(false);
  const [pdfInlineMode, setPdfInlineMode] = useState<'direct' | 'gdocs'>('direct');
  const zoomRef = useRef<ZoomableImagePreviewV2Ref>(null);

  useEffect(() => {
    setImgLoading(true);
    setImgError('');
    setRetry(0);
    setPdfInlineFailed(false);
    setPdfInlineMode('direct');
    try {
      zoomRef.current?.reset();
    } catch {}
  }, [displayUrl, previewContentKind, msg.id]);

  const openExternal = useCallback(async () => {
    try {
      if (!allowExternalShare) {
        onBlocked?.('external_share_blocked');
        return;
      }
      const raw =
        msg.type === 'url'
          ? String(linkUrl || displayUrl || '').trim()
          : String(displayUrl || '').trim();
      if (!raw) return;

      const isPdf =
        previewContentKind === 'pdf' ||
        /application\/pdf/i.test(String(msg.mimeType || '')) ||
        /\.pdf(\?|#|$)/i.test(raw) ||
        /\.pdf$/i.test(displayName);
      if (msg.type === 'file' || isPdf) {
        const mt = isPdf ? 'application/pdf' : String(msg.mimeType || '*/*').trim() || '*/*';
        await openAttachmentInExternalApp({
          uri: raw,
          mimeType: mt,
          fileName: displayName || 'file',
          chooserTitle: '앱으로 열기',
        });
        return;
      }

      let target = raw;
      if (Platform.OS === 'android' && /^file:\/\//i.test(raw)) {
        try {
          const FS = require('expo-file-system/legacy');
          if (FS?.getContentUriAsync) {
            target = await FS.getContentUriAsync(raw);
          }
        } catch {}
      }
      const can = await Linking.canOpenURL(target);
      if (!can) {
        Alert.alert('열기 실패', '이 파일을 열 수 있는 앱을 찾지 못했습니다.');
        return;
      }
      await Linking.openURL(target);
    } catch (e: any) {
      Alert.alert('열기 실패', String(e?.message || e || 'open_external_failed'));
    }
  }, [allowExternalShare, displayUrl, displayName, msg.mimeType, msg.type, linkUrl, onBlocked, previewContentKind]);

  const saveImageToLibrary = useCallback(async () => {
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

  const mapsOpenUrl = coords ? `https://maps.google.com/?q=${encodeURIComponent(`${coords.lat},${coords.lng}`)}` : '';

  const body = useMemo(() => {
    if (msg.type === 'qr') {
      const raw = String(msg.qr?.raw || msg.text || '').trim();
      const qrValue = raw.length > 1200 ? raw.slice(0, 1200) : raw;
      const isUrl = /^https?:\/\//i.test(raw) || /^yooy:\/\//i.test(raw);
      return (
        <ScrollView
          style={{ width: winW, maxHeight: contentPaneHeight }}
          contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 16, alignItems: 'center' }}
        >
          <Text style={{ color: '#FFD700', fontWeight: '900', marginBottom: 12 }}>QR 코드</Text>
          {qrValue ? (
            <View style={{ backgroundColor: '#fff', padding: 10, borderRadius: 12 }}>
              <QRCode value={qrValue} size={Math.min(220, winW - 80)} backgroundColor="#fff" color="#000" />
            </View>
          ) : null}
          <Text selectable style={{ color: '#EEE', marginTop: 16, fontSize: 14, lineHeight: 22 }}>
            {raw || '[내용 없음]'}
          </Text>
          {isUrl ? (
            <TouchableOpacity onPress={() => Linking.openURL(raw).catch(() => {})} style={{ marginTop: 16 }}>
              <Text style={{ color: '#4FC3F7', fontWeight: '800' }}>링크 열기</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      );
    }

    if (msg.type === 'url' && linkUrl && /^https?:\/\//i.test(linkUrl)) {
      const yid = parseYoutubeVideoId(linkUrl);
      if (yid) {
        return <YoutubeMWatchPreview videoId={yid} winW={winW} height={contentPaneHeight} />;
      }
      if (/\.(mp4|webm)(\?|#|$)/i.test(linkUrl)) {
        return (
          <View style={{ width: winW, height: contentPaneHeight, backgroundColor: '#000' }}>
            <Video
              source={{ uri: linkUrl }}
              style={{ width: winW, height: contentPaneHeight }}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              shouldPlay={isActive}
              isMuted={!isActive}
            />
          </View>
        );
      }
      return (
        <View style={{ width: winW, height: contentPaneHeight, backgroundColor: '#111' }}>
          <WebView
            originWhitelist={['*']}
            source={{ uri: linkUrl }}
            style={{ width: winW, height: contentPaneHeight, backgroundColor: '#111' }}
            userAgent={WEBVIEW_MOBILE_USER_AGENT}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            sharedCookiesEnabled
            {...(Platform.OS === 'android'
              ? {
                  androidLayerType: 'hardware' as const,
                  thirdPartyCookiesEnabled: true,
                  mixedContentMode: 'compatibility' as const,
                }
              : {})}
            onShouldStartLoadWithRequest={(req) => shouldLoadRequestInChatWebView(req.url)}
            startInLoadingState
            renderLoading={() => (
              <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' }]}>
                <ActivityIndicator color="#FFD700" size="large" />
                <Text style={{ color: '#888', marginTop: 10 }}>페이지 로딩 중…</Text>
              </View>
            )}
          />
        </View>
      );
    }

    if (canOpenLocation && coords) {
      return (
        <ChatLocationPreviewMap
          coords={coords}
          winW={winW}
          height={contentPaneHeight}
          locAddress={locAddress}
          mapsOpenUrl={mapsOpenUrl}
        />
      );
    }

    if (!canOpenMedia) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
          <Text style={{ color: '#FFD700', fontWeight: '900' }}>미디어 준비 중</Text>
          <Text style={{ color: '#888', marginTop: 8, textAlign: 'center' }}>
            status={String(msg.status)} — 로컬 파일이 없으면 업로드 완료 후 미리보기가 가능합니다.
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700' }}
          >
            <Text style={{ color: '#FFD700', fontWeight: '900' }}>닫기</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (previewContentKind === 'image' && canOpenMedia) {
      const src = retry ? `${displayUrl}${displayUrl.includes('?') ? '&' : '?'}r=${retry}` : displayUrl;
      return (
        <View style={{ flex: 1 }}>
          <ZoomableImagePreviewV2
            ref={zoomRef}
            uri={src}
            frameW={winW}
            frameH={contentPaneHeight}
            onLoad={() => setImgLoading(false)}
            onError={() => {
              setImgLoading(false);
              setImgError('이미지를 불러올 수 없습니다.');
            }}
          />
          {imgLoading && (
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.35)',
              }}
            >
              <ActivityIndicator size="large" color="#FFD700" />
              <Text style={{ color: '#EEE', marginTop: 8 }}>이미지 로딩 중...</Text>
            </View>
          )}
          {!!imgError && (
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 18,
                backgroundColor: 'rgba(0,0,0,0.55)',
              }}
            >
              <Text style={{ color: '#FF6B6B', fontWeight: '900' }}>{imgError}</Text>
              <TouchableOpacity
                onPress={() => {
                  setImgLoading(true);
                  setImgError('');
                  setRetry((v) => v + 1);
                }}
                style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700' }}
              >
                <Text style={{ color: '#FFD700', fontWeight: '900' }}>다시 시도</Text>
              </TouchableOpacity>
              {allowImageDownload ? (
                <TouchableOpacity onPress={openExternal} style={{ marginTop: 10 }}>
                  <Text style={{ color: '#AAA', textDecorationLine: 'underline' }}>외부 앱으로 열기</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: '#777', marginTop: 10 }}>이미지 다운로드가 차단되었습니다</Text>
              )}
            </View>
          )}
        </View>
      );
    }

    if (previewContentKind === 'video' && canOpenMedia) {
      return (
        <View style={{ width: winW, height: contentPaneHeight, backgroundColor: '#000' }}>
          <Video
            source={{ uri: displayUrl }}
            style={{ width: winW, height: contentPaneHeight }}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
              shouldPlay={isActive}
              isMuted={!isActive}
            isLooping={false}
          />
        </View>
      );
    }

    if (previewContentKind === 'audio' && canOpenMedia) {
      return <AudioPreviewContent url={displayUrl} isActive={isActive} />;
    }

    if (previewContentKind === 'pdf' && canOpenMedia && displayUrl && !pdfInlineFailed) {
      const directUri = displayUrl;
      const gdocsUri = /^https?:\/\//i.test(displayUrl)
        ? `https://docs.google.com/viewer?url=${encodeURIComponent(displayUrl)}&embedded=true`
        : displayUrl;
      const pdfUri = pdfInlineMode === 'direct' ? directUri : gdocsUri;
      return (
        <View style={{ width: winW, height: contentPaneHeight, backgroundColor: '#1a1a1a' }}>
          <WebView
            originWhitelist={['*']}
            source={{ uri: pdfUri }}
            style={{ width: winW, height: contentPaneHeight, backgroundColor: '#1a1a1a' }}
            onError={() => {
              if (pdfInlineMode === 'direct' && /^https?:\/\//i.test(displayUrl)) {
                setPdfInlineMode('gdocs');
              } else {
                setPdfInlineFailed(true);
              }
            }}
            onHttpError={() => {
              if (pdfInlineMode === 'direct' && /^https?:\/\//i.test(displayUrl)) {
                setPdfInlineMode('gdocs');
              } else {
                setPdfInlineFailed(true);
              }
            }}
            setSupportMultipleWindows={false}
            startInLoadingState
            renderLoading={() => (
              <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' }]}>
                <ActivityIndicator color="#FFD700" size="large" />
                <Text style={{ color: '#888', marginTop: 10 }}>PDF 불러오는 중…</Text>
              </View>
            )}
          />
        </View>
      );
    }

    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
        <Text style={{ color: '#EEE', fontWeight: '900' }}>{displayName || '파일'}</Text>
        <Text style={{ color: '#888', marginTop: 8 }} numberOfLines={2}>
          {displayUrl}
        </Text>
        {allowExternalShare ? (
          <TouchableOpacity
            onPress={openExternal}
            style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700' }}
          >
            <Text style={{ color: '#FFD700', fontWeight: '900' }}>외부 앱으로 열기</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: '#777', marginTop: 12 }}>외부 공유가 제한된 TTL 방입니다.</Text>
        )}
      </View>
    );
  }, [
    msg,
    linkUrl,
    previewContentKind,
    canOpenMedia,
    canOpenLocation,
    coords,
    locAddress,
    mapsOpenUrl,
    kind,
    displayUrl,
    displayName,
    imgLoading,
    imgError,
    retry,
    allowImageDownload,
    openExternal,
    winW,
    onClose,
    contentPaneHeight,
    pdfInlineFailed,
    pdfInlineMode,
    isActive,
    modalChromeOffsetTop,
  ]);

  const showImgBar = previewContentKind === 'image' && canOpenMedia;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, minHeight: contentPaneHeight }}>{body}</View>
      {showImgBar ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: '#222',
            gap: 12,
          }}
        >
          <TouchableOpacity onPress={() => zoomRef.current?.reset()} style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
            <Text style={{ color: '#FFD700', fontSize: 14, fontWeight: '800' }}>맞춤</Text>
          </TouchableOpacity>
          <Text style={{ color: '#666', fontSize: 12 }}>손가락으로 확대·축소·이동</Text>
          {allowImageDownload ? (
            <TouchableOpacity onPress={() => void saveImageToLibrary()} style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
              <Text style={{ color: '#FFD700', fontSize: 14, fontWeight: '800' }}>저장</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
