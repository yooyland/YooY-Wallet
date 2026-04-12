import React from 'react';
import { View, Text, Image, Platform, StyleSheet, TouchableOpacity } from 'react-native';
import { QR_FRAME_BORDER, type QrFrameVariant } from '@/lib/qrFrameVariants';

let QRCode: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  QRCode = require('react-native-qrcode-svg').default || require('react-native-qrcode-svg');
} catch {}

export type QrSavePopupCardProps = {
  payload: string;
  /** 강조 제목 (예: `[YOY] / 3 YOY`) — 상단 흰 제목이 없으면 이 값이 흰 제목으로도 쓰임 */
  titleLine: string;
  language: string;
  /** html2canvas / getElementById용 (웹) */
  webCaptureId?: string;
  /** 프레임·로고 링 테두리 색: 받기 골드 / 명함 파랑 / 기프트 빨강 / 초대 주황 */
  variant?: QrFrameVariant;
  /** 상단 흰색 제목 (명함: "QR 이미지 저장" 등). 없으면 `titleLine`과 동일하게 표시 */
  headline?: string;
  /** 우상단 X + 하단 원형 닫기 */
  onClose?: () => void;
  /** false면 상단 X만 숨김(부모 모달에 닫기가 있을 때) */
  showTopClose?: boolean;
};

/**
 * 스크린샷 저장 UX: 흰 제목 → 안내 → 강조 제목 → 색 테두리 QR + 중앙 로고 → 닫기.
 */
export const QrSavePopupCard = React.forwardRef<View, QrSavePopupCardProps>(function QrSavePopupCard(
  {
    payload,
    titleLine,
    language,
    webCaptureId = 'qr-save-popup-card',
    variant = 'receive',
    headline,
    onClose,
    showTopClose = true,
  },
  ref
) {
  const frameColor = QR_FRAME_BORDER[variant] || QR_FRAME_BORDER.receive;
  const instruction =
    language === 'en' ? 'Take a screenshot to save this QR code' : '스크린샷을 찍어서 QR코드를 저장하세요';
  const topWhite = (headline ?? titleLine).trim() || titleLine;
  const closeLabel = language === 'en' ? 'Close' : '닫기';

  const safePayload = String(payload || '').trim() || ' ';

  return (
    <View
      ref={ref}
      collapsable={false}
      style={styles.wrap}
      {...(Platform.OS === 'web' ? ({ id: webCaptureId } as Record<string, string>) : {})}
    >
      {onClose && showTopClose ? (
        <TouchableOpacity
          style={[styles.topCloseBtn, { borderColor: frameColor }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.topCloseText}>×</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.titleWhite}>{topWhite}</Text>

      <View style={styles.instructionWrap}>
        <Text style={styles.instruction}>{instruction}</Text>
      </View>
      <View style={styles.titleWrap}>
        <Text style={[styles.titleAccent, { color: frameColor }]}>{titleLine}</Text>
      </View>
      <View style={[styles.outerFrame, { borderColor: frameColor }]}>
        <View style={[styles.innerWhite, { borderColor: frameColor }]}>
          <View style={styles.qrBox}>
            {Platform.OS !== 'web' && QRCode ? (
              <View style={styles.qrRelative}>
                <QRCode
                  value={safePayload}
                  size={240}
                  backgroundColor="#FFFFFF"
                  color="#000000"
                  quietZone={20}
                  ecl="H"
                />
                <View style={[styles.logoAbs, { borderColor: frameColor }]}>
                  <Image source={require('@/assets/images/side_logo.png')} style={styles.logoImg} resizeMode="contain" />
                </View>
              </View>
            ) : (
              <View style={styles.qrRelativeWeb}>
                <Image
                  source={{
                    uri: `https://api.qrserver.com/v1/create-qr-code/?size=600x600&ecc=H&margin=20&color=000000&bgcolor=ffffff&data=${encodeURIComponent(safePayload)}`,
                  }}
                  style={styles.qrImgWeb}
                  resizeMode="contain"
                />
                <View style={[styles.logoAbs, { borderColor: frameColor }]}>
                  <Image source={require('@/assets/images/side_logo.png')} style={styles.logoImg} resizeMode="contain" />
                </View>
              </View>
            )}
          </View>
        </View>
      </View>

      {onClose ? (
        <TouchableOpacity style={styles.bottomCloseBtn} onPress={onClose} accessibilityRole="button">
          <Text style={styles.bottomCloseText}>{closeLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingTop: 8,
    paddingHorizontal: 8,
    position: 'relative',
  },
  topCloseBtn: {
    position: 'absolute',
    top: 0,
    right: 4,
    zIndex: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCloseText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 24,
    marginTop: -2,
  },
  titleWhite: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 44,
  },
  instructionWrap: {
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  instruction: {
    color: '#AAAAAA',
    fontSize: 13,
    textAlign: 'center',
  },
  titleWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  titleAccent: {
    fontWeight: '800',
    fontSize: 18,
    textAlign: 'center',
  },
  outerFrame: {
    padding: 0,
    borderRadius: 16,
    borderWidth: 4,
    backgroundColor: '#000',
  },
  innerWhite: {
    margin: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 0,
    borderWidth: 2,
  },
  qrBox: {
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  qrRelative: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrRelativeWeb: {
    position: 'relative',
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrImgWeb: {
    width: 260,
    height: 260,
  },
  logoAbs: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -24,
    backgroundColor: '#000',
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: 36,
    height: 36,
  },
  bottomCloseBtn: {
    marginTop: 20,
    marginBottom: 4,
    minWidth: 88,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCloseText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15,
  },
});
